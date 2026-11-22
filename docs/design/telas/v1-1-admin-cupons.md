# Tela: Admin, campanhas e cupons (e adesão do lojista)   (WB-340 a WB-346, WB-349)

> Autor: product-designer. Data: 2026-11-22. Release R2. Protótipo: `#/a/cupons`, `#/a/cupom-novo`, `#/a/cupom-rel`; lojista: `#/l/convites` (Mais > Campanhas e cupons). Troque o perfil na barra do protótipo: **só Super admin e Financeiro veem "Ativar campanha"**.
> Reaproveita: lista de cartões e relatório do painel v3; `docs/telas/16-app-cupons.png` (cliente). WB-347 (cliente) está em `v1-1-cupom-cliente.md`.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Formulário em 5 seções numeradas numa página só** + coluna lateral fixa "Quanto isso custa por pedido" (desktop) ou bloco logo abaixo (celular). Sem assistente em passos | Meta do PRD: criar e ativar em <= 3 min. O fundador precisa **ver o custo enquanto digita**; um assistente esconde o resultado no fim |
| 2 | A simulação é uma **tabela por faixa de entrega** (retirada, até 2 km, 2 a 4, 4 a 6) com 3 colunas: pedido mínimo necessário (só Autofinanciado), quanto a Webag paga, **quanto sobra no pedido** (verde) ou **"Prejuízo de R$ X"** (vermelho claro, com texto) | Responde "quanto isso custa por pedido". É o centro da tela |
| 3 | "Quem paga" são **4 cartões de rádio com a consequência escrita** em linguagem de loja ("Sai da margem do próprio pedido, até 50%. O cupom vale inteiro ou não se aplica."), não um seletor | Escolha irreversível em dinheiro merece texto. Sem jargão (margem de contribuição, ledger) |
| 4 | Combinação proibida **não é escondida, é explicada**: frete grátis + "Loja paga/Dividido" → opções desabilitadas com "O frete é da Webag." | WB-340 C3; esconder gera "cadê a opção?" |
| 5 | **"Ativar campanha" fica ativo e lista o que falta** ("Falta o orçamento total e o diário"; "Pedido mínimo abaixo de R$ 133,34 na faixa mais cara") numa caixa "Para ativar" | Mesmo padrão do Publicar (RN-17): botão morto sem motivo não existe |
| 6 | Operação só vê **"Salvar rascunho"** e o texto "Quem ativa: Super admin ou Financeiro." | WB-340 C6; ação ausente, não cinza |
| 7 | Ativar campanha com custo da Webag pede **2º fator recente** em diálogo ("Confirme que é você") | Requisito não funcional do PRD |
| 8 | **Lista de campanhas mostra barra de orçamento (total e do dia) e alertas no topo**, não só status | O fundador precisa ver o teto chegando; WB-342 C4 e WB-349 C3, C4 |
| 9 | "Compartilhar" não é recurso desta tela: o texto do cliente "Faltam R$ X" vem do servidor e não da campanha | Fora do PRD |

## 1. Lista de campanhas

Abas: **Campanhas (6)** | **Suspeitos (3)**. Botão "Nova campanha" (só quem tem permissão de cupom). Alertas empilhados no topo (âmbar): "Primeira compra R$ 8 usou 80% do orçamento de hoje. R$ 80 de R$ 100. Ao chegar em 100%, o cupom some até amanhã." · "Sem uso há 30 dias" · "Mais de 20% dos usos marcados suspeitos: considere pausar" · "Uma loja concentra mais de 30% dos usos".

Cartão por campanha: nome (título), selo de estado com ícone (Rascunho, Agendada, Convite enviado, Ativa, Pausada, Encerrada), fonte em texto ("Autofinanciado", "Dividido: loja 40% e Webag 60%", "Webag paga", "Loja paga"), "2 de 5 lojas aceitaram" quando há convite, **"Gasto total R$ 312,00 de R$ 800,00" + barra** (cor da marca, com o número ao lado: nunca só cor) + "39 usos" + "Hoje: R$ 80,00 de R$ 100,00". Campanha sem custo da Webag: "Sem custo da Webag: a loja paga e só desconta de quem aceitou." Encerrada mostra o motivo ("Orçamento esgotado"). Toque abre o relatório (ativa/pausada/encerrada) ou o formulário (rascunho/agendada).

**Suspeitos (WB-344):** nota "Nenhum nome ou contato aparece aqui. Cada linha mostra o pedido e o motivo do alerta. Para ver o dado, é preciso pedir, e o acesso fica registrado." Tabela: Pedido (ID opaco) · Sinal ("3 contas no mesmo aparelho em 24 h", "3 cancelamentos com cupom em 7 dias", "Mesmo endereço em 2 contas") · Campanha · **"Liberar"** (diálogo: "Liberar o pedido E-2188? A conta volta a poder usar cupom. Fica registrado com o seu nome e o motivo." Motivo obrigatório; botão "Liberar pedido E-2188"). Rodapé: "O próximo pedido dessas contas fica sem cupom até alguém liberar." (C6, C9)

Estados: carregando (skeleton de 4 cartões), vazio ("Nenhuma campanha ainda. Crie a primeira campanha escolhendo quem paga o desconto." [Nova campanha]), erro, sem rede (leitura; criar/ativar inertes com motivo), sem permissão (faixa "Você pode ver, mas não editar. Campanhas são criadas pela Operação e ativadas pelo Super admin ou Financeiro.").

## 2. Formulário "Nova campanha"

| Seção | Campos | Regras de tela |
|---|---|---|
| **1. Qual é a campanha** | Nome | Título da página espelha o nome |
| **2. Quem paga o desconto** | 4 cartões de rádio: **Webag paga** ("Sai do caixa da Webag. Exige orçamento.") · **Loja paga** ("A loja paga tudo. Só desconta de lojas que aceitaram o convite.") · **Dividido** ("Loja e Webag pagam uma parte cada. Só desconta de quem aceitou.") com campo "Parte da loja (%)" e resumo "Loja 40% e Webag 60%" + exemplo em reais (C2) · **Autofinanciado** ("Sai da margem do próprio pedido, até 50%. O cupom vale inteiro ou não se aplica.") | Frete grátis desabilita Loja e Dividido: "O frete é da Webag." (C3) |
| **3. O desconto** | Tipo (Valor fixo · Percentual com teto · Frete grátis), valor, teto em R$ (percentual) | Percentual: o texto ao cliente diz "até R$ N" |
| **4. Quem pode usar** | Público (Todos · Primeira compra · Sem pedido há 30 dias), onde vale (todas · cidade · loja · categoria), **pedido mínimo**, usos por cliente (padrão 1), código (opcional) | Ajuda do código: "Sem código, o cupom não aparece sozinho. Quem digita o código recebe o desconto." (campanha automática sem código: só na 2ª entrega, pergunta do PRD) |
| **5. Limites e validade** | Orçamento total, orçamento por dia, limite de usos (opcional), válido até | Ajuda viva: "Com R$ 800,00 dá para cerca de 100 pedidos com cupom. Custo máximo da Webag: R$ 800,00." (C6: exige limite de usos **ou** orçamento) |

**Coluna "Quanto isso custa por pedido" (noite):** tabela da §0.2. Rodapé: "Valores de exemplo do seed (custo do motoboy a confirmar). Pedido de referência: o mínimo necessário ou R$ 80,00." Números do exemplo do protótipo, com desconto de R$ 8 autofinanciado, teto 50%, comissão 15%: pedido mínimo necessário **R$ 106,67** (retirada), **R$ 113,34** (até 2 km), **R$ 120,00** (2 a 4 km), **R$ 133,34** (4 a 6 km). Botão auxiliar "Usar R$ 133,34 como pedido mínimo" `[a incluir; não está no protótipo]`.

**Caixa "Para ativar":** lista viva de pendências (ícone alerta + texto) ou "Tudo certo para ativar." (check). Pendências possíveis: falta nome; falta valor; falta orçamento total e diário (C4); defina limite de usos ou orçamento (C6); "Pedido mínimo abaixo de R$ 133,34 na faixa mais cara" (C1); "Desconto acima da margem prevista: só o Super admin ativa" (C5).

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

Vazio: "Nenhum pedido ainda. Quando alguém usar o cupom, o custo aparece aqui." (C7). Pausar: "Pausar 'Primeira compra R$ 8'? Novos pedidos deixam de usar o cupom em até 1 minuto. Pedidos já criados mantêm o desconto." Motivo obrigatório; botão "Pausar campanha". Encerrada não reabre: "Duplicar" cria rascunho (WB-349 C2).

## 4. Lojista: convite e cupom próprio (WB-343, WB-346)

**Convite (Mais > Campanhas e cupons).** Cartão: nome ("Casa nova: R$ 15 em decoração"), selo "Responda em 5 dias", condição em 1 frase. Dois blocos lado a lado: **Sua parte 40% · R$ 6,00 por pedido** e **Webag paga 60% · R$ 9,00**. Caixa de efeito em dinheiro: "Em um pedido de exemplo: **você recebe R$ 79,78**. Sem o cupom, você receberia R$ 83,93." (valores do PRD C2). Campo **"Seu limite por mês (R$)"** (padrão 150,00) com ajuda "Quando sua parte chegar a esse valor, a campanha para na sua loja." Botões "Recusar" e **"Aceitar campanha"** → confirmação "Você paga 40% de cada desconto, até R$ 150,00 por mês. Pode sair quando quiser." [Voltar] [Aceitar campanha]. Depois: selo "Você aceitou" + "Sair da campanha" ("Pedidos novos deixam de usar o cupom. Os já feitos mantêm."). **Nunca existe aceite automático nem "aceitar todas"**; convite sem resposta em 7 dias expira sem custo (C7); funcionário sem permissão de cupons não vê o item (C6).

**Cupom próprio.** Campos: desconto (%), pedido mínimo, validade, **limite por mês (R$, obrigatório)**; prévia em caixa noite: "Num pedido de R$ 80,00, você recebe R$ 60,49 (sem o cupom: R$ 67,21)". Aviso: "Cupom da loja vale só na sua loja e o desconto sai da sua parte." Botão "Criar cupom". Admin pode pausar com motivo e o lojista é avisado (C6); teto atingido pausa e avisa (C5).

## 5. Estados do lojista

Convites: carregando (skeleton), vazio ("Nenhum convite agora. Quando a Webag convidar sua loja para uma campanha, ele aparece aqui. Você só entra se aceitar."), erro, sem rede (aceitar/sair **inertes**: "Conecte-se para aceitar. Nada foi aceito."), sucesso (toast "Campanha aceita. Registramos seu aceite.").

## 6. Acessibilidade

Cartões de rádio: `radiogroup` com rótulo; desabilitado com a razão em texto. Tabela de simulação com `caption` e `<th scope>`; "Prejuízo de R$ X" em texto, nunca só vermelho. Barras de orçamento `aria-hidden` com o valor em texto ao lado. Lista "Para ativar" em região viva educada. Diálogo de 2º fator: `autocomplete=one-time-code`, colar permitido. Alvos 44 a 48 px; texto >= 16 px no celular. Lima só sobre noite.

## 7. Eventos

PRD: `campaign_created`, `campaign_activated`, `campaign_budget_threshold` (80, 100), `store_campaign_joined`, `store_campaign_left`. Proponho: `campaign_activation_blocked` (reason), `campaign_sim_viewed`, `suspect_released`.

## 8. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-340 C1 a C7 | §2 (sim, rádios, "Para ativar", rascunho x ativar, auditoria) |
| WB-341 | Motor; a tela só mostra o resultado (§2 tabela). Texto ao cliente: `v1-1-cupom-cliente.md` |
| WB-342 C1 a C6 | §1 (barras, alertas), §2 seção 5 |
| WB-343 C1 a C7 | §4 |
| WB-344 C1 a C9 | §1 Suspeitos (C6, C7, C9); recusas (C1 a C5, C8) aparecem ao cliente |
| WB-345 C1 a C7 | §3 |
| WB-346 C1 a C6 | §4 |
| WB-349 C1 a C4 | §1 (alertas, "Sem uso"), §3 (pausar, encerrar) |

## 9. Revisão heurística

**Nota 3 de 5.** CU-1 (sev. 3, H8): 5 seções + simulação + checklist é muito para o perfil Operação que "só prepara"; mitigação: seções 1, 3 e 5 são as obrigatórias, 4 tem padrões. CU-2 (sev. 4, H5): **o custo de uma campanha "Webag paga" com percentual é variável** (depende do ticket) e a tabela usa um pedido de referência; sem aviso o fundador lê R$ 8 e a conta vira R$ 15 em pedido grande. Correção: mostrar também o "pior caso" por pedido (teto do percentual) `[incluir no protótipo]`. CU-3 (sev. 2, H4): "Dividido" mistura % da loja com texto do cliente; padronizar "Loja X% e Webag Y%". CU-4 (sev. 3, H1): sem visão do **custo acumulado de todas as campanhas contra o orçamento mensal global** (F2 = R$ 0 até definir); ver pergunta 1. Bom: custo visível ao digitar, pendências escritas, 2º fator, nada de adesão automática. **Teste:** o fundador criando "Primeira compra R$ 8" cronometrado (meta 3 min).

## 10. Perguntas

| Para | Pergunta |
|---|---|
| Fundador / PO | 1. Orçamento mensal global de cupons (F2) e onde mostrá-lo; enquanto for R$ 0, o formulário bloqueia custo da Webag? 2. `autofin_teto_pct` 50% e se o admin pode mudá-lo por campanha 3. Cupom só com código na 1ª entrega (confirmo) 4. Botão "Duplicar" em encerrada: copia o orçamento? |
| backend-dev | 5. Custo previsto do motoboy por faixa (F4): sem tabela real, a simulação usa números do seed 6. Reserva do orçamento em tempo real: a barra do dia atualiza a cada quanto tempo? |
| Security | 7. Revelar dado em "Suspeitos": pedido a pedido, com motivo (padrão SEC-144); 2º fator vale por quanto tempo? 8. Retenção dos sinais de fraude |
| jurídico (J22/J23/J27) | 9. Texto de aceite do lojista e versão registrada; pedido mínimo como condição |
