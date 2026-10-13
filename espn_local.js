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
      return { id: t.id, nombre, abrev: t.abbrev || "", dueno, owners, espnIds: ids,
        record: t.record && t.record.overall ? t.record.overall.wins + "-" + t.record.overall.losses + (t.record.overall.ties ? "-" + t.record.overall.ties : "") : "" };
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
      .map((m) => ({ p: m.matchupPeriodId, h: m.home.teamId, a: m.away.teamId }));
    // Solo jugadores que importan (para que quepa en la nube)
    const enLiga = new Set();
    equipos.forEach((e) => e.espnIds.forEach((x) => enLiga.add(String(x))));
    Object.keys(jug).forEach((k) => { if (!enLiga.has(k) && (jug[k].own || 0) < 0.5) delete jug[k]; });
    return {
      fecha: raw.fecha || new Date().toISOString(), semana, periodo: liga.status ? liga.status.currentMatchupPeriod : null,
      liga: { nombre: (liga.settings || {}).name || "", equipos, calendario }, jugadores: jug,
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
      nombre: c.liga.nombre, fecha: c.fecha, calendario: c.liga.calendario || [], periodo: c.periodo || c.semana,
      equipos: c.liga.equipos.map((eq) => Object.assign({}, eq, { jugadores: eq.espnIds.map((x) => aId[x]).filter(Boolean) })),
    };
    D.fuenteEspn = true;
    D.espnFecha = c.fecha;
    return true;
  }

  // Código del botón que se usa dentro de fantasy.espn.com
  function codigoBoton(ligaId) {
    const f = function (L) {
      (async () => {
        try {
          if (!/espn\.com$/.test(location.hostname)) { alert("Abre primero tu liga en fantasy.espn.com y luego da clic aquí."); return; }
          L = new URLSearchParams(location.search).get("leagueId") || L;
          if (!L) { alert("No encontré el número de tu liga. Abre la página de tu equipo o de tu liga en fantasy.espn.com y vuelve a dar clic aquí."); return; }
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
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(datos)], { type: "application/json" }));
          a.download = "espn_liga.json";
          document.body.appendChild(a); a.click(); a.remove();
          alert("Listo: se descargó espn_liga.json (" + (liga.teams || []).length + " equipos). Ahora cárgalo en tu página de NFL Fantasy, pestaña \"Liga y datos\".");
        } catch (e) { alert("No se pudo leer tu liga de ESPN: " + e.message + "\n¿Abriste la página de tu liga con tu sesión iniciada?"); }
      })();
    };
    return "javascript:" + encodeURIComponent("(" + f.toString() + ")(" + (ligaId ? JSON.stringify(String(ligaId)) : "null") + ");void 0");
  }

  global.EspnLocal = { leer, guardar, borrar, compactar, aplicar, codigoBoton };
  const c = leer();
  if (c && global.NFL_DATA) aplicar(global.NFL_DATA, c);
})(window);
