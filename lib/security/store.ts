import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  getProvider,
  getProviderAuth,
  providers,
  type ProviderAuth,
  type ProviderDef,
} from '../ai/providers';
import { ScaleOSError } from '../ai/types';
import { assertSafeProviderUrl } from './url';
import { decryptSecret, encryptSecret, maskSecret } from './crypto';

/**
 * Server-only local credential store. Provider keys are AES-256-GCM
 * encrypted with CREDENTIAL_ENCRYPTION_KEY and kept in a gitignored
 * JSON file — plaintext secrets never leave this module.
 *
 * Stored credentials take precedence over environment variables;
 * dispatch falls back to env when nothing is stored.
 */

const StoredCredentialSchema = z.object({
  providerId: z.string().min(1),
  encryptedKey: z.string().min(1),
  baseURL: z.string().url().optional(),
  updatedAt: z.string().datetime(),
});

const StoreFileSchema = z.object({
  version: z.literal(1),
  providers: z.array(StoredCredentialSchema),
});

export type CredentialSource = 'local' | 'env' | 'none';

export interface PublicCredential {
  providerId: string;
  source: CredentialSource;
  /** Masked shape only (e.g. "nva••••••XN"); null when unknown. */
  masked: string | null;
  baseURL: string | null;
  updatedAt: string | null;
}

function dataDir(): string {
  return process.env.SCALEOS_DATA_DIR ?? join(process.cwd(), 'data');
}

function storePath(): string {
  return join(dataDir(), 'providers.json');
}

function readStore(): z.infer<typeof StoreFileSchema> {
  let raw: string;
  try {
    raw = readFileSync(storePath(), 'utf8');
  } catch {
    return { version: 1, providers: [] };
  }
  const parsed = StoreFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error('[providers] stored credential file is invalid; ignoring it');
    return { version: 1, providers: [] };
  }
  return parsed.data;
}

function writeStore(store: z.infer<typeof StoreFileSchema>): void {
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(storePath(), JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch (err) {
    throw new ScaleOSError(
      'CREDENTIAL_STORE_UNAVAILABLE',
      'Could not persist the credential. Check server file permissions.',
    );
  }
}

function defaultBaseURL(def: ProviderDef): string {
  return (
    process.env[def.baseEnv]?.replace(/\/$/, '') ?? def.defaultBaseURL
  );
}

/** Decrypted local credential, or null when none is stored / unreadable. */
export function getStoredAuth(
  providerId: string,
): { apiKey: string; baseURL: string } | null {
  const entry = readStore().providers.find((p) => p.providerId === providerId);
  if (!entry) return null;
  const def = getProvider(providerId);
  if (!def) return null;
  try {
    return {
      apiKey: decryptSecret(entry.encryptedKey),
      baseURL: entry.baseURL ?? defaultBaseURL(def),
    };
  } catch {
    console.error(`[providers] stored credential for "${providerId}" is unreadable`);
    return null;
  }
}

/** Stored credential wins; otherwise environment; otherwise nothing. */
export function effectiveAuth(def: ProviderDef): {
  auth: ProviderAuth | null;
  source: CredentialSource;
} {
  const stored = getStoredAuth(def.id);
  if (stored) {
    return {
      auth: { baseURL: stored.baseURL, apiKey: stored.apiKey || null },
      source: 'local',
    };
  }
  const env = getProviderAuth(def);
  return { auth: env, source: env ? 'env' : 'none' };
}

export function isEffectivelyConfigured(def: ProviderDef): boolean {
  return effectiveAuth(def).auth !== null;
}

export function listPublicCredentials(): PublicCredential[] {
  return providers.map((def) => {
    const { auth, source } = effectiveAuth(def);
    let masked: string | null = null;
    if (source === 'local' && auth?.apiKey) masked = maskSecret(auth.apiKey);
    return {
      providerId: def.id,
      source,
      masked,
      baseURL: auth?.baseURL ?? null,
      updatedAt:
        readStore().providers.find((p) => p.providerId === def.id)?.updatedAt ??
        null,
    };
  });
}

export function saveProviderCredential(
  providerId: string,
  apiKey: string,
  baseURL?: string,
): PublicCredential {
  const def = getProvider(providerId);
  if (!def) throw new ScaleOSError('MODEL_NOT_FOUND', `Unknown provider "${providerId}"`);

  const key = apiKey.trim();
  if (key.length < 8 || key.length > 2000) {
    throw new ScaleOSError(
      'VALIDATION_ERROR',
      'That key looks incomplete — paste the full API key.',
    );
  }

  let normalizedBase: string | undefined;
  if (baseURL?.trim()) {
    try {
      normalizedBase = assertSafeProviderUrl(
        baseURL.trim(),
        def.local ? true : process.env.NODE_ENV !== 'production',
      ).toString().replace(/\/$/, '');
    } catch {
      throw new ScaleOSError(
        'VALIDATION_ERROR',
        'Base URL must be an http(s) URL without embedded credentials.',
      );
    }
  }

  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) {
    throw new ScaleOSError(
      'CREDENTIAL_STORE_UNAVAILABLE',
      'Set CREDENTIAL_ENCRYPTION_KEY before saving provider credentials.',
    );
  }

  const store = readStore();
  const entry = {
    providerId: def.id,
    encryptedKey: encryptSecret(key, secret),
    ...(normalizedBase ? { baseURL: normalizedBase } : {}),
    updatedAt: new Date().toISOString(),
  };
  const idx = store.providers.findIndex((p) => p.providerId === def.id);
  if (idx >= 0) store.providers[idx] = entry;
  else store.providers.push(entry);
  writeStore(store);

  return {
    providerId: def.id,
    source: 'local',
    masked: maskSecret(key),
    baseURL: normalizedBase ?? defaultBaseURL(def),
    updatedAt: entry.updatedAt,
  };
}

export function removeProviderCredential(providerId: string): boolean {
  const store = readStore();
  const before = store.providers.length;
  store.providers = store.providers.filter((p) => p.providerId !== providerId);
  if (store.providers.length === before) return false;
  writeStore(store);
  return true;
}
