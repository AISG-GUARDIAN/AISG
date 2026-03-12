const CACHE = "aisg-v1";
const ASSETS = ["/user/index.html", "/user/checkin.html", "/assets/css/common.css", "/assets/css/user.css"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
