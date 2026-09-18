import type { AIModel, ModelCapability } from './types';

export interface ModelFilter {
  capability?: ModelCapability;
  capabilities?: ModelCapability[];
  local?: boolean;
  enabled?: boolean;
  providerId?: string;
}

export class ModelRegistry {
  constructor(private readonly models: AIModel[]) {}
  list(filter: ModelFilter = {}): AIModel[] {
    return this.models.filter((model) => {
      if (filter.capability && !model.capabilities.includes(filter.capability))
        return false;
      if (
        filter.capabilities?.some(
          (capability) => !model.capabilities.includes(capability),
        )
      )
        return false;
      if (filter.local !== undefined && model.local !== filter.local)
        return false;
      if (filter.enabled !== undefined && model.enabled !== filter.enabled)
        return false;
      if (filter.providerId && model.providerId !== filter.providerId)
        return false;
      return true;
    });
  }
}

const openai = (
  id: string,
  externalModelId: string,
  displayName: string,
  capabilities: ModelCapability[],
  contextWindow: number,
): AIModel => ({
  id: `openai:${id}`,
  providerId: 'openai',
  externalModelId,
  displayName,
  capabilities,
  contextWindow,
  supportsStreaming: true,
  supportsTools: true,
  enabled: true,
  local: false,
});

const higgsfieldImage = (id: string, externalModelId: string, displayName: string): AIModel => ({
  id: `higgsfield:${id}`,
  providerId: 'higgsfield',
  externalModelId,
  displayName,
  capabilities: ['image-generation'],
  supportsStreaming: false,
  supportsTools: false,
  enabled: true,
  local: false,
});

const nvidia = (
  id: string,
  externalModelId: string,
  displayName: string,
  capabilities: ModelCapability[],
  contextWindow = 128_000,
): AIModel => ({
  id: `nvidia:${id}`,
  providerId: 'nvidia',
  externalModelId,
  displayName,
  capabilities,
  contextWindow,
  supportsStreaming: true,
  supportsTools: capabilities.includes('tools'),
  enabled: true,
  local: false,
});

export const developmentModels: AIModel[] = [
  // ---- OpenAI ----
  openai('gpt-4.1', 'gpt-4.1', 'GPT-4.1', ['text', 'vision', 'tools', 'json'], 1_048_576),
  openai('gpt-4.1-mini', 'gpt-4.1-mini', 'GPT-4.1 Mini', ['text', 'vision', 'tools', 'json'], 1_048_576),
  openai('gpt-4o', 'gpt-4o', 'GPT-4o', ['text', 'vision', 'tools', 'json'], 128_000),
  openai('gpt-4o-mini', 'gpt-4o-mini', 'GPT-4o Mini', ['text', 'tools', 'json'], 128_000),
  openai('o4-mini', 'o4-mini', 'o4-mini', ['text', 'reasoning'], 200_000),

  // ---- NVIDIA NIM (open models, OpenAI-compatible) ----
  nvidia('llama-3.2-90b-vision', 'meta/llama-3.2-90b-vision-instruct', 'Llama 3.2 90B Vision', ['text', 'vision']),
  nvidia('nemotron-70b', 'nvidia/llama-3.1-nemotron-70b-instruct', 'Nemotron 70B', ['text', 'reasoning', 'tools']),
  nvidia('deepseek-coder', 'deepseek-ai/deepseek-coder-6.7b-instruct', 'DeepSeek Coder', ['text', 'tools'], 16_384),
  nvidia('deepseek-v4-flash', 'deepseek-ai/deepseek-v4-flash-0731', 'DeepSeek V4 Flash', ['text', 'reasoning', 'tools'], 163_840),
  nvidia('mistral-large', 'mistralai/mistral-large', 'Mistral Large', ['text', 'tools', 'json']),
  nvidia('mixtral-8x22b', 'mistralai/mixtral-8x22b-v0.1', 'Mixtral 8x22B', ['text', 'tools'], 65_536),
  nvidia('gemma-3-27b', 'google/gemma-3-27b-it', 'Gemma 3 27B', ['text'], 128_000),
  nvidia('phi-3-medium', 'microsoft/phi-3-medium-128k-instruct', 'Phi-3 Medium', ['text']),
  nvidia('nemotron-4-340b', 'nvidia/nemotron-4-340b-instruct', 'Nemotron-4 340B', ['text', 'tools'], 4_096),
  nvidia('kimi-k3', 'moonshotai/kimi-k3', 'Kimi K3', ['text', 'vision', 'reasoning']),
  nvidia('kimi-k2.6', 'moonshotai/kimi-k2.6', 'Kimi K2.6', ['text', 'tools', 'json']),

  // ---- Higgsfield media applications (official API) ----
  higgsfieldImage('seedream-v4', 'bytedance/seedream/v4/text-to-image', 'Seedream v4'),

  // ---- Anthropic (dedicated adapter ships next; routable via LiteLLM gateway) ----
  {
    id: 'anthropic:claude-3-7-sonnet',
    providerId: 'anthropic',
    externalModelId: 'claude-3-7-sonnet',
    displayName: 'Claude 3.7 Sonnet',
    capabilities: ['text', 'vision', 'reasoning', 'tools'],
    contextWindow: 200_000,
    supportsStreaming: true,
    supportsTools: true,
    enabled: true,
    local: false,
  },

  // ---- Local Ollama (OpenAI-compatible at OLLAMA_BASE_URL) ----
  {
    id: 'ollama:qwen2.5',
    providerId: 'ollama',
    externalModelId: 'qwen2.5',
    displayName: 'Qwen 2.5 72B',
    capabilities: ['text', 'reasoning', 'tools', 'json'],
    contextWindow: 32_768,
    supportsStreaming: true,
    supportsTools: true,
    enabled: true,
    local: true,
  },
  {
    id: 'ollama:llama3.3',
    providerId: 'ollama',
    externalModelId: 'llama3.3',
    displayName: 'Llama 3.3 70B',
    capabilities: ['text', 'tools'],
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsTools: true,
    enabled: true,
    local: true,
  },
  {
    id: 'ollama:deepseek-r1',
    providerId: 'ollama',
    externalModelId: 'deepseek-r1',
    displayName: 'DeepSeek R1 (local)',
    capabilities: ['text', 'reasoning'],
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsTools: false,
    enabled: true,
    local: true,
  },
];
