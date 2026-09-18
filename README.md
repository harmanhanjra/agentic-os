# ScaleOS AI

> One workspace. Every AI model.

ScaleOS AI is a provider-agnostic AI operating workspace for connecting hosted or local models, chatting, comparing outputs, generating media, managing credentials, and preparing agent/workflow foundations.

## Current slice

- Responsive dark-first workspace shell with command palette (`Ctrl/Cmd + K`)
- Chat, Arena, Image Studio, Skills, Flows, Models, and Settings routes with intentional empty states
- Multi-provider routing: OpenAI, NVIDIA NIM open models, Anthropic, local Ollama, and any LiteLLM-gateway router (`litellm:<model-id>`)
- Auto-routing prefers routers that are actually configured; every model shows Ready / Needs-key state with capability badges
- Local skill auto-detection (`/api/skills` + Skills page) with per-skill chat opt-out; detected skills are offered as chat context
- Capability-aware model registry and deterministic Auto/fast/reasoning/coding/budget/local routing contracts
- AES-256-GCM credential encryption and masked secrets
- Hosted-mode custom URL validation to reduce SSRF risk
- Server-only `/api/chat` streaming boundary for configured OpenAI-compatible providers
- Test coverage for routing, capability selection, encryption, and URL safety
- Architecture and provider extension documentation

Provider connections are intentionally not fabricated: configure a real server-side credential before sending production requests.

## Requirements

- Node.js 20+
- pnpm 10+ (npm works as a fallback)
- PostgreSQL for the persistence implementation

## Installation

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

## Environment

See `.env.example`. `CREDENTIAL_ENCRYPTION_KEY` is required before persisting provider credentials. Provider keys must remain server-side. Never commit `.env.local`.

Routers are configured with server-side keys: `OPENAI_API_KEY`, `NVIDIA_API_KEY` (NVIDIA NIM open models), `ANTHROPIC_API_KEY`, local Ollama via `OLLAMA_BASE_URL` (no key), and any other router through a LiteLLM gateway (`LITELLM_BASE_URL` + `LITELLM_MASTER_KEY`, addressed as `litellm:<model-id>`).

Keys can be added without restarts on the **Settings → Providers** page: they are AES-256-GCM encrypted with `CREDENTIAL_ENCRYPTION_KEY` into a gitignored local store (`data/providers.json`, override with `SCALEOS_DATA_DIR`) and take precedence over environment variables. The UI only ever shows masked shapes, and **Test connection** hits each provider's free model listing.

Skills are auto-detected from `~/.agents/skills`, `~/.claude/skills`, and `~/.config/opencode/skills` (plus `SCALEOS_SKILLS_DIRS`). Detection is local reads only.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture

Read [`docs/architecture.md`](docs/architecture.md) and [`docs/provider-adapter.md`](docs/provider-adapter.md). The design keeps model capabilities, provider adapters, routing, generation records, storage, agents, and workflows separate so future media and desktop runtimes do not require a rewrite.

## Database and deployment

The repository is PostgreSQL-ready but the first UI slice uses development-safe boundaries while the schema and authenticated repositories are implemented. A production deployment should use managed PostgreSQL, a server-side credential key, object storage for attachments/media, and LiteLLM as a separate gateway service where appropriate. Docker Compose support is planned alongside the persistence increment.

## Security model

Inputs are validated at boundaries, credentials are encrypted at rest, keys are masked in UI responses, provider URL targets are checked, and model output is treated as untrusted data. Production routes must enforce authentication and workspace ownership before database access.

## Known limitations

Authentication, persistent repositories, real provider streaming, image storage, usage charts, and agent execution are the next vertical slices. The UI exposes no fake success state; unavailable integrations remain explicit empty states.

## Roadmap

Provider center → PostgreSQL/auth → real streaming chat → attachments/storage → arena/image generation → usage/budgets → agents/tools → workflow execution → local bridge and additional media runtimes.
