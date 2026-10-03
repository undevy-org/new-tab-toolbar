import {
  DEFAULT_GRID_COLUMNS,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS
} from "./widgetsShared.js";

// Columns the existing single row occupies (square = 1, wide = 2). Used by the legacy favorites -> widgets v1
// migration (the v1 meta needs a column count, which the v1 -> v2 step then packs with).
export function defaultColumnsForItems(items) {
  if (items.length === 0) {
    return DEFAULT_GRID_COLUMNS;
  }

  const totalSpan = items.reduce((sum, item) => sum + (item.tileSize === "wide" ? 2 : 1), 0);
  const floor = items.some((item) => item.tileSize === "wide") ? 2 : MIN_GRID_COLUMNS;
  return Math.min(Math.max(totalSpan, floor), MAX_GRID_COLUMNS);
}

// Where the shared tooltip goes: above the trigger if it fits, else below; centered on the
// trigger and clamped so it never leaves the viewport. Pure so it is testable without a DOM.
export function placeTooltip({ trigger, tooltip, viewport, gap = 8, margin = 8 }) {
  const spaceAbove = trigger.top - gap - margin;
  const side = spaceAbove >= tooltip.height ? "top" : "bottom";
  const rawTop = side === "top" ? trigger.top - gap - tooltip.height : trigger.bottom + gap;
  const top = Math.min(Math.max(rawTop, margin), Math.max(margin, viewport.height - margin - tooltip.height));
  const centered = trigger.left + trigger.width / 2 - tooltip.width / 2;
  const maxLeft = Math.max(margin, viewport.width - margin - tooltip.width);
  return { left: Math.min(Math.max(centered, margin), maxLeft), top, side };
}
