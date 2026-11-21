"""Informe mensual de TerraInvest (Telegram + pagina): compara los dos bots con lo esperado y dice, con una lista de
comprobacion, si ya se puede considerar pasar a dinero real. TerraInvest es el lugar seguro del dueño: el informe
prioriza no perder sobre ganar, y nunca empuja a pasar a real; solo ordena los hechos para que la decision sea suya.

Se envia el dia 1 de cada mes (sobre el mes anterior). A mano: python -m plataforma.servidor.ciclo --informe (mes en curso).
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
DIA = 86_400_000
MESES_MINIMOS = 3

# Lo esperado, segun las validaciones (scripts/validar_tendencia.py, scripts/investigacion/futuros.py; nov-2026)
ESPERADO = {
    "trading": {"nombre": "Bot de trading", "texto": "+4 % a +9 % al año ganando 6 de cada 10 operaciones (cerebro 2)", "bajo": 0.04,
                "alto": 0.09, "caida": 0.12, "ops_mes": 6},
    "futuros": {"nombre": "Bot de futuros", "texto": "+7 % a +13 % al año ganando 2 de cada 3 operaciones (cerebro 2)", "bajo": 0.07, "alto": 0.13,
                "caida": 0.18, "ops_mes": 12},
}


def n(x: float, d: int = 1, signo: bool = False) -> str:
    """Numero en formato colombiano: coma decimal y signo menos tipografico."""
    s = f"{x:+,.{d}f}" if signo else f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".").replace("-", "−")


def ms(dt: datetime) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def limites_mes(mes: str) -> tuple[int, int]:
    y, m = map(int, mes.split("-"))
    ini = datetime(y, m, 1)
    fin = datetime(y + (m == 12), m % 12 + 1, 1)
    return ms(ini), ms(fin)


def mes_anterior(hoy: str) -> str:
    y, m = int(hoy[:4]), int(hoy[5:7])
    return f"{y - (m == 1)}-{(m - 2) % 12 + 1:02d}"


def nombre_mes(mes: str) -> str:
    return f"{MESES[int(mes[5:7]) - 1]} {mes[:4]}"


def tramo(puntos: list, desde: int, hasta: int, aportes: list | None = None) -> dict | None:
    """Resultado y peor caida de una curva de patrimonio [(ms, valor)] entre dos fechas, sin contar los aportes."""
    antes = [p for p in puntos if p[0] <= desde]
    dentro = [p for p in puntos if desde < p[0] <= hasta]
    serie = ([antes[-1]] if antes else []) + dentro
    if len(serie) < 2:
        return None
    aportes = aportes or []
    base = serie[0][1]
    pico, caida, ajustada = base, 0.0, base
    for t, v in serie[1:]:
        ajustada = v - sum(d for ta, d in aportes if serie[0][0] < ta <= t)
        pico = max(pico, ajustada)
        caida = max(caida, 1 - ajustada / pico if pico > 0 else 0)
    return {"inicio": base, "fin": serie[-1][1], "ret": ajustada / base - 1 if base else 0.0, "caida": caida,
            "desde": serie[0][0], "hasta": serie[-1][0]}


def anualizar(ret: float, dias: float) -> float | None:
    return (1 + ret) ** (365 / dias) - 1 if dias >= 28 and ret > -1 else None


def comprobar(clave: str, total: dict | None, meses: float, incidentes: int, ops_mes: float) -> tuple[list, str, bool]:
    """Lista de comprobacion para considerar dinero real. Devuelve (lineas, veredicto, listo)."""
    e = ESPERADO[clave]
    filas = []
    filas.append((True if meses >= MESES_MINIMOS else None, f"Tiempo de prueba: {n(meses)} de {MESES_MINIMOS} meses"))
    if total:
        filas.append((total["caida"] <= e["caida"], f"Peor caída {n(100 * total['caida'])} % (límite esperado {100 * e['caida']:.0f} %)"))
        filas.append((total["ret"] >= 0 if meses >= MESES_MINIMOS else None, f"Resultado acumulado {n(100 * total['ret'], 1, True)} % (que no pierda)"))
    filas.append((incidentes == 0, "Sin incidentes graves" if incidentes == 0 else f"{incidentes} error(es) del bot en el período: revisar la bitácora"))
    if meses >= 1:
        normal = 0.3 * e["ops_mes"] <= ops_mes <= 3 * e["ops_mes"]
        filas.append((True if normal else None, f"Actividad: {n(ops_mes)} operaciones al mes (esperado ~{e['ops_mes']}; en mercados bajistas puede quedarse quieto)"))
    bloquean = [f for f in filas if f[0] is False]
    if meses < MESES_MINIMOS:
        veredicto, listo = f"Seguir en demo: faltan {n(MESES_MINIMOS - meses)} meses de prueba", False
    elif bloquean:
        veredicto, listo = "Seguir en demo: " + "; ".join(t.split(" (")[0].lower() for _, t in bloquean), False
    else:
        veredicto, listo = "Listo para considerar dinero real, empezando con poco (la decisión es tuya)", True
    return filas, veredicto, listo


# ------------------------------------------------------------------ datos de cada bot
def datos_bot(ruta: Path, desde: int, hasta: int) -> dict | None:
    """Bot de trading, en solo lectura."""
    ruta = Path(ruta).expanduser()
    if not ruta.exists():
        return None
    c = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True, timeout=5)
    try:
        f = lambda ts: ms(datetime.fromisoformat(ts))   # noqa: E731
        kv = lambda k: (lambda r: json.loads(r[0]) if r and isinstance(r[0], str) else (r[0] if r else None))(  # noqa: E731
            c.execute("SELECT value FROM kv WHERE key=?", (k,)).fetchone())
        puntos = [(f(t), e) for t, e in c.execute("SELECT ts, equity FROM equity ORDER BY ts")]
        caja = [x for t, x in c.execute("SELECT ts, cash FROM equity ORDER BY ts") if desde <= f(t) < hasta]
        aportes = [(f(x["ts"]), float(x["delta"])) for x in (kv("capital_changes") or []) if isinstance(x, dict)]
        inicio = (kv("demo_clock") or {}).get("start")
        t0 = f(inicio) if inicio else (puntos[0][0] if puntos else desde)
        fecha = lambda t: datetime.fromtimestamp(t / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")   # noqa: E731
        ops = c.execute("SELECT COUNT(*), COALESCE(SUM(pnl > 0), 0), COALESCE(SUM(pnl), 0) FROM trades WHERE status='closed' AND exit_ts >= ? AND exit_ts < ?",
                        (fecha(max(desde, t0)), fecha(hasta))).fetchone()
        ops_total = c.execute("SELECT COUNT(*) FROM trades WHERE status='closed' AND exit_ts >= ?", (inicio or "1970",)).fetchone()[0]
        # las caidas del servidor de Binance (502, sin red) no son fallos del bot: no cuentan como incidentes
        errores = c.execute("SELECT COUNT(*) FROM events WHERE level='ERROR' AND ts >= ? AND ts < ? AND message NOT LIKE '%ExchangeNotAvailable%' "
                            "AND message NOT LIKE '%NetworkError%' AND message NOT LIKE '%RequestTimeout%' AND message NOT LIKE '%Bad Gateway%'",
                            (datetime.fromtimestamp(desde / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), datetime.fromtimestamp(hasta / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))).fetchone()[0]
        riesgo = kv("risk_state") or {}
        return {"puntos": puntos, "aportes": aportes, "t0": t0, "ops": ops[0], "ganadas": int(ops[1]), "pnl": ops[2], "ops_total": ops_total,
                "incidentes": int(errores) + int(bool(riesgo.get("killed") or riesgo.get("halted"))),
                "caja_media": sum(caja) / len(caja) if caja else None}
    finally:
        c.close()


def datos_futuros(db, desde: int, hasta: int) -> dict:
    modo = db.get("modo") or "papel"
    cerradas = [o for o in db.cerradas(modo, db.get("inicio", 0), 100000)]
    del_mes = [o for o in cerradas if desde <= o["t_out"] < hasta]
    errores = sum(1 for e in db.eventos(500) if e["nivel"] == "error" and desde <= e["t"] < hasta)
    return {"puntos": [(t, eq) for t, eq, _x, _n in db.curva(0)], "aportes": [], "t0": db.get("inicio", desde), "modo": modo,
            "ops": len(del_mes), "ganadas": sum(1 for o in del_mes if o["pnl"] > 0), "pnl": sum(o["pnl"] for o in del_mes),
            "ops_total": len(cerradas), "incidentes": errores + int(bool(db.get("pausa")))}


# ------------------------------------------------------------------ armado
def armar(db, bot_db: Path, mes: str, ahora: int, btc_mes: float | None, earn_apy: float | None, parcial: bool,
          earn_extra: float | None = None, earn_hasta: float | None = None) -> dict:
    desde, hasta = limites_mes(mes)
    hasta = min(hasta, ahora)
    out = {"mes": mes, "nombre": nombre_mes(mes), "parcial": parcial, "generado": ahora, "btc_mes": btc_mes, "bots": {}}
    for clave, d in (("trading", datos_bot(bot_db, desde, hasta)), ("futuros", datos_futuros(db, desde, hasta))):
        if not d:
            continue
        mes_t = tramo(d["puntos"], max(desde, d["t0"]), hasta, d["aportes"])
        total = tramo(d["puntos"], d["t0"], hasta, d["aportes"])
        meses = max(0.0, (hasta - d["t0"]) / (30.44 * DIA))
        ops_mes = d["ops_total"] / meses if meses >= 1 else d["ops"]
        filas, veredicto, listo = comprobar(clave, total, meses, d["incidentes"], ops_mes)
        out["bots"][clave] = {"mes": mes_t, "total": total, "meses": meses, "ops": d["ops"], "ganadas": d["ganadas"], "pnl": d["pnl"],
                              "anual": anualizar(total["ret"], (hasta - d["t0"]) / DIA) if total else None,
                              "lista": [[ok, t] for ok, t in filas], "veredicto": veredicto, "listo": listo, "modo": d.get("modo", "demo"),
                              "desde": d["t0"]}
        if clave == "trading" and d.get("caja_media") and earn_apy:
            dias = (hasta - desde) / DIA
            m = d["caja_media"]
            tasa = earn_apy + (earn_extra or 0) * min(1.0, (earn_hasta or 0) / m)   # el extra solo aplica a los primeros USDT
            out["efectivo"] = {"media": m, "apy": tasa, "ganancia": m * tasa * dias / 365}
    return out


def texto(inf: dict) -> str:
    pct = lambda x, d=1: "—" if x is None else f"{n(100 * x, d, True)} %"   # noqa: E731
    icono = {True: "✅", False: "❌", None: "⏳"}
    lineas = [f"📊 <b>Informe {'parcial' if inf['parcial'] else 'mensual'} · {inf['nombre']}</b>"]
    if inf["parcial"]:
        lineas.append(f"(hasta hoy, {datetime.fromtimestamp(inf['generado'] / 1000, timezone.utc).strftime('%d-%m')})")
    if inf.get("btc_mes") is not None:
        lineas.append(f"Bitcoin en el mes: {pct(inf['btc_mes'])}")
    for clave, b in inf["bots"].items():
        e = ESPERADO[clave]
        lineas += ["", f"<b>{e['nombre']}</b> ({'cuenta demo' if b['modo'] == 'demo' else 'en papel'})"]
        if b["mes"]:
            lineas.append(f"Mes: {pct(b['mes']['ret'], 2)} (de {n(b['mes']['inicio'], 2)} a {n(b['mes']['fin'], 2)} USDT) · peor caída {n(100 * b['mes']['caida'])} %")
        lineas.append(f"Operaciones cerradas: {b['ops']} ({b['ganadas']} ganadas) · {n(b['pnl'], 2, True)} USDT")
        if b["total"]:
            inicio = datetime.fromtimestamp(b["desde"] / 1000, timezone.utc).strftime("%d-%m-%Y")
            lineas.append(f"Desde que empezó ({inicio}): {pct(b['total']['ret'], 2)}" + (f" · {pct(b['anual'])} al año" if b["anual"] is not None else ""))
        lineas.append(f"Esperado: {e['texto']}, caídas de hasta {100 * e['caida']:.0f} %. Un mes suelto puede salir en rojo: cuenta el acumulado.")
        lineas.append("<i>Camino a dinero real:</i>")
        lineas += [f"{icono[ok]} {t}" for ok, t in b["lista"]]
        lineas.append(f"➡️ <b>{b['veredicto']}</b>")
    ef = inf.get("efectivo")
    if ef:
        lineas += ["", f"<b>Dinero quieto</b>: el bot de trading tuvo en promedio {n(ef['media'], 2)} USDT en efectivo. En Simple Earn "
                   f"(~{n(100 * ef['apy'])} % al año) habría ganado ~{n(ef['ganancia'], 2)} USDT en el período."]
    lineas += ["", "🛡️ TerraInvest es tu lugar seguro: primero proteger, después ganar. Pasar a real es decisión tuya y empieza con poco."]
    return "\n".join(lineas)
