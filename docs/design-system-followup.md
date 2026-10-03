# Design system follow-up (post Phase 2)

## Status

`draft`

## Intake log

| Date | Raw note (owner) | Verdict | Reference |
|------|------------------|---------|-----------|
| 2026-10-03 | Two plus icons on the home grid while the first-run city modal is open; only one plus should exist. | `confirmed` (product rule vs current behavior) | AS-FU-01; E2E `dg-15-city-first-run.mjs` currently **expects** both `weather:hint` and `chrome:add` |
| 2026-10-03 | Free drag across the grid no longer works; invalid (red dashed) highlight when moving a widget into open-looking space; worked before the last PR. | `needs owner decision` (partially `not a defect` for engine rule; possible UX gap) | AS-FU-02, AS-FU-03; `docs/architecture.md` § Desktop grid UI; AS-DS-20; E2E `dg-05-drag-widget.mjs` passes on `main` (`5b5de9f`) |

## Scope

- Phase 2 **presentation and affordance** fixes that do not change grid engine persistence (`widgetsService.js`, `displayLayout` / `canPlace` algorithms) unless the owner explicitly expands scope.
- Amendments and new acceptance scenarios for chrome tiles, city-hint tile, and edit-mode drag feedback.

## Non-goals

- Changing tile keyboard focus tokens (`test/focusTokens.test.js`) without a dedicated AS and owner approval.
- Rewriting weather fetch, geocoding, or storage schemas.
- Broad grid-engine features (multi-row gaps, repack policy) unless captured in a new AS and approved.

## Accepted exceptions

- (none yet)

## Acceptance scenarios

### AS-FU-01 Single “add” plus on the grid when the city is unset

- Given: Weather is available; no city is stored (`effectiveWeatherResult().status === "no-location"`); the desktop grid is rendered (with or without the first-run city modal open over it).
- When: The user looks at grid tiles (modal may be open; grid may be inert).
- Then: **Exactly one** tile on the grid uses the plus glyph (`icons.js` path `plus`) as its primary affordance. The city-hint tile (`data-widget-id="weather:hint"`) must **not** reuse the same plus icon as `chrome:add` (use copy such as “Set a city” at 1-wide, or a non-plus icon, per implementation plan). `chrome:add` remains the sole plus when the hint is visible, **or** the owner chooses the inverse in a plan amendment — default in this spec: **one plus total**, hint does not show plus at 1×1.
- Verified by: E2E amendment to `dg-15-city-first-run.mjs` and `dg-21-hint-tile.mjs` (assert plus glyph count === 1); design review (visual lens) for first-run screenshot parity.

### AS-FU-02 Valid drop targets stay valid after Phase 2 (regression guard)

- Given: Edit mode on; city chosen; default four weather metrics enabled; chrome tiles present; viewport **≥ 500px** wide; stored grids match a single top row (harness profile equivalent to owner screenshot).
- When: The user drags `weather:uv` (1×1) to an **unoccupied** cell on row **y = 1** (one row below the lowest occupied row), e.g. column **x = 8** or **x = 10**, and releases.
- Then: Drop highlight shows `data-valid="true"` while over that cell; after release the metric is persisted at that cell; no page-level error alert; focus remains on the dragged tile.
- Verified by: New E2E `dg-fu-02-weather-drag-row1.mjs` (or extension of `dg-05-drag-widget.mjs`).

### AS-FU-03 Drag grid affordance matches placement rules (amends clarity for AS-DS-20)

- Given: Edit mode on; same as AS-FU-02; user drags any movable tile.
- When: The pointer is over a grid row **more than one row below** the lowest occupied row (engine rule: invalid per `canPlace` in `desktopLayout.js` and `docs/architecture.md`).
- Then: Drop highlight shows `data-valid="false"` (dashed danger outline per Phase 2 tokens); on release the tile returns to its origin; nothing is written.
- When (affordance): During drag, any grid row that can **never** be valid for the current layout is either not shown as empty droppable space, or invalid highlighting is clearly tied to disallowed rows (no “empty but always red” phantom row without visual explanation).
- Verified by: E2E asserting highlight validity at row 1 vs row 2 for a one-row layout; design review visual lens for drag screenshots.

## Review focus

- **Chrome vs hint:** First-run and no-city states — iconography, dashed hint border vs solid chrome tiles, plus duplication (AS-FU-01).
- **Edit-mode drag:** Valid primary outline vs invalid dashed danger on `.drop-highlight` after token migration; grid `--rows` during drag vs `canPlace` row limit (AS-FU-02, AS-FU-03).
- **Regression:** AS-DS-20 E2E suite (`dg-03`, `dg-05`, `dg-10`) remains green after affordance fixes.
