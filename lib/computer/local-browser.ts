import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

function executableCandidates(): string[] {
  const configured = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (configured) return [configured];

  if (process.platform === 'win32') {
    return [
      join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['LOCALAPPDATA'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}

export async function findLocalBrowserExecutable(): Promise<string | null> {
  for (const candidate of executableCandidates()) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep checking known vendor locations.
    }
  }
  return null;
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

export interface LocalBrowserSession {
  endpoint: string;
  close(): Promise<void>;
}

/** Launch a disposable, headless browser bound only to loopback for local development. */
export async function launchLocalBrowser(): Promise<LocalBrowserSession> {
  const executable = await findLocalBrowserExecutable();
  if (!executable) throw new Error('No local Chrome, Chromium, or Edge executable was found.');

  const profile = await mkdtemp(join(tmpdir(), 'scaleos-browser-'));
  const port = await reserveLoopbackPort();
  const child: ChildProcess = spawn(/* turbopackIgnore: true */ executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let exited = false;
  let spawnError: Error | undefined;
  child.once('error', (error) => { spawnError = error; exited = true; });
  child.once('exit', () => { exited = true; });

  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (exited) throw new Error('The isolated browser exited during startup.');
      try {
        const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(800) });
        if (response.ok) {
          const version = await response.json() as { webSocketDebuggerUrl?: string };
          if (version.webSocketDebuggerUrl?.startsWith('ws://127.0.0.1:')) {
            return {
              endpoint,
              async close() {
                if (child.exitCode === null && child.signalCode === null) child.kill();
                if (child.exitCode === null && child.signalCode === null) {
                  await Promise.race([
                    new Promise<void>((resolve) => child.once('exit', () => resolve())),
                    delay(3000),
                  ]);
                }
                await rm(profile, { recursive: true, force: true }).catch(() => undefined);
              },
            };
          }
        }
      } catch {
        // Chrome may need a few moments to bind its loopback debugging port.
      }
      await delay(200);
    }
    throw new Error('The isolated browser did not expose its loopback DevTools endpoint in time.');
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
