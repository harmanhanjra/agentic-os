import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  buildChatJudgmentPayload,
  CHAT_VERDICT_LEVELS,
  judgeChatReply,
  readChatVerdict,
} from '../lib/ai/chat-judge';

describe('chat reply judgment (Jev verdict)', () => {
  it('builds one ordered choice question from the five JUDGE_LEVELS-style levels', () => {
    const request = buildChatJudgmentPayload({
      prompt: 'What is 2+2?',
      reply: '2 + 2 equals 4.',
    });
    const state = request.state as { prompt: string; reply: string };
    expect(state.prompt).toBe('What is 2+2?');
    expect(state.reply).toBe('2 + 2 equals 4.');
    const question = request.questions.verdict as {
      type: string;
      criteria: Record<string, string>;
    };
    expect(question.type).toBe('choice');
    expect(Object.keys(question.criteria)).toHaveLength(5);
    expect(Object.keys(question.criteria)).toEqual(
      CHAT_VERDICT_LEVELS.map((l) => l.key),
    );
    expect(question.criteria.excellent).toContain('Excellent');
    expect(question.criteria.off_target).toContain('Incorrect');
  });

  it('truncates long prompt or reply so the state stays bounded', () => {
    const request = buildChatJudgmentPayload({
      prompt: 'p'.repeat(10_000),
      reply: 'r'.repeat(10_000),
    });
    const state = request.state as { prompt: string; reply: string };
    expect(state.prompt.length).toBeLessThanOrEqual(2_010);
    expect(state.reply.length).toBeLessThanOrEqual(3_010);
  });

  it('reads the chosen level into a score + label verdict', () => {
    const verdict = readChatVerdict(
      {
        choice: 'good',
        confidence: 0.82,
        probabilities: { off_target: 0.05, poor: 0.05, adequate: 0.1, good: 0.6, excellent: 0.2 },
      },
      'req-1',
    );
    expect(verdict).not.toBeNull();
    expect(verdict?.score).toBeCloseTo(3.85, 1); // weighted 1*0.05+2*0.05+3*0.1+4*0.6+5*0.2
    expect(verdict?.label).toBe('Good');
    expect(verdict?.confidence).toBeCloseTo(0.82);
    expect(verdict?.requestId).toBe('req-1');
  });

  it('falls back to the level score when no probabilities arrive', () => {
    const verdict = readChatVerdict({ choice: 'excellent', confidence: 1 }, 'req-2');
    expect(verdict?.score).toBe(5);
    expect(verdict?.label).toBe('Excellent');
  });

  it('returns null for unknown or missing verdicts', () => {
    expect(readChatVerdict({ choice: 'nope', confidence: 1 }, 'r')).toBeNull();
    expect(readChatVerdict({ confidence: 1 }, 'r')).toBeNull();
    expect(readChatVerdict({ choice: 'good' }, 'r')).toBeNull();
  });

  it('sends exactly one request to the local jev route and returns a verdict', async () => {
    const seen: Array<{ url: string; body: string }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), body: String(init?.body ?? '') });
      return new Response(
        JSON.stringify({
          data: {
            answers: {
              verdict: {
                choice: 'good',
                confidence: 0.8,
                probabilities: { off_target: 0, poor: 0, adequate: 0.2, good: 0.8, excellent: 0 },
              },
            },
          },
          requestId: 'jev-1',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': 'jev-1' },
        },
      );
    }) as typeof globalThis.fetch;

    const verdict = await judgeChatReply({ prompt: 'p', reply: 'a' });

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('/api/jev');
    const body = JSON.parse(seen[0].body) as { questions: Record<string, { type: string }> };
    expect(body.questions.verdict.type).toBe('choice');
    expect(verdict?.requestId).toBe('jev-1');
    expect(verdict?.label).toBe('Good');
  });

  it('returns null without throwing on gateway failure or malformed body', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { code: 'PROVIDER_ERROR' } }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      )) as typeof globalThis.fetch;

    await expect(judgeChatReply({ prompt: 'p', reply: 'a' })).resolves.toBeNull();

    globalThis.fetch = (async () =>
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })) as typeof globalThis.fetch;
    await expect(judgeChatReply({ prompt: 'p', reply: 'a' })).resolves.toBeNull();

    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    await expect(judgeChatReply({ prompt: 'p', reply: 'a' })).resolves.toBeNull();
  });

  let prevFetch: typeof globalThis.fetch | undefined;
  beforeEach(() => {
    prevFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = prevFetch!;
    vi.restoreAllMocks();
  });
});