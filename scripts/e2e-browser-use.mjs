import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP_PORT = 3005;
const FIXTURE_PORT = 4100;
const MODEL_PORT = 4010;
const CDP_PORT = 9223;

const children = [];
const servers = [];

function log(message) {
  process.stdout.write('[browser-e2e] ' + message + '\n');
}

function fail(message, detail) {
  const suffix = detail ? '\n' + String(detail) : '';
  throw new Error(message + suffix);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs = 30_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return response;
      lastError = new Error('HTTP ' + response.status + ' from ' + url);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  fail('Timed out waiting for ' + url, lastError);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      servers.push(server);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function findChrome() {
  const explicit = process.env.CHROME_BIN?.trim();
  if (explicit && existsSync(explicit)) return explicit;

  const candidates =
    process.platform === 'win32'
      ? [
          process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
          process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
          ];

  const found = candidates.filter(Boolean).find((candidate) => existsSync(candidate));
  if (!found) {
    fail('Chrome/Chromium was not found. Set CHROME_BIN to a browser executable.');
  }
  return found;
}

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  children.push(child);
  child.stdout?.on('data', (chunk) => process.stdout.write('[child] ' + chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write('[child] ' + chunk));
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(3000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function startFixtureServer() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>ScaleOS Browser E2E Fixture</title>
    <style>
      body { font-family: sans-serif; padding: 48px; }
      input, button { display: block; margin: 12px 0; padding: 10px; }
    </style>
  </head>
  <body>
    <h1>ScaleOS Browser E2E Fixture</h1>
    <label for="demo-input">Demo input</label>
    <input id="demo-input" type="text" placeholder="Type test value" />
    <button id="reveal" type="button">Reveal result</button>
    <div id="result">Result: waiting</div>
    <script>
      document.getElementById('reveal').addEventListener('click', () => {
        const value = document.getElementById('demo-input').value;
        document.getElementById('result').textContent = 'Result: ' + value;
      });
    </script>
  </body>
</html>`;

  return createServer((request, response) => {
    if (request.url === '/' || request.url?.startsWith('/fixture')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
}

function startMockModelServer() {
  let callCount = 0;
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || '{}');
    const userMessage = body.messages?.findLast?.((message) => message.role === 'user')?.content ?? '';
    let parsed = {};
    try {
      parsed = JSON.parse(userMessage);
    } catch {
      parsed = {};
    }

    const actionsByCall = [
      { actions: [{ type: 'fill', ref: 's0', text: 'ScaleOS E2E' }] },
      { actions: [{ type: 'click', ref: 's1' }] },
      { actions: [{ type: 'extract' }] },
      { actions: [{ type: 'done', summary: 'Browser E2E completed with a real Chrome session.' }] },
    ];

    const decision = actionsByCall[Math.min(callCount, actionsByCall.length - 1)];
    callCount += 1;

    if (!String(parsed?.objective ?? '').includes('ScaleOS E2E')) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Unexpected E2E objective.' } }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-browser-e2e',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'e2e-model',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(decision),
            },
          },
        ],
      }),
    );
  });
}

async function main() {
  const chrome = findChrome();
  const profileDir = mkdtempSync(path.join(tmpdir(), 'scaleos-browser-e2e-'));

  try {
    const fixtureServer = startFixtureServer();
    const modelServer = startMockModelServer();
    await listen(fixtureServer, FIXTURE_PORT);
    await listen(modelServer, MODEL_PORT);
    log('fixture and deterministic model provider started');

    const chromeChild = spawnChild(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--remote-allow-origins=*',
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profileDir,
        'about:blank',
      ],
      { env: process.env },
    );

    chromeChild.once('exit', (code) => {
      if (code && code !== 0) process.stderr.write('[browser-e2e] Chrome exited with ' + code + '\n');
    });

    await waitFor('http://127.0.0.1:' + CDP_PORT + '/json/version', 20_000);
    log('real Chrome CDP endpoint is reachable');

    const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
    const appChild = spawnChild(
      process.execPath,
      [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(APP_PORT)],
      {
        env: {
          ...process.env,
          BROWSER_CDP_URL: 'http://127.0.0.1:' + CDP_PORT,
          SCALEOS_BROWSER_ALLOW_PRIVATE: 'true',
          OPENAI_API_KEY: 'scaleos-e2e-key',
          OPENAI_BASE_URL: 'http://127.0.0.1:' + MODEL_PORT + '/v1',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    );

    appChild.once('exit', (code) => {
      if (code && code !== 0) process.stderr.write('[browser-e2e] Next dev exited with ' + code + '\n');
    });

    await waitFor('http://127.0.0.1:' + APP_PORT + '/computer', 45_000);
    log('ScaleOS dev server is ready');

    const statusResponse = await fetch('http://127.0.0.1:' + APP_PORT + '/api/computer/status');
    const statusBody = await statusResponse.json();
    if (!statusResponse.ok || statusBody?.data?.browser?.reachable !== true) {
      fail('ScaleOS could not probe the real Chrome CDP endpoint.', JSON.stringify(statusBody));
    }
    log('ScaleOS browser readiness probe passed');

    const runResponse = await fetch(
      'http://127.0.0.1:' + APP_PORT + '/api/computer/browser/run',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          objective: 'ScaleOS E2E: fill the demo input, reveal the result, extract the page, then finish.',
          startUrl: 'http://127.0.0.1:' + FIXTURE_PORT + '/fixture',
          modelId: 'openai:e2e-model',
          maxActions: 8,
          includeScreenshot: true,
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );

    const runBody = await runResponse.json().catch(() => null);
    if (!runResponse.ok) {
      fail('Browser Use API returned HTTP ' + runResponse.status, JSON.stringify(runBody));
    }

    const result = runBody?.data;
    if (!result) fail('Browser Use API did not return a result.', JSON.stringify(runBody));
    if (result.status !== 'completed') fail('Browser run did not complete.', JSON.stringify(result));
    if (!String(result.finalUrl ?? '').includes('127.0.0.1:' + FIXTURE_PORT)) {
      fail('Browser finished on the wrong URL.', result.finalUrl);
    }

    const actionTypes = (result.actions ?? []).map((entry) => entry.action?.type);
    for (const expected of ['fill', 'click', 'extract', 'done']) {
      if (!actionTypes.includes(expected)) {
        fail('Browser trace is missing action: ' + expected, JSON.stringify(actionTypes));
      }
    }

    if (!(result.extracted ?? []).some((value) => String(value).includes('Result: ScaleOS E2E'))) {
      fail('Real DOM result was not extracted after the click.', JSON.stringify(result.extracted));
    }

    if (!String(result.screenshotDataUrl ?? '').startsWith('data:image/jpeg;base64,')) {
      fail('Browser run did not return screenshot evidence.');
    }

    if (!String(result.summary ?? '').includes('Browser E2E completed')) {
      fail('Browser run did not return the deterministic completion summary.', result.summary);
    }

    log('PASS: real Chrome navigation + fill + click + extract + screenshot all verified');
  } finally {
    for (const child of [...children].reverse()) {
      await stopChild(child);
    }
    for (const server of [...servers].reverse()) {
      await closeServer(server).catch(() => {});
    }
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write('[browser-e2e] FAIL\n' + (error?.stack ?? String(error)) + '\n');
  process.exitCode = 1;
});
