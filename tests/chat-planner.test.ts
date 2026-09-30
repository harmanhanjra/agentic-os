import { describe, expect, it, vi } from 'vitest';
import {
  buildChatPlannerPayload,
  CHAT_PLAN_APPROACHES,
  CHAT_PLAN_DEPTHS,
  PLAN_APPROACH_ID,
  PLAN_DEPTH_ID,
  planChat,
  readChatPlan,
} from '../lib/ai/chat-planner';
import { requestJevDecision } from '../lib/ai/jev';

vi.mock('../lib/ai/jev', async (importOriginal) => ({
  ...(await importOriginal()),
  requestJevDecision: vi.fn(),
}));

const requestJevDecisionMock = vi.mocked(requestJevDecision);

function buildAnswers(
  approach: string | null,
  depth: string | null,
): Record<string, Record<string, unknown>> {
  const answers: Record<string, Record<string, unknown>> = {};
  if (approach !== null) answers[PLAN_APPROACH_ID] = { choice: approach };
  if (depth !== null) answers[PLAN_DEPTH_ID] = { choice: depth };
  return answers;
}

describe('buildChatPlannerPayload', () => {
  it('creates choice questions for approach and depth', () => {
    const req = buildChatPlannerPayload({ prompt: 'Write a plan', history: [] });
    expect(req.state).toBeDefined();
    expect(req.questions[PLAN_APPROACH_ID].type).toBe('choice');
    expect(req.questions[PLAN_DEPTH_ID].type).toBe('choice');
    for (const def of CHAT_PLAN_APPROACHES) {
      expect(
        (req.questions[PLAN_APPROACH_ID].criteria as Record<string, string>)[def.key],
      ).toBe(def.rubric);
    }
    for (const def of CHAT_PLAN_DEPTHS) {
      expect((req.questions[PLAN_DEPTH_ID].criteria as Record<string, string>)[def.key]).toBe(
        def.rubric,
      );
    }
  });

  it('truncates over-long prompts and history', () => {
    const req = buildChatPlannerPayload({
      prompt: 'x'.repeat(5_000_000),
      history: Array.from({ length: 40 }, () => ({
        role: 'user' as const,
        content: 'y'.repeat(10_000),
      })),
    });
    const state = JSON.stringify(req.state);
    expect(state.length).toBeLessThan(10_000);
  });
});

describe('readChatPlan', () => {
  it('maps choices to a plan with guideline and label', () => {
    const plan = readChatPlan(buildAnswers('code_first', 'thorough'), 'plan-req-1');
    expect(plan).not.toBeNull();
    expect(plan!.approach).toBe('code_first');
    expect(plan!.depth).toBe('thorough');
    expect(plan!.label).toBe('Code first · Thorough');
    expect(plan!.guideline).toContain('code');
    expect(plan!.guideline).toContain('depth');
    expect(plan!.requestId).toBe('plan-req-1');
  });

  it('defaults unknown approach to direct', () => {
    const plan = readChatPlan(buildAnswers('not-a-real-approach', 'concise'), 'r');
    expect(plan!.approach).toBe('direct');
    expect(plan!.depth).toBe('concise');
  });

  it('defaults unknown depth to balanced', () => {
    const plan = readChatPlan(buildAnswers('compare', 'bogus'), 'r');
    expect(plan!.approach).toBe('compare');
    expect(plan!.depth).toBe('balanced');
  });

  it('returns null when both choices are missing', () => {
    expect(readChatPlan({}, 'r')).toBeNull();
  });

  it('still yields a plan when only one decision is available', () => {
    const plan = readChatPlan(buildAnswers('summarize', null), 'r');
    expect(plan).not.toBeNull();
    expect(plan!.approach).toBe('summarize');
    expect(plan!.depth).toBe('balanced');
  });
});

describe('planChat', () => {
  it('returns a plan from the gateway decision', async () => {
    requestJevDecisionMock.mockResolvedValueOnce({
      answers: buildAnswers('direct', 'concise'),
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const plan = await planChat({ prompt: 'hi', history: [] });
    expect(plan).not.toBeNull();
    expect(plan!.approach).toBe('direct');
    expect(plan!.depth).toBe('concise');
  });

  it('returns null on gateway failure instead of throwing', async () => {
    requestJevDecisionMock.mockRejectedValueOnce(new Error('gateway down'));
    const plan = await planChat({ prompt: 'hi', history: [] });
    expect(plan).toBeNull();
  });

  it('returns null when the gateway gives no usable choices', async () => {
    requestJevDecisionMock.mockResolvedValueOnce({
      answers: {},
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const plan = await planChat({ prompt: 'hi', history: [] });
    expect(plan).toBeNull();
  });
});