// Registra (o rimuove) il service worker che rende apribile l'app anche senza rete.

const CACHE_PREFIX = "et-shell";

export function setupOfflineShell(enabled: boolean) {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    if (enabled) {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => console.warn("Service worker non registrato:", error));
      return;
    }
    // Uso offline disattivato: niente service worker e niente copie della pagina.
    // La pulizia avviene dopo la disinstallazione (e si ripete a ogni apertura finché resta qualcosa).
    const clearCaches = async (): Promise<void> => {
      if (!("caches" in window)) return;
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
    };
    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(clearCaches)
      .then(() => new Promise<void>((resolve) => { window.setTimeout(resolve, 3000); }))
      .then(clearCaches)
      .catch(() => undefined);
  });
}
