import { detectInstalledSkills, type DetectedSkill } from './scanner';

const CACHE_TTL_MS = 60_000;
const MAX_SKILLS = 40;
const MAX_CHARS = 6_000;

let cache: { at: number; skills: DetectedSkill[] } | null = null;

function cachedSkills(): DetectedSkill[] {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_TTL_MS) {
    cache = { at: now, skills: detectInstalledSkills() };
  }
  return cache.skills;
}

/**
 * Build a system-context block listing the machine's installed skills so
 * the model knows which specialized capabilities exist. Returns null
 * when there is nothing to report. Skill ids in `excluded` (opted out
 * in the Skills page) are omitted.
 */
export function buildSkillContext(excluded: string[] = []): string | null {
  const blocked = new Set(excluded);
  const visible = cachedSkills()
    .filter((s) => !blocked.has(s.id))
    .slice(0, MAX_SKILLS);
  if (visible.length === 0) return null;
  const lines = visible.map((s) =>
    `- ${s.name}: ${(s.description || 'no description').slice(0, 220)}`,
  );
  const body = lines.join('\n').slice(0, MAX_CHARS);
  return [
    'Agent skills installed on this machine (invoke the relevant one when the task matches; never claim an uninstalled skill):',
    body,
  ].join('\n');
}
