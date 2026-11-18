# Modelo de dados — Webag (estado da Onda 1)

Dono: backend-dev | Data: 2026-11-18 | Fonte da verdade: `apps/api/src/modules/*/db/schema.ts` (Drizzle) + `apps/api/drizzle/*.sql` (migrações versionadas, aplicadas por `pnpm db:migrate`; nunca alterar banco à mão).

Convenções: PK `uuid` (`gen_random_uuid()`, v4; o `uuidv7()` do ADR-007 é do PG 18 e o CI/dev local roda em versões variadas, então fica como evolução, ver DT-016); dinheiro em centavos `integer`; datas `timestamptz` UTC; colunas `snake_case` no banco (Drizzle `casing`).

## identity (`users`, sessões, códigos)
| Tabela | Conteúdo | Pontos de segurança |
|---|---|---|
| `users` | e-mail (minúsculo, único, `CHECK lower`), senha Argon2id, nome, celular (dígitos), status (`active/blocked/deleted`), `email_verified_at`, `adult_declared_at` | Sem CPF nem data de nascimento (minimização). Nunca exposto: `password_hash` |
| `user_roles` | `customer`, `merchant` | Papel de lojista só com e-mail confirmado (SEC-008b) |
| `admin_profiles` | perfil (`super_admin/operations/finance/support`), `active`, segredo TOTP cifrado (AES-256-GCM, AAD = user), `totp_last_step` (anti-replay) | TOTP obrigatório (SEC-015) |
| `admin_recovery_codes` | 10 códigos por admin como HMAC-SHA256, `used_at` | Uso único atômico |
| `sessions` | uma por família de refresh: IP, user agent, device, `absolute_expires_at` (90 d), `revoked_at`, `mfa_verified_at`, `reauth_at` | Access token só vale com sessão ativa no banco (SEC-010) |
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
| `legal_documents` | Termos do cliente, do lojista e privacidade; versões imutáveis, `relevant_change` |
| `audit_log` | Quem, o quê, antes/depois (sem segredos), IP, `request_id`, motivo. **Append-only por trigger** (SEC-074, WB-123 C3) |

## payments (base, ADR-002)
| Tabela | Conteúdo |
|---|---|
| `payment_attempts` | Tentativa por pagamento: provedor, ID no provedor (único por provedor), `external_reference` (pedido, Onda 4), loja recebedora, método, status, valor e comissão em centavos. **Sem coluna de cartão, CPF ou documento** (SEC-044) |
| `payment_refunds` | Estornos, com chave de idempotência única por tentativa; append-only |
| `webhook_events` | Fila durável e idempotência (`unique(provider, event_key)`); tentativas e próxima tentativa (backoff exponencial); `failed` = dead-letter |
| `payment_alerts` | Divergências de conciliação, pagamento desconhecido, webhook esgotado |

## Triggers e constraints que valem como teste
`webag_forbid_mutation()` bloqueia UPDATE/DELETE (e TRUNCATE no audit) em `audit_log`, `parameter_history`, `terms_acceptances`, `consents`, `payment_refunds`, `legal_documents` para qualquer role (testado em `test/admin-config.e2e-spec.ts`).

## Próximas ondas
Onda 2 adiciona `stores` (+ FK de `store_members`), documentos e catálogo; Onda 3 adiciona geografia (`geography(Point,4326)` + GiST); Onda 4 adiciona pedidos, `idempotency_keys`, `ledger_entries` (append-only, SEC-041) e liga `payment_attempts.external_reference` ao pedido.
