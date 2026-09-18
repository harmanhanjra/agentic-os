import { NextRequest } from 'next/server';
import { z } from 'zod';
import { developmentModels } from '@/lib/ai/registry';

const RequestSchema = z.object({ prompt: z.string().min(1).max(20_000), modelIds: z.array(z.string()).min(2).max(4) });
export async function POST(request: NextRequest) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Prompt and two to four models are required.' } }, { status: 422 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Connect a provider before starting an arena.' } }, { status: 503 });
  const models = parsed.data.modelIds.map((id) => developmentModels.find((model) => model.id === id)).filter((model): model is (typeof developmentModels)[number] => Boolean(model));
  const started = Date.now();
  const results = await Promise.allSettled(models.map(async (model) => { const begin = Date.now(); const response = await fetch(process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: model.externalModelId, messages: [{ role: 'user', content: parsed.data.prompt }], stream: false }), signal: AbortSignal.timeout(120_000) }); if (!response.ok) throw new Error('PROVIDER_ERROR'); const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; return { modelId: model.id, providerId: model.providerId, content: body.choices?.[0]?.message?.content ?? '', latencyMs: Date.now() - begin }; }));
  return Response.json({ data: results.map((result) => result.status === 'fulfilled' ? result.value : { error: 'MODEL_UNAVAILABLE' }), latencyMs: Date.now() - started });
}
