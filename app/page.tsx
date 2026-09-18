'use client';

import { useEffect, useState } from 'react';
import {
  Activity, ArrowUpRight, Bot, Boxes, Command, Image as ImageIcon, LayoutGrid,
  MessageSquare, Moon, Search, Settings2, Sparkles, Sun, Workflow, Zap,
} from 'lucide-react';

const navItems = [
  { label: 'Chat', icon: MessageSquare, active: true },
  { label: 'Arena', icon: LayoutGrid },
  { label: 'Image Studio', icon: ImageIcon },
  { label: 'Agents', icon: Bot, soon: true },
  { label: 'Flows', icon: Workflow, soon: true },
  { label: 'Files', icon: Boxes },
];

const models = [
  { name: 'Auto', detail: 'Best for this task', icon: Sparkles, accent: true },
  { name: 'Claude 3.7 Sonnet', detail: 'Anthropic · Reasoning', icon: Bot },
  { name: 'GPT-4.1', detail: 'OpenAI · General', icon: Zap },
  { name: 'Qwen 2.5 72B', detail: 'Local · Coding', icon: Activity },
];

export default function Home() {
  const [commandOpen, setCommandOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [selectedModel, setSelectedModel] = useState('Auto');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className={dark ? 'min-h-screen bg-[#0b0c0b] text-[#f5f5f0]' : 'min-h-screen bg-[#f5f5f0] text-[#161815]'}>
      <div className="flex min-h-screen">
        <aside className="hidden w-[224px] shrink-0 border-r border-[#252925] bg-[#101210] px-3 py-5 md:flex md:flex-col">
          <div className="mb-9 flex items-center gap-2 px-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#d6f36b] text-[#161815]"><Sparkles size={15} strokeWidth={2.5} /></div>
            <span className="text-[15px] font-semibold tracking-tight">ScaleOS <span className="text-[#92958f]">AI</span></span>
          </div>
          <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#626760]">Workspace</div>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navItems.map(({ label, icon: Icon, active, soon }) => (
              <button key={label} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${active ? 'bg-[#1c211b] text-[#d6f36b]' : 'text-[#92958f] hover:bg-[#171a17] hover:text-[#f5f5f0]'}`}>
                <Icon size={16} strokeWidth={1.8} /><span className="flex-1">{label}</span>{soon && <span className="text-[9px] uppercase tracking-wider text-[#626760]">Soon</span>}
              </button>
            ))}
          </nav>
          <div className="mt-7 mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-[#626760]">Control plane</div>
          <nav className="space-y-1">
            {[['Usage', Activity], ['Models', Boxes], ['Settings', Settings2]].map(([label, Icon]) => <button key={label as string} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-[#92958f] transition hover:bg-[#171a17] hover:text-[#f5f5f0]"><Icon size={16} strokeWidth={1.8} /><span>{label as string}</span></button>)}
          </nav>
          <div className="mt-auto rounded-xl border border-[#252925] bg-[#151815] p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-[11px] text-[#92958f]">Monthly usage</span><span className="text-[11px] text-[#d6f36b]">$0.00</span></div>
            <div className="h-1 overflow-hidden rounded-full bg-[#292d29]"><div className="h-full w-[4%] rounded-full bg-[#d6f36b]" /></div>
            <div className="mt-2 text-[10px] text-[#626760]">Connect a provider to begin</div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[68px] items-center justify-between border-b border-[#252925] px-5 md:px-8">
            <div className="flex items-center gap-3 md:hidden"><div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#d6f36b] text-[#161815]"><Sparkles size={15} /></div><span className="text-sm font-semibold">ScaleOS</span></div>
            <button onClick={() => setCommandOpen(true)} className="hidden h-9 w-[250px] items-center gap-2 rounded-lg border border-[#252925] bg-[#101210] px-3 text-left text-xs text-[#626760] transition hover:border-[#3a4039] md:flex"><Search size={14} /><span>Search workspace</span><kbd className="ml-auto rounded border border-[#303530] px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button>
            <div className="ml-auto flex items-center gap-2"><button onClick={() => setDark(!dark)} aria-label="Toggle theme" className="rounded-lg p-2 text-[#92958f] hover:bg-[#171a17] hover:text-[#f5f5f0]">{dark ? <Sun size={16} /> : <Moon size={16} />}</button><button aria-label="Account menu" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a3028] text-xs font-medium text-[#d6f36b]">AR</button></div>
          </header>

          <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-5 py-10 md:px-10 md:py-14">
            <div className="mb-12"><p className="mb-3 text-xs font-medium uppercase tracking-[.18em] text-[#d6f36b]">Tuesday, June 17</p><h1 className="text-3xl font-medium tracking-[-.04em] md:text-4xl">Good morning, Alex.</h1><p className="mt-3 max-w-md text-sm leading-6 text-[#92958f]">Your intelligent workspace is ready. What would you like to create today?</p></div>
            <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
              <section className="rounded-2xl border border-[#303530] bg-[#111311] p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-medium">Start a conversation</h2><p className="mt-1 text-xs text-[#626760]">Ask anything or describe what you want to make.</p></div><MessageSquare size={18} className="text-[#626760]" /></div><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What can I help you with?" className="h-28 w-full resize-none rounded-xl border border-[#252925] bg-[#0b0c0b] p-4 text-sm text-[#f5f5f0] outline-none placeholder:text-[#626760] focus:border-[#667050]" /><div className="mt-4 flex items-center justify-between"><div className="flex gap-2"><button className="rounded-md border border-[#252925] px-2.5 py-1.5 text-[11px] text-[#92958f] hover:border-[#3a4039]">＋ Attach</button><button className="rounded-md border border-[#252925] px-2.5 py-1.5 text-[11px] text-[#92958f] hover:border-[#3a4039]">＋ Tools</button></div><button disabled={!prompt.trim()} className="flex items-center gap-2 rounded-lg bg-[#d6f36b] px-3.5 py-2 text-xs font-semibold text-[#161815] transition hover:bg-[#e0fa82] disabled:cursor-not-allowed disabled:opacity-40">Send <ArrowUpRight size={14} /></button></div></section>
              <section className="rounded-2xl border border-[#252925] bg-[#111311] p-5 md:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-medium">Choose a model</h2><p className="mt-1 text-xs text-[#626760]">Auto-routing is enabled.</p></div><Sparkles size={17} className="text-[#d6f36b]" /></div><div className="space-y-1.5">{models.map(({ name, detail, icon: Icon, accent }) => <button key={name} onClick={() => setSelectedModel(name)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${selectedModel === name ? 'border-[#667050] bg-[#1c211b]' : 'border-transparent hover:bg-[#171a17]'}`}><Icon size={15} className={accent ? 'text-[#d6f36b]' : 'text-[#92958f'} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{name}</span><span className="block truncate text-[10px] text-[#626760]">{detail}</span></span>{selectedModel === name && <span className="h-1.5 w-1.5 rounded-full bg-[#d6f36b]" />}</button>)}</div></section>
            </div>
            <div className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-medium">Explore your workspace</h2><button className="text-xs text-[#92958f] hover:text-[#d6f36b]">View all <ArrowUpRight className="ml-1 inline" size={12} /></button></div><div className="grid gap-3 sm:grid-cols-3">{[['Model Arena','Compare responses side by side','▦'],['Image Studio','Turn ideas into visuals','◌'],['Build an Agent','Create a focused AI helper','⌁']].map(([title, desc, symbol]) => <button key={title} className="group rounded-xl border border-[#252925] bg-[#101210] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#3a4039]"><div className="mb-7 text-xl text-[#d6f36b]">{symbol}</div><div className="text-xs font-medium">{title}</div><div className="mt-1 text-[11px] leading-5 text-[#626760]">{desc}</div><ArrowUpRight className="mt-3 text-[#626760] transition group-hover:text-[#d6f36b]" size={14} /></button>)}</div></div>
            <footer className="mt-auto flex flex-col gap-2 border-t border-[#252925] pt-8 text-[10px] text-[#626760] md:flex-row md:items-center md:justify-between"><span>ScaleOS AI · One workspace. Every AI model.</span><span>Selected: <span className="text-[#92958f]">{selectedModel}</span></span></footer>
          </div>
        </section>
      </div>
      {commandOpen && <div role="dialog" aria-modal="true" aria-label="Command palette" className="fixed inset-0 z-20 flex items-start justify-center bg-black/60 px-4 pt-[16vh]" onClick={() => setCommandOpen(false)}><div className="w-full max-w-lg overflow-hidden rounded-xl border border-[#3a4039] bg-[#151815] shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-center gap-3 border-b border-[#252925] px-4"><Command size={16} className="text-[#d6f36b]" /><input autoFocus aria-label="Search commands" placeholder="Search commands..." className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[#626760]" /></div><div className="p-2"><button onClick={() => setCommandOpen(false)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-[#1c211b]"><MessageSquare size={15} className="text-[#92958f]" />New conversation <kbd className="ml-auto text-[10px] text-[#626760]">↵</kbd></button><button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-[#1c211b]"><LayoutGrid size={15} className="text-[#92958f]" />Open Model Arena</button><button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-[#1c211b]"><ImageIcon size={15} className="text-[#92958f]" />Open Image Studio</button></div></div></div>}
    </main>
  );
}
