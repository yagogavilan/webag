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
| SEC-113 (veto), contrato 2 passos, endurecimento Onda 1, Onda 2B (loja, catálogo, seed) | backend-dev | Retomado após limite de uso |
| SEC-114/115 no web (BFF e login em 2 passos) | mobile-dev | Retomado |
| Área do lojista: onboarding, fila de aprovação, configuração da loja | mobile-dev | Retomado |

Concluídos: design system e tokens; 84 telas especificadas; PRDs e backlog (144 histórias); threat model e SEC-001 a 123; planos de teste (337 casos); Onda 1: back-end (117 testes de integração), web do admin 1A, base do app do cliente (cadastro, login, endereço); Onda 2A: API de lojas e aprovação, onboarding do lojista no web. **Onda 1 com veto do Security (DEC-029): fecha quando SEC-113 e SEC-114 forem corrigidos e reverificados.** Decisões DEC-001 a DEC-029.
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
