import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Local skill auto-detection. ScaleOS scans well-known agent-skill
 * directories on the host machine and parses each `SKILL.md` frontmatter
 * (name + description). Nothing is uploaded anywhere — detection is
 * local filesystem reads only.
 */

export interface DetectedSkill {
  /** Stable id: "<scope>/<directory>", e.g. "agents/frontend-ui-engineering". */
  id: string;
  name: string;
  description: string;
  /** Which skill collection it came from: agents | claude | opencode | … */
  source: string;
  /** Absolute path of the SKILL.md file. */
  path: string;
}

export const SKILL_FILE = 'SKILL.md';
export const MAX_SKILLS = 300;
export const MAX_FILE_BYTES = 64 * 1024;

/** Extra directories from SCALEOS_SKILLS_DIRS (delimiter-separated). */
export function envSkillDirs(): string[] {
  const raw = process.env.SCALEOS_SKILLS_DIRS ?? '';
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Default host locations plus any env-configured extras, deduplicated. */
export function defaultSkillDirs(): string[] {
  const home = homedir();
  const defaults = [
    join(home, '.agents', 'skills'),
    join(home, '.claude', 'skills'),
    join(home, '.config', 'opencode', 'skills'),
  ];
  const seen = new Set<string>();
  return [...defaults, ...envSkillDirs()].filter((d) => {
    const key = d.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parse `name` and `description` from SKILL.md frontmatter.
 * Returns null when there is no frontmatter block at all.
 */
export function parseSkillFrontmatter(
  content: string,
): { name: string; description: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(':');
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = stripQuotes(line.slice(sep + 1));
    if (key && value && !(key in fields)) fields[key] = value;
  }
  return {
    name: fields.name ?? '',
    description: fields.description ?? '',
  };
}

function readSkillFile(file: string): string | null {
  try {
    if (statSync(file).size > MAX_FILE_BYTES) return null;
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Scan directories for installed skills. Never throws: unreadable
 * locations are skipped so one bad path cannot break detection.
 */
export function scanSkillDirs(dirs: string[]): DetectedSkill[] {
  const skills: DetectedSkill[] = [];
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const rawScope = basename(dirname(dir)) || basename(dir);
    // "~/.agents/skills" -> "agents", not ".agents".
    const scope = rawScope.replace(/^\./, '') || rawScope;
    for (const entry of entries) {
      if (skills.length >= MAX_SKILLS) break;
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const file = join(dir, entry.name, SKILL_FILE);
      if (!existsSync(file)) continue;
      const content = readSkillFile(file);
      if (content === null) continue;
      const frontmatter = parseSkillFrontmatter(content);
      const name = frontmatter?.name.trim() || entry.name;
      const description = (frontmatter?.description.trim() || '').slice(0, 500);
      skills.push({
        id: `${scope}/${entry.name}`,
        name,
        description,
        source: scope,
        path: file,
      });
    }
  }
  skills.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  return skills;
}

/** Scan the default host locations. */
export function detectInstalledSkills(): DetectedSkill[] {
  return scanSkillDirs(defaultSkillDirs());
}
