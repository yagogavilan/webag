# Modelo de dados — Webag (estado atual: migrações 0000 a 0042)

Dono: backend-dev | Revisado: 2026-11-19 (Tech Lead, Onda 7: mapa das migrações, Onda 2 e Onda 4 completas) | Fonte da verdade: `apps/api/src/modules/*/db/schema.ts` (Drizzle) + `apps/api/drizzle/*.sql` (migrações versionadas, aplicadas por `pnpm db:migrate`; nunca alterar banco à mão).

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
| `user_addresses` | Endereços salvos (até `enderecos_max`); `lat`/`lng` + coluna GERADA `location geography(Point,4326)` com GiST; um padrão por usuário (índice único parcial); sem duplicar CEP+número+complemento; `pin_verified` (0048): o ponto foi conferido contra o centro do CEP (`false` = aceito sem conferir) |
| `banners` | Banner da home 2:1; cidade nula = todas; destino loja, categoria, produto, cupom ou nenhum; período e posição |
| `reviews` | Avaliação de loja (`product_id` nulo) ou produto; só leitura na Onda 3; `order_id` sem FK até a Onda 4; remoção é `status = removed` |
| `favorites` | Loja OU produto por usuário (CHECK de um alvo só; únicos parciais) |
| `search_history` | Últimos 10 termos distintos por usuário (`term_key` sem acento/caixa) |
| `coupons`, `coupon_redemptions` | Cupom (percentual, fixo, frete grátis; escopo loja/plataforma) e uso por pedido (devolvido com `released_at`) |
| `carts`, `cart_items` | Sacola por conta (`carts.user_id` único), uma loja; `revision` sobe a cada mudança; `seen_price_cents` guarda o preço que o cliente viu |

Funções e índices: `f_norm(text)` (unaccent + lower, IMUTÁVEL) com índices GIN `pg_trgm` em `products.name` e `stores.name`; índice GiST de `stores.location` (migração 0005) alimenta `ST_DWithin` da descoberta. Migrações 0009 a 0011.

## stores e catalog (Onda 2, migração 0005)
| Tabela | Conteúdo |
|---|---|
| `stores` | Loja: dono, `status` (`draft`, `in_review`, `correction_requested`, `approved`, `rejected`, `suspended`, `closed`), CPF/CNPJ, razão social, endereço (CEP, rua, bairro, cidade, UF), `lat`/`lng` + coluna GERADA `location geography(Point,4326)` com GiST (busca por raio com `ST_DWithin`), logo/capa (`media_assets`), SLA da análise (`sla_started_at`, `sla_elapsed_ms`), decisão e motivo, limite de exposição de loja nova (0018) |
| `store_settings`, `store_hours`, `store_holidays`, `store_delivery_tiers` | Entrega e retirada, raio, taxa por faixa (`store_delivery_tiers`, modo `by_distance`), pedido mínimo, frete grátis acima de X, `pickup_enabled`, dias de troca voluntária, pausa; horários por dia da semana (minutos desde 00:00, horário de Brasília) e feriados. `eta_*_minutes` ficam só por compatibilidade (DEC-053) |
| `store_documents`, `store_review_items`, `store_status_history`, `store_activity`, `store_extra_categories` | Documentos enviados (um vigente por tipo, 0013), pendências apontadas pelo admin, histórico de status, trilha de atividade da loja e categorias adicionais |
| `payment_accounts`, `payment_oauth_states` | Conta de recebimento do lojista (provedor, id no provedor, titular mascarado, tokens OAuth CIFRADOS com `PAYMENT_TOKEN_ENC_KEY`) e o `state` do OAuth (hash, uso único, PKCE `code_verifier` cifrado, 0020) |
| `media_assets` | Arquivo enviado por URL pré-assinada: dono, loja, finalidade (`store_logo`, `store_cover`, `product_image`, `store_document`, `banner`, `exchange_photo`), estado (`pending`, `ready`, `rejected`); o original fica no bucket privado e só as variantes re-codificadas em WebP (160/400/800, sem EXIF/GPS) vão ao público; documento só no privado (ADR-005) |
| `products`, `product_variants`, `product_images`, `store_sections` | Produto (status `draft/active/paused/archived`, moderação, preço base e promocional com janela, tabela de medidas, `no_voluntary_exchange`), variação (atributos, SKU, preço, `stock`, `reserved` pela reserva de estoque do pedido, alerta de estoque baixo), imagens ordenadas e seções da vitrine. `products.idempotency_key` evita produto duplicado em rede ruim (0008) |
| `moderation_terms`, `product_moderation_events` | Termos proibidos/de atenção do admin e a trilha de moderação |

## orders, finance e idempotência (Onda 4, migrações 0012, 0015, 0016)
| Tabela | Conteúdo |
|---|---|
| `orders` | Pedido: número público `WB-XXXXX` (único), cliente, loja, `status` (ver máquina em `docs/produto/regras-de-negocio.md`, RN-07), `mode` (`delivery`/`pickup`), `cart_revision`, endereço (snapshot JSON), faixa de chegada (`eta_from_at`/`eta_to_at`), código de retirada, cupom, valores em centavos (`subtotal`, `delivery_fee`, `service_fee`, `discount`, `store_coupon`, `platform_discount`, `total`, `commission`, `application_fee`), snapshot financeiro e de entrega (`finance`, `delivery_snapshot`), método e tentativa de pagamento, prazo de PIX e de aceite, `disputed_at` (0036), `late_notified_at` (0042). Tudo que o cliente viu é gravado no pedido (RN-05): preço e taxas não mudam depois |
| `order_items` | Item com snapshot de nome, atributos, foto, quantidade, preço unitário, total da linha e `commission_pct_bp` do momento; `stock_state` (`reserved`, `sold`, `released`) |
| `order_events` | Histórico de TODA transição: de, para, ator (`customer`/`store`/`system`/`admin`), usuário, motivo, hora |
| `order_cancel_requests` | Pedido de cancelamento em separação (`kind` `preparation`/`late`, 0041/0042) e a decisão da loja ou do admin |
| `idempotency_keys` | `Idempotency-Key` do cliente: escopo, chave, hash do corpo, resposta guardada, validade de 24 h (criar pedido, pagar) |
| `store_commission_rates`, `category_commission_rates` | Taxas de comissão por loja e por categoria, em pontos-base, com vigência e motivo; vale a mais específica |
| `ledger_transactions`, `ledger_entries` | Razão contábil de partidas dobradas, **append-only** (SEC-041): cada transação é única por `dedupe_key` (idempotente) e é composta de entradas de débito e crédito (partidas dobradas); contas e tipos em "Ledger" abaixo |

Regras que o banco garante: dinheiro sempre `integer` em centavos; número do pedido único; uma tentativa de pagamento por `(provedor, id no provedor)`; um cupom resgatado uma vez por pedido (`coupon_redemptions_order_uq`).

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

## Q.2/Q.3 (BUG-016, BUG-015): pausa da logística e pedido de cancelamento — migrações 0040 e 0041
`logistics_pauses` (`city_id` nulo = geral, `reason`, `paused_by/at`, `resumed_by/at`; índice único parcial: uma pausa aberta por escopo); o horário normal é o parâmetro `logistica_horario` (+ `logistica_dias`), em horário de Brasília. `order_cancel_requests` (uma `pending` por pedido: `status` pending/approved/refused/superseded (SEC-175: o pedido ou a corrida mudou antes da resposta; sem migração, a coluna é texto), `reason`, `decided_by` store/admin/system, `alerted_at`; `reason` e `decision_note` são apagados na anonimização, SEC-158). Sem coluna nova em `orders`: BUG-012 e BUG-014 são comportamento (corrida cancelada cancela o pedido; retirada vence em `retirada_prazo_horas`, contadas do evento `ready_for_pickup`).

## IP truncado nos aceites (S.6.2, migração 0039)
`webag_truncate_ip(text)` e o gatilho `webag_allow_ip_truncation()` substituem o bloqueio total de `terms_acceptances` e `consents`: a ÚNICA alteração permitida é trocar o `ip` pelo próprio IP truncado (IPv4 /24, IPv6 /48), usada na anonimização da conta (SEC-159, DEC-050b). Qualquer outro UPDATE e todo DELETE continuam negados.

## Compensação por atraso e cancelamento por atraso (E.3, migração 0042)
`coupons.owner_user_id` (cupom pessoal: só o dono usa) e `coupons.source_order_id` (índice único parcial: no máximo um cupom de compensação por pedido atrasado); `order_cancel_requests.kind` (`preparation` padrão, ou `late`); `orders.late_notified_at` (um aviso de atraso por pedido).

## SEC-170 e BUG-017 (migrações 0043 e 0044)
`orders.payer_document_hash` (HMAC do CPF do pagador, nunca o CPF; chave do cupom de primeira compra contra multiconta). `orders.pickup_code` passa a `varchar(6)` (`codigo_retirada_digitos`, 4 a 6); `orders.accept_reminded_at` (um lembrete de aceite por pedido); `exchange_requests.refund_late_alerted_at` (um alerta de reembolso fora do prazo por troca). Parâmetros sem uso na 1.0 saíram do painel: ver `DISABLED_PARAMETERS` em `parameters.definitions.ts`.

`orders.pickup_reminded_at` (0045): um aviso por pedido 24 h antes de a retirada vencer (BUG-014).

`push_campaigns.attempts` e `sending_started_at` (0046, SEC-165): teto de 3 tentativas de envio e detecção de campanha presa em `sending` (30 min); destinatários gravados logo depois do envio.

`terms_acceptances.platform` (0047, SEC-173): só a família (`ios`/`android`/`web`) e a versão do app; o trigger append-only admite, além do truncamento do IP, a redução do `platform` à família do próprio valor (`webag_platform_family`).

## Mapa das migrações (0000 a 0047)
Aplicadas em ordem por `pnpm db:migrate` (Drizzle). O arquivo `apps/api/drizzle/<n>_*.sql` é a verdade; esta tabela só orienta a leitura.

| Migração | O que muda |
|---|---|
| 0000 initial | `users`, `user_roles`, `sessions`, `refresh_tokens`, `auth_codes`, `invitations`, `admin_profiles`, `admin_recovery_codes`, `access_log`, termos e consentimentos, `cities`, `neighborhoods`, `categories`, `parameters`, `parameter_history`, `feature_flags`, `legal_documents`, `audit_log`, `payment_attempts`, `payment_refunds`, `webhook_events`, `payment_alerts` |
| 0001 append_only_guards | Gatilho `webag_forbid_mutation()` nas tabelas append-only |
| 0002 refund_idempotency | Chave de idempotência do estorno |
| 0003 onda1_hardening_tickets | `auth_tickets` (tickets de uso único); limites do enrolamento do TOTP |
| 0004 payments_hardening | `payment_refund_intents` (intenção de estorno gravada antes de chamar o provedor) |
| 0005 onda2_stores_catalog | PostGIS; lojas, configurações, horários, documentos, conta de recebimento, catálogo, mídia |
| 0006 sec113_recovery_reenroll | Reenrolamento do TOTP depois de código de recuperação |
| 0007 admin_contract_audit_device_terms_summary | `audit_log.user_agent`; `legal_documents.change_summary` |
| 0008 catalog_idempotency_store_review_flag | `products.idempotency_key` |
| 0009 onda3_addresses_banners | `user_addresses` (com `location` geográfica), `banners` |
| 0010 onda3_discovery | `favorites`, `reviews`, `search_history`; `unaccent`, `pg_trgm`, `f_norm()` e índices de busca |
| 0011 onda3_cart_coupons | `carts`, `cart_items`, `coupons`, `coupon_redemptions` |
| 0012 idempotency_keys | `idempotency_keys` |
| 0013 store_documents_current_unique | Um documento vigente por tipo |
| 0014 refund_intent_actor | Ator e `request_id` na intenção de estorno |
| 0015 finance_ledger_commission | Comissões e razão contábil |
| 0016 orders | `orders`, `order_items`, `order_events` |
| 0017 payment_attempt_pix_qr_3ds | QR do PIX e URL do desafio 3DS na tentativa |
| 0018 store_exposure_limit | Limite de exposição de loja nova |
| 0019 sec130_refund_queue | Fila de estornos recusados (falhas, próxima tentativa, cobertura) |
| 0020 sec140_oauth_pkce | `code_verifier` cifrado no OAuth |
| 0021 l1_delivery_fee_tables | Tabela de taxa de entrega versionada |
| 0022 l1_order_delivery_snapshot | `orders.delivery_snapshot` |
| 0023 l3_logistics | `couriers`, `deliveries`, `delivery_events` |
| 0024 t4_size_chart_exchange_flag | Tabela de medidas, produto sem troca voluntária, "como vestiu" |
| 0025 t2_exchange_requests | `exchange_requests`, `exchange_events` |
| 0026 t4_review_unique_per_order | Uma avaliação por alvo e pedido |
| 0027 push_devices | `push_devices` |
| 0028 sec141_refund_in_flight | Lease do estorno em andamento |
| 0029 sec143_store_return_confirmation | Confirmação de devolução pela loja |
| 0030 dt050_exchange_reminders_mediation | Lembretes, contestação e mediação de trocas |
| 0031 o61_privacy | Exclusão de conta, exportação, pedidos de titular, expurgo (`retention_runs`) |
| 0032 o61_dsr_sequence | Sequência do protocolo `PV-0001` |
| 0033 o63_push_campaigns | Campanhas de push |
| 0034 o63_highlights_banner_metrics | Destaques da Início; contadores de banner |
| 0035 o65_feedback | Denúncias, ajuda (FAQ) e contatos |
| 0036 r3_order_disputed | `orders.disputed_at` |
| 0037 r4_exchange_difference_commission | Comissão da diferença de preço na troca |
| 0038 e1_eta_entrega | Faixa de chegada (ETA) no pedido e na corrida |
| 0039 s62_ip_truncation | Truncamento do IP na anonimização |
| 0040 q2_logistics_pauses | `logistics_pauses` |
| 0041 q3_order_cancel_requests | `order_cancel_requests` |
| 0042 e3_late_compensation | Cupom de compensação por atraso; cancelamento por atraso |
| 0043 sec170_payer_document_hash | `orders.payer_document_hash` |
| 0044 bug017_parameters_wiring | Código de retirada de até 6 dígitos; lembrete de aceite; alerta de reembolso da troca |
| 0045 bug014_pickup_reminder | `orders.pickup_reminded_at` |
| 0046 sec165_push_campaign_attempts | `push_campaigns.attempts`, `sending_started_at` |
| 0047 sec173_platform_family | Função `webag_platform_family` e trigger append-only estendido |
| 0048 sec169_address_pin_verified | `user_addresses.pin_verified` |
