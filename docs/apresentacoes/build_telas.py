#!/usr/bin/env python3
"""PDF 'Telas do app': uma tela por página, em formato vertical, no maior tamanho possível."""
import html
shots = [
 ('inicio',   'paper',  'Início',             ['Busca e endereço no topo', 'Categorias com objetos ilustrados', 'Mini sacola sempre à mão']),
 ('inicio-endereco', 'night', 'Endereço certo', ['Confere antes de continuar', 'Trocar ou seguir em um toque']),
 ('inicio-carregando', 'paper', 'Carregando', ['Esqueleto no formato da tela', 'Sem tela em branco, sem susto']),
 ('loja',     'purple', 'Loja',               ['Cupons logo na primeira tela', 'Destaques com preço e desconto', 'Abas por seção']),
 ('produto',  'paper',  'Produto',            ['Cor e tamanho com amostra', 'Botão só ativa com a escolha feita', 'Preço grande e claro']),
 ('sacola',   'night',  'Sacola',             ['Cada pedido de uma loja só', 'Entrega Webag ou retirada', 'Peça também e resumo de valores']),
 ('confirmado','purple','Pedido feito',        ['Chegada prevista em destaque', 'Aviso a cada etapa', 'Acompanhar com um toque']),
 ('acompanha','night',  'Acompanhamento',      ['Linha do tempo em 5 etapas', 'Código de entrega seguro', 'Ajuda e loja a um toque']),
 ('pedidos',  'paper',  'Pedidos',            ['Status de cada pedido', 'Pedir de novo em um toque', 'Ajuda no próprio cartão']),
 ('objetos',  'lime',   'Ilustrações próprias', ['12 objetos no mesmo estilo', 'Sombra sólida, 3 tons, sem contorno']),
]
def page(i, name, bg, title, caps):
    c = ''.join(f'<span>{html.escape(x)}</span>' for x in caps)
    return (f'<section class="pg {bg}"><div class="top"><div><div class="tag">App do cliente</div><h2>{html.escape(title)}</h2></div>'
            f'<div class="n">{i:02d}</div></div><div class="shot"><img src="img/v3-{name}.png" alt=""></div>'
            f'<div class="cap">{c}</div><div class="foot"><span>Webag</span><span>Protótipo com dados fictícios</span></div></section>')
cover = ('<section class="pg purple cover"><div class="logo"><img src="../design/logo/webag-logo-branca.svg" alt="Webag"></div>'
         '<h1>As telas do app.</h1><div class="row">'
         + ''.join(f'<div class="shot"><img src="img/v3-{n}.png" alt=""></div>' for n in ['inicio', 'loja', 'produto'])
         + '</div><div class="foot"><span>Direção visual v3</span><span>Protótipo com dados fictícios</span></div></section>')
body = cover + ''.join(page(i + 1, *s) for i, s in enumerate(shots))
open('telas.html', 'w').write(f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Telas do app Webag</title><link rel="stylesheet" href="telas.css"></head><body>{body}</body></html>')
print('ok', len(shots) + 1)
