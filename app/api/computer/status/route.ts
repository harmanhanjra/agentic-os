import { randomUUID } from 'node:crypto';
import { probeCdpBrowser } from '@/lib/computer/cdp';
import { computerWorkerConfigured } from '@/lib/computer/worker';
import { findLocalBrowserExecutable } from '@/lib/computer/local-browser';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET() {
  const requestId = randomUUID();
  const endpoint = process.env.BROWSER_CDP_URL?.trim();
  const browserConfigured = Boolean(endpoint);
  const browserReachable = endpoint ? await probeCdpBrowser(endpoint) : false;
  const localLaunchAvailable = process.env.NODE_ENV !== 'production'
    ? Boolean(await findLocalBrowserExecutable())
    : false;

  return Response.json(
    {
      data: {
        browser: {
          configured: browserConfigured,
          reachable: browserReachable,
          launchable: localLaunchAvailable,
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
