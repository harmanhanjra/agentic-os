import { randomUUID } from 'node:crypto';
import { defaultSkillDirs, detectInstalledSkills } from '@/lib/skills/scanner';

/**
 * Local skill inventory. Detection is local filesystem reads only —
 * file paths stay server-side; the client receives ids, names,
 * descriptions, and source labels.
 */
export async function GET() {
  const requestId = randomUUID();
  const skills = detectInstalledSkills().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    source: s.source,
  }));
  const sources = [...new Set(skills.map((s) => s.source))].sort();
  return Response.json(
    {
      data: {
        skills,
        count: skills.length,
        sources,
        dirs: defaultSkillDirs(),
        scannedAt: new Date().toISOString(),
      },
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  );
}
