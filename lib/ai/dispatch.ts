import { assertSafeProviderUrl } from '../security/url';
import { safeProviderFetch } from '../security/fetch';
import { getProvider, getProviderAuth } from './providers';
import { developmentModels } from './registry';
import { ScaleOSError } from './types';
import { effectiveAuth, isEffectivelyConfigured } from '../security/store';

export interface ResolvedTarget {
  providerId: string;
  externalModelId: string;
  displayName: string;
}

export interface ImageGenerationRequest {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
}

export interface ImageGenerationResult {
  requestId: string;
  statusUrl: string;
  modelId: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Resolve a model id to a dispatchable target. Besides registry models,
 * `<provider>:<model-id>` passes through for OpenAI-compatible routers
 * (openai, nvidia, litellm, ollama), so every model your key unlocks is
 * addressable without waiting for a registry entry. Anthropic is excluded
 * because it needs a dedicated adapter.
 */
const PASSTHROUGH_PROVIDERS = new Set(['openai', 'nvidia', 'litellm', 'ollama']);

export function resolveTarget(modelId: string): ResolvedTarget | null {
  const found = developmentModels.find((m) => m.id === modelId);
  if (found && found.providerId !== 'higgsfield') {
    return {
      providerId: found.providerId,
      externalModelId: found.externalModelId,
      displayName: found.displayName,
    };
  }
  const sep = modelId.indexOf(':');
  if (sep > 0) {
    const providerId = modelId.slice(0, sep);
    const external = modelId.slice(sep + 1).trim();
    if (
      PASSTHROUGH_PROVIDERS.has(providerId) &&
      /^[A-Za-z0-9][\w:./-]{0,200}$/.test(external)
    ) {
      const def = getProvider(providerId);
      return {
        providerId,
        externalModelId: external,
        displayName: `${def?.displayName ?? providerId}: ${external}`,
      };
    }
  }
  return null;
}

/** Registry models whose provider can accept dispatches right now. */
export function configuredModels() {
  return developmentModels.filter((m) => {
    const def = getProvider(m.providerId);
    return def !== undefined && isEffectivelyConfigured(def);
  });
}

function endpointFor(providerId: string): {
  url: string;
  apiKey: string | null;
  allowLocal: boolean;
} {
  const def = getProvider(providerId);
  if (!def) throw new ScaleOSError('MODEL_NOT_FOUND', `Unknown provider "${providerId}"`);
  // Locally stored credentials win; environment variables are the fallback.
  const { auth } = effectiveAuth(def);
  if (!auth) {
    throw new ScaleOSError(
      'MODEL_UNAVAILABLE',
      def.kind === 'anthropic'
        ? 'The Anthropic adapter is not implemented yet — route this model via the LiteLLM gateway.'
        : `Provider "${def.displayName}" is not configured. ${def.setupHint}`,
    );
  }
  const url = `${auth.baseURL}/chat/completions`;
  // Local routers (Ollama) are allowed to stay on loopback; hosted
  // deployments still block private targets for remote providers.
  assertSafeProviderUrl(url, def.local ? true : process.env.NODE_ENV !== 'production');
  return { url, apiKey: auth.apiKey, allowLocal: def.local };
}

/**
 * POST an OpenAI-compatible chat-completions request to the target's
 * provider. Throws ScaleOSError with a machine-readable code.
 */
export async function postChatCompletions(
  target: ResolvedTarget,
  messages: ChatMessage[],
  stream: boolean,
): Promise<Response> {
  const { url, apiKey, allowLocal } = endpointFor(target.providerId);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  try {
    return await safeProviderFetch(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: target.externalModelId,
          messages,
          stream,
        }),
        signal: AbortSignal.timeout(120_000),
      },
      allowLocal,
    );
  } catch {
    throw new ScaleOSError('NETWORK_ERROR', 'Could not safely reach the provider.');
  }
}

export async function submitHiggsfieldImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const def = getProvider('higgsfield');
  if (!def) throw new ScaleOSError('MODEL_NOT_FOUND', 'Higgsfield provider is unavailable.');
  const { auth } = effectiveAuth(def);
  if (!auth?.apiKey) throw new ScaleOSError('MODEL_UNAVAILABLE', 'Higgsfield is not configured. Set HF_KEY or add it in Settings.');
  assertSafeProviderUrl(auth.baseURL, process.env.NODE_ENV !== 'production');
  let response: Response;
  try {
    response = await safeProviderFetch(
      auth.baseURL + '/' + request.modelId,
      {
        method: 'POST',
        headers: { authorization: 'Key ' + auth.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: request.prompt, ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}), ...(request.resolution ? { resolution: request.resolution } : {}) }),
        signal: AbortSignal.timeout(30_000),
      },
      false,
    );
  } catch {
    throw new ScaleOSError('NETWORK_ERROR', 'Could not safely reach Higgsfield.');
  }
  if (!response.ok) { const detail = await providerResponseError(response); throw new ScaleOSError(detail.code as never, detail.message); }
  const body = await response.json() as { request_id?: string; status_url?: string };
  if (!body.request_id || !body.status_url) throw new ScaleOSError('PROVIDER_ERROR', 'Higgsfield returned an unexpected job response.');
  return { requestId: body.request_id, statusUrl: body.status_url, modelId: request.modelId };
}

/** Convert provider failures into useful, secret-free diagnostics for the UI. */
export async function providerResponseError(response: Response): Promise<{
  code: string;
  message: string;
}> {
  const status = response.status;
  const body = await response.clone().json().catch(() => null) as {
    error?: { code?: string; message?: string; type?: string };
    message?: string;
  } | null;
  const providerMessage = body?.error?.message ?? body?.message;
  if (status === 401 || status === 403) {
    return { code: 'INVALID_API_KEY', message: 'The provider rejected the API key. Check that the key is valid for this endpoint.' };
  }
  if (status === 404) {
    return { code: 'MODEL_NOT_FOUND', message: providerMessage ?? 'The provider could not find this model or endpoint. Refresh the model id.' };
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'The provider rate-limited this request. Try again shortly.' };
  }
  return { code: body?.error?.code ?? 'PROVIDER_ERROR', message: providerMessage ? `Provider error (${status}): ${providerMessage.slice(0, 500)}` : `The provider returned HTTP ${status}.` };
}
