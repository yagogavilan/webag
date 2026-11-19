# ADR-013: Promessa de entrega em faixa (ETA), teto no fim da faixa, atraso, compensação e `deliveredAt`

- **Status:** Aceita (revisada pelo tech-lead em 2026-11-19, ver `reviews/onda-8.md`; regras de negócio são `[HIPÓTESE]` do PO/fundador, parâmetros editáveis no admin)
- **Data:** 2026-11-19
- **Autor:** tech-lead (registra decisões já implementadas por backend-dev nas DEC-053, DEC-054, DEC-064, DEC-068 e DEC-072)
- **Revisores:** security-engineer (SEC-175, SEC-177), product-owner (regra), jurídico (J14, J16)
- **Custo mensal:** nenhum (cálculo local, sem API de rotas; DT-007 segue valendo)

## Contexto
A promessa "chega em até 2 h" (DEC-053) vira obrigação de consumo (CDC arts. 30 e 35). O código precisa de UMA conta de prazo usada por todas as telas, de um teto que faça a frase ser verdadeira, e de regras de atraso que o servidor decide (o app só mostra).

## Decisão
| # | Decisão | Onde |
|---|---|---|
| 1 | **ETA = preparo + despacho + deslocamento**, mostrada como FAIXA (`estimativa ± entrega_faixa_min`, começo nunca antes de 5 min). Deslocamento = `ceil(km em linha reta x fator de rota x min/km)` (PostGIS; sem API de rotas). Função pura, a MESMA em descoberta, loja, produto, sacola, checkout e pedido | `logistics/domain/eta.ts` |
| 2 | **O teto `entrega_max_min` (120) vale para o FIM da faixa**, não para a estimativa; passou, a loja não entrega para o endereço (`OUT_OF_RANGE`). O alcance real sai do teto (`maxDistanceForCeilingM`), não de um raio por loja | `eta.ts`, `delivery-fees.service.ts` |
| 3 | **Fim da faixa antes do fechamento da logística, exclusivo no minuto** (`endsBeforeClosing`); operação contínua (00:00 a 23:59) só exige dia de operação | `logistics/domain/hours.ts` |
| 4 | **A faixa do pedido é ancorada no PAGAMENTO** (`markPaid` regrava `etaFromAt/etaToAt` a partir de `paidAt`): a espera do PIX não é atraso da loja. Com o motoboy a caminho, a faixa só pode ficar MAIS CEDO (`refreshEtaOnDispatch`) | `orders.service.ts` |
| 5 | **`ETA_CHANGED` (409)** no `POST /orders` só se o fim novo passar mais de 5 min do fim aceito (`acceptedEtaToAt`), porque a faixa anda com o relógio. Campo opcional (app antigo não manda e não é bloqueado) | `orders.service.ts`, DEC-068 |
| 6 | **Atraso decidido no servidor** (`lateStateOf`, função pura): passou do fim da faixa = aviso (1 push por pedido, reivindicação atômica `late_notified_at`); fim da faixa + `entrega_atraso_tolerancia_min` = "cancelar sem custo" (imediato antes da saída; em saída vira PEDIDO à operação, com aceite automático no silêncio, `order_cancel_requests.kind = 'late'`) | `orders/domain/late.ts`, `late-delivery.service.ts` |
| 7 | **Compensação** (`entrega_compensacao_tipo`, padrão entrega grátis no próximo pedido) nasce na MESMA transação da entrega, como cupom pessoal da plataforma (`coupons.owner_user_id`, `source_order_id` único: um por pedido, reprocesso idempotente). Não há compensação se a corrida falhou por culpa do cliente (`customer_absent`, `address_not_found`, `customer_refused`, SEC-177) | `late-delivery.service.ts` |
| 8 | **`deliveredAt` informado pela operação** (padrão agora; recuo máx. 60 min; motivo acima de 5 min; nunca no futuro nem antes da saída; histórico guarda a hora informada E a do clique). É a base da compensação, da janela de troca e da medida de "95% dentro da faixa" | `deliveries.service.ts` `resolveDeliveredAt`, migração 0050 |
| 9 | **Hora do relógio é Brasília fixa (UTC-3)**, sem horário de verão (extinto em 2019); tudo em `timestamptz` UTC no banco | `hours.ts` |

## Consequências
- Positivas: uma única fonte do prazo (sem divergência entre telas); regras testáveis sem relógio real (funções puras com `now` injetado); o cliente é protegido por servidor, não por tela.
- Dívida assumida: **DT-072** (a regra "salvo se a operação corrigir a causa do `address_not_found`" da DEC-064 (a) não existe no código; hoje esse motivo sempre bloqueia a compensação) e **DT-073** (a compensação conta o `etaToAt` já encurtado por `refreshEtaOnDispatch`: confirmar com o PO se a promessa vigente é a original ou a encurtada). O recuo de `deliveredAt` pela própria operação é um ponto de abuso aceito, mitigado por auditoria, teto de 60 min e motivo.
- Rever se: houver série histórica (HIP-E01: ajustar `entrega_min_por_km`); API de rotas for contratada (DT-007); o jurídico (J14/J16) mudar a regra de cancelamento sem custo.
