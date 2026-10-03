# Design system follow-up (post Phase 2)

## Status

`ready for spec gate`

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-03 | Two plus icons on the home grid while the first-run city modal is open; only one plus should exist. | `confirmed` (product rule vs current behavior) | AS-FU-01; cause: `createCityHintTile` draws `plus` at 1-wide (`src/newtab.js`) and `createChromeTile` draws `plus` for `chrome:add`, both rendered in the `no-location` branch of `renderDesktop`. E2E `dg-21-hint-tile.mjs` checks `h.svg && h.text === ""`, which also passes with any glyph, so it must be tightened to compare the icon path; `dg-15-city-first-run.mjs` only checks that both ids exist (it needs a plus counter) |
| 2026-10-03 | Free drag across the grid no longer works; invalid (red dashed) highlight when moving a widget into open-looking space; worked before the last PR. | `confirmed` for the display layer; `not a defect` for the engine rule (`canPlace`) | AS-FU-02, AS-FU-03; `docs/architecture.md` § Desktop grid UI; AS-DS-20; E2E `dg-05-drag-widget.mjs` passes on `main` (`5b5de9f`), so no regression of the rule is shown. Cause: `updateDragTarget` computes validity for `target`, but `drawDropHighlight` clamps `--x`/`--y` into the grid, so the red outline can sit on a cell other than the one judged (e.g. a 2×1 tile at column 11 is invalid, the outline is drawn at column 10, which looks free). Also, `dragSession.rows = lowest + 2` always adds a row that is invalid for every tile. The engine is not the cause: the Phase 2 diff touched only `newtab.css` in `src/` (token swaps; `.drop-highlight` gained only `border-radius`), `desktopLayout.js` and the drag code in `newtab.js` are unchanged |

## Default decisions (owner can override)

These were recommended by the stage 1 review and applied as defaults so the pipeline does not wait. Override any of them before the plan starts.

1. **Which tile keeps the plus:** `chrome:add`. The city hint at 1×1 gets the existing `mapPin` icon from `icons.js` (no new icon, no new colors). The wide hint keeps the text "Set a city".
2. **Always-invalid row during drag:** the extra row below `lowest + 1` (and every row beyond it; `lowest` excludes the dragged tile) shows no highlight (not a red one). User-visible effect: a drop two rows below still returns the tile and writes nothing, it just no longer flashes red. This **amends AS-DS-20** and `docs/architecture.md` § Desktop grid UI, which today say a dashed error outline appears "more than one row below the lowest tile".
3. **Highlight never moves to another cell and never leaves the grid:** the outline is drawn at the evaluated cell only when that block lies fully inside the rendered grid (`0 ≤ x`, `x + w ≤ columns`, `y ≤ lowest + 1`, where `lowest` is the lowest occupied row excluding the dragged tile, as in `canPlace`). Otherwise no `.drop-highlight` exists. It is never clamped into the grid. (An overhanging outline would widen the page at narrow viewports and add scroll height during autoscroll.)
4. **Engine untouched:** `canPlace`, `displayLayout` and the "at most one row below" rule stay as they are.

## Scope

- Phase 2 **presentation and affordance** fixes that do not change grid engine persistence (`widgetsService.js`, `displayLayout` / `canPlace` algorithms).
- City-hint glyph at 1×1, and the drop-highlight display layer (`drawDropHighlight`, drag `rows`).
- Amendment of AS-DS-20 (drag affordance on the always-invalid row) with matching edits to `docs/architecture.md` § Desktop grid UI, a one-line amendment note in `docs/design-system.md` AS-DS-20 (`Amended by AS-FU-03: no highlight is drawn for a block that does not fit or lies beyond the allowed row; invalid-because-occupied keeps the dashed outline`), and E2E `dg-18-drop-occupied.mjs` (two checks: two rows below, and past the right edge), plus a check that `dg-05` and `dg-33` do not depend on a `valid=false` highlight on that row.
- Source-text test `test/newtabSource.test.js` (~:652) asserts `createIconNode("plus")` in `createCityHintTile`; it and the comment above that function ("the plus glyph at 1-wide") are updated to `mapPin`.
- New acceptance scenarios for chrome tiles, city-hint tile and edit-mode drag feedback.
- `CHANGELOG.md` entry under `[Unreleased]`; refresh the README screenshot if the first-run hint is visible on it.

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`), E2E, then merge only after the owner confirms.

## Non-goals

- Changing the "at most one row below the lowest tile" rule or `canPlace` itself.
- Changing tile keyboard focus tokens (`test/focusTokens.test.js`) without a dedicated AS and owner approval.
- New design tokens or colors (`--danger`, `--primary`, drop-highlight radius stay as they are) (lifted for `--color-border-control` by `docs/border-contrast.md`).
- Rewriting weather fetch, geocoding, or storage schemas.
- Broad grid-engine features (multi-row gaps, repack policy) unless captured in a new AS and approved.

## Accepted exceptions

- (none yet)

## Acceptance scenarios

### AS-FU-01 Single plus on the grid when the city is unset

- Given: `weatherService` is present; no city is stored (`effectiveWeatherResult().status === "no-location"`); the desktop grid is rendered. Two runs: (1) the first-run city modal is open (grid inert), (2) the modal is closed.
- When: SVG glyphs are counted on the tiles of `#favorites .desktop-grid > [data-widget-id]`.
- Then: the `plus` glyph (full equality with the `ICON_PATHS.plus` path, not `startsWith`: `plus` begins with `minus`) appears on exactly one tile, `[data-widget-id="chrome:add"]`. The hint tile `weather:hint` at 1×1 shows the `mapPin` icon (not plus, no text); at 2-wide it shows the text "Set a city". `aria-label="Set a city"` and behavior (click opens the city modal; in edit mode it acts as its metric) do not change.
- Verified by: `test/newtabSource.test.js` (hint regex updated to `mapPin`; `test/icons.test.js` already lists `mapPin`), `dg-21-hint-tile.mjs` (`hintInfo` returns the icon's inner HTML, compared with `ICON_PATHS.mapPin` and not `plus`; wide: text), `dg-15-city-first-run.mjs` (plus count === 1 with the modal open), modal-closed run inside `dg-21`; design review (visual lens) for first-run screenshot parity. Expected before the fix: plus count 2 in `dg-15`, `mapPin` check fails in `dg-21`, the source test passes (it still encodes the old behavior).

### AS-FU-02 Drag a real weather tile to the first free row

- Given: viewport 1280×800 (harness default, 12 columns); a city is set (`weatherFixture.sync` plus `weatherFixture.local()`, so metrics render as real tiles and not as `weather:hint`); edit mode on; layout `defaultMetrics()` + `defaultChrome()`: temperature (0,0), precipitation (1,0,2×1), airQuality (3,0,2×1), uv (5,0), settings (6,0), add (7,0). Seed: `seedAndReload(page, { ...widgetStorageV2([...defaultMetrics(), ...defaultChrome()]), ...weatherFixture.sync }, weatherFixture.local())`, then click `[data-widget-id="chrome:settings"]`.
- When: (a) `weather:uv` (1×1) is dragged to cell (8,1), then (b) in a separate run `weather:precipitation` (2×1) is dragged to (8,1); released.
- Then: while over the cell, `dropHighlight(page)` is `{ valid: "true", cell: "8,1" }`; after release `storedGrids(page)[id]` deep-equals `g(8,1)` (or `g(8,1,2,1)` for precipitation); `#desktop-status` stays hidden; `activeWidgetId(page)` is the dragged id; no page error.
- Verified by: new E2E `dg-43-weather-drag-row1.mjs`. Expected before the fix: green on current `main` (characterization test; engine and drag code are unchanged). This is the first scenario that drags a real weather metric with a city set; `dg-18` already covers row 1 valid / row 2 invalid for favorite links only.

### AS-FU-03 Drop highlight matches the judged cell (amends AS-DS-20)

- Given: same seed as AS-FU-02, dragging `weather:precipitation` (2×1). `dragTile` presses the tile's top-left cell, so the grab offset is 0 and the evaluated cell equals the pointer cell (`cellCenter`).
- When / Then (viewport 1280×800):
  - (a) **Does not fit:** held over (11,0), where cells 10 and 11 of row 0 are free: `dropHighlight(page)` is `null` (nothing on cell 10 or anywhere). Control: held over (10,0) it is `{ valid: "true", cell: "10,0" }`. Release over (11,0): the tile returns, `storedGrids(page)` is unchanged, `#desktop-status` stays hidden.
  - (b) **Beyond the allowed row:** held over (3,2) (two rows below the lowest occupied row 0), and over a point below the grid box: `dropHighlight(page)` is `null`; release returns the tile, nothing is written, `#desktop-status` stays hidden (a rejected drop is not a write error).
  - (c) **One row below:** over (8,1) valid, as in AS-FU-02.
  - (d) **Rejected with a visible reason:** over an occupied cell, or with the pointer in the page margin left of the grid or above its top, the dashed `data-valid="false"` highlight stays at the judged cell (these `dg-18` checks stay green). Past the right edge (`cellCenter(page, 12, 0)`, 1×1 tile) no highlight is drawn (`dropHighlight` is `null`) and nothing is written (amended `dg-18` check).
  - (e) **No layout growth:** in (a), (b) and a drag with the pointer below the grid, `document.documentElement.scrollWidth` and `scrollHeight`, measured right after the drag starts, do not increase while the pointer moves. `dg-33` stays the vertical autoscroll guard; `dg-10` covers narrow viewports.
- Verified by: new E2E `dg-44-drag-highlight-invariant.mjs`; amended `dg-18-drop-occupied.mjs` (two checks: two rows below and past the right edge now expect no highlight and no write instead of `valid === "false"`); `docs/architecture.md` § Desktop grid UI reworded so the dashed error outline no longer covers non-fitting blocks or the extra row; the amendment note in `docs/design-system.md` AS-DS-20; design review (visual lens) for drag screenshots. Expected before the fix: `dg-44` (a) and (b) red.

## Review focus

- **Chrome vs hint:** first-run and no-city states: iconography, dashed hint border vs solid chrome tiles, plus duplication (AS-FU-01).
- **Edit-mode drag:** valid primary outline vs invalid dashed danger on `.drop-highlight`; the `drawDropHighlight` clamp must not shift the outline off the judged cell; `grid --rows` during drag vs the `canPlace` row limit (AS-FU-02, AS-FU-03).
- **Regression:** AS-DS-20 E2E suite (`dg-03`, `dg-05`, `dg-10`, `dg-18`, `dg-33`) stays green after the amendment.
