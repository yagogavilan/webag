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
| Onda 3 back-end: endereços, descoberta PostGIS, home, loja/produto, busca, favoritos, sacola e contrato de pedido | backend-dev | Em andamento |
| Web do catálogo do lojista + moderação no admin (2B) | mobile-dev | Em andamento |
| Revisão independente da Onda 2 e adendo da Onda 1 | tech-lead | Em andamento |

Concluídos: design system e tokens; 84 telas especificadas; PRDs e backlog (144 histórias); threat model e SEC-001 a 129; planos de teste (337 casos). **Onda 1 fechada** (Security: aprovado com ressalvas, veto DEC-029 retirado). **Onda 2**: API de lojas, aprovação e documentos privados; API de catálogo (variações, estoque, promoção, importação CSV, moderação) e configuração da loja; seed com 7 lojas e 42 produtos de Francisco Morato e Franco da Rocha; web do lojista (onboarding, configuração, equipe) e fila de aprovação do admin. Base do app do cliente (cadastro, login, endereço). Decisões DEC-001 a DEC-029.
Incidentes: 1 reinício do container e 3 limites de uso de 5 h (06:50, 11:50 e 16:50 UTC). O que estava commitado sobreviveu em todos.

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
