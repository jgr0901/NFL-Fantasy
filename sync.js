// Estado del usuario (roster, seguimientos, trades guardados, ajustes de lesiones)
// y su sincronización entre dispositivos.
// - Abierta como archivo en tu computadora: se guarda en este navegador.
// - Abierta como página publicada en claude.ai: se guarda en tu cuenta y se
//   sincroniza en vivo con tu teléfono y cualquier otro dispositivo.
(function (global) {
  "use strict";
  const K_ESTADO = "nflf_estado";
  const leerLocal = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

  const VACIO = () => ({ roster: null, seguimiento: [], trades: [], ajustes: {}, editado: 0 });
  let estado = Object.assign(VACIO(), leerLocal(K_ESTADO) || {});
  // Compatibilidad con la versión anterior (solo roster)
  if (!estado.roster) { const r = leerLocal("nflf_roster"); if (Array.isArray(r) && r.length) estado.roster = r; }
  global.NFL_AJUSTES = estado.ajustes;

  let refEstado = null, refEspn = null, timer = null, escribiendo = Promise.resolve();
  const oyentes = [];
  let modo = "local"; // local | conectando | nube | error
  const avisar = (que) => oyentes.forEach((f) => { try { f(que); } catch (e) { console.error(e); } });

  function aplicarEstado(nuevo) {
    estado = Object.assign(VACIO(), nuevo);
    global.NFL_AJUSTES = estado.ajustes;
    guardarLocal(K_ESTADO, estado);
  }

  // Guarda un cambio: al instante en este navegador, y en la nube tras una pausa corta
  function guardar() {
    estado.editado = Date.now();
    global.NFL_AJUSTES = estado.ajustes;
    guardarLocal(K_ESTADO, estado);
    if (!refEstado) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const copia = JSON.parse(JSON.stringify(estado));
      escribiendo = escribiendo.then(() => refEstado.set(copia)).then(
        () => { modo = "nube"; avisar("modo"); },
        (e) => { console.error(e); modo = "error"; avisar("modo"); });
    }, 700);
  }

  // Datos de la liga de ESPN: se guardan como texto (un solo documento)
  async function guardarEspn(compacto) {
    global.EspnLocal && global.EspnLocal.guardar(compacto);
    if (refEspn) {
      try { await refEspn.set({ fecha: compacto.fecha, json: JSON.stringify(compacto) }); }
      catch (e) { console.error(e); modo = "error"; avisar("modo"); throw e; }
    }
  }
  async function borrarEspn() {
    global.EspnLocal && global.EspnLocal.borrar();
    if (refEspn) { try { await refEspn.delete(); } catch (e) { console.error(e); } }
  }

  async function iniciar() {
    if (!global.claude || typeof global.claude.use !== "function") return;
    modo = "conectando"; avisar("modo");
    let db = null, user = null;
    try { [db, user] = await Promise.all([global.claude.use("db"), global.claude.use("user")]); } catch (e) { /* sin nube */ }
    const uid = user ? await user.id() : null;
    if (!db || !uid) { modo = "local"; avisar("modo"); return; }
    const base = "data/users/" + uid;
    refEstado = db.doc(base + "/estado");
    refEspn = db.doc(base + "/espn");
    modo = "nube"; avisar("modo");

    let primera = true;
    refEstado.onSnapshot((snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists) {
        // Primera vez en la nube: sube lo que haya en este dispositivo
        if (primera && (estado.roster || estado.seguimiento.length || estado.trades.length || Object.keys(estado.ajustes).length)) guardar();
        primera = false;
        return;
      }
      primera = false;
      const d = snap.data();
      if ((d.editado || 0) === (estado.editado || 0) && JSON.stringify(d) === JSON.stringify(estado)) return;
      if ((d.editado || 0) < (estado.editado || 0) && timer) return; // un cambio local va en camino
      aplicarEstado(JSON.parse(JSON.stringify(d)));
      avisar("estado");
    }, (e) => { console.error(e); modo = "error"; avisar("modo"); });

    let primeraEspn = true;
    refEspn.onSnapshot((snap) => {
      const local = global.EspnLocal ? global.EspnLocal.leer() : null;
      if (!snap.exists) {
        if (primeraEspn && local) guardarEspn(local).catch(() => {});
        primeraEspn = false;
        return;
      }
      primeraEspn = false;
      const d = snap.data();
      if (local && local.fecha === d.fecha) return;
      try {
        // Llegó una liga más nueva desde otro dispositivo: se aplica recargando
        global.EspnLocal.guardar(JSON.parse(d.json));
        avisar("espn");
      } catch (e) { console.error(e); }
    }, (e) => console.error(e));
  }

  global.Sync = {
    get estado() { return estado; },
    get modo() { return modo; },
    guardar, guardarEspn, borrarEspn, iniciar,
    alCambiar: (f) => oyentes.push(f),
  };
})(window);
