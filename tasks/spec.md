# Spec: ScaleOS AI V1

## Objective
ScaleOS AI is a provider-agnostic AI operating workspace for creators, developers, and teams who need to connect models, chat, compare outputs, generate images, inspect usage, and prepare agent/workflow foundations from one workspace. Success means a user can enter the app, navigate a responsive desktop-like workspace, configure a provider without exposing secrets, discover capability metadata, choose or route to a model, and use functional AI request boundaries with persisted-data-ready interfaces.

## Tech Stack
- Next.js App Router, React, TypeScript
- Tailwind CSS and accessible composed UI primitives
- Zod for boundary validation
- Vercel AI SDK-compatible streaming abstractions
- PostgreSQL-ready repository interfaces with Prisma/Drizzle migration path
- Vitest for unit/integration tests and Playwright-ready E2E

## Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

## Project Structure
- `app/` — App Router pages and route handlers
- `components/` — focused UI and workspace components
- `lib/ai/` — capabilities, registry, adapters, routing, usage, errors
- `lib/security/` — encryption, URL safety, input validation
- `lib/repositories/` — persistence boundaries and development adapters
- `tests/` — unit and integration tests
- `docs/` — architecture and extension guides
- `tasks/` — spec, plan, and implementation checklist

## Code Style
Use named exports, typed boundaries, small components, semantic HTML, and explicit error handling:

```ts
export async function selectModel(input: RoutingRequest): Promise<RoutingDecision> {
  const request = RoutingRequestSchema.parse(input);
  const candidates = registry.list({ capability: request.requiredCapabilities });
  if (candidates.length === 0) throw new ScaleOSError('MODEL_UNAVAILABLE');
  return scoreCandidates(candidates, request)[0];
}
```

## Testing Strategy
- Unit tests for pure routing, capabilities, classification, encryption, cost, errors, and URL validation.
- Integration tests for provider/model/conversation/usage repository boundaries and API schemas.
- E2E scaffolds for auth, onboarding, chat streaming, arena, image, settings, and persistence.
- Production code never returns fake AI output; controlled fixtures are test-only.

## Boundaries
- Always: validate external input, enforce ownership, keep secrets server-only, normalize errors, test each increment, and preserve accessibility.
- Ask first: irreversible auth semantics, production database migrations, or changes that weaken provider URL security.
- Never: commit secrets, log keys, use model output as executable code, bypass authorization, or silently fabricate provider status/cost/output.

## Success Criteria
- Responsive dark/light/system workspace shell and command bar.
- Dynamic capability-aware model registry and deterministic routing contract.
- Secure provider connection primitives with encrypted credentials and safe custom URLs.
- Functional streaming/chat, arena, image, attachments, usage, provider, models, settings, agents, and flows boundaries.
- Documentation, `.env.example`, Docker support, tests, typecheck, lint, and production build pass.

## Open Questions
- Production authentication vendor and managed PostgreSQL deployment are deployment choices; interfaces remain vendor-neutral for V1.
- Actual provider credentials are environment/user configuration, not a development blocker.
