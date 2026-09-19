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
- [x] Full Computer Use: real isolated desktop worker with screenshots, mouse, keyboard, drag, scroll, hotkeys, and key presses.
- [x] `/computer` mission UI with real worker health, visual action traces, active-window metadata, and screenshot evidence.\n- [x] Vision-driven Computer Use loop: screenshot → plan → policy → execute → re-observe.\n- [x] Deterministic full Computer Use E2E in CI.
- [x] Real Chrome/CDP Browser Use end-to-end CI test (navigate → fill → click → extract → screenshot).
- [ ] Visual/pixel fallback when DOM semantics are insufficient.
- [ ] Permission kernel with signed approval checkpoints for consequential actions.
- [ ] Workspace authentication and PostgreSQL persistence.
- [ ] Durable agent runs, memory, budgets, and cancellation.
- [ ] Permissioned tool registry with approval gates and audit log.
- [ ] Workflow execution, scheduling, and background workers.
