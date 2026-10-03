# Control border contrast (WCAG 1.4.11)

## Status

`ready for spec gate`

## Intake log

| Date | Raw note (design-review final gate, run `2026-10-03-33140c5-final-r1`) | Verdict | Reference |
|------|-----------------------------------------------------------------------|---------|-----------|
| 2026-10-03 | L2-02 / L3-05: the border of the chrome tiles (settings, add) has contrast 1.24:1. | `confirmed` | AS-CT-01, AS-CT-02. Cause: `.chrome-tile` draws `1px solid var(--border)` (`src/newtab.css` ~:188), and `--border` is `--color-border` = `#d8dee6` (`src/design-tokens.css`). The tile sits between the panel (`#ffffff`, inside) and the page (`#f3f5f7`, outside); `#d8dee6` against the page is **1.24:1**, against the panel 1.35:1. The tile has no other boundary cue at rest (no fill difference, no shadow), so its edge is the only thing that separates it from the page. |
| 2026-10-03 | L3-08: the border of the city input field has contrast 1.35:1. | `confirmed` | AS-CT-03. Cause: `.favorite-input` draws `var(--control-border-width) solid var(--border)` (`src/controls.css` ~:158) on a `--panel` background inside the city modal (`--panel` `#ffffff`): `#d8dee6` against `#ffffff` is **1.35:1**. The same class styles every text field in the Add/Edit link dialog. |
| 2026-10-03 | (not in the review, found while checking) Dark theme has the same problem. | `confirmed` | `#343b45` against `--color-surface` `#1d2229` is **1.41:1**, against `--color-bg` `#14171c` **1.59:1**. The review measured light only; dark fails the same way. |
| 2026-10-03 | Root cause shared by all three. | `confirmed` | `--color-border` is one token for two jobs: quiet decorative separators (cards, row dividers, popover and modal edges, which the 1.4.11 text does not require) and the **boundaries of controls** (fields, chrome tiles), which it does. The design system has no token for the second job. The follow-up spec (`docs/design-system-followup.md`, Non-goals: "New design tokens or colors") forbade adding one, so the review could only record the gap. This spec lifts that restriction for exactly one token. |

Reading of the criterion. WCAG 1.4.11 requires 3:1 for "graphical objects and user interface component states needed to identify" a component. An input field whose border is the only edge, and a tile whose edge is the only thing marking it as a button, fall under it. A control that is already identified by a solid fill or by its text label (`.button--primary`, text buttons) is not forced by the criterion, so it is left alone (see Scope).

Chrome tiles and the hint tile carry only a glyph (no text) on a background that differs from the page by about 1.1:1, so the edge is what shows them as one actionable surface; the design review flagged exactly this. Weather and favorite tiles carry text or an accent border and are identified by that.

## Default decisions (owner can override)

Applied as defaults so the pipeline does not wait. Override any of them before the plan starts.

1. **New token:** `--color-border-control`, with a legacy alias `--border-control` (the grid and control CSS use the aliases, e.g. `var(--border)`; the new rules use `var(--border-control)` to match their neighbours). `--color-border` and `--border` keep their values and meaning (decorative separators).
2. **Values** (computed with the WCAG relative-luminance formula; the lightest cool gray in the existing hue family that clears 3:1 against **both** neighbours with a small margin, to keep the look quiet):

   | Theme | `--color-border-control` | vs `--color-surface` | vs `--color-bg` | vs old border |
   |-------|--------------------------|----------------------|-----------------|---------------|
   | light | `#838e9a` | 3.33:1 (panel `#ffffff`) | 3.05:1 (page `#f3f5f7`) | was 1.35 / 1.24 |
   | dark | `#68727f` | 3.28:1 (panel `#1d2229`) | 3.68:1 (page `#14171c`) | was 1.41 / 1.59 |

   Both neighbours are checked because a chrome tile has the page outside and the panel inside, while a field has the panel on both sides. The page background is the harder case in light, the panel in dark. The light value is deliberately close to the minimum, so it is in light it is lighter than the muted text color (`#5c6672`), in dark it is dimmer than it (`#a8b0ba`), so the border still reads as a hairline, not a frame.
3. **Which surfaces use it** (the five that draw a control boundary with nothing else to identify it):
   - `.chrome-tile` (settings, add);
   - `.city-hint-tile` (dashed, same role: it is a button whose only cue at 1×1 is its edge and a glyph);
   - `.favorite-input` (the city field and all text fields in the Add/Edit link dialog);
   - `.favorite-color-input`;
   - `.segmented` (outer border only).

   Everything else keeps `--border`: card and surface edges (`.favorite-form`, `.city-modal__dialog`, `.desktop-dialog`, `.add-menu`, `.weather-form__suggestions`, `.tooltip`), row dividers (`.favorite-form__row` top rule), the dividers between segmented options, `.weather-tile` (informational at rest; in edit mode it is a button named "Edit <metric>", identified by its value text and by the edit-mode cues, so its faint border is kept; see Accepted exceptions), `.button` (has a text label), `.icon-button` (glyph; the city clear button already uses a transparent border), `.favorite-tile` (accent border plus icon and label).
4. **Hover, pressed, focus unchanged:** `border-color: var(--primary)` on `.chrome-tile:hover` and `[aria-pressed="true"]` stays; the step from rest to hover is 5.6:1 in light (was 13.7:1) and 4.5:1 in dark (was 10.4:1) between the new rest color and `--primary`, still a clear change. Focus rings (`--focus-ring`, `--soft-ring`, `--focus`) are not touched.
5. **Focused field:** a focused field gets the `--color-fill-soft` background plus the 2 px soft ring (AS-DS-6), and its border measures 2.94:1 (light) / 2.69:1 (dark) against that fill. The ring carries the focused boundary: it is drawn outside the border, and the soft ring measures 4.1:1 (light) and 6.2:1 (dark) against the panel and 4.0:1 / 5.4:1 against `--color-fill-soft`. `test/focusTokens.test.js` guards only the panel pair, so `test/borderContrast.test.js` adds the ring-on-`--color-fill-soft` check (>= 3:1), so the focused state is not measured against the border. If the owner wants the border alone to clear 3:1 on the focused fill, the values become darker (light about `#7d8793`) and the look gets heavier; not recommended.
6. **Theme coverage:** both themes in the same change. Forced-colors mode keeps system colors for borders and is not changed.

## Scope

- New token pair in `src/design-tokens.css` (light and `prefers-color-scheme: dark`), plus the alias.
- Five rules switched from `var(--border)` to `var(--border-control)`: `.chrome-tile` and `.city-hint-tile` in `src/newtab.css`; `.favorite-input`, `.favorite-color-input` and `.segmented` (the outer border only; `.segmented__option`'s `border-right` stays) in `src/controls.css`.
- `docs/design-system.md`: one row in the color-token table, and one short paragraph naming the two border roles (decorative separator vs control boundary) so the next control picks the right token; the table row for `--color-border` is narrowed to "Decorative separators and surface borders"; the Components lines for `.favorite-input`, `.segmented` and `.favorite-color-input` (e.g. `design-system.md` ~:169) say `--color-border-control`. Amend the existing Non-goals line "New design tokens or colors" in `docs/design-system-followup.md` (:40) in place, appending "(lifted for `--color-border-control` by `docs/border-contrast.md`)", not as a separate paragraph.
- `CHANGELOG.md` entry under `[Unreleased]` / `Changed`.
- New source tests and one new E2E scenario (see "Verified by"). No change to any other E2E.
- README screenshot: refresh only if the refreshed borders are visible on it and read differently (decided at the final gate, per the storefront rule).

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`, visual lens in both themes), E2E, then merge only after the owner confirms.

## Non-goals

- Making decorative separators, card edges or the weather and favorite tiles reach 3:1. They are not needed to identify a control, and the quiet look depends on them staying faint.
- Re-deriving the whole palette, renaming existing tokens, or removing the legacy aliases.
- Changing focus rings, hover colors, `--primary`, `--danger`, radii, tile sizes or any layout.
- Other design-review findings (raw "Failed to fetch" in the city modal, combobox semantics, keyboard alternative for drag, mapPin size, "Add link" naming). They are separate tasks.
- Forced-colors, touch and pen verification.

## Accepted exceptions

- `.weather-tile` border (1.24:1 light) in edit mode: the tile is identified by its value text; the decorative edge is kept faint on purpose. Revisit if the design review rules the text insufficient.
- `.favorite-color-input` while Auto is selected (opacity 0.5, about 1.7:1 rendered): inactive component under WCAG 1.4.11; it becomes fully opaque on focus and in Manual.

## Acceptance scenarios

### AS-CT-01 The control border token exists and clears 3:1 in both themes

- Given: `src/design-tokens.css`.
- When: `--color-border-control` is read from the `:root` block and from the `prefers-color-scheme: dark` block, and its contrast is computed against that block's `--color-surface` and `--color-bg`.
- Then: the token is declared in both blocks; `--border-control` is an alias of it; both ratios are >= 3.0 in both themes, compared unrounded (2.996 fails; the light margin against the page is only 0.05) (planned values: light `#838e9a`, dark `#68727f`; the test takes the declared values, so an owner override of the numbers stays covered). `--color-border` is unchanged (`#d8dee6` light, `#343b45` dark).
- Verified by: new `test/borderContrast.test.js` (reuses the luminance helpers from `test/focusTokens.test.js`, copied, not imported, since test files do not export). Expected before the change: red (token missing).

### AS-CT-02 Chrome tiles are visible against the page and the panel

- Given: viewport 1280×800; two states, no city stored (the hint tile and both chrome tiles) and a city stored (four metrics and both chrome tiles), chrome tiles measured in both; default layout with `chrome:settings` and `chrome:add`; resting state (no hover, no focus, edit mode off). Two runs: light and dark (`page.emulateMedia({ colorScheme })`).
- When: the computed `border-top-color` of each chrome tile is read, together with the computed `background-color` of the tile (inside) and of `body` (outside).
- Then: the border color equals the resolved `--color-border-control`; contrast against the tile background >= 3.0 and against the body background >= 3.0 (unrounded), in both themes. In edit mode, `chrome:settings` has `aria-pressed="true"` and its border is `--primary` (unchanged).
- Verified by: new E2E `dg-46-control-border-contrast.mjs` (ratio computed in Node from the `rgb()` strings; after `page.emulateMedia({ colorScheme })`, wait for styles to apply before `getComputedStyle`, as `dg-40-dialog-focus.mjs` does). Expected before the change: red, ratios 1.24 / 1.35 (light) and 1.41 / 1.59 (dark).

### AS-CT-03 Field borders are visible on the panel

- Given: viewport 1280×800, both themes. (a) First-run city modal open with no city stored (`#weather-city-input`). (b) Add link dialog open (`.favorite-input` for URL and title, `.favorite-color-input`, `.segmented`); the color row is measured twice, with Auto selected (default) and with Manual selected. All at rest.
- When: the computed `border-top-color` of each field is read, with the computed `background-color` of the nearest ancestor that paints one (`.city-modal__dialog`, `.desktop-dialog`/`.favorite-form`).
- Then: the border color equals `--color-border-control` and its contrast against that ancestor is >= 3.0 (unrounded), in both themes. For `.segmented`, only the outer border is measured; the option dividers keep `--color-border` (see AS-CT-05). `.favorite-color-input` in Manual (opacity 1) meets 3:1 on its border. In Auto it is dimmed (`opacity: 0.5`, `controls.css`) with `pointer-events: none`, an inactive component under WCAG 1.4.11: only its computed `border-top-color` must equal `--color-border-control`, its rendered contrast is not asserted (Accepted exceptions). The focus-ring pair is covered by `test/borderContrast.test.js` (Default decision 5). The clear button (`.weather-form__clear`) still has a transparent border.
- Verified by: `dg-46-control-border-contrast.mjs`. Expected before the change: red, 1.35 (light) and 1.41 (dark).

### AS-CT-04 The first-run hint tile keeps its dashed edge and gains the contrast

- Given: no city stored (`weather:hint` present), viewport 1280×800, both themes, both widths of the hint. Seeds as in `dg-21-hint-tile.mjs`: default layout for 1×1 (hint at cell 0,0,1,1); first metric disabled via `widgetStorageV2` for 2×1 (hint at 1,0,2,1).
- When: the computed `border-top-style` and `border-top-color` of `.city-hint-tile` are read.
- Then: style is `dashed`; color equals `--color-border-control`; contrast against the tile background and the body background >= 3.0. Click and edit-mode behavior are unchanged (`dg-21` stays green).
- Verified by: `dg-46-control-border-contrast.mjs`; existing `dg-21-hint-tile.mjs` as regression. Expected before the change: color check red.

### AS-CT-05 Everything else keeps its quiet look

- Given: both themes; the city modal, the Add link dialog, the Add menu, the suggestions list, a tooltip, a weather tile, and a default button are rendered.
- When: the computed `border-top-color` of `.favorite-form`, `.favorite-form__row` (not first), `.city-modal__dialog`, `.desktop-dialog`, `.add-menu`, `.weather-form__suggestions`, `.tooltip`, `.weather-tile` (no tone), `.button` (default), and the right border of a non-last `.segmented__option` is read.
- Then: each equals the resolved `--color-border`, exactly as before. Hover on `.chrome-tile` and `.button` still gives `--primary`; focus rings are unchanged (`test/focusTokens.test.js` and `test/designSystem.test.js` pass untouched).
- Verified by: `dg-46-control-border-contrast.mjs` (separators block) and a source assertion in `test/borderContrast.test.js` that the five rules in Scope use `var(--border-control)` and that no other rule in `controls.css`, `surfaces.css` or `newtab.css` does. Expected before the change: the five-rule assertions are red; the separator checks are green (characterization).

### AS-CT-06 Docs and changelog reflect the token

- Given: the repository after the change.
- When: `docs/design-system.md` (color token table and border-roles paragraph), `CHANGELOG.md` and the follow-up spec's Non-goals line are read.
- Then: the token and its alias are listed with their role; the paragraph names the two roles and says which token a new control boundary must use; no line in the Components section still calls a field or segmented border `--color-border`; `CHANGELOG.md` has a `Changed` entry under `[Unreleased]` stating that field and chrome-tile borders are darker for accessibility; the follow-up spec's existing Non-goals line carries the "lifted by" note.
- Verified by: a source assertion in `test/borderContrast.test.js` that `docs/design-system.md` mentions `--color-border-control`; design review (copy lens) reads the CHANGELOG line.

## Review focus

- **Quiet look:** the planned borders sit between the old faint hairline and the muted text color. In both themes, look at the chrome tiles next to weather and favorite tiles (they keep faint or accent borders): does the grid still read calm, or do the two chrome tiles now shout? Screenshot the planned border next to the old one and next to the muted text color before accepting. This is a design judgment; contrast is already a hard number.
- **Which surfaces:** is the five-surface list right? In particular the dashed hint tile (control, but also a placeholder), `.segmented` outer border with faint inner dividers, and whether `.button` (text-labelled) should follow for consistency.
- **Neighbour colors:** the numbers assume resting surfaces. Check any surface that paints a different background behind a field (focused fill, hover rows) and confirm the focus ring covers it, as Default decision 5 says.
- **Regression:** `test/focusTokens.test.js`, `test/designSystem.test.js`, E2E `dg-21`, `dg-41`, `dg-42`, `13-city-modal` and `15-city-modal-layout` (metrics must not move: only a color changes, border width stays 1 px).
