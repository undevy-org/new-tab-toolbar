import {
  DEFAULT_GRID_COLUMNS,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS
} from "./widgetsShared.js";

// A wide tile only spans two columns when the grid has two to span. In a 1-column grid
// `grid-column: span 2` creates an implicit zero-width track and the tile collapses to
// ~61px (neither wide nor square), so it is rendered as a square instead. The stored
// tileSize is never changed, so it springs back when the user adds columns.
export function tileSpan(tileSize, columns) {
  return tileSize === "wide" && columns >= 2 ? 2 : 1;
}

// Columns the existing single row occupies (square = 1, wide = 2), so an upgrade does
// not visibly re-wrap the user's favorites.
export function defaultColumnsForItems(items) {
  if (items.length === 0) {
    return DEFAULT_GRID_COLUMNS;
  }

  const totalSpan = items.reduce((sum, item) => sum + (item.tileSize === "wide" ? 2 : 1), 0);
  const floor = items.some((item) => item.tileSize === "wide") ? 2 : MIN_GRID_COLUMNS;
  return Math.min(Math.max(totalSpan, floor), MAX_GRID_COLUMNS);
}

export function gridLayout(state) {
  return {
    columns: state?.columns ?? DEFAULT_GRID_COLUMNS,
    position: state?.position ?? "top"
  };
}

// Where the settings panel docks and how tall it may grow so it never covers the bar it
// configures: bar at the top => bottom edge, bar at the bottom => top edge, bar in the
// middle => whichever side has more room. `minHeight` keeps the panel usable on very
// short viewports; only then can it overlap the bar (`overlaps: true`).
export function panelDock({ position, barTop, barBottom, viewportHeight, inset, gap, minHeight }) {
  const freeTop = barTop - gap - inset;
  const freeBottom = viewportHeight - barBottom - gap - inset;
  const dock =
    position === "top" ? "bottom" : position === "bottom" ? "top" : freeBottom > freeTop ? "bottom" : "top";
  const free = dock === "top" ? freeTop : freeBottom;
  return { dock, maxHeight: Math.max(minHeight, free), overlaps: free < minHeight };
}

export function isRenderedWidget(item) {
  return item.type === "favorite" || item.enabled === true;
}

// A rendered widget jumps over the next rendered widget in `step` direction (disabled
// metrics are transparent); a disabled row moves exactly one row. -1 = nowhere to go.
export function moveTargetIndex(items, index, step) {
  if (step === 0) {
    return -1;
  }
  if (!isRenderedWidget(items[index])) {
    const target = index + step;
    return target >= 0 && target < items.length ? target : -1;
  }
  for (let i = index + step; i >= 0 && i < items.length; i += step) {
    if (isRenderedWidget(items[i])) {
      return i;
    }
  }
  return -1;
}
