# Reconciled workspace — 1 October 2026

The local branch and remote master had diverged. They were merged on
`codex/verified-workspace-2026-10-01`, preserving local Jev/voice/workflow,
permission kernel, usage, and run-history work alongside the remote isolated
desktop worker and vision loop. Six conflicting files were resolved explicitly.
The Computer Use API now invokes the vision loop and retains local metering
and run persistence. The status API keeps browser launch fallback and worker
health metadata.

After reconciliation, TypeScript and 147 tests passed. A successful workspace
build does not certify a configured vision provider or real desktop operation.
CI also exercises deterministic browser and desktop E2E fixtures.
It runs on the verification branch so this combined state is reviewable before
merging into master.

The local E2E runs also passed after fixing nested response envelopes in the
browser and desktop routes. Browser verification used real headless Chrome
with a deterministic local model: navigate, fill, click, extract, screenshot.
Desktop verification used the real Python worker in virtual mode with a
deterministic vision response: screenshots and mouse/typing actions completed.
This does not test physical desktop control or a live hosted vision model.

## Run

Use Node.js 22.12+ (24 recommended), `npm ci`, configure `.env.local` from
`.env.example`, and `npm run dev`. For desktop execution, follow
`computer_worker/README.md`; keep the worker isolated and explicitly configured.

## Remaining product work

Workspace authentication, PostgreSQL persistence, live cancellation, durable
agent memory, and production scheduling remain roadmap items. External model
and media services need their own credentials and live verification. This
release is a working alpha workspace rather than a finished autonomous OS.
