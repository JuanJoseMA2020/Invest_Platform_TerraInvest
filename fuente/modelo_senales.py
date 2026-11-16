"""Modulo Señales de la plataforma · Entrena el modelo que corre dentro de la pagina.

La pagina lee velas de 5 minutos de Binance (datos publicos), calcula las
mismas variables que este script y avisa cuando el modelo esta entre su 10 % de momentos mas seguros. No opera: quien
entra en la plataforma es la persona.

Honestidad del numero que muestra el panel: "acierto en prueba" sale de un modelo entrenado con el primer 60 % de la
historia, umbral elegido con el 20 % siguiente y medido en el 20 % final que nunca vio. El modelo que se publica se
vuelve a entrenar con toda la historia (para estar al dia), con el umbral de su ultimo 20 %.

Uso (desde la carpeta del proyecto):
    python -m scripts.investigacion.descargar 5m --solo BTCUSDT,ETHUSDT,SOLUSDT,LINKUSDT,ADAUSDT     (borra antes los CSV para refrescar)
    python -m plataforma.construir
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from scripts.investigacion.binarias import features

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "cache" / "research" / "5m"
ASSETS = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana", "LINK": "Chainlink", "ADA": "Cardano"}   # los que ofrece la plataforma
PAGO = 0.80                      # pago de la plataforma: hay que acertar mas de 1 / (1 + PAGO)
MARGEN = 0.01                    # un activo solo entra al panel si su acierto en prueba supera lo necesario por este margen
HORIZON, BAR_MIN, TOP, SINCE = 3, 5, 0.10, "2023-01-01"


def fit(d: pd.DataFrame, cols: list[str]):
    sc = StandardScaler().fit(d[cols])
    m = LogisticRegression(max_iter=300, C=0.1).fit(sc.transform(d[cols]), d.up)
    return sc, m


def proba(sc, m, d, cols) -> np.ndarray:
    return m.predict_proba(sc.transform(d[cols]))[:, 1]


def build_asset(sym: str) -> tuple[dict, pd.DataFrame, tuple]:
    df = pd.read_csv(DATA / f"{sym}USDT.csv", index_col=0, parse_dates=True)
    df = df[df.index >= SINCE]
    X = features(df)
    cols = list(X.columns)
    fut = df.close.shift(-HORIZON)
    d = X.assign(up=(fut > df.close).astype(float), dn=(fut < df.close).astype(float)).iloc[100:-HORIZON].dropna()
    a, b = int(len(d) * 0.6), int(len(d) * 0.8)
    sc, m = fit(d.iloc[:a], cols)                                   # medicion honesta
    thr = np.quantile(np.abs(proba(sc, m, d.iloc[a:b], cols) - 0.5), 1 - TOP)
    te = d.iloc[b:]
    pt = proba(sc, m, te, cols)
    # La plataforma solo cierra en cada cuarto de hora (20:00, 20:15...): cuentan las velas que cierran en uno de ellos
    aligned = ((te.index + pd.Timedelta(minutes=BAR_MIN)).minute % (HORIZON * BAR_MIN) == 0)
    sel = (np.abs(pt - 0.5) >= thr) & aligned
    hit = np.where(pt[sel] > 0.5, te.up[sel], te.dn[sel])
    days = max((te.index[-1] - te.index[0]).days, 1)
    by = pd.Series(hit, index=te.index[sel]).groupby(te.index[sel].to_period("M")).mean()
    sc2, m2 = fit(d, cols)                                           # modelo que se publica
    thr2 = float(np.quantile(np.abs(proba(sc2, m2, d.iloc[b:], cols) - 0.5), 1 - TOP))
    info = {"simbolo": f"{sym}USDT", "nombre": ASSETS[sym], "cols": cols, "media": sc2.mean_.tolist(), "escala": sc2.scale_.tolist(),
            "coef": m2.coef_[0].tolist(), "intercepto": float(m2.intercept_[0]), "umbral": thr2,
            "acierto_prueba": float(hit.mean()), "n_prueba": int(sel.sum()), "senales_dia": round(sel.sum() / days, 1),
            "error": float(1.96 * np.sqrt(hit.mean() * (1 - hit.mean()) / sel.sum())),
            "meses_ok": int((by > 1 / (1 + PAGO)).sum()), "meses": int(len(by)), "entrenado_hasta": str(df.index[-1])}
    print(f"{sym}: acierto en prueba {hit.mean():.2%} ± {info['error']:.2%} en {sel.sum():,} señales ({info['senales_dia']}/dia) · "
          f"meses sobre lo necesario: {info['meses_ok']} de {info['meses']} · datos hasta {df.index[-1]}")
    return info, df, (sc2, m2, X, cols)


def entrenar() -> dict:
    """Modelo listo para incrustar en la pagina (con su caso de autoprueba)."""
    model = {"pago": PAGO, "horizonte_min": HORIZON * BAR_MIN, "vela_min": BAR_MIN, "activos": {}}
    for sym in ASSETS:
        info, df, (sc, m, X, cols) = build_asset(sym)
        need = 1 / (1 + PAGO) + MARGEN
        if info["acierto_prueba"] < need:
            print(f"   -> {sym} queda FUERA: no supera {need:.1%} (pago {PAGO:.0%})")
            if sym != "BTC":
                continue
        model["activos"][sym] = info
        if sym == "BTC":   # caso de autoprueba: la pagina debe calcular exactamente esta probabilidad
            tail = df.iloc[-260:]
            x = X.loc[[tail.index[-1]], cols]
            model["autoprueba"] = {"activo": sym, "esperado": float(m.predict_proba(sc.transform(x))[0, 1]),
                                   "velas": [[int(t.timestamp() * 1000), r.open, r.high, r.low, r.close, r.volume]
                                             for t, r in tail.iterrows()]}
    return model
