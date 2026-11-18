# Pendências de contrato: web do admin (Onda 1A) para o backend

> Origem: retorno do mobile-dev, 2026-11-18. O backend-dev cobre isto na Onda 2 (marco 0/1) ou registra em divida-tecnica.md. Sem estes itens as telas ficam incompletas.

| # | Pendência | Referência |
|---|---|---|
| 1 | Login de admin em 2 passos com `mfaToken` (rota + contrato em packages/shared). Web ainda usa 1 passo (`totpCode` junto): adaptar `apps/web/app/api/session/[area]/login/route.ts` e `login-form.tsx` quando publicar | SEC-090, DEC-027 B1 |
| 2 | `PUT /admin/feature-flags` e PATCH de admins aceitarem `reason` | auditoria |
| 3 | `PUT /admin/parameters` receber versão (`expectedUpdatedAt`) e responder 409 | RN-02 |
| 4 | Rota `POST admin/totp/recovery-codes` (regenerar códigos) | SEC-092 |
| 5 | Termos: campos "o que mudou" e "publicada por"; contagem de aceites | WB-100/101 |
| 6 | `/admin/admins`: convites pendentes e último acesso | WB-228 |
| 7 | Auditoria: nome do ator e aparelho; exportação CSV; "só as próprias ações" para perfis não-super | WB-123 |

Também: o security-engineer deve revisar o BFF de sessão do web, a reautenticação e o rascunho dos termos em localStorage (não guardar dado sensível).
