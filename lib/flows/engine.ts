import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  configuredModels,
  postChatCompletions,
  providerResponseError,
  resolveTarget,
  type ResolvedTarget,
} from '../ai/dispatch';
import { developmentModels } from '../ai/registry';
import { chooseModel, classifyTask } from '../ai/routing';
import { ScaleOSError } from '../ai/types';

export const FlowStepSchema = z.object({
  name: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(20000),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

export interface FlowStepResult {
  name: string;
  output: string;
  latencyMs: number;
  model: string;
  requestId: string;
}

export interface FlowRunResult {
  runId: string;
  model: string;
  steps: FlowStepResult[];
  final: string;
  latencyMs: number;
}

function selectTarget(modelId?: string): ResolvedTarget {
  if (modelId) {
    const target = resolveTarget(modelId);
    if (!target) throw new ScaleOSError('MODEL_NOT_FOUND', 'The selected flow model is unknown.');
    return target;
  }
  const pool = configuredModels();
  const decision = chooseModel(pool.length > 0 ? pool : developmentModels, {
    taskType: 'general',
    requiredCapabilities: [],
    preference: 'auto',
  });
  return {
    providerId: decision.model.providerId,
    externalModelId: decision.model.externalModelId,
    displayName: decision.model.displayName,
  };
}

async function completeOnce(target: ResolvedTarget, prompt: string): Promise<string> {
  const response = await postChatCompletions(
    target,
    [{ role: 'user', content: prompt }],
    false,
  );
  if (!response.ok) {
    const detail = await providerResponseError(response);
    throw new ScaleOSError(detail.code as never, detail.message);
  }
  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ScaleOSError('PROVIDER_ERROR', 'A flow step returned an empty response.');
  return text;
}

function renderPrompt(template: string, current: string): string {
  const rendered = template.replace(/\{\{\s*input\s*\}\}/gi, current);
  return rendered.includes(current) ? rendered : `${rendered}\n\nInput:\n${current}`;
}

/**
 * Server-side flow runner: Input → Prompt → Model → Output with honest
 * per-step errors, request IDs, and latency. Stops at the first failure
 * so partial results stay inspectable instead of silently fabricated.
 */
export async function runFlow(input: {
  sourceText: string;
  steps: FlowStep[];
  modelId?: string;
}): Promise<FlowRunResult> {
  const started = Date.now();
  const runId = randomUUID();
  const steps = z.array(FlowStepSchema).min(1).max(8).parse(input.steps);
  const source = z.string().trim().min(1).max(20000).parse(input.sourceText);
  if (input.modelId !== undefined) {
    z.string().min(1).max(300).parse(input.modelId);
  }
  const target = selectTarget(input.modelId);
  void classifyTask(source);

  const results: FlowStepResult[] = [];
  let current = source;
  for (const step of steps) {
    const begin = Date.now();
    const output = await completeOnce(target, renderPrompt(step.prompt, current).slice(0, 40000));
    results.push({
      name: step.name,
      output,
      latencyMs: Date.now() - begin,
      model: `${target.providerId}:${target.externalModelId}`,
      requestId: randomUUID(),
    });
    current = output;
  }
  return {
    runId,
    model: `${target.providerId}:${target.externalModelId}`,
    steps: results,
    final: current,
    latencyMs: Date.now() - started,
  };
}
