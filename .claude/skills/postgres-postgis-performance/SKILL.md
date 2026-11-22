---
name: postgres-postgis-performance
description: Performance e segurança de dados no PostgreSQL 18 + PostGIS 3.6 com Drizzle - índices, EXPLAIN, N+1, paginação, transações e locks de estoque, pool, consultas geográficas e migrations seguras. Use ao criar tabela/consulta/índice, escrever migration ou investigar consulta lenta.
---

# Fluxo para toda consulta nova
1. Escreva a consulta (Drizzle ou `sql` tipado) e identifique filtro, junção e ordenação.
2. `EXPLAIN (ANALYZE, BUFFERS)` num banco com volume realista (seed grande, não 10 linhas). Procure: `Seq Scan` em tabela grande, estimativa de linhas muito diferente da real (rodar `ANALYZE`), `Sort` em disco, `Nested Loop` com muitas voltas.
3. Crie o índice que serve o plano; meça de novo; registre antes/depois no PR. Índice custa escrita e disco: não crie "por via das dúvidas".

# Índices
- Cubra `WHERE`, `JOIN` e `ORDER BY` reais. Compostos: igualdade primeiro, depois intervalo/ordem. **Colunas de FK precisam de índice** (o Postgres não cria sozinho).
- **Parciais** para o subconjunto quente: pedidos ativos (`WHERE status NOT IN (final)`), produtos `active`, lojas abertas, `webhook_events` pendentes. Único parcial para regra de negócio (ex.: 1 troca aberta por item).
- `INCLUDE` para evitar ida à tabela em listas muito lidas. Remova índice duplicado/não usado (`pg_stat_user_indexes`).
- Texto de busca: `pg_trgm`/FTS só com `EXPLAIN` provando ganho.

# PostGIS (ADR-008)
- Coluna `geography(Point, 4326)` + índice **GiST**. Raio de entrega e lojas perto: `ST_DWithin(geog, ponto, metros)` (usa o índice). Nunca `ST_Distance(...) < x` no `WHERE` (não usa índice).
- Calcule distância para exibir/ordenar **só sobre o resultado já filtrado** por `ST_DWithin`; para "N mais próximas", conferir no `EXPLAIN` o uso do índice por distância (KNN) [HIPÓTESE: validar na versão fixada].
- Ordem das coordenadas: `ST_MakePoint(longitude, latitude)`. Valide lat/long na entrada. Zona de entrega poligonal: índice GiST também e `ST_Covers`.

# N+1 e volume
- Laço com consulta dentro é bug: use `JOIN`, `IN (...)`/`= ANY($1)` ou carregue em lote e monte em memória. No Drizzle, `with` do relational query resolve em poucas consultas; confira o SQL gerado.
- Lista sempre paginada. Cursor = **keyset** `(created_at, id) < ($1,$2)` com índice na mesma ordem; nada de `OFFSET` grande. Contagem total exata só se a tela exige.
- Selecione só as colunas necessárias (respostas enxutas para 3G). Operações em massa em lotes (`INSERT ... VALUES` múltiplo, `UNNEST`).

# Transações e concorrência
- Transação **curta**; nunca chamar API externa (Mercado Pago, SMTP, S3) com transação ou conexão do pool presa. Padrão: gravar intenção, fora da transação chamar o provedor, gravar o resultado (já usado em `payment_refund_intents`).
- Estoque: decremento atômico `UPDATE ... SET stock = stock - $q WHERE id = $id AND stock >= $q` (0 linhas = sem estoque) ou `SELECT ... FOR UPDATE` (`.for('update')`). Ordem de lock consistente (por id) para evitar deadlock.
- Fila no banco: `FOR UPDATE SKIP LOCKED`. Idempotência: `INSERT ... ON CONFLICT DO NOTHING` + `unique`. Evitar `SERIALIZABLE` global; use lock explícito onde há invariante.
- `statement_timeout` e `lock_timeout` por papel/sessão; `idle_in_transaction_session_timeout` ligado.

# Pool de conexões
Tamanho de `pg.Pool` calculado: (instâncias API + worker) x `max` <= conexões do servidor com folga. Lock de longa duração (ex.: conciliação) em conexão dedicada, não retendo a do pool (achado nos reviews de onda 1 e 3-5). Se escalar, PgBouncer em modo transação (cuidado com prepared statements e advisory locks de sessão).

# Migrations seguras (drizzle-kit, SQL revisado à mão)
| Operação | Como |
|---|---|
| Coluna nova | Nula ou com default constante; backfill em lotes; só depois `NOT NULL` |
| `NOT NULL`/FK/`CHECK` em tabela grande | `ADD CONSTRAINT ... NOT VALID` e depois `VALIDATE CONSTRAINT` |
| Índice em tabela viva | `CREATE INDEX CONCURRENTLY` (não roda dentro de transação: migration própria) |
| Renomear/remover | Expandir, migrar uso, só então contrair em release posterior (apps antigos ficam no ar) |
Toda migration: `lock_timeout` curto, plano de reversão ou nota "irreversível" (apagar dado exige autorização do fundador), testada em banco de teste com dados.

# Modelagem (reforço)
Dinheiro em centavos `integer`/`bigint`; `timestamptz` em UTC; UUID v7 (`uuidv7()` do PG 18); enum por `CHECK`/tabela; `jsonb` só para dado sem filtro frequente. Autorização é na API (ADR-003): **não** adotamos RLS do Supabase como controle principal.

# Monitoramento
Habilitar `pg_stat_statements`; revisar top consultas por tempo total; acompanhar autovacuum e inchaço em `orders`, `webhook_events`, `idempotency_keys` (expirar/limpar em job).

## Fontes e licença
- supabase/agent-skills, skill `supabase-postgres-best-practices` (MIT, LICENSE conferido: Copyright 2026 Supabase), consultada em 2026-11-22. Foi possível ler só o SKILL.md (categorias e prioridades); os arquivos de regras não foram lidos. Adaptado: prioridade query/conexão/schema/lock/monitoramento reescrita para PG18 + PostGIS + Drizzle; seção PostGIS, estoque e migrations criadas; categoria RLS não adotada. Detalhes técnicos de índices, `NOT VALID` e `CONCURRENTLY`: conhecimento geral do PostgreSQL.
