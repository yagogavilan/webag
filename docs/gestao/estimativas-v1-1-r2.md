# UT gastas na R2.1 (correções) e na R2.2 (motor de cupons), back-end

Autor: backend-dev | Data: 2026-11-23 | `[HIPÓTESE]` (as UT não são medidas; conto marcos fechados: entrega com testes e commit, como em `estimativas-v1-1-r1.md` §8). Erro esperado: ±2 UT.

| Bloco | Marcos | UT | Evidência |
|---|---|---|---|
| Fase A: correções do contrato, ADR-019 aceito, migração 0066 com down, testes de schema e de reversão, SEC-224 a SEC-231, R1 a R12 | 1 | ~2,0 | `4f433d3` |
| Fase B: domínio puro (composição com propriedade, ativação, simulação, HMAC, e-mail), antifraude, reserva atômica, administração das campanhas (14 rotas) | 1 | ~4,5 | `08e9829` (commit do orquestrador sobre o meu diretório de trabalho, mensagem "wip"), `e9899b5` |
| Fase B: integração em `orders` e `cart` (reserva, confirmação, devolução, estorno), teste e2e (22 casos) com concorrência, deadlock e replay | 1 | ~3,0 | idem |
| Fase B: correções de testes legados que dependiam da lista de migrações, limpeza de bancos de teste (disco), medição de `createOrder`, k6, documentos | 1 | ~1,0 | este commit |
| **Total** | 4 | **~10,5** (faixa 8,5 a 12,5) | |

Contra o plano (R2.2 backend: 22 a 27 UT, mediana ~25 de TL; WB-343/345/346/347 são R2.3): o que foi feito aqui cobre WB-340, 342, 344, 349 e parte de 341, e custou ~8,5 UT da R2.2 (sem a Fase A). Não dá para concluir que a estimativa de 22 a 27 estava alta: a R2.3 ainda tem a adesão, o relatório, o cupom da loja, a vitrine e os painéis. O que ficou mais caro que o previsto: integrar reserva, confirmação e devolução em `closeOrder`, pagamento e estorno sem regressão (cabe 1 UT de testes legados) e o disco do ambiente de teste (bancos de teste esquecidos encheram o disco; coberto em DT, não em UT).
