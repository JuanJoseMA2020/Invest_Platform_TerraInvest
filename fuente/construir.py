"""Arma la plataforma web: junta los modulos de plataforma/src en UN solo archivo (plataforma/dist/index.html).

Por que un solo archivo: asi funciona igual con doble clic en el PC y publicado en GitHub Pages, sin servidor ni pasos de
instalacion. El codigo fuente sigue separado por modulos:

    src/css/app.css          estilos
    src/js/00_nucleo.js      navegacion, guardado local, formato
    src/js/10_binance.js     datos publicos de Binance
    src/js/20_modelos.js     calculos (señales y tendencia), verificados contra Python con plataforma/probar.py
    src/js/30_grafico.js     graficos de velas
    src/js/40..43_*.js       un archivo por modulo: Inicio, Trading, Señales, Futuros
    src/js/99_arranque.js    enciende todo

Uso (desde la carpeta del proyecto):
    python -m plataforma.construir              arma la pagina (vuelve a entrenar el modelo de señales)
    python -m plataforma.construir --rapido     reutiliza el modelo ya entrenado (plataforma/modelos/senales.json)
    python -m plataforma.probar                 comprueba que la pagina calcula igual que el bot
"""
import json
import sys
from pathlib import Path

import httpx
import pandas as pd

from bot import trend
from bot.config import load

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
SRC, DIST, MODELOS = HERE / "src", HERE / "dist", HERE / "modelos"
FUT_SIMBOLOS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT"]

# Resultados de las validaciones (scripts/validar_tendencia.py y scripts/investigacion/futuros.py, nov-2026)
VALIDACION_TENDENCIA = {"periodo": "2021 a nov-2026", "anual": 0.175, "caida": 0.147, "btc_anual": 0.145, "btc_caida": 0.766,
                        "examen": 0.074, "btc_examen": -0.182, "prudente": "entre +7 % y +13 %"}
ESTUDIO_FUTUROS = {"intradia_gana": 0.00008, "intradia_comision": 0.001, "cortos_anual": -0.009, "largos_anual": 0.274,
                   "carry_btc": 0.025, "carry_periodo": "lo que va de 2026"}


def datos(rapido: bool) -> dict:
    _, cfg = load()
    c, u = cfg.strategy.consensus, cfg.universe
    path = MODELOS / "senales.json"
    if rapido and path.exists():
        senales = json.loads(path.read_text(encoding="utf-8"))
    else:
        from plataforma.modelo_senales import entrenar
        senales = entrenar()
        MODELOS.mkdir(exist_ok=True)
        path.write_text(json.dumps(senales), encoding="utf-8")
    minimos = {}
    try:   # monto minimo por operacion de cada contrato
        info = httpx.get("https://fapi.binance.com/fapi/v1/exchangeInfo", timeout=30).json()
        for s in info["symbols"]:
            if s["symbol"] in FUT_SIMBOLOS:
                minimos[s["symbol"]] = float(next(f["notional"] for f in s["filters"] if f["filterType"] == "MIN_NOTIONAL"))
    except Exception as e:  # noqa: BLE001
        print("Sin minimos de futuros (se usa 5 USDT):", e)
    return {
        "generado": pd.Timestamp.now().isoformat(timespec="minutes"),
        "senales": senales,
        "tendencia": {"canal_in": c.channel_in, "canal_out": c.channel_out, "gate_dias": c.gate_days, "stop_atr": c.stop_atr,
                      "riesgo": cfg.risk.risk_per_trade, "top": u.dynamic_top or 10, "ventana": u.dynamic_window_days,
                      "min_historia": u.dynamic_min_history_days, "excluidas": sorted(trend.EXCLUDED), "validacion": VALIDACION_TENDENCIA},
        "futuros": {"simbolos": FUT_SIMBOLOS, "minimos": minimos, "estudio": ESTUDIO_FUTUROS},
    }


def armar(d: dict) -> str:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = "\n".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "css").glob("*.css")))
    js = "\n".join(f"// ===== {p.name}\n" + p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))
    vendor = (HERE / "vendor" / "lightweight-charts.js").read_text(encoding="utf-8")
    blob = json.dumps(d, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    for mark, text in (("/*__CSS__*/", css), ("/*__VENDOR__*/", vendor), ("/*__DATOS__*/null", blob), ("/*__JS__*/", js)):
        assert html.count(mark) == 1, mark
        html = html.replace(mark, text)
    return html


def main() -> None:
    d = datos("--rapido" in sys.argv)
    DIST.mkdir(exist_ok=True)
    out = DIST / "index.html"
    out.write_text(armar(d), encoding="utf-8")
    print(f"Plataforma armada: {out} ({out.stat().st_size / 1024:.0f} KB) · activos de señales: {', '.join(d['senales']['activos'])}")


if __name__ == "__main__":
    main()
