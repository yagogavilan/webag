# Direção visual v2: mais vida, mesma clareza (DEC-040)

> Autor: product-designer. Data: 2026-11-19. Status: **rascunho aguardando a logo do fundador**. Nenhuma cor de marca nova foi decidida aqui; o petróleo `#00696F` continua em vigor até a logo chegar (nome das cores atuais só como exemplo de cálculo). Base: protótipos `docs/prototipo/app-cliente.html` e `paineis.html`, `identidade.md` (v1), `design-system.md`, `packages/tokens`.
> Marcas de fonte: **[S]** lido em resumo de busca desta sessão (conferir antes de citar fora do time); **[M]** conhecimento do designer, não reaberto. Os domínios `design.google`, `building.nubank.com`, `itsnicethat.com` e `blog.duolingo.com` não resolveram nesta sessão (precisam entrar na lista de rede permitida para eu abrir as fontes primárias), então **nenhuma fonte desta página é [V] (verificada na íntegra)**.

## 0. Resumo e o que espera a logo

O protótipo parece "engessado" porque **as próprias regras da identidade v1 pedem isso**: cor de marca proibida em área ampla, raio de 8 em tudo, cartão sem sombra, ícone de traço único, nada de ilustração. A v2 troca a regra, não só a pintura: **cor, forma e movimento passam a carregar personalidade nas telas de descoberta e celebração, e a sobriedade fica onde há dinheiro e dado pessoal**.

| Pode andar agora (não depende da logo) | Espera a logo |
|---|---|
| Diagnóstico, princípios, forma, ritmo, movimento, estrutura das 6 telas | Cores (primária, secundária, acento, neutros, tiles) |
| Pipeline de tokens com tema trocável (§6) | Símbolo, logotipo, ícone do app, splash, ícone de notificação |
| Kit de ilustração de estados (geometria) e catálogo de microinterações | Tipografia de display (se a logo tiver fonte própria) |
| Processo e script de validação de contraste (§5) | Protótipo HTML v2 e as specs finais das 6 telas |

## 1. Diagnóstico: o que deixa o protótipo rígido

| # | Sintoma | Evidência no protótipo (`app-cliente.html`) | Causa | Efeito para o usuário |
|---|---|---|---|---|
| 1 | **Cor só em botão e link** | Fundo de tela `neutral.50` bege, cartões brancos; petróleo só em CTA, chip ativo e foco. Header, banner e categorias são neutros ou pastel lavado (`#E3D9C8`, `#EBDCD6`, `#DDE3DA`) | `identidade.md` §3: "Nunca fundo de seção grande, cabeçalho colorido, ícone decorativo" | App sem identidade na primeira dobra; parece template |
| 2 | **Blocos retos e iguais** | `--wb-radius-md: 8px` em botão, banner, cartão, foto, campo, folha de produto; só busca, chips e avatar são pílula | `identidade.md` §7: "Retos o bastante para parecer varejo sério, não brinquedo" | Linguagem de formulário. Nenhuma forma lembra o símbolo (sacola com cantos e alça) |
| 3 | **Pouca imagem** | Produto, banner e capa são composições SVG; capa de loja é faixa listrada. Produto em 1:1 pequeno (144 px nos carrosséis) | Protótipo sem fotos reais; `design-system` §4 limita a "1 card de capa por viewport" | Sem desejo de compra. Confiança por foto fica em teoria |
| 4 | **Listas uniformes** | Linhas de loja, `.li`, itens da sacola: mesmo padrão, divisor de 1 px, miniatura 56/72 | Regra "Linha" como padrão de lista longa | Escaneia bem, mas tudo pesa igual |
| 5 | **Ícones sem personalidade** | Traço 1,75 na cor do texto, 28 px dentro de círculo `neutral.100` cinza em todas as categorias; aba ativa só muda de cor | Ícone "regular único"; Fill só para aba e favorito | Categorias indistinguíveis; navegação sem presença |
| 6 | **Hierarquia sem ritmo** | Título de seção sempre 20/600 + margem 32/8; só 2 momentos usam tamanho grande (preço 32, contador PIX 40) | `identidade.md` §4: "máx. 3 níveis" aplicado sem um "herói" por tela | Nenhum ponto de entrada visual; o olho não sabe por onde começar |
| 7 | **Pouco movimento** | Há: transição de tela 250 ms, check desenhado, pulso na linha do tempo, escala .98 no botão, skeleton. Faltam: resposta ao adicionar à sacola, favorito, contador, entrada de listas, cabeçalho que encolhe | Movimento tratado como "estado", não como marca | Ações sem confirmação sensível; app "mudo" |
| 8 | **Estado vazio genérico** | `.es .esc`: círculo cinza 120 com ícone de traço | Sem kit de ilustração | Erro e vazio são os momentos de maior frustração e ficam mais frios |
| 9 | **Nenhum momento de surpresa** | Pedido confirmado e entregue usam o mesmo `t1` e um check | Sem orçamento de "delight" | Compra feita sem recompensa emocional |
| 10 | **Tipografia em um registro só** | Figtree 400/600/700, quase tudo 16 a 24 | Corpo mínimo 16 e 3 níveis por tela | Sem manchete; sem voz em saudação, sucesso e vazio |

**O que não é problema e fica:** corpo ≥ 16, alvo ≥ 48, uma ação primária por tela, skeleton, grade 8, `prefers-reduced-motion`, ordem PIX "copiar primeiro", frete visível antes do clique. Rigidez ≠ clareza; a clareza é do que tira a dúvida do cliente.

**Regras v1 que esta direção substitui (quando a v2 for aprovada pelo fundador):** `identidade.md` §1 ("menos grito... calor local" e mensagem regional, já derrubada pela DEC-040a), §2 (símbolo, ícone, splash), §3 ("Onde o destaque aparece" e "Nunca"), §7 (raios, elevação, selo "etiqueta"), `pesquisa-referencias.md` §3 "Lacuna de marca"; `design-system.md` §4 (composição, "1 card de capa"). Os tokens só mudam junto com a logo.

## 2. Referências: o que levar e o que deixar

| Referência | O que tem de vida | Levar | Deixar | Fonte |
|---|---|---|---|---|
| **Material 3 Expressive** (Google, mai/2025) | Cor, forma, tamanho, movimento e "contenção" (agrupar em blocos) como ferramentas de hierarquia. 46 estudos, mais de 18 mil participantes; chave de ação achada **até 4x mais rápido** (teto, num app de teste); idosos acharam tão rápido quanto jovens | Elemento principal maior e mais forte; formas diversas; molas no movimento | Tomar o "4x" como média | [S] [Google Design](https://design.google/library/expressive-material-design-google-research), [Dezeen, 2025-05-28](https://dezeen.com/2025/05/28/google-ushers-in-age-of-expressive-interfaces-with-material-design-update/) |
| **Airbnb** (redesign mai/2025) | Ícones 3D animados no topo ("a porta da casa abre ao toque"), fim do visual plano, feito por time interno ao longo de ~2 anos | Ícone que reage ao toque; ilustração própria em vez de stock | 3D e vídeo: caro de produzir e pesado em celular fraco. Usar 2D vetorial leve | [S] [Airbnb News](https://news.airbnb.com/en-uk/2025-summer-release-now-you-can-airbnb-more-than-an-airbnb), [Bloomberg, 2025-06-13](https://www.bloomberg.com/news/articles/2025-06-13/apple-airbnb-ditch-flat-app-icons-for-new-3d-ui-design), [9to5Mac, 2025-05-13](https://9to5mac.com/2025/05/13/airbnb-app-redesign-services-experiences-originals/) |
| **Spotify Wrapped 2025** | Base preto e branco, **cor reservada para momentos-chave** (imagens, capas); estética de mixtape, gradientes e texturas | Cor e tipografia grandes como "evento" (confirmação, entrega) em vez de decoração permanente | Textura e gradiente pesados; paleta reduzida não cabe numa loja com milhares de fotos | [S] [Fast Company Middle East](https://fastcompanyme.com/?p=46098) |
| **Nubank** | Cor da marca em tela inteira; sistema de movimento feito pelo estúdio illo e rodando no app via Rive, "camadas e design mínimo sugerindo 3D" | Movimento como parte da marca; cor de marca em áreas amplas ao lado de muito branco; sistema de marca documentado | Rive/Lottie pesados; copiar o roxo (proibido pelo brief) | [S] [Brand System](https://building.nubank.com/nu-brand-system/), [motion system](https://mindsparklemag.com/design/nubank-motion-system-illo); uso de cor em tela cheia: [M] |
| **Duolingo** | Princípios de movimento: provocar emoção, dar um "ritmo" (beat) mesmo sem som, ir ao ponto e não enterrar a recompensa; personagens com antecipação e "squash and stretch"; componentes de movimento reutilizáveis | Recompensa rápida (≤ 1,2 s), ritmo, reação ao toque | Personagem e gamificação (conflita com "sem urgência falsa") | [S, de segunda mão: post de LinkedIn e artigos de fornecedor] [Inside Design Studio](https://co.linkedin.com/in/felipe-quintero-a3487b167), [Rive](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life), [LottieFiles](https://lottiefiles.com/case-studies/duolingo); linguagem de formas: [M] [blog](https://blog.duolingo.com/shape-language-duolingos-art-style/) (só título) |
| **iFood** | Tela de abertura brincalhona (mai/2025), campanha "vai além do delivery", retrospectiva com ilustração e cores vivas; a interface de compra continua sóbria | **Personalidade concentrada em abertura, vazios e celebrações**; transação limpa | Home saturada de banners e vermelho em tudo | [S] [Marcas pelo Mundo](https://marcaspelomundo.com.br/anunciantes/ifood-levanta-polemica-nas-redes-sociais-e-provoca-debate-sobre-o-nome-do-app/), [Tecnoblog](https://tecnoblog.net/noticias/ifood-libera-retrospectiva-do-que-as-pessoas-comeram-em-2025/), [Meio & Mensagem](https://www.meioemensagem.com.br/comunicacao/ifood-quer-reforcar-sua-identidade-como-marketplace) (só título) |
| **Mercado Livre** | Uma cor chapada forte (amarelo) no topo, um sistema (Andes) para web, iOS e Android; Mercado Pago unificando com o amarelo | Um bloco de cor forte e plano em área ampla; um sistema só | Página de produto carregada | [S] [Figma](https://www.figma.com/customers/mercado-libre-scales-design-across-latin-america/), [Cronista](https://www.cronista.com/mexico/actualidad-mx/cambia-la-app-mas-usada-por-los-mexicanos-para-pagar-con-el-celular-como-se-va-a-usar-a-partir-de-ahora) (data não confirmada); cabeçalho amarelo: [M] |
| **Zé Delivery** | Amarelo e preto, mascote, identidade que muda por campanha | Voz direta; identidade que flexa com campanha (banners) | Tom de "rolê" para perfumaria, papelaria e pet | [S] [Propmark](https://propmark.com.br/anunciantes/ze-delivery-muda-identidade-para-promover-chegada-de-spaten-pro/) |
| **Magalu** | Personagem 3D (Lu) como personalidade da marca | Ideia de um "rosto" da marca | Não achei fonte sobre o design do app; mascote é decisão do fundador | [S] [Mercado & Consumo, 2024-07-02](https://mercadoeconsumo.com.br/02/07/2024/marketing/lu-do-magalu-ganha-visual-mais-realista-com-nova-matriz-3d-e-ia/); app: [M] |
| **Shein** (e moda em geral) | Foto grande, grade de 2 colunas, carrossel de categorias, barra de ação fixa, selo social ("mais vendido") | Foto como protagonista; 2 colunas; barra fixa | Densidade e alvos pequenos (crítica de teardown: toques errados) | [S] [Landing Doctor](https://landingdoctors.com/es/teardowns/shein-com), [ScreensDesign](https://screensdesign.com/explore/flows/exploring-product-details/), [Business of Fashion](https://Businessoffashion.com/articles/professional/ecommerce-shein-tiktok-temu/) |
| **Shopee, Rappi, Zara, Renner** | Shopee/Rappi: ver `pesquisa-referencias.md` §3. Zara: foto editorial em tela cheia. Renner: busca não trouxe análise de design do app | Foto editorial grande na vitrine de moda | Gamificação e urgência (Shopee) | [M]; sem fonte nova nesta sessão |

**Leitura comum:** os apps com mais vida concentram personalidade em **três lugares** (cabeçalho/abertura, vazios e celebrações, ilustração e movimento de reação) e mantêm **a transação sóbria**. É a base do princípio P0.

## 3. Princípios da personalidade v2

**P0. Dial de expressividade por zona.** Não é "o app todo mais colorido": é um controle por área.

| Zona | Telas | Dial | Pode | Não pode |
|---|---|---|---|---|
| Descoberta | Início, Busca, Loja, Categoria | Alto | Cor de marca em área ampla, tiles coloridos, foto grande, entrada animada, tipografia manchete | Mais de 1 elemento "herói" por dobra |
| Decisão | Produto, Sacola | Médio | Foto grande, formas de marca, microinteração de adicionar | Gradiente, ilustração dentro do fluxo de escolha |
| Dinheiro e dados | Checkout, Cartão, PIX, Conta, Privacidade | Baixo | Cartão de total com tom suave; celebração **só depois** da confirmação | Animação de distração, cor de campanha, qualquer estilização do QR |
| Celebração e pós-venda | Confirmado, Acompanhamento, Entregue, Troca aprovada | Alto, curto | Inundação de cor, manchete, ilustração por etapa | Repetir a celebração; bloquear o próximo passo |
| Estados difíceis | Vazio, sem conexão, erro | Médio | Ilustração do kit + copy acolhedora (identidade §8) | Humor em erro de pagamento ou de dados |

**P1. Cor com presença, em áreas amplas e controladas.** Cabeçalho da Início em cor de marca (faixa com 168 a 200 dp, recolhe ao rolar), banners em cor cheia de campanha, tela de sucesso inundada, um bloco de apoio por tela de descoberta. Regras: (a) cor de marca em **no máximo ~40% da área** de uma tela de decisão e 0% em PIX/cartão além do botão; (b) todo texto sobre cor passa 4,5:1 verificado pelo `check` (§5.2 e §6); (c) cor nunca é a única pista de estado.

**P2. Formas derivadas do símbolo (hoje: sacola).** O símbolo de rascunho tem três ideias reaproveitáveis (a logo do fundador pode trocá-las; o método vale): **corpo** (retângulo de cantos generosos, raio ≈ 17% da largura), **alça** (arco que sai do topo) e **zigue-zague** (o "w" como padrão). Aplicação:

| Elemento | v1 | v2 (proposta) |
|---|---|---|
| Cartão e foto | raio 8 | **16** (itens) e **24** (cartão herói, folha) |
| Botão | 8 | **pílula (999)** no CTA; 12 no campo de texto |
| Selo | 4 ("etiqueta") | **8**, ou pílula para status |
| Faixa de cor do cabeçalho | reta | cantos inferiores **24 a 32**; pode ganhar um arco "alça" no centro para o logo |
| Corte de imagem de destaque | retângulo | arco "alça" no topo (`borderTopLeftRadius/RightRadius = largura/2`, barato; **sem máscara SVG**) |
| Faixa de seção alternada | n/a | fundo de tom suave full-bleed com **cantos superiores 24**, para quebrar a monotonia |

**P3. Fotografia grande.** Foto de produto 4:5 (moda e calçado) ou 1:1 (demais) a 160 dp nos carrosséis e largura cheia na galeria; capa de loja em 4:3 ou 16:10 com a logo da loja sobreposta; banners com foto ou arte de produto grande e uma manchete de até 6 palavras. **Dependência crítica:** a qualidade vem das lojas. Mitigação em §8 (validação de resolução no upload, cor dominante como placeholder, layout sem foto que continua bonito).

**P4. Tiles de categoria coloridos.** Quadrado de 80 dp, raio 16, fundo de um **tom suave** de uma paleta de apoio de 6 slots (`tile.1..6`, §6), ícone duotone na cor de tinta e rótulo 14/600 em `text.primary` (nunca branco sobre tom claro). Duas linhas, rolagem horizontal, ou grade 4 x 2. O admin escolhe **slot e ícone por nome** (como na identidade §5); não faz upload.

**P5. Ícones com mais vida (mesma família, sem trocar o conjunto).** Phosphor segue (HIP-D03). Mudanças: **Duotone** nas categorias e nos vazios; aba ativa = ícone **Fill** dentro de **indicador em pílula** de tom suave (padrão M3, [M]), com salto curto (scale 0,9 → 1, 150 ms); ícone de sacola do cabeçalho "balança" 300 ms ao receber item.

**P6. Estados vazios e de erro ilustrados.** Kit de **6 ilustrações de apoio**, feitas com a geometria da marca (corpo, alça, zigue-zague) em 2 ou 3 cores chapadas, **SVG de até 6 KB cada**, sem Lottie por padrão: sacola vazia, nada encontrado, sem conexão, erro do servidor, sem pedidos, sem endereço. Mais 5 *spots* de etapa do pedido (§4, Acompanhamento). Produção própria a partir da logo; nada de banco de imagens.

**P7. Microinterações e transições (catálogo).** Só `transform` e `opacity`, na thread de UI (Reanimated), com versão para "reduzir movimento".

| Interação | Efeito | Duração [HIPÓTESE, afinar no aparelho] | Háptico | Com "reduzir movimento" |
|---|---|---|---|---|
| Toque em botão, tile, card | Escala 0,97 e volta com mola curta | 150 ms | Seleção (chip/aba) | Só troca de cor |
| Adicionar à sacola | Miniatura da foto "voa" até o ícone da sacola; ícone balança; contador salta 1,0 → 1,2 → 1,0 | 400 ms | Leve | Contador atualiza sem voo; toast "Adicionado à sacola." |
| "+" vira stepper | Botão circular expande em pílula com número | 150 ms | Seleção | Troca direta |
| Favoritar | Coração preenche com salto | 300 ms | Leve | Troca direta |
| Stepper e total | Número "rola" para cima ou para baixo | 150 ms | Seleção | Troca direta |
| Variação obrigatória faltando | Grupo balança 2x de 8 px + mensagem "Escolha o tamanho" | 250 ms | Erro | Só mensagem e foco |
| Entrada de lista | Itens entram com atraso de 40 ms entre si, **no máximo 6 itens**, uma vez por tela | 250 ms | n/a | Sem animação |
| Cabeçalho da Início ao rolar | Faixa de cor encolhe para barra compacta; busca fica | 250 ms (acompanha o dedo) | n/a | Troca direta |
| Capa da loja | Paralaxe 0,5x e cabeçalho que ganha fundo | acompanha o dedo | n/a | Sem paralaxe |
| Card → produto | Foto expande até a galeria (elemento compartilhado) | 250 ms | n/a | Fade. **[HIPÓTESE]** validar suporte e custo em Android de entrada; se cair de 60 fps, usar fade |
| Puxar para atualizar | Arco "alça" gira e fecha | acompanha o dedo | Leve ao soltar | Indicador padrão |
| Frete grátis atingido | Mini sacola "enche" e vira check, **1 vez** | 400 ms | Sucesso | Texto "Frete grátis" |
| PIX copiado | Botão vira check + "Código copiado" | 150 ms | Sucesso | Igual (já é simples) |
| Pedido confirmado | Check desenhado, tela inunda na cor de marca, manchete | 1200 ms no total | Sucesso | Tela já na cor final |
| Etapa do pedido muda | Ilustração faz fade cruzado, nó da linha do tempo salta, ETA troca | 400 ms | Leve | Troca direta |
| Abertura do app (frio) | Símbolo "se desenha" sobre o splash; **nunca** atrasa o conteúdo | ≤ 800 ms, só na primeira abertura do dia | n/a | Sem animação |

**P8. Tipografia expressiva em momentos-chave, sem novo peso.** Mantém Figtree 400/600/700 (orçamento ≤ 150 KB). Novo estilo `hero` 40/44 Bold (sem tabular, tracking levemente negativo) para: saudação da Início, manchete de sucesso, título de vazio, título de banner, tela de abertura. Seções da Início alternam **title1 (24)** nas de destaque e **title2 (20)** nas de lista. Se a logo trouxer fonte própria: avaliar só para `hero` com subset latino ≤ 40 KB **[HIPÓTESE]**, após checar licença de app.

**P9. Cantos e sombras sem custo.** Profundidade por **cor** (tom suave sobre fundo), não por sombra. Sombra `sm`/`md` só em elementos estáticos (barra de sacola, folha, card herói); lista com sombra continua proibida (GPU no Android de entrada). No Android a elevação nativa é mais barata que sombra com desfoque; no iOS usar a sombra dos tokens. Raio de imagem via propriedade do `expo-image`, não `overflow: hidden` em lista longa.

**P10. Ritmo de hierarquia em 3 volumes.** Volume 3 (um por tela): herói de 32 a 40, cor ou foto de sangria total. Volume 2: seção 20 a 24 com faixa ou tile. Volume 1: lista e metadado 14 a 16. Regra: **uma manchete, duas faixas de cor e o resto neutro** por dobra.

**P11. Orçamento de surpresa.** Máx. **1 momento de surpresa por sessão de compra** e nenhum em erro, pagamento ou dado pessoal. Previstos: abertura (símbolo se desenha), saudação por horário (sem dado novo; usa o primeiro nome só se o usuário estiver logado), frete grátis atingido, pedido confirmado, entrega concluída, troca aprovada. Sem gamificação, sem contagem, sem urgência falsa (identidade §8).

**P12. Guarda-corpos (não negociáveis).** WCAG 2.2 AA (texto 4,5:1; não texto 3:1; alvo ≥ 48 dp); grade 8 (meio-passo 4); fonte a 150%; `prefers-reduced-motion`; nenhuma animação fora de `transform`/`opacity`; nada de autoplay de carrossel sem controle; Lottie ≤ 50 KB (já em `design-system` §10); foto de lista ≤ 30 KB, capa ≤ 120 KB. **Meta de desempenho [HIPÓTESE]:** 60 fps em um Android de entrada de referência (definir o aparelho com o QA). **Modo leve [HIPÓTESE]:** desligar entrada em cascata, paralaxe e elemento compartilhado quando o sistema pedir economia de bateria ou menos movimento. Texto sobre foto: scrim 72% (7,0:1, já comprovado). Texto de marca/mensagem: copy conforme DEC-040a (o PO define; esta direção não escreve promessa).

## 4. O que muda em cada tela principal

Estrutura e movimento valem já; **cores, ilustrações e símbolo esperam a logo**. Specs atuais: `telas/onda-3-descoberta-cliente.md` (D5 a D9) e `telas/onda-4-transacao.md` (S1, S5 a S7).

| Tela | Hoje | v2 muda | Mantém | Risco e medida |
|---|---|---|---|---|
| **Início** (D5, WB-005/011/012/036) | Cabeçalho bege com endereço e sacola; busca cinza; banner pastel 2:1 raio 8; categorias em círculo cinza; lojas em linha; ofertas; mais vendidos; lojas novas capa | (1) **Faixa de marca** com endereço, sacola, saudação `hero` e **busca embutida**, cantos inferiores 24 a 32, recolhe ao rolar. (2) Banner em cor cheia com foto/arte grande, raio 24, com o próximo à vista. (3) **Tiles de categoria** coloridos (P4). (4) "Abertas agora perto de você" em **carrossel de cards de capa 16:9 raio 16** com tempo e taxa em pílulas sobre a foto; "Todas as lojas" segue em linha. (5) Ofertas numa **faixa de tom suave** full-bleed com cantos superiores 24, fotos 4:5. (6) Mais vendidos com numeral gigante na cor de marca. (7) Aba ativa em pílula + Fill | Endereço sempre visível; busca; tempo e taxa antes do clique; seção sem conteúdo é ocultada; skeleton | Faixa de 168 dp rouba altura: precisa recolher e a **1ª dobra deve mostrar ao menos 1 loja**. Testar em 5,5" |
| **Loja** (D8, WB-016) | Capa 16:9 listrada; logo 56; 3 linhas de info; abas sublinhadas; grade de 2 | Capa 4:3 com scrim e paralaxe; logo da loja 72 em encaixe "alça"; nome `hero` 24 a 32; **nota, tempo, taxa e distância em pílulas** numa linha; **Retira Troca em bloco de tom suave com ícone duotone** (é o diferencial); as linhas de horário e retirada vão para "Informações da loja" (folha); abas viram **chips de seção fixos**; card de produto com raio 16, foto 4:5, botão "+" que vira stepper | Meta de entrega no topo; selos Aberta/Fechada com ícone e texto; banner de loja fechada (agora com ilustração) | Sem foto de capa: layout de cor dominante + inicial da loja (§8) |
| **Produto** (D9, WB-017) | Galeria 1:1; preço 32; chips retos; barra fixa | Galeria **4:5 de sangria total** com conteúdo subindo como folha de raio 24; indicador em pílula; **tamanho em chips de pílula**, selecionado = **preenchido** (mais forte que o contorno de hoje); cor em amostras; "Aceita troca" em bloco de tom suave; **voo da miniatura ao adicionar**; botão vira "Ver sacola" depois de adicionar | Botão **sempre ativo**; "Escolha o tamanho" com balanço; estoque "Restam 2"; preço grande | Foto 4:5 pesa mais: 3 larguras, WebP, placeholder de cor dominante |
| **Sacola** (S1, WB-020/021/022) | Linhas com divisor; cartão de resumo; rodapé | Cabeçalho com logo e nome da loja; foto 80 raio 16 e stepper em pílula; **barra de frete grátis como mini sacola que enche**; resumo em cartão de tom suave raio 16; total `title1`; CTA pílula 56; vazio ilustrado; "desfazer" ao remover | Uma loja por vez com aviso; total final sem surpresa; zona de Decisão (sem gradiente) | Celebração de frete grátis só 1 vez por sacola |
| **PIX** (S5, WB-024/158) | Total, QR 272, código mono, "Copiar código", contador 40, passos | **Estrutura e ordem iguais** (copiar primeiro). Cartão do total em tom suave raio 24; QR em cartão branco raio 24 (**preto sobre branco, zona de silêncio de 4 módulos, sem estilizar nada**); contador em **anel que esvazia** com o tempo dentro (ícone e texto de alerta abaixo de 2 min); "Como pagar" recolhido após a 1ª vez. **Ao confirmar:** anel fecha em check (600 ms), tela inunda na cor de marca, manchete "Pagamento confirmado" e háptico | Botão copiar grande; confirmação automática; aviso de código vencido | **Zona Dinheiro: sem confete antes da confirmação, sem gradiente, sem animação perto do botão.** Anel em `react-native-svg` animado precisa de teste de fps; plano B: barra linear fina |
| **Acompanhamento** (S6/S7, WB-027 a 030) | Linha do tempo vertical + cartão "Agora"; itens; WhatsApp | **Cartão de status de sangria total** na cor de marca (ou tom por etapa) com **ilustração da etapa** (5 spots: recebido, preparando, pronto, a caminho, entregue), manchete `hero` ("Saiu para entrega") e **ETA em numeral 32**; barra de 5 segmentos; linha do tempo detalhada abaixo (recolhível, é a versão acessível); cartão do entregador com WhatsApp em pílula. **Entregue:** celebração curta e CTAs "Avaliar" e "Pedir troca" | Linha do tempo (a11y); contato com a loja; troca com prazo visível; **sem mapa** (HIP-D10) | Estados de falha (recusado, cancelado) usam o vazio ilustrado sóbrio, sem celebração |

**Painéis lojista e admin** (`paineis.html`): mesma paleta e formas, dial **baixo**: barra lateral e cabeçalho podem ganhar cor de marca; tabela e formulário continuam densos e neutros; o único "momento" é o **pedido novo** (alerta sonoro, cartão em destaque, aceitar/recusar com 1 toque). Sem ilustração em tabela; vazios de painel usam o kit.

## 5. Aplicação da logo: processo

### 5.1 O que pedir ao fundador (uma mensagem só)

| Item | Por quê |
|---|---|
| **Arquivo vetorial** (SVG, AI, PDF ou EPS) da logo completa e do símbolo, se existir separado | Cor exata sem conta-gotas; escala sem perda. Em PNG/JPG a gente redesenha o vetor (custo de refino gráfico: **autorização do fundador**) |
| Versões: colorida, branca (negativa), preta (monocromática) | Fundo escuro, foto com scrim, impressão |
| Cores oficiais (hex, RGB, Pantone/CMYK se houver) e **manual de marca** se existir | Fonte única da paleta |
| Nome da **fonte do logotipo** e a licença | Se for usada em `hero`, precisa de licença para app |
| Restrições ("nunca em tal cor") e o sentimento desejado (leve, jovem, premium, popular) | Guia o dial de expressividade |
| Se quer **mascote** ou personagem | Define o kit de ilustração (§3 P6) |

### 5.2 Extrair e validar a paleta

1. **Extrair no vetor**, não no JPG: ler os `fill` do SVG. Registrar hex exato.
2. **Classificar** as cores da logo: **primária** (a mais característica e dominante), **secundária** (2ª cor da logo, ou derivada), **acento** (cor de maior energia, uso em ≤ 10% da área), **neutros** (a temperatura do preto/cinza do logotipo decide neutros quentes ou frios; hoje são quentes).
3. **Testar cada cor** com `pnpm --filter @webag/tokens palette "#RRGGBB" ...`: imprime contraste contra branco e `neutral.900`, uso como texto, uso como ícone/foco e uma **versão escura sugerida**. Decide o papel:

| Caso da cor da logo | Decisão |
|---|---|
| Escura ou média (≥ 4,5:1 com branco) | Ela mesma é `action.primary`; `text.onBrand` = branco; versões 700/800 para hover e pressionado |
| Clara ou viva (amarelo, laranja claro, lima, rosa claro; não passa com branco) | Cor vira **área ampla e ícone de marca com texto escuro** (`text.onBrand` = `neutral.900`, a verificar ≥ 4,5:1). Botão pode ser a cor com texto escuro. **Texto e link usam uma versão escura derivada**, nunca a cor pura |
| Falha com branco e com escuro | Escurecer até passar em um dos dois; registrar em `decisoes.md` |
| Logo com **gradiente** | Token âncora = cor mais representativa; gradiente só em faixa/splash estático (token `gradient.brand`), texto verificado no **pior ponto** do gradiente; nunca animado |
| Logo **monocromática** (preto ou cinza) | Marca = neutro; o **acento é escolha do fundador** (o designer propõe 2 opções com contraste calculado) |

4. **Montar a escala 50 a 900** mantendo o matiz: `600` = cor da marca se passa 4,5:1 com branco; se não passa, `600` é a versão escura aprovada e a cor original fica em `400/500` para áreas amplas. `50/100/200` = tons suaves (fundo de chip, selo, faixa). `300 a 500` e `900`: só decorativos (regra v1 mantida).
5. **Paleta de apoio dos tiles (6 slots):** tons suaves obtidos girando o matiz da marca (análogos e um complementar). **Não inventar agora.** Cada slot: `text.primary` sobre o tom ≥ 4,5:1; ícone/ícone duotone ≥ 3:1; os 6 distinguíveis entre si; **sem depender de cor** para entender a categoria (rótulo sempre visível).
6. **Cores de feedback** (sucesso, alerta, erro, info) continuam funcionais. Se o matiz da marca ficar a ±25° de uma delas (ex.: logo verde vs. sucesso), manter ícone e texto (já obrigatórios) e **não usar a cor da marca para estado de sucesso**; se ainda confundir, ajustar o matiz do feedback e registrar.
7. **Colisão de marca:** comparar o matiz com iFood (vermelho), Mercado Livre e Zé (amarelo), Shopee (laranja), Rappi (coral), Nubank (roxo), Mercado Pago (azul e o teal do PIX `#32BCAD`) [M]. A logo é decisão do fundador; se colidir, o designer **avisa** e diferencia por forma, secundária e movimento, sem vetar.
8. **Rodar `build` e `check`** (§6): a CI reprova par abaixo do AA. Pares novos a acrescentar em `a11y/contrast-pairs.json` na mesma entrega: texto sobre cada `tile.N`; `text.onHero` sobre `surface.hero` (e sobre o ponto mais claro do gradiente, se houver); texto sobre `accent` (se usado como fundo); `accent` como ícone (3:1) sobre cartão e tela.

### 5.3 Regras de uso da logo (parâmetros a confirmar com a logo real)

| Regra | Valor proposto (v1 como ponto de partida) |
|---|---|
| Área de respiro | Metade da altura do símbolo em todos os lados (`x` = a medida que a logo definir, p.ex. altura do "w") |
| Tamanho mínimo | Símbolo 16 px (tela) / 24 dp em cabeçalho; logotipo completo 72 px de largura; ícone do app legível a 48 px (testar) |
| Fundo claro | Versão colorida |
| Fundo escuro, de marca ou foto | Versão branca (negativa); foto só com scrim ≥ 4,5:1 sob a logo |
| Impressão 1 cor, carimbo, fax | Versão preta |
| Contraste da logo contra o fundo | ≥ 3:1 (a WCAG isenta logotipo, mas a gente exige por reconhecimento) |
| Proibido | Esticar, girar, trocar cor, sombra, contorno, efeito, recriar o logotipo em outra fonte, usar o símbolo como ícone de navegação da sacola (esse é Phosphor `Handbag`), sobre foto sem scrim |

### 5.4 Ícone, splash e derivados

| Ativo | Regra | Onde fica |
|---|---|---|
| **Ícone do app (iOS)** | 1024 x 1024, sem transparência e sem cantos (a Apple aplica a máscara); variantes escura e "tinted" do iOS: **[M] verificar suporte na versão do Expo em uso** | `apps/mobile/assets/icon.png` |
| **Ícone Android adaptativo** | Camada de frente com o símbolo dentro do **círculo seguro de 66 dp num canvas de 108 dp (≈ 61%)**; fundo = `brand` do tema; camada **monocromática** para ícone temático do Android 13 ([M], `adaptiveIcon.monochromeImage`) | `adaptive-icon.png` + monocromático |
| **Splash** | Fundo de marca, símbolo 96 a 200 dp, estático (o Android 12+ impõe o ícone em círculo [M]); depois, dentro do app, o símbolo "se desenha" ≤ 800 ms se for a primeira abertura do dia e **sem atrasar** o conteúdo | `splash-icon.png` |
| **Ícone de notificação Android** | Silhueta branca em fundo transparente, 96 x 96 (derivada do símbolo) | novo `notification-icon.png` |
| Favicon e ícone do admin, imagem de compartilhamento, gráfico de 1024 x 500 do Google Play, capturas das lojas | Derivados dos mesmos arquivos; textos de vitrine com o PO (DEC-040a: sem a mensagem regional) | `docs/design/assets/` |
| **Arquivos-fonte** | `docs/design/assets/marca/` com `logo-colorida.svg`, `logo-branca.svg`, `logo-preta.svg`, `simbolo.svg`, `simbolo-mono.svg` | Os de hoje (`webag-simbolo.svg`, `webag-icone-app.svg`) são rascunho da v1 e ficam substituídos |

### 5.5 Derivar tudo de um ponto

```
logo vetorial (docs/design/assets/marca/*.svg)
        │  (cores lidas uma vez)
        ▼
packages/tokens/theme/<nome>.json  ──►  tokens.json ("$theme")  ──►  build  ──►  src/tokens.ts + css/tokens.css  ──►  app, web, admin, protótipos
                                                                         └──►  [novo] gen-brand-assets  ──►  icon, adaptive-icon, splash, notificação, favicon
```

| Passo | Dono | Observação |
|---|---|---|
| 1. Criar `theme/<nome>.json` e trocar `$theme` | designer | §6 |
| 2. `build` e `check` | designer | A CI repete |
| 3. `apps/mobile/app.config.ts`: trocar os 2 `'#00696F'` (fundo do ícone adaptativo e do splash) por `tokens.color.brand[600]` (ou o papel que a logo definir). **É o único lugar fora de `packages/tokens` com a cor de marca escrita** (busca feita em 2026-11-19) | mobile-dev | Conferir se o Expo aceita importar o pacote no config; senão, ler `tokens.json` resolvido |
| 4. Script `gen-brand-assets` (SVG → PNGs nos tamanhos acima, lendo as cores dos tokens) | mobile-dev com designer | Exige dependência de imagem (p.ex. `sharp`): **tech-lead aprova** |
| 5. Protótipos HTML v2: bloco `:root` entre marcadores `/* tokens:inicio */ ... /* tokens:fim */`, regerado de `css/tokens.css` por script | designer | Hoje os 2 protótipos têm cores copiadas à mão (16 e 39 ocorrências de petróleo); sem regerar, a troca deixa os protótipos desatualizados |
| 6. Atualizar `identidade.md` (§2, §3, §7), `design-system.md` §2 e §4, `pesquisa-referencias.md` §3 | designer | Só depois do aceite do fundador |
| 7. Registrar em `decisoes.md` (DEC) a paleta e a logo aprovadas; versão menor dos tokens (`design-system.md` §11) e nota no status | CEO | |

## 6. Tokens: tema trocável (feito) e o que vem com a logo

### 6.1 O que foi feito agora (sem mudar nenhum valor)

| Arquivo | Mudança |
|---|---|
| `packages/tokens/theme/petroleo.json` (novo) | Contém **`color.brand` e `color.neutral`** com os mesmos valores de antes. Único lugar com a paleta de marca |
| `packages/tokens/tokens.json` | `color.brand` e `color.neutral` viram placeholders vazios; novo `"$theme": "petroleo"` (campos `$` são ignorados nas saídas). Todo o resto (semânticos, feedback, tipografia, espaço) **intocado** |
| `packages/tokens/scripts/lib.mjs` | `loadSource()` mescla `theme/<$theme>.json` por cima do `tokens.json` (mescla profunda; chave existente mantém a posição, então a **ordem das saídas geradas não muda**). `WB_THEME=<nome>` sobrescreve só para prévia (avisa no console). Valida o nome do tema e a existência do arquivo |
| `packages/tokens/scripts/palette-report.mjs` (novo) + script `palette` no `package.json` | Relatório de contraste de cores candidatas (§5.2). Não altera arquivo |
| `packages/tokens/package.json`, `README.md` | `theme` em `files`; seção "Temas"; aviso de que o export `@webag/tokens/tokens.json` agora é o arquivo cru, sem paleta |

**NÃO VERIFICADO:** esta sessão não tinha shell, então `build` e `check` **não rodaram**. Pelo raciocínio, o resultado resolvido é idêntico ao anterior. Quem tiver shell (mobile-dev ou CEO) deve rodar, antes de aceitar:

```bash
pnpm --filter @webag/tokens build
git diff --exit-code packages/tokens/src packages/tokens/css    # esperado: sem diferença
pnpm --filter @webag/tokens check                                # esperado: 0 falhas
pnpm --filter @webag/tokens typecheck
```

Se `build` gerar diferença, **reverter** `tokens.json` e `lib.mjs` ao estado anterior (o `theme/` e o `palette-report.mjs` não afetam nada sozinhos) e me devolver o diff.

### 6.2 Como trocar a marca quando a logo chegar

1. `cp packages/tokens/theme/petroleo.json packages/tokens/theme/<nome>.json` e trocar os valores de `color.brand` (50 a 900) e `color.neutral` (0 a 900), seguindo §5.2.
2. Se a cor da marca for clara (texto escuro sobre ela) ou a escala precisar de outro degrau, **sobrescrever no mesmo arquivo** os semânticos que mudam (a mescla permite; chaves do tema vencem):

| Semântico (hoje) | Quando sobrescrever |
|---|---|
| `color.text.onBrand` (`neutral.0`) | Marca clara: apontar para `{color.neutral.900}` |
| `color.action.primary` / `primaryHover` / `primaryPressed` (`brand.600/700/800`) | A cor da marca está em outro degrau |
| `color.text.brand` / `color.text.link` (`brand.700`) | Link precisa de degrau mais escuro |
| `color.border.focus`, `color.action.secondaryBorder` (`brand.600`) | Idem |
| `color.surface.brandSubtle`, `color.action.primarySubtle` (`brand.50`) | Tom suave muda |
| `color.text.inverseAction` (`brand.200`) | Ação sobre fundo escuro |
| `color.feedback.*` | Só se o matiz da marca colidir (§5.2 item 6) |

3. Mudar `"$theme": "<nome>"` no `tokens.json`; `build`; `check`.
4. O tema antigo (`petroleo`) fica no repositório como histórico e para comparação (`WB_THEME=petroleo pnpm --filter @webag/tokens check`).

### 6.3 Tokens novos que entram junto com a v2 (propostos agora, aplicados com a logo)

Nomes e estrutura; **valores de cor ficam em branco até a logo**. Os não cromáticos são [HIPÓTESE] para afinar no aparelho.

| Grupo | Tokens propostos | Onde vivem |
|---|---|---|
| Cor (da logo) | `color.accent.{50..700}` (se houver cor de acento), `color.tile.{1..6}` (tom suave por slot), `color.surface.hero`, `color.text.onHero`, `color.gradient.brand` (só se a logo tiver gradiente) | Escala base no **tema**; semânticos novos no `tokens.json` apontando para o tema |
| Raio | `radius.card` 16, `radius.hero` 32, `radius.sheet` 24, `radius.control` 12, `radius.tag` 8, `radius.pill` 999 (a escala `sm/md/lg/xl/full` existente fica; semânticos novos referenciam) | `tokens.json` |
| Tamanho | `size.tile` 80, `size.heroMin` 112, `size.heroMax` 192, `size.thumbLg` 80 | `tokens.json` |
| Tipografia | `textStyle.hero` 40/44 Bold, sem tabular | `tokens.json` + `native.ts` |
| Movimento | `motion.duration.fly` 400, `celebrate` 1200; molas nomeadas `press`, `pop` (rigidez e amortecimento a afinar) | `tokens.json` (`native` para molas) |
| Háptico, easing | Os atuais bastam | já existem |

Nada disso altera o que o app usa hoje; entra em `0.2.0` dos tokens junto com os componentes novos (`design-system` §11).

## 7. Seis telas-chave para redesenhar quando a logo chegar

Ordem sugerida (do que mais move a percepção de "marca com vida" ao que mais protege o dinheiro):

| # | Tela | Onde está a spec | Entregas |
|---|---|---|---|
| 1 | **Início** | `telas/onda-3-descoberta-cliente.md` D5 | Faixa de marca com busca, banner, tiles de categoria, carrossel de lojas abertas, faixa de ofertas, aba com indicador |
| 2 | **Loja** | D8 | Capa, pílulas de meta, bloco Retira Troca, chips de seção, card de produto novo |
| 3 | **Produto** | D9 | Galeria 4:5, chips preenchidos, voo ao adicionar, barra fixa |
| 4 | **Sacola** | `telas/onda-4-transacao.md` S1 | Frete grátis que enche, resumo, vazio ilustrado |
| 5 | **PIX e pagamento confirmado** | S5 e S6 | Zona Dinheiro sóbria, anel do contador, inundação de cor ao confirmar |
| 6 | **Acompanhamento do pedido** | S7 | Cartão de status ilustrado, ETA, 5 spots, celebração de entrega |

**Kit transversal (mesma entrega, antes das telas):** ícone do app, splash e abertura; tab bar; botão pílula; estado vazio e erro (6 ilustrações); card de loja de capa; card de produto; toast e confirmação de adicionar. **Segunda onda:** painel do lojista (pedido novo), cadastro/entrada, conta e privacidade, troca.

**Formato da entrega:** protótipo `docs/prototipo/app-cliente-v2.html` (1 arquivo, mobile-first, com os estados vazio/erro/carregando e o botão "reduzir movimento") e atualização das specs acima. Os componentes já implementados em `apps/mobile/src/components` (Button, Badge, Banner, Chips, Header, Skeleton, StateViews...) ganham as variantes novas; o `mobile-dev` recebe a lista de desvios na revisão.

## 8. Riscos, validação e perguntas

**Riscos (e a defesa do usuário):**

| Risco | Por que importa | Mitigação |
|---|---|---|
| Expressividade piora a **confiança** do público desconfiado | A identidade v1 foi pensada para "sério e confiável" | Dial por zona (P0); dinheiro e dados sóbrios; teste de 5 segundos com a v1 como controle |
| **Foto grande** depende da foto do lojista | Foto escura ou torta derruba a vitrine | Validar resolução mínima e orientar o recorte no upload (brief §3.2); cor dominante como fundo e placeholder; layout sem foto (cor + inicial); curadoria do admin nos banners |
| **Celular fraco** | Cor e movimento custam; foto 4:5 pesa mais | Só transform/opacity; orçamento de KB; modo leve; medir fps no aparelho de referência antes de aprovar |
| Faixa de marca ocupa altura | Tela de 5,5" mostra menos lojas | Recolhe ao rolar; 1ª dobra com pelo menos 1 loja |
| Logo clara (amarelo, etc.) reprova contraste com branco | Texto branco ilegível | Processo da §5.2 (texto escuro, versão escura para link) |
| Retrabalho de componentes já implementados | `apps/mobile` já tem telas | Trocar por tokens e variantes; a troca de paleta em si é de um arquivo |
| Escopo cresce (3D, mascote, Lottie) | Custo e peso | Padrão = SVG chapado e movimento de código; mascote só se o fundador pedir |

**Como validar (depois do protótipo v2):** 5 moradores, 5 segundos por tela: "parece confiável?" e "parece moderno?" (escala 1 a 5), v1 contra v2; tarefa cronometrada "achar e adicionar um produto" (referência: orçamento do HIP-D08); medir fps no Android de entrada. Meta **[HIPÓTESE]**: v2 ≥ v1 em confiança e **não pior** em tempo de tarefa. Em produção: taxa de adicionar à sacola e de conclusão do checkout (`fluxos.md` §8).

**Perguntas (uma rodada):**
- **Fundador:** (1) arquivo vetorial, manual de marca e fonte do logotipo (§5.1); (2) quer mascote? (3) o clima é leve, jovem, popular ou premium? (4) autoriza orçar refino gráfico se a logo vier só em imagem?
- **PO:** (5) nova copy de posicionamento (DEC-040a) para os banners, saudação e vitrine das lojas; (6) quem fornece fotos de banner e capa no piloto (admin, stock livre)?
- **QA/Tech Lead:** (7) aparelho de referência "Android de entrada" para medir fps; (8) aprovar `sharp` (ou alternativa) para o `gen-brand-assets`; (9) rodar a verificação da §6.1.
- **Segurança:** nenhuma pergunta nova (sem dado pessoal novo; a saudação usa o nome já guardado).
