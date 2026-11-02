const CACHE = "pfew-reader-v1";
const ASSETS = [
  "/offline.html",
  "/offline.js",
  "/offline.css",
  "/offline-store.js",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pfew-reader-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(url.pathname))
        .then((cached) => cached || fetch(event.request)),
    );
  } else if (
    event.request.mode === "navigate" &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/auth/")
  ) {
    // Authenticated pages and API responses are never cached.
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
  }
});
