"""Conexion minima con Binance Futuros USDⓈ-M. Liviana a proposito (el servidor tiene poca memoria): solo httpx.

  Publico  precios y velas reales (fapi.binance.com). No usa claves.
  Demo     ordenes en la cuenta Demo de Binance (demo-fapi.binance.com), con las llaves de llaves.env.

No hay clase para dinero real: pasar a real exige que el dueño lo pida con esas palabras y un cambio de codigo revisado.
"""
from __future__ import annotations

import hashlib
import hmac
import time
import urllib.parse

import httpx

PUBLICO = "https://fapi.binance.com"
DEMO = "https://demo-fapi.binance.com"


class ErrorBinance(Exception):
    def __init__(self, status: int, code, msg: str):
        super().__init__(f"Binance {status} {code}: {msg}")
        self.status, self.code, self.msg = status, code, msg


def _valor(v):
    return ("true" if v else "false") if isinstance(v, bool) else v


class Publico:
    def __init__(self, base: str = PUBLICO, http: httpx.Client | None = None):
        self.base, self.http = base, http or httpx.Client(timeout=25)

    def _respuesta(self, r: httpx.Response):
        try:
            data = r.json()
        except ValueError:
            data = {"msg": r.text[:200]}
        if r.status_code != 200 or (isinstance(data, dict) and data.get("code", 0) not in (0, 200) and "msg" in data and len(data) <= 3):
            raise ErrorBinance(r.status_code, data.get("code") if isinstance(data, dict) else None, data.get("msg", "") if isinstance(data, dict) else "")
        return data

    def get(self, ruta: str, **p):
        return self._respuesta(self.http.get(PUBLICO + ruta, params={k: _valor(v) for k, v in p.items() if v is not None}))

    def info(self) -> dict:
        return self.get("/fapi/v1/exchangeInfo")

    def velas(self, sym: str, intervalo: str, limite: int = 200, inicio: int | None = None) -> list:
        return self.get("/fapi/v1/klines", symbol=sym, interval=intervalo, limit=limite, startTime=inicio)

    def tickers24(self) -> list:
        return self.get("/fapi/v1/ticker/24hr")

    def indices(self) -> dict[str, dict]:
        """Precio de marca y tasa de financiacion de todos los contratos."""
        return {x["symbol"]: x for x in self.get("/fapi/v1/premiumIndex")}

    def financiacion(self, sym: str, desde: int, limite: int = 100) -> list:
        return self.get("/fapi/v1/fundingRate", symbol=sym, startTime=desde, limit=limite)


class Demo(Publico):
    """Cuenta Demo de Binance. Los precios para decidir se leen igual del mercado publico (Publico.get)."""

    def __init__(self, key: str, secret: str, http: httpx.Client | None = None):
        super().__init__(DEMO, http)
        self.key, self.secret, self.offset = key, secret.encode(), 0

    def sincronizar(self) -> None:
        try:
            self.offset = int(self._respuesta(self.http.get(DEMO + "/fapi/v1/time"))["serverTime"]) - int(time.time() * 1000)
        except Exception:  # noqa: BLE001 - se usa el reloj del servidor
            self.offset = 0

    def firmado(self, metodo: str, ruta: str, **p):
        p = {k: _valor(v) for k, v in p.items() if v is not None}
        p["timestamp"] = int(time.time() * 1000) + self.offset
        p["recvWindow"] = 10000
        q = urllib.parse.urlencode(p)
        firma = hmac.new(self.secret, q.encode(), hashlib.sha256).hexdigest()
        r = self.http.request(metodo, f"{DEMO}{ruta}?{q}&signature={firma}", headers={"X-MBX-APIKEY": self.key})
        return self._respuesta(r)

    # ---- cuenta
    def cuenta(self) -> dict:
        return self.firmado("GET", "/fapi/v2/account")

    def posiciones(self) -> dict[str, dict]:
        return {x["symbol"]: x for x in self.firmado("GET", "/fapi/v2/positionRisk") if float(x["positionAmt"]) != 0}

    def operaciones(self, sym: str, desde: int) -> list:
        return self.firmado("GET", "/fapi/v1/userTrades", symbol=sym, startTime=desde, limit=1000)

    def ingresos(self, sym: str, tipo: str, desde: int) -> list:
        return self.firmado("GET", "/fapi/v1/income", symbol=sym, incomeType=tipo, startTime=desde, limit=1000)

    # ---- preparacion
    def un_sentido(self) -> None:
        """Modo de posicion de un solo sentido (lo normal). Solo se cambia si la cuenta esta en modo de dos sentidos."""
        if not self.firmado("GET", "/fapi/v1/positionSide/dual").get("dualSidePosition"):
            return
        try:
            self.firmado("POST", "/fapi/v1/positionSide/dual", dualSidePosition=False)
        except ErrorBinance as e:
            if e.code != -4059:
                raise

    def preparar(self, sym: str, apalancamiento: int) -> None:
        try:
            self.firmado("POST", "/fapi/v1/marginType", symbol=sym, marginType="ISOLATED")
        except ErrorBinance as e:
            if e.code != -4046:   # "No need to change margin type"
                raise
        self.firmado("POST", "/fapi/v1/leverage", symbol=sym, leverage=apalancamiento)

    # ---- ordenes
    def mercado(self, sym: str, lado_orden: str, cantidad: str, reducir: bool = False) -> dict:
        return self.firmado("POST", "/fapi/v1/order", symbol=sym, side=lado_orden, type="MARKET", quantity=cantidad,
                            reduceOnly=True if reducir else None, newOrderRespType="RESULT")

    def orden(self, sym: str, orden_id) -> dict:
        return self.firmado("GET", "/fapi/v1/order", symbol=sym, orderId=orden_id)

    def poner_stop(self, sym: str, lado_orden: str, precio: str) -> dict:
        """Stop a mercado que cierra toda la posicion, disparado por el precio de marca. Binance movio estas ordenes al
        servicio de ordenes condicionales (algoOrder); si la cuenta aun no lo tiene, se usa la orden clasica."""
        try:
            r = self.firmado("POST", "/fapi/v1/algoOrder", algoType="CONDITIONAL", symbol=sym, side=lado_orden, type="STOP_MARKET",
                             triggerPrice=precio, closePosition=True, workingType="MARK_PRICE", priceProtect=True)
            return {"algo": r.get("algoId"), "precio": precio}
        except ErrorBinance as e:
            if e.status not in (404, 400) or e.code in (-2021,):   # -2021: el stop se dispararia ya
                raise
        r = self.firmado("POST", "/fapi/v1/order", symbol=sym, side=lado_orden, type="STOP_MARKET", stopPrice=precio,
                         closePosition=True, workingType="MARK_PRICE", priceProtect=True)
        return {"orden": r.get("orderId"), "precio": precio}

    def stops(self, sym: str) -> list[dict]:
        out = []
        try:
            out += [{"algo": x.get("algoId"), "precio": x.get("triggerPrice")} for x in self.firmado("GET", "/fapi/v1/openAlgoOrders", symbol=sym)
                    if x.get("orderType", x.get("type")) == "STOP_MARKET"]
        except ErrorBinance:
            pass
        out += [{"orden": x["orderId"], "precio": x.get("stopPrice")} for x in self.firmado("GET", "/fapi/v1/openOrders", symbol=sym)
                if x.get("type") == "STOP_MARKET"]
        return out

    def quitar_stops(self, sym: str) -> None:
        for s in self.stops(sym):
            try:
                if s.get("algo"):
                    self.firmado("DELETE", "/fapi/v1/algoOrder", algoId=s["algo"])
                else:
                    self.firmado("DELETE", "/fapi/v1/order", symbol=sym, orderId=s["orden"])
            except ErrorBinance:
                pass
