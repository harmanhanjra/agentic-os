# ScaleOS Computer Worker

This service gives ScaleOS real desktop control without granting the Next.js process raw OS privileges.

## Capabilities

- screenshots
- mouse move/click/double-click/right-click
- drag and drop
- scrolling
- keyboard typing
- hotkeys
- individual key presses
- bounded waits
- worker-side policy checks
- bearer-token authentication
- real desktop mode and deterministic virtual mode for CI

## Windows quickstart

From the repository root:

```powershell
py -m venv .venv-computer
.\.venv-computer\Scripts\Activate.ps1
pip install -r computer_worker\requirements.txt
$env:SCALEOS_COMPUTER_WORKER_TOKEN="replace-with-a-long-random-token"
$env:SCALEOS_COMPUTER_WORKER_MODE="real"
python -m uvicorn computer_worker.main:app --host 127.0.0.1 --port 8787
```

In ScaleOS `.env.local`:

```env
SCALEOS_COMPUTER_WORKER_URL=http://127.0.0.1:8787
SCALEOS_COMPUTER_WORKER_TOKEN=replace-with-a-long-random-token
SCALEOS_COMPUTER_ALLOW_PRIVATE=true
```

Keep the worker bound to `127.0.0.1` for local use. Do not expose it directly to the public internet.

## PyAutoGUI fail-safe

Real mode keeps PyAutoGUI's fail-safe enabled. Moving the mouse to a screen corner aborts PyAutoGUI input if automation behaves unexpectedly.

## CI

CI uses `SCALEOS_COMPUTER_WORKER_MODE=virtual`. The virtual backend implements the same API without controlling the runner's desktop, allowing the orchestration and policy layers to be tested deterministically.
