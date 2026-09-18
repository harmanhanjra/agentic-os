'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface DetectedSkill {
  id: string;
  name: string;
  description: string;
  source: string;
}

const DISABLED_KEY = 'scaleos-skills-disabled';

function readDisabled(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISABLED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Detected host skills + local opt-out state (persisted per browser). */
export function useSkills() {
  const [skills, setSkills] = useState<DetectedSkill[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [disabled, setDisabled] = useState<string[]>(() => readDisabled());

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetch('/api/skills')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.data) {
          setSkills(body.data.skills ?? []);
          setSources(body.data.sources ?? []);
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

  const toggle = useCallback((id: string) => {
    setDisabled((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      window.localStorage.setItem(DISABLED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const enabled = useMemo(
    () => skills.filter((s) => !disabled.includes(s.id)),
    [skills, disabled],
  );

  return { skills, enabled, disabled, sources, loading, failed, reload: load, toggle };
}
