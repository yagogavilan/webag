---
name: contrato-api
description: Convenções do contrato REST do Webag (OpenAPI-first, erros, paginação, versionamento, idempotência). Use ao desenhar, implementar ou consumir endpoints.
---

# Fonte da verdade
`docs/arquitetura/api/openapi.yaml` (OpenAPI 3.1). Contrato muda antes do código. O cliente tipado em `packages/shared` é gerado a partir dele (ex.: `openapi-typescript` + `openapi-fetch` ou Orval) — o app nunca escreve tipos de API à mão.

# Convenções
- Base: `/v1`. Mudança incompatível = nova versão ou campo novo opcional; nunca remover/renomear campo usado pelo app publicado (apps antigos ficam meses no ar).
- Recursos no plural, kebab-case: `/v1/stores/{storeId}/products`. JSON em camelCase.
- Datas ISO 8601 UTC. Dinheiro: `{ "amount": 1990, "currency": "BRL" }` (centavos).
- Paginação por cursor: `?limit=20&cursor=...` → `{ "data": [...], "nextCursor": "..." | null }`.
- Filtros e ordenação por query string documentados.
- Operações de escrita que o cliente pode repetir (criar pedido, pagar) aceitam header `Idempotency-Key`.
- Auth: `Authorization: Bearer <token>`. 401 = não autenticado; 403 = sem permissão; 404 também para recurso de outro usuário (não revelar existência).

# Erros (RFC 9457 — application/problem+json)
```json
{
  "type": "https://api.webag.com.br/errors/store-closed",
  "title": "Loja fechada",
  "status": 409,
  "detail": "A loja abre às 08:00.",
  "code": "STORE_CLOSED",
  "errors": [{ "field": "items[0].quantity", "message": "Estoque insuficiente" }]
}
```
`code` é estável e o app decide a mensagem/ação por ele. `detail` pode ser mostrado ao usuário (pt-BR).

# Checklist de um endpoint novo
- [ ] Descrito no OpenAPI com exemplos de sucesso e de erro
- [ ] Autenticação e autorização por recurso definidas
- [ ] Validação de entrada (DTO) e limites (tamanho, quantidade)
- [ ] Paginação se retorna lista
- [ ] Rate limit se é público ou sensível (login, OTP, busca)
- [ ] Teste e2e cobrindo sucesso, validação e acesso indevido
