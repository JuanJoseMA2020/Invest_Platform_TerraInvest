"""Donde se ejecutan las ordenes. Dos versiones con la misma forma:

  Papel  sin llaves: simula con los precios reales de Binance (comision, deslizamiento, stops y financiacion).
  Demo   con llaves: ordenes de verdad en la cuenta Demo de Binance, con el stop registrado en Binance.
"""
from __future__ import annotations

import math
import time

from .binance import Demo, ErrorBinance, Publico

QUINCE_MIN = 900_000


def texto_num(x: float, paso: float) -> str:
    dec = max(0, -int(math.floor(math.log10(paso)))) if paso < 1 else 0
    return f"{x:.{dec}f}"


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

    def revisar(self, op: dict, ahora: int, precio: float, posiciones=None) -> dict | None:
        """¿Toco el stop desde la ultima revision? Mira las velas de 15 minutos y el precio actual."""
        # se revisan velas completas que empezaron despues de la entrada (la vela de la entrada tiene precios de antes)
        desde = op["ids"].get("rev") or (op["t_in"] // QUINCE_MIN + 1) * QUINCE_MIN
        lado, stop = op["lado"], op["stop"]
        if desde < ahora:
            for v in self.pub.velas(op["sym"], "15m", 1000, desde):
                if int(v[0]) < desde or int(v[6]) >= ahora:
                    continue
                o, h, lo = float(v[1]), float(v[2]), float(v[3])
                if (lado > 0 and lo <= stop) or (lado < 0 and h >= stop):
                    px = (min(o, stop) if lado > 0 else max(o, stop)) * (1 - lado * self.desliz)
                    return {"p_out": px, "comision": op["cant"] * px * self.com, "t_out": int(v[6]), "motivo": "Tocó el stop"}
                op["ids"]["rev"] = int(v[6]) + 1
        if (lado > 0 and precio <= stop) or (lado < 0 and precio >= stop):
            px = precio * (1 - lado * self.desliz)
            return {"p_out": px, "comision": op["cant"] * px * self.com, "t_out": ahora, "motivo": "Tocó el stop"}
        if not op["ids"].get("rev"):
            op["ids"]["rev"] = desde
        return None

    def financiacion(self, op: dict, ahora: int) -> float:
        """Lo que la posicion pago (+) o cobro (-) de financiacion desde la ultima vez."""
        desde = (op.get("t_fin") or op["t_in"]) + 1
        pagado = 0.0
        for f in self.pub.financiacion(op["sym"], desde):
            if int(f["fundingTime"]) <= ahora:
                pagado += op["lado"] * op["cant"] * float(f.get("markPrice") or op["p_in"]) * float(f["fundingRate"])
        return pagado

    def asegurar_stop(self, op: dict, reglas: dict) -> bool:
        return True


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
        return {"p_in": p, "cant": q, "comision": com, "ids": {"orden": orden.get("orderId"), **s}}

    def cerrar(self, op: dict, precio: float, reglas: dict) -> dict:
        self.api.quitar_stops(op["sym"])
        t0 = self.api_ahora()
        orden = self.api.mercado(op["sym"], "SELL" if op["lado"] > 0 else "BUY", texto_num(op["cant"], reglas["paso"]), reducir=True)
        p, _q, com = self._llenado(op["sym"], orden, t0 - 60_000)
        return {"p_out": p, "comision": com}

    def revisar(self, op: dict, ahora: int, precio: float, posiciones: dict | None = None) -> dict | None:
        """Si Binance ya no tiene la posicion, la cerro el stop: se busca a que precio."""
        if posiciones is not None and op["sym"] in posiciones:
            return None
        lado_cierre = "SELL" if op["lado"] > 0 else "BUY"
        fills = [t for t in self.api.operaciones(op["sym"], op["t_in"]) if t["side"] == lado_cierre and int(t["time"]) > op["t_in"]]
        if not fills:
            return {"p_out": precio, "comision": 0.0, "t_out": ahora, "motivo": "Cerrada fuera del bot"}
        q = sum(float(t["qty"]) for t in fills)
        px = sum(float(t["price"]) * float(t["qty"]) for t in fills) / q
        com = sum(float(t["commission"]) for t in fills if t.get("commissionAsset") == "USDT")
        return {"p_out": px, "comision": com, "t_out": max(int(t["time"]) for t in fills), "motivo": "Tocó el stop"}

    def financiacion(self, op: dict, ahora: int) -> float:
        desde = (op.get("t_fin") or op["t_in"]) + 1
        return -sum(float(x["income"]) for x in self.api.ingresos(op["sym"], "FUNDING_FEE", desde) if int(x["time"]) <= ahora)

    def asegurar_stop(self, op: dict, reglas: dict) -> bool:
        """Cada posicion debe tener su stop en Binance. Si falta, se vuelve a poner; si no se puede, se cierra."""
        if self.api.stops(op["sym"]):
            return True
        lado = "SELL" if op["lado"] > 0 else "BUY"
        try:
            s = self.api.poner_stop(op["sym"], lado, texto_num(op["stop"], reglas["tick"]))
            op["ids"].update(s)
            return True
        except ErrorBinance:
            return False

    def api_ahora(self) -> int:
        return int(time.time() * 1000) + self.api.offset
