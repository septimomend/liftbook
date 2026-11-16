// Sync glue for screens: start-up sync, the "Tap to sync" banner, the Settings card.
import { syncNow } from "./sync.js";
import { t, getLang } from "./i18n.js";
import { getSyncMeta, saveSyncMeta } from "./store.js";
import { GOOGLE_CLIENT_ID } from "./config.js";
import { VERSION } from "./version.js";
import { preloadAuth, signOut } from "./auth.js";
import { h, mount } from "./dom.js";

let banner = null;

function showBanner() {
  if (banner) return;
  banner = h("button", { class: "sync-banner", onClick: () => runSync(true) }, t("Tap to sync with Google Drive"));
  document.body.append(banner);
}

function hideBanner() {
  banner?.remove();
  banner = null;
}

/** interactive=true only from a tap: it may open Google's "Continue as …" sheet. */
export async function runSync(interactive, { refreshPictures = false } = {}) {
  const r = await syncNow({ interactive, refreshPictures });
  if (r.ok) {
    hideBanner();
    if (r.pulled) window.dispatchEvent(new Event("liftbook:data"));
  } else if (r.reason === "needs-sign-in" && (await getSyncMeta()).signedIn) {
    showBanner();
  }
  window.dispatchEvent(new CustomEvent("liftbook:sync", { detail: r }));
  return r;
}

/** On app open: quiet sync when signed in before; shows the banner if a tap is needed. */
export async function autoSync() {
  if (!GOOGLE_CLIENT_ID) return null;
  preloadAuth().catch(() => {});
  if (!(await getSyncMeta()).signedIn) return null;
  return runSync(false);
}

export const syncConfigured = () => Boolean(GOOGLE_CLIENT_ID);

const reasonText = r => ({
  "needs-sign-in": t("Google sign-in needed."),
  "needs-permission": t("Liftbook needs access to its Drive files — sign in again and keep the Google Drive box ticked."),
  offline: t("Offline — changes will sync later."),
  "not-configured": t("Not configured."),
}[r] ?? t("Sync failed: {reason}", { reason: r }));

export async function renderDriveCard(card) {
  if (!GOOGLE_CLIENT_ID) {
    mount(card, h("p", { class: "muted" }, t("Not configured yet. Google sync turns on once the app's Google client ID is set (see docs/google-setup.md).")));
    return;
  }
  const meta = await getSyncMeta();
  const status = h("p", { class: "muted", role: "status" },
    meta.signedIn
      ? meta.lastSyncedAt
        ? [t("Last synced {time}", { time: new Date(meta.lastSyncedAt).toLocaleString(getLang()) }),
           meta.picturesUpdated ? ` · ${t("pictures updated: {n}", { n: meta.picturesUpdated })}` : ""].join("")
        : t("Signed in, not synced yet.")
      : t("Not signed in. Your data stays on this phone until you sign in."));
  const go = refreshPictures => async () => {
    syncBtn.disabled = picsBtn.disabled = true;
    status.textContent = t("Syncing…");
    const r = await runSync(true, { refreshPictures });
    syncBtn.disabled = picsBtn.disabled = false;
    if (r.ok) renderDriveCard(card);
    else status.textContent = reasonText(r.reason);
  };
  const syncBtn = h("button", { class: "big primary", onClick: go(false) }, meta.signedIn ? t("Sync now") : t("Sign in & sync"));
  const picsBtn = h("button", { class: "link", onClick: go(true) }, t("Re-download pictures from Drive"));
  mount(card,
    status,
    syncBtn,
    meta.signedIn ? picsBtn : null,
    meta.signedIn ? h("button", { class: "link danger", onClick: async () => {
      if (!confirm(t("Sign out of Google on this phone? Your data stays here and on Drive."))) return;
      signOut();
      await saveSyncMeta({ ...meta, signedIn: false });
      hideBanner();
      renderDriveCard(card);
    } }, t("Sign out")) : null,
    h("p", { class: "muted" }, `Liftbook ${VERSION}`));
}
