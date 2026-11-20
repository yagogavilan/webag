# Logo Webag v3: conceitos, cor e geometria

> Autor: product-designer. Data: 2026-11-19. Status: **proposta para o fundador**; substitui a logo v2 (`docs/design/logo/`, derivada do PowerPoint) se aprovada.
> **[NÃO VERIFICADO]** Os SVGs foram escritos à mão, sem renderizar (sem shell). A geometria foi conferida por conta; a aparência real depende do CEO renderizar e me devolver as imagens (§6). Contrastes **calculados à mão** pela fórmula WCAG 2.x; o `check` dos tokens confirma.
> Contexto: DEC-040/041, `identidade-v2.md`, `direcao-visual-v2.md`. Fundador: autonomia total, manter o roxo, cor sólida, sem gradiente, sem mascote, clima leve e jovem.

## 1. Diagnóstico da logo atual (fatos do PNG de referência)

| Problema | Efeito |
|---|---|
| 6 linhas de velocidade + caixa "we" + "bag" vazado + alça cinza = 4 ideias num símbolo | Não reduz: a 48 px vira mancha; a 16 px não existe |
| Alça cinza `#CCCCCC` fina, de 2 traços, sobre branco (≈1,6:1) | Some em fundo claro e no ícone; é a parte mais "PowerPoint" |
| Nome dentro da sacola, em branco vazado | Ícone do app não pode ter texto; o símbolo não existe sem a palavra |
| Retângulo/degraus/"risquinhos" do PDF | Artefatos de exportação |
| Duas cores + recortes | Não é "uma cor sólida"; mono e branca exigem máscara |

Mantido: sacola + movimento para a direita + magenta. Isso é o patrimônio de reconhecimento do fundador.

## 2. Pesquisa (com limites declarados)

| Achado | Fonte | Uso |
|---|---|---|
| Ícones simples são mais fáceis de reconhecer; evitar texto no ícone; testar reduzindo a ~29 px; preferir gráfico a foto; fundo dominante + símbolo contrastante; evitar traço fino | Resumo da Apple HIG e guias de ASO: [Anything](https://www.anything.com/blog/ios-app-icon-guidelines), [ASOMobile](https://asomobile.net/en/blog/app-icon-trends-and-best-practices-2025/), [MobileAction](https://www.mobileaction.co/guide/app-icon-guide/); HIG: [developer-rno.apple.com](https://developer-rno.apple.com/design/human-interface-guidelines/foundations/app-icons) | Símbolo sem texto, traço grosso único (14 de 104), versão simplificada de 16 px |
| Tendência 2026: logo tipográfico forte; geometria com calor ("organic geometry"); logos prontos para movimento; elaborado perde para legível | [ManyPixels](https://www.manypixels.co/blog/brand-design/logo-design-trends), [WebDesignerDepot](https://webdesignerdepot.com/?p=65256), [Vistaprint](https://www.vistaprint.com/hub/logo-design-trends), [Shopify](https://www.shopify.com/blog/logo-trends) | Palavra grande e própria; barras = animação de abertura/carregando |
| Cores de marca: Uber Eats `#06C167`, Mercado Livre `#FFE600`/`#2D3277`, Glovo `#00A082`/`#FFC244` | [BrandPalettes](https://brandpalettes.com/uber-eats-logo-colors/), [brandcolorcode ML](https://www.brandcolorcode.com/mercado-livre), [brandcolorcode Glovo](https://www.brandcolorcode.com/glovo) | Mapa da categoria (§4) |
| Nubank `#820AD1` (valor mais repetido nas fontes; um export divergente diz `#8d0de3`) | [thesvg.org](https://thesvg.org/icon/nubank), [shadcn.io](https://www.shadcn.io/design/nubank) | Vizinhança do roxo (§4). Conferir no guia oficial |

**Não consegui confirmar** (busca sem retorno ou domínio bloqueado: uxstudioteam.com, fastcompany.com): redesenhos recentes de iFood, Rappi, Shopee, Magalu, Wolt, Zé Delivery, Temu; "formas arredondadas" e "espaço negativo" como tendência 2025-26 (as fontes citam geometria, tipografia e movimento, não esses dois). Tudo abaixo marcado **[M]** é de memória e deve ser conferido antes de virar argumento público:
- **[M]** iFood: wordmark vermelho em letra arredondada, sem símbolo. Rappi: bigode (mascote de fato). Zé Delivery: personagem (mascote). Glovo: símbolo próprio. Nubank, Uber Eats, Wolt, Temu: wordmark como elemento principal. Padrão da categoria: **marca chapada, uma cor, wordmark forte, sem gradiente**.
- **[M] Shopee usa uma sacola com alça** (laranja, com "S"). É o concorrente direto no mesmo desenho. Defesa: cor (violeta, não laranja), 3 barras, inclinação, ausência de letra dentro do corpo. **Teste de 5 segundos obrigatório.**
- **[M]** Android adaptativo: tela de 108 dp, zona segura círculo de 66 dp. iOS: 1024 sem transparência, o sistema arredonda.

## 3. Três conceitos

| | A. **Sacola Veloz** (recomendado) | B. **Sorriso** | C. **Alvo** |
|---|---|---|---|
| Ideia | Corpo arredondado **inclinado 8°** para a frente + **alça em arco grosso**, contínua, fundida ao corpo + **3 barras** de velocidade | Quadrado de cantos generosos; a alça é um **arco em espaço negativo** dentro do corpo (alça caída pela frente = sorriso discreto) + 2 barras | Corpo reto + alça em **argola com ponto no centro** (pin / botão de clique) + 3 barras |
| Alça | Mesma espessura das barras (14): alça, barras e haste do "b" falam a mesma língua | Negativo; some a alça saliente | Anel; é a parte mais "tecnológica" |
| Por quê | Evolui a logo do fundador (mesma sacola, mesmo movimento, mesma família de cor): sem reset de marca. Lê "sacola" em menos de meio segundo, até em 16 px. Inclinação e barras dão velocidade sem texto. Formas primitivas: fácil de animar (barras entram, sacola assenta) | Silhueta compacta, a melhor em 16 px e no ícone, simpática | A mais ownable e a que pede menos explicação de "tech"; conversa com o pin de endereço |
| Risco | A mais segura; a inovação está na simplificação e na geometria, não numa ideia nova. **Cadeado**: arco + corpo largo; evitei com alça larga (71% do corpo) e as barras | Sem alça saliente a leitura de sacola cai; parente do sorriso da Amazon **[M]**; pode virar "cartão com emoji" | Pode virar etiqueta de preço; o pin lembra "regional", tirado da mensagem em DEC-040 |
| Palavra | Outfit 700 | Sora 700 (mais larga e técnica) | Fredoka 700 (continuidade com a v1) |
| Arquivos | Os 6 pedidos | `webag-conceito-b-sorriso.src.svg` | `webag-conceito-c-alvo.src.svg` |

### Recomendação: **A, Sacola Veloz**
1. Pontua mais nos critérios do fundador: reconhecível, jovem (inclinação, cantos grandes, traço grosso), tecnológica (geometria pura, monoline), cor sólida, 16 px.
2. É a única que **preserva o reconhecimento** que o fundador já construiu (sacola + velocidade + magenta); B e C são marcas novas.
3. Crítica honesta: se o fundador quer uma **ruptura** e não uma evolução, C é a candidata. Não recomendo B como logo principal; serve como inspiração para o estado "vazio".
4. Mudanças em relação à logo atual, todas intencionais: 6 linhas viram 3; a alça cinza fina vira arco roxo grosso; a caixa "we" e o "bag" vazado saem; o nome vai **para fora** da sacola (o símbolo vira ícone sem texto); duas cores viram uma.

## 4. Análise do roxo

**Decisão: afinar, não trocar de família.** Marca viva `#C44DD9` → **`#C02EF0`** (mais saturada e mais azulada, mesma vizinhança do magenta-violeta). Ação/texto profundo `#A02DB8` → **`#A21FBE`**.

| Opção | Hex | Matiz | Branco sobre ela | Distância ao Nubank (276°) | Veredito |
|---|---|---|---|---|---|
| Atual | `#C44DD9` | 291° | 3,88 | 15° | Orquídea: meio-tom, mais "doce/beleza" que "tech"; fica opaca ao sol |
| **Recomendada** | **`#C02EF0`** | **285°** | **4,30** | **9°** | Magenta-violeta elétrico: sRGB quase no teto de saturação (87%), +0,4 de contraste |
| Variante rosada | `#D02EF0` | 290° | 3,94 | 14° | Plano B se o teste de 5 s disser "Nubank" |
| Violeta elétrico | `#8B3DFF` | 264° | 4,99 | 12° (lado azul) | Rejeitada: zona lotada (Nubank, e Twitch `#9146FF` **[M]**), perde a herança magenta do fundador. Único mérito: passaria AA em texto |
| Nubank **[M]** | `#820AD1` | 276° | 7,22 | , | Referência: bem mais escuro (luminância ≈ 0,095 contra 0,194 da nossa) |

- **Por que mudar:** o fundador deu liberdade; o ganho concreto é contraste do branco (3,88 → 4,30, no ícone e na logo branca), energia (saturação 64% → 87%) e um tom menos "doce". **Custo:** a marca se aproxima 6° do Nubank (15° → 9°). Compenso com luminosidade (quase o dobro da dele), saturação, forma de sacola e a barra de velocidade; **não resolvo com certeza**: o teste de 5 segundos continua obrigatório, e a variante rosada é o plano B.
- **Vizinhança da categoria [HIPÓTESE, inferência das cores da tabela §2 e de memória]:** delivery/marketplace usa vermelho, laranja, amarelo, verde e azul. Magenta-violeta é espaço livre na categoria, o que ajuda a diferenciar; o vizinho de matiz é fintech (Nubank), não concorrente direto.
- **Brand viva `#C02EF0`:** branco 4,30 (texto grande e gráfico; **não** corpo de texto), `neutral.900` `#1C1721` sobre ela 4,10. Sobre fundo escuro `#1C1721` a marca dá 4,10: serve a logo e o ícone.
- **Ação profunda `#A21FBE`:** branco 6,04 (era 5,90); matiz 289°, saturação 72%: casa com a viva, o `#A02DB8` antigo (61%) ficaria "lavado" ao lado dela. Regra da v2 mantida: **viva em área, símbolo, ícone e texto grande branco; profunda em botão, link e texto**.
- **Para o CEO atualizar os tokens (não toquei nenhum):** `brand.500` = `#C02EF0`; `brand.600` = `#A21FBE`; `brand.700/800/900` sugeridos **[HIPÓTESE, rodar o check]** `#8618A3`, `#6A1580`, `#4A0F58`; `brand.50-400` podem ficar (matiz 290°, diferença de 5° é imperceptível em tons claros). Reconferir `text.onHero` (branco sobre `500` agora 4,30), os 51 pares do `contrast-pairs.json` e o splash/ícone adaptativo.
- A logo **não usa cinza**: a alça cinza `#CCCCCC` sai (1,6:1 sobre branco).

## 5. Especificação do conceito A

### 5.1 Geometria (unidade t = 14 = espessura do traço)

| Arquivo | viewBox | Conteúdo |
|---|---|---|
| `webag-simbolo.src.svg` | `0 0 160 104` | Barras: rect `34,34 23x14`, `0,62 49x14`, `18,90 31x14`, todos rx 7. Sacola (grupo `translate(14.6 0) skewX(-8)`): corpo rect `56,34 96x70 rx18`; alça: arco de semi-elipse `M70 44 A34 37 0 0 1 138 44`, traço 14, centro (104,44), ápice externo y=0 |
| `webag-logo*.src.svg` | `0 0 470 126` **provisório** | Símbolo em 0..160 × 0..104; palavra "webag" `x=182`, linha de base `y=104`, `size=96`, `tracking=-2`. Largura estimada da palavra ≈ 2,9 × 96 ≈ 280 (fim ≈ x 462). Descendente do "g" ≈ y 124 |
| `webag-icone-app.src.svg` | `0 0 1024 1024` | Fundo sólido; símbolo branco `translate(230.4 345.6) scale(3.2)` (512 × 333 px); guias ocultas: círculo seguro r 313, quadrado iOS rx 229 |
| `webag-favicon.src.svg` | `0 0 32 32` | Ladrilho rx 7 + símbolo branco sem inclinação, 2 barras, traço 3, `translate(0.75 -2)` |

Lógica: barras alinhadas ao topo e à base do corpo (34 e 104) com vão = altura (14); fim das barras segue a inclinação do corpo (57, 49, 49 = vão ≈ 12 contra a borda esquerda real, já contando o raio do canto). A alça sai do centro do corpo (x 104), largura 71% do corpo. **Ascendente do "b" ≈ topo do corpo (y 34) e linha de base = base do corpo (y 104)** (a conferir com a medida real); haste do Outfit 700 a 96 ≈ 13-14, igual a t **[HIPÓTESE, conferir na conversão]**.

### 5.2 Regras de uso (substituem identidade-v2 §2.2 se aprovadas)

| Regra | Valor |
|---|---|
| Respiro | 28 unidades (2t) do símbolo em todos os lados (27% da altura do símbolo) |
| Mínimo | Logo horizontal: **88 px** (altura-x da palavra ≥ 9 px) / 22 mm. Símbolo: 24 px. Abaixo: favicon (16-23 px) |
| Fundo claro | Logo colorida `#C02EF0`. Fundo escuro `#1C1721`: colorida também (4,10) ou branca |
| Fundo roxo (viva ou mais escura) | Logo branca. Nunca colorida sobre roxo |
| Mono | `#1C1721`, impressão 1 cor; qualquer cor única trocando as 5 ocorrências |
| Nunca | Gradiente, sombra, brilho, contorno, esticar, girar, redigitar "webag" em fonte, reintroduzir a alça cinza, texto dentro da sacola |
| Ícone de notificação Android | Silhueta branca 96 × 96 do favicon (a produzir após render) |

### 5.3 Testes que dependem de render (CEO, ver §6)
Mostrar o símbolo e o favicon a **16, 32, 48** e o ícone a **60 e 1024 px**, sobre branco e `#C02EF0`: (1) a 16 px a sacola lê como sacola e não como cadeado? (2) a 48 px as barras ainda se separam do corpo (vão de 12/104 = 11%)? Se virarem mancha, cair para 2 barras no símbolo de 24-47 px. (3) Teste de 5 segundos com moradores: "o que é? parece qual app?" (cuidado: Shopee, Nubank).

## 6. O que o CEO deve fazer

1. Rodar `TEXT2PATH` nos 5 SVGs com palavra: `webag-logo`, `-branca`, `-mono` (Outfit 700), `conceito-b` (Sora 700), `conceito-c` (Fredoka 700). Se o marcador pedir outro formato de fonte, são as de `docs/design/fonts/` e `/candidatas/`.
2. Devolver a imagem renderizada de `webag-logo` (fundo branco e roxo) **com a caixa real da palavra (largura, altura do "b", descendente)** para eu fixar `x`, `size` e o viewBox final.
3. Renderizar o símbolo e o favicon a 16/32/48, o ícone a 1024 (guias ligadas) e os conceitos B e C ao lado do A para o fundador escolher.
4. Só depois de aprovado: atualizar tokens (§4) e retirar `docs/design/logo/*.svg` da v2.

## 7. Perguntas

- **Fundador:** (1) aceita o ajuste do roxo `#C44DD9` → `#C02EF0` (e `#A02DB8` → `#A21FBE`)? (2) prefere evolução (A) ou ruptura (C)? (3) concorda em tirar a alça cinza e o nome de dentro da sacola?
- **CEO/PO (decisão com efeito em DEC-041):** o argumento para a Fredoka nos títulos era "família da logo". A logo nova usa **Outfit**; Fredoka passa a ser só uma escolha de tom. Opções: (a) trocar os títulos para Outfit (menos uma fonte, mais coerente, mais "tech"), (b) manter a Fredoka (mais lúdica, mas desalinhada da logo), (c) usar Fredoka 700 na palavra (conceito C). Recomendo (a); decisão de tipografia é do CEO, aprovada pelo fundador.
- **Security/PO:** nenhum dado pessoal envolvido. Registro de marca (INPI): pesquisar anterioridade de "Webag" e do símbolo antes de investir em impressos **[a verificar, custo é decisão do fundador]**.
