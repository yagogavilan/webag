# Revisão de código da Onda 1 da API (identity, admin, payments, users) — tech-lead

- **Data:** 2026-11-18 | **Revisor:** tech-lead (independente; o autor é o backend-dev) | **Escopo:** `apps/api/src/modules/{identity,admin,payments,users}`, `platform/*`, migrações `0000`–`0002`, `packages/shared`, ADR-009. Fora de escopo: `apps/web`, `apps/mobile`.
- **Base:** `f30c6f2` (main). Leitura do código, não do resumo; um achado foi reproduzido com teste descartável (removido depois).

## Parecer: REPROVADO (restrito ao bloqueante B1; correção pequena)

A base é sólida: máquina de estados do pagamento só avança, webhook assinado e re-consultado, fila com `SKIP LOCKED`, refresh rotativo com janela, auditoria na mesma transação, guard "nega por padrão" com teste das rotas públicas. Há **um defeito de segurança verificado** que contradiz a premissa do SEC-091 e deixa um anônimo travar e invalidar a conta de qualquer admin. Corrigido B1, o parecer passa a APROVADO COM RESSALVAS (os itens "Importante" entram antes do G4 ou da Onda 4A, conforme indicado). O QA pode começar pelo módulo de pagamentos em paralelo; a parte de auth espera o B1.

## Verificado

| Verificação | Resultado |
|---|---|
| `pnpm --filter @webag/api --filter @webag/shared lint` | OK (0 erros) |
| `pnpm --filter @webag/api --filter @webag/shared typecheck` | OK |
| `pnpm --filter @webag/api test:unit` | 6 arquivos, 45 testes OK |
| `pnpm --filter @webag/api test:e2e` (Postgres 16 e Redis reais) | 9 arquivos, 117 OK, 1 ignorado |
| `pnpm --filter @webag/shared test` | 3 OK |
| `pnpm --filter @webag/api build` | OK |
| `pnpm generate:check` (cliente gerado x `openapi.yaml`) | Sem diferença |
| Teste descartável do B1 e do paralelismo (A1) | Reproduzidos; arquivo removido |

## Bloqueante

| # | Onde | Problema | Correção |
|---|---|---|---|
| B1 | `modules/identity/auth.service.ts:271-277` (`resetPassword`) | O TOTP do admin é conferido **antes** do código de e-mail (`codes.verify` só na linha 277) numa rota **pública**. Quem sabe só o e-mail de um admin envia `POST /v1/auth/password/reset` com um `newPassword` forte, código qualquer e `totpCode` errado. Cada erro soma em `verifyWithLimits` (SEC-091). **Reproduzido:** 5 chamadas anônimas → o login legítimo do admin com TOTP certo volta `429 MFA_RATE_LIMITED`; um segundo lote após a janela de 15 min → `passwordHash = null` e sessões revogadas (SEC-091c). É exatamente o DoS que o SEC-091 diz não existir ("só alcançável por quem já tem a senha"); com um único super admin, só sobra o break-glass (SEC-094, ainda não existe). | Conferir o **código de e-mail primeiro** (e só então o TOTP): sem código válido, o 2º fator nem é avaliado nem contado. Mesmo ajuste conceitual do SEC-095 (ticket em duas etapas, DT-018); a troca de ordem resolve já. Teste e2e: 10 `password/reset` anônimos com `totpCode` errado não alteram `mfa:15:*` nem a senha, e o login do admin segue funcionando. |

## Importante (antes do G4 ou da Onda 4A; não bloqueiam o QA da Onda 1)

| # | Onde | Problema | Correção sugerida |
|---|---|---|---|
| I1 | `identity/session.service.ts:135-190` (`refresh`) | O refresh de **admin** não confere inatividade e ainda zera `last_used_at` (linha 172). A regra de 30 min (WB-100 C3) só vale para o access token; um refresh roubado renova a sessão por até 30 dias. O teste atual só cobre o access. | No `refresh`, se o usuário tem `admin_profiles.active`, aplicar `admin_inatividade_min` sobre `session.lastUsedAt` (SESSION_IDLE) antes de rotacionar. Teste: sessão de admin 31 min parada → refresh → 401. |
| I2 | `payments.service.ts:170-185` (`receiveWebhook`) | A chave antirreplay entra no Redis (`SET NX`, 24 h) **antes** do `INSERT` em `webhook_events`. Se o insert falhar (banco fora, timeout), a resposta é 500, o provedor reenvia o mesmo `x-request-id` e cai em `queued:false`, 200: o evento se perde. A conciliação de 5 min cobre pendentes, mas não deveria ser a rede de segurança de uma falha simples. | Inserir primeiro (a unicidade `(provider, event_key)` já garante a idempotência) e deixar o Redis só como atalho; ou apagar a chave no `catch`. Teste: falha injetada no insert → reentrega processa. |
| I3 | `payments.service.ts:111-152` (`createPayment`) | Chama o provedor e **só depois** grava a tentativa. Falha de banco após a cobrança criada deixa um PIX/cartão no provedor sem linha local (o webhook cai em `unknown_payment`, descartado). O `attemptId` já é a chave de idempotência do provedor, mas ninguém o reaproveita. | Gravar a tentativa antes (`status='pending'`, `provider_payment_id` nulo ou "creating") e atualizar após a resposta; a conciliação repete a criação com o mesmo `attemptId`. Decidir agora porque a Onda 4A constrói o checkout em cima. |
| I4 | `payments.service.ts:326-357` (`refundInternal`) e `providers/fake.provider.ts:89` | (a) Chamada HTTP ao provedor **dentro** da transação com `FOR UPDATE`: segura a linha e a conexão durante a rede; se o commit falhar depois do estorno, o dinheiro saiu sem registro. (b) O `fake.refund` **ignora** a `idempotencyKey`, então nos testes a repetição estorna de novo e o teste "mesma chave não estorna de novo" só passa porque a checagem é local; o MP real deduplica, o fake não, e o comportamento diverge. (c) Mesma chave com valor diferente devolve silêncio (`return null`); o SEC-031 pede 422. (d) `refund()` audita depois da transação (`:317`): falha na auditoria deixa estorno sem trilha (SEC-074). | Registrar o estorno como `pending` na transação, chamar o provedor fora dela, depois confirmar; o fake guarda a chave no Redis e devolve o mesmo `providerRefundId`; comparar valor na repetição (422 se diferir); gravar a auditoria na mesma transação (`audit.record(tx, ...)`). |
| I5 | `payments.service.ts:365-406` (`reconcile`) | Um erro do provedor em **um** pagamento (`getPayment` lança) aborta o laço inteiro; `limit(200)` sem `ORDER BY` pode deixar sempre os mesmos de fora; sem trava entre instâncias (cada instância roda e chama o provedor). | `try/catch` por candidato com contagem de falhas e alerta se a taxa subir; `ORDER BY updated_at` ou `created_at`; `pg_try_advisory_lock` no início (barato, mesmo antes do worker separado, DT-015). |
| I6 | `payments.service.ts:167-190` | Todo `type` vira "olhe o pagamento `data.id`". O MP também envia `merchant_order` e outros; o `data.id` deles não é de pagamento e gera `unknown_payment` falso. O `type` vem da query (não assinada), mas ignorar é seguro. | Responder 200 e não enfileirar quando `type !== 'payment'` (ver [verificar] os tipos que o MP envia na Onda 4A). |
| I7 | `identity/totp.service.ts:182-214` (`resetFor`) | SEC-093 exige e-mail ao alvo **e aos outros super admins**; só o alvo é avisado. Links de reativação antigos continuam válidos se o reset for repetido (várias linhas em `invitations`). DT-018 não lista essa lacuna. | Avisar os demais super admins ativos; revogar convites de reativação anteriores do mesmo usuário na mesma transação. Incluir em DT-018. |
| I8 | `platform/config/env.ts:36` | `TRUST_PROXY` tem padrão 0 também em produção. Atrás do nginx, todo `req.ip` vira o IP do proxy: o limite "5 falhas por **conta+IP**" (SEC-004) passa a valer para o mundo inteiro, e qualquer um trava o login de qualquer e-mail por 15 min; auditoria e `access_log` gravam o IP do proxy. O README/DT-020 não cobrem. | Em produção, exigir `TRUST_PROXY` explícito (sem padrão) no `superRefine`, com teste em `env.spec.ts`. |
| I9 | Retenção (SEC-075) | Nenhum job apaga `access_log` (> 6 meses) nem sessões, refresh, códigos e `webhook_events` vencidos; `access_log` ganha uma linha por refresh. Sem registro em `divida-tecnica.md`. | Registrado como DT-021 (abaixo); entregar antes do G4. |
| I10 | ADR-009 #8 | `AUTH_HMAC_KEY` única deriva o HMAC dos códigos, a derivação do refresh **e** a chave do TOTP: um vazamento falsifica códigos e decifra todos os segredos TOTP. SEC-090 e SEC-080 pedem `MFA_ENC_KEY` própria com boot falhando sem ela. Aceitável na Onda 1, **não** no G4. | Já em DT-018; reforçar como bloqueante do G4 (Security decide). |

## Sugestões

| # | Onde | Observação |
|---|---|---|
| S1 | `auth.service.ts:148-158`, `totp.service.ts:103-113` | Padrão "olhar o contador, verificar, contar o erro" tem corrida: 20 logins paralelos com TOTP errado resultaram em 6 passando pelo limite de 5 (medido). O custo do Argon2 segura a vazão, mas o certo é `hit` primeiro e `reset`/decremento no sucesso. |
| S2 | `identity/identity.module.ts:31-32` | Os guards globais (`RateLimitGuard`, `AuthGuard`) são registrados dentro do `IdentityModule`: se o módulo sair do `AppModule`, a API passa a aceitar tudo. Mover para o `AppModule` ou um módulo de plataforma. O teste de rotas públicas pega a regressão, mas não a causa. |
| S3 | `identity/account.controller.ts` | Acesso direto ao `db` no controller (`profile`, `listSessions`, `revokeSession`, `update`); a skill pede controller → service. Mover para um `AccountService`. |
| S4 | `payments.service.ts:67-75` | `process.env.NODE_ENV === 'test'` lido direto; usar flag de configuração (`WORKERS_ENABLED`), que também prepara o `APP_ROLE=worker`. `onApplicationShutdown` deveria esperar `inflight` (`drain()`) antes de o pool fechar. |
| S5 | `payments/db/schema.ts` | Faltam `CHECK` no banco: `amount_cents > 0`, `application_fee_cents between 0 and amount_cents`, status e método (hoje só o tipo TS). SEC-039 fala em "lock de linha + constraint" para a soma de estornos: hoje só o lock. |
| S6 | `payments.service.ts:410-419` | Dedupe de alerta por `SELECT` + `INSERT` tem corrida (dois alertas iguais); índice único parcial em `(attempt_id, kind)` onde `resolved_at is null`, ou `ON CONFLICT`. |
| S7 | `payments/webhook-signature.ts` | SEC-032 pede o validador do SDK do MP; o código implementa o HMAC à mão (correto pela leitura). Antes do G4, testar contra um vetor oficial/sandbox do MP e registrar a hipótese do `ts` (já marcada). Registrado como DT-023. |
| S8 | `platform/mail/mail.service.ts` | Fila de e-mail só em memória: reinício perde "senha alterada" e alertas de MFA. Aceito pelo DT-004; ligar ao outbox da Onda 4A (DT-022). |
| S9 | `packages/shared/src/http/api-fetch.ts:24` | `JSON.parse` em corpo não JSON (502 HTML do proxy) lança `SyntaxError` em vez de erro tratável; sem timeout. Corrigir quando o mobile consumir. |
| S10 | `payments.dev.ts:27` | `GET /v1/dev/payments/:id` não confere dono (só dev). Lembrar que `getAttempt` não tem posse: a Onda 4A deve filtrar pelo pedido do usuário (SEC-020). |
| S11 | `identity/auth.service.ts:263-293` | Entre e-mail existente e inexistente, o reset ainda diferencia (422 de senha fraca só para conta existente; tempo). Como `email-exists` já é público por decisão (SEC-005), baixa prioridade; para o host admin vale igualar. |

## Coerência com `contrato-api` e padrões

| Ponto | Situação |
|---|---|
| Erros RFC 9457 com `code` estável | Conforme (`ProblemFilter`, `AppError`); 404 para recurso alheio em sessões e lojas |
| Paginação por cursor `{data, nextCursor}` | Conforme em alertas e auditoria; admins, regiões, categorias, parâmetros e flags devolvem `nextCursor: null` sem paginar (aceitável: conjuntos pequenos e limitados). `GET /admin/categories` acrescenta `icons` ao envelope: está no contrato (cliente gerado sem diferença) |
| `Idempotency-Key` | Não há endpoint de escrita repetível de cliente na Onda 1. A idempotência interna (webhook, estorno por chave) está correta, com as ressalvas I2 e I4. Falta decidir onde o escopo `usuário + hash do corpo` (ADR-007 §5) vive antes da Onda 4A |
| Dinheiro em centavos inteiros | Conforme (`integer`, validação, `Money` na saída) |
| Datas UTC `timestamptz` | Conforme |
| Autorização por recurso | Guard global, tabela única de permissões, `StorePermission` com 404 para não-membro; sessão de outro usuário 404 |
| Validação `strictObject` e DTO de saída explícito | Conforme (`presentAttempt`, lista de admins sem hash) |
| Camadas | `identity` ok exceto S3; módulos só por `index.ts` (FK por `db/schema.ts` permitido) |
| Logs (SEC-072) | `redact` cobre só `authorization`, `cookie`, `set-cookie`, `req.body`; sem máscara de e-mail/telefone em log de aplicação: parcial |

## Decisões do ADR-009

| # | Parecer |
|---|---|
| 1 refresh derivado por HMAC | Aceita. Determinismo é o preço do retry idempotente; depende do segredo, e a chave única agrava (I10) |
| 2 fila de webhook no Postgres | Aceita (SEC-032 atendido). Condicionada a I2 e I5; reavaliar na Onda 4A (DT-015) |
| 3 rate limit próprio | Aceita. Falha fechada em auth é a escolha certa; ver S1 |
| 4 sessão lida do banco | Aceita (DT-017) |
| 5 fake no Redis | Aceita; o fake precisa honrar a idempotência (I4b) |
| 6 assinatura no formato do MP | Aceita (S7) |
| 7 Zod local | Aceita com prazo: DT-014 "antes da Onda 2" |
| 8 chave única | Aceita só até o G4 (I10) |
| 9 login em uma chamada | Arquitetura aceita; diverge do SEC-090 normativo: o Security decide (DT-018) |
| 10 UUID v4 | Aceita |

## Testes que faltam

1. B1: reset anônimo com TOTP errado não afeta o 2º fator do admin (e e-mail certo + código errado também não).
2. I1: refresh de admin após inatividade.
3. I2: reentrega do webhook após falha de gravação.
4. I3/I4: falha do banco depois da criação ou do estorno no provedor; estorno com mesma chave e valor diferente; falha do provedor no estorno não grava linha.
5. Concorrência real em `processDue` (dois workers, mesmo evento, um efeito) e em `refresh` paralelo com token já usado fora da janela.
6. I5: `getPayment` lançando no meio da conciliação; cartão com 3DS (`pending_3ds` → aprovado) pelo caminho do webhook (a criação é testada, a transição não).
7. Boot de produção sem `TRUST_PROXY` (I8) e com `PAYMENT_PROVIDER=mercadopago` e `TEST-` (parcialmente em `production-boot`).
8. Vetor de assinatura publicado pelo MP (S7).

## Defeitos triviais corrigidos por mim

Nenhum (lint limpo; sem problema de nome ou import).

## Lista para o backend-dev (ordem)

1. **B1** (bloqueante) + teste. 2. I1, I2, I8 (pequenos). 3. I7. 4. I3, I4, I5, I6 antes de a Onda 4A começar o checkout. 5. S1 a S6. Dívida nova registrada: DT-021 a DT-023 em `docs/arquitetura/divida-tecnica.md`.
