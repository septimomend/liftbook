import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, newId, parseWeight, nextDay, performed, setWorkingWeight,
  updateExercise, addExercise, removeExercise, moveExercise,
  addDay, removeDay, moveDay, updateDay, lastSessionSets,
} from "../app/js/model.js";

const ex = (id, extra = {}) => ({
  id, group: "G", name: id, type: "strength", weight: 60, duration: null,
  sets: 3, repsMin: 8, repsMax: 12, image: null, alternatives: [], ...extra,
});
const prog = () => ({
  version: 1,
  days: [
    { id: "d1", name: "Day 1", rest: false, exercises: [ex("a"), ex("b", { alternatives: [{ id: "alt", name: "Alt", weight: null, image: null }] })] },
    { id: "d2", name: "Day 2", rest: true, exercises: [] },
    { id: "d3", name: "Day 3", rest: false, exercises: [ex("c")] },
  ],
});

test("DEFAULTS", () => {
  assert.deepEqual(DEFAULTS, { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 });
});

test("newId is unique string", () => {
  assert.equal(typeof newId(), "string");
  assert.notEqual(newId(), newId());
});

test("parseWeight", () => {
  assert.equal(parseWeight("22,5"), 22.5);
  assert.equal(parseWeight(" 30 "), 30);
  assert.equal(parseWeight(""), null);
  assert.equal(parseWeight("abc"), null);
  assert.equal(parseWeight("-5"), null);
});

test("nextDay", () => {
  const p = prog();
  assert.equal(nextDay(p, null).id, "d1");
  assert.equal(nextDay(p, "d1").id, "d2");
  assert.equal(nextDay(p, "d3").id, "d1");
  assert.equal(nextDay(p, "gone").id, "d1");
});

test("setWorkingWeight on alternative", () => {
  const p = prog();
  const q = setWorkingWeight(p, "b", "alt", 16);
  const b = q.days[0].exercises[1];
  assert.equal(b.alternatives[0].weight, 16);
  assert.equal(b.weight, 60);
  assert.equal(p.days[0].exercises[1].alternatives[0].weight, null);
});

test("setWorkingWeight on main exercise", () => {
  const q = setWorkingWeight(prog(), "a", null, 72.5);
  assert.equal(q.days[0].exercises[0].weight, 72.5);
});

test("performed", () => {
  const b = prog().days[0].exercises[1];
  assert.deepEqual(performed(b, "alt"), { name: "Alt", weight: null, image: null });
  assert.deepEqual(performed(b, null), { name: "b", weight: 60, image: null });
});

test("moveExercise bounds and swap", () => {
  const p = prog();
  assert.deepEqual(moveExercise(p, "a", -1).days[0].exercises.map(e => e.id), ["a", "b"]);
  assert.deepEqual(moveExercise(p, "a", 1).days[0].exercises.map(e => e.id), ["b", "a"]);
});

test("exercise add/update/remove", () => {
  let p = addExercise(prog(), "d3", ex("z"));
  assert.deepEqual(p.days[2].exercises.map(e => e.id), ["c", "z"]);
  p = updateExercise(p, "z", { name: "Zed" });
  assert.equal(p.days[2].exercises[1].name, "Zed");
  p = removeExercise(p, "c");
  assert.deepEqual(p.days[2].exercises.map(e => e.id), ["z"]);
});

test("day add/update/move/remove", () => {
  let p = addDay(prog(), { id: "d4", name: "Day 4", rest: false, exercises: [] });
  assert.equal(p.days.length, 4);
  p = updateDay(p, "d4", { name: "Legs" });
  assert.equal(p.days[3].name, "Legs");
  p = moveDay(p, "d4", -1);
  assert.deepEqual(p.days.map(d => d.id), ["d1", "d2", "d4", "d3"]);
  p = removeDay(p, "d2");
  assert.deepEqual(p.days.map(d => d.id), ["d1", "d4", "d3"]);
});

test("lastSessionSets", () => {
  const logs = [
    { id: "1", sessionId: "s1", ts: 100, exerciseId: "a", set: 2, weight: 30, reps: 10 },
    { id: "2", sessionId: "s1", ts: 90, exerciseId: "a", set: 1, weight: 30, reps: 12 },
    { id: "3", sessionId: "s0", ts: 10, exerciseId: "a", set: 1, weight: 25, reps: 12 },
    { id: "4", sessionId: "s2", ts: 200, exerciseId: "a", set: 1, weight: 32, reps: 8 },
    { id: "5", sessionId: "s1", ts: 95, exerciseId: "b", set: 1, weight: 1, reps: 1 },
  ];
  assert.deepEqual(lastSessionSets(logs, "a", "s2").map(l => l.id), ["2", "1"]);
  assert.deepEqual(lastSessionSets([], "a", "s2"), []);
});
