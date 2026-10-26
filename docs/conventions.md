<!-- seeded by Codery from template product-owner @ 0.5.0; this file is the project's own from here on -->

# Conventions

The house style for writing code in this repo: how *this* codebase does things, so the next session does them the same way instead of inventing a second way.

## Entries

Each entry is: **Rule** → **Why** → **Minimal example** → **Gotcha**. Entries arrive from the auditor noticing that a change established a convention.

### Map and list elements carry `data-*` state attributes

- **Rule:** every country path and situation card exposes its state as `data-*` attributes: `data-country` (ISO numeric id, or the name when the shape has none), `data-state` (the role, or `none`), `data-selected`, and `data-situation` on cards. e2e tests assert on these, not on CSS or pixels.
- **Why:** map state is testable without screenshots and survives look changes.
- **Example:** `await expect(page.locator('[data-country="792"]')).toHaveAttribute('data-state', 'supporting')`
- **Gotcha:** colour is a `fill` attribute on the path, so it can be asserted too. The country key is `id ?? name` because three countries-110m shapes have no id.
