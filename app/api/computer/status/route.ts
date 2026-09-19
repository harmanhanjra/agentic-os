import { randomUUID } from 'node:crypto';
import { probeCdpBrowser } from '@/lib/computer/cdp';
import { computerWorkerConfigured } from '@/lib/computer/worker';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET() {
  const requestId = randomUUID();
  const endpoint = process.env.BROWSER_CDP_URL?.trim();
  const browserConfigured = Boolean(endpoint);
  const browserReachable = endpoint ? await probeCdpBrowser(endpoint) : false;

  return Response.json(
    {
      data: {
        browser: {
          configured: browserConfigured,
          reachable: browserReachable,
          mode: 'cdp-dom-first',
        },
        computer: {
          configured: computerWorkerConfigured(),
          mode: 'permissioned-worker',
        },
        policy: {
          financial: false,
          destructive: false,
          externalCommunication: false,
          credentials: false,
          fileUpload: false,
        },
      },
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  );
}
