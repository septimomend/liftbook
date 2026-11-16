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

async function newPage({ serviceWorkers = "block" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers });
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
  await page.locator(".card", { hasText: "70×12" }).waitFor();
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
