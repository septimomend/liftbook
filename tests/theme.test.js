import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCENTS, accentVars, contrast } from "../app/js/theme.js";

const SURFACE = "#1a2029";

test("blue is the default accent and unknown names fall back to it", () => {
  assert.equal(accentVars(undefined).accent, ACCENTS.blue);
  assert.equal(accentVars("nope").accent, ACCENTS.blue);
  assert.equal(accentVars("orange").accent, ACCENTS.orange);
});

test("every accent is visible on the dark cards and its button text is readable", () => {
  for (const name of Object.keys(ACCENTS)) {
    const { accent, accentText } = accentVars(name);
    assert.ok(contrast(accent, SURFACE) >= 3, `${name} vs surface`);
    assert.ok(contrast(accent, accentText) >= 3, `${name} button text ${accentText}`);
  }
  assert.equal(accentVars("blue").accentText, "#ffffff"); // current look kept
  assert.equal(accentVars("orange").accentText, "#11151c");
  {
  }
});

test("contrast", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
});
