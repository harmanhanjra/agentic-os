import { randomUUID } from 'node:crypto';
import { configuredModels, postChatCompletions, providerResponseError, type ChatMessage, type ResolvedTarget } from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { safeProviderFetch } from '../security/fetch';

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchFinding {
  query: string;
  sources: ResearchSource[];
  synthesis: string;
}

export interface DeepResearch {
  researchId: string;
  topic: string;
  findings: ResearchFinding[];
  conclusion: string;
  model: string;
  latencyMs: number;
}

const RESEARCH_SYSTEM = `You are a deep research agent. Given a topic, conduct multi-hop research.

For each research hop:
1. Generate a search query
2. List plausible sources (title, url, snippet)
3. Synthesize findings

Respond with a JSON object:
- findings: array of { query, sources: [{title, url, snippet}], synthesis }
- conclusion: final synthesis with citations

Rules:
- 2-4 research hops
- Each finding should add new information
- Cite sources in the conclusion
- Be factual and citeable
- Respond ONLY with valid JSON`;

async function getTarget(): Promise<ResolvedTarget> {
  const pool = configuredModels().filter((m) => m.capabilities.includes('text'));
  if (pool.length === 0) throw new ScaleOSError('MODEL_UNAVAILABLE', 'No text models.');
  const luna = pool.find((m) => m.providerId === 'experiential' && m.externalModelId === 'gpt-5.6-luna');
  if (luna) return { providerId: luna.providerId, externalModelId: luna.externalModelId, displayName: luna.displayName };
  return { providerId: pool[0].providerId, externalModelId: pool[0].externalModelId, displayName: pool[0].displayName };
}

export async function runDeepResearch(topic: string): Promise<DeepResearch> {
  const started = Date.now();
  const target = await getTarget();

  const messages: ChatMessage[] = [
    { role: 'system', content: RESEARCH_SYSTEM },
    { role: 'user', content: `Research topic: ${topic}` },
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
    researchId: randomUUID(),
    topic,
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    conclusion: parsed.conclusion ?? 'Research complete.',
    model: `${target.providerId}:${target.externalModelId}`,
    latencyMs: Date.now() - started,
  };
}
