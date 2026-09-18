import type { AIModel, ModelCapability } from './types';

export interface ModelFilter { capability?: ModelCapability; capabilities?: ModelCapability[]; local?: boolean; enabled?: boolean; providerId?: string; }

export class ModelRegistry {
  constructor(private readonly models: AIModel[]) {}
  list(filter: ModelFilter = {}): AIModel[] {
    return this.models.filter((model) => {
      if (filter.capability && !model.capabilities.includes(filter.capability)) return false;
      if (filter.capabilities?.some((capability) => !model.capabilities.includes(capability))) return false;
      if (filter.local !== undefined && model.local !== filter.local) return false;
      if (filter.enabled !== undefined && model.enabled !== filter.enabled) return false;
      if (filter.providerId && model.providerId !== filter.providerId) return false;
      return true;
    });
  }
}

export const developmentModels: AIModel[] = [
  { id: 'openai:gpt-4.1', providerId: 'openai', externalModelId: 'gpt-4.1', displayName: 'GPT-4.1', capabilities: ['text', 'vision', 'tools', 'json'], contextWindow: 1048576, supportsStreaming: true, supportsTools: true, enabled: true, local: false },
  { id: 'anthropic:claude-3-7-sonnet', providerId: 'anthropic', externalModelId: 'claude-3-7-sonnet', displayName: 'Claude 3.7 Sonnet', capabilities: ['text', 'vision', 'reasoning', 'tools'], contextWindow: 200000, supportsStreaming: true, supportsTools: true, enabled: true, local: false },
  { id: 'ollama:qwen2.5', providerId: 'ollama', externalModelId: 'qwen2.5', displayName: 'Qwen 2.5 72B', capabilities: ['text', 'reasoning', 'tools', 'json'], contextWindow: 32768, supportsStreaming: true, supportsTools: true, enabled: true, local: true },
];
