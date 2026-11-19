#!/usr/bin/env python3
"""Embute Fredoka e Figtree (base64, OFL) nos protótipos HTML, para abrirem sem internet.

Uso: python3 inject_fonts.py
Cada HTML deve ter, dentro do <head>, o par de marcadores:
    <!--WEBAG-FONTS--><!--/WEBAG-FONTS-->
O script substitui tudo entre os marcadores pelo CSS @font-face. Pode rodar quantas vezes quiser.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
FONTS = ROOT.parent / "design" / "fonts"
FACES = [
    ("Fredoka", 500, "fredoka-latin-500-normal.woff2"),
    ("Fredoka", 600, "fredoka-latin-600-normal.woff2"),
    ("Fredoka", 700, "fredoka-latin-700-normal.woff2"),
    ("Figtree", 400, "figtree-latin-400-normal.woff2"),
    ("Figtree", 600, "figtree-latin-600-normal.woff2"),
    ("Figtree", 700, "figtree-latin-700-normal.woff2"),
    ("Figtree", 800, "figtree-latin-800-normal.woff2"),
]


def css() -> str:
    out = []
    for fam, weight, fname in FACES:
        data = base64.b64encode((FONTS / fname).read_bytes()).decode()
        out.append(
            f"@font-face{{font-family:'{fam}';font-weight:{weight};font-style:normal;font-display:swap;"
            f"src:url(data:font/woff2;base64,{data}) format('woff2')}}"
        )
    return "<style>" + "".join(out) + "</style>"


def main() -> None:
    block = css()
    pat = re.compile(r"<!--WEBAG-FONTS-->.*?<!--/WEBAG-FONTS-->", re.S)
    for name in ("app-cliente.html", "paineis.html"):
        f = ROOT / name
        s = f.read_text(encoding="utf-8")
        if not pat.search(s):
            print(f"{name}: marcadores ausentes, nada feito")
            continue
        f.write_text(pat.sub(lambda _m: f"<!--WEBAG-FONTS-->{block}<!--/WEBAG-FONTS-->", s), encoding="utf-8")
        print(f"{name}: fontes embutidas")


if __name__ == "__main__":
    main()
