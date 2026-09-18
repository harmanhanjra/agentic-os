# ScaleOS AI · V0.2

> One workspace. Every AI model. Now with a bounded agent runtime.

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
- **Agents V0.2** — bounded planner → executor → synthesizer runs with 1–5 steps, explicit no-tool mode, request IDs, and rate limits. External/destructive tools are intentionally disabled until permissioned tool execution lands.
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

Requirements: Node.js 20+, pnpm 10+ (npm works as a fallback).

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
| `ANTHROPIC_API_KEY` | Anthropic (dedicated adapter ships next; use the LiteLLM gateway meanwhile) |
| `OLLAMA_BASE_URL` | Local Ollama, no key (default `http://localhost:11434/v1`) |
| `LITELLM_BASE_URL` / `LITELLM_MASTER_KEY` | LiteLLM gateway for 100+ routers, addressed as `litellm:<model-id>` |
| `HF_KEY` (or `HF_API_KEY` + `HF_API_SECRET`) | Higgsfield media generation |
| `CREDENTIAL_ENCRYPTION_KEY` | Required before saving provider credentials in the UI |
| `SCALEOS_DATA_DIR` | Credential store location (default `./data`, gitignored) |
| `SCALEOS_SKILLS_DIRS` | Extra skill directories (delimiter-separated) |
| `DATABASE_URL` / `AUTH_SECRET` | Reserved for the PostgreSQL/auth slice |

See `.env.example`. Provider keys stay server-side. Never commit `.env.local`
or anything under `data/`.

## Routes & APIs

Pages: `/` (workspace home) · `/chat` · `/agents` · `/arena` · `/image` · `/skills` ·
`/flows` · `/models` · `/settings`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Streaming chat completions (OpenAI-compatible dispatch) |
| `/api/agents/run` | POST | Bounded planner/executor/synthesizer agent run |
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
lib/security/   # AES-GCM crypto, SSRF-safe URLs, encrypted credential store
lib/skills/     # host skill scanner + chat context builder
lib/chat/       # conversation persistence (localStorage slice, DB-ready shape)
tests/          # contract + unit tests
docs/           # architecture + provider adapter notes
```

## Security model

Inputs are validated at boundaries with Zod; credentials are encrypted at rest and masked in every UI response; provider URL targets are checked before dispatch and after DNS resolution; redirects are blocked at provider boundaries; plaintext secrets never reach the client; and model output is escaped before controlled markdown tags are injected. In hosted production, provider credential mutations require `SCALEOS_ADMIN_TOKEN` until workspace authentication replaces this temporary admin boundary.

## Known limitations & roadmap

Workspace auth, PostgreSQL repositories, durable agent memory, permissioned tool execution, usage charts, and attachments/storage are upcoming vertical slices. Kimi K3 and other heavyweight
reasoning models currently exceed the 120s upstream budget on trial-tier
keys — tracked as a follow-up (longer budgets / reasoning params / paid
tier). The UI exposes no fake success state; unavailable integrations
remain explicit empty states.
