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
Screenshots remain useful for final evidence and future visual fallback.

### Supported browser actions

- navigate to public HTTP(S) pages;
- click safe interactive elements;
- fill non-sensitive inputs;
- Tab/Escape/arrow-key navigation;
- scroll;
- extract page or element text;
- finish with a summary.

### Blocked in this slice

The runtime stops before financial transactions, destructive actions, account/authentication actions,
credential or payment entry, file uploads, and external communications such as sending/publishing.
Those actions are reserved for the V0.3 permission kernel and explicit human approval flow.

## CDP configuration

Use a Chrome/Chromium or hosted-browser endpoint exposing the Chrome DevTools Protocol.

```env
BROWSER_CDP_URL=wss://your-browser-provider.example/devtools/browser/...
```

For local development only, private/local targets may be enabled:

```env
SCALEOS_BROWSER_ALLOW_PRIVATE=true
BROWSER_CDP_URL=http://127.0.0.1:9222
```

Private-network browsing stays blocked in production to reduce SSRF exposure.

## Desktop Computer Use

Desktop Computer Use uses a separate isolated worker so the Next.js control plane does not receive
raw shell or OS privileges.

Configure:

```env
SCALEOS_COMPUTER_WORKER_URL=https://computer-worker.example
SCALEOS_COMPUTER_WORKER_TOKEN=...
```

ScaleOS sends `POST /v1/tasks/run` with an objective, action budget, request ID, and a restrictive policy.
The worker should run inside an isolated VM/container and return structured status, action logs,
summary, and optionally a screenshot data URL.

## Production notes

- browser and computer endpoints are server-side only;
- tokens and worker URLs are never returned to the UI;
- browser URLs are checked for private/reserved addresses;
- action schemas are validated with Zod;
- Browser Use and Computer Use are rate limited;
- action budgets bound autonomy;
- model output is treated as untrusted and policy checked before execution.

The next slice adds durable runs, approval checkpoints, signed permission grants, and audit logs.

## End-to-end verification

Run:

```bash
npm run test:e2e:browser
```

The harness starts an isolated real Chrome/Chromium process with CDP, a local deterministic
OpenAI-compatible model stub, a local HTML fixture, and a ScaleOS development server. It then
calls the real `/api/computer/browser/run` endpoint and verifies:

- ScaleOS can probe the Chrome CDP endpoint;
- Browser Use navigates a real page;
- the agent fills a real input;
- the agent clicks a real button;
- the page DOM changes as expected;
- Browser Use extracts the changed result;
- a final screenshot is returned;
- the action trace contains fill, click, extract, and done.

No external model API key or public internet access is required for this test. Set `CHROME_BIN`
when Chrome/Chromium is not in a standard system location.
