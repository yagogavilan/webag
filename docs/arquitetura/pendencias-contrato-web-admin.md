# Pendências de contrato: web do admin (Onda 1A) para o backend

> Origem: retorno do mobile-dev, 2026-11-18. O backend-dev cobre isto na Onda 2 (marco 0/1) ou registra em divida-tecnica.md. Sem estes itens as telas ficam incompletas.

| # | Pendência | Referência |
|---|---|---|
| 1 | ~~Login de admin em 2 passos~~ **Feito no web (2026-11-18)**: `POST /api/session/admin/mfa`, `mfaToken` e `resetTicket` em cookie HttpOnly, `reset/complete` na allowlist. Falta no backend: **remover `totpCode` do `/auth/login` e do `/auth/password/reset`** (o web não envia mais) | SEC-090, SEC-115, DEC-027 B1 |
| 2 | `PUT /admin/feature-flags` e PATCH de admins aceitarem `reason` | auditoria |
| 3 | `PUT /admin/parameters` receber versão (`expectedUpdatedAt`) e responder 409 | RN-02 |
| 4 | Rota `POST admin/totp/recovery-codes` (regenerar códigos) | SEC-092 |
| 5 | Termos: campos "o que mudou" e "publicada por"; contagem de aceites | WB-100/101 |
| 6 | `/admin/admins`: convites pendentes e último acesso | WB-228 |
| 7 | Auditoria: nome do ator e aparelho; exportação CSV; "só as próprias ações" para perfis não-super | WB-123 |

Também: o security-engineer deve revisar o BFF de sessão do web, a reautenticação e o rascunho dos termos em localStorage (não guardar dado sensível).

## Segurança do BFF (SEC-114, SEC-115, SEC-116): o que a API precisa e variáveis do web

| # | Pendência da API (backend-dev) | Referência |
|---|---|---|
| 8 | **Só aceitar o IP declarado pelo BFF com o segredo dele.** O web envia `X-Webag-Bff-Secret: $BFF_SHARED_SECRET` (se definido) e `X-Forwarded-For: <ip do cliente já resolvido>` (um único valor; ausente quando o web não conhece um IP confiável). A API deve usar esse IP **só** se o segredo bater (comparação em tempo constante); sem o segredo, usar o IP da conexão e ignorar `X-Forwarded-For`. `BFF_SHARED_SECRET` obrigatório em produção na API e no web. Substitui o `TRUST_PROXY` por número de saltos; `TRUST_PROXY` por CIDR continua valendo para o nginx | SEC-114 (2) |
| 9 | Porta da API fora da rede interna (só o web e o nginx chegam) | SEC-114 (3), tech-lead |
| 10 | Remover `totpCode` de `LoginRequest` e `ResetPasswordRequest` (legado de 1 passo) | SEC-115 |
| 11 | Contrato de `mfa/verify`: 401 `MFA_INVALID` e 429 `MFA_RATE_LIMITED` (o web trata os dois); 403 limpa o cookie do desafio | SEC-090 |

Variáveis do web (servidor; nenhuma é pública). Incluir em `infra/env.example` e no guia de deploy (tech-lead):

| Variável | Para quê | Produção | Dev local |
|---|---|---|---|
| `WEB_TRUSTED_PROXY_HOPS` | Nº de proxies confiáveis na frente do web; o IP é o N-ésimo valor da direita do `X-Forwarded-For` | uma das duas é obrigatória | vazio |
| `WEB_CLIENT_IP_HEADER` | Alternativa: cabeçalho que o proxy sobrescreve (ex.: `x-real-ip` com `proxy_set_header X-Real-IP $remote_addr`). Tem prioridade sobre os saltos | idem | vazio |
| `BFF_SHARED_SECRET` | Segredo enviado à API (item 8) | obrigatório | opcional |
| `ADMIN_HOST`, `LOJISTA_HOST` | Hosts dos painéis (ex.: `admin.webag.com.br`, sem protocolo, com porta se houver). Cada área só responde no seu host (404 no outro) | obrigatórias; sem elas, tudo recusa | vazio = qualquer host |
| `WEB_TRUST_FORWARDED_HOST` | `true` só se o proxy sobrescreve `X-Forwarded-Host` | conforme o proxy | vazio |

Sem nenhuma das duas variáveis de IP em produção o web não envia IP e a API vê o IP do BFF: os limites por IP viram globais (não burláveis, mas grossos) e o web avisa no log. Cookies de sessão usam `__Host-` (sem `Domain`) em produção, então admin e lojista em hosts distintos não compartilham nem sobrescrevem cookies.
