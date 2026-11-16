// IndexedDB persistence. All app data lives here, on the phone.

const DB_NAME = "liftbook";
const DB_VERSION = 1;
const DEFAULT_SETTINGS = { restSec: 90 };

let dbPromise = null;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("kv");
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("exerciseId", "exerciseId");
        logs.createIndex("ts", "ts");
        db.createObjectStore("images", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Drop the cached connection (tests swap the IndexedDB factory). */
export function closeDb() {
  dbPromise?.then(db => db.close()).catch(() => {});
  dbPromise = null;
}

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
});

const result = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function read(storeName, fn) {
  const db = await openDb();
  return result(fn(db.transaction(storeName).objectStore(storeName)));
}

async function write(storeName, fn) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  fn(tx.objectStore(storeName));
  return done(tx);
}

const kvGet = async key => (await read("kv", s => s.get(key))) ?? null;
const kvPut = (key, value) => write("kv", s => (value == null ? s.delete(key) : s.put(value, key)));

const DEFAULT_SYNC = { folderId: null, fileId: null, signedIn: false, lastSyncedAt: null, uploadedImageIds: [] };
const stamped = (obj, stamp) => (stamp ? { ...obj, updatedAt: Date.now() } : obj);

export const getProgram = () => kvGet("program");
/** stamp=true marks a local edit (newest edit wins a sync merge). */
export const saveProgram = (p, { stamp = true } = {}) => kvPut("program", stamped(p, stamp));
export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...((await kvGet("settings")) ?? {}) });
export const saveSettings = (s, { stamp = true } = {}) => kvPut("settings", stamped(s, stamp));
export const getDeletedLogIds = async () => (await kvGet("deletedLogIds")) ?? [];
export const getSyncMeta = async () => ({ ...DEFAULT_SYNC, ...((await kvGet("sync")) ?? {}) });
export const saveSyncMeta = m => kvPut("sync", m);
export const getSession = () => kvGet("session");
export const saveSession = s => kvPut("session", s);

export const addLog = log => write("logs", s => s.put(log));
export async function deleteLog(id) {
  const db = await openDb();
  const tx = db.transaction(["logs", "kv"], "readwrite");
  tx.objectStore("logs").delete(id);
  const kv = tx.objectStore("kv");
  const req = kv.get("deletedLogIds");
  req.onsuccess = () => {
    const ids = req.result ?? [];
    if (!ids.includes(id)) kv.put([...ids, id], "deletedLogIds");
  };
  return done(tx);
}
export const allLogs = () => read("logs", s => s.getAll());
export const logsForExercise = id => read("logs", s => s.index("exerciseId").getAll(id));

export async function lastLog() {
  const db = await openDb();
  const req = db.transaction("logs").objectStore("logs").index("ts").openCursor(null, "prev");
  const cursor = await result(req);
  return cursor ? cursor.value : null;
}

export const putImage = img => write("images", s => s.put(img));
export const getImage = async id => (await read("images", s => s.get(id))) ?? null;
export const allImages = () => read("images", s => s.getAll());
/** Picture changed on this phone: keep its id, mark it for upload over the Drive copy. */
export const replaceImage = (id, type, blob) => putImage({ id, type, blob, dirty: true });

/** Seed the program only when none is stored; never overwrite the owner's data. */
export async function bootstrap(fetchSeed) {
  const existing = await getProgram();
  if (existing) return existing;
  const seed = await fetchSeed();
  await saveProgram(seed, { stamp: false });
  return seed;
}

/** The part of the data that syncs as one document. */
export async function exportState() {
  return {
    program: await getProgram(),
    settings: await getSettings(),
    logs: await allLogs(),
    deletedLogIds: await getDeletedLogIds(),
  };
}

/**
 * Merge a remote document into local data inside ONE transaction: local state is re-read
 * at apply time, so sets/edits/restores made while a sync was downloading are never lost.
 * mergeFn(local, remote) must be synchronous. Returns { merged, changed }.
 */
export async function mergeIn(remote, mergeFn, sameFn) {
  const db = await openDb();
  const tx = db.transaction(["kv", "logs"], "readwrite");
  const finished = done(tx);
  const kv = tx.objectStore("kv");
  const ls = tx.objectStore("logs");
  const local = { program: null, settings: null, logs: [], deletedLogIds: [] };
  let out = null;
  const reads = [
    [kv.get("program"), v => { local.program = v ?? null; }],
    [kv.get("settings"), v => { local.settings = { ...DEFAULT_SETTINGS, ...(v ?? {}) }; }],
    [kv.get("deletedLogIds"), v => { local.deletedLogIds = v ?? []; }],
    [ls.getAll(), v => { local.logs = v; }],
  ];
  let pending = reads.length;
  for (const [req, set] of reads) {
    req.onsuccess = () => {
      set(req.result);
      if (--pending) return;
      try {
        const merged = mergeFn(local, remote);
        const changed = !sameFn(merged, local);
        if (changed) {
          kv.put(merged.program, "program");
          kv.put(merged.settings, "settings");
          kv.put(merged.deletedLogIds, "deletedLogIds");
          ls.clear();
          for (const l of merged.logs) ls.put(l);
        }
        out = { merged, changed };
      } catch (e) {
        tx.abort();
      }
    };
  }
  await finished;
  if (!out) throw new Error("merge failed");
  return out;
}

/** Replace the synced document's data in one transaction; images, session, sync meta untouched. */
export async function applyState({ program, settings, logs, deletedLogIds }) {
  const db = await openDb();
  const tx = db.transaction(["kv", "logs"], "readwrite");
  const finished = done(tx);
  try {
    const kv = tx.objectStore("kv");
    kv.put(program, "program");
    kv.put(settings, "settings");
    kv.put(deletedLogIds, "deletedLogIds");
    const ls = tx.objectStore("logs");
    ls.clear();
    for (const l of logs) ls.put(l);
  } catch (e) {
    tx.abort();
    await finished.catch(() => {});
    throw e;
  }
  return finished;
}

/**
 * Restore / import: replace program, settings, logs, images in one transaction — all or nothing.
 * The program is stamped so it wins the next sync merge. Sync meta is kept.
 */
export async function replaceAll({ program, settings, logs, images }) {
  const db = await openDb();
  const tx = db.transaction(["kv", "logs", "images"], "readwrite");
  const finished = done(tx);
  try {
    const kv = tx.objectStore("kv");
    for (const k of ["session", "deletedLogIds"]) kv.delete(k);
    kv.put({ ...program, updatedAt: Date.now() }, "program");
    kv.put({ ...(settings ?? DEFAULT_SETTINGS), updatedAt: Date.now() }, "settings");
    const ls = tx.objectStore("logs");
    ls.clear();
    for (const l of logs) ls.put(l);
    const is = tx.objectStore("images");
    is.clear();
    for (const i of images) is.put(i);
  } catch (e) {
    tx.abort();
    await finished.catch(() => {});
    throw e;
  }
  return finished;
}
