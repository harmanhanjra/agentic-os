import { RoutingRequestSchema, type AIModel, type RoutingDecision, type RoutingRequest } from './types';

const taskCapability: Record<RoutingRequest['taskType'], string[]> = {
  general: ['text'], coding: ['text', 'tools'], reasoning: ['text', 'reasoning'], writing: ['text'], research: ['text', 'tools'], vision: ['vision'], image_generation: ['image-generation'], structured_data: ['json'],
};

export function classifyTask(prompt: string): RoutingRequest['taskType'] {
  const value = prompt.toLowerCase();
  if (/\b(code|debug|typescript|python|api|function)\b/.test(value)) return 'coding';
  if (/\b(reason|prove|analy[sz]e|tradeoff)\b/.test(value)) return 'reasoning';
  if (/\b(image|illustration|logo|visual)\b/.test(value)) return 'image_generation';
  if (/\b(json|schema|csv|structured)\b/.test(value)) return 'structured_data';
  return 'general';
}

export function chooseModel(models: AIModel[], input: RoutingRequest): RoutingDecision {
  const request = RoutingRequestSchema.parse(input);
  const required = new Set([...request.requiredCapabilities, ...taskCapability[request.taskType]]);
  const candidates = models.filter((model) => model.enabled && [...required].every((capability) => model.capabilities.includes(capability as AIModel['capabilities'][number])) && (!request.estimatedInputTokens || !model.contextWindow || model.contextWindow >= request.estimatedInputTokens));
  if (candidates.length === 0) throw new Error('MODEL_UNAVAILABLE');
  const score = (model: AIModel) => {
    let value = model.local && request.preference === 'local' ? 5 : 0;
    if (request.preference === 'fast' && model.local) value += 2;
    if (request.preference === 'reasoning' && model.capabilities.includes('reasoning')) value += 4;
    if (request.preference === 'coding' && model.capabilities.includes('tools')) value += 4;
    if (request.preference === 'budget' && model.inputCost !== null && model.inputCost !== undefined) value += 2;
    return value + (model.supportsStreaming ? 1 : 0);
  };
  const sorted = [...candidates].sort((a, b) => score(b) - score(a));
  return { model: sorted[0], fallbackModels: sorted.slice(1), reasonCodes: [...required].map((capability) => `CAPABILITY_${capability.toUpperCase().replace('-', '_')}`) };
}
