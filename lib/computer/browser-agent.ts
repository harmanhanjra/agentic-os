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
import { CdpBrowser } from './cdp';
import { assertSafeBrowserUrl, evaluateBrowserAction } from './policy';
import {
  BrowserDecisionSchema,
  type BrowserAction,
  type BrowserActionLog,
  type BrowserDecision,
  type BrowserRunResult,
  type BrowserSnapshot,
} from './types';

export interface BrowserRunInput {
  objective: string;
  startUrl?: string;
  modelId?: string;
  maxActions: number;
  includeScreenshot: boolean;
}

function selectTarget(modelId?: string): ResolvedTarget {
  if (modelId) {
    const target = resolveTarget(modelId);
    if (!target) throw new ScaleOSError('MODEL_NOT_FOUND', 'Unknown browser-agent model.');
    return target;
  }

  const pool = configuredModels().filter((model) => model.capabilities.includes('text'));
  if (pool.length === 0) {
    throw new ScaleOSError(
      'MODEL_UNAVAILABLE',
      'Connect a text-capable provider before using Browser Use.',
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
  if (!text) throw new ScaleOSError('PROVIDER_ERROR', 'Browser agent returned an empty response.');
  return text;
}

export function parseBrowserDecision(raw: string): BrowserDecision {
  const cleaned = raw
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '');
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error('Browser agent did not return valid JSON.');
  }
  return BrowserDecisionSchema.parse(value);
}

function compactSnapshot(snapshot: BrowserSnapshot) {
  return {
    url: snapshot.url,
    title: snapshot.title,
    pageText: snapshot.pageText.slice(0, 9000),
    elements: snapshot.elements.slice(0, 100),
  };
}

async function decide(
  target: ResolvedTarget,
  objective: string,
  snapshot: BrowserSnapshot,
  history: BrowserActionLog[],
  remaining: number,
): Promise<BrowserDecision> {
  const recent = history.slice(-8).map((entry) => ({
    action: entry.action,
    status: entry.status,
    message: entry.message,
  }));

  const raw = await complete(target, [
    {
      role: 'system',
      content:
        'You are ScaleOS Browser Use. Control the browser with semantic DOM references, not guessed coordinates. Return ONLY JSON: {"actions":[...]}. You may emit at most 3 actions. Allowed actions are navigate(url), click(ref), fill(ref,text), press(key), scroll(deltaY), extract(optional ref), and done(summary). Prefer the smallest number of actions. Never request passwords, OTPs, payment details, purchases, account changes, destructive actions, messages/posts, uploads, or other consequential side effects. If the objective requires one, stop with done and explain that approval is required. Refs are valid only for the current snapshot. After a click that may navigate or mutate the page, do not include another ref-based action in the same batch.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        objective,
        remainingActions: remaining,
        page: compactSnapshot(snapshot),
        recentActions: recent,
      }),
    },
  ]);

  return parseBrowserDecision(raw);
}

async function executeAction(
  browser: CdpBrowser,
  action: BrowserAction,
  snapshot: BrowserSnapshot,
): Promise<{ message: string; extracted?: string; done?: string }> {
  const policy = evaluateBrowserAction(action, snapshot);
  if (!policy.allowed) {
    throw new Error('POLICY_BLOCKED:' + policy.risk + ':' + policy.reason);
  }

  if (action.type === 'navigate') {
    const url = await assertSafeBrowserUrl(action.url);
    await browser.navigate(url.toString());
    return { message: 'Navigated to ' + url.origin + url.pathname };
  }
  if (action.type === 'click') {
    await browser.click(action.ref);
    return { message: 'Clicked ' + action.ref };
  }
  if (action.type === 'fill') {
    await browser.fill(action.ref, action.text);
    return { message: 'Filled ' + action.ref };
  }
  if (action.type === 'press') {
    await browser.press(action.key);
    return { message: 'Pressed ' + action.key };
  }
  if (action.type === 'scroll') {
    await browser.scroll(action.deltaY);
    return { message: 'Scrolled ' + String(action.deltaY) + 'px' };
  }
  if (action.type === 'extract') {
    const extracted = await browser.extract(action.ref);
    return { message: 'Extracted page content.', extracted };
  }
  return { message: 'Task complete.', done: action.summary };
}

export async function runBrowserAgent(input: BrowserRunInput): Promise<BrowserRunResult> {
  const endpoint = process.env.BROWSER_CDP_URL?.trim();
  if (!endpoint) {
    throw new ScaleOSError(
      'PROVIDER_NOT_CONFIGURED',
      'Browser Use requires BROWSER_CDP_URL pointing to a Chrome DevTools Protocol endpoint.',
    );
  }

  const started = Date.now();
  const runId = randomUUID();
  const target = selectTarget(input.modelId);
  const actions: BrowserActionLog[] = [];
  const extracted: string[] = [];
  let browser: CdpBrowser | null = null;
  let summary = '';
  let status: BrowserRunResult['status'] = 'max_actions';

  try {
    browser = await CdpBrowser.connect(endpoint);
    if (input.startUrl) {
      const start = await assertSafeBrowserUrl(input.startUrl);
      await browser.navigate(start.toString());
    }

    while (actions.length < input.maxActions) {
      const snapshot = await browser.snapshot();
      const decision = await decide(
        target,
        input.objective,
        snapshot,
        actions,
        input.maxActions - actions.length,
      );

      let refreshSnapshot = snapshot;
      for (const action of decision.actions) {
        if (actions.length >= input.maxActions) break;
        const index = actions.length;
        try {
          const result = await executeAction(browser, action, refreshSnapshot);
          const after = action.type === 'done' ? refreshSnapshot : await browser.snapshot();
          actions.push({
            index,
            action,
            status: 'completed',
            message: result.message,
            url: after.url,
            title: after.title,
          });
          if (result.extracted) extracted.push(result.extracted);
          if (result.done) {
            summary = result.done;
            status = 'completed';
            break;
          }
          refreshSnapshot = after;

          if (action.type === 'click' || action.type === 'navigate') break;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Browser action failed.';
          const blocked = message.startsWith('POLICY_BLOCKED:');
          actions.push({
            index,
            action,
            status: blocked ? 'blocked' : 'failed',
            message: blocked ? message.split(':').slice(2).join(':') : message,
            url: refreshSnapshot.url,
            title: refreshSnapshot.title,
          });
          status = blocked ? 'blocked' : 'failed';
          summary = blocked
            ? 'The run stopped before a consequential action. The permission kernel must approve this class of action.'
            : 'The browser action failed before the objective was completed.';
          break;
        }
      }

      if (status === 'completed' || status === 'blocked' || status === 'failed') break;
    }

    const finalSnapshot = await browser.snapshot();
    const screenshotDataUrl = input.includeScreenshot ? await browser.screenshot() : undefined;
    if (!summary && status === 'max_actions') {
      summary = 'The action budget was exhausted before the agent declared the objective complete.';
    }

    return {
      runId,
      status,
      objective: input.objective,
      model: target.providerId + ':' + target.externalModelId,
      finalUrl: finalSnapshot.url,
      finalTitle: finalSnapshot.title,
      summary,
      actions,
      extracted,
      screenshotDataUrl,
      latencyMs: Date.now() - started,
    };
  } finally {
    await browser?.close();
  }
}
