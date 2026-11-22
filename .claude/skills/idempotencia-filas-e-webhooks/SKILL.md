---
name: idempotencia-filas-e-webhooks
description: Padrões de idempotência (Idempotency-Key e webhooks), filas BullMQ com retry e dead-letter, assinatura do webhook do Mercado Pago, razão contábil append-only e controle de concorrência no Webag. Use ao tocar em pagamento, estorno, repasse, jobs, webhooks ou qualquer escrita que o cliente ou o provedor possa repetir.
---

# Premissa
Tudo que chega pode chegar duas vezes, fora de ordem ou nunca. O sistema precisa dar o **mesmo resultado** na repetição. Reaproveite as estruturas existentes (`docs/arquitetura/modelo-dados.md`): `idempotency_keys`, `webhook_events`, `payment_refund_intents`, `ledger_transactions/entries`, `payment_alerts`; implementação de referência em `apps/api/src/modules/payments`.

# 1. Idempotência da API (cliente repete por rede ruim)
- Escritas repetíveis (criar pedido, pagar, estornar, cadastrar produto) aceitam `Idempotency-Key`. Registro em `idempotency_keys`: escopo (usuário + rota), chave, **hash do corpo**, resposta guardada, validade 24 h.
- Mesma chave + mesmo corpo: devolve a resposta guardada. Mesma chave + corpo diferente: erro `IDEMPOTENCY_KEY_REUSED`. Em andamento: `IDEMPOTENCY_IN_PROGRESS` (códigos já usados em `modules/idempotency`).
- Reserva da chave e efeito de negócio na **mesma transação**; `unique` no banco decide a corrida, não um `SELECT` antes.

# 2. Webhook do Mercado Pago (ADR-002)
Ordem: **verificar -> persistir -> enfileirar -> responder 2xx**; processar depois.
1. Validar `x-signature` (HMAC-SHA256 sobre `id`, `x-request-id` e `ts`, com o segredo do webhook) com o validador do SDK oficial, sobre o corpo/parâmetros crus; comparar em tempo constante; rejeitar `ts` fora da tolerância (hoje 300 s; ver `payments/webhook-signature.ts`) [conferir formato vigente na doc do MP]. Inválido: 401, sem processar, sem enfileirar.
2. Gravar em `webhook_events` com `unique(provider, event_key)` via `ON CONFLICT DO NOTHING`; duplicado responde 200 sem reprocessar.
3. Responder 200 rápido (poucos segundos); nada de trabalho pesado na requisição.
4. No job: **buscar o pagamento na API do MP** (não confiar no payload) e aplicar a transição pela máquina de estados: repetida ou regressiva é ignorada, divergência de valor/loja gera `payment_alerts`.
Códigos: 2xx = não repete; 4xx = erro do remetente (sem retry útil); 5xx = o provedor reenvia: use só para falha real nossa. Reconciliação periódica cobre webhook perdido.

# 3. Filas BullMQ 6 (processo `worker`, `APP_ROLE=worker`, ADR-007)
| Item | Regra |
|---|---|
| Payload | Só IDs e versão, nunca segredo, token nem dado pessoal completo; carregar o estado do banco no job |
| `jobId` | Determinístico (ex.: `refund:<intentId>`) para não enfileirar duas vezes |
| Retry | `attempts` + backoff **exponencial com jitter**; erro permanente (4xx de negócio) não repete |
| Dead-letter | Esgotou: marcar `failed`/mover para fila `<nome>-dead`, gravar `payment_alerts` e avisar no painel; **nunca descartar em silêncio** |
| Retenção | `removeOnComplete`/`removeOnFail` com limite de idade/quantidade (Redis é memória) |
| Concorrência | `concurrency` explícita e limite de taxa para respeitar o provedor |
| Job travado (stalled) | Handler idempotente: pode rodar de novo no meio |
| Encerramento | Graceful shutdown espera jobs em andamento antes de fechar pool e Redis |
Efeito pós-commit: evento de domínio -> job (sem outbox na 1.0: DT-004; o risco é commit sem enfileirar, coberto por reconciliação/varredura de pendentes).

# 4. Chamada a provedor com estado seguro
Gravar a **intenção** antes (ex.: `payment_refund_intents`), com `lease` (`in_flight_until`) de quem está chamando; chamar o provedor **fora da transação** com `X-Idempotency-Key` próprio; gravar o resultado; falha incerta (timeout) é "desconhecido", resolvida por consulta/reconciliação, nunca por nova cobrança às cegas.

# 5. Ledger (razão contábil)
Partidas dobradas e **append-only** (SEC-041): corrigir = lançar o inverso, nunca `UPDATE`/`DELETE`. Cada transação tem `dedupe_key` única (ex.: `order:<id>:commission`), então repetir o job não duplica. Soma de débitos = soma de créditos por transação (verificada no teste e no banco). Dinheiro em centavos inteiros. Saldos e repasses derivam do razão.

# 6. Concorrência
Estado do pedido muda com `UPDATE ... WHERE status = <esperado>` (0 linhas = perdeu a corrida) ou lock de linha; locks em ordem fixa; `unique` parcial para "só uma ação aberta". Advisory lock só para tarefas únicas (conciliação), com conexão dedicada.

# Testes obrigatórios
Webhook idêntico 2x (um efeito só); fora de ordem (aprovado antes de pendente); assinatura inválida e `ts` velho; mesma `Idempotency-Key` em paralelo (`Promise.all`); job que cai no meio e reexecuta; estouro de tentativas gera alerta; soma do ledger fecha.

## Fontes e licença
- hookdeck/webhook-skills, skill `webhook-handler-patterns` (MIT, LICENSE conferido: Hookdeck 2026), consultada em 2026-11-22. Adaptado: ordem verificar-parsear-tratar, checklist de idempotência e códigos de resposta. Os arquivos de detalhe (retry, ordering, DLQ) não foram lidos. Descartada a promoção do gateway comercial do fornecedor (custo e dependência).
- Padrões de BullMQ, ledger e concorrência: documentação do BullMQ e conhecimento geral; estruturas e IDs de decisão vêm do repositório Webag.
