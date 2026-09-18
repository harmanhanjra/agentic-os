# ScaleOS AI

> One workspace. Every AI model.

ScaleOS AI is a provider-agnostic AI operating workspace for connecting hosted or local models, chatting, comparing outputs, generating media, managing credentials, and preparing agent/workflow foundations.

## Current slice

- Responsive dark-first workspace shell with command palette (`Ctrl/Cmd + K`)
- Chat, Arena, Image Studio, Flows, Models, and Settings routes with intentional empty states
- Capability-aware model registry and deterministic Auto/fast/reasoning/coding/budget/local routing contracts
- AES-256-GCM credential encryption and masked secrets
- Hosted-mode custom URL validation to reduce SSRF risk
- Test coverage for routing, capability selection, encryption, and URL safety
- Architecture and provider extension documentation

Provider connections are intentionally not fabricated: configure a real server-side credential before sending production requests.

## Requirements

- Node.js 20+
- npm 10+ (pnpm is the intended package manager when available)
- PostgreSQL for the persistence implementation

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

See `.env.example`. `CREDENTIAL_ENCRYPTION_KEY` is required before persisting provider credentials. Provider keys must remain server-side. Never commit `.env.local`.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
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
