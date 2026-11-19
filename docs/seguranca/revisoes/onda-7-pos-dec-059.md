# Reverificação de segurança após o DEC-059 (G4 e G5)

- **Data:** 2026-11-19 | **Revisor:** security-engineer | **Base:** `claude/admiring-lamport-62tq1a` em `dad9c96` (o web e o app em `b726960`; os commits seguintes só mexem em `apps/api` e docs). Continua `onda-7-reverificacao.md` (lá estão os achados e as definições de pronto).
- **Escopo:** SEC-166 (página `/excluir-conta` com as vias A/B, "Mudou de ideia?", BFF `/api/public/account-deletion/<passo>`, `/lojista/desistir-da-exclusao`); SEC-175, 176, 169, 177, 167, 172, 178; `GET /v1/me/coupons`; `GET /v1/cep/{cep}`; rota dev de pagamento por pedido (F1); inventário das lojas.
- **Método:**
  - **Ambiente local isolado**, montado a partir de `setup-do-zero.md`: worktree do HEAD, banco `webag_sec8_live` migrado (0000 a 0048) e semeado, Redis próprio (porta 6391), API em `NODE_ENV=development` (porta 3310) e web em **build de produção** (`next build` + `NODE_ENV=production`, porta 3311, hosts `pub.local`/`adm.local`/`loj.local`, IP do cliente por `X-Real-IP` como no compose de produção). E-mails lidos no Mailpit.
  - **Script de ataque fora do repositório** (Node, via HTTP contra o BFF): CSRF, hosts, corpo, B1 (enumeração), via A e via B de ponta a ponta, reuso do código, abuso do ticket, limites, B2/D1 (arrependimento sob ataque), D2 (novo), cabeçalhos, XSS e redirecionamento.
  - **E2E do repositório** contra Postgres e Redis reais, em banco próprio, no HEAD `dad9c96`: `production-boot`, `dev-order-payment`, `late-delivery`, `sec168-170-hardening`, `sec167-privacy-map`, `addresses`, `my-coupons`, `privacy-web-deletion`, `privacy-deletion`, `b1-b2-contract`, `s62-privacy-security`: **89 testes, todos passam**. Também passam os testes do web (`prod-config`, `account-deletion-route`, `public-deletion`, `account-deletion-flow`, `cancel-deletion`: 22) e o `about-licenses` do app (11). Por fim, `check-build-env.mjs` e `expo config` com perfil `production` foram executados.
  - Busca de segredos no diff `98764b2..dad9c96` e `pnpm audit --prod`.

## Pareceres

| Gate | Parecer | Condições |
|---|---|---|
| **G4** (segurança) | **APROVADO COM RESSALVAS** | Nenhuma Crítica ou Alta aberta. Ressalvas (Médias): **SEC-180**, a corrigir antes do piloto com lojistas reais. Não houve teste com o Mercado Pago real nem pentest (ver "Limites") |
| **G5 Google Play** | **COM RESSALVAS** (era REPROVADO) | O SEC-166 está **FECHADO** no código. Faltam: (1) `https://<domínio>/excluir-conta` no ar (domínio e deploy, fundador); (2) Data Safety preenchido por `inventario-lojas.md`; (3) revisão jurídica dos textos e prazos (J1 a J14); (4) recomendado: SEC-180 |
| **G5 App Store** | **COM RESSALVAS** (sem mudança) | Política em URL pública; texto jurídico revisado; App Privacy por `inventario-lojas.md`, com **Precise Location** enquanto o SEC-179 estiver aberto; recomendado: SEC-180 |

## Status dos achados

| ID | Sev. | Status | Evidência |
|---|---|---|---|
| **SEC-166** | Alta | **FECHADO** | Exclusão de ponta a ponta **sem o app**, pela página pública (detalhes abaixo). Via A: e-mail → código do Mailpit → revisão → `finish` → `account_deletions.via=web`, `pending` 72 h, e-mail "Recebemos o pedido", login recusado. Via B: conta com e-mail **não confirmado** recebe o ticket só com a senha (é a única via dela); lojista dono → `ownsStore=true` → fechado → arrependido → loja volta a `approved`. A anonimização é o mesmo `closeAccount` do app (E2E `privacy-deletion` passa); as 72 h não foram esperadas |
| SEC-175 | Média | **CORRIGIDO** | E2E `late-delivery`: L1 (entregue antes do aceite → `superseded`, nenhum evento "aceito", zero estorno, aceite automático é no-op mesmo com o pedido reaberto à força); L1 pelo admin; L5 (`not_delivered` antes); falha da corrida dentro da mesma transação → nada é aceito e a varredura repete; alerta `delivery_cancelled_with_courier`. Código: `late-delivery.service.ts` `decide` faz `FOR UPDATE` no pedido, no pedido de cancelamento e na corrida, e chama `actInTx` |
| SEC-176 | Média | **CORRIGIDO** (API e web) / app pendente (M.2) | D1 contra o BFF: 12 senhas erradas de 12 IPs → 401 (nenhum e-mail ao dono); o mesmo IP → 429 na 6ª; o dono, de outro IP, com a senha certa → **403 `LOGIN_CODE_REQUIRED`** (não 429); terceiro com o código e a senha errada → 401; o dono com o código → **204**, conta `active`, login 200. O app (`CancelDeletionForm`) ainda não pede o código; o contorno é a página pública "Mudou de ideia?". **Mas o controle cai com o D2: ver SEC-180** |
| SEC-169 | Média → **Baixa** | **PARCIAL** | Corrigido: CEP inexistente → 422 (A1 é E2E, com e sem pino); município e UF sempre conferidos; o boot de produção recusa `GEOCODER_URL` http ou `*.openstreetmap.org`; o geocodificador recebe só rua, cidade e UF **do CEP**, com cache de 30 dias. **Resíduo:** com `GEOCODER_URL` vazio (o padrão de produção), todo endereço grava `pinVerified=false`, e o pino do app vale sem conferência **dentro do município atendido**. O `pinVerified` não é usado na cotação, no raio nem na faixa (só gravado e exposto). Com o serviço de CEP fora do ar, nem município/UF são conferidos (aceito, com log). Impacto restrito a frete e prazo dentro da cidade. Ver "O que depende do fundador" |
| SEC-177 | Baixa | **CORRIGIDO** | E2E L4 (`customer_absent`, `address_not_found`, `customer_refused` → reentrega → 0 cupom, evento `compensation_skipped` com a causa); outro motivo mantém a compensação. Resíduo: a hora do "entregue" é a do clique (WB-262 do PO resolve) |
| SEC-167 | Baixa | **CORRIGIDO** | `sec167-privacy-map` lê `pg_constraint` (FK para `users.id`): nenhuma tabela sem decisão, nenhuma decisão órfã, toda decisão com base ou "o quê" e "onde". Resíduo aceito: tabelas com dado pessoal **sem** FK direta (`order_cancel_requests`, `delivery_events.reason`, `idempotency_keys.response_body`, `webhook_events`) ficam fora do teste; as duas primeiras são tratadas no código (`anonymizeOne`), e as duas últimas expiram |
| SEC-172 | Baixa | **CORRIGIDO no essencial** (resíduo Baixa) | App: `assertPublicUrl` derruba o `expo config` com o perfil `production` e o texto "SEU-DOMINIO" (executado; teste `about-licenses` passa). Web: `check-build-env.mjs` recusa `NEXT_PUBLIC_*URL` http/localhost (executado: exit 1 e 0); `instrumentation.ts` recusa o boot de produção (`prod-config.spec` passa). O escape `WEBAG_ALLOW_LOCAL_ORIGINS` não aparece no compose de produção. Resíduo (M.3): `privacy/export.tsx:104` abre o link sem conferir a origem, e `safeDownloadUrl` aceita `http:`. O risco é coberto pela API, que exige https em produção |
| SEC-178 | Baixa | **PARCIAL** | Os prazos agora estão num só lugar (`deletionFacts()`, com `PUBLIC_DELETION_*` por ambiente), e a etapa de revisão mostra os valores **reais** da API (`regretHours`, `anonymizationDays`, `fiscalRetentionYears`, conferidos: 72/15/5). Falta a W.1 (expor no `/v1/help`) |
| SEC-179 | Baixa | ABERTO | Sem mudança (`app.config.ts` sem `NSLocationDefaultAccuracyReduced`) |
| SEC-146, 149, 150, 161, 162, 163, 174 | Baixa | ABERTO | Sem mudança; definições de pronto em `onda-7-reverificacao.md` |

**Resposta à dúvida do backend (V.2):** a senha certa dá 403 e a errada dá 401 acima do limite. É o mesmo oráculo do login com step-up, e ele só aparece para quem **já acertou** a senha (limitado a 5/h por IP e e-mail). **Aceito.**

## Ataques contra a página pública e o BFF (todos no build de produção do web)

| Ataque | Resultado |
|---|---|
| CSRF: sem `X-Webag-Client`; `Origin` de outro site; `Sec-Fetch-Site: cross-site`; formulário `urlencoded` de outro site | 403 `CSRF` nos quatro |
| Preflight CORS de outro site | 204 **sem** `Access-Control-Allow-Origin`: o navegador bloqueia |
| Host do admin ou do lojista chamando o BFF público; página `/excluir-conta` no host do admin | 404 |
| Campo extra (`role`), passo inexistente, `__proto__`, GET | 400, 404, 404, 405 |
| **B1, enumeração (via A):** conta confirmada, não confirmada, admin, inexistente | Mesma sequência `200, 429, 429` e o mesmo corpo `{"sent":true}`. E-mail só para a confirmada |
| B1 (via B): senha errada, e-mail inexistente, **admin com a senha certa** | 401 `INVALID_CREDENTIALS` com o mesmo corpo nos três |
| B1 (`verify-code`): conta, inexistente, admin | 400 `CODE_INVALID`, corpos idênticos |
| Reuso do código | 2º uso do mesmo código → 400 `CODE_INVALID` |
| Ticket: falso (43 caracteres), curto, na URL (`?deleteTicket=`), válido; `finish` duas vezes; `review` depois do `finish` | 410, 400, 400 (o BFF exige o corpo), 200; o 2º `finish` dá 410 (uso único) e o `review` também |
| Resposta do sucesso | Só `deleteTicket` e `expiresIn`, com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`; a revisão traz só os campos da lista fixa |
| Limites | Via B: 7 senhas erradas de 7 IPs, mesmo e-mail → `401×4, 429×3` (5/h por e-mail). Via A: 7 e-mails do mesmo IP → `200×4, 429×3`. Código: 5 tentativas por código (`otp_tentativas`), 20/h por IP |
| B2/D1 ("Mudou de ideia?") | Ver SEC-176 acima: o dono passa com o código |
| **D2: esgotar o envio de código do dono** | **Falha: SEC-180** |
| XSS e redirecionamento: `?email=<script>…&next=https://evil` | Nada é refletido e não há redirecionamento (a página não lê a query) |
| Cabeçalhos da página | CSP com nonce e `strict-dynamic`, `frame-ancestors 'none'`, `form-action 'self'`, `connect-src 'self'`; `X-Frame-Options: DENY`; `Referrer-Policy: no-referrer`; `nosniff`; HSTS; `no-store` |
| `/lojista/desistir-da-exclusao` | 200 no host do lojista, 404 no host público |

**Observações sem ID:** a página diz "Se existir uma conta, enviamos um código", mas a conta com e-mail não confirmado nunca recebe o código: ela tem de usar "Excluir com e-mail e senha", e o texto da página não diz isso (UX do PO, não é falha de segurança). Os e-mails trazem o código no **assunto** ("Seu código Webag: 621745"), que aparece na tela de bloqueio. É um padrão antigo de todos os códigos; o risco é baixo e fica como sugestão ao PO.

## Rota dev de pagamento por pedido (F1, `e985bf5`)

`orders.dev.ts` só registra o módulo com `NODE_ENV` `development` ou `test` (`devOrderModulesFor`). A rota exige login, só a conta dona do pedido pode chamar (as outras recebem 404), só funciona com o provedor `fake` (409 nos demais) e segue o caminho do webhook assinado. `production-boot` passa: em **produção e em staging**, `/v1/dev/orders/{id}/payment/{approve,decline,expire}` dá **404**, mesmo com login. No app, o botão só aparece com `APP_ENV != production` e `PAYMENT_MODE=fake` (`checkout/config.ts`), e o `production` nunca resolve para `fake`. **Conforme.**

## Novos endpoints

- `GET /v1/me/coupons`: sempre usa o `userId` do token (`ownerUserId`), 120 por 10 min, paginação limitada a 50 e saída mínima (sem o pedido de origem). Sem BOLA. E2E `my-coupons` passa.
- `GET /v1/cep/{cep}`: agora atende qualquer conta. Regex estrita (`^\d{5}-?\d{3}$`, sem SSRF), cache por CEP e 60 por 10 min por IP. O custo de um geocodificador pago fica limitado ao número de CEPs **distintos**. Aceito.

---

### SEC-180 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/identity/code.service.ts:39-46` (`enforceSendLimits`: `code:h:<dono>:<finalidade>` 5/h e `code:dest:<sha(e-mail)>` 10/dia, compartilhados com quem só sabe o e-mail); `privacy/web-deletion.service.ts:56` (via A) e `identity/auth.service.ts:303` (esqueci a senha) consomem os mesmos contadores **antes** de achar a conta; `privacy/account-deletion.service.ts:237-239` (o dono, já com a senha certa, passa pelos mesmos limites).
Problema: o SEC-176 tirou o 429 do contador de tentativas, mas o step-up do arrependimento depende de **enviar um código**. Quem só sabe o e-mail esgota os limites de envio desse e-mail pelos fluxos anônimos (via A e "esqueci a senha"). Com a conta pendente, esses fluxos não mandam e-mail, então o dono não recebe nenhum sinal. Depois disso, a senha certa do dono recebe 429 e ele não consegue desistir.
Cenário de ataque: **provado (D2)** no ambiente local, contra o BFF:
1. Conta fechada pelo app (`pending`, 72 h).
2. O atacante manda 11 senhas erradas de 11 IPs, o que liga o step-up.
3. Faz 5 rodadas, com 61 s entre elas, de `start` (via A) + `password/forgot` com o e-mail do dono. Todas respondem `200`/`202`, e nenhum e-mail sai.
4. 61 s depois, o dono, de um IP novo e com a senha certa, recebe **429**. Contadores: `code:h:…:delete_web = 6` (bloqueia por 1 h) e `code:dest = 10`, com TTL de 86.093 s. A partir daí, cada pedido de código para esse e-mail é recusado por **24 h**.

São cerca de 21 requisições em 5 minutos, e repetir 3 vezes cobre as 72 h. Somado ao SEC-154 (senha vazada: o concorrente exclui a conta e a loja), a exclusão vira **irreversível**, e o suporte não tem ferramenta para desfazer (o `privacy:cancel-deletion` não foi feito). Pela leitura do código, o mesmo `code:dest` atende o step-up do login (`auth.service.ts:197`): com `lfa >= 20`, o dono também fica sem conseguir entrar por 24 h. **Suspeita**: isso não foi executado. Variante já coberta por E2E (`sec168-170-hardening:108`): conta com e-mail **não confirmado** sob ataque recebe 401 sempre, e não há caminho de volta.
Correção recomendada (backend-dev):
1. Separar o orçamento de envio de **quem provou a senha** do orçamento anônimo. No `cancel` (e no step-up do login), use `ownerKey = userId` e uma finalidade própria (`delete_cancel`), com o limite de destino em outra chave (por exemplo, `code:dest:proved:<userId>`, 5/h e 10/dia). Assim, as chamadas anônimas (via A, esqueci a senha) **não** consomem esse orçamento.
2. Se já existe um código `delete_web`/`delete_cancel` válido e não usado, responder 403 `LOGIN_CODE_REQUIRED` sem emitir outro (não consome limite).
3. Rede de segurança: comando `privacy:cancel-deletion <email>` (super admin, com a identidade conferida pelo `runbook-dsr.md`, auditado). Ele resolve também a conta não confirmada e vira o passo 5 do runbook.
4. Alerta à operação quando uma conta `pending` passar do limite de tentativas (sinal de ataque à loja).
Como verificar a correção: o D2 vira E2E. Depois de 11 falhas de IPs diferentes e de 5 rodadas de via A + "esqueci a senha" (com `code:int` zerado entre elas), a senha certa recebe 403 `LOGIN_CODE_REQUIRED` **com** o código emitido, e o código dá 204. O mesmo vale para o login com step-up.

## O que depende do fundador

1. **Domínio e deploy** de `https://<domínio>/excluir-conta`, `/privacidade` e `/termos`. Sem isso, o Data Safety não tem URL.
2. **Revisão jurídica** (J1 a J14): prazos da página, bases legais, IP truncado, "não pode ser desfeita".
3. **SEC-169 (geocodificador):** contratar um provedor (custo, operador a registrar na política) **ou** aceitar o resíduo: o pino não é conferido dentro do município. Se aceitar, o mínimo é a Logística ver "pino não conferido" no painel. A decisão vai para `decisoes.md`.
4. Nada mais bloqueia o G4. O SEC-180 é Média: o CEO decide se entra antes do G5 (recomendado, porque o SEC-154 já tem esse vetor) ou antes do piloto com lojistas.

## Limites desta revisão

- Ambiente **local**: provedor de pagamento e geocodificador **falsos**, storage em memória, Next servido por `next start` (não pela imagem `standalone`) e **sem nginx**, com o `X-Real-IP` forjado no teste. Em produção, o nginx sobrescreve esse cabeçalho (SEC-129). Isso tem de ser conferido no primeiro deploy.
- **Sem** Mercado Pago real, **sem** aparelho físico e **sem** pentest de rede. As 72 h e a anonimização efetiva da conta excluída pela web não foram esperadas: estão cobertas pelo E2E do `closeAccount`, e o QA confere no reteste.
- Os scripts de ataque (`attack.mjs`, `d2.mjs`) ficaram fora do repositório. O D2 deve virar E2E junto com o SEC-180.
