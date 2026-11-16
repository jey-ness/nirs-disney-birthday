// Offline cache: serve from cache right away, refresh in the background.
const CACHE = "orlando-trip-v3";
const FONT_CACHE = "orlando-fonts-v1";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
// Relative to this worker's folder, so it works at / and at /repo-name/
const SHELL = [
  "./", "bookings/", "day/epcot/", "day/magic-kingdom/", "day/hollywood-studios/",
  "assets/styles.css", "assets/app.js", "assets/icon.svg", "config.js", "manifest.webmanifest",
  "data/trip.json", "data/trip.enc.json",
];

self.addEventListener("install", (e) => {
  // add one by one: a missing file (trip.json on the encrypted build) must not break install
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (FONT_HOSTS.includes(url.hostname)) {
    // fonts: cache-first so the type survives a dead signal
    e.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  if (url.origin !== location.origin) return; // leave Google Maps alone
  // ignore ?now= test overrides so pages match their cached copy
  const key = url.pathname;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const fresh = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
