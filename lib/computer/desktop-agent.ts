import { randomUUID } from 'node:crypto';
import {
  configuredModels,
  postVisionChatCompletions,
  providerResponseError,
  resolveTarget,
  type ResolvedTarget,
} from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { evaluateComputerAction } from './desktop-policy';
import {
  ComputerDecisionSchema,
  type ComputerAction,
  type ComputerActionLog,
  type ComputerDecision,
  type ComputerRunResult,
  type ComputerWorkerState,
} from './types';
import {
  executeComputerWorkerActions,
  getComputerWorkerState,
  probeComputerWorker,
} from './worker';

export interface ComputerRunInput {
  objective: string;
  modelId?: string;
  maxActions: number;
  includeScreenshot: boolean;
}

function selectVisionTarget(modelId?: string): ResolvedTarget {
  const visionPool = configuredModels().filter((model) =>
    model.capabilities.includes('vision'),
  );

  if (modelId) {
    const selected = visionPool.find((model) => model.id === modelId);
    if (!selected) {
      throw new ScaleOSError(
        'MODEL_UNAVAILABLE',
        'Computer Use requires a configured registry model with vision capability.',
      );
    }
    const target = resolveTarget(selected.id);
    if (!target) throw new ScaleOSError('MODEL_NOT_FOUND', 'Unknown Computer Use model.');
    return target;
  }

  const preferred =
    visionPool.find((model) => model.providerId === 'openai' && model.externalModelId === 'gpt-4.1-mini') ??
    visionPool.find((model) => model.providerId === 'openai') ??
    visionPool[0];

  if (!preferred) {
    throw new ScaleOSError(
      'MODEL_UNAVAILABLE',
      'Connect a vision-capable model such as GPT-4.1, GPT-4.1 Mini, GPT-4o, or Llama 3.2 Vision before using full Computer Use.',
    );
  }

  const target = resolveTarget(preferred.id);
  if (!target) throw new ScaleOSError('MODEL_NOT_FOUND', 'Computer Use model could not be resolved.');
  return target;
}

export function parseComputerDecision(raw: string): ComputerDecision {
  const cleaned = raw
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Computer agent did not return valid JSON.');
  }
  return ComputerDecisionSchema.parse(parsed);
}

async function decide(
  target: ResolvedTarget,
  objective: string,
  state: ComputerWorkerState,
  history: ComputerActionLog[],
  remainingActions: number,
): Promise<ComputerDecision> {
  const recent = history.slice(-10).map((entry) => ({
    action: entry.action,
    status: entry.status,
    message: entry.message,
  }));

  const system = [
    'You are ScaleOS Computer Use, a precise visual desktop-control agent.',
    'Inspect the screenshot and return ONLY valid JSON: {"actions":[...],"note":"optional"}.',
    'Emit 1 to 3 actions per turn and use the fewest actions needed.',
    'Coordinates are absolute screenshot pixels with origin at the top-left.',
    'Every interactive action MUST include a short target description that matches what you can see.',
    'Allowed actions: move, click, double_click, right_click, drag, scroll, type, hotkey, press, wait, done.',
    'After an action likely to change the UI substantially, prefer ending the batch so a fresh screenshot is captured.',
    'Never attempt purchases/payments/transfers, destructive deletion, password/OTP entry, login/account changes, file upload/download, sending/publishing/posting, or other consequential external actions. If needed, return done and explain approval is required.',
    'Do not claim an action succeeded unless the next observation confirms it.',
  ].join(' ');

  const userText = JSON.stringify({
    objective,
    screen: {
      width: state.width,
      height: state.height,
      cursorX: state.cursorX,
      cursorY: state.cursorY,
      activeWindow: state.activeWindow ?? null,
    },
    remainingActions,
    recentActions: recent,
  });

  const response = await postVisionChatCompletions(
    target,
    system,
    userText,
    state.screenshotDataUrl,
  );

  if (!response.ok) {
    const detail = await providerResponseError(response);
    const code =
      detail.code === 'RATE_LIMITED'
        ? 'RATE_LIMITED'
        : detail.code === 'MODEL_NOT_FOUND'
          ? 'MODEL_NOT_FOUND'
          : detail.code === 'INVALID_API_KEY'
            ? 'INVALID_API_KEY'
            : 'PROVIDER_ERROR';
    throw new ScaleOSError(code, detail.message);
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ScaleOSError('PROVIDER_ERROR', 'Computer agent returned an empty response.');
  return parseComputerDecision(text);
}

function validateCoordinates(action: ComputerAction, state: ComputerWorkerState) {
  const points: Array<[number | undefined, number | undefined]> = [];
  switch (action.type) {
    case 'move':
    case 'click':
    case 'double_click':
    case 'right_click':
      points.push([action.x, action.y]);
      break;
    case 'drag':
      points.push([action.x, action.y], [action.x2, action.y2]);
      break;
    default:
      break;
  }
  for (const [x, y] of points) {
    if (
      x === undefined ||
      y === undefined ||
      x < 0 ||
      y < 0 ||
      x >= state.width ||
      y >= state.height
    ) {
      throw new Error('Computer action coordinates are outside the current screenshot.');
    }
  }
}

export async function runComputerAgent(input: ComputerRunInput): Promise<ComputerRunResult> {
  const started = Date.now();
  const runId = randomUUID();
  const target = selectVisionTarget(input.modelId);
  const health = await probeComputerWorker();
  if (!health.reachable || !health.health) {
    throw new ScaleOSError(
      'PROVIDER_NOT_CONFIGURED',
      'Computer worker is configured but not reachable. Start computer_worker.main and verify the token.',
    );
  }

  const actions: ComputerActionLog[] = [];
  let status: ComputerRunResult['status'] = 'max_actions';
  let summary = '';

  while (actions.length < input.maxActions) {
    const state = await getComputerWorkerState();
    const decision = await decide(
      target,
      input.objective,
      state,
      actions,
      input.maxActions - actions.length,
    );

    const batch: ComputerAction[] = [];
    let doneAction: Extract<ComputerAction, { type: 'done' }> | null = null;

    for (const action of decision.actions) {
      if (actions.length + batch.length >= input.maxActions) break;
      if (action.type === 'done') {
        doneAction = action;
        break;
      }

      validateCoordinates(action, state);
      const policy = evaluateComputerAction(action);
      if (!policy.allowed) {
        actions.push({
          index: actions.length,
          action,
          status: 'blocked',
          message: policy.reason,
        });
        status = 'blocked';
        summary =
          'Computer Use paused before a consequential action. This action class requires an approval checkpoint.';
        break;
      }
      batch.push(action);

      if (
        action.type === 'click' ||
        action.type === 'double_click' ||
        action.type === 'right_click' ||
        action.type === 'drag' ||
        action.type === 'hotkey' ||
        action.type === 'press'
      ) {
        break;
      }
    }

    if (status === 'blocked') break;

    if (batch.length > 0) {
      const workerResult = await executeComputerWorkerActions({
        frameId: state.frameId,
        actions: batch,
      });

      for (let i = 0; i < workerResult.results.length; i += 1) {
        const result = workerResult.results[i];
        const action = batch[i];
        if (!action) continue;
        actions.push({
          index: actions.length,
          action,
          status: result.status,
          message: result.message,
        });
        if (result.status !== 'completed') {
          status = result.status === 'blocked' ? 'blocked' : 'failed';
          summary = result.message;
          break;
        }
      }
    }

    if (status === 'blocked' || status === 'failed') break;

    if (doneAction) {
      actions.push({
        index: actions.length,
        action: doneAction,
        status: 'completed',
        message: 'Agent declared the desktop objective complete.',
      });
      status = 'completed';
      summary = doneAction.summary;
      break;
    }
  }

  const finalState = await getComputerWorkerState();
  if (!summary && status === 'max_actions') {
    summary = 'The Computer Use action budget was exhausted before the objective was verified complete.';
  }

  return {
    runId,
    status,
    objective: input.objective,
    model: target.providerId + ':' + target.externalModelId,
    summary,
    actions,
    screenshotDataUrl: input.includeScreenshot ? finalState.screenshotDataUrl : undefined,
    activeWindow: finalState.activeWindow ?? null,
    latencyMs: Date.now() - started,
  };
}
