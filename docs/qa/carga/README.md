# Carga: esboço k6 e execução curta indicativa (Onda 7)

Dono: qa-engineer | Data: 2026-11-19 | Plano completo: `docs/qa/plano-carga.md` | Relatório: `docs/qa/relatorios/onda-7-reverificacao.md` §8.

| Arquivo | O que é | Estado |
|---|---|---|
| `s1-navegacao.k6.js` | Cenário S1 do plano (home, busca por proximidade, loja, produto), rampa 5 min, platô 10 min, limites do plano §5 | **Esboço, NÃO executado.** O `k6` não está instalado no sandbox; baixei o release oficial v1.4.0 (sha256 conferido contra o arquivo de checksums do mesmo release), mas a execução do binário baixado foi negada pela política do ambiente. Rodar num staging igual à produção |
| `carga-curta.mjs` | Gerador em Node (`fetch`), mesmos endpoints, VUs com IP de origem próprio (`X-Forwarded-For`, exige `TRUST_PROXY=1`), tabela de latência e erros, RSS da API | Executado (abaixo) |

## Limites honestos (leia antes de usar o número)

- **Indicativo, não é aprovação de desempenho.** Gerador, API, PostgreSQL 18.6, Redis, Mailpit e armazenamento rodaram na MESMA máquina de sandbox (4 vCPU, 16 GB) junto com sessões de outros agentes (carga média da máquina entre 2,8 e 6,3 durante as medições). O plano (`plano-carga.md` §1 e §3) exige staging igual à produção e gerador separado.
- Dados: seed completo (12 lojas, 31 produtos, 60 pedidos de demonstração), não os 100 mil pedidos do plano. Consultas sem índice só aparecem com volume.
- Só leituras (S1). Não foram executados S2 a S12: pedidos sob carga, webhooks em rajada, tempo real, painel do lojista, relatórios, imagens (BUG-010), spike, estresse e soak.
- API em modo desenvolvimento (`nest start --watch`, logs e source maps ligados), o que piora o número em relação a `node dist/main.js`.

## Resultado (HEAD `b550088`, API em `localhost:3300` com `TRUST_PROXY=1`)

**Rodada A, pior caso sem pausa entre ações (20 VUs, 60 s).** 70.180 requisições em 60 s (1.169 req/s). O limitador de taxa global por IP respondeu `429` em 88,9% delas (cada VU passou do teto e recebeu 429 até o fim), com p50 de 11 a 12 ms e p95 de 31 a 51 ms (429 inclusos). **Nenhuma resposta 5xx, nenhuma conexão recusada**: a API absorveu a rajada e o freio por IP funcionou. RSS da API subiu de 302 MB para 651 MB nessa rajada e ficou em 651 a 669 MB depois (não voltou ao nível inicial; sem teste de soak não sei se é cache/heap ou vazamento: registrar para a rodada de soak).

**Rodada B, perfil realista (100 VUs, pausa de 1 s entre ações, 60 s, ~280 req/s).**

| Operação | Requisições | Erros | p50 ms | p95 ms | p99 ms | Máx ms | Meta do plano (p95 / p99) |
|---|---|---|---|---|---|---|---|
| home | 4.317 | 43 (429) | 20 | 63 | 99 | 881 | 500 / 1.200 ms |
| busca de lojas (PostGIS) | 4.317 | 43 (429) | 28 | 96 | 124 | 593 | 1.000 / 2.000 ms |
| produtos da loja | 4.317 | 44 (429) | 35 | 165 | 242 | 349 | 500 / 1.200 ms |
| produto | 4.317 | 44 (429) | 43 | 198 | 338 | 461 | 500 / 1.200 ms |

Erros 1,01%, todos `429` do limitador por IP (os VUs mais rápidos passaram de ~60 req/min no mesmo IP fictício); nenhum 5xx. Todas as latências ficaram abaixo das metas do plano, com a ressalva dos limites acima: o p95 de 63 a 198 ms com dados pequenos, mesma máquina e carga baixa NÃO prova nada sobre produção.

**Disputa de estoque (S4-B reduzido, por HTTP, 6 clientes x 3 rodadas):** 3 vencedores e 3 `409 STOCK_CONFLICT` em todas as rodadas, reserva exatamente igual ao estoque (12 de 12); ver `docs/qa/retestes/onda-7.mjs estoque`.

## O que falta para a carga valer (Onda 8 / antes do G4 de produção)

1. Staging com a CPU/RAM do VPS-alvo e o gerador em outra máquina; rodar o k6 (`s1-navegacao.k6.js`) e escrever S2, S3-A, S4, S5, S6 conforme o plano.
2. `seed-large` (plano §3) para pegar índice ausente e N+1 com volume (R.6 do backend).
3. BUG-010 (imagens em paralelo) e o crescimento de memória observado.
