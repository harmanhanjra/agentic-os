// Judge layer: rank LLM answers with Jev scoring.
//
// For each model answer, build one independent score question keyed by the
// model's registry ID. Jev rates answers against ordered level descriptions
// (1 = worst … 5 = best). Results are advisory (`advisory: true`); they are
// only ever displayed by the caller, never merged or applied automatically.
//
// Charging: each `judgeArenaAnswers` call costs exactly one gateway request.
// Callers must surface that (e.g. an explicit opt-in toggle) and must not
// retry silently after an unknown outcome.

import {
  buildJevPayload,
  requestJevDecision,
  type JevDecision,
  type JevRequest,
} from './jev';
import { ScaleOSError } from './types';

export interface ArenaAnswerForJudge {
  modelId: string;
  content: string;
}

export interface ArenaJudgmentInput {
  prompt: string;
  answers: ArenaAnswerForJudge[];
}

const MAX_PROMPT_CHARS = 4_000;
const MAX_ANSWER_CHARS = 3_000;
const MAX_MODEL_ID_CHARS = 100;
const MAX_ANSWER_COUNT = 8;

export const JUDGE_LEVELS = [
  '1 — Incorrect, hallucinated, or off-topic.',
  '2 — Poor: significant errors or missing substance.',
  '3 — Adequate: answers the prompt but with gaps.',
  '4 — Good: accurate, clear, and mostly complete.',
  '5 — Excellent: accurate, complete, and concise.',
];

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

/** Build the gateway payload (state = prompt + truncated answers). */
export function buildArenaJudgmentPayload(input: ArenaJudgmentInput): JevRequest {
  const answers = input.answers.slice(0, MAX_ANSWER_COUNT);
  if (answers.length < 2) {
    throw new ScaleOSError(
      'VALIDATION_ERROR',
      'At least two model answers are required to compare for the best one.',
    );
  }
  const questions: JevRequest['questions'] = {};
  for (const answer of answers) {
    const questionId = answer.modelId.slice(0, MAX_MODEL_ID_CHARS);
    if (questionId) {
      questions[questionId] = {
        type: 'score',
        instructions: 'Score this model’s answer to the prompt on accuracy, completeness, and clarity. Higher is better.',
        criteria: JUDGE_LEVELS,
      };
    }
  }
  if (Object.keys(questions).length === 0) {
    throw new ScaleOSError('VALIDATION_ERROR', 'Answers carry no usable model IDs to judge.');
  }

  const state = {
    prompt: truncate(input.prompt, MAX_PROMPT_CHARS),
    answers: answers.map((answer) => ({
      model: answer.modelId.slice(0, MAX_MODEL_ID_CHARS),
      content: truncate(answer.content, MAX_ANSWER_CHARS),
    })),
  };

  // validate + enforce the shared ~32k token budget before any charged call
  const payload = buildJevPayload({ state, questions });
  return { state: payload.state, questions: payload.questions };
}

/**
 * Rank the provided model answers with one Jev request. Never retries, never
 * acts on the returned scores — the caller decides what to display.
 */
export async function judgeArenaAnswers(input: ArenaJudgmentInput): Promise<JevDecision> {
  const request = buildArenaJudgmentPayload(input);
  return requestJevDecision(request);
}

/**
 * Best-answer display helpers. Scores are advisory predictions, not proof.
 * Returns null when the answer does not contain a usable score.
 */
export function readJudgeScore(answer: Record<string, unknown>): number | null {
  const raw = answer.score ?? answer.value ?? answer.decision ?? answer.level;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  return null;
}

export function pickBestAnswer(
  answers: Record<string, Record<string, unknown>>,
): { modelId: string; score: number } | null {
  let best: { modelId: string; score: number } | null = null;
  for (const [modelId, answer] of Object.entries(answers)) {
    const score = readJudgeScore(answer);
    if (score === null) continue;
    if (!best || score > best.score) best = { modelId, score };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Head-to-head judging (DeepSeek-style arena).
//
// Mirroring dsh-eval's paired A/B: for every pair of answers we ask Jev one
// `choice` question ("which is better, or a tie?"), then fold the pair
// verdicts into a leaderboard with wins/losses/ties and win rate. The score
// questions from buildArenaJudgmentPayload stay alongside, so one charged
// call yields both per-model scores and pairwise verdicts.
// ---------------------------------------------------------------------------

const MAX_JUDGED_ANSWERS = 6; // 6 scores + C(6,2)=15 pairs = 21 questions ≤ 32

export interface ArenaQuestionPair {
  questionId: string;
  modelA: string;
  modelB: string;
}

export interface ArenaLeaderboardRow {
  modelId: string;
  score: number | null;
  win: number;
  loss: number;
  tie: number;
  winRate: number | null;
}

const PAIR_OPTION_A = 'winner_a';
const PAIR_OPTION_B = 'winner_b';
const PAIR_OPTION_TIE = 'tie';

/**
 * Build one payload judged both per-model (score questions) and head-to-head
 * (one choice question per pair). Question IDs are stable and index-based so
 * verdicts can be folded back into a leaderboard.
 */
export function buildArenaJudgePayload(input: ArenaJudgmentInput): {
  request: JevRequest;
  pairs: ArenaQuestionPair[];
} {
  const answers = input.answers.slice(0, MAX_JUDGED_ANSWERS);
  if (answers.length < 2) {
    throw new ScaleOSError(
      'VALIDATION_ERROR',
      'At least two model answers are required to compare for the best one.',
    );
  }

  const questions: JevRequest['questions'] = {};
  const pairs: ArenaQuestionPair[] = [];
  const short = answers.map((answer) => answer.modelId.slice(0, MAX_MODEL_ID_CHARS));

  for (let i = 0; i < answers.length; i++) {
    const questionId = short[i];
    if (questionId) {
      questions[questionId] = {
        type: 'score',
        instructions:
          'Score this model’s answer to the prompt on accuracy, completeness, and clarity. Higher is better.',
        criteria: JUDGE_LEVELS,
      };
    }
  }

  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      const questionId = `pair:${i}:${j}`;
      questions[questionId] = {
        type: 'choice',
        instructions:
          'Compare the two answers to the same prompt. Choose the better answer, or the tie option when they are equivalent.',
        criteria: {
          [PAIR_OPTION_A]: `Answer from ${short[i] || `model ${i + 1}`}`,
          [PAIR_OPTION_B]: `Answer from ${short[j] || `model ${j + 1}`}`,
          [PAIR_OPTION_TIE]: 'Both answers are about equally good (tie).',
        },
      };
      pairs.push({ questionId, modelA: short[i], modelB: short[j] });
    }
  }

  if (Object.keys(questions).length === 0) {
    throw new ScaleOSError('VALIDATION_ERROR', 'Answers carry no usable model IDs to judge.');
  }

  const state = {
    prompt: truncate(input.prompt, MAX_PROMPT_CHARS),
    answers: answers.map((answer, index) => ({
      model: short[index],
      content: truncate(answer.content, MAX_ANSWER_CHARS),
    })),
  };

  const payload = buildJevPayload({ state, questions });
  return { request: { state: payload.state, questions: payload.questions }, pairs };
}

/**
 * Read a head-to-head verdict out of a pair answer. Returns null for an
 * unparseable answer, otherwise the winning model id (null winner = tie).
 */
export function readPairVerdict(
  answer: Record<string, unknown>,
  pair: ArenaQuestionPair,
): { winner: string | null } | null {
  const raw = (answer.choice ?? answer.decision ?? answer.result ?? answer.selected) as unknown;
  if (raw === PAIR_OPTION_TIE) return { winner: null };
  if (raw === PAIR_OPTION_A) return { winner: pair.modelA };
  if (raw === PAIR_OPTION_B) return { winner: pair.modelB };
  return null;
}

/**
 * Fold score + pair answers into a ranked leaderboard. Win rate is
 * wins/(wins+losses); ties count as neither win nor loss. Best-first.
 */
export function buildArenaLeaderboard(
  answers: Record<string, Record<string, unknown>>,
  pairs: ArenaQuestionPair[],
): ArenaLeaderboardRow[] {
  const modelIds = Array.from(new Set(pairs.flatMap((pair) => [pair.modelA, pair.modelB])));
  const rows = new Map<string, ArenaLeaderboardRow>(
    modelIds.map((modelId) => [
      modelId,
      { modelId, score: readJudgeScore(answers[modelId] ?? {}), win: 0, loss: 0, tie: 0, winRate: null },
    ]),
  );

  for (const pair of pairs) {
    const verdict = readPairVerdict(answers[pair.questionId] ?? {}, pair);
    if (!verdict) continue;
    const a = rows.get(pair.modelA);
    const b = rows.get(pair.modelB);
    if (!a || !b) continue;
    if (verdict.winner === null) {
      a.tie += 1;
      b.tie += 1;
    } else if (verdict.winner === pair.modelA) {
      a.win += 1;
      b.loss += 1;
    } else if (verdict.winner === pair.modelB) {
      b.win += 1;
      a.loss += 1;
    }
  }

  for (const row of rows.values()) {
    const decisive = row.win + row.loss;
    row.winRate = decisive > 0 ? Math.round((row.win / decisive) * 1000) / 1000 : null;
  }

  return Array.from(rows.values()).sort((x, y) => {
    const sx = x.score ?? -1;
    const sy = y.score ?? -1;
    if (sx !== sy) return sy - sx;
    const rx = x.winRate ?? -1;
    const ry = y.winRate ?? -1;
    if (rx !== ry) return ry - rx;
    return y.win - x.win;
  });
}