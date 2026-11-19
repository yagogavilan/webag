#!/usr/bin/env python3
"""Gera cliente.html e lojista.html (apresentações v2). Rode: python3 build_decks.py, depois o render de PDF."""
import html

LOGO = '<div class="logo"><img src="../design/assets/webag-simbolo.svg" alt="">webag</div>'


def phone(name, h=520, extra=''):
    return f'<img class="ph" src="img/{name}.png" style="height:{h}px;{extra}" alt="">'


def win(name, w=700, extra=''):
    return f'<img class="win" src="img/{name}.png" style="width:{w}px;{extra}" alt="">'


def cap(title, text=''):
    return f'<div class="cap"><b>{html.escape(title)}</b><span>{html.escape(text)}</span></div>'


def col(img_html, title, text):
    return f'<div class="col">{img_html}{cap(title, text)}</div>'


def foot(n, label='Webag'):
    return f'<div class="foot"><span>{label}</span><span>{n}</span></div>'


def slide(cls, body, n=None, label='Webag'):
    f = foot(n, label) if n else ''
    return f'<section class="slide {cls}">{body}{f}</section>'


def checks(items):
    return '<ul class="check">' + ''.join(f'<li>{html.escape(i)}</li>' for i in items) + '</ul>'


def head(kicker, title, lead=''):
    l = f'<p class="lead">{html.escape(lead)}</p>' if lead else ''
    return f'<div class="kicker">{html.escape(kicker)}</div><h2>{html.escape(title)}</h2>{l}'


PAGE = '''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="deck.css"><link rel="stylesheet" href="deck2.css"></head><body>
{slides}
</body></html>'''

# ======================= CLIENTE =======================
c = []
c.append(slide('brand hero', f'''
  {LOGO}
  <div class="hero-grid">
    <div>
      <div class="kicker">Francisco Morato e região</div>
      <h1>As lojas do seu bairro, no seu celular.</h1>
      <p class="lead">Moda, calçados, beleza, eletrônicos, casa e mais. Compre de quem é daqui e receba em casa.</p>
      <div class="pills"><span>Entrega pelo Webag</span><span>PIX ou cartão</span><span>Retire na loja</span></div>
    </div>
    <div class="collage">
      {phone('c-loja', 470, 'transform:rotate(-6deg) translateY(30px)')}
      {phone('c-inicio', 540, 'z-index:2')}
      {phone('c-produto', 470, 'transform:rotate(6deg) translateY(30px)')}
    </div>
  </div>''', None))

c.append(slide('', f'''
  {head('O app', 'Tudo para comprar do comércio local, em um só lugar.')}
  <div class="feat-grid">
    <div class="feat"><div class="ic">1</div><h3>Lojas perto de você</h3><p>Só aparecem as lojas que entregam no seu endereço, com horário e tempo de entrega.</p></div>
    <div class="feat"><div class="ic">2</div><h3>Compre sem cadastro</h3><p>Explore lojas e produtos à vontade. Você só cria a conta na hora de comprar.</p></div>
    <div class="feat"><div class="ic">3</div><h3>PIX ou cartão</h3><p>Pague como preferir, com segurança. O Webag não guarda os dados do seu cartão.</p></div>
    <div class="feat"><div class="ic">4</div><h3>Entrega pelo Webag</h3><p>Nosso motoboy busca na loja e leva até você. Ou retire na loja, sem custo.</p></div>
    <div class="feat"><div class="ic">5</div><h3>Acompanhe em tempo real</h3><p>Do pedido aceito até a entrega, com aviso no celular a cada etapa.</p></div>
    <div class="feat"><div class="ic">6</div><h3>Seus dados são seus</h3><p>Exporte ou exclua sua conta dentro do app, quando quiser.</p></div>
  </div>''', 2))

c.append(slide('tint', f'''
  {head('Passo 1', 'Escolha onde você quer receber.', 'Use sua localização ou digite o CEP. O app mostra só as lojas que entregam no seu endereço.')}
  <div class="phones-row">
    {col(phone('c-entrada', 410), 'Comece rápido', 'Localização do aparelho ou CEP')}
    {col(phone('c-cep', 410), 'CEP com autocompletar', 'Salve casa, trabalho e outros endereços')}
  </div>''', 3))

c.append(slide('', f'''
  {head('Passo 2', 'Descubra lojas e produtos perto de você.')}
  <div class="phones-row three">
    {col(phone('c-inicio', 420), 'Início', 'Ofertas, categorias e lojas perto de você')}
    {col(phone('c-busca', 420), 'Busca com filtros', 'Preço, distância, entrega grátis e avaliação')}
    {col(phone('c-loja', 420), 'Página da loja', 'Horário, entrega, retirada e vitrine por seção')}
  </div>''', 4))

c.append(slide('tint', f'''
  <div class="split">
    <div class="split-txt">
      {head('Passo 3', 'Veja o produto antes de decidir.')}
      {checks(['Várias fotos e a cor escolhida em destaque', 'Tamanhos com estoque na hora, e tabela de medidas', 'Avaliações de quem já comprou, com "como vestiu"', 'Preço e promoção sem pegadinha'])}
    </div>
    <div class="split-img">{phone('c-produto', 520)}{phone('c-produto2', 520)}</div>
  </div>''', 5))

c.append(slide('', f'''
  <div class="split rev">
    <div class="split-img">{phone('c-sacola', 520)}{phone('c-checkout', 520)}</div>
    <div class="split-txt">
      {head('Passo 4', 'Sacola e pagamento, sem surpresa.')}
      {checks(['Cada pedido é de uma loja só, para a entrega ser rápida', 'Cupom de desconto e frete grátis acima de um valor', 'Entrega pelo Webag ou retirada na loja', 'Total claro antes de pagar, com a taxa de entrega à vista'])}
    </div>
  </div>''', 6))

c.append(slide('brand', f'''
  <div class="split">
    <div class="split-txt">
      <div class="kicker">Passo 5</div><h2>Pague com PIX em segundos.</h2>
      <p class="lead">Copie o código ou leia o QR code no app do seu banco. A confirmação é automática.</p>
      {checks(['QR code e copia e cola', 'Contagem regressiva de 15 minutos', 'Cartão de crédito também aceito'])}
    </div>
    <div class="split-img">{phone('c-pix', 540)}</div>
  </div>''', 7))

c.append(slide('', f'''
  <div class="split rev">
    <div class="split-img">{phone('c-acompanha', 540)}{phone('c-pedidos', 540)}</div>
    <div class="split-txt">
      {head('Passo 6', 'Acompanhe até a porta de casa.')}
      {checks(['Pedido recebido, aceito, em separação, a caminho e entregue', 'Previsão de chegada e aviso no celular', 'Fale com a loja pelo WhatsApp', 'Histórico de todos os seus pedidos'])}
    </div>
  </div>''', 8))

c.append(slide('tint', f'''
  <div class="split">
    <div class="split-txt">
      {head('Sua conta', 'Tudo em um lugar, e sob seu controle.')}
      {checks(['Endereços, favoritos e cupons', 'Notificações só do que importa', 'Exporte seus dados quando quiser', 'Exclua sua conta dentro do app'])}
    </div>
    <div class="split-img">{phone('c-conta', 520)}</div>
  </div>''', 9))

strip = ''.join(f'<div class="mini">{phone(n, 300)}</div>' for n in ['c-entrada', 'c-inicio', 'c-busca', 'c-loja', 'c-produto', 'c-sacola', 'c-pix', 'c-acompanha'])
c.append(slide('dark', f'''
  <div class="kicker" style="color:#9FD0D1">A jornada completa</div>
  <h2 style="color:#fff">Do primeiro toque à porta de casa.</h2>
  <div class="strip">{strip}</div>
  <p class="lead" style="color:#CFC9C0;margin-top:18px">Em média, uma compra leva menos de dois minutos.</p>''', 10))

c.append(slide('', f'''
  {head('Compre com tranquilidade', 'Segurança, entrega e atendimento de verdade.')}
  <div class="feat-grid">
    <div class="feat"><div class="ic">+</div><h3>Pagamento protegido</h3><p>Cartão processado pelo Mercado Pago. Seus dados de cartão não ficam com a gente.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Lojas verificadas</h3><p>Toda loja passa por análise de documentos antes de aparecer no app.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Entrega acompanhada</h3><p>Motoboy do Webag, com o status do pedido sempre à mão.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Direitos garantidos</h3><p>Compra à distância segue o Código de Defesa do Consumidor, e o app facilita pedir uma troca se precisar.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Privacidade (LGPD)</h3><p>Você controla seus dados e pode excluir a conta a qualquer momento.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Comércio local</h3><p>Cada compra fortalece as lojas e as famílias da sua região.</p></div>
  </div>''', 11))

c.append(slide('brand hero', f'''
  {LOGO}
  <div class="hero-grid">
    <div>
      <div class="kicker">Em breve</div>
      <h1>Baixe o Webag e compre de quem é daqui.</h1>
      <p class="lead">Na Google Play e na App Store.</p>
      <p class="lead" style="font-weight:700;margin-top:26px">[link para baixar]   [Instagram]   [WhatsApp]</p>
    </div>
    <div class="collage">
      {phone('c-pix', 470, 'transform:rotate(-6deg) translateY(30px)')}
      {phone('c-acompanha', 540, 'z-index:2')}
      {phone('c-sacola', 470, 'transform:rotate(6deg) translateY(30px)')}
    </div>
  </div>
  <div class="foot"><span>O app está em desenvolvimento. Datas, taxas e prazos são valores de exemplo, sujeitos a confirmação.</span><span>12</span></div>''', None))

open('cliente.html', 'w').write(PAGE.format(title='Webag para você', slides='\n'.join(c)))

# ======================= LOJISTA =======================
l = []
l.append(slide('brand hero', f'''
  {LOGO}
  <div class="hero-grid wide">
    <div>
      <div class="kicker">Para lojistas de Francisco Morato e região</div>
      <h1>Venda para a região inteira, não só para a sua rua.</h1>
      <p class="lead">O Webag traz clientes para a sua loja, recebe o pagamento e cuida da entrega. Você só prepara o pedido.</p>
    </div>
    <div class="collage2">
      {win('l-pedidos', 640, 'transform:translateX(30px)')}
      {phone('c-loja', 440, 'position:absolute;right:-10px;bottom:-60px;z-index:3')}
    </div>
  </div>''', None))

l.append(slide('', f'''
  {head('O desafio', 'Quem compra de você hoje é quem passa na porta.')}
  <div class="feat-grid three">
    <div class="feat"><div class="ic">!</div><h3>Alcance curto</h3><p>Sua vitrine é a sua rua. O cliente do bairro ao lado nem sabe que você existe.</p></div>
    <div class="feat"><div class="ic">!</div><h3>Sem entrega</h3><p>Moto e motoboy custam caro e tomam o tempo de quem atende no balcão.</p></div>
    <div class="feat"><div class="ic">!</div><h3>Vender online é complicado</h3><p>Site, pagamento, estoque e atendimento: muita coisa para quem já tem uma loja para tocar.</p></div>
  </div>
  <h3 class="bigline">O Webag junta tudo isso em um só lugar, simples de usar.</h3>''', 2))

steps = [('1', 'Cadastre a loja', 'CPF ou CNPJ (MEI também), dados da loja, documentos e conta para receber.'),
         ('2', 'Aprovação rápida', 'Nossa equipe confere os documentos e libera sua loja no app.'),
         ('3', 'Publique seus produtos', 'Fotos, tamanhos, cores e estoque. Pode importar por planilha.'),
         ('4', 'Receba pedidos', 'Um alerta toca no painel. Você aceita, separa e marca como pronto.'),
         ('5', 'Nós entregamos', 'O motoboy do Webag busca na sua loja e leva até o cliente.'),
         ('6', 'Você recebe', 'O valor da venda, já sem a comissão, cai na sua conta.')]
l.append(slide('tint', f'''
  {head('Como funciona', 'Da inscrição à primeira venda em seis passos.')}
  <div class="timeline">{''.join(f'<div class="tl"><div class="n">{a}</div><h3>{b}</h3><p>{t}</p></div>' for a, b, t in steps)}</div>''', 3))

l.append(slide('', f'''
  <div class="split">
    <div class="split-txt">
      {head('Sua loja no app', 'Uma vitrine bonita, no celular de quem mora perto.')}
      {checks(['Capa, logo, horário e avaliações da sua loja', 'Vitrine organizada por seções', 'Aparece para quem está na sua região', 'Aberta ou fechada, o cliente sabe na hora'])}
    </div>
    <div class="split-img">{phone('c-loja', 520)}{phone('c-produto', 520)}</div>
  </div>''', 4))

l.append(slide('tint', f'''
  {head('Painel de pedidos', 'Pedido novo? O painel avisa na hora.')}
  <div class="split wide-split">
    <div class="split-img">{win('l-pedidos', 720)}</div>
    <div class="split-txt narrow">
      {checks(['Alerta sonoro a cada pedido', 'Aceite ou recuse com motivo', 'Marque "pronto para coleta"', 'Comanda para imprimir', 'Funciona no celular e no balcão'])}
    </div>
  </div>''', 5))

l.append(slide('', f'''
  {head('Catálogo', 'Cadastre produtos sem complicação.')}
  <div class="duo">
    <div class="duo-c">{win('l-catalogo', 560)}{cap('Lista do catálogo', 'Pause produtos, altere preços e estoque em massa')}</div>
    <div class="duo-c">{win('l-produto-form', 560)}{cap('Novo produto', 'Fotos, variações, estoque por tamanho e promoção. Importe por planilha.')}</div>
  </div>''', 6))

l.append(slide('brand', f'''
  <div class="split">
    <div class="split-txt">
      <div class="kicker">Quanto você recebe</div>
      <h2>Sem mensalidade. Uma comissão só quando vende.</h2>
      <p class="lead" style="font-size:21px">Um percentual de cada venda pelo app, combinado com cada loja. Cadastre o preço já considerando a comissão.</p>
      <div class="calc dark-calc">
        <div class="cr"><span>Produto no app</span><b>R$ 100,00</b></div>
        <div class="cr"><span>Comissão Webag (15%)</span><b>- R$ 15,00</b></div>
        <div class="cr res"><span>Você recebe</span><b>R$ 85,00</b></div>
      </div>
      <p class="note" style="color:#CBE6E6">Exemplo com 15%, combinado no cadastro. O painel mostra o valor estimado antes de publicar.</p>
    </div>
    <div class="split-img">{win('l-financeiro', 560, 'border-color:#fff')}</div>
  </div>''', 7))

l.append(slide('', f'''
  {head('Entrega', 'Você não precisa ter motoboy.')}
  <div class="trio">
    <div class="tcard"><div class="n">1</div><h3>Você marca "pronto"</h3><p>Com o pedido embalado, um toque no painel avisa o Webag.</p></div>
    <div class="tarrow">&rarr;</div>
    <div class="tcard"><div class="n">2</div><h3>Nós buscamos</h3><p>Um motoboy do Webag vai até a sua loja e leva ao cliente.</p></div>
    <div class="tarrow">&rarr;</div>
    <div class="tcard"><div class="n">3</div><h3>Cliente acompanha</h3><p>Ele vê o pedido a caminho no app. Você não precisa fazer nada.</p></div>
  </div>
  <div class="split" style="margin-top:26px;align-items:center">
    <div class="split-txt"><p class="lead" style="margin-top:0">A taxa de entrega é paga pelo cliente. Você não paga frete e vende para bairros que antes não alcançava.</p></div>
    <div class="split-img">{phone('c-acompanha', 250)}</div>
  </div>''', 8))

l.append(slide('tint', f'''
  {head('Seu negócio em números', 'Acompanhe as vendas sem planilha.')}
  <div class="split wide-split">
    <div class="split-img">{win('l-inicio', 720)}</div>
    <div class="split-txt narrow">
      {checks(['Vendas do dia e da semana', 'Ticket médio e mais vendidos', 'Avaliação média da loja', 'Extrato e valores a receber'])}
    </div>
  </div>''', 9))

l.append(slide('', f'''
  {head('Do seu jeito', 'Configure a loja e a equipe sem ajuda.')}
  <div class="split wide-split">
    <div class="split-img">{win('l-config', 640)}</div>
    <div class="split-txt narrow">
      {checks(['Horários, feriados e pausa temporária', 'Retirada na loja e WhatsApp', 'Funcionários com permissões diferentes', 'Cupons próprios e resposta a avaliações'])}
    </div>
  </div>''', 10))

l.append(slide('tint', f'''
  {head('Do outro lado da tela', 'O cliente que vai comprar de você.')}
  <div class="phones-row three">
    {col(phone('c-busca', 410), 'Encontra sua loja', 'Busca por produto, categoria e distância')}
    {col(phone('c-checkout', 410), 'Paga com facilidade', 'PIX ou cartão, com total claro')}
    {col(phone('c-pix', 410), 'Confirma na hora', 'O pagamento é automático')}
  </div>''', 11))

l.append(slide('', f'''
  {head('Confiança para você', 'Pagamento garantido e atendimento organizado.')}
  <div class="feat-grid three">
    <div class="feat"><div class="ic">+</div><h3>Pagamento seguro</h3><p>O cliente paga no app pelo Mercado Pago. Você recebe direto na sua conta.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Trocas organizadas</h3><p>Pedidos de troca chegam pelo app, com motivo e fotos. Você só responde.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Suporte do Webag</h3><p>Uma equipe local para ajudar no cadastro, nos pedidos e no dia a dia.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Avaliações dos clientes</h3><p>Você vê o que dizem da sua loja e responde direto pelo painel.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Cupons próprios</h3><p>Crie promoções para atrair clientes novos e fazer os antigos voltarem.</p></div>
    <div class="feat"><div class="ic">+</div><h3>Controle total</h3><p>Pause produtos, feche a loja por um dia ou ajuste horários quando quiser.</p></div>
  </div>''', 12))

l.append(slide('brand hero', f'''
  {LOGO}
  <div class="hero-grid wide">
    <div>
      <div class="kicker">Vamos começar</div>
      <h1>Cadastre sua loja e entre no lançamento.</h1>
      <p class="lead">Fale com a gente para garantir seu lugar entre as primeiras lojas da região.</p>
      <p class="lead" style="font-weight:700;margin-top:26px">[WhatsApp do Webag]   [site]   [e-mail]</p>
    </div>
    <div class="collage2">
      {win('l-catalogo', 600, 'transform:translateX(30px)')}
      {phone('c-inicio', 440, 'position:absolute;right:-10px;bottom:-60px;z-index:3')}
    </div>
  </div>
  <div class="foot"><span>O app está em desenvolvimento. Comissão, prazos e taxas são valores de exemplo, sujeitos a confirmação.</span><span>13</span></div>''', None))

open('lojista.html', 'w').write(PAGE.format(title='Webag para lojistas', slides='\n'.join(l)))
print('ok', len(c), len(l))
