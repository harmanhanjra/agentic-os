import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { postChatCompletions, resolveTarget } from '@/lib/ai/dispatch';
import type { ResolvedTarget } from '@/lib/ai/dispatch';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  modelIds: z.array(z.string().min(1).max(300)).min(2).max(4),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
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

  const started = Date.now();
  const ready = targets as Array<{
    id: string;
    target: ResolvedTarget;
  }>;
  const results = await Promise.allSettled(
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

  return Response.json(
    {
      data: results.map((result) =>
        result.status === 'fulfilled'
          ? result.value
          : {
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : 'MODEL_UNAVAILABLE',
            },
      ),
      latencyMs: Date.now() - started,
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  );
}
