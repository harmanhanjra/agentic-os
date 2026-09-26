# Chat reliability pass

## Implemented

- Validate stored conversations and messages with Zod before rendering or saving.
- Refuse to overwrite unreadable or malformed history. Valid entries remain readable.
- Surface failed saves with a persistent warning and retry button; report failed deletes.
- Retain all messages in a conversation instead of silently discarding messages beyond 200.
- Apply the existing 100-conversation limit by most recent update.
- Scope asynchronous generation callbacks to the active request and conversation.
- Preserve the user's prompt when stopping generation and abort requests on unmount.
- Retry the selected turn without duplicating its prompt or retaining partial failed output.
- Respect changes to the Jev planning toggle and display network failures as errors.

## Verification and limits

Regression tests cover history retention, long conversations, malformed data, quota
errors, deletion, and retry context. Run `npm test`, `npm run typecheck`, and
`npm run build` (npm is the documented fallback when pnpm is unavailable).

Storage remains local to the browser and subject to its quota. Simultaneous edits
from multiple tabs are not synchronized. This is not server persistence or a
backup system. Invalid history is preserved for recovery rather than repaired
automatically. The existing 100-conversation retention limit still applies.

Interactive checks still needed: switch chats during a slow response, stop then
start another response, retry after a network failure, and simulate a full browser
storage quota. Browser automation could not initialize during this pass.

Next foundations: durable workspace persistence, real lint rules (the current
lint script only typechecks), task evaluations, and provider/worker integration
tests. Authentication or provider security changes require the project owner's
approval under AGENTS.md.
