#!/usr/bin/env python3
"""Aplica a marca v3 (logo Sacola Veloz, roxo #C02EF0/#A21FBE, titulos em Outfit) nos protótipos HTML.

Uso: python3 refresh_brand.py paineis.html [app-cliente.html ...]
Idempotente: pode rodar de novo. Faz:
  1. cores da marca antigas -> novas (v2 -> v3);
  2. font-family 'Fredoka' -> 'Outfit' (titulos e numeros de marca);
  3. se existirem, troca os <symbol id="wb-logo-w"> e <symbol id="wb-sim-w"> (sprite inline da logo branca) pela logo v3 e
     ajusta o tamanho do SVG de logo no cabecalho (.lg-full / .lg-sym e a string JS LOGO).
Depois rode inject_fonts.py para embutir as fontes.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
LOGO_DIR = ROOT.parent / "design" / "logo"

COLORS = {  # v2 -> v3
    "#C44DD9": "#C02EF0",
    "#A02DB8": "#A21FBE",
    "#86249B": "#8618A3",
    "#6B1C7D": "#6A1580",
    "#4A1356": "#4A0F58",
}


def inner(svg_path: pathlib.Path, white: bool = False) -> str:
    s = svg_path.read_text(encoding="utf-8")
    s = re.sub(r"<\?xml.*?\?>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    m = re.search(r"<svg[^>]*>(.*)</svg>", s, flags=re.S)
    body = m.group(1)
    body = re.sub(r"<title.*?</title>", "", body, flags=re.S)
    if white:
        body = re.sub(r"#C02EF0", "#FFFFFF", body, flags=re.I)
    return re.sub(r"\s+", " ", body).strip()


def refresh(path: pathlib.Path) -> None:
    s = path.read_text(encoding="utf-8")
    for old, new in COLORS.items():
        s = re.sub(old, new, s, flags=re.I)
    s = s.replace("'Fredoka'", "'Outfit'").replace('"Fredoka"', '"Outfit"').replace("Fredoka", "Outfit")

    logo_w = inner(LOGO_DIR / "webag-logo-branca.svg")
    sim_w = inner(LOGO_DIR / "webag-simbolo.svg", white=True)
    sym_logo = f'<symbol id="wb-logo-w" viewBox="0 0 458 126">{logo_w}</symbol>'
    sym_sim = f'<symbol id="wb-sim-w" viewBox="0 0 160 104">{sim_w}</symbol>'
    n1 = len(re.findall(r'<symbol id="wb-logo-w"', s))
    if n1:
        s = re.sub(r'<symbol id="wb-logo-w".*?</symbol>', lambda _m: sym_logo, s, flags=re.S)
        s = re.sub(r'<symbol id="wb-sim-w".*?</symbol>', lambda _m: sym_sim, s, flags=re.S)
        s = re.sub(r'viewBox="0 0 (?:200 148|470 126|458 126)"([^>]*)><use href="#wb-logo-w" width="(?:200|470|458)" height="(?:148|126)"/>',
                   r'viewBox="0 0 458 126"\1><use href="#wb-logo-w" width="458" height="126"/>', s)
        s = re.sub(r'viewBox="0 0 (?:196 148|160 104)"([^>]*)><use href="#wb-sim-w" width="(?:196|160)" height="(?:148|104)"/>',
                   r'viewBox="0 0 160 104"\1><use href="#wb-sim-w" width="160" height="104"/>', s)
        s = s.replace(".logo .lg-full{width:84px;height:62px}", ".logo .lg-full{width:124px;height:33px}")
        s = s.replace(".logo .lg-sym{display:none;width:52px;height:39px}", ".logo .lg-sym{display:none;width:48px;height:31px}")
    # app do cliente: logo embutida em JS (WORDMARK, SYM_BARS, symInner, logoW)
    if "var WORDMARK=" in s:
        wm = re.search(r'<g id="wordmark"[^>]*>(.*?)</g>', (LOGO_DIR / "webag-logo-branca.svg").read_text(encoding="utf-8"), flags=re.S).group(1)
        sym = (LOGO_DIR / "webag-simbolo.svg").read_text(encoding="utf-8")
        mask = re.search(r"<defs>.*?</defs>", sym, flags=re.S).group(0)
        bars = re.search(r'<g id="barras"[^>]*>(.*?)</g>', sym, flags=re.S).group(1).strip()
        bag = re.search(r'<g id="sacola"[^>]*>(.*?)</g>', sym, flags=re.S).group(1).strip()
        mask = re.sub(r"\s+", " ", mask)
        bars = re.sub(r"\s+", " ", bars)
        bag = re.sub(r"\s+", " ", bag)
        s = re.sub(r"var WORDMARK='(?:[^'\\]|\\.)*';", lambda _m: "var WORDMARK='" + wm.strip() + "';", s)
        s = re.sub(r"var SYM_BARS='(?:[^'\\]|\\.)*';", lambda _m: "var SYM_BARS='" + bars + "';", s)
        sym_js = ("function symInner(c){return '" + mask + "<g fill=\"'+c+'\">'+SYM_BARS+'</g><g fill=\"'+c+'\" mask=\"url(#wb-olhais)\">" + bag.replace("#C02EF0", "'+c+'") + "</g>'}")
        s = re.sub(r"function symInner\(c\)\{.*?\}\n", lambda _m: sym_js + "\n", s, count=1, flags=re.S)
        s = re.sub(r"function logoW\(w\)\{return '<svg class=\"lgw\" width=\"'\+w\+'\" height=\"'\+Math\.round\(w\*126/\d+\)\+'\" viewBox=\"0 0 \d+ 126\"",
                   "function logoW(w){return '<svg class=\"lgw\" width=\"'+w+'\" height=\"'+Math.round(w*126/458)+'\" viewBox=\"0 0 458 126\"", s)
        print(f"{path.name}: logo embutida em JS atualizada (v4a)")
    path.write_text(s, encoding="utf-8")
    print(f"{path.name}: marca v3 aplicada (symbols de logo {'trocados' if n1 else 'nao encontrados'})")


if __name__ == "__main__":
    args = sys.argv[1:] or ["paineis.html"]
    for a in args:
        refresh(ROOT / a)
