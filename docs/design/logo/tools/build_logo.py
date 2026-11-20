#!/usr/bin/env python3
"""Resolve marcadores de texto nos SVGs da logo, trocando-os por contornos vetoriais.

No SVG, escreva um comentário (uma linha) assim:
  <!--TEXT2PATH font="outfit-latin-700-normal.woff2" text="webag" size="96" tracking="-2" x="0" y="80" fill="#A02DB8" id="wordmark"-->
- font: nome do arquivo em docs/design/fonts/ ou docs/design/fonts/candidatas/
- size: altura do em em unidades do SVG; tracking: espaço extra entre letras; x,y: origem e linha de base
- fill pode ser "currentColor", um hex ou omitido

Uso:  .venv/bin/python build_logo.py <arquivo.svg> [mais.svg ...]
O arquivo é reescrito no lugar (o marcador some). Guarde a fonte editável em <nome>.src.svg e gere o final com --out:
  build_logo.py --out saida.svg fonte.src.svg
Requer fonttools e brotli (python3 -m venv .venv && .venv/bin/pip install fonttools brotli).
"""
import pathlib
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).resolve().parent
FONT_DIRS = [HERE.parent.parent / "fonts", HERE.parent.parent / "fonts" / "candidatas"]
PAT = re.compile(r"<!--TEXT2PATH\s+(.*?)-->", re.S)
ATTR = re.compile(r'(\w+)="([^"]*)"')


def find_font(name: str) -> pathlib.Path:
    for d in FONT_DIRS:
        p = d / name
        if p.exists():
            return p
    raise SystemExit(f"fonte não encontrada: {name}")


def render(attrs: dict) -> str:
    font = TTFont(find_font(attrs["font"]))
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    size = float(attrs.get("size", 100))
    scale = size / upm
    tracking = float(attrs.get("tracking", 0))
    x = float(attrs.get("x", 0))
    y = float(attrs.get("y", 0))
    parts = []
    for ch in attrs["text"]:
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        g = gs[gname]
        pen = SVGPathPen(gs)
        g.draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
        d = pen.getCommands()
        if d:
            parts.append(f'<path d="{d}"/>')
        x += g.width * scale + tracking
    fill = attrs.get("fill", "currentColor")
    gid = attrs.get("id", "wordmark")
    return f'<g id="{gid}" fill="{fill}">' + "".join(parts) + "</g>"


def process(text: str) -> str:
    return PAT.sub(lambda m: render(dict(ATTR.findall(m.group(1)))), text)


def main(argv: list) -> None:
    out = None
    if argv and argv[0] == "--out":
        out = pathlib.Path(argv[1])
        argv = argv[2:]
    if not argv:
        raise SystemExit(__doc__)
    for a in argv:
        src = pathlib.Path(a)
        res = process(src.read_text(encoding="utf-8"))
        dst = out or src
        dst.write_text(res, encoding="utf-8")
        print(f"{src} -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1:])
