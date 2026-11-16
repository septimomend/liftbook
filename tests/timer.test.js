import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt, startRest, adjustRest, restView } from "../app/js/timer.js";

const end = 1_000_000;

test("fmt", () => {
  assert.equal(fmt(90), "1:30");
  assert.equal(fmt(5), "0:05");
  assert.equal(fmt(0), "0:00");
});

test("startRest", () => {
  assert.equal(startRest(1000, 90), 91_000);
});

test("restView before end", () => {
  assert.deepEqual(restView(end, end - 72_000), { over: false, clock: "1:12", text: "1:12" });
  assert.deepEqual(restView(end, end - 500), { over: false, clock: "0:01", text: "0:01" });
});

test("restView after end", () => {
  assert.deepEqual(restView(end, end), { over: true, clock: "0:00", text: "Rest over · 0:00 ago" });
  assert.deepEqual(restView(end, end + 23_000), { over: true, clock: "0:23", text: "Rest over · 0:23 ago" });
  assert.deepEqual(restView(end, end + 3_725_000), { over: true, clock: "62:05", text: "Rest over · 62:05 ago" });
});

test("adjustRest", () => {
  const now = end - 5_000;
  assert.equal(adjustRest(end, now, 15), end + 15_000);
  assert.equal(adjustRest(end, now, -15), now);
  assert.equal(adjustRest(end, end - 60_000, -15), end - 15_000);
});
