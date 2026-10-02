// src/desktopUiState.js — pure UI state for the desktop grid (no DOM, no I/O). Spec § Edit mode, § Escape order (AS-11).
export const MENU_KINDS = new Set(["add", "restore-weather"]);
export const DIALOG_KINDS = new Set(["add-link", "edit-link", "edit-weather", "confirm-delete"]);

export function createDesktopUiState() {
  return { editMode: false, menu: null, dialog: null, drag: null };
}

export function enterEditMode(state) {
  return state.editMode ? state : { ...state, editMode: true };
}

// Leaving edit mode also closes a menu and cancels a drag; an open dialog is not touched (it is modal).
export function exitEditMode(state) {
  return { ...state, editMode: false, menu: null, drag: null };
}

export function toggleEditMode(state) {
  return state.editMode ? exitEditMode(state) : enterEditMode(state);
}

export function openMenu(state, kind) {
  if (!MENU_KINDS.has(kind)) throw new Error(`Unknown menu: ${kind}`);
  return { ...state, menu: kind };
}

export function closeMenu(state) {
  return state.menu === null ? state : { ...state, menu: null };
}

export function openDialog(state, dialog) {
  if (!DIALOG_KINDS.has(dialog?.kind)) throw new Error(`Unknown dialog: ${dialog?.kind}`);
  return { ...state, dialog, menu: null };
}

export function closeDialog(state) {
  return state.dialog === null ? state : { ...state, dialog: null };
}

// Dragging only exists in edit mode. `grab` = cell offset inside the block, `size` = {w,h}.
export function startDrag(state, { id, grab, size, pointerId }) {
  if (!state.editMode) return state;
  return { ...state, drag: { id, grab, size, pointerId, target: null, valid: false } };
}

export function updateDrag(state, target, valid) {
  return state.drag === null ? state : { ...state, drag: { ...state.drag, target, valid } };
}

export function endDrag(state) {
  return state.drag === null ? state : { ...state, drag: null };
}

// Which layer one Escape press closes, topmost first. `flags` comes from the DOM-owning caller.
export function escapeLayer(state, { tooltip = false, citySuggestions = false, cityModal = false } = {}) {
  if (state.drag) return "drag";
  if (tooltip) return "tooltip";
  if (citySuggestions) return "citySuggestions";
  if (cityModal) return "cityModal";
  if (state.dialog) return "dialog";
  if (state.menu) return "menu";
  if (state.editMode) return "exitEdit";
  return null;
}
