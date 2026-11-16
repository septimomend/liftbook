import { bootstrap, getSettings } from "./store.js";
import { t, setLang, resolveLang } from "./i18n.js";
import { h, forgetPictures } from "./dom.js";
import { autoSync } from "./sync-ui.js";
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

function nav(active) {
  const item = (key, hash, label, icon) =>
    h("a", { href: hash, class: key === active ? "on" : "" }, h("span", { class: "ico" }, icon), label);
  return h("nav", { class: "tabs" },
    item("today", "#/", t("Today"), "●"),
    item("plan", "#/edit", t("Plan"), "☰"),
    item("history", "#/history", t("History"), "↺"),
    item("settings", "#/settings", t("Settings"), "⚙"));
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
  setLang(resolveLang((await getSettings()).lang, navigator.languages));
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  await render();
  autoSync();
}

start().catch(e => {
  root.replaceChildren(h("main", { class: "view" }, h("p", { class: "error" }, t("Could not start: {msg}", { msg: e.message }))));
});
