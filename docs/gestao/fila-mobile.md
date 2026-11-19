# Fila do mobile-dev (app e painéis web), achados do Security

> Criada pelo security-engineer em 2026-11-19 para os achados que não são do back-end. O CEO prioriza; marque `[x]` ao concluir. Detalhe: `docs/seguranca/revisoes/onda-7-reverificacao.md`.

M.1 [ ] SEC-166 (Alta, bloqueia G5 Google Play), opção 1 recomendada: `/excluir-conta` com a via A/B da WB-214 (e-mail → código; senha se o e-mail não estiver confirmado → revisão dos bloqueios → confirmar), chamando `/v1/auth/account-deletion/*` por rota do host público com o mesmo CSRF de `/api/public/privacy-request`, ticket só no corpo, `Referrer-Policy: no-referrer`. O formulário do DSR fica como alternativa.
M.2 [ ] SEC-176 (Média, antes do G5): `CancelDeletionForm` (app) e `/lojista/desistir-da-exclusao` (web) tratam 403 `LOGIN_CODE_REQUIRED` com campo de código de 6 dígitos e reenviam `code`.
M.3 [ ] SEC-172 (Baixa, resto): `app.config.ts` falha o build de produção sem `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_WEB_URL` https; `privacy/export.tsx:104` só abre link da origem da API; `safeDownloadUrl` só `https:` em produção.
M.4 [ ] SEC-178 (Baixa): `/excluir-conta` lê os prazos da API (ou o PO trava os parâmetros) em vez de `public-deletion.ts` fixo.
M.5 [ ] SEC-179 (Baixa): iOS com `NSLocationDefaultAccuracyReduced: true` (ou arredondar lat/lng); decide o rótulo do App Privacy.
M.6 [ ] Pendência 1 do inventário (`seguranca/inventario-lojas.md` §3): consulta de CEP pela API, não direto no ViaCEP.
