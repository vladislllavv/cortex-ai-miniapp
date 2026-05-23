// CortexAI Service Worker — PWA + Push Notifications
const CACHE_NAME = "cortexai-v1";
const STATIC_ASSETS = ["/"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push уведомления
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: "CortexAI", body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || "CortexAI ⚡", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: data.tag || "cortexai-notification",
      renotify: true,
      data: data.url ? { url: data.url } : {},
      actions: data.actions || [],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const c = clients.find((c) => c.url.includes(self.location.origin));
      if (c) { c.focus(); c.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});

// Background sync для задач
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-tasks") {
    e.waitUntil(Promise.resolve()); // Firebase SDK сам синхронизирует
  }
});
