---
name: observabilidade-e-resiliencia
description: Logs estruturados com correlação, métricas, alertas com runbook, timeouts, retry, circuit breaker, degradação e health checks para a API e o worker do Webag. Use ao integrar serviço externo (Mercado Pago, SMTP, S3, geocodificador), instrumentar uma feature, criar alerta/runbook ou investigar incidente em produção.
---

# O que já existe (reaproveite, não reinvente)
`nestjs-pino` com `requestId` (reaproveita `x-request-id` válido ou gera; devolve no header) e `redact` de credenciais; máscaras de PII/coordenadas (`platform/logging/mask.ts`, `platform/http/pii-mask.ts`); Sentry por DSN (`platform/observability/sentry.ts`); `/health` (liveness) e `/health/ready` (PostgreSQL + migrações + Redis) via terminus; catálogo de alertas em `payment_alerts` (`modules/admin/alert-catalog.ts`).

# Logs
- JSON, **evento com nome estável** (`payment.webhook.received`) + campos (`orderId`, `paymentId`, `durationMs`), não frase interpolada. Níveis: `error` = alguém age; `warn` = tendência; `info` = evento de negócio; `debug` desligado em produção.
- **Correlação:** `requestId` na requisição, no job (campo no payload do BullMQ), em toda chamada de saída (header) e no Sentry. Job herda o `requestId` de quem enfileirou e marca `origem` (api, worker, cron, replay).
- **Nunca logar:** token, senha, OTP, CPF completo, e-mail/telefone completos, posição exata, corpo de pagamento. Use lista permitida de campos, não o objeto inteiro; novo campo sensível entra no `redact`/máscara com teste.

# Métricas (o que medir)
| Camada | Sinais (RED/USE) |
|---|---|
| HTTP | Taxa, erros (5xx por rota), duração em **histograma** (p50/p95/p99, não média) |
| Fila BullMQ | Profundidade, **idade do job mais antigo**, falhas, itens em dead-letter |
| Banco/pool | Conexões em uso/espera, consultas lentas (`pg_stat_statements`) |
| Provedor | Latência e erro do Mercado Pago, SMTP, S3 |
| Negócio | Pedidos criados x pagos x aceitos; webhooks recebidos x processados; pagamentos pendentes há mais de N min |
Rótulos com cardinalidade **limitada** (rota por template, classe de status, provedor); nunca ID de usuário, URL crua ou texto de erro. Ferramenta de métricas/tracing (OpenTelemetry/Prometheus) e custo são decisão de ADR com aval do fundador [HIPÓTESE: começar só com logs + Sentry + painel de alertas].

# Resiliência em chamadas externas
1. **Timeout em toda chamada** (conexão e total); sem timeout padrão infinito. Valores iniciais [HIPÓTESE, calibrar por métrica]: provedor de pagamento ~8 s (como já usado na conciliação), e-mail/S3 ~10 s.
2. **Retry** só de operação idempotente (com chave) ou de leitura; backoff exponencial **com jitter**; orçamento total (tentativas x timeout) menor que o prazo da requisição. Em job, o retry é do BullMQ.
3. **Circuit breaker** por dependência: abre após N falhas na janela, responde rápido com erro/degradação, meia-abertura testa recuperação; estado visível em métrica e alerta. Biblioteca (ex.: `opossum`) entra por ADR, pois é dependência nova.
4. **Isolamento (bulkhead):** limite de concorrência por provedor, para um lento não consumir todo o pool de conexões e threads.
5. **Degradar com honestidade:** geocodificador fora = endereço manual (ADR-015); PIX indisponível = mensagem clara e `code` estável; push/e-mail fora = fila com retry, sem derrubar pedido. Pagamento incerto nunca vira "pago" nem "falhou" no chute: fica pendente e a conciliação resolve.

# Health checks
- **Liveness** (`/health`): só "o processo responde"; não consulta dependência (senão o orquestrador reinicia à toa).
- **Readiness** (`/health/ready`): banco, migrações e Redis. **Provedor externo (Mercado Pago) não derruba a readiness**: degrada via breaker.
- Graceful shutdown: parar de aceitar tráfego, concluir jobs em andamento, fechar pool e Redis.

# Alertas e runbooks
- Alerte **sintoma do usuário** (taxa de 5xx, p99 alto, pedido pago sem confirmação, fila velha, dead-letter > 0), não causa (CPU, reinício isolado). Duas severidades: **página** (age agora) e **ticket** (esta semana). Reuse `critical/warning/info` do catálogo.
- Todo alerta aponta para `docs/runbooks/<alerta>.md`: **o que significa, primeira checagem (consulta/painel/log exato), mitigação, escalonamento, como confirmar que voltou**. Atualize o runbook após cada incidente.
- Sem custo de plantão 24 h hoje: defina com o fundador o que realmente acorda alguém [HIPÓTESE].

# Verificação antes de entregar
- [ ] Induzi a falha em staging (provedor fora, Redis fora, job travado) e a achei só pelos sinais
- [ ] Requisição rastreável ponta a ponta pelo `requestId`, inclusive no job
- [ ] Nenhum segredo/PII na saída de log (teste de máscara)
- [ ] Todo `fetch`/SDK externo com timeout; retry só onde idempotente
- [ ] Alerta novo tem runbook e foi disparado de teste

## Fontes e licença
- addyosmani/agent-skills, skill `observability-and-instrumentation` (MIT, LICENSE conferido: Addy Osmani 2025), consultada em 2026-11-22. Adaptado: logs estruturados e correlação, RED/USE, rótulos limitados, alertas por sintoma e formato de runbook, verificação por falha induzida; a fonte não cobre health checks nem circuit breaker: essas seções vêm de conhecimento geral e do código do Webag (`apps/api/src/health`, `app.module.ts`).
