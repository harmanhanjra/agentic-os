import { spawn } from 'node:child_process';
import path from 'node:path';

const APP_PORT = 3006;
const WORKER_PORT = 8788;
const MODEL_PORT = 4011;
const TOKEN = 'scaleos-computer-e2e-token';

const children = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  process.stdout.write('[computer-e2e] ' + message + '\n');
}

function fail(message, detail) {
  throw new Error(message + (detail ? '\n' + String(detail) : ''));
}

async function waitFor(url, headers = {}, timeoutMs = 30_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return response;
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  fail('Timed out waiting for ' + url, lastError);
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
    sleep(2500),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function pythonBin() {
  return process.env.PYTHON_BIN?.trim() || (process.platform === 'win32' ? 'python' : 'python3');
}

async function startMockModel() {
  const { createServer } = await import('node:http');
  let call = 0;
  const decisions = [
    { actions: [{ type: 'click', target: 'Demo text field', x: 260, y: 195, button: 'left' }] },
    { actions: [{ type: 'type', target: 'Demo text field', text: 'ScaleOS Computer E2E' }] },
    { actions: [{ type: 'click', target: 'Demo Button', x: 200, y: 295, button: 'left' }] },
    { actions: [{ type: 'done', summary: 'Full Computer Use E2E completed.' }] },
  ];

  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || '{}');
    const hasImage = body.messages?.some(
      (message) =>
        Array.isArray(message.content) &&
        message.content.some((part) => part.type === 'image_url'),
    );
    if (!hasImage) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Computer E2E expected screenshot input.' } }));
      return;
    }

    const decision = decisions[Math.min(call, decisions.length - 1)];
    call += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-computer-e2e',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4.1-mini',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(decision) },
          },
        ],
      }),
    );
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(MODEL_PORT, '127.0.0.1', resolve);
  });
  return server;
}

async function main() {
  let modelServer;
  try {
    modelServer = await startMockModel();
    log('deterministic vision model provider started');

    spawnChild(
      pythonBin(),
      ['-m', 'uvicorn', 'computer_worker.main:app', '--host', '127.0.0.1', '--port', String(WORKER_PORT)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SCALEOS_COMPUTER_WORKER_MODE: 'virtual',
          SCALEOS_COMPUTER_WORKER_TOKEN: TOKEN,
        },
      },
    );

    await waitFor(
      'http://127.0.0.1:' + WORKER_PORT + '/health',
      { authorization: 'Bearer ' + TOKEN },
      30_000,
    );
    log('virtual computer worker is healthy');

    const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
    spawnChild(
      process.execPath,
      [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(APP_PORT)],
      {
        env: {
          ...process.env,
          SCALEOS_COMPUTER_WORKER_URL: 'http://127.0.0.1:' + WORKER_PORT,
          SCALEOS_COMPUTER_WORKER_TOKEN: TOKEN,
          SCALEOS_COMPUTER_ALLOW_PRIVATE: 'true',
          OPENAI_API_KEY: 'scaleos-computer-e2e-key',
          OPENAI_BASE_URL: 'http://127.0.0.1:' + MODEL_PORT + '/v1',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
    );

    await waitFor('http://127.0.0.1:' + APP_PORT + '/computer', {}, 45_000);
    log('ScaleOS is ready');

    const statusResponse = await fetch('http://127.0.0.1:' + APP_PORT + '/api/computer/status');
    const statusBody = await statusResponse.json();
    if (
      !statusResponse.ok ||
      statusBody?.data?.computer?.reachable !== true ||
      statusBody?.data?.computer?.healthy !== true
    ) {
      fail('Computer worker readiness did not pass.', JSON.stringify(statusBody));
    }

    const response = await fetch('http://127.0.0.1:' + APP_PORT + '/api/computer/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        objective: 'Use the virtual desktop field and button, then finish.',
        maxActions: 8,
        includeScreenshot: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      fail('Computer Use API returned HTTP ' + response.status, JSON.stringify(body));
    }

    const result = body?.data;
    if (!result) fail('Computer Use returned no result.', JSON.stringify(body));
    if (result.status !== 'completed') fail('Computer Use did not complete.', JSON.stringify(result));

    const actionTypes = (result.actions ?? []).map((entry) => entry.action?.type);
    for (const expected of ['click', 'type', 'done']) {
      if (!actionTypes.includes(expected)) {
        fail('Computer Use trace is missing ' + expected, JSON.stringify(actionTypes));
      }
    }

    if (
      !(result.actions ?? []).some(
        (entry) =>
          entry.action?.type === 'type' &&
          entry.action?.text === 'ScaleOS Computer E2E' &&
          entry.status === 'completed',
      )
    ) {
      fail('Computer Use did not execute the expected real worker typing action.');
    }

    if (!String(result.screenshotDataUrl ?? '').startsWith('data:image/jpeg;base64,')) {
      fail('Computer Use did not return final screenshot evidence.');
    }

    if (!String(result.summary ?? '').includes('Full Computer Use E2E completed')) {
      fail('Computer Use did not return completion summary.', result.summary);
    }

    log('PASS: vision screenshot + mouse/keyboard worker loop verified end-to-end');
  } finally {
    for (const child of [...children].reverse()) await stopChild(child);
    if (modelServer) {
      await new Promise((resolve) => modelServer.close(resolve));
    }
  }
}

main().catch((error) => {
  process.stderr.write('[computer-e2e] FAIL\n' + (error?.stack ?? String(error)) + '\n');
  process.exitCode = 1;
});
