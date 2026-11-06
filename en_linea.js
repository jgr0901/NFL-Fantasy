// Datos que la página trae en vivo desde el navegador (todo con fuentes públicas que lo permiten):
//  - ESPN Fantasy: lesiones, proyecciones y % en ligas al momento (sin esperar la actualización diaria)
//  - ESPN: noticias de cada jugador (Rotowire) y marcadores en vivo con estadísticas por jugador
//  - Open-Meteo: pronóstico del clima a la hora de cada partido
//  - Sleeper: jugadores más agregados y soltados en las últimas 24 horas
// Si algo falla (sin internet, bloqueado), la página sigue funcionando con data.js.
(function (global) {
  "use strict";
  const ESPN_EQ = { LAR: "LA", WSH: "WAS" }; // abreviaturas de ESPN que difieren de nflverse
  const eqNFL = (a) => ESPN_EQ[a] || a;
  const EQ_ID = { 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
    9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN",
    17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
    25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };

  // ---------------- Caché en la sesión ----------------
  function deCache(k, minutos) {
    try {
      const x = JSON.parse(sessionStorage.getItem("nflf_c_" + k));
      if (x && Date.now() - x.t < minutos * 60000) return x.v;
    } catch (e) { /* sin almacenamiento */ }
    return undefined;
  }
  function aCache(k, v) { try { sessionStorage.setItem("nflf_c_" + k, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* lleno */ } }
  async function json(url, opciones, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms || 12000) : null;
    try {
      const r = await fetch(url, Object.assign({ signal: ctl ? ctl.signal : undefined }, opciones || {}));
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }

  // ---------------- ESPN Fantasy: estado y proyecciones al momento ----------------
  async function espnJugadores(temporada, semana) {
    const k = "espn_" + temporada + "_" + semana;
    const c = deCache(k, 30);
    if (c) return c;
    const filtro = { players: { filterSlotIds: { value: [0, 2, 4, 6, 16, 17] }, limit: 1100,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: ["00" + temporada, "10" + temporada, "11" + temporada + semana] } } };
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${temporada}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=${semana}`;
    const d = await json(url, { headers: { "X-Fantasy-Filter": JSON.stringify(filtro) } }, 20000);
    const out = {};
    (d.players || []).forEach((e) => {
      const p = e.player || {};
      if (p.id === undefined) return;
      let ps = null, pt = null;
      (p.stats || []).forEach((s) => {
        if (s.statSourceId !== 1) return;
        if (s.statSplitTypeId === 1 && s.scoringPeriodId === semana) ps = s.appliedTotal;
        else if (s.statSplitTypeId === 0) pt = s.appliedTotal;
      });
      const ol = ((p.outlooks || {}).outlooksByWeek || {})[String(semana)] || "";
      out[p.id] = {
        inj: p.injuryStatus || (p.injured ? "OUT" : "ACTIVE"),
        own: Math.round(((p.ownership || {}).percentOwned || 0) * 10) / 10,
        ps: ps === null ? null : Math.round(ps * 10) / 10, pt: pt === null ? null : Math.round(pt * 10) / 10,
        ol: ol.slice(0, 700), nd: p.lastNewsDate || null, t: EQ_ID[p.proTeamId] || "",
      };
    });
    aCache(k, out);
    return out;
  }

  // ---------------- Noticias de un jugador (Rotowire vía ESPN) ----------------
  async function noticia(eid) {
    if (!eid) return null;
    const k = "nota_" + eid;
    const c = deCache(k, 60);
    if (c !== undefined) return c;
    const d = await json(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${eid}/overview`);
    const r = d.rotowire || null;
    const f = d.fantasy || {};
    const out = r ? {
      titular: r.headline || r.description || "", historia: r.story || "",
      fecha: r.published ? Date.parse(r.published.replace(/ (PDT|PST|EDT|EST|CDT|CST)/, (m, z) => " " + ({ PDT: "-0700", PST: "-0800", EDT: "-0400", EST: "-0500", CDT: "-0500", CST: "-0600" })[z])) || null : null,
      temporada: f.projection || "", cambio7: f.last7Days !== undefined ? +f.last7Days : null,
    } : (f.projection ? { titular: "", historia: "", fecha: null, temporada: f.projection, cambio7: f.last7Days !== undefined ? +f.last7Days : null } : null);
    aCache(k, out);
    return out;
  }
  // Varias noticias, de pocas en pocas para no saturar
  async function noticias(eids, maxParalelo) {
    const res = {};
    const lista = eids.slice();
    const trabajar = async () => {
      while (lista.length) {
        const id = lista.shift();
        try { res[id] = await noticia(id); } catch (e) { res[id] = null; }
      }
    };
    await Promise.all(Array.from({ length: maxParalelo || 4 }, trabajar));
    return res;
  }

  // ---------------- Clima (Open-Meteo) ----------------
  const ESTADIO = { // lat, lon por equipo local
    ARI: [33.528, -112.263], ATL: [33.755, -84.401], BAL: [39.278, -76.623], BUF: [42.774, -78.787],
    CAR: [35.226, -80.853], CHI: [41.862, -87.617], CIN: [39.095, -84.516], CLE: [41.506, -81.700],
    DAL: [32.748, -97.093], DEN: [39.744, -105.020], DET: [42.340, -83.046], GB: [44.501, -88.062],
    HOU: [29.685, -95.411], IND: [39.760, -86.164], JAX: [30.324, -81.637], KC: [39.049, -94.484],
    LA: [33.953, -118.339], LAC: [33.953, -118.339], LV: [36.091, -115.184], MIA: [25.958, -80.239],
    MIN: [44.974, -93.258], NE: [42.091, -71.264], NO: [29.951, -90.081], NYG: [40.814, -74.074],
    NYJ: [40.814, -74.074], PHI: [39.901, -75.168], PIT: [40.447, -80.016], SEA: [47.595, -122.332],
    SF: [37.403, -121.970], TB: [27.976, -82.503], TEN: [36.166, -86.771], WAS: [38.908, -76.864],
  };
  const SEDES = [ // partidos fuera de EE. UU. u otras sedes
    [/tottenham/i, [51.604, -0.066]], [/wembley/i, [51.556, -0.280]], [/bernab/i, [40.453, -3.688]],
    [/maracan/i, [-22.912, -43.230]], [/corinthians|sao paulo|são paulo/i, [-23.545, -46.474]],
    [/bayern|allianz|munich/i, [48.219, 11.625]], [/berlin|olympiastadion/i, [52.515, 13.239]],
    [/frankfurt|deutsche bank/i, [50.069, 8.645]], [/melbourne/i, [-37.820, 144.983]],
    [/azteca|banorte/i, [19.303, -99.150]], [/stade de france/i, [48.924, 2.360]], [/croke|dublin/i, [53.361, -6.251]],
  ];
  function coordenadas(g) {
    if (g.estadio) for (const [re, c] of SEDES) if (re.test(g.estadio)) return c;
    return ESTADIO[g.home] || null;
  }
  // Hora del partido en UTC (las horas de los datos vienen en hora del Este)
  function inicioUTC(g) {
    if (!g.hora) return null;
    const y = +g.fecha.slice(0, 4), nov1 = new Date(Date.UTC(y, 10, 1)), mar1 = new Date(Date.UTC(y, 2, 1));
    const finDST = Date.UTC(y, 10, 1 + ((7 - nov1.getUTCDay()) % 7), 6), iniDST = Date.UTC(y, 2, 8 + ((7 - mar1.getUTCDay()) % 7), 7);
    const base = Date.parse(g.fecha + "T" + g.hora + ":00Z");
    const off = base >= iniDST && base < finDST ? 4 : 5;
    return new Date(base + off * 3600000);
  }
  async function clima(juegos) {
    const out = {};
    const ahora = Date.now();
    await Promise.all(juegos.map(async (g) => {
      if (g.techo === "dome" || g.techo === "closed" || g.jugado) return;
      const c = coordenadas(g), ini = inicioUTC(g);
      if (!c || !ini || ini.getTime() - ahora > 15 * 86400000 || ini.getTime() < ahora - 5 * 3600000) return;
      const k = "clima_" + g.id;
      let v = deCache(k, 90);
      if (v === undefined) {
        try {
          const dia = ini.toISOString().slice(0, 10);
          const d = await json(`https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m,wind_gusts_10m&timezone=UTC&start_date=${dia}&end_date=${dia}`);
          const h = d.hourly || {}, hora = ini.getUTCHours();
          const tomar = (arr) => { const xs = (arr || []).slice(hora, hora + 3).filter((x) => x !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
          v = { viento: tomar(h.wind_speed_10m), rachas: tomar(h.wind_gusts_10m), lluvia: tomar(h.precipitation), nieve: tomar(h.snowfall), temp: tomar(h.temperature_2m) };
        } catch (e) { v = null; }
        aCache(k, v);
      }
      if (v) out[g.id] = v;
    }));
    return out;
  }

  // ---------------- Sleeper: tendencias de agregados y soltados ----------------
  async function tendencias() {
    const c = deCache("sleeper", 60);
    if (c) return c;
    const [alta, baja] = await Promise.all([
      json("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=60"),
      json("https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=24&limit=60"),
    ]);
    const out = { alta: {}, baja: {} };
    (alta || []).forEach((x) => (out.alta[x.player_id] = x.count));
    (baja || []).forEach((x) => (out.baja[x.player_id] = x.count));
    aCache("sleeper", out);
    return out;
  }

  // ---------------- Marcadores en vivo (ESPN) ----------------
  function partirStats(grupo) {
    const keys = grupo.keys || [];
    return (grupo.athletes || []).map((a) => {
      const o = {};
      keys.forEach((k, i) => (o[k] = (a.stats || [])[i]));
      return { id: +a.athlete.id, nombre: a.athlete.displayName, s: o };
    });
  }
  const n = (x) => { const v = parseFloat(String(x || "0").replace(",", "")); return isNaN(v) ? 0 : v; };
  function restante(st) {
    const t = (st && st.type) || {};
    if (t.state === "pre") return 1;
    if (t.state === "post" || t.completed) return 0;
    const p = st.period || 1, reloj = st.clock || 0;
    if (p > 4) return 0.02;
    return Math.max(0.02, ((4 - p) * 900 + reloj) / 3600);
  }
  async function marcadores(temporada, semana) {
    // Sin semana, ESPN regresa la semana en curso
    const q = semana ? `?week=${semana}&seasontype=2&dates=${temporada}` : "";
    const sb = await json(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard${q}`);
    const juegos = (sb.events || []).map((e) => {
      const comp = e.competitions[0];
      const eqs = {};
      comp.competitors.forEach((c) => (eqs[c.homeAway] = { t: eqNFL(c.team.abbreviation), pts: +c.score || 0 }));
      return { id: e.id, fecha: e.date, estado: comp.status.type.state, detalle: comp.status.type.shortDetail,
        restante: restante(comp.status), home: eqs.home, away: eqs.away };
    });
    juegos.semana = (sb.week && sb.week.number) || semana || null;
    return juegos;
  }
  // Estadísticas por jugador de un partido ya empezado
  async function boxscore(evento) {
    const d = await json(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${evento}`);
    const jug = {}; // eid -> stats con las claves del modelo
    const get = (id) => (jug[id] = jug[id] || { att: 0, cmp: 0, pyd: 0, ptd: 0, int: 0, car: 0, ryd: 0, rtd: 0, tgt: 0, rec: 0, recyd: 0, rectd: 0, fl: 0, tp: 0, ts: 0, ay: 0, sk: 0, fum: 0, ret: 0, k: null });
    const porNombre = {};
    const equipos = {};
    ((d.boxscore || {}).players || []).forEach((bloque) => {
      const t = eqNFL(bloque.team.abbreviation);
      (bloque.statistics || []).forEach((g) => {
        partirStats(g).forEach(({ id, nombre, s }) => {
          porNombre[nombre] = id;
          const x = get(id);
          x.t = t;
          if (g.name === "passing") {
            const [c, a] = String(s["completions/passingAttempts"] || "0/0").split("/");
            x.cmp = n(c); x.att = n(a); x.pyd = n(s.passingYards); x.ptd = n(s.passingTouchdowns); x.int = n(s.interceptions);
            x.sk = n(String(s["sacks-sackYardsLost"] || "0").split("-")[0]);
          } else if (g.name === "rushing") { x.car = n(s.rushingAttempts); x.ryd = n(s.rushingYards); x.rtd = n(s.rushingTouchdowns); }
          else if (g.name === "receiving") { x.rec = n(s.receptions); x.recyd = n(s.receivingYards); x.rectd = n(s.receivingTouchdowns); x.tgt = n(s.receivingTargets); }
          else if (g.name === "fumbles") { x.fum = n(s.fumbles); x.fl = n(s.fumblesLost); }
          else if (g.name === "kickReturns") x.ret += n(s.kickReturnYards);
          else if (g.name === "puntReturns") x.ret += n(s.puntReturnYards);
          else if (g.name === "kicking") {
            const [fm, fa] = String(s["fieldGoalsMade/fieldGoalAttempts"] || "0/0").split("/");
            const [xm, xa] = String(s["extraPointsMade/extraPointAttempts"] || "0/0").split("/");
            x.k = { fg: [], fgFallados: Math.max(0, n(fa) - n(fm)), pat: n(xm), patFallados: Math.max(0, n(xa) - n(xm)), fgHechos: n(fm) };
          }
        });
      });
    });
    ((d.boxscore || {}).teams || []).forEach((bt) => {
      const t = eqNFL(bt.team.abbreviation);
      const st = {};
      (bt.statistics || []).forEach((x) => (st[x.name] = x.displayValue));
      equipos[t] = { yardas: n(st.totalYards), perdidasInt: n(st.interceptions), perdidasFum: n(st.fumblesLost), capturas: n(String(st.sacksYardsLost || "0").split("-")[0]), tdDef: 0, safeties: 0 };
    });
    // Distancia de cada gol de campo y TDs de defensa/equipos especiales desde las jugadas de anotación
    (d.scoringPlays || []).forEach((p) => {
      const t = eqNFL(p.team.abbreviation), txt = p.text || "", tipo = (p.type && p.type.text) || "";
      const fg = txt.match(/^(.+?) (\d+) Yd Field Goal/);
      if (fg && porNombre[fg[1]] && jug[porNombre[fg[1]]].k) jug[porNombre[fg[1]]].k.fg.push(+fg[2]);
      if (/Return|Blocked|Recovery|Defensive/i.test(tipo) && /Touchdown/i.test(tipo) && equipos[t]) equipos[t].tdDef++;
      if (/Safety/i.test(tipo) && equipos[t]) equipos[t].safeties++;
    });
    // Si falta la distancia de algún gol de campo, se usa 40 yardas
    Object.values(jug).forEach((x) => { if (x.k) while (x.k.fg.length < x.k.fgHechos) x.k.fg.push(40); });
    return { jugadores: jug, equipos };
  }
  async function enVivo(temporada, semana) {
    const juegos = await marcadores(temporada, semana);
    const empezados = juegos.filter((g) => g.estado !== "pre");
    const k = "box_" + temporada + "_" + (juegos.semana || "actual");
    const prev = deCache(k, 600) || {};
    const datos = {};
    await Promise.all(empezados.map(async (g) => {
      // Los partidos terminados no cambian: se guardan
      if (g.estado === "post" && prev[g.id]) { datos[g.id] = prev[g.id]; return; }
      try { datos[g.id] = await boxscore(g.id); } catch (e) { if (prev[g.id]) datos[g.id] = prev[g.id]; }
    }));
    aCache(k, Object.assign({}, prev, datos));
    const porEid = {}, porEquipo = {};
    juegos.forEach((g) => { porEquipo[g.home.t] = { g, rival: g.away.t, esLocal: true }; porEquipo[g.away.t] = { g, rival: g.home.t, esLocal: false }; });
    Object.values(datos).forEach((b) => Object.entries(b.jugadores).forEach(([id, s]) => (porEid[id] = s)));
    const equipos = {};
    Object.values(datos).forEach((b) => Object.assign(equipos, b.equipos));
    return { juegos, semana: juegos.semana, porEid, porEquipo, equipos, hora: Date.now() };
  }

  global.EnLinea = { espnJugadores, noticia, noticias, clima, tendencias, enVivo, inicioUTC, eqNFL };
})(window);
