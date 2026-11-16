"""Genera los iconos de la app (icono-192.png, icono-512.png): degradado verde-azul-violeta con la linea que sube."""
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent


def icono(n: int) -> Image.Image:
    im = Image.new("RGB", (n, n))
    px = im.load()
    a, b, c = (20, 184, 166), (59, 108, 246), (124, 58, 237)
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            p, q, u = (a, b, t * 2) if t < .5 else (b, c, (t - .5) * 2)
            px[x, y] = tuple(int(p[i] + (q[i] - p[i]) * u) for i in range(3))
    d = ImageDraw.Draw(im)
    s = n / 32
    pts = [(7 * s, 21 * s), (12.5 * s, 14.5 * s), (17 * s, 19 * s), (25 * s, 10 * s)]
    d.line(pts, fill="white", width=int(3.2 * s), joint="curve")
    for x, y in (pts[0], pts[-1]):
        r = 1.6 * s
        d.ellipse((x - r, y - r, x + r, y + r), fill="white")
    return im


for n in (192, 512):
    icono(n).save(AQUI / f"icono-{n}.png")
print("iconos listos")
