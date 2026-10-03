# Design system v1 (controls + surfaces) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split overlay UI styling into token-driven stylesheets, unify overlay control metrics per `docs/design-system.md`, and lock behavior with unit + E2E tests.

**Architecture:** Extract rules from `src/newtab.css` into `design-tokens.css`, `controls.css`, and `surfaces.css`; link them before `newtab.css` in `newtab.html`. Replace magic numbers with `var(--…)` tokens; keep grid/tile rules in `newtab.css` for phase 1.

**Tech stack:** Vanilla CSS (no build), Node 20+ test runner, Playwright E2E in `.private/e2e/`.

## Global Constraints

- No third-party dependencies; no build step.
- User-facing strings unchanged; DOM structure/class names preserved unless tests require updates.
- `npm test` and `npm run check` must pass before merge.
- UI phase: spec gate → implement → checkpoint → final gate (`node .private/design-review/tools/gate.mjs`).
- E2E base commit: `--base 67b3e32` when running full harness.
- Stage commits by explicit paths only (never `git add -A`).
- Plan spec for review: `docs/design-system.md`.

---

### Task 0: Spec review gate

**Files:**
- Modify: `docs/design-system.md` (Acceptance scenarios / Review focus — present after 2026-10-03 update)

- [ ] **Step 1:** Read `docs/design-system.md` end-to-end; confirm Non-goals, Accepted exceptions, AS-DS-1…7, Review focus.

- [ ] **Step 2:** Run spec init (from repo root):

```bash
node .private/design-review/tools/init-run.mjs --checkout . --spec docs/design-system.md --kind spec
```

- [ ] **Step 3:** Run lens `0-spec` (Sonnet) + skeptic per `.private/design-review/PROTOCOL.md`; merge findings:

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

### Task 1: `design-tokens.css` + HTML wiring (serves AS-DS-5)

**Files:**
- Create: `src/design-tokens.css`
- Modify: `src/newtab.html`
- Create: `test/designSystem.test.js`

**Interfaces:**
- Produces: CSS custom properties consumed by later tasks (`--control-height`, `--radius-control`, color aliases, etc.).

- [ ] **Step 1: Write failing test**

Create `test/designSystem.test.js`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("design system wiring", () => {
  it("loads stylesheets in token → control → surface → app order", async () => {
    const html = await readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
    const hrefs = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ["design-tokens.css", "controls.css", "surfaces.css", "newtab.css"]);
  });

  it("defines core control tokens", async () => {
    const css = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    assert.match(css, /--control-height:\s*40px;/);
    assert.match(css, /--radius-control:\s*8px;/);
    assert.match(css, /--title-margin-bottom:\s*12px;/);
    assert.match(css, /--control-disabled-opacity:\s*0\.62;/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test test/designSystem.test.js
```

- [ ] **Step 3: Create `src/design-tokens.css`**

Move `:root` color blocks from `newtab.css` (lines 1–36) into this file. Add semantic tokens from the spec; keep **legacy aliases** (`--bg`, `--panel`, `--text`, …) so grid rules in `newtab.css` keep working.

Required tokens (minimum):

```css
--control-height: 40px;
--control-border-width: 1px;
--control-padding-x: 12px;
--control-padding-x-button: 14px;
--control-gap-icon: 6px;
--control-disabled-opacity: 0.62;
--radius-control: 8px;
--radius-popover: 12px;
--radius-modal: 16px;
--title-margin-bottom: 12px;
--surface-modal-padding: 20px;
--surface-backdrop: rgb(0 0 0 / 50%);
--shadow-modal: 0 24px 70px rgb(0 0 0 / 32%);
--shadow-popover: 0 12px 32px rgb(0 0 0 / 18%);
--focus-overlay-ring: var(--soft-ring);
```

Create placeholder `src/controls.css` and `src/surfaces.css` (comment only). Update `newtab.html` with four `<link>` tags in order. Remove duplicate `:root` from top of `newtab.css`.

- [ ] **Step 4: Run tests**

```bash
node --test test/designSystem.test.js && npm test && npm run check
```

- [ ] **Step 5: Commit**

```bash
git add src/design-tokens.css src/controls.css src/surfaces.css src/newtab.html src/newtab.css test/designSystem.test.js
git commit -m "feat: add design token stylesheet and load order"
```

---

### Task 2: E2E control metrics — red (serves AS-DS-1…4)

**Files:**
- Create: `.private/e2e/scenarios/dg-41-control-metrics.mjs`

- [ ] **Step 1:** Add scenario measuring **40px** heights on Add link (inputs, `.segmented`, `.button`), **8px** radius, title `margin-bottom` **12px**; city modal branch with field, suggestions, **36px** clear at **2px** inset — copy open-flow from `dg-29-weather-modal.mjs` / `dg-15-city-first-run.mjs`.

- [ ] **Step 2:**

```bash
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-41
```

Expected: **FAIL** on height/radius until Task 3.

- [ ] **Step 3:** Commit in private repo:

```bash
git -C .private add e2e/scenarios/dg-41-control-metrics.mjs
git -C .private commit -m "test(e2e): overlay control metrics (AS-DS-1…4)"
```

---

### Task 3: `controls.css` migration (serves AS-DS-1…3, AS-DS-6)

**Files:**
- Modify: `src/controls.css`, `src/newtab.css`, `test/designSystem.test.js`

- [ ] **Step 1:** Add test forbidding `height: 34px`, `min-height: 44px`, `min-height: 36px` on `.add-menu__item` in `controls.css`; require `var(--control-height)` and segmented `calc(var(--control-height) - 2 * var(--control-border-width))`.

- [ ] **Step 2:** Move from `newtab.css`: `.icon-button`, `.favorite-form*` row chrome (not dialog reset), `.segmented*`, `.favorite-input`, `.favorite-color-input`, `.button*`, `.text-button`, `.weather-form` field/clear/suggestion rows, `.add-menu__item`. Apply spec: unified heights/radii; clear `top/right: 2px`; remove city **44px** override.

- [ ] **Step 3:**

```bash
npm test && npm run check
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-41
```

- [ ] **Step 4: Commit** — `feat: migrate overlay controls to design tokens`

---

### Task 4: `surfaces.css` migration (serves AS-DS-4, AS-DS-6)

**Files:**
- Modify: `src/surfaces.css`, `src/newtab.css`

Move: backdrops, `.desktop-dialog*`, `.city-modal*`, `.add-menu` shell, `.weather-form__suggestions` panel, overlay `:focus-visible` rules for dialog/city. Unify `.city-modal__title` and `.desktop-dialog__title` to `margin: 0 0 var(--title-margin-bottom)`.

- [ ] Run `dg-41`, `dg-40-dialog-focus.mjs`, `npm test`.

- [ ] Commit — `feat: migrate modal and popover surfaces to design tokens`

---

### Task 5: Update AS-10 narrow E2E (serves AS-DS-7)

**Files:**
- Modify: `.private/e2e/scenarios/dg-39-dialog-narrow.mjs` (segmented height expectation **40px**)

- [ ] Run `--only dg-39`; commit private.

---

### Task 6: Docs and changelog

**Files:**
- Modify: `docs/architecture.md` (CSS files + link to design system)
- Modify: `CHANGELOG.md` `[Unreleased]`

- [ ] Commit — `docs: design system phase 1 in architecture and changelog`

---

### Checkpoint: design review after Tasks 3–5

- [ ] `init-run.mjs --kind checkpoint --spec docs/design-system.md`
- [ ] Lenses `1-scenarios`, `2-visual` + merge; fix ≤3 rounds
- [ ] `gate.mjs --kind checkpoint` → exit 0

---

### Task 7: Final design review gate

- [ ] `npm test && npm run check`
- [ ] Full E2E with `--base 67b3e32`
- [ ] `init-run.mjs` kind=final; three lenses; `gate.mjs` exit 0

---

## Plan self-review

All AS-DS-* items map to Tasks 1–5 and E2E/unit tests. Phase 2 grid tokens excluded. No TBD steps.

**Note:** Mirror this plan to `.private/superpowers/plans/` when writing there is allowed (optional duplicate for private notes).
