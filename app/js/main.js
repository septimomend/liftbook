import { bootstrap, getSettings } from "./store.js";
import { t, setLang, resolveLang } from "./i18n.js";
import { h, forgetPictures } from "./dom.js";
import { autoSync } from "./sync-ui.js";
import { applyAccent } from "./theme.js";
import { fitScreen } from "./layout.js";
import * as today from "./ui/today.js";
import * as workout from "./ui/workout.js";
import * as editor from "./ui/editor.js";
import * as history from "./ui/history.js";
import * as settings from "./ui/settings.js";

const routes = [
  [/^#?\/?$/, today, "today"],
  [/^#\/workout$/, workout, "today"],
  [/^#\/edit$/, editor, "plan"],
  [/^#\/edit\/day\/([^/]+)$/, editor, "plan", "dayId"],
  [/^#\/edit\/ex\/([^/]+)$/, editor, "plan", "exerciseId"],
  [/^#\/history$/, history, "history"],
  [/^#\/history\/([^/]+)$/, history, "history", "exerciseId"],
  [/^#\/settings$/, settings, "settings"],
];

const root = document.getElementById("app");
let current = null;
let wakeLock = null;

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

async function setWakeLock(on) {
  try {
    if (on && !wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock?.request("screen");
      wakeLock?.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not supported / denied: ignore */ }
}

// Tab icons: one hand-drawn line set (24×24, 2px stroke, currentColor), so every phone
// shows them the same way — font glyphs like ⚙ turn into colored emoji on iOS.
const ICONS = {
  today: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  plan: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

function icon(key) {
  const span = h("span", { class: "ico", "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`;
  return span;
}

function nav(active) {
  const item = (key, hash, label) => h("a", { href: hash, class: key === active ? "on" : "" }, icon(key), label);
  return h("nav", { class: "tabs" },
    item("today", "#/", t("Today")),
    item("plan", "#/edit", t("Plan")),
    item("history", "#/history", t("History")),
    item("settings", "#/settings", t("Settings")));
}

async function render() {
  const hash = location.hash || "#/";
  const route = routes.find(([re]) => re.test(hash)) ?? routes[0];
  const [re, mod, tab, param] = route;
  const m = hash.match(re);
  const params = param ? { [param]: decodeURIComponent(m[1]) } : {};
  current?.cleanup?.();
  const view = h("main", { class: "view" });
  root.replaceChildren(view, nav(tab));
  setWakeLock(mod === workout);
  current = (await mod.render(view, { navigate, params })) ?? null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (/^#\/workout/.test(location.hash)) setWakeLock(true);
    current?.refresh?.();
  }
});
window.addEventListener("hashchange", render);
window.addEventListener("liftbook:data", () => { forgetPictures(); render(); });

async function start() {
  navigator.storage?.persist?.().catch(() => {});
  await bootstrap(async () => ({ version: 1, days: [], updatedAt: 0 }));
  const prefs = await getSettings();
  setLang(resolveLang(prefs.lang, navigator.languages));
  applyAccent(prefs.accent);
  fitScreen();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  await render();
  autoSync();
}

start().catch(e => {
  root.replaceChildren(h("main", { class: "view" }, h("p", { class: "error" }, t("Could not start: {msg}", { msg: e.message }))));
});
