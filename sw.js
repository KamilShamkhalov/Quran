/* Service worker тренажёра Корана.
   - кэширует оболочку приложения при установке (работает офлайн);
   - аудио аятов кэшируется по мере прослушивания (потом доступно офлайн);
   - смена версии CACHE сбрасывает старый кэш оболочки. */
const VERSION = "v2";
const SHELL_CACHE = "quran-shell-" + VERSION;
const AUDIO_CACHE = "quran-audio";

const SHELL = [
  "./",
  "./index.html",
  "./data/quran.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Аудио рецитации с CDN — кэшируем по запросу (cache-first).
  if (url.hostname.indexOf("islamic.network") !== -1) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          cache.put(req, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // Навигации (HTML) — сначала СЕТЬ (чтобы обновления подхватывались сразу),
  // офлайн → из кэша или index.html.
  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((h) => h || caches.match("./index.html")))
    );
    return;
  }

  // Прочие same-origin (quran.js, иконки, манифест) — stale-while-revalidate:
  // отдаём из кэша мгновенно и обновляем кэш в фоне.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
