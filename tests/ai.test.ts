import { describe, expect, it } from 'vitest';
import { chooseModel, classifyTask } from '../lib/ai/routing';
import { developmentModels } from '../lib/ai/registry';
import { getProvider, getProviderAuth, providers } from '../lib/ai/providers';
import { configuredModels, resolveTarget } from '../lib/ai/dispatch';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/security/crypto';
import { assertSafeProviderUrl } from '../lib/security/url';

describe('ScaleOS AI core', () => {
  it('classifies coding prompts and selects a capable model', () => { expect(classifyTask('debug this TypeScript function')).toBe('coding'); const decision = chooseModel(developmentModels, { taskType: 'coding', requiredCapabilities: [], preference: 'auto' }); expect(decision.model.capabilities).toContain('tools'); });
  it('encrypts credentials without round-tripping plaintext', () => { const encrypted = encryptSecret('sk-secret-123', 'test-secret'); expect(encrypted).not.toContain('sk-secret-123'); expect(decryptSecret(encrypted, 'test-secret')).toBe('sk-secret-123'); expect(maskSecret('sk-secret-123')).toContain('••'); });
  it('rejects private provider targets in hosted mode', () => { expect(() => assertSafeProviderUrl('http://127.0.0.1:11434', false)).toThrow(); expect(assertSafeProviderUrl('https://api.example.com/v1', false).hostname).toBe('api.example.com'); });

  it('registers every model against a known provider', () => {
    const ids = new Set(providers.map((p) => p.id));
    expect(ids).toContain('openai');
    expect(ids).toContain('nvidia');
    expect(ids).toContain('ollama');
    expect(ids).toContain('litellm');
    for (const model of developmentModels) {
      expect(ids.has(model.providerId), model.id).toBe(true);
    }
    expect(developmentModels.some((m) => m.providerId === 'nvidia')).toBe(true);
    expect(developmentModels.filter((m) => m.local).length).toBeGreaterThan(0);
  });

  it('resolves registry models and ad-hoc gateway models', () => {
    expect(resolveTarget('openai:gpt-4.1')).toMatchObject({ providerId: 'openai', externalModelId: 'gpt-4.1' });
    expect(resolveTarget('nvidia:deepseek-r1')).toMatchObject({ providerId: 'nvidia' });
    expect(resolveTarget('nvidia:moonshotai/kimi-k3')).toMatchObject({ providerId: 'nvidia', externalModelId: 'moonshotai/kimi-k3' });
    expect(resolveTarget('litellm:openrouter/my-model')).toMatchObject({ providerId: 'litellm', externalModelId: 'openrouter/my-model' });
    expect(resolveTarget('ollama:mistral')).toMatchObject({ providerId: 'ollama', externalModelId: 'mistral' });
    expect(resolveTarget('unknown:model')).toBeNull();
    expect(resolveTarget('anthropic:something-new')).toBeNull();
    expect(resolveTarget('litellm:')).toBeNull();
  });

  it('gates provider auth on server-side keys', () => {
    const prev = { ...process.env };
    try {
      delete process.env.OPENAI_API_KEY;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(getProviderAuth(getProvider('openai')!)).toBeNull();
      process.env.OPENAI_API_KEY = 'sk-test';
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(getProviderAuth(getProvider('openai')!)?.baseURL).toContain('http');
      expect(configuredModels().every((m) => m.providerId !== 'anthropic')).toBe(true);
    } finally {
      process.env = prev;
    }
  });
});
