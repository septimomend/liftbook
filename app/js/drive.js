// Minimal Google Drive REST v3 client over fetch. Scope drive.file: only files Liftbook created.
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const q = s => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function makeDrive(getToken) {
  async function call(url, init = {}) {
    const token = await getToken();
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new Error("needs-sign-in");
    if (!res.ok) throw new Error(`Google Drive error ${res.status}`);
    return res;
  }
  const json = async (url, init) => (await call(url, init)).json();

  async function list(query, fields = "files(id,name,appProperties)") {
    const out = [];
    let pageToken = "";
    do {
      const p = new URLSearchParams({ q: query, fields: `nextPageToken,${fields}`, pageSize: "1000", spaces: "drive" });
      if (pageToken) p.set("pageToken", pageToken);
      const r = await json(`${API}/files?${p}`);
      out.push(...r.files);
      pageToken = r.nextPageToken ?? "";
    } while (pageToken);
    return out;
  }

  return {
    async findOrCreateFolder(name) {
      const found = await list(`name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`);
      if (found.length) return found[0].id;
      const r = await json(`${API}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      });
      return r.id;
    },
    async findFile(folderId, name) {
      const found = await list(`'${q(folderId)}' in parents and name='${q(name)}' and trashed=false`);
      return found.length ? { id: found[0].id } : null;
    },
    async readText(fileId) {
      return (await call(`${API}/files/${fileId}?alt=media`)).text();
    },
    async readBlob(fileId) {
      return (await call(`${API}/files/${fileId}?alt=media`)).blob();
    },
    async createFile(folderId, name, mime, body, appProperties) {
      const boundary = `liftbook${Math.random().toString(36).slice(2)}`;
      const meta = { name, mimeType: mime, parents: [folderId], ...(appProperties ? { appProperties } : {}) };
      const payload = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, body, `\r\n--${boundary}--`,
      ]);
      const r = await json(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: payload,
      });
      return r.id;
    },
    async updateFile(fileId, body) {
      await call(`${UPLOAD}/files/${fileId}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
    },
    async listImages(folderId) {
      const files = await list(`'${q(folderId)}' in parents and trashed=false`);
      return files.filter(f => f.appProperties?.liftbookImage)
        .map(f => ({ fileId: f.id, imageId: f.appProperties.liftbookImage }));
    },
  };
}
