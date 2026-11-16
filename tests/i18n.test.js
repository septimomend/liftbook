import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { t, tn, setLang, getLang, resolveLang, UK } from "../app/js/i18n.js";

afterEach(() => setLang("en"));

test("english is the source text, with variables", () => {
  setLang("en");
  assert.equal(t("Start {day}", { day: "Day 1" }), "Start Day 1");
});

test("ukrainian translation with variables", () => {
  setLang("uk");
  assert.equal(getLang(), "uk");
  assert.equal(t("Start {day}", { day: "День 1" }), "Почати День 1");
  assert.equal(t("Rest over · {time} ago", { time: "0:23" }), "Відпочинок завершено · 0:23 тому");
});

test("unknown text falls back to english", () => {
  setLang("uk");
  assert.equal(t("No such text {x}", { x: 1 }), "No such text 1");
});

test("ukrainian plurals", () => {
  setLang("uk");
  assert.equal(tn(1, "exercises"), "1 вправа");
  assert.equal(tn(3, "exercises"), "3 вправи");
  assert.equal(tn(5, "exercises"), "5 вправ");
  assert.equal(tn(21, "exercises"), "21 вправа");
  setLang("en");
  assert.equal(tn(1, "exercises"), "1 exercise");
  assert.equal(tn(10, "exercises"), "10 exercises");
});

test("resolveLang: auto follows the device, explicit choice wins", () => {
  assert.equal(resolveLang("auto", ["uk-UA", "en-US"]), "uk");
  assert.equal(resolveLang("auto", ["ru-RU", "uk"]), "uk");
  assert.equal(resolveLang("auto", ["en-GB"]), "en");
  assert.equal(resolveLang("auto", []), "en");
  assert.equal(resolveLang("en", ["uk-UA"]), "en");
  assert.equal(resolveLang("uk", ["en-US"]), "uk");
  assert.equal(resolveLang(undefined, ["en-US"]), "en");
});

test("every t() text in the app has a ukrainian translation", () => {
  const dir = new URL("../app/js/", import.meta.url);
  const files = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const u = new URL(e.name + (e.isDirectory() ? "/" : ""), d);
      if (e.isDirectory()) walk(u);
      else if (e.name.endsWith(".js") && e.name !== "i18n.js") files.push(u);
    }
  };
  walk(dir);
  const missing = [];
  let count = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      count++;
      const key = JSON.parse(`"${m[1]}"`);
      if (!(key in UK)) missing.push(`${f.pathname.split("/app/js/")[1]}: ${key}`);
    }
  }
  assert.ok(count > 60, `expected the UI to be translated, found only ${count} t() calls`);
  assert.deepEqual(missing, []);
});
