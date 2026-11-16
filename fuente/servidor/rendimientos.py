"""Modulo 4 · Rendimientos: formas de poner a trabajar el dinero quieto, con su tasa en vivo y su riesgo.

Fuentes publicas, sin llaves:
  DefiLlama (yields.llama.fi)  tasa diaria de cada producto (ahorro en dolares digitales, bonos del Tesoro tokenizados, staking)
  Binance (fapi)               tasa de financiacion de futuros (estrategia neutral)
Binance Simple Earn no publica su tasa sin llaves: se muestra la ultima publicada en sus anuncios.
"""
from __future__ import annotations

import time

import httpx

from . import tesoreria

# riesgo: 1 muy bajo ... 5 alto · acceso: que tan facil es para una persona en Colombia con cuenta de Binance
OPCIONES = [
    {"id": "binance_earn", "nombre": "Binance Simple Earn · USDT flexible", "tipo": "Ahorro en dólares", "moneda": "USD", "riesgo": 2,
     "acceso": "Fácil: en la app de Binance", "liquidez": "Inmediata",
     "como": "Binance presta tus USDT a quienes operan con margen y te paga intereses cada día. Retiras cuando quieras.",
     "cuidado": "Tu dinero queda en Binance: si Binance tuviera un problema, lo tendrías tú también.",
     "fijo": {"apy": 0.015, "extra": 0.03, "extra_hasta": 200, "fecha": "julio de 2026",
              "fuente": "https://www.binance.com/en/support/announcement/detail/0aa1414ad5f94c3ba1728a2bdace2b2b"}},
    {"id": "d8c4eff5-c8a9-46fc-a888-057c4c668e72", "nombre": "Sky Savings (sUSDS)", "tipo": "Ahorro en dólares", "moneda": "USD", "riesgo": 2,
     "acceso": "Medio: necesitas una billetera propia", "liquidez": "Inmediata",
     "como": "El antiguo MakerDAO paga una tasa por guardar su dólar digital (USDS). La tasa la fija el protocolo.",
     "cuidado": "Riesgo de programa (contrato inteligente) y de que el dólar digital pierda su paridad."},
    {"id": "ac61ee82-2fe4-4f9b-a9cd-7fb33f598859", "nombre": "Bonos del Tesoro de EE. UU. tokenizados (Ondo USDY)", "tipo": "Bonos del Tesoro", "moneda": "USD", "riesgo": 2,
     "acceso": "Difícil: verificación de identidad en Ondo", "liquidez": "Días",
     "como": "Un token respaldado por bonos del Tesoro de EE. UU. de corto plazo. Rinde lo que pagan esos bonos, menos comisiones.",
     "cuidado": "Exige verificación y no es para residentes de EE. UU. Depende del emisor."},
    {"id": "f981a304-bb6c-45b8-b0c5-fd2f515ad23a", "nombre": "Prestar USDT en Aave", "tipo": "Préstamo en DeFi", "moneda": "USD", "riesgo": 3,
     "acceso": "Medio: necesitas una billetera propia", "liquidez": "Casi inmediata",
     "como": "Prestas USDT en el mayor mercado de préstamos descentralizado; los que piden prestado dejan garantía.",
     "cuidado": "La tasa sube y baja con la demanda. Riesgo de programa y de liquidaciones en caídas fuertes."},
    {"id": "43641cf5-a92e-416b-bce9-27113d3c0db6", "nombre": "Préstamos a instituciones (Maple · USDC)", "tipo": "Crédito", "moneda": "USD", "riesgo": 4,
     "acceso": "Medio: billetera propia", "liquidez": "Días a semanas",
     "como": "Prestas a empresas del mundo cripto con garantía. Paga más porque hay riesgo de que alguien no pague.",
     "cuidado": "Riesgo de crédito: en 2022 varios prestatarios de este tipo quebraron."},
    {"id": "66985a81-9c51-46ca-9977-42b4fe7bc6df", "nombre": "Dólar sintético de Ethena (sUSDe)", "tipo": "Estrategia neutral", "moneda": "USD", "riesgo": 4,
     "acceso": "Medio: billetera propia", "liquidez": "7 días",
     "como": "Hace por ti la estrategia neutral de futuros a gran escala y reparte la financiación que cobra.",
     "cuidado": "Si la financiación se vuelve negativa por mucho tiempo, el rendimiento cae y el dólar sintético puede perder valor."},
    {"id": "80b8bf92-b953-4c20-98ea-c9653ef2bb98", "nombre": "Staking de ETH en Binance (WBETH)", "tipo": "Staking", "moneda": "ETH", "riesgo": 3,
     "acceso": "Fácil: en la app de Binance", "liquidez": "Inmediata (se vende el token)",
     "como": "Tus ETH ayudan a validar la red Ethereum y la red te paga en más ETH.",
     "cuidado": "Ganas en ETH: si ETH baja 30 %, el interés no lo compensa. Solo si ya quieres tener ETH."},
    {"id": "9e709e57-84eb-496b-82ce-2e8f6a17db1b", "nombre": "Staking de SOL en Binance (BNSOL)", "tipo": "Staking", "moneda": "SOL", "riesgo": 3,
     "acceso": "Fácil: en la app de Binance", "liquidez": "Inmediata (se vende el token)",
     "como": "Igual que con ETH, pero en la red Solana, que paga más.",
     "cuidado": "Ganas en SOL, que sube y baja mucho más que ETH."},
    {"id": "carry_btc", "nombre": "Neutral con futuros de BTC", "tipo": "Estrategia neutral", "moneda": "USD", "riesgo": 3,
     "acceso": "Medio: dos billeteras en Binance", "liquidez": "Inmediata",
     "como": "Compras BTC y vendes el mismo monto en futuros. No ganas ni pierdes con el precio; cobras la financiación cada 8 horas.",
     "cuidado": "La mitad del capital queda como garantía; cuando la financiación es negativa, pagas. Comisiones ~0,3 % por armar y desarmar."},
]


def _defillama(pid: str, http: httpx.Client) -> dict | None:
    r = http.get(f"https://yields.llama.fi/chart/{pid}")
    if r.status_code != 200:
        return None
    filas = [x for x in r.json().get("data", []) if x.get("apy") is not None]
    if not filas:
        return None
    ultimo = filas[-1]
    mes = {}
    for x in filas[-400:]:
        mes[x["timestamp"][:7]] = x["apy"] / 100
    ult30 = [x["apy"] / 100 for x in filas[-30:]]
    return {"apy": ultimo["apy"] / 100, "media30": sum(ult30) / len(ult30), "tvl": ultimo.get("tvlUsd"),
            "serie": [[k, round(v, 5)] for k, v in sorted(mes.items())][-13:], "fecha": ultimo["timestamp"][:10]}


def _carry(http: httpx.Client, sym: str = "BTCUSDT") -> dict | None:
    desde = int(time.time() * 1000) - 330 * 86_400_000   # 1.000 tasas = 333 dias (3 por dia)
    filas = http.get("https://fapi.binance.com/fapi/v1/fundingRate", params={"symbol": sym, "limit": 1000, "startTime": desde}).json()
    if not isinstance(filas, list) or not filas:
        return None
    mes = {}
    for x in filas:
        m = time.strftime("%Y-%m", time.gmtime(int(x["fundingTime"]) / 1000))
        mes.setdefault(m, []).append(float(x["fundingRate"]))
    anual = lambda rs: sum(rs) / len(rs) * 3 * 365 / 2   # noqa: E731 - sobre la mitad del capital (la otra mitad es garantia)
    ult30 = [float(x["fundingRate"]) for x in filas[-90:]]
    return {"apy": anual(ult30[-3:]), "media30": anual(ult30), "serie": [[k, round(anual(v), 5)] for k, v in sorted(mes.items())][-13:],
            "fecha": time.strftime("%Y-%m-%d", time.gmtime(int(filas[-1]["fundingTime"]) / 1000))}


def resumen(http: httpx.Client | None = None) -> dict:
    http = http or httpx.Client(timeout=40)
    out = []
    for o in OPCIONES:
        d = {k: v for k, v in o.items()}
        try:
            if o["id"] == "binance_earn":
                f = o["fijo"]
                d.update(apy=f["apy"], media30=f["apy"], serie=[], fecha=f["fecha"], fuente="anuncio de Binance")
                vivo = tesoreria.tasas(None, ("USDT",)).get("USDT")   # la tasa que Binance publica hoy, con su tramo de promocion
                if vivo:
                    t0 = (vivo["tramos"] or [{}])[0]
                    d.update(apy=vivo["base"], media30=vivo["base"], fecha="hoy (en vivo)", fuente="Binance (en vivo)",
                             fijo={**f, "apy": vivo["base"], "extra": t0.get("extra", 0.0), "extra_hasta": t0.get("hasta", 0), "fecha": "hoy"})
            elif o["id"] == "carry_btc":
                d.update(_carry(http) or {}, fuente="Binance (financiación de BTC)")
            else:
                d.update(_defillama(o["id"], http) or {}, fuente="DefiLlama")
        except Exception as e:  # noqa: BLE001 - una fuente caida no tumba las demas
            d["error"] = str(e)[:120]
        out.append(d)
    return {"actualizado": int(time.time() * 1000), "opciones": out}
