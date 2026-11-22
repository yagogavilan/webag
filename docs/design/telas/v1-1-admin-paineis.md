# Tela: Admin, painéis de gráficos e construtor   (WB-356 a WB-359)

> Autor: product-designer. Data: 2026-11-22. Releases: painéis prontos R2 (WB-357); construtor e exportação R3 (backlog §10). Protótipo: `#/a/paineis?p=visao|lojas|cupons|log|quin` e `#/a/construtor`. Troque o perfil: Operação e Suporte **perdem** os gráficos financeiros (e Suporte também os operacionais). Mude Cidade para "Cajamar" e Modo para "Só retirada" para ver **baixa amostra**.
> Reaproveita: KPI, tabela e gráfico do `design-system.md` §3.1; moldura de `onda-7-paineis-v3.md`.
> **Skill `dataviz`: não existe neste ambiente** (conferido em `.claude/skills/`). Apliquei as regras do `design-system` (gráfico: neutro + roxo, rótulo direto, resumo em texto, tabela alternativa, sem 3D) e as regras abaixo (§1). Se a skill for criada, revisar esta tela contra ela.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Painéis prontos primeiro, construtor depois** (como o PRD manda): Visão geral, Lojas, Cupons e Logística (o PRD também lista "Vendas"; o pedido do fundador cita logística: tratei Logística = "Entrega" do PRD e deixei Vendas para a próxima rodada). Painel pronto **não edita, só duplica** ("Duplicar para editar") | RICE baixo (PRD): poucos usuários. O fundador tem resposta no 1º dia sem montar nada |
| 2 | **Todo gráfico tem 3 formas de ler**: o gráfico, **uma frase-resumo** (para leitor de tela e para quem não decifra o gráfico) e **"Ver como tabela"** no próprio widget | Requisito de acessibilidade do PRD; uma tabela é o "gráfico" mais honesto |
| 3 | O construtor **só oferece o que é compatível**: dimensão incompatível aparece **desabilitada com a razão** ("Indisponível para 'Novos clientes': Loja, Categoria…"); tipo incompatível idem ("Rosca é só para partes de um todo (somas), sem tempo.") | WB-356 C2; esconder gera "cadê?" |
| 4 | **Prévia ao vivo** do gráfico enquanto escolhe (sem botão "gerar") | O fundador aprende o catálogo mexendo |
| 5 | **Baixa amostra nunca mostra variação nem comparação enganosa**: abaixo de 20 pedidos, tarja "Poucos dados: 10 pedidos. Compare com cuidado." e some o "+12%"; mediana e p90 abaixo de 5 pedidos: "Sem dados suficientes. Precisamos de pelo menos 5 pedidos." `[limiares: HIPÓTESE do designer; PO decide]` | Percentual sobre 3 pedidos engana |
| 6 | "Compartilhar" **não existe como link** (PRD: nunca). Proponho **"Enviar cópia"** a outro admin: ele recebe uma cópia dele, sem acesso ao seu painel; gráficos financeiros só vêm se o perfil dele puder | O fundador pediu "compartilhar"; o PRD proíbe link externo e diz que painéis são privados. Pergunta 1 ao PO. Está no protótipo marcado como proposta |
| 7 | Rosca só como **parte do todo, até 6 fatias** (5 + "Outros"), com **legenda de valores** ao lado; para quem quer comparar, a barra é o padrão | Rosca é difícil de comparar; é a única opção em que cor carrega demais |

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
| 1 | Abas de painéis | Visão geral · Lojas · Cupons · Logística · **Quinzena** (selo "Meu") |
| 2 | Faixa de propriedade | Pronto: selo "Painel pronto: não edita, só duplica" + botão "Duplicar para editar". Meu: selo "Só você vê este painel" + "Novo gráfico", "Duplicar", "Enviar cópia" |
| 3 | **Filtros globais** (cartão suave) | Período (Hoje, 7, 28, 30, 90, 400 dias, "Personalizado"), Cidade, Modo; "Mais filtros": Loja, Categoria, Campanha (WB-357 C2: todos os gráficos respeitam). Na URL |
| 4 | Aviso de permissão | "Alguns gráficos financeiros ou operacionais não aparecem para o seu perfil." |
| 5 | Grade de gráficos | KPI (número grande + variação), linha, barra, rosca, tabela |
| 6 | Rodapé | "Fuso: São Paulo. Semana começa na segunda. Os números seguem a definição única de cada métrica." |

**Painéis prontos do protótipo:** *Visão geral* (GMV, pedidos pagos, ticket médio, novos clientes, cancelamentos, entregues na faixa, GMV por dia com comparação, GMV por categoria) · *Lojas* (GMV por loja com top 10 + Outros, GMV por cidade em rosca, tempo de aceite por loja, cancelamentos por loja em tabela) · *Cupons* (usos, desconto total, custo por cliente novo [financeira], usos por campanha em rosca, desconto Webag por dia [financeira]) · *Logística* (mediana pagamento-entrega, entregues na faixa, custo por entrega [financeira], tempo por faixa de distância, entregues na faixa por dia).

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
| Sem permissão | O gráfico **não é renderizado** (não vaza que existe); o aviso do topo explica |
| Período > 400 dias | Painel inteiro: "Período máximo de 400 dias. Escolha um período menor." |

## 3. Construtor ("Novo gráfico")

Página (celular: 1 coluna com a prévia **antes** do botão salvar; desktop >= 1100: formulário à esquerda, prévia à direita).

| Passo | Controle | Regras |
|---|---|---|
| 1. Métrica | Seletor nativo agrupado (Gerais, Operacionais, Financeiras: só as que o perfil vê) | Abaixo: **a definição em 1 frase** ("Valor total dos pedidos pagos, com entrega.") (WB-356 C1). Texto de exemplo; vem do RN-15 |
| 2. Dimensão | Chips: Tempo, Cidade, Loja, Categoria, Modo, Meio de pagamento, Campanha, Faixa de distância | Incompatível: `aria-disabled` + razão escrita abaixo; toque mostra toast com a razão |
| 3. Tipo | Número · Linha · Barra · Barra empilhada · Rosca · Tabela | Linha exige Tempo; Rosca exige soma e sem tempo; Barra empilhada precisa de 2 dimensões (**não demonstrada no protótipo**) |
| 4. Período e filtros | Período (7, 28, 90, 400, "500 dias (teste do limite)"), Modo, Cidade; caixa "Comparar com o período anterior" | > 400 dias: "Período máximo de 400 dias." |
| Prévia | Mesmo componente do painel, ao vivo | Estados do §2.2 valem |
| Salvar | Nome (padrão: "GMV por categoria") + "Salvar em" (seus painéis, "Quinzena (6 de 12)") + "Salvar no painel" | 13º gráfico: "Limite de 12 gráficos por painel." (C2). Máximo 20 painéis por usuário |

Limites exibidos como texto, nunca como erro tardio: 5 filtros por widget, 2 dimensões e 10 categorias + "Outros" (C4: com 25 lojas mostra as 10 maiores e "Outros"), rosca com 8 categorias agrupa em 6 (C5).

**Painel:** "Duplicar" cria cópia e abre nela (C6: o original fica intacto); excluir pede confirmação "Remover este gráfico? Ele sai só do seu painel." / "Excluir o painel Quinzena? Os painéis prontos não são afetados." (C8). Outro admin não vê os seus (C7).

## 4. Exportar (WB-359 C1)

"Exportar CSV" no menu do widget (Super admin e Financeiro; Operação só operacional; Suporte não vê). Toast "CSV baixado. Fica registrado." Valores em reais, UTF-8, células com `=`, `+`, `-`, `@` escapadas. Erro: "Não conseguimos gerar o arquivo. Tente de novo."

## 5. Acessibilidade

Cada gráfico é `article` com nome; frase-resumo em `p.sr`; **toda leitura do gráfico existe também como tabela** (botão no widget, e o leitor de tela lê a frase). Barras são HTML (lista de pares nome e valor), rosca tem legenda com valores, linha tem máximo e extremos escritos. Teclado: filtros, menu e "Ver como tabela" alcançáveis em ordem. Contraste do §1. Variação com palavra e seta. Foco volta ao gatilho depois de fechar o menu. Texto >= 16 px no celular. Zoom 200%: grade em 1 coluna, sem rolagem horizontal fora de tabela. Gráfico não depende de passar o mouse (sem tooltip como única fonte).

## 6. Eventos

PRD: `dashboard_created`, `dashboard_duplicated`, `widget_saved` (metric, dimension, chart_type), `widget_exported`, `widget_query_slow`. Proponho: `widget_low_sample_shown`, `builder_incompatible_tried` (metric, dimension: mostra se o catálogo confunde), `panel_sent_copy` (se aprovado).

## 7. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-356 C1 a C5 | §3 (definição, só compatíveis, perfil, 422/403 refletidos) |
| WB-357 C1 a C5 | §2 (prontos, filtro de cidade, "Sem dados no período", duplicar, "Atualizado às") |
| WB-358 C1 a C8 | §3 (limites, 12 gráficos, 400 dias, top 10, rosca 6, duplicar, privado, excluir) |
| WB-359 C1 a C5 | §4 e §2.2 (CSV, 429, > 5 s, "em cache"); C5 é teste de carga |

## 8. Revisão heurística

**Nota 3 de 5.** PA-1 (sev. 3, H8): o construtor tem 4 passos + salvar para um recurso de RICE baixo; risco de ninguém usar. Mitigação: prontos primeiro; **medir "painéis salvos por semana"** (meta do PRD: >= 5 após 4 semanas) e só então investir em refinamento. PA-2 (sev. 3, H2): "dimensão" e "métrica" são jargão para o fundador de CS; usar "Medir" e "Separar por" `[testar 2 rótulos com o fundador]`. PA-3 (sev. 2, H5): rosca bloqueada para ticket médio frustra; a razão está escrita. PA-4 (sev. 3, H1): filtro de cidade zera tudo sem aviso do porquê; a tarja de baixa amostra cobre. PA-5 (sev. 2, H7): falta "salvar filtros do painel". Bom: frase-resumo, tabela alternativa, limites escritos, estados completos. **Teste:** o fundador responde "GMV por categoria nas últimas 4 semanas, só entrega" sem ajuda (tempo).

## 9. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. "Compartilhar": o pedido do fundador conflita com "painéis são privados"; aceita "Enviar cópia a outro admin"? 2. Limiares de baixa amostra (20 pedidos; 5 para mediana e p90) 3. Painel "Vendas" entra junto com os 4? 4. Texto de definição de cada métrica (RN-15) 5. Métricas com dimensão limitada ("recompra só mensal e agregada"): confirmar a matriz métrica x dimensão |
| tech-lead / mobile-dev | 6. Biblioteca de gráficos: sem texto em SVG e com tabela alternativa (ou SVG próprio como no protótipo: ~150 linhas) 7. Tokens `color.chart.*` |
| backend-dev | 8. O servidor devolve `n` (amostra) por consulta para a tarja de baixa amostra? E `atualizado_em` e `em_cache`? |
| Security | 9. Em "Enviar cópia", o painel carrega só definição (nunca dados)? |
