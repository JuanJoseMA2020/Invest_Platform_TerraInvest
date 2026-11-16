"""Avisos de Telegram del bot de futuros. Usa SU PROPIO bot de Telegram (otro chat, separado del bot de trading).
Si no hay llaves de Telegram, no envia nada: los avisos quedan igual en la pagina."""
from __future__ import annotations

import httpx

CABECERA = {"demo": "🔷 <b>FUTUROS · cuenta demo</b>", "papel": "🔷 <b>FUTUROS · en papel</b>"}


class Aviso:
    def __init__(self, token: str | None, chat: str | None, modo: str):
        self.token, self.chat, self.modo = token, chat, modo
        self.enviados: list[str] = []

    @property
    def activo(self) -> bool:
        return bool(self.token and self.chat)

    def enviar(self, texto: str, cabecera: str | None = None) -> bool:
        self.enviados.append(texto)
        if not self.activo:
            return False
        try:
            r = httpx.post(f"https://api.telegram.org/bot{self.token}/sendMessage", timeout=20,
                           data={"chat_id": self.chat, "text": f"{cabecera}\n{texto}" if cabecera else (texto if cabecera == "" else f"{CABECERA.get(self.modo, '🔷 FUTUROS')}\n{texto}"), "parse_mode": "HTML",
                                 "disable_web_page_preview": "true"})
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    def enviar_archivo(self, ruta, texto: str) -> bool:
        if not self.activo:
            return False
        try:
            with open(ruta, "rb") as f:
                r = httpx.post(f"https://api.telegram.org/bot{self.token}/sendDocument", timeout=60,
                               data={"chat_id": self.chat, "caption": texto}, files={"document": (ruta.name, f)})
            return r.status_code == 200
        except (httpx.HTTPError, OSError):
            return False
