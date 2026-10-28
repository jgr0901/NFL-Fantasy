"""
Descarga las estadísticas de la NFL y de ESPN Fantasy y genera data.js
para la página de análisis (index.html).

Uso:  python actualizar_datos.py            (temporada actual)
      python actualizar_datos.py 2026       (temporada específica)

Fuentes:
  * ESPN Fantasy (principal para estado de lesiones, % de equipos que lo tienen,
    proyecciones de ESPN y, si configuras espn_config.json, los rosters de tu liga).
  * nflverse (estadísticas oficiales jugada a jugada, las mismas que usa ESPN).

Solo usa la librería estándar de Python; no hay que instalar nada.
Si una descarga falla, usa la copia guardada en la carpeta datos/.
"""
import csv
import datetime as dt
import gzip
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(AQUI, "datos")
REL = "https://github.com/nflverse/nflverse-data/releases/download/"
GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
ESPN = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{temp}"
POSICIONES = {"QB", "RB", "WR", "TE"}

# Orden de las estadísticas en cada semana (lo usa modelo.js)
STATS = ["att", "cmp", "pyd", "ptd", "int", "car", "ryd", "rtd",
         "tgt", "rec", "recyd", "rectd", "fl", "tp", "ts", "ay", "sk", "fum", "ret"]

# Equipos NFL según el id de ESPN
ESPN_TEAMS = {1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
              9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LA", 15: "MIA", 16: "MIN",
              17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
              25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"}
ESPN_POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}


def temporada_actual():
    hoy = dt.date.today()
    return hoy.year if hoy.month >= 3 else hoy.year - 1


def bajar(url, nombre, headers=None):
    """Descarga y guarda en datos/. Si falla, regresa la copia guardada (o None)."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, nombre)
    try:
        h = {"User-Agent": "Mozilla/5.0 (nfl-fantasy-local)"}
        h.update(headers or {})
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60) as r:
            datos = r.read()
        with open(ruta, "wb") as f:
            f.write(datos)
        print(f"  descargado {nombre} ({len(datos) // 1024} KB)")
    except Exception as e:  # sin internet, bloqueado o aún no publicado
        if not os.path.exists(ruta):
            print(f"  no se pudo descargar {nombre}: {e}")
            return None
        print(f"  usando copia guardada de {nombre} ({e})")
    with open(ruta, encoding="utf-8") as f:
        return f.read()


def bajar_csv(url, nombre):
    txt = bajar(url, nombre)
    return list(csv.DictReader(txt.splitlines())) if txt else []


def bajar_gz_csv(url, nombre, columnas):
    """Descarga un .csv.gz grande (jugada a jugada) y regresa solo las columnas pedidas."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, nombre)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (nfl-fantasy-local)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            datos = r.read()
        with open(ruta, "wb") as f:
            f.write(datos)
        print(f"  descargado {nombre} ({len(datos) // 1024} KB)")
    except Exception as e:
        if not os.path.exists(ruta):
            print(f"  no se pudo descargar {nombre}: {e}")
            return []
        print(f"  usando copia guardada de {nombre} ({e})")
    with gzip.open(ruta, "rt", encoding="utf-8") as f:
        return [{k: r.get(k, "") for k in columnas} for r in csv.DictReader(f)]


def json_url(url, nombre, headers=None):
    txt = bajar(url, nombre, headers)
    try:
        return json.loads(txt) if txt else None
    except ValueError:
        return None


def num(v):
    try:
        return float(v) if v not in ("", "NA", None) else 0.0
    except ValueError:
        return 0.0


def compacto(lst, d=3):
    return [int(x) if x == int(x) else round(x, d) for x in lst]


def normal(nombre):
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def fila_stats(r):
    return compacto([
        num(r["attempts"]), num(r["completions"]), num(r["passing_yards"]),
        num(r["passing_tds"]), num(r["passing_interceptions"]),
        num(r["carries"]), num(r["rushing_yards"]), num(r["rushing_tds"]),
        num(r["targets"]), num(r["receptions"]), num(r["receiving_yards"]),
        num(r["receiving_tds"]), num(r["fumbles_lost_total"]),
        num(r["passing_2pt_conversions"]) + num(r["rushing_2pt_conversions"]) + num(r["receiving_2pt_conversions"]),
        num(r["target_share"]), num(r["receiving_air_yards"]), num(r["sacks_suffered"]),
        num(r["fumbles_total"]), num(r["kickoff_return_yards"]) + num(r["punt_return_yards"]),
    ])


def distancias(v):
    return [int(float(x)) for x in str(v).split(";") if x not in ("", "NA", "nan")]


def fila_k(r):
    return [distancias(r["fg_made_list"]), distancias(r["fg_missed_list"]) + distancias(r["fg_blocked_list"]),
            int(num(r["pat_made"])), int(num(r["pat_missed"]) + num(r["pat_blocked"]))]


# ---------------------------------------------------------------- ESPN
def espn(temp, ruta, nombre, filtro=None, cookies=None):
    h = {"Accept": "application/json"}
    if filtro:
        h["X-Fantasy-Filter"] = json.dumps(filtro)
    if cookies and cookies.get("espn_s2") and cookies.get("swid"):
        h["Cookie"] = f"espn_s2={cookies['espn_s2']}; SWID={cookies['swid']}"
    txt = bajar(ESPN.format(temp=temp) + ruta, nombre, h)
    try:
        return json.loads(txt) if txt else None
    except ValueError:
        print(f"  ESPN regresó algo que no es JSON en {nombre}")
        return None


def leer_jugadores_espn(js, semana):
    """Saca de la respuesta de ESPN: lesión, % rostered y proyecciones."""
    out = {}
    lista = js.get("players", []) if isinstance(js, dict) else []
    for e in lista:
        p = e.get("player") or {}
        pid = p.get("id")
        if pid is None:
            continue
        proy_sem = proy_temp = None
        for s in p.get("stats") or []:
            if s.get("statSourceId") != 1:
                continue
            if s.get("statSplitTypeId") == 1 and s.get("scoringPeriodId") == semana:
                proy_sem = s.get("appliedTotal")
            elif s.get("statSplitTypeId") == 0:
                proy_temp = s.get("appliedTotal")
        out[pid] = {
            "n": p.get("fullName", ""),
            "pos": ESPN_POS.get(p.get("defaultPositionId")),
            "t": ESPN_TEAMS.get(p.get("proTeamId")),
            "inj": p.get("injuryStatus") or ("OUT" if p.get("injured") else "ACTIVE"),
            "own": round((p.get("ownership") or {}).get("percentOwned") or 0, 1),
            "ps": None if proy_sem is None else round(proy_sem, 1),
            "pt": None if proy_temp is None else round(proy_temp, 1),
            # Análisis de ESPN para la semana (en inglés) y fecha de su última noticia
            "ol": (((p.get("outlooks") or {}).get("outlooksByWeek") or {}).get(str(semana)) or "")[:700],
            "nd": p.get("lastNewsDate"),
        }
    return out


def cargar_config():
    ruta = os.path.join(AQUI, "espn_config.json")
    if not os.path.exists(ruta):
        return {}
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except ValueError as e:
        print(f"  espn_config.json tiene un error de formato: {e}")
        return {}


def main():
    temp = int(sys.argv[1]) if len(sys.argv) > 1 else temporada_actual()
    prev = temp - 1
    print(f"Temporada {temp} (previa {prev})")

    st = bajar_csv(REL + f"stats_player/stats_player_week_{temp}.csv", f"stats_{temp}.csv")
    stp = bajar_csv(REL + f"stats_player/stats_player_week_{prev}.csv", f"stats_{prev}.csv")
    games = bajar_csv(GAMES_URL, "games.csv")
    roster = bajar_csv(REL + f"rosters/roster_{temp}.csv", f"roster_{temp}.csv")
    inj = bajar_csv(REL + f"injuries/injuries_{temp}.csv", f"injuries_{temp}.csv")
    snaps = bajar_csv(REL + f"snap_counts/snap_counts_{temp}.csv", f"snaps_{temp}.csv")
    pbp = bajar_gz_csv(REL + f"pbp/play_by_play_{temp}.csv.gz", f"pbp_{temp}.csv.gz",
                       ["season_type", "week", "yardline_100", "play_type", "two_point_attempt",
                        "rusher_player_id", "receiver_player_id", "posteam"])

    # ---- Partidos ----
    partidos, marcador = [], {}
    for g in games:
        if g["game_type"] != "REG" or int(g["season"]) not in (temp, prev):
            continue
        s, w = int(g["season"]), int(g["week"])
        hs = None if g["home_score"] in ("", "NA") else int(float(g["home_score"]))
        as_ = None if g["away_score"] in ("", "NA") else int(float(g["away_score"]))
        if hs is not None:
            marcador[(s, w, g["home_team"])] = (hs, as_)
            marcador[(s, w, g["away_team"])] = (as_, hs)
        if s == temp:
            partidos.append([g["game_id"], w, g["gameday"], g["gametime"], g["away_team"], g["home_team"],
                             as_, hs,
                             None if g["spread_line"] in ("", "NA") else float(g["spread_line"]),
                             None if g["total_line"] in ("", "NA") else float(g["total_line"]),
                             g["roof"] if g["roof"] != "NA" else "",
                             g.get("stadium", "") if g.get("stadium") != "NA" else ""])
    # Semana a proyectar: la primera donde la mayoría de los partidos no se ha jugado
    sem_espn = max([p[1] for p in partidos] or [1])
    for w in sorted({p[1] for p in partidos}):
        gs = [p for p in partidos if p[1] == w]
        if sum(p[7] is None for p in gs) > len(gs) / 2:
            sem_espn = w
            break

    # ---- Totales por equipo y semana (para defensas y equipos) ----
    def totales(filas, season):
        t = defaultdict(lambda: defaultdict(float))
        for r in filas:
            if r["season_type"] != "REG":
                continue
            w, eq, op = int(r["week"]), r["team"], r["opponent_team"]
            a = t[(w, eq)]
            a["opp"] = op
            a["py"] += num(r["passing_yards"]) - num(r["sack_yards_lost"])
            a["ry"] += num(r["rushing_yards"])
            a["ptd"] += num(r["passing_tds"])
            a["rtd"] += num(r["rushing_tds"])
            a["sk_allowed"] += num(r["sacks_suffered"])
            a["to"] += num(r["passing_interceptions"]) + num(r["fumbles_lost_total"])
            a["sk"] += num(r["def_sacks"])
            a["int"] += num(r["def_interceptions"])
            a["fr"] += num(r["fumble_recovery_opp"])
            a["ff"] += num(r["def_fumbles_forced"])
            a["td"] += num(r["def_tds"]) + num(r["special_teams_tds"])
            a["sf"] += num(r["def_safeties"])
            a["blk"] += num(r["def_fg_blocks"]) + num(r["def_punt_blocks"]) + num(r["def_pat_blocks"])
        defensas = defaultdict(list)
        for (w, eq), a in t.items():
            op = a["opp"]
            b = t.get((w, op), {})
            sc = marcador.get((season, w, eq))
            if not sc:
                continue
            fila = compacto([w, 0, a["sk"], a["int"], a["fr"], a["ff"], a["td"], a["sf"], a["blk"],
                             sc[1], b.get("py", 0) + b.get("ry", 0), a["sk_allowed"], a["to"], sc[0]], 1)
            fila[1] = op
            defensas[eq].append(fila)
        for eq in defensas:
            defensas[eq].sort(key=lambda x: x[0])
        return t, defensas

    t_prev, def_prev = totales(stp, prev)
    _, def_act = totales(st, temp)

    # Promedios por partido de la temporada previa (equipos)
    equipos_prev = {}
    for eq, filas in def_prev.items():
        n = len(filas) or 1
        d = {"pf": sum(f[13] for f in filas) / n, "pa": sum(f[9] for f in filas) / n}
        for k in ("py", "ry", "ptd", "rtd"):
            d[k] = sum(t_prev[(f[0], eq)][k] for f in filas) / n
            d[k + "a"] = sum(t_prev[(f[0], f[1])][k] for f in filas) / n
        # defensa (DST) por partido: sacks, int, fr, ff, td, sf, blk, sacks permitidos, pérdidas de balón
        d = {k: round(v, 2) for k, v in d.items()}
        d["dst"] = [round(sum(f[i] for f in filas) / n, 3) for i in (2, 3, 4, 5, 6, 7, 8, 11, 12)]
        equipos_prev[eq] = d

    # ---- Roster actual (equipo y estado) ----
    info, por_espn, por_nombre = {}, {}, {}
    for r in roster:
        info[r["gsis_id"]] = {"t": r["team"], "s": r["status"], "pos": r["position"], "n": r["full_name"],
                              "h": r["headshot_url"], "exp": r["years_exp"], "e": r["espn_id"],
                              "sl": r.get("sleeper_id", "")}
        if r["espn_id"] not in ("", "NA"):
            try:
                por_espn[int(float(r["espn_id"]))] = r["gsis_id"]
            except ValueError:
                pass
        por_nombre[(normal(r["full_name"]), r["team"])] = r["gsis_id"]

    # ---- Uso por partido: % de snaps y jugadas en zona roja ----
    pfr_a_gsis = {r["pfr_id"]: r["gsis_id"] for r in roster if r.get("pfr_id") not in ("", "NA", None)}
    uso = defaultdict(lambda: defaultdict(lambda: [0.0, 0, 0, 0]))  # gsis -> semana -> [snap%, rz acarreos, rz targets, acarreos dentro del 5]
    for r in snaps:
        if r.get("game_type") != "REG":
            continue
        gid = pfr_a_gsis.get(r.get("pfr_player_id"))
        if gid:
            uso[gid][int(r["week"])][0] = round(num(r["offense_pct"]), 2)
    for r in pbp:
        if r["season_type"] != "REG" or r["two_point_attempt"] == "1":
            continue
        yl = num(r["yardline_100"])
        if not yl or yl > 20:
            continue
        w = int(num(r["week"]))
        if r["play_type"] == "run" and r["rusher_player_id"] not in ("", "NA"):
            u = uso[r["rusher_player_id"]][w]
            u[1] += 1
            if yl <= 5:
                u[3] += 1
        elif r["play_type"] == "pass" and r["receiver_player_id"] not in ("", "NA"):
            uso[r["receiver_player_id"]][w][2] += 1
    print(f"  uso: {len(uso)} jugadores con snaps o jugadas en zona roja")

    # ---- Lesiones (nflverse): último reporte ----
    lesion = {}
    for r in inj:
        w = int(r["week"])
        if r["report_status"] and (r["gsis_id"] not in lesion or w >= lesion[r["gsis_id"]]["w"]):
            lesion[r["gsis_id"]] = {"w": w, "st": r["report_status"], "why": r["report_primary_injury"]}

    # ---- Temporada previa por jugador (promedio por partido) ----
    previo = {}
    for r in stp:
        if r["season_type"] != "REG" or r["position"] not in POSICIONES | {"K"}:
            continue
        d = previo.setdefault(r["player_id"], {"g": 0, "s": [0.0] * len(STATS), "t": r["team"], "k": []})
        d["g"] += 1
        d["t"] = r["team"]
        if r["position"] == "K":
            d["k"].append(fila_k(r))
        for i, v in enumerate(fila_stats(r)):
            d["s"][i] += v

    # ---- Temporada actual ----
    jugadores, ultima_semana = {}, 0
    for r in st:
        if r["season_type"] != "REG" or r["position"] not in POSICIONES | {"K"}:
            continue
        pid, w = r["player_id"], int(r["week"])
        ultima_semana = max(ultima_semana, w)
        p = jugadores.setdefault(pid, {"id": pid, "n": r["player_display_name"], "p": r["position"],
                                       "t": r["team"], "h": r["headshot_url"], "w": [], "_tw": 0})
        if w >= p["_tw"]:
            p["t"], p["_tw"] = r["team"], w
        if r["position"] == "K":
            p["w"].append([w, r["opponent_team"]] + fila_k(r))
        else:
            p["w"].append([w, r["opponent_team"]] + fila_stats(r))

    # Jugadores sin partidos este año pero en un roster (p.ej. regresando de lesión)
    for pid, d in previo.items():
        if pid in jugadores or pid not in info or d["g"] < 4:
            continue
        i = info[pid]
        if i["pos"] in POSICIONES | {"K"} and i["s"] in ("ACT", "RES", "INA"):
            jugadores[pid] = {"id": pid, "n": i["n"], "p": i["pos"], "t": i["t"], "h": i["h"], "w": [], "_tw": 0}

    # ---- ESPN ----
    cfg = cargar_config()
    liga_id = cfg.get("league_id")
    print("ESPN:")
    filtro = {"players": {"filterSlotIds": {"value": [0, 2, 4, 6, 16, 17]}, "limit": 1200,
                          "sortPercOwned": {"sortPriority": 1, "sortAsc": False},
                          "filterStatsForTopScoringPeriodIds": {"value": 2,
                                                                "additionalValue": [f"00{temp}", f"10{temp}", f"11{temp}{sem_espn}"]}}}
    if liga_id and cfg.get("espn_s2"):
        ruta = f"/segments/0/leagues/{liga_id}?view=kona_player_info&scoringPeriodId={sem_espn}"
    else:
        ruta = f"/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId={sem_espn}"
    js = espn(temp, ruta, "espn_jugadores.json", filtro, cfg)
    ej = leer_jugadores_espn(js, sem_espn) if js else {}
    print(f"  {len(ej)} jugadores de ESPN" if ej else "  ESPN no respondió; se usan solo datos de nflverse")

    espn_a_id = {}
    for eid, e in ej.items():
        if e["pos"] == "DST":
            if e["t"]:
                espn_a_id[eid] = "DST_" + e["t"]
            continue
        gid = por_espn.get(eid) or por_nombre.get((normal(e["n"]), e["t"]))
        if gid:
            espn_a_id[eid] = gid

    # Liga de ESPN (rosters de todos los equipos) — requiere league_id y, si es privada, cookies
    liga = None
    if liga_id:
        lj = espn(temp, f"/segments/0/leagues/{liga_id}?view=mTeam&view=mRoster&view=mSettings",
                  "espn_liga.json", None, cfg)
        if isinstance(lj, dict) and lj.get("teams"):
            miembros = {m.get("id"): (m.get("firstName", "") + " " + m.get("lastName", "")).strip()
                        for m in lj.get("members", [])}
            swid = (cfg.get("swid") or "").upper()
            equipos = []
            for t in lj["teams"]:
                nombre = t.get("name") or (t.get("location", "") + " " + t.get("nickname", "")).strip()
                ids = []
                for en in (t.get("roster") or {}).get("entries", []):
                    eid = ((en.get("playerPoolEntry") or {}).get("player") or {}).get("id", en.get("playerId"))
                    if eid in espn_a_id:
                        ids.append(espn_a_id[eid])
                    elif isinstance(eid, int) and eid < 0:
                        ab = ESPN_TEAMS.get(-eid - 16000)
                        if ab:
                            ids.append("DST_" + ab)
                owners = t.get("owners") or []
                equipos.append({"id": t.get("id"), "nombre": nombre, "abrev": t.get("abbrev", ""),
                                "dueno": miembros.get(owners[0], "") if owners else "",
                                "mio": bool(swid) and swid in [str(o).upper() for o in owners],
                                "jugadores": ids})
            liga = {"nombre": (lj.get("settings") or {}).get("name", ""), "equipos": equipos}
            print(f"  liga '{liga['nombre']}': {len(equipos)} equipos")
        else:
            print("  no se pudo leer tu liga de ESPN (¿faltan espn_s2 y swid en espn_config.json?)")

    # ---- Armar salida ----
    salida = []
    gid_a_espn = {v: k for k, v in espn_a_id.items()}
    for pid, p in jugadores.items():
        p.pop("_tw")
        p["w"].sort(key=lambda x: x[0])
        i = info.get(pid)
        if i:
            p["t"] = i["t"] or p["t"]
            p["s"] = i["s"]
            p["exp"] = i["exp"]
            p["h"] = p["h"] or i["h"]
            if i["sl"] not in ("", "NA", None):
                p["sl"] = i["sl"]  # id de Sleeper (para tendencias de agregados)
            if i["e"] not in ("", "NA"):
                try:
                    p["e"] = int(float(i["e"]))  # id de ESPN (para conectar la liga desde el navegador)
                except ValueError:
                    pass
        if pid in lesion:
            p["inj"] = lesion[pid]
        if pid in uso:
            p["u"] = [[w] + v for w, v in sorted(uso[pid].items())]
        if pid in previo:
            d = previo[pid]
            p["prev"] = {"g": d["g"], "t": d["t"], "s": compacto([v / d["g"] for v in d["s"]])}
            if d["k"]:
                p["prev"]["k"] = d["k"]
        e = ej.get(gid_a_espn.get(pid))
        if e:
            p["espn"] = {"inj": e["inj"], "own": e["own"], "ps": e["ps"], "pt": e["pt"]}
            if e["ol"] and e["own"] >= 3:
                p["espn"]["ol"] = e["ol"]
            if e["nd"]:
                p["espn"]["nd"] = e["nd"]
            if e["t"]:
                p["t"] = e["t"]
        salida.append(p)

    defensas = {}
    for eq in set(def_act) | set(equipos_prev):
        d = {"w": def_act.get(eq, [])}
        eid = next((-16000 - k for k, v in ESPN_TEAMS.items() if v == eq), None)
        e = ej.get(eid)
        if e:
            d["espn"] = {"own": e["own"], "ps": e["ps"], "pt": e["pt"]}
        defensas[eq] = d

    datos = {
        "generado": dt.datetime.now().isoformat(timespec="minutes"),
        "temporada": temp,
        "ultimaSemana": ultima_semana,
        "semanaEspn": sem_espn,
        "fuenteEspn": bool(ej),
        "stats": STATS,
        "partidos": partidos,
        "equiposPrev": equipos_prev,
        "defensas": defensas,
        "jugadores": salida,
        "liga": liga,
    }
    with open(os.path.join(AQUI, "data.js"), "w", encoding="utf-8") as f:
        f.write("window.NFL_DATA = ")
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Listo: {len(salida)} jugadores, {len(defensas)} defensas, {len(partidos)} partidos, "
          f"estadísticas hasta la semana {ultima_semana}.")


if __name__ == "__main__":
    main()
