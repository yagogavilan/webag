# Direção visual v3: de "correto e genérico" para uma marca com assinatura

> Autor: product-designer. Data: 2026-11-19. Status: **proposta para o fundador (rodada 1 de até 3)**. Substitui as partes visuais de `direcao-visual-v2.md` (§3 P2, P4, P5, P8, P9) e de `identidade-v2.md` (§3.4 tiles, §4 tipografia, §5 forma) **quando aprovada**; o resto (dial por zona, guarda-corpos, processo de tokens) continua valendo.
> Entregas: `docs/prototipo/app-cliente-v3.html` (6 telas), `docs/design/kit-marca-v3.md` + `docs/design/kit/*.svg`.
> Marcas de fonte: **[S]** lido em resumo de busca nesta sessão (2026-11-19); **[M]** conhecimento do designer, não reaberto; **[HIPÓTESE]** a validar.

## 0. Resumo em 6 linhas

1. O app atual não parece "feito por IA" por falta de foto: parece porque **todas as decisões são a média** (mesma família, mesmo raio, mesma sombra, mesma pílula, mesmo espaçamento, tudo pastel e centralizado).
2. A v3 troca média por **contraste**: escala de cartaz contra texto de leitura, blocos sólidos (roxo, noite, branco) contra respiro, assimetria contra grade.
3. **Uma ideia gráfica só, levada a sério**: o símbolo v4a vira sistema (barras, inclinação de 8 graus, palco da sacola, olhais). Isso é o que nenhum template tem.
4. Tipografia: **Bricolage Grotesque** (display) + **Figtree** (interface e números que mudam). Ícones: **Solar** bold-duotone/linear num sistema só.
5. Cor: roxo sólido protagonista, **noite** `#1C1721` como segunda superfície, acento **lima** `#D6FF4A` em até 5% da tela **[HIPÓTESE, fundador decide; alternativa: sol `#FFC93C`]**. Pastel arco-íris sai.
6. Nada aqui exige tecnologia nova: Reanimated 3, expo-image, react-native-svg, expo-haptics. Skia e Lottie ficam de fora da 1.0.

## 1. Diagnóstico franco: o que denuncia "feito por IA"

Li as telas renderizadas em `docs/apresentacoes/img/` (c-inicio, c-loja, c-produto, c-sacola, c-confirmado, c-acompanha).

### 1.1 Tela a tela

| Tela | O que um diretor de arte vê | Por que soa genérico | Custo para o usuário |
|---|---|---|---|
| **Início** | Cabeçalho roxo com título de 40 px, busca pílula branca, um círculo com camiseta clip-art cortado pela busca; banner pêssego com camiseta e tênis em círculo branco; o botão do banner quebra em 2 linhas ("Ver moda e / calçados", erro de layout); pontinhos de carrossel; 4 tiles pastel (lilás, pêssego, rosa, azul) com ícone de traço fino; card de loja com fachada desenhada (toldo listrado, porta, vitrine) e duas pílulas de tempo e taxa | Fórmula de template de delivery: banner pastel + tiles arco-íris + card com chips. Ilustração "fachada de lojinha" é o clichê mais usado em geradores. Título é grande mas não é **o maior** de nada: tudo pesa parecido | O olho não tem ponto de entrada; categorias indistinguíveis sem ler; 1ª loja só aparece cortada |
| **Loja** | Fachada desenhada com placa "Moda Prima" repetindo o nome que vem logo abaixo; botão de coração encavalado na placa; avatar "MP" azul-marinho sem relação com nada; 4 chips iguais quebrando em 2 linhas; 4 linhas de informação ocupando a dobra inteira | **Nenhum produto na 1ª dobra** de uma loja. Chips de metadado em pílula (padrão de IA nº 1). Informação de baixa prioridade (horário, retirada, trocas) com o mesmo peso da de alta | O cliente veio comprar e vê um formulário |
| **Produto** | Camiseta preta chapada gigante sobre lilás, sombra elíptica cinza; preço 32 px; título; estrelas; "Vendido por"; link sublinhado quebrado em 2 linhas; seletor de cor e tamanho **abaixo da dobra** | Silhueta chapada sem acabamento e sem relação com a marca; composição centralizada e simétrica; o preço é grande mas genérico (mesma fonte e peso do resto) | A decisão (tamanho) está escondida; nada diz "Webag" |
| **Sacola** | Lista com divisor, lixeira dentro do stepper, "Adicionar mais itens" sublinhado como link de web, barra de frete grátis, caixa de cupom com campo e botão contornado sempre aberta, resumo em cartão lilás | Layout de formulário de e-commerce de 2015. Links sublinhados e botão contornado são vocabulário web, não app. **A barra de frete grátis contradiz a HIP-L12** (frete grátis desligado no lançamento) | Campo de cupom aberto chama atenção para um desconto que quase ninguém tem (fricção e abandono) [M] |
| **Pedido confirmado** | Roxo com "Pedido confirmado", "#4821" enorme; **a celebração é coberta na hora por uma folha de permissão de notificação**; anel do check cortado no topo | O herói é o **número do pedido** (que ninguém usa); o momento de recompensa é interrompido por um pedido do app | Pede permissão no pior momento e desperdiça o pico emocional da compra |
| **Acompanhamento** | Cartão roxo com ícone branco em quadrado, "Agora / Pedido aceito", horário 02:35 – 02:50, caixa branca repetindo "Pedido aceito" com outro selo "Pedido aceito"; linha do tempo de bolinhas; botão contornado do WhatsApp cortado | "Pedido aceito" aparece **4 vezes**. Linha do tempo com rádio vazio é o componente padrão de qualquer kit | Redundância cansa; a informação útil (quando chega, o que fazer) perde força |

### 1.2 Os 10 sinais sistêmicos (e a regra v3 que os substitui)

| # | Sinal | Onde | Regra v3 |
|---|---|---|---|
| 1 | Uma família, 3 tamanhos tímidos (16 a 40) | Todas | Display com personalidade em escala de cartaz (46 a 92) contra corpo 14 a 16; razão de escala ≥ 3:1 entre herói e corpo |
| 2 | Mesmo raio (16 a 24) e mesma sombra em tudo | Cards, banner, busca, botões | Escala de raio com intenção (§4.4); sombra só "dura" em adesivo; profundidade por sobreposição e cor |
| 3 | Pílula em tudo (chips, botões, busca, status) | Loja, Início, Acompanhamento | Pílula só em contagem (badge) e barras da marca; metadado vira texto em linha ou tabela editorial |
| 4 | Pastel arco-íris (tiles, banner, fundos) | Início, Produto | Blocos sólidos: roxo, noite, branco, papel. Tom suave só em estado pressionado |
| 5 | Tudo centralizado e simétrico | Produto, Confirmado | Composição alinhada à esquerda, assimétrica, com elementos que saem da borda |
| 6 | Espaçamento uniforme (32 entre tudo) | Início | Ritmo: blocos densos (lista 64) alternando com respiros (herói 400) |
| 7 | Ícones de traço fino genéricos | Tiles, linhas, abas | Solar bold-duotone com 2 cores em pontos de marca; linear 1,8 só em navegação neutra |
| 8 | Ilustração clip-art (fachada com toldo, camiseta chapada, círculo atrás) | Início, Loja, Produto | Arte de produto com sombra sólida e recorte, sobre formas do símbolo; nenhuma "lojinha" |
| 9 | Movimento genérico (fade e escala .98) | Todas | Coreografia com assinatura: barras crescem, adesivos saltam, arte voa, confete de formas da marca |
| 10 | Copy de template ("Escolha no app. Receba em casa." como título da Início; "Agora / Pedido aceito") | Início, Acompanhamento | Voz humana curta: "O que vai pra sacola hoje?", "Pedido feito. Agora é com a gente." |

**O que não é problema e fica:** corpo ≥ 16, alvos ≥ 44, uma ação primária por tela, preço e prazo antes do clique, linha do tempo acessível, "Copiar código" primeiro no PIX, dial de expressividade por zona (`direcao-visual-v2.md` P0).

## 2. Princípios do sistema v3 (com exemplo concreto)

| # | Princípio | Regra verificável | Exemplo no protótipo v3 |
|---|---|---|---|
| **P1** | **Um herói por tela, em escala de cartaz** | Cada tela tem 1 elemento ≥ 3x o corpo (≥ 46 px); nada mais passa de 30 px na mesma dobra | Início: "O que vai pra sacola hoje?" 46 px. Produto: preço 68 px com "R$" a 40% e centavos a 50%. Confirmado: "18:45 – 19:00" a 60 px. Ranking: numerais de 92 px |
| **P2** | **Cor em bloco, não em tinta** | Toda tela tem 1 bloco sólido de ≥ 30% da largura e ≥ 25% da altura (roxo ou noite), ou nenhum. Zero pastel em área > 10% | Início: cabeçalho roxo + faixa noite das ofertas. Loja: capa na cor da própria loja. Acompanhamento: cabeçalho noite |
| **P3** | **A inclinação Webag (8 graus)** | Cortes de bloco, selos, progresso e marca-texto usam `skewX(-8deg)` ou diagonal equivalente (≈ 56 a 64 px de queda em 390 de largura). Texto e foto nunca são inclinados | Fundo do cabeçalho com corte diagonal; selo "-17%"; segmentos do progresso; indicador da aba |
| **P4** | **Barras como sistema** | As 3 barras do símbolo aparecem como função (carregando, progresso, divisor, aba ativa, rastro), nunca como enfeite solto | Divisor do resumo da sacola; aba ativa; rastro do tênis; barras brancas do pedido confirmado |
| **P5** | **Produto protagonista, recortado e sobreposto** | Arte/foto em pelo menos 1 lugar por tela sai da borda do seu contêiner ou cruza duas seções; cards de lista recortam o produto (zoom 128%) | Tênis do cabeçalho sai pela direita; capa da loja cruza o corte diagonal; botão "+" atravessa a borda do card; logo da loja atravessa a capa |
| **P6** | **Ritmo editorial e assimetria** | Alinhamento à esquerda; grade quebrada de propósito (bento, colunas defasadas 40 px); alternância denso/respiro | Bento de ofertas (1 grande + 2 pequenos); grade da loja defasada; estatísticas da loja em tabela com fio de 2 px |
| **P7** | **Movimento com assinatura e propósito** | Toda animação responde a uma ação ou a uma mudança de estado; nenhuma em loop na zona de dinheiro; versão "reduzir movimento" sempre | Arte voa até a sacola; total rola ao mudar a quantidade; confete de formas da marca só no pedido confirmado |

**Voz (vale para todos):** frases curtas, verbo antes, sem exclamação, sem emoji, sem "Ops!", sem regionalismo (DEC-040a). Leve não é piada: humor só em vazio e celebração, nunca em erro, pagamento ou dado pessoal.

## 3. Referências: o que levar e o que deixar

| Referência | O que tem de "sênior" | Levar | Deixar | Fonte |
|---|---|---|---|---|
| **Material 3 Expressive** (Google, 2025) | Tamanho, forma, cor e contenção como hierarquia; testes mostraram a ação principal achada mais rápido | Herói maior; formas diversas; molas | Tomar o ganho de velocidade como média | [S] já citado em `direcao-visual-v2.md` §2 |
| **iFood** (2025) | Abertura brincalhona e campanha de marketplace ("vai além do delivery"); compra continua sóbria | Personalidade em abertura, vazio e celebração | Home saturada de banners | [S] [Meio & Mensagem](https://www.meioemensagem.com.br/comunicacao/ifood-quer-reforcar-sua-identidade-como-marketplace), [Marcas pelo Mundo](https://marcaspelomundo.com.br/anunciantes/ifood-levanta-polemica-nas-redes-sociais-e-provoca-debate-sobre-o-nome-do-app/), [ABC da Comunicação](https://www.abcdacomunicacao.com.br/ifood-beneficios-quer-ressignificar-mercado-de-beneficios/). Não achei registro datado de redesign visual do app em 2025 |
| **Wolt** | Tipo de display próprio (Wolt Display, 2017) ao lado de Omnes; time interno de marca e de 3D | **Display próprio ao lado de um texto neutro** é o que separa marca de template | 3D (caro e pesado em Android de entrada) | [S] [Dribbble Wolt, "Identity update"](https://dribbble.com/wolt/projects/480886-Identity-update), [Fonts In Use](https://www.fontsinuse.com/uses/41307/wolt), [Wolt Brand Experience](https://careers.wolt.com/en/teams/brand-experience) |
| **Bolt** (Koto, 2024) | Tipo encorpado + um motivo gráfico (raio) usado como sistema | **Um motivo do símbolo virando sistema** (nossas barras) | Copiar o motivo | [S] [Creative Boom](https://www.creativeboom.com/work/bolt-gets-a-striking-new-identity-by-koto/) |
| **Depop** (DesignStudio, 2017) | Tipo em caixa-baixa, ousado; voz de comunidade | Atitude e voz curta em títulos | Paleta de 3 cores fortes concorrentes | [S] [Design Week](https://www.designweek.co.uk/issues/24-30-july-2017/online-shop-depop-rebrands-take-fck-attitude/), [further.group](https://further.group/work/depop) |
| **Glovo** | Amarelo sólido em área ampla; redesign de app 2025 focado em personalização | Uma cor de marca dona da tela | Funções sociais e "flash deals" (urgência) | [S] [Retail Tech Innovation Hub, 2025-06-18](https://retailtechinnovationhub.com/home/2025/6/18/glovo-redesigns-delivery-app-and-ramps-up-focus-on-personalised-experiences-flash-deals-and-ai-powered-gifting). Não achei rebrand de 2024 documentado |
| **Airbnb** (2025) | Fim do visual plano; ícones que reagem ao toque | Reação ao toque; ilustração própria | 3D e vídeo | [S] `direcao-visual-v2.md` §2 |
| **Nubank** | Roxo em tela cheia ao lado de muito branco; sistema de movimento | Cor de marca dona da tela; movimento como marca | O próprio roxo do Nubank (risco de confusão, ver §4.3) | [S] `direcao-visual-v2.md` §2 |
| **Spotify Wrapped** | Tipo gigante, blocos de cor chapada, cor como evento | Celebração como "cartaz" | Gradiente e textura (vetados) | [S] `direcao-visual-v2.md` §2 |
| **Zara, Nike, ASOS, Zalando** | Foto editorial grande, recorte agressivo, tipo grande e muito branco; grade quebrada | Recorte de produto e grade defasada | Minimalismo frio (o Webag é leve e jovem) | [M] |
| **Mercado Livre, Shopee, Rappi, Uber Eats** | Uma cor dona do topo (ML); densidade e urgência (Shopee); cards grandes de loja (Uber Eats) | Topo de cor sólida; tempo e taxa antes do clique | Densidade, contagem regressiva, urgência falsa | [M] |
| **Duolingo, Revolut, Arc, Linear** | Duolingo: recompensa curta e com ritmo. Revolut: números enormes. Arc/Linear: tipografia precisa e movimento contido | Número como herói (Revolut); celebração curta (Duolingo); contenção no resto (Linear) | Gamificação e personagem (vetado) | [M] |
| **Vinted** | Grade de 2 colunas e foto do vendedor como protagonista | Foto do lojista em destaque, guia de foto no upload | Densidade de feed infinito | [M] |

**Leitura comum:** marcas com assinatura têm **uma ideia gráfica própria repetida com disciplina** (Bolt, Wolt) e **uma tipografia de display que não é a do sistema**. Nenhuma depende de foto para ter identidade; a foto entra num layout que já tem marca.

## 4. Decisões

### 4.1 Tipografia

| Papel | Fonte | Tamanhos (px/altura) | Por quê |
|---|---|---|---|
| Display (herói, títulos, nomes de loja, preço estático, numerais) | **Bricolage Grotesque** 700/800 | 92/72 numeral, 68 preço, 58/53 celebração, 46/45 herói, 42 loja, 34 produto, 30 seção, 24 subseção, 20 nome em card | Grotesca com "ink traps" e herança francesa/inglesa (Antique Olive, Stephenson Blake): tem personalidade sem ser infantil; pesos 800 levemente condensados cabem palavras longas do português ("Eletrônicos", "Acompanhar") em 390 px; números encorpados para preço e horário. OFL, no Google Fonts desde 2023, eixo de tamanho óptico [S] [GitHub ateliertriay/bricolage](https://github.com/ateliertriay/bricolage), [Fontsource](https://fontsource.org/fonts/bricolage-grotesque/about) |
| Interface, corpo, preço que muda, cronômetro do PIX | **Figtree** 400/600/700/800 (já no app) | 16/24 corpo, 14/20 apoio, 12/16 rótulo de aba | Humanista geométrica, ótima a 14-16 no Android; dígitos tabulares garantidos para valores que animam |
| Logotipo | Outfit 700 em curvas (DEC-044) | só no logo | Não se redigita |

**Por que não as outras candidatas:** Unbounded (larga demais: "Pedido confirmado" não cabe em 1 linha a 40 px; tom "web3"); Syne (artística, legibilidade fraca a 20-30 px, tom de galeria); Space Grotesk (a fonte "tech" mais repetida de 2019-2023, sinal de template); DM Sans, Manrope, Plus Jakarta, Poppins, Outfit, Sora, Lexend (geométricas neutras: é exatamente o registro que o fundador chamou de genérico; Poppins é a fonte-símbolo de template).

**Regras:** tracking negativo proporcional (-0,045 em ≥ 40, -0,03 em 24-34, -0,02 em 20); Bricolage nunca abaixo de 20 px nem em corpo, botão ou campo; preço que **muda na tela** (total da sacola, stepper) usa `tabular-nums` (se a Bricolage não tiver `tnum` em estática, esses preços passam para Figtree 800 **[HIPÓTESE: conferir na prova de tela]**); preço com "R$" a 40% e centavos a 50% elevados, com texto acessível "R$ 49,90" inteiro. Mobile: `@expo-google-fonts/bricolage-grotesque` (`BricolageGrotesque_700Bold`, `_800ExtraBold`) **[M: conferir nomes e peso; meta ≤ 90 KB as duas]**.

### 4.2 Ícones

| Regra | Valor |
|---|---|
| Família | **Solar** (Iconify local `recursos/icones/solar.json`), um só esqueleto em dois estilos. Tabler só para logotipo de terceiros (WhatsApp) |
| Estilo | **Linear 1,8** para navegação neutra e ações secundárias; **bold-duotone** para aba ativa, metadado de marca (tempo, entrega, retirada, troca, cupom, alerta) e ilustração de apoio |
| Duotone com 2 cores | Camada principal na cor do contexto; camada de fundo em roxo.300 `#E198EC` (sobre claro) ou acento (sobre noite) |
| Contêiner | Quadrado 44 raio 14 em `neutral.100` só em linhas de informação; nunca círculo cinza |
| Contraste | Ícone informativo ≥ 3:1 (roxo ação 6,0:1 no branco; acento 15,3:1 na noite) |
| RN | SVG gerado (SVGR) em `apps/mobile/src/icons`, `color` e `duo` como props; nada de fonte de ícone |

Mapa: início `home-smile`, busca `magnifer`, pedidos `bill-list`, conta `user-rounded`, sacola `bag-5`, tempo `clock-circle`, entrega `scooter`, retirada `shop-2`, troca/tranquilidade `shield-check`, cupom `ticket-sale`, aviso `bell`, local `map-point`, favorito `heart`.

### 4.3 Cor

| Papel | Cor | Uso | Contraste verificado (cálculo WCAG, 2026-11-19) |
|---|---|---|---|
| Marca (bloco) | `#C02EF0` | Cabeçalho, celebração, palco, segmento feito, numeral gigante | Branco sobre ela **4,29:1: só texto grande** (≥ 24 px, ou ≥ 19 px negrito). Noite sobre ela 4,10:1 (não usar em texto) |
| Ação | `#A21FBE` | Botão primário, ícone ativo | Branco 6,04:1 |
| Texto de marca | `#8618A3` | Links | 7,85:1 no branco |
| Noite (2ª superfície) | `#1C1721` (= `neutral.900`) | Faixa de ofertas, acompanhamento, barra da sacola, campo de busca e endereço sobre o roxo, toast | Branco 17,6:1; `neutral.300` 11,6:1; acento 15,3:1; roxo marca 4,10:1 (só grande) |
| Acento **lima** | `#D6FF4A` **[HIPÓTESE]** | Selo de oferta, adesivo, marca-texto, contador, "agora", ação em fundo noite. **Máx. ~5% da tela, sempre com texto noite** | Noite sobre lima 15,3:1; lima sobre roxo 3,73:1 (gráfico OK) |
| Acento alternativo **sol** | `#FFC93C` (identidade v2) | Mesmo papel | Noite sobre sol 11,4:1; sol sobre roxo 2,8:1 (badge sobre roxo perde borda) |
| Papel / estúdio | `#FAF8FB` / `#EEEAF1` (novo) | Fundo do palco / fundo das fotos de produto | `neutral.600` 6,9:1 sobre papel |
| Feedback | sucesso `#1B6E3C` (6,3:1), alerta `#7A4E00` (7,2:1) | Inalterados | |

**Por que lima e não sol:** lima é quase complementar do roxo (matiz ~75° contra ~285°), dá o maior contraste de energia sem disputar com o roxo, e nenhum app de varejo/entrega brasileiro grande usa roxo + lima [M]; com o sol, o par roxo + amarelo lê "promoção" e encosta no repertório de Nubank/Mercado Livre [M]. **Risco:** lima pode parecer "jovem demais" para parte do público. O protótipo troca com `?acento=sol` para o fundador comparar. **Decisão do fundador.**

**O que sai:** os 6 tiles pastel (`tile.1..6`) e o `brand.50/100` como fundo de bloco (ficam só para pressionado/seleção suave).

### 4.4 Forma

| Elemento | v2 | v3 | Motivo |
|---|---|---|---|
| Botão primário | pílula 56 | **raio 16**, 56 de altura, rótulo à esquerda e valor à direita | Pílula em tudo era sinal nº 3; o valor no botão tira a dúvida "quanto vou pagar" |
| Botão de ícone | círculo 48 | **quadrado raio 14**, 44 | Conversa com o trapézio de cantos arredondados do símbolo |
| Card de produto / loja | raio 16 a 24 | **22 a 24** no contêiner, **15** no botão "+" que atravessa a borda | Raio maior no grande, menor no pequeno: hierarquia de forma |
| Tamanho (P M G) | pílula | **quadrado raio 15**, selecionado preenchido em noite, esgotado com risco diagonal | Escolha clara ao sol; não depende de cor |
| Folha / painel | raio 24 | **30** | |
| Corte de bloco | reto | **diagonal** subindo para a direita (≈ 64 px em 390) | Inclinação Webag |
| Sombra | sm/md com desfoque | **nenhuma** em card; **dura 3/3 ou 4/4 noite** só em adesivo e logo da loja | Profundidade por sobreposição e cor; sombra com desfoque custa GPU em lista no Android |

### 4.5 Movimento e elementos de marca

Catálogo completo e implementação em `kit-marca-v3.md` §4 e §5. Regras: só `transform`/`opacity`; máx. 1 momento de surpresa por compra (confete só no pedido confirmado); nada animado perto do botão de pagar e do QR do PIX; `useReducedMotion()` em todos.

## 5. As 6 telas no protótipo v3

| Tela | Herói (P1) | Bloco (P2) | Quebra/sobreposição (P5, P6) | Movimento (P7) | Decisão de UX |
|---|---|---|---|---|---|
| **Início** | "O que vai pra sacola hoje?" 46 px, "sacola" com marca-texto lima | Cabeçalho roxo com corte diagonal; ofertas em faixa noite | Tênis sai pela direita; busca noite atravessa o corte; categorias como **índice tipográfico** (sem tiles); cards de loja com arte que sai pelo topo e logo-adesivo; bento de ofertas; ranking com numerais de 92 px sobre a foto | Cascata 55 ms; tênis entra com mola; barras crescem; marca-texto se desenha; cabeçalho recolhe para barra compacta (endereço + busca) a 250 dp | Endereço em pílula noite (o texto pequeno não fica sobre o roxo, que reprova AA); 1ª loja na 1ª dobra; barra "Ver sacola" com total |
| **Loja** | Nome 42 px | Capa na cor da loja com corte diagonal | Logo-adesivo inclinado atravessa a capa; produtos da capa cruzam o corte; grade defasada 40 px; "+" atravessa o card | Nota conta de 0 a 4,7; aba ativa desliza; "+" vira check lima com salto; desfazer no toast | **Produto na 1ª rolagem**: horário e endereço saem para "Retire grátis na loja"; estatísticas em tabela editorial (nota, tempo, entrega); troca em 1 linha (posicionamento §5.1) |
| **Produto** | Preço 68 px | Palco: sacola roxa gigante atrás da peça, barras noite | Peça gira -4°, palco -7°; adesivo "Mais pedida" com sombra dura | Elemento compartilhado do card até o palco; cor troca a peça com salto; tamanho esgotado balança; arte voa até a sacola; botão vira "Na sacola · Ver sacola" | Cor e tamanho visíveis já na 1ª rolagem; esgotado com risco (não só cor); estoque baixo só quando real; botão mostra o valor |
| **Sacola** | "Sua sacola" 52 px; total 52 px | Opção escolhida de recebimento em noite | Resumo com fio de 2 px e divisor de barras | Total rola ao mudar quantidade ou recebimento; item sai com recolhimento e "Desfazer" | Cupom recolhido em 1 linha (sugere o cupom disponível); entrega x retirada lado a lado com preço; **sem barra de frete grátis** (HIP-L12) |
| **Pedido confirmado** | "Pedido feito." 58 px + horário 60 px | Roxo em tela cheia; painel noite | Barras brancas saem da borda esquerda até a sacola; selo de check com anel na cor do fundo | Sacola cai com mola, barras crescem, check salta, 30 confetes da marca, háptico de sucesso | **Permissão de aviso vira interruptor dentro do painel** (aceite no contexto, sem folha por cima da celebração); o herói é **quando chega**, não o número do pedido |
| **Acompanhamento** | Etapa em 34 px + horário 54 px | Cabeçalho noite com corte | Ilustração da etapa atravessa o título; código de entrega em blocos | Segmento atual com faixa deslizando; ilustração troca com salto; pulso no "Agora" | "Pedido aceito" aparece 1 vez; **código de entrega** (WB-226, ligado por padrão) em destaque; WhatsApp da loja; "Simular próxima etapa" só no protótipo |

Fora destas 6 (próxima rodada, após aceite do estilo): Busca, Categoria, Checkout/PIX (dial baixo: estrutura de `onda-4-transacao.md` S5 mantida, só tipografia e forma novas), Pedidos, Conta, vazios e erros, painéis.

## 6. Plano de componentes (para o `mobile-dev`)

| Componente | Novo / muda | Implementação Expo | Prioridade |
|---|---|---|---|
| `Price` | Muda: R$ e centavos proporcionais, variantes `sm/md/lg/xl`, `animated` | `Text` aninhado; `animated` com `useSharedValue` + `useDerivedValue` formatando | 1 |
| `HeroHeader` | Novo: bloco de cor + corte diagonal + recolhe | `Animated.View` + `Svg Path` do corte; `interpolate(scrollY)` | 1 |
| `BrandBars` (divisor, carregando, progresso, aba) | Novo | `View` com `skewX`; carregando com `withRepeat` | 1 |
| `Sticker` / `OfferTag` | Novo | `View` com cópia deslocada (sombra dura) e `skewX` | 1 |
| `ProductCard` | Muda: foto recortada 4:5, "+" atravessando, `-NN%` | `expo-image` `contentFit="cover"`, `transition`; "+" absoluto | 1 |
| `StoreCard` / `StoreCover` | Muda: capa de cor/foto, logo-adesivo, arte sobreposta | `expo-image`; arte curada em PNG/WebP com fundo removido | 2 |
| `CategoryIndex` | Novo (substitui `CategoryTile`) | `Pressable` com `Text` Bricolage, `flexWrap` | 2 |
| `OfferBento` | Novo | Grid de 2 colunas com `View` | 2 |
| `StatTable` (loja) | Novo | 3 colunas com fio | 2 |
| `SizePicker`, `ColorSwatch` | Muda: quadrado, preenchido, risco no esgotado, shake | `Pressable` + `withSequence` | 1 |
| `PrimaryButton` | Muda: raio 16, rótulo + valor, estado "feito" | | 1 |
| `BagBar` | Muda: noite, total animado, salto do contador | | 1 |
| `ReceiveOption` | Novo (entrega x retirada) | `Pressable` radio, check lima | 1 |
| `OrderProgress` + `StageIllustration` | Muda: 5 segmentos inclinados + spot por etapa | `react-native-svg` (SVGR) | 1 |
| `DeliveryCode` | Novo (WB-226) | 4 blocos; `accessibilityLabel` com dígitos separados | 1 |
| `Celebration` | Novo: estado final estático + confete | 30 `Animated.View` com `withTiming`/`withDelay`; `expo-haptics` | 2 |
| `FlyToBag` | Novo | Clone absoluto medido com `measure()`; `withTiming` em arco | 3 |
| Transição card → produto | Novo | Reanimated `sharedTransitionTag` **[HIPÓTESE: ainda marcado como experimental; fallback fade 200 ms]** | 3 |
| `EmptyState` | Muda: ilustrações do kit | SVGR | 2 |

Tokens novos (proposta, aplicar só após aceite, em `packages/tokens` via tema `webag`): `color.accent.base` = lima, `color.surface.studio` `#EEEAF1`, `color.surface.ink` = `neutral.900`, `font.family.display` = Bricolage Grotesque, `textStyle.hero/numeral/priceXl`, `radius.control` 14, `radius.card` 22, `radius.sheet` 30, `shape.lean` -8, `shadow.hard` (3/3 noite, sem desfoque), `motion.*` de `kit-marca-v3.md` §5. **Remover** `tile.*` e `tileInk.*` após migrar as telas. Pares novos para `a11y/contrast-pairs.json`: noite/lima, lima/noite, branco/roxo (marcado "só grande"), `neutral.300`/noite.

## 7. Riscos e validação

| Risco | Mitigação |
|---|---|
| Lima "jovem demais" ou "barulhento" para o público | Comparar com `?acento=sol`; teste de 5 s com 5 moradores (confiança e modernidade, 1 a 5), v2 contra v3 |
| Branco sobre `#C02EF0` (4,29:1) usado em texto pequeno por engano | Regra no componente `HeroHeader`: texto < 19 px negrito só dentro de contêiner noite/branco; par marcado no `check` |
| Bricolage pesa e falha em celular fraco | Só 700/800, subset latino; medir tempo de carregamento de fonte no aparelho de referência |
| Animações custam fps | Só transform/opacity; cascata máx. 8 blocos; confete 30 partículas; medir 60 fps no Android de referência (QA define o aparelho) |
| Arte que sai da borda depende de recorte curado | Regra: sobreposição só em peças curadas pelo Webag; lista usa foto recortada pelo cartão (kit §6) |
| Grade defasada confunde leitura de preço | Preço sempre colado ao nome; defasagem só em 2 colunas; testar com a tarefa "achar e adicionar um produto" |

## 8. Para o fundador decidir (uma rodada)

1. A direção geral (blocos sólidos, Bricolage, barras e inclinação como sistema) é o caminho?
2. Acento: **lima** `#D6FF4A` ou **sol** `#FFC93C`?
3. Título da Início com voz ("O que vai pra sacola hoje?") ou a assinatura C3 do PO ("Escolha no app. Receba em casa.")? O PO fecha a copy final.

## 9. Como renderizar (para o CEO)

- Fontes: embutir **Bricolage Grotesque** 600/700/800 (`docs/design/recursos/fontes/bricolage-grotesque-latin-{600,700,800}-normal.woff2`, família CSS `"Bricolage Grotesque"`) e **Figtree** 400/600/700/800 entre `<!--WEBAG-FONTS--><!--/WEBAG-FONTS-->`. Outfit não é necessária (o logo está em curvas).
- Capturar 390 x 844 a 2x, com `?estatico=1` (sem animação) para cada hash: `#inicio #loja #produto #sacola #confirmado #acompanha`. Para ver a tela inteira: `?estatico=1&longo=1`. Para comparar acento: `&acento=sol`.
- Sem `?estatico=1`, esperar ≥ 1,5 s antes da captura (cascata de entrada).
