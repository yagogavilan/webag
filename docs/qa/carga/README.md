# Carga: scripts k6 e execução indicativa (Onda 7 e G4 final)

Dono: qa-engineer | Atualizado: 2026-11-19 (G4 final) | Plano completo: `docs/qa/plano-carga.md` | Parecer: `docs/qa/relatorios/g4-final.md` §7.

**O k6 rodou** (v1.4.0, release oficial `k6-v1.4.0-linux-amd64.tar.gz`, sha256 conferido contra o arquivo de checksums do mesmo release). Tudo abaixo é **indicativo**: sandbox de 4 vCPU compartilhado, gerador, API, PostgreSQL, Redis, armazenamento e Mailpit na MESMA máquina, 12 lojas e centenas de pedidos de teste no banco. **Nada aqui aprova desempenho de produção**; o que vale é o k6 em staging (seção "O que falta").

## Scripts

| Arquivo | Cenário (plano §4) | Como rodar (API com `TRUST_PROXY=1`, seed completo, provedor `fake`) | Estado |
|---|---|---|---|
| `s1-navegacao.k6.js` | S1 navegação: home, busca por proximidade, loja, produto | `k6 run -e API_URL=http://localhost:3000 -e VUS=200 docs/qa/carga/s1-navegacao.k6.js` (completo: rampa 5 min, platô 10 min; curto: `-e RAMPA=30s -e PLATO=150s -e DESCIDA=15s -e PAUSA_MIN=2 -e PAUSA_MAX=6`) | Executado (curto) |
| `s4b-estoque.k6.js` | S4-B disputa da última unidade: N clientes criam pedido do mesmo produto | `k6 run -e API_URL=... -e CLIENTES=40 -e ESTOQUE=12 -e QTD=4 docs/qa/carga/s4b-estoque.k6.js` (`-e MODO=delivery` depende do horário da logística: RN-19) | Executado |
| `s5-preparar.mjs` + `s5-webhooks.k6.js` | S5 rajada de webhooks assinados (válidos duplicados, assinatura inválida, vencidos, id desconhecido) | `node docs/qa/carga/s5-preparar.mjs 20` (imprime `IDS=`) e `k6 run -e API_URL=... -e IDS=<ids> -e TAXA=50 -e DURACAO=60s docs/qa/carga/s5-webhooks.k6.js`; conferir `select count(*), sum(amount_cents) from ledger_entries` antes e depois | Executado |
| `s9-gerar-imagens.mjs` + `s9-imagens.k6.js` | S9 / BUG-010 fotos grandes em paralelo enquanto a navegação é medida | `node docs/qa/carga/s9-gerar-imagens.mjs` e `k6 run -e API_URL=... -e VUS=10 -e DURACAO=45s docs/qa/carga/s9-imagens.k6.js`; medir o RSS da API antes e depois (`/proc/<pid>/status`) | Executado |
| `lib-setup.k6.js` | preparo de contas (cadastro, e-mail confirmado pelo Mailpit, endereço) e IP de origem fictício por conta | usado pelos três acima | |
| `carga-curta.mjs` | gerador em Node da Onda 7 (mesmos endpoints do S1) | `node docs/qa/carga/carga-curta.mjs` | Substituído pelo k6 no S1 |
| `resultados/g4-*.txt` | saídas completas do k6 desta rodada | | |

Não escritos (precisam de staging, `seed-large` e/ou conta de teste do Mercado Pago): S2 busca com 1.000 coordenadas, S3-A/B autenticação e abuso, S4 checkout sob rampa, S6 tempo real (500 conexões), S7 painel do lojista, S8 relatórios sobre 100 mil pedidos, S10 spike, S11 estresse, S12 soak.

Armadilhas já resolvidas nos scripts (não repetir): o limite de taxa é por IP (cada conta usa `X-Forwarded-For` próprio); `Idempotency-Key` só aceita `[A-Za-z0-9_-]` de 8 a 80 caracteres; o pedido mínimo da entrega (R$ 20) exige 4 unidades do produto de seed; o POST pré-assinado do bucket exige os campos da policy antes do arquivo e o objeto de formulário do k6 não garante a ordem (o `s9` monta o multipart à mão); `upload-create` é 60 por hora por IP, e chaves `rl:upload-*` do Redis de teste podem ser apagadas entre rodadas (só em ambiente de teste).

## Resultados do G4 final (HEAD congelado 0d902ab, API compilada `node dist/main.js`, porta 3400)

| Cenário | Carga | Resultado |
|---|---|---|
| **S1 navegação** | 200 VUs (30 s de rampa, 150 s de platô), pausa de 2 a 6 s, 9.051 requisições, ~43 req/s | **0% de falha**, 100% dos checks. p95 / p99: home 7,3 / 12,2 ms; busca 9,3 / 15,1 ms; loja 13,8 / 19,1 ms; produto 16,9 / 22,3 ms (metas do plano: 500 e 1.200 ms; busca 1.000 e 2.000 ms). RSS da API 613 para 654 MB |
| **S4-B disputa de estoque** | 40 clientes criam pedido de 4 unidades ao mesmo tempo, estoque 12 (retirada) | **3 vencedores, 37 conflitos 409 `STOCK_CONFLICT`, 0 erro 5xx**; no banco `estoque/reservado = 12/12` (reserva exatamente igual ao estoque). Repetiu o resultado do gerador Node da Onda 7 (6 clientes, 3 rodadas) |
| **S5 rajada de webhooks** | 3.001 notificações em 60 s (50/s): 85% válidas duplicadas, 5% assinatura inválida, 5% id desconhecido, 5% vencidas (ts de 10 min atrás) | **0 erro 5xx**; válida = 200 (duplicado), inválida e vencida = 401, 100% dos checks; p95 245 ms. **O ledger não mudou** (1.152 lançamentos e a mesma soma antes e depois) e as tentativas aprovadas continuaram 88: a idempotência segura a rajada |
| **S9 imagens (BUG-010)** | 10 VUs por 45 s: JPEG de 39,9 MP, PNG de 25 MP e PNG de 39,7 MP | 279 uploads aceitos, 134 PNG acima do teto recusados com 422, **0 erro 5xx**; durante o processamento a home teve p95 de 21 ms e o `complete` p95 de 1,28 s. **RSS da API foi a ~950 a 975 MB** depois de várias rodadas de imagem (platô entre as duas últimas: 957 para 973 MB); ver ressalva em `bugs/BUG-010.md` |

## O que falta para a carga valer (NÃO TESTADO)

1. **Staging** com a CPU/RAM do VPS-alvo e o gerador em outra máquina: refazer S1 completo (200 VUs, 5 + 10 + 3 min), S4-B e S5 e escrever S2, S3, S4, S6, S7, S8, S10, S11 e S12 (soak de 2 h para o RSS: o platô de ~950 MB com imagens precisa de teto e alerta no contêiner).
2. `seed-large` do plano §3 (100 mil pedidos, 1 milhão de linhas de auditoria e de ledger) para achar índice ausente e N+1 (DT-017, DT-055, DT-056, DT-036).
3. Mercado Pago real (sandbox): latência do provedor e webhooks reais (a rajada acima usa o provedor `fake`).
4. Rate limit por IP com o proxy real (nginx): aqui o gerador simula IPs por `X-Forwarded-For`.
