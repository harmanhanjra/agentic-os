import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Local development may mutate the encrypted provider store directly.
 * Hosted production requires a server-admin token until workspace auth lands.
 */
export function requireProviderAdmin(request: NextRequest): Response | null {
  if (process.env.NODE_ENV !== 'production') return null;

  const expected = process.env.SCALEOS_ADMIN_TOKEN?.trim();
  if (!expected || expected.length < 24) {
    return Response.json(
      {
        error: {
          code: 'ADMIN_AUTH_REQUIRED',
          message:
            'Provider credential changes are disabled in hosted mode. Configure provider keys as server environment variables or set SCALEOS_ADMIN_TOKEN.',
        },
      },
      { status: 403 },
    );
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const candidate = bearer || request.headers.get('x-scaleos-admin-token')?.trim() || '';
  if (!candidate || !sameSecret(candidate, expected)) {
    return Response.json(
      {
        error: {
          code: 'ADMIN_AUTH_REQUIRED',
          message: 'A valid ScaleOS admin token is required for provider credential changes.',
        },
      },
      { status: 401 },
    );
  }

  return null;
}
