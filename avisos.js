// Avisos al teléfono o la computadora cuando un jugador de tu roster cambia de estado (lesión, regreso).
// La revisión la hace sw.js contra ESPN; aquí se activa y se le pasa tu roster.
(function (global) {
  "use strict";
  const LS = "nflf_avisos";
  const soportado = () => "serviceWorker" in navigator && "Notification" in global && /^https?:$/.test(location.protocol);
  const activo = () => { try { return localStorage.getItem(LS) === "1"; } catch (e) { return false; } };
  function estado() {
    if (!soportado()) return "no";
    if (Notification.permission === "denied") return "bloqueado";
    return activo() && Notification.permission === "granted" ? "activo" : "inactivo";
  }
  async function sw() {
    const reg = await navigator.serviceWorker.ready;
    return reg.active || navigator.serviceWorker.controller;
  }
  let ultimo = null;
  async function mandarRoster(temporada, jugadores, forzarActivo) {
    if (!soportado()) return;
    ultimo = { temporada, jugadores };
    const w = await sw();
    if (w) w.postMessage({ tipo: "roster", temporada, jugadores, activo: forzarActivo !== undefined ? forzarActivo : estado() === "activo" });
  }
  async function activar() {
    if (!soportado()) throw new Error("Este navegador no permite notificaciones.");
    const p = await Notification.requestPermission();
    if (p !== "granted") throw new Error("No diste permiso para las notificaciones.");
    try { localStorage.setItem(LS, "1"); } catch (e) { /* sin almacenamiento */ }
    const reg = await navigator.serviceWorker.ready;
    // Revisión cada pocas horas aunque la página esté cerrada (donde el navegador lo permita)
    try { if (reg.periodicSync) await reg.periodicSync.register("nflf-lesiones", { minInterval: 3 * 3600 * 1000 }); } catch (e) { /* no disponible */ }
    if (ultimo) await mandarRoster(ultimo.temporada, ultimo.jugadores, true);
  }
  async function desactivar() {
    try { localStorage.removeItem(LS); } catch (e) { /* sin almacenamiento */ }
    try { const reg = await navigator.serviceWorker.ready; if (reg.periodicSync) await reg.periodicSync.unregister("nflf-lesiones"); } catch (e) { /* no disponible */ }
    if (ultimo) await mandarRoster(ultimo.temporada, ultimo.jugadores, false);
  }
  async function probar() {
    const w = await sw();
    if (!w) throw new Error("Recarga la página e intenta de nuevo.");
    w.postMessage({ tipo: "prueba" });
  }
  const segundoPlano = async () => { try { const reg = await navigator.serviceWorker.ready; return !!reg.periodicSync; } catch (e) { return false; } };
  global.Avisos = { soportado, estado, activar, desactivar, probar, mandarRoster, segundoPlano };
})(window);
