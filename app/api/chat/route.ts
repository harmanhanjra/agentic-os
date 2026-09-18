import { NextRequest } from 'next/server';
import { z } from 'zod';
import { developmentModels } from '@/lib/ai/registry';
import { chooseModel, classifyTask } from '@/lib/ai/routing';

const RequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().min(1).max(100_000) })).min(1).max(100),
  modelId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid chat request' } }, { status: 422 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Connect a provider before starting a generation.' } }, { status: 503 });
  const selected = parsed.data.modelId ? developmentModels.find((model) => model.id === parsed.data.modelId) : chooseModel(developmentModels, { taskType: classifyTask(parsed.data.messages.at(-1)?.content ?? ''), requiredCapabilities: [], preference: 'auto' }).model;
  if (!selected || selected.providerId !== 'openai') return Response.json({ error: { code: 'MODEL_UNAVAILABLE', message: 'The selected model is not configured for this provider.' } }, { status: 503 });
  const upstream = await fetch(process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: selected.externalModelId, messages: parsed.data.messages, stream: true }), signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return Response.json({ error: { code: 'PROVIDER_ERROR', message: 'The provider could not start this generation.' } }, { status: 502 });
  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-scaleos-model': selected.id } });
}
