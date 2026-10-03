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
- Do not change grid tile focus selectors or `--focus-ring` rules in `newtab.css` except moving shared `:root` tokens to `design-tokens.css`.

---

### Task 0: Spec review gate

**Files:**
- Modify: `docs/design-system.md` (wording: target spec vs pre-Phase-1 checkout; AS-DS-1…10)

- [ ] **Step 1:** Read `docs/design-system.md` end-to-end; confirm intro does **not** claim split CSS already exists; Status reflects Phase 1 pending; Non-goals waive keyboard/error/copy AS per spec.

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

### Task 1: `design-tokens.css` + HTML wiring (serves AS-DS-5)

**Files:**
- Create: `src/design-tokens.css`
- Modify: `src/newtab.html`
- Create: `test/designSystem.test.js`

**Interfaces:**
- Produces: CSS custom properties consumed by later tasks (`--control-height`, `--radius-control`, color aliases, etc.).

- [ ] **Step 1: Write failing test**

Create `test/designSystem.test.js` (minimum tokens; expand in Task 3 for AS-DS-10):

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

Move the `:root` color block from the start of `newtab.css` into this file. Add semantic tokens from the spec; keep **legacy aliases** (`--bg`, `--panel`, `--text`, …) so grid rules in `newtab.css` keep working.

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

**E2E-first (this task owns the red scenario for AS-DS-1…4; Tasks 3–4 turn it green):**

- [ ] **Step 1:** Add scenario with explicit branches and tolerances from the spec:

  - **Add link (AS-DS-1, AS-DS-3, AS-DS-4 desktop):** open Add link; reveal custom icon + manual color (same `page.evaluate` clicks as `dg-39-dialog-narrow.mjs`); measure border-box heights **40px ± 0.5px** for `.favorite-input`, `.segmented` outer box, `.button`; `border-radius` **8px** on input/button/segmented; `.desktop-dialog__title` `margin-bottom` **12px ± 1px** via `getComputedStyle`.
  - **Change city (AS-DS-2, AS-DS-4 city):** open from **weather edit** (primary flow from `dg-29-weather-modal.mjs`: edit weather tile → Change city → `#city-modal`), **not** first-run `dg-15-city-first-run.mjs`. `context.route` geocoding API; fill search; wait for `.weather-form__suggestion`; measure field, suggestion rows, footer buttons at **40px ± 0.5px**; clear `.icon-button` **36px ± 0.5px** with **2px** inset from field top/right (`getBoundingClientRect` vs field box); `.city-modal__title` margin **12px ± 1px** after Task 4 (expect FAIL on 8px until surfaces migration).
  - Reuse harness patterns from `dg-29-weather-modal.mjs` and `15-city-modal-layout.mjs` (`openChange`, geocode routing).

- [ ] **Step 2:**

```bash
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-41
```

Expected: **FAIL** on height/radius/title until Tasks 3–4. Paste failing assertion line into private commit message or task ledger.

- [ ] **Step 3:** Commit in private repo:

```bash
git -C .private add e2e/scenarios/dg-41-control-metrics.mjs
git -C .private commit -m "test(e2e): overlay control metrics (AS-DS-1…4)"
```

---

### Task 3: `controls.css` migration (serves AS-DS-1…3, AS-DS-6, AS-DS-10)

**Files:**
- Modify: `src/controls.css`, `src/newtab.css`, `test/designSystem.test.js`

**Note:** E2E red was in Task 2; this task implements until `dg-41` passes.

- [ ] **Step 1:** Add tests forbidding `height: 34px`, `min-height: 44px`, `min-height: 36px` on `.add-menu__item` in `controls.css`; require `var(--control-height)` and segmented `calc(var(--control-height) - 2 * var(--control-border-width))`.

- [ ] **Step 2:** Move from `newtab.css`: `.icon-button`, `.favorite-form*` row chrome (not dialog reset), `.segmented*`, `.favorite-input`, `.favorite-color-input`, `.button*`, `.text-button`, `.weather-form` field/clear/suggestion rows, `.add-menu__item`. Apply spec: unified heights/radii; clear `top/right: 2px`; remove city **44px** override.

- [ ] **Step 3:**

```bash
npm test && npm run check
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-41
```

Expect `dg-41` green for control heights/radius; city title margin may still fail until Task 4.

- [ ] **Step 4: Commit** — `feat: migrate overlay controls to design tokens`

---

### Task 4: `surfaces.css` migration (serves AS-DS-4, AS-DS-6)

**Files:**
- Modify: `src/surfaces.css`, `src/newtab.css`

- [ ] **Step 1:** Move backdrops, `.desktop-dialog*`, `.city-modal*`, `.add-menu` shell, `.weather-form__suggestions` panel, overlay `:focus-visible` rules for dialog/city. Unify `.city-modal__title` and `.desktop-dialog__title` to `margin: 0 0 var(--title-margin-bottom)`.

- [ ] **Step 2:**

```bash
npm test && npm run check
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-41
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-40
```

- [ ] **Step 3: Commit** — `feat: migrate modal and popover surfaces to design tokens`

---

### Task 5: Update narrow E2E (serves AS-DS-7)

**Files:**
- Modify: `.private/e2e/scenarios/dg-39-dialog-narrow.mjs`

- [ ] **Step 1:** Change segmented height check to target **40px ± 0.5px** (replace `lines.every((l) => l[1] <= 40)` with equality band or `>= 39.5 && <= 40.5`).

- [ ] **Step 2:**

```bash
node .private/e2e/run.mjs --repo . --base 67b3e32 --only dg-39
```

- [ ] **Step 3:** Commit private — `test(e2e): narrow dialog segmented height 40px (AS-DS-7)`

---

### Checkpoint: design review after Tasks 3–5

**Task 6 and Task 7 do not start until checkpoint gate passes.**

- [ ] `node .private/design-review/tools/init-run.mjs --checkout . --spec docs/design-system.md --kind checkpoint`
- [ ] Lenses `1-scenarios`, `2-visual` (Composer 2.5) + skeptics; `node .private/design-review/tools/merge.mjs <run-dir>`
- [ ] Fix Critical/Important (≤3 rounds, `--round N --prev <run>`)
- [ ] `node .private/design-review/tools/gate.mjs --kind checkpoint` → exit 0
- [ ] Ledger: `Checkpoint: passed (<run-id>)`

---

### Task 6: Docs and changelog

**Files:**
- Modify: `docs/architecture.md` (CSS files + link to design system)
- Modify: `CHANGELOG.md` `[Unreleased]`

- [ ] Commit — `docs: design system phase 1 in architecture and changelog`

---

### Task 7: Final design review gate

- [ ] Full `npm test && npm run check`
- [ ] Full E2E: `node .private/e2e/run.mjs --repo . --base 67b3e32`
- [ ] `node .private/design-review/tools/init-run.mjs --checkout . --spec docs/design-system.md` (kind=final, default)
- [ ] Three lenses (`1-scenarios`, `2-visual`, `3-a11y-copy`) + three skeptics; `merge.mjs`
- [ ] Fix Critical/Important (≤3 rounds); `node .private/design-review/tools/gate.mjs` → exit 0
- [ ] Ledger: `Final design review: passed (<run-id>)`

---

## Plan self-review

| AS | Tasks | Tests |
|----|-------|-------|
| AS-DS-1…4 | 2–4 | `dg-41` |
| AS-DS-5 | 1 | `designSystem.test.js` |
| AS-DS-6 | 3–4 | `focusTokens.test.js`, `dg-40` |
| AS-DS-7 | 5 | `dg-39` |
| AS-DS-8 | — (unchanged) | `dg-40` |
| AS-DS-9 | — (design review) | — |
| AS-DS-10 | 3 | `designSystem.test.js` |

Known gaps before execution: `dg-41` and `designSystem.test.js` do not exist until Tasks 2 and 1. Checkpoint ordering fixed (before Task 6). E2E-first red centralized in Task 2 for metrics AS.

**Note:** Mirror this plan to `.private/superpowers/plans/` when writing there is allowed (optional duplicate for private notes).
