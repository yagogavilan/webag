---
name: delegacao-e-verificacao
description: Como o CEO delega aos agentes (briefing completo, paralelismo seguro, tratamento do retorno) e verifica a entrega com evidência antes de aceitar. Use ao disparar qualquer agente, ao receber um relatório de "pronto" e ao devolver trabalho raso.
---
# Delegação e verificação (CEO)

O agente não vê esta conversa e costuma relatar com otimismo. Delegar bem é escrever tudo; aceitar bem é checar o artefato, não o resumo.

## 1. Briefing (formato do `ceo.md`) com checagem
Antes de enviar, confirme que o texto responde:
- **OBJETIVO** verificável em uma frase (o que precisa ser verdade ao final).
- **CONTEXTO** só o necessário: IDs de decisão (DEC-###), caminhos dos arquivos a ler. Aponte, não cole histórico.
- **ENTREGÁVEL** com caminho exato do arquivo e o que não deve ser tocado (fronteiras do `docs/gestao/plano-execucao.md` §2; só o PM edita o board).
- **CRITÉRIOS DE ACEITE** que você consegue conferir (lista, comando, número de linhas, cenário).
- **LIMITES:** o que perguntar antes (dinheiro, conta, jurídico) e o que é proibido (CLAUDE.md §7).
- **RETORNO:** formato curto exigido, com riscos e decisões pendentes.
Escolha o agente e o modelo mais barato que dá conta (DEC-010: Sonnet na execução, Opus onde há risco). Uma tarefa = um objetivo; "arruma tudo" é brief ruim.

## 2. Paralelo ou sequencial
| Paralelize se | Sequencie se |
|---|---|
| Entregas independentes, arquivos diferentes, sem uma depender da saída da outra | Há contrato/decisão que um produz e o outro consome (ex.: OpenAPI antes do mobile) |
| Máximo 3 agentes ao mesmo tempo (DEC-010) | Dois agentes mexeriam no mesmo arquivo, lockfile ou `packages/shared` |
Dispare todos os paralelos na MESMA mensagem; um por mensagem vira fila. Depois integre: leia os retornos, procure edição conflitante, cruze entregas (o design cobre os critérios? a API serve as telas?).

## 3. Tratar o retorno
| Estado | Ação |
|---|---|
| Pronto | Vá à verificação (passo 4) |
| Pronto com ressalvas | Leia a ressalva primeiro; vira item de backlog ou RAID, nunca some |
| Faltou contexto | Responda objetivamente e reenvie; corrija seu briefing |
| Bloqueado | Remova o bloqueio (decisão sua) ou escale ao fundador com opções |

## 4. Verificar antes de aceitar
Regra: nenhum "pronto" sem evidência nova. Palavras como "deve funcionar", "provavelmente", "parece" = não verificado.
| Afirmação do agente | Evidência que vale |
|---|---|
| Documento criado | Você abriu o arquivo e cruzou com os critérios |
| Testes passam | Saída recente do comando (zero falhas), ou relatório do QA com data e commit |
| Bug corrigido | Reproduzir o sintoma original e ver sumir (QA) |
| Segurança ok | Parecer do `security-engineer`, não do dev |
| Feature aceita | Critérios Gherkin conferidos pelo PO + DoD (`definicao-de-pronto`) |
Duas passagens, nesta ordem: (a) fez o que foi pedido, nem mais nem menos? (b) está bem feito? Spot-check por amostragem em entregas grandes: agentes erram de forma sistemática.

## 5. Devolver e corrigir
- Feedback específico (arquivo, trecho, critério violado), ao mesmo agente. Você não conserta o que é dele (`ceo.md`).
- Máximo 2 rodadas; na terceira, mude o briefing, troque o agente/modelo ou arbitre e registre o porquê em `decisoes.md`.
- Conflito entre agentes: peça o argumento de cada um, decida, registre.

## 6. Sinais de alerta
Aceitar pelo resumo; briefing com histórico colado; paralelo com arquivo em comum; revisor avisado "ignore X"; correção sem reteste (R-19); trabalho não commitado ao atingir o limite de uso (R-04: marco pequeno, commit e push por marco).

## Fontes e licença
- obra/superpowers, skills `dispatching-parallel-agents`, `subagent-driven-development` e `verification-before-completion` (MIT, Copyright Jesse Vincent), consultadas em 2026-11-22. Adaptado: estrutura do briefing, regra de paralelismo, estados de retorno, duas passagens de revisão e tabela afirmação x evidência; removidos worktrees, ledger e scripts.
