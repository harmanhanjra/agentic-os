# ScaleOS Computer + Browser Use

V0.3 introduces a permissioned execution layer for browser and desktop work.

## Browser Use

Browser Use connects to a Chrome DevTools Protocol endpoint through `BROWSER_CDP_URL`.
The driver is dependency-free and uses semantic DOM snapshots for the primary control loop:

1. capture page title, URL, readable text, and interactive elements;
2. assign short-lived semantic references such as `s0`, `s1`;
3. ask the selected ScaleOS model for at most three validated actions;
4. execute the smallest safe action batch;
5. refresh the DOM snapshot after navigation or DOM mutation;
6. capture a final screenshot as evidence.

This is intentionally designed to be faster and more token-efficient than screenshot-only control on ordinary websites.

## Full Computer Use

Full Computer Use now ships with a real Python worker in `computer_worker/`.
The Next.js control plane keeps the AI/model credentials and the worker only receives
narrowly scoped desktop actions.

The runtime loop is:

```text
objective
  -> capture desktop screenshot
  -> vision-capable model chooses bounded actions
  -> ScaleOS policy check
  -> worker executes mouse/keyboard action
  -> fresh screenshot
  -> verify / continue / finish
```

### Real worker capabilities

- full-screen screenshot capture;
- mouse movement;
- left/middle/right click;
- double click;
- drag and drop;
- vertical scrolling;
- text typing;
- keyboard hotkeys;
- individual key presses;
- bounded waits;
- authenticated health/state/action APIs;
- PyAutoGUI emergency corner fail-safe.

The worker intentionally exposes no shell or arbitrary command-execution endpoint.

### Windows activation

From the repository root:

```powershell
$env:SCALEOS_COMPUTER_WORKER_TOKEN="replace-with-a-long-random-token"
.\scripts\start-computer-worker.ps1
```

Then configure ScaleOS:

```env
SCALEOS_COMPUTER_WORKER_URL=http://127.0.0.1:8787
SCALEOS_COMPUTER_WORKER_TOKEN=replace-with-a-long-random-token
SCALEOS_COMPUTER_ALLOW_PRIVATE=true
```

Restart ScaleOS and open `/computer`.

A configured vision-capable registry model is required. ScaleOS currently prefers
GPT-4.1 Mini when available, then another configured OpenAI vision model, then any
other configured vision model in the registry.

### Worker API

`GET /health` reports worker mode, platform, and input capabilities.

`GET /v1/state` captures the current desktop and returns:

- frame ID;
- screenshot dimensions;
- current mouse coordinates;
- screenshot data URL;
- active-window field when available.

`POST /v1/actions` executes a validated batch of at most three desktop actions.
The request includes the frame ID and a restrictive policy object.

## Safety boundaries

The model is treated as untrusted input. Actions pass through both the ScaleOS policy
layer and a second worker-side policy layer.

Without an explicit approval system, ScaleOS stops before:

- purchases, payments, transfers, or withdrawals;
- destructive delete/account-close operations;
- passwords, OTPs, payment secrets, and authentication steps;
- file uploads/downloads;
- messages, posts, publishing, applications, and other external communications.

The upcoming permission kernel will turn those hard stops into explicit user approval checkpoints.

## Browser configuration

Use a Chrome/Chromium or hosted-browser endpoint exposing the Chrome DevTools Protocol:

```env
BROWSER_CDP_URL=wss://your-browser-provider.example/devtools/browser/...
```

For local development only:

```env
SCALEOS_BROWSER_ALLOW_PRIVATE=true
BROWSER_CDP_URL=http://127.0.0.1:9222
```

## End-to-end verification

Browser Use:

```bash
npm run test:e2e:browser
```

Full Computer Use:

```bash
npm run test:e2e:computer
```

The Computer Use E2E starts:

1. the real FastAPI worker in deterministic virtual-desktop mode;
2. a deterministic OpenAI-compatible vision-model stub;
3. the real ScaleOS Next.js application;
4. the real `/api/computer/run` endpoint.

It verifies worker health, screenshot input to the model, mouse/keyboard action execution,
fresh observations, final screenshot evidence, and completion traces.

CI uses virtual-desktop mode so it cannot manipulate the GitHub runner's real GUI. Local
`real` mode uses the exact same worker API and action executor backed by PyAutoGUI + MSS.

## Production notes

- keep the local worker bound to `127.0.0.1`;
- never expose the worker directly to the public internet;
- worker tokens and URLs stay server-side;
- private worker targets require the development-only `SCALEOS_COMPUTER_ALLOW_PRIVATE=true`;
- action budgets bound autonomy;
- browser and computer APIs are rate limited;
- production multi-user deployments still need workspace authentication and durable approval/audit storage.
