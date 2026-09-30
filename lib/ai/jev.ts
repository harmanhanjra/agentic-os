import { z } from 'zod';
import { ScaleOSError } from './types';

/**
 * TypeSafe Jev decision helper (model "jev-latest").
 *
 * Jev is NOT a chat/completions model: it answers independent decision
 * questions (choice / noul / score) over a shared state payload through a
 * single non-streaming endpoint. This module is a thin native HTTP helper —
 * it never fabricates decisions and never acts on them.
 *
 * Native TypeSafe API integration:
 * - POST only to https://api.typesafe.ai/v1/systemone
 * - Bearer key read only from TYPESAFE_API_KEY (server-side)
 * - Model sent exactly as "jev-latest"
 *
 * Admission bounds (platform bounds, enforced before any charged call):
 * - at most 32 questions per request
 * - at most 64 options per choice question
 * - 2–10 levels per score question
 * - roughly 32,000 input tokens shared by state + question definitions
 */

export const JEV_GATEWAY_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
export const JEV_TIMEOUT_MS = 60_000;

/** Rough shared input budget for state + question definitions (chars/4 ≈ tokens). */
export const JEV_INPUT_TOKEN_BUDGET = 32_000;

const QuestionIdSchema = z.string().min(1).max(100);

const ChoiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: z.string().trim().min(1).max(4000),
  /** Maps each option (e.g. accept/review) to its description. */
  criteria: z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(2000)).refine(
    (criteria) => {
      const keys = Object.keys(criteria);
      return keys.length >= 2 && keys.length <= 64;
    },
    { message: 'A choice question needs 2–64 options.' },
  ),
});

const NoulQuestionSchema = z.object({
  type: z.literal('noul'),
  instructions: z.string().trim().min(1).max(4000),
  /** Optional descriptions of what true and false mean for the proposition. */
  criteria: z
    .object({
      true: z.string().trim().min(1).max(2000),
      false: z.string().trim().min(1).max(2000),
    })
    .optional(),
});

const ScoreQuestionSchema = z.object({
  type: z.literal('score'),
  instructions: z.string().trim().min(1).max(4000),
  /** Ordered list of level descriptions (position = level). */
  criteria: z.array(z.string().trim().min(1).max(2000)).min(2).max(10),
});

export const JevQuestionSchema = z.union([
  ChoiceQuestionSchema,
  NoulQuestionSchema,
  ScoreQuestionSchema,
]);
export type JevQuestion = z.infer<typeof JevQuestionSchema>;

export const JevStateSchema = z.union([
  z.string().trim().min(1).max(120_000),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()).min(1).max(500),
]);
export type JevState = z.infer<typeof JevStateSchema>;

export const JevRequestSchema = z.object({
  state: JevStateSchema,
  questions: z.record(QuestionIdSchema, JevQuestionSchema).refine(
    (questions) => {
      const count = Object.keys(questions).length;
      return count >= 1 && count <= 32;
    },
    { message: 'A request needs 1–32 independent questions.' },
  ),
});
export type JevRequest = z.infer<typeof JevRequestSchema>;

const JevAnswerSchema = z.record(z.string(), z.unknown());
export type JevAnswer = z.infer<typeof JevAnswerSchema>;

const JevResponseSchema = z
  .object({
    answers: z.record(z.string(), z.unknown()),
    usage: z.unknown().optional(),
  })
  .passthrough();
export interface JevDecision {
  answers: Record<string, JevAnswer>;
  usage: unknown;
}

/** Rough token estimate for the shared input budget (state + question definitions). */
export function estimateJevInputTokens(input: JevRequest): number {
  const chars = JSON.stringify({ state: input.state, questions: input.questions }).length;
  return Math.ceil(chars / 4);
}

function readJevKey(): string {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    throw new ScaleOSError(
      'PROVIDER_NOT_CONFIGURED',
      'Jev is not configured. Set TYPESAFE_API_KEY locally (server environment or .env.local) and retry — the key is never accepted through the UI or logs.',
    );
  }
  return key;
}

/** Build the exact gateway payload (model + state + questions keyed by question ID). */
export function buildJevPayload(input: JevRequest): {
  model: string;
  state: JevState;
  questions: Record<string, JevQuestion>;
} {
  let parsed: z.infer<typeof JevRequestSchema>;
  try {
    parsed = JevRequestSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ScaleOSError(
        'VALIDATION_ERROR',
        error.issues[0]?.message ?? 'Invalid Jev request.',
      );
    }
    throw error;
  }
  const tokens = estimateJevInputTokens(parsed);
  if (tokens > JEV_INPUT_TOKEN_BUDGET) {
    throw new ScaleOSError(
      'VALIDATION_ERROR',
      `This request is about ${tokens.toLocaleString()} input tokens; the shared budget is ${JEV_INPUT_TOKEN_BUDGET.toLocaleString()}. Send a concise diff and test summary as state, not the entire repository.`,
    );
  }
  return { model: JEV_MODEL, state: parsed.state, questions: parsed.questions };
}

/**
 * Best-effort one-line summary of an answer for display. Answers are read by
 * question ID; probabilities and confidence are advisory, never guarantees.
 */
export function summarizeJevAnswer(answer: JevAnswer): string {
  const record = answer as Record<string, unknown>;
  for (const field of ['decision', 'choice', 'verdict', 'selected', 'value', 'score', 'result']) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return JSON.stringify(answer).slice(0, 500);
}

/**
 * Ask Jev independent decision questions. Exactly one HTTP call per
 * invocation: bounded timeout, no retries, no idempotency key — an unknown
 * outcome may already be charged, so callers must confirm before resending.
 * Never executes, merges, or auto-applies any returned decision.
 */
export async function requestJevDecision(input: JevRequest): Promise<JevDecision> {
  const apiKey = readJevKey();
  const payload = buildJevPayload(input);

  let response: Response;
  try {
    response = await fetch(JEV_GATEWAY_URL, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ScaleOSError(
        'TIMEOUT',
        'Jev did not answer within 60s. The outcome is unknown and may already be charged — confirm before resending.',
      );
    }
    throw new ScaleOSError('NETWORK_ERROR', 'Could not reach the Jev gateway.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    const detail = body?.error?.message ?? body?.message;
    if (response.status === 401 || response.status === 403) {
      throw new ScaleOSError(
        'INVALID_API_KEY',
        'TypeSafe rejected TYPESAFE_API_KEY. Verify the server-side key in your TypeSafe account and retry.',
      );
    }
    throw new ScaleOSError(
      'PROVIDER_ERROR',
      detail
        ? `Jev gateway error (${response.status}): ${detail.slice(0, 500)}`
        : `The Jev gateway returned HTTP ${response.status}.`,
    );
  }

  const parsed = JevResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ScaleOSError('PROVIDER_ERROR', 'The Jev gateway returned an unexpected response shape.');
  }
  const answers: Record<string, JevAnswer> = {};
  for (const [id, value] of Object.entries(parsed.data.answers)) {
    answers[id] = (value ?? {}) as JevAnswer;
  }
  return { answers, usage: parsed.data.usage ?? null };
}

/** Server-side configuration check that never exposes the key. */
export function isJevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}
