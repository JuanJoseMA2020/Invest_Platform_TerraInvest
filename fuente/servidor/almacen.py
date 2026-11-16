"""Base de datos propia del bot de futuros (SQLite en ~/plataforma/datos/futuros.db). Nada compartido con el bot de trading."""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

ESQUEMA = """
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS ops (
  id INTEGER PRIMARY KEY, modo TEXT, sym TEXT, lado INTEGER, estado TEXT, t_in INTEGER, p_in REAL, cant REAL, stop REAL,
  atr REAL, motivo_in TEXT, t_out INTEGER, p_out REAL, motivo_out TEXT, comision REAL DEFAULT 0, financiacion REAL DEFAULT 0,
  pnl REAL, t_fin INTEGER, ids TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS curva (t INTEGER, eq REAL, expo REAL, n INTEGER);
CREATE TABLE IF NOT EXISTS eventos (t INTEGER, nivel TEXT, texto TEXT);
"""


def ahora_ms() -> int:
    return int(time.time() * 1000)


class Almacen:
    def __init__(self, ruta: Path | str):
        if str(ruta) != ":memory:":
            Path(ruta).parent.mkdir(parents=True, exist_ok=True)
        self.c = sqlite3.connect(str(ruta))
        self.c.row_factory = sqlite3.Row
        self.c.executescript(ESQUEMA)

    # ---- valores sueltos
    def get(self, k: str, defecto=None):
        r = self.c.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
        return defecto if r is None else json.loads(r[0])

    def set(self, k: str, v) -> None:
        self.c.execute("INSERT OR REPLACE INTO kv VALUES (?,?)", (k, json.dumps(v)))
        self.c.commit()

    # ---- operaciones
    def abrir(self, **o) -> int:
        o["ids"] = json.dumps(o.get("ids") or {})
        cols = ",".join(o)
        cur = self.c.execute(f"INSERT INTO ops ({cols}, estado) VALUES ({','.join('?' * len(o))}, 'abierta')", tuple(o.values()))
        self.c.commit()
        return cur.lastrowid

    def actualizar(self, op_id: int, **o) -> None:
        if "ids" in o:
            o["ids"] = json.dumps(o["ids"])
        self.c.execute(f"UPDATE ops SET {','.join(f'{k}=?' for k in o)} WHERE id=?", (*o.values(), op_id))
        self.c.commit()

    def abiertas(self, modo: str) -> list[dict]:
        return [self._op(r) for r in self.c.execute("SELECT * FROM ops WHERE estado='abierta' AND modo=? ORDER BY id", (modo,))]

    def cerradas(self, modo: str, desde: int = 0, limite: int = 1000) -> list[dict]:
        q = "SELECT * FROM ops WHERE estado='cerrada' AND modo=? AND t_out>=? ORDER BY t_out DESC LIMIT ?"
        return [self._op(r) for r in self.c.execute(q, (modo, desde, limite))]

    def realizado(self, modo: str, desde: int) -> float:
        r = self.c.execute("SELECT COALESCE(SUM(pnl),0) FROM ops WHERE estado='cerrada' AND modo=? AND t_in>=?", (modo, desde)).fetchone()
        return float(r[0])

    @staticmethod
    def _op(r) -> dict:
        d = dict(r)
        d["ids"] = json.loads(d.get("ids") or "{}")
        return d

    # ---- curva y eventos
    def punto(self, eq: float, expo: float, n: int, t: int | None = None) -> None:
        self.c.execute("INSERT INTO curva VALUES (?,?,?,?)", (t or ahora_ms(), eq, expo, n))
        self.c.commit()

    def curva(self, desde: int = 0) -> list[tuple]:
        return [tuple(r) for r in self.c.execute("SELECT t, eq, expo, n FROM curva WHERE t>=? ORDER BY t", (desde,))]

    def borrar_curva(self) -> None:
        self.c.execute("DELETE FROM curva")
        self.c.commit()

    def evento(self, texto: str, nivel: str = "info") -> None:
        self.c.execute("INSERT INTO eventos VALUES (?,?,?)", (ahora_ms(), nivel, texto))
        self.c.execute("DELETE FROM eventos WHERE t < ?", (ahora_ms() - 120 * 86_400_000,))
        self.c.commit()

    def eventos(self, n: int = 40) -> list[dict]:
        return [dict(r) for r in self.c.execute("SELECT * FROM eventos ORDER BY t DESC LIMIT ?", (n,))]
