// Progress line chart (one series: heaviest weight per workout). Plain SVG, works offline.
import { h } from "../dom.js";
import { t } from "../i18n.js";
import { niceTicks } from "../model.js";

const NS = "http://www.w3.org/2000/svg";
const W = 340, H = 180;
const PAD = { left: 36, right: 12, top: 10, bottom: 24 };

function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/**
 * points: [{ ts, weight, sets }] oldest first. fmtDate(ts) -> short date, setText(sets) -> "70×10 · …".
 * Tap (or hover) a point to read it; the latest workout is shown to start with.
 */
export function progressChart(points, { fmtDate, setText }) {
  const ticks = niceTicks(Math.min(...points.map(p => p.weight)), Math.max(...points.map(p => p.weight)));
  const [y0, y1] = [ticks[0], ticks.at(-1)];
  const [t0, t1] = [points[0].ts, points.at(-1).ts];
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const x = ts => PAD.left + (t1 === t0 ? plotW / 2 : ((ts - t0) / (t1 - t0)) * plotW);
  const y = w => PAD.top + (1 - (w - y0) / (y1 - y0)) * plotH;

  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("Heaviest weight per workout") });
  for (const v of ticks) {
    svg.append(s("line", { class: "grid", x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v) }),
      s("text", { class: "tick", x: PAD.left - 6, y: y(v) + 4, "text-anchor": "end" }, String(v)));
  }
  svg.append(s("text", { class: "tick", x: PAD.left, y: H - 6, "text-anchor": "start" }, fmtDate(t0)));
  if (t1 !== t0) svg.append(s("text", { class: "tick", x: W - PAD.right, y: H - 6, "text-anchor": "end" }, fmtDate(t1)));

  const cross = s("line", { class: "cross", y1: PAD.top, y2: PAD.top + plotH, x1: 0, x2: 0 });
  svg.append(cross);
  if (points.length > 1) svg.append(s("polyline", { class: "line", points: points.map(p => `${x(p.ts)},${y(p.weight)}`).join(" ") }));

  const tip = h("div", { class: "chart-tip", "aria-live": "polite" });
  const dots = points.map(p => s("circle", { class: "pt", cx: x(p.ts), cy: y(p.weight), r: 4 }));
  const select = i => {
    const p = points[i];
    dots.forEach((d, j) => d.classList.toggle("on", j === i));
    cross.setAttribute("x1", x(p.ts));
    cross.setAttribute("x2", x(p.ts));
    tip.replaceChildren(h("b", null, t("{w} kg", { w: p.weight })), ` · ${fmtDate(p.ts)} · ${setText(p.sets)}`);
  };
  // hit areas: each point owns the band halfway to its neighbours (bigger than the dot)
  points.forEach((p, i) => {
    const left = i === 0 ? PAD.left - 8 : (x(points[i - 1].ts) + x(p.ts)) / 2;
    const right = i === points.length - 1 ? W - PAD.right + 8 : (x(p.ts) + x(points[i + 1].ts)) / 2;
    const hit = s("rect", { class: "hit", x: left, y: 0, width: Math.max(right - left, 1), height: H });
    hit.addEventListener("click", () => select(i));
    hit.addEventListener("pointerenter", () => select(i));
    svg.append(hit);
  });
  // dots above the hit areas, and clickable too
  dots.forEach((d, i) => { d.addEventListener("click", () => select(i)); svg.append(d); });
  select(points.length - 1);
  return h("div", { class: "card chart-card" }, svg, tip);
}
