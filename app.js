// Interfaz de la página. El modelo está en modelo.js; lo que se trae en vivo, en en_linea.js.
(function () {
  "use strict";
  const M = window.Modelo;
  const D = M.D;
  const H = window.NFL_HIST || null;
  const EL = window.EnLinea || null;
  M.recalcular();

  // ---------------- Utilidades ----------------
  const $ = (s, el) => (el || document).querySelector(s);
  const f1 = (x) => (x === null || x === undefined || isNaN(x) ? "–" : (Math.round(x * 10) / 10).toFixed(1));
  const f0 = (x) => (x === null || x === undefined || isNaN(x) ? "–" : Math.round(x).toString());
  const pct = (x) => (x === null || x === undefined || isNaN(x) ? "–" : Math.round(x * 100) + "%");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  // Las horas vienen en hora del Este de EE.UU.; se muestran en la hora local del dispositivo.
  function fechaCorta(g) {
    if (!g.hora) { const d = new Date(g.fecha + "T12:00:00"); return DIAS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
    const d = EL ? EL.inicioUTC(g) : new Date(g.fecha + "T" + g.hora + ":00-04:00");
    return DIAS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1) + " " + d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  }
  const SEM = M.semanaProy;
  const ULTIMA = Math.min(M.ULTIMA_FANTASY, M.SEMANAS);
  const PLAYOFFS = M.cfg.playoffs;
  const nombrePos = (p) => (p === "DST" ? "D/ST" : p);
  // Botón (?) con una explicación que se abre al tocarlo
  const ayuda = (texto) => `<button class="q" type="button" data-ayuda="${esc(texto)}" aria-label="Qué significa">?</button>`;
  const titulo = (t, explicacion, extra) => `<div class="tit"><h3>${t}${explicacion ? " " + ayuda(explicacion) : ""}</h3>${extra || ""}</div>`;

  function avatar(j, grande) {
    const cls = grande ? "foto-grande" : "";
    if (j.foto && !window.claude) return `<img class="${cls}" src="${esc(j.foto)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;avatar ${cls}&quot;>${esc(j.t)}</span>'">`;
    return `<span class="avatar ${cls}">${esc(j.t)}</span>`;
  }
  function jugHTML(j, extra) {
    return `<div class="jug">${avatar(j)}<div style="min-width:0"><div class="nm">${esc(j.n)}</div>
      <div class="mt"><span class="pos ${j.pos}">${nombrePos(j.pos)}</span> ${esc(j.t)}${extra ? " · " + extra : ""}</div></div></div>`;
  }
  function estadoTag(pr) {
    if (!pr || !pr.disp) return "";
    if (pr.bye) return `<span class="tag gris">BYE</span>`;
    const d = pr.disp;
    if (!d.nota) return "";
    const c = d.f === 0 ? "rojo" : d.f < 1 ? "amar" : "gris";
    return `<span class="tag ${c}">${esc(d.nota)}</span>`;
  }
  function linea(s, pos) { // línea de estadísticas proyectadas
    if (!s) return "";
    if (pos === "DST") return `${f1(s.sk)} sacks · ${f1(s.int + s.fr)} pérdidas · ${f0(s.pa)} pts permitidos`;
    const p = [];
    if (pos === "QB") {
      p.push(`${f0(s.pyd)} yd pase`, `${f1(s.ptd)} TD`, `${f1(s.int)} INT`);
      if (s.ryd > 8) p.push(`${f0(s.ryd)} yd carrera`);
    } else if (pos === "RB") {
      p.push(`${f1(s.car)} acarreos`, `${f0(s.ryd)} yd`, `${f1(s.rec)} rec`, `${f0(s.recyd)} yd rec`, `${f1(s.rtd + s.rectd)} TD`);
    } else {
      p.push(`${f1(s.rec)} rec`, `${f0(s.recyd)} yd`, `${f1(s.rectd)} TD`);
      if (s.ryd > 5) p.push(`${f0(s.ryd)} yd carrera`);
    }
    return p.join(" · ");
  }
  function semanaSelect(id, valor, desde) {
    let o = "";
    for (let w = desde || 1; w <= M.SEMANAS; w++) o += `<option value="${w}" ${w === valor ? "selected" : ""}>Semana ${w}${PLAYOFFS.includes(w) ? " (playoffs)" : ""}</option>`;
    return `<select id="${id}">${o}</select>`;
  }
  // Gráfica de barras con rango (bigote de semana mala a semana buena), playoffs sombreados y eje
  function graficaSVG(datos, alto) { // datos: [{x, y, lo?, hi?, tipo, titulo, playoff?, nota?}]
    const W = Math.max(300, Math.min(640, (window.innerWidth || 640) - 70)), Hh = alto || 170, padL = 30, padB = 22, padT = 14;
    const max = Math.max(5, ...datos.map((d) => Math.max(d.y, d.hi || 0)));
    const paso = max > 120 ? 40 : max > 60 ? 20 : max > 25 ? 10 : 5;
    const top = Math.ceil(max / paso) * paso;
    const bw = (W - padL - 4) / datos.length;
    const Y = (v) => Hh - padB - ((Hh - padB - padT) * Math.max(0, v)) / top;
    let s = `<svg class="grafica" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" style="height:${Hh}px">`;
    for (let v = 0; v <= top; v += paso) s += `<line x1="${padL}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="eje"/><text x="${padL - 4}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
    datos.forEach((d, i) => {
      const x0 = padL + i * bw;
      if (d.playoff) s += `<rect x="${x0}" y="${padT - 6}" width="${bw}" height="${Hh - padB - padT + 6}" class="zona-po"/>`;
      const x = x0 + bw * 0.18, w = bw * 0.64, y = Y(d.y);
      const clase = d.tipo === "real" ? "b-real" : d.tipo === "bye" ? "b-bye" : "b-proy";
      s += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0, Hh - padB - y)}" rx="3" class="${clase}"><title>${esc(d.titulo || "")}</title></rect>`;
      if (d.lo !== undefined && d.hi !== undefined && d.y > 0) {
        const cx = x + w / 2;
        s += `<line x1="${cx}" x2="${cx}" y1="${Y(d.hi)}" y2="${Y(d.lo)}" class="bigote"/><line x1="${cx - 5}" x2="${cx + 5}" y1="${Y(d.hi)}" y2="${Y(d.hi)}" class="bigote"/><line x1="${cx - 5}" x2="${cx + 5}" y1="${Y(d.lo)}" y2="${Y(d.lo)}" class="bigote"/>`;
      }
      s += `<text x="${x + w / 2}" y="${Hh - 7}" text-anchor="middle">${esc(d.x)}</text>`;
      if (d.y > 0) s += `<text x="${x + w / 2}" y="${(d.hi !== undefined ? Y(d.hi) : y) - 3}" text-anchor="middle" class="val">${f0(d.y)}</text>`;
      if (d.nota) s += `<text x="${x + w / 2}" y="${Y(0) - 4}" text-anchor="middle" class="nota-g">${esc(d.nota)}</text>`;
    });
    return s + "</svg>";
  }

  // ---------------- Roster ----------------
  const porNombre = {};
  M.jugadores.forEach((j) => { porNombre[j.n.toLowerCase()] = porNombre[j.n.toLowerCase()] || j.id; });
  function resolver(nombre) {
    const n = nombre.toLowerCase().trim();
    if (!n) return null;
    if (porNombre[n]) return porNombre[n];
    const dst = n.match(/^(.+?)\s*d\/?st$/);
    if (dst) { const t = M.TEAMS.find((t) => M.MASCOTA(t).toLowerCase() === dst[1].trim()); if (t) return "DST_" + t; }
    const j = M.jugadores.find((j) => j.n.toLowerCase().includes(n));
    return j ? j.id : null;
  }
  const ligaMia = D.liga && D.liga.equipos ? D.liga.equipos.find((e) => e.mio) : null;
  const SY = window.Sync;
  // Dirección de esta página para que el botón de ESPN mande la liga directo (no aplica abierta como archivo ni en claude.ai)
  const DESTINO = /^https?:$/.test(location.protocol) && !window.claude ? location.origin + location.pathname : null;
  let roster = [], origenRoster = "";
  function cargarRoster() {
    const r = SY.estado.roster;
    if (r && r.length) { roster = r.filter((id) => M.porId[id]); origenRoster = ligaMia ? "tu liga de ESPN, con tus cambios" : "tus cambios"; }
    else if (ligaMia) { roster = ligaMia.jugadores.filter((id) => M.porId[id]); origenRoster = "tu liga de ESPN"; }
    else { roster = []; origenRoster = "tu lista (vacía por ahora)"; }
  }
  cargarRoster();
  function rosterAAvisos() {
    if (!window.Avisos) return;
    const js = roster.map((id) => M.porId[id]).filter((j) => j && j.eid).map((j) => ({ eid: j.eid, n: j.n, inj: j.espn && j.espn.inj }));
    window.Avisos.mandarRoster(D.temporada, js).catch(() => {});
  }
  const guardarRoster = () => { SY.estado.roster = roster.slice(); SY.guardar(); invalidar(); rosterAAvisos(); };
  const seguido = (id) => SY.estado.seguimiento.some((x) => x.id === id);
  const enRoster = (id) => roster.includes(id);

  // Lista para autocompletar
  const etiqueta = (j) => `${j.n} (${nombrePos(j.pos)}, ${j.t})`;
  const porEtiqueta = {};
  $("#listaJugadores").innerHTML = M.tabla.map((x) => { porEtiqueta[etiqueta(x.j)] = x.j.id; return `<option value="${esc(etiqueta(x.j))}">`; }).join("");
  const desdeEntrada = (v) => porEtiqueta[v] || resolver(v.replace(/\s*\(.*\)$/, ""));

  // Dueño en la liga (si se conectó ESPN)
  const duenoDe = {};
  if (D.liga && D.liga.equipos) D.liga.equipos.forEach((e) => e.jugadores.forEach((id) => (duenoDe[id] = e)));
  // ¿Está libre? Con la liga conectada, de verdad; sin ella, si está en menos de la mitad de las ligas de ESPN
  const esLibre = (id) => !enRoster(id) && (D.liga ? !duenoDe[id] : !M.porId[id].espn || M.porId[id].espn.own < 50);

  // Cambio de valor desde la semana pasada (historial que guarda la actualización diaria)
  function valorPrevio(id) {
    if (!H || !H.valor) return null;
    const w = D.ultimaSemana;
    if (!H.valor[w]) return null;
    return H.valor[w][id] || 0;
  }
  function tendenciaHTML(x) {
    const p = valorPrevio(x.j.id);
    if (p === null) return "";
    const d = x.valor - p;
    if (Math.abs(d) < 2) return `<span class="tend igual" title="Sin cambio desde la semana pasada">=</span>`;
    return d > 0 ? `<span class="tend sube" title="Su valor subió ${d} desde la semana pasada">▲${d}</span>` : `<span class="tend baja" title="Su valor bajó ${-d} desde la semana pasada">▼${-d}</span>`;
  }

  function pintarSubtitulo() {
    $("#subtitulo").textContent =
      `Temporada ${D.temporada} · estadísticas hasta la semana ${D.ultimaSemana} · proyectando la semana ${SEM} · ` +
      `datos del ${D.generado.replace("T", " ")}`;
    const t = $("#estadoEspn");
    if (t) {
      t.className = "tag " + (D.fuenteEspn ? "verde" : "amar");
      t.textContent = D.fuenteEspn ? "ESPN conectado" + (espnVivo ? " · al momento" : "") : "ESPN sin conexión";
      t.title = D.fuenteEspn ? "Lesiones, proyecciones y % en ligas de ESPN" : "No se pudieron leer los datos de ESPN; se usan solo las estadísticas oficiales de la NFL.";
    }
  }

  // ---------------- Pestañas ----------------
  const render = {};
  let actual = new URLSearchParams(location.search).get("tab") || leer("nflf_tab") || "equipo";
  if (actual === "ajustes") actual = "liga";
  function abrir(tab) {
    if (!render[tab]) tab = "equipo";
    actual = tab; guardar("nflf_tab", tab);
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + tab));
    render[tab]();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) { abrir(b.dataset.tab); window.scrollTo(0, 0); } });
  function repintar() { render[actual](); }

  // Explicaciones (?) y enlaces internos
  document.addEventListener("click", (e) => {
    const q = e.target.closest("[data-ayuda]");
    const abierta = $(".globo");
    if (abierta && (!q || abierta.dataset.de !== q.dataset.ayuda)) abierta.remove();
    if (q && !(abierta && abierta.dataset.de === q.dataset.ayuda)) {
      e.stopPropagation();
      const g = document.createElement("div");
      g.className = "globo"; g.dataset.de = q.dataset.ayuda; g.textContent = q.dataset.ayuda;
      document.body.appendChild(g);
      const r = q.getBoundingClientRect();
      const ancho = Math.min(300, window.innerWidth - 24);
      g.style.width = ancho + "px";
      g.style.left = Math.max(12, Math.min(window.innerWidth - ancho - 12, r.left + window.scrollX - ancho / 2)) + "px";
      g.style.top = r.bottom + window.scrollY + 6 + "px";
    }
    const ir = e.target.closest("[data-ir]");
    if (ir) { e.preventDefault(); abrir(ir.dataset.ir); window.scrollTo(0, 0); }
  });

  // ---------------- Cálculos compartidos (se guardan hasta que algo cambie) ----------------
  let cache = {};
  function invalidar() { cache = {}; }
  function recalcularTodo() { M.recalcular(); invalidar(); }
  function varianza(al) {
    return M.sum(al.titulares.filter((t) => t.id).map((t) => { const f = M.porId[t.id].fila; const d = (t.pr && t.pr.disp ? t.pr.disp.f : 1); return (f.sd * d) ** 2; }));
  }
  function rivalDe(w) {
    if (!D.liga || !ligaMia) return null;
    const periodo = periodoDeSemana(w);
    const m = (D.liga.calendario || []).find((c) => c.p === periodo && (c.h === ligaMia.id || c.a === ligaMia.id));
    if (!m) return null;
    const id = m.h === ligaMia.id ? m.a : m.h;
    return D.liga.equipos.find((e) => e.id === id) || null;
  }
  function periodoDeSemana(w) {
    const per = (M.cfg && D.liga && D.liga.cfg && D.liga.cfg.periodos) || null;
    if (per) for (const [p, ws] of Object.entries(per)) if (ws.includes(w)) return +p;
    return w;
  }
  function enfrentamiento(w, rival) {
    const mi = M.alineacion(roster, w);
    if (!rival) return { mi, su: null, p: null };
    const su = M.alineacion(rival.jugadores, w);
    const p = M.phi((mi.pts - su.pts) / Math.sqrt(varianza(mi) + varianza(su) + 1));
    return { mi, su, p };
  }
  function simulacion() {
    if (cache.sim !== undefined) return cache.sim;
    if (!D.liga || !D.liga.equipos || !(D.liga.calendario || []).length) return (cache.sim = null);
    const cfgL = D.liga.cfg || {};
    const liga = {
      equipos: D.liga.equipos.map((e) => ({ id: e.id, jugadores: e.mio ? roster : e.jugadores, w: e.w || 0, pf: e.pf || 0 })),
      calendario: D.liga.calendario, periodos: cfgL.periodos || null,
      lugaresPlayoff: cfgL.lugaresPlayoff || 4, periodoActual: D.liga.periodo || 1,
    };
    try { cache.sim = M.simularLiga(liga, 2500); } catch (e) { console.error(e); cache.sim = null; }
    return cache.sim;
  }
  function rankingRosters() {
    if (cache.rank !== undefined) return cache.rank;
    if (!D.liga || !D.liga.equipos) return (cache.rank = null);
    const filas = D.liga.equipos.map((e) => ({ e, ros: M.puntosRestoTemporada(e.mio ? roster : e.jugadores) })).sort((a, b) => b.ros - a.ros);
    filas.forEach((f, i) => (f.lugar = i + 1));
    return (cache.rank = filas);
  }

  // ---------------- Datos en vivo (ESPN, clima, Sleeper) ----------------
  let espnVivo = false, noticiasCache = {}, sleeper = null, vivo = null, timerVivo = null;
  function aplicarEspnVivo(mapa) {
    let n = 0;
    M.jugadores.forEach((j) => {
      let e = null;
      if (j.pos === "DST") {
        const id = Object.entries({ 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" }).find(([, t]) => t === j.t);
        if (id) e = mapa[-16000 - +id[0]];
        if (e) { j.espn = Object.assign({}, j.espn || {}, { own: e.own, ps: e.ps, pt: e.pt }); n++; }
        return;
      }
      if (j.eid) e = mapa[j.eid];
      if (!e) return;
      j.espn = Object.assign({}, j.espn || {}, { inj: e.inj, own: e.own, ps: e.ps, pt: e.pt, ol: e.ol || (j.espn && j.espn.ol), nd: e.nd });
      n++;
    });
    return n;
  }
  function cargarEnVivo() {
    if (!EL) return;
    // 1) ESPN al momento (lesiones y proyecciones), 2) clima de la semana, 3) tendencias de Sleeper
    EL.espnJugadores(D.temporada, SEM).then((mapa) => {
      if (aplicarEspnVivo(mapa) > 100) { espnVivo = true; D.fuenteEspn = true; recalcularTodo(); pintarSubtitulo(); repintar(); }
    }).catch((e) => console.warn("ESPN al momento:", e.message));
    cargarClima(SEM);
    EL.tendencias().then((t) => { sleeper = t; if (actual === "objetivos" || actual === "jugadores") repintar(); }).catch(() => {});
    revisarVivo();
  }
  const climaPedido = {};
  function cargarClima(w) {
    if (!EL || climaPedido[w]) return;
    climaPedido[w] = true;
    const juegos = M.partidos.filter((g) => g.w === w).map((g) => Object.assign({}, g, { estadio: (D.partidos.find((p) => p[0] === g.id) || [])[11] || "" }));
    EL.clima(juegos).then((c) => {
      const ids = Object.keys(c);
      if (!ids.length) return;
      ids.forEach((id) => M.ponerClima(id, c[id]));
      recalcularTodo(); repintar();
    }).catch(() => {});
  }
  function climaTexto(g) {
    const c = M.clima[g.id];
    if (g.techo === "dome" || g.techo === "closed") return "Techado";
    if (!c) return "";
    const mph = Math.round(c.viento / 1.609), t = Math.round(c.temp);
    const partes = [`${t}°C`, `viento ${mph} mph`];
    if (c.nieve >= 0.3) partes.push("nieve"); else if (c.lluvia >= 0.5) partes.push("lluvia");
    return partes.join(" · ");
  }
  function climaTag(g) {
    const ef = M.efectoClima(g);
    const txt = climaTexto(g);
    if (!txt) return "";
    return `<span class="tag ${ef.nota ? "amar" : "gris"}" title="${ef.nota ? "Puede bajar el juego aéreo y a los pateadores" : "Pronóstico a la hora del partido"}">${ef.nota ? "🌬️ " : ""}${esc(txt)}</span>`;
  }

  // Marcador en vivo de tu alineación
  function revisarVivo() {
    if (!EL) return;
    const hoy = new Date().getDay(); // los partidos son jue, dom, lun (y a veces sáb/vie)
    const hayPartidosCerca = M.partidos.some((g) => { if (g.jugado && g.w < SEM - 1) return false; const ini = EL.inicioUTC(g); return ini && Math.abs(ini - Date.now()) < 6 * 3600000; });
    if (!hayPartidosCerca && ![0, 1, 4].includes(hoy)) return;
    EL.enVivo(D.temporada, null).then((v) => {
      vivo = v;
      if (actual === "equipo") pintarVivo();
      clearTimeout(timerVivo);
      if (v.juegos.some((g) => g.estado === "in")) timerVivo = setTimeout(revisarVivo, 60000);
    }).catch((e) => console.warn("En vivo:", e.message));
  }
  function puntosVivo(j) {
    if (!vivo) return null;
    const pe = vivo.porEquipo[j.t];
    if (!pe) return null;
    const g = pe.g;
    if (g.estado === "pre") return { pts: 0, g, restante: 1 };
    if (j.pos === "DST") {
      const yo = vivo.equipos[j.t], el = vivo.equipos[pe.rival];
      if (!yo || !el) return { pts: 0, g, restante: g.restante };
      const pa = pe.esLocal ? g.away.pts : g.home.pts;
      const f = [0, pe.rival, el.capturas, el.perdidasInt, el.perdidasFum, el.perdidasFum, yo.tdDef, yo.safeties, 0, pa, el.yardas];
      // Los puntos permitidos y yardas solo cuentan completos al final; antes se prorratean
      const parcial = M.puntosDST(f) - (g.restante > 0 ? (M.puntosDST(f) - M.puntosDST([0, 0, el.capturas, el.perdidasInt, el.perdidasFum, el.perdidasFum, yo.tdDef, yo.safeties, 0, 999, 9999])) * g.restante : 0);
      return { pts: parcial, g, restante: g.restante };
    }
    const s = j.eid ? vivo.porEid[j.eid] : null;
    if (!s) return { pts: 0, g, restante: g.restante };
    if (j.pos === "K") return { pts: s.k ? M.puntosK([s.k.fg, Array(s.k.fgFallados).fill(0), s.k.pat, s.k.patFallados]) : 0, g, restante: g.restante, s };
    return { pts: M.puntos(s, j.pos, true), g, restante: g.restante, s };
  }
  function pintarVivo() {
    const el = $("#envivo");
    if (!el || !vivo) return;
    const empezados = vivo.juegos.filter((g) => g.estado !== "pre");
    if (!empezados.length) { el.innerHTML = ""; return; }
    // Semana de los marcadores
    const w = M.partidos.find((g) => vivo.juegos.some((v) => (v.home.t === g.home && v.away.t === g.away)) && Math.abs(new Date(g.fecha) - new Date(vivo.juegos[0].fecha)) < 6 * 86400000);
    const semana = vivo.semana || (w ? w.w : SEM);
    const calc = (ids) => {
      const al = M.alineacion(ids, semana);
      let real = 0, final = 0, varR = 0;
      const filas = al.titulares.map((t) => {
        if (!t.id) return { t, pv: null };
        const j = M.porId[t.id], pv = puntosVivo(j);
        const r = pv ? pv.restante : 1;
        const proy = t.pts || 0;
        const fin = (pv ? pv.pts : 0) + proy * r;
        real += pv ? pv.pts : 0; final += fin;
        varR += ((j.fila ? j.fila.sd : 5) ** 2) * r;
        return { t, j, pv, fin };
      });
      return { filas, real, final, varR };
    };
    const yo = calc(roster);
    const rival = rivalDe(semana);
    const el2 = rival ? calc(rival.jugadores) : null;
    const p = el2 ? M.phi((yo.final - el2.final) / Math.sqrt(yo.varR + el2.varR + 1)) : null;
    const fila = (x) => {
      if (!x.j) return `<tr><td><b>${x.t.slot}</b></td><td class="malo" colspan="3">vacío</td></tr>`;
      const g = x.pv && x.pv.g;
      const est = !g ? "–" : g.estado === "pre" ? "Por jugar" : g.estado === "post" ? "Final" : esc(g.detalle);
      return `<tr class="clic" data-j="${x.j.id}"><td><b>${x.t.slot}</b></td><td>${esc(x.j.n)} <span class="nota">${esc(x.j.t)}</span><div class="nota">${est}</div></td>
        <td class="n grande">${f1(x.pv ? x.pv.pts : 0)}</td><td class="n nota">${f1(x.fin)}</td></tr>`;
    };
    el.innerHTML = `<div class="panel bloque vivo">${titulo(`<span class="punto-vivo"></span> En vivo · semana ${semana}`, "Puntos reales de tu alineación recomendada mientras se juegan los partidos (ESPN), con el puntaje de tu liga. 'Final' estima cómo terminará cada uno: lo que lleva más su proyección para el tiempo que falta. Se actualiza cada minuto.", `<span class="nota">actualizado ${new Date(vivo.hora).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}</span>`)}
      <div class="marcador grande-m">
        <div class="eq">${esc(ligaMia ? ligaMia.nombre : "Tu alineación")}</div><div class="pt">${f1(yo.real)} <span class="nota">→ ${f0(yo.final)}</span></div>
        ${el2 ? `<div class="eq">${esc(rival.nombre)}</div><div class="pt">${f1(el2.real)} <span class="nota">→ ${f0(el2.final)}</span></div>` : ""}
      </div>
      ${p !== null ? `<div class="prob"><i class="h" style="width:${p * 100}%"></i><i class="a" style="width:${(1 - p) * 100}%"></i></div><div class="fila entre mini"><span>Tú ${pct(p)}</span><span>${esc(rival.abrev || rival.nombre)} ${pct(1 - p)}</span></div>` : ""}
      <details class="detalles" open><summary>Tus jugadores</summary><table class="mini"><thead><tr><th>Puesto</th><th>Jugador</th><th class="n">Lleva</th><th class="n">Final</th></tr></thead><tbody>${yo.filas.map(fila).join("")}</tbody></table></details>
      ${el2 ? `<details class="detalles"><summary>Jugadores de ${esc(rival.nombre)}</summary><table class="mini"><tbody>${el2.filas.map(fila).join("")}</tbody></table></details>` : ""}
      <p class="nota">Usa tu alineación recomendada; si alineaste distinto en ESPN, tus puntos reales pueden variar.</p></div>`;
    conectarClics(el);
  }

  // ================= MI EQUIPO =================
  let rivalElegido = null, semEquipo = SEM;
  let comparar = leer("nflf_comparar") || [];
  render.equipo = function () {
    const el = $("#tab-equipo");
    cargarClima(semEquipo);
    const otros = D.liga ? D.liga.equipos.filter((e) => !e.mio) : [];
    let rival = null;
    if (ligaMia) rival = rivalElegido ? otros.find((e) => String(e.id) === String(rivalElegido)) : rivalDe(semEquipo);
    const enf = enfrentamiento(semEquipo, rival);
    const al = enf.mi;
    const sdMia = Math.sqrt(varianza(al));
    // Proyección por semana con rango
    const resto = []; let totalResto = 0;
    for (let w = SEM; w <= ULTIMA; w++) {
      const a = M.alineacion(roster, w), sd = Math.sqrt(varianza(a));
      totalResto += a.pts;
      const byes = roster.filter((id) => M.byes[M.porId[id].t] === w && M.porId[id].pos !== "DST").length;
      resto.push({ x: "S" + w, y: a.pts, lo: Math.max(0, a.pts - 0.85 * sd), hi: a.pts + 0.85 * sd, tipo: "proy", playoff: PLAYOFFS.includes(w),
        nota: byes ? byes + " bye" : "", titulo: `Semana ${w}: ${f1(a.pts)} pts (${f0(a.pts - 0.85 * sd)}–${f0(a.pts + 0.85 * sd)})${byes ? ` · ${byes} en bye` : ""}` });
    }
    // Alertas
    const alertas = [];
    al.titulares.forEach((t) => {
      if (!t.id) { alertas.push(`<li><b>${t.slot}</b>: no tienes a nadie para este puesto.</li>`); return; }
      const d = t.pr.disp;
      if (t.pr.bye) alertas.push(`<li><b>${esc(M.porId[t.id].n)}</b> descansa (bye) esta semana.</li>`);
      else if (d && d.f < 1 && d.nota) alertas.push(`<li><b>${esc(M.porId[t.id].n)}</b>: ${esc(d.nota)}.${d.f < 0.5 ? " Ten listo a un suplente." : ""}</li>`);
    });
    al.banca.forEach((b) => { const d = b.pr.disp; if (d && d.f === 0 && d.nota && !b.pr.bye && /Fuera|IR|lesionados/.test(d.nota)) alertas.push(`<li class="nota">${esc(M.porId[b.id].n)} (banca): ${esc(d.nota)}.</li>`); });
    const sim = simulacion();
    const rank = rankingRosters();
    const miRank = rank && ligaMia ? rank.find((f) => f.e.mio) : null;
    const piso = (x) => Math.max(0, x.pr.pts - 0.85 * M.porId[x.id].fila.sd * (x.pr.disp.f || 0));
    const techo = (x) => x.pr.pts + 0.85 * M.porId[x.id].fila.sd * (x.pr.disp.f || 0);
    const filaAl = (x, banca) => {
      if (!x.id) return `<tr><td><b>${x.slot}</b></td><td colspan="6" class="malo">Sin jugador para este puesto</td></tr>`;
      const j = M.porId[x.id], pr = x.pr;
      const g = pr.g;
      return `<tr class="clic" data-j="${j.id}">
        <td><b>${banca ? "BN" : x.slot}</b></td>
        <td>${jugHTML(j, `<span class="solo-movil-i">${pr.bye ? "BYE" : esc(pr.rival)}</span>`)}${estadoTag(pr) ? `<div class="solo-movil">${estadoTag(pr)}</div>` : ""}</td>
        <td class="ocultar-movil">${pr.bye ? "BYE" : esc(pr.rival)}${g && climaTexto(g) && M.efectoClima(g).nota ? ` <span title="${esc(climaTexto(g))}">🌬️</span>` : ""}</td>
        <td class="n grande">${f1(pr.pts)}</td>
        <td class="n ocultar-movil">${pr.espn !== null && pr.espn !== undefined ? f1(pr.espn) : "–"}</td>
        <td class="n ocultar-movil">${pr.bye || !pr.pts ? "–" : f0(piso(x)) + "–" + f0(techo(x))}</td>
        <td class="ocultar-movil">${estadoTag(pr)}</td>
        <td><button class="x" data-quitar="${j.id}" title="Quitar de mi equipo">×</button></td></tr>`;
    };
    // Fuerza por posición: tu titular vs. el titular promedio de la liga
    const fuerza = ["QB", "RB", "WR", "TE", "K", "DST"].filter((p) => M.cfg.slots[p]).map((p) => {
      const mios = roster.map((id) => M.porId[id].fila).filter((f) => f.j.pos === p).sort((a, b) => b.rosPG - a.rosPG);
      const n = M.cfg.slots[p] || 1;
      const mio = M.mean(mios.slice(0, n).map((f) => f.rosPG).concat(Array(Math.max(0, n - mios.length)).fill(0)));
      const todos = M.tabla.filter((f) => f.j.pos === p).sort((a, b) => b.rosPG - a.rosPG);
      const liga = M.mean(todos.slice(0, M.cfg.equipos * n).map((f) => f.rosPG));
      const r = liga ? mio / liga : 0;
      const clase = r >= 1.1 ? ["verde", "Fuerte"] : r >= 0.93 ? ["azul", "Promedio"] : ["rojo", "Débil"];
      return `<tr><td><span class="pos ${p}">${nombrePos(p)}</span></td><td class="n">${f1(mio)}</td><td class="n">${f1(liga)}</td><td><span class="tag ${clase[0]}">${clase[1]}</span></td></tr>`;
    }).join("");
    const descLiga = [
      ["QB", "RB", "WR", "TE"].filter((p) => M.cfg.slots[p]).map((p) => (M.cfg.slots[p] > 1 ? M.cfg.slots[p] + " " : "") + p).join(", "),
      M.cfg.flexes.map((f) => (f.n > 1 ? f.n + " " : "") + f.nombre).join(", "),
      M.cfg.slots.DST ? "D/ST" : "", M.cfg.slots.K ? "K" : "",
    ].filter(Boolean).join(", ") + ` · ${M.cfg.equipos} equipos · ${M.cfg.pts.rec >= 1 ? "PPR" : M.cfg.pts.rec > 0 ? "medio PPR" : "estándar"}`;

    // Tarjeta principal: tu enfrentamiento
    const selRival = ligaMia ? `<select id="rivalSel"><option value="">Elegir rival…</option>${otros.map((e) => `<option value="${e.id}" ${rival && rival.id === e.id ? "selected" : ""}>${esc(e.nombre)}${e.dueno ? " (" + esc(e.dueno) + ")" : ""}</option>`).join("")}</select>` : "";
    let hero;
    if (rival && enf.su) {
      const p = enf.p;
      const filaR = (t) => t.id ? `<tr class="clic" data-j="${t.id}"><td><b>${t.slot}</b></td><td>${esc(M.porId[t.id].n)} <span class="nota">${esc(M.porId[t.id].t)}</span></td><td class="n">${f1(t.pts)}</td></tr>` : `<tr><td><b>${t.slot}</b></td><td class="malo">vacío</td><td class="n">0</td></tr>`;
      hero = `<div class="hero">
        <div class="fila entre"><div class="hero-t">Semana ${semEquipo}${PLAYOFFS.includes(semEquipo) ? " · playoffs" : ""} ${ayuda("Probabilidad de ganar con tu alineación recomendada contra la alineación proyectada de tu rival, tomando en cuenta qué tanto suele variar cada jugador.")}</div>${selRival}</div>
        <div class="vs">
          <div class="lado ${p >= 0.5 ? "gana" : ""}"><div class="nom">${esc(ligaMia.nombre)}</div><div class="pts">${f1(al.pts)}</div><div class="pr">${pct(p)}</div></div>
          <div class="contra-t">vs</div>
          <div class="lado ${p < 0.5 ? "gana" : ""}"><div class="nom">${esc(rival.nombre)}</div><div class="pts">${f1(enf.su.pts)}</div><div class="pr">${pct(1 - p)}</div></div>
        </div>
        <div class="prob grande-p"><i class="h" style="width:${p * 100}%"></i><i class="a" style="width:${(1 - p) * 100}%"></i></div>
        <div class="hero-n">${p >= 0.65 ? "Vas como favorito claro" : p >= 0.5 ? "Vas ligeramente arriba" : p >= 0.35 ? "Vas ligeramente abajo: revisa el comparador y los waivers" : "Vas abajo: busca puntos en waivers o un cambio de alineación"}</div>
        <details class="detalles"><summary>Alineación proyectada de ${esc(rival.nombre)}</summary><table class="mini"><tbody>${enf.su.titulares.map(filaR).join("")}</tbody></table></details>
      </div>`;
    } else {
      hero = `<div class="hero">
        <div class="fila entre"><div class="hero-t">Semana ${semEquipo}${PLAYOFFS.includes(semEquipo) ? " · playoffs" : ""}</div>${selRival}</div>
        <div class="vs"><div class="lado gana"><div class="nom">Tu alineación</div><div class="pts">${f1(al.pts)}</div><div class="pr">${f0(al.pts - 0.85 * sdMia)}–${f0(al.pts + 0.85 * sdMia)} pts</div></div></div>
        <div class="hero-n">${ligaMia ? "Elige a tu rival para ver tu probabilidad de ganar." : `Conecta tu liga en <a href="#" data-ir="liga">Liga</a> para ver tu probabilidad de ganar cada semana y de llegar a playoffs.`}</div></div>`;
    }

    el.innerHTML = `
      <div class="fila entre"><div><h2>${esc(ligaMia ? ligaMia.nombre : "Mi equipo")}${ligaMia && D.liga.nombre ? " · " + esc(D.liga.nombre) : ""}</h2>
        <p class="nota">Roster de ${origenRoster} · ${esc(descLiga)}</p></div>
        <div>${semanaSelect("semEquipo", semEquipo)}</div></div>
      ${roster.length ? "" : `<div class="ayuda bloque"><b>Para empezar:</b> conecta tu liga de ESPN en <a href="#" data-ir="liga">Liga</a>, o escribe tus jugadores abajo en "Agregar jugador a mi equipo".</div>`}
      ${hero}
      <div class="kpis">
        <div class="kpi"><div class="v">${f1(al.pts)}</div><div class="l">Proyección semana ${semEquipo}</div></div>
        ${sim && ligaMia && sim[ligaMia.id] ? `<div class="kpi"><div class="v">${pct(sim[ligaMia.id].playoffs)}</div><div class="l">Probabilidad de playoffs ${ayuda("Simulamos miles de veces lo que resta de tu temporada regular con las proyecciones de cada equipo de tu liga.")}</div></div>` :
          `<div class="kpi"><div class="v">${f0(totalResto)}</div><div class="l">Resto de temporada (sem ${SEM}–${ULTIMA})</div></div>`}
        ${miRank ? `<div class="kpi"><div class="v">${miRank.lugar}º <span class="de">de ${rank.length}</span></div><div class="l">Tu roster en la liga ${ayuda("Lugar de tu roster por puntos proyectados de aquí al final de la temporada, contra los otros equipos de tu liga.")}</div></div>` :
          `<div class="kpi"><div class="v">${f0(M.sum(roster.map((id) => M.porId[id].fila.valor)))}</div><div class="l">Valor de trade del roster</div></div>`}
        <div class="kpi"><div class="v ${alertas.length ? "malo" : ""}">${alertas.length}</div><div class="l">Alertas esta semana</div></div>
      </div>
      ${alertas.length ? `<div class="panel bloque alertas">${titulo("⚠️ Revisa antes de alinear")}<ul>${alertas.join("")}</ul></div>` : ""}
      <div id="envivo"></div>
      <div class="grid2 bloque">
        <div class="panel">${titulo(`Alineación recomendada · semana ${semEquipo}`, "Los titulares que más puntos proyectan esta semana. Proy = proyección del modelo (mezclada con la de ESPN cuando existe). Rango = de una semana mala a una buena (8 de cada 10 semanas caen ahí).")}
          <div class="tabla-scroll"><table class="alin">
            <thead><tr><th>Puesto</th><th>Jugador</th><th class="ocultar-movil">Rival</th><th class="n">Proy</th><th class="n ocultar-movil">ESPN</th><th class="n ocultar-movil">Rango</th><th class="ocultar-movil">Estado</th><th></th></tr></thead>
            <tbody>${al.titulares.map((x) => filaAl(x)).join("")}
            <tr><td colspan="8" class="sep">Banca</td></tr>
            ${al.banca.map((x) => filaAl(x, true)).join("")}</tbody></table></div>
          <div class="fila" style="margin-top:10px"><input type="text" id="agregar" list="listaJugadores" placeholder="Agregar jugador a mi equipo…" style="flex:1;min-width:200px">
            <button class="btn" id="btnAgregar">Agregar</button>
            <button class="sec" id="btnRestaurar" title="Deshacer tus cambios al roster">Restaurar</button></div>
        </div>
        <div>
          <div class="panel" id="comparador"></div>
          <div class="panel" id="noticiasRoster">${titulo("📰 Noticias de tu roster", "Las notas más recientes de Rotowire (vía ESPN) sobre tus jugadores. Vienen en inglés; toca Traducir para verlas en español.")}<div class="vacio">${roster.length ? "Cargando noticias…" : "Agrega jugadores para ver sus noticias."}</div></div>
        </div>
      </div>
      <div class="grid2 bloque">
        <div class="panel">${titulo("Proyección de tu alineación por semana", "Barra = puntos proyectados de tu mejor alineación cada semana. La línea muestra el rango de semana mala a buena. Las semanas sombreadas son los playoffs de fantasy. Abajo se marca cuántos de tus jugadores descansan (bye).")}${graficaSVG(resto)}</div>
        <div class="panel">${titulo("Fuerza por posición (resto de temporada)", `Tus titulares contra el titular promedio de una liga de ${M.cfg.equipos} equipos. Las posiciones débiles son las que conviene reforzar con un trade o waivers.`)}
          <table class="mini"><thead><tr><th>Pos</th><th class="n">Tus pts/sem</th><th class="n">Titular promedio</th><th></th></tr></thead><tbody>${fuerza}</tbody></table></div>
      </div>`;
    $("#semEquipo").onchange = (e) => { semEquipo = +e.target.value; rivalElegido = null; render.equipo(); };
    if ($("#rivalSel")) $("#rivalSel").onchange = (e) => { rivalElegido = e.target.value || null; render.equipo(); };
    const agregar = () => { const id = desdeEntrada($("#agregar").value); if (id && !enRoster(id)) { roster.push(id); guardarRoster(); render.equipo(); } };
    $("#btnAgregar").onclick = agregar;
    $("#agregar").onkeydown = (e) => { if (e.key === "Enter") agregar(); };
    $("#btnRestaurar").onclick = () => { SY.estado.roster = null; SY.guardar(); cargarRoster(); invalidar(); render.equipo(); };
    el.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); roster = roster.filter((id) => id !== b.dataset.quitar); guardarRoster(); render.equipo(); }));
    pintarComparador();
    pintarNoticiasRoster();
    pintarVivo();
    conectarClics(el);
  };

  // ¿A quién alineo?
  function pintarComparador() {
    const el = $("#comparador");
    if (!el) return;
    comparar = comparar.filter((id) => M.porId[id]).slice(0, 4);
    let res = "";
    if (comparar.length >= 2) {
      const r = M.compararJugadores(comparar, semEquipo);
      const mejor = r.slice().sort((a, b) => b.pMejor - a.pMejor)[0];
      const dv = M.dvp().equipos;
      res = `<div class="tabla-scroll"><table class="mini comp"><thead><tr><th>Jugador</th><th>Rival</th><th class="n">Proy</th><th class="n">Rango</th><th>¿Quién hace más?</th></tr></thead><tbody>${r.map((x) => {
        const j = M.porId[x.id], pr = x.pr, g = pr.g;
        const op = g ? (g.home === j.t ? g.away : g.home) : null;
        const d = op && dv[op] && dv[op][j.pos];
        const dTag = d ? (d.rank <= 8 ? `<span class="tag verde" title="Esta defensa es de las que más puntos permite a ${j.pos}">fácil</span>` : d.rank >= 25 ? `<span class="tag rojo" title="Esta defensa es de las que menos puntos permite a ${j.pos}">difícil</span>` : "") : "";
        return `<tr class="${x === mejor ? "elegido" : ""}"><td class="clic" data-j="${j.id}">${jugHTML(j)}${estadoTag(pr) ? "<div>" + estadoTag(pr) + "</div>" : ""}</td>
          <td>${pr.bye ? "BYE" : esc(pr.rival)} ${dTag} ${g ? climaTag(g) : ""}</td>
          <td class="n grande">${f1(x.mu)}</td><td class="n">${pr.bye ? "–" : f0(x.piso) + "–" + f0(x.techo)}</td>
          <td><div class="fila" style="gap:6px;flex-wrap:nowrap"><div class="barra" style="flex:1"><i style="width:${x.pMejor * 100}%"></i></div><b>${pct(x.pMejor)}</b></div></td></tr>`;
      }).join("")}</tbody></table></div>
      <p class="veredicto-c">✅ Alinea a <b>${esc(M.porId[mejor.id].n)}</b>: hace más puntos que ${comparar.length === 2 ? "el otro" : "los demás"} en ${pct(mejor.pMejor)} de las simulaciones.</p>`;
    }
    const sugeridos = roster.filter((id) => !comparar.includes(id) && ["RB", "WR", "TE", "QB"].includes(M.porId[id].pos)).slice(0, 12);
    el.innerHTML = `${titulo("🤔 ¿A quién alineo?", "Compara de 2 a 4 jugadores para esta semana: proyección, rango, qué tan fácil es su rival para su posición y el clima. Simulamos la semana miles de veces para ver quién hace más puntos.")}
      <div class="chips">${comparar.map((id) => `<span class="chip">${esc(M.porId[id].n)} <button class="x" data-cquitar="${id}">×</button></span>`).join("")}</div>
      ${comparar.length < 4 ? `<div class="fila" style="gap:8px;margin:8px 0"><input type="text" id="compIn" list="listaJugadores" placeholder="Agregar jugador a comparar…" style="flex:1;min-width:160px"><button class="btn" id="compAdd">Agregar</button></div>` : ""}
      ${sugeridos.length && comparar.length < 4 ? `<div class="nota">De tu equipo:</div><div class="chips">${sugeridos.map((id) => `<button class="sec chico" data-cadd="${id}">${esc(M.porId[id].n)}</button>`).join("")}</div>` : ""}
      ${res || `<p class="nota">${comparar.length === 1 ? "Agrega al menos un jugador más." : "Elige dos o más jugadores (por ejemplo, tus opciones para el FLEX)."}</p>`}`;
    const add = (id) => { if (id && !comparar.includes(id) && comparar.length < 4) { comparar.push(id); guardar("nflf_comparar", comparar); pintarComparador(); } };
    if ($("#compAdd")) { $("#compAdd").onclick = () => add(desdeEntrada($("#compIn").value)); $("#compIn").onkeydown = (e) => { if (e.key === "Enter") add(desdeEntrada(e.target.value)); }; }
    el.querySelectorAll("[data-cadd]").forEach((b) => (b.onclick = () => add(b.dataset.cadd)));
    el.querySelectorAll("[data-cquitar]").forEach((b) => (b.onclick = () => { comparar = comparar.filter((x) => x !== b.dataset.cquitar); guardar("nflf_comparar", comparar); pintarComparador(); }));
    conectarClics(el);
  }

  const traducir = (t) => `https://translate.google.com/?sl=en&tl=es&op=translate&text=${encodeURIComponent(t.slice(0, 1500))}`;
  const haceCuanto = (ms) => {
    if (!ms) return "";
    const h = (Date.now() - ms) / 3600000;
    return h < 1 ? "hace un momento" : h < 24 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} d`;
  };
  function pintarNoticiasRoster() {
    const el = $("#noticiasRoster");
    if (!el || !roster.length || !EL) return;
    const ids = roster.filter((id) => M.porId[id].eid);
    const pendientes = ids.filter((id) => noticiasCache[M.porId[id].eid] === undefined);
    const dibujar = () => {
      const items = ids.map((id) => ({ j: M.porId[id], n: noticiasCache[M.porId[id].eid] })).filter((x) => x.n && x.n.titular)
        .sort((a, b) => (b.n.fecha || 0) - (a.n.fecha || 0)).slice(0, 8);
      const cuerpo = items.length ? `<ul class="noticias">${items.map((x) => `<li><div class="fila entre" style="gap:6px"><span class="clic" data-j="${x.j.id}"><b>${esc(x.j.n)}</b> <span class="nota">${esc(x.j.t)}</span></span><span class="nota">${haceCuanto(x.n.fecha)}</span></div>
          <div>${esc(x.n.titular)}</div><div class="nota">${esc(x.n.historia.slice(0, 220))}${x.n.historia.length > 220 ? "…" : ""} <a href="${traducir(x.n.titular + " " + x.n.historia)}" target="_blank" rel="noopener">Traducir</a></div></li>`).join("")}</ul>` :
        `<div class="vacio">${pendientes.length ? "Cargando noticias…" : "No encontré noticias recientes de tus jugadores."}</div>`;
      el.innerHTML = titulo("📰 Noticias de tu roster", "Las notas más recientes de Rotowire (vía ESPN) sobre tus jugadores. Vienen en inglés; toca Traducir para verlas en español.") + cuerpo;
      conectarClics(el);
    };
    dibujar();
    if (pendientes.length) EL.noticias(pendientes.map((id) => M.porId[id].eid), 4).then((r) => {
      Object.assign(noticiasCache, r);
      if ($("#noticiasRoster") === el) dibujar();
    }).catch(() => {});
  }

  // ================= PARTIDOS =================
  let semPartidos = SEM, vistaPartidos = "juegos", posDvp = "WR";
  render.partidos = function () {
    const el = $("#tab-partidos");
    cargarClima(semPartidos);
    const pest = `<div class="seg">${[["juegos", "Partidos"], ["dvp", "Defensa vs. posición"], ["precision", "Qué tan bien predice"]].map(([k, t]) => `<button class="${vistaPartidos === k ? "on" : ""}" data-vp="${k}">${t}</button>`).join("")}</div>`;
    let cuerpo = "";
    if (vistaPartidos === "juegos") cuerpo = vistaJuegos();
    else if (vistaPartidos === "dvp") cuerpo = vistaDvp();
    else cuerpo = vistaPrecision();
    el.innerHTML = pest + cuerpo;
    el.querySelectorAll("[data-vp]").forEach((b) => (b.onclick = () => { vistaPartidos = b.dataset.vp; render.partidos(); }));
    if ($("#semPartidos")) $("#semPartidos").onchange = (e) => { semPartidos = +e.target.value; render.partidos(); };
    if ($("#posDvp")) $("#posDvp").onchange = (e) => { posDvp = e.target.value; render.partidos(); };
    conectarClics(el);
  };
  function vistaJuegos() {
    const juegos = M.partidos.filter((g) => g.w === semPartidos).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const byes = M.TEAMS.filter((t) => !M.partidoDe[t + "|" + semPartidos]);
    const clave = (t, g) => {
      const js = M.jugadores.filter((j) => j.t === t && j.pos !== "K" && j.pos !== "DST").map((j) => ({ j, pr: M.proyectarPartido(j, g) }))
        .filter((x) => x.pr.disp.f > 0);
      const top = (pos, k, campo) => js.filter((x) => x.j.pos === pos).sort((a, b) => b.pr.s[campo] - a.pr.s[campo]).slice(0, k);
      const rec = js.filter((x) => x.j.pos === "WR" || x.j.pos === "TE").sort((a, b) => b.pr.s.recyd - a.pr.s.recyd).slice(0, 3);
      return top("QB", 1, "pyd").concat(top("RB", 2, "ryd"), rec);
    };
    const hj = H && H.juegos ? H.juegos[semPartidos] || {} : {};
    const tarjeta = (g) => {
      // Para partidos ya jugados se muestra lo que el modelo predijo ANTES del partido
      const pre = g.jugado && hj[g.id];
      const pr = M.predecirPartido(g);
      const pH = pre ? pre[0] : pr.pHome, pa = pre ? pre[1] : pr.away.pts, ph = pre ? pre[2] : pr.home.pts;
      const favorito = pH >= 0.5 ? g.home : g.away;
      const p = Math.round(Math.max(pH, 1 - pH) * 100);
      const mios = roster.filter((id) => { const j = M.porId[id]; return j.t === g.home || j.t === g.away; }).map((id) => M.porId[id].n);
      const lineaApuestas = g.spread !== null ? `Línea: ${g.spread > 0 ? g.home + " -" + g.spread : g.spread < 0 ? g.away + " -" + Math.abs(g.spread) : "pick"} · O/U ${g.total}` : "Sin línea de apuestas todavía";
      const tablaEq = `<table class="mini"><thead><tr><th></th><th class="n">${g.away}</th><th class="n">${g.home}</th></tr></thead><tbody>
        <tr><td>Yardas por pase</td><td class="n">${f0(pr.away.py)}</td><td class="n">${f0(pr.home.py)}</td></tr>
        <tr><td>Yardas por tierra</td><td class="n">${f0(pr.away.ry)}</td><td class="n">${f0(pr.home.ry)}</td></tr>
        <tr><td>Yardas totales</td><td class="n">${f0(pr.away.py + pr.away.ry)}</td><td class="n">${f0(pr.home.py + pr.home.ry)}</td></tr>
        <tr><td>TD por pase</td><td class="n">${f1(pr.away.ptd)}</td><td class="n">${f1(pr.home.ptd)}</td></tr>
        <tr><td>TD por tierra</td><td class="n">${f1(pr.away.rtd)}</td><td class="n">${f1(pr.home.rtd)}</td></tr></tbody></table>`;
      const jugTabla = (t) => `<table class="mini"><tbody>${clave(t, g).map((x) =>
        `<tr class="clic" data-j="${x.j.id}"><td><span class="pos ${x.j.pos}">${x.j.pos}</span> ${esc(x.j.n)}${enRoster(x.j.id) ? " ⭐" : ""}</td><td>${linea(x.pr.s, x.j.pos)}</td><td class="n fuerte">${f1(x.pr.pts)}</td></tr>`).join("")}</tbody></table>`;
      const real = g.jugado ? `<div class="nota" style="margin-top:6px">Final: <b>${g.away} ${g.as} – ${g.home} ${g.hs}</b> · ${pre ? "antes del partido el modelo daba" : "el modelo da"} ganador a ${favorito} (${(pH >= 0.5) === (g.hs > g.as) ? '<span class="bueno">✓ acertó</span>' : '<span class="malo">✗ falló</span>'})</div>` : "";
      return `<div class="juego">
        <div class="cab"><span>${fechaCorta(g)}</span><span>${esc(lineaApuestas)}</span></div>
        <div class="marcador">
          <div class="eq ${pH < 0.5 ? "gana" : ""}">${esc(M.EQUIPOS[g.away])}</div><div class="pt ${pH < 0.5 ? "gana" : ""}">${f0(pa)}</div>
          <div class="eq ${pH >= 0.5 ? "gana" : ""}">@ ${esc(M.EQUIPOS[g.home])}</div><div class="pt ${pH >= 0.5 ? "gana" : ""}">${f0(ph)}</div>
        </div>
        <div class="prob"><i class="a" style="width:${(1 - pH) * 100}%"></i><i class="h" style="width:${pH * 100}%"></i></div>
        <div class="fila entre mini"><span>${g.away} ${Math.round((1 - pH) * 100)}%</span><span><b>Gana ${favorito}</b> (${p}%)</span><span>${g.home} ${Math.round(pH * 100)}%</span></div>
        ${!g.jugado && climaTag(g) ? `<div style="margin-top:6px">${climaTag(g)}</div>` : ""}
        ${mios.length ? `<div class="mini" style="margin-top:6px">⭐ Tus jugadores: ${mios.map(esc).join(", ")}</div>` : ""}
        ${real}
        <details class="detalles"><summary>Yardas, TDs y jugadores clave</summary>
          ${tablaEq}<h3 style="margin-top:10px">${g.away}</h3>${jugTabla(g.away)}<h3 style="margin-top:10px">${g.home}</h3>${jugTabla(g.home)}
        </details></div>`;
    };
    return `<div class="fila entre bloque"><div><h2>Predicciones de la semana ${semPartidos}</h2>
      <p class="nota">Marcador esperado ${ayuda("Combina el rendimiento de cada ofensiva y defensa (ajustado por la calidad de sus rivales) con la línea de las casas de apuestas cuando existe. El clima (viento, lluvia, nieve) baja el juego aéreo y a los pateadores.")} ${byes.length ? "· Descansan: " + byes.join(", ") : ""}</p></div>
      <div>${semanaSelect("semPartidos", semPartidos)}</div></div>
      <div class="grid3 bloque">${juegos.map(tarjeta).join("") || `<div class="vacio">No hay partidos esta semana.</div>`}</div>`;
  }
  function vistaDvp() {
    const dv = M.dvp();
    const color = (r) => r >= 1.15 ? "c-facil2" : r >= 1.05 ? "c-facil" : r <= 0.85 ? "c-dificil2" : r <= 0.95 ? "c-dificil" : "";
    const filas = M.TEAMS.slice().sort((a, b) => dv.equipos[b][posDvp].ratio - dv.equipos[a][posDvp].ratio).map((t) => {
      const e = dv.equipos[t];
      return `<tr><td><b>${t}</b> <span class="nota ocultar-movil">${esc(M.EQUIPOS[t])}</span></td>${["QB", "RB", "WR", "TE"].map((p) => `<td class="n ${color(e[p].ratio)} ${p === posDvp ? "fuerte" : ""}" title="${f1(e[p].ppg)} pts por partido a ${p} (${e[p].rank}º que más permite)">${f1(e[p].ppg)}<span class="rk">${e[p].rank}</span></td>`).join("")}</tr>`;
    }).join("");
    // Calendario de playoffs: qué rivales tiene cada equipo NFL en las semanas de playoffs de fantasy
    const po = PLAYOFFS.filter((w) => w <= M.SEMANAS);
    const cal = M.TEAMS.map((t) => {
      const rivales = po.map((w) => { const g = M.partidoDe[t + "|" + w]; if (!g) return { w, op: null }; const op = g.home === t ? g.away : g.home; return { w, op, casa: g.home === t, r: dv.equipos[op][posDvp].ratio }; });
      const prom = M.mean(rivales.filter((x) => x.op).map((x) => x.r));
      return { t, rivales, prom };
    }).sort((a, b) => b.prom - a.prom);
    return `<div class="fila entre bloque"><div><h2>Defensa vs. posición</h2>
        <p class="nota">Puntos de fantasy por partido que permite cada defensa a cada posición (con el puntaje de tu liga). Verde = rival fácil, rojo = difícil. El número chico es su lugar (1 = la que más permite). ${ayuda("Sirve para elegir a quién alinear o qué defensa/QB tomar de waivers: un jugador contra una defensa en verde suele rendir más de lo normal.")}</p></div>
        <div><select id="posDvp">${["QB", "RB", "WR", "TE"].map((p) => `<option ${p === posDvp ? "selected" : ""}>${p}</option>`).join("")}</select></div></div>
      <div class="grid2 anchas bloque">
        <div class="panel"><div class="tabla-scroll"><table class="mini dvp"><thead><tr><th>Defensa</th><th class="n">QB</th><th class="n">RB</th><th class="n">WR</th><th class="n">TE</th></tr></thead><tbody>${filas}</tbody></table></div></div>
        <div class="panel">${titulo(`Calendario de playoffs para ${posDvp} (semanas ${po.join(", ")})`, `Qué tan fáciles son los rivales de cada equipo NFL para ${posDvp} en las semanas de playoffs de tu liga. Útil para planear trades: busca jugadores de los equipos de arriba.`)}
          <div class="tabla-scroll"><table class="mini dvp"><thead><tr><th>Equipo</th>${po.map((w) => `<th class="n">S${w}</th>`).join("")}<th class="n">Promedio</th></tr></thead><tbody>
          ${cal.map((c) => `<tr><td><b>${c.t}</b></td>${c.rivales.map((r) => r.op ? `<td class="n ${color(r.r)}">${r.casa ? "" : "@"}${r.op}</td>` : `<td class="n nota">BYE</td>`).join("")}<td class="n ${color(c.prom)} fuerte">${pct(c.prom - 1).replace(/^(\d)/, "+$1")}</td></tr>`).join("")}
          </tbody></table></div></div>
      </div>`;
  }
  function vistaPrecision() {
    if (!H || !H.proy) return `<div class="vacio bloque">Todavía no hay historial de proyecciones. Se genera con la actualización automática diaria.</div>`;
    const semanas = Object.keys(H.proy).map(Number).filter((w) => w <= D.ultimaSemana).sort((a, b) => a - b);
    const filas = semanas.map((w) => {
      // Jugadores: error promedio contra los puntos reales (solo los relevantes, proyección de 5+)
      let e = 0, n = 0, eE = 0, nE = 0, eV = 0, nV = 0;
      const espn = (H.espn || {})[w] || {}, vivoW = (H.vivo || {})[w] || {};
      M.tabla.forEach((x) => {
        const real = x.reales.find((r) => r.w === w);
        const pr = H.proy[w][x.j.id];
        if (!real || pr === undefined || pr < 5) return;
        e += Math.abs(pr - real.pts); n++;
        if (espn[x.j.id] !== undefined) { eE += Math.abs(espn[x.j.id] - real.pts); nE++; }
        if (vivoW[x.j.id] !== undefined) { eV += Math.abs(vivoW[x.j.id] - real.pts); nV++; }
      });
      // Partidos: ganador acertado y error del marcador
      const js = M.partidos.filter((g) => g.w === w && g.jugado), hj = (H.juegos || {})[w] || {};
      let ok = 0, tot = 0, eM = 0;
      js.forEach((g) => { const p = hj[g.id]; if (!p) return; tot++; if ((p[0] >= 0.5) === (g.hs > g.as)) ok++; eM += Math.abs(p[1] - g.as) + Math.abs(p[2] - g.hs); });
      return { w, mae: n ? e / n : null, n, maeE: nE ? eE / nE : null, maeV: nV ? eV / nV : null, ok, tot, eM: tot ? eM / (2 * tot) : null };
    });
    const tOk = M.sum(filas.map((f) => f.ok)), tTot = M.sum(filas.map((f) => f.tot));
    const conN = filas.filter((f) => f.mae !== null);
    const maeT = conN.length ? M.sum(conN.map((f) => f.mae * f.n)) / M.sum(conN.map((f) => f.n)) : null;
    const conE = filas.filter((f) => f.maeE !== null);
    return `<div class="bloque"><h2>Qué tan bien predice</h2>
      <p class="nota">Compara lo que el modelo proyectaba <b>antes</b> de cada semana contra lo que pasó. ${ayuda("Error promedio = cuántos puntos se equivocó en promedio por jugador (solo jugadores con proyección de 5 o más). Entre más bajo, mejor. Las proyecciones de ESPN se guardan desde que la actualización automática empezó a registrarlas.")}</p></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${tTot ? pct(tOk / tTot) : "–"}</div><div class="l">Ganadores acertados (${tOk} de ${tTot})</div></div>
        <div class="kpi"><div class="v">${f1(maeT)}</div><div class="l">Error promedio por jugador (pts)</div></div>
        <div class="kpi"><div class="v">${conE.length ? f1(M.mean(conE.map((f) => f.maeE))) : "–"}</div><div class="l">Error promedio de ESPN (pts)</div></div>
        <div class="kpi"><div class="v">${f1(M.mean(filas.filter((f) => f.eM !== null).map((f) => f.eM)))}</div><div class="l">Error en el marcador por equipo (pts)</div></div>
      </div>
      <div class="panel"><div class="tabla-scroll"><table class="mini"><thead><tr><th>Semana</th><th class="n">Ganadores</th><th class="n">Error marcador</th><th class="n">Error por jugador</th><th class="n">Con lesiones al día</th><th class="n">ESPN</th><th class="n">Jugadores</th></tr></thead><tbody>
      ${filas.slice().reverse().map((f) => `<tr><td>${f.w}</td><td class="n">${f.tot ? f.ok + "/" + f.tot : "–"}</td><td class="n">${f1(f.eM)}</td><td class="n fuerte">${f1(f.mae)}</td><td class="n">${f1(f.maeV)}</td><td class="n">${f1(f.maeE)}</td><td class="n">${f.n}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="nota">"Error por jugador" en semanas pasadas se recalcula con los datos que había antes de esa semana (sin saber de lesiones). "Con lesiones al día" y "ESPN" son las proyecciones guardadas justo antes de los partidos; empiezan a llenarse desde esta semana.</p></div>`;
  }

  // ================= JUGADORES =================
  const filtroJ = Object.assign({ pos: "TODOS", texto: "", orden: "valor", asc: false, equipo: "", libres: false, pagina: 0 }, leer("nflf_filtro") || {});
  const POR_PAGINA = 25;
  render.jugadores = function () {
    const el = $("#tab-jugadores");
    const cols = [
      ["rankPos", "Rk", (x) => x.rankPos, ""], ["ppg", "Pts/PJ", (x) => x.ppg, "ocultar-movil"], ["ultimas3", "Últ. 3", (x) => x.ultimas3, "ocultar-movil"],
      ["sem", "Proy S" + SEM, (x) => x.sem.pts, ""], ["ros", "Resto", (x) => x.ros, ""], ["playoffs", "Playoffs", (x) => x.playoffs, "ocultar-movil"],
      ["valor", "Valor", (x) => x.valor, ""], ["tend", "Tend.", (x) => { const p = valorPrevio(x.j.id); return p === null ? 0 : x.valor - p; }, ""],
      ["own", "% ligas", (x) => (x.j.espn ? x.j.espn.own : 0), "ocultar-movil"], ["calendario", "Calend.", (x) => x.calendario, "ocultar-movil"],
    ];
    const get = Object.fromEntries(cols.map((c) => [c[0], c[2]]));
    let filas = M.tabla.filter((x) => (filtroJ.pos === "TODOS" || x.j.pos === filtroJ.pos) &&
      (!filtroJ.equipo || x.j.t === filtroJ.equipo) &&
      (!filtroJ.texto || x.j.n.toLowerCase().includes(filtroJ.texto.toLowerCase())) && (x.j.gp || x.ros > 0) &&
      (!filtroJ.libres || esLibre(x.j.id)));
    const g = get[filtroJ.orden] || get.valor;
    filas.sort((a, b) => (filtroJ.asc ? 1 : -1) * (g(a) - g(b)) || b.ros - a.ros);
    const total = filas.length, paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    filtroJ.pagina = Math.min(filtroJ.pagina || 0, paginas - 1);
    filas = filas.slice(filtroJ.pagina * POR_PAGINA, (filtroJ.pagina + 1) * POR_PAGINA);
    const calTag = (c) => c >= 1.06 ? `<span class="tag verde">Fácil</span>` : c <= 0.94 ? `<span class="tag rojo">Difícil</span>` : `<span class="tag gris">Normal</span>`;
    const tSl = (j) => (sleeper && j.sl && sleeper.alta[j.sl] >= 500 ? ` <span class="tag verde" title="Agregado ${sleeper.alta[j.sl].toLocaleString("es-MX")} veces en Sleeper en las últimas 24 h">🔥</span>` : "");
    const pag = `<div class="fila entre paginacion"><span class="nota">${total ? `${filtroJ.pagina * POR_PAGINA + 1}–${Math.min(total, (filtroJ.pagina + 1) * POR_PAGINA)} de ${total}` : "Sin resultados"}</span>
      <div class="fila" style="gap:6px"><button class="sec" data-pag="-1" ${filtroJ.pagina === 0 ? "disabled" : ""}>‹ Anterior</button><button class="sec" data-pag="1" ${filtroJ.pagina >= paginas - 1 ? "disabled" : ""}>Siguiente ›</button></div></div>`;
    el.innerHTML = `<div class="fila entre"><h2>Jugadores ${ayuda('Puntos con el puntaje de tu liga. "Valor" (0–100) es su valor de trade: lo que aportará el resto de la temporada por encima de un jugador que encontrarías en agentes libres. "Tend." es cuánto cambió su valor desde la semana pasada. 🔥 = de los más agregados hoy en Sleeper.')}</h2>
      <div class="fila filtros">
        <input type="search" id="buscar" placeholder="Buscar jugador…" value="${esc(filtroJ.texto)}">
        <select id="fPos">${["TODOS", ...M.POS].map((p) => `<option ${p === filtroJ.pos ? "selected" : ""} value="${p}">${p === "TODOS" ? "Todas las posiciones" : nombrePos(p)}</option>`).join("")}</select>
        <select id="fEq"><option value="">Todos los equipos</option>${M.TEAMS.map((t) => `<option ${t === filtroJ.equipo ? "selected" : ""}>${t}</option>`).join("")}</select>
        <label class="check"><input type="checkbox" id="fLibres" ${filtroJ.libres ? "checked" : ""}> Solo agentes libres</label>
      </div></div>
      ${filtroJ.libres && !D.liga ? `<p class="nota">Sin tu liga conectada, "libre" = está en menos de la mitad de las ligas de ESPN.</p>` : ""}
      <div class="panel bloque">${pag}<table class="tabla-jug">
        <thead><tr><th>Jugador</th>${cols.map((c) => `<th class="n ord ${c[3]}" data-o="${c[0]}">${c[1]}${filtroJ.orden === c[0] ? (filtroJ.asc ? " ▲" : " ▼") : ""}</th>`).join("")}<th class="ocultar-movil">Estado</th></tr></thead>
        <tbody>${filas.map((x) => `<tr class="clic" data-j="${x.j.id}">
          <td class="c-jug">${jugHTML(x.j, (enRoster(x.j.id) ? "⭐ tuyo" : duenoDe[x.j.id] ? esc(duenoDe[x.j.id].abrev || duenoDe[x.j.id].nombre) : "")) + tSl(x.j)}${estadoTag(x.sem) ? `<div class="solo-movil">${estadoTag(x.sem)}</div>` : ""}</td>
          <td class="n" data-l="Rk">${nombrePos(x.j.pos)}${x.rankPos}</td><td class="n ocultar-movil">${f1(x.ppg)}</td><td class="n ocultar-movil">${f1(x.ultimas3)}</td>
          <td class="n fuerte" data-l="Proy S${SEM}">${x.sem.bye ? "BYE" : f1(x.sem.pts)}</td><td class="n" data-l="Resto">${f0(x.ros)}</td><td class="n ocultar-movil">${f0(x.playoffs)}</td>
          <td class="n" data-l="Valor"><div class="fila" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap"><div class="barra ocultar-movil" style="width:50px"><i style="width:${x.valor}%"></i></div>${x.valor}</div></td>
          <td class="n" data-l="Tend.">${tendenciaHTML(x)}</td>
          <td class="n ocultar-movil">${x.j.espn ? f0(x.j.espn.own) + "%" : "–"}</td>
          <td class="n ocultar-movil">${calTag(x.calendario)}</td><td class="ocultar-movil">${estadoTag(x.sem)}</td></tr>`).join("")}</tbody></table>${pag}</div>`;
    const re = (reiniciar) => { if (reiniciar) filtroJ.pagina = 0; guardar("nflf_filtro", filtroJ); render.jugadores(); };
    $("#buscar").oninput = (e) => { filtroJ.texto = e.target.value; clearTimeout(re.t); re.t = setTimeout(() => { re(true); const b = $("#buscar"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }, 250); };
    $("#fPos").onchange = (e) => { filtroJ.pos = e.target.value; re(true); };
    $("#fEq").onchange = (e) => { filtroJ.equipo = e.target.value; re(true); };
    $("#fLibres").onchange = (e) => { filtroJ.libres = e.target.checked; re(true); };
    el.querySelectorAll("[data-pag]").forEach((b) => (b.onclick = () => { filtroJ.pagina += +b.dataset.pag; re(); el.scrollIntoView({ block: "start" }); }));
    el.querySelectorAll("th.ord").forEach((th) => (th.onclick = () => {
      if (filtroJ.orden === th.dataset.o) filtroJ.asc = !filtroJ.asc; else { filtroJ.orden = th.dataset.o; filtroJ.asc = th.dataset.o === "rankPos"; }
      re(true);
    }));
    conectarClics(el);
  };

  // ================= DETALLE DE JUGADOR =================
  function usoHTML(j) {
    const u = j.uso;
    if (!u || j.pos === "K" || j.pos === "DST") return "";
    const filasU = u.filas.slice(-6);
    const fl = (x) => (x.length ? x : []);
    const tend = u.tendencia;
    const flecha = Math.abs(tend) < 0.05 ? "" : tend > 0 ? `<span class="tend sube">▲ ${Math.round(tend * 100)} pts</span>` : `<span class="tend baja">▼ ${Math.round(-tend * 100)} pts</span>`;
    const ts = j.base && j.base.ts ? Math.round(j.base.ts * 100) + "%" : "–";
    return `<h3 style="margin-top:14px">Uso ${ayuda("Qué tanto lo usa su equipo. % de snaps = jugadas ofensivas en las que estuvo en el campo. Zona roja = jugadas dentro de la yarda 20 rival, donde salen la mayoría de los TDs. Si su uso sube en las últimas semanas, su proyección también sube.")}</h3>
      <div class="kpis chicos">
        <div class="kpi"><div class="v">${pct(u.snapUlt)}</div><div class="l">Snaps (últimos 2) ${flecha}</div></div>
        <div class="kpi"><div class="v">${j.pos === "QB" ? f1(j.base.att) : ts}</div><div class="l">${j.pos === "QB" ? "Pases intentados por partido" : "De los pases de su equipo"}</div></div>
        <div class="kpi"><div class="v">${f1(u.rzCar + u.rzTgt)}</div><div class="l">Jugadas en zona roja por partido</div></div>
        <div class="kpi"><div class="v">${j.base ? f0(j.base.ay) : "–"}</div><div class="l">Air yards por partido</div></div>
      </div>
      <div class="tabla-scroll"><table class="mini"><thead><tr><th>Sem</th><th class="n">% snaps</th><th class="n">Acarreos ZR</th><th class="n">Targets ZR</th><th class="n">Acarreos en la 5</th></tr></thead><tbody>
      ${fl(filasU).map((x) => `<tr><td>${x[0]}</td><td class="n">${pct(x[1])}</td><td class="n">${x[2]}</td><td class="n">${x[3]}</td><td class="n">${x[4]}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function detalle(id) {
    const j = M.porId[id], x = j.fila;
    const aj = SY.estado.ajustes[id];
    const reales = x.reales;
    const barras = [];
    for (let w = 1; w <= ULTIMA; w++) {
      const r = reales.find((y) => y.w === w);
      const fut = x.futuros.find((y) => y.g.w === w);
      if (r) barras.push({ x: w, y: r.pts, tipo: "real", titulo: `S${w} vs ${r.rival}: ${f1(r.pts)} pts` });
      else if (fut) barras.push({ x: w, y: fut.pts, tipo: "proy", playoff: PLAYOFFS.includes(w), titulo: `S${w} ${fut.rival}: proyección ${f1(fut.pts)}` });
      else barras.push({ x: w, y: 0, tipo: "bye", playoff: PLAYOFFS.includes(w), titulo: M.byes[j.t] === w ? "Descanso" : "No jugó" });
    }
    let tablaReal = "";
    if (j.pos === "DST") {
      tablaReal = `<thead><tr><th>Sem</th><th>Rival</th><th class="n">Sacks</th><th class="n">INT</th><th class="n">FR</th><th class="n">TD</th><th class="n">Pts perm.</th><th class="n">Pts</th></tr></thead><tbody>${reales.map((r) =>
        `<tr><td>${r.w}</td><td>${r.rival}</td><td class="n">${r.f[2]}</td><td class="n">${r.f[3]}</td><td class="n">${r.f[4]}</td><td class="n">${r.f[6]}</td><td class="n">${r.f[9]}</td><td class="n fuerte">${f1(r.pts)}</td></tr>`).join("")}</tbody>`;
    } else if (j.pos === "K") {
      tablaReal = `<thead><tr><th>Sem</th><th>Rival</th><th>FG anotados</th><th class="n">FG fallados</th><th class="n">PAT</th><th class="n">Pts</th></tr></thead><tbody>${reales.map((r) =>
        `<tr><td>${r.w}</td><td>${r.rival}</td><td>${r.k[2].join(", ") || "–"}</td><td class="n">${r.k[3].length}</td><td class="n">${r.k[4]}/${r.k[4] + r.k[5]}</td><td class="n fuerte">${f1(r.pts)}</td></tr>`).join("")}</tbody>`;
    } else {
      const qb = j.pos === "QB";
      tablaReal = `<thead><tr><th>Sem</th><th>Rival</th>${qb ? `<th class="n">Comp/Int</th><th class="n">Yd pase</th><th class="n">TD</th><th class="n">INT</th>` : `<th class="n">Obj</th><th class="n">Rec</th><th class="n">Yd rec</th>`}<th class="n">Acarreos</th><th class="n">Yd carrera</th>${qb ? "" : `<th class="n">TD</th>`}<th class="n">Pts</th></tr></thead><tbody>${reales.map((r) => {
        const s = r.s;
        return `<tr><td>${r.w}</td><td>${r.rival}</td>${qb ? `<td class="n">${s.cmp}/${s.att}</td><td class="n">${s.pyd}</td><td class="n">${s.ptd}</td><td class="n">${s.int}</td>` : `<td class="n">${s.tgt}</td><td class="n">${s.rec}</td><td class="n">${s.recyd}</td>`}<td class="n">${s.car}</td><td class="n">${s.ryd}</td>${qb ? "" : `<td class="n">${s.rtd + s.rectd}</td>`}<td class="n fuerte">${f1(r.pts)}</td></tr>`;
      }).join("")}</tbody>`;
    }
    const dv = M.dvp().equipos;
    const futuras = x.futuros.slice(0, 13).map((p) => {
      const op = p.g.home === j.t ? p.g.away : p.g.home;
      const d = ["QB", "RB", "WR", "TE"].includes(j.pos) && dv[op] ? dv[op][j.pos] : null;
      return `<tr><td>${p.g.w}${PLAYOFFS.includes(p.g.w) ? " 🏆" : ""}</td><td>${esc(p.rival)}${d ? ` <span class="nota" title="Lugar de su defensa en puntos permitidos a ${j.pos} (1 = la que más permite)">(${d.rank}º)</span>` : ""}</td><td>${linea(p.s, j.pos)}</td><td class="n fuerte">${f1(p.pts)}</td><td>${estadoTag(p)}</td></tr>`;
    }).join("");
    const tdNota = j.base && x.j.gp >= 3 ? (x.tdReal - x.tdEsp >= 1.5 ? `<span class="tag amar">Ha anotado ${f1(x.tdReal - x.tdEsp)} TDs más de lo que sus yardas sugieren (posible baja)</span>` :
      x.tdEsp - x.tdReal >= 1.5 ? `<span class="tag verde">Ha anotado ${f1(x.tdEsp - x.tdReal)} TDs menos de lo esperado (posible alza)</span>` : "") : "";
    const rol = j.factorRol && Math.abs(j.factorRol - 1) >= 0.05 ? `<span class="tag ${j.factorRol > 1 ? "verde" : "amar"}">${j.factorRol > 1 ? "Rol en aumento" : "Rol a la baja"} (snaps recientes)</span>` : "";
    const ol = j.espn && j.espn.ol ? `<div class="ayuda bloque"><b>Análisis de ESPN para la semana ${SEM}</b> <span class="nota">(en inglés)</span><p style="margin:6px 0 0">${esc(j.espn.ol)}</p><a class="nota" href="${traducir(j.espn.ol)}" target="_blank" rel="noopener">Traducir</a></div>` : "";
    const vPrev = valorPrevio(id);
    $("#modalCuerpo").innerHTML = `
      <div class="fila">${avatar(j, true)}<div><h2>${esc(j.n)}</h2>
        <div class="nota"><span class="pos ${j.pos}">${nombrePos(j.pos)}</span> ${esc(M.EQUIPOS[j.t] || j.t)} · descansa la semana ${M.byes[j.t] || "–"}
        ${j.espn ? ` · en el ${j.espn.own}% de las ligas de ESPN` : ""}${duenoDe[id] ? " · equipo: " + esc(duenoDe[id].nombre) : ""}</div>
        <div style="margin-top:6px">${estadoTag(x.sem)} ${tdNota} ${rol}</div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${f1(x.ppg)}</div><div class="l">Pts por partido (${j.gp} PJ)</div></div>
        <div class="kpi"><div class="v">${x.sem.bye ? "BYE" : f1(x.sem.pts)}</div><div class="l">Proyección semana ${SEM}${x.sem.espn ? " (ESPN: " + f1(x.sem.espn) + ")" : ""}</div></div>
        <div class="kpi"><div class="v">${f0(x.ros)}</div><div class="l">Resto de temporada (${x.juegosRest} partidos)</div></div>
        <div class="kpi"><div class="v">${x.valor} ${tendenciaHTML(x)}</div><div class="l">Valor de trade · ${nombrePos(j.pos)}${x.rankPos}${vPrev !== null ? ` (antes ${vPrev})` : ""}</div></div>
      </div>
      <div id="notaJugador"></div>
      ${ol}
      <h3>Puntos por semana <span class="nota">(azul = real, claro = proyección, sombreado = playoffs)</span></h3>${graficaSVG(barras, 150)}
      ${usoHTML(j)}
      ${reales.length ? `<h3 style="margin-top:14px">Partidos jugados</h3><div class="tabla-scroll"><table class="mini">${tablaReal}</table></div>` : ""}
      <h3 style="margin-top:14px">Próximos partidos</h3>
      <div class="tabla-scroll"><table class="mini"><thead><tr><th>Sem</th><th>Rival</th><th>Proyección</th><th class="n">Pts</th><th></th></tr></thead><tbody>${futuras}</tbody></table></div>
      <div class="fila" style="margin-top:14px">
        ${enRoster(id) ? `<button class="sec" data-acc="quitar">Quitar de mi equipo</button><button class="sec" data-acc="dar">Ofrecerlo en un trade</button>` :
          `<button class="sec" data-acc="agregar">Agregar a mi equipo</button><button class="sec" data-acc="pedir">Pedirlo en un trade</button>`}
        <button class="sec" data-acc="comparar">Comparar</button>
        <button class="sec" data-acc="seguir">${seguido(id) ? "★ Dejar de seguir" : "☆ Seguir"}</button>
      </div>
      ${j.pos === "DST" ? "" : `<details class="detalles" ${aj ? "open" : ""}><summary>Corregir su estado (lesión, regreso, suspensión)</summary>
        <p class="nota">Si sabes algo que ESPN todavía no refleja, ajústalo aquí y todas las proyecciones lo tomarán en cuenta.</p>
        <div class="fila">
          <select id="ajEst">${[["", "Sin ajuste (usar ESPN)"], ["activo", "Juega normal"], ["q", "Cuestionable"], ["d", "Dudoso"], ["out", "Fuera esta semana"], ["ir", "Fuera varias semanas"]]
            .map(([v, t]) => `<option value="${v}" ${(aj ? aj.est : "") === v ? "selected" : ""}>${t}</option>`).join("")}</select>
          <label class="nota" id="ajHastaL" ${aj && aj.est === "ir" ? "" : "hidden"}>hasta la semana <input type="number" id="ajHasta" min="${SEM}" max="18" value="${aj && aj.hasta ? aj.hasta : SEM + 3}" style="width:70px"></label>
          <input type="text" id="ajNota" placeholder="Nota (opcional)" value="${esc(aj && aj.nota ? aj.nota : "")}" style="flex:1;min-width:160px">
          <button class="btn" id="ajGuardar">Guardar</button>
        </div></details>`}`;
    $("#modal").hidden = false;
    // Última noticia (Rotowire vía ESPN)
    if (EL && j.eid) {
      const pintar = (n) => {
        const box = $("#notaJugador");
        if (!box || !n || (!n.titular && !n.temporada)) return;
        box.innerHTML = `<div class="ayuda bloque noticia">${n.titular ? `<div class="fila entre"><b>Última noticia</b><span class="nota">${haceCuanto(n.fecha)} · Rotowire</span></div><p style="margin:6px 0 0"><b>${esc(n.titular)}</b></p><p class="nota" style="margin:4px 0 0">${esc(n.historia)}</p>` : ""}
          ${n.temporada ? `<details class="detalles"><summary>Perspectiva de temporada (ESPN)</summary><p class="nota">${esc(n.temporada)}</p></details>` : ""}
          <a class="nota" href="${traducir((n.titular || "") + " " + (n.historia || n.temporada || ""))}" target="_blank" rel="noopener">Traducir al español</a></div>`;
      };
      if (noticiasCache[j.eid] !== undefined) pintar(noticiasCache[j.eid]);
      else EL.noticia(j.eid).then((n) => { noticiasCache[j.eid] = n; if (!$("#modal").hidden) pintar(n); }).catch(() => {});
    }
    if ($("#ajEst")) {
      $("#ajEst").onchange = (e) => ($("#ajHastaL").hidden = e.target.value !== "ir");
      $("#ajGuardar").onclick = () => {
        const est = $("#ajEst").value;
        if (!est) delete SY.estado.ajustes[id];
        else SY.estado.ajustes[id] = { est, nota: $("#ajNota").value.trim(), hasta: est === "ir" ? +$("#ajHasta").value : null, fecha: new Date().toISOString().slice(0, 10) };
        SY.guardar();
        recalcularTodo();
        detalle(id);
      };
    }
    $("#modalCuerpo").querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => {
      const a = b.dataset.acc;
      if (a === "seguir") {
        const L = SY.estado.seguimiento;
        if (seguido(id)) SY.estado.seguimiento = L.filter((z) => z.id !== id);
        else L.push({ id, nota: "", fecha: new Date().toISOString().slice(0, 10) });
        SY.guardar(); detalle(id); repintar(); return;
      }
      if (a === "comparar") { if (!comparar.includes(id)) { comparar.push(id); comparar = comparar.slice(-4); guardar("nflf_comparar", comparar); } $("#modal").hidden = true; abrir("equipo"); setTimeout(() => { const c = $("#comparador"); if (c) c.scrollIntoView({ behavior: "smooth" }); }, 50); return; }
      if (a === "quitar") roster = roster.filter((r) => r !== id);
      if (a === "agregar" && !enRoster(id)) roster.push(id);
      if (a === "quitar" || a === "agregar") guardarRoster();
      if (a === "dar" && !trade.doy.includes(id)) trade.doy.push(id);
      if (a === "pedir" && !trade.recibo.includes(id)) trade.recibo.push(id);
      $("#modal").hidden = true;
      abrir(a === "dar" || a === "pedir" ? "trades" : actual);
    }));
  }
  function abrirModalHTML(html) { $("#modalCuerpo").innerHTML = html; $("#modal").hidden = false; }
  $("#cerrarModal").onclick = () => ($("#modal").hidden = true);
  $("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").hidden = true; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#modal").hidden = true; });
  function conectarClics(el) {
    el.querySelectorAll("[data-j]").forEach((tr) => (tr.onclick = (e) => { if (e.target.closest("button, a, input, select")) return; detalle(tr.dataset.j); }));
  }

  // ================= TRADES =================
  const trade = { doy: [], recibo: [] };
  let vistaTrades = "analizar", posValores = "TODOS";
  // Señales de que un jugador probablemente baje (para no pagar de más)
  function razonesVenta(x) {
    const r = [];
    if (x.tdReal - x.tdEsp >= 1.2) r.push(`ha anotado ~${f1(x.tdReal - x.tdEsp)} TDs más de lo que sus yardas sugieren`);
    if (x.calendario <= 0.95) r.push("calendario difícil lo que resta");
    if (x.ultimas3 > x.ppg + 3) r.push("viene de semanas muy altas");
    if (x.j.factorRol && x.j.factorRol < 0.95) r.push("está jugando menos snaps");
    if (x.j.base && x.j.pos !== "QB" && x.j.base.ts < 0.15 && x.j.pos !== "RB") r.push("pocos pases dirigidos para su producción");
    return r;
  }
  function razonesCompra(x) {
    const r = [];
    if (x.tdEsp - x.tdReal >= 1.2) r.push(`le han faltado ~${f1(x.tdEsp - x.tdReal)} TDs para lo que produce en yardas`);
    if (x.j.base && x.j.base.ts >= 0.22) r.push(`recibe el ${Math.round(x.j.base.ts * 100)}% de los pases de su equipo`);
    if (x.j.base && x.j.base.car >= 15) r.push(`${f1(x.j.base.car)} acarreos por partido`);
    if (x.j.factorRol && x.j.factorRol > 1.05) r.push("su uso va en aumento");
    if (x.calendario >= 1.05) r.push("calendario fácil lo que resta");
    if (x.ultimas3 < x.ppg - 3) r.push("viene de semanas flojas");
    if (x.j.prev && x.j.prev.g >= 8 && x.j.base) {
      const pp = M.puntos(Object.fromEntries(D.stats.map((k, i) => [k, x.j.prev.s[i] || 0])), x.j.pos, false);
      if (pp > x.ppg + 2) r.push(`el año pasado promedió ${f1(pp)} pts`);
    }
    return r;
  }
  render.trades = function () {
    const el = $("#tab-trades");
    const pest = `<div class="seg">${[["analizar", "Analizar un trade"], ["valores", "Tabla de valores"]].map(([k, t]) => `<button class="${vistaTrades === k ? "on" : ""}" data-vt="${k}">${t}</button>`).join("")}</div>`;
    if (vistaTrades === "valores") { el.innerHTML = pest + tablaValores(); conectarTrades(el); return; }
    const lado = (clave, tit) => {
      const ids = trade[clave];
      return `<div class="panel">${titulo(tit)}
        <div class="fila"><input type="text" list="listaJugadores" id="in-${clave}" placeholder="Escribe un jugador…" style="flex:1;min-width:180px"><button class="btn" data-add="${clave}">Agregar</button></div>
        <ul class="lista-trade">${ids.map((id) => { const x = M.porId[id].fila; return `<li><div class="clic" data-j="${id}" style="cursor:pointer">${jugHTML(x.j, "resto: " + f0(x.ros) + " pts")}</div>
          <div class="fila" style="gap:8px"><span class="fuerte">${x.valor}</span>${tendenciaHTML(x)}<button class="x" data-del="${clave}" data-id="${id}">×</button></div></li>`; }).join("") || `<li class="nota">Nadie todavía</li>`}</ul>
        ${clave === "doy" ? (roster.length ? `<div class="nota">De tu equipo:</div><div class="chips">${roster.filter((id) => !trade.doy.includes(id)).map((id) => `<button class="sec chico" data-rap="doy" data-id="${id}">${esc(M.porId[id].n)}</button>`).join("")}</div>` : `<p class="nota">Agrega tu roster en Mi equipo para ver el impacto en tu alineación.</p>`) : ""}
        ${clave === "recibo" && D.liga ? `<div class="nota">Roster de otro equipo:</div><select id="otroEquipo"><option value="">Elegir equipo…</option>${D.liga.equipos.filter((e) => !e.mio).map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</select><div class="chips" id="chipsOtro"></div>` : ""}
      </div>`;
    };
    let res = "";
    if (trade.doy.length && trade.recibo.length) {
      // ¿De qué equipo son los que recibo? Si todos son del mismo, se calcula su lado también
      const duenos = Array.from(new Set(trade.recibo.map((id) => duenoDe[id] && !duenoDe[id].mio ? duenoDe[id].id : null)));
      const otro = duenos.length === 1 && duenos[0] !== null ? D.liga.equipos.find((e) => e.id === duenos[0]) : null;
      const r = M.evaluarTrade(trade.doy, trade.recibo, roster.some((id) => trade.doy.includes(id)) ? roster : null, otro ? otro.jugadores : null);
      const max = Math.max(r.vD, r.vR, 1);
      const imp = r.impacto ? `<p style="margin-top:10px"><b>Tu alineación:</b> ${r.impacto.dif >= 0 ? `<span class="bueno fuerte">+${f1(r.impacto.porSemana)} pts por semana</span>` : `<span class="malo fuerte">${f1(r.impacto.porSemana)} pts por semana</span>`}
        (${f0(r.impacto.antes)} → ${f0(r.impacto.luego)} pts de aquí al final). Considera a quién pondrías de titular cada semana, descansos y lesiones.</p>` : "";
      const impO = r.impactoOtro ? `<p><b>Para ${esc(otro.nombre)}:</b> ${r.impactoOtro.dif >= 0 ? `<span class="bueno fuerte">+${f1(r.impactoOtro.porSemana)}</span>` : `<span class="malo fuerte">${f1(r.impactoOtro.porSemana)}</span>`} pts por semana en su alineación.
        <span class="tag ${r.acepta >= 0.5 ? "verde" : r.acepta >= 0.3 ? "amar" : "rojo"}">Probabilidad de que acepte: ${pct(r.acepta)}</span> ${ayuda("Estimación: sube si el trade le da valor parecido o mayor y mejora su alineación. Es una guía; cada persona negocia distinto.")}</p>` :
        D.liga ? "" : `<p class="nota">Conecta tu liga para ver también cuánto gana o pierde el otro equipo y qué tan probable es que acepte.</p>`;
      const recibeMejor = Math.max(...trade.recibo.map((id) => M.porId[id].fila.valor)) > Math.max(...trade.doy.map((id) => M.porId[id].fila.valor));
      const playD = M.sum(trade.doy.map((id) => M.porId[id].fila.playoffs)), playR = M.sum(trade.recibo.map((id) => M.porId[id].fila.playoffs));
      const avisos = trade.recibo.map((id) => { const x = M.porId[id].fila; const rz = razonesVenta(x); return rz.length && x.ppg - x.rosPG >= 1.5 ? `<li>⚠️ <b>${esc(x.j.n)}</b>: ${esc(rz.join("; "))}. Probablemente baje.</li>` : ""; }).join("")
        + trade.doy.map((id) => { const x = M.porId[id].fila; const rz = razonesCompra(x); return rz.length && x.rosPG - x.ppg >= 1.5 ? `<li>💡 <b>${esc(x.j.n)}</b> podría subir: ${esc(rz.join("; "))}.</li>` : ""; }).join("");
      res = `<div class="veredicto ${r.clase}"><h3>${r.veredicto}</h3>
        <div class="grid2" style="margin-top:10px">
          <div><div class="nota">Valor que das</div><div class="fila"><div class="barra" style="flex:1"><i style="width:${(r.vD / max) * 100}%;background:var(--rojo)"></i></div><b>${f0(r.vD)}</b></div></div>
          <div><div class="nota">Valor que recibes</div><div class="fila"><div class="barra" style="flex:1"><i style="width:${(r.vR / max) * 100}%"></i></div><b>${f0(r.vR)}</b></div></div>
        </div>${imp}${impO}
        ${avisos ? `<ul class="avisos">${avisos}</ul>` : ""}
        <p class="nota" style="margin-top:8px">${recibeMejor ? "Recibes al mejor jugador del trade; eso suele valer más que varias piezas medianas. " : "Das al mejor jugador del trade; asegúrate de que lo que recibes llene una necesidad real. "}
        Playoffs de fantasy (semanas ${PLAYOFFS.join(", ")}): das ${f0(playD)} pts proyectados y recibes ${f0(playR)}.</p></div>`;
    }
    el.innerHTML = `${pest}<h2>Analizar un trade ${ayuda("El veredicto compara el valor de cada lado: lo que aportarán el resto de la temporada por encima de un jugador de reemplazo (las piezas extra valen menos porque ocupan lugar en el roster). Si das jugadores de tu equipo, también calcula cuántos puntos por semana ganarías o perderías en tu alineación.")}</h2>
      <div class="lados bloque">${lado("doy", "Tú das")}${lado("recibo", "Tú recibes")}</div>${res}
      ${trade.doy.length || trade.recibo.length ? `<div class="fila" style="margin-top:12px">
        ${trade.doy.length && trade.recibo.length ? `<input type="text" id="notaTrade" placeholder="Nota: con quién, qué te contestaron…" style="flex:1;min-width:200px"><button class="btn" id="guardarTrade">Guardar trade</button>` : ""}
        <button class="sec" id="limpiarTrade">Limpiar</button></div>` : ""}
      ${guardadosHTML()}`;
    const add = (clave) => { const id = desdeEntrada($("#in-" + clave).value); if (id && !trade[clave].includes(id)) { trade[clave].push(id); render.trades(); } };
    el.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => add(b.dataset.add)));
    ["doy", "recibo"].forEach((c) => ($("#in-" + c).onkeydown = (e) => { if (e.key === "Enter") add(c); }));
    el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { trade[b.dataset.del] = trade[b.dataset.del].filter((i) => i !== b.dataset.id); render.trades(); }));
    el.querySelectorAll("[data-rap]").forEach((b) => (b.onclick = () => { trade[b.dataset.rap].push(b.dataset.id); render.trades(); }));
    if ($("#limpiarTrade")) $("#limpiarTrade").onclick = () => { trade.doy = []; trade.recibo = []; render.trades(); };
    if ($("#guardarTrade")) $("#guardarTrade").onclick = () => {
      SY.estado.trades.unshift({ id: "t" + Date.now(), doy: trade.doy.slice(), recibo: trade.recibo.slice(), nota: $("#notaTrade").value.trim(), fecha: new Date().toISOString().slice(0, 10) });
      SY.guardar(); render.trades();
    };
    el.querySelectorAll("[data-tcargar]").forEach((b) => (b.onclick = () => {
      const t = SY.estado.trades.find((z) => z.id === b.dataset.tcargar);
      if (t) { trade.doy = t.doy.filter((i) => M.porId[i]); trade.recibo = t.recibo.filter((i) => M.porId[i]); render.trades(); window.scrollTo(0, 0); }
    }));
    el.querySelectorAll("[data-tborrar]").forEach((b) => (b.onclick = () => {
      if (b.dataset.seguro !== "1") { b.dataset.seguro = "1"; b.textContent = "¿Seguro? Toca otra vez"; return; }
      SY.estado.trades = SY.estado.trades.filter((z) => z.id !== b.dataset.tborrar); SY.guardar(); render.trades();
    }));
    el.querySelectorAll("[data-tnota]").forEach((inp) => (inp.onchange = () => {
      const t = SY.estado.trades.find((z) => z.id === inp.dataset.tnota);
      if (t) { t.nota = inp.value.trim(); SY.guardar(); }
    }));
    if ($("#otroEquipo")) $("#otroEquipo").onchange = (e) => {
      const eq = D.liga.equipos.find((x) => String(x.id) === e.target.value);
      $("#chipsOtro").innerHTML = eq ? eq.jugadores.filter((id) => M.porId[id] && !trade.recibo.includes(id)).map((id) => `<button class="sec chico" data-id="${id}">${esc(M.porId[id].n)}</button>`).join("") : "";
      $("#chipsOtro").querySelectorAll("button").forEach((b) => (b.onclick = () => { trade.recibo.push(b.dataset.id); render.trades(); }));
    };
    conectarTrades(el);
  };
  function conectarTrades(el) {
    el.querySelectorAll("[data-vt]").forEach((b) => (b.onclick = () => { vistaTrades = b.dataset.vt; render.trades(); }));
    if ($("#posValores")) $("#posValores").onchange = (e) => { posValores = e.target.value; render.trades(); };
    el.querySelectorAll("[data-tpedir]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); if (!trade.recibo.includes(b.dataset.tpedir)) trade.recibo.push(b.dataset.tpedir); vistaTrades = "analizar"; render.trades(); window.scrollTo(0, 0); }));
    conectarClics(el);
  }
  function tablaValores() {
    const filas = M.tabla.filter((x) => x.valor > 0 && (posValores === "TODOS" || x.j.pos === posValores) && x.j.pos !== "K").slice(0, 80);
    const hay = valorPrevio(filas[0] && filas[0].j.id) !== null;
    return `<div class="fila entre bloque"><div><h2>Tabla de valores de trade</h2>
        <p class="nota">Valor de 0 a 100 con el puntaje de tu liga, y cuánto cambió desde la semana pasada. ${ayuda("Como la tabla semanal de FantasyPros o KeepTradeCut: un trade es justo si el valor que das y el que recibes es parecido. El valor mide lo que aportará el jugador de aquí al final de la temporada por encima de alguien de waivers, así que las lesiones y el calendario lo mueven.")}</p></div>
        <select id="posValores">${["TODOS", "QB", "RB", "WR", "TE", "DST"].map((p) => `<option value="${p}" ${p === posValores ? "selected" : ""}>${p === "TODOS" ? "Todas" : nombrePos(p)}</option>`).join("")}</select></div>
      <div class="panel"><div class="tabla-scroll"><table class="mini"><thead><tr><th class="n">#</th><th>Jugador</th><th class="n">Valor</th><th class="n">${hay ? "Cambio" : ""}</th><th class="n ocultar-movil">Resto</th><th class="n ocultar-movil">Playoffs</th><th></th></tr></thead><tbody>
      ${filas.map((x, i) => `<tr class="clic" data-j="${x.j.id}"><td class="n nota">${i + 1}</td><td>${jugHTML(x.j, enRoster(x.j.id) ? "⭐ tuyo" : duenoDe[x.j.id] ? esc(duenoDe[x.j.id].abrev || duenoDe[x.j.id].nombre) : "")}</td>
        <td class="n"><div class="fila" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap"><div class="barra ocultar-movil" style="width:70px"><i style="width:${x.valor}%"></i></div><b>${x.valor}</b></div></td>
        <td class="n">${tendenciaHTML(x)}</td><td class="n ocultar-movil">${f0(x.ros)}</td><td class="n ocultar-movil">${f0(x.playoffs)}</td>
        <td>${enRoster(x.j.id) ? "" : `<button class="sec chico" data-tpedir="${x.j.id}">Pedir</button>`}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }

  function guardadosHTML() {
    const L = SY.estado.trades;
    if (!L.length) return `<div class="panel bloque">${titulo("Trades guardados")}<p class="nota">Cuando analices un trade, guárdalo con una nota para revisarlo después desde cualquier dispositivo.</p></div>`;
    return `<div class="panel bloque">${titulo("Trades guardados")}<div class="tabla-scroll"><table class="mini"><thead><tr><th>Das</th><th>Recibes</th><th>Hoy</th><th>Nota</th><th></th></tr></thead><tbody>${L.map((t) => {
      const doy = t.doy.filter((i) => M.porId[i]), rec = t.recibo.filter((i) => M.porId[i]);
      const r = doy.length && rec.length ? M.evaluarTrade(doy, rec, null) : null;
      return `<tr><td>${doy.map((i) => esc(M.porId[i].n)).join(", ")}</td><td>${rec.map((i) => esc(M.porId[i].n)).join(", ")}</td>
        <td>${r ? `<span class="tag ${r.clase === "justo" ? "azul" : r.clase === "favor" ? "verde" : "rojo"}">${esc(r.veredicto.split(" (")[0])}</span>` : "–"}<div class="nota">${esc(t.fecha || "")}</div></td>
        <td><input type="text" data-tnota="${t.id}" value="${esc(t.nota || "")}" placeholder="Agregar nota" style="width:100%;min-width:140px"></td>
        <td><div class="fila" style="gap:6px;flex-wrap:nowrap"><button class="sec" data-tcargar="${t.id}">Abrir</button><button class="sec" data-tborrar="${t.id}">Borrar</button></div></td></tr>`;
    }).join("")}</tbody></table></div></div>`;
  }

  // ================= MOVIMIENTOS =================
  function calcularWaivers() {
    const base = M.puntosRestoTemporada(roster);
    const candidatos = M.tabla.filter((x) => esLibre(x.j.id) && x.ros > 0).sort((a, b) => b.rosPG - a.rosPG).slice(0, 70);
    const agregar = [];
    const minimo = Math.max(3, 0.5 * Math.max(1, ULTIMA - SEM + 1)); // al menos medio punto por semana
    candidatos.forEach((x) => {
      let mejor = null;
      roster.forEach((d) => {
        const gana = M.puntosRestoTemporada(roster.filter((r) => r !== d).concat([x.j.id])) - base;
        if (gana > minimo && (!mejor || gana > mejor.gana)) mejor = { add: x.j.id, drop: d, gana };
      });
      if (mejor) agregar.push(mejor);
    });
    agregar.sort((a, b) => b.gana - a.gana);
    const soltar = roster.map((id) => ({ id, aporta: base - M.puntosRestoTemporada(roster.filter((r) => r !== id)) }))
      .sort((a, b) => a.aporta - b.aporta).slice(0, 5);
    return { agregar: agregar.slice(0, 10), soltar };
  }
  function calcularSugerencias() {
    const base = M.puntosRestoTemporada(roster);
    const mios = roster.filter((id) => M.porId[id].fila.valor > 0);
    const combos = [];
    mios.forEach((a, i) => { combos.push([a]); mios.slice(i + 1).forEach((b) => combos.push([a, b])); });
    const objetivos = M.tabla.filter((x) => !enRoster(x.j.id) && x.valor >= 8 && x.j.pos !== "K" && (!D.liga || duenoDe[x.j.id])).slice(0, 70);
    const out = [];
    objetivos.forEach((t) => {
      let mejor = null;
      combos.forEach((c) => {
        const vD = M.valorLado(c), vR = t.valor;
        if (vD < vR * 0.98 || vD > vR * 1.25) return; // trade que el otro equipo podría aceptar
        const despues = roster.filter((id) => !c.includes(id)).concat([t.j.id]);
        const gana = M.puntosRestoTemporada(despues) - base;
        if (gana > 4 && (!mejor || gana > mejor.gana)) mejor = { objetivo: t.j.id, doy: c, gana, vD, vR };
      });
      if (mejor) out.push(mejor);
    });
    out.sort((a, b) => b.gana - a.gana);
    return out.slice(0, 10);
  }
  // Oferta sugerida de FAAB: según cuántos puntos por semana suma y lo que le queda de presupuesto
  function ofertaFaab(ganaSem) {
    const fa = M.cfg.faab;
    if (!fa || !ligaMia) return null;
    const queda = Math.max(0, fa.presupuesto - (ligaMia.faabGastado || 0));
    if (!queda) return { queda, min: 0, max: 0 };
    const semanasRest = Math.max(1, M.cfg.temporadaRegular - SEM + 1);
    const p = M.clamp(0.035 * Math.pow(Math.max(0, ganaSem), 1.35) * (10 / (semanasRest + 6)) * 1.6, 0.01, 0.6);
    const min = Math.max(fa.minimo || 0, Math.round(queda * p * 0.75)), max = Math.max(min, Math.round(queda * p * 1.25));
    return { queda, min, max };
  }
  // Qué posiciones le faltan y le sobran a cada equipo de la liga, para encontrar trades
  function necesidadesLiga() {
    if (!D.liga || !D.liga.equipos) return [];
    const POSS = ["QB", "RB", "WR", "TE"];
    const fila = (id) => M.porId[id] && M.porId[id].fila;
    const prom = {};
    POSS.forEach((p) => {
      const n = M.cfg.slots[p] || 1;
      prom[p] = M.mean(M.tabla.filter((f) => f.j.pos === p).sort((a, b) => b.rosPG - a.rosPG).slice(0, M.cfg.equipos * n).map((f) => f.rosPG));
    });
    const analizar = (ids) => {
      const r = {};
      POSS.forEach((p) => {
        const n = M.cfg.slots[p] || 1;
        const js = ids.map(fila).filter((f) => f && f.j.pos === p).sort((a, b) => b.rosPG - a.rosPG);
        const tit = js.slice(0, n), banca = js.slice(n);
        const ratio = prom[p] ? M.mean(tit.map((f) => f.rosPG).concat(Array(Math.max(0, n - tit.length)).fill(0))) / prom[p] : 1;
        const sobra = banca.filter((f) => f.rosPG >= prom[p] * 0.8 && f.valor >= 5);
        r[p] = { ratio, tit, banca, sobra };
      });
      return r;
    };
    const yo = analizar(roster);
    const misSobrantes = (p) => {
      const x = yo[p];
      return x.banca.filter((f) => f.valor >= 3).concat(x.ratio >= 1.15 && x.banca.length ? x.tit.slice(-1) : []);
    };
    return D.liga.equipos.filter((e) => !e.mio).map((e) => {
      const a = analizar(e.jugadores);
      const necesita = POSS.filter((p) => a[p].ratio < 0.93).sort((x, y) => a[x].ratio - a[y].ratio);
      const sobra = POSS.filter((p) => a[p].sobra.length || a[p].ratio >= 1.12);
      let idea = null;
      const misDebiles = POSS.filter((p) => yo[p].ratio < 1).sort((x, y) => yo[x].ratio - yo[y].ratio);
      for (const pn of necesita) {
        const doy = misSobrantes(pn).sort((x, y) => y.valor - x.valor)[0];
        if (!doy) continue;
        for (const pm of misDebiles.concat(POSS.filter((p) => !misDebiles.includes(p)))) {
          if (pm === pn) continue;
          const cand = (a[pm].sobra.length ? a[pm].sobra : a[pm].ratio >= 1.12 ? a[pm].tit.slice(-1) : [])
            .filter((f) => f.valor <= doy.valor * 1.25 && f.valor >= doy.valor * 0.6)
            .sort((x, y) => y.rosPG - x.rosPG)[0];
          if (cand && (yo[pm].tit.length < (M.cfg.slots[pm] || 1) || cand.rosPG > Math.min(...yo[pm].tit.map((f) => f.rosPG)))) { idea = { doy: doy.j.id, recibo: cand.j.id }; break; }
        }
        if (idea) break;
      }
      return { e, a, necesita, sobra, idea };
    }).sort((x, y) => (y.idea ? 1 : 0) - (x.idea ? 1 : 0) || y.necesita.length - x.necesita.length);
  }

  let posCalendario = "OF";
  render.objetivos = function () {
    const el = $("#tab-objetivos");
    const semanas = Math.max(1, ULTIMA - SEM + 1);
    const sinRoster = !roster.length;
    const conJuegos = M.tabla.filter((x) => x.j.gp >= 3 && x.j.pos !== "K" && x.j.pos !== "DST" && (x.sem.bye || (x.sem.disp && x.sem.disp.f > 0.5)));
    const compra = conJuegos.filter((x) => !enRoster(x.j.id) && x.valor >= 10 && x.rosPG - x.ppg >= Math.max(1.5, 0.1 * x.rosPG))
      .sort((a, b) => (b.rosPG - b.ppg) * Math.sqrt(b.valor) - (a.rosPG - a.ppg) * Math.sqrt(a.valor)).slice(0, 12);
    const ventaMia = conJuegos.filter((x) => enRoster(x.j.id) && x.valor >= 8 && x.ppg - x.rosPG >= Math.max(1.5, 0.1 * x.ppg))
      .sort((a, b) => (b.ppg - b.rosPG) * Math.sqrt(b.valor) - (a.ppg - a.rosPG) * Math.sqrt(a.valor));
    const calendario = M.tabla.filter((x) => x.valor >= 10 && x.j.pos !== "K" && (posCalendario === "TODOS" || (posCalendario === "OF" ? ["QB", "RB", "WR", "TE"].includes(x.j.pos) : x.j.pos === posCalendario)) && !enRoster(x.j.id) && x.juegosRest >= 4)
      .sort((a, b) => b.calendario - a.calendario).slice(0, 10);
    const filaLista = (x, razon) => `<tr class="clic" data-j="${x.j.id}"><td>${jugHTML(x.j, duenoDe[x.j.id] && !enRoster(x.j.id) ? esc(duenoDe[x.j.id].nombre) : "")}
      ${razon ? `<div class="nota" style="margin:3px 0 0 42px">${razon}</div>` : ""}</td>
      <td class="n">${f1(x.ppg)}</td><td class="n fuerte">${f1(x.rosPG)}</td><td class="n">${x.valor}</td></tr>`;
    const tablaLista = (filas, fn, vacio) => filas.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Jugador</th><th class="n">Pts/PJ</th><th class="n">Proy/PJ</th><th class="n">Valor</th></tr></thead><tbody>${filas.map(fn).join("")}</tbody></table></div>` : `<div class="vacio">${vacio || "Nadie cumple el criterio ahora."}</div>`;
    const necesitaRoster = `<div class="vacio">Primero agrega tu roster en <a href="#" data-ir="equipo">Mi equipo</a> o conecta tu liga en <a href="#" data-ir="liga">Liga</a>.</div>`;

    let sug = `<div class="vacio">Calculando…</div>`;
    if (sinRoster) sug = necesitaRoster;
    else if (cache.sugerencias) {
      const S = cache.sugerencias;
      sug = S.length ? `<div class="tabla-scroll"><table><thead><tr><th>Pide</th><th>Ofrece</th><th class="n">Valor (das / recibes)</th><th class="n">Tu alineación</th><th></th></tr></thead><tbody>${S.map((s, i) => {
        const t = M.porId[s.objetivo];
        return `<tr><td class="clic" data-j="${t.id}">${jugHTML(t, duenoDe[t.id] ? esc(duenoDe[t.id].nombre) : "")}</td>
          <td>${s.doy.map((id) => `<div class="clic" data-j="${id}">${jugHTML(M.porId[id])}</div>`).join("")}</td>
          <td class="n">${f0(s.vD)} / ${f0(s.vR)}</td><td class="n bueno fuerte">+${f1(s.gana / semanas)} pts/sem</td>
          <td><button class="sec" data-prueba="${i}">Analizar</button></td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="vacio">No encontré trades de valor parecido que mejoren tu alineación de forma clara.</div>`;
    }
    const W = cache.waivers;
    const necesidades = necesidadesLiga();
    const posTag = (p, a, bien) => `<span class="pos ${p}" title="${bien ? "Le sobra" : "Le falta"}: titulares al ${Math.round(a[p].ratio * 100)}% del promedio">${p}</span>`;
    const necesHTML = D.liga ? `<div class="panel bloque">${titulo("🔁 Qué necesita cada equipo", "Compara los titulares de cada equipo contra el promedio de la liga. Necesita = posiciones donde está débil (ahí le interesa recibir). Le sobra = suplentes que serían titulares en otro equipo (ahí te puede dar). La idea de trade usa lo que a ti te sobra.")}
        <div class="tabla-scroll"><table class="mini"><thead><tr><th>Equipo</th><th>Récord</th><th>Necesita</th><th>Le sobra</th><th>Idea de trade</th><th></th></tr></thead><tbody>
        ${necesidades.map((x, i) => `<tr><td><b>${esc(x.e.nombre)}</b><div class="nota">${esc(x.e.dueno || "")}</div></td>
          <td>${esc(x.e.record || "")}</td>
          <td>${x.necesita.length ? x.necesita.map((p) => posTag(p, x.a, false)).join(" ") : '<span class="nota">nada claro</span>'}</td>
          <td>${x.sobra.length ? x.sobra.map((p) => posTag(p, x.a, true)).join(" ") : '<span class="nota">—</span>'}</td>
          <td>${x.idea ? `<div class="clic" data-j="${x.idea.doy}">Das: ${jugHTML(M.porId[x.idea.doy])}</div><div class="clic" data-j="${x.idea.recibo}">Pides: ${jugHTML(M.porId[x.idea.recibo])}</div>` : '<span class="nota">Sin un cambio claro con tu roster</span>'}</td>
          <td>${x.idea ? `<button class="sec" data-nidea="${i}">Analizar</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div></div>` : `<div class="panel bloque">${titulo("🔁 Qué necesita cada equipo")}<p class="nota">Conecta tu liga de ESPN (pestaña <a href="#" data-ir="liga">Liga</a>) para ver qué posiciones le faltan a cada equipo y a quién proponerle un trade.</p></div>`;
    const fa = M.cfg.faab;
    const queda = fa && ligaMia ? Math.max(0, fa.presupuesto - (ligaMia.faabGastado || 0)) : null;
    const tSl = (j) => (sleeper && j.sl && sleeper.alta[j.sl] ? `<span class="tag verde" title="Agregado ${sleeper.alta[j.sl].toLocaleString("es-MX")} veces en Sleeper en las últimas 24 h">🔥 ${sleeper.alta[j.sl] >= 1000 ? Math.round(sleeper.alta[j.sl] / 1000) + " mil" : sleeper.alta[j.sl]}</span>` : "");
    el.innerHTML = `<h2>Movimientos: compra, vende, agrega y suelta ${ayuda("Proy/PJ = puntos por partido que el modelo espera el resto de la temporada. Cuando es mucho mayor que lo que ha hecho (Pts/PJ), es buen momento para pedirlo; cuando es menor, es buen momento para venderlo.")}</h2>
      <div class="panel bloque">${titulo("Trades recomendados para tu equipo", `Ofertas de valor parecido (que el otro equipo podría aceptar) que más puntos por semana le suman a tu alineación.${D.liga ? "" : " Como tu liga no está conectada, puede sugerir jugadores que nadie tiene."}`)}${sug}</div>
      ${necesHTML}
      <div class="grid2 anchas bloque">
        <div class="panel">${titulo("➕ Agregar de waivers", `${D.liga ? "Jugadores que nadie tiene en tu liga" : "Jugadores en pocas ligas de ESPN (conecta tu liga para ver solo los libres de verdad)"}, ordenados por cuántos puntos le suman a tu alineación lo que resta de la temporada, y a quién soltarías.${fa ? " La oferta FAAB sugerida depende de cuánto te suma y de lo que te queda de presupuesto." : ""} 🔥 = de los más agregados hoy en Sleeper.`)}
          ${fa && queda !== null ? `<p class="nota">Te quedan <b>$${queda}</b> de $${fa.presupuesto} de FAAB.</p>` : ""}
          ${sinRoster ? necesitaRoster : W ? (W.agregar.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Agrega</th><th>Suelta</th><th class="n">Gana</th>${fa ? `<th class="n">Oferta FAAB</th>` : ""}</tr></thead><tbody>${W.agregar.map((w) => { const of = ofertaFaab(w.gana / semanas); const j = M.porId[w.add]; return `<tr>
            <td class="clic" data-j="${w.add}">${jugHTML(j, j.espn ? j.espn.own + "% ligas" : "")} ${tSl(j)}<div class="nota" style="margin-left:42px">Proy. semana ${SEM}: ${f1(j.fila.sem.pts)} · resto: ${f0(j.fila.ros)}</div></td>
            <td class="clic" data-j="${w.drop}">${jugHTML(M.porId[w.drop])}</td>
            <td class="n bueno fuerte">+${f1(w.gana / semanas)}<div class="nota">pts/sem</div></td>
            ${fa ? `<td class="n fuerte">${of ? (of.max ? `$${of.min}–${of.max}` : "$0") : "–"}</td>` : ""}</tr>`; }).join("")}</tbody></table></div>` :
            `<div class="vacio">Ningún agente libre mejora tu alineación ahora mismo.</div>`) : `<div class="vacio">Calculando…</div>`}</div>
        <div class="panel">${titulo("➖ Candidatos para soltar", "Los jugadores de tu roster que menos puntos le aportan a tu alineación lo que resta de la temporada (casi nunca serían titulares).")}
          ${sinRoster ? necesitaRoster : W ? (W.soltar.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Jugador</th><th class="n">Aporta</th><th class="n">Valor</th></tr></thead><tbody>${W.soltar.map((w) => `<tr class="clic" data-j="${w.id}">
            <td>${jugHTML(M.porId[w.id])}</td><td class="n">${f1(w.aporta / semanas)}<div class="nota">pts/sem</div></td><td class="n">${M.porId[w.id].fila.valor}</td></tr>`).join("")}</tbody></table></div>` : `<div class="vacio">Nadie.</div>`) : `<div class="vacio">Calculando…</div>`}</div>
        <div class="panel">${titulo("★ Mis seguimientos", "Abre a cualquier jugador y toca ☆ Seguir para tenerlo aquí, con tus notas, en la computadora y en el teléfono.")}
          ${SY.estado.seguimiento.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Jugador</th><th class="n">Proy S${SEM}</th><th class="n">Valor</th><th>Nota</th><th></th></tr></thead><tbody>${SY.estado.seguimiento.filter((z) => M.porId[z.id]).map((z) => { const x = M.porId[z.id].fila; return `<tr>
            <td class="clic" data-j="${z.id}">${jugHTML(x.j, duenoDe[z.id] ? esc(duenoDe[z.id].nombre) : enRoster(z.id) ? "tuyo" : "")}</td>
            <td class="n fuerte">${x.sem.bye ? "BYE" : f1(x.sem.pts)}</td><td class="n">${x.valor} ${tendenciaHTML(x)}</td>
            <td><input type="text" data-snota="${z.id}" value="${esc(z.nota || "")}" placeholder="Agregar nota" style="width:100%;min-width:120px"></td>
            <td><button class="x" data-squitar="${z.id}" title="Dejar de seguir">×</button></td></tr>`; }).join("")}</tbody></table></div>` :
            `<p class="nota">Todavía no sigues a nadie.</p>`}
          <div class="fila" style="margin-top:8px"><input type="text" id="seguirNuevo" list="listaJugadores" placeholder="Seguir a un jugador…" style="flex:1;min-width:180px"><button class="btn" id="btnSeguir">Seguir</button></div></div>
        <div class="panel">${titulo("🟢 Comprar barato", "Jugadores cuya proyección para lo que resta es claramente mayor que lo que han hecho. Buen momento para pedirlos en un trade.")}${tablaLista(compra, (x) => filaLista(x, esc(razonesCompra(x).slice(0, 3).join("; ") || "su proyección supera lo que ha hecho")))}</div>
        <div class="panel">${titulo("🔴 Vender caro", "Jugadores de tu roster que han rendido más de lo que el modelo espera para lo que resta. Buen momento para ofrecerlos.")}${sinRoster ? necesitaRoster : tablaLista(ventaMia, (x) => filaLista(x, esc(razonesVenta(x).slice(0, 3).join("; ") || "su producción probablemente baje")), "Ninguno de tus jugadores está rindiendo muy por encima de lo esperado.")}</div>
        <div class="panel">${titulo("📅 Calendario más fácil lo que resta", "Jugadores con valor de 10 o más cuyos rivales de aquí al final permiten más puntos que el promedio.", `<select id="posCal">${[["OF", "QB/RB/WR/TE"], ["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"], ["DST", "D/ST"], ["TODOS", "Todas"]].map(([v, t]) => `<option value="${v}" ${v === posCalendario ? "selected" : ""}>${t}</option>`).join("")}</select>`)}
          ${tablaLista(calendario, (x) => filaLista(x, `rivales ${Math.round((x.calendario - 1) * 100)}% más fáciles que el promedio`))}</div>
      </div>`;
    el.querySelectorAll("[data-nidea]").forEach((b) => (b.onclick = () => {
      const x = necesidades[+b.dataset.nidea];
      trade.doy = [x.idea.doy]; trade.recibo = [x.idea.recibo]; vistaTrades = "analizar"; abrir("trades");
    }));
    el.querySelectorAll("[data-prueba]").forEach((b) => (b.onclick = () => {
      const s = cache.sugerencias[+b.dataset.prueba];
      trade.doy = s.doy.slice(); trade.recibo = [s.objetivo]; vistaTrades = "analizar"; abrir("trades");
    }));
    if ($("#posCal")) $("#posCal").onchange = (e) => { posCalendario = e.target.value; render.objetivos(); };
    conectarClics(el);
    el.querySelectorAll("[data-snota]").forEach((inp) => (inp.onchange = () => {
      const z = SY.estado.seguimiento.find((y) => y.id === inp.dataset.snota);
      if (z) { z.nota = inp.value.trim(); SY.guardar(); }
    }));
    el.querySelectorAll("[data-squitar]").forEach((b) => (b.onclick = () => {
      SY.estado.seguimiento = SY.estado.seguimiento.filter((y) => y.id !== b.dataset.squitar); SY.guardar(); render.objetivos();
    }));
    const seguir = () => {
      const id = desdeEntrada($("#seguirNuevo").value);
      if (id && !seguido(id)) { SY.estado.seguimiento.push({ id, nota: "", fecha: new Date().toISOString().slice(0, 10) }); SY.guardar(); render.objetivos(); }
    };
    $("#btnSeguir").onclick = seguir;
    $("#seguirNuevo").onkeydown = (e) => { if (e.key === "Enter") seguir(); };
    if (!sinRoster && (!cache.sugerencias || !cache.waivers)) setTimeout(() => {
      if (!cache.waivers) cache.waivers = calcularWaivers();
      if (!cache.sugerencias) cache.sugerencias = calcularSugerencias();
      if (actual === "objetivos") render.objetivos();
    }, 30);
  };

  // ================= LIGA =================
  render.liga = function () {
    const el = $("#tab-liga");
    const sim = simulacion();
    const rank = rankingRosters();
    const cfgL = D.liga && D.liga.cfg;
    const posiciones = D.liga ? D.liga.equipos.slice().sort((a, b) => (b.w || 0) - (a.w || 0) || (b.pf || 0) - (a.pf || 0)) : [];
    const lugares = (cfgL && cfgL.lugaresPlayoff) || 4;
    const tablaPos = D.liga ? `<div class="panel bloque">${titulo("Tabla de posiciones y playoffs", `Récord y puntos a favor según ESPN. Playoffs y 1er lugar salen de simular ${sim ? "2,500" : ""} veces lo que resta de la temporada regular con las proyecciones de cada roster. Entran ${lugares} equipos.`)}
        <div class="tabla-scroll"><table class="mini"><thead><tr><th>#</th><th>Equipo</th><th class="n">Récord</th><th class="n">Pts a favor</th>${sim ? `<th class="n">Playoffs</th><th class="n">1er lugar</th>` : ""}${rank ? `<th class="n ocultar-movil">Roster (lugar)</th>` : ""}</tr></thead><tbody>
        ${posiciones.map((e, i) => { const s = sim && sim[e.id]; const r = rank && rank.find((f) => f.e.id === e.id); return `<tr class="${e.mio ? "elegido" : ""} ${i === lugares - 1 ? "corte" : ""}"><td>${i + 1}</td><td>${e.mio ? "⭐ " : ""}<b>${esc(e.nombre)}</b><div class="nota">${esc(e.dueno || "")}</div></td>
          <td class="n">${esc(e.record || "")}</td><td class="n">${f0(e.pf)}</td>
          ${sim ? `<td class="n"><div class="fila" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap"><div class="barra ocultar-movil" style="width:60px"><i style="width:${(s ? s.playoffs : 0) * 100}%"></i></div><b>${s ? pct(s.playoffs) : "–"}</b></div></td><td class="n">${s ? pct(s.primero) : "–"}</td>` : ""}
          ${rank ? `<td class="n ocultar-movil">${r ? r.lugar + "º" : "–"}</td>` : ""}</tr>`; }).join("")}
        </tbody></table></div>
        ${!cfgL ? `<p class="nota">Para ver la probabilidad de playoffs con el calendario y la configuración exacta de tu liga, vuelve a usar el botón de ESPN (paso 2 abajo).</p>` : ""}</div>` : "";
    el.innerHTML = `<h2>Tu liga</h2>
      ${SY.hayCuentas ? `<div class="panel bloque" id="cuenta"></div>` : ""}
      ${tablaPos}
      <div class="panel bloque" id="conectar">${titulo("Conectar tu liga de ESPN", "Con tu liga conectada la página usa su puntuación y alineación exactas, sabe qué equipo tiene a cada jugador y quiénes están libres, calcula tu probabilidad de ganar cada semana y de llegar a playoffs, y arma trades con los rosters reales de tus rivales.")}
        ${D.liga ? `<p><span class="tag verde">Conectada</span> ${esc(D.liga.nombre || "Tu liga")} · leída el ${esc((D.espnFecha || D.generado || "").slice(0, 16).replace("T", " "))}${cfgL ? " · puntuación y alineación de tu liga" : ""}.
          Para ponerla al día (rosters, récords, lesiones) repite el paso 2 cuando quieras, por ejemplo después de los waivers.</p>` : ""}
        <ol class="pasos">
          <li><b>Una sola vez:</b> muestra la barra de favoritos de Chrome (<b>Ctrl+Shift+B</b>) y <b>arrastra este botón</b> hasta ella:
            <a class="btn" style="display:inline-block;text-decoration:none;margin:6px 4px" href="${window.EspnLocal ? EspnLocal.codigoBoton(null, DESTINO) : "#"}" onclick="alert('Arrástrame a tu barra de favoritos y úsame estando en la página de tu liga en ESPN.');return false;">⬇ Bajar mi liga de ESPN</a></li>
          <li>Abre <a href="https://fantasy.espn.com/football/" target="_blank" rel="noopener">tu liga en fantasy.espn.com</a> (con tu sesión iniciada) y da clic en el favorito <b>⬇ Bajar mi liga de ESPN</b>. ${DESTINO ? "Se abre esta página con tu liga ya puesta al día." : "Se descarga el archivo <code>espn_liga.json</code>."}</li>
          <li>${DESTINO ? "Si tu navegador bloquea la ventana, el botón descarga <code>espn_liga.json</code>; cárgalo aquí:" : "Regresa aquí y cárgalo:"} <input type="file" id="archivoEspn" accept=".json,application/json"></li>
        </ol>
        <p class="nota" id="msgEspn"></p>
        ${D.liga ? `<button class="sec" id="desconectarEspn">Desconectar liga</button>` : ""}</div>
      <div class="grid2 bloque">
        <div class="panel">${titulo("Datos")}
          <p><b>ESPN Fantasy:</b> ${D.fuenteEspn ? `<span class="tag verde">conectado${espnVivo ? " al momento" : ""}</span>` : `<span class="tag amar">sin conexión</span>`} lesiones, % en ligas, proyecciones y análisis de ESPN.</p>
          <p><b>Estadísticas:</b> nflverse (las oficiales de la NFL), snaps y jugadas en zona roja. Se actualizan solas cada día.</p>
          <p><b>En vivo:</b> noticias (Rotowire vía ESPN), marcadores, clima (Open-Meteo) y tendencias de Sleeper.</p>
          <p class="nota">Última actualización: ${D.generado.replace("T", " ")}. <a href="#" id="verAyuda">Cómo funciona la página</a></p></div>
        <div class="panel" id="respaldo">${titulo("Tus datos")}
          <p id="txtRespaldo"></p>
          <div class="fila"><button class="sec" id="btnRespaldo">Guardar respaldo</button>
            <label class="sec" style="display:inline-block;padding:6px 10px;border:1px solid var(--borde);border-radius:8px;background:var(--panel2);cursor:pointer">Cargar respaldo <input type="file" id="archivoRespaldo" accept=".json,application/json" hidden></label></div>
          <p class="nota" id="msgRespaldo"></p></div>
      </div>
      <div class="panel bloque" id="avisos"></div>`;
    $("#verAyuda").onclick = (e) => { e.preventDefault(); mostrarAyuda(); };
    conectarEspnUI();
    cuentaUI();
    avisosUI();
  };

  // Ayuda general (lo que antes ocupaba la pestaña de datos)
  function mostrarAyuda() {
    const P = M.cfg.pts;
    abrirModalHTML(`<h2>Cómo funciona</h2>
      <h3 style="margin-top:12px">Qué hace cada pestaña</h3>
      <ul class="lista-ayuda">
        <li><b>Mi equipo:</b> tu probabilidad de ganar la semana, alineación recomendada, comparador "¿A quién alineo?", noticias de tus jugadores y marcador en vivo los días de partido.</li>
        <li><b>Partidos:</b> marcador, yardas y TDs esperados de cada partido NFL, clima, defensa vs. posición y qué tan bien ha predicho el modelo.</li>
        <li><b>Jugadores:</b> proyecciones, valor de trade y su cambio semanal; filtra agentes libres.</li>
        <li><b>Trades:</b> analiza si un trade es justo para ti y para el otro equipo, y la tabla de valores.</li>
        <li><b>Movimientos:</b> trades sugeridos, waivers (con oferta FAAB), a quién soltar, comprar barato y vender caro.</li>
        <li><b>Liga:</b> tabla, probabilidad de playoffs, conexión con ESPN, tu cuenta y avisos.</li>
      </ul>
      <h3 style="margin-top:12px">Puntuación ${M.cfg.deLiga ? "(de tu liga de ESPN)" : "(liga de ejemplo: conecta la tuya para usar la real)"}</h3>
      <table class="mini"><tbody>
        <tr><td>Equipos</td><td>${M.cfg.equipos}</td></tr>
        <tr><td>Pase</td><td>${f1(P.py25)} pt cada 25 yd · TD ${P.ptd} · INT ${P.int}${P.sk ? " · capturado " + P.sk : ""} · 2pt ${P.tp}</td></tr>
        <tr><td>Carrera / recepción</td><td>${f1(P.ry10)} pt cada 10 yd · TD ${P.rtd} · recepción ${P.rec}${P.tePrem ? ` (+${P.tePrem} TE)` : ""}</td></tr>
        <tr><td>Balones sueltos</td><td>${P.fum ? "fumble " + P.fum + " · " : ""}fumble perdido ${P.fl}</td></tr>
        <tr><td>Pateador</td><td>FG 0–39: ${P.fg0} · 40–49: ${P.fg40} · 50+: ${P.fg50} · fallado ${P.fgMiss} · PAT ${P.pat}</td></tr>
        <tr><td>D/ST</td><td>sack ${P.dSk} · INT ${P.dInt} · recuperado ${P.dFr} · safety ${P.dSf} · bloqueo ${P.dBlk} · TD ${P.dTd} · puntos permitidos de ${P.pa[0][1]} a ${P.pa[P.pa.length - 1][1]}</td></tr>
        <tr><td>Playoffs de fantasy</td><td>semanas ${PLAYOFFS.join(", ")}</td></tr>
      </tbody></table>
      <h3 style="margin-top:12px">Cómo predice</h3>
      <p class="nota">Cada jugador tiene un promedio por partido de esta temporada (las semanas recientes pesan más) combinado con la temporada pasada. Sus TDs se ajustan hacia lo que sugieren sus yardas y sus jugadas en zona roja, y su volumen sube o baja si está jugando más o menos snaps. Para cada partido se predice el marcador y las yardas de cada equipo con ofensivas y defensas ajustadas por rival, mezclado con la línea de las casas de apuestas, y se ajusta por el clima. Se descuentan lesiones y semanas de descanso, y para la semana actual se mezcla con la proyección de ESPN. El valor de trade es lo que aportará el resto de la temporada por encima de un jugador de waivers.</p>
      <h3 style="margin-top:12px">Cuándo se actualiza</h3>
      <p class="nota">Las estadísticas se actualizan solas cada mañana y antes de los partidos del domingo. Lesiones, proyecciones de ESPN, noticias, clima y marcadores se leen al momento cada vez que abres la página.</p>`);
  }
  $("#btnAyuda").onclick = mostrarAyuda;

  // Recibir la liga directo desde el botón de ESPN (sin archivo)
  function aplicarLigaEspn(raw) {
    const c = EspnLocal.compactar(raw, "");
    if (!c.liga.equipos.length) throw new Error("ESPN no mandó equipos");
    SY.estado.roster = null;
    SY.guardar();
    return SY.guardarEspn(c).then(() => c);
  }
  if (new URLSearchParams(location.search).has("espn") && window.opener) {
    const aviso = document.createElement("div");
    aviso.className = "ayuda"; aviso.style.cssText = "position:fixed;left:16px;right:16px;bottom:80px;z-index:30;text-align:center";
    aviso.textContent = "Recibiendo tu liga de ESPN…";
    document.body.appendChild(aviso);
    window.addEventListener("message", (e) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*espn\.com$/.test(e.origin) || !e.data || e.data.tipo !== "nflf-espn") return;
      try {
        aplicarLigaEspn(e.data.datos).then((c) => {
          aviso.textContent = "Liga actualizada: " + c.liga.equipos.length + " equipos. Cargando…";
          history.replaceState(null, "", location.pathname);
          setTimeout(() => location.reload(), 700);
        });
      } catch (err) { aviso.textContent = "No pude leer tu liga: " + err.message; }
    });
    try { window.opener.postMessage("nflf-listo", "*"); } catch (e) { /* sin ventana de ESPN */ }
    setTimeout(() => { if (aviso.isConnected && /Recibiendo/.test(aviso.textContent)) aviso.textContent = "No llegó nada de ESPN. Vuelve a dar clic en el favorito estando en tu liga."; }, 20000);
  }

  function respaldoUI() {
    const nube = !!window.claude;
    $("#txtRespaldo").textContent = nube
      ? "Tu roster, seguimientos, trades y tu liga se guardan en tu cuenta y se sincronizan solos con tus otros dispositivos."
      : SY.hayCuentas
        ? "Con tu sesión iniciada todo se sincroniza solo. Sin sesión se guarda solo en este navegador; también puedes pasar tus datos con un respaldo."
        : "Tu roster, seguimientos, trades y tu liga se guardan solo en este navegador. Para pasarlos a otro dispositivo, guarda un respaldo aquí y cárgalo allá.";
    const b = $("#btnRespaldo");
    if (nube) b.hidden = true;
    b.onclick = () => {
      const datos = { app: "nfl-fantasy", fecha: new Date().toISOString(), estado: SY.estado, espn: EspnLocal.leer() };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(datos)], { type: "application/json" }));
      a.download = "nfl_fantasy_respaldo.json";
      document.body.appendChild(a); a.click(); a.remove();
      $("#msgRespaldo").textContent = "Se descargó nfl_fantasy_respaldo.json. Mándatelo (correo, WhatsApp o Drive) y cárgalo en tu otro dispositivo.";
    };
    $("#archivoRespaldo").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          const d = JSON.parse(r.result);
          if (d.app !== "nfl-fantasy" || !d.estado) throw new Error("no es un respaldo de esta página");
          Object.assign(SY.estado, d.estado);
          SY.guardar();
          if (d.espn) await SY.guardarEspn(d.espn); else await SY.borrarEspn();
          $("#msgRespaldo").textContent = "Respaldo cargado. Recargando…";
          setTimeout(() => location.reload(), 900);
        } catch (err) { $("#msgRespaldo").innerHTML = '<span class="malo">No pude leer ese archivo: ' + esc(err.message) + "</span>"; }
      };
      r.readAsText(f);
    };
  }

  function conectarEspnUI() {
    respaldoUI();
    const inp = $("#archivoEspn");
    if (inp) inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const raw = JSON.parse(r.result);
          $("#msgEspn").textContent = "Guardando tu liga…";
          aplicarLigaEspn(raw).then((c) => {
            $("#msgEspn").textContent = "Liga cargada: " + c.liga.equipos.length + " equipos. Recargando…";
            setTimeout(() => location.reload(), 900);
          }, () => { $("#msgEspn").innerHTML = '<span class="malo">Se guardó en este dispositivo pero no en la nube. Intenta de nuevo.</span>'; });
        } catch (e) { $("#msgEspn").innerHTML = '<span class="malo">No pude leer ese archivo: ' + esc(e.message) + "</span>"; }
      };
      r.readAsText(f);
    };
    const d = $("#desconectarEspn");
    if (d) d.onclick = () => { SY.borrarEspn().then(() => location.reload()); };
  }

  // Avisos al teléfono (notificaciones)
  function avisosUI() {
    const el = $("#avisos");
    if (!el) return;
    const AV = window.Avisos;
    if (!AV || !AV.soportado()) {
      el.innerHTML = `${titulo("🔔 Avisos al teléfono")}<p class="nota">Este navegador no permite notificaciones. En iPhone: abre la página en Safari, toca Compartir → <b>Agregar a pantalla de inicio</b>, ábrela desde ese ícono y regresa aquí.</p>`;
      return;
    }
    const estado = AV.estado();
    el.innerHTML = `${titulo("🔔 Avisos de lesiones", "Te avisamos cuando un jugador de tu roster cambia de estado en ESPN (por ejemplo, pasa a Fuera o Dudoso, o regresa). Se revisa cada vez que abres la página; en Android, con la página instalada en tu pantalla de inicio, también cada pocas horas aunque esté cerrada.")}
      ${estado === "activo" ? `<p><span class="tag verde">Activados</span> en este dispositivo para ${roster.filter((id) => M.porId[id].eid).length} jugadores de tu roster.</p><div class="fila"><button class="sec" id="avProbar">Mandar aviso de prueba</button><button class="sec" id="avQuitar">Desactivar</button></div>` :
        estado === "bloqueado" ? `<p class="nota">Bloqueaste las notificaciones para esta página. Actívalas en la configuración del navegador y vuelve a intentar.</p>` :
        `<button class="btn" id="avActivar">Activar avisos en este dispositivo</button>`}
      <p class="nota">En iPhone primero agrega la página a tu pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.</p>
      <p class="nota" id="avMsg"></p>`;
    const msg = (t, malo) => { $("#avMsg").innerHTML = malo ? `<span class="malo">${esc(t)}</span>` : esc(t); };
    if ($("#avActivar")) $("#avActivar").onclick = async () => {
      msg("Activando…");
      try { await AV.activar(SY); msg("Listo. Te llegará un aviso cuando cambie el estado de tus jugadores."); avisosUI(); } catch (e) { msg(e.message, true); }
    };
    if ($("#avQuitar")) $("#avQuitar").onclick = async () => { await AV.desactivar(SY); avisosUI(); };
    if ($("#avProbar")) $("#avProbar").onclick = async () => { msg("Enviando…"); try { await AV.probar(SY); msg("Enviado. Debe llegarte en unos segundos."); } catch (e) { msg(e.message, true); } };
  }

  // Cuenta: iniciar sesión para sincronizar entre dispositivos
  function cuentaUI() {
    const el = $("#cuenta");
    if (!el) return;
    const u = SY.usuario;
    if (u) {
      el.innerHTML = `${titulo("Tu cuenta")}
        <p>Sesión iniciada como <b>${esc(u.email || "")}</b>. ${SY.modo === "nube" ? '<span class="tag verde">Sincronizado</span>' : SY.modo === "error" ? '<span class="tag rojo">Sin sincronizar</span>' : '<span class="tag gris">Conectando…</span>'}</p>
        <p class="nota">Abre esta página en tu teléfono o en otra computadora, entra con el mismo correo y verás lo mismo.</p>
        <button class="sec" id="btnSalir">Cerrar sesión</button>`;
      $("#btnSalir").onclick = () => SY.salir();
      return;
    }
    el.innerHTML = `${titulo("Tu cuenta")}
      <p>Inicia sesión para tener tu equipo, tu liga, tus trades y seguimientos en tu computadora y tu teléfono al mismo tiempo, y para recibir avisos.</p>
      <button class="sec" id="btnGoogle" type="button" style="display:inline-flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:600">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continuar con Google</button>
      <p class="nota" style="margin:0 0 8px">o con tu correo:</p>
      <form id="formCuenta" class="fila" autocomplete="on">
        <input type="email" id="cCorreo" placeholder="Correo" autocomplete="email" required style="flex:1;min-width:200px">
        <input type="password" id="cClave" placeholder="Contraseña (mínimo 6)" autocomplete="current-password" required minlength="6" style="flex:1;min-width:180px">
        <button class="btn" type="submit" id="btnEntrar">Entrar</button>
        <button class="sec" type="button" id="btnCrear">Crear cuenta</button>
      </form>
      <p class="nota" id="msgCuenta">Lo que ya tienes en este dispositivo se sube a tu cuenta la primera vez que entras.</p>`;
    const msg = (t, malo) => { $("#msgCuenta").innerHTML = malo ? `<span class="malo">${esc(t)}</span>` : esc(t); };
    const datos = () => [$("#cCorreo").value.trim(), $("#cClave").value];
    $("#btnGoogle").onclick = async () => {
      msg("Abriendo Google…");
      try { await SY.entrarConGoogle(); } catch (err) { msg(err.message, true); }
    };
    $("#formCuenta").onsubmit = async (e) => {
      e.preventDefault();
      const [c, k] = datos();
      msg("Entrando…");
      try { await SY.entrar(c, k); } catch (err) { msg(err.message, true); }
    };
    $("#btnCrear").onclick = async () => {
      const [c, k] = datos();
      if (!c || k.length < 6) { msg("Escribe tu correo y una contraseña de al menos 6 caracteres.", true); return; }
      msg("Creando tu cuenta…");
      try {
        const r = await SY.crearCuenta(c, k);
        if (r.confirmar) msg("Listo. Te mandamos un correo para confirmar tu cuenta: abre el enlace y luego regresa aquí y da Entrar.");
      } catch (err) { msg(err.message, true); }
    };
  }

  // Indicador de sincronización
  function pintarSync() {
    const el = $("#sync");
    if (!el) return;
    const m = SY.modo;
    el.className = "tag " + (m === "nube" ? "verde" : m === "error" ? "rojo" : "gris");
    el.textContent = m === "nube" ? "Sincronizado" : m === "conectando" ? "Conectando…" : m === "error" ? "Sin sincronizar" : "Guardado en este dispositivo";
    el.title = m === "nube" ? "Tus cambios se guardan en tu cuenta y aparecen en tu teléfono y tu computadora." : m === "error" ? "No se pudo guardar en la nube. Tus cambios siguen en este dispositivo." : "Inicia sesión para sincronizar con tu teléfono.";
    if (SY.hayCuentas) {
      if (m === "local") { el.textContent = "Iniciar sesión"; el.className = "tag azul"; el.title = "Entra a tu cuenta para sincronizar con tu teléfono."; }
      if (m === "nube" && SY.usuario) el.textContent = "Sincronizado · " + (SY.usuario.email || "");
      el.style.cursor = "pointer";
      el.onclick = () => { abrir("liga"); const c = $("#cuenta"); if (c) c.scrollIntoView({ behavior: "smooth" }); };
    }
    cuentaUI();
    avisosUI();
  }
  SY.alCambiar((que) => {
    if (que === "modo" || que === "usuario") pintarSync();
    if (que === "estado") { cargarRoster(); recalcularTodo(); repintar(); rosterAAvisos(); }
    if (que === "espn") location.reload();
  });
  // Alto del encabezado (para que el encabezado de las tablas se quede fijo al bajar)
  const medirTop = () => document.documentElement.style.setProperty("--alto-top", ($(".top").getBoundingClientRect().height || 0) + "px");
  window.addEventListener("resize", medirTop);
  medirTop();
  pintarSubtitulo();
  pintarSync();
  SY.iniciar();

  // Inicio
  abrir(actual);
  setTimeout(cargarEnVivo, 50);
  setTimeout(rosterAAvisos, 1500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && vivo) revisarVivo(); });
})();
