# Front-end conventions — precedent for `mockups/` + `web/` (carried into the Django front-end)

Purpose: bake best-practice (best-of-breed, 2026) structural decisions into the static mockups so that whichever front-end direction is chosen, the rendering already inherits made decisions — no god-like JS/CSS files, clean separation of concerns, no build step. These conventions govern every `mockups/<x>/` and the `web/` pages **except `web/canonical.html`** (output-frozen) and **`web/data/plan-data.js`** (the shared data source canonical depends on — left as a classic global-setting script).

## JS — native ES modules, no god file
- **One module entry per page**: a single `<script type="module" src=".../main.js"></script>`. ES modules are scoped (no global-namespace pollution) and deferred (run after DOM parse).
- **Split by single responsibility** (include only those that apply to the page):
  - `data.js` — the sample data (`export const ...`). *(web/ pages: data comes from the shared `window.DATA`/`window.REF`/`window.PlanHelpers` set by `web/data/plan-data.js`; a thin `data.js` may re-export those, or `main.js` reads them directly.)*
  - `i18n.js` — translation strings + the language API (`setLang`/`t`), `export`ed.
  - `format.js` (or `helpers.js`) — pure formatters / id→label resolvers, **no DOM**.
  - `render.js` — functions that build DOM/markup from data (no event wiring).
  - `events.js` — event listeners / interaction handlers (toggles, drag, nav).
  - `main.js` — imports the above and bootstraps on `DOMContentLoaded`.
  - Add further focused modules (e.g. `dragboard.js`, `timeline.js`) when a concern is substantial. **Never a ~1000-line god file.**
- Use `import`/`export`; do not attach app state to `window` (the only permitted window reads are the shared `web/data/plan-data.js` globals for the `web/` pages).
- **Proportional**: don't over-fragment a small page — the goal is single-responsibility cohesion + no monolith, not maximal file count.
- **ESM requires http** (browsers block modules over `file://`). Preview by serving the directory: `python3 -m http.server` then open the printed URL. State this in each page's README (or an HTML comment) so the preview workflow is explicit.

## CSS — partials by concern, no god stylesheet
- Split into cascade-ordered partials:
  - `tokens.css` — CSS custom properties (palette, spacing, type scale) + base/reset element rules.
  - `layout.css` — page structure: grid, regions, columns, header/sidebar/main.
  - `components.css` — discrete UI components (cards, chips, badges, tables, drawer, buttons…).
  - `utilities.css` — only if the page uses utility classes.
- Link in order **tokens → layout → components** via multiple `<link rel="stylesheet">` (do **not** use `@import` — it serializes requests). Proportional: a tiny page may need only `tokens.css` + `components.css`.

## Disk layout (approaching Django templates/static)
- Mockups: `mockups/<x>/index.html` (the template) · `mockups/<x>/js/*.js` · `mockups/<x>/css/*.css`.
- web/: `web/<page>.html` (template) · `web/static/js/<page>/*.js` · `web/static/css/<page>/*.css`. The shared `web/data/plan-data.js` stays a **classic** `<script src>` loaded **before** the page's module entry (canonical.html shares it); page modules read its `window.*` globals.

## Invariants (every refactor under these conventions)
- Rendered output + behavior **identical** to before — extraction/modularization only, no logic or content change.
- The EN/简体中文 language toggle keeps working.
- No new frameworks, CDNs, or build tooling. Plain ES modules + plain CSS.
- `web/canonical.html` and `web/data/plan-data.js` are **not** modularized (canonical is the output-frozen WASC view; plan-data.js is the shared classic data source).
- Every JS module passes `node --check`; the page renders identically when served over http.

## Naming conventions

The precedent the Django template suites inherit. One scheme per identifier kind, applied uniformly across `mockups/<x>/` and the `web/` staff pages (excluding `web/canonical.html` + `web/data/plan-data.js`). The overriding rule: **identifiers a file owns are normalized; identifiers bound to the fixed data contract are not** (see "Data-contract boundary" below).

### CSS custom properties — `--<category>-<name>` kebab
Every token carries a category prefix so the role is legible at the use site:
- `--color-*` — all palette values. Shared semantic roles use one suffix everywhere:
  - text: `--color-ink` (primary), `--color-ink-soft` (secondary), `--color-ink-muted` (tertiary/faint — replaces the old `--muted` / `--faint` / `--ink-faint` spellings).
  - surfaces: `--color-bg` (page background — replaces `--canvas` / `--paper-edge`), `--color-surface` (panel/card — replaces `--panel` / `--paper`).
  - borders: `--color-border`, `--color-border-soft`, `--color-border-strong` (one family — replaces the parallel `--rule*` / `--line*` spellings).
  - brand/accent: `--color-accent` (+ `--color-accent-2` / `--color-accent-deep` / `--color-accent-bright` / `--color-accent-soft`), `--color-brand` (+ `--color-brand-2`) where a surface keeps a distinct brand hue. Status/semantic: `--color-good`, `--color-warn`, `--color-danger`.
  - surface-specific palette tokens keep their distinctive name under the prefix (`--color-milestone`, `--color-recur`, `--color-indef`, `--color-rag-green`, `--color-status-done`, `--color-tier-step`, `--color-rail`, `--color-phase-1`, …).
- `--size-*` — fixed layout dimensions (`--size-page-max`, `--size-row-h`, `--size-wbs-w`, `--size-month-w`).
- `--radius`, `--shadow` — single-value tokens keep the bare category name.
- Token defs live only in `tokens.css`; uses appear in CSS partials and in inline-style strings built by `render.js`. Renames update **all** sites (def + every `var(--…)`, CSS and JS) atomically.

Example: `--ink-faint` → `--color-ink-muted`; `--rule-soft` → `--color-border-soft`; `--maxw` → `--size-page-max`; `--st-done` → `--color-status-done`.

### CSS class names — kebab-case
All class selectors are kebab-case/lowercase (`step-detail`, `lang-toggle`, `drawer-body`, `rag-dot`). Each surface is an independent candidate template suite with its own stylesheet; class names are **not** force-merged across surfaces (a status badge may be `.ss-status` in one suite and `.blocked-badge` in another — genuinely separate components in separate suites). Within a suite, the same concept uses the same class. New classes follow flat component-kebab (`block-element` reading), not BEM underscores.

### JS identifiers — camelCase
Functions/variables are camelCase; module files keep the single-responsibility names (`data` / `i18n` / `format` / `render` / `events` / `main`, plus focused extras like `board` / `steps` / `rollup` / `state`). No app state on `window`; the only permitted `window` reads are the shared `web/data/plan-data.js` globals (`window.DATA` / `window.REF` / `window.PlanHelpers`) on the `web/` pages.

### Element ids and `data-*` attributes — kebab-case
Both are kebab-case (`drawer-body`, `role-select`, `crumb-plan`; `data-step-idx`, `data-i18n`, `data-lang`). Ids are referenced via `getElementById` / `querySelector("#id")` / `<label for>`; dynamically-created ids (set in an `innerHTML` template, then queried) follow the same scheme. Renames update HTML + JS together.

Example: `drawerBody` → `drawer-body`; `roleSelect` → `role-select`; `crumbPlan` → `crumb-plan`.

### i18n keys — snake_case, with data-bound namespaces
UI-chrome keys are `snake_case` (`add_milestone`, `app_name`, `steps_title`, `save_later`). Two structural forms coexist and are both valid:
- **Flat snake_case** for static labels (`t("add_milestone")`).
- **Dotted namespace** where a key is *concatenated with a fixed model data value* at lookup time — e.g. `t("ss." + status)`, `t("ev." + status)`, `t("vk." + kind)`, `t("lc-" + lifecycle)`. Here the prefix (`ss.`, `ev.`, `vk.`, `sec.`, `rel.`) is the namespace and the suffix **mirrors the data value verbatim** (`ss.not-started`, `ev.verified`). The suffix is **locked to the data contract** and is never renamed; only the namespace prefix is owned by the file.
- `en` and `zh` (`zh_Hans` / `zh-Hans`) sub-dictionaries always carry identical key sets.

### Data-contract boundary (what is NOT renamed)
`web/data/plan-data.js` and the Django model field/value names are a fixed contract. The page modules read `window.DATA` / `window.REF` / `window.PlanHelpers` and build classes / ids / i18n keys by concatenating literal prefixes with **data values** (`class="lc-${plan.lifecycle}"`, `id="ms-${m.id}"`, `t("ss." + step.status)`). The literal prefix is renamable; the interpolated data value (`lifecycle`, `status`, `improvement_type`, snake_case model field names) is **not** — renaming it would desynchronize the lookup from the data source. When a normalization would require touching an interpolated data value, the identifier is left as-is (its suffix is part of the data contract, not file-owned naming).
