import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, parseBackup, backupFileName } from "../app/js/backup.js";

const data = () => ({
  program: { version: 1, days: [{ id: "d1", name: "Day 1", rest: false, exercises: [] }] },
  settings: { restSec: 75 },
  logs: [{ id: "l1", sessionId: "s", ts: 5, dayId: "d1", exerciseId: "e", altId: null, name: "E", set: 1, weight: 22.5, reps: 10 }],
  images: [{ id: "i1", type: "image/jpeg", blob: new Blob([new Uint8Array([0, 1, 254, 255])], { type: "image/jpeg" }) }],
});

test("buildBackup header", async () => {
  const b = await buildBackup(data(), new Date("2026-11-16T10:00:00Z"));
  assert.equal(b.app, "liftbook");
  assert.equal(b.format, 1);
  assert.equal(b.exportedAt, "2026-11-16T10:00:00.000Z");
  assert.deepEqual(b.images, [{ id: "i1", type: "image/jpeg", data: "AAH+/w==" }]);
});

test("round-trip is lossless", async () => {
  const src = data();
  const back = parseBackup(JSON.stringify(await buildBackup(src, new Date())));
  assert.deepEqual(back.program, src.program);
  assert.deepEqual(back.settings, src.settings);
  assert.deepEqual(back.logs, src.logs);
  assert.equal(back.images.length, 1);
  assert.equal(back.images[0].id, "i1");
  assert.equal(back.images[0].type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await back.images[0].blob.arrayBuffer()), new Uint8Array([0, 1, 254, 255]));
});

test("parseBackup rejects bad input", () => {
  for (const bad of [
    "not json",
    '{"app":"other","format":1}',
    '{"app":"liftbook","format":2}',
    '{"app":"liftbook","format":1,"logs":[]}',
    '{"app":"liftbook","format":1,"program":{"days":[]}}',
    "null",
  ]) {
    assert.throws(() => parseBackup(bad), e => e instanceof Error && e.message.length > 0, bad);
  }
});

test("backupFileName", () => {
  assert.equal(backupFileName(new Date("2026-11-16T10:00:00Z")), "liftbook-backup-2026-11-16.json");
});
