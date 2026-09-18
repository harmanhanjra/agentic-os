# ScaleOS AI Project Rules

## Product
ScaleOS AI is a provider-agnostic AI workspace: one workspace, every AI model. Build functional vertical slices; never ship fake production AI output or expose secrets.

## Planned Stack
- Next.js App Router, React, TypeScript
- Tailwind CSS with accessible semantic components
- Zod validation
- PostgreSQL-ready persistence boundary (Prisma or Drizzle selected during foundation)
- Vercel AI SDK-compatible generation interfaces

## Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

## Conventions
- Prefer named exports and focused modules.
- Validate all external input at boundaries with Zod.
- Use semantic HTML and keyboard-accessible controls.
- Keep credentials server-only; never return or log plaintext secrets.
- Use provider/model capability metadata rather than hard-coded model names.
- Normalize errors and preserve request IDs for diagnostics.
- Keep incomplete features behind feature flags or intentional disabled states.

## Boundaries
- Always: read files before editing, test each increment, keep the app buildable, use safe defaults.
- Ask first: irreversible data migrations or changing authentication/provider security semantics.
- Never: commit secrets, fake provider connectivity in production, use untrusted model output as executable code, or bypass authorization.

## UI Direction
Premium, restrained, dark-first operating workspace. Use subtle depth, clear hierarchy, semantic tokens, responsive layouts, purposeful motion, and complete loading/error/empty states. Avoid excessive gradients, glassmorphism, and generic dashboard cards.
