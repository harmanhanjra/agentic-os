import { randomUUID } from 'node:crypto';
import { configuredModels, postChatCompletions, providerResponseError, type ChatMessage, type ResolvedTarget } from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { safeProviderFetch } from '../security/fetch';

export interface ReActStep {
  thought: string;
  action?: string;
  actionInput?: string;
  observation?: string;
}

export interface ReActResult {
  runId: string;
  steps: ReActStep[];
  answer: string;
  model: string;
  latencyMs: number;
}

const REACT_SYSTEM = `You are a reasoning agent that solves problems step-by-step using the Thought/Action/Observation pattern.

For each step:
1. THOUGHT: Reason about what to do next
2. ACTION: Choose a tool to use (or "finish" if done)
3. ACTION_INPUT: The input for the tool

Available tools:
- calculate: Evaluate math. Input: a math expression
- web_search: Search the web. Input: search query
- read_url: Read a webpage. Input: URL
- current_time: Get current date/time. Input: none
- finish: Return the final answer. Input: the answer

Respond ONLY in this exact format for each step:
Thought: [your reasoning]
Action: [tool name]
Action Input: [input]

When done:
Thought: I now have the final answer
Action: finish
Action Input: [final answer]

Never deviate from this format.`;

async function getAvailableTarget(): Promise<ResolvedTarget> {
  const pool = configuredModels().filter((m) => m.capabilities.includes('text'));
  if (pool.length === 0) throw new ScaleOSError('MODEL_UNAVAILABLE', 'No text models available.');

  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  let ollamaModels = new Set<string>();
  if (baseUrl) {
    try {
      const res = await safeProviderFetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) }, true);
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { models?: Array<{ name: string }> };
        ollamaModels = new Set(body?.models?.map((m) => m.name) ?? []);
      }
    } catch { /* ignore */ }
  }

  const luna = pool.find((m) => m.providerId === 'experiential' && m.externalModelId === 'gpt-5.6-luna');
  if (luna) return { providerId: luna.providerId, externalModelId: luna.externalModelId, displayName: luna.displayName };

  const nvidia = pool.find((m) => m.providerId === 'nvidia');
  if (nvidia) return { providerId: nvidia.providerId, externalModelId: nvidia.externalModelId, displayName: nvidia.displayName };

  const ollama = pool.find((m) => m.providerId === 'ollama' && ollamaModels.has(m.externalModelId));
  if (ollama) return { providerId: ollama.providerId, externalModelId: ollama.externalModelId, displayName: ollama.displayName };

  return { providerId: pool[0].providerId, externalModelId: pool[0].externalModelId, displayName: pool[0].displayName };
}

function executeTool(action: string, input: string): string {
  switch (action) {
    case 'calculate':
      try {
        const fn = new Function(`return (${input.replace(/[^0-9+\-*/().%\s]/g, '')})`);
        return String(fn());
      } catch { return 'Calculation error: invalid expression'; }
    case 'current_time':
      return new Date().toISOString();
    case 'web_search':
      return `[Search results for "${input}" would appear here — connect a search API]`;
    case 'read_url':
      return `[Content from ${input} would appear here — connect a fetch API]`;
    case 'finish':
      return input;
    default:
      return `Unknown tool: ${action}`;
  }
}

function parseReactStep(text: string): { step: ReActStep; done: boolean } {
  const thought = text.match(/Thought:\s*(.+?)(?=\n|$)/i)?.[1]?.trim() ?? '';
  const action = text.match(/Action:\s*(.+?)(?=\n|$)/i)?.[1]?.trim();
  const actionInput = text.match(/Action Input:\s*(.+?)(?=\n|$)/i)?.[1]?.trim();
  const done = action?.toLowerCase() === 'finish';
  return { step: { thought, action, actionInput }, done };
}

export async function runReActAgent(
  question: string,
  opts: { maxSteps?: number; signal?: AbortSignal } = {},
): Promise<ReActResult> {
  const started = Date.now();
  const runId = randomUUID();
  const maxSteps = opts.maxSteps ?? 8;
  const target = await getAvailableTarget();
  const steps: ReActStep[] = [];

  const history: ChatMessage[] = [
    { role: 'system', content: REACT_SYSTEM },
    { role: 'user', content: question },
  ];

  for (let i = 0; i < maxSteps; i++) {
    if (opts.signal?.aborted) break;

    const response = await postChatCompletions(target, history, false);
    if (!response.ok) {
      const detail = await providerResponseError(response);
      throw new ScaleOSError(detail.code as never, detail.message);
    }
    const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) break;

    const { step, done } = parseReactStep(content);
    steps.push(step);

    if (done || !step.action) {
      return { runId, steps, answer: step.actionInput ?? content, model: `${target.providerId}:${target.externalModelId}`, latencyMs: Date.now() - started };
    }

    const observation = executeTool(step.action, step.actionInput ?? '');
    steps[steps.length - 1].observation = observation;
    history.push({ role: 'assistant', content });
    history.push({ role: 'user', content: `Observation: ${observation}` });
  }

  const lastStep = steps[steps.length - 1];
  return { runId, steps, answer: lastStep?.observation ?? lastStep?.thought ?? 'Reached max steps.', model: `${target.providerId}:${target.externalModelId}`, latencyMs: Date.now() - started };
}
