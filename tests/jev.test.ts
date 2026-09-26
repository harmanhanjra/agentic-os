import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  JEV_GATEWAY_URL,
  JEV_MODEL,
  buildJevPayload,
  estimateJevInputTokens,
  isJevConfigured,
  requestJevDecision,
  summarizeJevAnswer,
  type JevRequest,
} from '../lib/ai/jev';
import { ScaleOSError } from '../lib/ai/types';

const KEY = 'TYPESAFE_API_KEY';
const SECRET = 'test-typesafe-key-1234567890';

function choiceRequest(): JevRequest {
  return {
    state: 'diff: fix login retry\ntests: 12 passed',
    questions: {
      review: {
        type: 'choice',
        instructions: 'Decide how to handle this diff.',
        criteria: {
          accept: 'Safe to merge as-is.',
          review: 'Needs human review first.',
        },
      },
    },
  };
}

describe('jev decision helper', () => {
  let prevKey: string | undefined;
  let prevFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    prevKey = process.env[KEY];
    prevFetch = globalThis.fetch;
    process.env[KEY] = SECRET;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env[KEY];
    else process.env[KEY] = prevKey;
    globalThis.fetch = prevFetch!;
    vi.restoreAllMocks();
  });

  it('stops without the key and never leaks key material', async () => {
    delete process.env[KEY];
    expect(isJevConfigured()).toBe(false);
    const attempt = requestJevDecision(choiceRequest());
    await expect(attempt).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    await attempt.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ScaleOSError);
      expect(String((error as Error).message)).not.toContain(SECRET);
      expect(String((error as Error).message)).toContain(KEY);
    });
  });

  it('posts exactly jev-latest with state and questions keyed by ID', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ answers: { review: { decision: 'review' } }, usage: { input: 10 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    const decision = await requestJevDecision(choiceRequest());

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(JEV_GATEWAY_URL);
    expect(seen[0].url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(seen[0].init.method).toBe('POST');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SECRET}`);
    expect('idempotency-key' in headers).toBe(false);
    const body = JSON.parse(String(seen[0].init.body)) as Record<string, unknown>;
    expect(body.model).toBe(JEV_MODEL);
    expect(body.model).toBe('jev-latest');
    expect(body.state).toBe('diff: fix login retry\ntests: 12 passed');
    expect(body.questions).toHaveProperty('review');
    expect(decision.answers.review).toMatchObject({ decision: 'review' });
    expect(decision.usage).toMatchObject({ input: 10 });
  });

  it('enforces gateway admission bounds before any call', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;

    const manyQuestions: JevRequest['questions'] = {};
    for (let i = 0; i < 33; i += 1) {
      manyQuestions[`q${i}`] = {
        type: 'noul',
        instructions: `Judge proposition ${i}.`,
      };
    }
    await expect(requestJevDecision({ state: 's', questions: manyQuestions })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    const manyOptions: Record<string, string> = {};
    for (let i = 0; i < 65; i += 1) manyOptions[`opt${i}`] = `Option ${i}.`;
    await expect(
      requestJevDecision({
        state: 's',
        questions: { review: { type: 'choice', instructions: 'Pick.', criteria: manyOptions } },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      requestJevDecision({
        state: 's',
        questions: { risk: { type: 'score', instructions: 'Rate.', criteria: ['only one'] } },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects oversized shared input with guidance', () => {
    const small = estimateJevInputTokens(choiceRequest());
    expect(small).toBeLessThanOrEqual(32_000);
    // Schema-valid (500 short lines) but over the ~32k shared token budget.
    const big = Array.from({ length: 500 }, (_, i) => `line ${i}: ` + 'x'.repeat(300));
    expect(() =>
      buildJevPayload({ state: big, questions: choiceRequest().questions }),
    ).toThrowError(ScaleOSError);
  });

  it('surfaces auth and provider failures without retrying', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ message: 'bad key' }), { status: 401 }));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    await expect(requestJevDecision(choiceRequest())).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(requestJevDecision(choiceRequest())).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('summarizes answers by question ID for display', () => {
    expect(summarizeJevAnswer({ decision: 'accept', confidence: 0.9 })).toBe('accept');
    expect(summarizeJevAnswer({ score: 4 })).toBe('4');
    expect(summarizeJevAnswer({ note: 'needs eyes' })).toContain('needs eyes');
  });
});
