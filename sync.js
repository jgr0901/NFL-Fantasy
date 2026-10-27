// Estado del usuario (roster, seguimientos, trades guardados, ajustes de lesiones)
// y su sincronización entre dispositivos.
// - Abierta como archivo en tu computadora: se guarda en este navegador.
// - Abierta como página publicada en claude.ai: se guarda en tu cuenta y se
//   sincroniza en vivo con tu teléfono y cualquier otro dispositivo.
// - Abierta en la web (GitHub Pages) con sesión iniciada: se guarda en tu cuenta
//   (Supabase, tabla nfl_estado) y se sincroniza en vivo entre dispositivos.
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
  const CFG = global.NFL_CUENTAS;
  let sb = null, usuario = null, canal = null, timerSb = null;
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
    if (sb && usuario) { subirEstado(); return; }
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
    if (sb && usuario) {
      const { error } = await sb.from("nfl_estado").upsert({ user_id: usuario.id, espn: compacto });
      if (error) { console.error(error); modo = "error"; avisar("modo"); throw error; }
      return;
    }
    if (refEspn) {
      try { await refEspn.set({ fecha: compacto.fecha, json: JSON.stringify(compacto) }); }
      catch (e) { console.error(e); modo = "error"; avisar("modo"); throw e; }
    }
  }
  async function borrarEspn() {
    global.EspnLocal && global.EspnLocal.borrar();
    if (sb && usuario) { await sb.from("nfl_estado").upsert({ user_id: usuario.id, espn: null }); return; }
    if (refEspn) { try { await refEspn.delete(); } catch (e) { console.error(e); } }
  }

  async function iniciar() {
    if (!global.claude || typeof global.claude.use !== "function") { iniciarCuentas(); return; }
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

  // ---------------- Cuentas (Supabase) ----------------
  function subirEstado() {
    clearTimeout(timerSb);
    timerSb = setTimeout(async () => {
      timerSb = null;
      const copia = JSON.parse(JSON.stringify(estado));
      const { error } = await sb.from("nfl_estado").upsert({ user_id: usuario.id, estado: copia, editado: copia.editado || 0 });
      if (error) { console.error(error); modo = "error"; } else modo = "nube";
      avisar("modo");
    }, 700);
  }

  // Trae lo guardado en la cuenta y lo junta con lo de este dispositivo
  async function traerDeLaCuenta(primera) {
    const { data, error } = await sb.from("nfl_estado").select("estado, espn, editado").eq("user_id", usuario.id).maybeSingle();
    if (error) { console.error(error); modo = "error"; avisar("modo"); return; }
    const espnLocal = global.EspnLocal ? global.EspnLocal.leer() : null;
    if (!data) {
      // Cuenta nueva: sube lo que haya en este dispositivo
      const { error: e2 } = await sb.from("nfl_estado").upsert({ user_id: usuario.id, estado, editado: estado.editado || 0, espn: espnLocal });
      modo = e2 ? "error" : "nube"; avisar("modo");
      return;
    }
    modo = "nube"; avisar("modo");
    const remoto = data.editado || 0, local = estado.editado || 0;
    if (remoto !== local) {
      if (remoto > local || !primera) { aplicarEstado(Object.assign({}, data.estado, { editado: remoto })); avisar("estado"); }
      else subirEstado(); // lo de este dispositivo es más nuevo
    }
    if (data.espn && (!espnLocal || espnLocal.fecha !== data.espn.fecha)) {
      if (primera && espnLocal && data.espn.fecha < espnLocal.fecha) { await sb.from("nfl_estado").upsert({ user_id: usuario.id, espn: espnLocal }); return; }
      global.EspnLocal.guardar(data.espn);
      avisar("espn");
    } else if (!data.espn && espnLocal && primera) {
      await sb.from("nfl_estado").upsert({ user_id: usuario.id, espn: espnLocal });
    }
  }

  function conectarCuenta() {
    modo = "conectando"; avisar("modo");
    traerDeLaCuenta(true);
    if (canal) sb.removeChannel(canal);
    canal = sb.channel("nfl_estado_" + usuario.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "nfl_estado", filter: "user_id=eq." + usuario.id }, () => {
        if (timerSb) return; // un cambio de aquí va en camino
        traerDeLaCuenta(false);
      })
      .subscribe();
  }

  function iniciarCuentas() {
    if (!CFG || !global.supabase || typeof global.supabase.createClient !== "function") return;
    try { sb = global.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } }); }
    catch (e) { console.error(e); return; }
    let actual = null;
    sb.auth.onAuthStateChange((ev, sesion) => {
      const u = sesion ? sesion.user : null;
      if ((u && u.id) === (actual && actual.id)) { usuario = u; return; }
      actual = u; usuario = u;
      if (u) conectarCuenta();
      else { if (canal) { sb.removeChannel(canal); canal = null; } modo = "local"; avisar("modo"); }
      avisar("usuario");
    });
    avisar("usuario");
  }

  const ERRORES = {
    "Invalid login credentials": "Correo o contraseña incorrectos.",
    "Email not confirmed": "Primero confirma tu cuenta con el enlace que te llegó por correo.",
    "User already registered": "Ya existe una cuenta con ese correo. Usa Entrar.",
  };
  const traducir = (e) => (e && (ERRORES[e.message] || (/at least 6/.test(e.message) ? "La contraseña debe tener al menos 6 caracteres." : e.message))) || "";
  async function entrar(correo, clave) {
    const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
    if (error) throw new Error(traducir(error));
  }
  async function crearCuenta(correo, clave) {
    const { data, error } = await sb.auth.signUp({ email: correo, password: clave, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw new Error(traducir(error));
    return { confirmar: !data.session };
  }
  async function entrarConGoogle() {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (error) throw new Error(traducir(error));
  }
  async function salir() { if (sb) await sb.auth.signOut(); }

  global.Sync = {
    get estado() { return estado; },
    get modo() { return modo; },
    get usuario() { return usuario; },
    get hayCuentas() { return !!sb; },
    guardar, guardarEspn, borrarEspn, iniciar, entrar, entrarConGoogle, crearCuenta, salir,
    alCambiar: (f) => oyentes.push(f),
  };
})(window);
