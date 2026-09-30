import { randomUUID } from 'node:crypto';
import { CdpBrowser } from '../computer/cdp';
import { assertSafeBrowserUrl } from '../computer/policy';
import { configuredModels, postChatCompletions, providerResponseError, resolveTarget, type ChatMessage, type ResolvedTarget } from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { classifyVoiceCommand, type ClassifiedCommand } from './intent';
import { safeProviderFetch } from '../security/fetch';
import type { AgentType } from '../agents/index';

export interface VoiceCommandResult {
  requestId: string;
  intent: string;
  instruction: string;
  ok: boolean;
  spoken: string;
  detail: string;
  screenshotDataUrl?: string;
  latencyMs: number;
}

async function getOllamaModels(): Promise<Set<string>> {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  if (!baseUrl) return new Set();
  try {
    const res = await safeProviderFetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }, true);
    if (!res.ok) return new Set();
    const body = (await res.json().catch(() => null)) as { models?: Array<{ name: string }> };
    return new Set(body?.models?.map((m) => m.name) ?? []);
  } catch {
    return new Set();
  }
}

/**
 * Build a prioritized model list:
 * 1. GPT-5.6 Luna (experiential) — primary
 * 2. NVIDIA models — fast fallback
 * 3. Ollama models — local fallback (only if actually installed)
 */
async function buildModelChain(): Promise<ResolvedTarget[]> {
  const pool = configuredModels().filter((m) => m.capabilities.includes('text'));
  if (pool.length === 0) {
    throw new ScaleOSError('MODEL_UNAVAILABLE', 'Connect a text provider before using Naughty.');
  }

  const ollamaModels = await getOllamaModels();

  // Priority 1: GPT-5.6 Luna
  const luna = pool.find((m) => m.providerId === 'experiential' && m.externalModelId === 'gpt-5.6-luna');

  // Priority 2: NVIDIA models (fast/cheap first)
  const nvidiaPriority = ['deepseek-v4-flash', 'nemotron-3.5-lightning', 'gemma-4-31b', 'glm-5.3-flash', 'nemotron-3-super'];
  const nvidiaModels: ResolvedTarget[] = [];
  for (const id of nvidiaPriority) {
    const m = pool.find((p) => p.providerId === 'nvidia' && p.externalModelId.includes(id));
    if (m) nvidiaModels.push({ providerId: m.providerId, externalModelId: m.externalModelId, displayName: m.displayName });
  }
  // Add any remaining nvidia models not in the priority list
  for (const m of pool.filter((p) => p.providerId === 'nvidia' && !nvidiaModels.some((n) => n.externalModelId === p.externalModelId))) {
    nvidiaModels.push({ providerId: m.providerId, externalModelId: m.externalModelId, displayName: m.displayName });
  }

  // Priority 3: Ollama (only models actually installed)
  const ollamaModelsList: ResolvedTarget[] = [];
  for (const m of pool.filter((p) => p.providerId === 'ollama' && ollamaModels.has(p.externalModelId))) {
    ollamaModelsList.push({ providerId: m.providerId, externalModelId: m.externalModelId, displayName: m.displayName });
  }

  const chain: ResolvedTarget[] = [];
  if (luna) chain.push({ providerId: luna.providerId, externalModelId: luna.externalModelId, displayName: luna.displayName });
  chain.push(...nvidiaModels, ...ollamaModelsList);

  if (chain.length === 0) {
    throw new ScaleOSError('MODEL_UNAVAILABLE', 'No working text models found. Check your API keys or install an Ollama model.');
  }
  return chain;
}

async function chatReplyWithFallback(
  chain: ResolvedTarget[],
  history: Array<{ role: string; content: string }>,
  userText: string,
): Promise<{ reply: string; model: string }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are Naughty, a voice assistant. Keep replies under 60 words, spoken style, no markdown.' },
    ...history.slice(-6).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 3000) })),
    { role: 'user', content: userText },
  ];

  const errors: string[] = [];
  for (const target of chain) {
    try {
      const response = await postChatCompletions(target, messages, false);
      if (!response.ok) {
        const detail = await providerResponseError(response);
        errors.push(`${target.providerId}:${target.externalModelId} → ${detail.message}`);
        continue;
      }
      const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body?.choices?.[0]?.message?.content?.trim();
      if (content) {
        return { reply: content, model: `${target.providerId}:${target.externalModelId}` };
      }
      errors.push(`${target.providerId}:${target.externalModelId} → empty response`);
    } catch (err) {
      errors.push(`${target.providerId}:${target.externalModelId} → ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
  throw new ScaleOSError('MODEL_UNAVAILABLE', `All models failed: ${errors.slice(0, 3).join('; ')}`);
}

async function withBrowser<T>(fn: (browser: CdpBrowser) => Promise<T>): Promise<T> {
  const endpoint = process.env.BROWSER_CDP_URL?.trim();
  if (!endpoint) throw new ScaleOSError('PROVIDER_NOT_CONFIGURED', 'Browser Use requires BROWSER_CDP_URL.');
  const browser = await CdpBrowser.connect(endpoint);
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function executeBrowserCommand(cmd: ClassifiedCommand): Promise<{ spoken: string; detail: string; screenshot?: string }> {
  switch (cmd.intent) {
    case 'browser_navigate': {
      const url = cmd.url;
      if (!url) return { spoken: 'Where should I navigate? Give me a URL.', detail: 'No URL extracted.' };
      // Allow about:blank and other safe internal URLs without SSRF checks
      const isInternal = /^(about:|data:|javascript:|file:)/.test(url);
      const safe = isInternal ? new URL(url) : await assertSafeBrowserUrl(url);
      return withBrowser(async (b) => {
        await b.navigate(safe.toString());
        const snap = await b.snapshot();
        return { spoken: `Opened ${snap.title || safe.hostname || safe.protocol}.`, detail: `Navigated to ${safe.href}. Title: ${snap.title}` };
      });
    }
    case 'browser_click': {
      if (!cmd.ref) return { spoken: 'Which element should I click? Say a ref like s0 or describe the button.', detail: 'No ref provided.' };
      const ref = cmd.ref;
      return withBrowser(async (b) => {
        await b.click(ref);
        const snap = await b.snapshot();
        return { spoken: `Clicked ${ref}. Now on ${snap.title}.`, detail: `Clicked ref ${ref}. URL: ${snap.url}` };
      });
    }
    case 'browser_type': {
      if (!cmd.text) return { spoken: 'What should I type?', detail: 'No text provided.' };
      const text = cmd.text;
      const ref = cmd.ref;
      return withBrowser(async (b) => {
        if (ref) {
          await b.fill(ref, text);
          return { spoken: `Typed "${text.slice(0, 60)}" into ${ref}.`, detail: `Filled ${ref}.` };
        }
        for (const ch of text) await b.press(ch);
        return { spoken: `Typed "${text.slice(0, 60)}".`, detail: 'Typed text.' };
      });
    }
    case 'browser_scroll': {
      const delta = cmd.scroll === 'up' ? -500 : cmd.scroll === 'page_up' ? -1200 : cmd.scroll === 'page_down' ? 1200 : 500;
      return withBrowser(async (b) => {
        await b.scroll(delta);
        return { spoken: `Scrolled ${cmd.scroll ?? 'down'}.`, detail: `Scrolled ${delta}px.` };
      });
    }
    case 'browser_read': {
      return withBrowser(async (b) => {
        const text = await b.extract(cmd.ref);
        const trimmed = text.slice(0, 3000);
        const spoken = trimmed.length > 200 ? trimmed.slice(0, 200) + '... (truncated)' : trimmed;
        return { spoken: spoken || 'The page is empty.', detail: text.slice(0, 4000) };
      });
    }
    case 'browser_screenshot': {
      return withBrowser(async (b) => {
        const snap = await b.snapshot();
        const shot = await b.screenshot();
        return { spoken: `Screenshot captured. Page is: ${snap.title}.`, detail: `Screenshot of ${snap.url}`, screenshot: shot };
      });
    }
    case 'computer_hotkey': {
      if (!cmd.hotkey) return { spoken: 'Which key should I press?', detail: 'No hotkey.' };
      const hotkey = cmd.hotkey;
      return withBrowser(async (b) => {
        await b.press(hotkey);
        return { spoken: `Pressed ${hotkey}.`, detail: `Pressed key ${hotkey}.` };
      });
    }
    default:
      return { spoken: 'I am not sure what browser action to take.', detail: 'Unhandled browser intent.' };
  }
}

export async function executeVoiceCommand(
  rawText: string,
  history: Array<{ role: string; content: string }>,
): Promise<VoiceCommandResult> {
  const started = Date.now();
  const requestId = randomUUID();
  const cmd = classifyVoiceCommand(rawText);

  try {
    if (cmd.intent === 'chat') {
      const chain = await buildModelChain();
      const { reply, model } = await chatReplyWithFallback(chain, history, rawText);
      return { requestId, intent: cmd.intent, instruction: cmd.instruction, ok: true, spoken: reply, detail: `[${model}] ${reply}`, latencyMs: Date.now() - started };
    }

    // Agent intents
    if (cmd.intent.startsWith('agent_')) {
      const { runAgent } = await import('../agents/index');
      const agentType = cmd.intent.replace('agent_', '') as AgentType;
      const result = await runAgent({ agent: agentType, input: rawText });
      return {
        requestId,
        intent: cmd.intent,
        instruction: cmd.instruction,
        ok: true,
        spoken: result.output.slice(0, 500),
        detail: `[${result.model ?? 'agent'}] ${result.output}`,
        latencyMs: Date.now() - started,
      };
    }

    const result = await executeBrowserCommand(cmd);
    return {
      requestId,
      intent: cmd.intent,
      instruction: cmd.instruction,
      ok: true,
      spoken: result.spoken,
      detail: result.detail,
      screenshotDataUrl: result.screenshot,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed.';
    return {
      requestId,
      intent: cmd.intent,
      instruction: cmd.instruction,
      ok: false,
      spoken: `Sorry, ${message.slice(0, 150)}`,
      detail: message,
      latencyMs: Date.now() - started,
    };
  }
}
