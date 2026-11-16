import { getProgram, getSettings, saveSettings, allLogs, allImages, replaceAll } from "../store.js";
import { t, setLang, resolveLang } from "../i18n.js";
import { buildBackup, parseBackup, backupFileName, shareOrDownload } from "../backup.js";
import { fmt } from "../timer.js";
import { h, mount } from "../dom.js";
import { renderDriveCard } from "../sync-ui.js";

export async function render(root, ctx) {
  const settings = await getSettings();

  const rest = h("select", { name: "rest" },
    Array.from({ length: 17 }, (_, i) => 60 + i * 15).map(s =>
      h("option", { value: s, selected: s === settings.restSec }, fmt(s))));
  rest.addEventListener("change", async () => saveSettings({ ...(await getSettings()), restSec: Number(rest.value) }));

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
    h("label", null, t("Rest between sets")), rest,
    h("h2", null, t("Google Drive")),
    driveCard,
    h("h2", null, t("Backup file")),
    h("div", { class: "card" },
      h("button", { class: "big", onClick: exportBackup }, t("Export backup")),
      h("p", { class: "muted" }, t("Opens the share sheet — pick Google Drive (or Files) to save it.")),
      h("button", { class: "big", onClick: () => importInput.click() }, t("Import file")),
      h("p", { class: "muted" }, t("Load a backup or your liftbook-import.json. Replaces the data on this phone.")),
      importInput),
    status,
  );
  await renderDriveCard(driveCard);
}
