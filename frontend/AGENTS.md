# Frontend — Next.js Application

## Purpose
This directory owns the entire client-side application: the workflow builder UI,
content preview system, dashboard, authentication flows, all React components,
state stores, and the typed API client layer. It does NOT own backend logic,
database schema, or deployment infrastructure.

## Architecture
Next.js 15 with the App Router. Pages in `src/app/` are thin routing shells —
all meaningful logic lives in `src/components/`, `src/hooks/`, and `src/lib/`.

Auth is client-side: `middleware.ts` is a pass-through (no auth enforcement).
Protection is provided by the `ProtectedRoute` component which reads from
`AuthContext`. The Supabase browser client in `src/lib/supabase/client.ts` holds
the session.

The `/backend/:path*` → `BACKEND_URL/api/:path*` rewrite in `next.config.ts`
is the only API gateway. All fetch calls go through this path except the SSE
streaming endpoint — see `src/lib/fastapi/AGENTS.md`.

Key dependency: `@xyflow/react` ^12 (React Flow) for the workflow canvas.

## Contracts
- `NEXT_PUBLIC_BACKEND_URL` — falls back to `/backend`. Set this in production
  to the backend's public URL if CORS is not configured to allow the Vercel
  origin.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — required at
  build time. The Supabase client throws at module load if either is absent.
- `next.config.ts` `proxyTimeout: 300000` (5 minutes) — required for
  long-running AI generation endpoints. Reducing this breaks video generation.
- `middleware.ts` does NOT enforce authentication despite matching all routes.
  Auth enforcement is entirely client-side via `ProtectedRoute`.
- Pre-commit hook (`lint-staged` via Husky): runs ESLint on staged TS/JS files.
  No `tsc --noEmit` on commit — type errors can pass through lint-staged.

## Pitfalls
- `checkMicraiThinkingFrames.mjs` runs as `prelint` before every `npm run lint`.
  It validates that all 6 robot animation PNGs in `public/` have consistent
  dimensions and alpha bounding boxes. Swapping animation assets requires
  updating all 6 files atomically — updating fewer will block linting.
- `playwright.config.ts` starts the dev server with `pnpm dev` but `package.json`
  scripts use `npm`. Running E2E tests via `npm run test:e2e` will start the
  server correctly; calling `playwright test` directly without an already-running
  server will fail unless `pnpm` is available.
- `TEST_EMAIL` and `TEST_PASSWORD` env vars are required for E2E tests.
  Without them, tests self-skip silently — they do not fail, which can mask
  broken test setup in CI.
- `tsconfig.json` excludes `e2e/` and `tests/e2e/` — Playwright specs are not
  type-checked by the main TypeScript config.
- Tailwind v4 is in use. There is no `tailwind.config.js` — configuration lives
  in CSS files directly. Do not create a `tailwind.config.js`; it will be
  ignored or conflict.

## Downlinks
- [src/components/workflow](./src/components/workflow/AGENTS.md) — workflow builder canvas, copilot dock, execution toolbar
- [src/components/preview](./src/components/preview/AGENTS.md) — preview page, slot assignment, platform mockups, draft system
- [src/lib](./src/lib/AGENTS.md) — node registry mirror, preview utils, API client, state stores
