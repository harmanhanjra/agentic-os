import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  configuredModels,
  postChatCompletions,
  providerResponseError,
  resolveTarget,
} from '@/lib/ai/dispatch';
import { developmentModels } from '@/lib/ai/registry';
import { isJevConfigured } from '@/lib/ai/jev';
import { planChat, type ChatPlan } from '@/lib/ai/chat-planner';
import { ScaleOSError } from '@/lib/ai/types';
import { buildSkillContext } from '@/lib/skills/context';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';
import { recordUsage } from '@/lib/usage/meter';
import { safeProviderFetch } from '@/lib/security/fetch';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(100_000),
      }),
    )
    .min(1)
    .max(100),
  modelId: z.string().min(1).max(300).optional(),
  includeSkills: z.boolean().optional(),
  excludedSkills: z.array(z.string().min(1).max(200)).max(200).optional(),
  planWithJev: z.boolean().optional(),
});

function error(code: string, message: string, status: number, requestId: string) {
  return Response.json(
    { error: { code, message }, requestId },
    { status, headers: { 'x-request-id': requestId } },
  );
}

type ChatMessages = Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

async function getOllamaAvailableModels(): Promise<Set<string>> {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  if (!baseUrl) return new Set();
  try {
    const res = await safeProviderFetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }, true);
    if (!res.ok) return new Set();
    const body = (await res.json().catch(() => null)) as { models?: Array<{ name: string }> };
    return new Set(body?.models?.map((m) => m.name) ?? []);
  } catch {
    return new Set();
  }
}

/**
 * Prepend detected host skills as a system message so the model knows
 * which specialized capabilities exist. Skipped when the caller opts out
 * or already provided its own system message.
 */
function withSkillContext(
  messages: ChatMessages,
  opts: { includeSkills?: boolean; excludedSkills?: string[] },
): ChatMessages {
  if (opts.includeSkills === false) return messages;
  if (messages.some((m) => m.role === 'system')) return messages;
  const context = buildSkillContext(opts.excludedSkills ?? []);
  if (!context) return messages;
  return [{ role: 'system', content: context }, ...messages];
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'chat', 30, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many chat requests. Try again shortly.' }, requestId },
      { status: 429, headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) } },
    );
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return error('VALIDATION_ERROR', 'Invalid chat request', 422, requestId);

  try {
    // Pre-generation Jev planning: decide the best approach + depth before
    // the model streams anything. Best-effort — an unavailable judge or a
    // failed gateway call falls back to unsteered streaming, never blocks.
    let plan: ChatPlan | null = null;
    if (parsed.data.planWithJev && isJevConfigured()) {
      const latestUser = [...parsed.data.messages].reverse().find((m) => m.role === 'user');
      if (latestUser) {
        const history = parsed.data.messages.slice(0, -1);
        plan = await planChat({
          prompt: latestUser.content,
          history: history
            .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
              (m.role === 'user' || m.role === 'assistant') && m.content.length > 0,
            )
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        });
      }
    }

    const target = parsed.data.modelId
      ? resolveTarget(parsed.data.modelId)
      : await (async () => {
          // Auto-routing: GPT-5.6 Luna → NVIDIA → Ollama (only installed models)
          const pool = configuredModels();
          const ollamaModels = await getOllamaAvailableModels();

          // Priority 1: GPT-5.6 Luna
          const luna = pool.find((m) => m.providerId === 'experiential' && m.externalModelId === 'gpt-5.6-luna');
          if (luna) return { providerId: luna.providerId, externalModelId: luna.externalModelId, displayName: luna.displayName };

          // Priority 2: NVIDIA (fast/cheap first)
          const nvidiaPriority = ['deepseek-v4-flash', 'nemotron-3.5-lightning', 'gemma-4-31b', 'glm-5.3-flash'];
          for (const id of nvidiaPriority) {
            const m = pool.find((p) => p.providerId === 'nvidia' && p.externalModelId.includes(id));
            if (m) return { providerId: m.providerId, externalModelId: m.externalModelId, displayName: m.displayName };
          }
          // Any remaining nvidia
          const anyNvidia = pool.find((p) => p.providerId === 'nvidia');
          if (anyNvidia) return { providerId: anyNvidia.providerId, externalModelId: anyNvidia.externalModelId, displayName: anyNvidia.displayName };

          // Priority 3: Ollama (only installed)
          const ollama = pool.find((p) => p.providerId === 'ollama' && ollamaModels.has(p.externalModelId));
          if (ollama) return { providerId: ollama.providerId, externalModelId: ollama.externalModelId, displayName: ollama.displayName };

          // Fallback to any configured model
          const any = pool[0];
          return any ? { providerId: any.providerId, externalModelId: any.externalModelId, displayName: any.displayName } : null;
        })();

    if (!target)
      return error(
        'MODEL_NOT_FOUND',
        'Unknown model. Pick a registry model or address any OpenAI-compatible router as <provider>:<model-id> (openai, nvidia, litellm, ollama, experiential).',
        404,
        requestId,
      );

    const messages = plan?.guideline
      ? [
          { role: 'system' as const, content: `ScaleOS response plan (from Jev): ${plan.guideline}` },
          ...withSkillContext(parsed.data.messages, parsed.data),
        ]
      : withSkillContext(parsed.data.messages, parsed.data);

    const upstream = await postChatCompletions(
      target,
      messages,
      true,
    );
    if (!upstream.ok || !upstream.body) {
      const detail = await providerResponseError(upstream);
      recordUsage({ kind: 'chat', model: `${target.providerId}:${target.externalModelId}`, requestId, ok: false, errorCode: detail.code });
      return error(detail.code, detail.message, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, requestId);
    }

    recordUsage({ kind: 'chat', model: `${target.providerId}:${target.externalModelId}`, requestId, ok: true });

    return new Response(upstream.body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-scaleos-model': `${target.providerId}:${target.externalModelId}`,
        'x-request-id': requestId,
        ...(plan ? { 'x-scaleos-plan': plan.label } : {}),
      },
    });
  } catch (err) {
    if (err instanceof ScaleOSError) {
      const status =
        err.code === 'MODEL_NOT_FOUND'
          ? 404
          : err.code === 'NETWORK_ERROR'
            ? 502
            : 503;
      return error(err.code, err.message, status, requestId);
    }
    return error(
      'PROVIDER_ERROR',
      'The provider could not start this generation.',
      502,
      requestId,
    );
  }
}
