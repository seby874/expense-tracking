// Service worker di disattivazione. Le versioni precedenti di Expense Tracking ne
// installavano uno per l'uso offline: quando il browser controlla gli aggiornamenti
// scarica questo file, che cancella le copie salvate e si disinstalla da solo.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("et-shell")) await caches.delete(key);
    await self.registration.unregister();
  })());
});
