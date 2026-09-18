import { z } from 'zod';

export const ModelCapabilitySchema = z.enum([
  'text', 'vision', 'reasoning', 'tools', 'json', 'embeddings',
  'image-generation', 'image-editing', 'audio-input', 'speech-generation', 'video-generation',
]);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const AIModelSchema = z.object({
  id: z.string(), providerId: z.string(), externalModelId: z.string(), displayName: z.string(),
  capabilities: z.array(ModelCapabilitySchema), contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(), inputCost: z.number().nonnegative().nullable().optional(),
  outputCost: z.number().nonnegative().nullable().optional(), supportsStreaming: z.boolean(),
  supportsTools: z.boolean(), enabled: z.boolean(), local: z.boolean(), metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AIModel = z.infer<typeof AIModelSchema>;

export const ProviderHealthSchema = z.object({ status: z.enum(['healthy', 'degraded', 'unavailable', 'not_tested']), checkedAt: z.string().datetime().optional(), message: z.string().optional() });
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export interface NormalizedModel extends AIModel {}
export interface ImageGenerationRequest { prompt: string; modelId: string; aspectRatio?: string; count?: number; }
export interface ImageGenerationResult { generationId: string; providerId: string; modelId: string; assets: Array<{ url: string; alt: string }>; }
export interface ProviderAdapter {
  id: string;
  testConnection(): Promise<ProviderHealth>;
  listModels(): Promise<NormalizedModel[]>;
  supports(capability: ModelCapability): boolean;
  generateText?: (model: AIModel, messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, signal?: AbortSignal) => Promise<AsyncIterable<string>>;
  generateImage?: (request: ImageGenerationRequest) => Promise<ImageGenerationResult>;
}

export const RoutingRequestSchema = z.object({
  taskType: z.enum(['general', 'coding', 'reasoning', 'writing', 'research', 'vision', 'image_generation', 'structured_data']),
  requiredCapabilities: z.array(ModelCapabilitySchema), preference: z.enum(['auto', 'fast', 'quality', 'budget', 'reasoning', 'coding', 'local', 'manual']),
  estimatedInputTokens: z.number().int().nonnegative().optional(),
});
export type RoutingRequest = z.infer<typeof RoutingRequestSchema>;
export interface RoutingDecision { model: AIModel; reasonCodes: string[]; fallbackModels: AIModel[]; }

export type ScaleOSErrorCode = 'INVALID_API_KEY' | 'RATE_LIMITED' | 'MODEL_NOT_FOUND' | 'MODEL_UNAVAILABLE' | 'CONTEXT_TOO_LARGE' | 'UNSUPPORTED_CAPABILITY' | 'NETWORK_ERROR' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'PROVIDER_NOT_CONFIGURED' | 'VALIDATION_ERROR' | 'CREDENTIAL_STORE_UNAVAILABLE' | 'UNKNOWN_ERROR';
export class ScaleOSError extends Error { constructor(public readonly code: ScaleOSErrorCode, message: string = code, public readonly requestId?: string) { super(message); this.name = 'ScaleOSError'; } }
