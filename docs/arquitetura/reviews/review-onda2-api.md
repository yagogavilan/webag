# Revisão de código da Onda 2 da API (lojas, documentos, catálogo, moderação, configuração da loja, seed) — tech-lead

- **Data:** 2026-11-18 | **Revisor:** tech-lead (independente; o autor é o backend-dev) | **Base:** `f88bd77` (main), com o `2dee544` da Onda 3 já em cima.
- **Escopo:** `apps/api/src/modules/{stores,catalog,media}` (+ `payments` só no que a conta de recebimento toca), `apps/api/seed/onda2.ts`, migrações `0005` e `0008`, testes `catalog`, `stores-*`, `seed-onda2`. Fora de escopo: `apps/web`, `apps/mobile`, Onda 3 (endereços, banners, cache).
- **Método:** leitura do código e dos testes, não do resumo. Dois achados medidos (cursor, memória do sharp). Os demais são de leitura e estão marcados quando falta teste que os reproduza.

## Parecer: APROVADO COM RESSALVAS

Não há bloqueante. A base é boa: toda consulta do catálogo é escopada pela loja da rota (produto alheio é 404), estoque e preço têm `CHECK` no banco, decisão de loja tem lock de linha e máquina de estados com auditoria, upload confere magic bytes e re-codifica sem EXIF, o state do OAuth é amarrado a loja, usuário e sessão. Os testes e2e cobrem o que o plano da Onda 2 chama de crítico (20 `+1` simultâneos, 40 MP, SVG/HTML renomeados, duas decisões simultâneas, falha de auditoria impede a URL de documento).

Mesmo assim há **defeitos reais que o QA não vai pegar pelo plano atual**. Os quatro primeiros (I1 a I4) são baratos e devem entrar antes de o QA fechar a Onda 2; os demais, antes do G4 ou da Onda 4A, conforme indicado.

## Verificado

| Verificação | Resultado |
|---|---|
| `pnpm --filter @webag/api --filter @webag/shared lint` | OK (0 erros) |
| `pnpm --filter @webag/api --filter @webag/shared typecheck` | OK |
| `pnpm --filter @webag/api test:unit` | 14 arquivos, 118 testes OK |
| `pnpm --filter @webag/api test:e2e` (Postgres 16 e Redis reais, execução completa) | 241 OK, 1 ignorado, **3 falhas, todas da Onda 3 em andamento**: `contract` (5 rotas `/v1/me/addresses*` sem contrato no `openapi.yaml` da base), `rbac` (lista de rotas públicas e matriz perfil x permissão sem as rotas novas). Nenhuma falha em `catalog`, `stores-*`, `seed-onda2`, `auth`, `payments*` |
| Reprodução de I3 (cursor) | Medido em SQL: 5 linhas inseridas numa transação, `limit 2`, cursor truncado a milissegundos como o `Date` do JS: a página 2 volta **vazia** (3 produtos perdidos) |
| Medição de I8 (sharp) | PNG 40 MP chapado de 0,8 MB: 1,3 s de CPU e +132 MB de RSS para as 4 variantes; JPEG 40 MP: 0,24 s e +22 MB |

Aviso sobre o ambiente de teste: uma primeira execução completa teve 8 falhas (categorias duplicadas, `TERMS_OUTDATED`, conta de recebimento já em uso), que **não se repetiram** em duas execuções seguintes. O repositório é compartilhado com o backend-dev, que roda os e2e no mesmo Postgres e Redis (banco `webag_test`, Redis `/15`, recriados por `global-setup`). Duas execuções simultâneas se corrompem. Isso é frágil para o CI e para o QA: ver sugestão S9.

## Bloqueantes

Nenhum.

## Importante

| # | Onde | Problema | Correção |
|---|---|---|---|
| I1 | `stores/team.service.ts:77-90` (`revokeInvitation`) | Autorização **depois** da mutação. O `UPDATE invitations SET revoked_at` filtra só por `id`, `kind` e "não usado"; a comparação com a loja (`payload.storeId !== store.id`) vem depois, devolvendo 404. O convite de **outra loja** já foi revogado quando o 404 sai. Precisa do UUID do convite (v4, não adivinhável), então o risco é baixo, mas é o padrão "checar antes de mudar" que o SEC-020 e o `contrato-api` pedem. Não há teste de revogar convite alheio | Incluir `payload->>'storeId' = store.id` no `WHERE` do `UPDATE` (e 404 se nenhuma linha). Teste: lojista B revoga convite de A, espera 404 e o convite de A segue válido |
| I2 | `stores/team.service.ts:162-170` (`activity`) e `stores.controllers.ts:344` | `ORDER BY created_at` **ascendente** com `LIMIT 50`: devolve os **50 eventos mais antigos** e nunca os recentes. O catálogo já grava um evento por ajuste de estoque, então a tela "quem fez o quê" (WB-075 C8) congela depois de 50 ações. O contrato (`/v1/stores/{storeId}/activity`) também devolve lista sem cursor, contra a regra de paginação | `ORDER BY created_at DESC, id DESC` e paginar por cursor como o resto. Teste: 60 eventos, o mais recente aparece |
| I3 | `catalog/catalog.service.ts:219` e `catalog/moderation.service.ts:44` (cursor de produtos) | O cursor carrega `createdAt` em ISO (milissegundos), mas a coluna é `timestamptz` com **microssegundos**. `lt(createdAt, T_ms)` pula as linhas do mesmo milissegundo que a última da página, e o desempate por `id` (`eq(createdAt, T_ms)`) nunca casa. **Medido**: 5 linhas da mesma transação, `limit 2` → página 2 vazia. Em produção atinge tudo que nasce numa transação só (importação futura em lote, seed, migração de dados) e dois produtos criados no mesmo milissegundo. A fila de lojas (`admin-stores.service.ts:42-45`) já resolveu com `date_trunc('milliseconds', ...)`: o padrão certo existe no próprio módulo | Mesmo tratamento do `admin-stores`: comparar e ordenar por `date_trunc('milliseconds', created_at)` e `id`, ou codificar o cursor em microssegundos (string do banco). Extrair um helper `cursorByTimestamp` em `platform/http/pagination.ts` para a Onda 3 (listas de lojas e produtos da vitrine) não repetir. Teste: 5 produtos com o mesmo `created_at`, paginar de 2 em 2 |
| I4 | `catalog/catalog.controllers.ts:105-114` (`stock`) e `:70-73` (`bulk`) | Operações **relativas** sem `Idempotency-Key`. `delta` e `price_adjust` por percentual não são idempotentes: o app com 3G repete a requisição depois de um timeout e o estoque sobe duas vezes, ou o preço sobe 10% duas vezes (`catalog.service.ts:453` e `:610`). O `contrato-api` pede a chave em escrita que o cliente pode repetir; só o `POST /products` aceita. É o tipo de dano silencioso (preço errado na vitrine) que o lojista só descobre vendendo | Aceitar `Idempotency-Key` nas duas rotas (escopo loja + chave + hash do corpo, 24 h, como no ADR-007 §5; hoje a chave do `create` não tem o hash do corpo, e a mesma chave com corpo diferente devolve o 1º produto em silêncio). Alternativa mínima: o app só usa `set` (idempotente) quando houver retry, mas o contrato continua exposto. Teste: duas chamadas iguais, um efeito |
| I5 | `stores/store-settings.service.ts:133-138` e `:144-149` (`setHours`, `setHolidays`) | `DELETE` + `INSERT` sem lock. Dois salvamentos simultâneos (duas abas, ou toque duplo, que o PRD cita) intercalam: `store_hours` não tem índice único e acumula **intervalos duplicados/sobrepostos** que a validação do payload não via; `store_holidays` tem unicidade e uma das requisições vira **500** em vez de 409. `setDelivery`/`setPickup` já travam a linha de `store_settings`; estes dois ficaram de fora | `SELECT ... FOR UPDATE` em `store_settings` no início da transação (mesmo padrão) e ler o `before` dentro dela. Teste: dois `PUT /hours` simultâneos, uma só configuração no fim |
| I6 | `stores/stores.service.ts:164` e `:282` (`updateProfile`, `attachDocument`) | A regra "editável?" usa o `store` lido **antes** da transação. `updateProfile` trava a loja (`FOR UPDATE`, `:235`) mas não reavalia o status em `before`; `attachDocument` nem trava. Uma edição ou um anexo que cruza com o `submit` (status vira `in_review`) passa. Além disso `store_documents` não tem índice único parcial "um vigente por `(store_id, kind)`" (`supersededAt is null`): dois anexos simultâneos do mesmo tipo geram **dois documentos vigentes** | Reler o status em `before` (e rejeitar com `STORE_NOT_EDITABLE`); travar a loja em `attachDocument`; criar `UNIQUE (store_id, kind) WHERE superseded_at IS NULL` (migração nova) |
| I7 | `catalog/catalog.service.ts:288-343` (`update`) | `PATCH` aceita `categoryId: null` em produto **ativo** (e `sectionId`), deixando uma vitrine com produto sem categoria; a regra de "ativo precisa de preço" existe (`PRICE_REQUIRED`), a de categoria não. A publicação exige a categoria (`:506`), então a invariante é só do `publish` | Em produto ativo, `categoryId: null` → 422 `PRODUCT_INCOMPLETE`. Teste junto do O2-PRD-02 |
| I8 | `media/media.service.ts:101-140` e `media/image.processor.ts:10-24` | Processamento **síncrono no request, sem limite de concorrência e sem cancelamento**. (a) `withTimeout` usa `Promise.race`: o rejeitado "demorou demais" não interrompe o trabalho do sharp, que segue ocupando a thread; (b) nenhum semáforo: N uploads simultâneos de PNG 40 MP somam ~130 MB e 1,3 s cada (medido) dentro do mesmo processo que atende HTTP; (c) cada largura decodifica o original de novo (4 decodificações). O limite de 5 MB por arquivo e 120 `complete`/h por usuário seguram o abuso individual, não a soma entre contas | Semáforo de 2 a 3 processamentos simultâneos (fila em memória é suficiente), `sharp.concurrency(2)`, e em PNG baixar `MAX_PIXELS` (ex.: 25 MP; celular de 48/50 MP exporta JPEG, que usa shrink-on-load e é barato). Decodificar uma vez e derivar as larguras da maior para a menor. Pagar já: DT-033 |
| I9 | `catalog/catalog.service.ts:701-732` (`importCsv`, `mode=commit`) | Confirmar a importação duas vezes (toque duplo ou repetição de rede) **duplica** todos os produtos sem SKU; com SKU o `skip` protege, sem SKU nada protege. O `create` avulso tem `Idempotency-Key`, a importação em lote (muito mais cara de limpar) não. Também: cada produto é uma transação própria, então uma falha no meio deixa importação parcial e devolve 500 | `Idempotency-Key` no commit (ou hash do arquivo + loja em janela de 10 min) e transação única por arquivo (500 linhas cabem). Teste: duas confirmações iguais, 1 conjunto |
| I10 | `apps/api/seed/index.ts:24-36` e `seed/onda2.ts:231-280` | O seed da Onda 2 pode rodar em **produção** com `SEED_ONDA2=true`: cria 7 lojas **aprovadas** com CPF fictício, conta de recebimento `fake` ativa e fotos de teste, tudo visível ao cliente real. Também reaproveita as credenciais S3 de desenvolvimento por padrão (`S3_ACCESS_KEY ?? 'webag-dev'`). Em produção o único uso legítimo é staging, que não é produção; o risco (loja fictícia vendendo, CPF fictício que coincide com pessoa real na restrição `stores_document_uq`) é maior que a conveniência. O seed também não é transacional por loja: falha no meio deixa usuário e loja criados sem produtos, e a reexecução **pula** a loja ("já existe") para sempre | Remover o caminho de produção (staging usa `NODE_ENV=staging`/`development`); embrulhar cada loja numa transação (fotos fora dela); trocar a checagem "usuário existe" por "loja completa". Decisão de produto: o CEO confirma que ninguém depende do caminho de produção |

## Sugestões

| # | Onde | Observação |
|---|---|---|
| S1 | `stores/team.service.ts:123-134` (`list`) | Carrega **todos** os convites `store_staff` de todas as lojas e filtra por `payload.storeId` em JavaScript. Não vaza dado (filtra antes de devolver), mas cresce com a plataforma. Filtrar no SQL por `payload->>'storeId'` (mesma correção do I1) |
| S2 | `catalog/catalog.service.ts:438-451` (`sendLowStock`) | A decisão do gatilho usa o `lowStockArmed` lido **antes** da transação e o `UPDATE` do gatilho roda fora dela: dois ajustes simultâneos podem mandar o e-mail duas vezes (R-14 diz 1 vez). Trocar por `UPDATE ... SET low_stock_armed = false WHERE id = ? AND low_stock_armed RETURNING`: quem recebe a linha envia |
| S3 | `catalog/catalog.service.ts:567-573` (`createSection`) | `position = existing.length` e limite de 30 lidos fora de transação: concorrência permite 31 seções e posições repetidas; depois de excluir uma do meio, a nova repete a posição da última. Usar `max(position) + 1` na transação, com a loja travada |
| S4 | `catalog/catalog.service.ts:734-775` (importação com `update`) | O estoque definido pela planilha abaixo do reservado é **ignorado em silêncio** (`'stock' in next` falso) e a linha conta como "atualizada". Devolver o motivo por linha. E a atualização por SKU alcança variações de produto **arquivado** |
| S5 | `catalog/moderation.service.ts:96-103` | "3 remoções em 30 dias" conta **eventos** `remove` da loja, não produtos distintos: remover, restaurar e remover o mesmo produto 3 vezes sinaliza a loja. Contar `DISTINCT product_id` [verificar com o PRD admin se a intenção é produtos distintos]. A sinalização (`flagSuspensionReview`) e o e-mail saem depois da transação: queda no meio perde a sinalização (DT-004 cobre o e-mail; a sinalização deveria ir na transação) |
| S6 | `stores/payment-account.service.ts:216` e `:168` | `raiseAlert(...).catch(() => undefined)` engole falha de alerta de titular divergente (SEC-047) sem log. No mínimo `logger.warn`. Também: o token OAuth expira em 180 dias (`tokensExpireAt`) e não há job de renovação nem alerta de vencimento: DT-034 para a Onda 4A, antes de cobrar |
| S7 | `stores/stores.service.ts:196-206` | Coordenada vinda do cliente (`address.lat/lng`) tem precedência sobre a do geocodificador e só é limitada a `±90/±180`. É intencional (ajustar o pino), mas permite pino a quilômetros do endereço informado e muda raio de entrega e frete. A análise do admin vê o endereço, não a distância. Sugestão: calcular a distância entre o pino e o endereço geocodificado e levar ao admin como alerta acima de um limite [HIPÓTESE: 500 m] |
| S8 | `stores/store-settings.service.ts:78-115` (`present`) | `isOpenNow` relê `store_settings`, horários e feriados que `present` acabou de ler: 3 consultas repetidas por chamada. Passar os dados lidos. `confirmDefault` (`:248`) é aceito e ignorado, e `const days = input.voluntaryDays === 0 ? 0 : input.voluntaryDays` (`:259`) é um no-op: limpar |
| S9 | `apps/api/test/*` e `vitest.config.e2e.ts` | Banco e Redis de teste têm nome fixo; duas execuções (dev e QA, ou dev e CI local) se corrompem sem aviso. Nome do banco e do Redis por execução (`webag_test_<pid>`) ou um lock de arquivo no `global-setup` |
| S10 | `drizzle/0008_catalog_idempotency_store_review_flag.sql:3` | Duplica o `CHECK` de preço de `products` que já existe como `products_price_chk` na `0005` (`products_price_range`). Inofensivo; manter só um. Os `CHECK` foram escritos à mão na migração e não aparecem no `schema.ts` (o schema só declara o `products_price_range`): quando o `drizzle-kit generate` rodar, conferir que não propõe remover os da `0005` [verificar] |
| S11 | `seed/onda2.ts:332` | `attributesKey` reimplementado à mão (sem normalização NFC nem colapso de espaços). Importar `attributesKey` de `catalog/domain/variants.ts`; se divergir, `setVariants` vê "combinação alterada" e passa a exigir `reserved = 0` sem motivo |
| S12 | `contrato-api` x implementação | A skill descreve dinheiro como `{ "amount", "currency" }`; o ADR-007 §6 e todo o catálogo/loja usam `*Cents` inteiro (e `payments` usa `Money` na saída). Dois formatos coexistem. Registrar a decisão no ADR-007 e atualizar a skill (DT-009 já cobre skills desatualizadas), em vez de deixar o mobile descobrir |

## Coerência com `contrato-api` e padrões

| Ponto | Situação |
|---|---|
| Erros RFC 9457 com `code` estável | Conforme. Códigos de negócio claros (`STORE_NOT_APPROVED`, `STOCK_BELOW_RESERVED`, `PRODUCT_INCOMPLETE`, `BULK_BLOCKED`...) com `errors[]` por campo |
| Autorização por recurso, 404 para alheio | Conforme no catálogo (toda consulta leva `storeId`), na mídia e nas lojas; falha só em I1. Funcionário com permissão errada: 403; não-membro: 404 |
| Paginação por cursor | Conforme em produtos, moderação e fila de lojas, **com o defeito I3** nos dois primeiros. `activity` devolve lista sem paginar (I2). Seções, equipe, termos: `nextCursor: null` aceitável (conjuntos limitados) |
| `Idempotency-Key` | Só no `POST /products`, sem hash do corpo (I4, I9) |
| Dinheiro em centavos, datas UTC | Conforme (`integer` e `CHECK`; `timestamptz`). Formato divergente da skill: S12 |
| Validação de entrada | `strictObject` e limites em todas as rotas; `Content-Type text/csv` só na importação, 1 MB, 500 linhas, rate limit de 20/h |
| Camadas | `controller → service` respeitado em `stores` e `catalog`; módulos conversam por `index.ts` (`StoresService`, `MediaService`, `ProductOrdersPort`). Sem acesso a tabela alheia além de FK |
| OpenAPI x rotas | Onda 2 sem divergência. A única quebra do teste de contrato é a Onda 3 (endereços) |

## Concorrência de estoque

- **Ajuste de estoque**: `FOR UPDATE` na variação, `applyAdjust` valida faixa e `reserved`, 20 `+1` simultâneos dão `+20` (teste O2-EST-03). Correto.
- **Banco como última barreira**: `CHECK (stock >= 0 AND stock <= 99999 AND reserved >= 0 AND stock >= reserved)` em `product_variants` (`0005`, linha 331). Correto.
- **`setVariants`**: trava o produto e as variações ativas, e recusa desativar/trocar combinação com `reserved > 0`. Correto.
- **O que não dá para revisar ainda**: a reserva (`reserved + n`) nasce na Onda 4A (DT-029/DT-030); hoje só os testes alteram `reserved`. Requisito para a Onda 4A, que o código atual deixa preparado mas não garante: reservar com **uma única instrução atômica** (`UPDATE product_variants SET reserved = reserved + :n WHERE id = :id AND active AND stock - reserved >= :n RETURNING ...`, 0 linhas = sem estoque), nunca ler-e-gravar; liberar na expiração do PIX e no cancelamento pelo mesmo caminho; e o `setVariants`/`adjustStock` continuam seguros porque travam a mesma linha. Teste obrigatório da 4A: N pedidos simultâneos para estoque K, no máximo K reservas.
- **Alerta de estoque baixo**: S2.

## IDOR por loja (resumo da verificação)

| Superfície | Resultado |
|---|---|
| Catálogo (`products`, `variants`, `stock`, `images`, `sections`, `bulk`, `import`) | Toda consulta combina `id` + `storeId` da rota; `bulk` devolve 404 para o pedido inteiro se algum id não é da loja; seção e foto de outra loja são 422/404. Coberto em `catalog.e2e-spec.ts:138` |
| Mídia | `create` exige membro com a permissão da finalidade (404 para não-membro); `get`/`complete` só do dono do upload; `requireReady` confere a loja e a finalidade ao anexar (foto de outra loja → 404, `:116`). Funcionário não vê o upload de outro funcionário: aceitável |
| Loja e documentos | Guard por `:storeId`; DTOs explícitos de saída (CPF inteiro só para dono e admin, SEC-023); URL do documento exige permissão, motivo e auditoria **antes** da URL (falha fechada, testado) |
| Conta de recebimento | `state` amarrado a loja + usuário + sessão, uso único, 10 min; ciphertext com AAD da loja; titular divergente vira `under_review` |
| Equipe | **I1** (revogar convite alheio muda estado antes de negar). Demais rotas filtram por `storeId` |
| Moderação (admin) | `AdminOnly` por permissão; `moderate` audita na mesma transação |

## Upload e processamento de imagem

Conforme o ADR-005/SEC-050: chave gerada pelo servidor; POST pré-assinado com `content-length-range` e tipo fixos; `complete` lê no máximo `max+1` bytes, detecta tipo por magic bytes (o tipo declarado só confere), recusa SVG/HTML/GIF animado, mede antes de decodificar (`limitInputPixels` 40 MP), re-codifica para WebP com rotação do EXIF e sem metadados, original só no bucket privado, rejeitado apaga o objeto. Testes cobrem SVG renomeado, HTML, PNG 20000x20000, EXIF/GPS removido, proporção de logo e capa. Pontos abertos: **I8** (concorrência, timeout que não cancela, 4 decodificações); o caminho "WebP animado" (`pages > 1`, `image.processor.ts:35`) não tem teste; `reject` (`media.service.ts:155`) não tem o guarda `status = 'pending'` que o `ready` tem, então um `complete` concorrente pode marcar como rejeitada uma imagem que a outra acabou de liberar (rara, mesmo resultado de entrada); uploads `pending` vencidos, rejeitados e originais substituídos nunca são apagados do bucket privado (DT-032).

## Índices e desempenho

| Consulta | Situação |
|---|---|
| Lista de produtos da loja | `products_store_idx (store_id, status)` e ordenação em memória por `created_at`: ok até alguns milhares por loja. `ilike '%q%'` sem `pg_trgm` é varredura por loja: ok no MVP |
| Cursor de produtos | Correção de I3 também melhora o plano se virar índice `(store_id, created_at desc, id desc)`; só vale se a lista passar de milhares |
| Fila de moderação | `products_moderation_idx (moderation_status, created_at)` serve; o `join stores` é pequeno |
| SKU por loja | Índice único parcial `(store_id, lower(sku))`: serve a busca da importação |
| Fila de aprovação | Ordena por `coalesce(submitted_at, created_at)` (expressão) sem índice equivalente: sort em memória, fila pequena |
| `store_activity` | Índice `(store_id, created_at)` ascendente; com I2 a consulta passa a ser descendente, o índice ainda serve (leitura para trás) |
| Convites da equipe | Sem índice no `payload->>'storeId'`; hoje carrega tudo (S1) |
| PostGIS | `stores_location_gist` existe (`0005:327`); a prévia de frete usa `ST_Distance` por loja. A busca por raio (`ST_DWithin`) é da Onda 3 |
| Consultas repetidas | `present` de catálogo faz 4 consultas e o de configuração repete 3 (S8); sem N+1 nas listas (variações e capas em lote) |

## Testes que faltam

1. I1: lojista B revoga convite de A (404 e o convite de A continua válido).
2. I2: `activity` com mais de 50 eventos mostra os mais recentes.
3. I3: paginação de produtos com `created_at` idêntico (mesma transação).
4. I4: `stock` com `delta` e `bulk` por percentual repetidos com a mesma `Idempotency-Key` produzem um efeito.
5. I5: dois `PUT /hours` e dois `PUT /holidays` simultâneos.
6. I6: anexar documento e enviar a loja ao mesmo tempo; dois anexos simultâneos do mesmo tipo.
7. I7: `PATCH categoryId: null` em produto ativo.
8. I8: WebP animado recusado; N uploads grandes simultâneos sem passar de um teto de memória (teste de carga, Onda 7).
9. I9: confirmar a importação duas vezes.
10. Moderação: restaurar e remover repetido (S5); produto restaurado volta a poder ser reativado pelo lojista.
11. Seed: falha no meio de uma loja e reexecução (I10).
12. Importação `update` com estoque abaixo do reservado (S4).

## Dívida registrada

DT-032 a DT-034 em `docs/arquitetura/divida-tecnica.md`: uploads órfãos e originais sem limpeza; processamento de imagem sem limite de concorrência; renovação do token OAuth da conta de recebimento.

## Defeitos triviais corrigidos por mim

- `catalog/catalog.service.ts`: `moderationEvent` fazia `await import('./db/schema.js')` de um módulo já importado no topo do arquivo; passou a usar o import estático (`productModerationEvents`). Lint e typecheck limpos. A alteração entrou no commit `2dee544` do backend-dev (a árvore de trabalho é compartilhada e o `git add` dele a levou junto).

## Lista para o backend-dev (ordem)

1. I1 e I2 (pequenos, com teste) e I3 (helper de cursor + teste). 2. I4 (`Idempotency-Key` em `stock` e `bulk`) e I9 (idempotência e transação única na importação). 3. I5, I6, I7. 4. I8 e S9. 5. I10 (seed) depois da confirmação do CEO. 6. S1 a S12 na próxima passada pelo módulo. Para a Onda 4A: reserva atômica de estoque (seção Concorrência) e N1 do adendo da Onda 1.
