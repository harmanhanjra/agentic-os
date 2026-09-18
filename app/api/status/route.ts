import { randomUUID } from 'node:crypto';
import { developmentModels } from '@/lib/ai/registry';
import { providers } from '@/lib/ai/providers';
import { effectiveAuth } from '@/lib/security/store';
import { assertSafeProviderUrl } from '@/lib/security/url';

/** Local routers report real reachability so "Ready" never misleads. */
async function ollamaReachable(): Promise<boolean> {
  const base = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1').replace(
    /\/$/,
    '',
  );
  const root = base.replace(/\/v1$/, '');
  try {
    const res = await fetch(`${root}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Workspace status without secrets: tells the UI which routers and
 * models are actually usable. Never exposes keys or connection strings.
 * Additive to the original shape ({ providerConfigured, modelCount }).
 */
export async function GET() {
  const requestId = randomUUID();
  const ollamaUp = await ollamaReachable();
  const providerStatus = providers.map((def) => {
    // Stored credentials and env both count; Ollama needs a live daemon.
    const { auth, source } = effectiveAuth(def);
    const configured = def.id === 'ollama' ? ollamaUp : auth !== null;
    if (auth && def.id !== 'ollama') {
      try { assertSafeProviderUrl(auth.baseURL, def.local || process.env.NODE_ENV !== 'production'); } catch { return { id: def.id, displayName: def.displayName, local: def.local, configured: false, source: 'none', modelCount: 0, hint: 'Provider URL is not allowed in the current deployment mode.' }; }
    }
    return {
      id: def.id,
      displayName: def.displayName,
      local: def.local,
      configured,
      source: auth ? source : 'none',
      modelCount: developmentModels.filter((m) => m.providerId === def.id).length,
      hint: configured ? null : def.setupHint,
    };
  });
  return Response.json(
    {
      data: {
        providerConfigured: providerStatus.some((p) => p.configured),
        modelCount: developmentModels.length,
        localModels: developmentModels
          .filter((m) => m.local)
          .map((m) => m.displayName),
        providers: providerStatus,
        models: developmentModels.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          providerId: m.providerId,
          capabilities: m.capabilities,
          local: m.local,
        })),
      },
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  );
}
