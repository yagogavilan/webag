# Revisão diferencial de segurança: desempenho da API (2026-11-22)

- **Revisor:** security-engineer. **Data:** 2026-11-22. **Branch:** `claude/admiring-lamport-62tq1a`.
- **Escopo pedido:** `git diff cfdc83b 27ec5e2 -- apps/api infra docs/deploy` (commits `bad4e83`, `624cbb7`, `ed862ba`, `df3521f`, `27ec5e2`). Como os caches em memória que o pedido manda revisar estão no próprio `cfdc83b`, ele também foi lido (`git diff cfdc83b^ cfdc83b`).
- **Relatório do autor:** `docs/qa/performance/api-2026-11-22.md` §6 e §10.
- **Skills:** `revisao-diferencial-de-mudancas`, `analise-de-variantes`, `defaults-inseguros-e-armadilhas-de-api`, `checklist-seguranca`.

## Veredito

**REPROVADO, com veto ao merge e ao deploy desta mudança enquanto SEC-199 (Alta) estiver aberto.** A correção é pequena: ver a correção mínima no achado. O resto foi aprovado com ressalvas. A autenticação em uma consulta manteve todas as checagens, `Cache-Control` ficou mais restrito do que antes, os caches não guardam dado pessoal e o checkout continua recalculando tudo na hora. O webhook não ganhou janela de replay.

| Severidade | Achados | Bloqueia |
|---|---|---|
| Alta | SEC-199 | Sim |
| Média | SEC-200 (pré-existente, ampliado pelo guia §14.5) | Não |
| Baixa | SEC-201, SEC-202, SEC-203 | Não |

## Achados

```
SEC-199 | Severidade: Alta | Status: Aberto
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
SEC-201 | Severidade: Baixa | Status: Aberto (decisão do PO)
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
SEC-202 | Severidade: Baixa | Status: Aberto (pré-existente; o compose foi alterado neste diff)
Onde: infra/docker-compose.prod.yml (comando do postgres, `log_min_duration_statement=1000`).
Problema: no PostgreSQL 13 ou mais novo, `log_parameter_max_length` vale -1 por padrão. Toda consulta lenta vai para o log do contêiner COM os parâmetros
  (e-mail no login, termo de busca, lat/lng da descoberta, telefone).
Cenário: quem tem acesso aos logs do servidor (ou a um backup deles) lê dado pessoal sem passar pela trilha de auditoria. A rotação de 50 MB limita o volume, mas não evita a exposição.
Correção recomendada (backend-dev): adicionar `-c log_parameter_max_length=0` (o `..._on_error` já é 0 por padrão).
Como verificar: `select pg_sleep(1.1), $1` com o parâmetro 'x@y.com' não deixa `parameters:` no `prod.sh logs postgres`.
```

```
SEC-203 | Severidade: Baixa | Status: Aberto
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
