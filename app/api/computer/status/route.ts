import { randomUUID } from 'node:crypto';
import { probeCdpBrowser } from '@/lib/computer/cdp';
import { computerWorkerConfigured, probeComputerWorker } from '@/lib/computer/worker';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET() {
  const requestId = randomUUID();
  const endpoint = process.env.BROWSER_CDP_URL?.trim();
  const browserConfigured = Boolean(endpoint);

  const [browserReachable, computerProbe] = await Promise.all([
    endpoint ? probeCdpBrowser(endpoint) : Promise.resolve(false),
    computerWorkerConfigured()
      ? probeComputerWorker()
      : Promise.resolve({ reachable: false as const }),
  ]);

  const computerHealth = 'health' in computerProbe ? computerProbe.health : undefined;

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
          reachable: computerProbe.reachable,
          healthy: computerHealth?.status === 'healthy',
          mode: computerHealth?.mode ?? 'vision-desktop-worker',
          platform: computerHealth?.platform ?? null,
          capabilities: computerHealth?.capabilities ?? [],
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
