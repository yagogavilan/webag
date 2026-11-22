# ADR-017: Escala horizontal da API (réplicas, adaptador do Socket.IO, caches)

- **Status:** Proposta (rascunho do tech-lead; não implementar antes de aceita)
- **Data:** 2026-11-22
- **Autor:** tech-lead
- **Revisores:** backend-dev (implementa), security-engineer (sessão WebSocket, Redis), qa-engineer (teste com 2 réplicas), CEO/fundador só se houver custo de servidor novo (CLAUDE.md §7)

Legenda de fontes: ver ADR-001. Medições: `docs/qa/performance/api-2026-11-22.md` (indicativas, 1 máquina de 4 vCPU com gerador de carga junto, PostgreSQL 16, `[HIPÓTESE]` para o VPS-alvo).

## Contexto
- 1 processo Node = 1 vCPU: ~160 a 230 req/s da jornada completa; 1.000 conexões Socket.IO não são gargalo (12 a 33 MB). Pico alvo: ~100 a 300 req/s, VPS de 4 vCPU e 8 a 16 GB.
- Hoje, com 2+ réplicas: (a) `server.to(room).emit` é do processo (sem `@socket.io/redis-adapter`; o ADR-004 dizia "já fica configurado" e não está, nota datada em 2026-11-22); (b) eventos de domínio são em memória (DT-004); (c) `disconnectSession` só alcança os sockets da própria réplica (sessão revogada continua conectada na outra, SEC-010); (d) ~13 `setInterval` em serviços rodam em toda réplica (DT-079); (e) os caches locais (`LocalTtlCache`, DT-082) divergem por réplica.
- Já são seguros com N réplicas: webhook (`FOR UPDATE SKIP LOCKED`), conciliação (advisory lock), unicidade no banco, rate limit em Redis `[verificar no código antes de aceitar]`.

## Opções consideradas
| Opção | Prós | Contras | Custo/complexidade |
|---|---|---|---|
| A. Ficar com 1 processo; escalar a CPU (VPS maior) | Zero mudança; sem dívida nova | O processo único não usa os outros vCPU; teto de ~230 req/s; deploy derruba tudo | Nenhum de código; custo de servidor |
| B. 2 a 3 réplicas no mesmo VPS + `@socket.io/redis-adapter` + nginx `upstream` com `ip_hash` (polling) + timers só em uma réplica (`APP_ROLE`) + caches locais com TTL curto mantidos | Usa os 4 vCPU; deploy sem queda (rolling); sem serviço novo (Redis já existe) | Dependência nova; defasagem do cache local varia por réplica; teste com 2 réplicas | 1 a 2 dias + ~300 a 500 MB RAM por réplica |
| C. B + invalidação por evento via Redis pub/sub (moderação, suspensão, pausa) e/ou cache compartilhado no Redis | Retirada por moderação imediata em todas as réplicas; mesma visão em todas | Cache no Redis custa `GET` + `JSON.parse` por requisição (some o ganho do cache local); pub/sub é mais uma peça | +1 dia; só o pub/sub é barato |
| D. B + processo `worker` separado (imagem, timers, webhook) | Tira picos de CPU/RSS da API (BUG-010); resolve (d) de vez | Mais um contêiner e deploy | +2 a 3 dias |

## Decisão (proposta)
Opção **B**, com o passo **C reduzido a pub/sub de invalidação** só para o que é retirada de segurança (moderação de produto, suspensão/pausa de loja), e `APP_ROLE` (`api` | `all`) para os timers; **D** fica como evolução (gatilho abaixo). Motivo: é o único caminho que usa os vCPU já pagos sem serviço novo; o cache local é o que sustenta o p95 (home 9,4 s -> 37 ms medido) e não deve virar ida ao Redis por requisição.

Requisitos para aceitar:
1. `@socket.io/redis-adapter` 8.3.0 `[V npm 2026-11-18, ADR-004]` ligado em `RealtimeAdapter`; `disconnectSession` por sala (`io.in(room).disconnectSockets()`) para alcançar todas as réplicas. Security valida a revogação entre réplicas.
2. nginx: `upstream` com `keepalive`, afinidade por `ip_hash` só para o transporte de polling (WebSocket não precisa).
3. Timers: inventariar os ~13 `setInterval` (`grep setInterval apps/api/src`), provar cada um idempotente sob N réplicas ou restringir por `APP_ROLE`.
4. Pool: `réplicas x DB_POOL_MAX <= max_connections - 20` (guia de deploy 14.2).
5. Teste e2e com 2 instâncias da API contra o mesmo banco/Redis: evento de pedido chega ao socket da outra réplica; sessão revogada em A é desconectada em B; webhook duplicado entre réplicas processa 1 vez.

## Consequências
- Positivas: ~2x a 3x de capacidade no mesmo servidor `[HIPÓTESE: ~500+ req/s, a medir no staging]`; deploy sem queda.
- Negativas / dívida assumida: DT-082 (defasagem por réplica, até o TTL, aceita para dado de vitrine) e DT-083 (itens 1 a 3 acima, até implementar); +RAM; depuração de evento entre réplicas.
- Reavaliar se: p95 de qualquer rota de leitura > 300 ms com CPU da API < 70% (o gargalo não é CPU), se o RSS passar de ~1 GB por réplica (aplicar D), se houver 2+ devs back-end ou se o VPS mudar de tamanho.

## Fontes
- ADR-004 (Socket.IO + Redis adapter, escala de 1 instância), ADR-007 (worker previsto), DT-004, DT-079, DT-082, DT-083; relatório de desempenho acima, seção 8 item 1.
