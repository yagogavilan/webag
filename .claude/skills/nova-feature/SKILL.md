---
name: nova-feature
description: Leva uma funcionalidade do pedido até estar pronta para a sprint (PRD, design, contrato de API, threat model, DoR). Use quando o fundador pedir uma funcionalidade nova.
argument-hint: <descrição da funcionalidade>
disable-model-invocation: true
---

# /nova-feature $ARGUMENTS

Execute como CEO:

1. **Triagem (você mesmo, sem delegar):** a funcionalidade serve ao objetivo atual? É MVP ou pode esperar? Se a resposta for "pode esperar", diga ao fundador com o custo de oportunidade e pergunte se segue mesmo assim.
2. **PRD:** delegue ao `product-owner` o PRD em `docs/produto/prd/<slug>.md` com histórias e critérios de aceite em Gherkin.
3. **Em paralelo, a partir do PRD:**
   - `product-designer`: fluxo + specs de tela com todos os estados.
   - `backend-dev`: alterações no OpenAPI e no modelo de dados (sem implementar ainda) + estimativa.
   - `security-engineer`: threat model **somente se** toca login, dados pessoais, pagamento, upload ou permissões.
4. **Consistência:** se houve mudança de contrato ou modelo de dados, `tech-lead` revisa. Confira que telas, contrato e critérios de aceite batem entre si. Devolva o que não bater.
5. `mobile-dev`: estimativa do lado do app a partir das specs.
6. `project-manager`: checar DoR, posicionar no backlog/sprint e atualizar o board.
7. Report curto ao fundador: o que será feito, esforço, riscos, decisões pendentes.
