# ADR-014: Operação do admin: modo manutenção, caixa de alertas, usuários e pedidos

- **Status:** Aceita (revisada pelo tech-lead em 2026-11-19, ver `reviews/onda-8.md`; segurança: `docs/seguranca/revisoes/onda-8-dec-073.md`)
- **Data:** 2026-11-19
- **Autor:** tech-lead (registra o que backend-dev implementou nas DEC-070 a DEC-074: WB-121, B3, B4, B5)
- **Revisores:** security-engineer (SEC-181 a SEC-185), product-owner (escopo mínimo, DEC-071)
- **Custo mensal:** nenhum

## Contexto
O piloto precisa de quatro capacidades da operação sem painel de terceiros: parar as vendas com um clique, ver tudo o que pede um humano, achar e bloquear uma conta e achar e agir sobre um pedido. As quatro mexem em dado pessoal ou em dinheiro; a regra de privilégio mínimo (RN-13) e a LGPD precisam estar no servidor, não na tela.

## Decisão
| # | Decisão | Motivo | Onde |
|---|---|---|---|
| 1 | **Modo manutenção = uma linha** (`maintenance_state`, `id = 1` por `CHECK`) lida a cada criação de pedido. Bloqueia SÓ o pedido novo e a intenção de cartão (503 `MAINTENANCE`, `Retry-After`); leitura, sacola, pedido em andamento, pagar o que já existe, webhooks e admin seguem. Ligar: só super admin, com motivo, auditado. Endpoint público `GET /v1/config/maintenance` com cache de 15 s | Parar a plataforma não pode derrubar o dinheiro que já está em voo; sem Redis (uma leitura por pedido novo é barata e é a verdade) | `admin/maintenance.service.ts`, migração 0051 |
| 2 | **`payment_alerts` é a caixa de entrada única** de alertas (a tabela nasceu na conciliação). O significado vem de UM catálogo em código (`admin/alert-catalog.ts`: rótulo, gravidade, área, o que fazer, quem vê). RBAC por TIPO no servidor: a contagem e o detalhe de um tipo que o perfil não vê respondem como se não existissem (404); tipo desconhecido = "Outro alerta" só do super admin. Teste lê o código e falha se um tipo gravado não estiver no catálogo | Um alerta novo nunca fica invisível nem vaza para o perfil errado; sem tabela nova | `backoffice/alerts.service.ts`, migração 0053 (`resolved_by`, `resolution_note`) |
| 3 | **Alertas carregam só identificadores** (ids de pedido, loja, corrida, troca; valores em centavos), nunca dado pessoal do cliente. Regra para quem criar alerta novo | `details` sai inteiro na API | `payments.raiseAlert` |
| 4 | **Usuários no admin: mascarado por padrão e a busca NUNCA desfaz o mascaramento** (SEC-181): ID e e-mail só por valor inteiro, celular só completo (10 ou 11 dígitos), só o NOME aceita trecho (3+). Cada busca é auditada (tipo, HMAC do termo, no de resultados) e limitada por admin. Conta de admin responde 404 aqui. "Revelar" é fase 2 | O suporte não pode virar oráculo de e-mail e celular | `backoffice/accounts.service.ts` |
| 5 | **Bloquear** (super admin e operação, motivo >= 10 caracteres): derruba as sessões, a loja aprovada do dono é suspensa (cada uma com auditoria própria e texto NEUTRO ao lojista, SEC-183), pedido em andamento NÃO é cancelado, desbloquear NÃO reativa a loja. O motivo é nota interna (`user_status_history`, retenção `retencao_bloqueio_anos`, SEC-185). Conta bloqueada pode pedir a exclusão e o arrependimento restaura o status ANTERIOR (SEC-182) | Bloqueio é ato reversível e auditável; exclusão não pode furá-lo | `accounts.service.ts`, migrações 0053 e 0054 |
| 6 | **Pedidos no admin**: lista e detalhe com cliente mascarado e endereço só até bairro, cidade e UF; comissão, tarifa e líquido da loja só com `commissions:read` (SEC-184). Cancelar e estornar são as rotas que já existiam (`orders:refund`: financeiro e super admin, reautenticação, motivo e `Idempotency-Key`); o detalhe devolve `allowedActions` por perfil e o saldo estornável | O painel não decide permissão; mostra o que o servidor permite | `orders/admin-orders-read.service.ts` |

## Consequências
- Positivas: três controles reaproveitam o que existia (alertas, auditoria, estorno); privilégio por tipo/permissão no servidor; nenhuma tabela de fila nova.
- Dívida assumida: **DT-074** (`payment_alerts` com nome de domínio estreito para a caixa geral; renomear quando houver motivo), **DT-075** (busca de pedidos por número usa `ilike '%q%'` sem índice trigram e a busca por e-mail exato em `GET /admin/orders` não é auditada nem limitada por admin como a de usuários), **DT-076** (e-mail ao admin por alerta, WB-198 C1 a C3, é fase 2: a caixa só funciona se alguém abrir o painel).
- Rever se: houver mais de ~50 mil contas ou pedidos (trigram), ou um segundo operador precisar de "Revelar" (desenhar com motivo e auditoria antes).
