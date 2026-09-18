'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Image as ImageIcon, Sparkles } from 'lucide-react';

export default function ImagePage() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ requestId: string; statusUrl: string } | null>(null);
  const [error, setError] = useState('');
  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/images/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelId: 'higgsfield:seedream-v4', prompt: prompt.trim(), aspectRatio: '16:9', resolution: '2K' }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Generation could not start.');
      setResult(body.data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed.'); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-canvas text-ink"><header className="flex h-16 items-center justify-between border-b border-line px-5 md:px-8"><Link href="/" className="flex items-center gap-2 text-xs text-muted hover:text-accent"><ArrowLeft size={15}/>Workspace</Link><div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink"><Sparkles size={15}/></div></header><div className="mx-auto max-w-5xl px-5 py-12 md:px-10"><p className="mb-3 text-xs font-medium uppercase tracking-[.18em] text-accent">Creative workspace</p><h1 className="text-3xl font-medium tracking-tight">Image Studio</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted">Generate images with the official Higgsfield API. Jobs are asynchronous and never reported as complete until the provider returns a result.</p><section className="mt-10 rounded-2xl border border-line bg-panel p-5 md:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-raised text-accent"><ImageIcon size={18}/></span><div><h2 className="text-sm font-medium">New generation</h2><p className="text-xs text-faint">Higgsfield · Seedream v4 · 16:9 · 2K</p></div></div><label htmlFor="image-prompt" className="sr-only">Image prompt</label><textarea id="image-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} placeholder="Describe the image you want to create…" className="w-full resize-none rounded-xl border border-line bg-canvas p-4 text-sm outline-none placeholder:text-faint focus:border-focus"/><div className="mt-4 flex items-center justify-between"><span className="text-xs text-faint">Requires HF_KEY or an encrypted Higgsfield credential.</span><button onClick={generate} disabled={!prompt.trim() || busy} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink disabled:opacity-40">{busy ? 'Submitting…' : 'Generate'}<ArrowUpRight size={14}/></button></div>{error && <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{error}</p>}{result && <div className="mt-4 rounded-lg border border-focus/50 bg-overlay p-4 text-xs text-muted">Job submitted. Request ID: <code className="text-accent">{result.requestId}</code><br/><span className="text-faint">Poll the job status before displaying the final asset.</span></div>}</section></div></main>;
}
