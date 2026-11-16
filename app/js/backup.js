// Backup file: one JSON with program, settings, logs and user-added pictures (base64).

const APP = "liftbook";
const FORMAT = 1;

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(data, type) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function buildBackup({ program, settings, logs, images }, now) {
  return {
    app: APP,
    format: FORMAT,
    exportedAt: now.toISOString(),
    program,
    settings,
    logs,
    images: await Promise.all(images.map(async i => ({ id: i.id, type: i.type, data: await blobToBase64(i.blob) }))),
  };
}

export function parseBackup(text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("This file is not a Liftbook backup (not valid JSON).");
  }
  if (!b || typeof b !== "object" || b.app !== APP) throw new Error("This file is not a Liftbook backup.");
  if (b.format !== FORMAT) throw new Error(`Unsupported backup format: ${b.format}.`);
  if (!b.program || !Array.isArray(b.program.days)) throw new Error("Backup is damaged: program is missing.");
  if (!Array.isArray(b.logs)) throw new Error("Backup is damaged: workout log is missing.");
  const images = Array.isArray(b.images) ? b.images : [];
  return {
    program: b.program,
    settings: b.settings ?? { restSec: 90 },
    logs: b.logs,
    images: images.map(i => ({ id: i.id, type: i.type, blob: base64ToBlob(i.data, i.type) })),
  };
}

export function backupFileName(now) {
  const p = n => String(n).padStart(2, "0");
  return `liftbook-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** iOS share sheet (pick Google Drive) when available, else a plain download. */
export async function shareOrDownload(text, fileName) {
  const file = new File([text], fileName, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Liftbook backup" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // owner closed the sheet
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
