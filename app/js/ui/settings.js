import { getProgram, getSettings, saveSettings, allLogs, allImages, replaceAll, replaceImage, getSyncMeta } from "../store.js";
import { t, setLang, resolveLang } from "../i18n.js";
import { buildBackup, parseBackup, backupFileName, shareOrDownload } from "../backup.js";
import { fmt } from "../timer.js";
import { h, mount, toJpeg, forgetPictures } from "../dom.js";
import { renderDriveCard, runSync, syncConfigured } from "../sync-ui.js";
import { pictureIdFromFileName, DEFAULTS } from "../model.js";
import { ACCENTS, applyAccent } from "../theme.js";
import { VERSION } from "../version.js";
import { screenInfo } from "../layout.js";

export async function render(root, ctx) {
  const settings = await getSettings();

  const rest = h("select", { name: "rest" },
    Array.from({ length: 17 }, (_, i) => 60 + i * 15).map(s =>
      h("option", { value: s, selected: s === settings.restSec }, fmt(s))));
  rest.addEventListener("change", async () => saveSettings({ ...(await getSettings()), restSec: Number(rest.value) }));
  const restEx = h("select", { name: "rest-exercise" },
    Array.from({ length: 17 }, (_, i) => 60 + i * 15).map(s =>
      h("option", { value: s, selected: s === (settings.restExSec ?? DEFAULTS.restExSec) }, fmt(s))));
  restEx.addEventListener("change", async () => saveSettings({ ...(await getSettings()), restExSec: Number(restEx.value) }));

  const colorName = {
    blue: t("Blue"), orange: t("Orange"), green: t("Green"), teal: t("Teal"),
    purple: t("Purple"), pink: t("Pink"), red: t("Red"), yellow: t("Yellow"),
  };
  const current = ACCENTS[settings.accent] ? settings.accent : "blue";
  const colors = h("div", { class: "swatches", role: "radiogroup", "aria-label": t("Color") },
    Object.entries(ACCENTS).map(([name, hex]) => {
      const input = h("input", { type: "radio", name: "accent", value: name, checked: name === current, "aria-label": colorName[name] });
      input.addEventListener("change", async () => {
        applyAccent(name);
        await saveSettings({ ...(await getSettings()), accent: name });
      });
      return h("label", { class: "swatch", style: `--sw:${hex}`, title: colorName[name] }, input);
    }));

  const language = h("select", { name: "language" },
    h("option", { value: "auto", selected: !settings.lang || settings.lang === "auto" }, t("Automatic (phone language)")),
    h("option", { value: "en", selected: settings.lang === "en" }, "English"),
    h("option", { value: "uk", selected: settings.lang === "uk" }, "Українська"));
  language.addEventListener("change", async () => {
    await saveSettings({ ...(await getSettings()), lang: language.value });
    setLang(resolveLang(language.value, navigator.languages));
    window.dispatchEvent(new Event("liftbook:data")); // re-render in the new language
  });

  const status = h("p", { class: "muted", role: "status" });
  const say = (text, isError = false) => {
    status.textContent = text;
    status.className = isError ? "error" : "muted";
  };

  const importInput = h("input", { type: "file", name: "import", accept: ".json,application/json", style: "display:none" });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const data = parseBackup(await file.text());
      if (!confirm(t("Replace all data on this phone with this file?"))) return;
      await replaceAll(data);
      ctx.navigate("#/");
    } catch (e) {
      say(e.message, true);
    }
  });

  // Replace pictures with files named like the originals ("<id>.jpg"), e.g. picked
  // from Google Drive in the iPhone Files app. Same ids, so the plan needs no change.
  const picturesInput = h("input", { type: "file", name: "pictures", accept: "image/*", multiple: true, style: "display:none" });
  picturesInput.addEventListener("change", async () => {
    const files = [...(picturesInput.files ?? [])];
    picturesInput.value = "";
    if (!files.length) return;
    try {
      const ids = new Set((await allImages()).map(i => i.id));
      let replaced = 0;
      const unmatched = [];
      for (const file of files) {
        const id = pictureIdFromFileName(file.name, ids);
        if (!id) { unmatched.push(file.name); continue; }
        await replaceImage(id, "image/jpeg", await toJpeg(file));
        replaced++;
      }
      forgetPictures();
      say(t("Pictures replaced: {n}.", { n: replaced })
        + (unmatched.length ? ` ${t("Not matched: {names}", { names: unmatched.join(", ") })}` : ""), unmatched.length > 0 && !replaced);
      if (replaced && syncConfigured() && (await getSyncMeta()).signedIn) {
        await runSync(false);
        await renderDriveCard(driveCard);
      }
    } catch (e) {
      say(e.message, true);
    }
  });

  const exportBackup = async () => {
    try {
      const data = { program: await getProgram(), settings: await getSettings(), logs: await allLogs(), images: await allImages() };
      const now = new Date();
      await shareOrDownload(JSON.stringify(await buildBackup(data, now)), backupFileName(now));
    } catch (e) {
      say(t("Backup failed: {msg}", { msg: e.message }), true);
    }
  };

  const driveCard = h("div", { class: "card", id: "drive-card" });
  root.append(
    h("h1", null, t("Settings")),
    h("label", null, t("Language")), language,
    h("label", null, t("Color")), colors,
    h("label", null, t("Rest between sets")), rest,
    h("label", null, t("Rest between exercises")), restEx,
    h("h2", null, t("Google Drive")),
    driveCard,
    h("h2", null, t("Backup file")),
    h("div", { class: "card" },
      h("button", { class: "big", onClick: exportBackup }, t("Export backup")),
      h("p", { class: "muted" }, t("Opens the share sheet — pick Google Drive (or Files) to save it.")),
      h("button", { class: "big", onClick: () => importInput.click() }, t("Import file")),
      h("p", { class: "muted" }, t("Load a backup or your liftbook-import.json. Replaces the data on this phone.")),
      importInput,
      h("button", { class: "big", onClick: () => picturesInput.click() }, t("Replace pictures")),
      h("p", { class: "muted" }, t("Pick picture files named like the ones in the Liftbook folder on Drive (for example 1a2b3c4d5e6f.jpg). Each replaces the picture with the same name.")),
      picturesInput),
    status,
    h("p", { class: "muted about" }, `Liftbook ${VERSION}`, h("br"), screenLine()),
  );
  await renderDriveCard(driveCard);
}

/** Tiny screen report for troubleshooting layout on the phone: screen / page height, bottom inset, mode. */
function screenLine() {
  const i = screenInfo();
  return `screen ${i.screenH} · page ${i.viewH} · inset ${Math.round(i.insetBottom)} · ${i.standalone ? "app" : "browser"}`;
}
