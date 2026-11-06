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
function modeloAntesDe(D, w) {
  const C = JSON.parse(JSON.stringify(D));
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

function main() {
  const D = datosActuales();
  const H = leerHistorial();
  const hist = {
    temporada: D.temporada,
    proy: {}, valor: {}, juegos: {},
    espn: H.temporada === D.temporada ? H.espn || {} : {},
    vivo: H.temporada === D.temporada ? H.vivo || {} : {},
  };
  for (let w = 1; w <= D.ultimaSemana; w++) {
    const M = modeloAntesDe(D, w);
    const proy = {}, valor = {};
    M.tabla.forEach((x) => {
      const pr = M.proyectarSemana(x.j, w);
      if (!pr.bye && pr.pts >= 1.5) proy[x.j.id] = r1(pr.pts);
      if (x.valor > 0) valor[x.j.id] = x.valor;
    });
    const juegos = {};
    M.partidos.filter((g) => g.w === w).forEach((g) => {
      const p = M.predecirPartido(g);
      juegos[g.id] = [Math.round(p.pHome * 1000) / 1000, r1(p.away.pts), r1(p.home.pts)];
    });
    hist.proy[w] = proy; hist.valor[w] = valor; hist.juegos[w] = juegos;
    console.log(`  semana ${w}: ${Object.keys(proy).length} proyecciones`);
  }
  // Proyecciones de la semana que viene (con lesiones y ESPN): se congelan cuando la semana se juega
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.NFL_DATA = D;
  cargar("modelo.js", ctx);
  const M = ctx.Modelo;
  M.recalcular();
  const W = M.semanaProy;
  if (W > D.ultimaSemana) {
    const vivo = {}, espn = {};
    M.tabla.forEach((x) => {
      const pr = M.proyectarSemana(x.j, W);
      if (!pr.bye && pr.pts >= 1.5) vivo[x.j.id] = r1(pr.pts);
      const e = x.j.espn;
      if (e && e.ps !== null && e.ps !== undefined && D.fuenteEspn) espn[x.j.id] = e.ps;
    });
    hist.vivo[W] = vivo;
    if (Object.keys(espn).length) hist.espn[W] = espn;
  }
  hist.generado = D.generado;
  fs.writeFileSync(path.join(AQUI, "historial.js"), "window.NFL_HIST = " + JSON.stringify(hist) + ";\n");
  console.log("Listo: historial.js");
}

main();
