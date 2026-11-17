// Headless smoke tests of the real app in Chrome at iPhone size. Run: npm run e2e
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const SHOTS = process.env.SHOTS; // optional dir for screenshots

let server, browser, base;

before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: CHROME });
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function newPage({ serviceWorkers = "block", locale = "en-US" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers, locale });
  ctx.setDefaultTimeout(5000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", d => d.accept());
  // never talk to the real Google client from tests; withFakeGoogle() overrides this
  await page.route("**/js/config.js", r => r.fulfill({ contentType: "text/javascript", body: 'export const GOOGLE_CLIENT_ID = "";' }));
  return { page, errors };
}

const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

const fixture = JSON.parse(readFileSync(new URL("./fixtures/plan.json", import.meta.url)));

async function loadPlan(page, plan = fixture) {
  await page.goto(base);
  await page.waitForSelector("main.view > *");
  await page.evaluate(async plan => {
    const s = await import("./js/store.js");
    await s.replaceAll({ program: plan, settings: { restSec: 90 }, logs: [], images: [] });
  }, plan);
  await page.reload();
}

test("fresh install shows empty state", async () => {
  const { page, errors } = await newPage();
  await page.goto(base);
  await page.getByText("No plan on this phone yet.").waitFor();
  assert.equal(await page.getByRole("link", { name: "Import file" }).count(), 1);
  assert.equal(await page.getByRole("link", { name: "Sign in to Google Drive" }).count(), 1);
  await shot(page, "empty");
  assert.deepEqual(errors, []);
});

test("today shows next day and day picker works", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.getByRole("heading", { name: "Day 1" }).waitFor();
  assert.equal(await page.locator(".plan-list li").count(), 3);
  assert.match(await page.locator(".plan-list li").first().innerText(), /Bench press\s+70 kg/);
  assert.match(await page.locator(".plan-list li").last().innerText(), /Incline walk\s+20 min/);
  await shot(page, "today");
  await page.locator(".chip", { hasText: "Day 3" }).click();
  await page.getByRole("heading", { name: "Day 3" }).waitFor();
  await page.locator(".chip", { hasText: "Day 2" }).click();
  await page.getByText("Rest day").waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Day 1" }).waitFor();
  assert.deepEqual(errors, []);
});

const program = page => page.evaluate(async () => (await import("./js/store.js")).getProgram());
const setRest = (page, sec) => page.evaluate(async sec => (await import("./js/store.js")).saveSettings({ restSec: sec }), sec);

async function startDay1(page) {
  await loadPlan(page);
  await page.getByRole("button", { name: "Start Day 1" }).click();
  await page.locator(".w-name").waitFor();
}

test("workout shows exercise, logs a set, rest timer counts and adjusts", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  assert.equal(await page.locator(".w-head").innerText(), "Day 1 · Chest\n1 / 3");
  await page.locator(".w-name", { hasText: /^Bench press$/ }).waitFor();
  assert.match(await page.locator(".w-weight").innerText(), /^70 kg/);
  assert.equal(await page.locator(".w-target").innerText(), "Set 1 of 3 · 8–12 reps");
  await shot(page, "workout");
  await page.getByRole("button", { name: /Log set & rest 1:30/ }).click();
  const clock = page.locator(".rest-overlay .clock");
  await clock.waitFor();
  assert.match(await clock.innerText(), /^1:(30|29)$/);
  await shot(page, "rest");
  await page.getByRole("button", { name: "+15s" }).click();
  assert.match(await clock.innerText(), /^1:4[45]$/);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.locator(".rest-overlay").waitFor({ state: "detached" });
  await page.locator(".w-sets .set", { hasText: "70×12" }).waitFor();
  await page.locator(".w-target", { hasText: "Set 2 of 3 · 8–12 reps" }).waitFor();
  assert.deepEqual(errors, []);
});

test("rest over shows elapsed time, no auto-dismiss", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  await setRest(page, 1);
  await page.reload();
  await page.getByRole("button", { name: /Log set & rest 0:01/ }).click();
  await page.waitForFunction(() => /Rest over · 0:0\d ago/.test(document.querySelector(".rest-overlay .clock")?.textContent ?? ""));
  assert.ok(await page.locator(".rest-overlay.over").count());
  await page.reload(); // like reopening a locked phone
  await page.waitForFunction(() => /Rest over · 0:0\d ago/.test(document.querySelector(".rest-overlay .clock")?.textContent ?? ""));
  assert.deepEqual(errors, []);
});

test("alternative without weight: log disabled until weight; edit updates alternative only", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  await page.locator(".alt", { hasText: "Dumbbell press" }).click();
  await page.locator(".w-name", { hasText: /^Dumbbell press$/ }).waitFor();
  await page.waitForFunction(() => document.querySelector(".big.primary")?.disabled === true);
  await page.locator(".w-weight").click();
  await page.locator("input[name=working-weight]").fill("16,5");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".w-weight", { hasText: /^16\.5 kg/ }).waitFor();
  assert.ok(await page.getByRole("button", { name: /Log set/ }).isEnabled());
  const p = await program(page);
  assert.equal(p.days[0].exercises[0].alternatives[0].weight, 16.5);
  assert.equal(p.days[0].exercises[0].weight, 70);
  await page.getByRole("button", { name: "Back to main" }).click();
  await page.locator(".w-name", { hasText: /^Bench press$/ }).waitFor();
  assert.deepEqual(errors, []);
});

test("resume after reload, cardio done, finish returns to today with next day", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator(".w-name", { hasText: /^Cable flye$/ }).waitFor();
  await page.reload();
  await page.locator(".w-name").waitFor();
  await page.locator(".w-name", { hasText: /^Cable flye$/ }).waitFor();
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator(".w-name", { hasText: /^Incline walk$/ }).waitFor();
  await page.locator(".w-weight", { hasText: "20 min" }).waitFor();
  await page.getByRole("button", { name: "Done" }).click();
  await page.locator(".w-sets .set", { hasText: "done" }).waitFor();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("heading", { name: "Day 2" }).waitFor();
  assert.deepEqual(errors, []);
});

test("plan editor: edit weight, add exercise with picture, add/delete day", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.getByRole("link", { name: "Plan" }).click();
  await page.locator(".list a", { hasText: "Day 1" }).click();
  await page.locator(".list a", { hasText: "Bench press" }).click();
  await page.locator("input[name=weight]").fill("72,5");
  await page.locator("input[name=weight]").blur();
  await page.locator("input[name=repsMax]").fill("10");
  await page.locator("input[name=repsMax]").blur();
  await shot(page, "edit-exercise");
  await page.waitForFunction(async () => {
    const p = await (await import("./js/store.js")).getProgram();
    return p.days[0].exercises[0].weight === 72.5 && p.days[0].exercises[0].repsMax === 10;
  });
  // add an exercise to Day 3 with a picture
  await page.goto(base + "#/edit/day/d3");
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.locator("input[name=name]").fill("Leg curl");
  await page.locator("input[name=name]").blur();
  await page.locator("input[name=weight]").fill("40");
  await page.locator("input[name=weight]").blur();
  await page.locator("input[name=picture]").setInputFiles(new URL("./fixtures/pic.jpg", import.meta.url).pathname);
  await page.locator(".pic img").first().waitFor();
  await page.goto(base + "#/edit/day/d3");
  await page.locator(".list a", { hasText: "Leg curl" }).waitFor();
  // add + delete a day
  await page.goto(base + "#/edit");
  await page.getByRole("button", { name: "Add day" }).click();
  await page.locator(".list a", { hasText: "Day 4" }).waitFor();
  await page.locator(".list li", { hasText: "Day 4" }).getByRole("button", { name: "Delete" }).click();
  await page.locator(".list a", { hasText: "Day 4" }).waitFor({ state: "detached" });
  await page.getByRole("link", { name: "Today" }).click();
  await page.locator(".plan-list li", { hasText: "72.5 kg" }).waitFor();
  assert.deepEqual(errors, []);
});

test("history lists logged sets", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  await page.getByRole("button", { name: /Log set/ }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("link", { name: "History" }).click();
  await page.locator(".list a", { hasText: "Bench press" }).click();
  await page.locator(".card:not(.chart-card)", { hasText: "70×12" }).waitFor();
  await shot(page, "history");
  assert.deepEqual(errors, []);
});

test("settings: backup downloads, import replaces plan, bad file rejected", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.goto(base + "#/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup" }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^liftbook-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert.equal(backup.app, "liftbook");
  assert.equal(backup.program.days.length, 3);
  // bad file
  await page.locator("input[name=import]").setInputFiles({ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.locator(".error", { hasText: "not a Liftbook backup" }).waitFor();
  assert.equal((await program(page)).days.length, 3);
  // good file with a different plan
  const other = structuredClone(backup);
  other.program.days = other.program.days.slice(0, 1);
  other.program.days[0].name = "Imported day";
  await page.locator("input[name=import]").setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(other)) });
  await page.getByRole("heading", { name: "Imported day" }).waitFor();
  await shot(page, "settings");
  assert.deepEqual(errors, []);
});

test("settings shows Drive as not configured without a client id", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.goto(base + "#/settings");
  await page.locator("#drive-card", { hasText: "Not configured yet" }).waitFor();
  assert.deepEqual(errors, []);
});

test("installable and works offline after first load", async () => {
  const { page, errors } = await newPage({ serviceWorkers: "allow" });
  await loadPlan(page);
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.href;
    return href ? (await fetch(href)).json() : null;
  });
  assert.equal(manifest?.name, "Liftbook");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.icons.some(i => i.sizes === "512x512"));
  assert.equal(await page.evaluate(async () => (await fetch(document.querySelector('link[rel="apple-touch-icon"]').href)).status), 200);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Day 1" }).waitFor();
  await page.context().setOffline(false);
  assert.deepEqual(errors.filter(e => !/ERR_INTERNET_DISCONNECTED/.test(e)), []);
});

async function withFakeGoogle(page, { grant }) {
  await page.route("**/js/config.js", r => r.fulfill({ contentType: "text/javascript", body: 'export const GOOGLE_CLIENT_ID = "test-client";' }));
  await page.route("https://accounts.google.com/gsi/client", r => r.fulfill({
    contentType: "text/javascript",
    body: `window.google = { accounts: { oauth2: {
      initTokenClient: cfg => ({ requestAccessToken: () => setTimeout(() => ${grant
        ? 'cfg.callback({ access_token: "T", expires_in: 3600 })'
        : 'cfg.error_callback({ type: "popup_closed" })'}, 10) }),
      hasGrantedAllScopes: () => true, revoke: () => {} } } };`,
  }));
}

test("fresh install: dismissed Google sign-in shows a message and re-enables the button", async () => {
  const { page, errors } = await newPage();
  await withFakeGoogle(page, { grant: false });
  const dialogs = [];
  page.on("dialog", d => dialogs.push(d.message()));
  await page.goto(base);
  const btn = page.getByRole("button", { name: "Sign in to Google Drive" });
  await btn.click();
  await page.waitForFunction(() => !document.querySelector(".big.primary")?.disabled);
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0], /sign-in didn't complete/);
  assert.deepEqual(errors, []);
});

test("ukrainian phone gets ukrainian UI; settings can switch language", async () => {
  const { page, errors } = await newPage({ locale: "uk-UA" });
  await loadPlan(page);
  await page.getByRole("button", { name: "Почати Day 1" }).waitFor(); // user data stays as typed
  await page.getByRole("link", { name: "Сьогодні" }).waitFor();
  await page.getByRole("button", { name: "Почати Day 1" }).click();
  await page.locator(".w-target", { hasText: "Підхід 1 з 3 · 8–12 повторень" }).waitFor();
  await page.locator(".w-weight", { hasText: "70 кг" }).waitFor();
  await shot(page, "workout-uk");
  await page.goto(base + "#/settings");
  await page.locator("select[name=language]").selectOption("en");
  await page.getByRole("link", { name: "Today" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Settings" }).waitFor();
  assert.deepEqual(errors, []);
});

test("rapid taps on steppers cannot zoom the page", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  assert.match(viewport, /maximum-scale=1/);
  assert.match(viewport, /user-scalable=no/);
  const touch = await page.locator(".stepper button").first().evaluate(el => getComputedStyle(el).touchAction);
  assert.equal(touch, "manipulation");
  const body = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
  assert.equal(body, "manipulation");
  assert.deepEqual(errors, []);
});

test("settings: replace pictures from files matched by name", async () => {
  const { page, errors } = await newPage();
  const plan = structuredClone(fixture);
  plan.days[0].exercises[0].image = "idb:a1b2c3d4e5f6";
  await page.goto(base);
  await page.waitForSelector("main.view > *");
  await page.evaluate(async plan => {
    const s = await import("./js/store.js");
    await s.replaceAll({ program: plan, settings: { restSec: 90 }, logs: [],
      images: [{ id: "a1b2c3d4e5f6", type: "image/jpeg", blob: new Blob([new Uint8Array([1])], { type: "image/jpeg" }) }] });
  }, plan);
  await page.goto(base + "#/settings");
  const pic = readFileSync(new URL("./fixtures/pic.jpg", import.meta.url));
  await page.locator("input[name=pictures]").setInputFiles([
    { name: "a1b2c3d4e5f6.jpg", mimeType: "image/jpeg", buffer: pic },
    { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: pic },
  ]);
  await page.getByText("Pictures replaced: 1. Not matched: IMG_0001.jpg").waitFor();
  const rec = await page.evaluate(async () => {
    const r = await (await import("./js/store.js")).getImage("a1b2c3d4e5f6");
    return { size: r.blob.size, dirty: r.dirty, type: r.type };
  });
  assert.ok(rec.size > 100);
  assert.equal(rec.dirty, true);
  assert.equal(rec.type, "image/jpeg");
  await page.goto(base + "#/edit/day/d1");
  await page.locator(".list .pic img").first().waitFor();
  assert.deepEqual(errors, []);
});

test("workout picture frame hugs a wide picture: no bars above or below", async () => {
  const { page, errors } = await newPage();
  const plan = structuredClone(fixture);
  plan.days[0].exercises[0].image = "idb:wide";
  await page.goto(base);
  await page.waitForSelector("main.view > *");
  await page.evaluate(async plan => {
    const c = Object.assign(document.createElement("canvas"), { width: 800, height: 450 });
    c.getContext("2d").fillRect(0, 0, 800, 450);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg"));
    const s = await import("./js/store.js");
    await s.replaceAll({ program: plan, settings: { restSec: 90 }, logs: [], images: [{ id: "wide", type: "image/jpeg", blob }] });
  }, plan);
  await page.reload();
  await page.getByRole("button", { name: "Start Day 1" }).click();
  const img = page.locator(".pic-hero img");
  await img.waitFor();
  await page.waitForFunction(() => document.querySelector(".pic-hero img")?.complete);
  const box = await page.locator(".pic-hero").boundingBox();
  const pic = await img.boundingBox();
  assert.ok(Math.abs(box.height - pic.height) < 1, `frame ${box.height} vs picture ${pic.height}`);
  assert.ok(Math.abs(pic.width / pic.height - 800 / 450) < 0.02);
  await shot(page, "workout-picture");
  assert.deepEqual(errors, []);
});

test("rest over: Skip turns into a forward arrow", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  await setRest(page, 1);
  await page.reload();
  await page.getByRole("button", { name: /Log set & rest 0:01/ }).click();
  const next = page.getByRole("button", { name: "Continue" });
  await next.waitFor();
  assert.equal((await next.innerText()).trim(), "→");
  assert.equal(await page.getByRole("button", { name: "Skip" }).count(), 0);
  await next.click();
  await page.locator(".rest-overlay").waitFor({ state: "detached" });
  await page.locator(".w-target", { hasText: "Set 2 of 3" }).waitFor();
  assert.deepEqual(errors, []);
});

test("extra sets keep the set rest; Next starts the 2:30 rest on the next exercise", async () => {
  const { page, errors } = await newPage();
  await startDay1(page);
  for (const n of [1, 2, 3, 4]) { // one more than planned
    await page.getByRole("button", { name: /Log set & rest 1:30/ }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.locator(".w-sets .set").nth(n - 1).waitFor();
  }
  await page.locator(".w-name", { hasText: /^Bench press$/ }).waitFor();
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator(".w-name", { hasText: /^Cable flye$/ }).waitFor();
  const clock = page.locator(".rest-overlay .clock");
  await clock.waitFor();
  assert.match(await clock.innerText(), /^2:(30|29)$/);
  await page.locator(".rest-overlay", { hasText: "Cable flye" }).waitFor();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.locator(".rest-overlay").waitFor({ state: "detached" });
  await page.locator(".w-name", { hasText: /^Cable flye$/ }).waitFor();
  // nothing logged on Cable flye: Next moves on without a rest; Prev never rests
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator(".w-name", { hasText: /^Incline walk$/ }).waitFor();
  await page.getByRole("button", { name: "Prev" }).click();
  await page.locator(".w-name", { hasText: /^Cable flye$/ }).waitFor();
  assert.equal(await page.locator(".rest-overlay").count(), 0);
  assert.deepEqual(errors, []);
});

test("settings: rest between exercises, default 2:30", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.goto(base + "#/settings");
  const sel = page.locator("select[name=rest-exercise]");
  assert.equal(await sel.evaluate(s => s.selectedOptions[0].textContent), "2:30");
  await sel.selectOption("180");
  await page.waitForFunction(async () => (await (await import("./js/store.js")).getSettings()).restExSec === 180);
  assert.deepEqual(errors, []);
});

test("history: progress graph of the heaviest weight per workout", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.evaluate(async () => {
    const s = await import("./js/store.js");
    const day = 86_400_000;
    const t0 = Date.UTC(2026, 9, 1);
    const sets = [[70, 10], [72.5, 8], [75, 6]];
    for (const [i, [w, r]] of sets.entries()) {
      for (const set of [1, 2]) {
        await s.addLog({ id: `l${i}${set}`, sessionId: `s${i}`, ts: t0 + i * 3 * day + set, dayId: "d1", exerciseId: "e1",
          altId: null, name: "Bench press", set, weight: set === 2 ? w : w - 10, reps: r });
      }
    }
  });
  await page.goto(base + "#/history/e1");
  const pts = page.locator("svg.chart .pt");
  await pts.first().waitFor();
  assert.equal(await pts.count(), 3);
  await pts.last().click();
  await page.locator(".chart-tip", { hasText: "75 kg" }).waitFor();
  assert.match(await page.locator(".chart-tip").innerText(), /65×6 · 75×6/);
  await shot(page, "history-chart");
  assert.deepEqual(errors, []);
});

/** Drive REST stand-in: empty Liftbook folder. failures = how many requests fail first (Infinity = all). */
async function withFakeDrive(page, { failures = 0 } = {}) {
  let left = failures;
  await page.route("https://www.googleapis.com/**", r => {
    if (left > 0) { left--; return r.abort("failed"); }
    const url = r.request().url();
    if (r.request().method() !== "GET") return r.fulfill({ json: { id: "D" } });
    if (url.includes("mimeType")) return r.fulfill({ json: { files: [{ id: "F" }] } });
    return r.fulfill({ json: { files: [] } });
  });
}

async function signedInWithExpiredToken(page) {
  await loadPlan(page);
  await page.evaluate(async () => {
    const s = await import("./js/store.js");
    await s.saveSyncMeta({ ...(await s.getSyncMeta()), signedIn: true });
  });
  await page.reload();
}

test("sync bar: disappears after a sync that needed a retry", async () => {
  const { page, errors } = await newPage();
  await withFakeGoogle(page, { grant: true });
  await withFakeDrive(page, { failures: 1 });
  await signedInWithExpiredToken(page);
  const bar = page.locator(".sync-banner");
  await bar.waitFor();
  await bar.click();
  await bar.waitFor({ state: "detached" });
  assert.deepEqual(errors.filter(e => !/ERR_FAILED/.test(e)), []);
});

test("sync bar: a failing sync says so and can be tapped again", async () => {
  const { page, errors } = await newPage();
  await withFakeGoogle(page, { grant: true });
  await withFakeDrive(page, { failures: Infinity });
  await signedInWithExpiredToken(page);
  const bar = page.locator(".sync-banner");
  await bar.click();
  await page.locator(".sync-banner", { hasText: "Sync failed" }).waitFor();
  assert.equal(await bar.isEnabled(), true);
  assert.deepEqual(errors.filter(e => !/ERR_FAILED/.test(e)), []);
});

test("settings: accent color changes buttons and survives a restart", async () => {
  const { page, errors } = await newPage();
  await loadPlan(page);
  await page.goto(base + "#/settings");
  await page.getByRole("radio", { name: "Orange" }).check();
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector(".tabs a.on")).color);
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() === "#ff8a3d");
  await page.waitForFunction(async () => (await (await import("./js/store.js")).getSettings()).accent === "orange");
  await page.reload();
  await page.getByRole("radio", { name: "Orange" }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "Orange" }).isChecked(), true);
  assert.equal(await bg(), "rgb(255, 138, 61)");
  await shot(page, "settings-accent");
  assert.deepEqual(errors, []);
});
