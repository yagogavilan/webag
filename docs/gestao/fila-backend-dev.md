# Fila prioritária do backend-dev (decidida pelo CEO, DEC-030)

> O backend-dev lê este arquivo ao iniciar qualquer tarefa. Itens por ordem; marque `[x]` ao concluir.

1. [x] I1 a I4 da Onda 2 (`docs/arquitetura/reviews/review-onda2-api.md`): revogar convite de equipe sem tocar convite de outra loja; `activity` com os 50 eventos MAIS RECENTES; cursor de produtos estável; `Idempotency-Key` em `stock` por delta e `bulk` por percentual. Com testes que reproduzem cada falha.
2. [x] I5 a I10 da Onda 2 (locks em horários/feriados, documentos, categoria nula em produto ativo, limite de concorrência do sharp, importação CSV duplicável) e REMOVER o caminho `SEED_ONDA2=true` em produção (DEC-030d): produção só roda o seed base.
3. [x] S9: e2e com banco e Redis de teste por execução (nome/DB index único).
4. [x] N1: auditar estorno concluído pela conciliação (antes da Onda 4A).
5. [ ] I9 / DT-021 (retenção de dados): antes do G4.
6. [ ] DT-028 a DT-034 conforme o plano.
