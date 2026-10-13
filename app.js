// Interfaz de la página. El modelo está en modelo.js.
(function () {
  "use strict";
  const M = window.Modelo;
  const D = M.D;
  M.recalcular();

  // ---------------- Utilidades ----------------
  const $ = (s, el) => (el || document).querySelector(s);
  const f1 = (x) => (x === null || x === undefined || isNaN(x) ? "–" : (Math.round(x * 10) / 10).toFixed(1));
  const f0 = (x) => (x === null || x === undefined || isNaN(x) ? "–" : Math.round(x).toString());
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  // Las horas vienen en hora del Este de EE.UU.; se muestran en la hora local de tu computadora.
  function fechaCorta(g) {
    if (!g.hora) { const d = new Date(g.fecha + "T12:00:00"); return DIAS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
    const y = +g.fecha.slice(0, 4), nov1 = new Date(y, 10, 1), finDST = new Date(y, 10, 1 + ((7 - nov1.getDay()) % 7));
    const mar1 = new Date(y, 2, 1), iniDST = new Date(y, 2, 8 + ((7 - mar1.getDay()) % 7));
    const dia = new Date(g.fecha + "T12:00:00");
    const off = dia >= iniDST && dia < finDST ? "-04:00" : "-05:00";
    const d = new Date(g.fecha + "T" + g.hora + ":00" + off);
    return DIAS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1) + " " + d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  }
  const SEM = M.semanaProy;
  const ULTIMA = Math.min(17, M.SEMANAS);

  function avatar(j, grande) {
    const cls = grande ? "foto-grande" : "";
    if (j.foto && !window.claude) return `<img class="${cls}" src="${esc(j.foto)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;avatar ${cls}&quot;>${esc(j.t)}</span>'">`;
    return `<span class="avatar ${cls}">${esc(j.t)}</span>`;
  }
  function jugHTML(j, extra) {
    return `<div class="jug">${avatar(j)}<div style="min-width:0"><div class="nm">${esc(j.n)}</div>
      <div class="mt"><span class="pos ${j.pos}">${j.pos === "DST" ? "D/ST" : j.pos}</span> ${esc(j.t)}${extra ? " · " + extra : ""}</div></div></div>`;
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
    for (let w = desde || 1; w <= M.SEMANAS; w++) o += `<option value="${w}" ${w === valor ? "selected" : ""}>Semana ${w}</option>`;
    return `<select id="${id}">${o}</select>`;
  }
  function barraSVG(datos, alto) { // datos: [{x, y, tipo}]
    const W = 640, H = alto || 150, pad = 22;
    const max = Math.max(5, ...datos.map((d) => d.y));
    const bw = (W - pad) / datos.length;
    let s = `<svg class="grafica" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">`;
    datos.forEach((d, i) => {
      const h = ((H - pad - 16) * Math.max(0, d.y)) / max;
      const x = pad / 2 + i * bw + bw * 0.15, y = H - pad - h;
      const color = d.tipo === "real" ? "var(--azul)" : d.tipo === "bye" ? "var(--borde)" : "var(--barra)";
      s += `<rect x="${x}" y="${y}" width="${bw * 0.7}" height="${h}" rx="3" fill="${color}" opacity="${d.tipo === "proy" ? 0.75 : 1}"><title>${esc(d.titulo || "")}</title></rect>`;
      s += `<text x="${x + bw * 0.35}" y="${H - 7}" text-anchor="middle">${esc(d.x)}</text>`;
      if (d.y > 0) s += `<text x="${x + bw * 0.35}" y="${y - 3}" text-anchor="middle">${f0(d.y)}</text>`;
    });
    return s + "</svg>";
  }

  // ---------------- Roster de Jaime ----------------
  const porNombre = {};
  M.jugadores.forEach((j) => { porNombre[j.n.toLowerCase()] = porNombre[j.n.toLowerCase()] || j.id; });
  function resolver(nombre) {
    const n = nombre.toLowerCase().trim();
    if (porNombre[n]) return porNombre[n];
    const dst = n.match(/^(.+?)\s*d\/?st$/);
    if (dst) { const t = M.TEAMS.find((t) => M.MASCOTA(t).toLowerCase() === dst[1].trim()); if (t) return "DST_" + t; }
    const j = M.jugadores.find((j) => j.n.toLowerCase().includes(n));
    return j ? j.id : null;
  }
  const ligaMia = D.liga && D.liga.equipos ? D.liga.equipos.find((e) => e.mio) : null;
  const SY = window.Sync;
  let roster = [], origenRoster = "";
  function cargarRoster() {
    const r = SY.estado.roster;
    if (r && r.length) { roster = r.filter((id) => M.porId[id]); origenRoster = ligaMia ? "tu liga de ESPN, con tus cambios" : "tus cambios"; }
    else if (ligaMia) { roster = ligaMia.jugadores.filter((id) => M.porId[id]); origenRoster = "tu liga de ESPN"; }
    else { roster = (window.MI_EQUIPO ? window.MI_EQUIPO.jugadores : []).map(resolver).filter(Boolean); origenRoster = roster.length ? "mi_equipo.js" : "tu lista (vacía por ahora)"; }
  }
  cargarRoster();
  const guardarRoster = () => { SY.estado.roster = roster.slice(); SY.guardar(); sugerencias = null; waivers = null; };
  const seguido = (id) => SY.estado.seguimiento.some((x) => x.id === id);
  const enRoster = (id) => roster.includes(id);

  // Lista para autocompletar
  const etiqueta = (j) => `${j.n} (${j.pos === "DST" ? "D/ST" : j.pos}, ${j.t})`;
  const porEtiqueta = {};
  $("#listaJugadores").innerHTML = M.tabla.map((x) => { porEtiqueta[etiqueta(x.j)] = x.j.id; return `<option value="${esc(etiqueta(x.j))}">`; }).join("");
  const desdeEntrada = (v) => porEtiqueta[v] || resolver(v.replace(/\s*\(.*\)$/, ""));

  // Dueño en la liga (si se conectó ESPN)
  const duenoDe = {};
  if (D.liga && D.liga.equipos) D.liga.equipos.forEach((e) => e.jugadores.forEach((id) => (duenoDe[id] = e)));

  $("#subtitulo").textContent =
    `Temporada ${D.temporada} · estadísticas hasta la semana ${D.ultimaSemana} · proyectando la semana ${SEM} · ` +
    `datos del ${D.generado.replace("T", " ")}` + (D.fuenteEspn ? " · ESPN conectado" : "");

  // ---------------- Pestañas ----------------
  const render = {};
  let actual = leer("nflf_tab") || "equipo";
  function abrir(tab) {
    actual = tab; guardar("nflf_tab", tab);
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + tab));
    render[tab]();
  }
  $("#tabs").addEventListener("click", (e) => { if (e.target.dataset.tab) abrir(e.target.dataset.tab); });

  // ================= MI EQUIPO =================
  let rivalElegido = null;
  function varianza(al) {
    return M.sum(al.titulares.filter((t) => t.id).map((t) => { const f = M.porId[t.id].fila; const d = (t.pr && t.pr.disp ? t.pr.disp.f : 1); return (f.sd * d) ** 2; }));
  }
  function enfrentamientoHTML(miAl) {
    if (!D.liga || !ligaMia) return "";
    const otros = D.liga.equipos.filter((e) => !e.mio);
    let rivalId = rivalElegido;
    if (!rivalId) {
      const m = (D.liga.calendario || []).find((c) => c.p === semEquipo && (c.h === ligaMia.id || c.a === ligaMia.id));
      if (m) rivalId = String(m.h === ligaMia.id ? m.a : m.h);
    }
    const rival = otros.find((e) => String(e.id) === String(rivalId));
    const sel = `<select id="rivalSel"><option value="">Elegir rival…</option>${otros.map((e) => `<option value="${e.id}" ${rival && rival.id === e.id ? "selected" : ""}>${esc(e.nombre)}${e.dueno ? " (" + esc(e.dueno) + ")" : ""}</option>`).join("")}</select>`;
    if (!rival) return `<div class="panel bloque"><div class="fila entre"><h3>Enfrentamiento de la semana ${semEquipo}</h3>${sel}</div><p class="nota">Elige a tu rival para ver quién gana.</p></div>`;
    const suAl = M.alineacion(rival.jugadores, semEquipo);
    const p = M.phi((miAl.pts - suAl.pts) / Math.sqrt(varianza(miAl) + varianza(suAl) + 1));
    const filaR = (t) => t.id ? `<tr class="clic" data-j="${t.id}"><td><b>${t.slot}</b></td><td>${esc(M.porId[t.id].n)} <span class="nota">${esc(M.porId[t.id].t)}</span></td><td class="n">${f1(t.pts)}</td></tr>` : `<tr><td><b>${t.slot}</b></td><td class="malo">vacío</td><td class="n">0</td></tr>`;
    return `<div class="panel bloque"><div class="fila entre"><h3>Enfrentamiento de la semana ${semEquipo}</h3>${sel}</div>
      <div class="marcador" style="margin-top:8px">
        <div class="eq ${p >= 0.5 ? "gana" : ""}">${esc(ligaMia.nombre)} (tú)</div><div class="pt ${p >= 0.5 ? "gana" : ""}">${f1(miAl.pts)}</div>
        <div class="eq ${p < 0.5 ? "gana" : ""}">${esc(rival.nombre)}</div><div class="pt ${p < 0.5 ? "gana" : ""}">${f1(suAl.pts)}</div>
      </div>
      <div class="prob"><i class="h" style="width:${p * 100}%"></i><i class="a" style="width:${(1 - p) * 100}%"></i></div>
      <div class="fila entre mini"><span>Tú ${Math.round(p * 100)}%</span><span><b>${p >= 0.5 ? "Vas como favorito" : "Vas abajo"}</b></span><span>${esc(rival.abrev || rival.nombre)} ${Math.round((1 - p) * 100)}%</span></div>
      <details class="detalles"><summary>Alineación proyectada de ${esc(rival.nombre)}</summary><table class="mini"><tbody>${suAl.titulares.map(filaR).join("")}</tbody></table></details></div>`;
  }
  let semEquipo = SEM;
  render.equipo = function () {
    const el = $("#tab-equipo");
    const al = M.alineacion(roster, semEquipo);
    const resto = []; let totalResto = 0;
    for (let w = SEM; w <= ULTIMA; w++) { const p = M.alineacion(roster, w).pts; totalResto += p; resto.push({ x: "S" + w, y: p, tipo: "proy", titulo: `Semana ${w}: ${f1(p)} pts` }); }
    const lesionados = roster.filter((id) => { const d = M.proyectarSemana(M.porId[id], semEquipo).disp; return d && d.f < 1 && d.nota && !d.nota.includes("bye"); });
    const valorTotal = M.sum(roster.map((id) => M.porId[id].fila.valor));
    const filaAl = (x, banca) => {
      if (!x.id) return `<tr><td><b>${x.slot}</b></td><td colspan="6" class="malo">Sin jugador para este puesto</td></tr>`;
      const j = M.porId[x.id], pr = x.pr, fila = j.fila;
      const piso = Math.max(0, pr.pts - 0.85 * fila.sd * (pr.disp.f || 0)), techo = pr.pts + 0.85 * fila.sd * (pr.disp.f || 0);
      return `<tr class="clic" data-j="${j.id}">
        <td><b>${banca ? "Banca" : x.slot}</b></td>
        <td>${jugHTML(j)}</td>
        <td>${pr.bye ? "BYE" : esc(pr.rival)}</td>
        <td class="n grande">${f1(pr.pts)}</td>
        <td class="n ocultar-movil">${pr.espn !== null && pr.espn !== undefined ? f1(pr.espn) : "–"}</td>
        <td class="n ocultar-movil">${pr.bye || !pr.pts ? "–" : f0(piso) + "–" + f0(techo)}</td>
        <td>${estadoTag(pr)}</td>
        <td><button class="x" data-quitar="${j.id}" title="Quitar de mi equipo">×</button></td></tr>`;
    };
    // Fuerza por posición: tu titular vs. el titular promedio de la liga
    const fuerza = ["QB", "RB", "WR", "TE", "K", "DST"].map((p) => {
      const mios = roster.map((id) => M.porId[id].fila).filter((f) => f.j.pos === p).sort((a, b) => b.rosPG - a.rosPG);
      const n = M.cfg.slots[p] || 1;
      const mio = M.mean(mios.slice(0, n).map((f) => f.rosPG));
      const todos = M.tabla.filter((f) => f.j.pos === p).sort((a, b) => b.rosPG - a.rosPG);
      const liga = M.mean(todos.slice(0, M.cfg.equipos * n).map((f) => f.rosPG));
      const r = liga ? mio / liga : 0;
      const clase = r >= 1.1 ? ["verde", "Fuerte"] : r >= 0.93 ? ["azul", "Promedio"] : ["rojo", "Débil"];
      return `<tr><td><span class="pos ${p}">${p === "DST" ? "D/ST" : p}</span></td><td class="n">${f1(mio)}</td><td class="n">${f1(liga)}</td><td><span class="tag ${clase[0]}">${clase[1]}</span></td></tr>`;
    }).join("");

    el.innerHTML = `
      <div class="fila entre"><div><h2>${esc((window.MI_EQUIPO && window.MI_EQUIPO.nombre) || "Mi equipo")}${ligaMia && D.liga.nombre ? " · " + esc(D.liga.nombre) : ""}</h2>
        <p class="nota">Roster tomado de ${origenRoster}. Alineación: QB, 2 RB, 2 WR, RB/WR, TE, D/ST, K · 10 equipos · PPR.</p></div>
        <div>${semanaSelect("semEquipo", semEquipo)}</div></div>
      ${roster.length ? "" : `<div class="ayuda bloque"><b>Para empezar:</b> conecta tu liga de ESPN en la pestaña <a href="#" id="irLiga">Liga y datos</a>, o escribe tus jugadores abajo en "Agregar jugador a mi equipo".</div>`}
      <div class="kpis">
        <div class="kpi"><div class="v">${f1(al.pts)}</div><div class="l">Puntos proyectados, semana ${semEquipo}</div></div>
        <div class="kpi"><div class="v">${f0(totalResto)}</div><div class="l">Proyección resto de temporada (sem ${SEM}–${ULTIMA})</div></div>
        <div class="kpi"><div class="v">${f0(valorTotal)}</div><div class="l">Valor de trade del roster</div></div>
        <div class="kpi"><div class="v ${lesionados.length ? "malo" : ""}">${lesionados.length}</div><div class="l">Con alerta esta semana</div></div>
      </div>
      ${enfrentamientoHTML(al)}
      <div class="grid2">
        <div class="panel"><h3>Alineación recomendada · semana ${semEquipo}</h3>
          <div class="tabla-scroll"><table>
            <thead><tr><th>Puesto</th><th>Jugador</th><th>Rival</th><th class="n">Proy</th><th class="n ocultar-movil">ESPN</th><th class="n ocultar-movil">Rango</th><th>Estado</th><th></th></tr></thead>
            <tbody>${al.titulares.map((x) => filaAl(x)).join("")}
            <tr><td colspan="8" style="background:var(--panel2);font-weight:600">Banca</td></tr>
            ${al.banca.map((x) => filaAl(x, true)).join("")}</tbody></table></div>
          <p class="nota">Proy = proyección del modelo (mezclada con ESPN cuando hay proyección de ESPN). Rango = semana mala a semana buena (20%–80%).</p>
          <div class="fila" style="margin-top:10px"><input type="text" id="agregar" list="listaJugadores" placeholder="Agregar jugador a mi equipo…" style="flex:1;min-width:200px">
            <button class="btn" id="btnAgregar">Agregar</button>
            <button class="sec" id="btnRestaurar" title="Deshacer tus cambios al roster">Restaurar</button></div>
        </div>
        <div>
          <div class="panel"><h3>Proyección de tu alineación por semana</h3>${barraSVG(resto)}
            <p class="nota">Toma en cuenta semanas de descanso, rivales y lesiones conocidas.</p></div>
          <div class="panel"><h3>Fuerza por posición (resto de temporada)</h3>
            <table class="mini"><thead><tr><th>Pos</th><th class="n">Tus pts/sem</th><th class="n">Titular promedio</th><th></th></tr></thead><tbody>${fuerza}</tbody></table>
            <p class="nota">Compara a tus titulares contra el titular promedio de una liga de 10 equipos. Las posiciones débiles son las que conviene reforzar con un trade (ve "Movimientos").</p></div>
        </div>
      </div>`;
    $("#semEquipo").onchange = (e) => { semEquipo = +e.target.value; rivalElegido = null; render.equipo(); };
    if ($("#rivalSel")) $("#rivalSel").onchange = (e) => { rivalElegido = e.target.value; render.equipo(); };
    const agregar = () => { const id = desdeEntrada($("#agregar").value); if (id && !enRoster(id)) { roster.push(id); guardarRoster(); render.equipo(); } };
    $("#btnAgregar").onclick = agregar;
    if ($("#irLiga")) $("#irLiga").onclick = (e) => { e.preventDefault(); abrir("ajustes"); };
    $("#agregar").onkeydown = (e) => { if (e.key === "Enter") agregar(); };
    if ($("#btnRestaurar")) $("#btnRestaurar").onclick = () => { SY.estado.roster = null; SY.guardar(); cargarRoster(); sugerencias = null; waivers = null; render.equipo(); };
    el.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); roster = roster.filter((id) => id !== b.dataset.quitar); guardarRoster(); render.equipo(); }));
    conectarClics(el);
  };

  // ================= PARTIDOS =================
  let semPartidos = SEM;
  render.partidos = function () {
    const el = $("#tab-partidos");
    const juegos = M.partidos.filter((g) => g.w === semPartidos).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const byes = M.TEAMS.filter((t) => !M.partidoDe[t + "|" + semPartidos]);
    const clave = (t, g) => {
      const js = M.jugadores.filter((j) => j.t === t && j.pos !== "K" && j.pos !== "DST").map((j) => ({ j, pr: M.proyectarPartido(j, g) }))
        .filter((x) => x.pr.disp.f > 0);
      const top = (pos, k, campo) => js.filter((x) => x.j.pos === pos).sort((a, b) => b.pr.s[campo] - a.pr.s[campo]).slice(0, k);
      const rec = js.filter((x) => x.j.pos === "WR" || x.j.pos === "TE").sort((a, b) => b.pr.s.recyd - a.pr.s.recyd).slice(0, 3);
      return top("QB", 1, "pyd").concat(top("RB", 2, "ryd"), rec);
    };
    const tarjeta = (g) => {
      const pr = M.predecirPartido(g);
      const pa = pr.away.pts, ph = pr.home.pts, pH = pr.pHome;
      const favorito = pH >= 0.5 ? g.home : g.away;
      const pct = Math.round(Math.max(pH, 1 - pH) * 100);
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
      const real = g.jugado ? `<div class="nota" style="margin-top:6px">Final: <b>${g.away} ${g.as} – ${g.home} ${g.hs}</b> · el modelo daba ganador a ${favorito} (${(pH >= 0.5) === (g.hs > g.as) ? "✓ acertó" : "✗ falló"})</div>` : "";
      return `<div class="juego">
        <div class="cab"><span>${fechaCorta(g)}</span><span>${esc(lineaApuestas)}</span></div>
        <div class="marcador">
          <div class="eq ${pH < 0.5 ? "gana" : ""}">${esc(M.EQUIPOS[g.away])}</div><div class="pt ${pH < 0.5 ? "gana" : ""}">${f0(pa)}</div>
          <div class="eq ${pH >= 0.5 ? "gana" : ""}">@ ${esc(M.EQUIPOS[g.home])}</div><div class="pt ${pH >= 0.5 ? "gana" : ""}">${f0(ph)}</div>
        </div>
        <div class="prob"><i class="a" style="width:${(1 - pH) * 100}%"></i><i class="h" style="width:${pH * 100}%"></i></div>
        <div class="fila entre mini"><span>${g.away} ${Math.round((1 - pH) * 100)}%</span><span><b>Gana ${favorito}</b> (${pct}%)</span><span>${g.home} ${Math.round(pH * 100)}%</span></div>
        ${mios.length ? `<div class="mini" style="margin-top:6px">⭐ Tus jugadores: ${mios.map(esc).join(", ")}</div>` : ""}
        ${real}
        <details class="detalles"><summary>Yardas, TDs y jugadores clave</summary>
          ${tablaEq}<h3 style="margin-top:10px">${g.away}</h3>${jugTabla(g.away)}<h3 style="margin-top:10px">${g.home}</h3>${jugTabla(g.home)}
        </details></div>`;
    };
    el.innerHTML = `<div class="fila entre"><div><h2>Predicciones de la semana ${semPartidos}</h2>
      <p class="nota">Marcador esperado combinando el rendimiento de cada equipo (ajustado por rival) con la línea de las casas de apuestas cuando existe. ${byes.length ? "Descansan: " + byes.join(", ") + "." : ""}</p></div>
      <div>${semanaSelect("semPartidos", semPartidos)}</div></div>
      <div class="grid3 bloque">${juegos.map(tarjeta).join("") || `<div class="vacio">No hay partidos esta semana.</div>`}</div>`;
    $("#semPartidos").onchange = (e) => { semPartidos = +e.target.value; render.partidos(); };
    conectarClics(el);
  };

  // ================= JUGADORES =================
  const filtroJ = Object.assign({ pos: "TODOS", texto: "", orden: "valor", asc: false, equipo: "" }, leer("nflf_filtro") || {});
  render.jugadores = function () {
    const el = $("#tab-jugadores");
    const cols = [
      ["rankPos", "Rk", (x) => x.rankPos], ["ppg", "Pts/PJ", (x) => x.ppg], ["ultimas3", "Últ. 3", (x) => x.ultimas3],
      ["sem", "Proy S" + SEM, (x) => x.sem.pts], ["ros", "Resto temp.", (x) => x.ros], ["playoffs", "Playoffs", (x) => x.playoffs],
      ["valor", "Valor", (x) => x.valor], ["calendario", "Calendario", (x) => x.calendario],
    ];
    const get = Object.fromEntries(cols.map((c) => [c[0], c[2]]));
    let filas = M.tabla.filter((x) => (filtroJ.pos === "TODOS" || x.j.pos === filtroJ.pos) &&
      (!filtroJ.equipo || x.j.t === filtroJ.equipo) &&
      (!filtroJ.texto || x.j.n.toLowerCase().includes(filtroJ.texto.toLowerCase())) && (x.j.gp || x.ros > 0));
    const g = get[filtroJ.orden] || get.valor;
    filas.sort((a, b) => (filtroJ.asc ? 1 : -1) * (g(a) - g(b)) || b.ros - a.ros);
    filas = filas.slice(0, 200);
    const calTag = (c) => c >= 1.06 ? `<span class="tag verde">Fácil</span>` : c <= 0.94 ? `<span class="tag rojo">Difícil</span>` : `<span class="tag gris">Normal</span>`;
    el.innerHTML = `<div class="fila entre"><h2>Jugadores</h2>
      <div class="fila">
        <input type="search" id="buscar" placeholder="Buscar jugador…" value="${esc(filtroJ.texto)}">
        <select id="fPos">${["TODOS", ...M.POS].map((p) => `<option ${p === filtroJ.pos ? "selected" : ""} value="${p}">${p === "TODOS" ? "Todas las posiciones" : p === "DST" ? "D/ST" : p}</option>`).join("")}</select>
        <select id="fEq"><option value="">Todos los equipos</option>${M.TEAMS.map((t) => `<option ${t === filtroJ.equipo ? "selected" : ""}>${t}</option>`).join("")}</select>
      </div></div>
      <p class="nota">Puntos con el puntaje de tu liga. "Valor" (0–100) es su valor de trade según lo que aportará el resto de la temporada sobre un jugador de reemplazo. Clic en un jugador para ver su detalle.</p>
      <div class="panel bloque tabla-scroll"><table>
        <thead><tr><th>Jugador</th>${cols.map((c) => `<th class="n ord" data-o="${c[0]}">${c[1]}${filtroJ.orden === c[0] ? (filtroJ.asc ? " ▲" : " ▼") : ""}</th>`).join("")}<th>Estado</th></tr></thead>
        <tbody>${filas.map((x) => `<tr class="clic" data-j="${x.j.id}">
          <td>${jugHTML(x.j, (enRoster(x.j.id) ? "⭐ tuyo" : duenoDe[x.j.id] ? esc(duenoDe[x.j.id].abrev || duenoDe[x.j.id].nombre) : x.j.espn ? x.j.espn.own + "% ligas" : ""))}</td>
          <td class="n">${x.j.pos}${x.rankPos}</td><td class="n">${f1(x.ppg)}</td><td class="n">${f1(x.ultimas3)}</td>
          <td class="n fuerte">${x.sem.bye ? "BYE" : f1(x.sem.pts)}</td><td class="n">${f0(x.ros)}</td><td class="n">${f0(x.playoffs)}</td>
          <td class="n"><div class="fila" style="gap:6px;justify-content:flex-end"><div class="barra" style="width:50px"><i style="width:${x.valor}%"></i></div>${x.valor}</div></td>
          <td class="n">${calTag(x.calendario)}</td><td>${estadoTag(x.sem)}</td></tr>`).join("")}</tbody></table></div>`;
    const re = () => { guardar("nflf_filtro", filtroJ); render.jugadores(); };
    $("#buscar").oninput = (e) => { filtroJ.texto = e.target.value; clearTimeout(re.t); re.t = setTimeout(() => { re(); const b = $("#buscar"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }, 250); };
    $("#fPos").onchange = (e) => { filtroJ.pos = e.target.value; re(); };
    $("#fEq").onchange = (e) => { filtroJ.equipo = e.target.value; re(); };
    el.querySelectorAll("th.ord").forEach((th) => (th.onclick = () => {
      if (filtroJ.orden === th.dataset.o) filtroJ.asc = !filtroJ.asc; else { filtroJ.orden = th.dataset.o; filtroJ.asc = th.dataset.o === "rankPos"; }
      re();
    }));
    conectarClics(el);
  };

  // ================= DETALLE DE JUGADOR =================
  function detalle(id) {
    const j = M.porId[id], x = j.fila;
    const aj = SY.estado.ajustes[id];
    const reales = x.reales;
    const barras = [];
    for (let w = 1; w <= ULTIMA; w++) {
      const r = reales.find((y) => y.w === w);
      const fut = x.futuros.find((y) => y.g.w === w);
      if (r) barras.push({ x: w, y: r.pts, tipo: "real", titulo: `S${w} vs ${r.rival}: ${f1(r.pts)} pts` });
      else if (fut) barras.push({ x: w, y: fut.pts, tipo: "proy", titulo: `S${w} ${fut.rival}: proyección ${f1(fut.pts)}` });
      else barras.push({ x: w, y: 0, tipo: "bye", titulo: M.byes[j.t] === w ? "Descanso" : "No jugó" });
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
    const futuras = x.futuros.slice(0, 13).map((p) => `<tr><td>${p.g.w}</td><td>${esc(p.rival)}</td><td>${linea(p.s, j.pos)}</td><td class="n fuerte">${f1(p.pts)}</td><td>${estadoTag(p)}</td></tr>`).join("");
    const tdNota = j.base && x.j.gp >= 3 ? (x.tdReal - x.tdEsp >= 1.5 ? `<span class="tag amar">Ha anotado ${f1(x.tdReal - x.tdEsp)} TDs más de lo que sus yardas sugieren (posible baja)</span>` :
      x.tdEsp - x.tdReal >= 1.5 ? `<span class="tag verde">Ha anotado ${f1(x.tdEsp - x.tdReal)} TDs menos de lo esperado (posible alza)</span>` : "") : "";
    const usos = j.base && j.pos !== "QB" ? `Uso por partido: ${f1(j.base.car)} acarreos, ${f1(j.base.tgt)} pases dirigidos${j.base.ts ? ", " + Math.round(j.base.ts * 100) + "% de los pases del equipo" : ""}.` : "";
    $("#modalCuerpo").innerHTML = `
      <div class="fila">${avatar(j, true)}<div><h2>${esc(j.n)}</h2>
        <div class="nota"><span class="pos ${j.pos}">${j.pos === "DST" ? "D/ST" : j.pos}</span> ${esc(M.EQUIPOS[j.t] || j.t)} · descansa la semana ${M.byes[j.t] || "–"}
        ${j.espn ? ` · en el ${j.espn.own}% de las ligas de ESPN` : ""}${duenoDe[id] ? " · equipo: " + esc(duenoDe[id].nombre) : ""}</div>
        <div style="margin-top:6px">${estadoTag(x.sem)} ${tdNota}</div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${f1(x.ppg)}</div><div class="l">Pts por partido (${j.gp} PJ)</div></div>
        <div class="kpi"><div class="v">${x.sem.bye ? "BYE" : f1(x.sem.pts)}</div><div class="l">Proyección semana ${SEM}${x.sem.espn ? " (ESPN: " + f1(x.sem.espn) + ")" : ""}</div></div>
        <div class="kpi"><div class="v">${f0(x.ros)}</div><div class="l">Resto de temporada (${x.juegosRest} partidos)</div></div>
        <div class="kpi"><div class="v">${x.valor}</div><div class="l">Valor de trade · ${j.pos}${x.rankPos}</div></div>
      </div>
      <h3>Puntos por semana <span class="nota">(azul = real, verde = proyección)</span></h3>${barraSVG(barras)}
      ${usos ? `<p class="nota">${usos}</p>` : ""}
      ${reales.length ? `<h3 style="margin-top:14px">Partidos jugados</h3><div class="tabla-scroll"><table class="mini">${tablaReal}</table></div>` : ""}
      <h3 style="margin-top:14px">Próximos partidos</h3>
      <div class="tabla-scroll"><table class="mini"><thead><tr><th>Sem</th><th>Rival</th><th>Proyección</th><th class="n">Pts</th><th></th></tr></thead><tbody>${futuras}</tbody></table></div>
      <div class="fila" style="margin-top:14px">
        ${enRoster(id) ? `<button class="sec" data-acc="quitar">Quitar de mi equipo</button><button class="sec" data-acc="dar">Ofrecerlo en un trade</button>` :
          `<button class="sec" data-acc="agregar">Agregar a mi equipo</button><button class="sec" data-acc="pedir">Pedirlo en un trade</button>`}
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
        SY.guardar(); detalle(id); render[actual](); return;
      }
      if (a === "quitar") roster = roster.filter((r) => r !== id);
      if (a === "agregar" && !enRoster(id)) roster.push(id);
      if (a === "quitar" || a === "agregar") guardarRoster();
      if (a === "dar" && !trade.doy.includes(id)) trade.doy.push(id);
      if (a === "pedir" && !trade.recibo.includes(id)) trade.recibo.push(id);
      $("#modal").hidden = true;
      abrir(a === "dar" || a === "pedir" ? "trades" : actual);
    }));
  }
  $("#cerrarModal").onclick = () => ($("#modal").hidden = true);
  $("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").hidden = true; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#modal").hidden = true; });
  function conectarClics(el) {
    el.querySelectorAll("[data-j]").forEach((tr) => (tr.onclick = () => detalle(tr.dataset.j)));
  }

  // ================= TRADES =================
  const trade = { doy: [], recibo: [] };
  render.trades = function () {
    const el = $("#tab-trades");
    const lado = (clave, titulo) => {
      const ids = trade[clave];
      return `<div class="panel"><h3>${titulo}</h3>
        <div class="fila"><input type="text" list="listaJugadores" id="in-${clave}" placeholder="Escribe un jugador…" style="flex:1;min-width:180px"><button class="btn" data-add="${clave}">Agregar</button></div>
        <ul class="lista-trade">${ids.map((id) => { const x = M.porId[id].fila; return `<li><div class="clic" data-j="${id}" style="cursor:pointer">${jugHTML(x.j, "resto: " + f0(x.ros) + " pts")}</div>
          <div class="fila" style="gap:8px"><span class="fuerte">${x.valor}</span><button class="x" data-del="${clave}" data-id="${id}">×</button></div></li>`; }).join("") || `<li class="nota">Nadie todavía</li>`}</ul>
        ${clave === "doy" ? `<div class="nota">De tu equipo:</div><div class="fila" style="gap:6px;margin-top:6px">${roster.filter((id) => !trade.doy.includes(id)).map((id) => `<button class="sec" data-rap="doy" data-id="${id}">${esc(M.porId[id].n)}</button>`).join("")}</div>` : ""}
        ${clave === "recibo" && D.liga ? `<div class="nota">Roster de otro equipo:</div><select id="otroEquipo"><option value="">Elegir equipo…</option>${D.liga.equipos.filter((e) => !e.mio).map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</select><div class="fila" id="chipsOtro" style="gap:6px;margin-top:6px"></div>` : ""}
      </div>`;
    };
    let res = "";
    if (trade.doy.length && trade.recibo.length) {
      const r = M.evaluarTrade(trade.doy, trade.recibo, roster.some((id) => trade.doy.includes(id)) ? roster : null);
      const max = Math.max(r.vD, r.vR, 1);
      const imp = r.impacto ? `<p style="margin-top:10px"><b>Impacto en tu alineación:</b> ${r.impacto.dif >= 0 ? `<span class="bueno fuerte">+${f1(r.impacto.porSemana)} pts por semana</span>` : `<span class="malo fuerte">${f1(r.impacto.porSemana)} pts por semana</span>`}
        (${f0(r.impacto.antes)} → ${f0(r.impacto.luego)} pts en lo que queda de la temporada regular). Esto considera a quién pondrías de titular cada semana, descansos y lesiones.</p>` : "";
      const recibeMejor = Math.max(...trade.recibo.map((id) => M.porId[id].fila.valor)) > Math.max(...trade.doy.map((id) => M.porId[id].fila.valor));
      const playD = M.sum(trade.doy.map((id) => M.porId[id].fila.playoffs)), playR = M.sum(trade.recibo.map((id) => M.porId[id].fila.playoffs));
      res = `<div class="veredicto ${r.clase}"><h3>${r.veredicto}</h3>
        <div class="grid2" style="margin-top:10px">
          <div><div class="nota">Valor que das</div><div class="fila"><div class="barra" style="flex:1"><i style="width:${(r.vD / max) * 100}%;background:var(--rojo)"></i></div><b>${f0(r.vD)}</b></div></div>
          <div><div class="nota">Valor que recibes</div><div class="fila"><div class="barra" style="flex:1"><i style="width:${(r.vR / max) * 100}%"></i></div><b>${f0(r.vR)}</b></div></div>
        </div>${imp}
        <p class="nota" style="margin-top:8px">${recibeMejor ? "Recibes al mejor jugador del trade; eso suele valer más que varias piezas medianas. " : "Das al mejor jugador del trade; asegúrate de que lo que recibes llene una necesidad real. "}
        Playoffs de fantasy (semanas 15–17): das ${f0(playD)} pts proyectados y recibes ${f0(playR)}.</p></div>`;
    }
    el.innerHTML = `<h2>Analizar un trade</h2>
      <p class="nota">El veredicto compara el valor de mercado de cada lado (lo que aportarán el resto de la temporada sobre un jugador de reemplazo; las piezas extra valen menos porque ocupan lugar en el roster). Si das jugadores de tu equipo, también calcula cuántos puntos por semana ganarías o perderías en tu alineación.</p>
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
      $("#chipsOtro").innerHTML = eq ? eq.jugadores.filter((id) => M.porId[id] && !trade.recibo.includes(id)).map((id) => `<button class="sec" data-id="${id}">${esc(M.porId[id].n)}</button>`).join("") : "";
      $("#chipsOtro").querySelectorAll("button").forEach((b) => (b.onclick = () => { trade.recibo.push(b.dataset.id); render.trades(); }));
    };
    conectarClics(el);
  };

  function guardadosHTML() {
    const L = SY.estado.trades;
    if (!L.length) return `<div class="panel bloque"><h3>Trades guardados</h3><p class="nota">Cuando analices un trade, guárdalo con una nota para revisarlo después desde cualquier dispositivo.</p></div>`;
    return `<div class="panel bloque"><h3>Trades guardados</h3><div class="tabla-scroll"><table class="mini"><thead><tr><th>Das</th><th>Recibes</th><th>Hoy</th><th>Nota</th><th></th></tr></thead><tbody>${L.map((t) => {
      const doy = t.doy.filter((i) => M.porId[i]), rec = t.recibo.filter((i) => M.porId[i]);
      const r = doy.length && rec.length ? M.evaluarTrade(doy, rec, null) : null;
      return `<tr><td>${doy.map((i) => esc(M.porId[i].n)).join(", ")}</td><td>${rec.map((i) => esc(M.porId[i].n)).join(", ")}</td>
        <td>${r ? `<span class="tag ${r.clase === "justo" ? "azul" : r.clase === "favor" ? "verde" : "rojo"}">${esc(r.veredicto.split(" (")[0])}</span>` : "–"}<div class="nota">${esc(t.fecha || "")}</div></td>
        <td><input type="text" data-tnota="${t.id}" value="${esc(t.nota || "")}" placeholder="Agregar nota" style="width:100%;min-width:140px"></td>
        <td><div class="fila" style="gap:6px;flex-wrap:nowrap"><button class="sec" data-tcargar="${t.id}">Abrir</button><button class="sec" data-tborrar="${t.id}">Borrar</button></div></td></tr>`;
    }).join("")}</tbody></table></div></div>`;
  }

  // ================= A QUIÉN BUSCAR =================
  let sugerencias = null, waivers = null;
  function recalcularTodo() { M.recalcular(); sugerencias = null; waivers = null; }
  function calcularWaivers() {
    const base = M.puntosRestoTemporada(roster);
    const libre = (x) => !enRoster(x.j.id) && x.ros > 0 && (D.liga ? !duenoDe[x.j.id] : !x.j.espn || x.j.espn.own < 50);
    const candidatos = M.tabla.filter(libre).sort((a, b) => b.rosPG - a.rosPG).slice(0, 70);
    const agregar = [];
    candidatos.forEach((x) => {
      let mejor = null;
      roster.forEach((d) => {
        const gana = M.puntosRestoTemporada(roster.filter((r) => r !== d).concat([x.j.id])) - base;
        if (gana > 3 && (!mejor || gana > mejor.gana)) mejor = { add: x.j.id, drop: d, gana };
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
    const objetivos = M.tabla.filter((x) => !enRoster(x.j.id) && x.valor >= 8 && x.j.pos !== "K" && (!duenoDe[x.j.id] || !duenoDe[x.j.id].mio)).slice(0, 70);
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
  render.objetivos = function () {
    const el = $("#tab-objetivos");
    const semanas = Math.max(1, ULTIMA - SEM + 1);
    const razonesCompra = (x) => {
      const r = [];
      if (x.tdEsp - x.tdReal >= 1.2) r.push(`le han faltado ~${f1(x.tdEsp - x.tdReal)} TDs para lo que produce en yardas`);
      if (x.j.base && x.j.base.ts >= 0.22) r.push(`recibe el ${Math.round(x.j.base.ts * 100)}% de los pases de su equipo`);
      if (x.j.base && x.j.base.car >= 15) r.push(`${f1(x.j.base.car)} acarreos por partido`);
      if (x.calendario >= 1.05) r.push("calendario fácil lo que resta");
      if (x.ultimas3 < x.ppg - 3) r.push("viene de semanas flojas");
      if (x.j.prev && x.j.prev.g >= 8 && x.j.base) {
        const pp = M.puntos(Object.fromEntries(D.stats.map((k, i) => [k, x.j.prev.s[i] || 0])), x.j.pos, false);
        if (pp > x.ppg + 2) r.push(`el año pasado promedió ${f1(pp)} pts`);
      }
      return r.slice(0, 3).join("; ") || "su proyección supera lo que ha hecho";
    };
    const razonesVenta = (x) => {
      const r = [];
      if (x.tdReal - x.tdEsp >= 1.2) r.push(`ha anotado ~${f1(x.tdReal - x.tdEsp)} TDs más de lo que sus yardas sugieren`);
      if (x.calendario <= 0.95) r.push("calendario difícil lo que resta");
      if (x.ultimas3 > x.ppg + 3) r.push("viene de semanas muy altas");
      if (x.j.base && x.j.pos !== "QB" && x.j.base.ts < 0.15 && x.j.pos !== "RB") r.push("pocos pases dirigidos para su producción");
      return r.slice(0, 3).join("; ") || "su producción probablemente baje";
    };
    const conJuegos = M.tabla.filter((x) => x.j.gp >= 3 && x.j.pos !== "K" && x.j.pos !== "DST" && (x.sem.bye || (x.sem.disp && x.sem.disp.f > 0.5)));
    const compra = conJuegos.filter((x) => !enRoster(x.j.id) && x.valor >= 10 && x.rosPG - x.ppg >= Math.max(1.5, 0.1 * x.rosPG))
      .sort((a, b) => (b.rosPG - b.ppg) * Math.sqrt(b.valor) - (a.rosPG - a.ppg) * Math.sqrt(a.valor)).slice(0, 12);
    const venta = conJuegos.filter((x) => x.valor >= 8 && x.ppg - x.rosPG >= Math.max(1.5, 0.1 * x.ppg))
      .sort((a, b) => (b.ppg - b.rosPG) * Math.sqrt(b.valor) - (a.ppg - a.rosPG) * Math.sqrt(a.valor));
    const ventaMia = venta.filter((x) => enRoster(x.j.id));
    const ventaOtros = venta.filter((x) => !enRoster(x.j.id)).slice(0, 8);
    const calendario = M.tabla.filter((x) => x.valor >= 5 && x.j.pos !== "K" && !enRoster(x.j.id) && x.juegosRest >= 6).sort((a, b) => b.calendario - a.calendario).slice(0, 10);
    const libres = D.liga ? M.tabla.filter((x) => !duenoDe[x.j.id] && x.ros > 0).slice(0, 12) :
      M.tabla.filter((x) => x.j.espn && x.j.espn.own < 35 && x.ros > 0 && x.j.pos !== "K").slice(0, 12);
    const filaLista = (x, razon) => `<tr class="clic" data-j="${x.j.id}"><td>${jugHTML(x.j, duenoDe[x.j.id] ? esc(duenoDe[x.j.id].nombre) : "")}
      ${razon ? `<div class="nota" style="margin:3px 0 0 42px">${razon}</div>` : ""}</td>
      <td class="n">${f1(x.ppg)}</td><td class="n fuerte">${f1(x.rosPG)}</td><td class="n">${x.valor}</td></tr>`;
    const tablaLista = (filas, fn) => filas.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Jugador</th><th class="n">Pts/PJ</th><th class="n">Proy/PJ</th><th class="n">Valor</th></tr></thead><tbody>${filas.map(fn).join("")}</tbody></table></div>` : `<div class="vacio">Nadie cumple el criterio ahora.</div>`;

    let sug = `<div class="vacio">Calculando…</div>`;
    if (sugerencias) {
      sug = sugerencias.length ? `<div class="tabla-scroll"><table><thead><tr><th>Pide</th><th>Ofrece</th><th class="n">Valor (das / recibes)</th><th class="n">Tu alineación</th><th></th></tr></thead><tbody>${sugerencias.map((s, i) => {
        const t = M.porId[s.objetivo];
        return `<tr><td class="clic" data-j="${t.id}">${jugHTML(t, duenoDe[t.id] ? esc(duenoDe[t.id].nombre) : "")}</td>
          <td>${s.doy.map((id) => `<div class="clic" data-j="${id}">${jugHTML(M.porId[id])}</div>`).join("")}</td>
          <td class="n">${f0(s.vD)} / ${f0(s.vR)}</td><td class="n bueno fuerte">+${f1(s.gana / semanas)} pts/sem</td>
          <td><button class="sec" data-prueba="${i}">Analizar</button></td></tr>`;
      }).join("")}</tbody></table></div>` : `<div class="vacio">No encontré trades justos que mejoren tu alineación. Tu roster está bien balanceado para su valor.</div>`;
    }
    el.innerHTML = `<h2>Movimientos: compra, vende, agrega y suelta</h2>
      <p class="nota">Proy/PJ = puntos por partido que el modelo espera el resto de la temporada. Cuando es mucho mayor que lo que ha hecho (Pts/PJ), es buen momento para pedirlo; cuando es menor, es buen momento para venderlo.</p>
      <div class="panel bloque"><h3>Trades recomendados para tu equipo</h3>
        <p class="nota">Ofertas de valor parecido (que el otro equipo podría aceptar) que más puntos por semana le suman a tu alineación.${D.liga ? "" : " Como tu liga no está conectada, puede sugerir jugadores que ya tienes tú o que nadie tiene."}</p>${sug}</div>
      <div class="grid2 anchas bloque">
        <div class="panel"><h3>➕ Agregar de waivers</h3>
          <p class="nota">${D.liga ? "Jugadores que nadie tiene en tu liga" : "Jugadores en pocas ligas de ESPN (conecta tu liga para ver solo los que están libres de verdad)"}, ordenados por cuántos puntos le suman a tu alineación lo que resta de la temporada, y a quién soltarías.</p>
          ${waivers ? (waivers.agregar.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Agrega</th><th>Suelta</th><th class="n">Gana</th></tr></thead><tbody>${waivers.agregar.map((w) => `<tr>
            <td class="clic" data-j="${w.add}">${jugHTML(M.porId[w.add], M.porId[w.add].espn ? M.porId[w.add].espn.own + "% ligas" : "")}<div class="nota" style="margin-left:42px">Proy. semana ${SEM}: ${f1(M.porId[w.add].fila.sem.pts)} · resto: ${f0(M.porId[w.add].fila.ros)}</div></td>
            <td class="clic" data-j="${w.drop}">${jugHTML(M.porId[w.drop])}</td>
            <td class="n bueno fuerte">+${f1(w.gana / semanas)}<div class="nota">pts/sem</div></td></tr>`).join("")}</tbody></table></div>` :
            `<div class="vacio">Ningún agente libre mejora tu alineación ahora mismo.</div>`) : `<div class="vacio">Calculando…</div>`}</div>
        <div class="panel"><h3>➖ Candidatos para soltar</h3>
          <p class="nota">Los jugadores de tu roster que menos puntos le aportan a tu alineación lo que resta de la temporada (casi nunca serían titulares).</p>
          ${waivers ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Jugador</th><th class="n">Aporta</th><th class="n">Valor</th></tr></thead><tbody>${waivers.soltar.map((w) => `<tr class="clic" data-j="${w.id}">
            <td>${jugHTML(M.porId[w.id])}</td><td class="n">${f1(w.aporta / semanas)}<div class="nota">pts/sem</div></td><td class="n">${M.porId[w.id].fila.valor}</td></tr>`).join("")}</tbody></table></div>` : `<div class="vacio">Calculando…</div>`}</div>
        <div class="panel"><h3>★ Mis seguimientos</h3>
          ${SY.estado.seguimiento.length ? `<div class="tabla-scroll"><table class="mini"><thead><tr><th>Jugador</th><th class="n">Proy S${SEM}</th><th class="n">Valor</th><th>Nota</th><th></th></tr></thead><tbody>${SY.estado.seguimiento.filter((z) => M.porId[z.id]).map((z) => { const x = M.porId[z.id].fila; return `<tr>
            <td class="clic" data-j="${z.id}">${jugHTML(x.j, duenoDe[z.id] ? esc(duenoDe[z.id].nombre) : enRoster(z.id) ? "tuyo" : "")}</td>
            <td class="n fuerte">${x.sem.bye ? "BYE" : f1(x.sem.pts)}</td><td class="n">${x.valor}</td>
            <td><input type="text" data-snota="${z.id}" value="${esc(z.nota || "")}" placeholder="Agregar nota" style="width:100%;min-width:120px"></td>
            <td><button class="x" data-squitar="${z.id}" title="Dejar de seguir">×</button></td></tr>`; }).join("")}</tbody></table></div>` :
            `<p class="nota">Abre a cualquier jugador y toca <b>☆ Seguir</b> para tenerlo aquí, con tus notas, en la computadora y en el teléfono.</p>`}
          <div class="fila" style="margin-top:8px"><input type="text" id="seguirNuevo" list="listaJugadores" placeholder="Seguir a un jugador…" style="flex:1;min-width:180px"><button class="btn" id="btnSeguir">Seguir</button></div></div>
        <div class="panel"><h3>🟢 Comprar barato</h3>${tablaLista(compra, (x) => filaLista(x, razonesCompra(x)))}</div>
        <div class="panel"><h3>🔴 Vender caro (de tu equipo)</h3>${tablaLista(ventaMia, (x) => filaLista(x, razonesVenta(x)))}
          <h3 style="margin-top:14px">Vender caro (otros equipos, para no pedirlos)</h3>${tablaLista(ventaOtros, (x) => filaLista(x, razonesVenta(x)))}</div>
        <div class="panel"><h3>📅 Calendario más fácil lo que resta</h3>${tablaLista(calendario, (x) => filaLista(x, `rivales ${Math.round((x.calendario - 1) * 100)}% más fáciles que el promedio`))}</div>
      </div>`;
    el.querySelectorAll("[data-prueba]").forEach((b) => (b.onclick = () => {
      const s = sugerencias[+b.dataset.prueba];
      trade.doy = s.doy.slice(); trade.recibo = [s.objetivo]; abrir("trades");
    }));
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
    if (!sugerencias || !waivers) setTimeout(() => {
      if (!waivers) waivers = calcularWaivers();
      if (!sugerencias) sugerencias = calcularSugerencias();
      if (actual === "objetivos") render.objetivos();
    }, 30);
  };

  // ================= LIGA Y DATOS =================
  render.ajustes = function () {
    const el = $("#tab-ajustes");
    const P = M.cfg.pts;
    el.innerHTML = `<h2>Tu liga y los datos</h2>
      <div class="grid2 bloque">
        <div class="panel"><h3>Puntuación que usa la página</h3>
          <table class="mini"><tbody>
            <tr><td>Equipos</td><td>10 · Head to Head Points</td></tr>
            <tr><td>Alineación</td><td>QB, 2 RB, 2 WR, 1 RB/WR, TE, D/ST, K</td></tr>
            <tr><td>Pase</td><td>1 pt cada 25 yd · TD ${P.ptd} · INT ${P.int} · sack ${P.sk} · 2pt ${P.tp}</td></tr>
            <tr><td>Carrera / recepción</td><td>1 pt cada 10 yd · TD 6 · recepción ${P.rec} (PPR)</td></tr>
            <tr><td>Balones sueltos</td><td>fumble +${P.fum} · fumble perdido ${P.fl}</td></tr>
            <tr><td>Regresos</td><td>${P.ret} por yarda de regreso</td></tr>
            <tr><td>Pateador</td><td>FG 0–39: 3 · 40–49: 4 · 50+: 5 · PAT 1 · fallos +1 (así está configurada tu liga)</td></tr>
            <tr><td>D/ST</td><td>sack 1 · INT 2 · balón recuperado 2 · balón forzado 1 · safety 2 · bloqueo 2 · TD 6 · por puntos permitidos de +10 a −5</td></tr>
          </tbody></table>
          <p class="nota">Es la puntuación de la liga "borregos fantasy" (PPR, 10 equipos). Si tu liga usa otra, las proyecciones pueden variar un poco de lo que muestra ESPN.</p></div>
        <div class="panel"><h3>De dónde salen los datos</h3>
          <p><b>ESPN Fantasy:</b> ${D.fuenteEspn ? `<span class="tag verde">conectado</span> estado de lesiones, % de ligas que tienen a cada jugador y proyecciones de ESPN.` : `<span class="tag gris">sin datos de ESPN</span> se usan solo las estadísticas oficiales de la NFL.`}</p>
          <p><b>Tu liga:</b> ${D.liga ? `<span class="tag verde">conectada</span> ${D.liga.equipos.length} equipos con sus rosters.` : `<span class="tag gris">no conectada</span> (opcional, ver abajo).`}</p>
          <p><b>Estadísticas jugada a jugada:</b> nflverse (los mismos números oficiales de la NFL que usa ESPN), resultados y líneas de apuestas.</p>
          <p class="nota">Última actualización: ${D.generado.replace("T", " ")}.</p></div>
      </div>
      <div class="panel bloque" id="conectar"><h3>Conectar tu liga de ESPN</h3>
        ${D.liga ? `<p><span class="tag verde">Conectada</span> ${esc(D.liga.nombre || "Tu liga")} · leída el ${esc((D.espnFecha || D.generado || "").slice(0, 16).replace("T", " "))}.
          Para ponerla al día (rosters, lesiones, proyecciones de ESPN) repite los pasos 2 y 3 cada semana.</p>
          <table class="mini"><thead><tr><th>Equipo</th><th>Dueño</th><th class="n">Récord</th><th class="n">Jugadores</th></tr></thead><tbody>
          ${D.liga.equipos.map((e) => `<tr><td>${e.mio ? "⭐ " : ""}${esc(e.nombre)}</td><td>${esc(e.dueno || "")}</td><td class="n">${esc(e.record || "")}</td><td class="n">${e.jugadores.length}</td></tr>`).join("")}</tbody></table>` :
          `<p>Con tu liga conectada la página sabe qué equipo tiene a cada jugador, quiénes están libres, y arma trades con los rosters reales de tus rivales. No necesitas cookies ni Python.</p>`}
        <ol class="pasos">
          <li><b>Una sola vez:</b> muestra la barra de favoritos de Chrome (<b>Ctrl+Shift+B</b>) y <b>arrastra este botón</b> hasta ella:
            <a class="btn" style="display:inline-block;text-decoration:none;margin:6px 4px" href="${window.EspnLocal ? EspnLocal.codigoBoton(window.MI_EQUIPO && window.MI_EQUIPO.ligaId) : "#"}" onclick="alert('Arrástrame a tu barra de favoritos y úsame estando en la página de tu liga en ESPN.');return false;">⬇ Bajar mi liga de ESPN</a></li>
          <li>Abre <a href="https://fantasy.espn.com/football/" target="_blank" rel="noopener">tu liga en fantasy.espn.com</a> (con tu sesión iniciada) y da clic en el favorito <b>⬇ Bajar mi liga de ESPN</b>. Se descarga el archivo <code>espn_liga.json</code>.</li>
          <li>Regresa aquí y cárgalo: <input type="file" id="archivoEspn" accept=".json,application/json"></li>
        </ol>
        <p class="nota" id="msgEspn"></p>
        ${D.liga ? `<button class="sec" id="desconectarEspn">Desconectar liga</button>` : ""}
        <p class="nota">El archivo solo contiene los rosters y datos de jugadores de tu liga; no lleva tu contraseña. Se guarda en este navegador.</p></div>
      <div class="panel bloque"><h3>Cómo se actualiza</h3>
        <p>Las estadísticas, partidos y lesiones se actualizan solos los martes y sábados en la mañana. Solo recarga la página.</p>
        <p class="nota">Tu liga de ESPN no se actualiza sola: repite los pasos 2 y 3 de arriba cuando quieras ponerla al día (por ejemplo después de los waivers).</p></div>
      <div class="panel bloque" id="respaldo"><h3>Tus datos</h3>
        <p id="txtRespaldo"></p>
        <div class="fila"><button class="sec" id="btnRespaldo">Guardar respaldo</button>
          <label class="sec" style="display:inline-block;padding:6px 10px;border:1px solid var(--borde);border-radius:8px;background:var(--panel2);cursor:pointer">Cargar respaldo <input type="file" id="archivoRespaldo" accept=".json,application/json" hidden></label></div>
        <p class="nota" id="msgRespaldo"></p></div>
      <div class="panel bloque"><h3>Cómo predice el modelo</h3>
        <p class="nota">Cada jugador tiene un promedio por partido de esta temporada (las semanas recientes pesan más) combinado con la temporada pasada, y sus TDs se ajustan hacia lo que sus yardas sugieren. Para cada partido se predice el marcador y las yardas de cada equipo con el rendimiento de las ofensivas y defensas ajustado por rival, mezclado con la línea de las casas de apuestas cuando existe. Las estadísticas del jugador suben o bajan según ese partido, y se descuentan lesiones y semanas de descanso. El valor de trade es lo que aportará el resto de la temporada por encima de un jugador que encontrarías en agentes libres.</p></div>`;
    conectarEspnUI();
  };

  function respaldoUI() {
    const nube = !!window.claude;
    $("#txtRespaldo").textContent = nube
      ? "Tu roster, seguimientos, trades y tu liga se guardan en tu cuenta y se sincronizan solos con tus otros dispositivos."
      : "Tu roster, seguimientos, trades y tu liga se guardan solo en este navegador. Para pasarlos a tu teléfono u otra computadora, guarda un respaldo aquí y cárgalo allá.";
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
          const c = EspnLocal.compactar(raw, (window.MI_EQUIPO && window.MI_EQUIPO.nombre) || "");
          if (!c.liga.equipos.length) throw new Error("el archivo no trae equipos");
          SY.estado.roster = null;
          SY.guardar();
          $("#msgEspn").textContent = "Guardando tu liga…";
          SY.guardarEspn(c).then(() => {
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

  // Indicador de sincronización
  function pintarSync() {
    const el = $("#sync");
    if (!el) return;
    const m = SY.modo;
    el.className = "tag " + (m === "nube" ? "verde" : m === "error" ? "rojo" : "gris");
    el.textContent = m === "nube" ? "Sincronizado" : m === "conectando" ? "Conectando…" : m === "error" ? "Sin sincronizar" : "Guardado en este dispositivo";
    el.title = m === "nube" ? "Tus cambios se guardan en tu cuenta y aparecen en tu teléfono y tu computadora." : m === "error" ? "No se pudo guardar en la nube. Tus cambios siguen en este dispositivo." : "Abre la versión publicada para sincronizar con tu teléfono.";
  }
  SY.alCambiar((que) => {
    if (que === "modo") pintarSync();
    if (que === "estado") { cargarRoster(); recalcularTodo(); render[actual](); }
    if (que === "espn") location.reload();
  });
  pintarSync();
  SY.iniciar();

  // Inicio
  abrir(render[actual] ? actual : "equipo");
})();
