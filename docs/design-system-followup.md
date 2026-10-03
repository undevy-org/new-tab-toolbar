# Design system follow-up (post Phase 2)

## Status

`draft`

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-03 | Two plus icons on the home grid while the first-run city modal is open; only one plus should exist. | `confirmed` (product rule vs current behavior) | AS-FU-01; cause: `createCityHintTile` draws `plus` at 1-wide (`src/newtab.js`) and `createChromeTile` draws `plus` for `chrome:add`, both rendered in the `no-location` branch of `renderDesktop`. E2E `dg-21-hint-tile.mjs` **expects** an svg glyph on the 1×1 hint (it must change); `dg-15-city-first-run.mjs` only checks that both ids exist (it needs a plus counter) |
| 2026-10-03 | Free drag across the grid no longer works; invalid (red dashed) highlight when moving a widget into open-looking space; worked before the last PR. | `confirmed` for the display layer; `not a defect` for the engine rule (`canPlace`) | AS-FU-02, AS-FU-03; `docs/architecture.md` § Desktop grid UI; AS-DS-20; E2E `dg-05-drag-widget.mjs` passes on `main` (`5b5de9f`), so no regression of the rule is shown. Cause: `updateDragTarget` computes validity for `target`, but `drawDropHighlight` clamps `--x`/`--y` into the grid, so the red outline can sit on a cell other than the one judged (e.g. a 2×1 tile at column 11 is invalid, the outline is drawn at column 10, which looks free). Also, `dragSession.rows = lowest + 2` always adds a row that is invalid for every tile |

## Default decisions (owner can override)

These were recommended by the stage 1 review and applied as defaults so the pipeline does not wait. Override any of them before the plan starts.

1. **Which tile keeps the plus:** `chrome:add`. The city hint at 1×1 gets the existing `mapPin` icon from `icons.js` (no new icon, no new colors). The wide hint keeps the text "Set a city".
2. **Always-invalid row during drag:** the extra row below `lowest + 1` shows no highlight (not a red one). This **amends AS-DS-20** and `docs/architecture.md` § Desktop grid UI, which today say a dashed error outline appears "more than one row below the lowest tile".
3. **Highlight never moves to another cell:** the outline is drawn at the cell that was evaluated, not clamped into the grid.
4. **Engine untouched:** `canPlace`, `displayLayout` and the "at most one row below" rule stay as they are.

## Scope

- Phase 2 **presentation and affordance** fixes that do not change grid engine persistence (`widgetsService.js`, `displayLayout` / `canPlace` algorithms).
- City-hint glyph at 1×1, and the drop-highlight display layer (`drawDropHighlight`, drag `rows`).
- Amendment of AS-DS-20 (drag affordance on the always-invalid row) with matching edits to `docs/architecture.md` § Desktop grid UI and to E2E `dg-18-drop-occupied.mjs` (the two-rows-below check), plus a check that `dg-05` and `dg-33` do not depend on a `valid=false` highlight on that row.
- New acceptance scenarios for chrome tiles, city-hint tile and edit-mode drag feedback.
- `CHANGELOG.md` entry under `[Unreleased]`; refresh the README screenshot if the first-run hint is visible on it.

## Process

This changes what the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`), E2E, then merge only after the owner confirms.

## Non-goals

- Changing the "at most one row below the lowest tile" rule or `canPlace` itself.
- Changing tile keyboard focus tokens (`test/focusTokens.test.js`) without a dedicated AS and owner approval.
- New design tokens or colors (`--danger`, `--primary`, drop-highlight radius stay as they are).
- Rewriting weather fetch, geocoding, or storage schemas.
- Broad grid-engine features (multi-row gaps, repack policy) unless captured in a new AS and approved.

## Accepted exceptions

- (none yet)

## Acceptance scenarios

### AS-FU-01 Single plus on the grid when the city is unset

- Given: `weatherService` is present; no city is stored (`effectiveWeatherResult().status === "no-location"`); the desktop grid is rendered. Two runs: (1) the first-run city modal is open (grid inert), (2) the modal is closed.
- When: SVG glyphs are counted on the tiles of `#favorites .desktop-grid > [data-widget-id]`.
- Then: the `plus` glyph (full equality with the `ICON_PATHS.plus` path, not `startsWith`: `plus` begins with `minus`) appears on exactly one tile, `[data-widget-id="chrome:add"]`. The hint tile `weather:hint` at 1×1 shows the `mapPin` icon (not plus, no text); at 2-wide it shows the text "Set a city". `aria-label="Set a city"` and behavior (click opens the city modal; in edit mode it acts as its metric) do not change.
- Verified by: `dg-21-hint-tile.mjs` (1×1: svg present and not plus; wide: text), `dg-15-city-first-run.mjs` (plus count === 1 with the modal open), modal-closed run inside `dg-21`; design review (visual lens) for first-run screenshot parity.

### AS-FU-02 Drag a real weather tile to the first free row

- Given: viewport 1280×800 (harness default, 12 columns); a city is set (`weatherFixture.sync` plus `weatherFixture.local()`, so metrics render as real tiles and not as `weather:hint`); edit mode on; layout `defaultMetrics()` + `defaultChrome()`: temperature (0,0), precipitation (1,0,2×1), airQuality (3,0,2×1), uv (5,0), settings (6,0), add (7,0). Seed: `seedAndReload(page, { ...widgetStorageV2([...defaultMetrics(), ...defaultChrome()]), ...weatherFixture.sync }, weatherFixture.local())`, then click `[data-widget-id="chrome:settings"]`.
- When: (a) `weather:uv` (1×1) is dragged to cell (8,1), then (b) in a separate run `weather:precipitation` (2×1) is dragged to (8,1); released.
- Then: while over the cell, `dropHighlight(page)` is `{ valid: "true", cell: "8,1" }`; after release `storedGrids(page)[id]` deep-equals `g(8,1)` (or `g(8,1,2,1)` for precipitation); `#desktop-status` stays hidden; `activeWidgetId(page)` is the dragged id; no page error.
- Verified by: new E2E `dg-43-weather-drag-row1.mjs`. This is the first scenario that drags a real weather metric with a city set; `dg-18` already covers row 1 valid / row 2 invalid for favorite links only.

### AS-FU-03 Drop highlight matches the judged cell (amends AS-DS-20)

- Given: same seed as AS-FU-02, dragging `weather:precipitation` (2×1).
- When / Then:
  - (a) Pointer over the last column (x = 11): the block does not fit, so the drop is invalid. If a highlight is drawn it carries `data-valid="false"` and its `--x` equals the evaluated `target.x` (11), never the clamped 10. Cell 10 stays unhighlighted.
  - (b) Pointer on row 2 (two rows below the lowest occupied row 0): no `.drop-highlight` is shown; releasing returns the tile, `storedGrids(page)` is unchanged, `#desktop-status` stays hidden (a rejected drop is not a write error).
  - (c) Pointer on row 1 (one row below): valid, as in AS-FU-02.
  - (d) Invalid because of occupation, the right edge or the page margin still shows the dashed danger highlight at the judged cell (existing `dg-18` checks stay green).
- Verified by: new E2E `dg-44-drag-highlight-invariant.mjs`; amendment of `dg-18-drop-occupied.mjs` (the "two rows below is invalid" check now expects no highlight and no write); `docs/architecture.md` § Desktop grid UI reworded so the dashed error outline no longer covers the extra row; design review (visual lens) for drag screenshots.

## Review focus

- **Chrome vs hint:** first-run and no-city states: iconography, dashed hint border vs solid chrome tiles, plus duplication (AS-FU-01).
- **Edit-mode drag:** valid primary outline vs invalid dashed danger on `.drop-highlight`; the `drawDropHighlight` clamp must not shift the outline off the judged cell; `grid --rows` during drag vs the `canPlace` row limit (AS-FU-02, AS-FU-03).
- **Regression:** AS-DS-20 E2E suite (`dg-03`, `dg-05`, `dg-10`, `dg-18`, `dg-33`) stays green after the amendment.
