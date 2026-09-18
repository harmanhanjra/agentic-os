import { describe, expect, it } from 'vitest';
import { chooseModel, classifyTask } from '../lib/ai/routing';
import { developmentModels } from '../lib/ai/registry';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/security/crypto';
import { assertSafeProviderUrl } from '../lib/security/url';

describe('ScaleOS AI core', () => {
  it('classifies coding prompts and selects a capable model', () => { expect(classifyTask('debug this TypeScript function')).toBe('coding'); const decision = chooseModel(developmentModels, { taskType: 'coding', requiredCapabilities: [], preference: 'auto' }); expect(decision.model.capabilities).toContain('tools'); });
  it('encrypts credentials without round-tripping plaintext', () => { const encrypted = encryptSecret('sk-secret-123', 'test-secret'); expect(encrypted).not.toContain('sk-secret-123'); expect(decryptSecret(encrypted, 'test-secret')).toBe('sk-secret-123'); expect(maskSecret('sk-secret-123')).toContain('••'); });
  it('rejects private provider targets in hosted mode', () => { expect(() => assertSafeProviderUrl('http://127.0.0.1:11434', false)).toThrow(); expect(assertSafeProviderUrl('https://api.example.com/v1', false).hostname).toBe('api.example.com'); });
});
