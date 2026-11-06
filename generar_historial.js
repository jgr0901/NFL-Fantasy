// Genera historial.js: lo que el modelo proyectaba ANTES de cada semana ya jugada
// (para medir su precisión y ver cómo cambia el valor de cada jugador), más las
// proyecciones de ESPN y del modelo que se guardan cada semana.
// Uso: node generar_historial.js   (después de actualizar_datos.py)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const AQUI = __dirname;
const cargar = (archivo, ctx) => vm.runInContext(fs.readFileSync(path.join(AQUI, archivo), "utf8"), ctx, { filename: archivo });

function datosActuales() {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  cargar("data.js", ctx);
  return ctx.NFL_DATA;
}

function leerHistorial() {
  const ruta = path.join(AQUI, "historial.js");
  if (!fs.existsSync(ruta)) return {};
  const ctx = vm.createContext({});
  ctx.window = ctx;
  try { vm.runInContext(fs.readFileSync(ruta, "utf8"), ctx); return ctx.NFL_HIST || {}; } catch (e) { return {}; }
}

// Corre el modelo con los datos tal como estaban antes de la semana w
function modeloAntesDe(D, w, parametros) {
  const C = JSON.parse(JSON.stringify(D));
  C.parametros = parametros || null;
  C.modoHistorial = true;
  C.semanaEspn = w;
  C.ultimaSemana = w - 1;
  C.liga = null;
  C.partidos.forEach((g) => { if (g[1] >= w) { g[6] = null; g[7] = null; } });
  C.jugadores.forEach((p) => {
    p.w = p.w.filter((r) => r[0] < w);
    if (p.u) p.u = p.u.filter((u) => u[0] < w);
    delete p.espn; delete p.inj;
  });
  Object.values(C.defensas || {}).forEach((d) => { d.w = d.w.filter((f) => f[0] < w); delete d.espn; });
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.NFL_DATA = C;
  cargar("modelo.js", ctx);
  ctx.Modelo.recalcular();
  return ctx.Modelo;
}

const r1 = (x) => Math.round(x * 10) / 10;

// El modelo con todos los datos (para saber los puntos reales de cada semana)
function modeloCompleto(D, parametros) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.NFL_DATA = Object.assign(JSON.parse(JSON.stringify(D)), { parametros: parametros || null, liga: null });
  cargar("modelo.js", ctx);
  ctx.Modelo.recalcular();
  return ctx.Modelo;
}
const r3 = (x) => Math.round(x * 1000) / 1000;

// Puntos reales de cada jugador en la semana w (con el puntaje de la liga por defecto)
function realesDe(M, w) {
  const out = {};
  M.tabla.forEach((x) => { const r = x.reales.find((y) => y.w === w); if (r) out[x.j.id] = r.pts; });
  return out;
}

// Error de las proyecciones de jugadores con unos parámetros, sobre las semanas dadas.
// Se mide sobre jugadores que importan (proyección de 5+ con los parámetros base) para comparar parejo.
function errorJugadores(D, semanas, par, reales, relevantes) {
  let e = 0, n = 0;
  semanas.forEach((w) => {
    const M = modeloAntesDe(D, w, par);
    relevantes[w].forEach((id) => {
      const j = M.porId[id];
      if (!j || reales[w][id] === undefined) return;
      e += Math.abs(M.proyectarSemana(j, w).pts - reales[w][id]); n++;
    });
  });
  return n ? e / n : null;
}

// Pérdida logarítmica de la probabilidad de ganar (más baja = mejor) y error del margen
function errorPartidos(modelos, D, vegas, sd) {
  let ll = 0, n = 0, eM = 0;
  const real = {};
  D.partidos.forEach((g) => { if (g[6] !== null && g[7] !== null) real[g[0]] = { as: g[6], hs: g[7] }; });
  modelos.forEach(({ w, M }) => {
    M.PAR.vegas = vegas; M.PAR.sdPartido = sd; M.limpiarCache();
    M.partidos.filter((g) => g.w === w && real[g.id] && real[g.id].hs !== real[g.id].as).forEach((x) => {
      const g = Object.assign({}, x, real[x.id]);
      const pr = M.predecirPartido(x);
      const p = Math.min(0.98, Math.max(0.02, pr.pHome));
      ll += g.hs > g.as ? -Math.log(p) : -Math.log(1 - p);
      eM += Math.abs((pr.home.pts - pr.away.pts) - (g.hs - g.as));
      n++;
    });
  });
  return n ? { ll: ll / n, margen: eM / n, n } : null;
}

// Prueba combinaciones de parámetros contra las semanas ya jugadas y se queda con la mejor,
// solo si mejora de verdad (para no perseguir ruido con pocas semanas).
function ajustarParametros(D, H, base) {
  const semanas = [];
  for (let w = 3; w <= D.ultimaSemana; w++) semanas.push(w);
  const res = { par: {}, semanas: semanas.length, fecha: D.generado, pruebas: {} };
  if (semanas.length < 3) { res.nota = "Pocas semanas jugadas: se usan los valores de partida."; return res; }
  // Jugadores relevantes y puntos reales por semana (con los parámetros base)
  const relevantes = {}, reales = {};
  const modelosBase = [];
  const Mtodo = modeloCompleto(D, base);
  semanas.forEach((w) => {
    const M = modeloAntesDe(D, w, base);
    reales[w] = realesDe(Mtodo, w);
    relevantes[w] = M.tabla.filter((x) => x.j.base && M.proyectarSemana(x.j, w).pts >= 5).map((x) => x.j.id);
    modelosBase.push({ w, M });
  });
  // 1) Jugadores: cuánto pesan las semanas recientes y qué tanto se jalan los TDs
  const errBase = errorJugadores(D, semanas, base, reales, relevantes);
  let mejor = { decay: base.decay, tdReg: base.tdReg, err: errBase };
  [0.8, 0.85, 0.88, 0.92, 0.96].forEach((decay) => [0.25, 0.4, 0.55].forEach((tdReg) => {
    if (decay === base.decay && tdReg === base.tdReg) return;
    const e = errorJugadores(D, semanas, Object.assign({}, base, { decay, tdReg }), reales, relevantes);
    if (e !== null && e < mejor.err) mejor = { decay, tdReg, err: e };
  }));
  res.pruebas.jugadores = { antes: r3(errBase), despues: r3(mejor.err) };
  if (mejor.err < errBase * 0.99) { res.par.decay = mejor.decay; res.par.tdReg = mejor.tdReg; }
  // 2) Partidos: peso de Vegas y qué tanto varía un partido
  const eb = errorPartidos(modelosBase, D, base.vegas, base.sdPartido);
  let mp = { vegas: base.vegas, sd: base.sdPartido, ll: eb ? eb.ll : null };
  if (eb) [0.4, 0.5, 0.6, 0.7, 0.8, 0.9].forEach((vegas) => [10, 11.5, 13, 14.5, 16].forEach((sd) => {
    const e = errorPartidos(modelosBase, D, vegas, sd);
    if (e && e.ll < mp.ll) mp = { vegas, sd, ll: e.ll };
  }));
  if (eb) {
    res.pruebas.partidos = { antes: r3(eb.ll), despues: r3(mp.ll), juegos: eb.n };
    if (mp.ll < eb.ll * 0.99) { res.par.vegas = mp.vegas; res.par.sdPartido = mp.sd; }
  }
  // 2b) Qué tanto varía cada jugador: el rango debe cubrir 8 de cada 10 semanas
  const z = [];
  modelosBase.forEach(({ w, M }) => {
    relevantes[w].forEach((id) => {
      const x = M.porId[id].fila, pr = M.proyectarSemana(M.porId[id], w), r = reales[w][id];
      const sd = x.sd / (base.sdEscala || 1) * (pr.disp.f || 0);
      if (r !== undefined && sd > 0) z.push(Math.abs(r - pr.pts) / sd);
    });
  });
  if (z.length >= 300) {
    z.sort((a, b) => a - b);
    const k80 = z[Math.floor(z.length * 0.8)];
    const dentro = (esc) => z.filter((x) => x <= 1.2816 * esc).length / z.length;
    const esc = Math.round(Math.min(2.5, Math.max(0.8, k80 / 1.2816)) * 100) / 100;
    res.par.sdEscala = esc;
    res.pruebas.rango = { antes: r3(dentro(base.sdEscala || 1)), despues: r3(dentro(esc)), jugadores: z.length };
  }
  // 3) Peso de ESPN: con las proyecciones guardadas justo antes de cada semana (modelo solo y ESPN)
  const pares = [];
  Object.keys(H.puro || {}).forEach((w) => {
    if (+w > D.ultimaSemana) return;
    const esp = (H.espn || {})[w] || {}, puro = H.puro[w];
    const M = modelosBase.find((x) => x.w === +w);
    const re = M ? reales[w] : realesDe(Mtodo, +w);
    Object.keys(puro).forEach((id) => {
      if (esp[id] === undefined || re[id] === undefined || puro[id] < 5) return;
      pares.push([puro[id], esp[id], re[id]]);
    });
  });
  if (pares.length >= 150) {
    const err = (k) => pares.reduce((s, [m, e, r]) => s + Math.abs((1 - k) * m + k * e - r), 0) / pares.length;
    const eB = err(base.espn);
    let me = { k: base.espn, e: eB };
    [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1].forEach((k) => { const e = err(k); if (e < me.e) me = { k, e }; });
    res.pruebas.espn = { antes: r3(eB), despues: r3(me.e), jugadores: pares.length };
    if (me.e < eB * 0.99) res.par.espn = me.k;
  }
  return res;
}

function main() {
  const D = datosActuales();
  const H = leerHistorial();
  const misma = H.temporada === D.temporada;
  const hist = {
    temporada: D.temporada,
    proy: {}, rango: {}, valor: {}, juegos: {},
    espn: misma ? H.espn || {} : {},
    vivo: misma ? H.vivo || {} : {},
    puro: misma ? H.puro || {} : {},
  };
  // Parámetros: se buscan los que mejor habrían predicho las semanas jugadas
  const ctx0 = vm.createContext({ console });
  ctx0.window = ctx0;
  ctx0.NFL_DATA = JSON.parse(JSON.stringify(D));
  cargar("modelo.js", ctx0);
  const base = Object.assign({}, ctx0.Modelo.PAR_BASE);
  hist.ajuste = ajustarParametros(D, hist, base);
  const par = Object.assign({}, base, hist.ajuste.par);
  console.log("  parámetros:", JSON.stringify(hist.ajuste.par), JSON.stringify(hist.ajuste.pruebas));

  for (let w = 1; w <= D.ultimaSemana; w++) {
    const M = modeloAntesDe(D, w, par);
    const proy = {}, rango = {}, valor = {};
    M.tabla.forEach((x) => {
      const pr = M.proyectarSemana(x.j, w);
      if (!pr.bye && pr.pts >= 1.5) { proy[x.j.id] = r1(pr.pts); rango[x.j.id] = r1(x.sd * (pr.disp.f || 0)); }
      if (x.valor > 0) valor[x.j.id] = x.valor;
    });
    const juegos = {};
    M.partidos.filter((g) => g.w === w).forEach((g) => {
      const p = M.predecirPartido(g);
      juegos[g.id] = [r3(p.pHome), r1(p.away.pts), r1(p.home.pts)];
    });
    hist.proy[w] = proy; hist.rango[w] = rango; hist.valor[w] = valor; hist.juegos[w] = juegos;
    console.log(`  semana ${w}: ${Object.keys(proy).length} proyecciones`);
  }
  // Proyecciones de la semana que viene (con lesiones y ESPN): se congelan cuando la semana se juega
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.NFL_DATA = Object.assign({}, D, { parametros: par });
  cargar("modelo.js", ctx);
  const M = ctx.Modelo;
  M.recalcular();
  const W = M.semanaProy;
  if (W > D.ultimaSemana) {
    const vivo = {}, espn = {}, puro = {};
    M.tabla.forEach((x) => {
      const pr = M.proyectarSemana(x.j, W);
      if (!pr.bye && pr.pts >= 1.5) { vivo[x.j.id] = r1(pr.pts); puro[x.j.id] = r1(pr.ptsModelo); }
      const e = x.j.espn;
      if (e && e.ps !== null && e.ps !== undefined && D.fuenteEspn) espn[x.j.id] = e.ps;
    });
    hist.vivo[W] = vivo;
    hist.puro[W] = puro;
    if (Object.keys(espn).length) hist.espn[W] = espn;
  }
  hist.generado = D.generado;
  fs.writeFileSync(path.join(AQUI, "historial.js"), "window.NFL_HIST = " + JSON.stringify(hist) + ";\n");
  console.log("Listo: historial.js");
}

if (require.main === module) main();
else module.exports = { datosActuales, modeloAntesDe, modeloCompleto, errorPartidos, errorJugadores, ajustarParametros };
