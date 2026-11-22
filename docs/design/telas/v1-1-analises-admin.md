# Tela: Admin, acessos, saída e rastreio, módulo por loja   (WB-362, 363, 366, 398)

> Autor: product-designer. Data: 2026-11-22. Release R5 (coleta e admin primeiro, módulo do lojista por último, RN-A8). Protótipo: `v1-1-logistica-e-analises.html#/a/acessos?aba=acessos|saida|modulo`. Barra: "Perfil admin" (Suporte não vê a tela; Operação vê e não ativa módulo), "Estado" (vazio mostra "Ainda sem dados").
> Reaproveita: filtros globais, KPI, barra e tabela de `v1-1-admin-paineis.md`.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Uma tela com 3 abas** (Acessos, Saída e rastreio, Módulo por loja), cada aba na URL | São 3 perguntas do fundador: "o que o cliente abre?", "onde o fluxo trava?", "quem paga?" |
| 2 | **Acessos mostram só o perfil da loja ou o produto**, nunca a pessoa; a frase está na tela ("Só o acesso ao perfil da loja ou ao produto. Nunca por pessoa.") | LGPD e coerência com o que o lojista vê |
| 3 | **KPI "Só viram o perfil"** em destaque (67% das visitas, 3.250 de 4.870) | É a pergunta do fundador: por que abrem a loja e não o produto? |
| 4 | **Funil geral com 5 etapas** (visita, produto, sacola, **iniciaram o pedido**, pago) e conversão de **cada** etapa | WB-362 C3; mostra onde quebra (sacola para pedido: 65%) |
| 5 | **"menos de 5" também no admin** nas quebras por loja e origem; loja com < 30 visitas sem comparação | RN-A2 vale aqui |
| 6 | **Módulo por loja em tabela com ação por situação**: Inativo: Ativar teste de 30 dias; Teste/Ativo/Vencido: Registrar pagamento; Teste/Ativo: Suspender; Suspenso: Reativar; "Histórico" sempre | Só aparece a ação válida (como no admin de lojas); histórico com quem, quando e motivo |
| 7 | **Registrar pagamento é manual e diz isso**: "Pagamento por PIX para a conta da empresa, fora do sistema. Guardamos o valor deste momento. Nada é descontado do repasse da loja." | DEC-016; sem provedor novo (F6) |
| 8 | **Porta falsa resumida no topo da aba Módulo**: "5 de 8 lojas tocaram em 'Quero testar'. Faixas de exemplo." | WB-367 C3; decide se o módulo vale ser lançado (HIP-A1: >= 3 aceitam pagar) |
| 9 | **Conversa com o construtor**: as métricas novas entram no catálogo (visitas, aberturas, sacola, conversão por etapa) com dimensões Tempo, Cidade, Loja, Categoria, Produto e **Origem (nova)**; **nunca** Cliente, Meio de pagamento, Campanha ou Modo; "menos de 5" também no CSV | Um catálogo só (WB-356); o construtor já esconde combinação incompatível com a razão escrita |
| 10 | **Saída e rastreio** (WB-398) em 3 KPI e uma tabela por loja, com **"Poucos dados"** para <= 5 saídas | Responde "onde o fluxo trava" sem painel novo; mesma regra |

## 1. Aba Acessos

Filtros: Período (7, 28, 90 dias), Cidade. KPI: Visitas a lojas · Só viram o perfil · Conversão visita-pedido. **Funil geral**. **Lojas mais acessadas** (barra, nome e valor escritos, "Subiu 12%" só se >= 30 visitas). **Produtos mais abertos** (top 10). **De onde vêm as visitas** (banner, lista da home, ofertas, categoria, busca, favoritos, comprar de novo, notificação, link externo). Bloco "Como isso entra no construtor" com link ao construtor. Filtro de cidade vale para tudo.

## 2. Aba Saída e rastreio

KPI: Entregas com mapa 91% · Tempo sem sinal 4,2% · Erro mediano do ETA 3,1 min ("Dentro da meta de 4 min"). Tabela por loja: Saídas, Mediana e p90 da chegada à saída, % Pela loja, % Automática, % Operação, Contestações. Rodapé: "Lojas com 5 saídas ou menos mostram 'poucos dados'. Meta do PRD: automáticas até 20% depois de 4 semanas." (números do protótipo são fictícios)

## 3. Aba Módulo por loja

Tabela: Loja (cidade), Situação (tag com ícone e texto), Válido até ("faltam 12 dias" no teste), Ações. Diálogos: **Ativar teste de 30 dias** (motivo: Pedido do lojista, Convite da Webag, Outro; botão repete a ação), **Registrar pagamento** (Pago até [data], Valor combinado por mês, texto da cobrança manual), **Suspender** ("O módulo fica inacessível para o lojista. Os dados ficam guardados." [Manter] [Suspender módulo]), **Histórico** (autor, data e hora, texto). Perfil Operação, Suporte e Financeiro-sem-direito: sem botões e a nota "Só Super admin e Financeiro ativam ou registram pagamento."

## 4. Estados

| Estado | Texto |
|---|---|
| Carregando | Skeleton de 6 blocos |
| Vazio | "Ainda sem dados. O app precisa ser atualizado para começar a medir. Os números aparecem depois de alguns dias." |
| Erro | "Não conseguimos carregar agora. Seus dados estão salvos. Tente de novo em instantes." |
| Sem rede | Faixa "Sem conexão. Mostrando o que já carregou." |
| Sem permissão (Suporte) | O item "Acessos" some do menu; por URL: "Você não tem acesso a esta tela. Os acessos são dados de negócio." |
| Cidade sem lojas | "Sem lojas nesta cidade." |
| Job de agregação falhou (WB-363 C5) | Faixa âmbar "A agregação de ontem falhou. Os números de ontem podem estar incompletos." [Reprocessar] `[sem tela no protótipo]` |
| Sucesso | Toasts "Teste ativado para Casa Bela. O lojista foi avisado." e "Pagamento registrado até 22/12." |

## 5. Acessibilidade

Mesmas regras de gráfico dos painéis: número escrito, frase de apoio, tabela como alternativa. Tabelas viram cartões no celular. Tags de situação com ícone e palavra. Alvos >= 44 px. Diálogos com foco no título, `Esc` fecha, foco volta ao gatilho. Variação com palavra ("Subiu", "Caiu").

## 6. Eventos

`analytics_admin_viewed` (aba, período), `store_module_changed` (store_id, de, para), `payment_registered` (store_id, até), `analytics_export`. Sem pessoa.

## 7. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-362 C1 a C7 | §1 (C6 Suporte: §4; C7 vazio) |
| WB-363 C3, C5 | Mínimo de 5 em todas as quebras; falha do job em §4 (sem tela). C1, C2, C4 são de dev |
| WB-366 C1 a C7 | §3 (C5 permissão; C7 é de teste de ledger) |
| WB-398 C1 a C5 | §2 (C4: vira item do catálogo no construtor, §0.9) |
| WB-361 | Sem tela (dev); o aviso ao cliente é a tela `v1-1-transparencia-medicao.md` |

## 8. Revisão heurística

**Nota 3 de 5.** AA-1 (sev. 3, H8): três abas, 5 blocos por aba, é denso para um fundador que ainda não tem volume; com 5 a 30 lojas, quase tudo será "menos de 5" por semanas. Correção: no 1º mês, mostrar só funil e top lojas (o resto atrás de "Ver mais"). AA-2 (sev. 3, H2): "funil", "origem", "aberturas" exigem aprendizado; a linha "cada etapa conta visitas, não pessoas" ajuda; testar 2 rótulos com o fundador. AA-3 (sev. 2, H5): o módulo por loja permite "Suspender" teste ativo sem dizer o que o lojista verá; acrescentar a prévia "O lojista verá: 'O módulo está suspenso'". Bom: regra de mínimo visível, ação só se válida, cobrança manual explicada. **Teste:** o fundador acha "qual loja mais perde entre visita e produto" em 30 s.

## 9. Perguntas

PO: 1. Preço, teste de 30 dias e quem registra o pagamento 2. Dimensão "Origem" no catálogo do construtor: confirmar a matriz métrica x dimensão. backend-dev: 3. A consulta devolve `n` por célula para "menos de 5"? Security: 4. Supressão complementar (ver `v1-1-analises-lojista.md` §4). Fundador: 5. Decisão semanal registrada a partir de um número de acesso (meta do PRD).
