/**
 * Unified API envelope: every response carries `requestId` in the body
 * and in the `x-request-id` header. Keeps error shapes consistent so
 * the UI can render honest diagnostics instead of guessing.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
}

export function ok<T>(data: T, requestId: string, extraHeaders: Record<string, string> = {}) {
  return Response.json(
    { data, requestId },
    { headers: { 'x-request-id': requestId, ...extraHeaders } },
  );
}

export function fail(code: string, message: string, status: number, requestId: string, extraHeaders: Record<string, string> = {}) {
  const body: { error: ApiErrorBody; requestId: string } = {
    error: { code, message },
    requestId,
  };
  return Response.json(body, {
    status,
    headers: { 'x-request-id': requestId, ...extraHeaders },
  });
}

export function statusFor(code: string, fallback = 502): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 422;
    case 'RATE_LIMITED':
      return 429;
    case 'MODEL_NOT_FOUND':
      return 404;
    case 'MODEL_UNAVAILABLE':
    case 'PROVIDER_NOT_CONFIGURED':
    case 'BROWSER_NOT_REACHABLE':
    case 'CREDENTIAL_STORE_UNAVAILABLE':
      return 503;
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
    case 'PROVIDER_ERROR':
    case 'AGENT_RUN_FAILED':
    case 'BROWSER_RUN_FAILED':
    case 'FLOW_RUN_FAILED':
    case 'TOOL_RUN_FAILED':
      return 502;
    case 'APPROVAL_REQUIRED':
      return 403;
    case 'APPROVAL_DENIED':
    case 'APPROVAL_EXPIRED':
    case 'APPROVAL_INVALID':
      return 403;
    default:
      return fallback;
  }
}
