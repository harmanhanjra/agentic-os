import { randomUUID } from 'node:crypto';
import { configuredModels, postChatCompletions, providerResponseError, type ChatMessage, type ResolvedTarget } from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { safeProviderFetch } from '../security/fetch';

export interface DigestItem {
  category: string;
  headline: string;
  detail: string;
}

export interface MorningDigest {
  digestId: string;
  greeting: string;
  items: DigestItem[];
  summary: string;
  model: string;
  latencyMs: number;
}

const DIGEST_SYSTEM = `You are a morning briefing agent. Generate a concise daily digest.

Given context about the user's world, produce a JSON object with:
- greeting: a warm 1-sentence greeting mentioning the date
- items: array of 3-6 digest items, each with "category" (News/Weather/Health/Tech/Finance) and "headline" (short) and "detail" (1 sentence)
- summary: 1-2 sentence overall vibe for the day

Respond ONLY with valid JSON. Keep it under 200 words total. Spoken style — this will be read aloud.`;

async function getTarget(): Promise<ResolvedTarget> {
  const pool = configuredModels().filter((m) => m.capabilities.includes('text'));
  if (pool.length === 0) throw new ScaleOSError('MODEL_UNAVAILABLE', 'No text models.');
  const luna = pool.find((m) => m.providerId === 'experiential' && m.externalModelId === 'gpt-5.6-luna');
  if (luna) return { providerId: luna.providerId, externalModelId: luna.externalModelId, displayName: luna.displayName };
  return { providerId: pool[0].providerId, externalModelId: pool[0].externalModelId, displayName: pool[0].displayName };
}

export async function generateMorningDigest(context?: string): Promise<MorningDigest> {
  const started = Date.now();
  const target = await getTarget();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const messages: ChatMessage[] = [
    { role: 'system', content: DIGEST_SYSTEM },
    { role: 'user', content: `Today is ${today}. ${context ? `Context about the user: ${context}` : 'Generate a general morning briefing with news, weather, health tip, tech news, and a finance item.'}` },
  ];

  const response = await postChatCompletions(target, messages, false);
  if (!response.ok) {
    const detail = await providerResponseError(response);
    throw new ScaleOSError(detail.code as never, detail.message);
  }
  const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body?.choices?.[0]?.message?.content?.trim() ?? '{}';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  return {
    digestId: randomUUID(),
    greeting: parsed.greeting ?? `Good morning! Today is ${today}.`,
    items: Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [],
    summary: parsed.summary ?? 'Have a great day!',
    model: `${target.providerId}:${target.externalModelId}`,
    latencyMs: Date.now() - started,
  };
}
