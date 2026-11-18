// Copia de la app en el teléfono/computadora para que abra rápido aunque la conexión esté lenta.
// Siempre intenta traer lo más nuevo de internet; si tarda más de unos segundos, usa la copia
// guardada y la pone al día en segundo plano para la próxima vez.
// Solo guarda archivos de esta misma página (no ESPN, clima ni la cuenta).
"use strict";
const CACHE = "nflf-app-1";
const ESPERA_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// La página principal se guarda siempre con la misma clave (sin ?espn=..., ?tab=...)
const claveDe = (req) => (req.mode === "navigate" ? new URL("./", self.registration.scope).href : req.url);

async function guardar(req, res) {
  if (!res || !res.ok || res.type !== "basic") return;
  const c = await caches.open(CACHE);
  const clave = claveDe(req);
  // Borra versiones viejas del mismo archivo (app.js?v=...)
  const u = new URL(clave);
  if (u.search) for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.href !== u.href) await c.delete(k); }
  await c.put(clave, res);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Pedidos que buscan "lo último sí o sí" (botón Actualizar) van directo a internet
  if (req.cache === "no-store" || url.searchParams.has("t")) return;
  if (req.cache === "reload") {
    e.respondWith(fetch(req).then((res) => { e.waitUntil(guardar(req, res.clone())); return res; }));
    return;
  }
  e.respondWith((async () => {
    const red = fetch(req).then((res) => { e.waitUntil(guardar(req, res.clone())); return res; });
    const copia = caches.match(claveDe(req));
    const tarde = new Promise((r) => setTimeout(r, ESPERA_MS));
    try {
      // Lo de internet si llega a tiempo; si no, la copia guardada (si hay)
      const primero = await Promise.race([red, tarde.then(() => null)]);
      if (primero) return primero;
      const c = await copia;
      if (c) { e.waitUntil(red.catch(() => {})); return c; }
      return await red;
    } catch (err) {
      const c = await copia;
      if (c) return c;
      throw err;
    }
  })());
});
