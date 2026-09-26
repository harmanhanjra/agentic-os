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
  Scale,
  Globe2,
  ShieldCheck,
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
  type StoredBrowserTask,
} from '@/lib/chat/storage';
import { ConversationHistory } from './conversation-history';
import { retryContext } from '@/lib/chat/retry';
import { judgeChatReply } from '@/lib/ai/chat-judge';
import { Markdown } from './markdown';
import { ModelMenu } from './model-menu';
import { toast } from 'sonner';
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
  planWithJev: boolean,
): Promise<{ model: string | null; requestId: string | null; plan: string | null }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages,
      ...(modelId ? { modelId } : {}),
      ...(excludedSkills.length > 0 ? { excludedSkills } : {}),
      ...(planWithJev ? { planWithJev: true } : {}),
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
  const plan = res.headers.get('x-scaleos-plan');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const token = json.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    } catch {
      /* ignore keep-alive or partial frames */
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) consumeLine(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) consumeLine(line);
  }
  return { model, requestId, plan };
}

export function ChatClient() {
  const searchParams = useSearchParams();
  const [convo, setConvo] = useState<Conversation>(() => blankConversation(readSelectedModel()));
  const [history, setHistory] = useState<Conversation[]>(() => listConversations());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelSel, setModelSel] = useState<string>(() => readSelectedModel());
  const [planWithJev, setPlanWithJev] = useState(true);
  const [browserTaskMode, setBrowserTaskMode] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const { models } = useRegistry();
  const { enabled: enabledSkills, disabled: disabledSkills, loading: skillsLoading } = useSkills();
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);
  const browserTaskActive = useRef<{ conversationId: string } | null>(null);

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
    try {
      saveConversation(snapshot);
      setSaveFailed(false);
      if (!busy) setHistory(listConversations());
    } catch {
      setSaveFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy, saveAttempt]);

  const stop = useCallback(() => {
    const browserTask = browserTaskActive.current;
    if (browserTask) {
      abortRef.current?.abort();
      abortRef.current = null;
      browserTaskActive.current = null;
      setBusy(false);
      setConvo((prev) => prev.id !== browserTask.conversationId ? prev : ({
        ...prev,
        messages: [...prev.messages, {
          role: 'assistant',
          content: 'Task stopped. Browser actions completed before the stop may remain; stopping does not undo them.',
          browserTask: {
            status: 'cancelled', finalUrl: '', finalTitle: '', actions: [], extracted: [],
          },
          createdAt: Date.now(),
        }],
      }));
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
    // React Strict Mode replays mount effects; allow the URL prompt to restart.
    booted.current = false;
  }, []);

  const send = useCallback(
    async (text: string, historyOverride?: StoredMessage[]) => {
      const value = text.trim();
      if (!value || busy || abortRef.current) return;
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
        if (browserTaskMode) {
          browserTaskActive.current = { conversationId: convo.id };
          const response = await fetch('/api/computer/browser/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ objective: value, modelId, maxActions: 20, includeScreenshot: false }),
            signal: controller.signal,
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            const failure = new Error(body?.error?.message ?? 'Browser task could not start.') as Error & { code?: string; requestId?: string };
            failure.code = body?.error?.code ?? 'BROWSER_RUN_FAILED';
            failure.requestId = body?.requestId ?? response.headers.get('x-request-id') ?? undefined;
            throw failure;
          }
          if (abortRef.current !== controller) return;
          const run = body?.data?.run ?? body?.data?.data ?? body?.run ?? body?.data;
          if (!run || typeof run.summary !== 'string') throw new Error('Browser Use returned an invalid task result.');
          const task: StoredBrowserTask = {
            status: run.status,
            finalUrl: run.finalUrl ?? '',
            finalTitle: run.finalTitle ?? '',
            actions: (run.actions ?? []).map((entry: { index: number; action: { type: string }; status: string; message: string }) => ({
              index: entry.index, type: entry.action.type, status: entry.status, message: entry.message,
            })),
            extracted: run.extracted ?? [],
            ...(run.pendingApproval ? { pendingApproval: run.pendingApproval } : {}),
          };
          const requestId = response.headers.get('x-request-id') ?? body?.requestId;
          setConvo((prev) => prev.id !== convo.id ? prev : ({
            ...prev,
            messages: [...prev.messages, {
              role: 'assistant',
              content: run.summary,
              model: run.model,
              requestId,
              latencyMs: run.latencyMs,
              browserTask: task,
              createdAt: Date.now(),
            }],
          }));
          return;
        }
        const { model, requestId, plan } = await streamChat(
          base.map((m) => ({ role: m.role, content: m.content })),
          modelId,
          controller.signal,
          (token) => {
            if (abortRef.current !== controller) return;
            assistant += token;
            const snapshot = assistant;
            setConvo((prev) => {
              if (prev.id !== convo.id) return prev;
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
          planWithJev,
        );
        if (abortRef.current !== controller) return;
        if (planWithJev && !plan) {
          toast.error('Jev planning failed; the model answered without a plan. Check the server-side Jev key.');
        }
        if (!assistant.trim()) {
          const emptyError = new Error('The selected model returned an empty response. Retry the message or choose another model.') as Error & { code?: string; requestId?: string | null };
          emptyError.code = 'EMPTY_RESPONSE';
          emptyError.requestId = requestId;
          throw emptyError;
        }
        const latencyMs = Date.now() - t0;
        setConvo((prev) => {
          if (prev.id !== convo.id) return prev;
          const copy = [...prev.messages];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              model: model ?? undefined,
              requestId: requestId ?? undefined,
              latencyMs,
              plan: plan ?? undefined,
            };
          }
          return { ...prev, messages: copy };
        });

        // Jev reviews the completed model answer independently. A failed Jev
        // request leaves the model's answer untouched.
        if (planWithJev && assistant.trim()) {
          void judgeChatReply({ prompt: value, reply: assistant }).then((judgment) => {
            if (!judgment) {
              toast.error('Jev review failed. The model answer is available; check the server-side Jev key.');
              return;
            }
            setConvo((prev) => {
              if (prev.id !== convo.id) return prev;
              const copy = [...prev.messages];
              const answer = copy[base.length];
              if (answer?.role !== 'assistant' || answer.content !== assistant || answer.errorCode) return prev;
              copy[base.length] = { ...answer, judgment };
              return { ...prev, messages: copy };
            });
          }).catch(() => undefined);
        }
      } catch (err) {
        if (abortRef.current !== controller || (err as Error).name === 'AbortError') return;
        const typed = err as Error & { code?: string; requestId?: string | null };
        setConvo((prev) => prev.id !== convo.id ? prev : ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              role: 'assistant',
              content: typed.message,
              errorCode: typed.code ?? 'NETWORK_ERROR',
              requestId: typed.requestId ?? undefined,
              latencyMs: Date.now() - t0,
              createdAt: Date.now(),
            },
          ],
        }));
      } finally {
        browserTaskActive.current = null;
        if (abortRef.current === controller) {
          setBusy(false);
          abortRef.current = null;
        }
      }
    },
    [messages, busy, modelSel, disabledSkills, planWithJev, browserTaskMode, convo.id],
  );

  const decideBrowserTask = useCallback(async (messageIndex: number, decision: 'approved' | 'denied') => {
    const task = messages[messageIndex]?.browserTask;
    const pending = task?.pendingApproval;
    const objective = messages[messageIndex - 1]?.content;
    if (!pending || !objective || approvalBusy) return;
    setApprovalBusy(true);
    try {
      const decided = await fetch('/api/approvals/decide', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pending.id, decision }),
      });
      const decisionBody = await decided.json().catch(() => null);
      if (!decided.ok) throw new Error(decisionBody?.error?.message ?? 'Approval decision failed.');
      if (decision === 'denied') {
        setConvo((prev) => ({ ...prev, messages: prev.messages.map((message, index) => index === messageIndex && message.browserTask
          ? { ...message, browserTask: { ...message.browserTask, status: 'blocked', pendingApproval: undefined }, content: 'Task stopped because the requested action was denied.' }
          : message) }));
        return;
      }
      const token = decisionBody?.data?.approval?.token;
      if (!token) throw new Error('Approval token was not returned.');
      const resumed = await fetch('/api/computer/browser/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ objective, modelId: modelSel === AUTO_ID ? undefined : modelSel, maxActions: 20, includeScreenshot: false, approvalTokens: [token] }),
      });
      const resumedBody = await resumed.json().catch(() => null);
      if (!resumed.ok) throw new Error(resumedBody?.error?.message ?? 'Approved task could not resume.');
      const run = resumedBody?.data?.run ?? resumedBody?.data?.data ?? resumedBody?.run ?? resumedBody?.data;
      setConvo((prev) => ({ ...prev, messages: prev.messages.map((message, index) => index === messageIndex && message.browserTask ? {
        ...message, content: run.summary, browserTask: {
          status: run.status, finalUrl: run.finalUrl ?? '', finalTitle: run.finalTitle ?? '',
          actions: (run.actions ?? []).map((entry: { index: number; action: { type: string }; status: string; message: string }) => ({ index: entry.index, type: entry.action.type, status: entry.status, message: entry.message })),
          extracted: run.extracted ?? [], ...(run.pendingApproval ? { pendingApproval: run.pendingApproval } : {}),
        },
      } : message) }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not decide the approval.');
    } finally {
      setApprovalBusy(false);
    }
  }, [messages, approvalBusy, modelSel]);

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
    setSaveFailed(false);
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
      try {
        deleteConversation(id);
      } catch {
        toast.error('Could not delete this conversation. Saved history has not been changed.');
        return;
      }
      setHistory(listConversations());
      if (id === convo.id) startNew();
    },
    [convo.id, startNew],
  );

  const resend = useCallback(
    (assistantIndex: number) => {
      if (busy) return;
      const context = retryContext(messages, assistantIndex);
      if (context) send(context.prompt, context.history);
    },
    [messages, send, busy],
  );

  const copyText = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed — clipboard unavailable');
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
        {saveFailed && (
          <div role="alert" className="mb-3 rounded-xl border border-line bg-panel p-3 text-sm">
            <p>This chat could not be saved. Keep this page open and copy any important responses before leaving.</p>
            <button type="button" onClick={() => setSaveAttempt((value) => value + 1)}
              className="mt-2 rounded-lg border border-line px-3 py-2 text-xs hover:bg-raised">
              Retry saving
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open chat history"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted hover:bg-raised hover:text-ink md:hidden"
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
          <span className="ml-auto flex items-center gap-1.5">
            {browserTaskMode ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-panel px-2.5 py-1 text-[11px] text-ink">
                <Globe2 size={11} className="text-accent" aria-hidden /> Browser task mode
              </span>
            ) : <button
              type="button"
              role="switch"
              aria-checked={planWithJev}
              aria-label="Plan and review each reply with Jev"
              onClick={() => setPlanWithJev((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                planWithJev
                  ? 'border-line-strong bg-panel text-ink'
                  : 'border-line text-faint hover:text-muted'
              }`}
              title="Jev plans the reply before generation and reviews it after"
            >
              <Scale size={11} className={planWithJev ? 'text-accent' : ''} aria-hidden />
              Jev plan + review
            </button>}
          </span>
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
                      {m.errorCode?.startsWith('BROWSER_')
                        ? 'Browser task failed'
                        : m.errorCode === 'PROVIDER_NOT_CONFIGURED'
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
                            disabled={busy}
                            onClick={() => resend(i)}
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
                      <>
                        <Markdown text={m.content} />
                        {busy && i === messages.length - 1 && (
                          <span
                            aria-hidden
                            className="ml-0.5 inline-block h-4 w-[7px] translate-y-[3px] animate-pulse-soft rounded-[1px] bg-accent"
                          />
                        )}
                      </>
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
                      {m.plan && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[10px] text-muted"
                          title={`Jev pre-generation plan · ${m.plan}`}
                        >
                          <Scale size={11} className="text-accent" aria-hidden />
                          Jev plan · {m.plan}
                        </span>
                      )}
                      {m.judgment && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[10px] text-muted"
                          title={`Jev review · ${m.judgment.confidence.toLocaleString(undefined, { style: 'percent', maximumFractionDigits: 0 })} confidence${m.judgment.requestId ? ` · request ${m.judgment.requestId}` : ''}`}
                        >
                          <Scale size={11} className="text-accent" aria-hidden />
                          Jev · {m.judgment.label} ({m.judgment.score}/5)
                        </span>
                      )}
                      {m.browserTask && (
                        <section className="mt-3 w-full rounded-xl border border-line bg-panel p-4" aria-label="Browser task result">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 font-medium"><Globe2 size={13} aria-hidden /> Browser task · {m.browserTask.status}</span>
                            {m.browserTask.finalTitle && <span className="text-faint">{m.browserTask.finalTitle}</span>}
                          </div>
                          {m.browserTask.finalUrl && <p className="mt-1 break-all font-mono text-[10px] text-faint">{m.browserTask.finalUrl}</p>}
                          {m.browserTask.actions.length > 0 && <ol className="mt-3 space-y-2">{m.browserTask.actions.map((action) => (
                            <li key={action.index} className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                              <span className="font-mono text-accent">{action.index + 1}. {action.type} · {action.status}</span>
                              <p className="mt-1 text-muted">{action.message}</p>
                            </li>
                          ))}</ol>}
                          {m.browserTask.extracted.length > 0 && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-muted">{m.browserTask.extracted.join('\n\n').slice(0, 8000)}</p>}
                          {m.browserTask.pendingApproval && <div className="mt-3 rounded-lg border border-focus/50 bg-canvas p-3" role="alert">
                            <p className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={13} aria-hidden /> Approval required · {m.browserTask.pendingApproval.risk}</p>
                            <p className="mt-1 text-xs text-muted">{m.browserTask.pendingApproval.action}: {m.browserTask.pendingApproval.detail}</p>
                            <div className="mt-3 flex gap-2">
                              <button type="button" disabled={approvalBusy} onClick={() => void decideBrowserTask(i, 'approved')} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink disabled:opacity-50">{approvalBusy ? 'Working…' : 'Approve & resume'}</button>
                              <button type="button" disabled={approvalBusy} onClick={() => void decideBrowserTask(i, 'denied')} className="rounded-lg border border-line px-3 py-2 text-xs text-muted disabled:opacity-50">Deny</button>
                            </div>
                          </div>}
                        </section>
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
                            onClick={() => resend(i)}
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
              <li className="flex items-center gap-2 text-xs text-faint" aria-label={browserTaskMode ? 'Running browser task' : 'Waiting for response'}>
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
                {browserTaskMode ? 'Running browser task…' : 'Thinking…'}
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
          className="sticky bottom-0 bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
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
              placeholder={browserTaskMode
                ? 'Describe a browser task, e.g. compare countries or find jobs…'
                : 'Message ScaleOS… (Enter to send)'}
              rows={2}
              maxLength={100_000}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 text-sm outline-none placeholder:text-faint"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label={browserTaskActive.current ? 'Stop browser task' : 'Stop generating'}
                title={browserTaskActive.current ? 'Stop browser task' : 'Stop generating'}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-overlay text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
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
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <button type="button" role="switch" aria-checked={browserTaskMode} aria-label="Automate a browser task" onClick={() => setBrowserTaskMode((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition ${browserTaskMode ? 'border-line-strong bg-panel text-ink' : 'border-line text-faint hover:text-muted'}`}
              title="Run this prompt as a browser task using the Browser Use agent">
              <Globe2 size={12} className={browserTaskMode ? 'text-accent' : ''} aria-hidden /> Browser task
            </button>
            <span className="text-[10px] text-faint">{browserTaskMode ? 'Searches public sites; applications, messages, purchases, and credentials stop at safety checks.' : 'Chat mode'}</span>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-faint">
            ScaleOS never fabricates responses — unconfigured routers report errors with request IDs.
          </p>
        </form>
      </div>
    </div>
  );
}
