---
name: sprint
description: Executa uma sprint do Webag — planning, implementação, QA, review e retro. Use para tocar o desenvolvimento das histórias prontas.
argument-hint: [planejar | executar | fechar]
disable-model-invocation: true
---

# /sprint $ARGUMENTS

Se nenhum argumento for passado, descubra a fase atual pelo `docs/gestao/board.md`.

## planejar
1. `project-manager`: propor a sprint (meta, histórias que passam na DoR, capacidade do fundador para revisões/testes, dependências) em `docs/gestao/sprints/sprint-NN.md`.
2. Você revisa: a meta é clara e entregável? Corte o que não cabe. Fundador aprova.

## executar
Para cada história, na ordem do board:
1. `backend-dev` implementa API + testes (se houver parte de back-end).
2. `mobile-dev` implementa telas + testes, consumindo o contrato.
   (Se back e mobile não dependem um do outro na história, delegue em paralelo.)
3. `tech-lead` faz o code review. Reprovado volta para o dev com os bloqueantes; só segue quando aprovado.
4. `security-engineer` revisa **somente** histórias sensíveis (pode rodar em paralelo com o QA).
5. `qa-engineer` testa contra os critérios de aceite e registra bugs.
6. Bug Crítico/Alto volta para o dev antes da próxima história.
7. `project-manager` atualiza o board ao fim de cada história (uma linha por item — sem relatório longo).

## fechar
1. `product-owner`: aceite das histórias contra os critérios.
2. `project-manager`: review (feito x planejado) e retro (máx. 3 ações) no arquivo da sprint.
3. Report ao fundador, incluindo o roteiro curto de teste em aparelho que o QA pedir.
