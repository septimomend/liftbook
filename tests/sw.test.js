import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");

function loadSw({ fetchImpl, cached, added = [] }) {
  const handlers = {};
  const ctx = {
    self: { location: { origin: "https://app.test" }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim() {} } },
    caches: {
      match: async () => cached,
      open: async () => ({ put: async () => {}, addAll: async reqs => { added.push(...reqs); } }),
      keys: async () => [],
    },
    fetch: fetchImpl,
    URL, Promise, setTimeout, clearTimeout, Request: class { constructor(url, init) { this.url = url; this.cache = init?.cache; } },
  };
  vm.runInNewContext(src, ctx);
  return handlers;
}

function fire(handlers, url) {
  let responded = null;
  handlers.fetch({ request: { method: "GET", url }, respondWith: p => { responded = p; } });
  return responded;
}

test("hanging network falls back to cache within the timeout", async () => {
  const h = loadSw({ fetchImpl: () => new Promise(() => {}), cached: "CACHED" });
  const t0 = Date.now();
  assert.equal(await fire(h, "https://app.test/js/main.js"), "CACHED");
  assert.ok(Date.now() - t0 < 4000);
});

test("fast network wins", async () => {
  const res = { ok: true, clone: () => res, tag: "NET" };
  const h = loadSw({ fetchImpl: async () => res, cached: "CACHED" });
  assert.equal((await fire(h, "https://app.test/js/main.js")).tag, "NET");
});

test("hanging network with nothing cached keeps waiting for the network", async () => {
  let resolveNet;
  const res = { ok: true, clone: () => res, tag: "NET" };
  const h = loadSw({ fetchImpl: () => new Promise(r => { resolveNet = r; }), cached: undefined });
  const p = fire(h, "https://app.test/js/new.js");
  setTimeout(() => resolveNet(res), 3500);
  assert.equal((await p).tag, "NET");
});

test("Google requests are not intercepted", () => {
  const h = loadSw({ fetchImpl: async () => ({}), cached: "CACHED" });
  assert.equal(fire(h, "https://www.googleapis.com/drive/v3/files"), null);
});

test("network fetches revalidate instead of trusting the browser's HTTP cache", async () => {
  const seen = [];
  const res = { ok: true, clone: () => res };
  const h = loadSw({ fetchImpl: async (r, init) => { seen.push(init?.cache); return res; }, cached: undefined });
  await fire(h, "https://app.test/js/sync.js");
  assert.deepEqual(seen, ["no-cache"]);
});

test("install caches a fresh copy of the app shell, including i18n", async () => {
  const added = [];
  const h = loadSw({ fetchImpl: async () => ({}), cached: undefined, added });
  let p;
  h.install({ waitUntil: x => { p = x; } });
  await p;
  assert.ok(added.length > 0 && added.every(r => r.cache === "reload"));
  assert.ok(added.some(r => r.url === "./js/i18n.js"));
  assert.ok(added.some(r => r.url === "./js/version.js"));
});

test("service worker version matches the version the app shows", async () => {
  const { VERSION } = await import("../app/js/version.js");
  assert.match(src, new RegExp(`const VERSION = "${VERSION}";`));
});
