// Service worker delle sole notifiche (Impostazioni → Aspetto → All'apertura → Notifiche).
// Non salva copie della pagina e non intercetta richieste: l'app resta solo online.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tocco sulla notifica: torna all'app se è aperta, altrimenti la apre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.length) return windows[0].focus();
    return self.clients.openWindow("./");
  })());
});
