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
| B1 + endurecimento da Onda 1, DT-018 e back-end da Onda 2 (lojista, aprovação, catálogo) | backend-dev | Retomado após limite de uso |
| Web do admin, Onda 1A (shell, login, regiões e categorias já commitados) | mobile-dev | Retomado após limite de uso |
| App do cliente: base, cadastro, login, endereço | mobile-dev | Retomado após limite de uso |

Concluídos: design system e tokens; 44 + 40 telas especificadas; PRDs e backlog (144 histórias); threat model e SEC-001 a 096; plano de 16 sub-ondas; planos de teste (337 casos); back-end da Onda 1 (117 testes de integração, OpenAPI 57 operações), revisado pelo tech-lead (reprovado por 1 bloqueante, B1, em correção). Decisões DEC-001 a DEC-027.
Incidentes: 1 reinício do container e 2 limites de uso de 5 h (06:50 e 11:50 UTC). O que estava commitado sobreviveu.

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
