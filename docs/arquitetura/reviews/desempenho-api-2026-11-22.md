# Review: desempenho da API (cache em memória, auth em 1 consulta, banco, HTTP)

Revisor: tech-lead | Data: 2026-11-22 | Branch: `claude/admiring-lamport-62tq1a`
Escopo: `cfdc83b` (cache da descoberta, que a base do pedido já continha e é o foco do item 1) e `cfdc83b..27ec5e2` (5 commits: `bad4e83`, `624cbb7`, `ed862ba`, `df3521f`, `27ec5e2`). Relatório do autor: `docs/qa/performance/api-2026-11-22.md`.

## Parecer: REPROVADO (1 bloqueante, correção pequena; o resto é aprovável com os ajustes abaixo)

O ganho é real e bem medido (home p95 9,4 s -> 37 ms; 1.000 usuários realistas de 22,8% de erro para 0%), o desenho do cache é correto (catálogo sem posição em memória, filtro por posição/área sempre por consulta, só dado público), o webhook está certo e o contrato não mudou. O que reprova é um efeito colateral do novo padrão `idle_in_transaction_session_timeout=30s`: derruba o processo da API na conciliação de pagamentos. Corrigido o B1, o parecer passa a APROVADO COM AJUSTES sem nova rodada de design.

## Bloqueante

| # | Onde | Problema | Correção exata |
|---|---|---|---|
| B1 | `platform/database/database.module.ts:45` (novo `idle_in_transaction_session_timeout`) x `modules/payments/payments.service.ts:807-812` (`reconcile`) | `reconcile()` abre `db.transaction(lockTx)` só para segurar o advisory lock e fica **ociosa dentro da transação** durante todo o `reconcileLocked`, que chama o Mercado Pago uma vez por candidato (até 200: pendentes há mais de 5 min **e todos os aprovados das últimas 48 h**, a cada 5 min). Com ~100 candidatos a ~300 ms o intervalo ocioso passa de 30 s: o PostgreSQL mata a conexão (`25P03`) e o `pg` emite `error` num cliente que já saiu do pool e **não tem listener** (o pool tira o listener no checkout: `pg-pool` linha 344; nem o Drizzle nem o módulo registram um). Reproduzido aqui com `pg.Pool` e `-c idle_in_transaction_session_timeout=1500`: `uncaughtException 25P03 terminating connection due to idle-in-transaction timeout`. Resultado em produção: queda do processo a cada ciclo de 5 min com volume de piloto (e o lock da conciliação some no meio). Não há `process.on('uncaughtException')` na API. | (1) Em `database.module.ts`, `pool.on('connect', (client) => client.on('error', (e) => logger.warn(...)))` para que erro de conexão em cliente emprestado nunca derrube o processo. (2) Em `reconcile`, não manter transação ociosa: ou batimento `select 1` em `lockTx` a cada ~10 s (limpar em `finally`) ou trocar o advisory lock por lease (linha com `locked_until`, ou `SET NX EX` no Redis). (3) Mesma classe em `exchanges.service.ts:563` (`payOnce` segura `lock` aberta durante `createPayment`, chamada ao MP): garantir timeout do provedor bem abaixo de 30 s ao ligar o adaptador real, ou o mesmo batimento. (4) Teste e2e: `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=1000` + provedor fake que demora > 1 s no `getPayment`; a conciliação termina, o processo continua vivo e o lock não é perdido. |

## Importante (corrigir nesta entrega ou virar DT com dono e gatilho)

| # | Onde | Problema | Correção |
|---|---|---|---|
| I1 | `vitest.config.e2e.ts` (TTLs = 0) | **Nenhum teste e2e roda com o cache ligado.** Em TTL 0 o `LocalTtlCache` chama `compute()` direto; o que sustenta a home em produção (diretório, ofertas e mais vendidos mesclados por posição, base da loja/produto) só foi provado pelo `equivalencia.mjs` (manual, fora do CI, dados estáticos). Não há teste de: isolamento entre áreas com cache quente, limite de defasagem, ou "página mostra preço/estoque antigo e o checkout recalcula". | Novo `test/discovery-cache.e2e-spec.ts` que sobe com `FEED_DIRECTORY_TTL_SECONDS`, `HOME_SECTIONS_TTL_SECONDS`, `BROWSE_CACHE_TTL_SECONDS` > 0 (override de `process.env` antes de criar o app, restaurar no `afterAll`): (a) duas lojas em áreas diferentes, home nas duas posições com cache quente: cada uma vê só as suas ofertas e mais vendidos; (b) altera preço/estoque, a página do produto mostra o valor antigo e `POST /v1/orders` usa o novo; (c) erro do banco não é guardado. |
| I2 | `ed862ba` (webhook) | Correção de bug **sem teste de regressão** (a prova do autor é a suíte intermitente). Semântica confirmada: `now()` do banco = início da transação do `processDue`, sempre >= o `default now()` do INSERT já confirmado, então o evento recém-gravado vence; `FOR UPDATE SKIP LOCKED` + marcação de 60 s no mesmo `tx` continuam intactos (sem dupla execução nem perda). | Teste em `payments.e2e-spec.ts`: inserir evento com `next_attempt_at = now() - interval '1 second' + interval '500 microseconds'`, `vi.setSystemTime` para o milissegundo truncado desse valor e chamar `processDue()`: deve devolver 1 (com `new Date()` devolvia 0). Falha sem a correção, passa com ela. |
| I3 | `app.setup.ts:35` (`Cache-Control` global) | Padrão novo de LGPD sem teste. | e2e: `GET /v1/cart` e `GET /v1/me/addresses` autenticados -> `cache-control: private, no-store`; `GET /v1/browse/stores/:id/products` mantém `public, max-age=30`; **404** dessa rota mantém `private, no-store` (erro não pode ser cacheável por proxy). |
| I4 | `identity/principal.service.ts` | Reescrita da consulta de autenticação (crítica) sem teste dedicado: cobertura só indireta (auth, MFA, reautenticação, reenrolamento). Comparei com o código anterior: **todas as checagens foram mantidas** (sessão revogada, `absolute_expires_at`, `users.status <> 'active'`, admin inativo ignorado, `mfa_verified_at`, `mfa_factor`, `reauth_at`, reenrolamento TOTP; ADR-003 preservado: continua indo ao banco a cada requisição; SEC-182 intacto, conta bloqueada continua sem sessão). | Teste de caracterização (e2e) para: usuário `blocked`/exclusão pendente -> 401; sessão expirada em `absolute_expires_at` -> 401; admin com `active=false` perde `adminProfile`; usuário com 2 papéis devolve os 2. |
| I5 | `infra/docker-compose.prod.yml` (serviço `postgres`) | `work_mem` sobe de 4 MB para 8 a 24 MB e o contêiner fica com `/dev/shm` de 64 MB (padrão do Docker): junções paralelas usam memória dinâmica compartilhada e podem falhar com `could not resize shared memory segment` sob carga. **Verificar** em staging (não reproduzi: sem Docker aqui). | `shm_size: 256mb` no serviço `postgres`. |
| I6 | Defasagem de retirada (relatório §10, "pendência") | Produto removido pela moderação e loja suspensa/pausada: home até **15 + 30 s** (loja) e **60 + 30 s** (ofertas/mais vendidos) e página 10 s; mais `max-age=30` no aparelho. O guia diz "até esse tempo + 30 s" e omite o cache Redis da home e o do aparelho. Moderação é ação de segurança/legal. Checkout não usa esses caches (verificado: nenhum módulo fora de `discovery` importa os serviços), então não há venda indevida, só exposição. | Decisão do PO + Security (aceitar com os números corretos no guia) **ou** invalidar na mesma instância ao moderar/suspender (`LocalTtlCache.clear()` exposto via `index.ts` do módulo `discovery`; vale só para 1 réplica, ver DT-082). Corrigir o texto do guia e do relatório com a soma real. |

## Ajustes (podem ir junto ou na próxima)

| # | Onde | Problema / correção |
|---|---|---|
| A1 | `browse.service.ts` `storeProducts` (chave do cache) | A chave usa o `cursor` cru (qualquer string de até 200 caracteres): variar o cursor dá uma entrada nova com o mesmo conteúdo e uma consulta ao banco, e com teto de 1.000 entradas (FIFO) expulsa a primeira página das lojas quentes (limite de 180 req/min por IP; efeito: volta ao desempenho de antes, não pior). Usar o offset decodificado na chave. |
| A2 | `local-cache.ts` (tratamento de erro) | O comentário e o teste dizem "valor antigo continua servindo se já existia", mas **não serve**: o valor restaurado mantém o `at` antigo (vencido) e quem disparou o recálculo recebe o erro; cada requisição seguinte tenta de novo (confirmado com script). Ou devolver `hit.value` no erro (resiliência real, com recuo de ~1 s) ou corrigir comentário e teste. Também: a entrada expulsa por teto enquanto pendente permite 2 cálculos da mesma chave (inofensivo). |
| A3 | `principal.service.ts` | SQL cru com colunas e tipos escritos à mão: renomear uma coluna passa no `typecheck` e só quebra em runtime. Aceitável com o teste do I4; preferível o builder do Drizzle com subconsulta correlacionada de papéis. |
| A4 | `browse.service.ts` `loadStoreBase` | O cache guarda a linha inteira de `stores` (inclui `documentNumber`, CPF/CNPJ completo) por 10 s em memória; a saída só usa a máscara. Selecionar só as colunas usadas (minimização, LGPD). Security avalia. |
| A5 | `infra/env.prod.example` / `infra/env.example` | Só `PG_*` entrou; `DB_POOL_MAX`, `DB_*_TIMEOUT_MS`, `*_TTL_SECONDS`, `HTTP_ACCESS_LOG`, `HTTP_SLOW_MS`, `LATENCY_LOG_INTERVAL_SECONDS` estão apenas na tabela do guia. Listar (comentados, com o padrão). |
| A6 | `database.module.ts:45` | O `pg_trgm.word_similarity_threshold=0.5` vai por `options` de conexão: atrás de PgBouncer ou outro pool sem esse parâmetro o limite volta a 0,6 e a busca por erro de digitação muda **sem erro nenhum**. Logar `show pg_trgm.word_similarity_threshold` no boot (ou no `/health/ready`) e manter o caso de digitação errada no `search.e2e-spec.ts`. |
| A7 | `docker-compose.prod.yml` | Sem limite de memória nos contêineres nem teto de heap do Node (o autor mediu com `--max-old-space-size=1536`); `checkpoint_timeout=15min` sem `max_wal_size` (padrão 1 GB) faz o checkpoint disparar por tamanho. Definir `max_wal_size=2GB`, e `NODE_OPTIONS=--max-old-space-size` no serviço `api`. Valores de `PG_*` conferem com a regra 25%/65% do guia; o padrão (4 GB) é conservador para o VPS de 8 a 16 GB: a tabela do guia cobre. Sintaxe: o YAML carrega e a lista `command` tem 29 itens; `docker compose config` não foi executado (sem Docker). |
| A8 | `latency.ts` / `app.setup.ts` | Com `LATENCY_LOG_INTERVAL_SECONDS=0` o middleware continua gravando em memória (limitado: 300 rotas x 5.000 amostras) sem nunca ser lido; só instalar se > 0. `percentile` é "limite superior" (p95 de 1..100 = 96, nearest-rank = 95); nit. Sem dado pessoal: chave é método + modelo da rota (`routeKey` testado). O fio `Logger.log(objeto)` do `http.latency` não tem teste: QA confirma em log real. |
| A9 | `processDue` | A marcação de 60 s e as retentativas usam `new Date(Date.now() + ...)` (relógio da API) contra `now()` do banco: com banco gerenciado em outra máquina, desvio de relógio muda a janela. Usar `now() + interval` em SQL quando o banco sair do mesmo host. Nit hoje. |
| A10 | `CacheService.wrap` | O single-flight do cache Redis não tem teste (só o `LocalTtlCache` tem). Teste unitário com `ioredis` falso. |
| A11 | `search/suggestions` | Ordem das lojas sugeridas passou a ser por UUID (arbitrária, determinística). Tratado como no relatório (608/609 idênticas; a divergente é essa); critério de relevância vira DT-084. |

## Respostas aos pontos pedidos

| Ponto | Conclusão |
|---|---|
| Chave, vazamento entre áreas/clientes | Sem vazamento. O diretório é global por modo (sem posição); a posição entra sempre por consulta (`ST_DWithin` + `s.status='approved'` ao vivo) e as listas por loja são filtradas pelo feed da posição. Nada pessoal em cache. Ofertas/mais vendidos: mesclagem equivalente (o top-N global de uma união está contido na união dos top-N por loja). |
| Teto de memória | Todos os `LocalTtlCache` têm teto (diretório 4, pools 2, loja 500, produto 1.000, vitrine 1.000) e o `inflight` do `CacheService` esvazia no `finally`. Expiradas só saem por FIFO. Sem `Map` sem teto. |
| Várias réplicas | Fase do TTL por réplica, sem invalidação por evento: DT-082; escala horizontal em ADR-017 (proposta) e DT-083. Hoje 1 réplica: sem efeito. |
| Consistência com checkout | Nenhum módulo fora de `discovery` usa esses serviços; preço, estoque, frete e horário no checkout vêm do banco. Estoque/preço/promoção na página e na home ficam defasados (10 a 90 s) e o app recebe erro do servidor ao adicionar. Promoção que vence dentro da janela aparece em "ofertas" já sem desconto (cartão recalcula o preço com `now`). |
| `Cache-Control: private, no-store` global | Correto: o middleware roda antes do handler e `@Header` o sobrescreve nas rotas públicas; erro (404/5xx) dessas rotas mantém `no-store`. ETag/304 do Express continuam para quem reenvia `If-None-Match`; o `no-store` só impede o armazenamento. Sem teste (I3). |
| Migração 0057 | `CREATE INDEX` parcial `(store_id, rating) WHERE product_id IS NULL AND status='published'`: predicado idêntico ao das duas consultas (loja da home e `ratingOf`), nome ok, aplicada do zero pelo e2e. Sem `CONCURRENTLY` (Drizzle migra em transação; DT-081) e sem `down`: reverter = `DROP INDEX`. Trava escrita em `reviews` só durante a construção, ms no volume de piloto; para tabela grande, manual com `CONCURRENTLY` (guia 14.3). Aceito. |
| Pool/timeouts | `DB_POOL_MAX` 10 e `statement_timeout` 30 s são padrões seguros; **`idle_in_transaction_session_timeout` 30 s não é seguro hoje (B1)**. `migrate.ts` e `seed` usam pool próprio sem timeout (correto). Advisory locks são `xact` (compatíveis com PgBouncer em modo transação). |
| Log de acesso / `http.latency` | Sem dado pessoal; o log de acesso só de erro/lento é decisão aceitável (nginx guarda tudo), mas é redução de trilha: Security confirma que nenhuma exigência LGPD/auditoria dependia dele. |
| Contrato | `git diff cfdc83b^ 27ec5e2 -- docs/arquitetura/api packages/shared` vazio; `pnpm generate:check` exit 0. Mudança observável só de cabeçalho (`Cache-Control`) e da ordem de `search/suggestions`. Nenhuma regra de negócio alterada. |
| Dívida | DT-082, DT-083, DT-084 criadas; DT-017 atualizada (1 consulta); ADR-017 (proposta) e nota factual no ADR-004. |

## O que o QA deve checar
- Reexecutar a suíte completa após o B1 (2 vezes) e o novo teste de conciliação com timeout curto; conferir que `http.latency` aparece no log real (JSON com `event`).
- Com cache ligado (staging, TTL padrão): home em duas áreas, produto com preço alterado e adicionar à sacola, loja pausada/produto moderado (medir o tempo até sumir e comparar com o que o PO aceitar).
- 304 com `If-None-Match` em rota pública; `no-store` nas autenticadas (sacola, pedido, perfil, endereço).
- Carga com o gerador em outra máquina no tamanho do VPS e disco real (o relatório mediu com dados em RAM; S3, S5, S7, S8, S12 não medidos): desempenho de produção segue não aprovado.

## O que o Security deve checar
- B1 (disponibilidade: queda de processo por timeout de transação) e o batimento/lease escolhido na conciliação.
- `disconnectSession` e sessão revogada com mais de uma réplica (ADR-017 requisito 1).
- Defasagem de retirada por moderação (I6) e `documentNumber` em memória (A4).
- Redução do log de acesso (trilha) e chaves do Redis com coordenadas exatas (`cache:home:...:lat:lng`, 30 s, preexistente).
- `pg_stat_statements` guarda texto normalizado das consultas (sem parâmetros); acesso só ao superusuário.

Dívida registrada: DT-082, DT-083, DT-084 (`docs/arquitetura/divida-tecnica.md`); proposta `docs/arquitetura/adr/ADR-017-escala-horizontal-da-api.md`.

## Verificado (2026-11-22, branch no commit `27ec5e2`, PostgreSQL 16.15 + Redis locais em memória, `fileParallelism: false`)
| Item | Comando | Resultado |
|---|---|---|
| Tipos | `pnpm typecheck` (apps/api) | exit 0, sem erros |
| Lint | `pnpm lint` (apps/api) | exit 0, sem erros |
| Unitários | `pnpm test:unit` | 48 arquivos, 344 testes verdes |
| E2E (auth, MFA admin, OAuth, pagamentos, webhook, cupons, navegação, descoberta, busca, banners, textos legais, tempo real, privacidade, home do lojista) | `vitest run --config vitest.config.e2e.ts <17 arquivos>`, 2 execuções | 17 arquivos, 155 testes verdes nas duas (exit 0, 60 s e 63 s) |
| Contrato | `pnpm generate:check` | exit 0, sem diff em `packages/shared` |
| Comportamento sob `idle_in_transaction_session_timeout` | script com `pg.Pool` | reproduz a queda (B1) |
| `LocalTtlCache` com erro após vencer | script | erro propagado, valor antigo não servido (A2) |
| Suíte e2e completa (108 arquivos) | não executada por mim | motivo: o relatório do autor registra 2 execuções verdes (874 testes); rodei o subconjunto que toca auth/cache/webhook. Todos os e2e rodam com os caches em memória **desligados** (I1) |
| Build | não executado | disco do ambiente quase cheio |
| `docker compose config` / PostgreSQL 18 | não executado | sem Docker; o YAML foi lido com `yaml.safe_load` |
