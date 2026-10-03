# Design system Phase 2 (grid / tiles / page chrome) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tokenize grid/tile/status/tooltip chrome in `src/newtab.css` per `docs/design-system.md` (Phase 2 §), without changing grid engine behavior, drag/repack, weather tones, copy, or tile focus rules.

**Architecture:** Add grid/page tokens to `src/design-tokens.css`; replace literals in `src/newtab.css` with `var(--…)`; extend `test/designSystem.test.js` and `test/newtabSource.test.js` as needed; add E2E metrics scenario `dg-42-grid-chrome-metrics.mjs`. **Do not** move rules to new CSS files or edit `controls.css` / `surfaces.css` except if a stray literal is discovered (should not happen).

**Tech stack:** Vanilla CSS (no build), Node 20+ test runner, Playwright E2E in `.private/e2e/`.

## Global Constraints

- No third-party dependencies; no build step.
- User-facing strings and DOM structure unchanged.
- `npm test` and `npm run check` must pass before merge.
- UI phase: spec gate → implement → checkpoint → final gate (`node .private/design-review/tools/gate.mjs`).
- **E2E base commit:** `--base ea00c29` (merge of `feat/design-system-v1`; use current `main` tip if later fixes are unrelated).
- Stage commits by explicit paths only (never `git add -A`).
- Plan spec for all review kinds: `docs/design-system.md` (Phase 2 sections + AS-DS-11…22).
- **Hard rule (carry from Phase 1):** Do not change tile focus selector semantics or replace focus outline literals with custom properties in ways that break `test/focusTokens.test.js`.
- **No `newtab.js` changes** unless the spec is amended (Phase 2 assumes JS grid vars stay as-is).
- Design review subagents: `quiet-tab-design-reviewer` with prompts from `.private/design-review/runs/<id>/prompts/`; model **Composer 2.5**; ≤3 parallel agents.
- Private E2E commits: `git -C .private add …` and `git -C .private commit`.

---

### Task 0: Spec review gate

**Files:**
- Modify: `docs/design-system.md` (Phase 2 §, AS-DS-11…22, Status line)

- [ ] **Step 1:** Read Phase 2 sections end-to-end; confirm Status says **implementation pending**; Non-goals and Accepted exceptions cover focus literals and JS grid vars.

- [ ] **Step 2:** Run spec init (from repo root):

```bash
node .private/design-review/tools/init-run.mjs --checkout . --spec docs/design-system.md --kind spec
```

Use `--round N --prev <run-dir>` for follow-up rounds after spec edits.

- [ ] **Step 3:** Run lens `0-spec` (Composer 2.5 per owner) + skeptic; merge:

```bash
node .private/design-review/tools/merge.mjs <run-dir>
```

- [ ] **Step 4:** Fix spec for Critical/Important (≤3 rounds); re-gate:

```bash
node .private/design-review/tools/gate.mjs --kind spec --spec docs/design-system.md
```

Expected: exit **0**. Ledger: `Spec review: passed (<run-id>)`.

**Task 1 does not start until Step 4 passes.**

---

### Task 1: Grid v2 tokens in `design-tokens.css` (serves AS-DS-15, AS-DS-16)

**Files:**
- Modify: `src/design-tokens.css`
- Modify: `test/designSystem.test.js`

**Interfaces:**
- Declares Phase 2 tokens listed in spec § Grid / tile tokens; values match current shipped literals.

- [ ] **Step 1: Write failing tests**

Extend `test/designSystem.test.js` with a `describe("grid / page chrome tokens (AS-DS-16)")` block asserting presence of:

- `--radius-tile: 13px;`
- `--radius-drop-highlight: 14px;`
- `--radius-status-chip: 10px;`
- `--shadow-status: var(--shadow-popover);`
- `--status-chip-padding-y: 10px;`, `--status-chip-padding-x: 14px;`, and
  `--status-chip-offset-bottom: 16px;`
- `--tile-remove-size: 24px;` and `--tile-remove-offset: 8px;`
- Four `--font-size-weather-*-cell-*` tokens
- `--line-height-page: 1.45;`
- `--space-grid-8: 8px;`, `--space-grid-10: 10px;`, `--space-grid-12: 12px;`

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test test/designSystem.test.js
```

- [ ] **Step 3:** Add tokens to `design-tokens.css` under Radius / Elevation / new "Grid chrome" comment; add a short comment block listing **runtime** grid vars set by `newtab.js` (names only, no values).

- [ ] **Step 4:**

```bash
node --test test/designSystem.test.js && npm test && npm run check
```

- [ ] **Step 5: Commit**

```bash
git add src/design-tokens.css test/designSystem.test.js
git commit -m "feat: add design tokens for grid and page chrome (phase 2)"
```

---

### Task 2: E2E grid chrome metrics — red (serves AS-DS-11…14)

**Files:**
- Create: `.private/e2e/scenarios/dg-42-grid-chrome-metrics.mjs`

**E2E-first (red until Task 3–4):**

- [ ] **Step 1:** Add scenario with tolerances **± 0.5px** for radii/font-size (same spirit as `dg-41-control-metrics.mjs`):

  - **Tiles (AS-DS-11):** Seed grid with favorite + default metrics + chrome; at **500×800** measure `border-radius` on `.favorite-tile`, `.chrome-tile`, `.weather-tile` (and `.city-hint-tile` if seeded without city).
  - **Drop highlight (AS-DS-12):** Enter edit mode; pointer-drag a tile until `.drop-highlight` is visible; measure **14px** radius.
  - **Status chip (AS-DS-13):** `failStorageInit(context, { area: "sync", op: "set", key: "quietTabWidgetsMeta" })` then edit-mode drag (first block of `dg-37-write-failure.mjs`); assert status visible with sync error text; measure radius **10px**, font-size **14px**, padding **10px** / **14px**, `bottom` **16px**, and `box-shadow` vs `var(--shadow-popover)` (computed style or reference element).
  - **Tooltip (AS-DS-14):** Normal mode hover weather tile; measure `#tooltip` radius **8px** and shadow.

  Reuse `harness.mjs` seed helpers from `dg-38-tooltip-modes.mjs` and edit/drag helpers from `dg-05-drag-widget.mjs`.

- [ ] **Step 2:**

```bash
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-42
```

Expected: **FAIL** until Tasks 3–4.

- [ ] **Step 3:** Commit in private repo:

```bash
git -C .private add e2e/scenarios/dg-42-grid-chrome-metrics.mjs
git -C .private commit -m "test(e2e): grid chrome metrics (AS-DS-11…14)"
```

---

### Task 3: Migrate `newtab.css` radii, shadows, remove badge (serves AS-DS-7, AS-DS-11, AS-DS-12, AS-DS-14, AS-DS-17, AS-DS-18)

**Files:**
- Modify: `src/newtab.css`
- Modify: `test/designSystem.test.js`

- [ ] **Step 1:** Add failing tests forbidding `border-radius: 13px` on tile selectors and `14px` on `.drop-highlight`; require `var(--radius-tile)`, `var(--radius-drop-highlight)`, `var(--shadow-tooltip)` on `.tooltip`, `var(--shadow-status)` or equivalent on `.desktop-status`, `var(--radius-status-chip)`, status-chip padding/offset tokens on `.desktop-status`, tile-remove size/offset tokens. Extend overlay control tests for **AS-DS-7**: assert `.segmented__option` in `controls.css` uses `height: calc(var(--control-height) - 2 * var(--control-border-width))` (inner **38px** at default tokens; pairs with `dg-39` outer `.segmented` **40px**).

- [ ] **Step 2:** Replace literals in `newtab.css` for: tile classes, `.drop-highlight`, `.desktop-status` (radius, shadow, padding, bottom offset), `.tooltip` (radius, shadow), `.tile-remove` dimensions/offsets; replace shipped **8 / 10 / 12 px** tile and tooltip spacing with `var(--space-grid-*)` (leave **6px** 2×2 favorite `gap` literal per spec). **Do not** edit focus `outline` lines.

- [ ] **Step 3:**

```bash
npm test && npm run check
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-42
```

Expect `dg-42` green for radii/shadows; status font-size may still need Task 4.

- [ ] **Step 4: Commit** — `refactor: tokenize grid tile and page chrome radii in newtab.css`

---

### Task 4: Typography and weather cell font tokens (serves AS-DS-15, AS-DS-19)

**Files:**
- Modify: `src/newtab.css`
- Modify: `test/designSystem.test.js`
- Modify: `test/newtabSource.test.js` (update `data-cell` rules to reference `var(--font-size-weather-…)` if regex asserts literal `16px` etc.)

- [ ] **Step 1:** `body { font-family: var(--font-family); line-height: var(--line-height-page); }` (remove duplicate stack / **1.45** literals).
- [ ] **Step 2:** `.status` / `.desktop-status` use `var(--font-size-md)` and `var(--line-height-body)` where spec applies.
- [ ] **Step 3:** Replace `:root[data-cell="…"]` font-size literals with the four new tokens.
- [ ] **Step 4:**

```bash
npm test && npm run check
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-42
```

- [ ] **Step 5: Commit** — `refactor: adopt typography tokens on grid page chrome`

---

### Checkpoint: design review after Tasks 3–4

**Task 5 and Task 6 do not start until checkpoint gate passes.**

- [ ] `node .private/design-review/tools/init-run.mjs --checkout . --spec docs/design-system.md --kind checkpoint`
- [ ] Lenses `1-scenarios`, `2-visual` (Composer 2.5) + skeptics; `node .private/design-review/tools/merge.mjs <run-dir>`
- [ ] Fix Critical/Important (≤3 rounds, `--round N --prev <run>`)
- [ ] `node .private/design-review/tools/gate.mjs --kind checkpoint` → exit 0
- [ ] Ledger: `Checkpoint: passed (<run-id>)`

---

### Task 5: Docs and changelog

**Files:**
- Modify: `docs/architecture.md` (Stylesheets § — phase 2 token scope in `design-tokens.css` / `newtab.css`)
- Modify: `docs/design-system.md` (Status → Phase 2 **implemented** when code matches spec)
- Modify: `CHANGELOG.md` `[Unreleased]`

- [ ] Commit — `docs: design system phase 2 in architecture and changelog`

---

### Task 6: Final design review gate

- [ ] Full `npm test && npm run check`
- [ ] Regression E2E subset:

```bash
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-42
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-38
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-10
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-03
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-05
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-39
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-40
node .private/e2e/run.mjs --repo . --base ea00c29 --only dg-41
```

- [ ] Full E2E: `node .private/e2e/run.mjs --repo . --base ea00c29` (long run; required before merge per project practice)
- [ ] `node .private/design-review/tools/init-run.mjs --checkout . --spec docs/design-system.md` (kind=final, default)
- [ ] Three lenses (`1-scenarios`, `2-visual`, `3-a11y-copy`) + three skeptics; `merge.mjs`
- [ ] Fix Critical/Important (≤3 rounds); `node .private/design-review/tools/gate.mjs` → exit 0
- [ ] Ledger: `Final design review: passed (<run-id>)`

---

## Plan self-review

| AS | Tasks | Tests |
|----|-------|-------|
| AS-DS-11 | 2–3 | `dg-42` |
| AS-DS-12 | 2–3 | `dg-42` |
| AS-DS-13 | 2–3 | `dg-42` |
| AS-DS-14 | 2–3 | `dg-42` |
| AS-DS-15 | 1, 4 | `designSystem.test.js` |
| AS-DS-16 | 1 | `designSystem.test.js` |
| AS-DS-17 | 3 | `designSystem.test.js` |
| AS-DS-18 | 3 | `focusTokens.test.js`, `dg-40` |
| AS-DS-19 | 4 | `newtabSource.test.js`, `dg-10` |
| AS-DS-20 | — | `dg-03`, `dg-05`, `dg-10` |
| AS-DS-21 | — | `dg-38` |
| AS-DS-22 | — | `dg-39`, `dg-41` |

**Gaps / manual:**
- AS-DS-13 E2E trigger is fixed: `failStorageInit` + drag (mirror `dg-37` block 1).
- Status `box-shadow` cross-check in E2E may compare computed styles to a fixture element rather than parsing token CSS.
- Full E2E (~8+ min) remains manual gate in Task 6; checkpoint does not replace it.
- `weatherSource.test.js` concatenates CSS — run `npm test` after token moves if tooltip/tile rules affect weather page bundle assertions.

**Ordering:** Checkpoint after Tasks 3–4 (highest visual risk) before docs Task 5. Task 0 spec gate is **not** executed in the spec-authoring session that produced this plan.

**Private plan copy:** Not required. Phase 1 plan lives only in `docs/plans/`; the v1 plan mentioned an optional duplicate in `.private/superpowers/plans/`, but that path was never used in-repo. Keep a single plan in `docs/plans/` unless you explicitly want a notes-repo copy for offline agents.
