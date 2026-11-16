import { h } from "../dom.js";
import { restView, adjustRest } from "../timer.js";

/**
 * Full-screen rest overlay. Silent by design: no sound, no vibration, no flash —
 * at zero the text just switches to "Rest over · M:SS ago".
 * Returns { refresh, close }.
 */
export function showRest(parent, { endsAt, caption, onChange, onClose }) {
  let end = endsAt;
  const clock = h("div", { class: "clock", role: "timer" });
  const overlay = h("div", { class: "rest-overlay" },
    h("div", { class: "muted" }, caption),
    clock,
    h("div", { class: "row" },
      h("button", { onClick: () => shift(-15) }, "−15s"),
      h("button", { onClick: () => shift(15) }, "+15s"),
      h("button", { class: "primary", onClick: () => close() }, "Skip")));

  const tick = () => {
    const v = restView(end, Date.now());
    clock.textContent = v.text;
    overlay.classList.toggle("over", v.over);
  };
  const shift = d => {
    end = adjustRest(end, Date.now(), d);
    onChange?.(end);
    tick();
  };
  const timer = setInterval(tick, 250);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    overlay.remove();
    onClose?.();
  };

  tick();
  parent.append(overlay);
  return { refresh: tick, close, destroy: () => { clearInterval(timer); overlay.remove(); } };
}
