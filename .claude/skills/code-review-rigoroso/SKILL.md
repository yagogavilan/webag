---
name: code-review-rigoroso
description: Método de code review do Tech Lead do Webag, com níveis de severidade, o que bloqueia, ordem de leitura do diff e comentário acionável. Use ao revisar o diff de uma história antes do QA, ao re-revisar após correções ou quando um dev contestar um apontamento.
---

# Code review rigoroso (diff real, severidade honesta)

## Antes de abrir o código
1. Leia a história e os critérios de aceite (`docs/produto/prd/`), não o resumo do dev. Revisar sem saber o que era para fazer só acha estilo.
2. Defina o intervalo: `git log` e `git diff <base>...HEAD`. Revise **o que mudou**, mais um salto nos chamadores de tudo que for alterado.
3. Tamanho: ~100 linhas é fácil, ~300 aceitável para uma mudança lógica, ~1000 devolva para dividir. Refatoração misturada com feature: peça para separar.

## Ordem de leitura
1. **Testes primeiro:** mostram a intenção. O teste falharia se a regra quebrasse? (Inverta mentalmente uma condição ou compare com o valor esperado; teste que só confere "não lançou erro" não protege nada.)
2. **Regra de negócio e erro:** centavos (`integer`), `timestamptz` UTC, transação no service que orquestra, idempotência (`Idempotency-Key`), transição válida da máquina de estados, corrida em estoque (`FOR UPDATE`), webhook idempotente.
3. **Fronteiras:** import só via `<modulo>/index.ts` (ADR-007), sem tabela alheia, sem regra no controller. Ver skill `limites-de-modulo-e-acoplamento`.
4. **Contrato:** `openapi.yaml` atualizado, `pnpm generate:check` sem diff, tipos vindos de `@webag/shared`, sem tipo escrito à mão espelhando a API.
5. **Segurança óbvia:** autorização por recurso, DTO de saída explícito, nada sensível em log. O profundo vai para o `security-engineer`.
6. **Legibilidade:** só o que o lint não pega (nome que mente, função que faz três coisas, duplicação real).

## Severidade (um rótulo por comentário)
| Rótulo | Quando | Efeito |
|---|---|---|
| **Bloqueante** | Perde dinheiro/dado, estado inconsistente, autorização ausente, quebra contrato publicado, teste que não prova nada na regra crítica | REPROVADO; corrige antes do QA |
| **Importante** | Bug em caminho raro, teste de erro faltando, acoplamento que vai doer | Corrige nesta história ou vira DT com dono e gatilho |
| **Ajuste** | Melhora clara e barata | Pode ir junto ou na próxima |
| **Nit** | Gosto/estilo | Opcional; se o lint resolve, não comente |
| **Verificar** | Suspeita sem prova | Diga o que checar; não afirme |
Veredito: **APROVADO** = nenhum Bloqueante/Importante aberto. Melhora real do código que segue o padrão do projeto se aprova, mesmo que você escrevesse diferente.

## Comentário acionável
`arquivo:linha | rótulo | problema (o que acontece e para quem) | correção sugerida`. Exemplo: `orders.service.ts:88 | Bloqueante | estoque lido fora da transação: dois pedidos levam a última unidade | ler com FOR UPDATE dentro de @Transactional()`. Sem "acho que", sem pergunta retórica, sem elogio de cortesia.

## Re-revisão e contestação
- Verifique cada correção no novo diff; não confie em "corrigido". Rode de novo o que falhou antes.
- Dev discorda: avalie o argumento e o código. Se ele provou que o apontamento está errado, retire por escrito. Se for decisão de arquitetura, escale ao CEO com as duas posições.
- Padrão repetido em vários PRs vira regra de lint ou item da skill, não comentário recorrente.

## Dívida e saída
Registre o que ficou para depois em `docs/arquitetura/divida-tecnica.md` (skill `divida-tecnica-e-refatoracao`) e o parecer no formato do agente, com a linha "Verificado" preenchida por evidência (skill `verificacao-antes-de-concluir`).

## Fontes e licença
- obra/superpowers, skills `requesting-code-review` e `receiving-code-review` (MIT, Jesse Vincent), consultadas em 2026-11-22. Adaptado: severidade, bloqueio e regra de verificar antes de aceitar crítica.
- addyosmani/agent-skills, skill `code-review-and-quality` (MIT, Addy Osmani), consultada em 2026-11-22. Adaptado: tamanho de mudança, "testes primeiro" e critério de aprovar melhoria real.
- Checklist e exemplos escritos para o Webag (ADR-006, ADR-007). Nenhum script ou comando externo foi trazido; `anthropics` code-review não foi consultado.
