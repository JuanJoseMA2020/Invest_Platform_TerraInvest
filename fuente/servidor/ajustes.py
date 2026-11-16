"""Ajustes del bot de futuros y del publicador. Los limites de riesgo se comprueban aqui y no se pueden aflojar."""
from __future__ import annotations

import os
from dataclasses import dataclass, fields
from pathlib import Path

import yaml

AQUI = Path(__file__).resolve().parent
RAIZ = Path(os.environ.get("PLATAFORMA_RAIZ", Path.home() / "plataforma"))   # en el servidor: ~/plataforma


@dataclass(frozen=True)
class Futuros:
    capital: float = 1000.0
    apalancamiento: int = 2
    riesgo: float = 0.0075
    stop_atr: float = 3.0
    peso_max: float = 0.15
    exposicion_max: float = 1.0
    max_posiciones: int = 10
    canal_entrada: int = 20
    canal_salida: int = 10
    filtro_dias: int = 100
    universo: int = 10
    ventana_volumen: int = 60
    historia_min: int = 120
    freno_diario: float = 0.03
    freno_semanal: float = 0.06
    freno_total: float = 0.30
    comision_papel: float = 0.0005
    deslizamiento_papel: float = 0.0005

    def __post_init__(self):
        # Limites que no se aflojan nunca (los mismos del bot de trading)
        assert 0 < self.riesgo <= 0.01, "riesgo por operacion: maximo 1 %"
        assert 0 < self.freno_diario <= 0.03 and 0 < self.freno_semanal <= 0.06 and 0 < self.freno_total <= 0.30, "frenos"
        assert 1 <= self.apalancamiento <= 3, "apalancamiento: maximo 3x"
        assert self.stop_atr > 0 and self.exposicion_max <= 1.0, "sin stop o cuenta apalancada"


@dataclass(frozen=True)
class Publicar:
    repositorio: str = ""
    rama: str = "estado"
    llave: str = "~/.ssh/terra_estado"
    bot_db: str = "~/bot/data/bot.db"


@dataclass(frozen=True)
class Ajustes:
    futuros: Futuros
    publicar: Publicar


def _hacer(cls, d: dict):
    nombres = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in (d or {}).items() if k in nombres})


def cargar(ruta: Path | None = None) -> Ajustes:
    d = yaml.safe_load((ruta or AQUI / "ajustes.yaml").read_text(encoding="utf-8")) or {}
    return Ajustes(_hacer(Futuros, d.get("futuros")), _hacer(Publicar, d.get("publicar")))


def llaves(ruta: Path | None = None) -> dict[str, str]:
    """Lee ~/plataforma/llaves.env (lo crea el dueño con «Conectar futuros»). Nunca se imprime ni se publica."""
    ruta = ruta or RAIZ / "llaves.env"
    out = {}
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            if "=" in linea and not linea.lstrip().startswith("#"):
                k, v = linea.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out
