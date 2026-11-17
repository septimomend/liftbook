// Offline support. Bump VERSION on every release so phones pick up the new app shell.
const VERSION = "v11.5";
const CACHE = `liftbook-${VERSION}`;
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png",
  "./js/main.js", "./js/dom.js", "./js/model.js", "./js/store.js", "./js/timer.js",
  "./js/backup.js", "./js/config.js", "./js/i18n.js", "./js/version.js", "./js/auth.js", "./js/drive.js", "./js/sync.js", "./js/sync-ui.js",
  "./js/ui/today.js", "./js/ui/workout.js", "./js/ui/rest.js", "./js/ui/editor.js",
  "./js/ui/history.js", "./js/ui/settings.js", "./js/ui/chart.js", "./js/theme.js", "./js/layout.js", "./js/features.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("liftbook-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const NETWORK_TIMEOUT_MS = 3000;

// Same-origin GETs only: network first (updates arrive when online); if the network is
// slow (weak gym signal) answer from cache after 3 s; offline -> cache.
// Google sign-in and Drive requests are never intercepted or cached.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const fromCache = () => caches.match(req, { ignoreSearch: true });
  // "no-cache": always ask the server (cheap 304 if unchanged), never a stale HTTP-cache copy
  const network = fetch(req.url, { cache: "no-cache" }).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
  e.respondWith(new Promise((resolve, reject) => {
    let done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(async () => {
      const cached = await fromCache();
      if (cached) finish(cached); // else keep waiting for the network
    }, NETWORK_TIMEOUT_MS);
    network.then(r => { clearTimeout(timer); finish(r); }, async () => {
      clearTimeout(timer);
      const cached = (await fromCache()) ?? (await caches.match("./index.html"));
      if (cached) finish(cached);
      else if (!done) { done = true; reject(new Error("offline")); }
    });
  }));
});
