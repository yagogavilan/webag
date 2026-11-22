# Tela: Admin, campanhas e cupons (e adesão do lojista)   (WB-340 a WB-346, WB-349)

> Autor: product-designer. Data: 2026-11-22. Release R2. Protótipo: `#/a/cupons`, `#/a/cupom-novo`, `#/a/cupom-rel`; lojista: `#/l/convites` (Mais > Campanhas e cupons). Troque o perfil na barra do protótipo: **só Super admin e Financeiro veem "Ativar campanha"**.
> Reaproveita: lista de cartões e relatório do painel v3; `docs/telas/16-app-cupons.png` (cliente). WB-347 (cliente) está em `v1-1-cupom-cliente.md`.
> **Revisada em 2026-11-22 (DEC-137):** pior caso do percentual (WB-340 C12), os 3 parâmetros de liberação desligados por padrão, orçamento mensal global em R$ 0 (WB-340 C10 e C11), "Duplicar" sem orçamento, convite com 7 dias. Onde o PRD (`prd/v1-1-cupons.md`) e esta spec divergem, vale o PRD. **Nenhum campo ou controle desta tela altera preço, entrega ou taxa**: a campanha só escolhe quem paga o desconto (RN-C1, DEC-088).

Objetivo do usuário nesta tela (admin): criar uma campanha sabendo quanto ela custa por pedido, no pior caso e no total, e ativá-la sem estourar o orçamento; o lojista decide, sozinho, se paga uma parte.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Formulário em 5 seções numeradas numa página só** + coluna lateral fixa "Quanto isso custa por pedido" (desktop) ou bloco logo abaixo (celular). Sem assistente em passos | Meta do PRD: criar e ativar em <= 3 min. O fundador precisa **ver o custo enquanto digita**; um assistente esconde o resultado no fim |
| 2 | A simulação é uma **tabela por faixa de entrega** (retirada, até 2 km, 2 a 4, 4 a 6) com 3 colunas: pedido mínimo necessário (só Autofinanciado), quanto a Webag paga, **quanto sobra no pedido** (verde) ou **"Prejuízo de R$ X"** (vermelho claro, com texto) | Responde "quanto isso custa por pedido". É o centro da tela |
| 3 | "Quem paga" são **4 cartões de rádio com a consequência escrita** em linguagem de loja ("Sai da margem do próprio pedido, até 50%. O cupom vale inteiro ou não se aplica."), não um seletor. O 50% é o `autofin_teto_pct`, **global**: só o Super admin muda, em Configurações, e não existe campo por campanha | Escolha irreversível em dinheiro merece texto. Sem jargão (margem de contribuição, ledger). Teto por campanha esconderia vazamento de margem (resposta D do PO) |
| 4 | Combinação proibida ou não liberada **não é escondida, é explicada**: frete grátis + "Loja paga/Dividido" → opções desabilitadas com "O frete é da Webag." (C3); parâmetro desligado → opção desabilitada com a razão (decisão 10) | WB-340 C3; esconder gera "cadê a opção?" |
| 5 | **"Ativar campanha" fica focável, não executa e lista o que falta** (`aria-disabled`: "Falta o orçamento total e o diário"; "Pedido mínimo abaixo de R$ 133,34 na faixa mais cara") numa caixa "Para ativar" | Mesmo padrão do Publicar (RN-17): botão morto sem motivo não existe. É a forma de tela do "Ativar fica indisponível com o que falta" do PRD (C4, C10) |
| 6 | Operação só vê **"Salvar rascunho"** e o texto "Quem ativa: Super admin ou Financeiro." | WB-340 C6; ação ausente, não cinza |
| 7 | Ativar campanha com custo da Webag pede **2º fator recente** em diálogo ("Confirme que é você") | Requisito não funcional do PRD |
| 8 | **Lista de campanhas mostra barra de orçamento (total e do dia) e alertas no topo**, não só status | O fundador precisa ver o teto chegando; WB-342 C4 e WB-349 C3, C4 |
| 9 | "Compartilhar" não é recurso desta tela: o texto do cliente "Faltam R$ X" vem do servidor e não da campanha | Fora do PRD |
| 10 | **Três parâmetros de liberação, separados e desligados por padrão** (DEC-137), em Configurações > Campanhas, só Super admin (§1.1): **Frete grátis** (`campanha_frete_gratis`, parecer J22 e J23), **Parte da loja** (`campanha_parte_da_loja`, parecer J27: libera "Loja paga" e "Dividido") e **Selo "de/por"** (`selo_de_por`, parecer J23). Cada um mostra o parecer de que depende e liga sozinho, sem esperar os outros | Cada parecer jurídico liga só a sua função; o resto não espera o advogado. Sem eles, só "Webag paga" e "Autofinanciado", em valor ou percentual |
| 11 | **Percentual com custo Webag mostra o pior caso**, não só o pedido de referência (§2, C12) | O custo do percentual varia com o ticket: o fundador lê "R$ 8" e a conta vira R$ 15 em pedido grande (CU-2) |
| 12 | **Barra "gasto do mês x orçamento mensal" no topo da lista** e bloqueio explicado enquanto o orçamento mensal da Webag for R$ 0 (F2) | O fundador vê o teto global antes de criar; evita o rascunho que nunca ativa sem o porquê (WB-340 C10, C11) |

## 1. Lista de campanhas

**Topo (antes das abas): orçamento mensal de cupons da Webag.** Barra "Gasto do mês R$ 312,00 de R$ 1.000,00" + texto (nunca só a barra) e "Reservado em campanhas ativas: R$ 800,00". Com o orçamento em R$ 0 (padrão, F2): nota âmbar "Orçamento mensal de cupons da Webag é R$ 0. Defina em Configurações" + link "Abrir Configurações" (só Super admin vê o link; os outros perfis veem o texto). A barra do dia e a do mês atualizam a cada 60 s com a tela aberta `[HIPÓTESE]`; a trava é do servidor, a barra só lê.

Abas: **Campanhas (6)** | **Suspeitos (3)**. Botão "Nova campanha" (só quem tem permissão de cupom). Alertas empilhados no topo (âmbar): "Primeira compra R$ 8 usou 80% do orçamento de hoje. R$ 80 de R$ 100. Ao chegar em 100%, o cupom some até amanhã." · "Sem uso há 30 dias" · "Mais de 20% dos usos marcados suspeitos: considere pausar" · "Uma loja concentra mais de 30% dos usos".

Cartão por campanha: nome (título), selo de estado com ícone (Rascunho, Agendada, Convite enviado, Ativa, Pausada, Encerrada), fonte em texto ("Autofinanciado", "Dividido: loja 40% e Webag 60%", "Webag paga", "Loja paga"), "2 de 5 lojas aceitaram" quando há convite, **"Gasto total R$ 312,00 de R$ 800,00" + barra** (cor da marca, com o número ao lado: nunca só cor) + "39 usos" + "Hoje: R$ 80,00 de R$ 100,00". Campanha sem custo da Webag: "Sem custo da Webag: a loja paga e só desconta de quem aceitou." Encerrada mostra o motivo ("Orçamento esgotado"). Toque abre o relatório (ativa/pausada/encerrada) ou o formulário (rascunho/agendada).

**Suspeitos (WB-344):** nota "Nenhum nome ou contato aparece aqui. Cada linha mostra o pedido e o motivo do alerta. Para ver o dado, é preciso pedir, e o acesso fica registrado." Tabela: Pedido (ID opaco) · Sinal ("3 contas no mesmo aparelho em 24 h", "3 cancelamentos com cupom em 7 dias", "Mesmo endereço em 2 contas") · Campanha · **"Liberar"** (diálogo: "Liberar o pedido E-2188? A conta volta a poder usar cupom. Fica registrado com o seu nome e o motivo." Motivo obrigatório; botão "Liberar pedido E-2188"). Rodapé: "O próximo pedido dessas contas fica sem cupom até alguém liberar." (C6, C9)

Estados: carregando (skeleton de 4 cartões), vazio ("Nenhuma campanha ainda. Crie a primeira campanha escolhendo quem paga o desconto." [Nova campanha]), erro ("Não conseguimos carregar as campanhas. Seus dados estão salvos." [Tentar de novo]), sem rede ("Sem conexão. Mostrando o que já carregou."; criar e ativar ficam inertes com o motivo), sem permissão (faixa "Você pode ver, mas não editar. Campanhas são criadas pela Operação e ativadas pelo Super admin ou Financeiro."), sucesso (toasts do §2 e §3).

### 1.1 Configurações > Campanhas (só Super admin; Financeiro e Operação leem)

| Item | Controle e texto |
|---|---|
| Orçamento mensal de cupons da Webag | Campo em R$ (padrão R$ 0,00). Ajuda: "Enquanto for R$ 0, só campanhas em que a loja paga podem ser ativadas." |
| Teto do autofinanciado | `autofin_teto_pct`, 50% (global). Ajuda: "Parte da margem do pedido que um cupom autofinanciado pode usar." |
| "Webag paga" acima da margem | Interruptor global; ajuda: "Pode gerar prejuízo por pedido. Só o Super admin ativa." |
| **Frete grátis** | Interruptor (`campanha_frete_gratis`), **desligado**. Linha de dependência: "Depende do parecer jurídico sobre a taxa de entrega (J22 e J23)." |
| **Parte da loja** | Interruptor (`campanha_parte_da_loja`), **desligado**. "Depende do parecer jurídico dos Termos do Lojista (J27). Libera as opções Loja paga e Dividido." |
| **Selo "de/por"** | Interruptor (`selo_de_por`), **desligado**. "Depende do parecer jurídico sobre preço de referência (J23). Sem ele a loja mostra só o preço atual." |

Ligar ou desligar qualquer item pede 2º fator recente (até 5 min) e **motivo obrigatório citando o parecer** (C-GEN-01; "Parecer J27 recebido em 24/11"); grava autor, antes e depois (WB-340 C9). Quem não é Super admin: 403 e o controle não aparece como ação. Estados: carregando (skeleton), erro ("Não conseguimos salvar. Nada foi alterado." [Tentar de novo]), sem rede (inerte), sucesso (toast "Salvo. Fica registrado com o seu nome e o motivo."). Um parâmetro desligado **não apaga** campanha existente: rascunhos que o usam continuam salvos e ficam sem "Ativar" com a razão.

## 2. Formulário "Nova campanha"

| Seção | Campos | Regras de tela |
|---|---|---|
| **1. Qual é a campanha** | Nome | Título da página espelha o nome |
| **2. Quem paga o desconto** | 4 cartões de rádio: **Webag paga** ("Sai do caixa da Webag. Exige orçamento.") · **Loja paga** ("A loja paga tudo. Só desconta de lojas que aceitaram o convite.") · **Dividido** ("Loja e Webag pagam uma parte cada. Só desconta de quem aceitou.") com campo "Parte da loja (%)" e resumo "Loja 40% e Webag 60%" + exemplo em reais (C2) · **Autofinanciado** ("Sai da margem do próprio pedido, até 50%. O cupom vale inteiro ou não se aplica.") | Frete grátis desabilita Loja e Dividido: "O frete é da Webag." (C3). Com `campanha_parte_da_loja` desligado, **Loja paga** e **Dividido** ficam desabilitados com "Desligado: depende do parecer jurídico dos Termos do Lojista (J27)." (§1.1). Opção desabilitada continua visível, focável e com a razão em texto |
| **3. O desconto** | Tipo (Valor fixo · Percentual com teto · Frete grátis), valor, **teto em R$ (obrigatório no percentual)** | Percentual: o texto ao cliente diz "até R$ N". **Sem teto em R$ o percentual não salva** (C12): erro no campo "Informe o teto em R$ do desconto. Sem ele o custo não tem limite." e foco no campo, também em "Salvar rascunho". Com `campanha_frete_gratis` desligado, **Frete grátis** fica desabilitado com "Desligado: depende do parecer jurídico sobre a taxa de entrega (J22 e J23)." |
| **4. Quem pode usar** | Público (Todos · Primeira compra · Sem pedido há 30 dias), onde vale (todas · cidade · loja · categoria), **pedido mínimo**, usos por cliente (padrão 1), código (opcional) | Ajuda do código: "Sem código, o cupom não aparece sozinho. Quem digita o código recebe o desconto." (campanha automática sem código: só na 2ª entrega, pergunta do PRD) |
| **5. Limites e validade** | Orçamento total, orçamento por dia, limite de usos (opcional), válido até | Ajuda viva: "Com R$ 800,00 dá para cerca de 100 pedidos com cupom. Custo máximo da Webag: R$ 800,00." (C6: exige limite de usos **ou** orçamento) |

**Coluna "Quanto isso custa por pedido" (noite):** tabela da §0.2. Rodapé: "Custo previsto do motoboy: tabela provisória (valores de exemplo até a cotação). Pedido de referência: o mínimo necessário ou R$ 80,00." (WB-341 C11). Números do exemplo do protótipo, com desconto de R$ 8 autofinanciado, teto 50%, comissão 15%: pedido mínimo necessário **R$ 106,67** (retirada), **R$ 113,34** (até 2 km), **R$ 120,00** (2 a 4 km), **R$ 133,34** (4 a 6 km). Botão auxiliar "Usar R$ 133,34 como pedido mínimo" `[a incluir; não está no protótipo]`.

**Bloco "Pior caso por pedido" (WB-340 C12; só tipo percentual com custo Webag: Webag paga ou Dividido).** Fica logo abaixo da tabela, sempre visível enquanto o tipo for percentual. Conteúdo (exemplo: 10%, teto R$ 15,00, Dividido com loja 40%):

| Linha | Texto |
|---|---|
| Pedido de referência (a tabela acima) | "Num pedido de R$ 80,00: a Webag paga R$ 4,80." (parte Webag do percentual sobre o pedido de referência) |
| **Pior caso por pedido** | "Pior caso: a Webag paga até **R$ 9,00** por pedido (60% do teto de R$ 15,00)." Webag paga: "até R$ 15,00 (o teto inteiro)." |
| Contra o orçamento do dia | "Com R$ 100,00 por dia: até **11 pedidos** no pior caso." (piso de orçamento do dia / pior caso) |
| Contra o orçamento total | "Com R$ 800,00 no total: até 88 pedidos no pior caso." |

Regras: o pior caso é calculado só com percentual, teto, parte da loja e orçamentos digitados (não depende da tabela do motoboy; funciona sem rede); orçamento do dia vazio: "Defina o orçamento do dia para ver quantos pedidos cabem." Teto vazio: o bloco mostra o erro da seção 3. Valor fixo e frete grátis não têm o bloco (o custo por pedido já é o valor). Se o pior caso da Webag passar da margem do pedido, aplica-se o aviso "pode gerar prejuízo por pedido" e só o Super admin ativa (C5). Nunca mostrar só o pedido de referência para percentual: "R$ 8" lido sozinho engana.

**Caixa "Para ativar":** lista viva de pendências (ícone alerta + texto) ou "Tudo certo para ativar." (check). Pendências possíveis: falta nome; falta valor; **falta o teto em R$ do percentual (C12)**; falta orçamento total e diário (C4); defina limite de usos ou orçamento (C6); "Pedido mínimo abaixo de R$ 133,34 na faixa mais cara" (C1); "Desconto acima da margem prevista: só o Super admin ativa" (C5); **"Orçamento mensal de cupons da Webag é R$ 0. Defina em Configurações" (C10; só para desconto Webag > 0: Webag paga, Dividido e Autofinanciado; "Loja paga" não é afetada; o rascunho continua salvável)**; **"A soma dos orçamentos das campanhas ativas passa do orçamento mensal. Faltam R$ 150,00." (C11)**; **tipo ou fonte não liberados**: "Frete grátis ainda não liberado (parecer J22 e J23)" e "Parte da loja ainda não liberada (parecer J27)" (§1.1).

**Rodapé:** "Salvar rascunho" (secundário) e **"Ativar campanha"** (primário; só quem pode). Ativar com custo da Webag abre "Confirme que é você": "Esta campanha gasta dinheiro da Webag (até R$ 800,00). Digite o código do seu app autenticador." [Cancelar] [Ativar campanha]. Toast final: "Campanha ativada. Fica registrado quem ativou e quando." Toda alteração grava autor, antes e depois e motivo (C7).

## 3. Relatório de custo real (WB-345, WB-349)

Topo: estado + "Autofinanciado · 01/11 a 31/12"; ações "Pausar" (qualquer admin com permissão de cupom), "Exportar CSV" (proteção de fórmula, C6).

| Bloco | Conteúdo (exemplo) |
|---|---|
| **Custo real da Webag** (bloco noite, valor lima) | R$ 312,00 · "39 pedidos pagos" (C1: só os pagos) |
| Devolvido em cancelamentos | R$ 16,00 · "2 pedidos cancelados" (separado) |
| Custo por cliente novo | R$ 8,43 · "37 clientes novos" |
| Ticket com cupom | R$ 148,60 · "sem cupom na mesma loja: R$ 118,20" (C3) |
| Vendas (GMV) | R$ 5.795,40 |
| Recompra em 30 dias | "—" · "Preenche em 30 dias" |
| Aviso | "Margem de contribuição: parcial. 3 corridas ainda estão sem custo de entrega lançado." (C4) |
| Orçamento | R$ 312,00 de R$ 800,00 · 39% + barra |
| Tabela por loja | Loja · Pedidos · Webag pagou · Loja pagou (C2 em campanha dividida) |

Vazio: "Nenhum pedido ainda. Quando alguém usar o cupom, o custo aparece aqui." (C7). Pausar: "Pausar 'Primeira compra R$ 8'? Novos pedidos deixam de usar o cupom em até 1 minuto. Pedidos já criados mantêm o desconto." Motivo obrigatório; botão "Pausar campanha". Encerrada não reabre: "Duplicar" cria rascunho com as regras (tipo, valor, público, alvo, pedido mínimo, fonte, usos por cliente) e **sem orçamento, validade nem código** (WB-349 C6; resposta D do PO); o aviso no topo do rascunho: "Duplicada de 'Primeira compra R$ 8'. Defina orçamento, validade e código para ativar." Relatório: carregando (skeleton), erro ("Não conseguimos carregar o relatório. Tente de novo." [Tentar de novo]), sem rede (último dado com "Sem conexão. Mostrando o que já carregou."), sem permissão (perfil sem cupom vê o relatório; "Pausar" e "Exportar" somem; sem dado pessoal em nenhum perfil).

## 4. Lojista: convite e cupom próprio (WB-343, WB-346)

**Convite (Mais > Campanhas e cupons).** Cartão: nome ("Casa nova: R$ 15 em decoração"), selo "Responda em 7 dias" (C7: sem resposta, o convite expira sem custo; nunca aceite tácito), condição em 1 frase. Dois blocos lado a lado: **Sua parte 40% · R$ 6,00 por pedido** e **Webag paga 60% · R$ 9,00**. Caixa de efeito em dinheiro: "Em um pedido de exemplo: **você recebe R$ 79,78**. Sem o cupom, você receberia R$ 83,93." (valores do PRD C2). Campo **"Seu limite por mês (R$)"** (padrão 150,00) com ajuda "Quando sua parte chegar a esse valor, a campanha para na sua loja." Botões "Recusar" e **"Aceitar campanha"** → confirmação "Você paga 40% de cada desconto, até R$ 150,00 por mês. Pode sair quando quiser." [Voltar] [Aceitar campanha]. Depois: selo "Você aceitou" + "Sair da campanha" ("Pedidos novos deixam de usar o cupom. Os já feitos mantêm."). **Nunca existe aceite automático nem "aceitar todas"**; convite sem resposta em 7 dias expira sem custo (C7); funcionário sem permissão de cupons não vê o item (C6).

**Cupom próprio.** Campos: desconto (%), pedido mínimo, validade, **limite por mês (R$, obrigatório)**; prévia em caixa noite: "Num pedido de R$ 80,00, você recebe R$ 60,49 (sem o cupom: R$ 67,21)". Aviso: "Cupom da loja vale só na sua loja e o desconto sai da sua parte." Limite do desconto (WB-346 C7, `cupom_loja_pct_max`, padrão 30%): percentual acima dele é recusado com "O desconto máximo da loja é 30%"; valor fixo pede pedido mínimo de pelo menos valor / 30% (desconto de R$ 20,00: mínimo de R$ 66,67), com a conta escrita no campo `[interface]` "Para um desconto de R$ 20,00, o pedido mínimo é de pelo menos R$ 66,67." Botão "Criar cupom". **Dependência de parecer do cupom próprio: pergunta 10 ao PO** (até a resposta, não é governado pelos 3 parâmetros). Admin pode pausar com motivo e o lojista é avisado (C6); teto atingido pausa e avisa (C5).

## 5. Estados do lojista

Convites: carregando (skeleton), vazio ("Nenhum convite agora. Quando a Webag convidar sua loja para uma campanha, ele aparece aqui. Você só entra se aceitar."), erro, sem rede (aceitar/sair **inertes**: "Conecte-se para aceitar. Nada foi aceito."), sucesso (toast "Campanha aceita. Registramos seu aceite.").

## 6. Acessibilidade

Cartões de rádio: `radiogroup` com rótulo; desabilitado com a razão em texto. Tabela de simulação com `caption` e `<th scope>`; "Prejuízo de R$ X" em texto, nunca só vermelho. Barras de orçamento `aria-hidden` com o valor em texto ao lado. Lista "Para ativar" em região viva educada; "Ativar campanha" com `aria-disabled` e `aria-describedby` apontando para a lista (focável, anuncia o motivo). Bloco "Pior caso" em `dl` ("Pior caso por pedido, R$ 9,00"), texto também em leitor de tela, nunca só valor em destaque. Interruptores de §1.1 com `role=switch`, estado e a dependência de parecer lida junto do rótulo. Diálogo de 2º fator: `autocomplete=one-time-code`, colar permitido. Alvos 44 a 48 px; texto >= 16 px no celular. Lima só sobre noite. Desktop (>= 1100 px): formulário à esquerda e coluna de custo fixa à direita; celular: coluna única, com a simulação e o "Pior caso" **antes** de "Salvar rascunho" e "Ativar campanha". Zoom 200%: a tabela de simulação vira cartões por faixa.

## 7. Eventos

PRD: `campaign_created`, `campaign_activated`, `campaign_budget_threshold` (80, 100), `store_campaign_joined`, `store_campaign_left`. Proponho: `campaign_activation_blocked` (reason), `campaign_sim_viewed`, `campaign_worstcase_viewed`, `campaign_param_changed` (param: `campanha_frete_gratis`, `campanha_parte_da_loja`, `selo_de_por`; on/off), `suspect_released`.

## 8. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-340 C1 a C7 | §2 (sim, rádios, "Para ativar", rascunho x ativar, auditoria) |
| WB-340 C9, C10, C11 | §1 (topo: orçamento mensal), §1.1 (Configurações), §2 ("Para ativar") |
| WB-340 C12 | §2 (bloco "Pior caso por pedido"; teto em R$ obrigatório) |
| Parâmetros `campanha_frete_gratis`, `campanha_parte_da_loja`, `selo_de_por` (DEC-137) | §0.10, §1.1, §2 (opções desabilitadas com a razão) |
| WB-341 | Motor; a tela só mostra o resultado (§2 tabela). Texto ao cliente: `v1-1-cupom-cliente.md` |
| WB-342 C1 a C6 | §1 (barras, alertas), §2 seção 5 |
| WB-343 C1 a C7 | §4 |
| WB-344 C1 a C9 | §1 Suspeitos (C6, C7, C9); recusas (C1 a C5, C8) aparecem ao cliente |
| WB-345 C1 a C7 | §3 |
| WB-346 C1 a C6 | §4 |
| WB-349 C1 a C4, C6 | §1 (alertas, "Sem uso"), §3 (pausar, encerrar, duplicar sem orçamento) |

## 9. Revisão heurística

**Nota 3 de 5.** CU-1 (sev. 3, H8): 5 seções + simulação + checklist é muito para o perfil Operação que "só prepara"; mitigação: seções 1, 3 e 5 são as obrigatórias, 4 tem padrões. CU-2 (sev. 4, H5): **o custo de uma campanha "Webag paga" ou "Dividido" com percentual é variável** (depende do ticket) e a tabela usa um pedido de referência; sem aviso o fundador lê R$ 8 e a conta vira R$ 15 em pedido grande. **Corrigido nesta revisão:** bloco "Pior caso por pedido" e "até N pedidos no pior caso" (§2, WB-340 C12). CU-3 (sev. 2, H4): "Dividido" mistura % da loja com texto do cliente; padronizar "Loja X% e Webag Y%". CU-4 (sev. 3, H1): sem visão do custo acumulado contra o orçamento mensal global; **corrigido** com a barra do topo e a pendência C10 e C11. CU-5 (sev. 3, H5): três interruptores de parecer jurídico em Configurações só funcionam se a razão do bloqueio aparecer **onde o admin esbarra** (opção desabilitada no formulário); está especificado, conferir no teste. Bom: custo visível ao digitar, pendências escritas, 2º fator, nada de adesão automática. **Teste:** o fundador criando "Primeira compra R$ 8" cronometrado (meta 3 min) e lendo o pior caso de um percentual sem ajuda.

## 10. Perguntas

| Para | Pergunta |
|---|---|
| Fundador / PO | ~~1 a 4~~ **Respondidas** (`v1-1-respostas-ao-time.md` §D): R$ 0 salva rascunho e bloqueia "Ativar" para desconto Webag > 0, barra "gasto do mês" no topo; `autofin_teto_pct` só global; só código na 1ª entrega; "Duplicar" não copia orçamento. Fundador: valor do orçamento mensal (F2) segue aberto |
| PO | 10. O cupom próprio do lojista (WB-346, `loja_pct` 100, sem convite do admin) depende de `campanha_parte_da_loja` (J27) ou vale desde já? 11. O texto "Desligado: depende do parecer jurídico..." pode citar J22, J23 e J27 ao admin, ou prefere "parecer jurídico" sem código? |
| backend-dev | 5. Custo previsto do motoboy por faixa (F4): sem tabela real, a simulação usa números do seed 6. Reserva do orçamento em tempo real: a barra do dia atualiza a cada quanto tempo? |
| Security | 7. Revelar dado em "Suspeitos": pedido a pedido, com motivo (padrão SEC-144); 2º fator vale por quanto tempo? 8. Retenção dos sinais de fraude |
| jurídico (J22/J23/J27) | 9. Texto de aceite do lojista e versão registrada; pedido mínimo como condição |
