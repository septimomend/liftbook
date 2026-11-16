import { getProgram, getSettings, saveSettings, allLogs, allImages, replaceAll } from "../store.js";
import { buildBackup, parseBackup, backupFileName, shareOrDownload } from "../backup.js";
import { fmt } from "../timer.js";
import { h, mount } from "../dom.js";
import { renderDriveCard } from "../sync-ui.js";

export async function render(root, ctx) {
  const settings = await getSettings();

  const rest = h("select", { name: "rest" },
    Array.from({ length: 17 }, (_, i) => 60 + i * 15).map(s =>
      h("option", { value: s, selected: s === settings.restSec }, fmt(s))));
  rest.addEventListener("change", () => saveSettings({ ...settings, restSec: Number(rest.value) }));

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
      if (!confirm("Replace all data on this phone with this file?")) return;
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
      say(`Backup failed: ${e.message}`, true);
    }
  };

  const driveCard = h("div", { class: "card", id: "drive-card" });
  root.append(
    h("h1", null, "Settings"),
    h("label", null, "Rest between sets"), rest,
    h("h2", null, "Google Drive"),
    driveCard,
    h("h2", null, "Backup file"),
    h("div", { class: "card" },
      h("button", { class: "big", onClick: exportBackup }, "Export backup"),
      h("p", { class: "muted" }, "Opens the share sheet — pick Google Drive (or Files) to save it."),
      h("button", { class: "big", onClick: () => importInput.click() }, "Import file"),
      h("p", { class: "muted" }, "Load a backup or your liftbook-import.json. Replaces the data on this phone."),
      importInput),
    status,
  );
  await renderDriveCard(driveCard);
}
