import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as store from "../app/js/store.js";
import { mergeState, syncOnce, syncNow, DATA_FILE, FOLDER } from "../app/js/sync.js";

beforeEach(() => {
  store.closeDb();
  globalThis.indexedDB = new IDBFactory();
});

/** In-memory stand-in for the Drive interface in app/js/drive.js. */
class FakeDrive {
  constructor() { this.files = new Map(); this.n = 0; this.creates = 0; this.updates = 0; }
  async findOrCreateFolder(name) {
    for (const [id, f] of this.files) if (f.folder && f.name === name) return id;
    const id = `f${++this.n}`;
    this.files.set(id, { folder: true, name });
    return id;
  }
  async findFile(folderId, name) {
    for (const [id, f] of this.files) if (f.parent === folderId && f.name === name) return { id };
    return null;
  }
  async readText(id) { return this.files.get(id).body; }
  async readBlob(id) { return this.files.get(id).body; }
  async createFile(parent, name, mime, body, appProperties = {}) {
    this.creates++;
    const id = `x${++this.n}`;
    this.files.set(id, { parent, name, mime, body, appProperties });
    return id;
  }
  async updateFile(id, body) { this.updates++; this.files.get(id).body = body; }
  async listImages(folderId) {
    return [...this.files].filter(([, f]) => f.parent === folderId && f.appProperties?.liftbookImage)
      .map(([fileId, f]) => ({ fileId, imageId: f.appProperties.liftbookImage }));
  }
  dataJson() {
    const f = [...this.files.values()].find(x => x.name === DATA_FILE);
    return f && JSON.parse(f.body);
  }
}

const log = (id, ts = 1) => ({ id, sessionId: "s", ts, dayId: "d1", exerciseId: "e", altId: null, name: "E", set: 1, weight: 10, reps: 10 });
const plan = (updatedAt, name = "Day 1", image = null) => ({
  version: 1, updatedAt,
  days: [{ id: "d1", name, rest: false, exercises: [{ id: "e", group: "G", name: "E", type: "strength", weight: 10,
    duration: null, sets: 3, repsMin: 8, repsMax: 12, image, alternatives: [] }] }],
});
const state = (o = {}) => ({ program: plan(1), settings: { restSec: 90, updatedAt: 1 }, logs: [], deletedLogIds: [], ...o });
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: "image/jpeg" });

test("mergeState keeps logs from both sides", () => {
  const m = mergeState(state({ logs: [log("a", 1), log("b", 2)] }), state({ logs: [log("b", 2), log("c", 3)] }));
  assert.deepEqual(m.logs.map(l => l.id), ["a", "b", "c"]);
});

test("mergeState applies tombstones from either side", () => {
  const m = mergeState(state({ logs: [log("a"), log("b")], deletedLogIds: ["c"] }), state({ logs: [log("c")], deletedLogIds: ["a"] }));
  assert.deepEqual(m.logs.map(l => l.id), ["b"]);
  assert.deepEqual(m.deletedLogIds, ["a", "c"]);
});

test("mergeState newer program wins, tie goes to remote", () => {
  assert.equal(mergeState(state({ program: plan(5, "L") }), state({ program: plan(3, "R") })).program.days[0].name, "L");
  assert.equal(mergeState(state({ program: plan(3, "L") }), state({ program: plan(5, "R") })).program.days[0].name, "R");
  assert.equal(mergeState(state({ program: plan(3, "L") }), state({ program: plan(3, "R") })).program.days[0].name, "R");
});

test("first sync creates folder and data file, uploads images once", async () => {
  await store.saveProgram(plan(10, "Day 1", "idb:img1"), { stamp: false });
  await store.addLog(log("a"));
  await store.putImage({ id: "img1", type: "image/jpeg", blob: jpeg() });
  const drive = new FakeDrive();
  const r1 = await syncOnce({ drive, store, now: 1000 });
  assert.deepEqual(r1, { pulled: false, pushed: true });
  const folders = [...drive.files.values()].filter(f => f.folder);
  assert.deepEqual(folders.map(f => f.name), [FOLDER]);
  assert.equal(drive.dataJson().program.days[0].name, "Day 1");
  assert.deepEqual(drive.dataJson().logs.map(l => l.id), ["a"]);
  assert.deepEqual((await drive.listImages(await drive.findOrCreateFolder(FOLDER))).map(i => i.imageId), ["img1"]);
  const meta = await store.getSyncMeta();
  assert.equal(meta.signedIn, true);
  assert.equal(meta.lastSyncedAt, 1000);
  const creates = drive.creates;
  const r2 = await syncOnce({ drive, store, now: 2000 });
  assert.deepEqual(r2, { pulled: false, pushed: false });
  assert.equal(drive.creates, creates);
  assert.equal(drive.updates, 0);
});

test("fresh device pulls, does not clobber", async () => {
  const drive = new FakeDrive();
  const folder = await drive.findOrCreateFolder(FOLDER);
  const remote = { app: "liftbook", kind: "data", format: 1, ...state({ program: plan(100, "Remote day", "idb:img9"), logs: [log("r")] }) };
  await drive.createFile(folder, DATA_FILE, "application/json", JSON.stringify(remote));
  await drive.createFile(folder, "img9.jpg", "image/jpeg", jpeg(), { liftbookImage: "img9" });
  drive.creates = 0;
  await store.bootstrap(async () => ({ version: 1, days: [], updatedAt: 0 }));
  const r = await syncOnce({ drive, store, now: 5 });
  assert.equal(r.pulled, true);
  assert.equal(r.pushed, false);
  assert.equal((await store.getProgram()).days[0].name, "Remote day");
  assert.deepEqual((await store.allLogs()).map(l => l.id), ["r"]);
  assert.ok(await store.getImage("img9"));
  assert.equal(drive.updates, 0);
  assert.equal(drive.creates, 0);
});

test("local edit after pull is pushed", async () => {
  const drive = new FakeDrive();
  await store.saveProgram(plan(10), { stamp: false });
  await syncOnce({ drive, store, now: 1 });
  await store.addLog(log("new", 9));
  const r = await syncOnce({ drive, store, now: 2 });
  assert.equal(r.pushed, true);
  assert.deepEqual(drive.dataJson().logs.map(l => l.id), ["new"]);
});

test("syncNow: not configured, auth failure leaves local state", async () => {
  await store.saveProgram(plan(10), { stamp: false });
  const before = await store.exportState();
  assert.deepEqual(await syncNow({ clientId: "" }), { ok: false, reason: "not-configured" });
  const r = await syncNow({
    clientId: "x",
    getToken: async () => { throw new Error("needs-sign-in"); },
    makeDriveFn: () => { throw new Error("must not be called"); },
  });
  assert.deepEqual(r, { ok: false, reason: "needs-sign-in" });
  assert.deepEqual(await store.exportState(), before);
});

test("syncNow ok path", async () => {
  await store.saveProgram(plan(10), { stamp: false });
  const drive = new FakeDrive();
  const r = await syncNow({ clientId: "x", getToken: async () => "tok", makeDriveFn: () => drive });
  assert.equal(r.ok, true);
  assert.ok(drive.dataJson());
});

test("writes made while a sync is in flight survive (log, tombstone, plan edit, restore)", async () => {
  await store.saveProgram(plan(10, "Local"), { stamp: false });
  await store.addLog(log("old", 1));
  await store.addLog(log("gone", 2));
  const drive = new FakeDrive();
  await syncOnce({ drive, store, now: 1 });
  // another device pushed a newer plan + a log
  const f = [...drive.files.values()].find(x => x.name === DATA_FILE);
  const d = JSON.parse(f.body);
  d.program = plan(50, "Remote");
  d.logs.push(log("remote", 3));
  f.body = JSON.stringify(d);
  // the owner keeps using the app while the download is in flight
  const realRead = drive.readText.bind(drive);
  drive.readText = async id => {
    const text = await realRead(id);
    await store.addLog(log("during", 4));
    await store.deleteLog("gone");
    await store.saveProgram(plan(0, "Edited during sync")); // stamped now → newest
    return text;
  };
  await syncOnce({ drive, store, now: 2 });
  const ids = (await store.allLogs()).map(l => l.id).sort();
  assert.deepEqual(ids, ["during", "old", "remote"]);
  assert.deepEqual(await store.getDeletedLogIds(), ["gone"]);
  assert.equal((await store.getProgram()).days[0].name, "Edited during sync");
  assert.deepEqual(drive.dataJson().logs.map(l => l.id).sort(), ["during", "old", "remote"]);
  assert.equal(drive.dataJson().program.days[0].name, "Edited during sync");
});
