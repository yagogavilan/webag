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
| Concluir esqueleto do monorepo e fechar ADRs (Onda 0) | tech-lead | Em andamento |
| Threat model de autenticação e pagamento | security-engineer | Em andamento |
| Specs de tela das ondas 2 a 4 | product-designer | Em andamento |

Concluídos: design system e tokens, PRDs e backlog (134 histórias), plano de 16 sub-ondas com board e RAID (`docs/gestao/plano-execucao.md`). Um reinício do container derrubou 3 agentes; o que estava commitado sobreviveu e o trabalho foi redisparado.

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
