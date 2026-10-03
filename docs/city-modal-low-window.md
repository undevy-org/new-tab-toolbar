# City modal in a very low window: buttons cut off at rest

## Status

`draft, review 1 applied, awaiting re-review` (see `low-window-spec-review.md`)

## Intake log

| Date | Raw note (independent verification of the city-error-ux run, `city-error-ux-impl-verification.md`, Nit 2, 4 and 5; design review L1-01) | Verdict | Reference |
|------|------------------------------------------------------------------------------------------------------------------------------------------|---------|-----------|
| 2026-10-03 | Nit 2: first run in a very low window (320×280/300, 400×260/280): *Not now* and *Save* are cut by the dialog's bottom edge at rest. They were fully visible before the city-error-ux run (`ac192fb`). Reachable by scrolling the dialog. | `confirmed`, caused by the reserved room of `docs/city-error-ux.md` decision 3 | AS-LW-01..04; cause 1 and 2 below |
| 2026-10-03 | Nit 4: the CHANGELOG line of that run says "Save and Cancel" (first run has *Not now*), says "City window" while neighbouring lines say "city modal", and the border-contrast line uses internal words ("chrome tiles", "hint tile"). | `confirmed` | AS-LW-05 |
| 2026-10-03 | Nit 1: `docs/city-error-ux.md` AS-CE-02 asks for the suggestions list fully inside the viewport *at rest* at 400×300; measured 289.7 against 285. The review accepted it, but the spec text still says otherwise. | `confirmed`, wording only | AS-LW-04, AS-LW-05 |
| 2026-10-03 | Nit 5 (notes repo): the plan `2026-10-03-city-error-ux.md` says `15-city-modal-layout` is 58/58; the scenario has 47 checks (verification: old scenario on the head 44/47, new scenario on `main` 46/47). | `confirmed` (the figure 58 is `--only 15-city`, which matches `15-city-modal-layout`, 47 checks, and `dg-15-city-first-run`, 11) | AS-LW-05 |
| 2026-10-03 | Nit 6 (notes repo): clearing `cityModalError` in the helper is caught only by a source test; a mutation that drops the reset passes the whole E2E (83/83). | `confirmed`, but see the coverage note: no UI path reaches the difference | Coverage note (after AS-LW-05) |

Nit 3 of the verification (the permanent blank strip of about 55 px between the field and the buttons at rest, L1-02/L2-02) is a design judgement the previous spec already accepted. It is **not** reopened here, except in the one place where it costs the buttons their visibility (this document).

### Root cause (traced in `src/`, measured in the cloud Chromium)

1. **The reserve makes the first-run dialog 39 px taller, and in a low window that is exactly the part that no longer fits.** `.city-modal__feedback` (`src/surfaces.css` ~:100) has `min-height: calc(2 * var(--line-height-body) * var(--font-size-md))` = 39.2 px, always, also while the error slot is hidden. The builder wraps the slot in it (`src/newtab.js` :632-635). First-run content height (`scrollHeight` of `.city-modal__dialog`, description present):

   | width | `ac192fb` (no reserve) | `main` (reserve) | dialog needs a viewport at least this high to avoid scrolling |
   |-------|------------------------|------------------|----------------------------------------------------------------|
   | 320 and 360 | 264 | 304 | 296 → 338 |
   | 400 | 238 | 277 | 270 → 312 |

   (needed height = content + 2 px border + 2 × 16 px viewport margin.) Change mode has no description and is 213 px tall; it fits at 320×280 and is not affected.
2. **When it does not fit, the dialog scrolls and the buttons are the first thing cut.** `placePopover` (`src/newtab.js` :651-668) adds `city-modal__dialog--scroll` (`max-height: calc(100vh - 2 * var(--viewport-margin)); overflow-y: auto`, `surfaces.css` :61-64) when `dialog height > innerHeight - 2 * VIEWPORT_MARGIN`. The scroll box starts at the top (`scrollTop` 0) and first-run does not focus the field, so nothing scrolls the buttons into view. The buttons sit at the end of the content, below the reserved block.

   Measured at rest, first-run, no error (button bottom against the dialog's bottom edge):

   | viewport | `ac192fb` | `main` |
   |----------|-----------|--------|
   | 320×280 | 261.4 vs 264, visible | 300.5 vs 264, **cut** (36.5 px) |
   | 320×300 | 262.2 vs 283.2, visible | 300.5 vs 284, **cut** (16.5 px) |
   | 360×280 / 360×300 | visible | **cut** (36.5 / 16.5 px) |
   | 400×260 | 235.3 vs 244, visible | 274.5 vs 244, **cut** (30.5 px) |
   | 400×280 | 239.1 vs 260.1, visible | 274.5 vs 264, **cut** (10.5 px) |
   | 320×320, 400×300 | visible | buttons visible; only the 20 px bottom padding is cropped (`scrollHeight` 304 against 286; 277 against 266) |
   | 320×338 and up, 400×312 and up | visible | visible, no scrolling |

   The affected band, measured with step 1 at the edges, is 279–317 px high at 320/360 px wide and 260–291 px high at 400 px wide. Below that, 320/360 × 270 and below and 400 × 250 and below, the buttons were already cut on `ac192fb` (320×270: 261.4 vs 254): not a regression, not this task.
3. **It is not a corner case.** Browser zoom shrinks the CSS viewport: a 1280×800 window at 300% zoom is about 427×267 CSS px, at 400% 320×200. First-run is shown automatically, so a user with large zoom meets it on the first new tab.
4. **The reserve is useless in exactly this band.** A dialog that already has to scroll is capped at the viewport height; what moves when an error appears is the scroll content, not the dialog. The zero-shift guarantee (AS-CE-04) was only ever measurable at 1280 and 400 px wide with a tall viewport.

## Default decisions (owner can override)

Picked by the spec author so the pipeline does not wait. Override any of them before the plan starts.

1. **Give the reserve back when it does not fit.** When the dialog, with its two-line reserve, is higher than `innerHeight - 2 * VIEWPORT_MARGIN`, the feedback block keeps no reserve (`min-height: 0`): the dialog is as tall as on `ac192fb` and the buttons are visible again. Where it fits with the reserve (about 338 px high at 320/360 wide, 312 px at 400 wide, in first-run; change mode always), nothing changes. *Reason:* the reserve exists so that a centered dialog does not move; a dialog that is clamped to the viewport has no vertical slack to move in. It is the smallest change that restores the old visibility and keeps `AS-CE-01..05` and `AS-NE-01..05` as they are.
2. **The decision ignores the error that happens to be on screen.** It uses the height of the dialog *as if the feedback block were at its reserve* (the dialog height minus the feedback block's current height plus the reserve), so showing or clearing an error, or a three-line text at 320 px, never flips the state. It is re-evaluated only where `placePopover` already runs: on open, on window resize, on every list render, and from `syncCityModal` (`activeCityForm?.place()`, so on every appearance or clearing of an error and every busy change). The last caller is why the independence from the error is mandatory. `clearCityError` (the `input` event) does not call it. No new listener and no `ResizeObserver`. Resizing the window back restores the previous state exactly (no hysteresis, no memory).
3. **Mechanism and order (the order is mandatory, the class name is a suggestion):** a new modifier class `city-modal__dialog--compact` on the dialog and one CSS rule `.city-modal__dialog--compact .city-modal__feedback { min-height: 0; }`. The dialog is centered, so dropping the reserve changes its height and moves the input; `compact` must therefore be applied *before* `free` and `tooTall` are measured, or the list is placed on a layout that no longer exists (measured on a prototype that set it last: at 400×300 and 400×290 the list stayed an overlay and ended at 303.6 and 293.6, outside the window, while on `ac192fb` it is docked). `placePopover` does, in this order: (1) remove `docked`, `scroll` and `compact`; (2) flush layout and read the dialog height with the reserve (error-independent, decision 2); (3) set or leave `compact` from that height; (4) with that layout measure `free` and `tooTall`; (5) set `docked` and `scroll`. It is **not** tied to `city-modal__dialog--scroll`, because that class is also set when only the list is docked in a dialog that would still fit; dropping the reserve there would make Save jump for no gain. Text still goes through `textContent` only; no new token; no change to the error text, `role="alert"` or the zero gap between field and text.
4. **Amends `docs/city-error-ux.md`** (list in AS-LW-05 item 4): decision 3 and AS-CE-04 (the no-shift guarantee holds wherever the dialog fits with the reserve), AS-CE-05 (its 320×300 and 400×300 cases and the "39.2 px" and "as tall as with an error" checks apply only where the dialog fits with the reserve), AS-CE-02 at 400×300, the Scope sentence about `15-city-modal-layout`, and the last Review focus paragraph. Decision 7 of `docs/network-error.md` (colors and layout untouched) and AS-NE-01..05 are untouched.
5. **A taller error in a compact window is allowed to push the buttons out of view.** The text is shown in full and never clipped; the dialog scrolls; *Save* and *Enter* still work. Same as on `ac192fb`.

*Alternatives rejected:* (a) **Sticky button row** at the bottom of the scrolling dialog: keeps the buttons visible even with an error, but needs a background, a shadow or border and interacts with the docked list; a visual redesign for a rare case. (b) **One-line reserve everywhere:** removes only 19.6 of the 39.2 px, buttons are still cut at 320×280 (needs 318). (c) **Scroll the dialog to the buttons on open:** hides the title and the description, the very text the first-run prompt exists to show. (d) **Shorter first-run description or smaller padding in low windows:** copy and token changes outside this task. (e) **Reserve released by media query on `max-height`:** the break point depends on the description's wrapping at the current width and breaks with a different font size or zoom.

## Scope

- `src/newtab.js`: `placePopover` (:651-668) computes the error-independent height and toggles `city-modal__dialog--compact` in its existing measure pass. No change to `clearCityError`, `syncCityModal`, `changeCity` or the builder.
- `src/surfaces.css`: one rule for the modifier (`min-height: 0` on the feedback block, nothing else).
- Tests: extend `test/cityModalFeedback.test.js` (source assertions in its style: `placePopover` toggles the class; the rule only sets `min-height`; no `display`/`position`; `.city-modal__feedback` itself is unchanged).
- E2E: new `dg-48-city-modal-low-window.mjs` in `quiet-tab-notes/e2e/scenarios/` (dg-47 is the last number). Existing scenarios that must stay green untouched: `dg-47`, `dg-45`, `15-city-modal-layout` (47/47 on `main`), `dg-15`, `13-city-modal`, `dg-25`, `dg-29`, `dg-41`. The independent review ran all of them on a prototype of this change without edits: `dg-47` 83/83, `dg-45` 23/23, `15-city-modal-layout` 47/47, `dg-15` 11/11, `13-city-modal` 127/127, `dg-25` 6/6, `dg-29` 21/21, `dg-41` 32/32 (the 400×300 branch of `dg-47` AS-CE-02 passes with a docked list). "Before the fix" numbers for `dg-48` come from running it against a separate copy of `main` through `--repo` (`--base` only feeds the upgrade scenarios); the plan records the count of red checks in the run record.
- Docs in the product repo: `docs/city-error-ux.md` (decision 3, AS-CE-04 scope, AS-CE-02 wording, Accepted exceptions), `docs/architecture.md` (the city modal paragraph in § Weather: the reserve is released in a window too low to hold it) and `CHANGELOG.md` `[Unreleased]` (AS-LW-05).
- Notes repo: the plan `superpowers/plans/2026-10-03-city-error-ux.md` (numbers, AS-LW-05); this run's spec status and plan.
- Public storefront check: the README screenshot shows no city modal and no store text depends on it. State "no change needed" in the plan unless the final gate disagrees.

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`, visual lens at 320×280, 320×300, 360×300, 400×260, 400×300 and 1280×800, with and without an error; copy lens for the CHANGELOG lines), E2E, then merge by the pipeline rules.

## Non-goals

- Heights where the buttons were already cut on `ac192fb` (320/360 × 270 and below, 400 × 250 and below).
- The blank strip of the reserve in tall windows (verification Nit 3), the width of the strip, one line instead of two.
- Keeping the buttons in view after an error appears in a compact window (auto-scroll, sticky buttons); see Accepted exceptions.
- Any change to the description text, paddings, tokens, button sizes or the error texts.
- Change mode at heights from 250 (the dialog is 215 px and fits; below about 247 the same rule applies there too and the buttons stay visible), the stacked modal, the desktop dialogs.
- `placePopover`'s docked/overlay thresholds (`POPOVER_MIN_FREE`, `POPOVER_GAP`) and the popover's own layout.
- Cropped bottom padding: in a scrolling dialog the 20 px of padding below the buttons may be partly cropped at rest (the buttons are whole). Not a defect.

## Accepted exceptions

- **No zero-shift guarantee in a compact window.** In a window where the dialog does not fit with the reserve, an error that appears adds its own height (19.6, 39.2 or 58.8 px) to the scroll content; the dialog height is capped at `innerHeight - 32`, so the dialog itself grows only by the slack it has left (1.6 px at 320×300 on `ac192fb`, which has the identical layout) and the buttons move below the fold. Reason: the guarantee cannot be kept without the reserve that costs the buttons their visibility; the text is never clipped and *Save* stays reachable by scrolling or *Enter*.
- **Three-line errors just above the threshold.** At 320/360 px wide with the three-line `network` text (320×338…357) the rule is off, but the extra 19.6 px fills the window and *Save* goes below the edge (320×340: scroll height 323 against 306). The same happened on `ac192fb`; not a regression.
- **Cropped bottom padding** in a scrolling dialog (see Non-goals).
- **Below the floor** (Non-goals, first item) the buttons stay cut, as before this phase.

## Acceptance scenarios

All run in the E2E harness (`quiet-tab-notes/e2e/lib/harness.mjs`), real Chromium plus the unpacked extension, as in `dg-47`. First-run mode is `launch(..., { autoPrompt: true })` with a clean profile and metrics enabled. "Buttons visible at rest" means: dialog `scrollTop` is 0, the weather request is not made yet, no error, and for both `.city-modal__actions button`: `rect.top >= dialogRect.top` and `rect.bottom <= dialogRect.bottom - 1` (the 1 px border) and `rect.bottom <= innerHeight`, and `docScrollX`/`dialogScrollX` are false.

### AS-LW-01 Buttons are visible at rest in a low first-run window

- Given: first-run modal, no error, viewport width W and height H from the sweep: W ∈ {320, 360, 400}; H from the floor (280 for 320, 260 for 400) in steps of 10 up to floor + 80 for W = 320 and 400 (if 320×280 proves flaky, which has only 2.6 px of slack over the `ac192fb` floor of 279, start at 290); W = 360 is a control at 280, 300, 320 and 340 only (it repeats 320 on every height); plus the exact pairs from the intake 320×280, 320×300, 400×260, 400×280. Also 1280×800 and 400×800 as controls.
- When: the modal has opened and settled (300 ms after the first paint of the dialog).
- Then: *Not now* and *Save* are visible at rest (definition above) for every pair. The dialog scrolls only when it needs to (`scrollHeight <= clientHeight` is not required, the buttons are). At the controls the feedback block is 39.2 ±0.5 px tall (the reserve is kept where it fits). In change mode at 320×280 and 400×260 (heights from 250) the buttons are visible and the reserve is 39.2 ±0.5 px tall.
- Verified by: `dg-48` (check group 1). Expected before the fix (on `main`): the buttons are cut at 320×280, 320×300, 360×280, 360×300, 400×260, 400×280 and at every sweep height up to 317 (320/360) and up to 291 (400).

### AS-LW-02 Where the dialog fits, the reserve and AS-CE-04 stay

- Given: first-run modal just above the fit thresholds: 320×340, 360×340, 400×320; and change mode at 320×300.
- When: an error appears and disappears, for each of the `http` text, `Enter a city name` (field clicked first in first-run) and the `network` text.
- Then: the feedback block is 39.2 ±0.5 px tall at rest; the `getBoundingClientRect()` of the dialog, the input and the Save button have the same `top` and `height` (±0.5 px) at rest, with the error shown and after the edit that hides it, for the texts that take at most two lines (`http`, `enter`; `network` is recorded without pass/fail at 320 and 360, as three lines are an existing accepted exception of `docs/city-error-ux.md`); no `city-modal__dialog--compact` class.
- Verified by: `dg-48` (check group 2); `dg-47` group 4 and 5 unchanged. Expected before the fix: same as after (characterization guard).

### AS-LW-03 The state depends on the window, not on the error or the history

- Given: first-run modal at 320×300 (compact) with the `network` error shown.
- When: (a) the error is cleared by an edit and shown again by Save; (b) the viewport is resized 320×300 → 320×800 → 320×300 and 400×300 → 400×800 → 400×300.
- Then: (a) `city-modal__dialog--compact` is present before, during and after every error step and the feedback block height is the same at rest; (b) the class is absent at ×800, present again at ×300, and the buttons are visible at rest each time. Threshold: the dialog height with the reserve is read once per width in the tall window (800 px high; 305.5 at 320 and 360, 279.5 at 400, ±0.5), and for every height H in the grid {300, 320, 330, 336, 337, 338, 339, 340, 350, 360} at 320 and 360 px wide and {290, 300, 310, 311, 312, 313, 320} at 400 px wide the assertion is `compact === (withReserve > H - 32)` **with no tolerance on the comparison** (the 0.5 px tolerance applies only to the measured dialog height). A threshold shifted by 3 px therefore fails at 337/338 or 311/312.
- Verified by: `dg-48` (check group 3). Expected before the fix: the class never exists.

### AS-LW-04 Errors and the suggestions list in a compact window

- Given: first-run modal at 320×300 and 400×300 (and 400×280).
- When: (a) the `http` and the `network` error are produced by Save; (b) separately, three suggestions for `Tbil` are shown.
- Then: (a) the error text is not clamped (`errorClamped === false`), the dialog scrolls, after scrolling the dialog to its end the error and both buttons are inside the dialog's visible box and the viewport, no horizontal scroll, the modal stays open and the typed city is kept; (b) the list has 3 items, the slot is hidden and empty, no element under a point 3 px below the input is the error or has red text (the AS-CE-02 probe), the list is reachable (after scrolling the dialog to its end, `list.bottom <= dialogRect.bottom + 1` and `<= innerHeight - 16 + 1`) and the buttons are reachable by scrolling. At 320×300 the list is docked. At 400×300 the list is expected to be docked again (as on `ac192fb`); if it is an overlay, the same reachability assertions apply, so the check does not depend on the mode. The at-rest bottom of the list is recorded in the run record, with no pass/fail.
- Verified by: `dg-48` (check group 4); `dg-47` group 2 passes (its 400×300 branch already measures after scrolling to the end).

### AS-LW-05 Documents say what the product does

- Given: the branch of this phase.
- When: the documents are read after the change.
- Then:
  1. `CHANGELOG.md` `[Unreleased]` → Fixed, the city-error-ux entry: "Save and Cancel no longer jump down when an error appears" is replaced by wording that is true in both modes, e.g. "the buttons no longer jump down when an error appears", and "City window:" becomes "City modal:" (the neighbouring network-error entry says "The city modal"). The `E2E:` suffix may stay.
  2. `CHANGELOG.md` → Changed, the border-contrast entry has no internal words: "chrome tiles" and "hint tile" become the names the user sees, e.g. "the Settings and Add tiles and the first-run "Set a city" tile". Meaning and the 3:1 / WCAG 1.4.11 reference stay.
  3. `CHANGELOG.md` → Fixed: one new entry for this change in user language, e.g. "City modal: in a very low window (or at a large browser zoom) the Save and Cancel / Not now buttons are visible again without scrolling; the room kept for an error message is given up only when the window is too low to hold it." No words such as "reserve", "compact", "slot" or "feedback block".
  4. `docs/city-error-ux.md`: (i) decision 3 and AS-CE-04 name the fit condition; (ii) AS-CE-05's Given/Then (the 320×300 and 400×300 cases, "39.2 ±0.5" and "resting dialog exactly as tall as with a two-line error") are limited to windows where the dialog fits with the reserve; (iii) AS-CE-02 at 400×300 no longer says "the mode changes with the fix: docked on `main`, overlay with the fix": the list is docked again, checked after scrolling the dialog to its end, and the at-rest form `list.bottom <= innerHeight - 16 + 1` (never met there: 289.7 against 285 on the reviewed head) is recorded under Accepted exceptions as accepted by review; (iv) the last Review focus paragraph ("observed at about 400×300: docked on `main`, overlay with the fix") is corrected the same way; (v) the Scope sentence "`15-city-modal-layout` goes from 58/58 to 55/58" becomes "47/47 to 44/47" (the old figure is `--only 15-city`, which also matches `dg-15-city-first-run`, 11 checks).
  5. `docs/architecture.md` § Weather mentions the release of the reserve in a window too low to hold it (one sentence).
  6. Notes repo: `superpowers/plans/2026-10-03-city-error-ux.md` names the scenario exactly: `15-city-modal-layout` 47/47 (and 46/47 for the intermediate run), not "58/58" and "57/58".
- Verified by: the independent verifier reads the diff (copy lens in the design review for items 1-3); `grep -n "chrome tile\|hint tile\|City window" CHANGELOG.md` finds nothing in `[Unreleased]`.

## Coverage note: resetting the error variable

Not an acceptance scenario (nothing observable). The intake asks for a behavioural E2E check that `clearCityError` resets `cityModalError`. None can fail: `syncCityModal` has four callers in `src/newtab.js` (:822 in the field's Enter handler, :976 in the form's submit handler, :2406 and :2427 in `changeCity`) and each assigns `cityModalError` immediately before the call (`"Enter a city name"`, `""`, the message from the `catch`). `buildCityModal` reads the variable only at open, and `showCityModal` (:996) and `hideCityModal` (:1039) reset it first. While a request runs the field is disabled, so no `input` event arrives. The reset in the helper guards a future caller. The plan therefore keeps the source test in `test/cityModalFeedback.test.js`, adds a comment there with this reasoning, and lists the mutation in its table as "equivalent through the UI; covered by the source test". If the implementer finds a UI path that exposes the difference, the check goes into `dg-48` with the mutation run as evidence.

## Review focus

- **Is releasing the reserve the right trade?** The alternative that keeps the buttons visible even with an error is the sticky button row (rejected (a)). Check that the compact-window user who sees an error can still reach *Save* and understand what happened, and that "text first, buttons by scrolling" is acceptable at 320×280.
- **The fit threshold.** A window one pixel above it keeps the 39 px blank strip, one pixel below it loses it: a visible jump when the user resizes or zooms across the threshold. Look at 320×336 and 320×340 side by side; if it feels abrupt, a smaller reserve could be considered (not in this phase).
- **Error-independent measure** (default decision 2): confirm the rule cannot flip while a three-line error is on screen at 320 px, and that `placePopover` still does not flicker (it runs in the same pass as before).
- **Interaction with the docked list.** Docked and compact are independent; check 400×300 and 320×300 with three suggestions open and a stale error just cleared.
- **Contradictions:** none intended with AS-CE-01..05 (the clearing, the strip above the list, zero gap) or AS-NE-01..05; AS-CE-04's no-shift promise is narrowed (decision 4, Accepted exceptions) and AS-CE-02's wording is corrected.
- **Copy:** the new CHANGELOG entry and the three corrected ones.
