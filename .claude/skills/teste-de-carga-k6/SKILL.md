---
name: teste-de-carga-k6
description: Método para desenhar, executar e ler testes de carga com k6 no Webag: modelo de carga, thresholds, ambiente válido, invariantes de correção sob concorrência e leitura de resultado. Use ao planejar ou rodar carga antes do G4, ao investigar lentidão ou ao validar rajadas (webhooks, disputa de estoque).
---

# Teste de carga com k6

O plano concreto (cenários S1 a S12, metas, invariantes I1 a I12) está em `docs/qa/plano-carga.md`; scripts em `docs/qa/carga/`. Esta skill é o **método** para não tirar conclusão errada.

## 1. Comece pela pergunta
Cada teste responde uma pergunta: "sustenta 2x o pico nominal?", "onde quebra primeiro?", "a última unidade de estoque é vendida uma só vez sob disputa?", "a rajada de webhooks perde evento?". Sem pergunta, não rode.
| Tipo | Pergunta | Forma |
|---|---|---|
| Smoke | O script e o ambiente funcionam? | 1 a 2 VUs, 1 min |
| Carga nominal | Atende as metas no pico esperado? | rampa, platô, descida |
| Estresse | Onde quebra e como? | degraus até erro > 5% ou p95 > 5 s |
| Pico (spike) | Aguenta salto súbito? | 20 -> 400 VUs em 30 s |
| Resistência (soak) | Vaza memória, conexão ou fila? | 2 h em nominal |

## 2. Modelo de carga
- Prefira **modelo aberto** (executors `ramping-arrival-rate`/`constant-arrival-rate`, requisições por segundo) para tráfego de internet; VUs fixos (modelo fechado) escondem saturação porque o gerador "espera" o servidor. Confira `dropped_iterations`: se cresce, o gerador não conseguiu manter a taxa.
- Pausa de usuário (think time) de 5 a 15 s em navegação. Dados variados por VU (tokens, coordenadas, termos): carga com o mesmo dado mede cache, não o sistema.
- Tokens gerados em `setup()`, fora do tráfego medido. Reenvio duplicado (`Idempotency-Key`, webhook repetido) faz parte do modelo.

## 3. Thresholds (o script reprova sozinho)
Declare por cenário/tag, em p95 e p99, nunca média: `http_req_duration{scenario:busca}: ['p(95)<1000']`, `http_req_failed: ['rate<0.005']`, mais `checks` para correção da resposta (status e campo). Valores vêm das metas do plano (WB-013: busca p95 <= 1 s). Use `abortOnFail` com `delayAbortEval` só em estresse, para parar quando já quebrou. 429 esperado de rate limit não conta como falha do sistema, mas precisa ser separado por tag.

## 4. Ambiente válido
Staging com a mesma CPU/RAM/versões da produção e a mesma imagem; gerador em **máquina separada** (k6 consome CPU); banco restaurado do mesmo dump; `PAYMENT_PROVIDER=fake`; nunca produção; nunca chamar MP/SMS reais. Teste em notebook = indicativo, não aprovação (registre a limitação). Contorno de rate limit (IP por VU) só em staging e validado para não existir em produção (SEC-036). Segredos de teste fora do git (`.env`, regra 1 do CLAUDE.md). Servidor novo para ensaio gasta dinheiro: pedir autorização do fundador.

## 5. Correção vale mais que latência
Depois (e durante) a carga, rode as invariantes por SQL/script: estoque nunca negativo, 10 pedidos para 10 unidades com 100 disputantes, 1 efeito por chave de idempotência e por pagamento, pagamento aprovado = pedido RECEBIDO, soma de estornos <= valor pago, evento só para o dono. **Linha retornada = carga reprovada**, mesmo com p95 perfeito.

## 6. Ler o resultado
1. Confira validade: erros do gerador, `dropped_iterations`, warm-up (descarte o início), cache frio x quente.
2. Compare com os thresholds; olhe p95 **e** p99 e a distribuição por cenário, não o agregado.
3. Cruze com o servidor: CPU, RAM, conexões do pool, `pg_stat_statements` (top 10 por tempo total), Redis, profundidade e latência da fila. O primeiro recurso saturado é o gargalo.
4. Hipótese -> ajuste (índice, N+1, pool) -> **repita com o mesmo cenário**; mudou uma coisa por vez.
5. Relatório `docs/qa/carga-AAAA-MM-DD.md`: pergunta, commit/imagem/versão do k6, dados, resultados vs. metas, invariantes, gargalo, recomendação (APROVA/RESSALVA/REPROVA) e limites da prova (50 lojas não prova 5 mil).

## Fontes e licença
- Práticas de k6 (executors, thresholds, checks, tipos de teste) de conhecimento geral; a documentação do k6 (grafana.com) **não foi consultada** nesta sessão (domínio fora da rede permitida) e a licença não foi conferida, então nada foi copiado: inspirado em, texto próprio.
- Webag: `docs/qa/plano-carga.md`, ADR-006, ADR-007. Nenhuma skill pública foi adotada.
