'use client';

import { useCallback, useEffect, useState } from 'react';

export interface RegistryModel {
  id: string;
  displayName: string;
  providerId: string;
  capabilities: string[];
  local: boolean;
}

export interface RegistryProvider {
  id: string;
  displayName: string;
  local: boolean;
  configured: boolean;
  modelCount: number;
  hint: string | null;
}

const SELECTION_KEY = 'scaleos-model';
export const AUTO_ID = 'auto';

export function readSelectedModel(): string {
  if (typeof window === 'undefined') return AUTO_ID;
  return window.localStorage.getItem(SELECTION_KEY) ?? AUTO_ID;
}

export function writeSelectedModel(id: string) {
  window.localStorage.setItem(SELECTION_KEY, id);
}

/** Human label for any selection id, including ad-hoc gateway models. */
export function labelForSelection(
  selection: string,
  models: RegistryModel[],
): string {
  if (selection === AUTO_ID) return 'Auto';
  const found = models.find((m) => m.id === selection);
  if (found) return found.displayName;
  if (selection.startsWith('litellm:')) return selection.slice('litellm:'.length);
  return selection;
}

export function isModelReady(
  model: RegistryModel,
  providers: RegistryProvider[],
): boolean {
  return providers.find((p) => p.id === model.providerId)?.configured ?? false;
}

export function useRegistry() {
  const [models, setModels] = useState<RegistryModel[]>([]);
  const [providers, setProviders] = useState<RegistryProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.data) {
          setModels(body.data.models ?? []);
          setProviders(body.data.providers ?? []);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { models, providers, loading, failed, reload: load };
}
