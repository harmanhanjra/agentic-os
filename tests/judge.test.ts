import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  buildArenaJudgmentPayload,
  buildArenaJudgePayload,
  buildArenaLeaderboard,
  judgeArenaAnswers,
  pickBestAnswer,
  readJudgeScore,
  readPairVerdict,
} from '../lib/ai/judge';
import { JEV_GATEWAY_URL, JEV_MODEL } from '../lib/ai/jev';

const KEY = 'EXPERIENTIAL_API_KEY';
const SECRET = 'test-experiential-key-1234567890';

const answers = [
  { modelId: 'openai:gpt', content: 'Answer A: thorough and correct.' },
  { modelId: 'nvidia:llama', content: 'Answer B: short but accurate.' },
];

describe('arena judgment (Jev ranking)', () => {
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

  it('builds one score question per model with a shared concise state', () => {
    const request = buildArenaJudgmentPayload({ prompt: 'Compare.', answers });
    expect(request.state).toMatchObject({
      prompt: 'Compare.',
      answers: [
        { model: 'openai:gpt', content: 'Answer A: thorough and correct.' },
        { model: 'nvidia:llama', content: 'Answer B: short but accurate.' },
      ],
    });
    const review = request.questions['openai:gpt'];
    const llama = request.questions['nvidia:llama'];
    expect(review?.type).toBe('score');
    expect((review as { criteria: string[] }).criteria.length).toBe(5);
    expect((review as { criteria: string[] }).criteria[4]).toContain('Excellent');
    expect(llama?.type).toBe('score');
  });

  it('requires at least two answers and non-empty model IDs', () => {
    expect(() =>
      buildArenaJudgmentPayload({ prompt: 'p', answers: [answers[0]] }),
    ).toThrowError();
    expect(() =>
      buildArenaJudgmentPayload({
        prompt: 'p',
        answers: [
          { modelId: '', content: 'a' },
          { modelId: '', content: 'b' },
        ],
      }),
    ).toThrowError();
  });

  it('truncates long state so the shared budget stays bounded', () => {
    const longAnswer = { modelId: 'openai:gpt', content: 'x'.repeat(50_000) };
    const request = buildArenaJudgmentPayload({
      prompt: 'y'.repeat(20_000),
      answers: [longAnswer, { modelId: 'nvidia:llama', content: 'b' }],
    });
    const state = request.state as { prompt: string; answers: Array<{ content: string }> };
    expect(state.prompt.length).toBeLessThanOrEqual(4_100);
    expect(state.answers[0].content.length).toBeLessThanOrEqual(3_100);
  });

  it('sends exactly one gateway request with jev-latest and returns scores by ID', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          answers: {
            'openai:gpt': { type: 'score', score: 4, probabilities: { '1': 0, '2': 0, '3': 0.1, '4': 0.9, '5': 0 } },
            'nvidia:llama': { type: 'score', score: 2, probabilities: { '1': 0, '2': 0.8, '3': 0.2, '4': 0, '5': 0 } },
          },
          usage: { input_tokens: 210, output_tokens: 20, cost: 0, is_byok: false },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    const decision = await judgeArenaAnswers({ prompt: 'Compare.', answers });

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(JEV_GATEWAY_URL);
    const body = JSON.parse(String(seen[0].init.body)) as Record<string, unknown>;
    expect(body.model).toBe(JEV_MODEL);
    expect(decision.usage).toMatchObject({ input_tokens: 210 });
    expect(pickBestAnswer(decision.answers)).toEqual({ modelId: 'openai:gpt', score: 4 });
  });

  it('reads and ranks scores across answers', () => {
    expect(readJudgeScore({ score: 5 })).toBe(5);
    expect(readJudgeScore({ value: '3' })).toBe(3);
    expect(readJudgeScore({ decision: 'ok' })).toBeNull();
    const winner = pickBestAnswer(
      {
        a: { score: 2 },
        b: { score: 5 },
        c: { score: 4 },
      },
    );
    expect(winner).toEqual({ modelId: 'b', score: 5 });
    expect(pickBestAnswer({})).toBeNull();
  });

  it('surfaces gateway failures as judgment errors', async () => {
    delete process.env[KEY];
    await expect(judgeArenaAnswers({ prompt: 'p', answers })).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
    });
  });
});

describe('head-to-head arena judging (pairs + leaderboard)', () => {
  let prevKey: string | undefined;

  beforeEach(() => {
    prevKey = process.env[KEY];
    process.env[KEY] = SECRET;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env[KEY];
    else process.env[KEY] = prevKey;
    vi.restoreAllMocks();
  });

  it('builds score questions plus one choice question per pair', () => {
    const three = [
      { modelId: 'openai:gpt', content: 'A.' },
      { modelId: 'nvidia:llama', content: 'B.' },
      { modelId: 'anthropic:claude', content: 'C.' },
    ];
    const { request, pairs } = buildArenaJudgePayload({ prompt: 'Compare.', answers: three });
    expect(pairs).toHaveLength(3); // C(3,2)
    expect(pairs.map((p) => p.questionId)).toEqual(['pair:0:1', 'pair:0:2', 'pair:1:2']);
    for (const pair of pairs) {
      const question = request.questions[pair.questionId] as { type: string; criteria: Record<string, string> };
      expect(question.type).toBe('choice');
      expect(Object.keys(question.criteria)).toEqual(['winner_a', 'winner_b', 'tie']);
    }
  });

  it('cap pair questions at 6 answers while staying within the 32-question budget', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      modelId: `provider:model-${i}`,
      content: `answer ${i}`,
    }));
    const { request, pairs } = buildArenaJudgePayload({ prompt: 'p', answers: eight });
    expect(pairs).toHaveLength(15); // C(6,2)
    expect(Object.keys(request.questions)).toHaveLength(6 + 15);
  });

  it('reads a pair verdict back to a winner or a tie', () => {
    const pair = { questionId: 'pair:0:1', modelA: 'a', modelB: 'b' };
    expect(readPairVerdict({ choice: 'winner_a' }, pair)).toEqual({ winner: 'a' });
    expect(readPairVerdict({ decision: 'winner_b' }, pair)).toEqual({ winner: 'b' });
    expect(readPairVerdict({ choice: 'tie' }, pair)).toEqual({ winner: null });
    expect(readPairVerdict({ choice: 'nope' }, pair)).toBeNull();
  });

  it('folds pair verdicts + scores into a ranked leaderboard', () => {
    const pairs = [
      { questionId: 'pair:0:1', modelA: 'openai:gpt', modelB: 'nvidia:llama' },
      { questionId: 'pair:0:2', modelA: 'openai:gpt', modelB: 'anthropic:claude' },
      { questionId: 'pair:1:2', modelA: 'nvidia:llama', modelB: 'anthropic:claude' },
    ];
    const answers = {
      'openai:gpt': { type: 'score', score: 4 },
      'nvidia:llama': { type: 'score', score: 3 },
      'anthropic:claude': { type: 'score', score: 5 },
      'pair:0:1': { choice: 'winner_a' },
      'pair:0:2': { choice: 'tie' },
      'pair:1:2': { choice: 'tie' },
    };
    const board = buildArenaLeaderboard(answers, pairs);
    expect(board).toHaveLength(3);
    // rank: claude (5), gpt (4, win1 tie1), llama (3, tie2)
    expect(board[0].modelId).toBe('anthropic:claude');
    expect(board[1].modelId).toBe('openai:gpt');
    expect(board[2].modelId).toBe('nvidia:llama');
    expect(board[1]).toMatchObject({ win: 1, loss: 0, tie: 1, winRate: 1 });
    expect(board[2]).toMatchObject({ win: 0, loss: 1, tie: 1, winRate: 0 });
  });
});