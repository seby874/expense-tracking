// L'app non funziona più senza rete: qui si rimuove il service worker e le copie
// della pagina lasciati dalle versioni con "Uso offline".

const CACHE_PREFIX = "et-shell";

async function clearCaches(): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
}

export function removeOfflineShell() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.getRegistrations()
      // Solo il service worker di questa app: su github.io lo stesso indirizzo ospita anche altri siti.
      .then((registrations) => Promise.all(registrations
        .filter((registration) => registration.scope === new URL("./", window.location.href).href)
        // Quello delle notifiche (2.3) resta: non salva copie della pagina.
        .filter((registration) => !(registration.active ?? registration.waiting ?? registration.installing)?.scriptURL.endsWith("/notify-sw.js"))
        .map((registration) => registration.unregister())))
      .then(clearCaches)
      .catch((error) => console.warn("Rimozione della copia offline non riuscita:", error));
  });
}
