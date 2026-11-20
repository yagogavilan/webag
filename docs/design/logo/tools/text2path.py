#!/usr/bin/env python3
"""Converte texto em contorno SVG (path) a partir de uma fonte .woff2/.ttf/.otf.

Uso:
  text2path.py <fonte> "<texto>" --size 100 [--tracking 0] [--x 0] [--y 0] [--fill "#A02DB8"] [--id wordmark]

Saída (stdout): um <g> com um <path> por letra (assim o designer pode recolorir ou animar cada letra) e,
em stderr, a largura total em unidades do SVG. Requer fonttools e brotli:
  python3 -m venv .venv && .venv/bin/pip install fonttools brotli

Fontes livres (OFL) disponíveis via npm: `npm pack @fontsource/<nome>` e usar files/<nome>-latin-<peso>-normal.woff2.
"""
import argparse
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("font")
    ap.add_argument("text")
    ap.add_argument("--size", type=float, default=100.0, help="altura do em, em unidades do SVG")
    ap.add_argument("--tracking", type=float, default=0.0, help="espaço extra entre letras, em unidades do SVG")
    ap.add_argument("--x", type=float, default=0.0)
    ap.add_argument("--y", type=float, default=0.0, help="linha de base")
    ap.add_argument("--fill", default="currentColor")
    ap.add_argument("--id", default="wordmark")
    a = ap.parse_args()

    font = TTFont(a.font)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    scale = a.size / upm
    x = a.x
    parts = []
    for ch in a.text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        g = gs[name]
        pen = SVGPathPen(gs)
        # inverte o eixo Y (fonte: y para cima; SVG: y para baixo)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x, a.y))
        g.draw(tpen)
        d = pen.getCommands()
        if d:
            parts.append(f'<path d="{d}"/>')
        x += g.width * scale + a.tracking
    sys.stderr.write(f"largura total: {x - a.x:.2f}\n")
    print(f'<g id="{a.id}" fill="{a.fill}">' + "".join(parts) + "</g>")


if __name__ == "__main__":
    main()
