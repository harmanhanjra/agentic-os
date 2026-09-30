'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CircleAlert,
  Ear,
  ExternalLink,
  Globe,
  Mic,
  MicOff,
  Monitor,
  MousePointerClick,
  RotateCcw,
  ScrollText,
  Send,
  Square,
  Type,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';

interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
  requestId?: string;
  latencyMs?: number;
  intent?: string;
  screenshotDataUrl?: string;
}

interface VoiceCommandResult {
  requestId: string;
  intent: string;
  instruction: string;
  ok: boolean;
  spoken: string;
  detail: string;
  screenshotDataUrl?: string;
  latencyMs: number;
}

interface RecogInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function recognitionCtor(): (new () => RecogInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return (ctor ?? null) as (new () => RecogInstance) | null;
}

const INTENT_ICONS: Record<string, typeof Globe> = {
  browser_navigate: Globe,
  browser_click: MousePointerClick,
  browser_type: Type,
  browser_scroll: ScrollText,
  browser_read: ScrollText,
  browser_screenshot: Monitor,
  computer_screenshot: Monitor,
  computer_hotkey: Monitor,
  computer_desktop: Monitor,
  chat: Send,
};

const INTENT_LABELS: Record<string, string> = {
  browser_navigate: 'Navigating',
  browser_click: 'Clicking',
  browser_type: 'Typing',
  browser_scroll: 'Scrolling',
  browser_read: 'Reading page',
  browser_screenshot: 'Screenshot',
  computer_screenshot: 'Screenshot',
  computer_hotkey: 'Hotkey',
  computer_desktop: 'Desktop',
  chat: 'Chat',
};

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

async function executeVoiceCommand(
  text: string,
  history: Array<{ role: string; content: string }>,
): Promise<VoiceCommandResult> {
  const res = await fetch('/api/voice/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, history }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data?.result) {
    throw new Error(body?.error?.message ?? 'Command failed');
  }
  return body.data.result as VoiceCommandResult;
}

export function VoiceClient() {
  const supported = useMemo(() => recognitionCtor() !== null, []);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [input, setInput] = useState('');
  const [heard, setHeard] = useState('');
  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [continuous, setContinuous] = useState(false);
  const [wakeWord, setWakeWord] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>('');
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const recogRef = useRef<RecogInstance | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<VoiceMessage[]>([]);
  const continuousRef = useRef(false);
  const wakeWordRef = useRef(true);
  const autoSpeakRef = useRef(true);
  const phaseRef = useRef(phase);
  const bottomRef = useRef<HTMLDivElement>(null);

  messagesRef.current = messages;
  continuousRef.current = continuous;
  wakeWordRef.current = wakeWord;
  autoSpeakRef.current = autoSpeak;
  phaseRef.current = phase;

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        setVoices(list);
        setVoiceURI((prev) => {
          if (prev) return prev;
          const en = list.find((v) => v.lang.toLowerCase().startsWith('en'));
          return (en ?? list[0]).voiceURI;
        });
      }
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, heard, phase]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (phaseRef.current === 'speaking') setPhase(continuousRef.current ? 'listening' : 'idle');
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const clean = cleanForSpeech(text);
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      const voice = voices.find((v) => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      utterance.onstart = () => setPhase('speaking');
      utterance.onend = () => setPhase(continuousRef.current ? 'listening' : 'idle');
      utterance.onerror = () => setPhase(continuousRef.current ? 'listening' : 'idle');
      window.speechSynthesis.speak(utterance);
      setPhase('speaking');
    },
    [voices, voiceURI, rate],
  );

  const send = useCallback(
    async (text: string) => {
      const value = text.trim().replace(/^naughty[,\s]*/i, '');
      if (!value || phaseRef.current === 'thinking') return;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      abortRef.current?.abort();
      setError(null);
      setHeard('');
      const history = messagesRef.current;
      setMessages([...history, { role: 'user', content: value }]);
      setInput('');
      setPhase('thinking');
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await executeVoiceCommand(value, history.slice(-6).map((m) => ({ role: m.role, content: m.content })));
        const icon = INTENT_ICONS[result.intent] ?? Send;
        const label = INTENT_LABELS[result.intent] ?? result.intent;

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.spoken,
            requestId: result.requestId,
            latencyMs: result.latencyMs,
            intent: label,
            screenshotDataUrl: result.screenshotDataUrl,
          },
        ]);

        if (autoSpeakRef.current) {
          setTimeout(() => speak(result.spoken), 50);
        } else {
          setPhase(continuousRef.current ? 'listening' : 'idle');
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setPhase(continuousRef.current ? 'listening' : 'idle');
          return;
        }
        const typed = err as Error & { code?: string };
        const message =
          typed.code === 'PROVIDER_NOT_CONFIGURED' || typed.code === 'MODEL_UNAVAILABLE'
            ? `${typed.message} Open Settings to connect a provider.`
            : typed.message;
        setError(message);
        setPhase(continuousRef.current ? 'listening' : 'idle');
      } finally {
        abortRef.current = null;
      }
    },
    [speak],
  );

  const sendRef = useRef(send);
  sendRef.current = send;

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError('Voice input is not supported in this browser — type to Naughty instead.');
      return;
    }
    try {
      recogRef.current?.abort();
      const recog = new Ctor();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      recog.onresult = (event: unknown) => {
        const e = event as {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        };
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) {
            const said = transcript.trim();
            if (!said) continue;
            if (wakeWordRef.current && !/naughty/i.test(said)) {
              setHeard(`(heard, no wake word) ${said}`);
              continue;
            }
            void sendRef.current(said);
          } else {
            interim += transcript;
          }
        }
        if (interim.trim()) setHeard(interim.trim());
      };
      recog.onerror = (event: unknown) => {
        const e = event as { error?: string };
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setError('Microphone blocked — allow mic access in the browser, then try again.');
          setContinuous(false);
        }
      };
      recog.onend = () => {
        recogRef.current = null;
        if (continuousRef.current && phaseRef.current !== 'thinking' && phaseRef.current !== 'speaking') {
          setTimeout(() => {
            if (continuousRef.current && !recogRef.current) startListening();
          }, 300);
        } else if (!continuousRef.current && phaseRef.current === 'listening') {
          setPhase('idle');
        }
      };
      recogRef.current = recog;
      recog.start();
      setPhase('listening');
      setError(null);
    } catch {
      setError('Could not start the microphone — type to Naughty instead.');
    }
  }, []);

  const stopListening = useCallback(() => {
    setContinuous(false);
    try {
      recogRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recogRef.current = null;
    if (phaseRef.current === 'listening') setPhase('idle');
  }, []);

  useEffect(() => {
    if (continuous) {
      if (!recogRef.current) startListening();
    } else {
      if (recogRef.current && phaseRef.current !== 'thinking' && phaseRef.current !== 'speaking') {
        try {
          recogRef.current.stop();
        } catch {
          /* already stopped */
        }
        recogRef.current = null;
        if (phaseRef.current === 'listening') setPhase('idle');
      }
    }
  }, [continuous]);

  useEffect(
    () => () => {
      try {
        recogRef.current?.abort();
      } catch {
        /* noop */
      }
      abortRef.current?.abort();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  const toggleMic = () => {
    if (phase === 'listening') stopListening();
    else if (phase === 'speaking') stopSpeaking();
    else if (phase === 'idle') startListening();
  };

  const stopAll = () => {
    abortRef.current?.abort();
    stopSpeaking();
    stopListening();
  };

  const statusLine =
    phase === 'listening'
      ? continuous
        ? 'Listening… say "Naughty" followed by your request'
        : 'Listening… speak now'
      : phase === 'thinking'
        ? 'Naughty is thinking…'
        : phase === 'speaking'
          ? 'Naughty is speaking… (tap mic to interrupt)'
          : 'Tap the mic and talk to Naughty';

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-5 py-6 md:px-8">
      <div className="flex flex-col items-center pt-4 text-center">
        <button
          type="button"
          onClick={toggleMic}
          disabled={phase === 'thinking'}
          aria-label={
            phase === 'listening' ? 'Stop listening' : phase === 'speaking' ? 'Interrupt Naughty' : 'Talk to Naughty'
          }
          className={`flex h-24 w-24 items-center justify-center rounded-full border transition ${
            phase === 'listening'
              ? 'animate-pulse-soft border-focus bg-overlay text-accent'
              : phase === 'thinking'
                ? 'border-line bg-panel text-faint'
                : 'border-line-strong bg-panel text-ink hover:border-focus'
          } disabled:opacity-50`}
        >
          {phase === 'listening' ? (
            <Ear size={32} aria-hidden />
          ) : phase === 'speaking' ? (
            <Volume2 size={32} aria-hidden />
          ) : !supported ? (
            <MicOff size={32} aria-hidden />
          ) : (
            <Mic size={32} aria-hidden />
          )}
        </button>
        <h1 className="mt-4 text-2xl font-medium tracking-tight">Naughty</h1>
        <p className="mt-1 text-sm text-muted" role="status">
          {statusLine}
        </p>
        {!supported && (
          <p className="mt-2 max-w-sm text-xs leading-5 text-faint">
            This browser has no speech recognition — Naughty still works by typing below,
            with spoken replies via speech synthesis.
          </p>
        )}
        {(phase === 'thinking' || phase === 'speaking') && (
          <button
            type="button"
            onClick={stopAll}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-ink"
          >
            <Square size={12} aria-hidden /> Stop
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>Hands-free listening</span>
          <button
            type="button"
            role="switch"
            aria-checked={continuous}
            onClick={() => setContinuous((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${continuous ? 'bg-accent' : 'bg-overlay'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${continuous ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>Require "Naughty" wake word</span>
          <button
            type="button"
            role="switch"
            aria-checked={wakeWord}
            onClick={() => setWakeWord((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${wakeWord ? 'bg-accent' : 'bg-overlay'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${wakeWord ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            {autoSpeak ? <Volume2 size={13} aria-hidden /> : <VolumeX size={13} aria-hidden />}
            Spoken replies
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoSpeak}
            onClick={() => setAutoSpeak((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${autoSpeak ? 'bg-accent' : 'bg-overlay'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autoSpeak ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>Speech rate · {rate.toFixed(1)}×</span>
          <input
            type="range"
            min={0.7}
            max={1.4}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-label="Speech rate"
            className="w-28 accent-[var(--accent)]"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-muted sm:col-span-2">
          <span>Voice</span>
          <select
            value={voiceURI}
            onChange={(e) => setVoiceURI(e.target.value)}
            className="max-w-[220px] rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs outline-none"
          >
            {voices.length === 0 && <option value="">System default</option>}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs leading-5 text-danger" role="alert">
          <CircleAlert size={13} className="mr-1.5 inline" aria-hidden />
          {error}{' '}
          {/provider|model/i.test(error) && (
            <Link href="/settings" className="underline underline-offset-2">
              Open provider settings
            </Link>
          )}
        </p>
      )}

      <ol className="flex flex-1 flex-col gap-4 py-6" aria-live="polite">
        {messages.length === 0 && !heard && (
          <li className="rounded-2xl border border-line bg-panel p-5 text-center" role="status">
            <p className="text-sm font-medium">"Naughty, open google.com"</p>
            <p className="mt-1 text-xs leading-5 text-faint">
              Naughty controls your browser by voice. Try: navigate, click, type, scroll, read, screenshot, or just chat.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {['Open github.com', 'Click the login button', 'Scroll down', 'Read the page', 'Take a screenshot'].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-focus hover:text-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
          </li>
        )}
        {messages.map((m, i) => (
          <li key={`naughty-${i}`} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-overlay px-4 py-3 text-sm leading-6">
                {m.content}
              </p>
            ) : (
              <div className="max-w-full">
                {m.intent && (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                    {(() => {
                      const Icon = INTENT_ICONS[m.intent] ?? Send;
                      return <Icon size={10} aria-hidden />;
                    })()}
                    {m.intent}
                  </span>
                )}
                {m.screenshotDataUrl && (
                  <div className="mb-2 overflow-hidden rounded-xl border border-line">
                    <img
                      src={m.screenshotDataUrl}
                      alt="Browser screenshot"
                      className="max-h-48 w-auto rounded-xl object-contain"
                    />
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{m.content}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {typeof m.latencyMs === 'number' && (
                    <span className="font-mono text-[10px] text-faint">
                      {(m.latencyMs / 1000).toFixed(1)}s{m.requestId ? ` · ${m.requestId.slice(0, 8)}` : ''}
                    </span>
                  )}
                  {autoSpeak && m.content && (
                    <button
                      type="button"
                      onClick={() => speak(m.content)}
                      aria-label="Replay reply aloud"
                      className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink"
                    >
                      <Volume2 size={13} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {heard && (
          <li className="text-sm italic text-faint" aria-label="Currently hearing">
            "{heard}"
          </li>
        )}
        {phase === 'thinking' && !messages.some((m) => m.role === 'assistant' && m.content) && (
          <li className="flex items-center gap-2 text-xs text-faint" aria-label="Waiting for response">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
            Thinking…
          </li>
        )}
        <div ref={bottomRef} />
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-0 bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-panel p-3 transition focus-within:border-focus">
          <label htmlFor="naughty-input" className="sr-only">
            Message Naughty
          </label>
          <input
            id="naughty-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Or type a command… (Enter to send)"
            maxLength={20_000}
            className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={!input.trim() || phase === 'thinking'}
            aria-label="Send command"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink transition hover:bg-accent-hover disabled:opacity-40"
          >
            <Send size={15} aria-hidden />
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                stopAll();
                setMessages([]);
                setError(null);
                toast.success('Conversation cleared');
              }}
              aria-label="Clear conversation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-faint transition hover:bg-raised hover:text-ink"
            >
              <RotateCcw size={14} aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-faint">
          Naughty routes voice to your browser via CDP · chat via your provider · honest errors.
        </p>
      </form>
    </div>
  );
}
