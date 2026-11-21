"""Mensajes de Telegram del bot de futuros · mismo diseño "tarjeta" que el bot de trading (bot/messages.py):

  🔴 <b>Corto · ETH</b>                     1. icono + que paso, en negrita
  Apuesto a que baja · entrada 1.684,52     2. el dato clave
  ──────────────                            3. separador
  • Stop: <b>2.015,84</b> (+19,6 %)         4. pocos datos, uno por renglon
  <blockquote expandable>…</blockquote>     5. el detalle, plegado (se abre al tocarlo)

Iconos: 🟢 largo · 🔴 corto · 🔒 cobro / ganancia asegurada · ✅ cierre con ganancia · 🔻 cierre con perdida
        📊 resumen · ⚠️ aviso · 🛑 freno · ⚙️ sistema
"""
from __future__ import annotations

from html import escape

LINEA = "──────────────"


def num(x: float, d: int = 2) -> str:
    """Numero en formato colombiano: 1.234,56 y signo menos tipografico."""
    if abs(x) < 0.5 * 10 ** -d:
        x = 0.0
    return f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".").replace("-", "−")


def con_signo(x: float, d: int = 2) -> str:
    return ("+" if x > 0 else "") + num(x, d)


def precio_txt(x: float) -> str:
    a = abs(x)
    return num(x, 2 if a >= 100 else 4 if a >= 1 else 6)


def pct(x: float, d: int = 1) -> str:
    return con_signo(100 * x, d) + " %"


def tarjeta(icono: str, titulo: str, clave: str = "", filas: list[tuple[str, str]] | None = None,
            detalle: list[str] | None = None, pie: str = "") -> str:
    """`titulo`, `clave` y los valores de `filas` pueden traer <b>; las etiquetas se escapan."""
    partes = [f"{icono} <b>{titulo}</b>"]
    if clave:
        partes.append(clave)
    if filas:
        partes.append(LINEA)
        partes += [f"• {escape(et)}: {val}" if et else f"• {val}" for et, val in filas]
    cuerpo = "\n".join(x for x in (detalle or []) if x)
    if cuerpo:
        partes.append(f"<blockquote expandable>{cuerpo}</blockquote>")
    if pie:
        partes.append(f"<i>{pie}</i>")
    return "\n".join(partes)
