# Tela: Admin, painéis de gráficos e construtor   (WB-356 a WB-359)

> Autor: product-designer. Data: 2026-11-22 (revisada no mesmo dia, DEC-137). Releases: painéis prontos R2 (WB-357); construtor R3 (backlog §10); exportação de widget cortada (DEC-104, §4). Protótipo: `#/a/paineis?p=visao|vendas|lojas|entrega|cupons|quin` e `#/a/construtor`. Troque o perfil: Operação perde os gráficos de classe Financeira e Suporte perde também os de classe Operacional; o gráfico bloqueado aparece como "Sem permissão", sem valor. Mude Cidade para "Cajamar" e Modo para "Só retirada" para ver **baixa amostra**.
> **Revisão DEC-137:** painel "Vendas" incluído, "Logística" renomeado para **"Entrega"**, conteúdo dos 5 painéis prontos conforme WB-357 C7 (`prd/v1-1-admin-e-paineis.md`, "Conteúdo dos 5 painéis prontos"), classes de sensibilidade (Geral, Operacional, Financeira) e widget bloqueado como "Sem permissão" (WB-357 C8). O PRD prevalece sobre esta spec.

Objetivo do usuário nesta tela (admin): responder "como estamos?" no primeiro dia com painéis prontos, e depois montar o próprio gráfico, vendo só o que o seu perfil pode ver.
> Reaproveita: KPI, tabela e gráfico do `design-system.md` §3.1; moldura de `onda-7-paineis-v3.md`.
> **Skill `dataviz`: não existe neste ambiente** (conferido em `.claude/skills/`). Apliquei as regras do `design-system` (gráfico: neutro + roxo, rótulo direto, resumo em texto, tabela alternativa, sem 3D) e as regras abaixo (§1). Se a skill for criada, revisar esta tela contra ela.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Painéis prontos primeiro, construtor depois** (como o PRD manda): **Visão geral, Vendas, Lojas, Entrega e Cupons** (Acessos só quando existir a WB-362; resposta D do PO). "Logística" do rascunho anterior era o painel "Entrega" do PRD e voltou a esse nome (o item "Logística" do menu do admin, que leva ao Despacho, é outra coisa e não muda). Painel pronto **não edita, só duplica** ("Duplicar para editar") | RICE baixo (PRD): poucos usuários. O fundador tem resposta no 1º dia sem montar nada |
| 2 | **Todo gráfico tem 3 formas de ler**: o gráfico, **uma frase-resumo** (para leitor de tela e para quem não decifra o gráfico) e **"Ver como tabela"** no próprio widget | Requisito de acessibilidade do PRD; uma tabela é o "gráfico" mais honesto |
| 3 | O construtor **só oferece o que é compatível**: dimensão incompatível aparece **desabilitada com a razão** ("Indisponível para 'Novos clientes': Loja, Categoria…"); tipo incompatível idem ("Rosca é só para partes de um todo (somas), sem tempo.") | WB-356 C2; esconder gera "cadê?" |
| 4 | **Prévia ao vivo** do gráfico enquanto escolhe (sem botão "gerar") | O fundador aprende o catálogo mexendo |
| 5 | **Baixa amostra nunca mostra variação nem comparação enganosa**: abaixo de 20 pedidos, tarja "Poucos dados: 10 pedidos. Compare com cuidado." e some o "+12%"; mediana e p90 abaixo de 5 pedidos: "Sem dados suficientes. Precisamos de pelo menos 5 pedidos." `[limiares: HIPÓTESE do designer; PO decide]` | Percentual sobre 3 pedidos engana |
| 6 | "Compartilhar" **não existe como link** (PRD: nunca). Proponho **"Enviar cópia"** a outro admin: ele recebe uma cópia dele, sem acesso ao seu painel; gráficos financeiros só vêm se o perfil dele puder | O fundador pediu "compartilhar"; o PRD proíbe link externo e diz que painéis são privados. Pergunta 1 ao PO. Está no protótipo marcado como proposta |
| 7 | Rosca só como **parte do todo, até 6 fatias** (5 + "Outros"), com **legenda de valores** ao lado; para quem quer comparar, a barra é o padrão (nos painéis prontos usei barra, inclusive para "modo" e "meio de pagamento", que têm 2 itens) | Rosca é difícil de comparar; é a única opção em que cor carrega demais |
| 8 | **Cada métrica tem uma classe de sensibilidade: Geral, Operacional ou Financeira** (PRD admin, `[HIPÓTESE]` até o piloto). A classe decide quem vê: Geral, todos os perfis; Operacional, Super admin, Operação e Financeiro; Financeira, Super admin e Financeiro. A classe aparece como etiqueta de texto no construtor e na linha "Quem vê" da definição da métrica | Fecha a permissão por métrica e deixa o fundador ajustar depois de usar; a decisão é de servidor (WB-356 C3, C8), a tela só reflete |
| 9 | **Gráfico sem permissão aparece bloqueado, com "Sem permissão" e sem valor, e não é consultado** (WB-357 C8; substitui o "não renderiza" da versão anterior). O título do gráfico aparece; nenhum número, `n` ou tendência | O PRD escolheu bloquear à vista; evita o "cadê o gráfico?" do suporte e mantém o painel igual para todos. Custo aceito: revela que existe uma métrica financeira (título), não o dado |

## 1. Regras de visualização (substituem a skill ausente)

| Tema | Regra |
|---|---|
| Cor | Séries: `chart.1` roxo ação `#A21FBE` (6,0:1 no branco), `chart.2` noite `#1C1721`, `chart.3` azul `#28569E` (7,2:1), `chart.4` verde `#1B6E3C` (6,3:1), `chart.5` laranja queimado `#B45F06` (4,6:1), `chart.6` cinza `#5F566A` (usado para "Outros" e "período anterior"). **Todas >= 3:1 sobre branco.** Lima e roxo-marca `#C02EF0` não entram em gráfico sobre branco |
| Sem degradê, sem sombra, sem 3D | Vale o kit v3. Fundo do gráfico branco |
| Cor nunca é a única pista | Rótulo direto no valor (barra: nome e valor escritos; rosca: legenda com nome, valor e %); linha tracejada para "período anterior" (forma, não só cor); variação em texto + seta ("Subiu 8,2% sobre o período anterior") |
| Máximo de séries | 1 métrica por gráfico; linha com 1 série + comparação tracejada; rosca até 6 fatias; barra até 10 + "Outros" (PRD: 10 e "Outros") |
| Eixo | Barra e área sempre a partir do zero. Linha: de 0 ao máximo + 10%. Sem eixo duplo |
| Bom/ruim | Variação colorida pela **polaridade da métrica** (cancelamento subindo é ruim), sempre com palavra "Subiu/Caiu" |
| Texto | Rótulos e valores >= 16 px no celular (SVG sem texto embutido: rótulos em HTML, para não encolher com a largura) |
| Números | pt-BR: "R$ 12,5 mil" nos KPI e eixos; valor exato (R$ 12.480) em tabela e legenda |
| Densidade | Celular: 1 coluna; >= 900 px: auto-fit em colunas de >= 300 px; widget largo (linha principal) ocupa a linha inteira |
| Movimento | Nenhum além de entrada suave de 150 ms; sem animação de gráfico em loop; reduzido: sem nada |

Tokens novos (proposta ao mobile-dev/tech-lead, não alterei `tokens.json`): `color.chart.1` a `color.chart.6`, `color.chart.grid` `#E8E3EB`.

## 2. Tela "Painéis"

| # | Componente | Conteúdo |
|---|---|---|
| 1 | Abas de painéis | Visão geral · **Vendas** · Lojas · **Entrega** · Cupons · **Quinzena** (selo "Meu"). Celular: abas roláveis com a ativa visível; `aria-current` |
| 2 | Faixa de propriedade | Pronto: selo "Painel pronto: não edita, só duplica" + botão "Duplicar para editar". Meu: selo "Só você vê este painel" + "Novo gráfico", "Duplicar", "Enviar cópia" |
| 3 | **Filtros globais** (cartão suave) | Período (Hoje, 7, 28, 30, 90, 400 dias, "Personalizado"), Cidade, Modo; "Mais filtros": Loja, Categoria, Campanha (WB-357 C2: todos os gráficos respeitam). Na URL |
| 4 | Aviso de permissão (só quando há gráfico bloqueado) | "Alguns gráficos deste painel não estão disponíveis para o seu perfil. Eles aparecem como 'Sem permissão'." |
| 5 | Grade de gráficos | KPI (número grande + variação), linha, barra, rosca, tabela |
| 6 | Rodapé | "Fuso: São Paulo. Semana começa na segunda. Os números seguem a definição única de cada métrica." |

### 2.0 Os 5 painéis prontos (WB-357 C6 e C7)

Conteúdo **igual ao PRD** (`prd/v1-1-admin-e-paineis.md`, "Conteúdo dos 5 painéis prontos"); o designer só ordenou. Classe: **G** Geral, **O** Operacional, **F** Financeira (PRD, "Sensibilidade por métrica"). Todo widget usa só combinação métrica x dimensão da matriz do PRD. Um widget mostra **uma** métrica (WB-358 limites): onde o PRD junta duas métricas ("e"), são dois widgets lado a lado (pergunta 6 ao PO).

| Painel | Ordem e widget | Métrica por dimensão | Tipo | Classe |
|---|---|---|---|---|
| **Visão geral** | 1 a 6 | GMV · Pedidos pagos · Ticket médio · Novos clientes · Cancelamentos (taxa) · Entregues na faixa (cada um com variação sobre o período anterior) | KPI | O · G · O · O · G · G |
| | 7 (linha larga) | GMV por dia (tempo) | Linha com período anterior tracejado | O |
| **Vendas** | 1 (linha larga) | GMV por semana | Linha com comparação | O |
| | 2 | GMV por categoria | Barra, 10 + "Outros" | O |
| | 3 | GMV por modo (entrega e retirada) | Barra, valor e % escritos | O |
| | 4 | GMV por meio de pagamento | Barra, valor e % escritos | O |
| | 5 | Ticket médio por semana | Linha | O |
| | 6 | Receita Webag por semana | Linha | **F** |
| | 7 | Take rate por semana | Linha | **F** |
| **Lojas** | 1 (largo) | Tabela por loja, ordenável: GMV (O), pedidos entregues (G), cancelamentos taxa (G), tempo de aceite mediana e p90 (G), novos clientes (O); **mostra o `n` da linha** | Tabela | mista |
| | 2 | Lojas ativas por cidade | Barra | G |
| **Entrega** | 1 | Entregues na faixa por semana | Linha | G |
| | 2 | Entregues na faixa por faixa de distância | Barra | G |
| | 3 | Tempo do pagamento à entrega (mediana e p90) por faixa de distância | Tabela de 2 colunas | G |
| | 4 | Cancelamentos por faixa de distância | Barra | G |
| | 5 | Custo de logística por entrega por faixa de distância | Barra | **F** |
| **Cupons** | 1 | Usos de cupom por campanha | Barra | O |
| | 2 | Desconto total por campanha | Barra | O |
| | 3 | Novos clientes por campanha | Barra | O |
| | 4 | Desconto Webag por campanha | Barra | **F** |
| | 5 | Custo por cliente novo por campanha | Barra | **F** |

**O que cada perfil vê (resultado de C8):**

| Perfil | Visão geral | Vendas | Lojas | Entrega | Cupons |
|---|---|---|---|---|---|
| Super admin, Financeiro | tudo | tudo | tudo | tudo | tudo |
| Operação | tudo | 5 de 7 (bloqueia receita e take rate) | tudo | 4 de 5 (bloqueia custo) | 3 de 5 (bloqueia desconto Webag e custo por cliente novo) |
| Suporte | 3 KPIs (pedidos pagos, cancelamentos, entregues na faixa); os outros 4 bloqueados | tudo bloqueado | colunas Geral (entregues, cancelamentos, aceite) e "Lojas ativas por cidade"; colunas GMV e Novos clientes **omitidas** com a nota "2 colunas não aparecem para o seu perfil" | 4 de 5 | tudo bloqueado |

Tabela por loja com colunas de classes mistas: a coluna sem permissão **não é consultada nem exibida** e a nota abaixo da tabela diz quantas faltam. Widget inteiro sem permissão mostra o cartão bloqueado (§2.2). No protótipo, **Lojas ainda mostra a versão anterior** (4 widgets de uma métrica); a tabela multimétrica é só spec, e as demais abas seguem a tabela acima.

### 2.1 Widget (anatomia)

Título (Bricolage 18) + menu "Mais ações" (Editar, Duplicar neste painel, Exportar CSV [só quem pode; fica registrado], Remover) só em painel próprio · subtítulo "28 dias · Francisco Morato · Só entrega · compara com o período anterior" · corpo · rodapé **"Atualizado às 14:00 · em cache"** (WB-359 C4) + "Ver como tabela". Frase-resumo em texto para leitor de tela ("GMV por categoria: Camisetas lidera com R$ 12.480 (31%).").

### 2.2 Estados do widget (cada um tem texto próprio)

| Estado | Texto e comportamento |
|---|---|
| Carregando | Skeleton na altura real do gráfico; `aria-label` "Carregando…"; widgets carregam independentes (um lento não trava o painel) |
| Vazio | "Sem dados no período" + "Mude o período ou tire um filtro." (**nunca** zero enganoso; WB-357 C3) |
| Baixa amostra | Tarja âmbar "Poucos dados: 10 pedidos. Compare com cuidado."; **sem variação %** |
| Amostra insuficiente (mediana/p90) | "Sem dados suficientes. Precisamos de pelo menos 5 pedidos. Este filtro tem 3." |
| Erro | "Não conseguimos carregar este gráfico. Seus filtros foram mantidos." [Tentar de novo] |
| Consulta pesada (> 5 s, WB-359 C3) | "Muito pesado: reduza o período ou o filtro." [Reduzir para 28 dias] |
| Limite de consultas (429, C2) | "Muitas consultas. Aguarde 1 minuto e tente de novo." |
| Dado defasado | "Atualizado às 11:00. Os dados estão com 3 h de atraso." (âmbar; ícone relógio) |
| Em cache | "Atualizado às 14:00 · em cache" |
| Sem rede | "Sem conexão. Mostrando o que já carregou." |
| Sem permissão (WB-357 C8) | Cartão bloqueado: título do gráfico, ícone de cadeado e **"Sem permissão"** + "O seu perfil não vê esta métrica." Sem valor, sem `n`, sem variação, sem "Ver como tabela". **Não é consultado** (zero chamadas ao banco); o aviso do topo explica. Leitor de tela: "Gráfico GMV por dia, sem permissão" |
| Baixa amostra em tabela por loja (WB-357 C9) | Cada linha mostra o `n` (pedidos); abaixo de 20 pedidos a taxa vira "Poucos dados" e abaixo de 5 a mediana e o p90 viram "Sem dados suficientes", em texto na célula; nunca percentual nem zero |
| Variação com menos de 20 pedidos (C9) | Some o "Subiu/Caiu X%" e as taxas; a tarja "Poucos dados: 10 pedidos. Compare com cuidado." fica |
| Período > 400 dias | Painel inteiro: "Período máximo de 400 dias. Escolha um período menor." |

## 3. Construtor ("Novo gráfico")

Página (celular: 1 coluna com a prévia **antes** do botão salvar; desktop >= 1100: formulário à esquerda, prévia à direita).

| Passo | Controle | Regras |
|---|---|---|
| 1. Métrica | Seletor nativo agrupado por classe (**Geral, Operacional, Financeira**: só as que o perfil vê, WB-356 C3) | Abaixo: **a definição em 1 frase** ("Valor total dos pedidos pagos, com entrega.") (WB-356 C1) e "Quem vê: Super admin, Operação e Financeiro" (classe). Texto de exemplo; vem do RN-15 |
| 2. Dimensão | Chips: Tempo, Cidade, Loja, Categoria, Modo, Meio de pagamento, Campanha, Faixa de distância | Incompatível: `aria-disabled` + razão escrita abaixo; toque mostra toast com a razão |
| 3. Tipo | Número · Linha · Barra · Barra empilhada · Rosca · Tabela | Linha exige Tempo; Rosca exige soma e sem tempo; Barra empilhada precisa de 2 dimensões (**não demonstrada no protótipo**) |
| 4. Período e filtros | Período (7, 28, 90, 400, "500 dias (teste do limite)"), Modo, Cidade; caixa "Comparar com o período anterior" | > 400 dias: "Período máximo de 400 dias." |
| Prévia | Mesmo componente do painel, ao vivo | Estados do §2.2 valem |
| Salvar | Nome (padrão: "GMV por categoria") + "Salvar em" (seus painéis, "Quinzena (6 de 12)") + "Salvar no painel" | 13º gráfico: "Limite de 12 gráficos por painel." (C2). Máximo 20 painéis por usuário |

Limites exibidos como texto, nunca como erro tardio: 5 filtros por widget, 2 dimensões e 10 categorias + "Outros" (C4: com 25 lojas mostra as 10 maiores e "Outros"), rosca com 8 categorias agrupa em 6 (C5).

**Painel:** "Duplicar" cria cópia e abre nela (C6: o original fica intacto); excluir pede confirmação "Remover este gráfico? Ele sai só do seu painel." / "Excluir o painel Quinzena? Os painéis prontos não são afetados." (C8). Outro admin não vê os seus (C7).

## 4. Exportar (WB-359 C1)

**Cortada na DEC-104 (WB-359): o menu do widget não mostra "Exportar CSV" até o gatilho voltar** (o fundador pedir para levar um número ao contador). Fica registrado o desenho para quando voltar: "Exportar CSV" no menu do widget (Super admin e Financeiro; Operação só classe Operacional ou Geral; Suporte não vê); toast "CSV baixado. Fica registrado."; valores em reais, UTF-8, células com `=`, `+`, `-`, `@` escapadas; erro "Não conseguimos gerar o arquivo. Tente de novo." O export do histórico por loja segue na WB-354 C3. A **proteção das consultas** (429, 5 s, cache) não foi cortada e vale já nos painéis prontos (§2.2).

## 5. Acessibilidade

Cartão bloqueado: ícone de cadeado **e** texto "Sem permissão" (nunca só cinza), contraste >= 4,5:1, mesmo `article` com nome e sem controles. Cada gráfico é `article` com nome; frase-resumo em `p.sr`; **toda leitura do gráfico existe também como tabela** (botão no widget, e o leitor de tela lê a frase). Barras são HTML (lista de pares nome e valor), rosca tem legenda com valores, linha tem máximo e extremos escritos. Teclado: filtros, menu e "Ver como tabela" alcançáveis em ordem. Contraste do §1. Variação com palavra e seta. Foco volta ao gatilho depois de fechar o menu. Texto >= 16 px no celular. Zoom 200%: grade em 1 coluna, sem rolagem horizontal fora de tabela. Gráfico não depende de passar o mouse (sem tooltip como única fonte).

## 6. Eventos

PRD: `dashboard_created`, `dashboard_duplicated`, `widget_saved` (metric, dimension, chart_type), `widget_exported` (só se o export voltar), `widget_query_slow`. Proponho: `widget_low_sample_shown`, `builder_incompatible_tried` (metric, dimension: mostra se o catálogo confunde), `panel_sent_copy` (se aprovado).

## 7. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-356 C1 a C5 | §3 (definição, só compatíveis, perfil, 422/403 refletidos) |
| WB-357 C1 a C5 | §2 (prontos, filtro de cidade, "Sem dados no período", duplicar, "Atualizado às") |
| WB-357 C6, C7 | §2.0 (5 painéis; conteúdo conforme o PRD) |
| WB-357 C8 | §0.9, §2.0 (o que cada perfil vê) e §2.2 (Sem permissão) |
| WB-357 C9 | §2.2 (baixa amostra; `n` por linha na tabela por loja) |
| WB-358 C1 a C8 | §3 (limites, 12 gráficos, 400 dias, top 10, rosca 6, duplicar, privado, excluir) |
| WB-359 C1 a C5 | §4 e §2.2 (CSV, 429, > 5 s, "em cache"); C5 é teste de carga |

## 8. Revisão heurística

**Nota 3 de 5.** PA-1 (sev. 3, H8): o construtor tem 4 passos + salvar para um recurso de RICE baixo; risco de ninguém usar. Mitigação: prontos primeiro; **medir "painéis salvos por semana"** (meta do PRD: >= 5 após 4 semanas) e só então investir em refinamento. PA-2 (sev. 3, H2): "dimensão" e "métrica" são jargão para o fundador de CS; usar "Medir" e "Separar por" `[testar 2 rótulos com o fundador]`. PA-3 (sev. 2, H5): rosca bloqueada para ticket médio frustra; a razão está escrita. PA-4 (sev. 3, H1): filtro de cidade zera tudo sem aviso do porquê; a tarja de baixa amostra cobre. PA-5 (sev. 2, H7): falta "salvar filtros do painel". Bom: frase-resumo, tabela alternativa, limites escritos, estados completos. **Teste:** o fundador responde "GMV por categoria nas últimas 4 semanas, só entrega" sem ajuda (tempo).

## 9. Perguntas

| Para | Pergunta |
|---|---|
| PO | ~~1 a 5~~ **Respondidas** (`v1-1-respostas-ao-time.md` §D e §G): "Enviar cópia" só com a definição; limiares 20 e 5; Vendas entra (5 painéis); definições e matriz no PRD admin. **Novas:** 6. Onde o PRD junta métricas com "e" (usos de cupom e desconto total; receita Webag e take rate; mediana e p90), contei como widgets separados, exceto mediana e p90 (1 tabela de 2 colunas): o teste de snapshot da WB-357 C7 conta assim? 7. A tabela por loja do painel Lojas mistura classes (GMV é Operacional, aceite é Geral): coluna sem permissão **omitida** com nota, e não "Sem permissão" em cada célula; confirma? 8. Painel "Vendas" para o Suporte abre com todos os gráficos bloqueados: aceita ou prefere esconder a aba para esse perfil? |
| tech-lead / mobile-dev | 6. Biblioteca de gráficos: sem texto em SVG e com tabela alternativa (ou SVG próprio como no protótipo: ~150 linhas) 7. Tokens `color.chart.*` |
| backend-dev | 8. O servidor devolve `n` (amostra) por consulta para a tarja de baixa amostra? E `atualizado_em` e `em_cache`? |
| Security | 9. Em "Enviar cópia", o painel carrega só definição (nunca dados)? |
