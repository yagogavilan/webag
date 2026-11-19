#!/usr/bin/env python3
"""Gera cliente-v3.html e lojista-v3.html (apresentações na direção visual v3). Depois rode o render de PDF."""
import html

LOGO_W = '<div class="logo"><img src="../design/logo/webag-logo-branca.svg" alt="Webag"></div>'
LOGO_C = '<div class="logo"><img src="../design/logo/webag-logo.svg" alt="Webag"></div>'


def dev(name, h=520, style=''):
    return f'<div class="dev" style="height:{h}px;{style}"><img src="img/v3-{name}.png" alt=""></div>'


def win(name, w=640, style=''):
    return f'<div class="win" style="width:{w}px;{style}"><img src="img/{name}.png" alt=""></div>'


def pts(items):
    return '<ul class="pts">' + ''.join(f'<li>{html.escape(i)}</li>' for i in items) + '</ul>'


def kick(t):
    return f'<div class="kicker">{html.escape(t)}</div>'


def slide(cls, body, foot=None, cut=False):
    f = f'<div class="foot"><span>{foot[0]}</span><span>{foot[1]}</span></div>' if foot else ''
    return f'<section class="slide {cls}">{body}{f}</section>'


def card(n, t, p):
    return f'<div class="card"><div class="n">{n}</div><h3>{html.escape(t)}</h3><p>{html.escape(p)}</p></div>'


PAGE = '''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{t}</title>
<link rel="stylesheet" href="deck3.css"></head><body>
{s}
</body></html>'''

DISC_C = 'O app está em desenvolvimento. Datas, taxas e prazos são valores de exemplo, sujeitos a confirmação.'

# ===================== CLIENTE =====================
c = []
c.append(slide('purple', f'''
  {LOGO_W}
  <div class="row" style="margin-top:8px">
    <div class="txt">
      {kick('O app de compras com entrega')}
      <h1>Escolha no app. Receba em casa.</h1>
      <p class="lead">Moda, beleza, casa e mais, de várias lojas. Pague com PIX ou cartão e acompanhe até a sua porta.</p>
    </div>
    <div class="devs" style="position:relative;width:520px;height:560px">
      <div style="position:absolute;left:0;top:70px;transform:rotate(-6deg)">{dev('loja', 430)}</div>
      <div style="position:absolute;left:150px;top:0;z-index:2">{dev('inicio', 500)}</div>
      <div style="position:absolute;right:-30px;top:80px;transform:rotate(6deg)">{dev('produto', 430)}</div>
    </div>
  </div>
  <div class="sticker" style="left:600px;bottom:60px">Entrega pelo Webag</div>
  <div class="foot"><span>Apresentação para clientes</span><span>{DISC_C}</span></div>'''))

c.append(slide('paper', f'''
  <div class="row">
    <div class="txt">
      {kick('O que tem no app')}
      <div class="catbig">Moda <span>/</span> Calçados <span>/</span> Beleza <span>/</span> Casa <span>/</span> Eletrônicos <span>/</span> Pet <span>/</span> <mark>Papelaria</mark></div>
      <p class="lead">Várias lojas em um só lugar. Você vê só as que entregam no seu endereço.</p>
    </div>
    {dev('inicio', 560)}
  </div>''', ('Webag', '2')))

c.append(slide('night', f'''
  {kick('Comece rápido')}
  <h2>Compre sem cadastro. Crie a conta só na hora de pagar.</h2>
  <div class="cards">
    {card('1', 'Explore à vontade', 'Veja lojas, produtos, preços e avaliações sem criar conta.')}
    {card('2', 'Pague do seu jeito', 'PIX com QR code e copia e cola, ou cartão. Seus dados de cartão não ficam com a gente.')}
    {card('3', 'Receba ou retire', 'Entrega pelo Webag até a sua porta, ou retire na loja sem custo.')}
  </div>''', ('Webag', '3')))

c.append(slide('paper', f'''
  <div class="row">
    <div class="devs">{dev('loja', 540)}{dev('produto', 540)}</div>
    <div class="txt">
      {kick('Loja e produto')}
      <h2>Veja tudo antes de decidir.</h2>
      {pts(['Cupons e destaques logo na primeira tela', 'Tamanho e cor com amostra e estoque na hora', 'Tabela de medidas e avaliações de quem já comprou', 'Preço e desconto claros, sem pegadinha'])}
    </div>
  </div>''', ('Webag', '4')))

c.append(slide('night', f'''
  <div class="row">
    <div class="txt">
      {kick('Sacola')}
      <h2>Sem surpresa na hora de pagar.</h2>
      {pts(['Cada pedido é de uma loja só, para a entrega ser rápida', 'Escolha entrega pelo Webag ou retirada na loja', 'Cupom, entrega e total sempre à vista', 'Sugestões "Peça também" para completar a compra'])}
    </div>
    {dev('sacola', 560)}
  </div>''', ('Webag', '5')))

c.append(slide('lime', f'''
  <div class="row">
    <div class="txt">
      {kick('Pagamento')}
      <h2>PIX em segundos, confirmação automática.</h2>
      {pts(['QR code ou copia e cola', 'Aprovação na hora, sem enviar comprovante', 'Cartão de crédito também aceito'])}
    </div>
    <div class="timer" style="color:#1C1721">14:59</div>
  </div>''', ('Webag', '6')))

c.append(slide('purple', f'''
  <div class="row">
    <div class="devs">{dev('confirmado', 540)}{dev('acompanha', 540, 'margin-top:40px')}</div>
    <div class="txt">
      {kick('Depois do pedido')}
      <h2>Pagou? Agora é com a gente.</h2>
      {pts(['Linha do tempo: aceito, em separação, a caminho, entregue', 'Previsão de chegada e aviso no celular', 'Código de entrega para receber com segurança'])}
    </div>
  </div>''', ('Webag', '7')))

c.append(slide('paper', f'''
  <div class="row">
    <div class="txt">
      {kick('Seus pedidos')}
      <h2>Tudo no histórico. Pedir de novo é um toque.</h2>
      {pts(['Status de cada pedido e acompanhamento em tempo real', 'Pedir de novo e falar com a Ajuda direto no cartão', 'Avaliação da loja e do produto depois da entrega'])}
    </div>
    {dev('pedidos', 560)}
  </div>''', ('Webag', '8')))

strip = ''.join(dev(n, 420) for n in ['inicio', 'loja', 'produto', 'sacola', 'confirmado', 'acompanha'])
c.append(slide('night', f'''
  {kick('A jornada completa')}
  <h2>Do primeiro toque à porta de casa.</h2>
  <div class="strip">{strip}</div>''', ('Webag', '9')))

c.append(slide('paper', f'''
  {kick('Compre com tranquilidade')}
  <h2>Segurança, entrega e atendimento de verdade.</h2>
  <div class="cards">
    {card('+', 'Pagamento protegido', 'Cartão processado pelo Mercado Pago. Os dados do seu cartão não ficam com o Webag.')}
    {card('+', 'Lojas verificadas', 'Toda loja passa por análise de documentos antes de aparecer no app.')}
    {card('+', 'Entrega acompanhada', 'Motoboy do Webag, com o status do pedido sempre à mão.')}
    {card('+', 'Seus direitos', 'Compra à distância segue o Código de Defesa do Consumidor, e o app facilita pedir uma troca se precisar.')}
    {card('+', 'Privacidade (LGPD)', 'Você exporta seus dados ou exclui a conta dentro do app, quando quiser.')}
    {card('+', 'Fale com a loja', 'Tire dúvidas pelo WhatsApp da loja, direto do pedido.')}
  </div>''', ('Webag', '10')))

c.append(slide('purple', f'''
  {LOGO_W}
  <div class="row">
    <div class="txt">
      {kick('Em breve')}
      <h1>Baixe o Webag. Escolha no app. Receba em casa.</h1>
      <p class="lead">Na Google Play e na App Store.</p>
      <p class="lead" style="font-weight:800;color:#fff">[link para baixar]   [Instagram]   [WhatsApp]</p>
    </div>
    <div class="devs">{dev('confirmado', 520)}{dev('inicio', 520, 'margin-top:50px')}</div>
  </div>
  <div class="foot"><span>{DISC_C}</span><span>11</span></div>'''))

open('cliente-v3.html', 'w').write(PAGE.format(t='Webag para você', s='\n'.join(c)))

# ===================== LOJISTA =====================
l = []
l.append(slide('purple', f'''
  {LOGO_W}
  <div class="row">
    <div class="txt">
      {kick('Para lojistas')}
      <h1>Venda para mais clientes. A entrega é com o Webag.</h1>
      <p class="lead">O Webag traz clientes, recebe o pagamento e cuida da entrega. Você só prepara o pedido.</p>
    </div>
    <div style="position:relative;width:560px;height:520px">
      <div style="position:absolute;left:0;top:50px">{win('l-pedidos', 520)}</div>
      <div style="position:absolute;right:-10px;top:150px;z-index:2">{dev('loja', 400)}</div>
    </div>
  </div>
  <div class="foot"><span>Apresentação para lojistas</span><span>Comissão, prazos e taxas são valores de exemplo, sujeitos a confirmação.</span></div>'''))

l.append(slide('night', f'''
  {kick('O desafio')}
  <h2>Quem compra de você hoje é quem passa na porta.</h2>
  <div class="cards">
    {card('!', 'Alcance curto', 'Sua vitrine é a porta da loja. Quem está longe nem sabe que você existe.')}
    {card('!', 'Sem entrega', 'Moto e motoboy custam caro e tomam o tempo de quem atende no balcão.')}
    {card('!', 'Vender online é complicado', 'Site, pagamento, estoque e atendimento: muita coisa para quem já tem uma loja para tocar.')}
  </div>
  <p class="lead" style="color:#D6FF4A;font-weight:800;font-size:30px;margin-top:30px">O Webag junta tudo isso em um só lugar, simples de usar.</p>''', ('Webag', '2')))

steps = [('1', 'Cadastre a loja', 'CPF ou CNPJ (MEI também), dados da loja, documentos e conta para receber.'),
         ('2', 'Aprovação rápida', 'Nossa equipe confere os documentos e libera sua loja no app.'),
         ('3', 'Publique seus produtos', 'Fotos, tamanhos, cores e estoque. Pode importar por planilha.'),
         ('4', 'Receba pedidos', 'Um alerta toca no painel. Você aceita, separa e marca como pronto.'),
         ('5', 'Nós entregamos', 'O motoboy do Webag busca na sua loja e leva até o cliente.'),
         ('6', 'Você recebe', 'O valor da venda, já sem a comissão, cai na sua conta.')]
l.append(slide('paper', f'''
  {kick('Como funciona')}
  <h2>Da inscrição à primeira venda em seis passos.</h2>
  <div class="steps">{''.join(card(a, b, t) for a, b, t in steps)}</div>''', ('Webag', '3')))

l.append(slide('paper', f'''
  <div class="row">
    <div class="devs">{dev('loja', 540)}{dev('produto', 540)}</div>
    <div class="txt">
      {kick('Sua loja no app')}
      <h2>Uma vitrine que vende.</h2>
      {pts(['Capa, logo, horário e avaliações da sua loja', 'Cupons e destaques na primeira tela', 'Vitrine por seções, com variações e estoque', 'Aberta ou fechada, o cliente sabe na hora'])}
    </div>
  </div>''', ('Webag', '4')))

l.append(slide('night', f'''
  {kick('Painel de pedidos')}
  <h2>Pedido novo? O painel avisa na hora.</h2>
  <div class="row" style="margin-top:6px">
    {win('l-pedidos', 700)}
    <div class="txt">{pts(['Alerta sonoro a cada pedido', 'Aceite ou recuse com motivo', 'Marque "pronto para coleta"', 'Comanda para imprimir', 'No celular e no balcão'])}</div>
  </div>''', ('Webag', '5')))

l.append(slide('paper', f'''
  {kick('Catálogo')}
  <h2>Cadastre produtos sem complicação.</h2>
  <div class="row" style="gap:36px;margin-top:6px">{win('l-catalogo', 560)}{win('l-produto-form', 560)}</div>''', ('Webag', '6')))

l.append(slide('lime', f'''
  <div class="row">
    <div class="txt">
      {kick('Quanto você recebe')}
      <h2>Sem mensalidade. Comissão só quando vende.</h2>
      <p class="lead" style="color:#1C1721">Um percentual de cada venda pelo app, combinado com cada loja. Cadastre o preço já considerando a comissão. Exemplo com 15%.</p>
    </div>
    <div class="calc">
      <div class="r"><span>Produto no app</span><b>R$ 100,00</b></div>
      <div class="r"><span>Comissão Webag (15%)</span><b>- R$ 15,00</b></div>
      <div class="r t"><span>Você recebe</span><b>R$ 85,00</b></div>
    </div>
  </div>''', ('Webag', '7')))

l.append(slide('paper', f'''
  <div class="row">
    <div class="txt">
      {kick('Entrega')}
      <h2>Você não precisa ter motoboy.</h2>
      <div class="steps" style="grid-template-columns:1fr;gap:14px;margin-top:22px">
        {card('1', 'Você marca "pronto"', 'Com o pedido embalado, um toque no painel avisa o Webag.')}
        {card('2', 'Nós buscamos e entregamos', 'Um motoboy do Webag vai até a sua loja e leva ao cliente.')}
      </div>
      <p class="lead" style="font-size:22px">A taxa de entrega é paga pelo cliente. Você não paga frete.</p>
    </div>
    {dev('acompanha', 560)}
  </div>''', ('Webag', '8')))

l.append(slide('night', f'''
  {kick('Seu negócio em números')}
  <h2>Acompanhe as vendas sem planilha.</h2>
  <div class="row" style="margin-top:6px">
    {win('l-inicio', 700)}
    <div class="txt">{pts(['Vendas do dia e da semana', 'Ticket médio e mais vendidos', 'Avaliação média da loja', 'Extrato e valores a receber'])}</div>
  </div>''', ('Webag', '9')))

l.append(slide('paper', f'''
  <div class="row">
    <div class="txt">
      {kick('Do outro lado da tela')}
      <h2>O cliente que vai comprar de você.</h2>
      <p class="lead">Encontra a sua loja, escolhe com calma, paga com PIX e acompanha a entrega.</p>
    </div>
    <div class="devs">{dev('inicio', 470)}{dev('sacola', 470, 'margin-top:36px')}{dev('confirmado', 470)}</div>
  </div>''', ('Webag', '10')))

l.append(slide('paper', f'''
  {kick('Confiança para você')}
  <h2>Pagamento garantido e atendimento organizado.</h2>
  <div class="cards">
    {card('+', 'Pagamento seguro', 'O cliente paga no app pelo Mercado Pago. Você recebe direto na sua conta.')}
    {card('+', 'Trocas organizadas', 'Pedidos de troca chegam pelo app, com motivo e fotos. Você só responde.')}
    {card('+', 'Suporte do Webag', 'Uma equipe para ajudar no cadastro, nos pedidos e no dia a dia.')}
    {card('+', 'Avaliações', 'Veja o que dizem da sua loja e responda direto pelo painel.')}
    {card('+', 'Cupons próprios', 'Crie promoções para atrair clientes novos e fazer os antigos voltarem.')}
    {card('+', 'Controle total', 'Pause produtos, feche a loja por um dia ou ajuste horários quando quiser.')}
  </div>''', ('Webag', '11')))

l.append(slide('purple', f'''
  {LOGO_W}
  <div class="row">
    <div class="txt">
      {kick('Vamos começar')}
      <h1>Cadastre sua loja e entre no lançamento.</h1>
      <p class="lead">Fale com a gente para garantir seu lugar entre as primeiras lojas.</p>
      <p class="lead" style="font-weight:800;color:#fff">[WhatsApp do Webag]   [site]   [e-mail]</p>
    </div>
    <div class="devs">{dev('loja', 520)}{dev('produto', 520, 'margin-top:50px')}</div>
  </div>
  <div class="foot"><span>O app está em desenvolvimento. Comissão, prazos e taxas são valores de exemplo, sujeitos a confirmação.</span><span>12</span></div>'''))

open('lojista-v3.html', 'w').write(PAGE.format(t='Webag para lojistas', s='\n'.join(l)))
print('ok', len(c), len(l))
