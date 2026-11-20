# Telas da Onda 3: descoberta do cliente (app)

> Autor: product-designer. Data: 2026-11-18. Histórias: WB-001 a 005, 011 a 019, 035, 036 (`docs/produto/prd/cliente.md`). Base: `design-system.md` (v0.2.0), `identidade.md` §8, `fluxos.md` §3 e §7.1. Plataforma: app Expo (Android e iOS). Itens **[HIPÓTESE]** estão na §Z.
> **Sacola e aviso de troca de loja** (WB-020, 021, 022) estão em `onda-4-transacao.md` (S1). Entrar e criar conta (usado por favoritar e por "Pedidos") também: S2. Aqui só está o comportamento de retorno (0.6).

## 0. Convenções (valem para todas as telas deste arquivo)

**0.1 Dispositivos.** Celular (360 a 430 dp) é o padrão. Tablet ou tela larga (≥ 600 dp): conteúdo numa coluna de até 720 centrada; grades de produtos passam de 2 para 3 ou 4 colunas; listas de lojas ficam em 2 colunas. Barra inferior mantida. Teste mínimo em 360 x 640 e fonte do sistema a 150%.

**0.2 Estados padrão (EP).** Cada tela lista o que é específico; onde diz "EP", vale:

| Estado | Padrão |
|---|---|
| Skeleton | Forma idêntica ao conteúdo; cache primeiro, atualiza em silêncio; mín. 300 ms; após 8 s: "Está demorando. Sua conexão parece lenta." + "Tentar de novo". Nunca spinner de tela cheia |
| Erro | ErrorState (`WarningCircle`): "Não conseguimos carregar agora." / "Seus dados estão salvos. Tente de novo em instantes." / "Tentar de novo". Erro parcial: bloco inline na seção |
| Offline | Banner `warning.subtle` com `WifiSlash` sob o header: "Sem conexão. Mostrando o que já carregou." Ao voltar: toast "Conectado de novo" (2 s). Ação de escrita explica: "Conecte-se para [ação]. Sua sacola está salva." |
| Sessão expirada | "Entre de novo para continuar." / "Por segurança, sua sessão terminou. Sua sacola continua aqui." / "Entrar" |
| Puxar para atualizar | Em Início, Resultados, Favoritos; indicador `brand.600`; haptic leve |

**0.3 Acessibilidade padrão.** Alvo ≥ 48 dp / 44 pt (ícones de 24 com `hitSlop`); `accessibilityLabel` em todo ícone ("Abrir sacola, 2 itens"); títulos com `accessibilityRole="header"`; ordem de leitura = visual; tamanhos com `maxFontSizeMultiplier` 1,5 (corpo), 1,3 (títulos), 1,2 (rótulos compactos); preço e total nunca truncam; imagem de produto com `alt` = nome do produto; imagens decorativas ocultas do leitor; carregando: "Carregando lojas" e, ao fim, "23 lojas".

**0.4 Rótulos de teste.** `testID="<tela>.<elemento>"` em kebab-case (ex.: `home.search-bar`). Item de lista: `...-<id>`. Botão principal: `...-submit` ou o nome da ação.

**0.5 Haptics.** Seleção (chip, aba, stepper), leve (adicionar, puxar para atualizar), sucesso, erro (validação). Nunca em rolagem.

**0.6 Visitante e retorno exato (WB-005).** Nenhuma tela desta onda pede conta. Ao tocar em favoritar (coração), o app abre S2 (entrar ou criar conta) por cima; depois do login **volta à mesma tela, na mesma posição**, e já executa a ação (o coração aparece marcado). A sacola do visitante é local e migra no login.

**0.7 Endereço atual.** Tem dois níveis: **aproximado** (GPS ou cidade escolhida: frete mostra "a partir de R$ 5,00") e **completo** (CEP + número: frete exato). O checkout só exige o completo (pede o número se faltar).

**0.8 Moeda e formatos.** `R$ 1.234,56`; "Grátis" no lugar de R$ 0,00; tempo "30 a 45 min"; distância "1,2 km"; nota "4,8 · 120".

---

## D1. Onde você quer receber? (WB-001)

**Objetivo:** dizer onde está para ver só lojas que entregam ali. **Ação principal:** "Usar minha localização".
- **Layout (celular):** círculo `surface.sunken` 120 com ícone `MapPin` duotone 64 (sem ilustração), título `title1` "Onde você quer receber?", texto "Mostramos só as lojas que entregam aí." Botão primário `lg` "Usar minha localização" (ícone `Crosshair`) no rodapé fixo; acima dele, secundário "Digitar o CEP"; abaixo, link de texto "Escolher a cidade". Sem login, sem pular.
- **Escolher a cidade:** folha com a lista de cidades ativas (Francisco Morato, Franco da Rocha, Caieiras, Campo Limpo Paulista); ao escolher, abre o Início com o endereço aproximado ("Francisco Morato") e frete "a partir de".
- **Tablet:** conteúdo centrado, largura 480.
- **Fluxo do GPS:** toque → pedido do sistema → buscando (botão com spinner e texto "Procurando sua localização…", link "Digitar o CEP" visível) → se estiver numa região ativa, abre o Início com toast "Entregando em Jardim Fortaleza" (sem tela de confirmação extra); fora de região: D4.

| Estado | Comportamento |
|---|---|
| Skeleton | n/a (tela estática). Buscando: botão em carregando, até 10 s |
| Vazio | n/a |
| Erro | GPS sem resposta em 10 s ou sem sinal: "Não conseguimos achar você. Digite o CEP." + "Digitar o CEP" (primário nessa situação) |
| Offline | ErrorState `WifiSlash`: "Sem conexão" / "Conecte-se para ver as lojas perto de você." / "Tentar de novo"; "Digitar o CEP" continua |
| Sucesso | Toast "Entregando em Jardim Fortaleza." e Início |
| Permissão negada | O título vira "Sem a localização, digite o CEP." Botão primário "Digitar o CEP"; link "Abrir ajustes"; "Escolher a cidade" mantido. O app lembra a escolha e não pede de novo no mesmo uso |

**Antes do pedido do sistema:** esta própria tela explica o motivo (`design-system.md` §5.6). **A11y:** o primeiro foco no título; os 3 caminhos são botões, não links escondidos. **Android x iOS:** Android 12+ oferece "localização aproximada": basta (o app pede só aproximada). **testID:** `location.use-gps`, `location.enter-cep`, `location.choose-city`, `location.city-<id>`, `location.open-settings`, `location.retry`. **Analytics:** `location_set {method: gps|cep|city}`.

## D2. Endereço por CEP (WB-002)

**Objetivo:** informar o endereço sem preencher tudo. **Ação principal:** "Usar este endereço" (visitante) ou "Salvar endereço" (logado, em Meus endereços).
- **Layout:** header "Seu endereço" com voltar. Campos: **CEP** (máscara `00000-000`, teclado numérico, `postalCode`; foco ao abrir) → ao completar 8 dígitos preenche **Rua, Bairro, Cidade** (skeleton nesses 3 campos e "Buscando CEP…" no campo) e leva o foco ao **Número** (+ caixa "Sem número") → **Complemento ou ponto de referência** (opcional, 80, contador). Logado em "Meus endereços": chips opcionais "Casa", "Trabalho", "Outro" acima do botão. Botão `lg` no rodapé, acima do teclado.
- **Tablet:** formulário 480 centrado.
- **Geocodificação (C3):** ao salvar, o app localiza o ponto. Se falhar, abre o **MapPinPicker** "Confirme onde você está": mapa com pino fixo ao centro, arrastar o mapa; texto "Arraste até a porta de casa."; botão "Confirmar ponto". É exceção, não etapa normal.
- **Cidade ou bairro inativo (C5):** não salva; abre D4.

**Mensagens:** "Digite o CEP com 8 números." · "Não achamos esse CEP. Preencha rua e bairro." (campos editáveis) · "Digite o número ou marque Sem número." · "Digite a rua." · "Digite o bairro."

| Estado | Comportamento |
|---|---|
| Skeleton | Rua, bairro e cidade em skeleton + spinner no CEP enquanto consulta |
| Vazio | Formulário em branco (estado inicial) |
| Erro | CEP não achado (acima); serviço de CEP fora do ar: mesma mensagem, campos liberados; geocodificação falhou: MapPinPicker |
| Offline | "Sem conexão. Preencha rua e bairro à mão." Ao salvar: "Conecte-se para salvar o endereço. O que você digitou está aqui." |
| Sucesso | Toast "Endereço salvo." (logado) ou "Entregando em Rua das Palmeiras, 120." (visitante); volta ao ponto de partida e recarrega as lojas |
| Permissão | n/a (o mapa não pede localização do aparelho) |

**A11y:** o MapPinPicker tem alternativa: botões "Mover para cima, baixo, esquerda, direita" (10 m) e "Usar o endereço digitado". Erros ligados ao campo. **Android x iOS:** teclado numérico com "Próximo"; no iOS, barra com "Pronto". **testID:** `address.cep-input`, `address.street-input`, `address.district-input`, `address.city-input`, `address.number-input`, `address.no-number`, `address.complement-input`, `address.nickname-<id>`, `address.map-confirm`, `address.submit`.

## D3. Meus endereços e seletor de endereço (WB-003)

**Objetivo:** trocar o endereço atual ou gerenciar os salvos. **Ação principal:** "Adicionar endereço".
- **Seletor (BottomSheet aberto pelo endereço do header do Início):** título "Entregar em"; lista (ListItem 72, rádio): apelido + "Rua das Palmeiras, 120" + "Jardim Fortaleza, Francisco Morato"; o atual vem marcado. Linha extra "Usar minha localização atual" (`Crosshair`). Tocar numa linha **troca na hora**, fecha a folha e recarrega as lojas (sem botão de confirmar). Rodapé: "Adicionar endereço" (primário).
- **Tela Conta > Endereços:** a mesma lista em tela cheia, com menu `DotsThree` por linha ("Editar", "Excluir") e botão "Adicionar endereço" no rodapé. Sem deslizar para excluir (o menu é a alternativa visível).
- **Limite (C1):** com 8 salvos, o botão continua ativo e mostra "Limite de 8 endereços. Apague um para adicionar."
- **Excluir:** Dialog "Excluir este endereço?" / "Rua das Palmeiras, 120" / "Excluir endereço" (destrutivo) · "Cancelar". Se era o atual: depois do Dialog abre a lista com o título "Escolha onde receber". Se era o único: volta a D1.
- **Visitante:** vê só o endereço atual (guardado no aparelho) e a nota "Crie uma conta para salvar mais endereços."

| Estado | Comportamento |
|---|---|
| Skeleton | 3 linhas de skeleton |
| Vazio | EmptyState `MapPinLine`: "Nenhum endereço salvo" / "Salve um para pedir mais rápido." / "Adicionar endereço" |
| Erro / Offline | EP; lista em cache; trocar endereço offline: "Conecte-se para trocar o endereço." |
| Sucesso | Toast "Entregando em Rua das Palmeiras, 120." / "Endereço excluído." |
| Permissão | n/a |

**A11y:** lista como grupo de rádio ("Entregar em, 3 opções"); o endereço atual anunciado como "selecionado". **testID:** `addresses.sheet`, `addresses.item-<id>`, `addresses.use-gps`, `addresses.add`, `addresses.item-<id>-menu`, `addresses.delete-confirm`, `addresses.limit-message`.

## D4. Região não atendida e aviso (WB-004)

**Objetivo:** explicar que o Webag ainda não chegou ali e deixar o contato. **Ação principal:** "Avisar quando chegar".
- **Layout:** EmptyState `MapPin`: "Ainda não entregamos em Vila Nova." / "Estamos chegando em mais bairros." Abaixo, campo **E-mail** (preenchido se logado) e a caixa **desmarcada** "Quero receber um aviso por e-mail quando o Webag chegar aqui." (consentimento explícito, LGPD). Botão primário "Avisar quando chegar". Secundário: "Ver lojas de Francisco Morato" (cidade ativa mais próxima). Texto: "Mudar endereço".
- **Também usada** quando a região é ativa mas **nenhuma loja** atende: título "Ainda não há lojas aqui." / "Quer ser avisado quando houver?" (WB-012 C4).

**Mensagens:** "Confira o e-mail." · "Marque a caixa para receber o aviso."

| Estado | Comportamento |
|---|---|
| Skeleton | n/a |
| Vazio | É o próprio estado |
| Erro | "Não foi possível salvar. Tentar de novo." (e-mail preservado) |
| Offline | "Conecte-se para salvar seu e-mail." (botão ativo) |
| Sucesso | `CheckCircle`: "Anotado. Avisamos por e-mail quando chegarmos em Vila Nova." + botão "Ver lojas de Francisco Morato" |
| Permissão | n/a |

**A11y:** o consentimento é uma caixa real (não texto solto) com a frase completa como rótulo. **testID:** `region.email-input`, `region.consent`, `region.notify`, `region.see-other-city`, `region.change-address`. **Analytics:** `region_unavailable`.

## D5. Início (WB-005, 011, 012, 036)

**Objetivo:** chegar a uma loja ou produto em 1 toque. **Ação principal:** tocar em uma loja (a busca é a alternativa; não há botão primário). Sem login.

**Layout (celular, de cima para baixo; ritmo em `design-system.md` §4):**
| # | Bloco | Conteúdo de exemplo |
|---|---|---|
| 1 | Header | "Entregar em" (`caption`) + "Rua das Palmeiras, 120" com `CaretDown` (abre D3) · ícone Sacola com contador (S1) |
| 2 | SearchBar | "Buscar produtos e lojas" (botão; abre D6 com teclado aberto) |
| 3 | Segmentado Entrega \| Retirada (WB-036) | "Entrega" selecionada; a escolha persiste |
| 4 | Banners (Carousel 2:1) | "Moda de verão na sua região" (conteúdo do admin); toque abre loja, categoria, produto ou cupom. Sem rotação automática; pontos "Banner 2 de 4" e botões Anterior e Próximo. Sem banner ativo: o bloco some |
| 5 | Categorias (tile sem caixa, círculo 64) | Moda · Calçados · Cosméticos · Eletrônicos · Casa · Papelaria · Pet · Presentes, na ordem do admin; "Ver todas" |
| 6 | Lojas perto de você (**Linha**) | Logo 56 · "Casa Bela" · "Casa e utilidades" · "4,8 · 120" · "30 a 45 min · R$ 5,00 · 1,2 km" · selos Aberta, Frete grátis, Aceita troca. Abertas primeiro, fechadas depois com "Fechada · abre 9h". "Ver todas" abre D7 (aba Lojas) |
| 7 | Ofertas (tiles de produto, carrossel) | Imagem 1:1, "Tênis Corrida Veloz", "R$ 89,90" + "R$ 119,90" riscado + selo "25% off" |
| 8 | Mais vendidos (**numerado**) | "1" grande + imagem 96 + nome + preço; só com ≥ 5 pedidos em 30 dias na região |
| 9 | Lojas novas (**Card de capa** 16:9) | Capa + nome + categoria + "Novo"; só lojas aprovadas há ≤ 30 dias |

Seção sem itens **não aparece**. Uma única Card de capa por tela visível. Em **Retirada** (WB-036): o header vira "Retirar perto de · Jardim Fortaleza"; só aparecem lojas com retirada ativa a ≤ 10 km, o texto de cada loja destaca a distância ("1,2 km · pronto em 20 a 30 min") e as seções 4, 5 e 8 são ocultadas. Nenhuma loja: EmptyState `Storefront` "Nenhuma loja com retirada perto de você" / "Mostramos lojas a até 10 km." / "Voltar para entrega".
**Tablet:** lojas em 2 colunas; ofertas mostram mais tiles; banner com altura máxima de 280.

| Estado | Comportamento |
|---|---|
| Skeleton | Header e endereço reais (do cache); banner 2:1 e linhas de loja em skeleton; círculos de categoria; 4 tiles. Aparece na hora; se há cache, mostra o cache |
| Vazio | Região ativa sem loja visível: "Ainda não há lojas aqui. Quer ser avisado quando houver?" com o bloco de D4. Seção vazia: oculta |
| Erro | Total: EP. Parcial: a seção que falhou mostra "Não carregou. Tentar de novo" inline e as outras seguem |
| Offline | Início do cache + banner; busca bloqueada: "Sem conexão. A busca precisa de internet." |
| Sucesso | Após puxar para atualizar: a posição é preservada e a lista se atualiza em silêncio |
| Permissão | n/a (pedida em D1). Se a localização foi revogada depois, o app usa o último endereço salvo |

**Interações:** barra inferior com Início ativo; toque na aba ativa volta ao topo. **A11y:** os blocos têm título como cabeçalho; tiles lidos como "Calçados, categoria"; carrossel com botões; foco inicial no endereço. **Android x iOS:** título e endereço à esquerda no Android, centralizado no iOS; título grande recolhe no iOS. **testID:** `home.address`, `home.cart`, `home.search-bar`, `home.mode-delivery`, `home.mode-pickup`, `home.banner-<id>`, `home.category-<id>`, `home.categories-all`, `home.store-<id>`, `home.stores-all`, `home.offer-<id>`, `home.bestseller-<id>`, `home.new-store-<id>`, `home.section-error-<id>`. **Analytics:** `store_viewed`, `product_viewed`, `empty_state_viewed`.

## D6. Busca: histórico e sugestões (WB-013 C4, WB-015)

**Objetivo:** achar digitando pouco. **Ação principal:** buscar (tecla "Buscar" do teclado; sem botão na tela).
- **Layout:** header com SearchBar ativa (teclado já aberto, botão voltar, X para limpar com alvo 48). **Sem termo:** bloco "Buscas recentes" (até 10, mais recente primeiro; cada linha com `ClockCounterClockwise`) + link "Limpar histórico"; abaixo, "Categorias" em chips. **Com ≥ 2 letras** (espera 300 ms): sugestões em lista (produtos, lojas e categorias, com o trecho digitado em negrito e um ícone que diz o tipo: `Tag`, `Storefront`, `SquaresFour`).
- **Aba Buscar** da barra inferior abre esta mesma tela.
- **Limpar histórico:** apaga na hora, toast "Histórico apagado." (do aparelho e da conta).

**Mensagens:** com 1 letra: caption "Digite ao menos 2 letras." Sem sugestões: "Sem sugestões. Toque em Buscar para ver os resultados."

| Estado | Comportamento |
|---|---|
| Skeleton | 3 linhas de sugestão em skeleton só se a resposta passar de 300 ms |
| Vazio | Sem histórico: o bloco "Buscas recentes" não aparece; ficam as categorias |
| Erro | Sugestões falharam: caption "Sugestões indisponíveis agora." e a busca por "Buscar" segue funcionando |
| Offline | Histórico e categorias continuam; ao buscar: "Sem conexão. A busca precisa de internet." |
| Sucesso | Abre D7 com os resultados |
| Permissão | n/a |

**A11y:** sugestões como lista ("Sugestão 1 de 6: Tênis Corrida Veloz, produto"); X com rótulo "Limpar busca". **Android x iOS:** teclado `web-search`/`search` com a tecla "Buscar". **testID:** `search.input`, `search.clear`, `search.history-<n>`, `search.clear-history`, `search.suggestion-<id>`, `search.category-<id>`. **Analytics:** `search {query_len, results}`.

## D7. Resultados e filtros (WB-013, WB-014; também Categoria e "Ver todas")

**Objetivo:** reduzir as opções até achar. **Ação principal:** tocar em um resultado; o botão "Ver N resultados" da folha de filtros é o primário quando ela está aberta.
- **Entradas:** busca por termo; categoria (título = nome da categoria; sem termo); "Ver todas" lojas.
- **Layout:** header com SearchBar mostrando o termo (toque volta a D6). Tabs "Produtos (23)" e "Lojas (8)". Abaixo, linha rolável de chips: **"Filtros (2)"** (primeiro, com contador), "Ordenar: Relevância", e os filtros ativos como chips com "x". Resultados: Produtos em **grade de 2 colunas** (Card de produto com a loja em `caption`); Lojas em **Linha**. Paginação de 20 (skeleton no rodapé ao carregar mais).
- **Folha "Filtros" (BottomSheet 90%):** Categoria (chips múltiplos) · Preço (campos "Mínimo" e "Máximo" em moeda; sem slider, que é ruim para acessibilidade) · Distância (chips 1, 3, 5, 10 km) · Avaliação (chips "3 ou mais", "4 ou mais") · Switches "Entrega grátis" e "Aceita troca". Rodapé fixo: **"Ver 23 resultados"** (a contagem atualiza ao mudar; sem rede vira "Aplicar") e "Limpar tudo" (texto).
- **Folha "Ordenar":** rádio Relevância, Menor preço, Distância, Avaliação (na aba Lojas, sem "Menor preço"). Escolher aplica e fecha.
- **Loja fechada (C5):** produto aparece com selo "Fechada"; abre normalmente, mas não vai ao pedido (D9).

**Mensagens:** "O preço mínimo não pode ser maior que o máximo." (no campo; o filtro não aplica).

| Estado | Comportamento |
|---|---|
| Skeleton | 6 cards de produto (2 colunas) ou 5 linhas de loja, conforme a aba |
| Vazio | EmptyState `MagnifyingGlass`: "Nada para "tênis azul"" / "Confira a escrita ou tente uma palavra mais simples." / "Limpar filtros" (se houver filtro) ou "Ver lojas"; abaixo, chips de categorias sugeridas. Filtro sem resultado: "Nenhum resultado com esses filtros." + "Limpar filtros" |
| Erro | EP; chips e termo preservados |
| Offline | Últimos resultados em cache + banner; filtrar ou buscar de novo: "Sem conexão. A busca precisa de internet." |
| Sucesso | A lista reordena sem recarregar a tela; anuncia "23 resultados" |
| Permissão | Filtro "Distância" sem endereço completo usa o aproximado; sem endereço: "Defina seu endereço para filtrar por distância." + "Definir endereço" |

**A11y:** o contador do filtro é lido ("Filtros, 2 ativos"); chips com estado selecionado anunciado; o "x" de cada chip tem rótulo "Remover filtro Entrega grátis". **Tablet:** grade em 3 colunas. **Android x iOS:** folha nativa com alça e detents no iOS. **testID:** `results.search-bar`, `results.tab-products`, `results.tab-stores`, `results.filters`, `results.sort`, `results.chip-<id>`, `results.product-<id>`, `results.store-<id>`, `filters.category-<id>`, `filters.price-min`, `filters.price-max`, `filters.distance-<km>`, `filters.rating-<n>`, `filters.free-delivery`, `filters.accepts-exchange`, `filters.apply`, `filters.clear`, `sort.option-<id>`. **Analytics:** `filter_applied {type}`.

## D8. Loja (WB-016)

**Objetivo:** confiar na loja e achar o produto. **Ação principal:** abrir um produto; quando há itens na sacola, a barra "Ver sacola" é a ação principal fixa.

**Layout (celular, de cima para baixo):**
1. **Capa 16:9** (foto real) com voltar (esquerda), favoritar e compartilhar (direita) sobre **scrim 72%** para garantir contraste. **Logo 56** sobreposto à capa.
2. Nome (`title2`, "Casa Bela") · nota "4,8 · 120" (ou "Novo" com menos de 3 avaliações; toca e abre D10) · **estado**: "Aberta · fecha às 18:00" (selo Aberta) ou "Fechada · abre 9h".
3. **Metadados com ícones:** "30 a 45 min · R$ 5,00 · 1,2 km" (ou "Grátis acima de R$ 120,00") · "Pedido mínimo R$ 30,00" · "Retirada em 20 a 30 min".
4. Selos: Aceita troca. Duas ações em texto, lado a lado: "Política de trocas" e "Sobre a loja".
5. **Tabs de seções** (fixas ao rolar, rolável): "Mais vendidos", "Camisetas", "Calçados", "Outros".
6. **Produtos** em grade de 2 colunas por seção; indisponíveis ao final com "Indisponível".
7. **Barra flutuante** "Ver sacola · 2 itens · R$ 89,90" (CartBar) quando há itens **desta** loja.

- **Loja fechada ou pausada (C3):** Banner info no alto "Fechada agora. Abre amanhã às 9h." (pausada: "Fechada por agora. Volta às 15:30."). Navegação livre; a compra é bloqueada em D9.
- **Não entrega no endereço (C4):** Banner de alerta "Não entrega no seu endereço." + botão secundário "Retirar na loja · 4,2 km" (só se aceita retirada e está a ≤ 10 km; ativa o modo Retirada para esta loja) ou "Mudar endereço".
- **Folha "Política de trocas" (C5):** "Troca por tamanho ou cor": "Essa loja aceita, em até 7 dias depois de receber. Coleta em casa: R$ 5,00." ou "Essa loja não faz troca por tamanho ou cor." Em seguida "Seus direitos, em qualquer loja": "Arrependimento: você pode desistir em até 7 dias depois de receber." / "Defeito: troca ou reembolso por produto com defeito." **[HIPÓTESE jurídica, validar antes do G5]**. Botão "Fechar".
- **Folha "Sobre a loja" (C6):** razão social ("Casa Bela Comércio Ltda"), CNPJ parcial ("12.345.678/****-**"), endereço, horários da semana (lista), "Fechar". Texto fixo: "Quem vende é a loja. O Webag cuida do pagamento e da entrega combinada."
- **Tablet:** capa com altura máxima de 320; produtos em 3 colunas.

| Estado | Comportamento |
|---|---|
| Skeleton | Capa 16:9, círculo do logo, 3 linhas, tabs e 4 tiles de produto em skeleton |
| Vazio | Loja sem produto ativo (link antigo): "Essa loja ainda não tem produtos." / "Volte em breve." / "Ver outras lojas" |
| Erro | Loja não encontrada ou removida: "Essa loja não está mais disponível." / "Ela pode ter saído do Webag." / "Ver lojas". Demais: EP |
| Offline | Loja do cache + banner; "Ver sacola" funciona (sacola local) |
| Sucesso | Favoritar: coração Fill + toast "Loja salva nos favoritos."; compartilhar abre a folha nativa |
| Permissão | Favoritar sem conta: S2 e retorno exato (0.6) |

**A11y:** estado "Aberta" e "Fechada" com ícone + texto; metadados lidos numa frase ("Entrega em 30 a 45 minutos, taxa 5 reais, 1,2 quilômetro"); tabs de seção como lista de abas com a atual anunciada; scrim garante 7,0:1 nos ícones sobre a capa. **Android x iOS:** botão voltar e gesto de borda; compartilhar usa o share sheet do sistema. **testID:** `store.back`, `store.favorite`, `store.share`, `store.rating`, `store.exchange-policy`, `store.about`, `store.pickup-switch`, `store.tab-<id>`, `store.product-<id>`, `store.cart-bar`, `store.closed-banner`, `store.no-delivery-banner`. **Analytics:** `store_viewed {store_id}`.

## D9. Produto (WB-017)

**Objetivo:** escolher a variação certa e adicionar. **Ação principal:** "Adicionar · R$ 89,90" (barra fixa no rodapé). Barra inferior de navegação oculta nesta tela.

**Layout (celular, de cima para baixo):**
1. **Galeria 1:1** (deslizar; contador "2/5"; toque abre tela cheia com zoom por pinça e botão "Fechar"; setas para quem não usa gesto). Voltar e favoritar sobre a imagem, com scrim.
2. **Preço `display`** "R$ 89,90"; promoção: "R$ 119,90" riscado + selo "25% off". Antes de escolher a variação, preço diferente por variação aparece como "A partir de R$ 89,90". Nome (`title2`, até 2 linhas). Nota "4,6 · 38".
3. **Variações:** grupo "Tamanho" em chips (selecionado: `brand.50` + borda 2 + check). Esgotado: texto riscado, `opacity.disabled`, anunciado "42, esgotado", não selecionável. Grupo "Cor" em amostras de 48 com o **nome escrito** abaixo ("Cor: Azul-marinho"), check na escolhida; amostra esgotada com traço diagonal. Só combinações com estoque ficam selecionáveis (escolher o tamanho recalcula as cores).
4. **Estoque:** "Últimas 2 unidades" (alerta com ícone) quando ≤ 3.
5. **Troca (diferencial):** `ArrowsClockwise` "Troca por tamanho ou cor em até 7 dias" (ou "Arrependimento em até 7 dias e defeito: veja seus direitos" se a loja não faz troca voluntária). Toque abre a folha de D8.
6. **Loja:** logo 40 + "Casa Bela" + "Ver loja".
7. **Descrição** recolhida em 3 linhas + "Ver mais".
8. **Avaliações:** nota, total, 3 avaliações recentes, "Ver todas (38)" (abre D10).
9. **Barra fixa:** QuantityStepper (1 a min(estoque, limite)) + botão "Adicionar · R$ 89,90" (o valor acompanha a quantidade). Máximo: "+" desabilitado e "Só 3 em estoque" em `text.danger`.

**Interações do botão:**
| Situação | Resultado |
|---|---|
| Variação obrigatória sem escolha (C3) | O botão continua ativo; rola até o grupo, borda `border.danger` e "Escolha o tamanho."; haptic erro |
| Escolha completa, sacola vazia ou da mesma loja | Adiciona; botão mostra check e "Adicionado" por 2 s; toast "Adicionado à sacola." com ação "Ver sacola"; haptic leve; fica na tela |
| Sacola tem item de **outra** loja (WB-021) | Dialog "Esvaziar a sacola?" (S1); se "Manter minha sacola", nada muda |
| Loja fechada ou pausada | O botão mostra "Fechada · abre 9h" e não adiciona; abaixo, "Ver produtos da loja" |
| Promoção acabou durante a tela (C5) | Adiciona com o preço novo e avisa: "A promoção acabou. O preço agora é R$ 99,90." |
| Todas as variações esgotadas | Selo "Esgotado" no lugar do preço em destaque; botão "Ver outros da loja" |

- **Tablet:** galeria à esquerda (máx. 480), informações à direita; barra fixa abaixo das duas colunas.

| Estado | Comportamento |
|---|---|
| Skeleton | Quadrado 1:1, linha de preço, 2 linhas de nome, 4 chips |
| Vazio | n/a (toda página de produto tem dados); sem avaliações: "Ainda sem avaliações" |
| Erro | Produto pausado ou removido (C6): "Esse produto não está mais disponível." / "A loja pode ter retirado ele." / "Ver outros da loja". Demais: EP |
| Offline | Página do cache; adicionar funciona (sacola local) com aviso no toast "Adicionado. Vamos conferir o estoque quando você estiver online." |
| Sucesso | Adicionado (tabela acima) |
| Permissão | Favoritar sem conta: S2 e retorno exato |

**A11y:** estepper "Quantidade, 2" ajustável; grupos de variação como rádio com o nome do grupo; galeria lida "Foto 2 de 5"; o botão fixo não cobre campos em foco (não há campos). **Android x iOS:** pinça e duplo toque no zoom nos dois; o iOS usa gesto de borda para voltar. **testID:** `product.gallery`, `product.gallery-fullscreen`, `product.favorite`, `product.price`, `product.variant-size-<id>`, `product.variant-color-<id>`, `product.variant-error`, `product.stock-warning`, `product.exchange`, `product.store`, `product.description-more`, `product.reviews-all`, `product.qty`, `product.qty-plus`, `product.qty-minus`, `product.add`. **Analytics:** `product_viewed`, `variant_selected`, `add_to_cart`.

## D10. Avaliações (WB-018)

**Objetivo:** ler o que outros compradores disseram. **Ação principal:** ler (rolagem; sem botão). Entrada: nota da loja (D8) ou "Ver todas" do produto (D9).
- **Layout:** header "Avaliações". Resumo: nota em `numeral` "4,8", estrelas Fill, "120 avaliações", 5 barras de distribuição (5 a 1) com a contagem em número. Lista (10 por página, mais recente primeiro): nome abreviado ("Maria S."), estrelas + nota em número, data "12 nov", comentário, selo "Compra verificada" (`SealCheck` + texto), e a resposta da loja recuada ("Resposta da loja") quando houver. Rodapé de lista: "Carregar mais" (ou automático com skeleton).
- **Menos de 3 avaliações:** a média não aparece; no lugar, "Novo"; os comentários existentes aparecem.

| Estado | Comportamento |
|---|---|
| Skeleton | Resumo e 4 avaliações em skeleton |
| Vazio | `Star`: "Ainda sem avaliações" / "Depois que alguém comprar e avaliar, aparece aqui." / "Voltar à loja" |
| Erro / Offline | EP; avaliações já carregadas permanecem |
| Sucesso | n/a (somente leitura) |
| Permissão | n/a ("Denunciar" entra na onda 6, WB-038, no menu de cada avaliação) |

**A11y:** nota lida "4,8 de 5, 120 avaliações"; barras com texto "5 estrelas: 90". **testID:** `reviews.summary`, `reviews.item-<id>`, `reviews.store-reply-<id>`, `reviews.load-more`.

## D11. Favoritos (WB-019, Should)

**Objetivo:** voltar rápido ao que salvou. **Ação principal:** abrir um favorito. Fica em Conta > Favoritos.
- **Layout:** Tabs segmentadas "Lojas" e "Produtos". Lojas em Linha; Produtos em grade. Coração Fill em cada item (toque remove, com toast "Removido dos favoritos." + "Desfazer"). Item de loja ou produto indisponível: selo "Indisponível" e permanece até remover.
- **Visitante:** em vez da lista, EmptyState `Heart`: "Entre para salvar favoritos" / "Seus favoritos ficam em todos os seus aparelhos." / "Entrar" (abre S2; volta aqui).

| Estado | Comportamento |
|---|---|
| Skeleton | 4 linhas ou 4 cards |
| Vazio | "Nenhum favorito ainda" / "Toque no coração das lojas e produtos de que gostar." / "Explorar lojas" |
| Erro | EP; remover com falha: o coração volta e "Não foi possível remover. Tentar de novo." |
| Offline | Lista do cache; favoritar e remover ficam em fila local e sincronizam depois (ação segura) |
| Sucesso | Toast com "Desfazer" |
| Permissão | n/a |

**A11y:** coração com rótulo "Remover Casa Bela dos favoritos"; estado anunciado. **testID:** `favorites.tab-stores`, `favorites.tab-products`, `favorites.item-<id>`, `favorites.remove-<id>`, `favorites.login`, `favorites.explore`.

## G1. Estados globais do app (WB-035)

Aplicam-se a qualquer tela; todos sem código técnico na tela.

| Situação | Título | Texto | Ação | Obs. |
|---|---|---|---|---|
| Sem conexão | (faixa) "Sem conexão. Mostrando o que já carregou." | n/a | n/a | Conteúdo já carregado continua visível |
| Erro de servidor | "Não conseguimos carregar agora" | "Seus dados estão salvos. Tente de novo em instantes." | "Tentar de novo" | Substitui o "Algo deu errado" do PRD, que a identidade proíbe |
| Rede lenta | "Está demorando" | "Sua conexão parece lenta." | "Tentar de novo" | Após 8 s de skeleton |
| Manutenção (C4) | "Estamos em manutenção" | Mensagem do admin; padrão "Voltamos em alguns minutos." | "Tentar de novo" | Ícone `Wrench`; bloqueia todas as telas |
| App desatualizado (C5) | "Atualize o app" | "Esta versão não funciona mais. Atualize para continuar." | "Atualizar" (abre a loja) | Sem botão fechar |
| Sessão expirada | "Entre de novo para continuar" | "Por segurança, sua sessão terminou. Sua sacola continua aqui." | "Entrar" | Volta à tela de origem |
| Escrita sem rede (C3) | (toast ou texto inline) | "Conecte-se para pagar. Sua sacola está salva." | n/a | Nunca fila silenciosa para pagamento |

**testID:** `global.offline-banner`, `global.error-retry`, `global.maintenance`, `global.update-required`, `global.update-open-store`, `global.session-login`.

---

## Z. Hipóteses e pendências desta onda

| # | Item | Tipo | Quem |
|---|---|---|---|
| 1 | Plano de execução coloca WB-020/021/022 (sacola) na onda 3B, mas a spec está em `onda-4-transacao.md`: o PM deve mover as histórias para a onda 4 ou liberar essa spec junto com a 3B | Conflito de planejamento | PM |
| 2 | PRD WB-002 C3 e ADR-008 pedem pino no mapa; `fluxos.md` (HIP-D10) dizia "sem mapa". Decisão do design: mapa só como **exceção** (geocodificação falhou) e na loja (onda 2); sem mapa no caminho normal | Revisão de HIP-D10 | tech-lead (provedor do mapa) |
| 3 | PRD WB-016 C3 deixa "navegar" com loja fechada e bloqueia só o pagamento; o design bloqueia já em "Adicionar" (evita beco sem saída no checkout), coerente com `fluxos.md` §3 | Divergência de texto, mesma regra RN-03 | PO |
| 4 | Textos de direitos do consumidor (arrependimento 7 dias; defeito) na folha de trocas | HIPÓTESE jurídica (DEC-011, HIP-017) | PO + jurídico |
| 5 | Aviso "Quem vende é a loja..." em "Sobre a loja" (Decreto 7.962) | HIPÓTESE | PO + jurídico |
| 6 | Modo Retirada oculta banners, categorias e lojas novas | Decisão de design, ajustável | PO |
| 7 | "Escolher a cidade" é link de texto (3º caminho do PRD WB-001 C1), e não botão, para manter 1 ação principal | Decisão de design | PO |
| 8 | Preço por variação: "A partir de" antes da escolha | Decisão de design | PO |
