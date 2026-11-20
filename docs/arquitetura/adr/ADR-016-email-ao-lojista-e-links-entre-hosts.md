# ADR-016: E-mail de pedido ao lojista (B2) e URLs por host

- **Status:** Aceita com correção pendente (revisada pelo tech-lead em 2026-11-19, ver `reviews/onda-8.md`, achado A-01)
- **Data:** 2026-11-19
- **Autor:** tech-lead (registra o B2 implementado na DEC-073/074 e a regra de links entre hosts da DEC-057)
- **Revisores:** security-engineer (SEC-106, SEC-116, SEC-172), product-owner (WB-192)
- **Custo mensal:** nenhum além do provedor de e-mail já previsto

## Contexto
Sem o painel aberto, o lojista não vê pedido novo e o pedido vence por falta de aceite (loja_aceite_timeout_min). Web Push é fase 2 (DEC-071), então o canal do v1.0 é e-mail. Por outro lado, o painel está separado por host (SEC-116): `/admin` só no `ADMIN_HOST`, `/lojista` só no `LOJISTA_HOST`, páginas públicas só no `PUBLIC_HOST`; qualquer link que a API manda por e-mail precisa apontar para o host certo da área.

## Decisão
| # | Decisão | Onde |
|---|---|---|
| 1 | **E-mail de pedido novo pago e de lembrete de aceite** ao dono e à equipe com a permissão `orders`. Conteúdo mínimo: número, entrega ou retirada, até 5 itens, "aceite até HH:MM" e o link do pedido no painel. NADA do cliente (nome, endereço, telefone) e nenhum valor em R$ | `notifications/domain/catalog.ts` `storeOrderEmail` |
| 2 | **Dedupe por reivindicação atômica no banco** (`orders.store_notified_at` para o aviso novo; `accept_reminded_at` para o lembrete), idempotente entre instâncias; só envia se o pedido ainda estiver em `received` | `notifications.service.ts` `emailStoreAboutOrder`, migração 0052 |
| 3 | **Liga/desliga por loja só do CANAL e-mail** (`store_settings.notify_new_order_email`, só o dono, auditado); o alerta no painel e o som nunca desligam (DEC-074a) | `store-settings.service.ts` |
| 4 | **Cada área tem a sua URL base na API**: `ADMIN_WEB_URL` (convites e links do admin), `LOJISTA_WEB_URL` (convites e links do lojista) e `WEB_PUBLIC_URL` (páginas públicas e `/pagar/cartao`); em produção cada uma é `https://<host da área>` e o boot recusa valor de desenvolvimento (SEC-172) | `platform/config/env.ts`, `infra/docker-compose.prod.yml` |

## Consequências
- Positivas: o aviso crítico não depende de serviço novo; o e-mail não vaza dado de cliente nem preço a funcionário sem permissão de valores.
- **Defeito encontrado na revisão (A-01):** a decisão 4 ainda não está no código. `notifications.service.ts:69` (link do pedido, B2) e `stores/team.service.ts:72` (convite de funcionário) montam links `/lojista/...` com `ADMIN_WEB_URL`, que em produção é o host do admin, onde `/lojista` responde 404 (`apps/web/proxy.ts:143`). Em produção o link do e-mail B2 e o do convite de funcionário não abrem. Correção: variável `LOJISTA_WEB_URL` (obrigatória e validada como as outras), usada nos dois lugares, no compose, no `env.example`, no guia de deploy e em um teste que fixa o host de cada tipo de link.
- Dívida assumida: o e-mail sai pela fila em memória do `MailService` (DT-022): reinício no meio da retentativa perde o aviso; o reivindicar-antes-de-enviar torna o aviso "no máximo uma vez". O lembrete não sai se `loja_aceite_lembrete_min` >= `loja_aceite_timeout_min` (falta validação cruzada de parâmetros).
- Rever se: Web Push do painel (fase 2) entrar, ou a perda de pedido por timeout aparecer no piloto (mover o aviso para o DT-004, outbox).
