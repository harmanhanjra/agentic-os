import { randomUUID } from 'node:crypto';
import { configuredModels, postChatCompletions, providerResponseError, type ChatMessage, type ResolvedTarget } from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { safeProviderFetch } from '../security/fetch';

export interface SubTask {
  id: number;
  description: string;
  tool: 'chat' | 'browser_navigate' | 'browser_read' | 'browser_click' | 'calculate' | 'web_search' | 'code_execute';
  dependsOn?: number[];
}

export interface TaskPlan {
  planId: string;
  originalRequest: string;
  subtasks: SubTask[];
  model: string;
}

const PLANNER_SYSTEM = `You are a task planner. Break complex requests into sequential subtasks.

Respond with a JSON array of subtasks. Each subtask has:
- id: number (starting at 1)
- description: what to do
- tool: one of "chat", "browser_navigate", "browser_read", "browser_click", "calculate", "web_search", "code_execute"
- dependsOn: array of subtask IDs this depends on (optional)

Rules:
- Keep it to 1-6 subtasks
- Each subtask should be a single clear action
- Use "chat" for questions/explanations
- Use "browser_*" for web interactions
- Use "calculate" for math
- Use "web_search" for lookups
- Use "code_execute" for code tasks
- Respond ONLY with the JSON array, no other text`;

async function getTarget(): Promise<ResolvedTarget> {
  const pool = configuredModels().filter((m) => m.capabilities.includes('text'));
  if (pool.length === 0) throw new ScaleOSError('MODEL_UNAVAILABLE', 'No text models.');
  const luna = pool.find((m) => m.providerId === 'experiential' && m.externalModelId === 'gpt-5.6-luna');
  if (luna) return { providerId: luna.providerId, externalModelId: luna.externalModelId, displayName: luna.displayName };
  return { providerId: pool[0].providerId, externalModelId: pool[0].externalModelId, displayName: pool[0].displayName };
}

export async function planTask(request: string): Promise<TaskPlan> {
  const target = await getTarget();
  const messages: ChatMessage[] = [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content: request },
  ];

  const response = await postChatCompletions(target, messages, false);
  if (!response.ok) {
    const detail = await providerResponseError(response);
    throw new ScaleOSError(detail.code as never, detail.message);
  }
  const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body?.choices?.[0]?.message?.content?.trim() ?? '[]';

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const subtasks = jsonMatch ? (JSON.parse(jsonMatch[0]) as SubTask[]) : [{ id: 1, description: request, tool: 'chat' as const }];

  return { planId: randomUUID(), originalRequest: request, subtasks, model: `${target.providerId}:${target.externalModelId}` };
}
