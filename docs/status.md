# Status da missão v1.0 — Webag

> Atualizado pelo CEO a cada etapa. Última atualização: 2026-11-18.

## Onde estamos
G0–G3 aprovados pelo fundador (DEC-002). Fase atual: **Fundação** (pesquisa, design system, PRD, arquitetura, threat model).

## Feito
- Design: pesquisa, identidade (petróleo #00696F, Figtree, Phosphor), design system, tokens e 4 fluxos em `docs/design/` e `packages/tokens/`. Pendência: web estava bloqueada para HIG/Material/Baymard; fontes marcadas [M]/[S], validar em aparelho real antes do G4.
- Briefing oficial salvo (`docs/00-visao/brief.md`) e decisões DEC-001 a DEC-010 registradas.

## Rodando agora
| Tarefa | Dono | Status |
|---|---|---|
| Fila do tech-lead + Onda 4A/4B/4C back-end (comissão, ledger, PIX/cartão, Mercado Pago, pedido, tempo real) | backend-dev | Em andamento |
| QA da Onda 2 contra a API real (cadastrar/aprovar loja, moderação, regressão I1-I4) | qa-engineer | Em andamento |
| App do cliente: início, loja, produto, busca, favoritos, sacola | mobile-dev | Em andamento |

Concluídos: design e 84 telas; PRDs (144 histórias); SEC-001 a 129; planos de teste (337 casos). **Onda 1 fechada** (Security e tech-lead: aprovado com ressalvas). **Onda 2** pronta (API e web: aprovação de lojas, documentos, catálogo, configuração, moderação, seed); revisão do tech-lead aprovada com ressalvas; QA em andamento. **Onda 3 back-end pronta**: endereços, descoberta PostGIS, home, busca com filtros, loja e produto públicos, favoritos, sacola e contrato de pedido. Decisões DEC-001 a DEC-030.
Incidentes: 1 reinício do container e 4 limites de uso de 5 h (06:50, 11:50, 16:50 e 18:10 UTC); o que estava commitado sobreviveu.

## Falta (plano de fases)
1. Fundação (acima)
2. API: auth, catálogo, lojas/geo, carrinho/pedido, pagamentos (simulado + Mercado Pago), trocas, financeiro, admin
3. Web (lojista + admin) e app mobile (cliente)
4. Seed realista, docker compose, CI
5. Revisão final (funcional, Nielsen, usabilidade, carga), capturas em `docs/telas/`
6. Deploy guide, checklist das lojas, README, tag `v1.0.0`

## Depende do fundador (lista viva)
- Conta Mercado Pago (Access Token, Public Key, Client ID/Secret para OAuth, segredo do webhook)
- Conta Apple Developer e Google Play Console (publicação)
- Domínio e servidor (deploy)
- Revisão das hipóteses em `docs/decisoes.md`
