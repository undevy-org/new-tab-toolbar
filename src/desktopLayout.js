
// src/desktopLayout.js — pure grid engine: no DOM, no storage. Spec: § Grid metrics, § Display layout, § Placement rules.
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 12;
export const REFERENCE_COLUMNS = 12;
export const CHROME_IDS = { settings: "chrome:settings", add: "chrome:add" };

const METRICS = [
  { maxWidth: 360, cell: 56, gap: 6, pad: 8 },
  { maxWidth: 600, cell: 64, gap: 8, pad: 12 },
  { maxWidth: Infinity, cell: 72, gap: 8, pad: 16 }
];

export function gridMetrics(width) {
  return METRICS.find((m) => width <= m.maxWidth);
}

// `width` is document.documentElement.clientWidth (excludes a classic scrollbar).
export function effectiveColumns(width) {
  const { cell, gap, pad } = gridMetrics(width);
  const fit = Math.floor((width - 2 * pad + gap) / (cell + gap));
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, fit));
}

export function isValidGrid(grid) {
  return (
    grid !== null &&
    typeof grid === "object" &&
    Number.isInteger(grid.x) && grid.x >= 0 &&
    Number.isInteger(grid.y) && grid.y >= 0 &&
    (grid.w === 1 || grid.w === 2) &&
    (grid.h === 1 || grid.h === 2)
  );
}

const cellKey = (x, y) => `${x},${y}`;

function blockFree(occupied, x, y, w, h, columns) {
  if (x < 0 || y < 0 || x + w > columns) return false;
  for (let dx = 0; dx < w; dx += 1) {
    for (let dy = 0; dy < h; dy += 1) {
      if (occupied.has(cellKey(x + dx, y + dy))) return false;
    }
  }
  return true;
}

function mark(occupied, { x, y, w, h }) {
  for (let dx = 0; dx < w; dx += 1) {
    for (let dy = 0; dy < h; dy += 1) occupied.add(cellKey(x + dx, y + dy));
  }
}

// First free w×h block scanning row-major (x then y) from (0, startY).
function firstFree(occupied, w, h, columns, startY = 0) {
  if (w > columns) throw new RangeError("Widget is wider than the grid");
  for (let y = startY; ; y += 1) {
    for (let x = 0; x + w <= columns; x += 1) {
      if (blockFree(occupied, x, y, w, h, columns)) return { x, y, w, h };
    }
  }
}

// Size of an item: its valid grid, else the legacy tileSize, else 1×1.
export function sizeOf(item) {
  if (isValidGrid(item.grid)) return { w: item.grid.w, h: item.grid.h };
  return item.tileSize === "wide" ? { w: 2, h: 1 } : { w: 1, h: 1 };
}

export function isOnGrid(item) {
  return item.type !== "weather-metric" || item.enabled === true;
}

// Displayed layout = pure function of stored grids and C. Returns Map id -> {x,y,w,h}. Never persisted by itself.
// `items` is in `order`; hidden metrics are ignored.
export function displayLayout(items, columns) {
  const onGrid = items.map((item, index) => ({ item, index })).filter(({ item }) => isOnGrid(item));
  const positioned = onGrid.filter(({ item }) => isValidGrid(item.grid));
  const unplaced = onGrid.filter(({ item }) => !isValidGrid(item.grid));
  positioned.sort((a, b) => a.item.grid.y - b.item.grid.y || a.item.grid.x - b.item.grid.x || a.index - b.index);

  const occupied = new Set();
  const layout = new Map();
  for (const { item } of positioned) {
    const { x, y, w, h } = item.grid;
    const spot = blockFree(occupied, x, y, w, h, columns) ? { x, y, w, h } : firstFree(occupied, w, h, columns, y);
    mark(occupied, spot);
    layout.set(item.id, spot);
  }
  for (const { item } of unplaced) {
    const { w, h } = sizeOf(item);
    const spot = firstFree(occupied, w, h, columns, 0);
    mark(occupied, spot);
    layout.set(item.id, spot);
  }
  return layout;
}

function occupancyOf(layout, exceptId) {
  const occupied = new Set();
  for (const [id, grid] of layout) if (id !== exceptId) mark(occupied, grid);
  return occupied;
}

// Drop/resize validity against a displayed layout. A block may sit at most one row below the lowest occupied row.
export function canPlace(layout, id, { x, y, w, h }, columns) {
  let lowest = -1;
  for (const [otherId, g] of layout) if (otherId !== id) lowest = Math.max(lowest, g.y + g.h - 1);
  return y <= lowest + 1 && blockFree(occupancyOf(layout, id), x, y, w, h, columns);
}

// Resize: own old block counts as free; keep (x,y) if the new block fits, else first free from the own row.
export function placeResized(layout, id, { w, h }, columns) {
  const current = layout.get(id);
  const occupied = occupancyOf(layout, id);
  if (blockFree(occupied, current.x, current.y, w, h, columns)) return { x: current.x, y: current.y, w, h };
  return firstFree(occupied, w, h, columns, current.y);
}

// New link / restored metric: first free block from (0,0) at the current column count.
export function placeNew(layout, { w, h }, columns) {
  return firstFree(occupancyOf(layout, null), w, h, columns, 0);
}

// Cell under a pointer, minus the grab offset (cell the pointer grabbed inside the block).
export function cellFromPoint({ x, y }, origin, { cell, gap }, grab = { x: 0, y: 0 }) {
  const step = cell + gap;
  return {
    x: Math.max(0, Math.floor((x - origin.left) / step) - grab.x),
    y: Math.max(0, Math.floor((y - origin.top) / step) - grab.y)
  };
}

const DEFAULT_METRIC_SIZES = {
  "weather:temperature": { w: 1, h: 1 },
  "weather:precipitation": { w: 2, h: 1 },
  "weather:airQuality": { w: 2, h: 1 },
  "weather:uv": { w: 1, h: 1 }
};
export const DEFAULT_ENTRY_ORDER = [
  "weather:temperature", "weather:precipitation", "weather:airQuality", "weather:uv",
  CHROME_IDS.settings, CHROME_IDS.add
];

export function defaultSize(id) {
  return DEFAULT_METRIC_SIZES[id] ?? { w: 1, h: 1 };
}

// Defaults / ensure: place the missing ids (in DEFAULT_ENTRY_ORDER) at the first free block over 12 columns,
// around `existing` (items that already have a valid grid and are on the grid).
export function placeMissing(missingIds, existing) {
  const occupied = new Set();
  for (const item of existing) if (isOnGrid(item) && isValidGrid(item.grid)) mark(occupied, item.grid);
  const out = new Map();
  for (const id of DEFAULT_ENTRY_ORDER.filter((entry) => missingIds.includes(entry))) {
    const { w, h } = defaultSize(id);
    const spot = firstFree(occupied, w, h, REFERENCE_COLUMNS);
    mark(occupied, spot);
    out.set(id, spot);
  }
  return out;
}

// v1 → v2 packing. `items` are v1 items in v1 order (favorites then metrics) and may already carry a valid grid
// (resume). `columns` = v1 meta.columns. Returns Map id -> grid for every item plus both chrome tiles.
export function migrateV1ToV2(items, columns) {
  const C = Math.min(MAX_COLUMNS, Math.max(1, columns));
  const hidden = (item) => item.type === "weather-metric" && item.enabled === false;
  const occupied = new Set();
  const out = new Map();

  for (const item of items) {
    if (!hidden(item) && isValidGrid(item.grid)) {
      mark(occupied, item.grid);
      out.set(item.id, item.grid);
    }
  }
  for (const item of items) {
    if (out.has(item.id)) continue;
    if (hidden(item)) {
      out.set(item.id, { x: 0, y: 0, w: item.tileSize === "wide" ? 2 : 1, h: 1 });
      continue;
    }
    const wide = item.tileSize === "wide" && C >= 2;
    const spot = firstFree(occupied, wide ? 2 : 1, 1, C);
    mark(occupied, spot);
    out.set(item.id, spot);
  }
  for (const id of [CHROME_IDS.settings, CHROME_IDS.add]) {
    if (out.has(id)) continue;
    const spot = firstFree(occupied, 1, 1, C);
    mark(occupied, spot);
    out.set(id, spot);
  }
  return out;
}
