// Service worker: avisos de lesiones de tu roster.
// La página le pasa tu roster; aquí se revisa ESPN (al abrir la página y, en Android con la
// app instalada, también cada pocas horas en segundo plano) y se avisa si alguien cambia de estado.
"use strict";
const CLAVE = "/__nflf_avisos__";
const NOMBRES = { ACTIVE: "Activo", QUESTIONABLE: "Cuestionable", DOUBTFUL: "Dudoso", OUT: "Fuera", INJURY_RESERVE: "Lista de lesionados (IR)", SUSPENSION: "Suspendido", DAY_TO_DAY: "Día a día", PUP: "Lista PUP" };
const nombre = (e) => NOMBRES[e] || (e ? e.replace(/_/g, " ").toLowerCase() : "Activo");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function leer() {
  const c = await caches.open("nflf-avisos");
  const r = await c.match(CLAVE);
  return r ? r.json() : { activo: false, jugadores: [], estados: {} };
}
async function escribir(d) {
  const c = await caches.open("nflf-avisos");
  await c.put(CLAVE, new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
}

async function revisar() {
  const d = await leer();
  if (!d.activo || !d.jugadores.length || !d.temporada) return 0;
  const ids = d.jugadores.map((j) => j.eid).filter(Boolean);
  const filtro = { players: { filterIds: { value: ids }, limit: ids.length } };
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${d.temporada}/segments/0/leaguedefaults/3?view=kona_player_info`;
  const r = await fetch(url, { headers: { "X-Fantasy-Filter": JSON.stringify(filtro) } });
  if (!r.ok) return 0;
  const datos = await r.json();
  let avisos = 0;
  const nuevos = {};
  for (const e of datos.players || []) {
    const p = e.player || {};
    if (p.id === undefined) continue;
    const est = p.injuryStatus || (p.injured ? "OUT" : "ACTIVE");
    nuevos[p.id] = est;
    const antes = d.estados[p.id];
    if (antes !== undefined && antes !== est) {
      const j = d.jugadores.find((x) => String(x.eid) === String(p.id));
      const n = (j && j.n) || p.fullName || "Un jugador";
      const regresa = est === "ACTIVE";
      await self.registration.showNotification(regresa ? `✅ ${n} vuelve a estar activo` : `⚠️ ${n}: ${nombre(est)}`, {
        body: regresa ? `Antes: ${nombre(antes)}. Revisa tu alineación.` : `Antes: ${nombre(antes)}. Revisa tu alineación y a tu suplente.`,
        icon: "img/icono-192.png", badge: "img/favicon-32.png", tag: "nflf-" + p.id, data: { url: "./?tab=equipo" },
      });
      avisos++;
    }
  }
  d.estados = Object.assign({}, d.estados, nuevos);
  d.revisado = Date.now();
  await escribir(d);
  return avisos;
}

self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.tipo === "roster") {
    e.waitUntil(leer().then((d) => {
      d.temporada = m.temporada;
      d.jugadores = m.jugadores || [];
      // Para los jugadores nuevos se toma su estado actual como punto de partida (sin avisar)
      (m.jugadores || []).forEach((j) => { if (d.estados[j.eid] === undefined && j.inj) d.estados[j.eid] = j.inj; });
      if (m.activo !== undefined) d.activo = m.activo;
      return escribir(d);
    }).then(() => revisar()).catch(() => {}));
  } else if (m.tipo === "prueba") {
    e.waitUntil(self.registration.showNotification("🏈 Avisos activados", {
      body: "Así te avisaremos cuando un jugador de tu roster cambie de estado.", icon: "img/icono-192.png", tag: "nflf-prueba", data: { url: "./" },
    }));
  }
});

// Revisión en segundo plano (Chrome en Android con la página instalada)
self.addEventListener("periodicsync", (e) => { if (e.tag === "nflf-lesiones") e.waitUntil(revisar().catch(() => {})); });
// Avisos enviados por un servidor (si algún día se activa)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "NFL Fantasy", { body: d.cuerpo || "", icon: "img/icono-192.png", data: { url: d.url || "./" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => x.url.startsWith(self.registration.scope));
    if (w) { w.focus(); return w.navigate ? w.navigate(url) : null; }
    return self.clients.openWindow(url);
  }));
});
