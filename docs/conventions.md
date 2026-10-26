<!-- seeded by Codery from template product-owner @ 0.5.0; this file is the project's own from here on -->

# Conventions

The house style for writing code in this repo: how *this* codebase does things, so the next session does them the same way instead of inventing a second way.

## Entries

Each entry is: **Rule** → **Why** → **Minimal example** → **Gotcha**. Entries arrive from the auditor noticing that a change established a convention.

### Map and list elements carry `data-*` state attributes

- **Rule:** every country path and situation card exposes its state as `data-*` attributes: `data-country` (ISO numeric id, or the name when the shape has none), `data-state` (the role, or `none`) and `data-selected` on paths, and `data-situation` on cards (a card's selection is `aria-pressed`, not `data-selected`). e2e tests assert on these, not on CSS or pixels.
- **Why:** map state is testable without screenshots and survives look changes.
- **Example:** `await expect(page.locator('[data-country="792"]')).toHaveAttribute('data-state', 'supporting')`
- **Gotcha:** colour is no longer a `fill` attribute (it comes from classes): assert `data-state` or `data-involvement`, and the computed `fill` when colour matters. The country key is `id ?? name` because three countries-110m shapes have no id.

### Design values come from tokens, never raw

- **Rule:** design colours and sizes are used only through `var(--token)` from `src/design/tokens.css`; components (`src/design/components.css`) and pages carry no raw `#hex`, `rgb(` or `hsl(`, and no SVG `fill=`/`stroke=`/`stop-color=` attributes. SVG gets its colour from classes.
- **Why:** one source for the Night side palette, and contrast is checked by test against the tokens.
- **Example:** `.btn-accent { background: var(--color-accent); color: var(--color-on-accent); }`
- **Gotcha:** the tests match `#[0-9a-f]{3,8}`, so write `·` and other non-ASCII characters literally, never as numeric entities like `&#183;`, and avoid hex-like ids such as `face` or `add`. Reading CSS with `?raw` in Vitest needs the `css.include` raw rule in `vite.config.ts`.

### An app rule that must beat a design-system class uses an extra class, never source order

- **Rule:** when a rule in the app's CSS has to win over a class from the shared `src/design/components.css`, raise its specificity with an extra class; never rely on which file comes later.
- **Why:** the production build splits `src/design/components.css` into a chunk that loads after the app's CSS, while dev loads it before, so source order differs between dev and prod.
- **Example:** `.land.country-selected { stroke: var(--color-text); }`
- **Gotcha:** it looks fine in `npm run dev`; check computed styles under `vite preview`, which the e2e suite does.
