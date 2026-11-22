# Tela: Preços e estoque (edição em massa)   (WB-377; base WB-066)

> Autor: product-designer. Data: 2026-11-22. Release R1. Protótipo: `#/l/massa`. Também usada pelo admin (`v1-1-admin-lojas.md`, aba Catálogo).
> Persona: Joana (P2b, funcionária) repondo estoque com o teclado; Seu Marcos subindo preço de 5 produtos em 10%.

## 0. Decisão central

**No celular não existe "planilha": existe lista de cartões com dois campos grandes (Preço, Estoque) por produto.** Uma tabela com rolagem lateral no celular é hostil (alvo pequeno, perde o nome do produto). No desktop (>= 1024) vira tabela de verdade. A edição é **em linha, salva ao digitar** (depois de 0,7 s parado), com a resposta escrita na própria linha. O "Próximo" do teclado desce para o **mesmo campo da linha de baixo** (`enterkeyhint=next`), que é o ritmo de quem repõe estoque `[HIPÓTESE: validar com Joana]`.

## 1. Layout (390 px)

| # | Componente | Conteúdo |
|---|---|---|
| 1 | Cabeçalho | "Preços e estoque", voltar a Produtos |
| 2 | Dica | "Mudou o valor, salvou na hora. No teclado, 'Próximo' vai para o campo de baixo." |
| 3 | Aviso de desfazer (após reajuste) | "Preços reajustados em 8 produtos. Dá para desfazer por **09:41**." + botão "Desfazer" |
| 4 | Lista | Por produto: caixa de seleção (48 px), miniatura, nome, linha de estado ("2 reservadas em pedidos" / "Salvo · você recebe R$ 54,90"), campos **Preço** (R$, decimal) e **Estoque** (numérico) lado a lado, 52 px |
| 5 | Barra de ações (aparece com seleção) | Noite, fixa: "3 selecionados" + "Reajustar preço" (lima) + "Pausar" |

## 2. Interações

| Ação | Resultado |
|---|---|
| Editar preço/estoque | "Salvando…" e depois **"Salvo"** com check (C1). Preço mostra "você recebe R$ X" (DEC-035) |
| Preço <= 0 ou > 99.999,99 | Na linha: "O preço precisa ser maior que R$ 0,00." / "O preço máximo é R$ 99.999,99." (campo com borda de erro; valor anterior preservado) |
| Estoque < reservado | Na linha: "Estoque menor que o reservado (3). Use 3 ou mais." (C5, RN-06) |
| "Reajustar preço" | BottomSheet: "Em %" ou "Em R$", "Aumentar" ou "Diminuir", valor, **prévia em tabela** (produto, antes, depois, você recebe) e botão "Aplicar aos selecionados" (C2) |
| Reajuste > 30% em algum item | Aviso âmbar "Reajuste acima de 30%. Confira os valores antes de aplicar." + caixa "Conferi os valores novos"; o botão só habilita com a caixa marcada (C3) |
| Aplicado | Preços mudam na lista; aviso de desfazer com contagem de 10 min (C4); depois some |
| "Desfazer" | Todos voltam ao valor anterior; toast "Preços voltaram ao valor anterior." |
| "Pausar" | Diálogo "Pausar 3 produtos?" "Eles deixam de aparecer para o cliente até você reativar." [Manter à venda] [Pausar 3 produtos] (botão repete a contagem) |
| Histórico (C7) | Cada reajuste grava quem, quando, quantos itens; fica em Produtos > Histórico `[tela fora desta rodada]` |

## 3. Estados

| Estado | Comportamento |
|---|---|
| Carregando | Skeleton de 5 cartões com o formato real |
| Vazio | "Nenhum produto para editar. Cadastre o primeiro produto para ajustar preço e estoque aqui." [Ir para Produtos] |
| Erro | "Não conseguimos carregar agora. Seus dados estão salvos. Tente de novo em instantes." |
| Sem rede | Faixa "Sem conexão. Mostrando o que já carregou." Campos seguem editáveis; a linha mostra "Na fila: salva quando voltar a internet"; reajuste em massa **fica inerte com o motivo escrito** (precisa de rede para a prévia do servidor) |
| Sucesso | "Salvo" por linha; aviso de desfazer no reajuste |
| Somente leitura (funcionário sem permissão de catálogo, C6) | Campos e caixas desabilitados; faixa "Você pode ver, mas não editar. Peça ao dono da loja para liberar o catálogo." |
| Conflito (outro aparelho mudou o produto) | Na linha: "Este produto foi alterado agora. Toque para ver o valor novo." sem sobrescrever |

## 4. Acessibilidade

Cada campo tem `label` visível ("Preço", "Estoque") + nome do produto no contexto (`aria-label` da caixa: "Selecionar Camiseta básica preta"). Resposta de salvamento em região viva educada por linha (não anuncia "Salvando"). Contagem "3 selecionados" anunciada ao mudar. Desfazer: contador **em texto**, anunciado em 5:00, 1:00 e ao expirar (nunca a cada segundo). Alvos 48 px; texto >= 16 px. Desktop: tabela com `<th scope>`, Tab percorre campo a campo, Enter desce. Reajuste: tabela da prévia com `caption`.

## 5. Movimento

| Gatilho | Propósito | Propriedade | Duração | Reduzido |
|---|---|---|---|---|
| Barra de ações entra | Mostrar que há seleção | translateY + opacity | 150 | só opacity |
| Aviso de desfazer entra | Aviso persistente | opacity | 150 | igual |
| "Salvo" aparece na linha | Confirmar | opacity | 150 | igual |

## 6. Eventos

PRD: `bulk_price_adjusted` (items, pct_band). Proponho: `bulk_undo`, `bulk_blocked` (reason: reserved, max_price), `inline_edit_saved` (field).

## 7. Mapa WB para a tela

C1 §2 (linha), C2 §2 (prévia), C3 §2 (30%), C4 §2 (desfazer 10 min), C5 §2 (reservado), C6 §3 (somente leitura), C7 §2 (histórico; tela fora desta rodada).

## 8. Revisão heurística

**Nota 4 de 5.** EM-1 (sev. 3, H5): digitar preço sem querer num cartão com o polegar rolando; **mitigado**: salvar só após pausa de 0,7 s e mostrar "Salvo · você recebe" para o erro aparecer, mas o valor errado já foi salvo. Correção candidata: confirmar quando a mudança é > 30% numa edição em linha (mesma regra do reajuste) `[a testar: pode atrapalhar]`. EM-2 (sev. 2, H7): sem "selecionar todos" no protótipo; incluir. EM-3 (sev. 2, H1): quem sai da tela com "Salvando…" pendente precisa de aviso. Bom: resposta escrita na linha, "você recebe" ao lado do preço, desfazer visível com tempo. **Teste:** Joana repondo 20 estoques com e sem o atalho "Próximo".

## 9. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Edição em linha acima de 30% pede confirmação? 2. Incluir promoção como coluna agora (PRD cita "e promoção")? 3. "Selecionar todos" respeita o filtro da busca? |
| backend-dev | 4. Reajuste de N itens é transação única? E o desfazer depois de 10 min com edição manual no meio? |
| mobile-dev | 5. `enterkeyhint=next` + foco na linha de baixo funciona no Safari com lista virtualizada? |
