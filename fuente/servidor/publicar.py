"""Publica el estado de la plataforma (estado.json) en la rama «estado» del repositorio de GitHub. La pagina lo lee desde
raw.githubusercontent.com. La rama tiene siempre UN solo commit (se reemplaza), asi no crece.

Solo se publica informacion de cuentas de practica: nada de llaves, IPs ni datos personales."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


def _git(carpeta: Path, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(carpeta), *args], capture_output=True, text=True, timeout=90, env=env)


def publicar(estado: dict, carpeta: Path, repositorio: str, rama: str, llave: str) -> str | None:
    """Devuelve None si salio bien, o el motivo del fallo."""
    llave = os.path.expanduser(llave)
    if not repositorio or not Path(llave).exists():
        return "sin llave de publicación"
    env = {**os.environ, "GIT_SSH_COMMAND": f"ssh -i {llave} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes"}
    carpeta.mkdir(parents=True, exist_ok=True)
    if not (carpeta / ".git").exists():
        for a in (("init", "-q"), ("checkout", "-q", "-b", rama), ("remote", "add", "origin", repositorio),
                  ("config", "user.name", "TerraInvest servidor"), ("config", "user.email", "terra-servidor@users.noreply.github.com")):
            _git(carpeta, *a)
    texto = json.dumps(estado, ensure_ascii=False, separators=(",", ":"), allow_nan=False, default=str)
    (carpeta / "estado.json").write_text(texto, encoding="utf-8")
    _git(carpeta, "add", "-A")
    hay = _git(carpeta, "rev-parse", "--verify", "-q", "HEAD").returncode == 0
    r = _git(carpeta, "commit", "-q", *(["--amend"] if hay else []), "-m", "estado de la plataforma")
    if r.returncode != 0 and "nothing to commit" not in r.stdout + r.stderr:
        return "commit: " + (r.stderr or r.stdout)[-200:]
    r = _git(carpeta, "push", "-q", "-f", "origin", f"HEAD:{rama}", env=env)
    return None if r.returncode == 0 else "push: " + r.stderr[-200:]
