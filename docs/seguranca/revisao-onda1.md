# Revisão de segurança da Onda 1 (API de identidade, admin, pagamentos base, painel web e app)

- **Data:** 2026-11-18 (revisão e reverificação) | **Revisor:** security-engineer | **Base:** `main` em `fd4e9a5` (correções B1 e I1–I8 do tech-lead já no `main`: `55fb0ac`, `ba4d5ee`, `28ae6c3`). O trabalho da Onda 2 ainda não commitado no working tree (stores, catalog, media, storage) ficou **fora** do escopo.
- **Escopo:** `apps/api/src/modules/{identity,admin,payments,users}`, `platform/*`; `apps/web` (BFF de sessão `app/api/session`, proxy `app/api/proxy`, `proxy.ts`, reautenticação, rascunho dos termos); `apps/mobile` (cliente HTTP, `expo-secure-store`, endereço em AsyncStorage, `returnTo`, deep links, ViaCEP, `app.config.ts`).
- **Referências:** `requisitos-seguranca.md` (SEC-001..096), `threat-model-auth-pagamento.md`, `revisao-adrs.md`, ADR-003, ADR-009, DEC-014..028, `docs/arquitetura/reviews/review-onda1-api.md`.

## Parecer final (reverificação, 2026-11-18): APROVADO COM RESSALVAS para fechar a Onda 1

SEC-113 e SEC-114 (Altos) e os Médios SEC-115, SEC-116 e SEC-117 estão **corrigidos e reverificados** (código lido e testes de ataque executados, ver "Reverificação" abaixo). Nenhuma Crítica ou Alta aberta. O veto da DEC-029 cai. Ressalvas: um achado Médio novo de configuração (SEC-129, prazo G4) e os Baixos do app (SEC-121 app, 122, 123, 126), cada um com a onda de destino na tabela de ressalvas.

## Parecer original (2026-11-18): REPROVADO para fechar a Onda 1 (2 achados Altos; correção pequena)

A base de autenticação é boa e o B1 do tech-lead está corrigido e testado (o código de e-mail é conferido antes do TOTP; 10 resets anônimos não tocam o contador do 2º fator). Há **dois defeitos Altos confirmados no código**: (1) um admin que usou código de recuperação fica protegido só pela senha (ou só pela caixa de e-mail) até reconfigurar o TOTP, o que anula o 2º fator obrigatório (SEC-015, DEC-018); (2) o BFF do painel repassa à API o IP que o próprio navegador declara, e com isso todo limite por IP e o registro de acesso (Marco Civil) ficam falsificáveis. **Corrigidos SEC-113 e SEC-114, com os testes indicados, o parecer passa a APROVADO COM RESSALVAS** (Médios antes do G4). O security-engineer reverifica só esses dois pontos.

## O que foi executado

| Verificação | Resultado |
|---|---|
| Leitura do código (não do resumo) de `identity/*`, `auth.guard`, `session`, `totp`, `ticket`, `code`, `admin-users`, `env.ts`, `app.setup.ts`, `app.module.ts` (redação de log), `problem.filter`, webhook e assinatura; BFF web; app | Achados abaixo |
| `vitest` e2e de identidade com Postgres e Redis reais: `admin-mfa-2step`, `admin-mfa`, `auth`, `codes-reset`, `rbac`, `break-glass` | 6 arquivos, 78 testes OK |
| `production-boot.e2e-spec.ts` no working tree | 2 falhas por `STORAGE_DRIVER=memory` (trabalho da Onda 2 não commitado; não é regressão da Onda 1). Avisar o backend-dev |
| `pnpm audit` | 0 Crítica; Alta só `picomatch <=4.0.7` (CVE-2026-112366, ReDoS, **sem versão corrigida**), em ferramentas de dev (`@nestjs/cli`, `jest`), ignorada em `pnpm-workspace.yaml`. **Justificativa registrada aqui:** não entra no runtime da API, do web nem no bundle do app; glob controlado pelo time. Reavaliar quando sair correção. 3 Moderadas (esbuild do `drizzle-kit`, glob/minimatch do jest), todas de dev. `pnpm audit --audit-level high` sai 0 |
| Busca de segredos (arquivos versionados e histórico completo: `APP_USR-`, `-----BEGIN`, AKIA, `ghp_`, `sk_live_`, JWT, chaves Google, atribuições de `password/secret/token`) e no bundle exportado do app (`apps/mobile/dist`, ignorado no git) | Nada real. Só os valores `DEV_*` de `env.ts`, que derrubam o boot em produção (SEC-080). `.env` fora do git |
| `pnpm --filter @webag/mobile typecheck` após a correção SEC-120 | OK |

**Não coberto:** pentest dinâmico; execução do BFF web contra a API real; inspeção do armazenamento em aparelho/emulador; proxy reverso e TLS (ainda não existem: sem nginx versionado); Docker compose (DEC-026). Pentest externo antes de escalar continua recomendado.

## Reverificação (2026-11-18)

- **Base:** `main` em `c68a9fb`, com as correções `ce9cc44`, `9a58f5d` (API), `f4d2336`, `487692e` (web), `81a00a7` (CI e logs). O trabalho da Onda 2B não commitado (catálogo) ficou fora; os testes rodaram com ele no working tree sem interferência.
- **Executado:**

| Verificação | Resultado |
|---|---|
| e2e da API com Postgres e Redis reais: `admin-sec113`, `admin-mfa-2step`, `admin-mfa`, `auth`, `codes-reset`, `rbac`, `break-glass`, `production-boot` | 8 arquivos, 93 testes OK (o `production-boot` voltou a passar) |
| Testes de ataque do Security (spec própria fora do repositório, mesma infraestrutura e2e) | 7 cenários, todos com o comportamento seguro (detalhe por achado abaixo) |
| `vitest` do `apps/web` | 39 arquivos, 345 testes OK |
| `pnpm audit --audit-level high` | 0 Alta/Crítica (5 Moderadas de dev) |
| Checksum do gitleaks 8.28.0 no CI conferido com o `checksums.txt` oficial da release | Igual |
| Busca de segredos no diff `fd4e9a5..HEAD` | Nada |

| ID | Resultado | Evidência e tentativas de quebra |
|---|---|---|
| SEC-113 | **CORRIGIDO** | `totp.service.ts:254-296`: recuperação marca `totp_reenroll_required_at`, apaga só o segredo e mantém os códigos restantes; `hasSecondFactor` (`:42`) vale para login (`auth.service.ts:209`) e reset (`:327-336`). **Ataques:** após usar 1 código de recuperação, login só com senha → 200 com `mfaRequired` e sem tokens; TOTP do segredo antigo → 401; código já usado → 401; sessão aberta por recuperação → 403 em rota de admin, e reautenticar com senha não destrava `recovery-codes` (403); reset só com o código do e-mail → `tokens: null`, senha intacta; `setup` em sessão comum com TOTP → 409; código de recuperação no `reauth` → recusado; admin sem TOTP há mais de 48 h → `ENROLLMENT_EXPIRED` (teste do dev) |
| SEC-114 | **CORRIGIDO** | Web: `src/server/client-ip.ts` usa o N-ésimo valor da direita ou cabeçalho sobrescrito pelo proxy; sem configuração, nada é repassado. API: `TRUST_PROXY` aceita lista de IP/CIDR (recusa `/0` e coringa); IP declarado pelo BFF só com `X-Webag-Bff-Secret` (tempo constante, header apagado antes dos logs). **Ataques:** 6 logins errados com XFF `<aleatório>, <real>` e segredo errado → 6º = 429; com o segredo, vale o IP declarado (6º = 429) e o segredo não volta na resposta; testes do web com XFF forjado não repassam o valor à API. Ressalva de implantação: SEC-129 |
| SEC-115 | **CORRIGIDO** | BFF: `login/route.ts` guarda o `mfaToken` em cookie `__Host-` HttpOnly SameSite=Strict de 5 min; `mfa/route.ts` lê o token só do cookie; `reset/complete` com o `resetTicket` em cookie. API: `totpCode` no login ou no reset → 400 (confirmado por ataque e pelo teste `admin-mfa-2step`). Playwright contra a API real continua pendente (o e2e usa o fake), coberto pelos testes de rota do BFF |
| SEC-116 | **CORRIGIDO** | `src/server/hosts.ts` + `proxy.ts` + todas as rotas `api/session/[area]` e `api/proxy/[area]`: área fora do seu host → 404; em produção sem `ADMIN_HOST`/`LOJISTA_HOST` recusa tudo (falha fechada); `X-Forwarded-Host` só com `WEB_TRUST_FORWARDED_HOST=true`; cookies `__Host-` (sem `Domain`). Testes `hosts`, `proxy-host` e `session-routes` com host errado → 404 sem chamar a API |
| SEC-117 | **CORRIGIDO** | `hit` atômico antes de conferir em `verifyWithLimits`, `login` e `assertPassword`; `release` só no acerto. **Ataques:** 10 logins paralelos para obter vários `mfaToken` + 50 `mfa/verify` paralelos → exatamente 5 conferências (`mfa:15` = `mfa:24` = 5); 15 `reauth` paralelos com TOTP errado → no máximo 5 conferências e a sessão encerrada; teste do dev: 20 logins paralelos do mesmo IP → 5 × 401 e 15 × 429 |
| SEC-118 | CORRIGIDO | `auth.service.ts:416-420`; teste do dev e ataque paralelo acima |
| SEC-119 | CORRIGIDO | `logout/route.ts:18-22` renova com o refresh e revoga |
| SEC-121 | **PARCIAL** | Web (lojista): corrigido e testado. App: `apps/mobile/src/api/auth-api.ts:99` ainda só trata `mfaRequired`; `mfaSetupRequired: true` abre sessão `mfa_setup` no app |
| SEC-124 | CORRIGIDO | `auth.service.ts:148-150`. **Ataque:** `forgot` → corrigir e-mail → `reset` com o código antigo → 400 |
| SEC-125 | CORRIGIDO | `>=` em `auth.service.ts:191`; teste com 20 falhas |
| SEC-127 | CORRIGIDO | `ci.yml` com `sha256sum -c`; hash confere com o oficial |
| SEC-128 | CORRIGIDO | `platform/logging/mask.ts` (`maskPii`/`safeErrorMessage`) no e-mail, auth e pagamentos |
| SEC-122, SEC-123, SEC-126 | ABERTO (Baixa) | Sem alteração; ver ressalvas |

**Achado novo**

| ID | Sev. | Status | Onde | Problema e cenário | Correção recomendada | Como verificar | Dono |
|---|---|---|---|---|---|---|---|
| SEC-129 | Média | Aberto | `apps/web/src/server/upstream.ts:20-23`; `apps/api/src/platform/config/env.ts:55-56` | A correção do SEC-114 depende de configuração que **não é obrigatória em produção**: sem `WEB_TRUSTED_PROXY_HOPS`/`WEB_CLIENT_IP_HEADER` o web só escreve um aviso, e `BFF_SHARED_SECRET` é opcional nos dois lados. Não há falsificação de IP, mas todos os usuários do painel passam a ter o IP do BFF. **Cenário:** um atacante erra 5 vezes a senha de um lojista pelo painel e o tranca fora por 15 min (a espera é por conta+IP e o IP é o mesmo para todos); 20 cadastros/h por IP (SEC-063) e 60/min viram teto global do painel, derrubando o cadastro de lojas no lançamento | Em produção, o web falha no boot sem `BFF_SHARED_SECRET` e sem uma das duas variáveis de IP (e com `WEB_CLIENT_IP_HEADER=x-forwarded-for`, que não é sobrescrito); a API falha no boot sem `BFF_SHARED_SECRET` enquanto o painel web existir. Corrigir o comentário de `env.ts:55` (o header é `X-Webag-Bff-Secret` + `X-Forwarded-For`, não `X-Webag-Client-IP`). Incluir no guia de deploy (DT-012) com o `proxy_set_header` do nginx | Boot de produção do web e da API sem as variáveis → falha com a mensagem; staging: 5 logins errados de um IP não trancam o mesmo lojista entrando de outro IP | mobile-dev (web), backend-dev, tech-lead (deploy) |

**Observações sem severidade de segurança** (encaminhar como bug ou ajuste):
- O-1 (backend-dev, bug funcional): `correctEmail` (`auth.service.ts:143-151`) grava o e-mail novo e invalida códigos **antes** de checar o intervalo de 60 s de envio; dentro desse intervalo responde 429 com a troca já feita e sem código no endereço novo. Falha segura, mas confunde o usuário. Checar o limite antes de gravar, ou responder 204 e deixar o "Reenviar".
- O-2 (mobile-dev web): no host do lojista, reset de senha de uma conta de admin devolve o `resetTicket` no corpo ao JS (`app/api/proxy/[area]/[...path]/route.ts:63` só trata `area === 'admin'`). Exige o código do e-mail e o TOTP para concluir; sugerido responder como no admin (sem o ticket no corpo).

**Ressalvas para fechar a Onda 1 (não bloqueiam; destino de cada pendência)**

| Pendência | Sev. | Onda | Dono |
|---|---|---|---|
| SEC-129 configuração de IP obrigatória em produção | Média | Onda 8 (guia de deploy), obrigatório antes do G4 | mobile-dev (web), backend-dev, tech-lead |
| SEC-121 no app (`mfaSetupRequired` como credencial errada + logout) | Baixa | Onda 3A (app do cliente) | mobile-dev |
| SEC-122 limpar endereços ao trocar/perder sessão | Baixa | Onda 3A (endereços na API, DEC-028 c) | mobile-dev |
| SEC-123 ViaCEP citado na política ou via API | Baixa | Onda 3A (app) e Onda 6 (política) | mobile-dev, product-owner |
| SEC-126 `+not-found.tsx` no app | Baixa | Onda 3A | mobile-dev |
| Playwright do login em 2 passos contra a API real (SEC-115) | Teste | Onda 8 (e2e de release) | qa-engineer |
| DT-031 rotação do `BFF_SHARED_SECRET` | Dívida | Antes do G5 | backend-dev, tech-lead |
| Antes do G4, já registrados: DT-021 (SEC-075), Sentry `beforeSend` (SEC-073), vetor oficial do MP (DT-023), `incidentes.md` | — | Onda 8 | conforme item 5 da lista de trabalho |

## Achados

| ID | Sev. | Status | Onde | Problema e cenário | Correção recomendada | Como verificar | Dono |
|---|---|---|---|---|---|---|---|
| SEC-113 | **Alta** | Corrigido (reverificado) | `identity/auth.service.ts:195-214` (login), `identity/totp.service.ts:239-260` (`verifyLoginCode` → `clear`), `auth.service.ts:318-324` (reset) | Usar um código de recuperação **apaga o TOTP e os códigos restantes** (`totpConfirmedAt = null`). A partir daí o login do admin, por não ver TOTP confirmado, abre sessão `mfa_setup` **só com a senha**, e essa sessão pode chamar `POST /v1/admin/totp/setup` + `confirm` e virar sessão completa. O teste `admin-mfa.e2e-spec.ts:128` já registra o comportamento (2º login com senha → 200). O mesmo estado deixa o "esqueci a senha" do admin trocar a senha **só com o código do e-mail** (sem ticket de 2º fator). **Cenário realista:** o admin perde o celular, entra com um código de recuperação e ainda não tem aparelho novo; até reconfigurar, quem tiver a senha (phishing, reuso) ou a caixa de e-mail vira super admin (estornos, PII, parâmetros). Contraria SEC-015, SEC-092 ("o antigo morre", mas o acesso continua exigindo 2º fator) e SEC-095 | (1) Usar código de recuperação **não** zera o enrolamento: marcar `admin_profiles.totp_reenroll_required_at`, invalidar o segredo antigo e **manter os códigos restantes válidos**. (2) Login de admin que já teve TOTP (`reenroll_required` ou com códigos de recuperação) sempre passa pelo `mfaToken` e exige um código de recuperação restante; nunca abre sessão só com senha. (3) `setup` só é permitido em sessão aberta por recuperação (gravar `sessions.mfa_factor = 'recovery'`) ou por convite/reativação. (4) `resetPassword`: admin ativo **sem** TOTP confirmado não tem reset (SEC-095 já diz "admin com convite pendente não tem reset: pede novo convite"); admin em reenrolamento passa pelo ticket com código de recuperação. (5) Menor: admin convidado/reativado tem 48 h após aceitar para configurar o TOTP; depois, a senha sozinha não abre `mfa_setup` (pede novo convite) | e2e: após usar 1 código de recuperação, login só com senha → 200 com `mfaRequired` (sem tokens); `mfa/verify` com outro código de recuperação → sessão `mfa_setup`; com código já usado → 401. `password/reset` de admin em reenrolamento só com código do e-mail → senha não muda. Admin convidado há 49 h sem TOTP → login não abre sessão | backend-dev |
| SEC-114 | **Alta** | Corrigido (reverificado; ver SEC-129) | `apps/web/src/server/upstream.ts:11-12` e `:39`; `apps/web/proxy.ts:64` | O BFF pega o **primeiro** valor de `X-Forwarded-For` (controlado pelo navegador) e o envia à API como IP do cliente; com `TRUST_PROXY>=1` (obrigatório em produção), `req.ip` vira esse valor. **Cenário:** o atacante manda `X-Forwarded-For: <aleatório>` a cada `POST /api/session/lojista/login` e anula a espera de 5 falhas por conta+IP (SEC-004), o teto de 60/min por IP, 20 cadastros/h por IP (SEC-063), 30 códigos/h por IP (SEC-003) e 10 `email-exists`/min (SEC-005): credential stuffing e enumeração em volume contra lojistas, mais CPU de Argon2. O `access_log` e a auditoria gravam IP forjado (Marco Civil art. 15, SEC-075). Se não houver proxy na frente do Next, o efeito é o mesmo | (1) No web, derivar o IP de fonte confiável: com N proxies na frente, usar o **N-ésimo valor a partir da direita** do XFF (variável `WEB_TRUSTED_PROXY_HOPS`, sem padrão em produção) ou um header que o proxy **sobrescreve** (`X-Real-IP $remote_addr`), nunca o primeiro. (2) Na API, `trust proxy` por **lista de IPs/sub-rede** (o BFF e o nginx), não por número de saltos, para que só eles possam declarar IP (`TRUST_PROXY` aceitar CIDR). (3) A porta da API não fica exposta fora da rede interna. (4) Documentar no guia de deploy | Teste do `clientHints`: XFF `1.1.1.1, 2.2.2.2` com 1 salto confiável → `2.2.2.2`; e2e: 6 logins errados pelo BFF com XFF diferente a cada vez → 6ª = 429 | mobile-dev (web), backend-dev (`TRUST_PROXY` por CIDR), tech-lead (deploy) |
| SEC-115 | Média | Corrigido (reverificado) | `apps/web/app/api/session/[area]/login/route.ts:51-63`; `src/features/auth/login-form.tsx:63`; `app/api/proxy/[area]/[...path]/route.ts:13`; API `auth.service.ts:204-210, 320-322` | O painel não implementa o login em 2 passos do SEC-090 (DEC-027): a API devolve `{mfaRequired, mfaToken}`, o BFF lê como `tokens`, chama `/v1/me` sem token e responde "E-mail ou senha incorretos". Admin com TOTP **não consegue entrar** (falha fechada) e o form espera um `TOTP_REQUIRED` que a API não emite mais. O reset de 2 passos também não passa (`password/reset/complete` fora da allowlist). Enquanto isso, a API mantém os caminhos legados de 1 chamada | BFF: rota `POST /api/session/admin/mfa` que chama `/v1/auth/mfa/verify` e grava os cookies; o login devolve só `{mfaRequired:true}` e guarda o `mfaToken` em cookie HttpOnly curto (5 min), não no JS. Incluir `auth/password/reset/complete` na allowlist do admin. Depois, a API remove `totpCode` do login e do reset | Playwright contra a API real (não o fake): admin com TOTP entra em 2 passos; senha certa + código errado → "Código incorreto ou vencido."; login com `totpCode` no corpo → 400 | mobile-dev (web); backend-dev (remover legado) |
| SEC-116 | Média | Corrigido (reverificado) | `apps/web/proxy.ts:48`; `app/api/proxy/[area]/...` | A separação admin x lojista é só por **caminho** no mesmo app; nada impede que `/lojista/*` (que exibirá conteúdo de lojista) seja servido no host do admin e vice-versa. Um XSS em tela de lojista aberta no host do admin roda com os cookies do admin. Pendência de SEC-082/DEC-018 | Variáveis `ADMIN_HOST` e `LOJISTA_HOST` (obrigatórias em produção); o `proxy.ts` e as rotas `/api/session|proxy/[area]` devolvem 404 quando a área não corresponde ao host | Requisição a `admin.<dominio>/lojista/entrar` → 404; `lojista.<dominio>/api/proxy/admin/...` → 404; cookie do lojista ausente no host admin | mobile-dev (web), tech-lead |
| SEC-117 | Média | Corrigido (reverificado) | `identity/totp.service.ts:177-199`; mesmo padrão em `auth.service.ts:166-176` e `:434-438` | Limite do 2º fator em "olhar contador → conferir → contar erro": requisições paralelas passam do teto (tech-lead mediu 6 de 20; com vários `mfaToken` em paralelo, dezenas). O teto de adivinhação do SEC-091 (≈3 × 10⁻⁵ por senha vazada) fica uma ou duas ordens de grandeza maior | `hit` atômico **antes** de conferir; no sucesso, `decr`/`reset`. Mesmo ajuste no limite de login e no `assertPassword` | 20 `mfa/verify` paralelos com código errado → no máx. 5 conferências; o 6º e seguintes → 429 sem conferir | backend-dev |
| SEC-118 | Baixa | Corrigido | `auth.service.ts:398-409` | SEC-091(d): 5 erros de TOTP na reautenticação deveriam encerrar a sessão; hoje só dão 429 | No 5º erro na reautenticação, `revokeSessions(..., {onlySessionId})` | 5 TOTP errados no `reauth` → a sessão → 401 | backend-dev |
| SEC-119 | Baixa | Corrigido | `apps/web/app/api/session/[area]/logout/route.ts:14` | Sair do painel com o access vencido (só o refresh no cookie) apaga os cookies mas **não revoga** a sessão no servidor (SEC-012/AUTH) | Sem access: renovar e então chamar `/v1/auth/logout`; ou endpoint de logout que aceite o refresh | Sessão ociosa > 15 min → Sair → o refresh antigo → 401 | mobile-dev (web) |
| SEC-120 | Baixa | **Corrigido** | `apps/mobile/app.config.ts` | Android com backup automático (padrão `allowBackup: true`): endereços do AsyncStorage e o id do aparelho iam para o backup do Google Drive; o SecureStore restaurado não decifra | `android.allowBackup: false` (aplicado nesta revisão; typecheck OK) | `npx expo config --type introspect` mostra `android:allowBackup="false"` no manifesto | security-engineer (feito) |
| SEC-121 | Baixa | Parcial (web corrigido; app aberto) | `apps/mobile/src/api/auth-api.ts:99`; `apps/web/app/api/session/[area]/login/route.ts:51` | Admin **sem** TOTP (`mfaSetupRequired: true`) entra no app e no painel do lojista e fica com uma sessão `mfa_setup` (a API nega tudo com 403, mas a sessão existe). O caso `mfaRequired` está certo (responde como credencial errada, como o mobile-dev pediu) | Tratar `mfaSetupRequired: true` como credencial errada no app e na área `lojista` do BFF, chamando `/v1/auth/logout` antes de responder | Login no app com admin recém-convidado → "E-mail ou senha incorretos" e nenhuma sessão ativa no banco | mobile-dev |
| SEC-122 | Baixa | Aberto (aceitável até a Onda 3A) | `apps/mobile/src/features/address/store.ts`; `src/api/session.ts:60` | Endereço em AsyncStorage é **aceitável** por ora (DEC-028 c: vira cache quando `/v1/me/addresses` existir), mas só é apagado no "Sair" manual; sessão encerrada pelo servidor (expirada, reuso) ou outro usuário entrando no mesmo aparelho mantém os endereços do anterior | Chamar `addressStore.clearAll()` em todo `sessionStore.clear` e ao entrar com usuário diferente do último (guardar o `userId` dono da lista); ao migrar para a API, o cache local fica por usuário | Sessão revogada no servidor → abrir o app → lista de endereços vazia | mobile-dev |
| SEC-123 | Baixa | Aberto | `apps/mobile/src/features/address/cep.ts:30` | O app consulta o ViaCEP direto: IP do usuário + CEP vão a terceiro sem contrato. Sem dado além do CEP, HTTPS e resposta validada com Zod (ok). Risco de transparência (LGPD art. 9) e de disponibilidade | Curto prazo: citar a consulta de CEP a serviço de terceiro na política de privacidade (PO + jurídico). Quando a API expuser a consulta de CEP ao app (já existe para o lojista na Onda 2), usar a API e remover a chamada direta | Política cita o serviço; ou grep no bundle sem `viacep.com.br` | mobile-dev, product-owner |
| SEC-124 | Baixa | Corrigido | `auth.service.ts:147` | "Corrigir e-mail" invalida só o código `verify_email`; um código `reset_password`/`login_stepup` enviado ao endereço errado (de outra pessoa) continua válido por até 10 min e permitiria trocar a senha da conta | Invalidar códigos ativos de **todas** as finalidades e os tickets abertos do usuário ao corrigir o e-mail | `forgot` → corrigir e-mail → `reset` com o código antigo → 400 | backend-dev |
| SEC-125 | Baixa | Corrigido | `auth.service.ts:185`; teste `auth.e2e-spec.ts:149` | Step-up usa `>` e exige 21 falhas (o teste faz 21); SEC-004 e o parâmetro dizem 20 | `>=` e o teste com 20 | 20 falhas → login certo → 403 `LOGIN_CODE_REQUIRED` | backend-dev |
| SEC-126 | Baixa | Aberto | `apps/mobile/app/` (sem `+not-found.tsx`) | Deep link `webag://` para rota inexistente mostra a tela padrão do Expo Router; SEC-084 pede voltar à home. Hoje nenhuma rota dispara ação sensível só pelo link (verificado) | `app/+not-found.tsx` que redireciona para `/`; manter a regra "deep link nunca executa ação, só abre tela" | `npx uri-scheme open webag://qualquer` → home | mobile-dev |
| SEC-127 | Baixa | Corrigido | `.github/workflows/ci.yml:79-82` | O gitleaks é baixado sem conferir o checksum (cadeia de suprimento do CI) | Conferir `sha256sum -c` com o checksum publicado da versão fixada | Alterar o hash no workflow → job falha | backend-dev, tech-lead |
| SEC-128 | Baixa | Corrigido | `app.module.ts:48-55`; `platform/mail/mail.service.ts:58` | SEC-072 parcial: a redação do pino cobre `authorization`, `cookie`, `set-cookie` e corpo, mas mensagens de erro do SMTP podem trazer o e-mail do destinatário e não há máscara de e-mail/telefone em log de aplicação | Função `maskPii` nos `logger.warn/error` que interpolam mensagens externas; redigir `req.query.email` se surgir | Teste do logger com erro SMTP contendo e-mail → mascarado | backend-dev |

Respostas aos pontos que o mobile-dev pediu: **endereço em AsyncStorage** aceito até a Onda 3A com SEC-120 (corrigido) e SEC-122; **ViaCEP** aceito com SEC-123; **conta admin respondendo como credencial errada** está correto para `mfaRequired` (SEC-121 cobre o caso sem TOTP); **`returnTo` só caminho interno** verificado (`safeReturnTo` recusa `//`, `://` e `\`; web: `safeNext`/`safeLojistaNext` presos ao prefixo da área). **Rascunho dos termos em `localStorage`** (web admin): aceitável, o conteúdo é texto que será público; não há `dangerouslySetInnerHTML` no web nem no app e a CSP usa nonce sem `unsafe-inline` em script.

## Matriz de requisitos (Onda 1)

Legenda: **V** verificado no código/teste; **P** parcial (ver nota); **A** aberto por achado; **F** fica para a onda que constrói o recurso; **N/A** não se aplica ainda.

| SEC | Estado | Evidência ou pendência |
|---|---|---|
| 001 senha Argon2id, política, lista comum | V | `password.service.ts` (m=19456, t=2, p=1; lista > 10 mil; 8–128 sem truncar) |
| 002 código de 6 dígitos | V | `code.service.ts` (`randomInt`, HMAC com `CODE_HMAC_KEY`, finalidade, 10 min, 5 erros, novo invalida); `delete_web` é F (Onda 6) |
| 003 limites de envio, resposta igual | V | `enforceSendLimits` por dono/IP/destino; `forgot` sempre 202. Limite por IP sujeito a SEC-114 |
| 004 login, espera por conta+IP, step-up | V | SEC-114, SEC-117, SEC-125 corrigidos (reverificação). Configuração de produção: SEC-129 |
| 005 `email-exists` | P | 10/min IP e 50/dia dispositivo: V; métrica e alerta > 1.000/h: F (observabilidade) |
| 006 reset revoga tudo, confirma e-mail, avisa | V | `applyNewPassword`; teste `codes-reset` |
| 007 troca de senha/e-mail | P | Senha atual exigida: V; troca de e-mail: F |
| 008 conta não confirmada | P | (b) papel de lojista: V; (e) corrigir e-mail: V com SEC-124; (a)(c)(d): F (pedido, exclusão, templates de pedido) |
| 009 login social | N/A | Flag desligada |
| 010 access JWT | V | HS256 fixo, `iss`/`aud`/`typ`, `sid` ativo lido do banco a cada request |
| 011 refresh rotativo, janela 30 s, família | V | `session.service.ts`; inatividade do admin no refresh (I1): V |
| 012 app: tokens só no SecureStore, logout revoga | V | `session-storage.ts`, `signOut`; AsyncStorage só com endereço (SEC-122) |
| 013 cookies, CSRF, CORS | P | Arquitetura BFF (SEC-106): `__Host-`/`__Secure-` HttpOnly Lax, `X-Webag-Client` + `Origin` + `Sec-Fetch-Site`: V. Refresh com `Path=/` no web (necessário ao BFF; aceito). CORS da API restrito: V |
| 014 revogação por evento | P | Sessões: V. Sockets: F (ADR-004). Funcionário removido: F |
| 015 TOTP obrigatório para admin | V | SEC-113 corrigido (reverificação) |
| 016 reautenticação 5 min | V | `@RequireReauth` em gestão de admins; demais ações sensíveis: F |
| 017 convites | V | 256 bits, hash, uso único, 48 h, revogável; reativação revoga anteriores (I7) |
| 020 BOLA | P | Sessões → 404: V; loja não-membro → 404: V. Demais recursos: F |
| 021 BFLA nega por padrão | V | Guard global + `permissions.ts` + `rbac.e2e-spec.ts` |
| 022 DTO estrito | V | `z.strictObject` nas entradas; saídas explícitas (`profile`, lista de admins) |
| 025 UUID | V | v4 (DT-016) |
| 030–044 pagamentos | P | 032/033 assinatura e antirreplay: V (I2, I6 corrigidos; vetor oficial do MP pendente, DT-023). 034 re-consulta e conferência: V no fake. 036 dev fora de produção: V por leitura (teste `production-boot` quebrado pelo WIP da Onda 2). 030, 031, 035, 037–044: F (Onda 4A) |
| 045–048 OAuth MP | F | Onda 2/4A |
| 050–053 upload | F | Onda 2 (fora do escopo desta revisão) |
| 060–067 abuso | P | 063 cadastro por IP/dispositivo: V (IP sujeito a SEC-114). Demais: F |
| 070, 071 exportação e exclusão | F | Onda 6 |
| 072 logs | V | SEC-128 corrigido (`maskPii`) |
| 073 Sentry | F | Não integrado ainda (G4) |
| 074 `audit_log` append-only | V | Trigger `0001_append_only_guards.sql`; auditoria na mesma transação |
| 075 retenção de `access_log` | F | DT-021 (G4) |
| 076 PII mascarada no admin | F | Telas de clientes ainda não existem |
| 080 boot falha com config insegura | V | `env.ts` `superRefine` (chaves distintas por finalidade, `TRUST_PROXY` obrigatório, MP `TEST-`, fake) |
| 081 headers e erros | V | API: nosniff, no-referrer, DENY, HSTS em produção, RFC 9457 sem stack. Web: CSP com nonce e `frame-ancestors 'none'` |
| 082 host próprio do admin | V | SEC-116 corrigido; hosts obrigatórios em produção (falha fechada) |
| 083 CSP e XSS | V | Sem `dangerouslySetInnerHTML`; QR desenhado em SVG local; termos como texto |
| 084 app: bundle, deep links, permissões | P | Sem segredo no bundle (varredura): V; localização aproximada e só em uso: V; `returnTo`: V; rota desconhecida: SEC-126 |
| 085 CI audit + gitleaks | V | `ci.yml`; justificativa da CVE ignorada nesta página; SEC-127 |
| 086 sem pinning | V | Decisão (DEC-017) |
| 090 TOTP e `mfa_token` | V | API e web em 2 passos (SEC-115 corrigido); legado removido |
| 091 limite do 2º fator por conta | V | SEC-117 e SEC-118 corrigidos |
| 092 códigos de recuperação | V | Reenrolamento (SEC-113) corrigido; rota de regenerar exposta com reautenticação TOTP |
| 093 redefinir acesso de outro admin | V | `resetFor`/`performAccessReset`; aviso aos outros super admins (I7) |
| 094 break-glass | P | CLI e teste e2e: V; runbook e teste em staging: Onda 8 |
| 095 "esqueci a senha" do admin | V | SEC-113, SEC-115, SEC-116 corrigidos; admin sem 2º fator pede novo convite |
| 096 exclusão pela web | F | Onda 6 |

## Decisões do ADR-009 (parecer do Security)

| # | Parecer |
|---|---|
| 1 refresh derivado por HMAC | Aceito (chave própria `AUTH_HMAC_KEY` desde `ba4d5ee`) |
| 8 chave única | Resolvido: chaves distintas por finalidade e boot falha se repetidas (I10) |
| 9 login em 1 chamada | Substituído pelo SEC-090 de 2 passos (DEC-027). O caminho legado sai da API assim que o web adotar os 2 passos (SEC-115) |
| Demais | Sem objeção de segurança além das ressalvas do tech-lead |

## Lista de trabalho (ordem)

> Situação em 2026-11-18 (reverificação): itens 1 e 2 concluídos; item 3 pendente (Onda 3A); item 4: SEC-127 feito, guia de deploy segue pendente com SEC-129 (Onda 8); item 5 inalterado. A lista de ressalvas acima é a referência atual.

1. **backend-dev:** SEC-113 (bloqueante) com os testes da coluna "Como verificar"; ajustar `admin-mfa.e2e-spec.ts:128`, que hoje afirma o comportamento errado. Depois SEC-117, SEC-124, SEC-125, SEC-118, SEC-128; `TRUST_PROXY` por CIDR (parte de SEC-114); avisar que `production-boot` quebrou com o WIP da Onda 2.
2. **mobile-dev (web):** SEC-114 (bloqueante), SEC-115, SEC-116, SEC-119, SEC-121 (área lojista).
3. **mobile-dev (app):** SEC-121, SEC-122, SEC-126; SEC-123 com o PO.
4. **tech-lead:** guia de deploy com proxy, `X-Real-IP`/saltos confiáveis e hosts separados (SEC-114, SEC-116); SEC-127.
5. **Antes do G4 (já registrados):** DT-021 retenção (SEC-075), Sentry com `beforeSend` (SEC-073), vetor oficial da assinatura do MP (DT-023), `incidentes.md`.
