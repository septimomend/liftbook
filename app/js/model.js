// Pure plan model: defaults, parsing, immutable plan edits, day sequencing.

export const DEFAULTS = Object.freeze({ sets: 3, repsMin: 8, repsMax: 12, restSec: 90, restExSec: 150 });

export function newId() {
  return crypto.randomUUID();
}

/** "22,5" -> 22.5; empty, non-numeric or negative -> null. */
export function parseWeight(input) {
  const s = String(input ?? "").trim().replace(",", ".");
  if (s === "" || !/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Day after lastDayId in program order (wrapping); first day when unknown. */
export function nextDay(program, lastDayId) {
  const days = program.days;
  const i = days.findIndex(d => d.id === lastDayId);
  return i < 0 ? days[0] : days[(i + 1) % days.length];
}

/** What is actually performed: the alternative's fields when swapped, else the exercise's. */
export function performed(exercise, altId) {
  const alt = altId ? exercise.alternatives.find(a => a.id === altId) : null;
  const src = alt ?? exercise;
  return { name: src.name, weight: src.weight ?? null, image: src.image ?? null };
}

function findExercise(program, exerciseId) {
  for (const day of program.days) {
    const i = day.exercises.findIndex(e => e.id === exerciseId);
    if (i >= 0) return { day, i, ex: day.exercises[i] };
  }
  return null;
}

function withExercise(program, exerciseId, fn) {
  const p = structuredClone(program);
  const hit = findExercise(p, exerciseId);
  if (hit) fn(hit);
  return p;
}

function move(arr, i, delta) {
  const j = i + delta;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function setWorkingWeight(program, exerciseId, altId, weight) {
  return withExercise(program, exerciseId, ({ ex }) => {
    const target = altId ? ex.alternatives.find(a => a.id === altId) : ex;
    if (target) target.weight = weight;
  });
}

export function updateExercise(program, exerciseId, patch) {
  return withExercise(program, exerciseId, ({ ex }) => Object.assign(ex, patch));
}

export function addExercise(program, dayId, exercise) {
  const p = structuredClone(program);
  p.days.find(d => d.id === dayId)?.exercises.push(structuredClone(exercise));
  return p;
}

export function removeExercise(program, exerciseId) {
  return withExercise(program, exerciseId, ({ day, i }) => day.exercises.splice(i, 1));
}

export function moveExercise(program, exerciseId, delta) {
  return withExercise(program, exerciseId, ({ day, i }) => move(day.exercises, i, delta));
}

export function addDay(program, day) {
  const p = structuredClone(program);
  p.days.push(structuredClone(day));
  return p;
}

export function updateDay(program, dayId, patch) {
  const p = structuredClone(program);
  const d = p.days.find(x => x.id === dayId);
  if (d) Object.assign(d, patch);
  return p;
}

export function removeDay(program, dayId) {
  const p = structuredClone(program);
  p.days = p.days.filter(d => d.id !== dayId);
  return p;
}

export function moveDay(program, dayId, delta) {
  const p = structuredClone(program);
  move(p.days, p.days.findIndex(d => d.id === dayId), delta);
  return p;
}

/** Sets of the most recent session (other than excludeSessionId) for an exercise, by set #. */
export function lastSessionSets(logs, exerciseId, excludeSessionId) {
  const mine = logs.filter(l => l.exerciseId === exerciseId && l.sessionId !== excludeSessionId);
  if (!mine.length) return [];
  const latest = mine.reduce((a, b) => (b.ts > a.ts ? b : a)).sessionId;
  return mine.filter(l => l.sessionId === latest).sort((a, b) => a.set - b.set);
}

/**
 * Which stored picture a file replaces, by its name: "<id>.jpg", any case or image
 * extension, also Drive's "<id> (1).jpg" copies. null when the name matches none.
 */
export function pictureIdFromFileName(name, ids) {
  const stem = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/\s*\(\d+\)$/, "").trim();
  return ids.has(stem) ? stem : null;
}

/**
 * Rest after logging set number `set` of an exercise with `sets` target sets: the set
 * rest, or once the target is reached the (longer) rest before the next exercise.
 * The last exercise of the day has no next one, so it keeps the set rest.
 */
export function restAfterSet({ set, sets, isLastExercise }, settings) {
  if (set >= sets && !isLastExercise) return { sec: settings.restExSec ?? DEFAULTS.restExSec, between: true };
  return { sec: settings.restSec ?? DEFAULTS.restSec, between: false };
}

/** One point per workout: its heaviest set weight, oldest workout first. Cardio-only workouts are skipped. */
export function progressPoints(logs) {
  const bySession = new Map();
  for (const l of logs) {
    if (l.weight == null) continue;
    if (!bySession.has(l.sessionId)) bySession.set(l.sessionId, []);
    bySession.get(l.sessionId).push(l);
  }
  return [...bySession].map(([sessionId, sets]) => {
    sets.sort((a, b) => a.set - b.set);
    return { sessionId, ts: Math.min(...sets.map(x => x.ts)), weight: Math.max(...sets.map(x => x.weight)), sets };
  }).sort((a, b) => a.ts - b.ts);
}

/** Round axis ticks (steps of 1, 2, 2.5 or 5 × 10^n) covering [min, max]; a flat range gets one step each side. */
export function niceTicks(min, max, target = 5) {
  if (min === max) {
    const step = niceStep(Math.max(Math.abs(min), 1) / 20);
    return [min - step, min, min + step];
  }
  const step = niceStep((max - min) / target);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}
