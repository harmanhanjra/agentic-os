import type { NextRequest } from 'next/server';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'local';
}

export function checkRateLimit(
  request: NextRequest,
  namespace: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = namespace + ':' + clientKey(request);
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 10_000) {
    for (const [candidate, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(candidate);
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function rateLimitHeaders(result: {
  remaining: number;
  resetAt: number;
}): Record<string, string> {
  return {
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
