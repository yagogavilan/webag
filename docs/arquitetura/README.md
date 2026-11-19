# Arquitetura do Webag: índice

Fonte para quem vai manter, auditar ou estender o sistema. Dono: `tech-lead`. Atualizado em 2026-11-19 (Onda 7).

## Visão em 10 linhas

Monólito modular NestJS (`apps/api`) com PostgreSQL + PostGIS, Redis e armazenamento S3 (RustFS no dev e no servidor próprio, R2/S3 se o fundador preferir). Painéis do lojista e do admin e o site público no Next.js (`apps/web`, com BFF: o navegador nunca vê o token). App do cliente em Expo (`apps/mobile`). Contrato único em OpenAPI; tipos e cliente gerados para `packages/shared`; design tokens em `packages/tokens`. Pagamento atrás de uma interface (`PaymentProvider`): `fake` em desenvolvimento, Mercado Pago em produção, trocados só por variável de ambiente. Tempo real por Socket.IO (`/rt`), sempre com recuperação do estado por REST. Detalhes de cada decisão nos ADRs abaixo.

## Contrato da API

| Documento | O que é |
|---|---|
| [`api/openapi.yaml`](api/openapi.yaml) | **Fonte da verdade** (OpenAPI 3.1). Contrato muda antes do código; `pnpm generate` regera `packages/shared`, `pnpm generate:check` falha se estiver desatualizado. Em execução: `/docs` da API |
| [`pendencias-contrato-mobile.md`](pendencias-contrato-mobile.md), [`-web-admin.md`](pendencias-contrato-web-admin.md), [`-web-lojista.md`](pendencias-contrato-web-lojista.md) | Pedidos de cada frontend ao back-end que ainda não viraram contrato |

## Decisões de arquitetura (ADRs)

| ADR | Decisão | Quando ler |
|---|---|---|
| [001](adr/ADR-001-stack.md) | Stack de referência final da 1.0 (versões, desvios da proposta inicial) | Antes de atualizar qualquer dependência |
| [002](adr/ADR-002-pagamentos-marketplace.md) | Pagamento do marketplace: split por OAuth do lojista no Mercado Pago, `PaymentProvider`, webhook, estorno | Antes de mexer em dinheiro |
| [003](adr/ADR-003-autenticacao-sessao.md) | Autenticação, sessão, papéis, TOTP do admin, BFF | Antes de mexer em login ou permissão |
| [004](adr/ADR-004-tempo-real.md) | Socket.IO, salas, ticket de uso único, fallback por REST | Notificação ao vivo |
| [005](adr/ADR-005-armazenamento-imagens.md) | Buckets público e privado, URL pré-assinada, WebP sem EXIF | Foto, documento, CDN |
| [006](adr/ADR-006-estrategia-testes.md) | Pirâmide de testes, E2E com banco real, CI | Antes de escrever teste novo |
| [007](adr/ADR-007-modulos-api.md) | Módulos da API, regra "um módulo só importa o `index.ts` do outro", pipeline do contrato | Antes de criar módulo |
| [008](adr/ADR-008-geolocalizacao-postgis.md) | `geography(Point,4326)`, GiST, raio de entrega, busca por proximidade | Busca e frete |
| [009](adr/ADR-009-identidade-pagamentos-base-onda1.md) | Escolhas da Onda 1 (identidade, parâmetros, pagamento base) | Contexto histórico |
| [010](adr/ADR-010-descoberta-sacola-checkout-onda3.md) | Descoberta, sacola no servidor, contrato do checkout | Carrinho e checkout |
| [011](adr/ADR-011-trocas-tempo-real-notificacoes.md) | Trocas, tempo real e notificações (push e e-mail) | Trocas, push |
| [012](adr/ADR-012-privacidade-lgpd-onda6.md) | Exclusão de conta, exportação, pedidos de titular, retenção | LGPD |

Modelo: [`adr/ADR-000-template.md`](adr/ADR-000-template.md). Toda decisão de arquitetura relevante vira ADR (CLAUDE.md, regra 4). Decisões de produto e de processo ficam em [`../decisoes.md`](../decisoes.md) (DEC-###).

## Dados

| Documento | O que é |
|---|---|
| [`modelo-dados.md`](modelo-dados.md) | Tabelas por módulo, regras que o banco garante e **mapa das migrações 0000 a 0042**. A verdade é `apps/api/src/modules/*/db/schema.ts` e `apps/api/drizzle/*.sql` |
| [`runbook-break-glass.md`](runbook-break-glass.md) | Recuperar o acesso de admin quando todos perderam o segundo fator |

## Revisões de código (Tech Lead)

| Documento | Escopo | Parecer |
|---|---|---|
| [`reviews/review-onda0-api.md`](reviews/review-onda0-api.md) | Esqueleto da API | Ver o arquivo |
| [`reviews/review-onda1-api.md`](reviews/review-onda1-api.md) | Identidade, configuração, pagamento base | Ver o arquivo |
| [`reviews/review-onda2-api.md`](reviews/review-onda2-api.md) | Lojas e catálogo | Ver o arquivo |
| [`reviews/review-ondas-3-5.md`](reviews/review-ondas-3-5.md) | Descoberta, pedido, pagamento, ledger, logística, trocas, tempo real | Com ressalvas (achados tratados nas ondas seguintes) |

Revisões de segurança ficam em [`../seguranca/`](../seguranca/) e de QA em [`../qa/`](../qa/).

## Dívida técnica

[`divida-tecnica.md`](divida-tecnica.md): item, impacto, custo de pagar e gatilho. É lida a cada gate; item "Aberta" com gatilho vencido bloqueia o gate seguinte.

## Para rodar, entregar e operar

| Preciso de | Vá para |
|---|---|
| Subir o projeto do zero | [`../../README.md`](../../README.md); relatório de validação em [`../qa/relatorios/setup-do-zero.md`](../qa/relatorios/setup-do-zero.md) |
| Colocar em produção, backup, rotação de segredos | [`../deploy/guia-deploy.md`](../deploy/guia-deploy.md) |
| Publicar nas lojas | [`../deploy/checklist-publicacao-lojas.md`](../deploy/checklist-publicacao-lojas.md) |
| Licenças de terceiros | [`../../THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) e [`../legal/dependencias-npm.md`](../legal/dependencias-npm.md) |
| Carga e desempenho | [`../qa/plano-carga.md`](../qa/plano-carga.md) |
| Regras de negócio e máquina de estados do pedido | [`../produto/regras-de-negocio.md`](../produto/regras-de-negocio.md) |

## Regras que não mudam

Dinheiro em centavos (`integer`). Datas em UTC, conversão para Brasília só na tela. Máquina de estados do pedido validada no servidor, com histórico de toda transição. Webhook de pagamento assinado, idempotente e conferido no provedor antes de confiar. Nenhum dado de cartão toca o servidor. Autorização por recurso em todo endpoint (404 para recurso de outro usuário). Segredos só em variável de ambiente; o boot de produção recusa valores de desenvolvimento.
