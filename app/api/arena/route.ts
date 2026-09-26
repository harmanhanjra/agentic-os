import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { postChatCompletions, resolveTarget } from '@/lib/ai/dispatch';
import type { ResolvedTarget } from '@/lib/ai/dispatch';
import {
  buildArenaJudgePayload,
  buildArenaLeaderboard,
  readPairVerdict,
} from '@/lib/ai/judge';
import { isJevConfigured, requestJevDecision } from '@/lib/ai/jev';
import { recordUsage } from '@/lib/usage/meter';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  modelIds: z.array(z.string().min(1).max(300)).min(2).max(4),
  judgeWithJev: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const rate = checkRateLimit(request, 'arena', 10, 60_000);
  if (!rate.allowed) {
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many arena requests. Try again shortly.' }, requestId },
      { status: 429, headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) } },
    );
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt and two to four models are required.',
        },
        requestId,
      },
      { status: 422, headers: { 'x-request-id': requestId } },
    );

  const targets = parsed.data.modelIds.map((id) => ({
    id,
    target: resolveTarget(id),
  }));
  if (targets.some((t) => !t.target))
    return Response.json(
      {
        error: {
          code: 'MODEL_NOT_FOUND',
            message:
            'One of the selected models is unknown. Pick registry models or address routers as <provider>:<model-id>.',
        },
        requestId,
      },
      { status: 404, headers: { 'x-request-id': requestId } },
    );

  // Fail before spending any model calls when the judge cannot run (mirrors
  // dsh-eval: a run configured with a judge fails to start when the host has
  // no LLM seam).
  if (parsed.data.judgeWithJev && !isJevConfigured()) {
    return Response.json(
      {
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message:
            'Jev judging is on, but Jev is not configured. Set TYPESAFE_API_KEY locally (server environment or .env.local) and retry.',
        },
        requestId,
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    );
  }

  const started = Date.now();
  const ready = targets as Array<{
    id: string;
    target: ResolvedTarget;
  }>;
  const settled = await Promise.allSettled(
    ready.map(async ({ id, target }) => {
      const begin = Date.now();
      const response = await postChatCompletions(
        target,
        [{ role: 'user', content: parsed.data.prompt }],
        false,
      );
      if (!response.ok) {
        const code =
          response.status === 404 ? 'MODEL_NOT_FOUND' : 'PROVIDER_ERROR';
        throw new Error(code);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return {
        modelId: id,
        providerId: target.providerId,
        content: body.choices?.[0]?.message?.content ?? '',
        latencyMs: Date.now() - begin,
      };
    }),
  );
  const results = settled.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : { error: result.reason instanceof Error ? result.reason.message : 'MODEL_UNAVAILABLE' },
  );
  type ArenaHarvest = { modelId: string; providerId: string; content: string; latencyMs: number };
const fulfilled = settled
    .filter((r): r is PromiseFulfilledResult<ArenaHarvest> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v) => Boolean(v.content));

  let judgment: null | {
    status: 'NEEDS_TWO_ANSWERS' | 'DONE' | 'ERROR';
    best?: { modelId: string; score: number } | null;
    leaderboard?: Array<{
      modelId: string;
      score: number | null;
      win: number;
      loss: number;
      tie: number;
      winRate: number | null;
    }>;
    pairs?: Array<{ modelA: string; modelB: string; winner: string | null }>;
    answers: Record<string, Record<string, unknown>>;
    usage: unknown;
    error?: string;
  } = null;

  if (parsed.data.judgeWithJev) {
    if (fulfilled.length < 2) {
      judgment = {
        status: 'NEEDS_TWO_ANSWERS',
        answers: {},
        usage: null,
        error: `Judging needs at least two competing answers; only ${fulfilled.length} model${fulfilled.length === 1 ? '' : 's'} returned output.`,
      };
    } else {
      try {
        const { request, pairs } = buildArenaJudgePayload({
          prompt: parsed.data.prompt,
          answers: fulfilled.map((v) => ({ modelId: v.modelId, content: v.content })),
        });
        const decision = await requestJevDecision(request);
        judgment = {
          status: 'DONE',
          answers: decision.answers,
          usage: decision.usage,
          pairs: pairs.map((pair) => ({
            modelA: pair.modelA,
            modelB: pair.modelB,
            winner: readPairVerdict(decision.answers[pair.questionId] ?? {}, pair)?.winner ?? null,
          })),
        };
        const leaderboard = buildArenaLeaderboard(decision.answers, pairs);
        judgment.leaderboard = leaderboard;
        const best = leaderboard[0];
        if (best && best.score !== null && best.score > 0) {
          judgment.best = { modelId: best.modelId, score: best.score };
        }
      } catch (judgeError) {
        judgment = {
          status: 'ERROR',
          answers: {},
          usage: null,
          error:
            judgeError instanceof Error
              ? judgeError.message.slice(0, 300)
              : 'JEV_JUDGMENT_FAILED',
        };
      }
    }
  }

  recordUsage({
    kind: 'arena',
    latencyMs: Date.now() - started,
    requestId,
    ok: fulfilled.length > 0,
    ...(fulfilled.length > 0 ? {} : { errorCode: 'ARENA_ALL_FAILED' }),
  });

  return Response.json(
    {
      data: results,
      judgment,
      latencyMs: Date.now() - started,
      requestId,
    },
    { headers: { 'x-request-id': requestId, ...rateLimitHeaders(rate) } },
  );
}
