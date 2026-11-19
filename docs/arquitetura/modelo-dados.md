# Modelo de dados — Webag (estado da Onda 1)

Dono: backend-dev | Data: 2026-11-18 | Fonte da verdade: `apps/api/src/modules/*/db/schema.ts` (Drizzle) + `apps/api/drizzle/*.sql` (migrações versionadas, aplicadas por `pnpm db:migrate`; nunca alterar banco à mão).

Convenções: PK `uuid` (`gen_random_uuid()`, v4; o `uuidv7()` do ADR-007 é do PG 18 e o CI/dev local roda em versões variadas, então fica como evolução, ver DT-016); dinheiro em centavos `integer`; datas `timestamptz` UTC; colunas `snake_case` no banco (Drizzle `casing`).

## identity (`users`, sessões, códigos)
| Tabela | Conteúdo | Pontos de segurança |
|---|---|---|
| `users` | e-mail (minúsculo, único, `CHECK lower`), senha Argon2id, nome, celular (dígitos), status (`active/blocked/deleted`), `email_verified_at`, `adult_declared_at` | Sem CPF nem data de nascimento (minimização). Nunca exposto: `password_hash` |
| `user_roles` | `customer`, `merchant` | Papel de lojista só com e-mail confirmado (SEC-008b) |
| `admin_profiles` | perfil (`super_admin/operations/finance/support`), `active`, segredo TOTP cifrado (AES-256-GCM, AAD = user), `totp_last_step` (anti-replay), `totp_reenroll_required_at` (usou código de recuperação: o acesso continua exigindo 2º fator, SEC-113), `totp_setup_deadline_at` (48 h para o 1º enrolamento) | TOTP obrigatório (SEC-015) |
| `admin_recovery_codes` | 10 códigos por admin como HMAC-SHA256, `used_at` | Uso único atômico |
| `sessions` | uma por família de refresh: IP, user agent, device, `absolute_expires_at` (90 d), `revoked_at`, `mfa_verified_at`, `mfa_factor` (`totp`/`recovery`; só a sessão `recovery` reconfigura um TOTP perdido, SEC-113), `reauth_at` | Access token só vale com sessão ativa no banco (SEC-010) |
| `refresh_tokens` | SHA-256 do token opaco, `used_at`, `expires_at` (30 d deslizante) | Rotação a cada uso; reuso fora de 30 s revoga a sessão (SEC-011) |
| `auth_codes` | HMAC do código de 6 dígitos por (usuário, finalidade), validade, tentativas, `consumed_at`, `invalidated_at` | SEC-002 |
| `invitations` | hash do token (256 bits), tipo (`admin`, `store_staff`), e-mail, payload, 48 h (admin), `used_at`, `revoked_at` | SEC-017; reativação de admin usa o mesmo mecanismo (SEC-093) |
| `store_members` | (loja, usuário, `owner/staff`, permissões) | RBAC por loja (ADR-003). `store_id` sem FK até a tabela `stores` (Onda 2) |
| `access_log` | login, refresh, cadastro, reset, replays | Retenção de 6 meses (SEC-075): job de purga pendente (Onda 6) |

## users (conformidade)
`terms_acceptances` (aceite versionado por documento, IP e plataforma; append-only) e `consents` (eventos de concessão/revogação por finalidade, versão do texto, canal; append-only).

## admin (configuração e auditoria)
| Tabela | Conteúdo |
|---|---|
| `cities`, `neighborhoods` | Regiões (WB-118). Geografia PostGIS entra com ADR-008 (Onda 3). Nome de bairro único por cidade (case-insensitive) |
| `categories` | 2 níveis, nome único por nível, ícone de biblioteca fixa |
| `parameters` / `parameter_history` | Valor corrente; definição, faixa e padrão ficam em `parameters.definitions.ts` (RN-02). Histórico append-only com motivo |
| `feature_flags` | Flags de HIP-042; definição em `feature-flags.definitions.ts` |
| `legal_documents` | Termos do cliente, do lojista e privacidade; versões imutáveis, `relevant_change`, `change_summary` ("o que mudou") |
| `audit_log` | Quem, o quê, antes/depois (sem segredos), IP, `user_agent`, `request_id`, motivo. **Append-only por trigger** (SEC-074, WB-123 C3) |

## payments (base, ADR-002)
| Tabela | Conteúdo |
|---|---|
| `payment_attempts` | Tentativa por pagamento: provedor, ID no provedor (único por provedor), `external_reference` (pedido, Onda 4), loja recebedora, método, status, valor e comissão em centavos, `receiver_account_id` (conta do provedor que recebeu; estorno e re-consulta usam os tokens dela, SEC-130). **Sem coluna de cartão, CPF ou documento** (SEC-044) |
| `delivery_fee_tables` / `delivery_fee_tiers` | Tabela de taxa de entrega do admin (L.1, DEC-036): uma VERSÃO por gravação (escopo `default`/cidade/bairro em `scope_key`, `effective_from`, motivo, autor; nunca retroativa) com até 6 faixas `[from_m, to_m)` (taxa de entrega, taxa de troca, custo previsto do motoboy, minutos). O pedido guarda `orders.delivery_snapshot` (faixa usada) |
| `couriers` / `deliveries` / `delivery_events` | (SEC-143: `store_return_confirmed_at/by/via`; SEC-144: `contact` é apagado depois de `pii_corrida_retencao_dias`, marcando `pii_cleared_at`) Logística da Webag (L.3, DEC-036): motoboy (nome, WhatsApp, ativo, aceite dos documentos; sem CPF), corrida (uma por pedido de entrega, estados RN-18, taxa cobrada e custo previsto/real, foto mínima de contato, código de entrega) e histórico append-only (trigger). `orders.status` ganha `ready_for_collection` |
| `products.size_chart` / `no_voluntary_exchange`, `reviews.fit` | Tabela de medidas (WB-246), produto sem troca voluntária (WB-244) e "como vestiu" `small/ok/large` (WB-247), DEC-037 |
| `exchange_requests` / `exchange_events` | (DT-050: `reminder12_sent_at`/`reminder4_sent_at`, `contested_at`/`contestation_text` e `mediation_started_at`) Troca/devolução de UM item de pedido entregue (T.2, DEC-037): tipo (`withdrawal`/`defect`/`size_color`), método (`pickup_at_home`/`drop_at_store`), resolução (`replace`/`refund`), estado (`requested`, `awaiting_fee`, `approved`, `item_received`, `completed`, `rejected`, `cancelled`, `expired`, `in_mediation`), variação nova e `reservation_state` (reserva na aprovação), taxa e diferença congeladas na aprovação, tentativa de pagamento da taxa (`exchange:<id>`), reembolso, código do balcão (6 caracteres), prazos (SLA da loja, janela do tipo, item do cliente) e fotos privadas (`media_assets.purpose = exchange_photo`). Índice único parcial: 1 solicitação aberta por item. Histórico append-only em `exchange_events` (quem, quando, de/para, motivo; inclui o ator `system`). `deliveries` ganha índice único `(exchange_id, kind)` |
| `push_devices` | Token Expo por aparelho (único; muda de dono no login de outra conta; `disabled_at` quando o Expo diz `DeviceNotRegistered`) |
| `reviews` (índice `reviews_order_target_uq`) | Uma avaliação por produto e uma da loja por pedido (sem edição) |
| `payment_refund_intents` | Intenção de estorno (gravada antes de chamar o provedor; `in_flight_until` é o lease de quem chama o provedor, SEC-141): `pending` (com `failures`, `next_attempt_at` e backoff de 5 min a 24 h), `done`, `exhausted` (6 falhas: fila do admin) ou `covered` (Webag assumiu, DEC-020a; `covered_by/at`, motivo). SEC-130 |
| `payment_refunds` | Estornos, com chave de idempotência única por tentativa; append-only |
| `webhook_events` | Fila durável e idempotência (`unique(provider, event_key)`); tentativas e próxima tentativa (backoff exponencial); `failed` = dead-letter |
| `payment_alerts` | Divergências de conciliação, pagamento desconhecido, webhook esgotado |

## Triggers e constraints que valem como teste
`webag_forbid_mutation()` bloqueia UPDATE/DELETE (e TRUNCATE no audit) em `audit_log`, `parameter_history`, `terms_acceptances`, `consents`, `payment_refunds`, `legal_documents` para qualquer role (testado em `test/admin-config.e2e-spec.ts`).

## Onda 3 (descoberta, endereços, sacola)
| Tabela | Conteúdo |
|---|---|
| `user_addresses` | Endereços salvos (até `enderecos_max`); `lat`/`lng` + coluna GERADA `location geography(Point,4326)` com GiST; um padrão por usuário (índice único parcial); sem duplicar CEP+número+complemento |
| `banners` | Banner da home 2:1; cidade nula = todas; destino loja, categoria, produto, cupom ou nenhum; período e posição |
| `reviews` | Avaliação de loja (`product_id` nulo) ou produto; só leitura na Onda 3; `order_id` sem FK até a Onda 4; remoção é `status = removed` |
| `favorites` | Loja OU produto por usuário (CHECK de um alvo só; únicos parciais) |
| `search_history` | Últimos 10 termos distintos por usuário (`term_key` sem acento/caixa) |
| `coupons`, `coupon_redemptions` | Cupom (percentual, fixo, frete grátis; escopo loja/plataforma) e uso por pedido (devolvido com `released_at`) |
| `carts`, `cart_items` | Sacola por conta (`carts.user_id` único), uma loja; `revision` sobe a cada mudança; `seen_price_cents` guarda o preço que o cliente viu |

Funções e índices: `f_norm(text)` (unaccent + lower, IMUTÁVEL) com índices GIN `pg_trgm` em `products.name` e `stores.name`; índice GiST de `stores.location` (migração 0005) alimenta `ST_DWithin` da descoberta. Migrações 0009 a 0011.

## Próximas ondas
Onda 2 adiciona `stores` (+ FK de `store_members`), documentos e catálogo; Onda 3 adiciona geografia (`geography(Point,4326)` + GiST); Onda 4 adiciona pedidos, `idempotency_keys`, `ledger_entries` (append-only, SEC-041) e liga `payment_attempts.external_reference` ao pedido.

### Ledger: contas e tipos acrescentados (DT-049)
`ledger_transactions.kind` ganha `exchange_fee`, `exchange_fee_refund`, `logistics_cost` e `courier_payout`; `ledger_entries.account`, `exchange_fee_revenue` (receita da taxa de troca), `logistics_cost_expense` (despesa), `courier_payable` (a pagar ao motoboy) e `courier_payout_cash` (PIX pago por fora). São colunas `text` (sem migração); o `order_id` é o do pedido original e a loja é nula nos lançamentos de logística. O custo não é "por loja": o extrato do lojista (`store-finance`) continua lendo só `sale`, `provider_fee`, `refund`, `coverage` e `adjustment`.

## privacy (O6.1, ADR-012)
| Tabela | Conteúdo |
|---|---|
| `account_deletions` | Pedido de exclusão: `via` (app/web), `requested_at`, `effective_at` (anonimização; = pedido quando `exclusao_arrependimento_horas` = 0), `status` (`pending`/`completed`/`cancelled`), `summary` (só contagens), loja do dono encerrada (`store_id`, `store_previous_status`), falhas. Índice único parcial: um pendente por conta |
| `data_exports` / `data_export_links` | Exportação do titular (fila `queued` → `ready` → `expired`; arquivo `exports/<user>/<id>.json` no bucket privado; uma em andamento por conta) e link de download (256 bits só como hash, uso único, `exportacao_link_min`) |
| `privacy_requests` / `privacy_request_events` | Pedido de titular (LGPD art. 18): protocolo `PV-0001` (sequência `privacy_protocol_seq`), tipo, canal, prazo de 15 dias, alerta aos 10, resposta; histórico append-only por convenção. O e-mail do solicitante é mascarado na lista; revelar exige reautenticação e auditoria |
| `retention_runs` | Cada execução do expurgo diário (DT-021): só contagens e mensagens de falha |
| `stores.status = 'closed'` | Estado terminal que só nasce da exclusão da conta do dono (sem transição de usuário) |

Na anonimização a linha de `users` fica como casca (`deleted-<uuid>@anon.webag.invalid`, "Conta excluída") para manter FKs de pedidos e ledger; o endereço do pedido vira `{city, state, cityId}`. `consents` e `terms_acceptances` (append-only por trigger) permanecem como prova.

## Onda 6 (O6.2 a O6.5)
| Tabela | Conteúdo |
|---|---|
| `push_campaigns` / `push_campaign_recipients` | Push de marketing (WB-197): segmento (JSON), destino, janela (`send_at`), contagens (estimados, enviados, entregues, excluídos pelo limite semanal); quem recebeu cada campanha (base do limite de `push_mkt_max_semana`, das aberturas e dos descadastros). O público é recalculado no envio |
| `home_highlights` | Destaque fixado na Início (loja ou produto) por cidade e período (WB-115 C4) |
| `banners.impressions` / `clicks` | Contadores totais do banner (WB-115 C5), sem dado do cliente |
| `help_faqs` / `content_settings` | Perguntas da ajuda por público e grupo (cliente: order, payment, exchange, account; lojista: orders, products, exchanges, money, team) e configuração de contatos (WhatsApp, e-mail, horário, encarregado), editáveis pelo admin |
| `content_reports` | Denúncia de avaliação, produto ou loja; única por (alvo, denunciante); `status` open/kept/removed/forwarded |
| Redis | `rt:ticket:<hash>` (ticket de tempo real, 60 s, `GETDEL`) e `card-intent:<hash>` (intenção de cartão, 15 min, `GETDEL`); nenhum dado de cartão |

Sem tabela nova (O6.2/O6.4): relatórios do admin são consultas sobre `orders`, `order_items`, `stores`, `users` e o ledger; a série de vendas por dia é uma consulta sobre `orders`.

## R.3 (I2/I3): contestação do pagamento (migração 0036)
`orders.disputed_at timestamptz` (nulo): o provedor contestou o pagamento (`charged_back`/`in_mediation`). Não muda `status`; acompanha o alerta `payment_disputed`, o lançamento `adjustment` `chargeback:<pedido>` no ledger (equivale a um estorno forçado: comissão e taxas voltam, a loja fica devendo a parte dela; a tarifa do provedor não volta) e a auditoria `order.disputed`. Pedido contestado não aceita estorno manual (409 `ORDER_DISPUTED`) e o cancelamento não agenda estorno. A tarifa do provedor que só aparece depois da aprovação é lançada pela conciliação (`fee:<pedido>`, idempotente).

## ETA de entrega (E.1/E.2, DEC-053) — migração `0038_e1_eta_entrega`
`store_settings.prep_minutes int null` (preparo da loja; nulo = `entrega_preparo_padrao_min`); `orders.eta_from_at/eta_to_at timestamptz null` (faixa em horário, gravada na criação e reancorada no pagamento; as colunas `eta_min_minutes/eta_max_minutes` passam a guardar a faixa calculada em minutos; `store_settings.eta_*_minutes` ficam só por compatibilidade, sem efeito); `orders.delivery_snapshot.eta` (partes da conta: preparo, despacho, deslocamento, estimativa); `deliveries.eta_to_at` (fim da faixa herdado do pedido) e `deliveries.late_alerted_at` (um alerta `delivery_late` por corrida). `delivery_fee_tiers.eta_minutes` fica sem efeito (legado).
