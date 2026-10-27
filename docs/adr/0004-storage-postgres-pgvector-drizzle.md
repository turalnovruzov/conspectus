# 0004. Storage: PostgreSQL + pgvector via Drizzle

- **Status**: Accepted
- **Date**: 2026-10-27

## Context

Issue #7 stores source items, events and situations, with embeddings for clustering. Tural: "look, you dont gotta cut corners. we dont have to host on neon. i say we use postgres." (Decided #15) and approved Drizzle and "a Postgres driver" (Decided #17).

## Decision

- PostgreSQL 18 with the pgvector extension (image `pgvector/pgvector:pg18`); the first migration runs `CREATE EXTENSION IF NOT EXISTS vector`.
- `drizzle-orm` for schema and queries, `drizzle-kit` for committed SQL migrations in `drizzle/`, `pg` as the driver, `@types/pg` for its types. `npm run db:migrate` applies them.
- Credentials live in `~/.config/conspectus/.env` (override: `CONSPECTUS_ENV_FILE`; a variable already set wins); nothing real is in the repo.
- Tests and CI use a throwaway database: locally a `conspectus-pg-test` container on port 5518 (in memory, `npm run db:test:up` / `db:test:down`), in CI a service container on the same port. Never Tural's database.
- Embedding columns have no dimension and there is no vector index yet; step 2 of #7 sets the type once its embedding model is chosen, while the tables are empty.

## Consequences

- Local test runs need Docker.
- Scripts under `scripts/` and `src/db/` run with Node's type stripping (`.ts` import specifiers, no `enum`), so no `tsx` dependency.
- Hosting is not decided; the database is wherever `DATABASE_URL` points.

## Alternatives considered

- Neon-hosted Postgres vs own Postgres (Decided #15): his choice was own Postgres.
- `pg` vs the `postgres` driver: not offered in refinement; `pg` is the build's own default (most used, Next keeps it external by default, Drizzle's migrator supports it).
- The refinement's one-screen comparison table was not recorded in the issue; only the decisions above are.
