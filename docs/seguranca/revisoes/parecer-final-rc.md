# Parecer final de segurança do RC (DEC-077, código em `f622bc9`): G4 e G5

- **Data:** 2026-11-20 | **Revisor:** security-engineer | **Branch:** `claude/admiring-lamport-62tq1a`. O código revisado é `f622bc9`; `832cb37` só tem documentos (`git diff f622bc9 HEAD -- apps packages infra` vazio). Continua `onda-8-dec-073.md`.
- **Escopo:** reverificação de SEC-181 a 185, SEC-180 (contra o web em build de produção), SEC-176, 166, 175 e 177. Código novo desde `1686d58`: A-01 a A-10 do tech-lead (`docs/arquitetura/reviews/onda-8.md`), "Avaliar" e "Pedir troca" liberados (`b4e4d07`), manutenção, "Você recebe" (`922f082`) e o convite de admin. Também segredos (árvore e histórico), dependências, licenças, OWASP API Top 10, MASVS e o inventário das lojas.
- **Método** (tudo local, em banco, Redis e portas próprios; o QA roda em outro clone):
  - **E2E completo a frio** no RC, em banco próprio (`webag_secfinal_test`): **106 arquivos e 827 testes, todos passam** (703 s).
  - **Ataques próprios** numa spec E2E fora do repositório (9 cenários, todos com o resultado esperado). Abaixo, cada um com o resultado.
  - **Ambiente vivo:** a API foi compilada do RC (porta 3330, banco `webag_secfinal_live` migrado até a 0056 e semeado, Redis próprio na 6393, SMTP de captura). O web rodou em **build de produção** (`next build`, `NODE_ENV=production`, porta 3331), com os hosts `pub.local`, `adm.local` e `loj.local` e o IP por `X-Real-IP`, como no compose de produção.
  - Testes do app (jest: `location-privacy`, `cancel-deletion`, `open-link`; 14 passam) e do web (vitest: `public-deletion`, `account-deletion-route`, `prod-config`; 15 passam).
  - Busca de segredos em todo o histórico (513 commits, 2.606 caminhos), `pnpm audit` e `pnpm licenses list --prod`.

## Pareceres

| Gate | Parecer | Condições |
|---|---|---|
| **G4** (segurança) | **APROVADO** | Não há achado Crítico, Alto nem Médio aberto. SEC-181 a 185 estão corrigidos e provados por ataque. O SEC-180 também resistiu ao D2 contra o BFF em build de produção. Os achados abertos são todos Baixos e nenhum deles bloqueia: a tabela "Abertos" dá o prazo de cada um. **Não uso o veto.** Ressalva de método: não houve Mercado Pago real nem pentest (ver "Limites"), e isso vira condição do G5 |
| **G5 Google Play** | **APROVADO COM CONDIÇÕES** | As condições C1 a C8 abaixo valem **antes do envio**. Nenhuma delas é de código do app |
| **G5 App Store** | **APROVADO COM CONDIÇÕES** | C1 a C8 e mais C9. O App Privacy passa a declarar **Coarse Location**, porque o SEC-179 foi corrigido no código |

### Condições do G5 (antes de enviar às lojas)

| # | Condição | Dono | Por quê |
|---|---|---|---|
| C1 | Domínio e deploy com TLS de `https://<domínio>/excluir-conta`, `/privacidade` e `/termos`. A API e o web sobem com `infra/docker-compose.prod.yml`, cada painel no seu host | **Fundador** (domínio e hospedagem custam dinheiro, regra 6), tech-lead/backend-dev (deploy) | URL obrigatória do Data Safety e da política. O código já recusa subir com http ou localhost (SEC-172, A-01) |
| C2 | Segredos de produção gerados com `infra/scripts/gen-secrets.sh`, uma chave por finalidade, guardados fora do git. Nenhum valor de `infra/env.example` em produção | tech-lead / backend-dev; o **fundador** guarda o cofre | O boot de produção recusa só uma parte dos padrões fracos |
| C3 | Teste de fumaça em **staging** com o **sandbox do Mercado Pago**: PIX e cartão aprovados, recusa, webhook com assinatura **válida** e **inválida** (a inválida tem de ser recusada), reconsulta do pagamento, estorno e OAuth de 1 lojista | backend-dev, qa-engineer; o **fundador** cria a conta e as credenciais de teste (gratuitas) | O webhook e o split nunca rodaram contra o MP real. É o maior risco técnico que sobra |
| C4 | Revisão jurídica da política, dos termos e dos prazos (J1 a J16), incluindo o "5 anos" de `retencao_bloqueio_anos` (SEC-185) e os 5 anos da prova de aceite | **Fundador** / advogado | LGPD e CDC. Eu não sou advogado |
| C5 | Encarregado (DPO) indicado, ou a dispensa avaliada, e o canal publicado. O `runbook-dsr.md` adotado por quem atende (SEC-163 a/b) | **Fundador** | Art. 41 da LGPD; o prazo de 15 dias do art. 18 precisa de um dono |
| C6 | Data Safety (Play) e App Privacy (Apple) preenchidos **exatamente** por `inventario-lojas.md`, reconferido hoje contra o RC | Fundador ou PO (console das lojas) | Formulário diferente do app é motivo de remoção |
| C7 | Reexecutar contra o **deploy real** (nginx e TLS) a minha bateria curta de hosts, CSRF, cabeçalhos e D2. Leva cerca de 30 min | security-engineer | Aqui o nginx não rodou: o `X-Real-IP` e o `default_server` só foram lidos |
| C8 | Conta demo para o revisor da loja em **staging**, sem dado real, e as notas ao revisor com o caminho de exclusão de conta | PO / mobile-dev | Diretrizes 5.1.1(v) (Apple) e política de exclusão do Play |
| C9 (Apple) | Num build iOS, conferir em Ajustes > Webag que a "Localização precisa" está **desligada**. Se estiver ligada, declarar Precise Location | mobile-dev / QA | Garante que o rótulo Coarse é verdadeiro (SEC-179) |

**Recomendado, sem bloquear o piloto:** um pentest externo antes de escalar para fora da região do piloto (mais de cerca de 30 lojas), ou antes de ligar o Mercado Pago em produção para o público em geral, o que vier primeiro. O custo é decisão do fundador.

## Reverificação (com prova)

| ID | Sev. | Status | Prova |
|---|---|---|---|
| **SEC-181** | Média | **CORRIGIDO** | Ataque B4-1/B4-2 refeito. O celular `(11) 93141-5926` foi buscado por 10 trechos (4 a 10 dígitos, com e sem máscara) e o e-mail por 8 trechos (parte local, domínio, `x@`, `%@%`, `_` e `%` como curinga). Os curingas no nome foram `%%%`, `___` e `z%a`. **0 recuperações**: as 21 buscas parciais não devolvem a vítima. O valor exato acha (`11931415926` e o e-mail em maiúsculas). Há 22 linhas `user.search` na auditoria, nenhuma com o termo em claro (o termo vai como HMAC). O limite por admin vale mesmo trocando de IP: 60 vezes 200 e depois 429. O nome exige 3 ou mais caracteres. A spec antiga da onda 8 (B4-1/B4-2) agora **falha**, como esperado (o celular volta truncado e o termo curto dá 400) |
| **SEC-182** | Média | **CORRIGIDO** | Conta bloqueada pela via B: ticket, `finish` com `pending`, desistência 204, a conta volta **`blocked`** e o login dá 403. O desbloqueio pela operação continua funcionando. O E2E do repositório `sec182-blocked-deletion` (vias A e B, loja do dono suspensa e restaurada) passa. Código: `account-deletion.service.ts:166,292` (`previousUserStatus`, migração 0054) e `web-deletion.service.ts:17`. Variante nova: SEC-186 (Baixa) |
| SEC-183 | Baixa | **CORRIGIDO** | `OWNER_BLOCKED_SUSPENSION_REASON` é um texto fixo (`accounts.service.ts:26,194`). O E2E `b4-admin-users` confere o `suspensionReason` e o `decisionReason` sem o motivo |
| SEC-184 | Baixa | **CORRIGIDO** | Ataque: suporte e operação recebem `commission`, `applicationFee` e `merchantNetBeforeProviderFee` iguais a `null`. O financeiro recebe os valores (`admin-orders-read.service.ts`, `adminHasPermission(..., 'commissions:read')`) |
| SEC-185 | Baixa | **CORRIGIDO** (prazo a validar, C4) | O parâmetro `retencao_bloqueio_anos` (5, de 1 a 10) faz o passo `userStatusHistory` na retenção diária. O `privacy-map` foi atualizado e o E2E `privacy-dsr-retention` passa. A tela tem o aviso "não escreva dado pessoal" (`094c275`). Resíduo declarado: a linha `user.block` do `audit_log` (append-only) segue o prazo da auditoria. Observação 2 abaixo |
| **SEC-180** | Média | **CORRIGIDO** (API e web, provado contra o BFF em build de produção) | **D2 refeito, com 21 requisições do atacante.** Exclusão pelo app ficou `pending`. Foram 11 senhas erradas de 11 IPs (401 em todas), depois 5 rodadas com 61 s de intervalo, cada uma com via A (200 `{"sent":true}`) e "esqueci a senha" pelo BFF do lojista (202), um IP por rodada. A vítima recebeu **0 e-mails** do ataque: o único e-mail no período foi o "Recebemos o pedido", da própria exclusão. 61 s depois, o dono, de um IP novo e com a senha certa, recebeu **403 `LOGIN_CODE_REQUIRED` com o código entregue**. Um terceiro com o código e a senha errada recebeu 401. O dono com o código recebeu **204**, e o login seguinte deu 200. O E2E `sec180-code-budget` passa. Resíduo aceito (DEC-068): quem tem muitos IPs ainda manda código ao e-mail da vítima, até 5 por hora por IP |
| SEC-176 | Média | **CORRIGIDO** (API, web e app) | O mesmo D2 mostra o step-up sem 429 para o dono. App: `CancelDeletionForm` trata o 403 com o código (`cancel-deletion.test.tsx` passa). E2E `sec168-170-hardening` passa |
| SEC-166 | Alta | **FECHADO** (mantido) | `/excluir-conta` responde 200 no host público e 404 no do admin. As vias A e B seguem de ponta a ponta no D2 e nos E2E `privacy-web-deletion` e `sec182`. Resta a URL real no ar (C1) |
| SEC-175 | Média | **CORRIGIDO** (mantido) | O E2E `late-delivery` passa no RC, inclusive o cenário novo do A-02 (pedido de preparo pendente, saída, atraso e `cancel-late` com 200) |
| SEC-177 | Baixa | **CORRIGIDO** (mantido) | `late-delivery` L4 passa. O A-05 manteve a regra conservadora (DEC-076) |
| SEC-178 | Baixa | **CORRIGIDO** | `GET /v1/help` traz `deletionRegretHours` e os demais prazos (W.1). O web usa esses valores (`public-content.ts`, `public-deletion.spec` passa) |
| SEC-179 | Baixa | **CORRIGIDO no código** (falta o aparelho, C9) | `app.config.ts:53` (`NSLocationDefaultAccuracyReduced: true`) e `location.ts` (`roundCoord`, 2 casas, antes do geocodificador e da busca). `location-privacy.test.ts` passa |

## Código novo desde `1686d58`

| Item | Pergunta de segurança | Resultado |
|---|---|---|
| **A-01** links por host (`f5d3f18`) | Anti-phishing e host header | **Conforme.** O B2 e o convite de funcionário usam `LOJISTA_WEB_URL` e os convites de admin usam `ADMIN_WEB_URL`, sempre da configuração e nunca do `Host` (`grep` sem `headers.host` ou `x-forwarded-host` na API). O boot de produção recusa a variável ausente, http ou localhost (`env.ts:194-196`, `env.spec` cobre). O web em build de produção responde 404 com `Host: evil.com` ou com o host de outro painel. O redirecionamento do painel é **relativo** (`location: /lojista/entrar?next=...`). `X-Forwarded-Host: evil.com` é ignorado (só vale com `WEB_TRUST_FORWARDED_HOST`). O `next` passa por `safeNext`/`safeLojistaNext`. O nginx tem `default_server` com `server_name _` (lido, não executado: C7) |
| **A-02** migração 0055 | Pedidos de cancelamento duplos e dinheiro | **Conforme.** Índice único em `(order_id, kind)` com `pending`. O pedido `preparation` vira `superseded` na mesma transação da saída de `in_preparation` (`orders.service.ts:597`). O `decideCancelRequest` da loja trava o pedido e o pedido de cancelamento (`FOR UPDATE`). O estorno continua idempotente por `closeOrder`. Não há caminho para dois estornos |
| **A-03** idempotência sem `acceptedEtaToAt` (`88e799e`, `f622bc9`) | Abuso? | **Sem abuso.** Ataque: a mesma chave com outro `acceptedEtaToAt` devolve **o mesmo pedido** (200) e só existe 1 pedido. A mesma chave com outro `expectedTotalCents` continua dando 409 `IDEMPOTENCY_KEY_REUSED`. O campo só alimenta a conferência `ETA_CHANGED` (aviso ao cliente). A promessa (`etaFromAt`/`etaToAt`) é calculada no servidor a partir da cotação e do pagamento (`orders.service.ts:374,649`), nunca a partir do valor enviado pelo app. Tirar o campo da impressão digital não dá ao cliente controle sobre atraso nem compensação |
| **A-04** (`af33e19`) | Falha aberta | **Corrigido.** `adminProfileOf(admin)` devolve 403 sem perfil. Não sobrou nenhum `?? 'super_admin'` na API (`grep`) |
| **A-06** / 0056 faixa de despacho | O cliente ganha compensação indevida, ou o contrário? | **Conforme a DEC-076.** `eta_dispatch_*` só é gravada se for mais cedo que a promessa e só é lida por `eta-view.ts` (exibição). Atraso, cancelamento sem custo e compensação medem por `etaToAt` |
| **A-07** busca de pedidos | Oráculo e limite | **Conforme.** Ataque: 60 buscas por admin, depois 429, mesmo trocando de IP. A auditoria `order.search` não tem o termo em claro (HMAC). O e-mail só é aceito exato |
| A-08 | Parâmetro que desliga o lembrete | Validação cruzada `lembrete <= timeout - 2` (`admin/parameters.service.ts`, `assertAcceptReminderRule`). É só disponibilidade |
| A-10 | Arquivar produto de pedido em coleta | `ACTIVE_STATUSES` é compartilhada e o E2E do 409 `OPEN_ORDERS` passa |
| **"Avaliar" e "Pedir troca"** (`b4e4d07`) | IDOR, repetição, janela | **Conforme.** O `allowedActions` é só exibição: o servidor confere tudo de novo. Ataque: o cliente B avaliando, lendo avaliações ou pedindo troca do pedido de A recebe **404**. Avaliar antes da entrega dá 409. Campo extra (`userId`) dá 400. A segunda avaliação dá 409 (`REVIEW_ALREADY_EXISTS`). Produto fora do pedido dá 404. Avaliar depois de 31 dias dá 422 (E2E). Troca depois de 91 dias dá **422 `EXCHANGE_WINDOW_EXPIRED`**. Na troca, o dono e a elegibilidade são conferidos sob `FOR UPDATE` (`exchanges.service.ts:228-236`), e as fotos só são aceitas se forem do próprio cliente. A avaliação falsa por autoconsumo já está no threat model (SEC-065 e moderação) |
| Manutenção | Quem liga, o que vaza | Sem mudança desde a onda 8. O E2E `wb121-maintenance` passa. O app e o web mostram o `detail` como texto (React escapa) |
| **"Você recebe"** (`922f082`) | Vazamento de taxa a funcionário | Cálculo **só de tela**, com `providerFeePct`, que a API já devolve `null` ao funcionário (DEC-072, verificado na onda 8). Nenhum dado novo |
| **Convite de admin vira sessão completa após o TOTP** (pergunta do QA) | É intencional? Há risco? | **Intencional e aceito.** Ataque: o aceite devolve uma sessão `mfaVerified: false` e `mfaSetupRequired`. Antes do TOTP, `GET /v1/admin/users` dá **403 `MFA_REQUIRED`**. Reusar o token dá **410**. O `confirm` só promove a **mesma** sessão depois de um código TOTP válido (10 tentativas, QR válido por 10 min, `totp.service.ts:120-154`). Fazer o login de novo não acrescentaria segurança: quem tem o link do convite já define a senha e o TOTP e entraria em seguida do mesmo jeito. O risco real é o **e-mail do convidado comprometido**, e ele é coberto pelo uso único, pela validade de 48 h, pela revogação e pela auditoria `admin.invite_accept`. Sugestão sem ID ao backend-dev: avisar o super admin que convidou quando o convite for aceito |

## Commits pós-RC (DEC-078), conferidos por leitura

`a313b18` (V8.2), `4d0818e` (V8.3) e `21671cb` (V8.4) mexem só no web, em 21 arquivos de tela, CSS, textos e testes. **Sem impacto de segurança:**
- o `SafeImage` só usa o `src` que o painel já usava e troca a imagem pelo símbolo estático da marca; não usa `dangerouslySetInnerHTML`;
- os links das lojas vêm de `PLAY_STORE_URL`/`APP_STORE_URL`, que o boot de produção exige em https (`prod-config.ts`), e agora somem quando a variável está vazia;
- "conferir tudo só depois de abrir todos os documentos" é ajuda de **interface**, não controle de segurança. A aprovação da loja continua decidida e auditada no servidor.

Esses commits ficam cobertos por este parecer, desde que o QA confirme os testes do web. Daqui em diante, qualquer mudança em `apps/api`, no app, no BFF (`apps/web/app/api`, `proxy.ts`, `src/server`) ou em `infra` exige reconferência do Security antes do G5.

## Achados novos

| ID | Sev. | Dono | Resumo |
|---|---|---|---|
| SEC-186 | Baixa | backend-dev | Conta ativa com exclusão pendente não pode ser bloqueada, e a desistência a devolve ativa |

### SEC-186 | Severidade: Baixa | Status: Aberto
Onde: `backoffice/accounts.service.ts` (bloquear exige `active` e responde 409 `USER_NOT_ACTIVE`); `privacy/account-deletion.service.ts:292` (`restoreInTx` restaura `previousUserStatus`).
Problema: enquanto a exclusão está `pending` (72 h), a operação não consegue bloquear a conta. Se o titular desistir, a conta volta `active`, e nada lembra a operação de bloquear.
Cenário de ataque: um fraudador que percebe a investigação pede a exclusão. A operação tenta bloquear e recebe 409. Ele desiste dentro das 72 h e volta a operar, a menos que alguém lembre de bloquear depois. O impacto é limitado: durante o período a conta está `deleted`, sem sessão, e a loja fica encerrada. **Provado localmente** (bloqueio 409, desistência `active`).
Correção recomendada: aceitar o bloqueio de conta `deleted` com exclusão `pending`, gravando `previousUserStatus = 'blocked'` na exclusão pendente e o histórico em `user_status_history`. Assim, se o titular desistir, a conta volta bloqueada. Não é preciso mexer na exclusão.
Como verificar a correção: no E2E, bloquear com a exclusão pendente dá 200, e a desistência deixa a conta `blocked` com login 403. Sem bloqueio, a desistência continua `active`.
**Contorno até a correção:** `runbook-dsr.md` regra 4 (bloquear logo depois da desistência).

## Abertos (todos Baixa; nenhum bloqueia G4 ou G5)

| ID | Resumo | Dono | Prazo |
|---|---|---|---|
| SEC-186 | Bloqueio durante a exclusão pendente (acima) | backend-dev | Antes do piloto com lojistas reais (recomendado) |
| SEC-146 | Dados do cliente no WhatsApp do operador e do motoboy | PO, CEO (jurídico C4) | Na política, antes do G5 |
| SEC-149 | Teto da loja nova contornável com retiradas fabricadas | backend-dev, PO | Fase 2 / monitorar no piloto |
| SEC-150 | Limite do código de retirada falha aberto sem Redis | backend-dev | Antes de 2 réplicas |
| SEC-161 | Reaplicar exclusões depois de restaurar backup | backend-dev, tech-lead | Antes do 1º restore em produção |
| SEC-162 | Expurgo do token OAuth do lojista excluído | backend-dev | Antes do 1º lojista excluir a conta |
| SEC-163 (c/d) | Expurgo do DSR sem conta; teto do e-mail "recebemos" | backend-dev | Sem prazo (a/b vão no C5) |
| SEC-169 | Pino do endereço não conferido dentro do município | Fundador (DEC-067, aceito) | Aceito |
| SEC-174 | Revogação de socket com várias réplicas | backend-dev, tech-lead | Antes de 2 réplicas |

## Segredos, dependências e licenças

| Verificação | Resultado |
|---|---|
| Árvore no RC: arquivos `.env*`, `.pem`, `.p8`, `.p12`, `.key`, `.jks`, `google-services`, `credentials`, `secret` | Só `seller-credentials.ts` (código) e `gen-secrets.sh` (gerador). Os padrões de `docker-compose.yml`, `ci.yml` e `env.example` são `*_dev_only`/`*_ci_only`. O compose de produção exige cada segredo por variável (`:?`) |
| Histórico completo (`git log --all -p`, 513 commits): `APP_USR-<n>`, `TEST-<n>-`, chave privada PEM, `AKIA`, `AIza`, `ghp_`, `github_pat_`, `sk_live_`, `xox?-`, `SG.`, JWT | **0 ocorrências reais.** Só a citação em revisões e o valor fictício `APP_USR-123` de testes |
| Histórico: nomes de arquivo sensíveis | `apps/api/.tmp-dist-mem/**` (saída de build de `11081aa`, código compilado, sem configuração) e **`dump.rdb`** (Redis, 26 KB, entrou em `0d084ea` e saiu em `918cb01`). Conferi o `dump.rdb`: só chaves de limite e de código de **testes** (IPs `10.x` aleatórios, HMAC de e-mail, contadores). Nenhum e-mail em claro, token, senha nem segredo. É Info e entra na limpeza do DT-080 se o CEO reescrever o histórico. **Não precisa** rotacionar nada |
| `.git` com 207 MB e 12.638 objetos soltos | Tamanho e binários (DT-080). Sem impacto de segurança |
| `EXPO_PUBLIC_*` e `NEXT_PUBLIC_*` | Só URLs, modo, WhatsApp de suporte e a chave **pública** do MP. Nenhum segredo no bundle |
| `pnpm audit --prod` | **4 moderadas**, nenhuma Alta ou Crítica: `glob` (GHSA-3g3m-2fjr-6pw4) e `minimatch` (GHSA-g3hv-75wg-m249), ambas via `expo`/`jest`, ferramentas de build do app que não vão no bundle nem na API. Com dev: 5 moderadas (mais o `esbuild` de dev). Aceito |
| SBOM/licenças (`pnpm licenses list --prod`, 878 pacotes) | MIT 726, Apache-2.0 49, ISC 39, BSD-3 19, BSD-2 13, BlueOak 10. A atenção vai para `@img/sharp-libvips-*`, LGPL-3.0, só na API (servidor) e com ligação dinâmica, sem distribuição a terceiros, o que já está registrado em `THIRD_PARTY_NOTICES.md`. O `node-forge` tem licença dupla (BSD-3 ou GPL-2) e vale a BSD. Nenhuma GPL, AGPL ou SSPL obrigatória |

## OWASP API Security Top 10 (2023) sobre o RC

| Item | Estado | Evidência principal |
|---|---|---|
| API1 BOLA | OK | Dono conferido por `userId` em pedido, avaliação, troca, cupom e exportação. Os ataques desta revisão deram 404 (avaliação, troca, pedido de outro). Os E2E de RBAC e loja passam |
| API2 Autenticação | OK | Step-up e orçamentos de código separados (SEC-180 provado no BFF), refresh rotativo, MFA obrigatório no admin, convite com sessão restrita até o TOTP |
| API3 Propriedades | OK | `strictObject` nas entradas (campo extra dá 400). Saídas explícitas: comissão por permissão (SEC-184), mascaramento sem oráculo (SEC-181), dados do cliente só com o pedido ativo (DEC-072) |
| API4 Recursos | OK, com resíduo | Paginação limitada, limite por IP e por admin, `q` de 3 a 100 caracteres. Busca sem índice trigram aceita no piloto (DEC-076) |
| API5 Função | OK | `@AdminOnly(permissão)` e RBAC por tipo de alerta. O E2E `rbac` passa. A-04 fechado |
| API6 Fluxos sensíveis | OK, com resíduo | Cupom, OTP, exclusão e criação de pedido idempotentes e limitados. Resíduos: SEC-149 e envio de código por muitos IPs (DEC-068). WAF ou CAPTCHA na borda fica para a escala |
| API7 SSRF | OK | Nenhuma URL do usuário é buscada. CEP por regex estrita. O geocodificador vem da configuração e recusa http e Nominatim |
| API8 Configuração | OK (C7 no deploy) | O boot de produção recusa CORS `*`, `/docs`, http, localhost, `PAYMENT_PROVIDER=fake`, credencial `TEST-` e falta de segredo do BFF. Erros em problem+json sem stack. CSP com nonce, HSTS, `nosniff` e `DENY` conferidos no build de produção |
| API9 Inventário | OK | `pnpm generate:check` limpo (tech-lead). Rotas dev dão 404 em produção e staging (`production-boot` passa) |
| API10 APIs de terceiros | **Parcial** | Webhook com assinatura, reconsulta e idempotência nos E2E com o provedor falso. **Nunca contra o MP real (C3).** ViaCEP e geocodificador com timeout e recuo |

## OWASP MASVS (app) sobre o RC

| Grupo | Estado | Evidência |
|---|---|---|
| STORAGE | OK | Tokens no SecureStore, `allowBackup: false`, a sacola e o endereço não levam segredo |
| CRYPTO | OK | Nenhum segredo no bundle (`EXPO_PUBLIC_*` conferido) |
| AUTH | OK | O logout revoga no servidor. A sessão é relida a cada requisição (o bloqueio corta na hora). O step-up do arrependimento existe no app (M.2) |
| NETWORK | OK | O build de loja recusa http (SEC-172). Pinning não foi adotado, por decisão registrada (SEC-086, DEC-017) |
| PRIVACY | OK (C9) | Localização aproximada nas duas plataformas (SEC-179). Exclusão no app e na web |
| PLATFORM | OK | `open-link.ts` com lista fechada por tipo de link, permissões mínimas (precisa e segundo plano bloqueadas), câmera só na troca |
| CODE | OK | `pnpm audit` sem Alta ou Crítica no runtime. Sem Sentry no app (DT-039, declarado no inventário) |
| RESILIENCE | Não aplicável no MVP | Sem detecção de root, por decisão |

## Inventário e LGPD

- `inventario-lojas.md` foi reconferido contra o RC. O App Privacy passa a **Coarse Location**, o item 5 descreve o arredondamento e a linha do ViaCEP traz o estado real (o visitante ainda consulta direto). Nenhum dado novo no Data Safety.
- `runbook-dsr.md`, regra 4: entraram o caso da conta bloqueada com pedido em andamento (observação 3) e o contorno do SEC-186.

**Observações sem ID:**
1. "Pedir troca" e "Avaliar" agora aparecem no app. A avaliação falsa por autoconsumo (lojista comprando da própria loja) continua dependendo da moderação e do sinal do SEC-061. Vale monitorar no piloto a concentração de notas 5 em contas novas por loja.
2. SEC-185: o expurgo depois de 5 anos apaga também a linha que justifica um bloqueio **ainda vigente**. A prova continua no `audit_log`. Se o jurídico quiser a prova enquanto o bloqueio durar, basta excluir do expurgo a última linha de uma conta ainda `blocked`. Fica para o C4.
3. A conta bloqueada que tem pedido ou troca em andamento recebe 409 `DELETION_BLOCKED` e não consegue concluir sozinha, porque não entra no app. O runbook manda a operação concluir pelo admin dentro dos 15 dias.

## Limites desta revisão

- Tudo foi feito em ambiente **local**: provedor de pagamento **falso**, storage em memória, SMTP de captura, **sem nginx** em execução e **sem aparelho** físico. Não testei o Mercado Pago real (PIX, cartão, 3DS, estorno, split, OAuth). As condições C3, C7 e C9 cobrem isso.
- **Não houve pentest** nem teste de carga do Security (o QA tem os k6).
- A spec de ataque (`rc-attacks`, 9 cenários) e o script do D2 ficaram fora do repositório. O SEC-186 deve virar E2E junto com a correção.
- Bases legais, prazos e textos são recomendação técnica `[validar com o jurídico]` (C4).
