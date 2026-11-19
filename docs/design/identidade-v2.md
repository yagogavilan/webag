# Identidade Webag v2: derivada da logo do fundador (DEC-040)

> Autor: product-designer. Data: 2026-11-19. Status: **proposta para aprovação do fundador**. Substitui `identidade.md` (petróleo, v1) quando aprovada. Cores, tipografia, formas e movimento aqui; zonas de expressividade, telas e catálogo geral de microinterações em `direcao-visual-v2.md` (não repito: linko).
> Fontes de verdade: cores e contrastes em `packages/tokens/theme/webag.json` + `a11y/contrast-pairs.json`; logo em `docs/design/logo/`. Marcas: **[HIPÓTESE]** = a validar; os contrastes foram **calculados à mão** pela fórmula WCAG 2.x e o `check` confirma (ele avisa se alguma razão divergir mais de 0,15 do documentado).

## 1. Decisões de marca (resumo)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Magenta `#C44DD9` é a marca** e vira `brand.500`, intocado. Aparece em áreas amplas, símbolo, ícone do app, ilustração e texto grande em branco | É a cor do fundador; as áreas amplas são onde ela tem energia |
| 2 | **Botão, link e texto de marca usam uma versão profunda: `brand.600 #A02DB8` (5,9:1 com branco)** | `#C44DD9` com branco dá 3,88:1: falha AA em texto normal (4,5). Escolhi 5,9 e não 4,9 de propósito: sol na tela de Android de entrada come contraste, e `600` ainda passa em hover e pressionado |
| 3 | Neutros com fio de ameixa (matiz ~290, saturação baixa), fundo de tela `#FAF8FB` | O bege quente da v1 brigava com o magenta; esse neutro faz o magenta parecer mais limpo |
| 4 | **Fredoka** (a família da logo, sucessora da Fredoka One) para títulos, números de marca e momentos de celebração; **Figtree** para tudo que se lê e se calcula | Personalidade onde há emoção; legibilidade onde há dinheiro |
| 5 | **Linhas de velocidade** da logo viram o elemento gráfico da marca (cabeçalho, carregando, "a caminho", confirmação) | É o que a logo tem de único (entrega rápida). Sem gradiente, sem textura |
| 6 | Acento de apoio **"sol" `#FFC93C`**, ≤ 3% da tela, só em selo de promoção **[HIPÓTESE, validar com o fundador]** | Magenta + amarelo é energia de varejo e atrai o olho para a oferta. Alternativa se ele não gostar: azul-tinta `#2B3A8C` (mais sóbrio, menos promoção) |
| 7 | 6 tons suaves para **tiles de categoria** (lilás, pêssego, menta, céu, manteiga, rosa) | Quebra a monotonia sem inventar uma 2ª cor de marca |
| 8 | Feedback (sucesso, alerta, erro, info) **mantido** | Já comprovado em AA; nenhum deles está a ±25° do matiz da marca (290°; o mais próximo é o azul, 217°); estado sempre com ícone e texto |

**Riscos que o fundador deve conhecer**
- **Parecer Nubank.** O violeta do Nubank (`#820AD1`, matiz ~276° **[M, de memória, conferir]**) é vizinho do nosso `600` (matiz 290°). Defesa: o herói usa o magenta vivo `500` (mais rosado), a forma é pílula/sacola (não o "N"), Fredoka e o acento sol; **`brand.800/900` nunca em área ampla**. [HIPÓTESE: teste de 5 segundos com moradores]
- **Magenta saturado cansa em tela cheia.** Regra: no máx. ~40% da área nas telas de descoberta e 0% em PIX/cartão além do botão (direcao-visual-v2 P1).
- **Vermelho de erro × magenta.** Distintos (matiz 3° × 290°), mas em daltonismo vermelho-verde ambos escurecem; erro sempre com ícone e texto.

## 2. Logo

**Fatos (arquivo do fundador, `logo-referencia/`):** sacola de alças cinza (`#CCCCCC`), corpo magenta (`#C44DD9`), linhas de velocidade em pílula saindo pela esquerda (altura ≈ 1/16 da logo), "bag" vazado em branco, "we" em caixa vazada com o "w" estendido como linha de velocidade. Tipografia dos glifos: Fredoka One, já em curvas (vetor).

### 2.1 Arquivos (`docs/design/logo/`)

| Arquivo | O que é | Usar em |
|---|---|---|
| `webag-logo.svg` | Logotipo completo colorido, 200 x 148, fundo transparente | Fundo claro (`#FFFFFF`, `neutral.50`, `brand.50`): landing, login do painel, e-mail, slides claros, cabeçalho claro |
| `webag-logo-branca.svg` | Logotipo completo branco (recortes transparentes de verdade) | Faixa e fundo magenta (`500/600/800/900`), foto **com scrim**, slides de capa |
| Monocromática | Mesmo arquivo da branca, trocando o único `fill="#FFFFFF"` por `#1C1721` | Impressão 1 cor, carimbo, documento fiscal |
| `webag-simbolo.svg` | Só a sacola com alça e linhas, colorido, 196 x 148 | Avatar da Webag, cabeçalho compacto, estados vazios, favicon (≥ 32 px), assinatura de e-mail |
| `webag-icone-app.svg` | 1024 x 1024, fundo magenta, símbolo branco, sem cantos, com guias ocultas (`id="guias"`) | Ícone iOS e Android (fonte); `id="simbolo"` = camada de frente do adaptativo |

Os arquivos usam **máscara SVG** (uma cor + recortes), então o fundo aparece por dentro das letras. **[NÃO VERIFICADO]** Escrevi o SVG à mão sem renderizar (sem shell). Antes de usar: abrir os 4 no navegador e comparar com `logo-referencia/webag-logo.png`; diferenças esperadas e **intencionais**: sem retângulo branco de fundo, sem o degrau de 0,5 unidade no canto inferior direito e sem o "risquinho" no começo da linha de baixo (artefatos do PDF). Se algo divergir, a logo de referência do fundador manda: devolver o caso ao designer.
O símbolo é uma **derivação** (linhas regulares de 9,2 e fendas de 8,8, sem a caixa do "we"), não o recorte da logo: o fundador deve aprovar.
Os `docs/design/assets/webag-*.svg` (v1, petróleo) ficam obsoletos; apagar na limpeza.

### 2.2 Regras de uso

| Regra | Valor |
|---|---|
| Respiro | **x = altura do "a" de "bag"** (19% da altura da logo) livre em todos os lados; símbolo: x = 1/8 da altura do símbolo |
| Tamanho mínimo | Logotipo: **80 px** de largura na tela (20 mm impresso). Símbolo: **32 px** (6 linhas ficam legíveis); abaixo disso, usar o **símbolo simplificado** (sacola + 3 linhas), a produzir junto com favicon 16 px e ícone de notificação Android (silhueta branca, 96 x 96) |
| Fundo claro | Logo colorida |
| Fundo magenta | Logo branca. Branco sobre `#C44DD9` = 3,88:1 (passa 3:1 de gráfico; logotipo é isento do 1.4.3, mas mantemos ≥ 3 por reconhecimento). Sobre `600`/`800`: 5,9 e 10,1 |
| Fundo foto | Branca, só sob scrim `overlay.scrim` (72%, 6,97:1) |
| Monocromática | Impressão 1 cor; `neutral.900 #1C1721` sobre claro |
| Nunca | Esticar, girar, trocar cor, sombra, contorno, gradiente, **redigitar "webag" em fonte** (use só o arquivo), alça colorida, logo colorida sobre magenta, logo sobre foto sem scrim, usar o símbolo como ícone de sacola da navegação (esse é Phosphor `Handbag`) |

### 2.3 Ícone do app e splash

| Item | Especificação |
|---|---|
| Ícone iOS | `webag-icone-app.svg` exportado em PNG 1024, **sem transparência, sem cantos** (a Apple arredonda). Variantes escura e "tinted": verificar suporte da versão do Expo em uso |
| Android adaptativo | Fundo sólido `#C44DD9` (= `tokens.color.brand[500]`, **não** o `600` que está no `app.config.ts` hoje) + frente = `id="simbolo"` (escala 2,6: todo o desenho cabe no círculo de 313 px = zona segura 66 dp de 108). Monocromático (Android 13): símbolo em uma cor |
| Teste de legibilidade | A 48 px as linhas devem se ler como textura e a sacola como forma; se virar mancha, usar o símbolo simplificado |
| Splash | Fundo `#C44DD9` chapado, símbolo branco **144 dp de largura** (cabe no círculo de 192 dp do splash do Android 12+), estático. Dentro do app, na 1ª abertura do dia, as linhas entram da esquerda (§5), ≤ 800 ms, sem atrasar o conteúdo |
| Contraste do ícone | Branco sobre magenta 3,88:1: é gráfico (3:1), aceito. Ícone com fundo `600` seria 5,9:1 mas perde a vivacidade da marca; **prefiro o `500`** |

## 3. Cor

### 3.1 Escala de marca (matiz 290°, derivada de `#C44DD9`)

| Token | Hex | Branco sobre ele | `neutral.900` sobre ele | Papel |
|---|---|---|---|---|
| `brand.50` | `#FBF1FD` | 1,10 | 16,00 | Fundo de seção, `surface.brandSubtle` |
| `brand.100` | `#F6E0FA` | 1,24 | 14,21 | Chip, selo suave, tile 1, pressionado do suave |
| `brand.200` | `#EDC2F4` | 1,54 | 11,41 | Ação sobre fundo escuro (snackbar), ilustração |
| `brand.300` | `#E198EC` | 2,12 | 8,30 | Só decorativo |
| `brand.400` | `#D370E3` | 2,92 | 6,03 | Só decorativo |
| **`brand.500`** | **`#C44DD9`** | **3,88** | 4,53 | **Marca**: faixa, símbolo, ícone, aba ativa, **texto grande branco** |
| **`brand.600`** | **`#A02DB8`** | **5,90** | 2,98 | **Ação**: botão, foco, ícone ativo |
| `brand.700` | `#86249B` | 7,67 | 2,28 | Texto e link de marca; hover do botão |
| `brand.800` | `#6B1C7D` | 10,06 | 1,74 | Pressionado; faixa profunda (texto branco de qualquer tamanho) |
| `brand.900` | `#4A1356` | 13,83 | 1,27 | Só decorativo (splash alternativo, ilustração) |

**Texto sobre a marca exata (`500`):** só **branco e grande** (≥ 24 px, ou ≥ 19 px em Fredoka 700 = 14 pt negrito): 3,88 ≥ 3. Token `text.onHero`. Texto escuro sobre `500` dá 4,53 (passa por pouco): não usar como regra. **Botão sobre faixa magenta:** claro (fundo branco, rótulo `brand.700` 7,67:1); o contorno branco sobre magenta é 3,88 ≥ 3.

### 3.2 Neutros (fio de ameixa) e papéis

| Token | Hex | Uso | Contraste (branco / `50` / `100`) |
|---|---|---|---|
| `neutral.0` | `#FFFFFF` | Cartão, texto sobre cor | |
| `neutral.50` | `#FAF8FB` | Fundo de tela | |
| `neutral.100` | `#F3F0F5` | Fundo rebaixado, skeleton claro | |
| `neutral.200` | `#E8E3EB` | Divisor, skeleton, desabilitado | |
| `neutral.300` | `#D6CFDB` | Borda decorativa | |
| `neutral.400` | `#B3ABB9` | Só decorativo / texto desabilitado | |
| `neutral.500` | `#837A8A` | **Só não texto**: borda de campo, ícone inativo | 4,10 / 3,89 / 3,63 |
| `neutral.600` | `#5F566A` | Texto secundário | 6,94 / 6,57 / 6,15 |
| `neutral.700` | `#443C4C` | Texto forte secundário | |
| `neutral.800` | `#2C2632` | Ícone, rótulo de tile | |
| `neutral.900` | `#1C1721` | Texto principal; superfície inversa | 17,59 / 16,66 / 15,57 |

Semânticos (inalterados, só repontados): `action.primary` = `600`, hover `700`, pressionado `800`; `text.brand` e `text.link` = `700` (6,97 sobre `brand.50` e 6,19 sobre `brand.100`; com `600` passaria, mas com 5,36 e 4,76, margem curta ao sol; `700` mantém folga); `border.focus` = `600` (5,90 / 5,58); `surface.hero` = `500`, `surface.heroDeep` = `800`.

### 3.3 Regra 60-30-10 (de tela, não de paleta)

| Fatia | O que é | Tokens |
|---|---|---|
| **60% neutro** | Fundos, cartões, texto, divisores, fotos dos produtos | `neutral.*`, `surface.*` |
| **30% marca** | Faixa de cabeçalho, banner, tile lilás, ação, aba ativa, ilustração | `brand.50-200` (áreas), `brand.500` (herói), `600-700` (ação, texto) |
| **10% apoio** | 5 tiles pastel (≤ 7%) e acento sol (≤ 3%) e o feedback quando existir | `tile.2-6`, `accent.base`, `feedback.*` |

Regras: (1) **uma cor de destaque por região**: no máx. um herói magenta e uma faixa suave por dobra; (2) o **sol só em selo de promoção/preço riscado, sempre com texto escuro** (11,45:1), nunca texto amarelo sobre branco (1,54), nunca como alerta (o alerta é âmbar `#7A4E00` com ícone e texto); (3) **tile** sempre com texto `neutral.900` (13,9 a 15,5:1) e rótulo visível; (4) sem gradiente (a logo não tem); (5) **zona Dinheiro** (PIX, cartão, total): magenta só no botão `600` e no cartão de total em `brand.50`.

### 3.4 Tiles de categoria (6 slots)

| Slot | Nome | Fundo | Tinta do ícone | Texto sobre o fundo | Ícone sobre o fundo |
|---|---|---|---|---|---|
| `tile.1` | Lilás | `#F6E0FA` | `#86249B` | 14,21 | 6,19 |
| `tile.2` | Pêssego | `#FFE3D1` | `#A8400A` | 14,37 | 5,04 |
| `tile.3` | Menta | `#D6F2E3` | `#1B6E3C` | 14,80 | 5,30 |
| `tile.4` | Céu | `#DAE9FB` | `#28569E` | 14,26 | 5,84 |
| `tile.5` | Manteiga | `#FFF0BF` | `#7A4E00` | 15,47 | 6,33 |
| `tile.6` | Rosa | `#FFDCE6` | `#A3214F` | 13,93 | 5,76 |

Tinta de `tile.3/4/5` reaproveita as cores de feedback só como **tinta de ícone**: sem texto e sem ícone de estado no mesmo tile. O admin escolhe slot e ícone Phosphor (duotone) por nome.

## 4. Tipografia

| Estilo (`textStyle`) | Família | Tamanho/linha | Peso | Uso |
|---|---|---|---|---|
| `hero` (novo) | Fredoka | 40/48 | 700 | Saudação da Início, manchete de sucesso, banner |
| `display` | Fredoka | 32/40 | 700 | Título de tela de destaque, vazio |
| `title1` | Fredoka | 24/32 | 600 | Seção de destaque, nome da loja |
| `title2` | Fredoka | 20/28 | 600 | Seção de lista |
| `numeralBrand` (novo) | Fredoka | 40/48 | 700 | ETA ("12 min"), posição no ranking, benefício (sem dinheiro) |
| `body` | Figtree | 16/24 | 400 | Texto corrido (nunca < 16) |
| `bodyStrong`, `label` | Figtree | 16/24 | 600 | Rótulo de botão e campo |
| `caption`, `captionStrong` | Figtree | 14/20 | 400, 600 | Metadado |
| `micro` | Figtree | 12/16 | 600 | Selo (uso mínimo) |
| `price` | Figtree | 20/28 | 700 tabular | **Todo valor em R$** |
| `numeral` | Figtree | 40/48 | 700 tabular | Contador do PIX |

- **Preço e cronômetro ficam em Figtree** (dígitos tabulares): Se os dígitos da Fredoka forem proporcionais (provável, **[HIPÓTESE: conferir `tnum` nas duas fontes na prova de tela]**), o contador do PIX "pularia" a cada segundo. É a zona Dinheiro: o valor e o tempo ficam na fonte que não surpreende.
- Fredoka 500 só ≥ 20; Fredoka nunca em corpo, botão, campo ou tabela.
- Fontes (OFL, já no repo): web `docs/design/fonts/*.woff2` (Fredoka 500/600/700, Figtree 400/600/700/800; usar `font-display: swap` e só 400/600/700 do Figtree). **Mobile não lê woff2**: usar `@expo-google-fonts/fredoka` (`Fredoka_500Medium`, `Fredoka_600SemiBold`, `Fredoka_700Bold`; **[conferir nomes]**) ao lado do Figtree. Medir o peso total antes de fechar (orçamento de 150 KB da v2).
- A logo usa Fredoka **One** (já em curvas); o tipo do produto usa Fredoka variável: parecem irmãs, não idênticas. Aceito: o logotipo nunca é redigitado.

## 5. Forma e linhas de velocidade

**Formas (ecoam a sacola e a pílula):** corpo da sacola ≈ 15% de raio sobre a largura; linha = pílula (raio = metade da altura).

| Elemento | Raio (token) |
|---|---|
| Botão, chip, selo de status, busca, stepper | `pill` 999 |
| Campo de texto | `control` 12 |
| Selo de texto curto | `tag` 8 |
| Cartão, foto, tile | `card` 16 |
| Folha, cartão-herói, banner | `sheet` 24 |
| Faixa de cabeçalho (cantos inferiores) | `hero` 32 |

**Linhas de velocidade (o motivo da marca).** Regras:
1. Sempre **horizontais**, pílulas de altura 8 dp (ou 4/12/16 em escala), vão = altura, **3 a 5 linhas**, comprimentos irregulares na razão ≈ 1 : 0,55 : 0,8 : 0,35 (a da logo).
2. **Movem-se e apontam para a direita** (sentido de ida); nunca verticais, nunca atrás de texto.
3. Cor: `brand.100/200` sobre claro; **branco a 24%** sobre magenta; `brand.500` no estado "a caminho". Nunca na zona Dinheiro.
4. Onde: (a) fundo do cabeçalho magenta (canto esquerdo, recortado pela borda), (b) carregamento de tela e botão pesado (> 600 ms), (c) etapa "A caminho" do pedido, (d) abertura do app, (e) pedido confirmado.
5. Nada de lista, cartão ou tabela com linhas decorativas.

**Ilustração (kit de estados):** formas chapadas em `brand.500/200/100`, alça cinza `#CCCCCC`, branco, no máx. 3 cores por peça, sem contorno, sem gradiente, SVG ≤ 6 KB; as 6 de vazio/erro e 5 de etapa do pedido da direcao-visual-v2 §3 P6 compõem **sacola + alça + linhas** (ex.: sacola vazia = sacola `brand.100` com as linhas à esquerda; sem conexão = linhas cortadas). A produzir após aprovação.

## 6. Movimento e microinterações

Só `transform` e `opacity`; `duration.fast` 150, `base` 250, `fly` 400, `celebrate` 1200; molas `press`/`pop`. Tudo com versão "reduzir movimento" (troca direta). Catálogo geral: direcao-visual-v2 P7. O que é **de marca**:

| Momento | Coreografia | Total |
|---|---|---|
| Entrada de tela | Conteúdo sobe 16 dp e aparece (`enter`); lista com 40 ms entre itens, máx. 6 | 250 ms |
| Botão | Escala 0,97 e volta com mola `press`; cor de pressionado `800`; carregando: rótulo some e 3 linhas pulsam em branco | 150 ms |
| Adicionar à sacola | Miniatura voa até o ícone da sacola com 3 linhas curtas de rastro que somem; sacola balança; contador 1,0 → 1,2 → 1,0; háptico leve | 400 ms |
| **Pedido confirmado** | 0-300 ms: 3 linhas varrem da esquerda para a direita (60 ms entre elas); 300-700: check branco se desenha sobre a tela inundada de `brand.500` (háptico de sucesso aos 300); 700-1200: "Pedido confirmado" em `hero` sobe 8 dp e aparece. Só depois da confirmação do PIX | 1200 ms |
| Carregando | 3 pílulas (24, 40, 16 dp) deslizam 16 dp para a direita e pulsam, 120 ms de defasagem, laço de 1200 ms; lista continua com skeleton | laço |
| "A caminho" | As linhas se repetem atrás da ilustração em laço de 1,6 s; congelam com "reduzir movimento" | laço |
| Abertura | Linhas entram da esquerda, sacola assenta com leve ultrapassagem; 1ª abertura do dia | ≤ 800 ms |

## 7. Como tornar o app menos rígido (aplicando esta identidade)

| Alavanca | Como |
|---|---|
| **Cor com presença** | Cabeçalho da Início em `brand.500` com busca branca embutida e logo branca; banner em cor cheia; seção de ofertas em faixa `brand.50` com cantos superiores 24 |
| **Imagem grande** | Foto 4:5 a 160 dp nos carrosséis, capa de loja 16:9 a 4:3, banner com foto/arte grande e manchete de até 6 palavras |
| **Tiles coloridos** | 6 slots de §3.4 (80 dp, raio 16, ícone duotone, rótulo 14/600) no lugar dos círculos cinza |
| **Ritmo** | Uma manchete `hero`, duas faixas de cor e o resto neutro por dobra; alternar `title1` (destaque) e `title2` (lista); numeral Fredoka gigante nos "mais vendidos" |
| **Forma** | Pílulas e raio 16/24 em lugar do 8 uniforme; aba ativa em pílula `brand.100` com ícone Fill |
| **Voz** | Vazios e sucessos com ilustração e título Fredoka; erro e dinheiro sóbrios |
| **Onde NÃO soltar** | PIX, cartão, endereço, dados pessoais: neutros, sem linhas, sem celebração antes da confirmação |

**Painéis (lojista e admin):** dial baixo. Barra lateral `brand.800` com texto branco (10,06), cabeçalho branco com logo colorida, botões `600`, tabelas e formulários neutros, tiles pastel só em cartões de KPI/atalho; logo branca no login magenta. **Apresentações:** capa em `brand.500` com logo branca e título Fredoka 700 branco ≥ 32 pt; conteúdo em fundo branco, Figtree, destaque `600/700`; linhas de velocidade em branco 24% no canto da capa; acento sol só para 1 número de destaque por slide.

## 8. O que foi alterado em `packages/tokens` (CEO: rodar `build` e `check`)

| Arquivo | Mudança |
|---|---|
| `theme/webag.json` (novo) | Paleta de marca, neutros, `accent`, `tile`, `tileInk`, `surface.hero/heroDeep`, `text.onHero`. `theme/petroleo.json` fica de histórico (com `WB_THEME=petroleo` o `check` falha nos pares novos, de propósito: eles só existem no tema v2) |
| `tokens.json` | `$theme: "webag"`, `$version: 0.2.0`; `font.family.display` (Fredoka), `font.weight.medium`; `textStyle` ganha `family` (`display`/`text`) e os estilos `hero` e `numeralBrand` (títulos passam a Fredoka); `radius` ganha `2xl` e os semânticos `tag/control/card/sheet/hero/pill`; `motion.duration.fly/celebrate`; `native.fontFamily.display*`; scrim e sombras com o neutro novo. **Feedback, tamanhos, espaços e nomes existentes intactos** |
| `scripts/build.mjs`, `src/native.ts` | `.wb-text-*` ganha `font-family` para `display`; `textStyles` escolhe a família Fredoka e exporta `hero`/`numeralBrand` |
| `a11y/contrast-pairs.json` | 51 pares (eram 34): os 34 recalculados para a paleta nova e 17 novos (marca 500 em 2 fundos, hero, hero profundo, acento, 6 tiles, 6 tintas) |

Apps: trocar fundo do splash e do ícone adaptativo no `app.config.ts` para `tokens.color.brand[500]`; carregar Fredoka; regerar protótipos. Nada em `apps/` foi tocado nesta tarefa.

## 9. Perguntas e validações

- **Fundador:** (1) aprova o botão em magenta profundo `#A02DB8`, mantendo `#C44DD9` para áreas amplas? É a única forma de passar em AA sem perder a cor dele; (2) aprova o acento **sol** (ou prefere azul-tinta, ou nenhum)? (3) aprova o **símbolo derivado** (sem a caixa "we")?
- **PO:** copy de banner e manchete `hero` (DEC-040a: sem mensagem regional).
- **QA/Tech Lead:** rodar `pnpm --filter @webag/tokens build`, `check` e `typecheck`; abrir os SVGs; aparelho de referência para medir as linhas animadas.
- **Teste com moradores [HIPÓTESE]:** 5 segundos, "parece confiável? parece moderno? parece com qual app?" (cuidado com Nubank), v1 contra v2.
