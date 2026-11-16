"""Tesoreria: el efectivo quieto del bot de trading, puesto a ganar intereses en Binance Simple Earn (USDT flexible).

Hoy es una SIMULACION fiel: la cuenta demo de Binance no tiene Simple Earn, asi que no se puede operar en practica. Cada ciclo
(15 minutos) lee el efectivo real del bot (solo lectura), le aplica la tasa real de ese dia (con sus tramos) y anota cuando
habria invertido o rescatado. Asi se mide con numeros cuanto aporta antes de usar dinero real.

Version real (solo cuando el dueño diga «pasa a dinero real»): la misma regla dentro del bot de trading: todo el efectivo en
Simple Earn flexible; antes de comprar rescata lo justo (el rescate flexible es inmediato); despues de vender vuelve a invertir.
"""
from __future__ import annotations

import time

import httpx

AÑO_MS = 365 * 86_400_000
API = "https://www.binance.com/bapi/earn/v2/friendly/finance-earn/calculator/product/list"
MOVIMIENTO_MIN = 1.0   # USDT: cambios menores del efectivo no cuentan como compra o venta


def tasas(http: httpx.Client | None = None, activos=("USDT", "USDC", "FDUSD")) -> dict:
    """Tasas de Simple Earn flexible publicadas por Binance (sin llaves). Tasa base + tramos de promocion."""
    http = http or httpx.Client(timeout=25, headers={"User-Agent": "Mozilla/5.0"})
    out = {}
    for a in activos:
        try:
            d = http.get(API, params={"asset": a, "type": "Flexible"}).json()["data"]["savingFlexibleProduct"][0]
            out[a] = {"base": float(d["marketApr"]), "maximo": float(d["apy"]),
                      "tramos": [{"desde": float(t["beginAmount"]), "hasta": float(t["endAmount"]), "extra": float(t["ratio"])}
                                 for t in (d.get("apyTierOption") or [])]}
        except Exception:  # noqa: BLE001 - un activo sin datos no tumba los demas
            continue
    return out


def tasa_efectiva(t: dict, monto: float) -> float:
    """Tasa anual que recibe un monto: la base para todo, mas el extra de cada tramo sobre la parte que cae en el."""
    if monto <= 0 or not t:
        return t.get("base", 0.0) if t else 0.0
    extra = sum(x["extra"] * max(0.0, min(monto, x["hasta"]) - x["desde"]) for x in t.get("tramos", []))
    return t["base"] + extra / monto


class Tesoreria:
    """Estado guardado en su propia base (datos/tesoreria.db), separada de la del bot de futuros."""

    def __init__(self, db):
        self.db = db

    def ciclo(self, caja: float | None, tasa: dict | None, ahora: int | None = None) -> None:
        ahora = int(time.time() * 1000) if ahora is None else ahora
        if caja is None or not tasa:
            return
        s = self.db.get("estado") or {"inicio": ahora, "t": ahora, "caja": caja, "ganado": 0.0, "dias": {}}
        dt = max(0, ahora - s["t"])
        if dt and s["caja"] > 0:   # interes del tramo transcurrido, con el efectivo que habia
            g = s["caja"] * tasa_efectiva(tasa, s["caja"]) * dt / AÑO_MS
            s["ganado"] += g
            dia = time.strftime("%Y-%m-%d", time.gmtime(ahora / 1000))
            s["dias"][dia] = s["dias"].get(dia, 0.0) + g
            s["dias"] = dict(sorted(s["dias"].items())[-400:])
        cambio = caja - s["caja"]
        if abs(cambio) >= MOVIMIENTO_MIN:
            if cambio < 0:
                self.db.evento(f"El bot usó {-cambio:.2f} USDT para comprar: habría rescatado ese monto de Simple Earn al instante.", "info")
            else:
                self.db.evento(f"El bot liberó {cambio:.2f} USDT al vender: habría vuelto a invertirlos en Simple Earn.", "info")
        s.update(t=ahora, caja=caja, tasa=tasa_efectiva(tasa, caja), base=tasa["base"], tramos=tasa.get("tramos", []))
        self.db.set("estado", s)

    def estado(self) -> dict | None:
        s = self.db.get("estado")
        if not s:
            return None
        dias = max((s["t"] - s["inicio"]) / 86_400_000, 1e-9)
        return {"modo": "simulada", "inicio": s["inicio"], "caja": s["caja"], "tasa": s.get("tasa"), "base": s.get("base"),
                "tramos": s.get("tramos", []), "ganado": s["ganado"], "anual_estimado": s["caja"] * (s.get("tasa") or 0),
                "dias": [[k, round(v, 6)] for k, v in s["dias"].items()][-90:], "dias_corridos": dias,
                "eventos": self.db.eventos(20)}
