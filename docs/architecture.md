# ScaleOS AI Architecture

## Request pipeline
Private requests follow authentication → Zod validation → workspace ownership → capability detection → routing → budget check → provider resolution → generation → usage extraction → persistence. The pipeline is intentionally centralized behind typed contracts so chat, arena, images, agents, and future media routers do not duplicate provider behavior.

## Model registry
`lib/ai/types.ts` defines normalized capabilities and model metadata. `ModelRegistry` is the source of truth for enabled models, filtering by capability, local/cloud status, provider, and context. Production persistence will sync provider discoveries without destroying user overrides.

## Providers and gateway
`ProviderAdapter` separates health checks, model discovery, text generation, and image generation. LiteLLM can be used as a gateway adapter; direct adapters are reserved for provider-specific capabilities that cannot be represented safely through a text-only gateway. OpenAI-compatible endpoints are the first custom-provider target.

## Router
`classifyTask` uses deterministic low-cost rules. `chooseModel` scores capability-compatible candidates according to routing preference and returns reason codes plus fallbacks. It does not claim optimality or expose hidden reasoning.

## Credentials and security
Provider secrets are encrypted server-side with AES-256-GCM using `CREDENTIAL_ENCRYPTION_KEY`. Only masked values are returned. Custom provider URLs pass SSRF-oriented scheme, private-address, embedded-credential, and hosted-mode checks before server fetches.

## Persistence
The first slice uses explicit in-memory-ready interfaces while PostgreSQL/Prisma or Drizzle is introduced as an implementation detail. Core entities are User, Workspace, Provider, ProviderCredential, Model, Conversation, Message, Attachment, Generation, UsageEvent, ImageGeneration, Agent, Workflow, WorkflowNode, and UserPreference.
Operational state (usage events, run history, approvals, tool audits) is file-backed under `SCALEOS_DATA_DIR` through `lib/store/json-store.ts`, whose list/insert/replace/remove shape is the PostgreSQL-ready boundary a Prisma/Drizzle adapter can replace without touching callers.

## Permission kernel
`lib/permissions/kernel.ts` mints approval checkpoints for consequential browser actions. Approvals are HMAC-signed (key: `CREDENTIAL_ENCRYPTION_KEY`/`AUTH_SECRET`), expire after 15 minutes, and verify single-use — a consumed token cannot be replayed. The browser agent pauses into `awaiting_approval` with the checkpoint attached; the `/computer` UI approves/denies and resumes with the token.

## Tools, flows, and metering
`lib/tools/registry.ts` is a fixed allowlist (web_fetch, calculator, datetime, text_stats) with Zod-validated inputs, SSRF-safe fetch, arithmetic without code execution, and an audit log. `lib/flows/engine.ts` runs Input → Prompt → Model → Output server-side with per-step results. `lib/usage/meter.ts` records every chat/arena/agent/browser/computer/flow/image/tool call; `/api/usage` summarizes by kind for Settings.
## Future extension points
Agents receive allowlisted `ScaleOSTool` plugins; workflows serialize nodes and edges; storage uses a `StorageProvider` boundary; local AI is labeled separately and can later use a Local Bridge or desktop client. MCP, RAG, media, browser, and sandbox runtimes can attach without coupling UI components to provider APIs.
