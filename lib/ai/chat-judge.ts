// Chat reply judge: Jev verdict for a single assistant reply.
//
// One ordered `choice` question per reply — not a `score` question — because
// the gateway currently answers choice reliably while score payloads 502
// nondeterministically. The five options reuse the arena JUDGE_LEVELS rubric
// text verbatim, so a reply judged "Good" in chat means the same as in the
// arena. The badge shows the chosen level's score (1–5), its label, and the
// gateway's confidence.
//
// Results are advisory (`advisory: true` upstream): this module only parses
// and displays, it never retries silently after an unknown outcome and never
// executes or applies a verdict.

import { buildJevPayload, type JevRequest } from './jev';

export interface ChatJudgeInput {
  prompt: string;
  reply: string;
}

export const CHAT_JUDGE_QUESTION_ID = 'verdict';

export interface ChatVerdictLevel {
  key: string;
  score: number;
  label: string;
  rubric: string;
}

/** Mirrors JUDGE_LEVELS in lib/ai/judge.ts (level 1 … 5, low → high). */
export const CHAT_VERDICT_LEVELS: ChatVerdictLevel[] = [
  { key: 'off_target', score: 1, label: 'Off-target', rubric: 'Incorrect, hallucinated, or off-topic.' },
  { key: 'poor', score: 2, label: 'Poor', rubric: 'Poor: significant errors or missing substance.' },
  { key: 'adequate', score: 3, label: 'Adequate', rubric: 'Adequate: answers the prompt but with gaps.' },
  { key: 'good', score: 4, label: 'Good', rubric: 'Good: accurate, clear, and mostly complete.' },
  { key: 'excellent', score: 5, label: 'Excellent', rubric: 'Excellent: accurate, complete, and concise.' },
];

const MAX_PROMPT_CHARS = 2_000;
const MAX_REPLY_CHARS = 3_000;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

/** Verdict as displayed on the chat message. */
export interface ChatVerdict {
  score: number;
  label: string;
  confidence: number;
  requestId: string;
}

/**
 * Build the one-question payload for judging a single assistant reply.
 * State is the prompt plus the reply; the question is a choice among the
 * five ordered levels. Validated and budget-checked before use.
 */
export function buildChatJudgmentPayload(input: ChatJudgeInput): JevRequest {
  const criteria: Record<string, string> = {};
  for (const level of CHAT_VERDICT_LEVELS) {
    criteria[level.key] = `${level.score} — ${level.label}: ${level.rubric}`;
  }
  const payload = buildJevPayload({
    state: {
      prompt: truncate(input.prompt, MAX_PROMPT_CHARS),
      reply: truncate(input.reply, MAX_REPLY_CHARS),
    },
    questions: {
      [CHAT_JUDGE_QUESTION_ID]: {
        type: 'choice',
        instructions:
          'How good is this assistant reply relative to the prompt? Choose the level that best matches.',
        criteria,
      },
    },
  });
  return { state: payload.state, questions: payload.questions };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Turn a gateway answer into a ChatVerdict. The chosen level drives the
 * score and label; confidence comes from the answer. Returns null when no
 * usable verdict can be read (advisory — callers hide the badge then).
 */
export function readChatVerdict(
  answer: Record<string, unknown>,
  requestId: string,
): ChatVerdict | null {
  const rawChoice = asRecord(answer).choice ?? asRecord(answer).decision ?? asRecord(answer).selected;
  if (typeof rawChoice !== 'string') return null;
  const level = CHAT_VERDICT_LEVELS.find((l) => l.key === rawChoice);
  if (!level) return null;

  const confidence = Number(asRecord(answer).confidence);
  if (!Number.isFinite(confidence)) return null;

  let score = level.score;
  const probabilities = asRecord(asRecord(answer).probabilities);
  if (Object.keys(probabilities).length > 0) {
    const weighted = CHAT_VERDICT_LEVELS.reduce((sum, l) => {
      const p = Number(probabilities[l.key]);
      return sum + (Number.isFinite(p) ? p * l.score : 0);
    }, 0);
    if (weighted > 0) score = Math.round(weighted * 10) / 10;
  }

  return { score, label: level.label, confidence, requestId };
}

/**
 * Judge one completed reply through the local /api/jev route (the key stays
 * server-side). Returns null when Jev is unavailable or its answer cannot be
 * read — the chat badge then simply doesn't show.
 */
export async function judgeChatReply(
  input: ChatJudgeInput,
): Promise<ChatVerdict | null> {
  let response: Response;
  try {
    response = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildChatJudgmentPayload(input)),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const requestId = response.headers.get('x-request-id') ?? '';
  const body = (await response.json().catch(() => null)) as {
    data?: { answers?: Record<string, unknown> };
  } | null;
  const answer = body?.data?.answers?.[CHAT_JUDGE_QUESTION_ID];
  if (typeof answer !== 'object' || answer === null) return null;
  return readChatVerdict(answer as Record<string, unknown>, requestId);
}