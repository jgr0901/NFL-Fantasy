// Conexión con ESPN desde el navegador, sin Python ni cookies:
// el botón "Bajar mi liga de ESPN" (se usa dentro de fantasy.espn.com) descarga espn_liga.json,
// y la página lo carga aquí. Lo leído se guarda en este navegador y se aplica a los datos
// antes de que el modelo haga sus cálculos.
(function (global) {
  "use strict";
  const CLAVE = "nflf_espn";
  const EQ = {1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
    9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN",
    17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
    25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"};
  const POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"};

  function datosJugador(p, semana) {
    let ps = null, pt = null;
    (p.stats || []).forEach((s) => {
      if (s.statSourceId !== 1) return;
      if (s.statSplitTypeId === 1 && s.scoringPeriodId === semana) ps = s.appliedTotal;
      else if (s.statSplitTypeId === 0) pt = s.appliedTotal;
    });
    return {
      n: p.fullName || "", pos: POS[p.defaultPositionId] || "", t: EQ[p.proTeamId] || "",
      inj: p.injuryStatus || (p.injured ? "OUT" : "ACTIVE"),
      own: Math.round(((p.ownership || {}).percentOwned || 0) * 10) / 10,
      ps: ps === null ? null : Math.round(ps * 10) / 10, pt: pt === null ? null : Math.round(pt * 10) / 10,
    };
  }

  // Configuración de la liga de ESPN (mSettings) en el formato del modelo.
  // Ids de estadísticas de ESPN: 3 yd pase, 4 TD pase, 20 INT, 24 yd carrera, 25 TD carrera, 42 yd rec, 43 TD rec,
  // 53 recepciones, 19/26/44 conversiones de 2, 68 balón suelto, 72 balón suelto perdido, 64 capturado,
  // 74/77/80/198/201 FG por distancia, 85 FG fallado, 86/88 PAT, 89–92 y 120–125 puntos permitidos,
  // 95 INT, 96 balón recuperado, 97 bloqueo, 98 safety, 99 sack, 101–104 TD de defensa, 106 balón forzado,
  // 127–136 yardas permitidas, 114/115 yd de regreso.
  const SLOTS = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "DST", 17: "K" };
  const FLEX = { 3: ["RB", "WR"], 5: ["WR", "TE"], 23: ["RB", "WR", "TE"], 7: ["QB", "RB", "WR", "TE"] };
  const FLEX_NOMBRE = { 3: "RB/WR", 5: "WR/TE", 23: "FLEX", 7: "OP" };
  function configLiga(liga) {
    const st = liga.settings || {};
    const sc = st.scoringSettings || {}, rs = st.rosterSettings || {}, sch = st.scheduleSettings || {}, aq = st.acquisitionSettings || {};
    const out = { equipos: st.size || (liga.teams || []).length || null };
    // Puestos de la alineación
    const cnt = rs.lineupSlotCounts || {};
    if (Object.keys(cnt).length) {
      const slots = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
      const flexes = [];
      Object.entries(cnt).forEach(([id, n]) => {
        n = +n; if (!n) return;
        if (SLOTS[id]) slots[SLOTS[id]] += n;
        else if (FLEX[id]) flexes.push({ nombre: FLEX_NOMBRE[id], pos: FLEX[id], n });
      });
      out.slots = slots; out.flexes = flexes; out.banca = +(cnt[20] || 0);
    }
    // Semanas: temporada regular y playoffs de fantasy
    const reg = sch.matchupPeriodCount || null;
    const periodos = {};
    Object.entries(sch.matchupPeriods || {}).forEach(([p, ws]) => (periodos[p] = ws));
    if (reg) {
      out.temporadaRegular = reg;
      const equiposPO = sch.playoffTeamCount || 4;
      const rondas = Math.ceil(Math.log2(Math.max(2, equiposPO)));
      const largo = sch.playoffMatchupPeriodLength || 1;
      const po = [];
      for (let r = 0; r < rondas; r++) {
        const p = reg + 1 + r;
        const ws = periodos[p] || null;
        if (ws) po.push(...ws);
        else for (let k = 0; k < largo; k++) po.push(reg + 1 + r * largo + k);
      }
      out.playoffs = po.filter((w) => w <= 18);
      out.lugaresPlayoff = equiposPO;
    }
    out.periodos = periodos;
    if (aq.isUsingAcquisitionBudget) out.faab = { presupuesto: aq.acquisitionBudget || 100, minimo: aq.minimumBid || 0 };
    // Puntaje
    const items = sc.scoringItems || [];
    if (items.length) {
      const v = {}, te = {};
      items.forEach((it) => {
        v[it.statId] = it.points;
        const ov = it.pointsOverrides || {};
        if (ov[6] !== undefined && it.statId === 53) te.rec = ov[6] - it.points;
      });
      const g = (id, d) => (v[id] !== undefined ? v[id] : d);
      const pts = {
        py25: g(3, 0.04) * 25, ptd: g(4, 4), int: g(20, -2), sk: g(64, 0), tp: g(19, 2),
        ry10: g(24, 0.1) * 10, rtd: g(25, 6), rey10: g(42, 0.1) * 10, rec: g(53, 0), rectd: g(43, 6),
        fum: g(68, 0), fl: g(72, -2), ret: g(114, 0), tePrem: te.rec || 0,
        fg0: g(80, 3), fg40: g(77, 3), fg50: g(198, g(74, 5)), fg60: g(201, g(198, g(74, 5))), fgMiss: g(85, -1),
        pat: g(86, 1), patMiss: g(88, 0),
        dSk: g(99, 1), dInt: g(95, 2), dFr: g(96, 2), dFf: g(106, 0), dSf: g(98, 2), dBlk: g(97, 2),
        dTd: g(103, 6),
      };
      // Puntos por puntos permitidos (de 0 a 45+)
      const pa = [[0, g(89, 5)], [6, g(90, 4)], [13, g(91, 3)], [17, g(92, 1)], [21, g(121, 0)], [27, g(122, 0)], [34, g(123, -1)], [45, g(124, -3)], [999, g(125, -5)]];
      pts.pa = pa;
      const ya = [[99, g(128, 0)], [199, g(129, 0)], [299, g(130, 0)], [349, g(131, 0)], [399, g(132, 0)], [449, g(133, 0)], [499, g(134, 0)], [549, g(135, 0)], [9999, g(136, 0)]];
      pts.ya = ya;
      out.pts = pts;
    }
    return out;
  }

  // Convierte el archivo descargado de ESPN a una versión compacta
  function compactar(raw, miNombre) {
    const liga = raw.liga || {};
    const semana = raw.semana || liga.scoringPeriodId || null;
    const jug = {};
    ((raw.jugadores || {}).players || []).forEach((e) => {
      const p = e.player || {};
      if (p.id !== undefined) jug[p.id] = datosJugador(p, semana);
    });
    const miembros = {};
    (liga.members || []).forEach((m) => (miembros[m.id] = ((m.firstName || "") + " " + (m.lastName || "")).trim() || m.displayName || ""));
    const swid = (raw.swid || "").toUpperCase();
    const equipos = (liga.teams || []).map((t) => {
      const ids = [];
      ((t.roster || {}).entries || []).forEach((en) => {
        const p = (en.playerPoolEntry || {}).player || {};
        const id = p.id !== undefined ? p.id : en.playerId;
        if (id === undefined) return;
        ids.push(id);
        if (!jug[id] && p.id !== undefined) jug[id] = datosJugador(p, semana);
      });
      const owners = (t.owners || []).map((o) => String(o).toUpperCase());
      const nombre = t.name || ((t.location || "") + " " + (t.nickname || "")).trim() || t.abbrev || "Equipo " + t.id;
      const dueno = (t.owners && miembros[t.owners[0]]) || "";
      const o = (t.record && t.record.overall) || {};
      const tc = t.transactionCounter || {};
      return { id: t.id, nombre, abrev: t.abbrev || "", dueno, owners, espnIds: ids,
        record: o.wins !== undefined ? o.wins + "-" + o.losses + (o.ties ? "-" + o.ties : "") : "",
        w: o.wins || 0, l: o.losses || 0, t: o.ties || 0, pf: o.pointsFor || t.points || 0, pa: o.pointsAgainst || 0,
        faabGastado: tc.acquisitionBudgetSpent || 0, logo: t.logo || "" };
    });
    // ¿Cuál es mi equipo? Primero por mi cuenta de ESPN (SWID), luego por nombre.
    let mio = equipos.find((e) => swid && e.owners.includes(swid));
    if (!mio && miNombre) {
      const n = miNombre.toLowerCase();
      mio = equipos.find((e) => e.nombre.toLowerCase() === n) || equipos.find((e) => e.dueno.toLowerCase().startsWith(n));
    }
    equipos.forEach((e) => { e.mio = e === mio; delete e.owners; });
    // Calendario de enfrentamientos de la liga
    const calendario = (liga.schedule || []).filter((m) => m.home && m.away)
      .map((m) => ({ p: m.matchupPeriodId, h: m.home.teamId, a: m.away.teamId, ganador: m.winner || "UNDECIDED",
        ph: Math.round((m.home.totalPoints || 0) * 10) / 10, pa: Math.round((m.away.totalPoints || 0) * 10) / 10 }));
    // Solo jugadores que importan (para que quepa en la nube)
    const enLiga = new Set();
    equipos.forEach((e) => e.espnIds.forEach((x) => enLiga.add(String(x))));
    Object.keys(jug).forEach((k) => { if (!enLiga.has(k) && (jug[k].own || 0) < 0.5) delete jug[k]; });
    return {
      fecha: raw.fecha || new Date().toISOString(), semana, periodo: liga.status ? liga.status.currentMatchupPeriod : null,
      liga: { nombre: (liga.settings || {}).name || "", equipos, calendario, cfg: configLiga(liga) }, jugadores: jug,
    };
  }

  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; } }
  function guardar(c) { localStorage.setItem(CLAVE, JSON.stringify(c)); }
  function borrar() { try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ } }

  // Aplica lo de ESPN a NFL_DATA (antes de que corra modelo.js)
  function aplicar(D, c) {
    if (!D || !c || !c.jugadores) return false;
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z]/g, "");
    const porEspn = {}, porNombre = {};
    D.jugadores.forEach((p) => { if (p.e) porEspn[p.e] = p; porNombre[norm(p.n) + "|" + p.t] = p; porNombre[norm(p.n)] = porNombre[norm(p.n)] || p; });
    const aId = {};
    Object.entries(c.jugadores).forEach(([eid, e]) => {
      const n = +eid;
      if (n < 0 || e.pos === "DST") {
        const t = EQ[-n - 16000] || e.t;
        if (t && D.defensas && D.defensas[t]) {
          D.defensas[t].espn = { own: e.own, ps: c.semana === D.semanaEspn ? e.ps : null, pt: e.pt };
          aId[eid] = "DST_" + t;
        }
        return;
      }
      const p = porEspn[n] || porNombre[norm(e.n) + "|" + e.t] || porNombre[norm(e.n)];
      if (!p) return;
      aId[eid] = p.id;
      p.espn = { inj: e.inj, own: e.own, ps: c.semana === D.semanaEspn ? e.ps : null, pt: e.pt };
      if (e.t) p.t = e.t;
    });
    D.liga = {
      nombre: c.liga.nombre, fecha: c.fecha, calendario: c.liga.calendario || [], periodo: c.periodo || c.semana, cfg: c.liga.cfg || null,
      equipos: c.liga.equipos.map((eq) => Object.assign({}, eq, { jugadores: eq.espnIds.map((x) => aId[x]).filter(Boolean) })),
    };
    D.fuenteEspn = true;
    D.espnFecha = c.fecha;
    return true;
  }

  // Código del botón que se usa dentro de fantasy.espn.com
  // Botón para la barra de favoritos. Se usa estando en fantasy.espn.com: lee la liga con la sesión
  // de ESPN del navegador y la manda directo a esta página (destino). Si no hay destino o el
  // navegador bloquea la ventana, descarga espn_liga.json para cargarlo a mano.
  function codigoBoton(ligaId, destino) {
    const f = function (L, D) {
      if (!/espn\.com$/.test(location.hostname)) { alert("Abre primero tu liga en fantasy.espn.com y luego da clic aquí."); return; }
      L = new URLSearchParams(location.search).get("leagueId") || L;
      if (!L) { alert("No encontré el número de tu liga. Abre la página de tu equipo o de tu liga en fantasy.espn.com y vuelve a dar clic aquí."); return; }
      const w = D ? window.open(D + "?espn=" + Date.now(), "_blank") : null;
      (async () => {
        try {
          const hoy = new Date(), Y = hoy.getMonth() >= 2 ? hoy.getFullYear() : hoy.getFullYear() - 1;
          const base = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/" + Y + "/segments/0/leagues/" + L;
          const o = { credentials: "include" };
          const r1 = await fetch(base + "?view=mTeam&view=mRoster&view=mSettings&view=mMatchupScore", o);
          if (!r1.ok) throw new Error("ESPN respondió " + r1.status);
          const liga = await r1.json();
          const W = liga.scoringPeriodId;
          const filtro = { players: { filterSlotIds: { value: [0, 2, 4, 6, 16, 17] }, limit: 1200, sortPercOwned: { sortPriority: 1, sortAsc: false } } };
          let jugadores = null;
          try {
            const r2 = await fetch(base + "?view=kona_player_info&scoringPeriodId=" + W, { credentials: "include", headers: { "X-Fantasy-Filter": JSON.stringify(filtro) } });
            if (r2.ok) jugadores = await r2.json();
          } catch (e) { /* sigue solo con la liga */ }
          const m = document.cookie.match(/SWID=([^;]+)/);
          const datos = { fecha: new Date().toISOString(), semana: W, swid: m ? decodeURIComponent(m[1]) : "", liga, jugadores };
          if (w && !w.closed) {
            const origen = new URL(D).origin;
            const enviar = () => { try { w.postMessage({ tipo: "nflf-espn", datos }, origen); } catch (e) { /* aún cargando */ } };
            window.addEventListener("message", (e) => { if (e.origin === origen && e.data === "nflf-listo") enviar(); });
            enviar();
            return;
          }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(datos)], { type: "application/json" }));
          a.download = "espn_liga.json";
          document.body.appendChild(a); a.click(); a.remove();
          alert("Listo: se descargó espn_liga.json (" + (liga.teams || []).length + " equipos). Ahora cárgalo en tu página de NFL Fantasy, pestaña \"Liga y datos\".");
        } catch (e) { alert("No se pudo leer tu liga de ESPN: " + e.message + "\n¿Abriste la página de tu liga con tu sesión iniciada?"); }
      })();
    };
    return "javascript:" + encodeURIComponent("(" + f.toString() + ")(" + (ligaId ? JSON.stringify(String(ligaId)) : "null") + "," + (destino ? JSON.stringify(destino) : "null") + ");void 0");
  }

  global.EspnLocal = { leer, guardar, borrar, compactar, aplicar, codigoBoton, configLiga };
  const c = leer();
  if (c && global.NFL_DATA) aplicar(global.NFL_DATA, c);
})(window);
