# ADR-011: Trocas, tempo real e notificações (Ondas 4C e 5)

- **Status:** Proposta (pendente revisão do tech-lead; segurança revisa a taxa de troca em conta da Webag e o handshake do socket)
- **Data:** 2026-11-19
- **Autor:** backend-dev
- **Custo mensal:** sem serviço novo. Expo Push Service é gratuito; FCM v1 e APNs dependem das credenciais do fundador no EAS.

## Decisões
| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| 1 | **Uma solicitação = um item** (`exchange_requests`), com histórico append-only e estados validados no servidor (`domain/state.ts`) | Simples de decidir, aprovar e reembolsar; o limite de 1 troca voluntária por pedido conta por pedido | Solicitação com N itens (adia; DT-051) |
| 2 | **Taxa e diferença de preço cobradas em UM pagamento na conta da Webag** (`storeId` nulo, sem split), referência `exchange:<id>`; só depois da aprovação | A taxa é receita da Webag (DEC-037); o split é por loja | Taxa dentro da `application_fee` de um pedido de troca (exigiria pedido novo) |
| 3 | **Valores congelados na aprovação**: taxa = faixa do pedido (`delivery_snapshot.exchangeFeeCents`, teto `taxa_coleta_max_cents`); diferença = preço vigente da peça nova menos o da original, por unidade | RN-05: tabela do admin mudar depois não altera a troca; promoção vencida não cobra | Recalcular a cada leitura |
| 4 | **Reserva do tamanho novo na aprovação** (`inventory.reserve`); baixa quando a peça nova é entregue; libera ao cancelar, expirar ou não pagar. Na aprovação automática, sem estoque vira reembolso | A troca nunca fica presa por falta de estoque; a loja manual recebe `EXCHANGE_NO_STOCK` | Reservar só ao pagar |
| 5 | **Reembolso pelo pagamento do pedido** (`reserveRefundIntent` + `executeScheduledRefund`): item menos cupom proporcional; no arrependimento do último item, também a taxa de entrega | Reaproveita fila de estorno (SEC-130) e o ledger (`onRefundConfirmed`); CDC art. 49 | Estorno manual |
| 6 | **Coleta e reentrega são corridas da logística** (`exchange_pickup`, `exchange_return`), índice único por `(exchange_id, kind)`; a peça nova só sai depois da conferência da loja (DEC-038f) | Mesma fila, mesmos estados e auditoria | App do motoboy (fase 2) |
| 7 | **Aprovação por SLA e prazos por varredura idempotente** (`ExchangesService.sweep`), no mesmo padrão do `OrdersService.sweep`; corrida em "saiu" há mais de `auto_conclusao_entrega_h` é concluída pelo sistema (`DeliveriesService.autoConcludeDue`) | Sem fila nova: a varredura é segura para repetir | BullMQ (fila só onde há I/O externo; aqui o I/O é o banco) |
| 8 | **Socket.IO `/rt` no mesmo servidor**, handshake com o access JWT (sessão ativa), salas decididas pelo servidor, `subscribe` por pedido só do dono ou da loja; guards HTTP globais ignoram mensagens de socket (a autenticação foi no handshake); payload mínimo e versionado | ADR-004; mensagem de WS não tem `req.path` | Cookie no handshake |
| 9 | **Notificações assinam os barramentos de pedido e de troca** (depois do commit); texto em catálogo puro; push sem dado pessoal; falha de canal nunca desfaz o pedido. Push via HTTP do Expo (`fetch`, lote de 100), token revogável e trocado de dono no login de outra conta | Sem dependência nova de SDK; recibos ficam em DT-044 | `expo-server-sdk` + BullMQ (ADR-004; fica para a escala) |
| 10 | **Financeiro da loja lê o ledger**; `receivable` é informativo (split: a Webag não retém nem repassa, DEC-016); comissão/líquido/extrato só do dono (`finance`), vendas para quem tem `sales_values` | RN-10 e RN-13 | Campos soltos do pedido |

## Consequências
- Pendências e dívidas: DT-044, DT-046, DT-049 a DT-051.
- Segurança a revisar (`security-engineer`): taxa de troca em conta sem split (reembolso e pagamento tardio caem em `exchange_attempt_mismatch`), código do balcão (5 tentativas), URL assinada das fotos (5 min), handshake do socket sem limite por IP.
- Contrato: rotas novas em `docs/arquitetura/api/openapi.yaml` (trocas, avaliação, financeiro da loja, relatório, `push-devices`); campo novo `exchange_photo` em `purpose` de upload. Nada removido nem renomeado.
