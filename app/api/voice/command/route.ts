import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok, statusFor } from '@/lib/api/envelope';
import { executeVoiceCommand } from '@/lib/voice/controller';
import { recordUsage } from '@/lib/usage/meter';
import { checkRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';
import { ScaleOSError } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(3000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const rate = checkRateLimit(request, 'voice-command', 20, 60_000);
  if (!rate.allowed) {
    return fail('RATE_LIMITED', 'Too many voice commands. Try again shortly.', 429, requestId, rateLimitHeaders(rate));
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Provide a voice command text.', 422, requestId);
  }

  try {
    const result = await executeVoiceCommand(parsed.data.text, parsed.data.history);
    recordUsage({
      kind: 'tool',
      model: result.intent,
      latencyMs: Date.now() - started,
      requestId,
      ok: result.ok,
      ...(result.ok ? {} : { errorCode: 'VOICE_COMMAND_FAILED' }),
    });
    return ok({ result, data: result }, requestId, rateLimitHeaders(rate));
  } catch (error) {
    recordUsage({ kind: 'tool', latencyMs: Date.now() - started, requestId, ok: false, errorCode: 'VOICE_COMMAND_FAILED' });
    if (error instanceof ScaleOSError) {
      return fail(error.code, error.message, statusFor(error.code), requestId);
    }
    return fail('VOICE_COMMAND_FAILED', 'Naughty could not execute that command.', 502, requestId);
  }
}
