import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeDialog, closeMenu, createDesktopUiState, endDrag, enterEditMode, escapeLayer, exitEditMode, openDialog,
  openMenu, startDrag, toggleEditMode, updateDrag
} from "../src/desktopUiState.js";

const edit = () => enterEditMode(createDesktopUiState());

describe("edit mode", () => {
  it("starts off, toggles on and off", () => {
    const s = createDesktopUiState();
    assert.equal(s.editMode, false);
    assert.equal(toggleEditMode(s).editMode, true);
    assert.equal(toggleEditMode(toggleEditMode(s)).editMode, false);
  });
  it("leaving edit mode closes the menu and cancels the drag but keeps a dialog", () => {
    let s = startDrag(openMenu(edit(), "add"), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 });
    s = openDialog({ ...s, drag: null }, { kind: "edit-link", id: "a" });
    s = exitEditMode(startDrag(openMenu(s, "add"), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 }));
    assert.equal(s.menu, null);
    assert.equal(s.drag, null);
    assert.deepEqual(s.dialog, { kind: "edit-link", id: "a" });
  });
  it("is immutable and idempotent", () => {
    const s = createDesktopUiState();
    enterEditMode(s);
    assert.equal(s.editMode, false);
    const on = enterEditMode(s);
    assert.equal(enterEditMode(on), on);
  });
});

describe("drag", () => {
  const spec = { id: "a", grab: { x: 1, y: 0 }, size: { w: 2, h: 1 }, pointerId: 7 };
  it("only starts in edit mode", () => {
    const s = createDesktopUiState();
    assert.equal(startDrag(s, spec), s);
    assert.equal(startDrag(edit(), spec).drag.id, "a");
  });
  it("tracks the target and clears on end", () => {
    let s = updateDrag(startDrag(edit(), spec), { x: 3, y: 1 }, true);
    assert.deepEqual(s.drag.target, { x: 3, y: 1 });
    assert.equal(s.drag.valid, true);
    assert.equal(endDrag(s).drag, null);
    assert.equal(updateDrag(edit(), { x: 0, y: 0 }, true).drag, null);
  });
});

describe("menu and dialog", () => {
  it("rejects unknown kinds", () => {
    assert.throws(() => openMenu(edit(), "x"));
    assert.throws(() => openDialog(edit(), { kind: "x" }));
  });
  it("opening a dialog closes the menu", () => {
    const s = openDialog(openMenu(edit(), "add"), { kind: "add-link" });
    assert.equal(s.menu, null);
    assert.equal(closeDialog(s).dialog, null);
    assert.equal(closeMenu(openMenu(edit(), "restore-weather")).menu, null);
  });
});

describe("escapeLayer (AS-11)", () => {
  it("returns the topmost layer first", () => {
    let s = openDialog(edit(), { kind: "edit-weather", id: "weather:uv" });
    assert.equal(escapeLayer(s, { tooltip: true, cityModal: true }), "tooltip");
    assert.equal(escapeLayer(s, { citySuggestions: true, cityModal: true }), "citySuggestions");
    assert.equal(escapeLayer(s, { cityModal: true }), "cityModal");
    assert.equal(escapeLayer(s), "dialog");
    s = closeDialog(s);
    assert.equal(escapeLayer(s), "exitEdit");
    assert.equal(escapeLayer(openMenu(s, "add")), "menu");
    assert.equal(escapeLayer(createDesktopUiState()), null);
  });
  it("a drag in progress is cancelled before anything else", () => {
    const s = startDrag(edit(), { id: "a", grab: { x: 0, y: 0 }, size: { w: 1, h: 1 }, pointerId: 1 });
    assert.equal(escapeLayer(s, { tooltip: true }), "drag");
  });
});
