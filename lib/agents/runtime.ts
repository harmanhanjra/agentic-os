import { randomUUID } from 'node:crypto';
import {
  configuredModels,
  postChatCompletions,
  providerResponseError,
  resolveTarget,
  type ChatMessage,
  type ResolvedTarget,
} from '../ai/dispatch';
import { chooseModel } from '../ai/routing';
import { ScaleOSError } from '../ai/types';

export interface AgentRunInput {
  objective: string;
  modelId?: string;
  maxSteps: number;
}

export interface AgentStepResult {
  index: number;
  instruction: string;
  output: string;
  latencyMs: number;
}

export interface AgentRunResult {
  runId: string;
  objective: string;
  model: string;
  plan: string[];
  steps: AgentStepResult[];
  final: string;
  latencyMs: number;
}

function selectTarget(modelId?: string): ResolvedTarget {
  if (modelId) {
    const target = resolveTarget(modelId);
    if (!target) {
      throw new ScaleOSError('MODEL_NOT_FOUND', 'The selected agent model is unknown.');
    }
    return target;
  }

  const pool = configuredModels().filter((model) => model.capabilities.includes('text'));
  if (pool.length === 0) {
    throw new ScaleOSError(
      'MODEL_UNAVAILABLE',
      'Connect at least one text-capable provider before running an agent.',
    );
  }

  const hasReasoning = pool.some((model) => model.capabilities.includes('reasoning'));
  const decision = chooseModel(pool, {
    taskType: hasReasoning ? 'reasoning' : 'general',
    requiredCapabilities: ['text'],
    preference: hasReasoning ? 'reasoning' : 'auto',
  });

  return {
    providerId: decision.model.providerId,
    externalModelId: decision.model.externalModelId,
    displayName: decision.model.displayName,
  };
}

async function complete(target: ResolvedTarget, messages: ChatMessage[]): Promise<string> {
  const response = await postChatCompletions(target, messages, false);
  if (!response.ok) {
    const detail = await providerResponseError(response);
    throw new ScaleOSError(detail.code as never, detail.message);
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new ScaleOSError('PROVIDER_ERROR', 'The agent model returned an empty response.');
  }
  return text;
}

export function parseAgentPlan(raw: string, maxSteps: number): string[] {
  const cleaned = raw
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '');

  try {
    const parsed = JSON.parse(cleaned) as { steps?: unknown };
    if (Array.isArray(parsed.steps)) {
      const steps = parsed.steps
        .filter((step): step is string => typeof step === 'string')
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, maxSteps);
      if (steps.length > 0) return steps;
    }
  } catch {
    // Fall through to a safe one-step plan.
  }

  return ['Complete the objective carefully and return the most useful result.'];
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const started = Date.now();
  const runId = randomUUID();
  const target = selectTarget(input.modelId);

  const planRaw = await complete(target, [
    {
      role: 'system',
      content:
        'You are the ScaleOS planner. Produce ONLY JSON with this shape: {"steps":["step 1","step 2"]}. Keep the plan concrete, non-destructive, and within the requested step budget. Do not claim to use tools or browse the web.',
    },
    {
      role: 'user',
      content:
        'Objective: ' + input.objective + '\nMaximum steps: ' + String(input.maxSteps),
    },
  ]);

  const plan = parseAgentPlan(planRaw, input.maxSteps);
  const steps: AgentStepResult[] = [];

  for (let index = 0; index < plan.length; index += 1) {
    const begin = Date.now();
    const prior = steps
      .map(
        (step) =>
          'Step ' +
          String(step.index + 1) +
          ': ' +
          step.instruction +
          '\nResult: ' +
          step.output.slice(0, 12_000),
      )
      .join('\n\n');

    const output = await complete(target, [
      {
        role: 'system',
        content:
          'You are the ScaleOS execution agent. Execute the current reasoning step using only the information in this run. No external tools are enabled in V0.2, so never pretend that you browsed, sent messages, changed files, or performed an external action.',
      },
      {
        role: 'user',
        content:
          'Objective: ' +
          input.objective +
          '\n\nCurrent step: ' +
          plan[index] +
          (prior ? '\n\nPrior completed work:\n' + prior : ''),
      },
    ]);

    steps.push({
      index,
      instruction: plan[index],
      output,
      latencyMs: Date.now() - begin,
    });
  }

  const evidence = steps
    .map(
      (step) =>
        'Step ' +
        String(step.index + 1) +
        ': ' +
        step.instruction +
        '\nResult: ' +
        step.output.slice(0, 16_000),
    )
    .join('\n\n');

  const final = await complete(target, [
    {
      role: 'system',
      content:
        'You are the ScaleOS synthesizer. Produce the final answer from the completed agent steps. Be concise, accurate, and transparent about limitations.',
    },
    {
      role: 'user',
      content: 'Objective: ' + input.objective + '\n\nCompleted work:\n' + evidence,
    },
  ]);

  return {
    runId,
    objective: input.objective,
    model: target.providerId + ':' + target.externalModelId,
    plan,
    steps,
    final,
    latencyMs: Date.now() - started,
  };
}
