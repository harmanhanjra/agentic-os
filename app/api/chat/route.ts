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
import { chooseModel, classifyTask } from '@/lib/ai/routing';
import { ScaleOSError } from '@/lib/ai/types';
import { buildSkillContext } from '@/lib/skills/context';

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
});

function error(code: string, message: string, status: number, requestId: string) {
  return Response.json(
    { error: { code, message }, requestId },
    { status, headers: { 'x-request-id': requestId } },
  );
}

type ChatMessages = Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

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
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return error('VALIDATION_ERROR', 'Invalid chat request', 422, requestId);

  try {
    const target = parsed.data.modelId
      ? resolveTarget(parsed.data.modelId)
      : (() => {
          // Auto-routing prefers providers that are actually configured,
          // so "Auto" never points at a router with no credentials.
          const pool = configuredModels();
          const decision = chooseModel(
            pool.length > 0 ? pool : developmentModels,
            {
              taskType: classifyTask(parsed.data.messages.at(-1)?.content ?? ''),
              requiredCapabilities: [],
              preference: 'auto',
            },
          );
          return {
            providerId: decision.model.providerId,
            externalModelId: decision.model.externalModelId,
            displayName: decision.model.displayName,
          };
        })();

    if (!target)
      return error(
        'MODEL_NOT_FOUND',
        'Unknown model. Pick a registry model or address any OpenAI-compatible router as <provider>:<model-id> (openai, nvidia, litellm, ollama).',
        404,
        requestId,
      );

    const upstream = await postChatCompletions(
      target,
      withSkillContext(parsed.data.messages, parsed.data),
      true,
    );
    if (!upstream.ok || !upstream.body) {
      const detail = await providerResponseError(upstream);
      return error(detail.code, detail.message, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, requestId);
    }

    return new Response(upstream.body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-scaleos-model': `${target.providerId}:${target.externalModelId}`,
        'x-request-id': requestId,
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
