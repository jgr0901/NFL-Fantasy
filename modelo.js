// Modelo de predicción: equipos, partidos, jugadores, pateadores, defensas y trades.
// Todo se calcula en el navegador a partir de window.NFL_DATA (data.js).
(function (global) {
  "use strict";

  const D = global.NFL_DATA;
  const IDX = {};
  D.stats.forEach((k, i) => (IDX[k] = i));
  const S = (row, k) => row[IDX[k] + 2]; // fila semanal: [semana, rival, ...stats]

  const EQUIPOS = {
    ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
    CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
    DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
    HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
    LA: "Los Angeles Rams", LAC: "Los Angeles Chargers", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
    MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
    NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
    SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
  };
  const MASCOTA = (t) => EQUIPOS[t].split(" ").slice(-1)[0];

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  function phi(z) { // normal acumulada
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // ---------------- Configuración de la liga ----------------
  // Por defecto la liga "borregos fantasy" (ESPN, PPR, 10 equipos). Si conectas tu liga de ESPN,
  // se reemplaza con su configuración real (puntaje, puestos, equipos y semanas de playoffs).
  const cfg = {
    equipos: 10,
    slots: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
    flexes: [{ nombre: "RB/WR", pos: ["RB", "WR"], n: 1 }],
    banca: 7,
    playoffs: [15, 16, 17],
    temporadaRegular: 14,
    faab: null,
    deLiga: false,
    pts: {
      py25: 1, ptd: 4, int: -2, sk: -0.5, tp: 2, ry10: 1, rtd: 6, rey10: 1, rec: 1, rectd: 6,
      fum: 1, fl: -2, ret: 0.01, tePrem: 0,
      fg0: 3, fg40: 4, fg50: 5, fg60: 5, fgMiss: 1, pat: 1, patMiss: 1,
      dSk: 1, dInt: 2, dFr: 2, dFf: 1, dSf: 2, dBlk: 2, dTd: 6, ya100: 5,
      pa: [[0, 10], [6, 7], [13, 4], [17, 1], [21, 1], [27, 1], [34, -1], [45, -3], [999, -5]],
      ya: [[99, 5]], // yardas permitidas: [hasta, puntos]
    },
  };
  if (D.liga && D.liga.cfg) aplicarCfgLiga(D.liga.cfg);
  function aplicarCfgLiga(c) {
    if (c.equipos) cfg.equipos = c.equipos;
    if (c.slots && (c.slots.QB || c.slots.RB)) { cfg.slots = c.slots; cfg.flexes = c.flexes || []; }
    if (c.banca !== undefined) cfg.banca = c.banca;
    if (c.playoffs && c.playoffs.length) cfg.playoffs = c.playoffs;
    if (c.temporadaRegular) cfg.temporadaRegular = c.temporadaRegular;
    cfg.faab = c.faab || null;
    if (c.pts) Object.assign(cfg.pts, c.pts);
    cfg.deLiga = true;
  }
  cfg.flex = Array.from(new Set(cfg.flexes.flatMap((f) => f.pos))); // compatibilidad

  // ---------------- Partidos ----------------
  const partidos = D.partidos.map((g) => ({
    id: g[0], w: g[1], fecha: g[2], hora: g[3], away: g[4], home: g[5],
    as: g[6], hs: g[7], spread: g[8], total: g[9], techo: g[10],
    jugado: g[7] !== null && g[6] !== null,
  }));
  const partidoDe = {}; // `${equipo}|${semana}` -> partido
  partidos.forEach((g) => { partidoDe[g.home + "|" + g.w] = g; partidoDe[g.away + "|" + g.w] = g; });
  const TEAMS = Object.keys(EQUIPOS).filter((t) => partidos.some((g) => g.home === t || g.away === t));
  const SEMANAS = Math.max(...partidos.map((g) => g.w));
  const semanaProy = D.semanaEspn || (() => {
    for (let w = 1; w <= SEMANAS; w++) {
      const gs = partidos.filter((g) => g.w === w);
      if (gs.filter((g) => !g.jugado).length > gs.length / 2) return w;
    }
    return SEMANAS;
  })();
  const byes = {};
  TEAMS.forEach((t) => { for (let w = 1; w <= SEMANAS; w++) if (!partidoDe[t + "|" + w]) byes[t] = w; });

  // ---------------- Estadísticas por equipo y partido ----------------
  const tg = {}; // equipo -> semana -> totales
  TEAMS.forEach((t) => (tg[t] = {}));
  partidos.filter((g) => g.jugado).forEach((g) => {
    const z = { py: 0, ry: 0, ptd: 0, rtd: 0, pya: 0, rya: 0, ptda: 0, rtda: 0 };
    tg[g.home][g.w] = Object.assign({ pf: g.hs, pa: g.as, opp: g.away, home: true }, z);
    tg[g.away][g.w] = Object.assign({ pf: g.as, pa: g.hs, opp: g.home, home: false }, Object.assign({}, z));
  });
  function equipoEnSemana(row) { // el rival de su rival en ese partido
    const g = partidoDe[row[1] + "|" + row[0]];
    if (!g) return null;
    return g.home === row[1] ? g.away : g.home;
  }
  D.jugadores.forEach((p) => p.p !== "K" && p.w.forEach((r) => {
    const t = equipoEnSemana(r);
    if (!t || !tg[t] || !tg[t][r[0]]) return;
    const a = tg[t][r[0]], b = tg[r[1]] && tg[r[1]][r[0]];
    a.py += S(r, "pyd"); a.ry += S(r, "ryd"); a.ptd += S(r, "ptd"); a.rtd += S(r, "rtd");
    if (b) { b.pya += S(r, "pyd"); b.rya += S(r, "ryd"); b.ptda += S(r, "ptd"); b.rtda += S(r, "rtd"); }
  }));

  const filasEquipo = [];
  TEAMS.forEach((t) => Object.values(tg[t]).forEach((x) => filasEquipo.push(x)));
  const LG = {};
  ["pf", "py", "ry", "ptd", "rtd"].forEach((k) => (LG[k] = mean(filasEquipo.map((x) => x[k]))));
  const EP = D.equiposPrev || {};
  const LGP = {};
  ["pf", "py", "ry", "ptd", "rtd"].forEach((k) => (LGP[k] = mean(Object.values(EP).map((x) => x[k] || 0))));
  // Semana 1 (sin partidos jugados): se usan los promedios de la temporada previa
  ["pf", "py", "ry", "ptd", "rtd"].forEach((k) => { if (!LG[k]) LG[k] = LGP[k] || { pf: 22, py: 210, ry: 115, ptd: 1.4, rtd: 0.9 }[k]; });

  // Ratings ajustados por rival (estilo SRS), con la temporada previa como punto de partida.
  function ajustar(kFor, kAg, hfa, priorG) {
    const o = {}, d = {}, oP = {}, dP = {};
    const esc = LG[kFor] / (LGP[kFor] || LG[kFor] || 1);
    TEAMS.forEach((t) => {
      const e = EP[t];
      oP[t] = e ? 0.5 * ((e[kFor] || 0) - LGP[kFor]) * esc : 0;
      dP[t] = e ? 0.5 * (LGP[kFor] - (e[kAg] || 0)) * esc : 0;
      o[t] = oP[t]; d[t] = dP[t];
    });
    for (let it = 0; it < 25; it++) {
      TEAMS.forEach((t) => {
        let so = priorG * oP[t], sd = priorG * dP[t], n = priorG;
        Object.values(tg[t]).forEach((x) => {
          const h = x.home ? hfa : -hfa;
          so += x[kFor] - LG[kFor] + d[x.opp] - h;
          sd += LG[kFor] + o[x.opp] - h - x[kAg];
          n += 1;
        });
        o[t] = so / n; d[t] = sd / n;
      });
    }
    return { o, d };
  }
  const R = {
    pts: ajustar("pf", "pa", 0.9, 4),
    py: ajustar("py", "pya", 4, 4),
    ry: ajustar("ry", "rya", 3, 4),
    ptd: ajustar("ptd", "ptda", 0, 5),
    rtd: ajustar("rtd", "rtda", 0, 5),
  };

  const cachePred = {};
  function predecirPartido(g) {
    if (cachePred[g.id]) return cachePred[g.id];
    const lado = (t, op, h) => ({
      pts: LG.pf + R.pts.o[t] - R.pts.d[op] + 0.9 * h,
      py: LG.py + R.py.o[t] - R.py.d[op] + 4 * h,
      ry: LG.ry + R.ry.o[t] - R.ry.d[op] + 3 * h,
      ptd: LG.ptd + R.ptd.o[t] - R.ptd.d[op],
      rtd: LG.rtd + R.rtd.o[t] - R.rtd.d[op],
    });
    const H = lado(g.home, g.away, 1), A = lado(g.away, g.home, -1);
    const modelo = { home: H.pts, away: A.pts };
    const vegas = g.spread !== null && g.total !== null;
    if (vegas) { // mezcla con la línea de las casas de apuestas
      H.pts = 0.6 * (g.total / 2 + g.spread / 2) + 0.4 * H.pts;
      A.pts = 0.6 * (g.total / 2 - g.spread / 2) + 0.4 * A.pts;
    }
    [H, A].forEach((x) => {
      x.pts = Math.max(6, x.pts);
      x.py = Math.max(90, x.py); x.ry = Math.max(40, x.ry);
      const td = (x.pts * (LG.ptd + LG.rtd)) / LG.pf;
      const r = Math.max(0.05, x.ptd) / (Math.max(0.05, x.ptd) + Math.max(0.05, x.rtd));
      x.ptd = td * r; x.rtd = td * (1 - r);
    });
    const pHome = phi((H.pts - A.pts) / 13);
    return (cachePred[g.id] = { home: H, away: A, pHome, modelo, vegas });
  }
  const base = {};
  TEAMS.forEach((t) => (base[t] = { pts: LG.pf + R.pts.o[t], py: LG.py + R.py.o[t], ry: LG.ry + R.ry.o[t] }));
  // Clima por partido (lo llena la página con el pronóstico): { viento (km/h), lluvia (mm), temp (°C) }
  const CLIMA = {};
  function efectoClima(g) {
    const c = CLIMA[g.id];
    if (!c || g.techo === "dome" || g.techo === "closed") return { pase: 1, k: 1, nota: "" };
    const mph = c.viento / 1.609;
    let pase = 1, k = 1;
    const notas = [];
    if (mph > 15) { pase -= Math.min(0.15, 0.012 * (mph - 15)); k -= Math.min(0.25, 0.02 * (mph - 15)); notas.push(`viento ${Math.round(mph)} mph`); }
    if (c.lluvia >= 1) { pase -= Math.min(0.06, 0.02 * c.lluvia); k -= 0.04; notas.push("lluvia"); }
    if (c.nieve >= 0.5) { pase -= 0.05; k -= 0.08; notas.push("nieve"); }
    if (c.temp <= -7) { pase -= 0.03; k -= 0.05; notas.push(`${Math.round(c.temp)}°C`); }
    return { pase, k, nota: notas.join(", ") };
  }
  function ambiente(t, g) {
    const pr = predecirPartido(g), x = g.home === t ? pr.home : pr.away;
    const cl = efectoClima(g);
    return {
      pase: clamp(Math.pow(x.py / base[t].py, 0.8), 0.7, 1.35) * cl.pase,
      carrera: clamp(Math.pow(x.ry / base[t].ry, 0.8), 0.7, 1.35) * (cl.pase < 1 ? 1 + (1 - cl.pase) * 0.4 : 1),
      td: clamp(x.pts / base[t].pts, 0.6, 1.5),
      k: cl.k, clima: cl.nota,
      ptsRival: g.home === t ? pr.away.pts : pr.home.pts,
    };
  }

  // ---------------- Puntos de fantasy (puntaje de tu liga en ESPN) ----------------
  // real=true: ESPN cuenta yardas en bloques completos (25 de pase, 10 de carrera/recepción).
  function bloques(yd, u, real) {
    if (real) return Math.trunc(yd / u);
    return yd / u - 0.45 * clamp(yd / (2 * u), 0, 1); // valor esperado del redondeo hacia abajo
  }
  function puntos(s, pos, real) {
    const P = cfg.pts;
    return bloques(s.pyd, 25, real) * P.py25 + s.ptd * P.ptd + s.int * P.int + s.sk * P.sk +
      bloques(s.ryd, 10, real) * P.ry10 + s.rtd * P.rtd +
      bloques(s.recyd, 10, real) * P.rey10 + s.rec * (P.rec + (pos === "TE" ? P.tePrem : 0)) + s.rectd * P.rectd +
      s.fum * P.fum + s.fl * P.fl + s.tp * P.tp + s.ret * P.ret;
  }
  function puntosFG(d) { const P = cfg.pts; return d >= 60 ? P.fg60 : d >= 50 ? P.fg50 : d >= 40 ? P.fg40 : P.fg0; }
  function puntosK(r) { // r = [hechos[], fallados[], pat, patFallado]
    const P = cfg.pts;
    return sum(r[0].map(puntosFG)) + r[1].length * P.fgMiss + r[2] * P.pat + r[3] * P.patMiss;
  }
  function puntosPA(pa) { for (const [lim, v] of cfg.pts.pa) if (pa <= lim) return v; return 0; }
  function puntosDST(f) { // f = [w, rival, sk, int, fr, ff, td, sf, blk, pa, ya, ...]
    const P = cfg.pts;
    return f[2] * P.dSk + f[3] * P.dInt + f[4] * P.dFr + f[5] * P.dFf + f[6] * P.dTd + f[7] * P.dSf +
      f[8] * P.dBlk + puntosPA(f[9]) + puntosYA(f[10]);
  }
  function puntosYA(ya) { for (const [lim, v] of cfg.pts.ya || []) if (ya <= lim) return v; return 0; }
  const filaObj = (r) => { const o = {}; D.stats.forEach((k) => (o[k] = S(r, k) || 0)); return o; };
  const arrObj = (a) => { const o = {}; D.stats.forEach((k, i) => (o[k] = a[i] || 0)); return o; };

  // Tasas de TD por yarda de la liga (para regresión de TDs)
  const tot = { pyd: 0, ptd: 0, ryd: 0, rtd: 0, recyd: 0, rectd: 0 };
  D.jugadores.forEach((p) => p.p !== "K" && p.w.forEach((r) => Object.keys(tot).forEach((k) => (tot[k] += S(r, k)))));
  const TASA = { ptd: tot.ptd / tot.pyd, rtd: tot.rtd / tot.ryd, rectd: tot.rectd / tot.recyd };
  if (!(tot.pyd > 2000)) Object.assign(TASA, { ptd: 0.0063, rtd: 0.0085, rectd: 0.0066 }); // semana 1: promedios históricos
  // Uso (u = [semana, % de snaps, acarreos en zona roja, targets en zona roja, acarreos dentro de la 5])
  const totRZ = { car: 0, tgt: 0, rtd: 0, rectd: 0 };
  D.jugadores.forEach((p) => {
    if (!p.u || p.p === "K") return;
    const ws = new Set(p.u.map((u) => u[0]));
    p.u.forEach((u) => { totRZ.car += u[2]; totRZ.tgt += u[3]; });
    p.w.forEach((r) => { if (ws.has(r[0])) { totRZ.rtd += S(r, "rtd"); totRZ.rectd += S(r, "rectd"); } });
  });
  const TASA_RZ = { car: totRZ.car ? totRZ.rtd / totRZ.car : 0, tgt: totRZ.tgt ? totRZ.rectd / totRZ.tgt : 0 };
  function resumenUso(p) {
    const u = (p.u || []).filter((x) => p.w.some((r) => r[0] === x[0]));
    if (!u.length) return null;
    const pesos = u.map((x) => pesoSemana(x[0])), G = sum(pesos);
    const prom = (i) => sum(u.map((x, k) => x[i] * pesos[k])) / G;
    const ult = u.slice(-2);
    const snapUlt = mean(ult.map((x) => x[1]));
    return {
      filas: u, snap: prom(1), rzCar: prom(2), rzTgt: prom(3), gl: prom(4),
      snapUlt, tendencia: snapUlt - mean(u.slice(0, -2).map((x) => x[1]).concat(u.length <= 2 ? [snapUlt] : [])),
    };
  }

  // ---------------- Defensas (D/ST) ----------------
  const DEF = D.defensas || {};
  const filasDef = [];
  Object.values(DEF).forEach((d) => d.w.forEach((f) => filasDef.push(f)));
  const LGD = {}; // promedios de la liga por partido
  [["sk", 2], ["int", 3], ["fr", 4], ["ff", 5], ["td", 6], ["sf", 7], ["blk", 8], ["skA", 11], ["to", 12]]
    .forEach(([k, i]) => (LGD[k] = mean(filasDef.map((f) => f[i]))));
  function tasaDef(t, i, k, priorI, priorG) { // tasa por partido con prior de la temporada previa
    const filas = (DEF[t] && DEF[t].w) || [];
    const prev = EP[t] && EP[t].dst ? EP[t].dst[priorI] : LGD[k];
    const prior = 0.5 * prev + 0.5 * LGD[k];
    return (sum(filas.map((f) => f[i])) + priorG * prior) / (filas.length + priorG);
  }
  const rateDef = {};
  TEAMS.forEach((t) => (rateDef[t] = {
    sk: tasaDef(t, 2, "sk", 0, 4), int: tasaDef(t, 3, "int", 1, 6), fr: tasaDef(t, 4, "fr", 2, 6),
    ff: tasaDef(t, 5, "ff", 3, 6), td: tasaDef(t, 6, "td", 4, 10), sf: tasaDef(t, 7, "sf", 5, 10),
    blk: tasaDef(t, 8, "blk", 6, 10), skA: tasaDef(t, 11, "skA", 7, 4), to: tasaDef(t, 12, "to", 8, 6),
  }));
  function proyectarDST(t, g) {
    const op = g.home === t ? g.away : g.home;
    const a = rateDef[t], b = rateDef[op];
    const sk = a.sk * (b.skA / LGD.skA);
    const toF = b.to / LGD.to; // el rival pierde más/menos el balón que el promedio
    const int = a.int * toF, fr = a.fr * toF;
    const paMedia = ambiente(t, g).ptsRival;
    let ePA = 0, wsum = 0; // valor esperado de los puntos por puntos permitidos
    for (let x = 0; x <= 70; x++) {
      const w = Math.exp(-((x - paMedia) ** 2) / (2 * 9.5 * 9.5));
      ePA += w * puntosPA(x); wsum += w;
    }
    const P = cfg.pts;
    const pr = predecirPartido(g), riv = g.home === t ? pr.away : pr.home;
    const yaMedia = riv.py + riv.ry;
    let eYA = 0, ysum = 0;
    for (let y = 100; y <= 600; y += 10) {
      const w = Math.exp(-((y - yaMedia) ** 2) / (2 * 65 * 65));
      eYA += w * puntosYA(y); ysum += w;
    }
    const pts = sk * P.dSk + int * P.dInt + fr * P.dFr + a.ff * P.dFf + a.td * P.dTd + a.sf * P.dSf + a.blk * P.dBlk + ePA / wsum + eYA / ysum;
    return { pts, s: { sk, int, fr, pa: paMedia, ya: yaMedia } };
  }

  // ---------------- Proyección base de cada jugador ----------------
  const ULT = D.ultimaSemana;
  const pesoSemana = (w) => Math.pow(0.88, ULT - w);
  const jugadores = D.jugadores.map((p) => {
    const ultimaAp = p.w.length ? p.w[p.w.length - 1][0] : 0;
    const perdidos = Object.keys(tg[p.t] || {}).filter((w) => +w > ultimaAp).length;
    const j = {
      id: p.id, n: p.n, pos: p.p, t: p.t, foto: p.h, estado: p.s || "", lesion: p.inj || null,
      espn: p.espn || null, exp: p.exp, filas: p.w, gp: p.w.length, prev: p.prev || null, perdidos,
      eid: p.e || null, sl: p.sl || null, uso: resumenUso(p),
    };
    if (p.p === "K") {
      const pts = p.w.map((r) => puntosK([r[2], r[3], r[4], r[5]]));
      const pesos = p.w.map((r) => pesoSemana(r[0]));
      const G = sum(pesos);
      const prevK = p.prev && p.prev.k ? p.prev.k.map(puntosK) : [];
      const prior = prevK.length >= 4 ? 0.6 * mean(prevK) + 0.4 * 8 : 8;
      j.baseK = G ? (sum(pts.map((x, i) => x * pesos[i])) + 4 * prior) / (G + 4) : prior * 0.95;
      return j;
    }
    const filas = p.w.map(filaObj);
    const pesos = p.w.map((r) => pesoSemana(r[0]));
    const G = sum(pesos);
    const prom = {};
    D.stats.forEach((k) => (prom[k] = G ? sum(filas.map((f, i) => f[k] * pesos[i])) / G : 0));
    let prior = null, kPrior = 0;
    if (p.prev && p.prev.g >= 3) { prior = arrObj(p.prev.s); kPrior = 3; }
    else if (G) { prior = {}; D.stats.forEach((k) => (prior[k] = prom[k] * 0.85)); kPrior = 1.5; }
    const b = {};
    D.stats.forEach((k) => {
      if (!G) b[k] = prior ? prior[k] * 0.95 : 0;
      else b[k] = (G * prom[k] + kPrior * (prior ? prior[k] : 0)) / (G + kPrior);
    });
    // Regresión de TDs hacia lo esperado por yardas y por uso en zona roja
    const U = j.uso;
    if (U && TASA_RZ.car && G >= 2) {
      b.rtd = 0.5 * b.rtd + 0.25 * b.ryd * TASA.rtd + 0.25 * U.rzCar * TASA_RZ.car;
      b.rectd = 0.5 * b.rectd + 0.25 * b.recyd * TASA.rectd + 0.25 * U.rzTgt * TASA_RZ.tgt;
    } else {
      b.rtd = 0.6 * b.rtd + 0.4 * b.ryd * TASA.rtd;
      b.rectd = 0.6 * b.rectd + 0.4 * b.recyd * TASA.rectd;
    }
    b.ptd = 0.6 * b.ptd + 0.4 * b.pyd * TASA.ptd;
    // Cambio de rol: si en sus últimos 2 partidos jugó muchos más (o menos) snaps que antes,
    // su volumen se ajusta en esa dirección (como hacen FantasyPros y PlayerProfiler con el uso).
    if (U && p.p !== "QB" && U.filas.length >= 3 && U.snap > 0.05) {
      const f = clamp(Math.pow(U.snapUlt / U.snap, 0.6), 0.8, 1.25);
      j.factorRol = f;
      ["car", "ryd", "rtd", "tgt", "rec", "recyd", "rectd", "ay"].forEach((k) => (b[k] *= f));
    }
    j.base = b;
    return j;
  });
  // Las defensas se manejan como "jugadores" con posición DST
  TEAMS.forEach((t) => {
    const d = DEF[t] || { w: [] };
    jugadores.push({
      id: "DST_" + t, n: MASCOTA(t) + " D/ST", pos: "DST", t, foto: "", estado: "ACT", lesion: null,
      espn: d.espn || null, filas: d.w, gp: d.w.length, prev: null, perdidos: 0,
    });
  });
  const porId = {};
  jugadores.forEach((j) => (porId[j.id] = j));

  // Probabilidad de que juegue en una semana. ESPN es la fuente principal del estado.
  const ESPN_INJ = {
    OUT: ["Fuera (ESPN)", 0], INJURY_RESERVE: ["Lista de lesionados (ESPN)", 0], SUSPENSION: ["Suspendido (ESPN)", 0],
    DOUBTFUL: ["Dudoso (ESPN)", 0.25], QUESTIONABLE: ["Cuestionable (ESPN)", 0.85], DAY_TO_DAY: ["Día a día (ESPN)", 0.9],
  };
  const NFL_INJ = { Out: ["Fuera", 0], Doubtful: ["Dudoso", 0.25], Questionable: ["Cuestionable", 0.85] };
  const AJ = {
    activo: [1, "Activo (tu ajuste)"], q: [0.85, "Cuestionable (tu ajuste)"], d: [0.25, "Dudoso (tu ajuste)"],
    out: [0, "Fuera esta semana (tu ajuste)"], ir: [0, "Fuera varias semanas (tu ajuste)"],
  };
  function disponibilidad(j, w) {
    if (D.modoHistorial) return j.gp && j.perdidos >= 2 ? { f: 0.5, nota: "" } : { f: 1, nota: "" };
    const ov = (global.NFL_AJUSTES || {})[j.id];
    if (ov && AJ[ov.est]) {
      const hasta = ov.est === "ir" ? (ov.hasta || semanaProy + 3) : ov.est === "activo" ? 99 : semanaProy;
      if (w <= hasta) return { f: AJ[ov.est][0], nota: AJ[ov.est][1] + (ov.nota ? " · " + ov.nota : ""), ajuste: true };
    }
    if (j.pos === "DST") return { f: 1, nota: "" };
    if (j.estado === "CUT" || j.estado === "RET") return { f: 0, nota: "Sin equipo" };
    const ei = j.espn && j.espn.inj;
    const ir = ei === "INJURY_RESERVE" || (!ei && j.estado === "RES");
    if (ir) return w < semanaProy + 3 ? { f: 0, nota: "Lista de lesionados (IR)" } : { f: 0.75, nota: "Posible regreso de IR" };
    if (ei && ESPN_INJ[ei]) {
      const [nota, f] = ESPN_INJ[ei];
      if (w === semanaProy) return { f, nota };
      if (w === semanaProy + 1) return { f: Math.max(f, 0.7), nota };
    } else if (!ei && j.lesion) {
      const L = j.lesion, x = NFL_INJ[L.st];
      if (x && (L.w === w || (L.w === w - 1 && w === semanaProy))) {
        const f = L.w === w ? x[1] : Math.max(x[1], 0.6);
        return { f, nota: x[0] + (L.w !== w ? " la semana pasada" : "") + (L.why ? " (" + L.why + ")" : "") };
      }
    }
    if (j.gp && j.perdidos >= 2 && w <= semanaProy + 1 && (!ei || ei === "ACTIVE"))
      return { f: 0.5, nota: "No ha jugado sus últimos " + j.perdidos + " partidos" };
    return { f: 1, nota: "" };
  }

  // Proyección de un jugador en un partido concreto
  function proyectarPartido(j, g) {
    const rival = g.home === j.t ? g.away : "@" + g.home;
    const disp = disponibilidad(j, g.w);
    let pts, s = null;
    const a = ambiente(j.t, g);
    if (j.pos === "DST") { const r = proyectarDST(j.t, g); pts = r.pts; s = r.s; }
    else if (j.pos === "K") { pts = j.baseK * clamp(Math.pow(a.td, 0.6), 0.75, 1.3) * a.k; }
    else {
      const b = j.base; s = {};
      s.att = b.att * a.pase; s.cmp = b.cmp * a.pase; s.pyd = b.pyd * a.pase;
      s.ptd = b.ptd * a.td; s.int = b.int; s.sk = b.sk;
      s.car = b.car * a.carrera; s.ryd = b.ryd * a.carrera; s.rtd = b.rtd * a.td;
      s.tgt = b.tgt * a.pase; s.rec = b.rec * a.pase; s.recyd = b.recyd * a.pase; s.rectd = b.rectd * a.td;
      s.fl = b.fl; s.fum = b.fum; s.tp = b.tp; s.ts = b.ts; s.ay = b.ay; s.ret = b.ret;
      pts = puntos(s, j.pos, false);
    }
    // Mezcla con la proyección de ESPN para la semana actual, si existe
    let espn = null;
    if (j.espn && j.espn.ps !== null && j.espn.ps !== undefined && g.w === semanaProy) {
      espn = j.espn.ps;
      if (espn > 0) pts = 0.5 * pts + 0.5 * espn;
    }
    return { g, s, pts: pts * disp.f, ptsSano: pts, disp, rival, amb: a, espn };
  }
  const cacheSem = new Map();
  function proyectarSemana(j, w) {
    const k = j.id + "|" + w;
    if (!cacheSem.has(k)) cacheSem.set(k, proyectarSemanaSinCache(j, w));
    return cacheSem.get(k);
  }
  function proyectarSemanaSinCache(j, w) {
    const g = partidoDe[j.t + "|" + w];
    if (!g) return { bye: true, pts: 0, ptsSano: 0, disp: { f: 0, nota: "Semana de descanso (bye)" }, rival: "BYE" };
    return proyectarPartido(j, g);
  }

  // Puntos reales por semana (con el puntaje exacto de la liga)
  function puntosReales(j) {
    if (j.pos === "DST") return j.filas.map((f) => ({ w: f[0], rival: f[1], pts: puntosDST(f), f }));
    if (j.pos === "K") return j.filas.map((r) => ({ w: r[0], rival: r[1], pts: puntosK([r[2], r[3], r[4], r[5]]), k: r }));
    return j.filas.map((r) => { const s = filaObj(r); return { w: r[0], rival: r[1], pts: puntos(s, j.pos, true), s }; });
  }

  // ---------------- Cálculo global ----------------
  let tabla = [];
  let reemplazo = {};
  const SEM_PLAYOFF = cfg.playoffs;
  const POS = ["QB", "RB", "WR", "TE", "K", "DST"];
  function recalcular() {
    Object.keys(cachePred).forEach((k) => delete cachePred[k]);
    cacheSem.clear();
    tabla = jugadores.map((j) => {
      const reales = puntosReales(j);
      const ppg = reales.length ? mean(reales.map((x) => x.pts)) : 0;
      const pend = partidos.filter((g) => !g.jugado && (g.home === j.t || g.away === j.t));
      const futuros = pend.map((g) => proyectarPartido(j, g));
      const ros = sum(futuros.map((x) => x.pts));
      const sano = futuros.length ? mean(futuros.map((x) => x.ptsSano)) : 0;
      const playoffs = sum(futuros.filter((x) => SEM_PLAYOFF.includes(x.g.w)).map((x) => x.pts));
      let neutral = sano;
      if (j.base) neutral = puntos(j.base, j.pos, false);
      else if (j.pos === "K") neutral = j.baseK;
      else if (j.pos === "DST") neutral = mean(TEAMS.filter((t) => t !== j.t).map((t) => {
        const g = { id: "n" + j.t + t, home: j.t, away: t, spread: null, total: null, w: 0 };
        return proyectarDST(j.t, g).pts;
      }));
      const calendario = neutral > 0 ? sano / neutral : 1;
      const sem = proyectarSemana(j, semanaProy);
      const pts = reales.map((x) => x.pts);
      const ref = sem.ptsSano || sano;
      const sdObs = pts.length >= 3 ? Math.sqrt(mean(pts.map((x) => (x - ppg) ** 2))) : 0;
      const sd = pts.length >= 3 ? 0.5 * sdObs + 0.5 * 0.45 * ref : 0.45 * ref;
      let tdReal = 0, tdEsp = 0;
      if (j.base) {
        reales.forEach((x) => {
          tdReal += x.s.ptd * (cfg.pts.ptd / 6) + x.s.rtd + x.s.rectd;
          tdEsp += x.s.pyd * TASA.ptd * (cfg.pts.ptd / 6) + x.s.ryd * TASA.rtd + x.s.recyd * TASA.rectd;
        });
      }
      return {
        j, reales, ppg, futuros, ros, rosPG: futuros.length ? ros / futuros.length : 0, sano,
        playoffs, calendario, sem, sd, tdReal, tdEsp, juegosRest: futuros.length,
        ultimas3: reales.length ? mean(reales.slice(-3).map((x) => x.pts)) : 0,
      };
    });
    // Nivel de reemplazo: titulares de la liga + algo de banca
    const n = cfg.equipos, sl = cfg.slots;
    const orden = {};
    POS.forEach((p) => (orden[p] = tabla.filter((x) => x.j.pos === p).sort((a, b) => b.ros - a.ros)));
    const usados = {};
    POS.forEach((p) => (usados[p] = n * (sl[p] || 0)));
    cfg.flexes.forEach((fx) => {
      for (let i = 0; i < n * fx.n; i++) {
        let mejor = null;
        fx.pos.forEach((p) => {
          const c = orden[p] && orden[p][usados[p]];
          if (c && (!mejor || c.ros > orden[mejor][usados[mejor]].ros)) mejor = p;
        });
        if (mejor) usados[mejor]++;
      }
    });
    const banca = { QB: 0.4, RB: 0.8, WR: 0.8, TE: 0.4, K: 0, DST: 0.2 };
    reemplazo = {};
    POS.forEach((p) => {
      const k = Math.min(orden[p].length - 1, Math.round(usados[p] + n * banca[p]));
      reemplazo[p] = orden[p][k] ? orden[p][k].ros : 0;
      orden[p].forEach((x, i) => (x.rankPos = i + 1));
    });
    tabla.forEach((x) => (x.vorp = x.ros - reemplazo[x.j.pos]));
    const maxV = Math.max(...tabla.map((x) => x.vorp));
    tabla.forEach((x) => (x.valor = x.vorp > 0 ? Math.round(1 + 99 * Math.pow(x.vorp / maxV, 0.9)) : 0));
    tabla.sort((a, b) => b.valor - a.valor || b.ros - a.ros);
    tabla.forEach((x, i) => (x.rankGen = i + 1));
    tabla.forEach((x) => (porId[x.j.id].fila = x));
  }

  // ---------------- Alineación y trades ----------------
  function alineacion(ids, w) {
    const ps = ids.filter((id) => porId[id]).map((id) => {
      const pr = proyectarSemana(porId[id], w);
      return { id, pos: porId[id].pos, pts: pr.pts, pr };
    }).sort((a, b) => b.pts - a.pts);
    const libres = ps.slice(), titulares = [];
    const tomar = (pred, k, slot) => {
      for (let i = 0; i < k; i++) {
        const idx = libres.findIndex(pred);
        if (idx < 0) { titulares.push({ slot, id: null, pts: 0 }); continue; }
        titulares.push(Object.assign({ slot }, libres.splice(idx, 1)[0]));
      }
    };
    ["QB", "RB", "WR", "TE"].forEach((p) => tomar((x) => x.pos === p, cfg.slots[p] || 0, p));
    // Los flex más restringidos primero (p. ej. RB/WR antes que QB/RB/WR/TE)
    cfg.flexes.slice().sort((a, b) => a.pos.length - b.pos.length).forEach((fx) => tomar((x) => fx.pos.includes(x.pos), fx.n, fx.nombre));
    tomar((x) => x.pos === "DST", cfg.slots.DST || 0, "D/ST");
    tomar((x) => x.pos === "K", cfg.slots.K || 0, "K");
    return { titulares, banca: libres, pts: sum(titulares.map((x) => x.pts)) };
  }
  const ULTIMA_FANTASY = Math.max(...cfg.playoffs);
  function puntosRestoTemporada(ids, hasta) {
    let t = 0;
    for (let w = semanaProy; w <= Math.min(hasta || ULTIMA_FANTASY, SEMANAS); w++) t += alineacion(ids, w).pts;
    return t;
  }
  // Las piezas extra valen menos: ocupan lugar en tu roster
  function valorLado(ids) {
    const v = ids.map((id) => porId[id].fila.valor).sort((a, b) => b - a);
    const f = [1, 0.8, 0.65];
    return sum(v.map((x, i) => x * (f[i] !== undefined ? f[i] : 0.5)));
  }
  function evaluarTrade(doy, recibo, miRoster, suRoster) {
    const vD = valorLado(doy), vR = valorLado(recibo);
    const dif = (vR - vD) / Math.max(1, Math.max(vD, vR));
    let veredicto, clase;
    if (Math.abs(dif) < 0.1) { veredicto = "Trade justo"; clase = "justo"; }
    else if (dif >= 0.1 && dif < 0.25) { veredicto = "Ligeramente a tu favor"; clase = "favor"; }
    else if (dif >= 0.25) { veredicto = "Muy a tu favor (difícil que lo acepten)"; clase = "favor"; }
    else if (dif <= -0.1 && dif > -0.25) { veredicto = "Ligeramente en tu contra"; clase = "contra"; }
    else { veredicto = "Injusto: pierdes mucho valor"; clase = "contra"; }
    let impacto = null;
    if (miRoster && miRoster.length) {
      const despues = miRoster.filter((id) => !doy.includes(id)).concat(recibo);
      const antes = puntosRestoTemporada(miRoster), luego = puntosRestoTemporada(despues);
      const semanas = Math.max(1, Math.min(ULTIMA_FANTASY, SEMANAS) - semanaProy + 1);
      impacto = { antes, luego, dif: luego - antes, porSemana: (luego - antes) / semanas };
    }
    // Lo mismo desde el lado del otro equipo: ¿le conviene a su alineación?
    let impactoOtro = null;
    if (suRoster && suRoster.length) {
      const despues = suRoster.filter((id) => !recibo.includes(id)).concat(doy);
      const antes = puntosRestoTemporada(suRoster), luego = puntosRestoTemporada(despues);
      const semanas = Math.max(1, Math.min(ULTIMA_FANTASY, SEMANAS) - semanaProy + 1);
      impactoOtro = { antes, luego, dif: luego - antes, porSemana: (luego - antes) / semanas };
    }
    // Probabilidad aproximada de que lo acepten: sube si a ellos les conviene en valor y en su alineación
    let acepta = null;
    if (impactoOtro) {
      const z = -dif * 4 + impactoOtro.porSemana * 0.35;
      acepta = clamp(1 / (1 + Math.exp(-z)), 0.03, 0.97);
    }
    return { vD, vR, dif, veredicto, clase, impacto, impactoOtro, acepta };
  }

  // ---------------- Defensa vs. posición ----------------
  // Puntos de fantasy que permite cada defensa a QB/RB/WR/TE por partido, contra el promedio de la liga.
  let dvpCache = null;
  function dvp() {
    if (dvpCache) return dvpCache;
    const acum = {}; // equipo -> pos -> {pts, juegos:Set}
    TEAMS.forEach((t) => (acum[t] = { QB: [0, new Set()], RB: [0, new Set()], WR: [0, new Set()], TE: [0, new Set()] }));
    jugadores.forEach((j) => {
      if (!["QB", "RB", "WR", "TE"].includes(j.pos)) return;
      j.filas.forEach((r) => {
        const def = r[1];
        if (!acum[def]) return;
        acum[def][j.pos][0] += puntos(filaObj(r), j.pos, true);
        acum[def][j.pos][1].add(r[0]);
      });
    });
    const out = {}, liga = {};
    ["QB", "RB", "WR", "TE"].forEach((p) => {
      const vals = TEAMS.map((t) => (acum[t][p][1].size ? acum[t][p][0] / acum[t][p][1].size : 0)).filter((x) => x > 0);
      liga[p] = mean(vals);
    });
    TEAMS.forEach((t) => {
      out[t] = {};
      ["QB", "RB", "WR", "TE"].forEach((p) => {
        const g = acum[t][p][1].size;
        const ppg = g ? acum[t][p][0] / g : liga[p];
        const ajust = (ppg * g + liga[p] * 2) / (g + 2); // pocas semanas: se jala al promedio
        out[t][p] = { ppg, ratio: liga[p] ? ajust / liga[p] : 1 };
      });
    });
    ["QB", "RB", "WR", "TE"].forEach((p) => {
      TEAMS.slice().sort((a, b) => out[b][p].ratio - out[a][p].ratio).forEach((t, i) => (out[t][p].rank = i + 1)); // 1 = la que más permite
    });
    return (dvpCache = { equipos: out, liga });
  }

  // ---------------- ¿A quién alineo? ----------------
  // Probabilidad de que cada jugador sea el que más puntos haga entre los elegidos (simulación).
  function compararJugadores(ids, w, n) {
    n = n || 4000;
    const datos = ids.map((id) => {
      const j = porId[id], pr = proyectarSemana(j, w), f = j.fila || {};
      const sd = Math.max(1.5, (f.sd || 0.45 * pr.ptsSano)) * (pr.disp.f || 0);
      return { id, mu: pr.pts, sd, pr };
    });
    const gana = ids.map(() => 0);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const normal = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    for (let k = 0; k < n; k++) {
      let mejor = -1, max = -1e9;
      datos.forEach((d, i) => {
        const x = d.pr.disp.f === 0 || d.pr.bye ? -1e6 + i : Math.max(0, d.mu + d.sd * normal());
        if (x > max) { max = x; mejor = i; }
      });
      gana[mejor]++;
    }
    return datos.map((d, i) => Object.assign(d, { pMejor: gana[i] / n, piso: Math.max(0, d.mu - 0.85 * d.sd), techo: d.mu + 0.85 * d.sd }));
  }

  // ---------------- Simulación de la liga ----------------
  // liga: { equipos:[{id, jugadores, w, l, t, pf}], calendario:[{p, h, a, ganador}], periodos:{p:[semanas]} }
  function simularLiga(liga, n) {
    n = n || 3000;
    const eqs = liga.equipos;
    const regular = cfg.temporadaRegular;
    const lugares = Math.max(1, liga.lugaresPlayoff || 4);
    const proyCache = {};
    const proyEquipo = (e, p) => {
      const k = e.id + "|" + p;
      if (proyCache[k]) return proyCache[k];
      const semanas = (liga.periodos && liga.periodos[p]) || [p];
      let mu = 0, v = 0;
      semanas.forEach((w) => {
        if (w > SEMANAS) return;
        const al = alineacion(e.jugadores, w);
        mu += al.pts;
        v += sum(al.titulares.filter((t) => t.id).map((t) => { const f = porId[t.id].fila; const d = t.pr && t.pr.disp ? t.pr.disp.f : 1; return ((f ? f.sd : 6) * d) ** 2; }));
      });
      return (proyCache[k] = { mu, sd: Math.sqrt(v + 1) });
    };
    const pend = liga.calendario.filter((m) => m.p <= regular && (!m.ganador || m.ganador === "UNDECIDED") && m.p >= (liga.periodoActual || 1));
    const res = {};
    eqs.forEach((e) => (res[e.id] = { playoffs: 0, primero: 0, ultimo: 0, victorias: 0 }));
    let seed = 987654;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const normal = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const porId2 = {};
    eqs.forEach((e) => (porId2[e.id] = e));
    for (let k = 0; k < n; k++) {
      const tabla = {};
      eqs.forEach((e) => (tabla[e.id] = { w: e.w || 0, pf: e.pf || 0 }));
      pend.forEach((m) => {
        const h = porId2[m.h], a = porId2[m.a];
        if (!h || !a) return;
        const ph = proyEquipo(h, m.p), pa = proyEquipo(a, m.p);
        const xh = ph.mu + ph.sd * normal(), xa = pa.mu + pa.sd * normal();
        tabla[m.h].pf += xh; tabla[m.a].pf += xa;
        if (xh > xa) tabla[m.h].w++; else tabla[m.a].w++;
      });
      const orden = eqs.map((e) => e.id).sort((x, y) => tabla[y].w - tabla[x].w || tabla[y].pf - tabla[x].pf);
      orden.forEach((id, i) => {
        if (i < lugares) res[id].playoffs++;
        res[id].victorias += tabla[id].w;
      });
      res[orden[0]].primero++;
      res[orden[orden.length - 1]].ultimo++;
    }
    Object.values(res).forEach((r) => { r.playoffs /= n; r.primero /= n; r.ultimo /= n; r.victorias /= n; });
    return res;
  }

  global.Modelo = {
    D, EQUIPOS, MASCOTA, TEAMS, partidos, partidoDe, SEMANAS, semanaProy, byes, cfg, LG, R, base, POS,
    jugadores, porId, puntos, puntosK, puntosDST, filaObj, predecirPartido, proyectarSemana, proyectarPartido,
    puntosReales, recalcular, get tabla() { return tabla; }, get reemplazo() { return reemplazo; },
    valorLado, alineacion, evaluarTrade, puntosRestoTemporada, disponibilidad, tg, mean, sum, clamp, phi,
    dvp, compararJugadores, simularLiga, efectoClima, ULTIMA_FANTASY, TASA_RZ,
    ponerClima(id, c) { CLIMA[id] = c; },
    get clima() { return CLIMA; },
  };
})(typeof window !== "undefined" ? window : globalThis);
