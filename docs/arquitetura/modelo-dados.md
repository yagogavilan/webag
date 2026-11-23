# Modelo de dados — Webag (estado atual: migrações 0000 a 0065)

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
`store_settings.prep_minutes int null` (preparo da loja; nulo = `entrega_preparo_padrao_min`); `orders.eta_from_at/eta_to_at timestamptz null` (faixa em horário, gravada na criação e reancorada no pagamento; as colunas `eta_min_minutes/eta_max_minutes` passam a guardar a faixa calculada em minutos; `store_settings.eta_*_minutes` ficam só por compatibilidade, sem efeito); `orders.delivery_snapshot.eta` (partes da conta: preparo, despacho, deslocamento, estimativa); `deliveries.eta_to_at` (fim da faixa herdado do pedido) e `deliveries.late_alerted_at` (um alerta `delivery_late` por corrida); `deliveries.delivered_at` (WB-262, migração 0050: a hora real da entrega; o histórico guarda também a hora do clique e o motivo do recuo no `meta` do evento `delivered`). `delivery_fee_tiers.eta_minutes` fica sem efeito (legado).

## Q.2/Q.3 (BUG-016, BUG-015): pausa da logística e pedido de cancelamento — migrações 0040 e 0041
`logistics_pauses` (`city_id` nulo = geral, `reason`, `paused_by/at`, `resumed_by/at`; índice único parcial: uma pausa aberta por escopo); o horário normal é o parâmetro `logistica_horario` (+ `logistica_dias`), em horário de Brasília. `order_cancel_requests` (uma `pending` por pedido E por `kind`, índice 0055; a `preparation` pendente vira `superseded` quando o pedido sai de `in_preparation`: `status` pending/approved/refused/superseded (SEC-175: o pedido ou a corrida mudou antes da resposta; sem migração, a coluna é texto), `reason`, `decided_by` store/admin/system, `alerted_at`; `reason` e `decision_note` são apagados na anonimização, SEC-158). Sem coluna nova em `orders`: BUG-012 e BUG-014 são comportamento (corrida cancelada cancela o pedido; retirada vence em `retirada_prazo_horas`, contadas do evento `ready_for_pickup`).

## IP truncado nos aceites (S.6.2, migração 0039)
`webag_truncate_ip(text)` e o gatilho `webag_allow_ip_truncation()` substituem o bloqueio total de `terms_acceptances` e `consents`: a ÚNICA alteração permitida é trocar o `ip` pelo próprio IP truncado (IPv4 /24, IPv6 /48), usada na anonimização da conta (SEC-159, DEC-050b). Qualquer outro UPDATE e todo DELETE continuam negados.

## Compensação por atraso e cancelamento por atraso (E.3, migração 0042)
`coupons.owner_user_id` (cupom pessoal: só o dono usa) e `coupons.source_order_id` (índice único parcial: no máximo um cupom de compensação por pedido atrasado); `order_cancel_requests.kind` (`preparation` padrão, ou `late`); `orders.late_notified_at` (um aviso de atraso por pedido).

## SEC-170 e BUG-017 (migrações 0043 e 0044)
`orders.payer_document_hash` (HMAC do CPF do pagador, nunca o CPF; chave do cupom de primeira compra contra multiconta). `orders.pickup_code` passa a `varchar(6)` (`codigo_retirada_digitos`, 4 a 6); `orders.accept_reminded_at` (um lembrete de aceite por pedido); `exchange_requests.refund_late_alerted_at` (um alerta de reembolso fora do prazo por troca). Parâmetros sem uso na 1.0 saíram do painel: ver `DISABLED_PARAMETERS` em `parameters.definitions.ts`.

`orders.pickup_reminded_at` (0045): um aviso por pedido 24 h antes de a retirada vencer (BUG-014).

`push_campaigns.attempts` e `sending_started_at` (0046, SEC-165): teto de 3 tentativas de envio e detecção de campanha presa em `sending` (30 min); destinatários gravados logo depois do envio.

`terms_acceptances.platform` (0047, SEC-173): só a família (`ios`/`android`/`web`) e a versão do app; o trigger append-only admite, além do truncamento do IP, a redução do `platform` à família do próprio valor (`webag_platform_family`).

## DEC-073 (migrações 0051 a 0053): modo manutenção, e-mail de pedido novo, alertas e bloqueio de usuário

| Tabela / coluna | Para quê |
|---|---|
| `maintenance_state` (1 linha, `id = 1`) | WB-121: `enabled`, `message`, `expected_back_at`, quem e quando. Ligado, a API recusa pedido NOVO (503 `MAINTENANCE`); o resto segue. Classificada em `privacy-map` (retém; só o admin que alterou) |
| `store_settings.notify_new_order_email boolean not null default true` | B2: liga/desliga por loja do e-mail de pedido novo e de lembrete de aceite |
| `orders.store_notified_at timestamptz null` | B2: reivindicação atômica do e-mail de pedido novo (deduplicação); o lembrete usa `accept_reminded_at` |
| `payment_alerts.resolved_by uuid null`, `resolution_note varchar(300) null` | B3: quem encerrou o alerta à mão e a nota (nulos quando o sistema encerra). Sem FK (só o id do admin; a auditoria guarda o resto) |
| `user_status_history` | B4: bloqueios e desbloqueios do admin (`action`, `reason`, `actor_id`, `suspended_store_ids`). Retém (prova do ato; privacy-map) |

## v1.1 R1 (PLANEJADO, ADR-018; nenhuma migração escrita ainda, a numeração segue a 0057)

Só o que o contrato `v1.1 R1` exige. Revisado pelo tech-lead em 2026-11-22 (`reviews/contrato-v1-1-r1-2026-11-22.md`); a numeração abaixo já segue o fatiamento dele (R1.1 sem tocar em `products`).

**Regras destas migrações (B4).** (1) O `migrate()` do Drizzle roda TODAS as pendentes numa transação só: nada de `CREATE INDEX CONCURRENTLY`, `VACUUM` nem outro comando que não caiba em transação. (2) Índice em tabela existente é `CREATE INDEX IF NOT EXISTS` simples dentro da migração; antes, no staging, registrar `select count(*)` de `audit_log` e `products` no PR. Se alguma passar de ~1 milhão de linhas, o índice é criado à mão fora do Drizzle, como `webag_migrator`, por runbook (guia de deploy, seção 15), e a migração usa o mesmo nome com `IF NOT EXISTS` (vira no-op). (3) `lock_timeout` curto vem do papel `webag_migrator` (10 s, `infra/postgres/40-roles-grants.sql`); cada `ALTER` fica curto porque todos seguram o bloqueio até o fim da transação. (4) Coluna nova nula ou com default constante (metadado puro no PG 18); `CHECK` novo em tabela existente: `ADD CONSTRAINT ... NOT VALID` e `VALIDATE CONSTRAINT` na mesma migração, depois de conferir no staging que nenhum dado existente viola. (5) **Reversão:** o Drizzle não tem `down`; cada migração leva um script SQL de reversão ao lado, no PR (`drizzle/down/<n>.sql`, fora da pasta lida pelo migrator), testado em banco de teste: aplicar do zero, aplicar sobre dump com dados e reverter. Apagar dado exige autorização do fundador. (6) **Sem backfill** do `audit_log`: o gatilho append-only não permite `UPDATE`, e desligá-lo contradiz a D-06; linhas anteriores à R1 ficam com `store_id` nulo (nenhuma loja real existe ainda; 5 no piloto).

| Migração prevista | Fatia | Mudança | Para quê |
|---|---|---|---|
| 0058 `r1_store_version` | R1.1 (escrita) | `stores.version int not null default 1`. Sobe a cada alteração de dados, configuração, pausa ou status feita pelo lojista ou pelo admin; o admin confere sob o `FOR UPDATE` da loja (WB-351 C6) | D2 |
| 0059 `r1_audit_store_id` | R1.1 (escrita) | `audit_log.store_id uuid null` (sem FK) + `CREATE INDEX IF NOT EXISTS audit_log_store_at_idx ON audit_log (store_id, at DESC, id DESC)`. O `AuditService` preenche `store_id` em toda ação com `targetType = 'store'` e quando o chamador o informa. O gatilho append-only não muda; sem backfill (linhas anteriores ficam nulas; a história usa também `target_type = 'store' and target_id`) | D9 (WB-350 C4) |
| 0060 `r1_admin_edit_support` | R1.1 (escrita) | `admin_view_sessions` (credencial de "Ver como": `token_hash` único, `admin_user_id`, `admin_session_id` com FK `on delete cascade`, `store_id`, `reason_code`, `reason_note`, `opened_at`, `expires_at`, `closed_at`, `close_cause`; índice único parcial `one_open_per_admin` (`where closed_at is null`) e índice parcial de vencimento; NÃO é append-only) e o feed do lojista `store_admin_changes` (bigserial; `store_id`, `audit_id`, `type`, `target`, `summary`, `reason_label`, `before`, `after`, `at`) + `store_change_digest` (pendências do e-mail-resumo; usada a partir da R1.3, quando o admin passa a editar preço e estoque) | D6, D8, D10 (WB-351/352) |
| 0061 `r1_catalog_version` | R1.2 (**feita; as migrações 0061, 0062 e 0063 abaixo saíram JUNTAS numa só, `0061_r1_catalog_version`**: `drizzle-kit` gera uma migração por rodada, o `CHECK` de nome entra `NOT VALID` + `VALIDATE`) | `products.version int not null default 1`, `products.via text` (CHECK: camera, duplicate, paste, spreadsheet, form), `products.created_by_admin_id uuid null`, `products.duplicated_from uuid null`; `CHECK (status = 'draft' or char_length(name) between 2 and 80)` como `NOT VALID` + `VALIDATE` (I9; `name = ''` é rascunho novo); índice parcial `products (store_id, updated_at) where status = 'draft'` (teto de 100 rascunhos e vencimento de 30 dias) | D1, D2 (WB-370/371/372) |
| `0062_r1_moderation_event_set_null` (nome real do arquivo; a numeração desta tabela é do plano) | R1.2 (BUG-042) | `product_moderation_events.product_id` anulável com FK `ON DELETE SET NULL` (antes `NO ACTION`: apagar rascunho com evento dava 500 e travava o vencimento); índice `product_moderation_events_product_idx`. O evento sobrevive ao produto apagado e a regra "3 remoções em 30 dias" segue contando por `store_id`. Reversão apaga os órfãos | D-06 |
| 0062 `r1_category_templates` | R1.2 | `categories.template jsonb`, `categories.description_required boolean not null default false`, `categories.description_min_chars smallint not null default 20`; seed dos 8 modelos (Cosméticos e Eletrônicos com `description_required = true`) | D13 (WB-375, DEC-106) |
| 0063 `r1_product_creation_metrics` | R1.2 | `product_creation_metrics` (store_id, product_id único, via, started_at, first_photo_at, published_at, photos_count, variations_count); sem texto do produto | D11 (WB-379) |
| 0064 `r1_bulk_batches` (**feita; arquivo real `0063_r1_bulk_batches`**, com `drizzle/down/0063.sql`; a numeração desta tabela é a do plano) | R1.3 | `product_bulk_batches` (store_id, `kind`, `source` merchant\|admin, `actor_user_id`, `items_count`, `params` jsonb sem texto livre, `created_at`, `undo_until` só no reajuste de preço, `undone_at`, `undone_by`, `undo_result` jsonb para a repetição do desfazer; CHECK de `items_count >= 1` e de `undo_until` só em `price_adjust`; índice `(store_id, created_at desc, id desc)`; NÃO é append-only) e `product_bulk_batch_items` (PK `(batch_id, product_id)`, `previous_version`, `applied_version`, `previous_price_cents`, `applied_price_cents`, `variants` jsonb com o preço por variação; só no reajuste; índice por `product_id`; cascata com o lote e com o produto). Reversão apaga as duas tabelas (o `audit_log` fica) | D17/D18, WB-377 C4/C7, WB-353 C6 |
| 0065 `r1_analytics` | R1.4 | `analytics_events` **tabela comum** (I8, sem partição): `event_id uuid` com `unique (event_id)`, índice em `occurred_at`, colunas name, session_id, store_id, product_id, origin, city_id, platform, app_version; `analytics_order_paid` (store_id, hour, is_new_to_store; **sem `order_id`, `user_id` nem valor**, SEC-194; `session_id` fica FORA até a decisão I7 do PO e do Security: só entra se escolherem a opção (b), `analyticsSessionId` opcional no `createOrder`), `analytics_daily` e `analytics_order_paid_daily` (agregados, sem `session_id`). Funções `SECURITY DEFINER` do `webag_migrator` (`search_path` fixo): `analytics_aggregate_day(date)` e `analytics_purge()`; `EXECUTE` só para o papel do job; `webag_app` só `INSERT` no bruto (sem `RETURNING`: contar por `rowCount`). Nenhuma coluna referencia `users` (teste de classificação SEC-158/167) | D12 (WB-361/363) |

**Expurgo do bruto (I8).** Sem partição: `analytics_purge()` apaga `occurred_at < now() - interval '91 days'` em lotes de 5.000, num job diário do próprio processo da API (DT-079: sem worker separado; uma execução por vez, com lock consultivo de transação). Teste: linha de 91 dias some e a de 89 fica. Volta a particionar se passar de 5 milhões de linhas ou o expurgo passar de 30 s `[HIPÓTESE]`.

**D-06: papéis do banco (infra, não migração).** `webag_migrator` (dono do banco e das tabelas; só o job `migrate`, por `MIGRATION_DATABASE_URL`) e `webag_app` (API e seed por `DATABASE_URL`; sem superusuário, `BYPASSRLS`, DDL nem posse). Criados e com a posse transferida por `infra/postgres/30-roles-create.sh` e `40-roles-grants.sql` (como superusuário: criar papel, `CREATE EXTENSION postgis` e `ALTER ... OWNER` não cabem numa migração). Privilégios do `webag_app` sobre as tabelas: reafirmados a cada `migrate` por `apps/api/src/platform/database/app-grants.ts` (`SELECT/INSERT/UPDATE/DELETE`, `USAGE` nas sequências, `SELECT` em `drizzle.__drizzle_migrations`, que o `/health/ready` lê). **Nove tabelas append-only só com `INSERT` e `SELECT`:** `audit_log`, `ledger_entries`, `ledger_transactions`, `payment_refunds`, `consents`, `terms_acceptances`, `parameter_history`, `legal_documents`, `delivery_events` (o tech-lead pediu `audit_log`, `ledger_entries`, `payment_refunds` e `consents`; ampliado para todas as que têm gatilho `*_append_only`/`*_immutable`, mesmo custo). **Exceção justificada:** `UPDATE` só nas colunas `ip`/`platform` de `consents` e `terms_acceptances` (anonimização da SEC-159, `account-deletion.service.ts`; o gatilho já limita a mudança ao truncamento). Tabela append-only nova entra na lista de `app-grants.ts`; o teste unitário a confere contra as migrações. Como provar: `apps/api/test/db-roles.e2e-spec.ts` (precisa de PostgreSQL real: ver "O que só se prova com Docker" no parecer do tech-lead).

Parâmetros novos (`parameters.definitions.ts`, auditados): `rascunhos_max_por_loja` **100** (DEC-118: nunca abaixo do lote de 100), `rascunho_validade_dias` 30, `reajuste_max_pct` 30, `admin_preco_variacao_max_pct` 30, `cadastro_sessao_max_min` 15, `analytics_retencao_dias` 90, `analytics_celula_min` 5, `analytics_ip_req_min` 600 e `analytics_sessoes_novas_ip_hora` 300 (I6, trava anti-inundação por IP atrás de CGNAT; o controle real é por sessão, 60 por minuto); `import_max_linhas` sobe o teto de 500 para 1.000. Flags novas (todas `default: false`, C-GEN-01): `coleta_eventos`, `medicao_padrao_ligada`, `admin_edita_catalogo_sem_pedido`.

**Versão (`version`) e limites sob concorrência (I2, I3).** `version` sobe por incremento explícito `version = version + 1` num único helper do repositório de catálogo, chamado só pelas edições de catálogo (lojista e admin); sem gatilho de banco. Reserva, venda, devolução, moderação e o sweep de validade NÃO sobem. O teto de rascunhos é contado sob `SELECT ... FROM stores WHERE id = :id FOR UPDATE` (ou `pg_advisory_xact_lock`) em `createProduct`, `createProductDraft`, lote, `duplicateProduct` e `createAdminProductDraft`.

## v1.1 R2 (migrações 0064 e 0065, ADR-019; só schema, o motor é da R2.2 e R2.3)

Contrato: `openapi.yaml` 0.5.0. Escritas com `drizzle/down/` testadas por `migrations-down.e2e-spec.ts` (sobe, desce 0065 a 0058, sobe) e regras do banco por `r2-campaigns-schema.e2e-spec.ts`. Convenções: dinheiro em centavos `integer`; `text({ enum })` do Drizzle é só TypeScript, então os enums de dinheiro e segurança também são CHECK (`platform/database/enum-check.ts`).

### 0064 `r2_campaigns` (módulo `campaigns`; colunas em `coupons` e `orders`)
| Tabela | Conteúdo | Garantias no banco |
|---|---|---|
| `campaigns` | A REGRA: dono (`webag` ou `store`), fonte de custo (`webag`, `store`, `split`, `self_funded`), parte da loja, tipo, valor, teto do percentual, mínimo, público, alvo (todas, cidade, loja, categoria), validade, orçamento total e diário (Webag), usos, estado, `version`, contadores (`budget_reserved_cents`, `budget_spent_cents`, `uses_*`) | Fonte x parte da loja; frete grátis só com `webag` ou `self_funded`; cupom da loja = fonte `store` na própria loja; alvo coerente; **orçamento e limite obrigatórios fora de rascunho**; percentual com custo da Webag exige teto em R$; `reservado + gasto <= total` e usos; enums |
| `campaign_store_enrollments` | Convite e adesão por (campanha, loja): estado (`pending`, `accepted`, `declined`, `left`, `expired`), validade de 7 dias, teto mensal próprio | `accepted` exige teto, versão, hash e quem aceitou; único por (campanha, loja) |
| `campaign_acceptances` | PROVA do aceite, recusa, saída e criação do cupom da loja (usuário, hora, versão e hash do texto, teto, parte da loja). **Append-only** | Gatilho `campaign_acceptances_append_only`; `webag_app` só INSERT e SELECT |
| `campaign_budget_days` | Orçamento do DIA (America/Sao_Paulo, dia calculado no banco): limite, reservado, gasto | `reservado + gasto <= limite` |
| `campaign_store_months` | Teto MENSAL da loja por campanha | idem |
| `coupon_reservations` | Reserva por pedido: `reserved` -> `confirmed` -> `returned`, Webag e loja em centavos, dia e mês da reserva, estorno parcial acumulado | Único por pedido; forma coerente com o estado; estorno <= confirmado; desconto > 0 |
| `campaign_budget_entries` | DIÁRIO do orçamento (`reserve`, `confirm`, `release`, `refund`, por quem paga). **Append-only**, `dedupe_key` única | Gatilho append-only; `webag_app` só INSERT e SELECT; `campaign_budget_violations()` devolve os contadores que divergem do diário |
| `coupon_fraud_claims` | Consumo por identificador (`account`, `device`, `address`, `document`), SÓ HMAC, em 2 escopos: `first_purchase` (primeira compra, entre campanhas) e `campaign_use` (limite de usos por cliente da campanha, contado sob a trava) | **Único parcial `(kind, hmac) WHERE state = 'active' AND scope = 'first_purchase'`**; HMAC = 64 hexadecimais |
| `coupon_identifier_sightings` | Contas DISTINTAS (HMAC) por identificador, para o sinal de velocidade | Único por (identificador, conta); só HMAC |
| `coupon_fraud_signals` | "Suspeitos": pedido, campanha, sinal e liberação (quem, quando, motivo). Sem identificador | Único por (pedido, sinal); liberar exige autor e motivo |
| `coupons.campaign_id`, `visibility`, `code_origin` | Liga o CÓDIGO à campanha; `private` só com código gerado de 8+ caracteres | FK; CHECK de força do código |
| `orders.campaign_id`, `orders.coupon_snapshot` | Campanha e snapshot do desconto composto (fonte, partes, tetos, margem, custo do motoboy e origem) | FK; índice parcial `(campaign_id, paid_at)` |

O razão financeiro (`ledger_*`) NÃO recebe lançamento da campanha (o desconto da Webag já está na `application_fee` da venda). Mapa de privacidade e papéis: ver ADR-019 D14; `APPEND_ONLY_TABLES` agora tem 11 tabelas.

### 0065 `r2_dashboards_catalog_interest` (módulos `dashboards`, `analytics`, `catalog`)
| Tabela | Conteúdo | Garantias no banco |
|---|---|---|
| `dashboard_daily_facts` | Fatos ADITIVOS por dia do pagamento, loja, categoria da loja, modo, meio de pagamento, campanha e faixa de distância; histogramas fixos para mediana e p90 | Sem coluna de pessoa (teste); sem FK (agregado); enums |
| `dashboard_item_facts` | GMV de itens por categoria do PRODUTO | idem |
| `dashboard_distinct_daily` | Clientes ativos e recompra por janela (`d1`, `d7`, `d30`, `m`): só o número | idem |
| `dashboard_refresh_state` | `refreshed_at` (o `atualizado_em`), marca d'água do job, estado | 3 linhas semeadas |
| `dashboards`, `dashboard_widgets` | Painel pronto (sem dono, do sistema) ou do usuário (PRIVADO, `owner_admin_id`); widgets | **12 widgets (posição 0 a 11 única) e 2 dimensões por CHECK**; forma pronto x usuário; nome de 1 a 80 |
| `product_price_history` | Intervalos de preço `base` e `promo` por produto e variação, com autor | Um intervalo aberto por (produto, variação, tipo); preço 1 a 9.999.999; **semente: preço de hoje com início `now()`** (sem passado) |
| `product_barcodes` | Código de barras por variação, único por loja | Único `(store_id, barcode)`; formato 8 ou 12 a 14 dígitos |
| `reference_barcodes` | Catálogo de referência próprio (nome, marca, categoria; sem foto) | Formato; origem moderada ou admin |
| `analytics_interest_events` | Porta falsa: LOG por loja (toque e respostas com a faixa de exemplo; texto de até 200 caracteres); vale a última resposta | Toque sem faixa nem texto; resposta com faixa; 5 faixas de exemplo |

## Mapa das migrações (0000 a 0053)
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
| 0049 bug020_not_received_at | `orders.not_received_at` |
| 0050 wb262_delivered_at | `deliveries.delivered_at` (hora REAL da entrega: a informada pela operação, recuo até 60 min, ou a do clique; base da compensação, do relatório de prazo e de `orders.delivered_at`) |
| 0051 wb121_maintenance_mode | `maintenance_state` |
| 0052 b2_store_order_email | `store_settings.notify_new_order_email`, `orders.store_notified_at` |
| 0053 b3_b4_alert_resolution_user_status_history | `payment_alerts.resolved_by`, `resolution_note`; `user_status_history` |
| 0054 sec182_previous_user_status | `account_deletions.previous_user_status` |
| 0055 a02_cancel_requests_open_per_kind | Índice `order_cancel_requests_open_uq` passa a ser por `(order_id, kind)` (A-02) |
| 0056 a06_eta_dispatch_informative | `orders.eta_dispatch_from_at`, `eta_dispatch_to_at`: faixa INFORMATIVA depois do despacho; a promessa (`eta_from_at`/`eta_to_at`) não muda (A-06, DEC-076) |
| 0057 a 0063 | R1 e desempenho (ver ADR-018 e a seção v1.1 R1) |
| 0064 r2_campaigns | Campanhas, adesão, reservas, diário do orçamento e antifraude; `coupons` e `orders` ganham colunas de campanha |
| 0065 r2_dashboards_catalog_interest | Agregados e painéis, histórico de preço, código de barras e porta falsa |
