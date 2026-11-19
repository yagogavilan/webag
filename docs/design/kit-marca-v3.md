# Kit de marca v3: elementos gráficos próprios do Webag

> Autor: product-designer. Data: 2026-11-19. Status: **proposta, aguardando aprovação do fundador** (junto com `direcao-v3.md`). Arquivos em `docs/design/kit/`. Protótipo de aplicação: `docs/prototipo/app-cliente-v3.html`.
> Base: logo v4a (DEC-044), `logo/v4/webag-simbolo-v4a.svg`. Tudo em cor sólida, sem gradiente, sem mascote.

## 1. De onde vem cada elemento (um símbolo, cinco ferramentas)

| Ideia do símbolo v4a | Vira ferramenta | Onde aparece |
|---|---|---|
| **3 barras de velocidade** (pílulas 23 : 49 : 34, recuos 24 / 0 / 18) | Divisor, carregando, progresso, indicador de aba, rastro de movimento, confete | Toda tela; é o "tique" visual do Webag |
| **Lado direito do trapézio inclinado** (≈ 8 graus em média entre os dois flancos) | **Inclinação Webag `--lean: -8deg`**: selos, segmentos de progresso, marca-texto, cortes diagonais de blocos de cor | Selos, progresso, cabeçalhos, faixas |
| **Corpo + alça** | **Palco**: a sacola gigante atrás do produto; corte "alça" opcional | Galeria do produto, banners, celebração |
| **Olhais em espaço negativo** | Círculos vazados na cor do fundo; lente da busca vazia | Palco, ilustrações |
| **Roxo sólido** | Bloco de cor de grande área (nunca tinta pastel) | Cabeçalho da Início, celebração, palco |

## 2. Arquivos

| Arquivo | O que é | Regra principal |
|---|---|---|
| `kit/barras-divisor.svg` | 3 barras inclinadas + fio | Separa blocos dentro de uma tela (resumo, preço). Máx. 1 por dobra |
| `kit/barras-carregando.svg` | Barras entrando em sequência (ciclo 900 ms) | Substitui o spinner genérico em botões e trechos curtos; skeleton continua para listas |
| `kit/barras-progresso.svg` | 5 segmentos inclinados | Progresso do pedido e da troca. Sempre com texto "Etapa N de 5 · nome" |
| `kit/padrao-sacolas.svg` | Ladrilho 120 x 120 tom sobre tom | Splash alternativo, campanha, embalagem. Nunca atrás de texto pequeno |
| `kit/selo-oferta.svg` | Selo inclinado (oferta) e adesivo (sombra dura) | Oferta só com preço antigo visível. Adesivo: 1 por dobra |
| `kit/forma-palco.svg` | Sacola sem barras, olhais na cor do fundo | Atrás de produto; girada -7 graus; nunca atrás de texto |
| `kit/formas-organicas.svg` | Alça cheia, trapézio mole, pílula torta | Fundo de arte em banner e compartilhamento |
| `kit/vazio-sacola.svg` | Sacola parada, boca aberta, etiqueta solta | Sacola vazia |
| `kit/vazio-busca.svg` | Olhal vira lente, barras "procurando" | Busca sem resultado |
| `kit/sem-conexao.svg` | Barras partidas, sacola cinza | Sem internet (sem humor) |
| `kit/celebracao.svg` | Estado final da tela de pedido confirmado | Confirmado, entregue, troca aprovada |
| `kit/etapa-separando.svg`, `etapa-a-caminho.svg`, `etapa-entregue.svg` | Ilustrações de etapa sobre noite | Acompanhamento (a etapa "Confirmado" usa a de separando; "Motoboy na loja" e "A caminho" usam a moto) |

Faltam (2ª rodada, depois do aceite do estilo): erro do servidor, sem pedidos, sem endereço/fora da área, troca aprovada, versão animada (Lottie ≤ 50 KB) só da celebração **[HIPÓTESE: Reanimated basta; Lottie só se o código ficar pior que 60 fps]**.

## 3. Regras de construção das ilustrações

| Regra | Valor |
|---|---|
| Cores | Máx. 4 por peça: roxo `#C02EF0`, noite `#1C1721`, acento `#D6FF4A` (ou sol `#FFC93C`), branco/papel. Roxo.300 `#E198EC` só em barras paradas e confete |
| Forma | Só geometria do símbolo (trapézio, alça, olhal, pílula) + objetos de produto chapados. Sem contorno, sem gradiente, sem textura |
| Profundidade | Sobreposição e sombra dura (deslocamento 3 a 4 px, cor noite) em adesivos; nunca desfoque |
| Personagem | **Nenhum rosto.** Os olhais parecem olhos: não desenhar boca, sobrancelha nem expressão (o fundador vetou mascote, DEC-042) |
| Peso | SVG ≤ 6 KB por peça; no app via `react-native-svg` (componente gerado com SVGR) |
| Tom por estado | Vazio e celebração podem brincar; erro, pagamento e dados pessoais ficam sóbrios (dial de `direcao-visual-v2.md` P0 continua valendo) |

## 4. Selos, adesivos e marca-texto

| Elemento | Forma | Texto | Contraste | RN |
|---|---|---|---|---|
| Selo de oferta `-17%` | raio 7, `skewX(-8deg)` | Figtree 14/800 noite, desinclinado | noite sobre acento 15,3:1 | `View` com `transform:[{skewX:'-8deg'}]` e `Text` com `+8deg` |
| Adesivo ("Mais pedida", destaque de banner) | raio 8, rotação -6 a +8 graus, sombra dura 3/3 noite | Figtree 13/800 noite | 15,3:1 | 2 `View` sobrepostas (sombra = cópia deslocada), sem `shadowRadius` |
| Marca-texto (palavra-chave do título) | bloco acento atrás da palavra, inclinado | a palavra em noite | 15,3:1 | `View` absoluta atrás do `Text`; o título é quebrado em trechos |
| Logo da loja como adesivo | raio 15 a 22, rotação -6, sombra dura 3/3 ou 4/4 | iniciais Bricolage 800 na cor da loja | cor da loja sobre branco (validar por loja ≥ 3:1; senão, noite) | Sem foto de logo: iniciais. Com foto: imagem 1:1 com raio |

## 5. Movimento da marca (implementável em Expo)

Biblioteca: **Reanimated 3** (thread de UI), `expo-haptics`, `react-native-svg`. Sem Skia na 1.0 (o confete cabe em 30 `Animated.View`) **[HIPÓTESE: medir fps no Android de referência]**. Toda animação só usa `transform` e `opacity`; com "reduzir movimento" (`useReducedMotion()`) vira troca direta.

| Nome (token) | O que faz | Curva / duração | Háptico (`expo-haptics`) |
|---|---|---|---|
| `motion.barsIn` | Barras crescem da borda (scaleX 0→1, origem esquerda/direita), atraso 60 ms entre elas | `withTiming` 500 ms, bezier(.2,.8,.2,1) | não |
| `motion.cascade` | Blocos da tela entram de baixo (translateY 18→0, opacity 0→1), atraso 55 ms, **máx. 8 blocos e 1 vez por tela** | 550 ms | não |
| `motion.press` | Escala 0,95 no toque, volta com mola | `withSpring` damping 15, stiffness 400 | `selectionAsync` em chip, aba, tamanho |
| `motion.pop` | Selo, check e contador entram com sobressalto (scale 0→1) | `withSpring` damping 9, stiffness 180 | `impactAsync(Light)` |
| `motion.fly` | Arte do produto voa até a sacola em arco (translate + scale 1→0,06 + rotate -24°) | 560 ms | `impactAsync(Medium)` ao sair, `Light` ao chegar |
| `motion.count` | Número de preço/total rola do valor antigo ao novo (easeOutCubic) | 450 ms; na zona de dinheiro **só em mudança causada pelo usuário**, nunca ao abrir | não |
| `motion.shared` | Foto do card vira a foto da galeria (elemento compartilhado) | 450 ms; fallback: fade 200 ms | não |
| `motion.collapse` | Cabeçalho de cor some e aparece a barra compacta com endereço e busca | `interpolate` no `scrollY`, limiar 250 dp | não |
| `motion.confetti` | 30 formas da marca (pílula, olhal, trapézio, quadrado) saem do selo de check, sobem e caem | 1.500 ms, 1 vez | `notificationAsync(Success)` ao abrir |
| `motion.stage` | Ilustração da etapa troca com sobressalto; segmento atual com faixa de tinta deslizando em loop | 450 ms / loop 1.100 ms (pausa com a tela fora de foco) | `impactAsync(Light)` a cada etapa nova |
| `motion.bob` | Itens da ilustração flutuam 5 px | loop 2.400 ms | não |
| `motion.shake` | Grupo de tamanhos balança 2x 8 px quando escolhe tamanho esgotado ou falta escolher | 350 ms | `notificationAsync(Error)` |

## 6. Aplicação em foto real (quando as fotos chegarem)

| Peça | Hoje (arte) | Com foto |
|---|---|---|
| Card de produto | Arte ampliada 128% e recortada pelo cartão | Foto 4:5 com `contentFit="cover"` e **zoom de recorte** no produto (o lojista recebe guia "produto ocupando 80% do quadro") |
| Palco do produto | Sacola roxa atrás da arte | Mantém o palco **só se a foto tiver fundo removido** (curadoria do admin); senão, foto em sangria total e o palco vira a faixa do indicador |
| Capa da loja | Cor da loja + 3 artes sobrepostas | Foto da fachada ou do produto em 4:3 com o mesmo corte diagonal e o logo-adesivo |
| Banner e cabeçalho | Arte sobre o roxo | Recorte de produto (PNG/WebP com fundo removido) preparado pelo Webag, nunca pelo lojista |
| Sobreposição que sai do cartão | Arte ultrapassa a borda superior | Só em peças curadas (banner, categoria, capa); **nunca** em foto enviada pela loja |
