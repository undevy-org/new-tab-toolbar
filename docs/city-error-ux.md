# City modal error: stale text and layout jump

## Status

`draft, awaiting re-review` (independent review 1 applied; see `city-error-ux-spec-review.md`, author section)

## Intake log

| Date | Raw note (independent verification of the network-error run, `network-error-impl-verification.md`, Minor 1 and 2) | Verdict | Reference |
|------|-------------------------------------------------------------------------------------------------------------------|---------|-----------|
| 2026-10-03 | Minor 1: the error stays in the slot while the user retypes the city; the suggestions list covers it and a red stub sticks out below the list's edge. | `confirmed` | AS-CE-01..03; cause 1 and 2 below |
| 2026-10-03 | Minor 2: Save moves down by 19.6–29.4 px when an error appears (the dialog is centered vertically and the slot is empty until the error shows). | `confirmed` | AS-CE-04, AS-CE-05; cause 3 and 4 below |

Both items are old behavior, not regressions of `docs/network-error.md`: `Enter a city name` and `City "<name>" was not found` behaved the same before. The network-error run made them easier to see because its texts are longer (two lines).

### Root cause (traced in `src/`)

1. **Nothing clears the slot while the user types.** `cityModalError` is reset in only three places: `showCityModal` (`src/newtab.js` ~:982, on open), `changeCity` (~:2391, when Save starts a request) and, indirectly, a successful close. The `input` handlers on the city field (`newtab.js` :711 builds suggestions, :801 only does `chosenCity = null`) never touch it. So the text of the last Save stays on screen for as long as the user edits the name.
2. **The list is painted over the slot.** `.weather-form__suggestions` is `position: absolute; top: calc(100% + var(--surface-popover-gap))` inside `.weather-form__field` (`src/surfaces.css` ~:1), so it overlays whatever follows the field in the flow, which is the error `<p>` (`form.append(field, errorNode, actions)`, `newtab.js` :631). The `<p>` starts at the bottom edge of the field (gap 0 px, measured on `main`), the list starts `--surface-popover-gap` (6 px) lower, and a list is never shorter than a three-line text (one item is about 54 px, three items 134 px). So nothing sticks out *below* the list; what the verifier saw is the **6 px strip between the field and the list**, where the top of the first red text line stays uncovered. In the docked mode (list in the dialog's flow, see `placePopover`) the stale text sits between the list and the buttons instead.
3. **The slot has no height until it has text.** The `<p data-city-modal-error>` is `hidden` (`display: none`, `src/surfaces.css` ~:100) while `cityModalError === ""`, so the dialog is as tall as title + description + field + buttons. When the text appears the dialog grows by one line (`--font-size-md` 14 px × `--line-height-body` 1.4 = 19.6 px) or two (39.2 px).
4. **The dialog is centered, so a height change moves the buttons.** `.city-modal` is `display: flex; align-items: center` (`surfaces.css` ~:31). Growing by H moves the dialog's top up by H/2 and Save down by H/2 relative to the viewport: 19.6 px for two lines, 29.4 px for three (a long city name in the `notFound` text). That matches the measured 19.6–29.4 px. The one-line `Enter a city name` moves Save by 9.8 px.

## Default decisions (owner can override)

Picked by the spec author so the pipeline does not wait. Override any of them before the plan starts.

1. **The slot clears on edit.** Any `input` event on the city field (typing, paste, delete, and IME composition updates, since `input` also fires during composition) empties the slot and hides it (`textContent = ""`, `hidden = true`), for every error kind (`network`, `timeout`, `http`, `unknown`, `notFound`, `Enter a city name`). The error describes the *previous* attempt; once the text changes it no longer describes the field. The Clear (×) button clears the slot too, since it empties the field. Nothing else clears it: moving focus, arrow keys, opening or closing the list, and a window resize leave it as is. *Reason:* the cheapest rule that removes the stale text and the overlap at the same moment; no change to when errors are produced.
2. **Clearing is a state change on the existing node.** `role="alert"` stays on the same `[data-city-modal-error]` element, which is emptied and hidden (the node is not rebuilt, not replaced, not given `aria-live`). `changeCity` already empties the slot before every request (decision 4 of `docs/network-error.md`), so the empty → text transition of a repeated failure (AS-NE-03) is not new and does not depend on this change; clearing on edit only means the old text is gone sooner. Focus does not move; the field value, the chosen suggestion state and the busy state are untouched. Clearing only affects the slot, not `syncCityModal`'s other work, so no `placePopover` flicker beyond what the new text length already causes.
3. **Reserve the room, do not move the dialog.** The error `<p>` is wrapped in a new, non-semantic `<div class="city-modal__feedback">` (no role, no aria, no text of its own) that always occupies at least two text lines: `min-height: calc(2 * var(--line-height-body) * var(--font-size-md))` (39.2 px). The `<p>` inside keeps its classes, its `hidden` toggling and `role="alert"`. The wrapper grows if the text needs a third line (long city name; narrow window), so nothing is ever clipped. *Reason:* measured in the cloud Chromium on `main`: at 1280 and 400 px wide, every fixed text and the `notFound` text for `Atlantis` takes two lines (39.19 px; `Enter a city name` one line, 19.59 px), so the buttons do not move at all. At 320 px (inner width about 246 px) `network` and a long `notFound` take three lines (58.78 px), `http` two, `Enter a city name` one. keeping the dialog vertically centered avoids a new positioning rule. *Alternatives rejected:* anchoring the dialog to the top (moves the whole dialog and the buttons still shift by the full line height), and reserving one line (`Enter a city name` only; every network text would still move Save by one line). *Overridable:* reserve one line instead; then AS-CE-04 limits the zero-shift guarantee to `Enter a city name`.
4. **No other layout or color change.** This amends decision 7 of `docs/network-error.md` ("Colors and layout untouched") only by the reserved block. Text colors, `status status--error status--full` and the wrapping rules are unchanged, and the zero gap between the field and the error text (Minor 5 of the verification, which the design review rejected as covered by decision 7) is kept: the gap is **0 px** on `main` and stays 0 px; the reserved room is added *below* the text, between it and the buttons, not above it. `.city-modal__actions` keeps `margin-top: 16px`. The effect on a resting dialog is that it is 39.2 px taller than today, in every mode (first-run, change, stacked over the weather edit dialog).
5. **Keep the retry model.** Save (or Enter) remains the retry; the modal stays open on failure; typed text and the chosen suggestion are kept. Editing clears the old error and, as before, `chosenCity` drops on `input`.
6. **Suggestion failures stay silent** (decision 6 of `docs/network-error.md`). Clearing the slot on edit does not make the list report anything.

## Scope

- `src/newtab.js`: a small helper that empties and hides the existing slot (no full `syncCityModal`), called from the field's `input` listener (the one at :801 that does `chosenCity = null`) and from the Clear handler (:829); the DOM builder (:618-631) wraps `errorNode` in `.city-modal__feedback`. `cityModalError` is set to `""` by the helper so that the next `syncCityModal` does not restore the text. Only `textContent`, no `innerHTML`.
- `src/surfaces.css`: one rule for `.city-modal__feedback` (`min-height`, nothing else). `[hidden]` handling of the `<p>` is unchanged.
- Tests (names, not "as needed"): new `test/cityModalFeedback.test.js` (source assertions, same style as `test/newtabSource.test.js`: the `input` listener and the Clear handler clear `cityModalError`; the slot keeps `role="alert"`; the `.city-modal__feedback` rule has `min-height` built from the two tokens and no `display`/`position` rule; no `aria-live` appears in the city modal builder); the existing `test/newtabSource.test.js` checks for AS-NE-05 stay green (the reviewer's throwaway build with the fix kept them and `npm test` green, 475/475).
- **Existing E2E checks that this change turns red and the plan must rewrite** (found by running the cloud E2E on a throwaway copy with the fix: `15-city-modal-layout` goes from 58/58 to 55/58). Only these three change, the rest of the scenario is untouched: (1) `AS-8 … the dialog only grew by the error line` expects `h1 > h0 && h1 - h0 < 80`; with the reserve `h1 == h0`, so it becomes "the dialog height did not change (±0.5 px) when a one- or two-line error appeared" (it is the old form of AS-CE-04); (2) and (3) `Mouse: a double click on an item whose second click lands on Cancel` / `… on Save` aim at fixed coordinates; with the reserve the buttons are 39.19 px lower and the second click lands on `.city-modal__feedback`, so the scenario takes the target point from `getBoundingClientRect()` of the Cancel and Save buttons instead of constants.
- Harness notes for `dg-47`: first-run mode does not focus the field, so the scenario clicks into it before pressing Enter for `Enter a city name`; the `unknown` text needs a route mode that `dg-45`'s `setNet` does not have (geocoding answers `200` with invalid JSON); `notFound` is a geocoding answer `{ "results": [] }`.
- E2E: new `dg-47-city-error-ux.mjs` in `quiet-tab-notes/e2e/scenarios/` (numbers dg-45 and dg-46 are taken). `dg-45` runs unchanged and must stay green.
- Docs: `docs/architecture.md` (the city modal paragraph in § Weather: the error slot is cleared on edit and the feedback block reserves two lines) and `CHANGELOG.md` `[Unreleased]` → Fixed (one entry, user language: no internal words such as "slot" or "wrapper").
- Public storefront check: the README screenshot shows no open city modal; no store text depends on this. State "no change needed" in the plan unless the final gate disagrees.

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`, visual lens at 320, 400 and 1280 px wide, copy lens for the CHANGELOG line), E2E, then merge by the pipeline rules.

## Non-goals

- Changing any error text, the message table, or when an error is produced (`docs/network-error.md` owns them).
- A "Try again" button on the modal or on the weather tile, retry with backoff, or an offline banner.
- Adding a gap between the field and the error text (Minor 5 of the verification; kept at 0 px, see decision 4).
- `scrollbar-gutter: stable` and the 7.5 px shift of the dialog behind a classic scrollbar (Minor 3 of the verification; pre-existing, separate task).
- Silent suggestion failures while typing offline.
- Repositioning the modal, a top-anchored dialog, or any change to the docked/overlay popover logic (`placePopover`).
- The desktop dialog error slots (`favoritesError`) and the page status line.
- New tokens or colors.

## Accepted exceptions

- **A third line may still move Save.** The reserved room is two lines. Measured on `main`: at 320 px wide `network` and a long `notFound` take three lines (58.78 px), `http` two, `Enter a city name` one; at 400 px and 1280 px all take at most two. Where a text needs three lines the feedback block grows by one line and Save moves by 9.8 px (half a line, because of centering). Reason: reserving three lines would add 19.6 px of permanent blank space for narrow windows only. The text is never clipped (AS-NE-01 still holds). `dg-47` also measures one width near the boundary (360 px) and records the line counts in the run record, without a pass/fail on them.

## Acceptance scenarios

All scenarios run in the E2E harness (`quiet-tab-notes/e2e/lib/harness.mjs`). Errors are produced as in `dg-45`: the harness default aborts `/open-meteo\.com/` with `route.abort("failed")` (network text), a 503 `fulfill` gives the `http` text, an empty geocoding answer gives `notFound`, and an empty Save gives `Enter a city name`. Unless stated, the modal is in change mode with no city stored.

### AS-CE-01 Editing the field clears the old error

- Given: the modal is open (first-run mode: the scenario first clicks into the field), the user pressed Save with `Tbilisi` and the network text is visible (also repeated for the 503 text, the `notFound` text for `Atlantis`, and `Enter a city name` from an empty Enter).
- When: the user types one more character (or deletes one, or pastes text).
- Then: immediately (before the 250 ms suggestion debounce fires and with the network still down) `[data-city-modal-error]` is `hidden` with `textContent === ""`, so `modalInfo(page).error === ""`; the node still has `role="alert"` and is the same DOM node as before (compare a marker property set before typing); the input keeps its value, is `document.activeElement`, and is enabled; the modal is still open; `quietTabWeatherLocation` is unchanged.
- Verified by: `dg-47` (check group 1, four error kinds; the snapshot right after typing, before any Save, is what proves the clearing happens on edit); `test/cityModalFeedback.test.js`. Expected before the fix: the error text is still visible after typing.

### AS-CE-02 The strip above the suggestions list is not red

- Given: the network text is visible; then the harness restores the network and routes a geocoding answer with three suggestions for `Tbil`.
- When: the user retypes `Tbil` (select all, type) and waits for the list to open.
- Then: the list is open (3 items); the slot is hidden and empty. At the point `x` = center of the dialog, `y` = bottom of the input + 3 px (inside the 6 px strip above the list) `document.elementFromPoint` is not `[data-city-modal-error]` and no element under that point has non-empty text in the resolved `--danger` color (`elementsFromPoint`). Repeated for three viewports: 400×800 (overlay list), **320×300 first-run** (list docked on `main` and with the fix: the check also asserts no `--danger` text between the list and the buttons) and **400×300** (the mode changes with the fix: docked on `main`, overlay inside a scrolling dialog with the fix; there the list is fully inside the viewport, `list.bottom <= innerHeight - 16 + 1`, Save and Not now are reachable by scrolling the dialog, and there is no horizontal scroll). A probe 4 px below the bottom edge of the list is kept as an additional check.
- Verified by: `dg-47` (check group 2). Expected before the fix: `elementFromPoint` at input bottom + 3 px is the error `<p>` and (320×300) its text sits above the buttons.

### AS-CE-03 Clear button and the repeated failure

- Given: the network text is visible.
- When: (a) the user presses the Clear (×) button; separately (b) the user edits the field and presses Save again with the network still down (with the 150 ms route delay of AS-NE-03 and the same `MutationObserver` on the slot). Part (b) is a regression guard only: `changeCity` empties the slot before each request anyway; that clearing on *edit* happens is proved by group 1.
- Then: (a) the slot is hidden and empty, the field is empty and focused; (b) after collapsing consecutive identical snapshots `window.__alertLog` equals `[ {empty, hidden}, {M, visible}, {empty, hidden}, {M, visible} ]` where `M` is the network text: the edit produced the empty step and the second failure is a fresh empty → text change. `dg-45` check group 3 (two Saves without editing) passes unchanged.
- Verified by: `dg-47` (check group 3); `dg-45` unchanged. Design review (screen-reader lens): the observed sequence is the contract; spoken output is not tested.

### AS-CE-04 Save does not move when the error appears

- Given: the modal is open at viewport 1280×800 and again at 400×800, in change mode and in first-run mode (`autoPrompt: true`), with an empty or typed field.
- When: an error appears and disappears, for each of: the network text, the 503 text, the `unknown` text (geocoding answers invalid JSON), and `Enter a city name`.
- Then: the `getBoundingClientRect()` of the dialog, of the input and of the Save button have the same `top` and `height` (within 0.5 px) with the error hidden, with the error shown, and after the edit that hides it again. At 1280 px and 400 px each of the four texts occupies at most two lines (`errorNode` height ≤ 40 px) so this is a pure no-shift guarantee, not a bound. `notFound` with `Atlantis` is checked the same way. For the `unknown` text the route answers geocoding with `200` and an invalid body (new route mode in `dg-47`); in first-run mode the field is clicked before Enter for `Enter a city name`.
- Verified by: `dg-47` (check group 4). Expected before the fix: Save `top` differs by about 9.8 px (`Enter a city name`) and 19.6 px (the other texts).

### AS-CE-05 The reserved room hurts nothing else

- Given: the modal in first-run mode at 320×600, change mode at 320×600, change mode stacked over the weather edit dialog at 1280×800, and the 320×300 and 400×300 cases of AS-CE-02.
- When: the modal is opened with no error and then with the longest table text.
- Then: Save is fully inside the viewport (`rect.bottom <= innerHeight`) at rest and with the error, or reachable by scrolling when the dialog has `city-modal__dialog--scroll`; no horizontal scroll (`docScrollX` and `dialogScrollX` false); the error text is not clamped (`errorClamped === false`); the gap between the bottom of the input and the top of the error text is 0 px (±0.5); the feedback block has no `role`, no `aria-*` and no text when the slot is empty and its height is 39.2 ±0.5 px when the text takes at most two lines; the resting dialog is exactly as tall as with a two-line error (invariant, not a comparison with `main`, which stops existing after the merge); the three `15-city-modal-layout` checks named in Scope are rewritten and green, and `dg-13`, `dg-15`, `dg-25`, `dg-29`, `dg-41`, `13-city-modal`, `dg-45` pass untouched.
- Verified by: `dg-47` (check group 5); the regression scenarios above; `npm test`, `npm run check`. Expected before the fix: the resting-height invariant and the feedback-height checks are red; the rest is a characterization of today's behavior.

## Review focus

- **Is clear-on-edit the right trigger?** Alternative: clear on the first keystroke only when the list opens. Check that the user never loses an error they have not read (the error is replaced by their own action, never by a timer) and that `Enter a city name` clearing on typing is expected.
- **Reserve two lines or one?** The permanent extra 39.2 px under the field at rest is a design tradeoff for first-run especially (the description text above is long). Look at the first-run dialog at 400×600 and 320×600 with and without the reserve; if it feels loose, switch to decision 3's one-line override and narrow AS-CE-04.
- **Announcements:** same node, same `role="alert"`, no new live region; the new empty step between two identical failures.
- **Contradictions:** none with AS-NE-01..05 intended (text, retry and zero gap kept). `15-city-modal-layout` has three checks that the reserve turns red (listed in Scope, with their rewrite). `placePopover` measures free space from the input's bottom; the centered dialog is 19.6 px higher with the reserve, so `free` grows by that much and the mode can change in a narrow band of heights (observed at about 400×300: docked on `main`, overlay in a scrolling dialog with the fix); AS-CE-02 and AS-CE-05 cover that band, and at 320×300 the list is docked both before and after.
- **Copy:** only the CHANGELOG line is new text.
