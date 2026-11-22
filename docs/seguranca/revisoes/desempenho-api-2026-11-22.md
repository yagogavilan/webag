# Revisão diferencial de segurança: desempenho da API (2026-11-22)

- **Revisor:** security-engineer. **Data:** 2026-11-22. **Branch:** `claude/admiring-lamport-62tq1a`.
- **Escopo pedido:** `git diff cfdc83b 27ec5e2 -- apps/api infra docs/deploy` (commits `bad4e83`, `624cbb7`, `ed862ba`, `df3521f`, `27ec5e2`). Como os caches em memória que o pedido manda revisar estão no próprio `cfdc83b`, ele também foi lido (`git diff cfdc83b^ cfdc83b`).
- **Relatório do autor:** `docs/qa/performance/api-2026-11-22.md` §6 e §10.
- **Skills:** `revisao-diferencial-de-mudancas`, `analise-de-variantes`, `defaults-inseguros-e-armadilhas-de-api`, `checklist-seguranca`.

## Veredito

> **Atualização 2026-11-22 (Re-revisão, ao final):** SEC-199, SEC-202 e SEC-203 corrigidos. **Veto levantado com condições** (DEC-115). SEC-200 e SEC-201 seguem abertos como dívida com prazo no G4 do v1.1. Novo: SEC-204 (Baixa).
>
> **Atualização 2026-11-22 (Re-revisão 2, ao final):** SEC-201 e SEC-204 **corrigidos**. Veto ao merge **levantado sem condição de Security** (DEC-115). Única pendência de Security para deploy de produção: SEC-200 (Média), corrigir ou fundador aceitar. Novo: SEC-205 (Baixa, só com 2+ réplicas).

**REPROVADO, com veto ao merge e ao deploy desta mudança enquanto SEC-199 (Alta) estiver aberto.** A correção é pequena: ver a correção mínima no achado. O resto foi aprovado com ressalvas. A autenticação em uma consulta manteve todas as checagens, `Cache-Control` ficou mais restrito do que antes, os caches não guardam dado pessoal e o checkout continua recalculando tudo na hora. O webhook não ganhou janela de replay.

| Severidade | Achados | Bloqueia |
|---|---|---|
| Alta | SEC-199 | Sim |
| Média | SEC-200 (pré-existente, ampliado pelo guia §14.5) | Não |
| Baixa | SEC-201, SEC-202, SEC-203 (re-revisões: SEC-204, SEC-205) | Não |

## Achados

```
SEC-199 | Severidade: Alta | Status: Corrigido (8d861f9; ver Re-revisão)
Onde: apps/api/src/platform/config/env.ts:75 (padrão 30 s) e platform/database/database.module.ts:45 (`idle_in_transaction_session_timeout` no pool);
      payments.service.ts:805-811 (conciliação segura `lockTx` parada enquanto concilia no pool), exchanges.service.ts:563-575 (trava + createPayment no MP),
      stores/payment-account.service.ts:167-174 (trava + refresh OAuth no MP); database.module.ts:35 (pool sem listener de 'error').
Problema: o commit 624cbb7 passou a encerrar no Postgres qualquer transação parada por mais de 30 s. Três fluxos mantêm uma transação aberta e parada de propósito enquanto
  chamam o Mercado Pago, e nem o pool nem o client têm listener de 'error'. Quando o Postgres encerra a conexão retirada do pool, o `pg.Client` emite 'error'
  sem ninguém ouvindo e o PROCESSO DA API CAI. Reproduzido localmente com o pg 8.23.1 e o drizzle 0.45.4 do repositório: 'Unhandled error event', 25P03, exit 1.
Cenário de ataque/falha: não precisa de atacante. A cada 5 min, `reconcile()` (payments.service.ts:141) pega a trava e concilia até 200 pagamentos (aprovados em 48 h e
  pendentes), cada um com uma consulta ao MP (timeout de 8 s com retentativas). Uns 100 pagamentos no piloto, ou o MP lento por alguns segundos, já passam de 30 s.
  Aos 30 s a API inteira cai (todas as requisições em andamento falham e os 1.000 sockets do Socket.IO caem juntos) e o Docker a reinicia. Isso se repete a cada ciclo.
  A conciliação nunca termina, então a proteção de SEC-042 (recuperar webhook perdido: cliente pagou e o pedido ficou parado) para de funcionar. Com mais de uma réplica
  (ADR-017), a trava morta aos 30 s deixa duas réplicas conciliarem ao mesmo tempo. No refresh OAuth, se a conexão cair depois que o MP girou o token e antes do UPDATE,
  o token novo se perde e a loja precisa reconectar a conta de recebimento.
  Agravante (pré-existente): sem `pool.on('error')`, reiniciar o Postgres (o guia §14.1 manda fazer isso para aplicar os PG_*) também derruba a API pela conexão ociosa.
Correção recomendada (backend-dev):
  1. Mínima, desbloqueia o merge: (a) `pool.on('error', log)` e `pool.on('connect', (c) => c.on('error', log))`, nunca derrubar o processo; e
     (b) `await tx.execute(sql`set local idle_in_transaction_session_timeout = 0`)` logo depois de pegar a trava, nos 3 fluxos (o SET LOCAL foi testado aqui e a transação sobrevive).
     Alternativa temporária: padrão `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=0` até (b) entrar.
  2. Estrutural (na onda): trocar a "transação parada como trava" da conciliação por lease em linha (o padrão de SEC-141) ou por `pg_try_advisory_lock` de sessão
     em conexão dedicada e liberada no `finally`. Regra de review: nada de chamada externa dentro de `db.transaction`.
Como verificar a correção: e2e com `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=1000` e provedor fake atrasando 2 s em `getPayment`: `reconcile()` termina, o processo continua vivo
  e uma 2ª chamada concorrente volta `skipped: true`. Unit test: `pg_terminate_backend` de uma conexão ociosa do pool não derruba o processo.
```

```
SEC-200 | Severidade: Média | Status: Aberto (pré-existente; o guia §14.5 o subestima)
Onde: infra/nginx/templates/default.conf.template:51-52 (`limit_conn webag_conn 50` por IP vale também para /socket.io), 00-global.conf.template:14;
      apps/api/src/platform/ratelimit/rate-limit.guard.ts:35,50-58 (TODAS as regras da API usam a chave `rl:<nome>:<ip>`, inclusive em rota autenticada).
Problema: o guia §14.5 aponta o `limit_req 30r/s` do nginx como o risco de CGNAT, mas os limites que travam primeiro são outros: (1) `limit_conn 50` por IP, porque cada
  socket do app (telas de pedido, pagamento, troca e a aba de pedidos) prende 1 conexão por até 1 h, então o 51º cliente atrás do mesmo IP leva 429 em TUDO;
  (2) na API, só por IP: global 600/min (10 req/s), `refresh` 30/min, `order-create` 30/h, `coupon-apply` 30/h, `register` 20/h, `discovery` 120/min.
Cenário: horário de pico, operadora móvel com N clientes do Webag no mesmo IP público [HIPÓTESE: a proporção real é desconhecida; medir no piloto]. Pedidos e a
  renovação de sessão recebem 429: venda perdida e cliente deslogado. Quem abusa não é contido melhor por isso, porque os limites finos de login, OTP e cadastro já
  combinam conta e IP (SEC-004, SEC-063).
Correção recomendada:
  - nginx (backend-dev): zona `limit_conn` própria para `/socket.io/` com teto mais alto e, no resto da API, a sugestão do guia (60r/s, burst 120, conn 100),
    que do ponto de vista de segurança é aceitável: o nginx é proteção grossa contra inundação.
  - API (backend-dev): em rota autenticada, chave principal por `userId` (com o IP como teto mais alto, por exemplo 5x), sobretudo `refresh` (por sessão),
    `order-create` e `coupon-apply`. Rota pública continua por IP.
  - Medição (PM e tech-lead): contar 429 por rota (incluir `n429` no `http.latency`) e calibrar com o piloto antes de mexer nos números.
  - Autor do guia: corrigir o §14.5 para citar `limit_conn` e os limites da API.
Como verificar: carga com 100 clientes do mesmo IP (60 com socket aberto) navegando e 20 criando pedido em 1 h: 0 respostas 429. Um único IP fazendo 600 req/min
  sem login continua levando 429.
```

```
SEC-201 | Severidade: Baixa | Status: Corrigido (07e2278 + d1be18e; ver Re-revisão 2). Resíduo com 2+ réplicas: SEC-205
Onde: discovery.service.ts (offerPool 60 s + cache Redis da home 30 s), store-feed.service.ts (catálogo 15 s + feed Redis 30 s), browse.service.ts (base de loja/produto e vitrine 10 s).
Problema: depois que a moderação remove um produto ou a loja é suspensa, a vitrine continua mostrando o conteúdo por um tempo. Produto removido segue na seção "Ofertas"
  da home por até ~90 s (60 + 30). Loja suspensa: o `ST_DWithin` por posição é feito na hora e já filtra `status = 'approved'` (store-feed.service.ts, consulta `near`),
  então ela some em até 30 s, como antes; a página da loja e a do produto ficam em até 10 s. Conta de recebimento ou cidade desativadas: até 15 + 30 s.
  Oferta vencida dentro da janela: o cartão aparece com o preço cheio (`effectivePrice` é calculado na hora, product-feed.service.ts:128), sem desconto falso.
  Não há impacto financeiro: o checkout lê tudo do banco na hora (cart.service.ts:177 e 419 para loja visível, :195 e :426 para produto à venda,
  :224 para STORE_UNAVAILABLE; orders.service.ts:289 converte em erro). Nenhum serviço de pedido ou sacola usa os caches (`grep` dos consumidores).
Cenário: conteúdo ilegal removido pela moderação continua exposto por até 90 s. Isso afeta a reputação, não o dinheiro.
Correção recomendada: PO aceita a janela e registra em docs/decisoes.md, ou backend-dev chama `clear()` dos caches locais e `cache.invalidate('home'|'feed')` ao
  suspender a loja ou remover o produto (com mais de uma réplica, via pub/sub do Redis; ADR-017).
Como verificar: e2e com TTL > 0 (hoje os caches estão desligados no e2e): suspender a loja deixa a sacola em STORE_UNAVAILABLE na hora, e a página da loja dá 404 em até 10 s.
```

```
SEC-202 | Severidade: Baixa | Status: Corrigido (d4f1968; ver Re-revisão)
Onde: infra/docker-compose.prod.yml (comando do postgres, `log_min_duration_statement=1000`).
Problema: no PostgreSQL 13 ou mais novo, `log_parameter_max_length` vale -1 por padrão. Toda consulta lenta vai para o log do contêiner COM os parâmetros
  (e-mail no login, termo de busca, lat/lng da descoberta, telefone).
Cenário: quem tem acesso aos logs do servidor (ou a um backup deles) lê dado pessoal sem passar pela trilha de auditoria. A rotação de 50 MB limita o volume, mas não evita a exposição.
Correção recomendada (backend-dev): adicionar `-c log_parameter_max_length=0` (o `..._on_error` já é 0 por padrão).
Como verificar: `select pg_sleep(1.1), $1` com o parâmetro 'x@y.com' não deixa `parameters:` no `prod.sh logs postgres`.
```

```
SEC-203 | Severidade: Baixa | Status: Corrigido no item (1) (8d861f9); item (2), calibração do teto, segue como recomendação. Ver Re-revisão
Onde: env.ts:73 e 75 (`min(0)`: 0 significa "sem teto"), database.module.ts:37-45.
Problema: (1) armadilha de configuração: um `DB_STATEMENT_TIMEOUT_MS=0` por engano (ou copiado de outro ambiente) volta a deixar consulta sem teto, sem aviso.
  (2) 30 s é um teto generoso para o caminho HTTP com pool de 10: 10 requisições lentas e simultâneas seguram o pool por 30 s, e todos os outros recebem 500
  depois de 3 s (`connectionTimeoutMillis`). Os limites por IP reduzem o risco, mas uma botnet passa por eles.
Correção recomendada (backend-dev): em `APP_ENV=production`, recusar 0 no boot (como já é feito com `API_DOCS_ENABLED`). Calibrar o teto HTTP com o `pg_stat_statements`
  [HIPÓTESE: 10 s], com `SET LOCAL statement_timeout` maior só nos jobs (exportação LGPD, relatórios DT-056). Monitorar falhas por timeout na exportação e na
  anonimização (direito do titular).
Como verificar: boot com `APP_ENV=production` e `DB_STATEMENT_TIMEOUT_MS=0` falha. A exportação de dados de um titular grande termina.
```

## Regressões verificadas (o que foi removido ou trocado)

| Item do pedido | Resultado | Evidência |
|---|---|---|
| (1) Auth em 1 consulta | **Sem perda de checagem.** Continuam lá: sessão revogada, expiração absoluta, `status !== 'active'` (cobre `blocked`, SEC-182, e `deleted`; os status são só estes três, schema.ts:18), admin inativo sem perfil, `mfaVerified`/`mfaFactor` (SEC-168/176), `totpConfigured`/`totpReenrollRequired`, `reauthAt` (step-up), papéis. A rotação de refresh e o limite de inatividade do admin (auth.guard.ts:64-71) continuam usando os mesmos campos. Papéis: `user_roles.role` é `text` e o pg devolve `text[]` como array JS, não como string (schema.ts:87). Datas: o mesmo `new Date(string)` que o drizzle já fazia. `password_hash` e `totp_secret_enc` deixaram de ser lidos em toda requisição | principal.service.ts:43-53 contra `git show cfdc83b:…principal.service.ts`. Raio: auth.guard.ts:59 (toda rota autenticada), realtime.gateway.ts:80 e 103 (handshake e ticket), card-intent.service.ts:102. E2E existentes: bloqueado dá 401 no access (auth.e2e-spec.ts:160-166); logout dá 401 na hora (:180) |
| (1) Variantes de `select *` | Leituras completas de `users` e `admin_profiles` ficaram só onde a senha ou o TOTP são necessários (login, TOTP, gestão de admin). `/v1/me` lê a linha inteira, mas responde com DTO explícito | auth.service.ts, totp.service.ts, account.controller.ts:31-48 |
| (2) Caches | Chaves sem dado pessoal (`storeId`, `productId`, `mode`, `'offers'`, `'best'`, cursor/limite). Os valores vêm de dado público e o mesmo objeto não é alterado depois de cacheado (procurei sort/push/splice em `store()`/`product()`). As coordenadas só aparecem nas chaves Redis `home` e `feed`, que já existiam (o app arredonda para 4 casas, revisão do app de 2026-11-22). O single-flight só guarda a promessa enquanto ela roda. O tamanho é limitado (500, 1000, 1000, 4, 2 entradas). Defasagem e checkout: SEC-201 | local-cache.ts, browse.service.ts, discovery.service.ts, store-feed.service.ts |
| (3) `Cache-Control` | O padrão `private, no-store` é **mais restritivo** do que antes (não havia padrão). `public` ficou em 9 rotas, nenhuma com `lat/lng`, pedido ou perfil: regiões, categorias, flags, manutenção, textos legais, banners (`cityId`), vitrine da loja e avaliações. Loja e produto com posição: `private, max-age=30`. Rotas `@Public` não leem o token (auth.guard.ts:50), então a resposta não depende de quem pede. Não precisa de `Vary`. O ETag (padrão do Express) não muda nada com `no-store`. BREACH: a compressão não mudou (o guia só a documenta). O app usa Bearer, sem cookie, então não há como medir o tamanho de forma cruzada | app.setup.ts:35, admin.controllers.ts:91-261, browse.controller.ts, banners.controller.ts:36 |
| (4) Logs | `http.latency` usa o modelo da rota, sem id, query ou usuário (latency.ts:27-31; o spec cobre). O teto de 300 rotas impede explosão de cardinalidade. O log de acesso mantém `maskCoordinates`/`maskTokenPaths` e o `redact`. O nginx loga sem query string e mascara tokens no caminho (00-global.conf.template:28-38). O registro de acesso do Marco Civil é separado (retention.service.ts:25) | app.module.ts:67-97 |
| (5) Pool/timeouts | `statement_timeout` é ganho de segurança. A migração usa pool próprio, sem timeouts (migrate.ts:11). Ressalvas: SEC-199 e SEC-203 | database.module.ts:35-45 |
| (6) Migração 0057 | Só índice parcial em `reviews`; nenhum dado nem permissão muda | 0057_perf_reviews_store_published_idx.sql |
| (7) Webhook "vencido" | **Sem janela nova de replay.** Assinatura (`verifyWebhook`), antirreplay de 24 h no Redis, unicidade `(provider, event_key)` com `onConflictDoNothing`, re-consulta ao MP (SEC-034) e `FOR UPDATE SKIP LOCKED` continuam como estavam. Só mudou o relógio da comparação. Observação, sem achado: o lease (`nextAttemptAt = Date.now()+60 s`) usa o relógio da API e o vencimento usa o do banco. No mesmo host isso não faz diferença; com banco gerenciado, usar `now() + interval '60 seconds'` evita que uma diferença de relógio de mais de 60 s gere processamento duplo (que o `sync` idempotente absorveria) | payments.service.ts:342-366 e 386-401 |
| (8) Compose/env | O Postgres continua sem `ports` (só o nginx publica 80/443, compose:309-311). `PG_*` não são segredos e o `.env.prod.example` não tem credencial real. A API não fica exposta (`expose`, compose:232-233), então `headersTimeout` de 66 s não abre slowloris. `pg_stat_statements` guarda o texto normalizado ($n) e só o usuário do banco o lê. Ressalva: SEC-202 | docker-compose.prod.yml:39-75, env.prod.example:43-50 |
| (9) CGNAT | Ver SEC-200 | |
| (10) Socket.IO | Nenhum arquivo de `modules/realtime` mudou. A autorização por sala segue igual; o handshake usa `principal.load` com a mesma semântica | `git diff --stat cfdc83b^ 27ec5e2 -- apps/api/src/modules/realtime` vazio |

**Buscas de variantes sem resultado:** chamada externa dentro de `db.transaction` além das 3 de SEC-199 (`presignedGetUrl` em admin-stores.service.ts:89 assina localmente, sem rede). Uso dos caches em sacola ou pedido: nenhum. Listener de `uncaughtException`: nenhum (por isso SEC-199 derruba o processo).

## Testes de segurança que faltam

1. SEC-199: e2e de conciliação com timeout curto e provedor lento, e unit test de queda de conexão do pool (descritos no achado).
2. Auth no caminho do access token (hoje só há no refresh): sessão com `absolute_expires_at` vencido dá 401; admin parado além de `admin_inatividade_min` dá `SESSION_IDLE` num GET; `admin_profiles.active=false` dá 403 em rota de admin; usuário `customer+merchant` passa em `@Roles('merchant')`. Unit test de `load()` com datas em string e fuso `-03`.
3. `Cache-Control`: `/v1/me`, `/v1/orders` e a sacola respondem `private, no-store` (inclusive 4xx); `/v1/categories` responde `public`; `/v1/home?lat=` responde `private`.
4. Caches com TTL > 0 (o e2e roda com eles desligados): loja suspensa e produto removido bloqueiam a sacola na hora (SEC-201).
5. Calibração de CGNAT (SEC-200) no piloto, com 429 contado por rota.

## Limites desta revisão

Análise estática do diff e das dependências diretas, mais um experimento local (pg + drizzle contra PostgreSQL 16) para confirmar SEC-199. Não rodei e2e nem carga, não testei o nginx, e produção usa PostgreSQL 18. Não fiz pentest. O custo dos limites por IP com CGNAT depende de dado real de operadora, que não tenho ([HIPÓTESE]).

---

## Re-revisão (2026-11-22)

- **Escopo:** `8d861f9` (antes de `2103c50`, lido com `git show`) e `git diff 2103c50..HEAD -- apps/api infra docker-compose*.yml docs/arquitetura` (`f8e85b1`, `eb9b936`, `d4f1968`, `25b9931`; 20 arquivos). Também li `docs/deploy/guia-deploy.md` §14.5 e as DEC-105 e DEC-113. Não li: os PRDs e o design do `2103c50` (são só documentos de produto).
- **Execução (PostgreSQL 16 e Redis locais; produção usa PG 18):**
  - e2e `db-idle-timeout`, `cache-control` e `payments`: 36 de 36 verdes. e2e `discovery-cache`, `principal` e `exchanges`: 37 de 37 verdes. Unitários `platform/cache`, `platform/config` e `platform/observability`: 61 de 61 verdes.
  - **Mutação** (cópia descartável do código, fora do repositório): sem os dois listeners de `error` do pool, 2 testes do `db-idle-timeout` ficam vermelhos (`uncaughtException` capturado). Com a conciliação de volta ao `pg_try_advisory_xact_lock` dentro de `db.transaction`, 1 teste fica vermelho: a conciliação concorrente **não** volta `skipped`, ou seja, duas rodariam juntas. Os testes provam o controle; não estão verdes por acaso.
  - SEC-202 conferido no PG 16 com `\bind`: com `log_parameter_max_length=0` o log não tem `DETAIL: parameters:`; com -1, tem.
  - **Não rodei:** a suíte e2e completa (a DEC-105 pede 2 execuções verdes ao QA), carga, nginx, PG 18 e PgBouncer.

### Status dos achados

| ID | Status | Evidência |
|---|---|---|
| SEC-199 (Alta) | **Fechado** | (a) Queda do processo: `database.module.ts:127` (`pool.on('error')`, conexão ociosa) e `:128-129` (`client.on('error')` posto no `connect`; o pg-pool tira o listener dele durante o empréstimo). Teste: `db-idle-timeout.e2e-spec.ts`, "transação esquecida..." e "conexão ociosa do pool terminada...", vermelhos sem o fix. (b) Transação ociosa como trava: `SessionLockService.tryRun` (`database.module.ts:43-67`) usa `pg_try_advisory_lock` de sessão em conexão dedicada **fora de transação**, com `pg_advisory_unlock` antes de devolver a conexão e `release(true)` se a conexão caiu ou o unlock falhou. Usos: conciliação (`payments.service.ts:810`, com `lock.lost()` interrompendo o laço em `:841`) e pagamento de troca (`exchanges.service.ts:566-588`; a checagem de dono `userId` continua em `:567`). Teste: "a conciliação com provedor lento..." (3 x 1,2 s com timeout de 1 s): termina, a 2ª chamada volta `skipped` e `pg_locks` fica sem trava ao final. (c) Refresh OAuth (`payment-account.service.ts:167-176`): continua com transação durante 1 chamada ao MP, mas com `timeout: 8_000, maxRetries: 0` (`:128`) e o novo padrão de 60 s (`env.ts:80`). Fica dentro da margem e está registrado em DT-085. Ver SEC-204 |
| SEC-200 (Média) | **Aberto** | `infra/nginx` sem mudança (`git diff --stat` vazio); `rate-limit.guard.ts` sem mudança. O guia §14.5 (`guia-deploy.md:589`) já cita `limit_conn 50`, mas propõe 100 sem zona própria para `/socket.io/` e não cita os limites por IP da API (`refresh`, `order-create`, `coupon-apply`). `n429` não entrou no `http.latency` |
| SEC-201 (Baixa) | **Aberto** (a DEC-113 decidiu: TTL aceito para mudança comercial; **invalidação em até 5 s obrigatória** para moderação, suspensão e desativação; ainda não implementada) | Agora existe o teste que faltava: `discovery-cache.e2e-spec.ts:156` e `:173` (com cache ligado, produto removido e loja suspensa são recusados na sacola e no pedido na hora). Logo, **sem impacto financeiro, comprovado**. A exposição de conteúdo retirado continua. **Agravante novo:** o stale-if-error (`local-cache.ts:35`) serve o valor antigo por até 4x o TTL quando o recálculo falha por erro de infraestrutura (ofertas e mais vendidos: até 240 + 30 s). `AppError` (404 de loja suspensa) nunca é mascarado: `local-cache.spec.ts`, "erro de NEGÓCIO..." |
| SEC-202 (Baixa) | **Fechado** | `infra/docker-compose.prod.yml:76-77` (`log_parameter_max_length=0`); `..._on_error` já vale 0 por padrão. Conferido no PG 16 (acima). Resíduo: consulta com valor literal no texto (não parametrizado) continua no log. O drizzle parametriza; não procurei `sql.raw` com dado pessoal |
| SEC-203 (Baixa) | **Fechado** no item (1) | `env.ts:223-224` recusa `DB_STATEMENT_TIMEOUT_MS=0` com `NODE_ENV=production` (vale também para staging). Teste: `env.spec.ts:108`. O compose passa a variável com padrão 30000 (`docker-compose.prod.yml:245`). Item (2), calibrar o teto HTTP com `pg_stat_statements`, continua como recomendação, sem bloqueio |

### Achado novo

```
SEC-204 | Severidade: Baixa | Status: Corrigido (8943b3a; ver Re-revisão 2). DT-085 (tirar o refresh da transação) segue como dívida
Onde: apps/api/src/platform/config/env.ts:80 (`DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` aceita de 1 a 600000) e stores/payment-account.service.ts:167-176.
Problema: o comentário diz "não baixar de 15 s", mas o boot aceita qualquer valor >= 1. Com menos de ~8 s, o refresh OAuth (transação aberta durante
  a chamada ao MP, timeout de 8 s) pode ser encerrado depois que o MP girou o token e antes do UPDATE.
Cenário de falha: um operador "aperta" o timeout para 5000 achando que é ganho de segurança. Nas lojas com token perto de vencer, o refresh lento perde o par novo
  (o refresh_token antigo morre ao renovar). A loja fica sem conseguir cobrar até reconectar a conta de recebimento: venda perdida, sem vazamento.
  O processo não cai mais (SEC-199).
Correção recomendada (backend-dev): no superRefine de produção, aceitar só 0 ou >= 15000; ou, melhor (DT-085), tirar o refresh da transação: lease em linha por loja,
  chamada ao MP fora da transação, gravação do par novo em transação curta.
Como verificar: env.spec com `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=5000` em produção falha no boot.
```

### Regressões novas verificadas

| Item | Resultado | Evidência |
|---|---|---|
| Conciliação de pagamentos | **Sem regressão; melhorou.** Antes, a trava morria aos 30 s e duas conciliações podiam rodar juntas; o teste de mutação confirma isso. Agora a trava dura a rodada inteira. Exclusão mútua com a forma `xact` pela mesma chave `hashtext` (bigint de 1 argumento). Uma conexão presa por rodada, como antes. Se `pool.connect()` falhar, o erro vai ao `catch` do timer (`payments.service.ts:142`) | `database.module.ts:43-67`, teste acima |
| Pagamento de troca | **Sem regressão.** Mesma checagem de dono e de estado, mesma resposta 409 quando a trava está ocupada (`exchanges.service.ts:587`), mesmo consumo de conexão (antes: a da transação; agora: a dedicada). A trava pega **antes** da checagem de dono já existia: um terceiro que conheça o UUID da troca só consegue causar 409 por milissegundos, e o limite é 20/h (`exchanges.controllers.ts:123`). Lacuna de teste: nenhum e2e de troca com provedor lento | `exchanges.e2e-spec.ts` verde |
| Webhook do MP | **Sem janela nova de replay.** Só mudou o relógio: vencimento, marcação e backoff usam o `now()` do banco (`payments.service.ts:395`, `:402`, `:415`, `:430`; `make_interval` com parâmetro ligado, sem SQL montado como texto). Assinatura, antirreplay, unicidade `(provider, event_key)`, re-consulta ao MP e `SKIP LOCKED` não estão no diff. A observação da 1ª revisão (lease com o relógio da API) foi resolvida. Testes: `payments.e2e-spec.ts`, "mesmo milissegundo" e "dois processadores simultâneos consultam o provedor UMA vez" | |
| Variante do relógio | Os estornos (`payments.service.ts:724`, `:730`, `:783`) usam o relógio da API dos dois lados. Hoje isso é consistente. Com mais de uma réplica, a diferença de relógio entre hosts entra no lease (já coberto por ADR-017/DT-083). Sem achado | |
| Isolamento de cache entre áreas e clientes | **OK, com teste.** As chaves continuam sem posição nem usuário. A distância é calculada por requisição. `discovery-cache.e2e-spec.ts:59` (2 áreas) e `:88` (2 clientes, mesma área), com TTL real | |
| Dado pessoal em cache | **Melhorou.** Antes, o cache da loja guardava a linha inteira, com o CPF/CNPJ completo (MEI = CPF da pessoa). Agora guarda só a máscara (`browse.service.ts:126`), e o cache do produto guarda só `id`, `name` e cidade (`:266`). Teste: `discovery-cache.e2e-spec.ts:244`. `legalName` e o endereço da loja continuam: são dados do fornecedor exigidos e já públicos | |
| Chave do cursor | **Melhorou.** `offsetOf` (`browse.service.ts:41-44`) normaliza para um inteiro >= 0: cursor forjado não cria entrada nova nem chega ao `OFFSET` como texto ou número negativo. Teste: `discovery-cache.e2e-spec.ts:227` | |
| `Cache-Control` em erro | **Melhorou.** Todo erro sai com `private, no-store` (`problem.filter.ts:68`, e `:31` no `/health`), inclusive 401 e 404 de rota `public`. Teste: `cache-control.e2e-spec.ts` | |
| Log | Os logs novos não carregam dado pessoal: `db.session_settings` (só parâmetros), queda de conexão (`error.message` do pg, sem parâmetros) e trava (`exchange-pay:<uuid>`). `LatencyRecorder` só é instalado com o resumo ligado (`app.setup.ts`) | |
| DoS por conexão dedicada ou trava | **Sem piora.** Uma conexão por trava, como a transação de antes. A trava de troca é por `exchangeId`, então chamadas repetidas na mesma troca devolvem a conexão na hora. Esgotar o pool exige N trocas distintas em `awaiting_fee` (pedido entregue mais troca aprovada com taxa), com limite de 20/h. Resíduo conhecido: trava de sessão atrás de PgBouncer em modo transação (DT-085) | |
| Compose | `NODE_OPTIONS`, `DB_*`, TTLs e log repassados com padrões seguros (`docker-compose.prod.yml:241-252`). Nenhum segredo novo. `shm_size` e `max_wal_size` não afetam segurança | |

Observação sem achado: a suíte e2e emite o aviso do pg "client.query() when the client is already executing a query" (deprecado no pg 9). A origem não foi localizada; fica para o tech-lead, porque vira erro na atualização do pg.

### Veredito

**Veto (DEC-105) levantado com condições** para o merge do trabalho de desempenho no `main`. Do lado de Security, não há Crítica nem Alta aberta.

Condições:
1. Valem as outras condições da DEC-105, que não são minhas: e2e completo 2 vezes verde (QA) e re-revisão do tech-lead.
2. **SEC-200 e SEC-201 não bloqueiam o merge.** Vão como dívida registrada, com prazo no **G4 do v1.1**, e bloqueiam qualquer deploy de produção deste trabalho antes disso (inclusive como patch do v1.0):
   - SEC-201: a invalidação da DEC-113 tem de **apagar** a entrada (`clear`/`delete`), não só vencer o TTL. Se só vencer, o stale-if-error pode ressuscitar o conteúdo retirado. O e2e com TTL > 0 deve provar a retirada em até 5 s.
   - SEC-200: zona `limit_conn` própria para `/socket.io/`, chave por `userId` (ou por sessão) em `refresh`, `order-create` e `coupon-apply`, e `n429` por rota no `http.latency`. Por ser Média, o fundador pode aceitar o risco no G4 se o piloto for pequeno. A aceitação vai para `docs/decisoes.md`.
3. SEC-204 (Baixa) e DT-085 entram na onda. Não bloqueiam.

Por que não bloqueiam o merge: o `main` não vai para produção sem G4 (regra 7.3). Nenhum dos dois tem impacto financeiro; o checkout relê o banco, como prova o e2e. E SEC-200 já existia antes desta mudança.

**Limites:** PG 16 local (produção usa 18), sem carga, sem nginx, sem PgBouncer e sem a suíte e2e completa. Não fiz pentest.

---

## Re-revisão 2 (2026-11-22)

- **Escopo:** `git diff d941de2..HEAD -- apps/api packages/shared docs/deploy docs/arquitetura` (commits `07e2278`, `8943b3a`, `ab8ae84`, `d1be18e`; docs `017e235`, `fdb5b7e`; 33 arquivos). Li tudo o que é código de produção do diff e os chamadores de 1 salto. Variantes: todos os escritores de `stores`, `products`, `payment_accounts`, `cities` e `store_settings` (drizzle e SQL cru). **Não li:** os e2e além dos títulos e das asserções de `Cache-Control`, e o restante do guia de deploy fora do §14.
- **Execução (PostgreSQL 16 e Redis locais; produção usa PG 18):** unitários `platform/cache`, `platform/config` e `platform/database` (inclui `session-lock.spec.ts` novo): 72 de 72 verdes. e2e `discovery-cache`, `cache-control`, `db-idle-timeout`, `exchanges`, `browse` e `discovery`: 64 de 64 verdes. **Não rodei:** teste de mutação (a cópia descartável foi negada nesta sessão; a eficácia dos testes de `invalidate` foi conferida só por leitura: sem `local-cache.ts:27`, "invalidar com um cálculo em andamento" guardaria o valor antigo; sem `:37`, "invalidar durante o recálculo que falha" devolveria o valor retirado), suíte e2e completa, 2 réplicas reais, queda real do Redis, PG 18.

### Verificações pedidas

| Item | Resultado | Evidência |
|---|---|---|
| (a) Invalidação apaga cache, cópia stale e cálculo em andamento | **OK.** `invalidate` faz `delete` da entrada inteira (valor, cópia do stale-if-error e promessa). O cálculo em andamento só grava se a entrada ainda for a dele (`pending` por identidade). Se não for, entrega o valor a quem já esperava e não guarda nada. No erro, propaga em vez de servir o valor antigo. Filtro por valor apaga a entrada que só tem cálculo (`value` indefinido conta como "apagar", `browse.service.ts` `ofStore`). Ordem segura: invalidação depois do commit, e o cálculo iniciado depois lê o dado novo (read committed) | `local-cache.ts:27`, `:37`, `:64-72`; `local-cache.spec.ts` (5 casos novos); e2e `discovery-cache.e2e-spec.ts:186`, `:215`, `:228`, `:276` |
| (a) Cobertura dos eventos | **OK para DEC-113.** Moderação (pausar/remover/restaurar), transição de status da loja, pausa/retomada, conta de recebimento (conectar, desconectar, liberar), cidade (`active`), exclusão e restauração da conta do dono, e edição do catálogo. Redis `home`/`feed`: `bump` por versão, e o cálculo em voo grava na versão antiga, que fica inalcançável. Escritores sem invalidação (seguem o TTL, aceito pela DEC-113 como mudança comercial ou sem exposição): perfil da loja e aprovação de nome pendente (`stores.service.ts:270`, `admin-stores.service.ts:227`), sinalização automática por palavra suspeita (o conteúdo novo não estava em cache), retenção de token do dono excluído (`retention.service.ts:171`; a loja já saiu do ar no pedido de exclusão) | `storefront-cache.service.ts:71-79`; `git grep` dos escritores |
| (b) Pub/sub | **OK.** Canal `webag:storefront:invalidate:<db>`, montado só da configuração (`storefront-cache.service.ts:10`). Mensagem = `origin` (UUID aleatório do processo) + escopo + `storeId`/`productId` (UUIDs). Não leva dado pessoal. Nenhuma string do cliente chega ao canal. Os IDs vêm do registro já autorizado; o lote é `z.array(z.uuid()).max(200)` (`catalog.schemas.ts:67`), serializado com `JSON.stringify`. Redis fora: `bump` e `publish` falham abertos (`cache.service.ts:56-62`, `storefront-cache.service.ts:74-78`), a escrita de negócio não recebe 500 e o cache local da réplica que escreveu já foi apagado antes (`:72`). Na reconexão, apaga tudo (`:101`). Observação: a mensagem recebida não passa por schema (`:106`), mas só quem escreve no Redis consegue forjá-la, e o efeito máximo é esvaziar caches (carga no banco). Quem tem esse acesso já tem poder maior (rate limit, antirreplay). Sem achado | e2e `:302` (2 instâncias, mesmo Redis, sem eco) |
| (c) Nenhum cache novo com dado de usuário; privado continua privado | **OK.** Nenhum cache novo. As chaves continuam `storeId`, `productId`, `storeId\|seção\|offset\|limite`, `offers`/`best`, modo. `Cache-Control`: vitrine e avaliações `public, max-age=5`, sem posição; loja, produto e home `private, max-age=5`, com posição. Nenhuma rota autenticada mudou. O padrão `private, no-store` (`app.setup.ts`) e o de erro (`problem.filter.ts:31`, `:68`) não estão no diff. `privacy.controller.ts:142` e `admin.controllers.ts:300` seguem `no-store`. Teste: `cache-control.e2e-spec.ts` (404 da rota `public` volta a `private, no-store`) | `browse.controller.ts:15-17`, `discovery.controller.ts:33-34` |
| (d) Busca `search/*` com `private, max-age=30` | **Aceito como risco Baixo, sem achado.** A resposta fica só no aparelho de quem buscou (`private`: proxy não guarda). No servidor, a busca não tem cache próprio de resultado, e o catálogo de lojas que ela usa (`directories`) é invalidado. Tocar no item abre a página de loja/produto (5 s) e a sacola/checkout, que releem o banco (`discovery-cache.e2e-spec.ts`). Pior caso: o cartão de um produto retirado aparece por até 30 s, só para quem já tinha buscado antes da retirada. Não alcança terceiros nem cria pedido. Se a moderação de conteúdo ilegal exigir zero no aparelho, basta baixar para 5 s como na DEC-116 (decisão do PO, não minha) | `discovery.controller.ts:52-78` |
| (e) SEC-204 e `env.spec` | **OK.** `env.ts:211-212` recusa de 1 a 14999 depois do `return` de não produção (`:184`), então vale em produção e staging (`NODE_ENV=production`), e dev/teste continuam livres (o e2e usa 1000). 0 (desligado) segue aceito: é escolha explícita, que não reabre o cenário (sem timeout, a conexão do refresh não é morta). Testes: `env.spec.ts:87` (padrão, 15000, 60000 e 0 passam; dev/teste aceitam 1000), `:114-115` (5000 e 14999 derrubam o boot) | |
| Trava de sessão (`ab8ae84`) | **Melhorou.** Se a própria `pg_try_advisory_lock` falhar (timeout ou rede, quando o servidor pode ter concedido sem a resposta chegar), a conexão é destruída (`database.module.ts:53-61`, `:75`). Assim não volta ao pool com a trava de sessão presa. Testes: `session-lock.spec.ts` (5 casos: obtida, ocupada, falha na obtenção, falha no unlock, `lost()`) e `exchanges.e2e-spec.ts` (pagamento de troca concorrente com provedor lento) | |

### Achado novo

```
SEC-205 | Severidade: Baixa | Status: Aberto (só se aplica com 2+ réplicas da API; hoje 1 réplica, guia §14.2)
Onde: storefront-cache.service.ts:72-75 (ordem: apaga local -> bump do Redis -> publica) e :97-102 (a 1ª conexão do assinante não apaga nada).
Problema: com 2+ réplicas, entre o `bump` de `home`/`feed` (feito pela réplica A) e a chegada da mensagem à réplica B, uma requisição da home em B
  falha no Redis (versão nova), recalcula com o catálogo LOCAL de B ainda velho e grava o resultado na versão NOVA do Redis por 30 s, servido a TODAS as réplicas.
  A janela é a latência do pub/sub (milissegundos). Se o assinante de B estiver reconectando, porém, a janela chega ao TTL local (15 s) e o envenenamento dura até 15 + 30 s.
  O guia §14.6 diz que "aquela réplica segue o TTL", mas o efeito alcança todas.
Cenário: loja suspensa ou produto removido pela moderação volta à home de todos por até 30 s logo depois de sumir. Reputação, sem dinheiro (a sacola relê o banco).
Correção recomendada (backend-dev, antes da 2ª réplica, junto com DT-082/ADR-017): repetir o `bump('home'|'feed')` ~1 a 2 s depois do publish ("duplo apagar"),
  ou a réplica que recebe a mensagem também fazer `bump`; e tratar como reconexão também a 1ª conexão do assinante que veio depois de um erro (apagar tudo no `ready`
  sempre é barato).
Como verificar: e2e com 2 instâncias no mesmo Redis, com a mensagem atrasada artificialmente em B, uma home calculada em B dentro da janela e um GET depois
  de 5 s em A sem a loja suspensa.
```

### Status dos achados

| ID | Status | Evidência |
|---|---|---|
| SEC-200 (Média) | **Aberto** | Sem mudança em `infra/` nem no rate limit desde `d941de2` |
| SEC-201 (Baixa) | **Fechado** | Ver (a), (b), (c) e (d). A condição da DEC-115 ("apagar, não vencer", e2e com TTL > 0 em até 5 s) foi cumprida e testada; o cliente/proxy foi alinhado pela DEC-116 |
| SEC-204 (Baixa) | **Fechado** | Ver (e). DT-085 continua como dívida de desenho, sem bloqueio |
| SEC-205 (Baixa) | **Aberto** | Pré-requisito: 2ª réplica. Não bloqueia nada com 1 réplica |

### Veredito

**Veto ao merge levantado sem condição de Security** (as condições da DEC-105 que são do QA e do tech-lead continuam). Não há Crítica nem Alta aberta.
Para **deploy de produção** deste trabalho, a única pendência de Security é **SEC-200** (Média): corrigir ou o fundador aceitar o risco em `docs/decisoes.md` no G4. SEC-205 entra como pré-requisito da 2ª réplica (junto da pendência do Socket.IO no guia §14.2).

**Limites:** PG 16 local, 1 processo, Redis sem falha injetada, sem carga, sem a suíte e2e completa, sem teste de mutação nesta rodada e sem pentest.
