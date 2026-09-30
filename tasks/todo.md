# ScaleOS AI V0.3 Task Checklist

- [x] Foundation repository and documentation
  - Acceptance: AGENTS.md, spec, plan, and this checklist exist.
  - Verify: Read all files and confirm commands/decisions are explicit.

- [x] Runnable Next.js shell
  - Acceptance: `pnpm dev` and `pnpm build` work; desktop shell has navigation, theme, command palette, and responsive layout.
  - Verify: `pnpm lint`, `pnpm typecheck`, `pnpm build`; inspect at 320/768/1440px.

- [x] AI core contracts and registry
  - Acceptance: Capability-aware registry, routing modes, classifier, error/cost contracts are typed and tested.
  - Verify: Unit tests and typecheck.

- [x] Secure provider primitives
  - Acceptance: Encrypted credentials, masked output, SSRF-safe URL validation, provider adapter contract.
  - Verify: Security-focused unit tests and source audit.

- [x] Chat, arena, and image-generation foundations
  - Acceptance: Routes/components use the shared contracts, streaming/cancellation boundaries are present, no production fake output.
  - Verify: Contract/integration tests and UI smoke checks.
  - Note: Chat streaming, Arena concurrency, and Higgsfield image jobs are implemented; attachments and durable asset storage remain a future slice.

- [ ] Agentic control plane and foundations
  - Acceptance: Provider/model/usage/settings/agent/flow screens have working state boundaries and intentional empty states.
  - Verify: Typecheck, tests, responsive QA.

- [ ] Production hardening
  - Acceptance: env example, Docker, docs, security headers, logging, rate limits, test scaffolds, clean quality gates.
  - Verify: lint, typecheck, test, build, dependency audit.


## V0.2 delivered
- [x] Escape model HTML before markdown injection.
- [x] DNS-aware SSRF checks and redirect blocking for provider traffic.
- [x] Hosted provider credential mutations require an admin boundary.
- [x] Chat, Arena, image, and agent run throttling primitives.
- [x] Provider sync honors encrypted credentials saved from Settings.
- [x] Security headers and GitHub Actions quality gates.
- [x] Bounded planner → executor → synthesizer Agent Runtime with `/agents`.

## V0.3 in progress
- [x] DOM-first Browser Use through CDP with semantic element refs and bounded autonomous runs.
- [x] Browser action policy blocking consequential side effects until explicit approvals exist.
- [x] Computer Use API + isolated desktop-worker contract.
- [x] `/computer` mission UI with readiness, traces, extraction, and screenshot evidence.
- [x] Visual/pixel fallback when DOM semantics are insufficient.
- [x] Permission kernel with signed approval checkpoints for consequential actions.
- [ ] Workspace authentication and PostgreSQL persistence.
- [x] Durable agent runs and run history (live cancellation, long-term memory, and budgets remain future).
- [x] Permissioned tool registry with approval gates and audit log.
- [x] Workflow execution via the server-side flow runner (scheduling and background workers remain future).

## V0.4 delivered (this pass)
- [x] Unified API envelope (`lib/api/envelope.ts`) with request IDs on every response.
- [x] Permission kernel: HMAC-signed single-use approvals, 15-min TTL, `/api/approvals/*`, approve/deny/resume UI in `/computer`.
- [x] Browser `awaiting_approval` status, approval-token resume, visual-fallback evidence signal.
- [x] Allowlisted tool registry + audited `/api/tools` (calculator has no code execution).
- [x] Durable run history (`/api/runs`) + recent-runs UI in `/agents`.
- [x] Server-side flow runner (`/api/flows/run`) with per-step results + metering.
- [x] Local usage metering (`/api/usage`) wired into Settings.
- [x] Hardened security headers (CORP, X-Permitted-Cross-Domain-Policies, HSTS).
- [x] 75 tests green (10 new: kernel, tools, flows, runs, usage, envelope), typecheck + production build green.

## Reconciled remote work — 1 October 2026
- [x] Preserve remote vision-driven desktop worker and worker health contract.
- [x] Preserve local Browser Use launch fallback, permission kernel, usage metering, and run history.
- [ ] Revalidate desktop control with a configured isolated worker and vision provider.
