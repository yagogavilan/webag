# Telas da Onda 7: painéis do lojista e do admin na direção v3

> Autor: product-designer. Data: 2026-11-19. Decisões: DEC-051/052 (v3 aprovada, inclusive para os painéis), DEC-052 (pagamento sem destaque ao PIX), DEC-053/054 (faixa e atraso), DEC-045 (painéis reais). Histórias novas cobertas: WB-255, WB-256, WB-257, WB-258 (`prd/logistica.md`, `prd/lojista.md`), WB-195 (avaliações no celular).
> Protótipo: `docs/prototipo/paineis-v3.html` (rotas e parâmetros no comentário do topo). Navegação no celular: `onda-7-navegacao-paineis.md`. Estrutura e regras das telas continuam em `onda-2-lojista-admin.md`, `onda-4d-logistica-admin.md`, `onda-5-posvenda.md` e `onda-6-conformidade.md`: esta spec diz **o que muda** e detalha só o que é novo.
> Prefixos de teste: `lojista.<tela>.` e `admin.<tela>.` (como no código atual).

## 0. Como a v3 entra nos painéis (dial baixo: ferramenta de trabalho, não vitrine)

| Princípio v3 (`direcao-v3.md` §2) | No painel | Limite |
|---|---|---|
| P1 Um herói por tela | **Título da tela em Bricolage 800, 50 px (celular 38)** no cabeçalho roxo; **números grandes** (Bricolage 40 a 56) para dinheiro, contagem e prazo restante | Só 1 número ≥ 52 por dobra; tabela e formulário em Figtree |
| P2 Cor em bloco | Cabeçalho **roxo com corte diagonal**; **1 bloco noite por tela** para o que pede ação agora (pedidos novos, atrasos, "Você recebe", resumo do produto) | Nunca dois blocos noite lado a lado; pastel só nos tons de feedback (`warning.subtle`, `danger.subtle`) em áreas pequenas |
| P3 Inclinação de 8° | Indicador da aba, do item ativo da barra inferior, barra de contagem do pedido novo, faixa da prévia de horário | Texto nunca inclinado |
| P4 Barras como sistema | Divisor do resumo financeiro, rodapé da barra lateral, logo, carregando | Nunca enfeite solto no conteúdo |
| P5 Produto protagonista | **Objetos ilustrados** do kit (`kit-marca-v3.md` §7) como miniatura de produto até chegarem as fotos; banner e capa com arte sobre roxo | Foto do lojista nunca sai do contêiner |
| P6 Ritmo editorial | Folha clara (raio 30) sobre o cabeçalho; grade 1,55 : 1 (conteúdo e lateral de apoio); cartões `neutral.100` sem sombra | Densidade de tabela mantida no desktop |
| P7 Movimento | Entrada da folha (rise 450 ms), barras do gráfico crescem, pedido novo "pula" uma vez | Nada em loop, exceto a contagem; `prefers-reduced-motion` desliga tudo |

**Acento lima (≤ 5%):** contador de pendências (badge), botão de ação **sobre noite** ("Aceitar pedido", "Atribuir ao mesmo motoboy", "Aprovar loja"), contagem regressiva, "Você recebe" sobre noite, item ativo da barra lateral (ícone). Em fundo branco o lima nunca carrega texto.

**Contraste:** branco sobre roxo `#C02EF0` (4,29:1) **só no título** (≥ 38 px). O rótulo acima do título (ex.: "Quinta, 19 de novembro", "Entrega pela Webag") vai numa pastilha noite; o subtítulo vai para a primeira linha da folha. Ações na folha, nunca no roxo.

**Ícones:** Solar linear 1,8 na navegação e nas ações; bold-duotone (camada `roxo.300` ou lima sobre noite) só em metadado de marca (relógio, moto, sino, bilhete, alerta). **Hoje o `apps/web` usa Phosphor**: a v3 troca para Solar nos painéis (mesma família do app; crédito CC BY 4.0 também na web, `onda-7-licencas.md` §4).

## 1. Moldura (todas as telas)

| Peça | Desktop ≥ 1024 | Celular e tablet < 1024 |
|---|---|---|
| Cabeçalho | Roxo, 76 de linha + título; corte diagonal de 64 px à direita. Logo completo, seletor de painel (só protótipo), pastilha noite da loja ("Moda Morato · Aberta") ou "Administração · perfil", som (lojista), Ajuda, avatar | Logo-símbolo, pastilha da loja, som. Ajuda, conta e sair vão para "Mais" |
| Título | Alinhado à coluna de conteúdo (recuo da barra lateral + 24); voltar em pastilha noite acima do título nas telas de detalhe | Título 38 px, 16 de margem |
| Corpo | Barra lateral branca (248, raio 24, fixa) + **folha** branca raio 30 sobrepondo o cabeçalho em 64 px | Folha com raio só em cima, sobrepõe 36 px; **barra inferior** (`onda-7-navegacao-paineis.md`) |
| Estados padrão | Skeleton com a forma do conteúdo; vazio com a sacola da marca (sem rosto) + título Bricolage 26 + 1 ação; erro e sem conexão como `onda-2` §0.2 | Igual |

Componentes novos para o `mobile-dev` (web): `PanelHeader`, `Sheet`, `SideNav`, `BottomNav` + `MoreSheet`, `Kpi` (4 tons: neutro, noite, alerta, perigo), `DeadlineBlock` (prazo restante), `BatchBar`, `EtaPreview` (equação em barras + régua com teto), `YouGetBox` (noite com valor lima), `OrderCardNew` (noite com contagem). Tokens: os da v3 (`direcao-v3.md` §6) + `layout.sideWidth` 248, `layout.headerOverlap` 64/36.

## 2. Lojista: o que muda por tela

| Tela | Herói / bloco | Mudança de conteúdo | testID novo |
|---|---|---|---|
| Início | "Bom dia, Fátima"; bloco noite "2 pedidos novos" com contagem lima e "Ver pedidos" | Linha "Loja aberta" com interruptor no topo da folha; vendas de hoje 56 px; ranking com numerais Bricolage e objetos; cartão "Avaliação" leva às Avaliações ("2 sem resposta") | `lojista.home.open`, `lojista.home.open-switch`, `lojista.home.new-orders` |
| Pedidos | Cartão do **pedido novo em noite** (contagem 40 px lima, barra inclinada que esvazia, "Aceitar pedido" lima, "Recusar" contornado branco) | Selo "**Pago no app**" no lugar de "PIX pago" (DEC-052). Em preparo: **"Marque 'pronto' até 18:42 para cumprir o prazo"** (§2.1) | `lojista.orders.card-<id>`, `lojista.orders.accept-<id>`, `lojista.orders.ready-by-<id>` |
| Produtos | Lista com objeto 56 x 64; "Você recebe" em verde | Ação em massa em barra noite fixa | (inalterados) |
| Produto (editar) | Resumo lateral em noite com "Publicar produto" lima | "Você recebe" em caixa noite com valor 40 px lima | `lojista.product.you-get` |
| Trocas | Faixa noite "Retira Troca"; prazo de 24 h em pastilha | Objeto do produto no cartão | (inalterados) |
| **Avaliações (WB-195)** | Nota 4,7 em bloco noite com distribuição | Abas "Sem resposta" / "Todas"; "Como vestiu" com barras; "Responder" abre folha; agora acessível no celular pelo "Mais" | `lojista.reviews.item-<id>` |
| Financeiro | "Você recebe" em bloco noite, valor lima 56 px; divisor de barras | Igual ao v2 em conteúdo | (inalterados) |
| Minha loja › Entrega e retirada | §2.2 | Preparo único da entrega + prévia | `lojista.store.delivery`, `lojista.store.prep-input` |
| Equipe | Tabela com pastilha de papel | Interruptor de acesso | (inalterados) |

### 2.1 "Marque pronto até" (WB-257 C5) — adotado, com outra fórmula
- **Mostrar:** sim, porque é a única informação de prazo que o lojista controla e reduz a causa "loja demorou". **Não** mostra a faixa do cliente nem o motoboy.
- **Fórmula proposta:** `pronto_até = horário do pagamento aprovado + preparo da loja` (o mesmo preparo que entrou na faixa). O PRD sugere "início da faixa − despacho − deslocamento", que dá `pagamento + preparo − folga` (15 min mais cedo): o lojista veria "atrasado" em quase todo pedido sem o cliente estar atrasado. **PO decide.**
- Visual: pastilha `neutral.100` com relógio duotone. Passou do horário: pastilha `warning.subtle` "Passou do horário de pronto. Termine assim que puder." (sem ameaça; o cliente não está necessariamente atrasado).

### 2.2 Minha loja › Entrega e retirada (WB-057 C3 e C4, WB-257)
- **Layout:** coluna principal (Entrega e retirada · Tempo de preparo da entrega · Retirada) + coluna lateral fixa **"Prévia para o cliente"**.
- **Tempo de preparo (minutos):** campo numérico com sufixo "min", vazio usa o padrão ("Usando o padrão da Webag: 20 min."). Ajuda: "Entra no horário que o cliente vê. Informe o tempo real: se você demora mais, o pedido atrasa e o cliente pode cancelar sem custo." Erro: "Use de 5 a 120 minutos." Salvar: toast "Alterações salvas. O preparo novo vale para os próximos pedidos."
- **Aviso C6** (mediana real ≥ informado + 10, mín. 3 pedidos): caixa alerta "Seu preparo real está em 42 min. / Atualize para o cliente não esperar mais do que o previsto."
- **Prévia:** select "Endereço de teste" (3 endereços da região, com km) → caixa noite "Chega em 46 a 76 min" (Bricolage 26) + "O cliente paga R$ 6,90 de entrega. Conta: preparo 30 + espera do motoboy 15 + trajeto 16 min, com folga de 15 para mais e para menos." Fora do alcance: caixa alerta "Fora da área de entrega da loja / [endereço] fica longe demais para o pedido chegar no prazo. A loja não aparece para quem mora lá; a retirada continua." (sem "2 h", D1 de `onda-7-eta-atraso.md`). Recalcula a cada tecla; a conta é a do servidor (`POST` de prévia, mesmo cálculo do checkout).
- **Retirada:** "Pronto para retirar em, no mínimo / e no máximo" (min) e endereço.
- A11y: prévia é região viva educada; a soma é lida por extenso.

## 3. Admin: Logística com faixa, atraso e lote (WB-255, WB-256; substitui o tempo de espera da LG1 para entregas com faixa)

### 3.1 Topo
- **Alerta noite** (só com atraso ou pedido de cancelamento): ícone de perigo em quadrado branco, "**2 corridas atrasadas**" (Bricolage 26) e, havendo pedido de cancelamento, "E-2026: o cliente pediu cancelamento. Responda em **06:58**, senão o sistema aceita." · botão lima "Ver em andamento". Toca o som de alerta **uma vez por corrida** (`late_alerted_at`).
- **4 números** (`Kpi`): Esperando motoboy (noite) · Em risco (alerta, se > 0) · Atrasadas (perigo, se > 0) · No prazo hoje (%).
- Abas: Fila de coleta (n) · Em andamento (n) · Concluídas · Motoboys.

### 3.2 Linha da corrida (`DeadlineBlock` + conteúdo + ações)
| Parte | Conteúdo |
|---|---|
| Bloco de prazo (132 de largura; no celular vira linha) | Rótulo em caixa alta + número Bricolage 40 + "Prometido até 16:10". **No prazo**: `neutral.100`, "22 min". **Em risco** (restam ≤ `entrega_faixa_min` e ainda não saiu): `warning.subtle` + borda `warning.border`, "12 min". **Atrasada** (passou do fim): bloco `danger` com texto branco, ícone, "+8 min", e borda 2 px na linha. Nunca só cor: sempre a palavra |
| Conteúdo | Selos "E-2031 · Entrega" e o estado; rota "Moda Morato → Centro" (Bricolage 19, só bairro); meta: cidade · "Pronto há 9 min" ou "Rafael · a caminho da loja há 14 min" · "Faixa 15:40 – 16:10" · "#1043 · 2 volumes" |
| Ações | Fila: caixa "Lote" (só entrega pronta) + "Atribuir" (primário só na 1ª linha; demais em noite). Em andamento: "Marcar coletado" / "Marcar entregue" / "Não entregue" / "WhatsApp" |
| Ordenação | Pelo **fim da faixa** (mais urgente no topo); troca e corrida sem faixa depois, pelo "pronto" mais antigo (RN-18). Troca mantém o `WaitChip` e "Coletar até hoje, 18h" (`onda-4d` §0.4) |

### 3.3 Pedido de cancelamento por atraso (WB-255 C6)
Faixa `danger.subtle` dentro da linha: "O cliente pediu cancelamento por atraso / Responda em **07:00**. Sem resposta, o sistema aceita e o pacote volta à loja." · "Chego em até 10 min" (noite) e "Aceitar cancelamento" (contorno perigo). Resposta "chego": toast "O cliente foi avisado: chega em até 10 min. Sem a entrega até lá, o cancelamento é aceito." Aceitar: corrida vira devolução; toast "Cancelamento aceito. Avise o motoboy para devolver o pacote à loja. O estorno é total, com a entrega." Silêncio: registra "aceito pelo sistema" na auditoria.

### 3.4 Causa do atraso (WB-255 C5)
"Marcar entregue" numa corrida atrasada abre a folha "**E-2028 atrasou. Qual foi a causa principal?**" (Loja demorou · Sem motoboy · Trajeto · Cliente ou endereço · Outro com texto) e, se passou da tolerância, a nota "Passou da tolerância: o cliente ganha **entrega grátis no próximo pedido**, automaticamente." Concluídas mostra "Atrasou 19 min · Causa: Sem motoboy".

### 3.5 Lote por área (WB-256)
- Marcar "Lote" em 2 ou mais entregas prontas abre a **barra de lote** (noite, fixa no rodapé da folha): "2 corridas no lote · Francisco Morato / O horário prometido de cada pedido não muda." · "Limpar" · "Atribuir ao mesmo motoboy" (lima).
- Bloqueios escritos na própria barra (botão inativo): "Só entregas prontas da mesma cidade entram no mesmo lote." · "Máximo de 4 corridas por lote." · "Marque mais uma entrega da mesma cidade."
- **Folha do lote:** lista numerada pela urgência, cada uma com "faltam 12 min para o fim da faixa"; a que tem ≤ `entrega_faixa_min` aparece em `warning.subtle` com "**Esta corrida pode atrasar:**" e o link "Tirar do lote" (a operação decide; não bloqueia). Motoboys com "Já tem 1 corrida ativa". Botão "Atribuir lote (2)".
- **Mensagem única de WhatsApp:** coletas e entregas numeradas, 1º nome e telefone do cliente, "Pago no app. Não cobrar nada." Sem valores e sem código de entrega (WB-232 C5, RN-18).
- Disputa perdida numa corrida: as outras seguem; a que falhou volta à fila com "Esta corrida já foi atribuída a Ana às 10:42."

### 3.6 Perfis
Operação e super admin despacham. **Suporte e financeiro só leem**: sem ações, faixa "Você pode ver, mas não despachar.", telefone do motoboy mascarado.

### 3.7 Acessibilidade e testID
Linha lida: "Entrega E-2031, no prazo, faltam 22 minutos, prometido até 16:10, Moda Morato para Centro, Francisco Morato, pronto há 9 minutos". Mudança de nível (no prazo → em risco → atrasada) anuncia **uma vez** em região viva educada; contagens não anunciam. testID: `admin.logistica.late-alert`, `admin.logistica.fila.row-<id>`, `admin.logistica.andamento.row-<id>`, `admin.logistica.row-<id>-deadline`, `admin.logistica.fila.row-<id>-assign`, `admin.logistica.cancel-request-<id>`, `admin.logistica.bulk`, `admin.logistica.bulk-assign`, `admin.logistica.batch-confirm`. Eventos: `delivery_batch_created {n}`, `late_cancel_answered {resposta}` (novo, PO valida).

## 4. Admin: Parâmetros de entrega (WB-258; Sistema › Parâmetros de entrega, só super admin)

- **Coluna principal**, 4 grupos com frase de contexto: **Conta da faixa** (preparo padrão, espera de despacho, fator de rota %, minutos por km, folga) · **Teto e alcance** (teto do fim da faixa, raio máximo) · **Atraso** (tolerância, prazo para responder o cancelamento, compensação: "Entrega grátis no próximo pedido" / "Cupom em reais" + valor / "Nenhuma") · **Operação** (corridas por lote, horário das entregas). Cada campo com sufixo de unidade. Topo da folha: "Valores de partida. Calibre com os dados do piloto. Mudanças valem para pedidos novos em até 60 s; pedidos já feitos mantêm o horário prometido."
- **Motivo da alteração** obrigatório (histórico e auditoria). Validação cruzada ao digitar, com a 1ª falha numa caixa de erro no topo: "O teto menos a folga precisa ser pelo menos preparo + despacho + 5 min." · "A folga pode ser no máximo um quarto do teto (30 min)." 422 do servidor mostra o mesmo texto.
- **Coluna lateral:**
  1. **Alcance** em bloco noite: "9,0 km" (lima, 52 px), "Com preparo padrão de 20 min. Lojas com preparo maior alcançam menos." Raio acima do alcance: "Raio máximo de 10 km: faixas de taxa acima de 9,0 km não serão usadas." (também na tela de Frete por região).
  2. **Prévia de horário**: loja + distância em km → **equação em barras** (preparo noite, despacho `neutral.700`, trajeto `roxo.700`, larguras proporcionais) + **régua** de 0 ao teto + 30 com a faixa em roxo inclinado e o teto em linha vermelha rotulada → caixa "Estimativa 61 min / 46 a 76 min / Entra no alcance. Igual ao checkout para este par." ou "Fora do alcance: o fim da faixa (127 min) passa do teto de 120 min."
  3. **Prazo no piloto** (WB-258 C5): no prazo 92%, dentro do teto 98%, precisão mediana, atrasos por causa (barras), cancelamentos por atraso, compensações e taxa abdicada; e **"Preparo real maior que o informado"** por loja (C6).
- testID: `admin.params.save`, `admin.params.preview`, `admin.params.preview-result`.

## 5. Fora desta rodada (continuam como especificado)

Cadastro guiado do lojista (L3 a L7) e importação de planilha mantêm estrutura de `onda-2`; recebem só a moldura v3 (cabeçalho sem navegação, folha). Decisão de disputa (motivo obrigatório, `onda-5-posvenda.md` M3) está simplificada no protótipo. Áreas do admin sem tela no protótipo (estornos, moderação, denúncias, relatórios, push, categorias, termos, titulares, ajuda) seguem as specs existentes com a moldura v3.

## Z. Pendências

| # | Item | Quem |
|---|---|---|
| 1 | Fórmula do "Marque pronto até" (§2.1) | PO |
| 2 | Trocar Phosphor por Solar no `apps/web` (custo, crédito na web) | tech-lead |
| 3 | Endpoint de prévia de horário para o lojista (mesma conta do checkout) | backend-dev |
| 4 | Evento `late_cancel_answered` | PO |
