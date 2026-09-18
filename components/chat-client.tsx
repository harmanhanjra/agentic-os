'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUp,
  Check,
  CircleAlert,
  Copy,
  History,
  RotateCcw,
  Square,
} from 'lucide-react';
import {
  autoTitle,
  blankConversation,
  deleteConversation,
  listConversations,
  saveConversation,
  type Conversation,
  type StoredMessage,
} from '@/lib/chat/storage';
import { ConversationHistory } from './conversation-history';
import { Markdown } from './markdown';
import { ModelMenu } from './model-menu';
import { AUTO_ID, labelForSelection, readSelectedModel, useRegistry } from './use-registry';
import { useSkills } from './use-skills';

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
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = json.choices?.[0]?.delta?.content;
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
  const [convo, setConvo] = useState<Conversation>(() => blankConversation(readSelectedModel()));
  const [history, setHistory] = useState<Conversation[]>(() => listConversations());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelSel, setModelSel] = useState<string>(() => readSelectedModel());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const { models } = useRegistry();
  const { enabled: enabledSkills, disabled: disabledSkills, loading: skillsLoading } = useSkills();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  const messages = convo.messages;

  // Auto-save every change (only conversations with content are kept).
  // History list refreshes when streaming settles to avoid per-token churn.
  useEffect(() => {
    if (messages.length === 0) return;
    const snapshot: Conversation = {
      ...convo,
      modelId: modelSel,
      title: autoTitle(messages),
      updatedAt: Date.now(),
    };
    saveConversation(snapshot);
    if (!busy) setHistory(listConversations());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(
    async (text: string, historyOverride?: StoredMessage[]) => {
      const value = text.trim();
      if (!value || busy) return;
      const prior = historyOverride ?? messages;
      const modelId = modelSel === AUTO_ID ? undefined : modelSel;
      const userMsg: StoredMessage = {
        role: 'user',
        content: value,
        createdAt: Date.now(),
      };
      const base = [...prior, userMsg];
      setConvo((c) => ({ ...c, messages: base, modelId: modelSel }));
      setInput('');
      setBusy(true);
      const t0 = Date.now();
      const controller = new AbortController();
      abortRef.current = controller;
      let assistant = '';
      try {
        const { model, requestId } = await streamChat(
          base.map((m) => ({ role: m.role, content: m.content })),
          modelId,
          controller.signal,
          (token) => {
            assistant += token;
            const snapshot = assistant;
            setConvo((prev) => {
              const copy = [...prev.messages];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant' && !last.errorCode) {
                copy[copy.length - 1] = { ...last, content: snapshot };
              } else {
                copy.push({ role: 'assistant', content: snapshot, createdAt: Date.now() });
              }
              return { ...prev, messages: copy };
            });
          },
          disabledSkills,
        );
        const latencyMs = Date.now() - t0;
        setConvo((prev) => {
          const copy = [...prev.messages];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              model: model ?? undefined,
              requestId: requestId ?? undefined,
              latencyMs,
            };
          }
          return { ...prev, messages: copy };
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          if (!assistant) {
            setConvo((prev) => ({ ...prev, messages: prev.messages.slice(0, -1) }));
          }
          return;
        }
        const typed = err as Error & { code?: string; requestId?: string | null };
        setConvo((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              role: 'assistant',
              content: typed.message,
              errorCode: typed.code,
              requestId: typed.requestId ?? undefined,
              latencyMs: Date.now() - t0,
              createdAt: Date.now(),
            },
          ],
        }));
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [messages, busy, modelSel, disabledSkills],
  );

  // Boot once from ?prompt= (e.g. sent from the home prompt box).
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

  const startNew = useCallback(() => {
    stop();
    setConvo(blankConversation(readSelectedModel()));
    setModelSel(readSelectedModel());
    setInput('');
  }, [stop]);

  const openConvo = useCallback(
    (id: string) => {
      stop();
      const found = listConversations().find((c) => c.id === id);
      if (!found) return;
      setConvo(found);
      if (found.modelId) setModelSel(found.modelId);
      setInput('');
    },
    [stop],
  );

  const removeConvo = useCallback(
    (id: string) => {
      deleteConversation(id);
      setHistory(listConversations());
      if (id === convo.id) startNew();
    },
    [convo.id, startNew],
  );

  const resend = useCallback(
    (content: string) => {
      const trimmed = [...messages];
      if (trimmed[trimmed.length - 1]?.role === 'assistant') trimmed.pop();
      setConvo((prev) => ({ ...prev, messages: trimmed }));
      send(content, trimmed);
    },
    [messages, send],
  );

  const copyText = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(index);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const lastUser = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user'),
    [messages],
  );
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && !messages[i].errorCode) return i;
    }
    return -1;
  }, [messages]);

  return (
    <div className="flex min-w-0 flex-1">
      <ConversationHistory
        conversations={history}
        activeId={messages.length > 0 ? convo.id : null}
        onSelect={openConvo}
        onNew={startNew}
        onDelete={removeConvo}
        mobileOpen={historyOpen}
        onCloseMobile={() => setHistoryOpen(false)}
      />

      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-5 py-6 md:px-8">
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open chat history"
            className="rounded-lg p-2 text-muted hover:bg-raised hover:text-ink md:hidden"
          >
            <History size={16} aria-hidden />
          </button>
          <span className="hidden text-[11px] text-faint sm:inline">Answering with</span>
          <ModelMenu value={modelSel} onChange={setModelSel} />
          {models.length > 0 && modelSel !== AUTO_ID && (
            <span className="hidden truncate text-[11px] text-faint lg:inline">
              {labelForSelection(modelSel, models)}
            </span>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center" role="status">
            <h1 className="text-2xl font-medium tracking-tight">What should we work on?</h1>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Responses stream from your configured provider. Nothing is fabricated.
              Chats save automatically on this device.
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
          <ol className="flex flex-1 flex-col gap-6 py-4" aria-live="polite">
            {messages.map((m, i) => (
              <li key={`${convo.id}-${i}`}>
                {m.role === 'user' ? (
                  <div className="flex justify-end">
                    <p
                      className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-overlay px-4 py-3 text-sm leading-6"
                      title={new Date(m.createdAt).toLocaleString()}
                    >
                      {m.content}
                    </p>
                  </div>
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
                            onClick={() => resend(lastUser.content)}
                            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-ink"
                          >
                            <RotateCcw size={12} aria-hidden /> Retry
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-full">
                    {m.content ? (
                      <Markdown text={m.content} />
                    ) : (
                      <p className="text-sm text-faint">…</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {(m.model || m.requestId || m.latencyMs) && (
                        <p
                          className="font-mono text-[10px] text-faint"
                          title={`Answered ${new Date(m.createdAt).toLocaleString()}`}
                        >
                          {m.model}
                          {m.model && (m.requestId || m.latencyMs) ? ' · ' : ''}
                          {typeof m.latencyMs === 'number' ? `${(m.latencyMs / 1000).toFixed(1)}s` : ''}
                          {typeof m.latencyMs === 'number' && m.requestId ? ' · ' : ''}
                          {m.requestId ? `request ${m.requestId}` : ''}
                        </p>
                      )}
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyText(m.content, i)}
                          aria-label={copied === i ? 'Copied' : 'Copy response'}
                          className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink"
                        >
                          {copied === i ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                        </button>
                        {i === lastAssistantIndex && lastUser && !busy && (
                          <button
                            type="button"
                            onClick={() => resend(lastUser.content)}
                            aria-label="Regenerate response"
                            className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink"
                          >
                            <RotateCcw size={13} aria-hidden />
                          </button>
                        )}
                      </span>
                    </div>
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
                onClick={stop}
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
          <p className="mt-1.5 text-center text-[10px] text-faint">
            ScaleOS never fabricates responses — unconfigured routers report errors with request IDs.
          </p>
        </form>
      </div>
    </div>
  );
}
