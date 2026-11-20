# Documentação do Webag: índice

Os documentos em `docs/` são a memória do time (regras em `../CLAUDE.md`). Para rodar o projeto, comece pelo [`../README.md`](../README.md). Estado em 2026-11-20 (código congelado em `036e791`, DEC-083).

## Comece por aqui

| Documento | O que é |
|---|---|
| [`relatorio-final.md`](relatorio-final.md) | Relatório final do v1.0 para o fundador: o que foi construído, como rodar, o que depende dele, hipóteses, fase 2, o que não foi testado |
| [`status.md`](status.md) | Estado da missão, bugs abertos, números e lista única do que depende do fundador |
| [`decisoes.md`](decisoes.md) | Log de decisões (DEC-###) e hipóteses (HIP-###) |
| [`00-visao/brief.md`](00-visao/brief.md) | Brief do fundador: escopo, definição de pronto (§8) e atualizações (§9) |

## Por área

| Pasta | O que tem | Dono |
|---|---|---|
| [`produto/`](produto/) | Pesquisa, personas, PRDs (`prd/`), backlog, regras de negócio e textos legais propostos (`legal/`) | product-owner |
| [`design/`](design/) | Design system, fluxos, identidade, specs de tela (`telas/` desta pasta são as specs por onda) | product-designer |
| [`telas/`](telas/README.md) | Capturas de todas as telas do app, do lojista, do admin e do site (`pnpm telas`) | gerado por `scripts/capture-screens.mjs` |
| [`arquitetura/`](arquitetura/README.md) | ADRs, contrato OpenAPI, modelo de dados, revisões do tech-lead, dívida técnica, runbook de emergência | tech-lead e devs |
| [`qa/`](qa/) | Estratégia, planos, relatórios (`relatorios/`, parecer de G4 em `g4-final-tip.md`), bugs (`bugs/`), carga (`carga/`), retestes | qa-engineer |
| [`seguranca/`](seguranca/) | Threat models, revisões (parecer final em `revisoes/parecer-final-rc.md`), inventário para as lojas, runbook LGPD | security-engineer |
| [`deploy/`](deploy/) | [Guia de deploy](deploy/guia-deploy.md) e [checklist de publicação nas lojas](deploy/checklist-publicacao-lojas.md) | backend-dev / tech-lead |
| [`gestao/`](gestao/) | Plano de execução, board, [checklist da definição de pronto](gestao/checklist-dod.md), filas dos devs | project-manager |
| [`legal/`](legal/dependencias-npm.md) | Licenças das dependências (`pnpm licencas`) | |
| [`apresentacoes/`](apresentacoes/), [`prototipo/`](prototipo/), [`entrega-demo/`](entrega-demo/), [`time/`](time/instrucoes-do-projeto.md) | Material de apresentação, protótipos HTML antigos (só referência visual, DEC-004), pacote de demonstração, instruções do projeto | |
