"""Estrategia del bot de futuros: tendencia por canales, en largo Y en corto, con velas diarias. Logica pura (sin red).

  Bitcoin sobre su media de 100 dias  -> solo largos:  entra si cierra sobre el maximo de 20 dias; sale bajo el minimo de 10.
  Bitcoin bajo su media de 100 dias   -> solo cortos:  entra si cierra bajo el minimo de 20 dias; sale sobre el maximo de 10.
  Universo: las 10 monedas con mas volumen en futuros de los ultimos 60 dias, elegidas el dia 1 de cada mes.
  Tamaño: se arriesga el 0,75 % del capital entre la entrada y el stop (3 ATR). Stop registrado en Binance.

Es la regla medida en scripts/investigacion/futuros.py (2020 -> nov-2026, con todas las monedas que existieron):
desarrollo +33 %/año, examen 2025-26 +9 %/año, peor caida 24 %. Los cortos casi empatan: sirven para no quedarse quieto en
mercados bajistas, no como fuente principal de ganancia.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

DIA = 86_400_000

# Monedas que no se operan (estables, oro, envueltas, apalancadas). Copia de la lista del bot de trading (bot/trend.py) para
# que este programa no dependa de el; tests/test_plataforma_servidor.py comprueba que sigan iguales.
EXCLUIDAS = {"USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "USDD", "PYUSD", "USD1", "USDE", "RLUSD", "USDS", "XUSD",
             "BFUSD", "EUR", "TRY", "BRL", "UST", "USTC", "SUSD", "PAX", "USDSB", "AEUR", "EURI", "GBP", "AUD", "BKRW", "IDRT",
             "BIDR", "NGN", "RUB", "UAH", "VAI", "BVND", "ZAR", "PLN", "RON", "ARS", "MXN", "COP", "CZK", "JPY", "USDX", "FRAX",
             "LUSD", "EURS", "USDJ", "USDK", "USDN", "PAXG", "XAUT", "WBTC", "WBETH", "BETH", "BNSOL", "WETH", "STETH"}
APALANCADAS = ("UP", "DOWN", "BULL", "BEAR")


def excluded(base: str) -> bool:
    return base in EXCLUIDAS or (len(base) > 4 and base.endswith(APALANCADAS))


def pick_universe(volume: dict, month_start: pd.Timestamp, n: int, window: int = 60, min_history: int = 120) -> list[str]:
    """Las n monedas con mas volumen medio diario en los `window` dias anteriores a `month_start` (misma regla que el bot)."""
    rank = {}
    for sym, v in volume.items():
        past = v[v.index < month_start].dropna()
        if len(past) < min_history or past.index[-1] < month_start - pd.Timedelta(days=3):
            continue
        rank[sym] = float(past.iloc[-window:].mean())
    return sorted(rank, key=rank.get, reverse=True)[:n]


def velas_df(raw: list, ahora_ms: int) -> pd.DataFrame:
    """Velas de Binance -> tabla, solo las ya cerradas."""
    rows = [r for r in raw if int(r[6]) < ahora_ms]
    df = pd.DataFrame([[float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[7])] for r in rows],
                      columns=["open", "high", "low", "close", "qv"], index=pd.to_datetime([int(r[0]) for r in rows], unit="ms"))
    return df


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    prev = df["close"].shift(1)
    tr = np.maximum(df["high"] - df["low"], np.maximum((df["high"] - prev).abs(), (df["low"] - prev).abs()))
    return tr.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def _estado(c, entra, sale) -> pd.Series:
    return pd.Series(np.where(entra, 1.0, np.where(sale, -1.0, np.nan)), index=c.index).ffill() == 1


@dataclass
class Moneda:
    sym: str
    precio: float
    largo: bool          # en tendencia alcista (entre ruptura del maximo de 20 dias y ruptura del minimo de 10)
    corto: bool          # en tendencia bajista (entre ruptura del minimo de 20 dias y ruptura del maximo de 10)
    max_entrada: float   # maximo de 20 dias: compra si cierra encima
    min_salida: float    # minimo de 10 dias: vende el largo si cierra debajo
    min_entrada: float   # minimo de 20 dias: abre corto si cierra debajo
    max_salida: float    # maximo de 10 dias: cierra el corto si cierra encima
    atr: float

    def dict(self) -> dict:
        return {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in self.__dict__.items()}


def moneda(sym: str, df: pd.DataFrame, entrada: int, salida: int) -> Moneda | None:
    if len(df) < max(entrada, 15) + 2:
        return None
    c = df["close"]
    hi_in, lo_out = df["high"].rolling(entrada).max().shift(1), df["low"].rolling(salida).min().shift(1)
    lo_in, hi_out = df["low"].rolling(entrada).min().shift(1), df["high"].rolling(salida).max().shift(1)
    largo = _estado(c, c > hi_in, c < lo_out)
    corto = _estado(c, c < lo_in, c > hi_out)
    a = atr(df)
    return Moneda(sym, float(c.iloc[-1]), bool(largo.iloc[-1]), bool(corto.iloc[-1]), float(hi_in.iloc[-1]), float(lo_out.iloc[-1]),
                  float(lo_in.iloc[-1]), float(hi_out.iloc[-1]), float(a.iloc[-1]))


def filtro_btc(df: pd.DataFrame, dias: int) -> dict:
    media = df["close"].rolling(dias).mean()
    m, c = float(media.iloc[-1]), float(df["close"].iloc[-1])
    return {"alcista": bool(c > m), "media": m, "precio": c, "distancia": c / m - 1 if m == m else float("nan")}


def contratos_validos(info: dict) -> dict[str, dict]:
    """Perpetuos en USDT de criptomonedas (sin indices, materias primas ni acciones), con sus reglas de tamaño."""
    out = {}
    for s in info["symbols"]:
        if s.get("contractType") != "PERPETUAL" or s.get("quoteAsset") != "USDT" or s.get("status") != "TRADING":
            continue
        if s.get("underlyingType", "COIN") != "COIN" or excluded(s["baseAsset"]):
            continue
        f = {x["filterType"]: x for x in s["filters"]}
        out[s["symbol"]] = {"paso": float(f["MARKET_LOT_SIZE"]["stepSize"] if "MARKET_LOT_SIZE" in f else f["LOT_SIZE"]["stepSize"]),
                            "min_cant": float(f.get("MARKET_LOT_SIZE", f["LOT_SIZE"])["minQty"]),
                            "tick": float(f["PRICE_FILTER"]["tickSize"]),
                            "minimo": float(f.get("MIN_NOTIONAL", {}).get("notional", 5)),
                            "desde": int(s.get("onboardDate", 0))}
    return out


def universo(volumenes: dict[str, pd.Series], inicio_mes: pd.Timestamp, n: int, ventana: int, historia: int) -> list[str]:
    return pick_universe(volumenes, inicio_mes, n, ventana, historia)


def objetivo(m: Moneda, btc: dict, en_universo: bool, filtro: float = 0.0) -> int:
    """+1 largo, -1 corto, 0 fuera. Con filtro: no abre si Bitcoin esta a menos de `filtro` de su media (mercado indeciso)."""
    if not en_universo:
        return 0
    d = btc.get("distancia", 1.0 if btc["alcista"] else -1.0)
    if d > filtro:
        return 1 if m.largo else 0
    if d < -filtro:
        return -1 if m.corto else 0
    return 0


COSTO_IDA_VUELTA = 0.002   # comisiones + deslizamiento de entrar y salir: el stop "en la entrada" los cubre


def niveles(op: dict, tp1_atr: float, tp1_frac: float, tp2_atr: float, tp2_frac: float, paso: float) -> dict:
    """Cerebro 2: los dos precios de cobro, las cantidades de cada cobro y el stop que corresponde a cada etapa.
       etapa 0: stop inicial (3 ATR) · etapa 1 (tras cobrar 1.º): stop en la entrada · etapa 2 (tras el 2.º): stop asegura +1 ATR."""
    e, l, a = op["p_in"], op["lado"], op["atr"]
    ini = op.get("cant_ini") or op["cant"]
    q1 = redondear(ini * tp1_frac, paso)
    q2 = redondear((ini - q1) * tp2_frac, paso)
    return {"tp1": e + l * tp1_atr * a, "tp2": e + l * tp2_atr * a, "q1": q1, "q2": q2,
            "stop1": e * (1 + l * COSTO_IDA_VUELTA), "stop2": e + l * tp1_atr * a}


def stop_de_etapa(op: dict, nv: dict, stop_inicial: float) -> float:
    return {0: stop_inicial, 1: nv["stop1"]}.get(op.get("etapa") or 0, nv["stop2"])


def motivo_entrada_txt(lado: int) -> str:
    return "Cobra un tercio al ganar 1 ATR (lo demás ya no puede perder), la mitad del resto a 3 ATR y deja correr lo último."


def motivo_entrada(m: Moneda, lado: int, entrada: int, dias: int) -> str:
    if lado > 0:
        return f"Cerró sobre su máximo de {entrada} días y Bitcoin está sobre su media de {dias} días: apuesto a que sigue subiendo."
    return f"Cerró bajo su mínimo de {entrada} días y Bitcoin está bajo su media de {dias} días: apuesto a que sigue bajando."


def motivo_salida(m: Moneda | None, lado: int, btc: dict, en_universo: bool, salida: int, dias: int) -> str | None:
    """Por que hay que cerrar una posicion abierta (None = se mantiene)."""
    if m is None or not en_universo:
        return "Salió de las monedas más negociadas del mes"
    if lado > 0 and not btc["alcista"]:
        return f"Bitcoin perdió su media de {dias} días: se acabaron los largos"
    if lado < 0 and btc["alcista"]:
        return f"Bitcoin recuperó su media de {dias} días: se acabaron los cortos"
    if lado > 0 and not m.largo:
        return f"Tendencia rota: cerró bajo su mínimo de {salida} días"
    if lado < 0 and not m.corto:
        return f"Tendencia rota: cerró sobre su máximo de {salida} días"
    return None


def redondear(x: float, paso: float, arriba: bool = False) -> float:
    n = x / paso
    n = math.ceil(n - 1e-9) if arriba else math.floor(n + 1e-9)
    dec = max(0, -int(math.floor(math.log10(paso)))) if paso < 1 else 0
    return round(n * paso, dec)


def tamano(capital: float, bruto: float, m: Moneda, lado: int, reglas: dict, riesgo: float, stop_atr: float, peso_max: float,
           exposicion_max: float) -> tuple[float, float, str | None]:
    """(cantidad, stop, motivo_si_no_se_puede). Arriesga `riesgo` del capital entre la entrada y el stop."""
    if not (m.atr > 0):
        return 0.0, 0.0, "sin datos de volatilidad"
    dist = stop_atr * m.atr
    stop = m.precio - lado * dist
    if stop <= 0:
        return 0.0, 0.0, "stop imposible"
    nominal = min(riesgo * capital / dist * m.precio, peso_max * capital, exposicion_max * capital - bruto)
    cant = redondear(nominal / m.precio, reglas["paso"])
    if cant < reglas["min_cant"] or cant * m.precio < reglas["minimo"]:
        piso = max(reglas["minimo"], max(reglas["min_cant"], reglas["paso"]) * m.precio)
        return 0.0, 0.0, f"la operación mínima en Binance es de {piso:.2f} USDT y con el riesgo permitido llego a {max(nominal, 0):.2f}"
    stop = redondear(stop, reglas["tick"], arriba=lado > 0)   # el stop nunca queda mas lejos de lo calculado
    return cant, stop, None
