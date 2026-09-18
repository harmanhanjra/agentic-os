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

  // ---- NVIDIA NIM: verified working on 2026-09-18 via live chat probes ----
  // Each entry below returned a real completion through /api/chat.
  // Retired/unentitled ids (upstream 404), specialists (guards, translators,
  // embed, parse), and ids timing out past 120s (incl. kimi-k3) are out.
  // Anything else stays addressable ad-hoc as nvidia:<model-id>.
  nvidia('deepseek-v4-flash', 'deepseek-ai/deepseek-v4-flash-0731', 'DeepSeek V4 Flash', ['text'], 163_840),
  nvidia('llama-3.2-11b-vision', 'meta/llama-3.2-11b-vision-instruct', 'Llama 3.2 11B Vision', ['text', 'vision']),
  nvidia('nemotron-3-super', 'nvidia/nemotron-3-super-120b-a12b', 'Nemotron 3 Super 120B', ['text']),
  nvidia('nemotron-3-ultra', 'nvidia/nemotron-3-ultra-550b-a55b', 'Nemotron 3 Ultra 550B', ['text']),
  nvidia('nemotron-3.5-lightning', 'nvidia/nemotron-3.5-lightning-30b-a3b', 'Nemotron 3.5 Lightning', ['text']),
  nvidia('gpt-oss-20b', 'openai/gpt-oss-20b', 'GPT-OSS 20B', ['text']),
  nvidia('glm-5.3-flash', 'z-ai/glm-5.3-flash', 'GLM 5.3 Flash', ['text']),
  nvidia('gemma-4-31b', 'google/gemma-4-31b-it', 'Gemma 4 31B', ['text']),
  nvidia('mistral-nemotron', 'mistralai/mistral-nemotron', 'Mistral Nemotron', ['text']),
  nvidia('diffusiongemma-26b', 'google/diffusiongemma-26b-a4b-it', 'DiffusionGemma 26B', ['text']),
  nvidia('laguna-xs', 'poolside/laguna-xs-2.1', 'Laguna XS 2.1', ['text']),
  nvidia('ising-calibration', 'nvidia/ising-calibration-1.5-31b', 'Ising Calibration 31B', ['text']),

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
