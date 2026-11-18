# ADR-010: Descoberta, sacola no servidor e contrato de checkout (Onda 3)

- **Status:** Proposta (pendente revisão do tech-lead; segurança revisa localização na T3A-09)
- **Data:** 2026-11-18
- **Autor:** backend-dev
- **Revisores:** tech-lead, security-engineer
- **Custo mensal:** sem serviço novo. Reaproveita PostgreSQL (extensões `unaccent` e `pg_trgm`, do contrib) e o Redis já previstos.

## Contexto
A Onda 3 entrega a descoberta do cliente e a sacola; a Onda 4 entrega pedido e pagamento. O plano (T3B-01, ação A-02) pede decidir se a sacola é local, na API ou híbrida e publicar o contrato antes de o app implementar.

## Decisões
| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| 1 | **Sacola no servidor para quem tem conta; visitante guarda no aparelho e junta no login** (`POST /v1/cart/merge`, RN-05) | Preço, estoque, horário e frete precisam ser revalidados no servidor de qualquer jeito (RN-05); com a sacola lá, o checkout confere uma `revision` em vez de confiar em valores do app; troca de aparelho funciona | Só local: o checkout teria de aceitar a lista de itens do cliente e recalcular tudo, sem aviso de mudança por item |
| 2 | **Uma sacola por conta, sem `cartId` na URL** (`/v1/cart`) | Sem identificador na rota não existe IDOR; DEC-006 (uma loja por pedido) vira índice único em `carts.user_id` e `store_id` único na sacola | Recurso `/carts/{id}` |
| 3 | **`PUT /v1/cart/items/{variantId}` define a quantidade absoluta** (idempotente) em vez de `POST` que soma | Repetição em 3G instável não soma duas vezes; dispensa `Idempotency-Key` nas escritas da sacola | `POST` com `Idempotency-Key` e armazenamento da chave |
| 4 | **A leitura não altera a sacola; `POST /v1/cart/acknowledge` aceita as mudanças** | O cliente só paga valor que viu: aviso por item na leitura, aceite explícito antes de pagar | Corrigir silenciosamente na leitura |
| 5 | **Descoberta por posição exata** (`lat`/`lng` na query, sem cache compartilhado; cache Redis de 30 s por posição idêntica); coordenadas mascaradas no log de acesso | A borda do raio é exata (teste com `ST_Distance` arredondado, igual ao checkout); LGPD: posição do cliente não vai a log | Cache por célula de grade (erra a borda) ou `POST` com a posição no corpo (perde cache HTTP) |
| 6 | **Loja visível calculada em SQL** (aprovada, conta de recebimento ativa, 1+ produto ativo, cidade ativa; `ST_DWithin` no índice GiST com o raio máximo e depois a regra da loja com `deliveryFee`, a mesma função do checkout) | RN-03 e RN-04 em um lugar só; sem tabela materializada | Coluna `visible` mantida por gatilho (risco de ficar velha) |
| 7 | **Busca por `f_norm` (unaccent + lower, imutável) e `pg_trgm`** com índice GIN; 1 erro de digitação tolerado a partir de 4 letras, trecho exato abaixo disso | WB-013 C1 sem serviço novo (Meilisearch/Elastic só se o volume pedir; custo e operação extras) | Motor de busca externo |
| 8 | **Cursor de busca por deslocamento** (`{o: n}`), cursor por data e id nas avaliações e nos favoritos | Ordenação por relevância/distância mistura chaves; o deslocamento basta no volume do MVP. DT-036: trocar por keyset se as listas crescerem | Keyset em todas as ordenações |
| 9 | **Cupom e uso de cupom como tabelas desta onda** (`coupons`, `coupon_redemptions`); validação em função pura | A sacola precisa validar cupom (WB-022); a gestão por lojista e admin é WB-073/WB-116 | Esperar a Onda 5 |
| 10 | **Resumo de valores em função pura (`summarize`)**, a mesma que o pedido usará | O que a sacola mostra é o que o pedido cobra (RN-05) | Duas implementações |
| 11 | **Contrato de pedido publicado com `x-planned`**: o teste de contrato exclui essas operações da comparação com as rotas reais e falha se uma delas já existir | O app gera o cliente tipado agora; a marca sai quando a Onda 4 implementar | Documento à parte (o cliente não seria gerado) |
| 12 | **`Idempotency-Key` obrigatória em `POST /v1/orders`**, vale 24 h; mesma chave com corpo diferente é 409 | Toque duplo em "Pagar" nunca cria dois pedidos nem duas cobranças | Deduplicar por conteúdo |

## Consequências
- **Vazio de dados:** "Mais vendidos" fica vazio até existirem pedidos (Onda 4); a seção vem vazia e o app a oculta (WB-012 C4). Avaliações são só leitura (a gravação é a Onda 5A); `reviews.order_id` ganha FK na Onda 4.
- **Primeira compra:** `PurchaseHistoryPort` devolve "sem compra paga" até existir `orders`; a Onda 4 troca a implementação.
- **Comissão do teto de cupom da plataforma** usa o padrão global; a comissão por loja e categoria (WB-105) entra depois.
- **Preço por variação na busca:** filtro e ordenação usam o preço vigente do produto, não o mínimo entre variações (DT-035; corrigir se houver produto com variação de preço muito diferente).
- **Cache de 30 s** na home e na busca: uma pausa feita pelo lojista pode levar até 30 s para sumir da lista; o checkout revalida sempre.
- **Pendências de negócio:** limite por pedido de loja nova (`loja_nova_pedido_max_cents`, DEC-016) fica para o pedido; fim de cupom por loja/categoria alvo da plataforma (RN-09) não implementado.
