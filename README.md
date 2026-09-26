# ScaleOS AI · V0.3 Alpha

> One workspace. Every AI model. Agents that can reason, browse, and operate computers through permissioned execution.

ScaleOS AI is a provider-agnostic AI operating workspace: connect hosted or
local models, chat with history and rich rendering, compare models side by
side, generate media, manage credentials, and let the workspace auto-detect
the agent skills installed on your machine. It never fabricates provider
output — unconfigured routers report honest errors with request IDs.

## Features

- **Workspace shell** — dark-first UI with light mode, sidebar navigation,
  mobile drawer, global search (`Ctrl/Cmd + K`), and loading / 404 states.
- **Chat** — streaming responses, conversation history with auto-save /
  resume / delete / auto-titles, safe markdown rendering (code blocks with
  copy, tables, quotes), copy / regenerate / retry per message, model +
  latency + request-ID footers, and a model switcher with live
  Ready / Needs-key state.
- **Agents** — bounded planner → executor → synthesizer runs with 1–5 steps, request IDs, rate limits, durable run history (`/api/runs`), and recent-runs UI.
- **Flows** — server-side Input → Prompt → Model → Output runner (`/api/flows/run`) with per-step results, usage metering, and run history.
- **Tools** — allowlisted local tool registry (`/api/tools`: web_fetch, calculator, datetime, text_stats) with SSRF-safe fetch, no code execution, and an audit log.
- **Usage metering** — every chat/arena/agent/browser/computer/flow/image/tool call is recorded locally and summarized in Settings (`/api/usage`).
- **Browser Use V0.3 alpha** — autonomous DOM-first web operation through Chrome DevTools Protocol, semantic element references, action batching, extraction, screenshot evidence, URL safety checks, action budgets, and hard policy gates for consequential actions.
- **Permission kernel** — consequential browser actions pause into signed single-use approval checkpoints (`/api/approvals/*`) with approve/deny/resume in `/computer`; approvals expire in 15 minutes and cannot be replayed.
- **Computer Use V0.3 alpha** — delegates desktop objectives to an isolated permissioned worker instead of exposing shell/OS privileges to the Next.js control plane.
- **Model Arena** — run one prompt across 2–4 models concurrently with
  per-model latency, provider tags, and honest per-model failure states.
- **Providers control plane** (`/settings`) — add keys without restarts,
  AES-256-GCM encrypted into a gitignored local store, masked everywhere,
  one-click **Test connection**, remove with two-click confirm.
- **Multi-provider routing** — OpenAI, NVIDIA NIM, Anthropic, local Ollama,
  Higgsfield media, and any LiteLLM-gateway router. Auto-routing only picks
  routers that are actually configured; any OpenAI-compatible id is
  addressable as `<provider>:<model-id>`.
- **Verified NVIDIA set** — the registry keeps only models proven live
  through chat probes (12 verified 2026-09-18); retired/unentitled ids were
  removed instead of left to fail.
- **Skills auto-detection** — scans host skill directories on every load
  (local reads only, nothing uploaded), with search, source filters,
  per-skill chat opt-out, and enabled skills offered as chat context.
- **Media jobs** — Higgsfield image generation with async job status
  polling (`/api/images/*`).
- **Security boundaries** — Zod validation at every edge, encrypted credentials, masked secrets, DNS-aware SSRF and redirect protection, hosted provider-admin protection, request throttling, security headers, request IDs, and escaped model markdown.
- **CI quality gates** — every V0.2 push runs typecheck, Vitest, and a production Next.js build in GitHub Actions.

## Quickstart

Requirements: Node.js 22.12+ (Node 24 recommended), pnpm 10+ (npm works as a fallback).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. Then go to **Settings → Providers**, add a
key (e.g. `NVIDIA_API_KEY`), and **Test connection** — chat, arena, and
auto-routing light up immediately.

## Environment

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | OpenAI router (default base `https://api.openai.com/v1`) |
| `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` | NVIDIA NIM open models (default `https://integrate.api.nvidia.com/v1`) |
| `TYPESAFE_API_KEY` | TypeSafe Jev decisions via `https://api.typesafe.ai/v1/systemone` |
| `ANTHROPIC_API_KEY` | Anthropic (dedicated adapter ships next; use the LiteLLM gateway meanwhile) |
| `OLLAMA_BASE_URL` | Local Ollama, no key (default `http://localhost:11434/v1`) |
| `LITELLM_BASE_URL` / `LITELLM_MASTER_KEY` | LiteLLM gateway for 100+ routers, addressed as `litellm:<model-id>` |
| `HF_KEY` (or `HF_API_KEY` + `HF_API_SECRET`) | Higgsfield media generation |
| `CREDENTIAL_ENCRYPTION_KEY` | Required before saving provider credentials in the UI |
| `SCALEOS_DATA_DIR` | Credential store location (default `./data`, gitignored) |
| `SCALEOS_SKILLS_DIRS` | Extra skill directories (delimiter-separated) |
| `DATABASE_URL` / `AUTH_SECRET` | Reserved for the PostgreSQL/auth slice |
| `BROWSER_CDP_URL` | Optional Chrome DevTools Protocol endpoint used by Browser Use; local development starts a disposable headless browser when unavailable |
| `CHROME_EXECUTABLE_PATH` | Optional local Chrome/Chromium/Edge executable path for development browser automation |
| `SCALEOS_BROWSER_ALLOW_PRIVATE` | Local-development-only opt-in for private/local browser targets |
| `SCALEOS_COMPUTER_WORKER_URL` | Isolated desktop worker endpoint for Computer Use |
| `SCALEOS_COMPUTER_WORKER_TOKEN` | Optional bearer token for the desktop worker |

See `.env.example`. Provider keys stay server-side. Never commit `.env.local`
or anything under `data/`.

## Routes & APIs

Pages: `/` (workspace home) · `/chat` · `/agents` · `/computer` · `/arena` · `/image` · `/skills` ·
`/flows` · `/models` · `/settings`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Streaming chat completions (OpenAI-compatible dispatch) |
| `/api/agents/run` | POST | Bounded planner/executor/synthesizer agent run |
| `/api/runs` | GET | Durable run history (agents, browser, computer, flows) |
| `/api/flows/run` | POST | Server-side flow runner with per-step results |
| `/api/tools` | GET/POST | Allowlisted tool inventory + audited tool execution |
| `/api/usage` | GET | Local usage metering summary by kind |
| `/api/approvals` | GET | Permission checkpoint history (tokens never exposed) |
| `/api/approvals/request` | POST | Mint a consequential-action approval checkpoint |
| `/api/approvals/decide` | POST | Approve (issues single-use token) or deny |
| `/api/computer/status` | GET | Browser/desktop execution readiness without exposing endpoints or tokens |
| `/api/computer/browser/run` | POST | Autonomous DOM-first Browser Use run |
| `/api/computer/run` | POST | Permissioned desktop Computer Use run |
| `/api/arena` | POST | Concurrent 2–4 model comparison |
| `/api/status` | GET | Live routers + registry models, no secrets |
| `/api/skills` | GET | Host skill inventory (ids, names, descriptions) |
| `/api/providers` | GET/POST/DELETE | Masked inventory, save (encrypted), remove |
| `/api/providers/test` | POST | Free connection check per provider |
| `/api/providers/sync` | POST | Model list from a provider's own API |
| `/api/images/generate` | POST | Submit a Higgsfield media job |
| `/api/images/jobs/[requestId]` | GET | Poll a media job's status |

Every API response carries `requestId` (body + `x-request-id` header).

## Quality gates

```bash
pnpm lint        # tsc --noEmit
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest (routing, registry, dispatch, crypto, skills, storage)
pnpm build       # production build
```

## Project structure

```
app/            # routes, pages, API handlers (server-only secrets stay here)
components/     # client UI (shell, chat, arena, providers, skills, markdown)
lib/ai/         # provider catalog, registry, routing, dispatch (contracts first)
lib/api/        # unified success/error envelope with request IDs
lib/security/   # AES-GCM crypto, SSRF-safe URLs, encrypted credential store
lib/permissions/# HMAC-signed single-use approval kernel
lib/tools/      # allowlisted local tools + audit log
lib/runs/       # durable run history (file-backed, PostgreSQL-ready shape)
lib/flows/      # server-side flow execution engine
lib/usage/      # local usage metering + summaries
lib/store/      # file-backed JSON collections (PostgreSQL-ready boundary)
lib/skills/     # host skill scanner + chat context builder
lib/chat/       # conversation persistence (localStorage slice, DB-ready shape)
lib/computer/   # CDP browser driver, policy engine, browser agent, desktop worker adapter
tests/          # contract + unit tests
docs/           # architecture + provider adapter notes
```

## Security model

Inputs are validated at boundaries with Zod; credentials are encrypted at rest and masked in every UI response; provider and browser URL targets are checked before dispatch and after DNS resolution; redirects are blocked at provider boundaries; plaintext secrets never reach the client; and model output is escaped before controlled markdown tags are injected. Browser/Computer Use applies action budgets and pauses financial, destructive, credential, upload, account, and external-communication side effects into signed single-use approval checkpoints (15-minute TTL, HMAC with `CREDENTIAL_ENCRYPTION_KEY`/`AUTH_SECRET`, deny-by-default). Local tools run from a fixed allowlist with no code execution and every invocation is audit-logged. In hosted production, provider credential mutations require `SCALEOS_ADMIN_TOKEN` until workspace authentication replaces this temporary admin boundary.

## Known limitations & roadmap

Workspace auth, PostgreSQL repositories, durable agent memory, visual browser fallback, usage charts, and attachments/storage are upcoming vertical slices. In local development Browser Use can launch a fresh headless browser with a temporary profile; production requires an explicitly configured CDP endpoint. Desktop Computer Use requires an isolated worker. Kimi K3 and other heavyweight
reasoning models currently exceed the 120s upstream budget on trial-tier
keys — tracked as a follow-up (longer budgets / reasoning params / paid
tier). The UI exposes no fake success state; unavailable integrations
remain explicit empty states.
