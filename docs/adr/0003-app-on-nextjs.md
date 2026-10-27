# 0003. App on Next.js

- **Status**: Accepted
- **Date**: 2026-10-27

## Context

Issue #7 brings in a backend that reads the news and stores what it finds. Tural: "it doesnt have to be a small server. now what do you think about using something like nextjs actually to have an easy one repo with frontend and backend together?" and then "lets do next" (refinement of #7, Decided #16).

## Decision

The app is one Next.js 16 project (`next`), App Router, in `src/app/`: frontend and backend together. React, TypeScript and `d3-geo` stay as in [ADR 0001](./0001-frontend-stack-react-vite-typescript-d3-geo.md). Vite no longer builds or serves the app; `@vitejs/plugin-react` is removed. `vite` stays only as a test-time dependency: Vitest's peer, and the source of the `?raw` and `import.meta.glob` types the tests use. The style guide is a Next page served at `/style-guide.html` (a rewrite to `/style-guide`) that renders the inner markup of the repo's `style-guide.html`, so the tests keep reading that one file. End-to-end tests run against `next build && next start`.

## Consequences

- One repo, one deploy unit, for the page and for the server code that arrives in later steps of #7.
- The map page and the style guide each import their own page CSS; both style `body` and `.page`, so they must never load on the same route.
- `next build` type-checks through the `tsc` CLI because `typescript` 7 has no JS API; `npm run typecheck` (`next typegen && tsc --noEmit`) is the type gate.
- `next dev` writes an `AGENTS.md` into the repo root; it is git-ignored.

## Alternatives considered

- Stay on Vite with a separate small server (Decided #16). Not chosen: Tural wanted frontend and backend in one repo.
- The refinement's one-screen comparison table (options x buys x costs x recommendation) was not recorded in the issue; only the decision above is.
