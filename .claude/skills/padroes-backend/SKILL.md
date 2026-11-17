---
name: padroes-backend
description: Padrões de engenharia do back-end Webag (NestJS, PostgreSQL/PostGIS, Redis, Mercado Pago PIX, WebSocket, testes, CI). Use ao projetar ou implementar qualquer parte da API.
---

# Arquitetura
- **Monólito modular** NestJS em `apps/api/src/modules/<dominio>` (auth, users, stores, catalog, cart, orders, payments, delivery, notifications, admin). Módulos se falam por serviços/eventos internos, nunca acessando a tabela do outro diretamente.
- Camadas por módulo: `controller` (HTTP, DTO) → `service` (regra de negócio) → `repository` (acesso a dados). Regra de negócio não fica no controller.
- Configuração via `@nestjs/config` com validação de schema no boot; app não sobe com env inválida.
- TypeScript `strict: true`. Sem `any` sem justificativa em comentário.

# Dados
- PostgreSQL + PostGIS. Localização em `geography(Point, 4326)`, índice GiST, busca com `ST_DWithin`.
- ORM definido em ADR (proposta: Prisma; consultas geográficas via SQL tipado).
- Migrations versionadas e reversíveis quando possível; seed para dev/staging.
- Dinheiro em **centavos (integer)**. Datas em UTC (`timestamptz`); conversão para America/Sao_Paulo só na apresentação.
- IDs públicos não sequenciais (UUID v7 ou similar). Soft delete onde houver exigência de histórico.

# Pedidos e pagamentos
- Máquina de estados do pedido explícita e validada no servidor; toda transição gera registro de histórico (quem, quando, de/para).
- Mercado Pago PIX: criar pagamento com `X-Idempotency-Key`; webhook valida assinatura (`x-signature`), consulta o pagamento na API do MP antes de confiar no payload, é idempotente por ID e processa via fila (BullMQ). Job de reconciliação para pagamentos pendentes.
- Estorno e cancelamento com regras do PRD e trilha de auditoria.
- Nunca tocar em dados de cartão.

# Tempo real e filas
- Socket.IO gateway autenticado (JWT no handshake), salas por pedido/loja; o cliente sempre consegue recuperar o estado via REST se perder eventos.
- Redis: cache com TTL explícito, rate limit, filas BullMQ com retry exponencial e dead-letter.

# Auth
- Login por telefone + OTP (provedor em ADR) e/ou e-mail. Access token curto (≈15 min) + refresh token rotativo armazenado com hash e revogável.
- Autorização por recurso em todo endpoint (o pedido pertence ao usuário? a loja pertence ao lojista?). Papéis: customer, merchant, admin.

# Qualidade
- Testes: Jest unitário para serviços/regras; e2e com supertest e banco real em container (Testcontainers ou docker compose).
- Logs estruturados (pino) com `requestId`; nunca logar token, senha, CPF completo ou payload de pagamento. Sentry para erros.
- Health checks (`/health`), graceful shutdown.
- CI (GitHub Actions): install → lint → typecheck → test → build; bloqueia merge se falhar.
- Docker para dev local (Postgres+PostGIS, Redis) via `docker compose`.
