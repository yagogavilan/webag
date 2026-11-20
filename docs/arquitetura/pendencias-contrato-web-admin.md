# Pendências de contrato: web do admin (Onda 1A) para o backend

> **Estado em 2026-11-18: itens 1 a 11 entregues pela API** (commits `de81b06`, `9a58f5d`, `ce9cc44`; contrato e cliente gerado atualizados). Origem: retorno do mobile-dev, 2026-11-18. O backend-dev cobre isto na Onda 2 (marco 0/1) ou registra em divida-tecnica.md. Sem estes itens as telas ficam incompletas.

| # | Pendência | Referência |
|---|---|---|
| 1 | ~~Login de admin em 2 passos~~ **Feito no web (2026-11-18)**: `POST /api/session/admin/mfa`, `mfaToken` e `resetTicket` em cookie HttpOnly, `reset/complete` na allowlist. Falta no backend: **remover `totpCode` do `/auth/login` e do `/auth/password/reset`** (o web não envia mais) | SEC-090, SEC-115, DEC-027 B1 |
| 2 | ~~`PUT /admin/feature-flags` e PATCH de admins aceitarem `reason`~~ **Feito** (opcional, mínimo 5; vai à auditoria) | auditoria |
| 3 | ~~`PUT /admin/parameters` receber versão (`expectedUpdatedAt`) e responder 409~~ **Feito** (`PARAMETER_CONFLICT`; também no reset; omitido = sem controle) | RN-02 |
| 4 | ~~Rota `POST admin/totp/recovery-codes`~~ **Feito** (exige reautenticação; também `GET admin/totp/status` com `recoveryCodesLow`) | SEC-092 |
| 5 | ~~Termos: campos "o que mudou" e "publicada por"; contagem de aceites~~ **Feito** (`changeSummary` na publicação; `publishedByName` e `acceptances` nas rotas de admin) | WB-100/101 |
| 6 | ~~`/admin/admins`: convites pendentes e último acesso~~ **Feito** (`pendingInvitations[]` e `lastLoginAt`) | WB-228 |
| 7 | ~~Auditoria: nome do ator e aparelho; exportação CSV; "só as próprias ações"~~ **Feito** (`actorName`, `device`, `GET admin/audit-log/export`; permissão `audit:own`, filtro de ator forçado para não-super) | WB-123 |

Também: o security-engineer deve revisar o BFF de sessão do web, a reautenticação e o rascunho dos termos em localStorage (não guardar dado sensível).

## Segurança do BFF (SEC-114, SEC-115, SEC-116): o que a API precisa e variáveis do web

| # | Pendência da API (backend-dev) | Referência |
|---|---|---|
| 8 | **FEITO.** (`BFF_SHARED_SECRET` opcional na API; com o segredo certo vale o primeiro IP de `X-Forwarded-For`; sem ele a API segue o `TRUST_PROXY`, agora também por lista de IP/CIDR; `0.0.0.0/0` é recusado no boot.) **Só aceitar o IP declarado pelo BFF com o segredo dele.** O web envia `X-Webag-Bff-Secret: $BFF_SHARED_SECRET` (se definido) e `X-Forwarded-For: <ip do cliente já resolvido>` (um único valor; ausente quando o web não conhece um IP confiável). A API deve usar esse IP **só** se o segredo bater (comparação em tempo constante); sem o segredo, usar o IP da conexão e ignorar `X-Forwarded-For`. `BFF_SHARED_SECRET` obrigatório em produção na API e no web. Substitui o `TRUST_PROXY` por número de saltos; `TRUST_PROXY` por CIDR continua valendo para o nginx | SEC-114 (2) |
| 9 | Porta da API fora da rede interna (só o web e o nginx chegam) | SEC-114 (3), tech-lead |
| 10 | ~~Remover `totpCode` de `LoginRequest` e `ResetPasswordRequest`~~ **Feito** (enviar o campo é 400) | SEC-115 |
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

## Onda 2: fila de aprovação e lojas (web, 2026-11-18)

> Origem: mobile-dev (web), telas A1 a A3 de `docs/design/telas/onda-2-lojista-admin.md`. O web usa o módulo provisório `apps/web/src/lib/api/admin-stores.ts` (DT-014), espelho de `admin-stores.controller.ts`.

| # | Pendência | Impacto na tela |
|---|---|---|
| 8 | `GET /admin/stores`: devolver `origin` (`new` ou `resubmitted`), dias de atraso e "vence hoje", e aceitar `q` (nome, cidade, final do CPF/CNPJ) e `createdFrom` | A1 mostra só "No prazo", "Atrasada" e "Prazo pausado"; chips "Novas" e "Reenviadas" e a coluna Origem ficam de fora; a busca é feita só nas lojas já carregadas |
| 9 | `GET /admin/stores`: devolver `sameDocument` (duplicidade) por linha | Selo "CNPJ repetido" só aparece dentro do caso, não na fila |
| 10 | Registrar na auditoria o "Revelar" de dado pessoal (documento, WhatsApp, e-mail do responsável) e devolver esses campos mascarados por padrão (hoje `GET /admin/stores/:id` já devolve o CPF/CNPJ inteiro) | O mascaramento é só visual no navegador; o acesso não fica registrado, e a tela não diz que ficou |
| 11 | `GET /admin/stores/:id`: incluir celular do responsável e o nome de quem decidiu | A2 mostra só nome e e-mail; o conflito usa o texto "Já decidida por ..." da API |
| 12 | Resumo da loja (A3): pedidos em andamento e saldo a receber (financeiro) | Aba Resumo sem esses dois números; o diálogo de suspender não conta pedidos em andamento |
| 13 | Moderação de produtos (A4, WB-107): endpoints de fila, ação e regras (palavras e categorias proibidas) | Tela construída contra contrato provisório e fora do menu até a API existir (`MODERATION_READY`) |
| 14 | "Conferir tudo" e as marcações da checklist não vão à API; só `request-correction` guarda os itens com motivo | Sem registro de quais itens foram conferidos antes da aprovação |

## Onda 6, telas do admin (2026-11-19, mobile-dev, web)
> Para o backend-dev (contrato) e o security-engineer.

| # | Item | Situação |
|---|---|---|
| P8 | **Promessa de entrega (DEC-053) na Logística.** O contrato já publica `etaToAt` (fim da faixa), `overdue`, `overdueMinutes` e `area` na corrida; o web usa os quatro. **Falta `etaFromAt`** (início da faixa): sem ele a fila mostra "Prometido até 16:40"; com ele, "Chega entre 15:40 e 16:40" (o web já aceita o campo opcional). Alerta: `late` quando o servidor manda `overdue` ou passa de `etaToAt`; `ending` nos últimos 10 min (constante `ETA_ENDING_MIN` no web; se virar parâmetro, avisar) | Feito; `etaFromAt` aberto (pequeno) |
| P9 | **Lote de corridas por área.** O web usa `POST /admin/logistics/deliveries/assign-batch` (2 a 10 corridas, mesma cidade): agrupa por `area.key` (ou `destination` se faltar), manda até 10 e mostra o resultado de cada corrida (`assigned`/`failed`), com o WhatsApp de cada uma. O limite real é `entrega_lote_max` (padrão 4): acima disso a API responde 422 `INVALID_BATCH` e a tela mostra o `detail`. **Backend:** o web não conhece o `entrega_lote_max`; se a operação quiser o corte automático, expor em `area` | Feito |
| P10 | **Parâmetros do prazo** (`entrega_preparo_padrao_min`, `entrega_despacho_min`, `entrega_rota_fator_pct`, `entrega_min_por_km`, `entrega_faixa_min`, `entrega_max_min`) aparecem no grupo "Prazo de entrega" da tela de Parâmetros, com um simulador (mesma conta de `domain/eta.ts`) e aviso quando `raio_max_km` passa do alcance do teto. O simulador some se a API ainda não listar os seis. **Backend:** garantir que `GET /admin/parameters` devolva os seis e `raio_max_km`; manter a conta do web e a de `eta.ts` iguais (hoje duplicadas: se mudar a fórmula, mudar nos dois) | Feito no web |
| P11 | **Revelar contato (SEC-144).** `POST .../contact-reveal` ganhou tela: quem não despacha vê `customerPhoneMasked` e "Revelar contato" (motivo de 10 a 200 caracteres; o web pede o motivo e mostra o contato só na tela, sem guardar). O `GET` do detalhe continua devolvendo `contact` direto para `logistics:write`; **Security:** decidir se operação também deve passar pelo motivo (hoje não, é o fluxo de despacho) | Feito no web |
| P12 | **Disputas de troca (AT3, WB-110).** Rotas `/admin/exchanges/mediations`, `.../decision`, `/admin/exchange-requests`, `.../{id}` e `.../waive-fee` agora têm tela (`/admin/disputas` e `/admin/disputas/{id}`; perfis super admin e operação). "Isentar a taxa" só com a taxa não paga (a API devolve 409 se já paga): o desenho previa devolver a taxa já paga, o que o contrato não faz. **PO/Designer:** decidir se "devolver a taxa paga" entra (outro endpoint) | Feito no web; devolução de taxa paga aberta |
| P13 | Relatórios (pedidos, GMV, novas lojas, novos clientes, recompra, cancelamentos, CSV), pedidos de titulares, denúncias e ajuda editável já estavam no `main` sem teste de tela; agora têm Vitest (`privacy.spec.tsx`, `content.spec.tsx`). Todos os KPIs do PRD `admin.md` estão na tela | Feito |
