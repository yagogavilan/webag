# ADR-003: Autenticação, sessão e autorização

- **Status:** Aceita (pendente parecer do security-engineer)
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** security-engineer, backend-dev, mobile-dev

Legenda de fontes: ver ADR-001.

## Contexto
Brief §3.1/§6: explorar sem login; cadastro no checkout; e-mail + senha com confirmação por código; "esqueci a senha" com código no app; preparado para Google e Apple; Argon2; JWT curto + refresh rotativo; RBAC por papel **e por loja** (dono e funcionários); perfis admin (super admin, operação, financeiro, suporte); excluir conta no app; auditoria. Clientes: app mobile (Expo) e painel web (Next.js) em subdomínios do mesmo site. Sem custo: SMS está fora (código vai por e-mail).

## Opções consideradas
| Opção | Prós | Contras | Custo/complexidade |
|---|---|---|---|
| **A. Módulo próprio no NestJS** (`@nestjs/jwt`, `argon2`, sessões no Postgres) | Controle total do modelo de loja/equipe e da LGPD; sem serviço extra; padrões conhecidos | Responsabilidade de segurança é nossa (mitigada por revisão e testes) | Médio |
| B. Better Auth 1.7 (+ `@better-auth/expo`) [V] | Pronto: e-mail OTP, organizações, social, plugin Expo | Impõe schema e rotas próprios; integração com Nest é de terceiros; sessão própria difere do JWT curto pedido no brief | Médio, com acoplamento |
| C. IdP self-hosted (Keycloak, Zitadel) | Padrões OIDC completos | Mais um serviço pesado no VPS; UX de login fora do app; overkill para a 1.0 | Alto |
| D. SaaS (Firebase Auth, Clerk, Supabase Auth) | Rápido | Custo por MAU, dado pessoal fora, lock-in | Baixo no início, caro depois |
| E. `@nestjs/authentication` 0.1.6 [V] | First-party | Pré-1.0 | — |

## Decisão
**Opção A.** Módulo `identity` próprio com estas regras:

| Item | Regra |
|---|---|
| Senha | Argon2id (`argon2`), m = 19 MiB, t = 2, p = 1 (mínimo OWASP); mín. 8 e máx. 128 caracteres; bloqueia as senhas vazadas mais comuns (lista local); medidor de força no cliente (`@zxcvbn-ts/core`) |
| Código por e-mail (confirmação, reset) | 6 dígitos, guardado com hash, validade 10 min, máx. 5 tentativas, uso único; reenvio com rate limit |
| Access token | JWT HS256, 15 min, claims mínimas (`sub`, `sid`, `typ`); papéis e permissões **não** vão no token: são lidos do banco/cache a cada request |
| Refresh token | Opaco (256 bits), guardado só como SHA-256; **rotação a cada uso**; reuso de token antigo revoga a família inteira (sessão); validade 30 dias deslizante, 90 dias absoluta `[HIPÓTESE — configurável]` |
| Mobile | `Authorization: Bearer`; refresh no corpo de `POST /v1/auth/refresh`; tokens só em `expo-secure-store` |
| Web (painéis) | Cookies `HttpOnly; Secure; SameSite=Lax` emitidos pela API (refresh com `Path=/v1/auth`); CSRF: SameSite + checagem de `Origin` na allowlist + header obrigatório `X-Webag-Client` (força preflight CORS) |
| Sessões | Tabela `sessions` (dispositivo, IP, criada/última vez); logout revoga; troca de senha revoga todas |
| Social | Tabela `auth_identities (provider, subject, user_id)` criada já; Google e Apple entram juntos no iOS (App Store 4.8 exige login equivalente com privacidade quando há login de terceiros) quando houver credenciais |
| Rate limit | `@nestjs/throttler` com storage Redis: login 5/min por IP+e-mail, envio de código 3/15 min, refresh 30/min; atraso progressivo em vez de bloqueio duro de conta (evita DoS na conta da vítima) |
| Autorização | Papéis globais `customer`, `merchant`, `admin`. Admin com perfil (`super_admin`, `operations`, `finance`, `support`). Lojista via `store_members (store_id, user_id, role: owner/staff, permissions[])`. Guard `@StorePermission('orders:update')` resolve a loja da rota; posse de recurso checada no service; recurso de outro usuário responde **404** |
| Auditoria | Toda ação de admin e de equipe da loja que muda dado grava `audit_log` (quem, o quê, antes/depois, IP, `requestId`) |
| Conta | Exclusão no app (App Store 5.1.1(v)): anonimiza dado pessoal, revoga sessões; pedidos e registros financeiros ficam pelo prazo legal `[verificar prazo com jurídico]`; exportação de dados em JSON |

## Consequências
- Positivas: modelo de loja/equipe e regras LGPD sob nosso controle; mesmo mecanismo para app e painel; nada pago.
- Negativas / dívida: código de segurança próprio exige testes de abuso (reuso de refresh, força bruta, enumeração de e-mail) e revisão ASVS; `@nest-lab/throttler-storage-redis` 1.2.0 declara peer até Nest 11 [V] — testar no Nest 12 ou escrever storage próprio de ~40 linhas (DT-003).
- Reavaliar se: entrar login por telefone/SMS (custo), SSO corporativo ou vários produtos compartilhando identidade.

## Fontes
- [V] npm 2026-11-18: `argon2` 0.45.2, `@nestjs/jwt` 12.0.5, `@nestjs/throttler` 6.8.0, `@nest-lab/throttler-storage-redis` 1.2.0 (peers), `better-auth` 1.7.25, `@nestjs/authentication` 0.1.6, `@zxcvbn-ts/core` 4.3.0.
- [N] OWASP Password Storage Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- [N] RFC 9700 (OAuth 2.0 Security BCP, rotação e detecção de reuso de refresh token) — https://www.rfc-editor.org/rfc/rfc9700 ; RFC 8725 (JWT BCP) — https://www.rfc-editor.org/rfc/rfc8725
- [N] OWASP ASVS 5.0 (V6 autenticação, V7 sessão) — https://owasp.org/www-project-application-security-verification-standard/
- [N] App Store Review Guidelines 4.8 e 5.1.1(v) — https://developer.apple.com/app-store/review/guidelines/
- [N] Expo SecureStore — https://docs.expo.dev/versions/latest/sdk/securestore/
