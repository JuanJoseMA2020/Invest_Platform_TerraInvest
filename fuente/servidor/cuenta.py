"""Donde se ejecutan las ordenes. Dos versiones con la misma forma:

  Papel  sin llaves: simula con los precios reales de Binance (comision, deslizamiento, stops, cobros y financiacion).
  Demo   con llaves: ordenes de verdad en la cuenta Demo de Binance; el stop y los cobros quedan registrados en Binance.

Cerebro 2: cada posicion tiene un stop y hasta dos tomas de ganancia parciales. `revisar` devuelve, en orden, lo que se
ejecuto desde la ultima vez (cobro 1, cobro 2, stop); el bot lo aplica uno por uno.
"""
from __future__ import annotations

import math
import time

from .binance import Demo, ErrorBinance, Publico

QUINCE_MIN = 900_000


def texto_num(x: float, paso: float) -> str:
    dec = max(0, -int(math.floor(math.log10(paso)))) if paso < 1 else 0
    return f"{x:.{dec}f}"


def _cruzo(lado: int, alto: float, bajo: float, nivel: float, a_favor: bool) -> bool:
    """¿El precio toco `nivel`? a_favor=True para cobros (arriba en largos), False para stops (abajo en largos)."""
    if (lado > 0) == a_favor:
        return alto >= nivel
    return bajo <= nivel


class Papel:
    modo = "papel"

    def __init__(self, pub: Publico, comision: float, desliz: float):
        self.pub, self.com, self.desliz = pub, comision, desliz

    def preparar(self) -> None:
        pass

    def cuenta(self) -> dict | None:
        return None

    def abrir(self, sym: str, lado: int, cant: float, stop: float, reglas: dict, precio: float, apal: int) -> dict:
        p = precio * (1 + lado * self.desliz)
        return {"p_in": p, "cant": cant, "comision": cant * p * self.com, "ids": {}}

    def cerrar(self, op: dict, precio: float, reglas: dict) -> dict:
        p = precio * (1 - op["lado"] * self.desliz)
        return {"p_out": p, "comision": op["cant"] * p * self.com}

    def _fill(self, tipo, lado, nivel, apertura, q, t, gap_peor):
        px = (min(apertura, nivel) if lado > 0 else max(apertura, nivel)) if gap_peor else (max(apertura, nivel) if lado > 0 else min(apertura, nivel))
        px *= 1 - lado * self.desliz
        return {"tipo": tipo, "p": px, "q": q, "com": q * px * self.com, "t": t}

    def revisar(self, op: dict, ahora: int, precio: float, posiciones=None, nv: dict | None = None, stop_ini: float | None = None) -> list[dict]:
        """Recorre las velas de 15 minutos desde la ultima revision. En cada vela: primero el stop (lo peor), luego los cobros."""
        lado = op["lado"]
        etapa, cant, stop = op.get("etapa") or 0, op["cant"], op["stop"]
        fills: list[dict] = []

        def paso(o, h, lo, t) -> bool:   # True si la posicion quedo cerrada
            nonlocal etapa, cant, stop
            if _cruzo(lado, h, lo, stop, a_favor=False):
                fills.append(self._fill("stop", lado, stop, o, cant, t, gap_peor=True))
                return True
            if nv and etapa == 0 and nv["q1"] > 0 and _cruzo(lado, h, lo, nv["tp1"], a_favor=True):
                fills.append(self._fill("tp1", lado, nv["tp1"], o, nv["q1"], t, gap_peor=False))
                cant, etapa, stop = cant - nv["q1"], 1, nv["stop1"]
            if nv and etapa == 1 and nv["q2"] > 0 and _cruzo(lado, h, lo, nv["tp2"], a_favor=True):
                fills.append(self._fill("tp2", lado, nv["tp2"], o, nv["q2"], t, gap_peor=False))
                cant, etapa, stop = cant - nv["q2"], 2, nv["stop2"]
            return cant <= 1e-12

        # se revisan velas completas que empezaron despues de la entrada (la vela de la entrada tiene precios de antes)
        desde = op["ids"].get("rev") or (op["t_in"] // QUINCE_MIN + 1) * QUINCE_MIN
        if desde < ahora:
            for v in self.pub.velas(op["sym"], "15m", 1000, desde):
                if int(v[0]) < desde or int(v[6]) >= ahora:
                    continue
                if paso(float(v[1]), float(v[2]), float(v[3]), int(v[6])):
                    return fills
                op["ids"]["rev"] = int(v[6]) + 1
        paso(precio, precio, precio, ahora)
        if not op["ids"].get("rev"):
            op["ids"]["rev"] = desde
        return fills

    def financiacion(self, op: dict, ahora: int) -> float:
        """Lo que la posicion pago (+) o cobro (-) de financiacion desde la ultima vez."""
        desde = (op.get("t_fin") or op["t_in"]) + 1
        pagado = 0.0
        for f in self.pub.financiacion(op["sym"], desde):
            if int(f["fundingTime"]) <= ahora:
                pagado += op["lado"] * op["cant"] * float(f.get("markPrice") or op["p_in"]) * float(f["fundingRate"])
        return pagado

    def asegurar_ordenes(self, op: dict, reglas: dict, nv: dict, stop: float, precio: float) -> list[dict]:
        return []   # en papel, los cobros y el stop los vigila `revisar`


class DemoCuenta:
    modo = "demo"

    def __init__(self, api: Demo):
        self.api = api

    def preparar(self) -> None:
        self.api.sincronizar()
        self.api.un_sentido()

    def cuenta(self) -> dict | None:
        a = self.api.cuenta()
        return {"billetera": float(a["totalWalletBalance"]), "disponible": float(a["availableBalance"]),
                "no_realizado": float(a["totalUnrealizedProfit"])}

    def _llenado(self, sym: str, orden: dict, desde: int) -> tuple[float, float, float]:
        """(precio medio, cantidad, comision en USDT) de una orden a mercado ya ejecutada."""
        p, q = float(orden.get("avgPrice") or 0), float(orden.get("executedQty") or 0)
        for _ in range(8):   # la cuenta demo a veces responde antes de ejecutar: se espera el llenado
            if p > 0 and q > 0:
                break
            time.sleep(1)
            o = self.api.orden(sym, orden.get("orderId"))
            p, q = float(o.get("avgPrice") or 0), float(o.get("executedQty") or 0)
        if not (p > 0 and q > 0):   # ultimo recurso: la posicion que Binance tiene abierta
            pos = self.api.posiciones().get(sym)
            if not pos:
                raise RuntimeError("Binance no confirmó el llenado de la orden")
            p, q = float(pos["entryPrice"]), abs(float(pos["positionAmt"]))
        com = 0.0
        try:
            for t in self.api.operaciones(sym, desde):
                if t.get("orderId") == orden.get("orderId"):
                    com += float(t["commission"]) if t.get("commissionAsset") == "USDT" else 0.0
        except ErrorBinance:
            com = p * q * 0.0005
        return p, q, com

    def abrir(self, sym: str, lado: int, cant: float, stop: float, reglas: dict, precio: float, apal: int) -> dict:
        self.api.preparar(sym, apal)
        t0 = self.api_ahora()
        orden = self.api.mercado(sym, "BUY" if lado > 0 else "SELL", texto_num(cant, reglas["paso"]))
        p, q, com = self._llenado(sym, orden, t0 - 60_000)
        try:
            s = self.api.poner_stop(sym, "SELL" if lado > 0 else "BUY", texto_num(stop, reglas["tick"]))
        except ErrorBinance as e:   # sin stop no se queda abierta: se cierra en el acto
            self.api.mercado(sym, "SELL" if lado > 0 else "BUY", texto_num(q, reglas["paso"]), reducir=True)
            raise RuntimeError(f"No pude registrar el stop en Binance ({e.msg}); cerré la posición de inmediato") from e
        return {"p_in": p, "cant": q, "comision": com, "ids": {"orden": orden.get("orderId"), "ult": t0, **s}}

    def cerrar(self, op: dict, precio: float, reglas: dict) -> dict:
        self.api.quitar_stops(op["sym"])
        t0 = self.api_ahora()
        orden = self.api.mercado(op["sym"], "SELL" if op["lado"] > 0 else "BUY", texto_num(op["cant"], reglas["paso"]), reducir=True)
        p, _q, com = self._llenado(op["sym"], orden, t0 - 60_000)
        op["ids"]["ult"] = self.api_ahora()
        return {"p_out": p, "comision": com}

    def revisar(self, op: dict, ahora: int, precio: float, posiciones: dict | None = None, nv: dict | None = None,
                stop_ini: float | None = None) -> list[dict]:
        """Compara lo que Binance tiene abierto con lo que el bot cree tener. Si es menos, se ejecuto un cobro o el stop:
        se leen las operaciones de cierre (agrupadas por orden) desde la ultima revision."""
        pos = (posiciones or {}).get(op["sym"])
        en_binance = abs(float(pos["positionAmt"])) if pos else 0.0
        if en_binance >= op["cant"] - 1e-12:
            return []
        lado_cierre = "SELL" if op["lado"] > 0 else "BUY"
        desde = int(op["ids"].get("ult") or op["t_in"])
        ordenes: dict = {}
        for t in self.api.operaciones(op["sym"], desde):
            if t["side"] == lado_cierre and int(t["time"]) > desde:
                g = ordenes.setdefault(t["orderId"], {"q": 0.0, "pq": 0.0, "com": 0.0, "t": 0})
                g["q"] += float(t["qty"])
                g["pq"] += float(t["price"]) * float(t["qty"])
                g["com"] += float(t["commission"]) if t.get("commissionAsset") == "USDT" else 0.0
                g["t"] = max(g["t"], int(t["time"]))
        etapa, cant, fills = op.get("etapa") or 0, op["cant"], []
        for g in sorted(ordenes.values(), key=lambda g: g["t"]):
            q = min(g["q"], cant)
            cant -= q
            tipo = "stop" if cant <= 1e-9 else ("tp1" if etapa == 0 else "tp2")
            if tipo != "stop":
                etapa += 1
            fills.append({"tipo": tipo, "p": g["pq"] / g["q"], "q": q, "com": g["com"], "t": g["t"]})
            if tipo == "stop":
                break
        if not fills and en_binance <= 1e-12:   # cerrada fuera del bot sin operaciones visibles
            fills.append({"tipo": "fuera", "p": precio, "q": cant, "com": 0.0, "t": ahora})
        if fills:
            op["ids"]["ult"] = max(f["t"] for f in fills)
        return fills

    def financiacion(self, op: dict, ahora: int) -> float:
        desde = (op.get("t_fin") or op["t_in"]) + 1
        return -sum(float(x["income"]) for x in self.api.ingresos(op["sym"], "FUNDING_FEE", desde) if int(x["time"]) <= ahora)

    def asegurar_ordenes(self, op: dict, reglas: dict, nv: dict, stop: float, precio: float) -> list[dict]:
        """Deja en Binance exactamente lo que toca a la etapa: el stop correcto y los cobros pendientes.
        Si el precio ya paso un nivel de cobro, cobra en el acto (a mercado). Si el stop no se puede registrar, cierra todo."""
        sym, lado, tick, paso = op["sym"], op["lado"], reglas["tick"], reglas["paso"]
        lado_cierre = "SELL" if lado > 0 else "BUY"
        etapa = op.get("etapa") or 0
        ordenes = self.api.condicionales(sym)
        fills = []
        # 1) cobros pendientes
        pendientes = [("tp1", nv["tp1"], nv["q1"])] if etapa == 0 else []
        if etapa <= 1:
            pendientes.append(("tp2", nv["tp2"], nv["q2"]))
        pendientes = [x for x in pendientes if x[2] >= reglas.get("min_cant", paso)]
        for tipo, nivel, q in list(pendientes):
            if (lado > 0 and precio >= nivel) or (lado < 0 and precio <= nivel):   # ya paso el nivel: se cobra ahora
                t0 = self.api_ahora()
                orden = self.api.mercado(sym, lado_cierre, texto_num(q, paso), reducir=True)
                p, qq, com = self._llenado(sym, orden, t0 - 60_000)
                fills.append({"tipo": tipo, "p": p, "q": qq, "com": com, "t": self.api_ahora()})
                op["ids"]["ult"] = self.api_ahora()
                return fills   # el bot aplica el cobro (nueva etapa y nuevo stop) y vuelve a llamar
        tps = [o for o in ordenes if o["tipo"] == "TAKE_PROFIT_MARKET"]
        quiero = sorted((round(nivel / tick) * tick, q) for _t, nivel, q in pendientes)
        tengo = sorted((round(o["precio"] / tick) * tick, o["cantidad"]) for o in tps)
        if [(round(a, 10), round(b, 10)) for a, b in quiero] != [(round(a, 10), round(b, 10)) for a, b in tengo]:
            for o in tps:
                self.api.cancelar(sym, o)
            for _t, nivel, q in pendientes:
                self.api.poner_cobro(sym, lado_cierre, texto_num(nivel, tick), texto_num(q, paso))
        # 2) stop de la etapa
        stops = [o for o in ordenes if o["tipo"] == "STOP_MARKET"]
        if len(stops) != 1 or abs(stops[0]["precio"] - stop) > tick / 2:
            for o in stops:
                self.api.cancelar(sym, o)
            try:
                op["ids"].update(self.api.poner_stop(sym, lado_cierre, texto_num(stop, tick)))
            except ErrorBinance:   # sin stop no se queda abierta
                t0 = self.api_ahora()
                orden = self.api.mercado(sym, lado_cierre, texto_num(op["cant"], paso), reducir=True)
                p, qq, com = self._llenado(sym, orden, t0 - 60_000)
                self.api.quitar_stops(sym)
                fills.append({"tipo": "stop", "p": p, "q": qq, "com": com, "t": self.api_ahora()})
                op["ids"]["ult"] = self.api_ahora()
        return fills

    def api_ahora(self) -> int:
        return int(time.time() * 1000) + self.api.offset
