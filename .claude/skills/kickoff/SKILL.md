---
name: kickoff
description: Inicia o projeto Webag do zero até o gate G2 (visão, descoberta, solução). Use uma vez, no começo, ou para reiniciar o planejamento.
disable-model-invocation: true
---

# /kickoff — do brief ao plano do MVP

Execute como CEO, nesta ordem. Pare ao fim de cada fase para o fundador aprovar antes de seguir.

## Fase 0 — Visão (G0)
1. Leia `docs/00-visao/brief.md`, `docs/decisoes.md` e `docs/arquitetura/adr/ADR-001-stack.md`. Procure o MVP HTML existente no repositório (Glob por `*.html`).
2. Liste o que falta no brief para decidir o MVP. Pergunte ao fundador **de uma vez só** (máx. 8 perguntas, as mais importantes primeiro, com sugestão de resposta quando possível).
3. Com as respostas, escreva `docs/00-visao/visao.md` (1 página): problema, público, proposta de valor, modelo de receita, North Star, objetivos de 6 meses, restrições, fora do escopo.
4. Peça aprovação → registre G0 em `docs/decisoes.md`.

## Fase 1 — Descoberta (G1)
Delegue em paralelo:
- `product-owner`: pesquisa de mercado e concorrência local, personas/JTBD, hipóteses e roteiro de entrevista com lojistas para o fundador aplicar, proposta de escopo do MVP (dentro/fora) e backlog inicial priorizado.
- `security-engineer`: inventário preliminar de dados pessoais e riscos/abusos principais do modelo (curto — 1 página).

Integre, critique, decida o escopo do MVP com o fundador → G1.

## Fase 2 — Solução (G2)
Delegue em paralelo:
- `product-designer`: fluxos do MVP, tokens iniciais, specs das telas principais e um protótipo HTML do fluxo de compra.
- `backend-dev`: confirmar/ajustar ADR-001, ADRs de ORM/hospedagem/OTP (com custo mensal), modelo de dados, OpenAPI inicial do MVP, setup do monorepo e CI.
- `mobile-dev`: revisar ADR-001 do lado mobile, propor estrutura do app e estratégia de navegação por papel (cliente/lojista).

Depois, em paralelo:
- `tech-lead`: revisar ADRs, modelo de dados e OpenAPI; garantir que back-end e mobile fecham entre si.
- `security-engineer`: threat model do MVP sobre os entregáveis acima.
- `project-manager`: plano de entrega até as lojas, sprints, dependências externas (contas, credenciais) e RAID.

Integre, resolva conflitos, apresente ao fundador: escopo, telas, arquitetura, custo mensal estimado, plano e riscos → G2.

Ao final, report no formato padrão do CEO.
