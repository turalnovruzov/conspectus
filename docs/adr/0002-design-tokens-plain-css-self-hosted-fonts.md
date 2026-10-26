# 0002. Design Tokens: Plain CSS, Self-Hosted OFL Fonts

- **Status**: Accepted
- **Date**: 2026-10-26

## Context

Issue #3 asks for a design system. Tural chose the "E · Night side" board: Swiss grid and type, a dark ground, one warm accent. No framework or library, fonts kept in the repo, and no request to a third party from the page were settled in refinement as defaults he did not object to; his own choice was style E (Night side).

## Decision

- Tokens are CSS custom properties in `src/design/tokens.css`; components are plain CSS classes in `src/design/components.css`.
- The style guide is a static page, `style-guide.html`, built as a second Vite entry.
- Inter and JetBrains Mono are committed as woff2 files under the SIL Open Font License, each with its licence. Where each file came from is recorded in `src/design/fonts/SOURCES.md`.
- The tests ride Vitest and Playwright from [ADR 0001](./0001-frontend-stack-react-vite-typescript-d3-geo.md); no new dependency.

## Consequences

- The map page adopts the tokens in a later step; nothing is restyled yet.
- The page makes no CDN request at runtime.
- Updating a font is a manual download, recorded in `SOURCES.md`.

## Alternatives considered

| Option | What it buys | What it costs | Verdict |
|---|---|---|---|
| Google Fonts CDN | No font files in the repo | A third-party service; a request leaves the site | Rejected: fonts stay self-hosted |
| `@fontsource` npm packages | Managed font updates | A new dependency | Rejected: no new dependency |
| CSS framework or token tool (Tailwind, Style Dictionary) | Generated tokens and utilities | A new library | Rejected: no framework or library |
| Plain CSS custom properties | Nothing to install or learn | Manual upkeep | Chosen |
