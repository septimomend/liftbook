// Two-way sync between this phone (IndexedDB) and a "Liftbook" folder on Google Drive.
import * as storeModule from "./store.js";
import * as auth from "./auth.js";
import { makeDrive } from "./drive.js";
import { GOOGLE_CLIENT_ID } from "./config.js";

export const FOLDER = "Liftbook";
export const DATA_FILE = "liftbook-data.json";

const byTsThenId = (a, b) => (a.ts - b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function normalize(s) {
  return {
    program: s.program,
    settings: s.settings,
    logs: [...s.logs].sort(byTsThenId),
    deletedLogIds: [...new Set(s.deletedLogIds ?? [])].sort(),
  };
}
const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const newer = (l, r) => ((l?.updatedAt ?? 0) > (r?.updatedAt ?? 0) ? l : r); // tie -> remote

/** Logs: union minus tombstones (sets are never lost). Program/settings: newest edit wins. */
export function mergeState(local, remote) {
  const deleted = new Set([...(local.deletedLogIds ?? []), ...(remote.deletedLogIds ?? [])]);
  const logs = new Map();
  for (const l of [...remote.logs, ...local.logs]) if (!deleted.has(l.id)) logs.set(l.id, l);
  return normalize({
    program: newer(local.program, remote.program),
    settings: newer(local.settings, remote.settings),
    logs: [...logs.values()],
    deletedLogIds: [...deleted],
  });
}

function parseData(text) {
  const d = JSON.parse(text);
  if (d?.app !== "liftbook" || !d.program || !Array.isArray(d.logs)) throw new Error("Drive data file is damaged");
  return { program: d.program, settings: d.settings ?? { restSec: 90 }, logs: d.logs, deletedLogIds: d.deletedLogIds ?? [] };
}
const serialize = s => JSON.stringify({ app: "liftbook", kind: "data", format: 1, ...normalize(s) });

function imageRefs(program) {
  const ids = new Set();
  for (const d of program?.days ?? []) for (const e of d.exercises) {
    for (const ref of [e.image, ...e.alternatives.map(a => a.image)]) if (ref?.startsWith("idb:")) ids.add(ref.slice(4));
  }
  return ids;
}

export async function syncOnce({ drive, store, now }) {
  const meta = await store.getSyncMeta();
  const folderId = await drive.findOrCreateFolder(FOLDER);
  const file = await drive.findFile(folderId, DATA_FILE);
  const remote = file ? parseData(await drive.readText(file.id)) : null;
  // merge at apply time, inside one transaction, so writes made meanwhile are kept
  const { merged, changed: pulled } = remote
    ? await store.mergeIn(remote, mergeState, same)
    : { merged: normalize(await store.exportState()), changed: false };

  let pushed = false;
  let fileId = file?.id ?? null;
  if (!remote) {
    fileId = await drive.createFile(folderId, DATA_FILE, "application/json", serialize(merged));
    pushed = true;
  } else if (!same(merged, remote)) {
    await drive.updateFile(file.id, serialize(merged));
    pushed = true;
  }

  // pictures: immutable by id — upload what Drive lacks, download what this phone lacks
  const remoteImages = new Map((await drive.listImages(folderId)).map(i => [i.imageId, i.fileId]));
  for (const img of await store.allImages()) {
    if (remoteImages.has(img.id)) continue;
    const id = await drive.createFile(folderId, `${img.id}.jpg`, img.type || "image/jpeg", img.blob, { liftbookImage: img.id });
    remoteImages.set(img.id, id);
    pushed = true;
  }
  for (const id of imageRefs(merged.program)) {
    if (!remoteImages.has(id) || (await store.getImage(id))) continue;
    const blob = await drive.readBlob(remoteImages.get(id));
    await store.putImage({ id, type: blob.type || "image/jpeg", blob });
  }

  await store.saveSyncMeta({ ...meta, folderId, fileId, signedIn: true, lastSyncedAt: now, uploadedImageIds: [...remoteImages.keys()] });
  return { pulled, pushed };
}

let running = null;

/** Glue for the UI. Never throws; local data is untouched on failure. */
export function syncNow({
  interactive = false,
  clientId = GOOGLE_CLIENT_ID,
  getToken = auth.getToken,
  makeDriveFn = makeDrive,
  store = storeModule,
} = {}) {
  if (!clientId) return Promise.resolve({ ok: false, reason: "not-configured" });
  if (globalThis.navigator?.onLine === false) return Promise.resolve({ ok: false, reason: "offline" });
  running ??= (async () => {
    try {
      await getToken({ interactive });
      const drive = makeDriveFn(() => getToken({ interactive: false }));
      return { ok: true, ...(await syncOnce({ drive, store, now: Date.now() })) };
    } catch (e) {
      if (e.message === "needs-sign-in" || e.message === "needs-permission") {
        auth.forgetToken?.();
        return { ok: false, reason: e.message };
      }
      return { ok: false, reason: e.message || "error" };
    } finally {
      running = null;
    }
  })();
  return running;
}
