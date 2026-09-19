'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CircleAlert,
  Play,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
} from 'lucide-react';
import { AppShell } from './app-shell';

type QuestionType = 'choice' | 'noul' | 'score';

interface DraftQuestion {
  id: string;
  type: QuestionType;
  instructions: string;
  options: Array<{ name: string; description: string }>;
  noulTrue: string;
  noulFalse: string;
  useNoulCriteria: boolean;
  levels: string[];
}

interface JevAnswers {
  answers: Record<string, Record<string, unknown>>;
  usage: unknown;
  inputTokens: number;
}

const MAX_QUESTIONS = 32;

function blankQuestion(index: number): DraftQuestion {
  return {
    id: `review-${index + 1}`,
    type: 'choice',
    instructions: '',
    options: [
      { name: 'accept', description: '' },
      { name: 'review', description: '' },
    ],
    noulTrue: '',
    noulFalse: '',
    useNoulCriteria: false,
    levels: ['', ''],
  };
}

function summarize(answer: Record<string, unknown>): string {
  for (const field of ['decision', 'choice', 'verdict', 'selected', 'value', 'score', 'result']) {
    const value = answer[field];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return JSON.stringify(answer).slice(0, 500);
}

export function JevClient() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [stateText, setStateText] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion(0)]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JevAnswers | null>(null);
  const [failure, setFailure] = useState<{ message: string; code?: string; requestId?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/jev')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive) setConfigured(Boolean(body?.data?.configured));
      })
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  const estimatedTokens = useMemo(() => {
    const chars = JSON.stringify({
      state: stateText,
      questions: questions.map((q) => q.instructions),
    }).length;
    return Math.ceil(chars / 4);
  }, [stateText, questions]);

  const patch = (index: number, next: Partial<DraftQuestion>) =>
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...next } : q)));

  const valid =
    stateText.trim().length > 0 &&
    questions.length >= 1 &&
    questions.length <= MAX_QUESTIONS &&
    questions.every((q) => {
      if (!q.id.trim() || !q.instructions.trim()) return false;
      if (q.type === 'choice')
        return (
          q.options.filter((o) => o.name.trim() && o.description.trim()).length >= 2 &&
          q.options.length <= 64
        );
      if (q.type === 'score')
        return q.levels.filter((l) => l.trim()).length >= 2 && q.levels.length <= 10;
      return true;
    });

  const ask = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const payload = {
        state: stateText.trim(),
        questions: Object.fromEntries(
          questions.map((q) => {
            if (q.type === 'choice') {
              return [
                q.id.trim(),
                {
                  type: 'choice',
                  instructions: q.instructions.trim(),
                  criteria: Object.fromEntries(
                    q.options
                      .filter((o) => o.name.trim() && o.description.trim())
                      .map((o) => [o.name.trim(), o.description.trim()]),
                  ),
                },
              ];
            }
            if (q.type === 'score') {
              return [
                q.id.trim(),
                {
                  type: 'score',
                  instructions: q.instructions.trim(),
                  criteria: q.levels.filter((l) => l.trim()),
                },
              ];
            }
            return [
              q.id.trim(),
              {
                type: 'noul',
                instructions: q.instructions.trim(),
                ...(q.useNoulCriteria && q.noulTrue.trim() && q.noulFalse.trim()
                  ? { criteria: { true: q.noulTrue.trim(), false: q.noulFalse.trim() } }
                  : {}),
              },
            ];
          }),
        ),
      };
      const res = await fetch('/api/jev', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFailure({
          message: body?.error?.message ?? 'The Jev request could not be completed.',
          code: body?.error?.code,
          requestId: body?.requestId ?? res.headers.get('x-request-id'),
        });
        return;
      }
      setResult(body.data);
    } catch {
      setFailure({ message: 'Network error while reaching the Jev endpoint.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 md:px-10">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
          <Scale size={14} aria-hidden /> Decision helper · jev-latest
        </p>
        <h1 className="text-3xl font-medium tracking-tight">Jev</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Ask TypeSafe Jev independent decision questions over a shared state. Jev is an
          advisor, not a chat model: answers are read by question ID and are never executed,
          merged, or auto-applied. Probabilities and confidence are not guarantees of
          correctness.
        </p>

        {configured === false && (
          <div className="mt-6 rounded-2xl border border-line bg-panel p-6 text-center" role="status">
            <h2 className="text-sm font-medium">Jev is not configured</h2>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-faint">
              Set <span className="font-mono">EXPERIENTIAL_API_KEY</span> locally (server
              environment or <span className="font-mono">.env.local</span>) and restart. The key
              is never accepted through the UI or logs.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-focus px-4 py-2 text-xs font-medium text-accent transition hover:bg-overlay"
            >
              Open provider settings <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-line bg-panel p-5 md:p-6">
          <label htmlFor="jev-state" className="text-xs font-medium text-muted">
            State <span className="font-normal text-faint">(concise diff + test summary — not the whole repo)</span>
          </label>
          <textarea
            id="jev-state"
            value={stateText}
            onChange={(e) => setStateText(e.target.value)}
            placeholder="Paste the diff under review and the test summary…"
            rows={6}
            maxLength={120_000}
            className="mt-2 w-full resize-y rounded-xl border border-line bg-canvas p-4 text-sm leading-6 outline-none placeholder:text-faint focus:border-focus"
          />
          <p className="mt-2 text-[11px] text-faint" role="status">
            Rough shared input estimate: ~{estimatedTokens.toLocaleString()} of 32,000 tokens for
            state + question definitions.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {questions.map((q, i) => (
            <section key={i} className="rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted">
                  {i + 1}
                </span>
                <label htmlFor={`jev-qid-${i}`} className="sr-only">Question {i + 1} ID</label>
                <input
                  id={`jev-qid-${i}`}
                  value={q.id}
                  onChange={(e) => patch(i, { id: e.target.value.slice(0, 100) })}
                  placeholder="question-id"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs outline-none placeholder:text-faint focus:border-focus"
                />
                <select
                  value={q.type}
                  onChange={(e) => patch(i, { type: e.target.value as QuestionType })}
                  aria-label={`Question ${i + 1} type`}
                  className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs outline-none"
                >
                  <option value="choice">choice</option>
                  <option value="noul">noul</option>
                  <option value="score">score</option>
                </select>
                <button
                  type="button"
                  onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                  disabled={questions.length <= 1}
                  aria-label={`Remove question ${i + 1}`}
                  className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink disabled:opacity-30"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>

              <label htmlFor={`jev-instructions-${i}`} className="mt-3 block text-xs font-medium text-muted">
                Instructions
              </label>
              <textarea
                id={`jev-instructions-${i}`}
                value={q.instructions}
                onChange={(e) => patch(i, { instructions: e.target.value.slice(0, 4000) })}
                placeholder={
                  q.type === 'choice'
                    ? 'Decide how to handle this diff…'
                    : q.type === 'score'
                      ? 'Rate the risk of this change…'
                      : 'Judge the proposition: the test summary covers the change…'
                }
                rows={2}
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-canvas p-3 text-[13px] leading-6 outline-none placeholder:text-faint focus:border-focus"
              />

              {q.type === 'choice' && (
                <div className="mt-3 space-y-2">
                  {q.options.map((o, j) => (
                    <div key={j} className="flex gap-1.5">
                      <input
                        value={o.name}
                        onChange={(e) =>
                          patch(i, {
                            options: q.options.map((x, k) =>
                              k === j ? { ...x, name: e.target.value.slice(0, 100) } : x,
                            ),
                          })
                        }
                        placeholder="option (e.g. accept)"
                        aria-label={`Option ${j + 1} name`}
                        className="w-32 shrink-0 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs outline-none placeholder:text-faint focus:border-focus"
                      />
                      <input
                        value={o.description}
                        onChange={(e) =>
                          patch(i, {
                            options: q.options.map((x, k) =>
                              k === j ? { ...x, description: e.target.value.slice(0, 2000) } : x,
                            ),
                          })
                        }
                        placeholder="What this option means…"
                        aria-label={`Option ${j + 1} description`}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs outline-none placeholder:text-faint focus:border-focus"
                      />
                      <button
                        type="button"
                        onClick={() => patch(i, { options: q.options.filter((_, k) => k !== j) })}
                        disabled={q.options.length <= 2}
                        aria-label={`Remove option ${j + 1}`}
                        className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink disabled:opacity-30"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      patch(i, { options: [...q.options, { name: '', description: '' }].slice(0, 64) })
                    }
                    disabled={q.options.length >= 64}
                    className="text-[11px] text-muted transition hover:text-accent disabled:opacity-40"
                  >
                    + Add option ({q.options.length}/64)
                  </button>
                </div>
              )}

              {q.type === 'noul' && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={q.useNoulCriteria}
                      onChange={(e) => patch(i, { useNoulCriteria: e.target.checked })}
                      className="h-3.5 w-3.5 accent-current"
                    />
                    Describe what true / false mean
                  </label>
                  {q.useNoulCriteria && (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      <input
                        value={q.noulTrue}
                        onChange={(e) => patch(i, { noulTrue: e.target.value.slice(0, 2000) })}
                        placeholder="true means…"
                        aria-label="True description"
                        className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs outline-none placeholder:text-faint focus:border-focus"
                      />
                      <input
                        value={q.noulFalse}
                        onChange={(e) => patch(i, { noulFalse: e.target.value.slice(0, 2000) })}
                        placeholder="false means…"
                        aria-label="False description"
                        className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs outline-none placeholder:text-faint focus:border-focus"
                      />
                    </div>
                  )}
                </div>
              )}

              {q.type === 'score' && (
                <div className="mt-3 space-y-2">
                  {q.levels.map((level, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-muted">
                        {j + 1}
                      </span>
                      <input
                        value={level}
                        onChange={(e) =>
                          patch(i, {
                            levels: q.levels.map((x, k) => (k === j ? e.target.value.slice(0, 2000) : x)),
                          })
                        }
                        placeholder={`Level ${j + 1} description…`}
                        aria-label={`Level ${j + 1}`}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs outline-none placeholder:text-faint focus:border-focus"
                      />
                      <button
                        type="button"
                        onClick={() => patch(i, { levels: q.levels.filter((_, k) => k !== j) })}
                        disabled={q.levels.length <= 2}
                        aria-label={`Remove level ${j + 1}`}
                        className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink disabled:opacity-30"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patch(i, { levels: [...q.levels, ''].slice(0, 10) })}
                    disabled={q.levels.length >= 10}
                    className="text-[11px] text-muted transition hover:text-accent disabled:opacity-40"
                  >
                    + Add level ({q.levels.length}/10)
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setQuestions((prev) => [...prev, blankQuestion(prev.length)].slice(0, MAX_QUESTIONS))}
            disabled={questions.length >= MAX_QUESTIONS}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <Plus size={13} aria-hidden /> Add question ({questions.length}/{MAX_QUESTIONS})
          </button>
          <button
            type="button"
            onClick={ask}
            disabled={!valid || busy || configured === false}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
          >
            <Play size={13} aria-hidden /> {busy ? 'Asking Jev…' : 'Ask Jev'}
          </button>
          {(result || failure) && !busy && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setFailure(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-muted hover:border-line-strong hover:text-ink"
            >
              <RotateCcw size={12} aria-hidden /> Clear
            </button>
          )}
        </div>

        {failure && (
          <div className="mt-4 rounded-2xl border border-line bg-panel p-5" role="alert">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CircleAlert size={15} className="text-danger" aria-hidden /> Jev request failed
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{failure.message}</p>
            {failure.requestId && (
              <p className="mt-2 font-mono text-[10px] text-faint">request {failure.requestId}</p>
            )}
          </div>
        )}

        {result && !busy && (
          <div className="mt-4">
            <p className="mb-3 text-[11px] text-faint" role="status">
              Advisory answers by question ID · ~{result.inputTokens.toLocaleString()} input tokens
              · usage reported below · nothing was executed or merged
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(result.answers).map(([id, answer]) => (
                <article key={id} className="rounded-2xl border border-line bg-panel p-5">
                  <h2 className="truncate font-mono text-xs font-medium">{id}</h2>
                  <p className="mt-2 text-sm font-medium text-accent">{summarize(answer)}</p>
                  <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-[10px] leading-4 text-faint">
                    {JSON.stringify(answer, null, 2)?.slice(0, 4000)}
                  </pre>
                </article>
              ))}
            </div>
            <details className="mt-3 rounded-2xl border border-line bg-panel p-5">
              <summary className="cursor-pointer text-xs font-medium text-muted">
                Reported usage
              </summary>
              <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-[10px] leading-4 text-faint">
                {JSON.stringify(result.usage, null, 2)?.slice(0, 4000) ?? 'null'}
              </pre>
            </details>
          </div>
        )}
      </div>
    </AppShell>
  );
}
