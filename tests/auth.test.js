import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getToken, forgetToken } from "../app/js/auth.js";

function stubGis({ respond, granted = true }) {
  globalThis.google = { accounts: { oauth2: {
    initTokenClient: cfg => ({ requestAccessToken: () => respond?.(cfg) }),
    hasGrantedAllScopes: () => granted,
    revoke: () => {},
  } } };
}
afterEach(() => { delete globalThis.google; forgetToken(); });

test("interactive sign-in that never answers times out as needs-sign-in", async () => {
  stubGis({ respond: null });
  await assert.rejects(getToken({ interactive: true, timeoutMs: 30 }), /needs-sign-in/);
});

test("token without the Drive permission is rejected", async () => {
  stubGis({ respond: cfg => cfg.callback({ access_token: "T", expires_in: 3600 }), granted: false });
  await assert.rejects(getToken({ interactive: true }), /needs-permission/);
  await assert.rejects(getToken({ interactive: false }), /needs-sign-in/); // not cached
});

test("granted token is returned and cached", async () => {
  stubGis({ respond: cfg => cfg.callback({ access_token: "T", expires_in: 3600 }) });
  assert.equal(await getToken({ interactive: true }), "T");
  assert.equal(await getToken({ interactive: false }), "T");
});
