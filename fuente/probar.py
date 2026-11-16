"""Comprueba que la pagina calcula lo mismo que el codigo Python del bot y del estudio.

Corre los calculos de plataforma/src/js/20_modelos.js en un motor de JavaScript real y los compara, en cientos de momentos,
con bot/trend.py, bot/signals.py y el modelo de señales. Si algo difiere, la pagina no debe publicarse.

Necesita el paquete mini-racer (no es parte del bot):   pip install --target <carpeta> mini-racer
Uso:  python -m plataforma.probar [carpeta donde esta mini-racer]
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

if len(sys.argv) > 1:
    sys.path.insert(0, sys.argv[1])
from py_mini_racer import MiniRacer  # noqa: E402

from bot import signals as sg  # noqa: E402
from bot import trend  # noqa: E402
from scripts.investigacion.binarias import features  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
js = re.search(r"/\*MODELO-INICIO\*/(.*?)/\*MODELO-FIN\*/", (ROOT / "plataforma/src/js/20_modelos.js").read_text(encoding="utf-8"), re.S)[1]
ctx = MiniRacer()
ctx.eval(js)
call = lambda fn, *a: ctx.eval(f"JSON.stringify({fn}({','.join(json.dumps(x) for x in a)}))")  # noqa: E731
run = lambda fn, *a: json.loads(call(fn, *a) or "null")  # noqa: E731
rows = lambda df: [[int(t.timestamp() * 1000), r.open, r.high, r.low, r.close, r.volume] for t, r in df.iterrows()]  # noqa: E731
fallos = 0


def check(name: str, ok: bool, detail: str) -> None:
    global fallos
    fallos += not ok
    print(f"{'OK   ' if ok else 'FALLA'} {name}: {detail}")


# ---------------------------------------------------------------- señales
model = json.loads((ROOT / "plataforma/modelos/senales.json").read_text(encoding="utf-8"))
t = model["autoprueba"]
p = run("probabilidad", model["activos"][t["activo"]], t["velas"])
check("señales · autoprueba", abs(p - t["esperado"]) < 1e-9, f"{p:.12f} frente a {t['esperado']:.12f}")
worst, n = 0.0, 0
for sym, a in model["activos"].items():
    df = pd.read_csv(ROOT / f"data/cache/research/5m/{sym}USDT.csv", index_col=0, parse_dates=True).iloc[-5000:]
    X = features(df)[a["cols"]]
    py = 1 / (1 + np.exp(-(((X - a["media"]) / a["escala"]) @ np.array(a["coef"]) + a["intercepto"])))
    r = rows(df)
    for i in range(400, len(df), 29):
        pj = run("probabilidad", a, r[i - 299:i + 1])
        if pj is not None and not np.isnan(py.iloc[i]):
            worst, n = max(worst, abs(pj - py.iloc[i])), n + 1
check("señales · probabilidad", worst < 1e-9, f"{n} momentos, peor diferencia {worst:.1e}")

# ---------------------------------------------------------------- tendencia
h4 = {}
for sym in ("BTC", "ETH", "SOL", "DOGE", "ZEC", "SUI"):
    path = ROOT / f"data/cache/research/4h/{sym}USDT.csv"
    if path.exists():
        h4[sym] = pd.read_csv(path, index_col=0, parse_dates=True)[["open", "high", "low", "close", "volume"]].iloc[-4000:]
n = bad = 0
worst_lvl = worst_atr = 0.0
for sym, df in h4.items():
    long = trend.channel_long(df, 20, 10, 6)
    hi = df["high"].rolling(120).max().shift(1)
    lo = df["low"].rolling(60).min().shift(1)
    atr_d = sg.compute(df)["atr_d"]
    r = rows(df)
    for i in range(1200, len(df), 37):
        j = run("canal", r[i - 999:i + 1], 20, 10, 6)
        # el estado depende de la ultima ruptura: con 1.000 velas debe coincidir salvo tendencias de mas de 5 meses
        bad += j["largo"] != bool(long.iloc[i])
        worst_lvl = max(worst_lvl, abs(j["hi"] / hi.iloc[i] - 1), abs(j["lo"] / lo.iloc[i] - 1))
        worst_atr = max(worst_atr, abs(run("atrDiario", r[i - 999:i + 1], 6) / atr_d.iloc[i] - 1))
        n += 1
check("tendencia · estado del canal", bad == 0, f"{n} momentos en {len(h4)} monedas, {bad} distintos")
check("tendencia · niveles de compra y venta", worst_lvl < 1e-12, f"peor diferencia {worst_lvl:.1e}")
check("tendencia · ATR diario", worst_atr < 1e-6, f"peor diferencia {worst_atr:.1e}")
btc = h4["BTC"]
m = btc["close"].rolling(600).mean()
bad = 0
for i in range(1200, len(btc), 41):
    j = run("filtroBtc", rows(btc.iloc[i - 999:i + 1]), 100, 6)
    bad += j["sano"] != bool(btc["close"].iloc[i] > m.iloc[i]) or abs(j["media"] / m.iloc[i] - 1) > 1e-12
check("tendencia · filtro de Bitcoin", bad == 0, f"{bad} distintos")

# ---------------------------------------------------------------- universo del mes
d1 = {}
for path in sorted((ROOT / "data/cache/research/1d").glob("*USDT.csv"))[:160]:
    s = pd.read_csv(path, index_col=0, parse_dates=True)["quote_volume"]
    if len(s) > 200:
        d1[path.stem] = s
bad = 0
for month in ("2024-06-01", "2025-03-01", "2026-11-01"):
    ms = pd.Timestamp(month)
    py = trend.pick_universe(d1, ms, 10, 60, 120)
    vol = {k: [[int(t.timestamp() * 1000), float(v)] for t, v in s.dropna().items()] for k, s in d1.items()}
    bad += run("elegirUniverso", vol, int(ms.timestamp() * 1000), 10, 60, 120) != py
check("universo · las 10 del mes", bad == 0, f"3 meses, {bad} distintos")

print("\nTODO COINCIDE" if not fallos else f"\n{fallos} COMPROBACIONES FALLARON: no publicar")
sys.exit(1 if fallos else 0)
