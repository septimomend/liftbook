// Google sign-in (Google Identity Services token flow). No server: tokens last ~1 hour,
// renewing one usually needs a single "Continue as …" tap, which must come from a user tap.
import { GOOGLE_CLIENT_ID } from "./config.js";

export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const KEY = "liftbook.token"; // per-device convenience: survives an app restart within the hour

let loading = null;

/** Load the GIS script ahead of time so a later tap can open the popup immediately. */
export function preloadAuth() {
  if (!GOOGLE_CLIENT_ID || typeof document === "undefined") return Promise.resolve();
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { loading = null; reject(new Error("offline")); };
    document.head.append(s);
  });
  return loading;
}

function cached() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return t && Date.now() < t.expiresAt - 60_000 ? t.token : null;
  } catch {
    return null;
  }
}

function remember(token, expiresInSec) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInSec * 1000 }));
  } catch { /* private mode: keep it in memory only */ }
  memory = { token, expiresAt: Date.now() + expiresInSec * 1000 };
}

let memory = null;

export async function getToken({ interactive = false, timeoutMs = 90_000 } = {}) {
  if (memory && Date.now() < memory.expiresAt - 60_000) return memory.token;
  const c = cached();
  if (c) return c;
  if (!interactive) throw new Error("needs-sign-in");
  await preloadAuth();
  return new Promise((resolve, reject) => {
    // iOS home-screen apps may never report a closed/blocked popup: give up after a while
    const timer = setTimeout(() => reject(new Error("needs-sign-in")), timeoutMs);
    const fail = msg => { clearTimeout(timer); reject(new Error(msg)); };
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: r => {
        if (r.error || !r.access_token) return fail("needs-sign-in");
        // the consent screen lets the user untick Drive access
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return fail("needs-permission");
        clearTimeout(timer);
        remember(r.access_token, Number(r.expires_in) || 3600);
        resolve(r.access_token);
      },
      error_callback: () => fail("needs-sign-in"),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/** Forget the token here; the next sync asks Google again. */
export function forgetToken() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function signOut() {
  const t = memory?.token ?? cached();
  forgetToken();
  if (t && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
}
