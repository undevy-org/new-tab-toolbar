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
