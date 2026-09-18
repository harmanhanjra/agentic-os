'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowUp, CircleAlert, RotateCcw, Square } from 'lucide-react';
import { ModelMenu } from './model-menu';
import { AUTO_ID, labelForSelection, readSelectedModel, useRegistry } from './use-registry';
import { useSkills } from './use-skills';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  requestId?: string;
  errorCode?: string;
}

const SUGGESTIONS = [
  'Explain how model auto-routing works in ScaleOS',
  'Draft a launch checklist for an AI feature',
  'Debug a TypeScript streaming fetch helper',
];

async function streamChat(
  messages: Array<{ role: string; content: string }>,
  modelId: string | undefined,
  signal: AbortSignal,
  onToken: (token: string) => void,
  excludedSkills: string[],
): Promise<{ model: string | null; requestId: string | null }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages,
      ...(modelId ? { modelId } : {}),
      ...(excludedSkills.length > 0 ? { excludedSkills } : {}),
    }),
    signal,
  });
  const requestId = res.headers.get('x-request-id');
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    const err = new Error(
      body?.error?.message ?? 'The provider could not start this generation.',
    ) as Error & { code?: string; requestId?: string | null };
    err.code = body?.error?.code ?? 'PROVIDER_ERROR';
    err.requestId = body?.requestId ?? requestId;
    throw err;
  }
  const model = res.headers.get('x-scaleos-model');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta;
        const token = delta?.content ?? delta?.reasoning_content;
        if (token) onToken(token);
      } catch {
        /* ignore keep-alive or partial frames */
      }
    }
  }
  return { model, requestId };
}

export function ChatClient() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelSel, setModelSel] = useState<string>(() => readSelectedModel());
  const { models } = useRegistry();
  const { enabled: enabledSkills, disabled: disabledSkills, loading: skillsLoading } = useSkills();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      const modelId = modelSel === AUTO_ID ? undefined : modelSel;
      const next: Message[] = [...messages, { role: 'user', content: value }];
      setMessages(next);
      setInput('');
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let assistant = '';
      try {
        const { model, requestId } = await streamChat(
          next.map((m) => ({ role: m.role, content: m.content })),
          modelId,
          controller.signal,
          (token) => {
            assistant += token;
            const snapshot = assistant;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant' && !last.errorCode) {
                copy[copy.length - 1] = { ...last, content: snapshot };
              } else {
                copy.push({ role: 'assistant', content: snapshot });
              }
              return copy;
            });
          },
          disabledSkills,
        );
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              model: model ?? undefined,
              requestId: requestId ?? undefined,
            };
          }
          return copy;
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          if (assistant) return;
          setMessages((prev) => prev.slice(0, -1));
          return;
        }
        const typed = err as Error & { code?: string; requestId?: string | null };
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: typed.message,
            errorCode: typed.code,
            requestId: typed.requestId ?? undefined,
          },
        ]);
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [messages, busy, modelSel, disabledSkills],
  );
  useEffect(() => {
    if (booted.current) return;
    const initial = searchParams.get('prompt');
    if (initial?.trim()) {
      booted.current = true;
      send(initial.trim());
    }
  }, [searchParams, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-6 md:px-8">
      <div className="flex items-center gap-2 pb-2">
        <span className="text-[11px] text-faint">Answering with</span>
        <ModelMenu value={modelSel} onChange={setModelSel} />
        {models.length > 0 && modelSel !== AUTO_ID && (
          <span className="hidden truncate text-[11px] text-faint sm:inline">
            {labelForSelection(modelSel, models)}
          </span>
        )}
      </div>
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center" role="status">
          <h1 className="text-2xl font-medium tracking-tight">What should we work on?</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Responses stream from your configured provider. Nothing is fabricated.
          </p>
          <p className="mt-2 text-xs text-faint">
            {skillsLoading ? (
              'Scanning local skills…'
            ) : enabledSkills.length > 0 ? (
              <>
                {enabledSkills.length} local skill{enabledSkills.length === 1 ? '' : 's'} in
                context.{' '}
                <Link href="/skills" className="text-accent underline-offset-2 hover:underline">
                  Manage
                </Link>
              </>
            ) : (
              <>
                No local skills detected.{' '}
                <Link href="/skills" className="text-accent underline-offset-2 hover:underline">
                  Rescan
                </Link>
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-line bg-panel px-3.5 py-2 text-xs text-muted transition hover:border-line-strong hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="flex flex-1 flex-col gap-5 py-4" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              {m.role === 'user' ? (
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-overlay px-4 py-3 text-sm leading-6">
                  {m.content}
                </p>
              ) : m.errorCode ? (
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-panel p-4" role="alert">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CircleAlert size={15} className="text-danger" aria-hidden />
                    {m.errorCode === 'PROVIDER_NOT_CONFIGURED'
                      ? 'No provider connected'
                      : 'Generation failed'}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-5 text-muted">{m.content}</p>
                  {m.requestId && (
                    <p className="mt-2 font-mono text-[10px] text-faint">request {m.requestId}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    {m.errorCode === 'PROVIDER_NOT_CONFIGURED' ? (
                      <Link
                        href="/settings"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                      >
                        Open provider settings
                      </Link>
                    ) : (
                      lastUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setMessages((prev) => prev.slice(0, -1));
                            send(lastUser.content);
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-ink"
                        >
                          <RotateCcw size={12} aria-hidden /> Retry
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%]">
                  <p className="whitespace-pre-wrap text-sm leading-6">{m.content || '…'}</p>
                  {(m.model || m.requestId) && (
                    <p className="mt-1.5 font-mono text-[10px] text-faint">
                      {m.model}
                      {m.model && m.requestId ? ' · ' : ''}
                      {m.requestId ? `request ${m.requestId}` : ''}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
          {busy && !messages.some((m) => m.role === 'assistant' && m.content) && (
            <li className="flex items-center gap-2 text-xs text-faint" aria-label="Waiting for response">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
              Thinking…
            </li>
          )}
          <div ref={bottomRef} />
        </ol>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 bg-canvas pb-4 pt-2"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-panel p-3 transition focus-within:border-focus">
          <label htmlFor="chat-input" className="sr-only">
            Message ScaleOS
          </label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Message ScaleOS… (Enter to send)"
            rows={2}
            maxLength={100_000}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 text-sm outline-none placeholder:text-faint"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop generating"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-overlay text-ink transition hover:bg-raised"
            >
              <Square size={14} aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
