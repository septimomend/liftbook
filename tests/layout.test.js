import { test } from "node:test";
import assert from "node:assert/strict";
import { tabBarPad } from "../app/js/layout.js";

test("tab bar keeps clear of the home indicator when the page reaches the screen bottom", () => {
  assert.equal(tabBarPad({ screenH: 932, viewH: 932, insetBottom: 34, standalone: true }), 40);
  assert.equal(tabBarPad({ screenH: 932, viewH: 932, insetBottom: 0, standalone: true }), 6);
});

test("page that stops above the home indicator: no second safe-area gap under the tab bar", () => {
  assert.equal(tabBarPad({ screenH: 932, viewH: 898, insetBottom: 34, standalone: true }), 6);
  assert.equal(tabBarPad({ screenH: 932, viewH: 912, insetBottom: 34, standalone: true }), 20);
});

test("in a browser tab the toolbar height says nothing about the home indicator", () => {
  assert.equal(tabBarPad({ screenH: 932, viewH: 750, insetBottom: 0, standalone: false }), 6);
  assert.equal(tabBarPad({ screenH: 932, viewH: 750, insetBottom: 34, standalone: false }), 40);
});
