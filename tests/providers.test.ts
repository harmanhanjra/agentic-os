import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getProvider } from '../lib/ai/providers';
import { developmentModels } from '../lib/ai/registry';
import { ScaleOSError } from '../lib/ai/types';
import {
  effectiveAuth,
  getStoredAuth,
  listPublicCredentials,
  removeProviderCredential,
  saveProviderCredential,
} from '../lib/security/store';

const DIR_KEY = 'SCALEOS_DATA_DIR';
const ENC_KEY = 'CREDENTIAL_ENCRYPTION_KEY';

describe('provider catalog', () => {
  it('uses current NVIDIA model identifiers', () => {
    expect(developmentModels.find((model) => model.id === 'nvidia:deepseek-v4-flash')?.externalModelId).toBe('deepseek-ai/deepseek-v4-flash-0731');
    expect(developmentModels.some((model) => model.externalModelId === 'meta/llama-3.3-70b-instruct')).toBe(false);
  });
  it('keeps Higgsfield as a media provider', () => {
    expect(getProvider('higgsfield')).toMatchObject({ kind: 'media', keyEnv: 'HF_KEY', defaultBaseURL: 'https://api.higgsfield.ai' });
  });
});

describe('local credential store', () => {
  let tmp = '';
  let prevDir: string | undefined;
  let prevEnc: string | undefined;
  let prevNvidia: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'scaleos-store-'));
    prevDir = process.env[DIR_KEY];
    prevEnc = process.env[ENC_KEY];
    prevNvidia = process.env.NVIDIA_API_KEY;
    process.env[DIR_KEY] = tmp;
    process.env[ENC_KEY] = 'test-encryption-secret';
    delete process.env.NVIDIA_API_KEY;
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env[DIR_KEY];
    else process.env[DIR_KEY] = prevDir;
    if (prevEnc === undefined) delete process.env[ENC_KEY];
    else process.env[ENC_KEY] = prevEnc;
    if (prevNvidia === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = prevNvidia;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('saves, masks, decrypts, and removes without leaking plaintext', () => {
    const saved = saveProviderCredential('nvidia', 'nvapi-test-key-1234567890');
    expect(saved.source).toBe('local');
    expect(saved.masked).not.toContain('nvapi-test-key-1234567890');
    expect(getStoredAuth('nvidia')?.apiKey).toBe('nvapi-test-key-1234567890');

    const listed = listPublicCredentials().find((c) => c.providerId === 'nvidia');
    expect(listed?.source).toBe('local');
    expect(JSON.stringify(listed)).not.toContain('nvapi-test-key-1234567890');

    expect(removeProviderCredential('nvidia')).toBe(true);
    expect(removeProviderCredential('nvidia')).toBe(false);
    expect(getStoredAuth('nvidia')).toBeNull();
  });

  it('prefers stored credentials over environment variables', () => {
    process.env.NVIDIA_API_KEY = 'nvapi-from-env-1234567890';
    const def = getProvider('nvidia')!;
    expect(effectiveAuth(def).source).toBe('env');
    saveProviderCredential('nvidia', 'nvapi-from-store-1234567890');
    const eff = effectiveAuth(def);
    expect(eff.source).toBe('local');
    expect(eff.auth?.apiKey).toBe('nvapi-from-store-1234567890');
  });

  it('rejects unknown providers, short keys, and missing encryption key', () => {
    expect(() => saveProviderCredential('nope', 'valid-length-key-123')).toThrowError(ScaleOSError);
    expect(() => saveProviderCredential('nvidia', 'short')).toThrowError(ScaleOSError);
    expect(() => saveProviderCredential('nvidia', 'valid-length-key-123', 'ftp://x')).toThrowError(
      ScaleOSError,
    );
    delete process.env[ENC_KEY];
    expect(() => saveProviderCredential('nvidia', 'valid-length-key-123')).toThrowError(
      ScaleOSError,
    );
  });
});
