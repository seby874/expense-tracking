// Service worker di Expense Tracking: tiene una copia della pagina e dei file
// dell'app per aprirla anche senza rete. I dati non passano da qui: li gestisce
// la cache di Firestore. Attivo solo con "Uso offline" nelle Impostazioni.

const CACHE = "et-shell-v1";
const STATIC = ["./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

/** Scarica la pagina aggiornata, mette in cache i file a cui rimanda e toglie quelli vecchi. */
async function refreshShell() {
  const response = await fetch("./", { cache: "no-store" });
  if (!response.ok) return;
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(?:\.\/|\/)?([^"]*assets\/[^"]+)"/g)].map((match) => "./" + match[1].replace(/^.*?(assets\/)/, "$1"));
  const cache = await caches.open(CACHE);
  await cache.put("./", response);
  await Promise.all([...STATIC, ...assets].map(async (url) => {
    try {
      if (!(await cache.match(url))) await cache.add(url);
    } catch { /* un file mancante non blocca gli altri */ }
  }));
  const keep = new Set(["./", ...STATIC, ...assets].map((url) => new URL(url, self.registration.scope).href));
  for (const request of await cache.keys()) {
    if (!keep.has(request.url)) await cache.delete(request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(refreshShell().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("et-shell") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase e Google: mai dalla cache

  if (request.mode === "navigate") {
    // Pagina: prima la rete (versione aggiornata), senza rete la copia salvata.
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) event.waitUntil(refreshShell().catch(() => undefined));
        return response;
      } catch {
        return (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // File dell'app (nomi con hash, non cambiano mai): prima la cache.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && url.pathname.includes("/assets/")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  })());
});
