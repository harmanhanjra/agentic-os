/**
 * Provider catalog: the single contract describing every model router
 * ScaleOS can dispatch to. All providers except Anthropic speak an
 * OpenAI-compatible `/chat/completions` API.
 *
 * Configuration comes only from server-side environment variables —
 * nothing here ever carries a secret to the client.
 */

export type ProviderKind = 'openai-compatible' | 'anthropic' | 'media';

export interface ProviderDef {
  id: string;
  displayName: string;
  kind: ProviderKind;
  /** Env var holding the API key. Null when the provider needs no key. */
  keyEnv: string | null;
  /** Env var overriding the API base URL. */
  baseEnv: string;
  defaultBaseURL: string;
  /** True for routers that only make sense on this machine (Ollama). */
  local: boolean;
  /** Short honest hint shown in the UI when unconfigured. */
  setupHint: string;
}

export const providers: ProviderDef[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    kind: 'openai-compatible',
    keyEnv: 'OPENAI_API_KEY',
    baseEnv: 'OPENAI_BASE_URL',
    defaultBaseURL: 'https://api.openai.com/v1',
    local: false,
    setupHint: 'Set OPENAI_API_KEY server-side.',
  },
  {
    id: 'nvidia',
    displayName: 'NVIDIA NIM',
    kind: 'openai-compatible',
    keyEnv: 'NVIDIA_API_KEY',
    baseEnv: 'NVIDIA_BASE_URL',
    defaultBaseURL: 'https://integrate.api.nvidia.com/v1',
    local: false,
    setupHint: 'Set NVIDIA_API_KEY from build.nvidia.com. The default NIM endpoint is https://integrate.api.nvidia.com/v1.',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    kind: 'anthropic',
    keyEnv: 'ANTHROPIC_API_KEY',
    baseEnv: 'ANTHROPIC_BASE_URL',
    defaultBaseURL: 'https://api.anthropic.com',
    local: false,
    setupHint: 'Anthropic adapter ships next — route via the LiteLLM gateway meanwhile.',
  },
  {
    id: 'ollama',
    displayName: 'Ollama (local)',
    kind: 'openai-compatible',
    keyEnv: null,
    baseEnv: 'OLLAMA_BASE_URL',
    defaultBaseURL: 'http://localhost:11434/v1',
    local: true,
    setupHint: 'Run `ollama serve` and pull a model locally.',
  },
  {
    id: 'higgsfield',
    displayName: 'Higgsfield AI',
    kind: 'media',
    keyEnv: 'HF_KEY',
    baseEnv: 'HIGGSFIELD_BASE_URL',
    defaultBaseURL: 'https://api.higgsfield.ai',
    local: false,
    setupHint: 'Set HF_KEY to your Higgsfield API key or key:secret pair. Media generation uses the official Higgsfield API.',
  },
  {
    id: 'litellm',
    displayName: 'LiteLLM gateway',
    kind: 'openai-compatible',
    keyEnv: 'LITELLM_MASTER_KEY',
    baseEnv: 'LITELLM_BASE_URL',
    defaultBaseURL: 'http://localhost:4000/v1',
    local: false,
    setupHint: 'Point LITELLM_BASE_URL at your gateway for 100+ routers.',
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return providers.find((p) => p.id === id);
}

export interface ProviderAuth {
  baseURL: string;
  apiKey: string | null;
}

/**
 * Resolve connection details for a provider. Returns null when the
 * provider cannot serve requests right now (missing key, or Anthropic
 * whose dedicated adapter is not implemented yet).
 */
export function getProviderAuth(def: ProviderDef): ProviderAuth | null {
  if (def.kind === 'anthropic') return null;
  const apiKey = def.id === 'higgsfield'
    ? (process.env.HF_KEY || (process.env.HF_API_KEY && process.env.HF_API_SECRET ? `${process.env.HF_API_KEY}:${process.env.HF_API_SECRET}` : ''))
    : def.keyEnv ? (process.env[def.keyEnv] ?? '') : null;
  if (def.keyEnv && !apiKey) return null;
  const baseURL =
    process.env[def.baseEnv]?.replace(/\/$/, '') ?? def.defaultBaseURL;
  return { baseURL, apiKey: apiKey || null };
}

/** True when the provider has everything needed to accept dispatches. */
export function isProviderConfigured(def: ProviderDef): boolean {
  return getProviderAuth(def) !== null;
}
