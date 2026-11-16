"""Un ciclo del bot de futuros y de la publicacion de la plataforma. Lo corre systemd cada 15 minutos (~/plataforma):

    python -m plataforma.servidor.ciclo              un ciclo: revisa stops, decide (una vez al dia), publica
    python -m plataforma.servidor.ciclo --probar     comprueba llaves y conexion, sin operar
    python -m plataforma.servidor.ciclo --reanudar   quita la pausa del freno del 30 %

Separado del bot de trading: otra carpeta, otra base de datos, otro Telegram. Solo lee la base del bot (para mostrarla).
"""
from __future__ import annotations

import dataclasses
import math
import sys
import time
import traceback
from datetime import datetime, timezone

import pandas as pd

from . import ajustes as aj
from . import bot_spot, estrategia as es, publicar, rendimientos
from .almacen import Almacen, ahora_ms
from .aviso import Aviso
from .binance import Demo, ErrorBinance, Publico
from .cuenta import DemoCuenta, Papel

DIA = 86_400_000
MANT = 0.005   # margen de mantenimiento aproximado (para mostrar el precio de liquidacion)


def limpiar(x):
    """JSON sin NaN ni infinitos."""
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: limpiar(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [limpiar(v) for v in x]
    return x


def num(x: float, d: int = 2) -> str:
    return f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def precio_txt(x: float) -> str:
    a = abs(x)
    return num(x, 2 if a >= 100 else 4 if a >= 1 else 6)


class BotFuturos:
    def __init__(self, cfg: aj.Ajustes, db: Almacen, pub: Publico, cuenta, aviso: Aviso, ahora: int | None = None):
        self.cfg, self.f, self.db, self.pub, self.cuenta, self.aviso = cfg, cfg.futuros, db, pub, cuenta, aviso
        self.ahora = ahora or ahora_ms()
        self.modo = cuenta.modo
        self.marcas: dict[str, float] = {}
        self.tasas: dict[str, float] = {}
        self.reglas: dict[str, dict] = {}
        self.errores: list[str] = []

    # ------------------------------------------------------------------ utilidades
    @property
    def hoy(self) -> str:
        return datetime.fromtimestamp(self.ahora / 1000, timezone.utc).strftime("%Y-%m-%d")

    @property
    def semana(self) -> str:
        y, w, _ = datetime.fromtimestamp(self.ahora / 1000, timezone.utc).isocalendar()
        return f"{y}-S{w:02d}"

    def abiertas(self) -> list[dict]:
        return self.db.abiertas(self.modo)

    def no_realizado(self, op: dict) -> float:
        m = self.marcas.get(op["sym"], op["p_in"])
        return op["lado"] * op["cant"] * (m - op["p_in"]) - op["comision"] - op["financiacion"]

    def patrimonio(self) -> float:
        capital = self.db.get("capital", self.f.capital)
        return capital + self.db.realizado(self.modo, self.db.get("inicio", 0)) + sum(self.no_realizado(o) for o in self.abiertas())

    def bruto(self) -> float:
        return sum(o["cant"] * self.marcas.get(o["sym"], o["p_in"]) for o in self.abiertas())

    def nota(self, texto: str, nivel: str = "info", telegram: bool = True) -> None:
        self.db.evento(texto, nivel)
        if telegram:
            self.aviso.enviar(texto)

    # ------------------------------------------------------------------ ciclo
    def correr(self) -> None:
        self.cambio_de_modo()
        self.mercado()
        if self.db.get("pausa"):
            return
        self.cuenta.preparar()
        self.periodos()
        self.revisar_abiertas()
        if self.db.get("dia_procesado") != self.hoy:
            self.decidir_dia()
            self.db.set("dia_procesado", self.hoy)
        self.freno_total()
        e = self.patrimonio()
        self.db.punto(e, self.bruto() / e if e > 0 else 0.0, len(self.abiertas()), self.ahora)

    def cambio_de_modo(self) -> None:
        antes = self.db.get("modo")
        if antes == self.modo:
            return
        if antes:
            for op in self.db.abiertas(antes):
                self.db.actualizar(op["id"], estado="archivada", motivo_out=f"Cambio de {antes} a {self.modo}")
            self.db.borrar_curva()
        capital = self.f.capital
        if self.modo == "demo":
            c = self.cuenta.cuenta() or {}
            if c.get("disponible") is not None and c["disponible"] < capital:
                capital = math.floor(c["disponible"])
            if capital < 50:
                raise RuntimeError(f"La billetera de futuros de la cuenta demo tiene {capital} USDT: no alcanza para operar. "
                                   "No transfieras desde Spot (lo usa el bot de trading); avísame y lo revisamos.")
        for k, v in (("modo", self.modo), ("inicio", self.ahora), ("capital", capital), ("pico", capital), ("dia_procesado", None),
                     ("periodo_dia", None), ("periodo_semana", None), ("pausa", None)):
            self.db.set(k, v)
        donde = "la cuenta demo de Binance (órdenes de verdad con dinero de práctica)" if self.modo == "demo" else \
            "papel: simulo con los precios reales de Binance, sin cuenta"
        self.nota(f"Arranqué en {donde}. Capital asignado: {num(capital, 0)} USDT. Decido una vez al día, al cierre de la vela diaria (00:00 UTC, 7:00 p. m. de Colombia).")

    def mercado(self) -> None:
        idx = self.pub.indices()
        self.marcas = {s: float(x["markPrice"]) for s, x in idx.items()}
        self.tasas = {s: float(x.get("lastFundingRate") or 0) for s, x in idx.items()}
        guardado = self.db.get("contratos")
        if not guardado or guardado.get("dia") != self.hoy:
            guardado = {"dia": self.hoy, "reglas": es.contratos_validos(self.pub.info())}
            self.db.set("contratos", guardado)
        self.reglas = guardado["reglas"]

    def periodos(self) -> None:
        """Patrimonio al empezar el dia y la semana (para los frenos)."""
        e = self.patrimonio()
        for k, clave in (("periodo_dia", self.hoy), ("periodo_semana", self.semana)):
            p = self.db.get(k)
            if not p or p.get("id") != clave:
                self.db.set(k, {"id": clave, "eq": e})

    def bloqueo(self) -> str | None:
        e = self.patrimonio()
        d, s = self.db.get("periodo_dia") or {}, self.db.get("periodo_semana") or {}
        if d and e < d["eq"] * (1 - self.f.freno_diario):
            return f"Freno diario: hoy va {num(100 * (e / d['eq'] - 1), 1)} %. No abro más hasta mañana."
        if s and e < s["eq"] * (1 - self.f.freno_semanal):
            return f"Freno semanal: esta semana va {num(100 * (e / s['eq'] - 1), 1)} %. No abro más hasta el lunes."
        return None

    # ------------------------------------------------------------------ posiciones
    def revisar_abiertas(self) -> None:
        posiciones = self.cuenta.api.posiciones() if self.modo == "demo" else None
        for op in self.abiertas():
            pos = (posiciones or {}).get(op["sym"])
            if pos and not (op["p_in"] > 0):   # entrada sin precio confirmado: se toma el de Binance
                op["p_in"], op["cant"] = float(pos["entryPrice"]), abs(float(pos["positionAmt"]))
                self.db.actualizar(op["id"], p_in=op["p_in"], cant=op["cant"])
                self.db.evento(f"Corregí la entrada de {op['sym'][:-4]} con el precio de Binance: {precio_txt(op['p_in'])}.", "aviso")
            pagado = self.cuenta.financiacion(op, self.ahora)
            if pagado:
                op["financiacion"] += pagado
                self.db.actualizar(op["id"], financiacion=op["financiacion"], t_fin=self.ahora)
            r = self.cuenta.revisar(op, self.ahora, self.marcas.get(op["sym"], op["p_in"]), posiciones)
            if r:
                self.registrar_cierre(op, r["p_out"], r["comision"], r["motivo"], r["t_out"])
                continue
            self.db.actualizar(op["id"], ids=op["ids"])
            if not self.cuenta.asegurar_stop(op, self.reglas.get(op["sym"], {})):
                self.cerrar(op, "No pude asegurar el stop en Binance: cerré por seguridad")
            else:
                self.db.actualizar(op["id"], ids=op["ids"])

    def registrar_cierre(self, op: dict, p_out: float, com_out: float, motivo: str, t_out: int | None = None) -> float:
        com = op["comision"] + com_out
        pnl = op["lado"] * op["cant"] * (p_out - op["p_in"]) - com - op["financiacion"]
        self.db.actualizar(op["id"], estado="cerrada", t_out=t_out or self.ahora, p_out=p_out, motivo_out=motivo, comision=com, pnl=pnl)
        base, lado = op["sym"][:-4], "LARGO" if op["lado"] > 0 else "CORTO"
        pct = pnl / (op["cant"] * op["p_in"])
        icono = "✅" if pnl > 0 else "🔻"
        self.nota(f"{icono} Cerré {lado} en <b>{base}</b> · {'+' if pnl >= 0 else '−'}{num(abs(pnl))} USDT ({'+' if pct >= 0 else '−'}{num(abs(100 * pct), 1)} %)\n"
                  f"Entrada {precio_txt(op['p_in'])} → salida {precio_txt(p_out)}\nMotivo: {motivo}\n"
                  f"Patrimonio: {num(self.patrimonio())} USDT")
        return pnl

    def cerrar(self, op: dict, motivo: str) -> None:
        try:
            r = self.cuenta.cerrar(op, self.marcas.get(op["sym"], op["p_in"]), self.reglas.get(op["sym"], {"paso": 1e-3, "tick": 1e-4}))
        except ErrorBinance as e:
            self.nota(f"⚠️ No pude cerrar {op['sym'][:-4]}: {e.msg}. Lo intento en el próximo ciclo.", "error")
            return
        self.registrar_cierre(op, r["p_out"], r["comision"], motivo)

    def abrir(self, m: es.Moneda, lado: int, motivo: str) -> bool:
        reglas = self.reglas.get(m.sym)
        if not reglas:
            return False
        precio = self.marcas.get(m.sym, m.precio)
        m = dataclasses.replace(m, precio=precio)   # el tamaño y el stop se calculan con el precio de ahora
        e = self.patrimonio()
        cant, stop, porque = es.tamano(e, self.bruto(), m, lado, reglas, self.f.riesgo, self.f.stop_atr, self.f.peso_max, self.f.exposicion_max)
        if porque:
            self.db.evento(f"No abrí {m.sym[:-4]}: {porque}.", "info")
            return False
        if self.modo == "demo":
            c = self.cuenta.cuenta() or {}
            if c.get("disponible") is not None and cant * precio / self.f.apalancamiento > c["disponible"] * 0.95:
                self.nota(f"No abrí {m.sym[:-4]}: no hay margen libre suficiente en la cuenta demo.", "aviso")
                return False
        try:
            r = self.cuenta.abrir(m.sym, lado, cant, stop, reglas, precio, self.f.apalancamiento)
        except (ErrorBinance, RuntimeError) as ex:
            self.nota(f"⚠️ No pude abrir {m.sym[:-4]}: {getattr(ex, 'msg', None) or ex}", "error")
            return False
        self.db.abrir(modo=self.modo, sym=m.sym, lado=lado, t_in=self.ahora, p_in=r["p_in"], cant=r["cant"], stop=stop, atr=m.atr,
                      motivo_in=motivo, comision=r["comision"], financiacion=0.0, t_fin=self.ahora, ids=r["ids"])
        nominal = r["cant"] * r["p_in"]
        riesgo = r["cant"] * abs(r["p_in"] - stop)
        liq = r["p_in"] * (1 - lado * (1 / self.f.apalancamiento - MANT))
        self.nota(f"{'🟢' if lado > 0 else '🔴'} Abrí <b>{'LARGO' if lado > 0 else 'CORTO'}</b> en <b>{m.sym[:-4]}</b> "
                  f"({'apuesto a que sube' if lado > 0 else 'apuesto a que baja'})\n"
                  f"Entrada {precio_txt(r['p_in'])} · tamaño {num(nominal)} USDT ({self.f.apalancamiento}x: pongo {num(nominal / self.f.apalancamiento)})\n"
                  f"Stop {precio_txt(stop)} ({num(100 * (stop / r['p_in'] - 1), 1)} %): si lo toca pierdo ~{num(riesgo)} USDT\n"
                  f"Liquidación {precio_txt(liq)} (lejos del stop)\nPor qué: {motivo}")
        return True

    # ------------------------------------------------------------------ decision diaria
    def universo(self) -> list[str]:
        mes = self.hoy[:7]
        g = self.db.get("universo")
        if g and g.get("mes") == mes and g.get("lista"):
            return g["lista"]
        ticks = [t for t in self.pub.tickers24() if t["symbol"] in self.reglas]
        cands = [t["symbol"] for t in sorted(ticks, key=lambda t: -float(t["quoteVolume"]))[:40]]
        vol = {}
        for s in cands:
            df = es.velas_df(self.pub.velas(s, "1d", 200), self.ahora)
            vol[s] = df["qv"]
        inicio = pd.Timestamp(mes + "-01")
        lista = es.universo(vol, inicio, self.f.universo, self.f.ventana_volumen, self.f.historia_min)
        self.db.set("universo", {"mes": mes, "lista": lista})
        self.nota("Monedas del mes en futuros: " + ", ".join(s[:-4] for s in lista), telegram=bool(g))
        return lista

    def decidir_dia(self) -> None:
        f = self.f
        btc = es.filtro_btc(es.velas_df(self.pub.velas("BTCUSDT", "1d", 200), self.ahora), f.filtro_dias)
        uni = self.universo()
        abiertas = {o["sym"]: o for o in self.abiertas()}
        monedas = {}
        for s in dict.fromkeys(uni + list(abiertas)):
            m = es.moneda(s, es.velas_df(self.pub.velas(s, "1d", 200), self.ahora), f.canal_entrada, f.canal_salida)
            if m:
                monedas[s] = m
        # 1) salidas
        for s, op in abiertas.items():
            motivo = es.motivo_salida(monedas.get(s), op["lado"], btc, s in uni, f.canal_salida, f.filtro_dias)
            if motivo:
                self.cerrar(op, motivo)
        # 2) entradas, en orden de volumen
        bloqueo = self.bloqueo()
        abiertas = {o["sym"] for o in self.abiertas()}
        for s in uni:
            m = monedas.get(s)
            lado = es.objetivo(m, btc, True) if m else 0
            if not lado or s in abiertas:
                continue
            if bloqueo:
                self.nota(f"No abrí {s[:-4]}: {bloqueo}", "aviso", telegram=False)
                continue
            if len(abiertas) >= f.max_posiciones:
                break
            if self.abrir(m, lado, es.motivo_entrada(m, lado, f.canal_entrada, f.filtro_dias)):
                abiertas.add(s)
        # 3) radar para la pagina y resumen del dia
        self.db.set("radar", {"t": self.ahora, "btc": btc, "universo": uni,
                              "monedas": [{**monedas[s].dict(), "objetivo": es.objetivo(monedas[s], btc, True)} for s in uni if s in monedas]})
        self.resumen_dia(btc)

    def resumen_dia(self, btc: dict) -> None:
        e, capital = self.patrimonio(), self.db.get("capital", self.f.capital)
        abiertas = self.abiertas()
        lineas = [f"📋 <b>Resumen del día</b>",
                  f"Patrimonio {num(e)} USDT ({'+' if e >= capital else '−'}{num(abs(100 * (e / capital - 1)), 2)} % desde el inicio)",
                  f"Mercado: Bitcoin {'sobre' if btc['alcista'] else 'bajo'} su media de {self.f.filtro_dias} días "
                  f"({num(100 * btc['distancia'], 1)} %) → {'solo largos' if btc['alcista'] else 'solo cortos'}"]
        if abiertas:
            lineas.append("Abiertas: " + ", ".join(f"{o['sym'][:-4]} {'↑' if o['lado'] > 0 else '↓'} {'+' if self.no_realizado(o) >= 0 else '−'}{num(abs(self.no_realizado(o)))}" for o in abiertas))
        else:
            lineas.append("Sin posiciones abiertas.")
        self.aviso.enviar("\n".join(lineas))

    def freno_total(self) -> None:
        e = self.patrimonio()
        pico = max(self.db.get("pico") or e, e)
        self.db.set("pico", pico)
        if e <= pico * (1 - self.f.freno_total):
            for op in self.abiertas():
                self.cerrar(op, f"Freno del {int(100 * self.f.freno_total)} %")
            self.db.set("pausa", {"t": self.ahora, "eq": e, "pico": pico})
            self.nota(f"⛔ Freno del {int(100 * self.f.freno_total)} %: el patrimonio cayó de {num(pico)} a {num(e)} USDT. Cerré todo y me detuve. "
                      "Para reanudar hay que pedirlo (se revisa antes qué pasó).", "error")

    # ------------------------------------------------------------------ estado para la pagina
    def estado(self) -> dict:
        capital, inicio = self.db.get("capital", self.f.capital), self.db.get("inicio", self.ahora)
        e = self.patrimonio()
        apal = self.f.apalancamiento
        abiertas = [{**{k: o[k] for k in ("sym", "lado", "t_in", "p_in", "cant", "stop", "atr", "motivo_in", "comision", "financiacion")},
                     "precio": self.marcas.get(o["sym"]), "pnl": self.no_realizado(o), "tasa": self.tasas.get(o["sym"]),
                     "liq": o["p_in"] * (1 - o["lado"] * (1 / apal - MANT))} for o in self.abiertas()]
        cerradas = [{**{k: o[k] for k in ("sym", "lado", "t_in", "p_in", "t_out", "p_out", "motivo_in", "motivo_out", "pnl", "comision", "financiacion")},
                     "pct": o["pnl"] / (o["cant"] * o["p_in"])} for o in self.db.cerradas(self.modo, inicio, 200)]
        gan = [o["pnl"] for o in cerradas if o["pnl"] > 0]
        per = [o["pnl"] for o in cerradas if o["pnl"] <= 0]
        # curva: cada punto de las ultimas 48 h; antes, uno por cada 4 horas
        crudo = self.db.curva(inicio)
        curva, ult = [], None
        for t, eq, _x, _n in crudo:
            if t >= self.ahora - 2 * DIA or ult is None or t - ult >= 4 * 3600_000:
                curva.append([t, round(eq, 4)])
                ult = t
        pico = self.db.get("pico", capital)
        manana = (self.ahora // DIA + 1) * DIA + 5 * 60_000
        return {
            "modo": self.modo, "inicio": inicio, "capital": capital, "patrimonio": e, "pico": pico, "caida": 1 - e / pico if pico else 0,
            "realizado": self.db.realizado(self.modo, inicio), "no_realizado": sum(o["pnl"] for o in abiertas),
            "bloqueo": self.bloqueo(), "pausa": self.db.get("pausa"), "proxima_decision": manana,
            "abiertas": abiertas, "cerradas": cerradas,
            "stats": {"n": len(cerradas), "ganadas": len(gan), "bruto_gan": sum(gan), "bruto_per": sum(per),
                      "pf": (sum(gan) / -sum(per)) if per and sum(per) < 0 else None,
                      "comisiones": sum(o["comision"] for o in cerradas), "financiacion": sum(o["financiacion"] for o in cerradas)},
            "curva": curva, "radar": self.db.get("radar"), "eventos": self.db.eventos(40),
            "telegram": self.aviso.activo,
            "reglas": {k: getattr(self.f, k) for k in ("apalancamiento", "riesgo", "stop_atr", "canal_entrada", "canal_salida", "filtro_dias",
                                                       "universo", "freno_diario", "freno_semanal", "freno_total", "max_posiciones")},
            "cuenta": self.cuenta.cuenta() if self.modo == "demo" else None,
        }


def armar(raiz=aj.RAIZ):
    cfg = aj.cargar()
    ll = aj.llaves()
    pub = Publico()
    if ll.get("FUT_API_KEY") and ll.get("FUT_API_SECRET"):
        cuenta = DemoCuenta(Demo(ll["FUT_API_KEY"], ll["FUT_API_SECRET"]))
    else:
        cuenta = Papel(pub, cfg.futuros.comision_papel, cfg.futuros.deslizamiento_papel)
    aviso = Aviso(ll.get("FUT_TG_TOKEN"), ll.get("FUT_TG_CHAT"), cuenta.modo)
    db = Almacen(raiz / "datos" / "futuros.db")
    return cfg, db, pub, cuenta, aviso


def main(argv: list[str]) -> int:
    import fcntl
    raiz = aj.RAIZ
    raiz.mkdir(parents=True, exist_ok=True)
    cerrojo = open(raiz / ".ciclo.lock", "w")
    try:
        fcntl.flock(cerrojo, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("Otro ciclo sigue corriendo")
        return 0
    cfg, db, pub, cuenta, aviso = armar(raiz)
    if "--reanudar" in argv:
        db.set("pausa", None)
        db.set("pico", None)
        db.evento("Reanudado por pedido del dueño.", "aviso")
        print("Reanudado")
        return 0
    if "--probar" in argv:
        print("Modo:", cuenta.modo, "· Telegram:", "sí" if aviso.activo else "no")
        if cuenta.modo == "demo":
            cuenta.preparar()
            c = cuenta.cuenta()
            print(f"Cuenta demo de futuros: billetera {c['billetera']:.2f} USDT, disponible {c['disponible']:.2f}")
        if aviso.activo:
            print("Telegram:", "enviado" if aviso.enviar("Prueba de conexión: los avisos de futuros llegan a este chat.") else "FALLÓ")
        return 0
    bot = BotFuturos(cfg, db, pub, cuenta, aviso)
    t0 = time.time()
    try:
        bot.correr()
    except Exception as e:  # noqa: BLE001 - el error se registra y se avisa (como mucho una vez por hora)
        traceback.print_exc()
        texto = f"⚠️ Error en el ciclo de futuros: {type(e).__name__}: {str(e)[:200]}"
        db.evento(texto, "error")
        if db.get("ultimo_aviso_error", 0) < bot.ahora - 3600_000:
            aviso.enviar(texto)
            db.set("ultimo_aviso_error", bot.ahora)
    # publicacion (aunque el ciclo haya fallado: la pagina muestra el error)
    estado = {"actualizado": ahora_ms(), "version": 1}
    try:
        estado["futuros"] = bot.estado()
    except Exception as e:  # noqa: BLE001
        estado["futuros"] = {"error": str(e)[:200]}
    try:
        estado["bot"] = bot_spot.resumen(cfg.publicar.bot_db)
    except Exception as e:  # noqa: BLE001
        estado["bot"] = {"error": str(e)[:200]}
    r = db.get("rendimientos")
    if not r or r.get("dia") != bot.hoy:
        try:
            r = {"dia": bot.hoy, "datos": rendimientos.resumen()}
            db.set("rendimientos", r)
        except Exception:  # noqa: BLE001
            pass
    estado["rendimientos"] = (r or {}).get("datos")
    fallo = publicar.publicar(limpiar(estado), raiz / "publicacion", cfg.publicar.repositorio, cfg.publicar.rama, cfg.publicar.llave)
    print(f"Ciclo {cuenta.modo} en {time.time() - t0:.1f} s · publicación: {fallo or 'OK'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
