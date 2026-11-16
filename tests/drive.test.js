import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeDrive } from "../app/js/drive.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const r = handler(String(url), init);
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  return calls;
}

test("findOrCreateFolder reuses existing folder and sends the token", async () => {
  const calls = mockFetch(() => ({ body: { files: [{ id: "F1" }] } }));
  const id = await makeDrive(async () => "TOK").findOrCreateFolder("Liftbook");
  assert.equal(id, "F1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer TOK");
  const q = new URL(calls[0].url).searchParams.get("q");
  assert.equal(q, "name='Liftbook' and mimeType='application/vnd.google-apps.folder' and trashed=false");
});

test("findOrCreateFolder creates when missing", async () => {
  const calls = mockFetch((url, init) => (init.method === "POST" ? { body: { id: "NEW" } } : { body: { files: [] } }));
  assert.equal(await makeDrive(async () => "t").findOrCreateFolder("Liftbook"), "NEW");
  assert.deepEqual(JSON.parse(calls[1].init.body), { name: "Liftbook", mimeType: "application/vnd.google-apps.folder" });
});

test("createFile sends multipart/related with metadata and content", async () => {
  const calls = mockFetch(() => ({ body: { id: "X" } }));
  const id = await makeDrive(async () => "t").createFile("F1", "a.jpg", "image/jpeg", new Blob(["IMG"]), { liftbookImage: "a" });
  assert.equal(id, "X");
  const { url, init } = calls[0];
  assert.match(url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  const boundary = init.headers["Content-Type"].match(/^multipart\/related; boundary=(.+)$/)[1];
  const body = await init.body.text();
  assert.ok(body.startsWith(`--${boundary}\r\nContent-Type: application/json`));
  assert.ok(body.includes('"parents":["F1"]'));
  assert.ok(body.includes('"appProperties":{"liftbookImage":"a"}'));
  assert.ok(body.includes("Content-Type: image/jpeg\r\n\r\nIMG\r\n"));
  assert.ok(body.endsWith(`--${boundary}--`));
});

test("listImages pages and filters by appProperties", async () => {
  let n = 0;
  mockFetch(() => (n++ === 0
    ? { body: { files: [{ id: "1", appProperties: { liftbookImage: "a" } }, { id: "2" }], nextPageToken: "P" } }
    : { body: { files: [{ id: "3", appProperties: { liftbookImage: "b" } }] } }));
  assert.deepEqual(await makeDrive(async () => "t").listImages("F"), [{ fileId: "1", imageId: "a" }, { fileId: "3", imageId: "b" }]);
});

test("401 maps to needs-sign-in, other errors carry the status", async () => {
  mockFetch(() => ({ status: 401, body: {} }));
  await assert.rejects(makeDrive(async () => "t").readText("x"), /needs-sign-in/);
  mockFetch(() => ({ status: 500, body: {} }));
  await assert.rejects(makeDrive(async () => "t").readText("x"), /Google Drive error 500/);
});

test("names with quotes are escaped in queries", async () => {
  const calls = mockFetch(() => ({ body: { files: [] } }));
  await makeDrive(async () => "t").findFile("F", "it's.json");
  assert.match(new URL(calls[0].url).searchParams.get("q"), /name='it\\'s\.json'/);
});
