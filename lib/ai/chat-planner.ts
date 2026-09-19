// Chat planner: Jev decision that steers the LLM before it generates.
//
// Pre-generation steering (not post-hoc judging). Given the incoming user
// turn (plus recent context), Jev picks the best approach and depth as a
// single even-more-reliable `choice` call. The decisions compile into a
// system instruction prepended to the model's messages, so the generator
// already knows HOW to answer well before it emits a token.
//
// Advisory and best-effort: the planner never blocks or fabricates — if Jev
// is unavailable (gateway error, not configured) the caller streams the
// unsteered conversation and shows no plan chip.

import { buildJevPayload, requestJevDecision, type JevRequest } from './jev';

export interface ChatPlanInput {
  prompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export const PLAN_APPROACH_ID = 'approach';
export const PLAN_DEPTH_ID = 'depth';

export type ChatPlanApproach =
  | 'direct'
  | 'step_by_step'
  | 'code_first'
  | 'compare'
  | 'examples'
  | 'summarize';

export type ChatPlanDepth = 'concise' | 'balanced' | 'thorough';

export interface ChatPlanApproachDef {
  key: ChatPlanApproach;
  label: string;
  rubric: string;
  guidance: string;
}

export interface ChatPlanDepthDef {
  key: ChatPlanDepth;
  label: string;
  rubric: string;
  guidance: string;
}

/** Ordering is meaningful: direct → step_by_step → code_first → … */
export const CHAT_PLAN_APPROACHES: ChatPlanApproachDef[] = [
  {
    key: 'direct',
    label: 'Direct',
    rubric: 'Answer immediately and plainly.',
    guidance: 'Answer directly and plainly right away — avoid preamble and waffle.',
  },
  {
    key: 'step_by_step',
    label: 'Step-by-step',
    rubric: 'Work through the reasoning in clear steps.',
    guidance: 'Work through the reasoning in clear, labeled steps before the conclusion.',
  },
  {
    key: 'code_first',
    label: 'Code first',
    rubric: 'Lead with runnable code, then explain.',
    guidance: 'Lead with runnable code, then explain what it does and why.',
  },
  {
    key: 'compare',
    label: 'Compare',
    rubric: 'Weigh options with concrete trade-offs.',
    guidance: 'Weigh the options against each other with concrete trade-offs and a recommendation.',
  },
  {
    key: 'examples',
    label: 'Examples',
    rubric: 'Illustrate the answer with concrete examples.',
    guidance: 'Illustrate the answer with concrete, realistic examples.',
  },
  {
    key: 'summarize',
    label: 'Summarize',
    rubric: 'Distill existing material into its essence.',
    guidance: 'Summarize concisely: keep the essence, drop redundant detail.',
  },
];

export const CHAT_PLAN_DEPTHS: ChatPlanDepthDef[] = [
  {
    key: 'concise',
    label: 'Concise',
    rubric: 'Short and to the point.',
    guidance: 'Keep it concise — short and to the point.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    rubric: 'Cover the essentials without padding.',
    guidance: 'Stay balanced — cover the essentials without padding.',
  },
  {
    key: 'thorough',
    label: 'Thorough',
    rubric: 'Go into depth, including edge cases.',
    guidance: 'Be thorough — go into depth and consider edge cases.',
  },
];

const MAX_PROMPT_CHARS = 2_000;
const MAX_HISTORY_TURNS = 4;
const MAX_HISTORY_CHARS = 1_200;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

export interface ChatPlan {
  approach: ChatPlanApproach;
  depth: ChatPlanDepth;
  guideline: string;
  label: string;
  requestId: string;
}

/**
 * Build the Jev planning payload: one choice per decision dimension, state =
 * the incoming prompt plus the recently exchanged turns. Validated and
 * budget-checked before use.
 */
export function buildChatPlannerPayload(input: ChatPlanInput): JevRequest {
  const approachCriteria: Record<string, string> = {};
  for (const def of CHAT_PLAN_APPROACHES) approachCriteria[def.key] = def.rubric;
  const depthCriteria: Record<string, string> = {};
  for (const def of CHAT_PLAN_DEPTHS) depthCriteria[def.key] = def.rubric;

  const payload = buildJevPayload({
    state: {
      prompt: truncate(input.prompt, MAX_PROMPT_CHARS),
      history: truncate(
        JSON.stringify(input.history.slice(-MAX_HISTORY_TURNS)),
        MAX_HISTORY_CHARS,
      ),
    },
    questions: {
      [PLAN_APPROACH_ID]: {
        type: 'choice',
        instructions:
          'How should the assistant approach the newest user prompt for the best outcome? Choose one approach.',
        criteria: approachCriteria,
      },
      [PLAN_DEPTH_ID]: {
        type: 'choice',
        instructions:
          'How much depth should the assistant aim for in its reply? Choose one depth.',
        criteria: depthCriteria,
      },
    },
  });
  return { state: payload.state, questions: payload.questions };
}

function readChoice(answer: Record<string, unknown>): string | null {
  const raw =
    answer.choice ?? answer.decision ?? answer.selected ?? answer.result ?? answer.value;
  return typeof raw === 'string' ? raw : null;
}

/**
 * Turn the gateway answers into a steerable plan. Missing/unreadable choices
 * return null so the caller falls back to unsteered streaming.
 */
export function readChatPlan(
  answers: Record<string, Record<string, unknown>>,
  requestId: string,
): ChatPlan | null {
  const approachKey = readChoice(answers[PLAN_APPROACH_ID] ?? {});
  const depthKey = readChoice(answers[PLAN_DEPTH_ID] ?? {});
  const approach =
    CHAT_PLAN_APPROACHES.find((d) => d.key === approachKey) ?? CHAT_PLAN_APPROACHES[0];
  const depth = CHAT_PLAN_DEPTHS.find((d) => d.key === depthKey) ?? CHAT_PLAN_DEPTHS[1];
  if (!approachKey && !depthKey) return null;

  const guideline = `${approach.guidance} ${depth.guidance}`.trim();
  const label = `${approach.label} · ${depth.label}`;
  return { approach: approach.key, depth: depth.key, guideline, label, requestId };
}

/**
 * Ask Jev how to answer before the model generates. Exactly one gateway
 * request; best-effort (returns null instead of throwing when unavailable).
 * The steering guideline is meant to be prepended as a system message.
 */
export async function planChat(input: ChatPlanInput): Promise<ChatPlan | null> {
  let decision;
  try {
    decision = await requestJevDecision(buildChatPlannerPayload(input));
  } catch {
    return null;
  }
  return readChatPlan(decision.answers, '');
}