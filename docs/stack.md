<!-- seeded by Codery from template product-owner @ 0.5.0; this file is the project's own from here on -->

# Stack

What is in use in this repo, and why each piece is here. This is the record the `SessionStart` dependency check diffs the manifest and lockfile against: a dependency named in neither this file nor an [ADR](./adr/README.md) is reported as undocumented.

**Nothing about this stack is pre-decided, on purpose.** Deciding a stack at setup, before any code exists, is mostly wrong. Entries arrive from decisions taken **in-project as the work reaches it**, through the technology gate in [`CLAUDE.md`](../CLAUDE.md#the-technology-gate): a new library, a new third-party service, or a major version bump is Tural's call, reaches him as a one-screen comparison (in refinement's round, or in a build's one batched stop), and lands as an ADR.

**Do not pre-populate this file with libraries nobody has chosen.** An entry here is a record of a decision that was made, not a plan.

---

## Decided in-project

| What | Why it's here | Decision record |
|---|---|---|
| `react`, `react-dom` | UI | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `next` | The app: frontend and backend together, dev server and build | [ADR 0003](./adr/0003-app-on-nextjs.md) |
| `vite` | Test-only: Vitest's peer and the `?raw` types | [ADR 0003](./adr/0003-app-on-nextjs.md) |
| `typescript` | Types | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `d3-geo` | Map projection and paths | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `topojson-client` | Topology to GeoJSON | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `world-atlas` | Country shapes | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `@types/react`, `@types/react-dom`, `@types/d3-geo`, `@types/topojson-client` | Types for the libraries above | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `vitest` | Unit tests | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| `@playwright/test` | End-to-end tests | [ADR 0001](./adr/0001-frontend-stack-react-vite-typescript-d3-geo.md) |
| Design tokens and components: plain CSS in `src/design/`, a copy of the cloud design system https://claude.ai/artifact/5VUQ4UqqEg7D154QpH14ib | Night side look without a library | [ADR 0002](./adr/0002-design-tokens-plain-css-self-hosted-fonts.md) |
| Fonts Inter and JetBrains Mono: self-hosted font files (OFL) | No third-party font request | [ADR 0002](./adr/0002-design-tokens-plain-css-self-hosted-fonts.md) |
| `drizzle-orm`, `drizzle-kit` | Schema, migrations and queries | [ADR 0004](./adr/0004-storage-postgres-pgvector-drizzle.md) |
| `pg`, `@types/pg` | Postgres driver and its types | [ADR 0004](./adr/0004-storage-postgres-pgvector-drizzle.md) |
| PostgreSQL 18 + pgvector (`pgvector/pgvector:pg18`) | Storage and embeddings | [ADR 0004](./adr/0004-storage-postgres-pgvector-drizzle.md) |
| `@types/node` | Types for Node APIs used by the scripts and the env loader | [ADR 0004](./adr/0004-storage-postgres-pgvector-drizzle.md) |
