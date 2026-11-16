// Rest timer math. Timestamp-based, so a locked/backgrounded phone doesn't skew it.

export function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function startRest(now, restSec) {
  return now + restSec * 1000;
}

/** Shift the end time; never earlier than now. */
export function adjustRest(endsAt, now, deltaSec) {
  return Math.max(now, endsAt + deltaSec * 1000);
}

export function restView(endsAt, now) {
  const left = endsAt - now;
  if (left > 0) return { over: false, text: fmt(Math.ceil(left / 1000)) };
  return { over: true, text: `Rest over · ${fmt(-left / 1000)} ago` };
}
