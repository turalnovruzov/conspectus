# 0001. Frontend Stack: React, Vite, TypeScript, d3-geo

- **Status**: Accepted
- **Date**: 2026-10-26

## Context

This is the project's first code. The first page is a flat world map with a few made-up situations; a graph view may come later, and so may news agents. For now it is frontend only, with no backend (Tural, issue #2).

## Decision

We build the page with React, Vite and TypeScript. The map is drawn with `d3-geo` (projection and paths), `topojson-client` and `world-atlas` (country shapes). Unit tests run on Vitest and end-to-end tests on Playwright. Packages come from npm and CI runs on GitHub Actions. A backend is deferred to the step where news agents arrive.

## Consequences

- One toolchain for the page, its tests and the later graph view.
- The map data is bundled with the page, so the page needs no network at runtime.
- Unit tests cover pure functions in Node; the DOM is covered by Playwright, so there is no DOM-testing library.
- A backend, when it comes, is a separate decision.

## Alternatives considered

| Option | What it buys | What it costs | Recommendation |
|---|---|---|---|
| React + Vite + TS + d3-geo | Most common; best for a graph view later; his other project is React | A bit heavier | Recommended, chosen |
| Svelte + Vite + TS | Lighter | Smaller ecosystem for graphs | |
| Plain TS | Smallest | Messy as it grows | |
| MapLibre tiles | Street map | Opposite of "from above"; not a fit | |
