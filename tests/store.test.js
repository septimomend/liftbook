import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as store from "../app/js/store.js";

beforeEach(() => {
  store.closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const seed = { version: 1, days: [{ id: "d1", name: "Day 1", rest: false, exercises: [] }] };
const log = (id, exerciseId, ts) => ({ id, sessionId: "s", ts, dayId: "d1", exerciseId, altId: null, name: "x", set: 1, weight: 10, reps: 10 });

test("bootstrap seeds empty store", async () => {
  let calls = 0;
  const p = await store.bootstrap(async () => { calls++; return seed; });
  assert.equal(calls, 1);
  assert.deepEqual(p, seed);
  assert.deepEqual(await store.getProgram(), seed);
});

test("bootstrap does not overwrite existing program", async () => {
  const edited = structuredClone(seed);
  edited.days[0].name = "Edited";
  await store.saveProgram(edited);
  let calls = 0;
  const p = await store.bootstrap(async () => { calls++; return seed; });
  assert.equal(calls, 0);
  assert.equal(p.days[0].name, "Edited");
});

test("logsForExercise and lastLog", async () => {
  await store.addLog(log("1", "a", 100));
  await store.addLog(log("2", "b", 300));
  await store.addLog(log("3", "a", 200));
  assert.deepEqual((await store.logsForExercise("a")).map(l => l.id).sort(), ["1", "3"]);
  assert.equal((await store.lastLog()).id, "2");
  await store.deleteLog("2");
  assert.equal((await store.lastLog()).id, "3");
  assert.equal((await store.allLogs()).length, 2);
});

test("lastLog on empty store is null", async () => {
  assert.equal(await store.lastLog(), null);
});

test("getSettings default", async () => {
  assert.deepEqual(await store.getSettings(), { restSec: 90 });
  await store.saveSettings({ restSec: 120 });
  assert.equal((await store.getSettings()).restSec, 120);
});

test("session save/clear", async () => {
  assert.equal(await store.getSession(), null);
  await store.saveSession({ id: "s", dayId: "d1", startedAt: 1, index: 0, swaps: {}, restEndsAt: null });
  assert.equal((await store.getSession()).id, "s");
  await store.saveSession(null);
  assert.equal(await store.getSession(), null);
});

test("images put/get", async () => {
  await store.putImage({ id: "i1", type: "image/jpeg", blob: new Blob([new Uint8Array([1, 2, 3])]) });
  const img = await store.getImage("i1");
  assert.equal(img.type, "image/jpeg");
  assert.equal(await store.getImage("nope"), null);
  assert.equal((await store.allImages()).length, 1);
});

test("replaceAll replaces everything", async () => {
  await store.saveProgram(seed);
  await store.addLog(log("old", "a", 1));
  const p2 = { version: 1, days: [] };
  await store.saveSyncMeta({ folderId: "f", fileId: "x", signedIn: true, lastSyncedAt: 1, uploadedImageIds: [] });
  await store.replaceAll({ program: p2, settings: { restSec: 60 }, logs: [log("new", "a", 2)], images: [] });
  assert.deepEqual((await store.getProgram()).days, []);
  assert.deepEqual((await store.allLogs()).map(l => l.id), ["new"]);
  assert.equal((await store.getSettings()).restSec, 60);
  assert.equal((await store.getSyncMeta()).fileId, "x");
});

test("replaceAll is atomic", async () => {
  await store.saveProgram(seed);
  const saved = await store.getProgram();
  await store.addLog(log("old", "a", 1));
  const bad = { ...log("x", "a", 2) };
  delete bad.id;
  await assert.rejects(store.replaceAll({ program: { version: 1, days: [] }, settings: { restSec: 60 }, logs: [bad], images: [] }));
  assert.deepEqual(await store.getProgram(), saved);
  assert.deepEqual((await store.allLogs()).map(l => l.id), ["old"]);
});

test("saveProgram stamps updatedAt", async () => {
  const before = Date.now();
  await store.saveProgram(structuredClone(seed));
  assert.ok((await store.getProgram()).updatedAt >= before);
  await store.saveProgram({ ...seed, updatedAt: 5 }, { stamp: false });
  assert.equal((await store.getProgram()).updatedAt, 5);
  await store.saveSettings({ restSec: 60 });
  assert.ok((await store.getSettings()).updatedAt >= before);
});

test("deleteLog records tombstone", async () => {
  await store.addLog(log("1", "a", 1));
  await store.deleteLog("1");
  assert.deepEqual(await store.getDeletedLogIds(), ["1"]);
});

test("sync meta default and save", async () => {
  assert.deepEqual(await store.getSyncMeta(), { folderId: null, fileId: null, signedIn: false, lastSyncedAt: null, uploadedImageIds: [] });
  await store.saveSyncMeta({ folderId: "f", fileId: "x", signedIn: true, lastSyncedAt: 1, uploadedImageIds: ["i"] });
  assert.equal((await store.getSyncMeta()).fileId, "x");
});

test("exportState/applyState keeps session, images, sync meta", async () => {
  await store.saveSession({ id: "s", dayId: "d1", startedAt: 1, index: 0, swaps: {}, restEndsAt: null });
  await store.putImage({ id: "i1", type: "image/jpeg", blob: new Blob([new Uint8Array([1])]) });
  await store.saveSyncMeta({ folderId: "f", fileId: "x", signedIn: true, lastSyncedAt: 1, uploadedImageIds: [] });
  const state = { program: { ...seed, updatedAt: 9 }, settings: { restSec: 75, updatedAt: 9 }, logs: [log("n", "a", 3)], deletedLogIds: ["z"] };
  await store.applyState(state);
  assert.deepEqual(await store.exportState(), state);
  assert.equal((await store.getSession()).id, "s");
  assert.ok(await store.getImage("i1"));
  assert.equal((await store.getSyncMeta()).fileId, "x");
});

test("replaceAll stamps program so import wins next merge", async () => {
  const before = Date.now();
  await store.replaceAll({ program: { ...seed, updatedAt: 1 }, settings: { restSec: 90 }, logs: [], images: [] });
  assert.ok((await store.getProgram()).updatedAt >= before);
});
