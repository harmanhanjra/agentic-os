import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultSkillDirs,
  detectInstalledSkills,
  envSkillDirs,
  parseSkillFrontmatter,
  scanSkillDirs,
} from '../lib/skills/scanner';
import { buildSkillContext } from '../lib/skills/context';

describe('skill auto-detection', () => {
  it('parses name and description from frontmatter', () => {
    const parsed = parseSkillFrontmatter(
      '---\nname: my-skill\ndescription: Does things well.\n---\n\n# Body',
    );
    expect(parsed).toEqual({ name: 'my-skill', description: 'Does things well.' });
  });

  it('strips quotes and returns null without a frontmatter block', () => {
    const parsed = parseSkillFrontmatter(
      '---\nname: "quoted"\ndescription: \'single\'\n---',
    );
    expect(parsed).toEqual({ name: 'quoted', description: 'single' });
    expect(parseSkillFrontmatter('# Just markdown, no frontmatter')).toBeNull();
  });

  it('scans directories, skipping hidden entries and folders without SKILL.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'scaleos-skills-'));
    try {
      const skillsDir = join(root, 'my-scope', 'skills');
      mkdirSync(join(skillsDir, 'alpha'), { recursive: true });
      mkdirSync(join(skillsDir, 'beta'), { recursive: true });
      mkdirSync(join(skillsDir, '.hidden', 'gamma'), { recursive: true });
      mkdirSync(join(skillsDir, 'plain'), { recursive: true });
      writeFileSync(
        join(skillsDir, 'alpha', 'SKILL.md'),
        '---\nname: alpha-skill\ndescription: Alpha does A.\n---\n',
      );
      writeFileSync(join(skillsDir, 'plain', 'SKILL.md'), '# No frontmatter here\n');
      const found = scanSkillDirs([skillsDir, join(root, 'does-not-exist')]);
      expect(found.map((s) => s.id).sort()).toEqual([
        'my-scope/alpha',
        'my-scope/plain',
      ]);
      expect(found.find((s) => s.id === 'my-scope/alpha')).toMatchObject({
        name: 'alpha-skill',
        description: 'Alpha does A.',
        source: 'my-scope',
      });
      // Falls back to the directory name when frontmatter is absent.
      expect(found.find((s) => s.id === 'my-scope/plain')?.name).toBe('plain');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads delimiter-separated env dirs and ships host defaults', () => {
    const prev = process.env.SCALEOS_SKILLS_DIRS;
    process.env.SCALEOS_SKILLS_DIRS = ['/tmp/a', '/tmp/b'].join(delimiter);
    try {
      expect(envSkillDirs()).toEqual(['/tmp/a', '/tmp/b']);
      expect(defaultSkillDirs().length).toBeGreaterThanOrEqual(3);
    } finally {
      if (prev === undefined) delete process.env.SCALEOS_SKILLS_DIRS;
      else process.env.SCALEOS_SKILLS_DIRS = prev;
    }
  });

  it('builds opt-out-aware context from the real machine', () => {
    const all = buildSkillContext([]);
    // This repo's dev machine has skills installed; CI may have none.
    const detected = detectInstalledSkills();
    if (detected.length === 0) {
      expect(all).toBeNull();
    } else {
      expect(all).toContain(detected[0].name);
      const excluded = buildSkillContext(detected.map((s) => s.id));
      expect(excluded).toBeNull();
    }
  });
});
