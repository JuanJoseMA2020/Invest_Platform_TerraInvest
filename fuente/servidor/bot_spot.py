"""Estado del bot de trading para la pagina. Lee su base de datos en SOLO LECTURA: nunca escribe ni bloquea al bot."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def _ms(ts: str | None) -> int | None:
    if not ts:
        return None
    return int(datetime.fromisoformat(ts).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _kv(c, k, defecto=None):
    r = c.execute("SELECT value FROM kv WHERE key=?", (k,)).fetchone()
    if r is None:
        return defecto
    v = r[0]
    try:
        return json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return v


def resumen(ruta: Path | str) -> dict | None:
    ruta = Path(ruta).expanduser()
    if not ruta.exists():
        return None
    c = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True, timeout=5)
    try:
        ult = c.execute("SELECT ts, equity, cash, exposure, open_positions, drawdown FROM equity ORDER BY id DESC LIMIT 1").fetchone()
        # un punto por dia (el ultimo de cada dia) para la curva
        curva = [[_ms(t), round(e, 4)] for t, e in c.execute(
            "SELECT ts, equity FROM equity WHERE id IN (SELECT MAX(id) FROM equity GROUP BY substr(ts,1,13)) ORDER BY ts")]
        abiertas = [{"sym": s.replace("/", ""), "t_in": _ms(t), "p_in": p, "cant": q, "costo": cost, "stop": st, "stop_inicial": st0,
                     "motivo": (r or "")[:300]}
                    for s, t, p, q, cost, st, st0, r in c.execute(
                        "SELECT symbol, entry_ts, entry_price, qty, cost, stop, initial_stop, reasons FROM trades WHERE status='open' ORDER BY entry_ts")]
        cerradas = [{"sym": s.replace("/", ""), "t_in": _ms(ti), "t_out": _ms(to), "p_in": pi, "p_out": po, "pnl": pnl, "pct": pct,
                     "motivo": (why or "")[:200]}
                    for s, ti, to, pi, po, pnl, pct, why in c.execute(
                        "SELECT symbol, entry_ts, exit_ts, entry_price, exit_price, pnl, pnl_pct, exit_reason FROM trades "
                        "WHERE status='closed' ORDER BY exit_ts DESC LIMIT 60")]
        n, gan, total = c.execute("SELECT COUNT(*), SUM(pnl > 0), COALESCE(SUM(pnl), 0) FROM trades WHERE status='closed'").fetchone()
        aportes = sum(float(x.get("delta", 0)) for x in (_kv(c, "capital_changes", []) or []) if isinstance(x, dict))
        riesgo = _kv(c, "risk_state", {}) or {}
        reloj = _kv(c, "demo_clock", {}) or {}
        uni = _kv(c, "universe_month", {}) or {}
        eventos = [{"t": _ms(t), "nivel": lv, "texto": m[:240]} for t, lv, m in c.execute(
            "SELECT ts, level, message FROM events WHERE kind IN ('capital','universo','risk','kill','startup') "   # los errores no se publican (pueden traer rutas)
            "ORDER BY id DESC LIMIT 15")]
        return {
            "actualizado": _ms(ult[0]) if ult else None,
            "patrimonio": ult[1] if ult else None, "efectivo": ult[2] if ult else None, "exposicion": ult[3] if ult else None,
            "caida": ult[5] if ult else None,
            "inicial": _kv(c, "initial_capital"), "aportes": aportes,
            "curva": curva[-400:], "abiertas": abiertas, "cerradas": cerradas,
            "totales": {"n": n or 0, "ganadas": int(gan or 0), "pnl": total},
            "pico": riesgo.get("peak_equity"), "pausado": bool(riesgo.get("halted") or riesgo.get("manual_pause") or riesgo.get("killed")),
            "encendido": _kv(c, "running") in (True, "true"),
            "reloj_demo": reloj.get("start"),
            "universo": [s.replace("/", "") for s in uni.get("symbols", [])], "mes": uni.get("month"),
            "eventos": eventos,
        }
    finally:
        c.close()
