# Design System Webag

> Autor: product-designer. Data: 2026-11-18. Versão 0.2.0 (0.2.0: PasswordField com confirmação por DEC-012; §3.1b componentes das ondas 2 a 4). Valores de cor, tipo, espaço, raio, sombra e movimento vêm de `packages/tokens/` (nunca escrever hex ou px solto em componente). Marca e tom: `identidade.md`. Fluxos: `fluxos.md`. Referências: `pesquisa-referencias.md`.
> Alvos: app Expo (cliente) e web Next.js (lojista e admin). Mesma linguagem, componentes implementados nos dois, comportamento nativo de cada plataforma quando divergir (§8).

## 1. Princípios

1. **Uma ação principal por tela.** Um único botão primário por tela, ao alcance do polegar (rodapé fixo).
2. **Visual primeiro, texto depois.** Foto, número grande e ícone antes de frase. Frases de até 12 palavras.
3. **Sem surpresa.** Frete, taxa e total visíveis antes do pagamento; nada se mexe de lugar quando a imagem carrega.
4. **Todo estado desenhado.** Nenhuma tela existe sem carregando, vazio, erro, offline e sucesso (§5).
5. **Estado nunca só por cor.** Cor + ícone + texto.
6. **Disciplina de destaque.** Petróleo só nos 5 usos da `identidade.md` §3; o resto é neutro.
7. **Forma segue função.** Pílula = busca e filtro; retângulo de raio 8 = ação e entrada; etiqueta de raio 4 = informação de status.
8. **Nativo quando importa.** Gestos, navegação, teclado, folhas e haptics seguem iOS e Android.

## 2. Fundamentos (resumo, fonte: `packages/tokens/tokens.json`)

| Tema | Token | Regra |
|---|---|---|
| Cor | `color.surface.*`, `color.text.*`, `color.border.*`, `color.action.*`, `color.feedback.*` | Usar o papel semântico, não a paleta (`color.text.secondary`, não `neutral.600`) |
| Tipo | `textStyle.*` | 11 estilos; corpo ≥ 16; ver `identidade.md` §4 |
| Espaço | `space.1..16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 | Grade 8 com meio-passo 4. Margem lateral `layout.screenPaddingX` = 16 |
| Tamanho | `size.touchMin` 48; `controlSm/Md/Lg` 40/48/56; ícones 20/24/32/64 | Alvo de toque nunca < 48 no mobile |
| Raio | `radius.sm 4`, `md 8`, `lg 16`, `xl 24`, `full` | Controle e imagem 8; etiqueta 4; folha 24 no topo; pílula e avatar `full` |
| Elevação | `shadow.none/sm/md/lg` | Cartão sem sombra (fio `border.subtle`); sm = barra fixa; md = menu e folha; lg = diálogo |
| Movimento | `motion.duration.fast/base/slow` = 150/250/400 ms; `easing.standard/enter/exit` | Entrar: `enter`; sair: `exit`; mover: `standard`. Reduzir movimento: sem deslocamento, só fade ou troca imediata |
| Estados (camada) | `opacity.hover` 8%, `pressed` 12%, `disabled` 38% | Pressionado = camada de `text.primary` a 12% (um pouco acima dos 10% do Material, para ler sob sol) |
| Camadas z | `zIndex.sticky 10`, `sheet 20`, `toast 30`, `modal 40` | |
| Layout web | `breakpoint.sm 640`, `md 1024`, `lg 1280`; `layout.contentMaxWidth` 1200, `formMaxWidth` 480 | Mobile-first; barra lateral só ≥ `md` |
| Haptics (app) | `native.haptics` | selection (chip, aba, stepper), light (adicionar à sacola), success (pago, aprovado), error (envio inválido) |

## 3. Componentes

Todo componente interativo tem **alvo ≥ 48**, rótulo de acessibilidade, anel de foco (web e teclado em tablet) e os estados da §3.2.

### 3.1 Catálogo

| Componente | Medidas e anatomia | Variantes e regras |
|---|---|---|
| **Button** | Alturas: `lg` 56 (CTA de tela, largura total), `md` 48 (padrão), `sm` 40 (só tabelas de admin no desktop). Raio 8. Texto `label`. Ícone opcional de 20 à esquerda, espaço 8. Largura mínima 96 | **Primário** (fundo `action.primary`, texto branco; 1 por tela). **Secundário** (fundo transparente, borda 2 `action.secondaryBorder`, texto `text.brand`). **Texto** (sem fundo, `text.brand`, alvo 48 mantido). **Destrutivo** (fundo `action.destructive`; só na confirmação final, nunca como 1ª opção visual). Rótulo = verbo + objeto |
| **Input / TextField** | Rótulo **sempre visível acima** (`captionStrong`), campo 48 (56 em formulários longos de mobile), borda 1 `border.strong`, raio 8, texto `body`, ajuda e erro abaixo em `caption` | Tipos: texto, e-mail, telefone, CPF, CNPJ, CEP, senha, número, moeda, área de texto. Máscaras e teclado na §6. Sem placeholder como rótulo. Contador quando houver limite |
| **SearchBar** | 48, pílula (`radius.full`), fundo `surface.sunken`, lupa 24 à esquerda, "Buscar produtos e lojas" | Na Início é um botão que abre a tela de Busca (teclado já aberto). Na Busca: botão limpar (X, alvo 48), histórico abaixo, sugestões enquanto digita |
| **Card de loja** | Ver §4: três formatos (linha, capa, compacto). Dados: logo, nome, nota, tempo, taxa, distância, selo aberta/fechada, selo "Aceita troca" | Loja fechada continua tocável e navegável; só não permite comprar |
| **Card de produto** | Imagem 1:1 raio 8; preço `price`; preço antigo `caption` riscado em `text.secondary`; selo de desconto; nome até 2 linhas `body`; loja em `caption` quando em busca e ofertas | Três formatos: grade, lista, numerado (§4). Esgotado: selo "Esgotado", preço em `text.secondary`, ainda abre |
| **QuantityStepper** | Altura 48; botões − e + de 48×48 (ícone 20); valor central ≥ 40 de largura, `bodyStrong` tabular | Mínimo 1; na sacola o − em 1 vira lixeira com rótulo "Remover". Máximo = estoque (+ desabilitado e aviso "Só 3 em estoque"). Segurar repete. Leitor de tela: tipo "ajustável", rótulo "Quantidade, 2" |
| **Badge / Tag** (selo) | Altura 24, raio 4, padding 8, texto `micro`, ícone opcional de 16, não interativo | **Aberta** (`success.subtle`, ícone `Clock` ou ponto, texto `text.success`). **Fechada · abre 9h** (`surface.sunken`, `text.secondary`). **Frete grátis** (`success.subtle`, `Truck`). **Aceita troca** (`brand.50`, `text.brand`, `ArrowsClockwise`). **Novo**, **20% off** (`brand.50`). **Esgotado** (`surface.sunken`). Status de pedido: ver StatusBadge. Sempre ícone + texto |
| **Chip** | Altura 40 visível, alvo 48 (hitSlop), pílula, texto `bodyStrong` | Não selecionado: fundo `surface.sunken`. Selecionado: fundo `brand.50`, borda 2 `brand.600`, ícone de check, texto `text.brand`. Chip de filtro ativo ganha "x" para remover. Linha rolável horizontal, com o 1º item alinhado à margem |
| **BottomSheet** | Raio 24 no topo, alça 32×4 (decorativa), título `title2`, botão "Fechar" de 48 visível, fundo `surface.card`, `backdrop` 48%, altura máx. 90% | Fecha por: arrastar, toque fora, botão Fechar e voltar do Android. Ação primária fixa no rodapé (acima do teclado). Aviso antes de fechar se há dado não salvo. Usos: filtros, ordenar, escolher variação, endereço, cupom, "o que é a taxa de serviço" |
| **Toast / Snackbar** | Fundo `surface.inverse`, texto `text.inverse` `body`, raio 8, máx. 2 linhas, ação opcional em `text.inverseAction` (alvo 48), acima da barra inferior | 4 s (8 s com ação). Um por vez, em fila. Anunciado ao leitor de tela (região viva educada). Erro que exige decisão **não** é toast: é banner ou diálogo |
| **EmptyState** | Círculo `surface.sunken` 120 com ícone duotone de 64, título `title2` (1 linha), texto `body` secundário (≤ 2 linhas), **1 ação primária** (+ 1 link opcional) | Sempre com próximo passo. Catálogo de textos na §5 |
| **ErrorState** | Mesmo molde do vazio com ícone `WarningCircle` ou `WifiSlash`, título dizendo o que houve, texto dizendo o que fazer, botão "Tentar de novo" | Preserva o que o usuário digitou. Variante parcial: bloco inline na seção, sem derrubar a tela |
| **Skeleton** | Forma idêntica ao conteúdo (mesmo raio e proporção), `skeleton.base`, brilho `skeleton.highlight` 1200 ms | Nunca spinner de tela cheia. Sem reduzir movimento: estático. Ver §5 |
| **ListItem** | Altura ≥ 56 (1 linha) ou 72 (2 linhas); à esquerda ícone 24 ou avatar; título `body`; subtítulo `caption` secundário; à direita valor, `CaretRight` 20 ou switch; divisor `border.subtle` recuado até o texto | A linha inteira é o alvo. Usado em Conta, Endereços, Pedidos, Configurações, listas de admin no mobile |
| **Tabs** | **Seções** (vitrine da loja): texto `bodyStrong`, indicador de 3 abaixo em `brand.600`, rolável, fixa ao rolar, 48 de altura. **Segmentado** (Entrega | Retirada): contêiner `surface.sunken` raio 8, segmento ativo com `surface.card` + borda 2 `brand.600`. **Barra inferior** (app): 4 destinos, altura 64 + área segura, ícone 24 (Fill + `brand.600` quando ativo) + rótulo `micro` | Rótulo sempre visível. Contador (Pedidos em andamento, Sacola) em círculo `neutral.900` com número branco. Toque na aba ativa volta ao topo |
| **Header** | Altura 56; botão voltar 48; título `title2` (centro no iOS, esquerda no Android); até 2 ações à direita. Sombra `sm` só quando o conteúdo rola por baixo | Início: endereço (toque abre seletor) + ícone Sacola. Título grande `title1` recolhe ao rolar (iOS) |
| **StatusTimeline** | Vertical, 5 passos (pedido) ou 7 (troca). Nó 24: concluído = círculo `brand.600` + check branco; atual = anel 2 `brand.600` + título em `bodyStrong`; futuro = anel `border.strong` + texto secundário. Linha de 2 entre nós (`brand.600` concluída, `border.subtle` futura). Hora em `caption` | Recusado/cancelado: último nó em `feedback.danger` com ícone X e o motivo. Atrasado: banner de alerta + "Falar com a loja". Leitor: "Passo 2 de 5, Aceito, concluído às 14:32" |
| **PriceSummary** | Linhas rótulo (esquerda) e valor (direita, tabular): Subtotal, Entrega (ou "Grátis" em `text.success`), Taxa de serviço (com `Info` que abre folha), Cupom (− R$ 10,00 em `text.success`), divisor, **Total** em `title1` | Sem "a calcular" no passo de pagamento. Variante lojista: Venda, Comissão Webag, Tarifa de pagamento, **A receber** |

**Componentes adicionais (cliente):**

| Componente | Regras |
|---|---|
| **Radio / Checkbox / Switch** | Visual 24 (switch 52×32), alvo 48 incluindo o rótulo. Marcado: preenchimento `brand.600` + ícone (check ou ponto). Switch mostra "Ligado/Desligado" em texto em telas de configuração |
| **OTPInput** (código de 6 dígitos) | 6 caixas 48×56, foco automático, avança sozinha, aceita colar o código inteiro e preenchimento automático (`oneTimeCode`), Backspace volta. Abaixo: "Reenviar código em 0:30" |
| **PasswordField** | Botão olho 48 (mostrar/ocultar). Medidor: 4 segmentos + palavra "Fraca", "Média" ou "Forte" (nunca só cor). Aceita colar e gerenciador de senhas. **Variante com confirmação (DEC-012):** em todo lugar que define senha nova (cadastro do cliente e do lojista, convite de funcionário, redefinir senha, alterar senha) vêm dois campos, "Senha" e "Confirmar senha"; **um único olho** controla os dois; a confirmação valida ao sair do campo ou ao igualar o tamanho ("As senhas são iguais." com check / "As senhas não são iguais."); `autocomplete="new-password"` nos dois, para o gerenciador preencher juntos |
| **AddressField (CEP)** | CEP com máscara; ao completar 8 dígitos preenche rua, bairro e cidade (skeleton nesses campos); usuário só digita número e complemento; "Sem número" como caixa de seleção |
| **PixPayment** | QR 240 (mín. 200) com margem 16 branca; código copia e cola em 2 linhas truncado; **botão "Copiar código" `lg` 56 largura total**; contagem regressiva em `numeral`; "Como pagar" em 3 linhas com ícone. Estados: gerando, aguardando, copiado, vence em < 2 min, vencido, pago, falha ao gerar (§5.5) |
| **Rating** | Exibir: estrela Fill + nota em número + total ("4,8 · 120"). Informar: 5 estrelas de 48, com texto ("Ótimo") e tipo ajustável |
| **Banner (aviso inline)** | Fundo `*.subtle`, borda `*.border`, ícone + texto + ação opcional. Variantes sucesso, alerta, erro, info |
| **Dialog** | Centralizado, largura 280 a 400, título `title2`, texto `body`, botões empilhados (mobile). Destrutivo repete a ação ("Excluir conta") + "Cancelar". Foco preso e devolvido ao fechar |
| **Carousel (banners)** | Proporção 2:1, raio 8, espia 16 do próximo. **Sem rotação automática** (WCAG 2.2.2). Indicadores em pontos com rótulo "Banner 2 de 4" |
| **Galeria do produto** | Deslizar entre fotos 1:1, contador "2/5", toque abre tela cheia com zoom por pinça e botão fechar |
| **Avatar / Logo** | 40 ou 56, círculo, fio 1 `border.subtle`, fallback com iniciais em `surface.sunken` |
| **Imagem** | Placeholder de baixa resolução, carregamento progressivo, `alt` = nome do produto; decorativas ocultas do leitor |
| **PhotoPicker (troca)** | Até 5 fotos, miniaturas 96 com botão remover 48, botões "Tirar foto" e "Escolher da galeria"; envio com barra de progresso por foto; falha de uma foto não derruba as outras |

**Componentes do lojista e do admin (web responsivo):**

| Componente | Regras |
|---|---|
| **Navegação** | Celular: barra inferior (lojista) com 4 destinos. A partir de `md` (1024): barra lateral de 240 (recolhível para 72 só com ícones + rótulo em dica). Itens por papel (RBAC): o item que o papel não acessa **não aparece** |
| **DataTable** | Cabeçalho fixo, ordenação, filtros em chips acima, busca, seleção em massa com barra de ações, paginação (25/50/100), densidade 48 (confortável) ou 40 (compacta, desktop). **Abaixo de `md` vira lista de linhas** (ListItem com 2 a 3 campos-chave), não rolagem horizontal. Estados: skeleton de linhas, vazio com ação, erro com "Tentar de novo", sem resultado de filtro com "Limpar filtros" |
| **KPI** | Rótulo `caption`, valor `numeral`, variação com ícone de seta + texto ("+12% vs. semana passada"); nunca só cor. Máx. 4 por linha |
| **Gráfico** | Neutro + `brand.600` (máx. 2 séries), rótulos diretos, resumo em texto e tabela alternativa (leitor de tela), sem 3D |
| **FormWizard** | Passos numerados "Passo 2 de 5" com barra de progresso `brand.600`, **um assunto por passo**, "Salvo às 14:32" (rascunho automático), Voltar e **Continuar** sempre no mesmo lugar. Erros resumidos no topo + foco no 1º campo com erro |
| **FileUpload** | Área tracejada 120+ com "Escolher arquivo" e "Tirar foto" (celular); aceita imagem e PDF; mostra tipo e tamanho aceitos antes; barra de progresso; recorte para logo e capa; erro: "Esse arquivo tem 8 MB. O máximo é 5 MB." |
| **OrderAlert** (pedido novo) | Celular: tela cheia sobre tudo; desktop: modal grande. Mostra total, nº de itens, tipo (entrega ou retirada), tempo para responder. Som em repetição até a primeira ação. **Aceitar** (primário 56) e **Recusar** (secundário 56, pede motivo). Vibração. Título da aba pisca "(1) Pedido novo". Ver "Regra do som" abaixo |
| **StatusAction** | Botão único com o **próximo passo** ("Marcar como em separação"), em vez de menu de status. Voltar passo fica em menu "Mais" |
| **ApprovalChecklist** (admin) | Lista de itens a conferir (documento legível, CNPJ ativo, endereço, categoria, fotos), cada um "Conferido / Problema"; só libera "Aprovar" com todos marcados |
| **DocumentViewer** (admin) | Zoom, girar, tela cheia, baixar; documento ao lado do formulário (≥ `md`) |
| **Comanda** | Folha de impressão (`@media print`) para 80 mm: número do pedido grande, itens, observações, endereço, forma de pagamento; sem cor |
| **AuditRow** | Quem, o quê, quando, de onde (IP), antes e depois; somente leitura |

**Regra do som (lojista):** navegadores bloqueiam áudio automático até haver um toque do usuário [M, política de autoplay]. O painel pede **uma vez por turno**: banner "Ligar alertas sonoros" (1 toque) e depois mostra o ícone "Som ligado". Sem isso, o lojista perde pedidos. Além do som: título da aba, notificação do navegador (com permissão) e, no celular, manter a tela acesa na página de Pedidos (Wake Lock, **[HIPÓTESE]** conforme suporte do navegador). Teste de alerta no onboarding ("Tocar som de teste").

### 3.1b Componentes adicionados nas ondas 2 a 4 (v0.2.0)

Cada um é composto de tokens e componentes já existentes; nenhum cria cor, raio ou sombra nova. Estados: seguem a §3.2 (padrão, pressionado, desabilitado, carregando, erro, foco) mais os listados.

| Componente | Onde | Regras |
|---|---|---|
| **StatusBadge** (pedido) | Pedidos, acompanhar, painel do lojista | Selo (altura 24, raio 4, ícone 16 + texto `micro`). Mapa fechado: Aguardando pagamento (alerta, `Clock`), Aguardando a loja (info, `Hourglass`), Pedido aceito (info, `CheckCircle`), Em separação (info, `Package`), Saiu para entrega (info, `Truck`), Pronto para retirar (sucesso, `Storefront`), Entregue (sucesso, `CheckCircle` Fill), Cancelado e Recusado pela loja (erro, `XCircle`), Pagamento vencido (neutro, `Clock`). Painel do lojista usa os mesmos rótulos, com "Aguardando você" no lugar de "Aguardando a loja" nos novos |
| **CartBar** | Loja, Produto | Barra flutuante `sm`, 56, acima da barra inferior: "Ver sacola · 2 itens · R$ 89,90"; botão de largura total; só aparece com itens da loja aberta; anunciada ao leitor ("Sacola, 2 itens, 89 reais e 90 centavos") |
| **VariantSelector** | Produto | Grupo com título e valor escolhido ("Cor: Azul-marinho"). Tamanho = chips; Cor = amostra 48 com nome escrito e check. Indisponível: riscado (ou traço diagonal na amostra), `opacity.disabled`, anunciado "42, esgotado". Rádio acessível. A cor da amostra é dado do produto, não token |
| **MapPinPicker** | Endereço do cliente (só se a geocodificação falhar), endereço da loja | Mapa com pino fixo ao centro; arrastar o mapa move o ponto; botões + e − de zoom; botões de mover 10 m para quem usa teclado; texto com o endereço do ponto; botão "Confirmar ponto". Nunca pede a localização do aparelho aqui |
| **ImageCropper** | Logo, capa, foto de produto | Modal com moldura fixa (1:1 ou 16:9), arrastar para mover, zoom por barra + botões + e −, "Girar", prévia, "Usar recorte". Entrada até 5 MB; saída ≤ 300 KB comprimida no navegador; teclado: setas e `+` `-` |
| **DocSlot** | Onboarding do lojista | Variante de FileUpload para 1 documento: miniatura 96, título, estado (vazio, enviando com %, enviado, erro), "Tirar foto", "Escolher arquivo", "Trocar". Mostra tipo e tamanho aceitos antes do envio. Prévia com "Está legível?" |
| **TimeField** | Horários da loja | Máscara `00:00`, teclado numérico, passo de 15 min, validação "Confira o horário (ex.: 09:00)." |
| **WeekSchedule** | Horários da loja | 7 linhas: Switch com texto "Aberto/Fechado" + até 2 intervalos (TimeField) + "Adicionar 2º horário"; atalhos de preenchimento ("Seg a sex, 9h às 18h") e "Copiar para outros dias". Cada linha é um grupo para o leitor de tela |
| **BandEditor** | Taxa por distância | Até 5 linhas "De (automático) · Até (km) · Valor"; "De" copia o "Até" da linha anterior e a última linha termina no raio: impossível criar lacuna ou sobreposição. "Adicionar faixa" e "Remover" (última) |
| **VariationGrid** | Variações e estoque | Atributos como etiquetas (até 3) e grade gerada das combinações: celular = cartão de linha com rótulo + stepper de estoque; desktop = tabela (Opção, Estoque, Preço, Código, Remover). "Mesmo estoque para todas" + "Aplicar"; selo "Esgotado" quando 0 |
| **BulkActionBar** | Lista de produtos, DataTable | Barra de ações com contagem ("3 selecionados"), ações e "Cancelar seleção"; rodapé no celular, topo da tabela no desktop. A confirmação repete a contagem no botão ("Pausar 12 produtos") |
| **ReorderList** | Seções da vitrine, fotos | Alça de arrastar **e** botões "Subir" e "Descer" (ou "Mover para o início"); nunca só gesto (2.5.7) |
| **OrderCard** (lojista) | Painel de pedidos | Número, hora, tempo desde a chegada ("há 2 min", em alerta a partir de 5 min e em erro a partir de 8, sempre com ícone), tipo (selo), itens (2 linhas + "+N"), total, selo "Pago" e a ação do estado (Aceitar e Recusar nos novos; StatusAction nos demais). Desktop ≥ 1280: número em `display`, total em `title1`, 3 colunas |
| **PanelStatusBar** | Painel de pedidos | Som ("Som ligado" / "Som desligado" + "Tocar som de teste") e conexão ("Sincronizado há 3 s"). Estados de erro viram Banner de erro persistente (som bloqueado, sem conexão): fundo `danger.subtle`, borda `danger.border`, texto `text.danger`, ícone `WarningCircle` 24 e texto em `bodyStrong`; nunca some sozinho enquanto o problema existir |
| **SecureCardForm** | Checkout (cartão) | Campos do provedor dentro de um cartão com fio: número, validade, código, nome, parcelas (folha com rádio mostrando o **total com juros**). Rótulos visíveis, teclado numérico. Aparência configurada com os tokens até onde o provedor permitir. Nenhum dado de cartão em log nem em estado do app |
| **OrderTimer / PixCountdown** | PIX, alerta de pedido | Contagem em `numeral`; mudança para alerta (ícone + texto) abaixo de 2 min; nunca lida a cada segundo (anuncia em 5:00, 1:00, 0:30 e ao vencer) |

**Regra de formulário atualizada (§6):** botão de envio **ativo** com erro mostrado ao tocar (rola e foca o 1º erro) é o padrão; botão inerte só com o motivo escrito no próprio rótulo (ex.: "Loja fechada · abre 9h").

### 3.2 Matriz de estados (cada componente interativo)

| Componente | Padrão | Pressionado | Desabilitado | Carregando | Erro | Foco |
|---|---|---|---|---|---|---|
| Button primário | `action.primary` | `primaryPressed` + escala 0,98, 150 ms | `disabledFill` + `disabledText`; usar só quando o motivo estiver visível | Spinner 20 no lugar do rótulo + texto "Pagando…", largura fixa, inerte | Erro aparece acima do botão; botão volta ativo | Anel 2 `border.focus`, afastado 2 |
| Button secundário / texto | Borda ou texto `brand` | Camada 12% | `opacity.disabled` | Spinner | idem | idem |
| Button destrutivo | `action.destructive` | `destructivePressed` | idem | Spinner | idem | idem |
| Input | Borda 1 `border.strong` | n/a (foco) | Fundo `surface.sunken`, texto `disabledText`, com explicação | Spinner à direita ("Buscando CEP…") | Borda 2 `border.danger` + ícone + mensagem `text.danger` abaixo; foco vai ao 1º erro | Borda 2 `border.focus`, sem anel externo |
| Chip | `surface.sunken` | Camada 12% | `opacity.disabled` | n/a | n/a | Anel |
| Card / ListItem | Fundo `surface.card` + fio | Camada 12% + escala 0,99 | Texto secundário | Skeleton | Imagem falhou: placeholder; linha falhou: "Tentar de novo" inline | Anel |
| Stepper | Botões `surface.sunken` | Camada 12% + haptic selection | − ou + com `opacity.disabled` + aviso | Valor com skeleton enquanto confirma estoque | "Só 3 em estoque" em `text.danger` | Anel |
| Switch / Radio / Checkbox | Borda `border.strong` | Camada 12% | `opacity.disabled` | Switch com spinner pequeno (salvando) | Mensagem abaixo | Anel |
| Tab / Aba | Texto `text.secondary` | Camada 12% | n/a | n/a | n/a | Anel |
| Link | `text.link`, sublinhado | Escurece (`brand.800`) | n/a | n/a | n/a | Anel |
| BottomSheet | Fechado | Arrastar acompanha o dedo | n/a | Conteúdo em skeleton | ErrorState no corpo | Foco vai ao título; ao fechar volta ao gatilho |

## 4. Composição: sem cards iguais

Para não virar "tudo caixa branca igual" (brief §5), a interface usa **3 formatos de lista** e alterna **escala** entre seções.

| Formato | Quando | Aparência |
|---|---|---|
| **Linha** | Listas longas (lojas perto de você, pedidos, endereços) | Sem caixa; divisor fino; logo 56 + 2 linhas de texto; ritmo rápido de escaneamento |
| **Tile sem caixa** | Carrosséis (categorias, ofertas) | Imagem ou ícone + rótulo, sem borda nem sombra; o espaço em branco separa |
| **Card de capa** | Poucos itens que merecem destaque (lojas novas, banner) | Capa 16:9 ou 2:1 raio 8, informação sob a imagem; no máx. 1 ou 2 por tela visível |

**Regras:** (1) no máximo **1 card de capa visível** por viewport; (2) nunca duas seções seguidas com o mesmo formato; (3) cartão com borda só quando agrupa campos (checkout, resumo); (4) seções separadas por 32, itens por 8 a 16.

**Ritmo da Início (de cima para baixo):**

| # | Seção | Formato | Observação |
|---|---|---|---|
| 1 | Cabeçalho: "Entregar em · Rua das Palmeiras, 120" + Sacola | Header | Endereço sempre visível |
| 2 | Busca | SearchBar | |
| 3 | Banners do admin | Carousel (capa 2:1) | Único card de capa da 1ª dobra |
| 4 | Categorias | Tile sem caixa (círculo 64 `surface.sunken` + ícone + rótulo) | Rola na horizontal; "Ver todas" |
| 5 | Lojas perto de você | **Linha** | Abertas primeiro; fechadas depois, com selo |
| 6 | Ofertas | Tile sem caixa de produto | Carrossel horizontal |
| 7 | Mais vendidos | **Numerado** (1 a 10 grande à esquerda + imagem 96 + nome + preço) | Muda a forma de propósito |
| 8 | Lojas novas | **Card de capa** 16:9 | Fecha a página com imagem |

Seção sem conteúdo suficiente é **ocultada**, nunca mostrada vazia (HIP-032; ex.: "Mais vendidos" só com ≥ 5 pedidos em 30 dias). Fechadas ficam depois das abertas.

**Página da loja:** capa 16:9 + logo 56 sobreposto; nome `title2`; nota; linha de metadados com ícones ("30 a 45 min · R$ 5,00 · 1,2 km"); selos (Aberta, Aceita troca); Tabs de seções fixas; produtos em grade de 2 colunas.
**Página do produto:** galeria; **preço `display`**; variações (tamanho em chips; cor em amostras de 48 com nome da cor escrito e check quando escolhida); estoque ("Restam 2"); linha "Aceita troca em até 7 dias" com ícone (diferencial); loja; descrição recolhida; avaliações; **barra fixa** com stepper + "Adicionar · R$ 89,90". Botão sempre ativo: se faltar variação, rola até o grupo e mostra "Escolha o tamanho" (evita botão desabilitado sem explicação).

## 5. Estados de tela (padrão global)

### 5.1 Carregando (skeleton)
- Imagem + 2 linhas de texto para linha de loja; bloco 1:1 + 2 linhas para produto; blocos de seção com cabeçalho. Nunca contar com spinner de tela.
- Aparece na hora quando não há cache; se há cache, mostra o cache e atualiza em silêncio (stale-while-revalidate).
- Tempo mínimo visível de 300 ms para evitar piscar. Após **8 s** sem resposta troca para ErrorState de rede lenta ("Está demorando mais que o normal") com "Tentar de novo".
- Puxar para atualizar (`RefreshControl`) em Início, Busca, Pedidos, Detalhe de pedido, Trocas; cor do indicador `brand.600`; haptic leve ao disparar.
- Imagens: placeholder de cor dominante, depois nítida (fade 150 ms).
- Leitor de tela: contêiner "Carregando lojas" e filhos ocultos; ao terminar, anunciar "23 lojas".

### 5.2 Vazio (sempre com próximo passo)

| Onde | Ícone | Título | Texto | Ação |
|---|---|---|---|---|
| Sacola | `Handbag` | "Sua sacola está vazia" | "Escolha produtos de uma loja perto de você." | "Ver lojas" |
| Pedidos | `Receipt` | "Você ainda não fez pedidos" | "Quando comprar, o acompanhamento aparece aqui." | "Ver lojas" |
| Favoritos | `Heart` | "Nenhum favorito ainda" | "Toque no coração das lojas e produtos de que gostar." | "Explorar lojas" |
| Busca sem resultado | `MagnifyingGlass` | "Nada para "tênis azul"" | "Confira a escrita ou tente uma palavra mais simples." | "Limpar filtros" (se houver filtro) ou "Ver lojas" |
| Região sem lojas | `MapPin` | "Ainda não entregamos aí" | "Estamos chegando em mais bairros." | "Avisar quando chegar" / "Mudar endereço" |
| Endereços | `MapPinLine` | "Nenhum endereço salvo" | "Salve um para pedir mais rápido." | "Adicionar endereço" |
| Cupons | `Tag` | "Sem cupons agora" | "Cupons novos aparecem aqui." | "Ver ofertas" |
| Notificações | `Bell` | "Nada por enquanto" | "Avisos de pedidos e trocas aparecem aqui." | "Ver pedidos" |
| Trocas | `ArrowsClockwise` | "Nenhuma troca em andamento" | "Se algo não servir, peça a troca em Pedidos." | "Ver pedidos" |
| Lojista: pedidos | `Receipt` | "Nenhum pedido novo" | "Você será avisado com som quando chegar." | "Testar som" |
| Lojista: produtos | `Package` | "Sua vitrine está vazia" | "Cadastre o primeiro produto ou importe uma planilha." | "Adicionar produto" |
| Admin: fila de lojas | `CheckCircle` | "Fila em dia" | "Nenhuma loja esperando análise." | "Ver lojas ativas" |

### 5.3 Erro (o que houve + o que fazer)

| Tipo | Título | Texto | Ação |
|---|---|---|---|
| Rede lenta | "Está demorando" | "Sua conexão parece lenta." | "Tentar de novo" |
| Servidor | "Não conseguimos carregar agora" | "Seus dados estão salvos. Tente de novo em instantes." | "Tentar de novo" |
| Não encontrado | "Esse produto não está mais disponível" | "A loja pode ter retirado ele." | "Ver outros da loja" |
| Sessão expirada | "Entre de novo para continuar" | "Por segurança, sua sessão terminou. Sua sacola continua aqui." | "Entrar" |
| Sem permissão (admin) | "Você não tem acesso a essa área" | "Peça ao administrador para liberar seu perfil." | "Voltar ao painel" |
| Manutenção | "Estamos em manutenção" | "Voltamos em alguns minutos." | "Tentar de novo" |
| Campo inválido | Mensagem no campo | "Digite o CEP com 8 números." | n/a |

### 5.4 Offline (sem conexão)
- Banner fixo sob o header em `warning.subtle` com `WifiSlash`: **"Sem conexão. Mostrando o que já carregou."**; some com toast "Conectado de novo" (2 s) ao voltar.
- Telas já visitadas abrem do cache; ações seguras (favoritar, editar sacola) ficam em fila local e sincronizam depois.
- Ações que precisam de rede (pagar, enviar troca, aprovar loja) **ficam ativas** e, ao tocar, explicam: "Conecte-se para pagar. Sua sacola está salva." Não perder o formulário.
- Instável (3G): requisições com retry exponencial (3 tentativas), cancelar leitura longa, imagens leves primeiro.

### 5.5 Sucesso
- **Tela de sucesso** (pedido, troca enviada, loja enviada para análise): ícone `CheckCircle` Fill 64 em `text.success`, `title1`, 1 linha de resumo, CTA ("Acompanhar pedido"), secundário. Haptic success; check animado 400 ms (estático com reduzir movimento).
- **Inline:** "Salvo às 14:32" com check; toast "Adicionado à sacola" com ação "Ver sacola".
- Pedido confirmado mostra nº do pedido em `numeral` e previsão ("Chega entre 15:10 e 15:30"). Não promete o que a loja define.

### 5.6 Permissão negada
| Permissão | Antes de pedir (contexto) | Se negada |
|---|---|---|
| Localização | Tela própria "Onde você quer receber?" explica o motivo antes do pedido do sistema | "Sem a localização, digite o CEP." + CEP. Link "Abrir ajustes" |
| Notificações | Pedir **depois do 1º pedido**, com texto "Quer ser avisado quando o pedido sair?" | Banner discreto no Pedido: "Ative os avisos para acompanhar" com "Abrir ajustes" |
| Câmera e fotos (troca, upload lojista) | No toque em "Tirar foto" | "Sem acesso à câmera. Escolha uma foto da galeria." + "Abrir ajustes" |

## 6. Formulários

| Campo | Máscara | Teclado (RN `keyboardType` / web `inputMode`) | Autopreenchimento | Validação |
|---|---|---|---|---|
| CPF | 000.000.000-00 | numérico | n/a | Dígitos verificadores; mensagem "Confira o CPF" |
| CNPJ | 00.000.000/0000-00 | numérico | n/a | Dígitos verificadores; consulta e preenche razão social **[HIPÓTESE]** |
| CEP | 00000-000 | numérico | `postalCode` | 8 dígitos; consulta ao completar |
| Celular | (00) 00000-0000 | telefone | `tel` | 11 dígitos, DDD válido |
| E-mail | n/a | e-mail, sem capitalizar | `email` | Sugestão de domínio ("gmail.com?") |
| Nome | n/a | texto, capitalizar palavras | `name` | ≥ 2 palavras recomendado (não obrigatório) |
| Senha | n/a | texto | `new-password` / `current-password` | ≥ 8 caracteres, medidor; permite colar. Senha nova sempre com "Confirmar senha" (DEC-012): "As senhas não são iguais." |
| Código | 6 dígitos | numérico | `one-time-code` | Verifica ao completar o 6º dígito |
| Moeda | R$ 0,00 | numérico | n/a | Aceita vírgula; > 0 |

**Regras:** rótulo sempre visível; validar **ao sair do campo** (não a cada tecla), exceto senha e CEP (ao completar); **uma mensagem por erro, junto do campo**, e ao enviar, rolar e focar o primeiro erro; "Próximo" no teclado vai ao campo seguinte e "Pronto" envia no último; não pedir de novo o que já foi dado (WCAG 3.3.7); botão de envio nunca começa desabilitado sem motivo claro; dados do formulário sobrevivem a erro, rotação e perda de rede.

## 7. Acessibilidade (WCAG 2.2 AA)

| Tema | Regra |
|---|---|
| Contraste | Texto 4,5:1; não-texto 3:1; números em `identidade.md` §3; CI roda `pnpm --filter @webag/tokens check` |
| Alvo de toque | ≥ 48 (cobre 44 pt Apple e 48 dp Material). Ícone de 24 ganha `hitSlop`/padding até 48. Espaço mínimo de 8 entre alvos |
| Rótulos | Todo ícone sozinho tem `accessibilityLabel` ("Abrir sacola, 2 itens"); botão-ícone não é descrito como "botão" no rótulo (a função já diz) |
| Ordem de leitura | Segue a ordem visual: cabeçalho, conteúdo, ação fixa. Títulos marcados como cabeçalho (`accessibilityRole="header"`, `<h1..h3>` no web) |
| Estado sem cor | Selecionado = borda + check; erro = ícone + texto; status do pedido = ícone + texto |
| Fonte dinâmica | RN: respeitar a escala do sistema com `maxFontSizeMultiplier` de 1,5 (corpo), 1,3 (títulos), 1,2 (rótulos compactos como a barra inferior). Sem altura fixa em texto; telas reflowam (linhas empilham). Preço e total nunca truncam. Testar em 200% |
| Zoom web | Reflow em 320 px de largura sem rolagem horizontal (1.4.10); 200% de zoom sem perda |
| Movimento | `prefers-reduced-motion` e "Remover animações" do sistema: sem deslocamento, shimmer estático, sem check animado |
| Foco (web) | Anel visível em tudo (`.wb-focus-ring`); ordem de tabulação lógica; "Pular para o conteúdo"; modal prende o foco e o devolve; barra fixa **não pode cobrir** o campo em foco (2.4.11) |
| Gestos | Todo gesto tem alternativa por toque: arrastar folha = botão Fechar; deslizar item para excluir = lixeira visível; carrossel = botões e pontos (2.5.7) |
| Temporizadores | Contador do PIX não é lido a cada segundo: anunciar em 5:00, 1:00 e 0:30 (região viva educada) e ao vencer; sempre oferecer "Gerar novo código" |
| Formulários | Rótulo associado, ajuda e erro ligados ao campo (`aria-describedby` / `accessibilityHint`), `autocomplete` correto (1.3.5), colar permitido (3.3.8) |
| Leitor de tela | Roteiro de teste TalkBack (Android) e VoiceOver (iOS) para os 4 fluxos antes do G4; tabela e gráfico com alternativa em texto |
| Idioma | `lang="pt-BR"` no web; texto de data e moeda por extenso para leitor ("R$ 89,90" lido como valor) |
| Autenticação | Senha com colar, gerenciador de senhas e código com preenchimento automático; sem captcha de quebra-cabeça |

## 8. Android x iOS

| Tema | Android (Material 3) | iOS (HIG) |
|---|---|---|
| Navegação | Barra inferior (navigation bar); botão/gesto voltar do sistema fecha folhas e volta | Tab bar; gesto de borda para voltar; título grande que recolhe |
| Título do header | À esquerda | Centralizado |
| Folhas | Bottom sheet modal com alça | Sheet nativa com detents (médio e grande) |
| Feedback de toque | Ondulação (ripple) na cor da camada de pressionado | Destaque de fundo; sem ripple |
| Haptics | `Haptics` do Expo (vibração curta); respeitar configuração do sistema | Taptic Engine (selection, impact, notification) |
| Seletor de data/hora | Diálogo do Material | Roda ou compacto nativo |
| Login social | Google (quando liberado) | Google **e Apple** são obrigatórios se houver login social (App Store); botão Apple em preto/branco, texto "Continuar com Apple" |
| Barra de status | Ícones escuros sobre `surface.background` | Idem; respeitar área segura (notch e home indicator) |
| Teclado | Ações "Próximo/Pronto" na tecla; ajustar a janela (`adjustResize`) para que a barra fixa não cubra o campo | `KeyboardAvoidingView`; botão "Pronto" na barra |
| Compartilhar | Share sheet do Android | Share sheet do iOS |
| Fonte | Figtree embutida; fonte do sistema como reserva | idem |
| Notificações | Canal "Pedidos" com som e prioridade alta (Android 13+: pedir permissão) | Permissão com explicação prévia; sem "provisional" para pedidos |

## 9. Web: lojista e admin

- **Mobile-first.** O lojista abre no celular e no PC do balcão. Em celular: barra inferior e telas de uma coluna. A partir de 1024: barra lateral + conteúdo, largura máx. 1200 (formulários 480 a 640).
- **Densidade.** Lojista usa o modo confortável (linha 48). Admin pode alternar "compacta" (40), só em desktop com ponteiro.
- **Teclado e atalhos (admin):** `/` foca a busca, `g` + `l` vai a Lojas, `a` aprova no revisor, `?` mostra atalhos. Todos têm equivalente por clique.
- **Tabelas:** colunas ordenáveis, filtros salvos por usuário, exportar CSV, ação em massa com confirmação que mostra a contagem ("Pausar 12 produtos?").
- **Confirmação destrutiva:** repetir o nome do alvo ("Suspender Casa Bela?") + motivo obrigatório; toda ação gera log de auditoria.
- **Impressão:** comanda 80 mm; extrato A4 em preto e branco.
- **Perfis do admin (RBAC):** super admin, operação, financeiro, suporte; cada um vê só seus itens de menu; ação sem permissão mostra o ErrorState "Você não tem acesso".

## 10. Desempenho (celular fraco e 3G)

| Meta [HIPÓTESE, medir] | Valor |
|---|---|
| Primeira tela útil (skeleton) | < 1 s após abrir; conteúdo real < 3 s em 3G rápido |
| Imagens | Miniatura de lista ≤ 30 KB; capa ≤ 120 KB; produto ≤ 80 KB; WebP; 3 larguras |
| Listas | Virtualizadas; sem sombra com desfoque em itens de lista (custa GPU no Android de entrada); fio 1 px no lugar |
| Animação | Só `opacity` e `transform`; sem Lottie acima de 50 KB; 60 fps em dispositivo de teste de entrada |
| Fonte | 3 pesos; ≤ 150 KB |
| Offline | Cache de Início, Loja, Pedidos e Sacola |
| Web | LCP < 2,5 s no celular fraco; JS de rota do lojista < 200 KB comprimido; tabelas paginadas no servidor |

## 11. Governança

- **Versão:** tokens e componentes seguem semver. Mudança de valor de cor ou tamanho = versão menor com nota no `status.md`; remoção de token = maior.
- **Novo componente ou variante:** antes de criar, o dev procura na §3. Se não existe, abre pedido ao designer com o caso de uso; o designer decide estender ou compor.
- **Revisão de design (por PR de tela):** (1) só tokens, sem valores soltos; (2) alvo ≥ 48; (3) todos os estados da §5; (4) rótulos de acessibilidade; (5) textos conforme `identidade.md` §8; (6) uma ação primária; (7) sem emoji, gradiente ou sombra fora da escala; (8) testado com fonte a 150% e no Android de entrada; (9) contraste via script; (10) capturas anexadas em `docs/telas/`.
- **Desvios** encontrados na implementação são registrados pelo designer no retorno ao CEO, com tela, esperado e encontrado.

## 12. Mapa para o código

```tsx
// App (Expo)
import { tokens } from '@webag/tokens';
import { textStyles, shadows } from '@webag/tokens/native';
const styles = StyleSheet.create({
  cta: { backgroundColor: tokens.color.action.primary, minHeight: tokens.size.controlLg, borderRadius: tokens.radius.md },
  ctaLabel: { ...textStyles.label, color: tokens.color.text.onBrand },
});
```

```css
/* Web (Next.js) */
.cta { background: var(--wb-color-action-primary); min-height: var(--wb-size-control-lg); border-radius: var(--wb-radius-md); }
.cta:hover { background: var(--wb-color-action-primary-hover); }
```
