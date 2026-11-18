# Fila prioritária do backend-dev (decidida pelo CEO, DEC-030)

> O backend-dev lê este arquivo ao iniciar qualquer tarefa. Itens por ordem; marque `[x]` ao concluir.

1. [x] I1 a I4 da Onda 2 (`docs/arquitetura/reviews/review-onda2-api.md`): revogar convite de equipe sem tocar convite de outra loja; `activity` com os 50 eventos MAIS RECENTES; cursor de produtos estável; `Idempotency-Key` em `stock` por delta e `bulk` por percentual. Com testes que reproduzem cada falha.
2. [x] I5 a I10 da Onda 2 (locks em horários/feriados, documentos, categoria nula em produto ativo, limite de concorrência do sharp, importação CSV duplicável) e REMOVER o caminho `SEED_ONDA2=true` em produção (DEC-030d): produção só roda o seed base.
3. [x] S9: e2e com banco e Redis de teste por execução (nome/DB index único).
4. [x] N1: auditar estorno concluído pela conciliação (antes da Onda 4A).
5. [ ] I9 / DT-021 (retenção de dados): antes do G4.
6. [ ] DT-028 a DT-034 conforme o plano.

## Acrescentado pelo CEO após o QA da Onda 2 (DEC-031)
7. [ ] BUG-009 (Média, bloqueia G4): WB-225, limite de exposição de loja nova (R$ 500, 30 dias ou 20 pedidos, parâmetros em RN-02) com lógica no pedido/pagamento e API para a tela do admin/lojista. Entra na Onda 4A.
8. [ ] BUG-010 / I8: teto de concorrência no processamento de imagens (sharp).
9. [ ] DT-038 (DEC-032a): modo `staging` (APP_ENV=staging) aceita provedor `fake` e credencial `TEST-` do Mercado Pago; produção recusa os dois. Atualizar env.prod.example e o guia de deploy.
10. [ ] DT-039 (DEC-032b): Sentry plugável na API (sem DSN = desligado), com máscara de PII.
