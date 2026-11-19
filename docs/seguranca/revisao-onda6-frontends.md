# Revisão de segurança e LGPD: frontends da Onda 6 (app e web) e reverificação do back-end de privacidade

- **Data:** 2026-11-19 | **Revisor:** security-engineer | **Base:** `claude/admiring-lamport-62tq1a` em `5ef97fe` (inclui `a7a4ce7` S6.1/S6.2, `f8fe505` web, `972ca19`/`a6eb5bb`/`5f2f1b8`/`ce0ca74` app). Sem mudança não commitada no momento da revisão.
- **Escopo:** `apps/mobile` (excluir conta, arrependimento, exportar, cartão por `WEB_PUBLIC_URL` + `POST /v1/card-intents`, push `opened`, relógio do servidor, socket único, armazenamento, deep links), `apps/web` (`/pagar/cartao`, `/lojista/desistir-da-exclusao`, conta do lojista com exportação e exclusão, BFF, ticket de tempo real), `apps/api` (`privacy/*`, `cart/purchase-history`, `realtime`, `orders/card-intent`, `addresses`, `logistics` ETA). Referências: `revisao-onda6.md`, DEC-050, 052, 054, 055, ADR-012, `pendencias-contrato-mobile.md` (9 a 23), `pendencias-contrato-web-lojista.md` (O6-5), `prd/lgpd.md`.
- **Método:** leitura do código; os E2E do repositório `s62-privacy-security`, `sec155-first-purchase`, `privacy-web-deletion` (15 testes, passam); um **spec de ataque fora do repositório** (scratchpad, 7 cenários B1 a B7, Postgres e Redis reais, `TEST_DB_NAME=webag_secfe_test`, `TEST_REDIS_DB=13`); o build de produção do `apps/web` servido localmente com `curl` contra cabeçalhos, hosts e CSRF do BFF; `pnpm audit --prod`; busca de segredos nos arquivos alterados. Nada versionado além deste documento e de `decisoes.md`.

## Parecer para o G5 (privacidade, exclusão e exportação): REPROVADO (Google Play) / COM RESSALVAS (App Store)

O back-end corrigiu bem o que bloqueava (SEC-152, 153, 154, 156, 157, 158, 159, 160) e o SEC-155 deixou de bloquear o G4. O app entrega exclusão, arrependimento e exportação dentro do app, como a Apple 5.1.1(v) pede. **O que ainda reprova o G5:**
1. **SEC-166 PARCIAL (Alta):** não existe a página **pública** de exclusão pela web (WB-214, `/excluir-conta`). O Google Play exige essa URL no Data Safety; a API das vias A e B está pronta, falta a tela. A página do lojista (`/lojista/conta`) exige login de lojista e não serve ao consumidor.
2. **Política de privacidade sem URL pública** (exigida pelas duas lojas; `checklist-publicacao-lojas.md` §5 já marca pendente; depende do domínio).
3. **SEC-168 (Média, mesmo fluxo de exclusão):** o arrependimento aceita força bruta distribuída da senha e reabre a conta sem o step-up. A correção é pequena e segue o mesmo padrão do SEC-153.

**Vira APROVADO COM RESSALVAS** quando: a página `/excluir-conta` existir no host público (vias A e B, revisão, confirmação; testada pelo QA); a política estiver numa URL pública; o SEC-168 estiver corrigido; o Data Safety e o App Privacy forem preenchidos pelo inventário da seção "Lojas" abaixo; e o jurídico validar os textos (prazos, IP truncado, J14). **Só para a App Store**, o estado atual já é COM RESSALVAS, condicionado à URL pública da política e ao SEC-168.

**G4 (fora da privacidade):** o SEC-155 (Alta) está corrigido; a proibição de criar cupom `firstPurchaseOnly` (DEC-050) pode cair, **com teto de orçamento por campanha** até o SEC-170 ser corrigido. SEC-169 e SEC-170 são Médias: não bloqueiam, mas corrigir antes de campanha de boas-vindas em escala e antes do piloto com entrega da Webag.

## Status dos achados da Onda 6 (SEC-152 a 167)

| ID | Sev. | Status | Evidência |
|---|---|---|---|
| SEC-152 | Média | **CORRIGIDO** | `web-deletion.service.ts:53-59`: limites antes do `find`. E2E A1. Ataque B1: conta confirmada, não confirmada, admin e inexistente dão a mesma sequência `200, 429, 429` e o mesmo corpo. Resíduo de tempo (~3 ms de mediana no 1º pedido) não é explorável com 5 pedidos por hora por e-mail: só observação |
| SEC-153 | Média | **CORRIGIDO** | `web-deletion.service.ts:85-97`: falha soma em `lfa:<id>`; step-up ativo devolve `LOGIN_CODE_REQUIRED` sem ticket. E2E A2 |
| SEC-154 | Média | **CORRIGIDO** (decisão do CEO, DEC-050a; fundador valida) | `parameters.definitions.ts:95`: padrão 72 h. E-mail ao pedir; login 403; arrependimento devolve conta e loja. Resíduo: SEC-168 |
| SEC-155 | **Alta** | **CORRIGIDO** (o G4 deixa de ser bloqueado) | `purchase-history.service.ts` e `cart.module.ts:15`. E2E A3 e multiconta. Resíduo multiconta: SEC-170 |
| SEC-156 | Média | **CORRIGIDO** | `platform/http/csv.ts`, usado por todos os 6 CSV (`reports`, `admin`, `finance`, `logistics`, `exchanges`). E2E A4 |
| SEC-157 | Média | **CORRIGIDO** (uma instância) | `realtime.gateway.ts:50-57`: assina `revoked$`; queda em até 2 s (E2E A5, exclusão e reset). Resíduo com várias instâncias: SEC-174 |
| SEC-158 | Média | **CORRIGIDO** | `account-deletion.service.ts:366-376`. E2E A6. Ataque B3 pelo caminho de 72 h (`processDue`), com nome, e-mail, telefone, IP completo, user agent, id do aparelho, endereço, busca, motivo, avaliação, resposta da loja, DSR público e exportação: só sobram `access_log` (Marco Civil, aceito) e o user agent em `terms_acceptances` (SEC-173) |
| SEC-159 | Baixa | **CORRIGIDO** conforme DEC-050(b) (jurídico valida) | `drizzle/0039_s62_ip_truncation.sql`: trigger só admite o truncamento /24 e /48; `audit.service.ts:59-72` sem IP nem aparelho em ação do próprio cliente. E2E A6 tenta outro IP, outra coluna e DELETE: negados |
| SEC-160 | Média | **CORRIGIDO** | `account-deletion.service.ts:255-287`: alerta na 3ª falha e a 2 dias do teto, uma vez por exclusão. E2E |
| SEC-161 | Baixa | ABERTO | Sem mudança (restauração de backup) |
| SEC-162 | Baixa | ABERTO | Sem mudança (tokens MP do dono excluído) |
| SEC-163 | Baixa | ABERTO | Sem mudança (DSR: identidade, retenção, refletor). O DSR ligado à conta é anonimizado (B3: 0 restantes) |
| SEC-164 | Baixa | ABERTO | Sem mudança (arquivo órfão; denúncias e campanhas fora do JSON) |
| SEC-165 | Baixa | ABERTO | Sem mudança (reenvio de push) |
| SEC-166 | **Alta** | **PARCIAL** | App: Conta > Privacidade > Excluir/Exportar, arrependimento na tela de entrada (`app/(auth)/login.tsx:232`). Web lojista: `/lojista/conta` e `/lojista/desistir-da-exclusao`. **Falta:** `/excluir-conta` pública (WB-214) para o Google Play |
| SEC-167 | Baixa | ABERTO | Sem teste de classificação `PRIVACY_MAP`. A varredura de A6/B3 cobre o caso de hoje, não o de amanhã |

## Achados novos

| ID | Sev. | Tema | Dono | Bloqueia | Status |
|---|---|---|---|---|---|
| SEC-168 | Média | Arrependimento: força bruta distribuída da senha e reabertura sem step-up | backend-dev | G5 | Aberto |
| SEC-169 | Média | Endereço: coordenada do cliente aceita sem conferir com o CEP (passa do raio e do teto de 120 min) | backend-dev, mobile-dev | — (antes do piloto com entrega) | Aberto |
| SEC-170 | Média | Cupom de primeira compra: multiconta contornada pelo complemento e por pedidos simultâneos não pagos | backend-dev | — (antes de campanha em escala) | Aberto |
| SEC-171 | Baixa | Tokens de uso único na URL vão ao log de acesso; CPF da intenção em claro no Redis | backend-dev | — | Aberto |
| SEC-172 | Baixa | URLs públicas sem HTTPS obrigatório em produção (API, app e web); link de exportação aberto sem conferir a origem no app | backend-dev, mobile-dev | — | Aberto |
| SEC-173 | Baixa | `terms_acceptances.platform` guarda o user agent inteiro depois da anonimização | backend-dev, jurídico | — | Aberto |
| SEC-174 | Baixa | Queda do socket na revogação só funciona com uma instância da API | backend-dev, tech-lead | — (antes de escalar horizontalmente) | Aberto |

---

### SEC-168 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/privacy/account-deletion.service.ts:202-215` (`cancel`), `privacy.controller.ts:91-97`; e-mail `platform/mail/templates.ts:196-205`
Problema: a falha de senha no arrependimento só conta em `deletion-cancel:<email>:<ip>` (5 por hora por IP). Não soma no contador por conta (`lfa:<id>`), não há limite por e-mail sem o IP e a senha certa reabre a conta sem olhar o step-up. Depois disso, o login entra sem código, porque o `lfa` continua zerado.
Cenário de ataque: provado pelo ataque B2. A conta estava pendente (72 h). 25 senhas erradas vindas de 25 IPs deram `401` em todas, nenhum `429`, e `lfa` ficou em 0. A senha certa deu `204` (conta reaberta) e o login, `200`, sem `LOGIN_CODE_REQUIRED`. Quem tem uma lista vazada, ou um botnet, tem 72 h de tentativas sem o freio do login. Se acertar, toma a conta e, no caso do lojista, reabre a loja e acessa o financeiro. É justamente a janela que o SEC-154 abriu. Com isso, o step-up do login (SEC-004) é contornado.
Correção recomendada:
1. Na falha, quando a conta existe, `limiter.hit('lfa:<id>', 3600)`, igual ao `web-deletion.service.ts:88`.
2. Somar um limite por e-mail sem o IP: `deletion-cancel:email:<sha>`, 10 por hora.
3. Com a senha certa e `peek(lfa) >= login_stepup_falhas_h`: e-mail confirmado → 403 `LOGIN_CODE_REQUIRED`, com código `delete_web` enviado ao e-mail e campo `code` opcional no corpo; e-mail não confirmado → 401 genérico. O app (`CancelDeletionForm`) e a página web ganham o campo de código quando receberem esse erro.
4. E-mail de aviso: acrescentar "Não foi você? Abra o app ou `<host>/lojista/desistir-da-exclusao`, cancele e troque a senha", em texto, sem link clicável (SEC-163 d).
Como verificar a correção: o B2 vira E2E. 25 falhas de IPs diferentes → `lfa >= 20`; a senha certa → 403 `LOGIN_CODE_REQUIRED`; com o código → 204.

### SEC-169 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/addresses/addresses.service.ts:52-57` (`point`: usa `lat/lng` do cliente se vierem), `addresses.schemas.ts:7-8`; consumido por `logistics/delivery-fees.service.ts:123-131` (raio, teto de 120 min e faixa de frete)
Problema: a posição do endereço é a que o app manda, sem conferência com o CEP, a cidade ou o bairro informados. O raio (`raio_max_km`), o teto do ETA (DEC-053) e a faixa de frete por distância são todos calculados sobre esse ponto. Já o motoboy vai ao endereço escrito.
Cenário de ataque: provado pelo ataque B6. Com o mesmo CEP, rua e número, o ponto verdadeiro a 25 km deu `OUT_OF_RANGE`. O ponto falso em cima da loja deu `available`, `distanceM 0`, faixa de 20 a 50 min e a menor faixa de frete. Assim, o cliente compra de loja fora da área pagando o frete mínimo, a Webag paga a corrida longa (custo esperado da faixa errada), a promessa "até 2 h" não se cumpre (CDC, J14) e o alerta de atraso dispara contra a loja. Também acontece por erro honesto: um pino arrastado errado.
Correção recomendada (proporcional ao MVP): no `create/update`, geocodificar o CEP (o provedor já existe) e, se o ponto do cliente estiver a mais de `endereco_pino_max_m` do centro do CEP (parâmetro, padrão 2.000 m [HIPÓTESE, CEP urbano]), recusar com 422 `ADDRESS_PIN_FAR_FROM_CEP` e pedir confirmação no mapa; ou aceitar, mas marcar `pinMismatch`, usar o **maior** dos dois no raio, no teto e na faixa, e mostrar o alerta à Logística. Sem geocodificação do CEP (falha do provedor), aceitar e marcar. O app mostra a mensagem e reabre o mapa.
Como verificar a correção: o B6 vira E2E: ponto a 25 km do CEP → 422 (ou `OUT_OF_RANGE` pelo maior valor); ponto a 300 m do centro do CEP → aceito.

### SEC-170 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/cart/purchase-history.service.ts:27-29` (só pedido com `paid_at`), `:47-50` (endereço exige o mesmo **complemento**); `identity/auth.schemas.ts:13-17` (telefone sem verificação)
Problema: os controles do SEC-060 olham só pedidos **já pagos** de outras contas e casam o endereço por CEP, número e complemento. O telefone não é verificado, então qualquer celular válido passa. O `deviceId` vem do cliente.
Cenário de ataque: provado pelo ataque B7. (a) A conta A comprou e pagou no CEP X, nº 321. A conta B, no mesmo CEP e número com complemento "casa 2", aplicou o cupom e o pedido nasceu com `discount 1000`. (b) As contas C e D, no mesmo endereço, criaram os dois pedidos com o cupom **antes** de pagar qualquer um: os dois saíram com desconto de R$ 10. Numa campanha de boas-vindas, uma pessoa com N e-mails confirmados ganha N vezes. O limite é a taxa Webag de cada pedido (DEC-016).
Correção recomendada:
1. Nas outras contas, contar também pedidos `awaiting_payment` não expirados e resgates do mesmo cupom não liberados (`coupon_redemptions.released_at is null`).
2. Endereço: comparar por CEP + número (sem o complemento) **para o cupom de primeira compra**. Em prédio, o falso positivo é aceitável: a pessoa recebe "cupom já usado neste endereço" e o suporte libera.
3. Teto de orçamento por campanha (`maxUses` total obrigatório para `firstPurchaseOnly` no `PlatformCouponsService`).
4. Quando o MP devolver o documento do pagador (PIX e cartão), somar esse documento como chave (já previsto).
Como verificar a correção: o B7 vira E2E. Complemento diferente → 422 `COUPON_FIRST_PURCHASE_ONLY`; dois pedidos não pagos no mesmo endereço → o 2º é recusado; cupom `firstPurchaseOnly` sem `maxUses` → 422.

### SEC-171 | Severidade: Baixa | Status: Aberto
Onde: `apps/api/src/app.module.ts:65-69` (o serializer do pino só mascara `lat/lng`), rotas `GET /v1/data-exports/download/:token` (`privacy.controller.ts:141-147`), `GET|POST /v1/card-intents/:token[/pay]` (`orders.controller.ts:116-131`), página `/pagar/cartao?i=` (log do nginx); `orders/card-intent.service.ts:45-46` (a `input` guardada no Redis inclui `payerDocument`)
Problema: o token é a credencial e fica no log de acesso da API e do proxy. O da intenção de cartão continua válido por até 15 min, porque a leitura não o consome. O CPF do pagador, quando exigido, fica em claro no Redis pelos mesmos 15 min.
Cenário de ataque: quem lê os logs (insider, provedor de log) vê o valor do pedido e consegue "queimar" a intenção, pagando com outro cartão ou só consumindo o link. Não há ganho financeiro, porque o pedido é do dono. O link de exportação já está usado quando alguém o lê no log. O risco é baixo, mas é dado de autenticação em log (SEC-072).
Correção recomendada: no serializer, trocar o segmento do token por `[token]` nos 3 caminhos (`/download/[^/]+`, `/card-intents/[^/?]+`); no nginx, `log_format` sem a query de `/pagar/`. Na intenção, guardar `payerDocument` cifrado com a chave de tokens de pagamento ou pedi-lo na página segura, e não no app.
Como verificar a correção: teste unitário do serializer; `redis-cli GET card-intent:*` não mostra CPF.

### SEC-172 | Severidade: Baixa | Status: Aberto
Onde: API `platform/config/env.ts:92,96` (`API_PUBLIC_URL` e `WEB_PUBLIC_URL` com padrão `http://localhost`, sem checagem em produção no `superRefine`); app `src/features/checkout/config.ts:39` e `src/api/config.ts:5` (padrão `http://localhost`); app `app/privacy/export.tsx:104` (`Linking.openURL(link.url)` sem conferir a origem); web `src/features/account/account-page.tsx:49-56` (`safeDownloadUrl` aceita `http:`)
Problema: em produção, uma variável esquecida não derruba o boot nem o build. O ataque B5 mostra a URL do cartão saindo `http://localhost:3001` com a configuração padrão. No app, isso falha fechado (o `isSecureCardUrl` recusa a origem diferente), mas o cliente fica sem cartão (DEC-055 já alertou). Já o link de exportação é aberto como vier.
Cenário de ataque: configuração errada, não invasão. Com `API_PUBLIC_URL=http://...`, o token de download trafega sem TLS.
Correção recomendada: no `superRefine` de produção, exigir `https:` e host diferente de `localhost` em `API_PUBLIC_URL`, `WEB_PUBLIC_URL` e `ADMIN_WEB_URL`. No `app.config.ts`, com `EXPO_PUBLIC_APP_ENV=production`, lançar erro se `EXPO_PUBLIC_API_URL` ou `EXPO_PUBLIC_WEB_URL` faltarem ou não forem `https:` (falha o `eas build`). No app, abrir o link de exportação só se `new URL(url).origin === new URL(API_URL).origin`. Na web, `safeDownloadUrl` aceita só `https:` em produção.
Como verificar a correção: boot com `NODE_ENV=production` e `WEB_PUBLIC_URL=http://localhost:3001` falha; `eas build --profile production` sem a variável falha; teste unitário do app com URL de outra origem → não abre.

### SEC-173 | Severidade: Baixa | Status: Aberto (jurídico)
Onde: `apps/api/src/modules/users/users.service.ts:65` (`platform: ctx.userAgent?.slice(0, 120)`), `drizzle/0039_s62_ip_truncation.sql` (o trigger só admite mudar `ip`)
Problema: a coluna `platform` do aceite guarda o user agent inteiro (modelo do aparelho, versão do sistema e do app). Depois da anonimização, ataque B3, ele continua ligado à casca junto com o IP /24 e a data e hora, o que facilita a reidentificação que a DEC-050(b) quis evitar.
Correção recomendada: gravar só a família (`ios`, `android` ou `web`) mais a versão do app, a partir de agora; para as linhas existentes, estender a exceção do trigger para `platform -> webag_platform_family(platform)` na anonimização. Levar ao jurídico junto com o item do IP (DT-063).
Como verificar a correção: a varredura do B3 sem `terms_acceptances:ua`.

### SEC-174 | Severidade: Baixa | Status: Aberto (DT-054)
Onde: `apps/api/src/modules/realtime/realtime.gateway.ts:50-57` (`revoked$` é um `Subject` do processo), `:169-172` (`fetchSockets()` sem adapter Redis)
Problema: a revogação emitida numa instância (ou no worker) não derruba o socket aberto em outra. Hoje a API roda em uma instância só e o E2E A5 passa.
Correção recomendada: antes de rodar 2 ou mais réplicas, usar `@socket.io/redis-adapter` e publicar a revogação no Redis (ou `server.in(userRoom).disconnectSockets()`, que atravessa o adapter). Registrar no ADR-004 como pré-requisito de escala.
Como verificar a correção: E2E com duas instâncias e o adapter: a exclusão numa instância derruba o socket da outra em até 2 s.

---

## Frontends: o que foi testado e resistiu

| Área | Verificação | Resultado |
|---|---|---|
| App, exclusão | Senha só em memória, sem `retry` (`privacy-api.ts:25`); diálogo com "Cancelar" primeiro; sessão, sacola, endereços, buscas e favoritos limpos ao concluir (`onSessionCleared`); rota fora de `(customer)`; números vindos do servidor | Ok. Conta sem senha (login social, hoje desligado) cai em "defina uma senha": aceitável para a Apple enquanto o login social estiver desligado (DT-064) |
| App, arrependimento | Rota pública `cancel-deletion` e link na tela de entrada; mensagem única para qualquer falha | Ok no app; a força bruta é do servidor (SEC-168) |
| App, exportação | Link pedido na hora, aberto no navegador do sistema, arquivo nunca guardado no app | Ok; falta conferir a origem (SEC-172) |
| App, cartão | `isSecureCardUrl` exige mesma origem de `WEB_PUBLIC_URL`, caminho `/pagar/cartao`, `i` com 16 ou mais caracteres e sem credenciais na URL; abre no navegador do sistema (sem WebView); o 3DS antigo usa WebView só `https://` | Ok. API: intenção ligada à sessão, `GETDEL`, corrida 200/410, sessão encerrada 410, **conta excluída 410 sem pedido** (B5) |
| App, push `opened` e deep links | Só `orderId`/`exchangeId`/`campaignId` UUID viram rota interna; URL em `data` nunca abre; `returnTo` passa por `safeReturnTo`; telas abertas por deep link leem o REST com a sessão (BOLA no servidor) | Ok. Esquema `webag://` não verificado (sem App Links/Universal Links): o retorno da página de cartão leva só o `orderId`, risco aceito no MVP |
| App, armazenamento | Tokens e id do aparelho só no SecureStore; AsyncStorage só com modo, sacola, buscas e endereços com dono (SEC-122); `allowBackup: false`; sem `console.*`, sem Sentry; cache do TanStack não persistido | Ok |
| App, relógio do servidor e socket | Diferença do cabeçalho `Date` só para exibir prazos (o servidor decide); um socket por aparelho, token no `auth` do handshake, desligado ao limpar a sessão | Ok |
| Web, `/pagar/cartao` (build de produção, `curl`) | Host do painel → 404; CSP própria com nonce, `strict-dynamic`, `frame-src` só Mercado Pago, `frame-ancestors 'none'` + `X-Frame-Options: DENY`; `no-store`; `Referrer-Policy: no-referrer` no cabeçalho e no meta; nenhum `<script>` sem nonce; token fora do formato → tela de erro sem chamar a API | Ok. Observação funcional: `isChallengeUrl` aceita `*.mercadolivre.com.br`, que não está no `frame-src` (o iframe do 3DS seria bloqueado nesse domínio) |
| Web, `/api/pay/card` | Host do painel → 404; sem `X-Webag-Client`, `Origin` de outro site ou `Sec-Fetch-Site: cross-site` → 403; corpo `strictObject` só com o token do MP | Ok |
| Web, `/lojista/desistir-da-exclusao` e BFF | CSP do painel; host público → 404; POST sem cabeçalho, com `text/plain`, de outra origem ou `cross-site` → 403 (CSRF); `account-deletion/start` e `finish` fora da allowlist do BFF → 404 | Ok. CSRF aqui também exige a senha, o que reduz o valor do ataque |
| Web, exportação e exclusão do lojista | Link aberto em nova aba com `noopener noreferrer`; `me/deletion` só com senha; admin recusado pela API | Ok; `http:` aceito (SEC-172) |
| API, link de exportação | 3 resgates simultâneos → `[200, 410, 410]`; vencido → 410; conta excluída antes do clique → 410; `no-store`, `attachment`, `nosniff` | Ok (B4) |
| API, varredura de PII depois de 72 h | Ver SEC-158 acima; DSR público ligado ao e-mail também anonimizado; Redis sem e-mail em claro (só chaves de limite com IP, TTL de até 1 h) | Ok |
| Dependências e segredos | `pnpm audit --prod`: 4 moderadas (`glob`, `minimatch`, ferramentas do Expo), nenhuma Alta; nenhum padrão de segredo nos arquivos alterados; nenhum `.env` versionado | Ok |

**ETA e teto de 120 min (DEC-053/054):** além do SEC-169, o ataque B6 mostra a loja **disponível** a 10,5 km, com faixa de 102 a 132 min. O teto ainda vale para a estimativa, e não para o fim da faixa como manda a DEC-054 Q1 (`logistics/domain/eta.ts:49`). Isso já está na fila como **E.3** (backend-dev). Não abri SEC por ser regra de negócio e CDC, mas **"até 2 h" não pode ir para a copy enquanto o E.3 não fechar** (J14).

## Lojas: checklist de privacidade

| Exigência | Estado | Pendência |
|---|---|---|
| Apple 5.1.1(v): iniciar a exclusão dentro do app | **Atende** (Conta > Privacidade e dados > Excluir minha conta; senha, confirmação e 72 h com arrependimento; conta inacessível na hora) | Mostrar o caminho nas notas ao revisor |
| Google Play: link web de exclusão | **Não atende**: falta `/excluir-conta` (WB-214) | SEC-166. Página no `PUBLIC_HOST`, vias A e B pela API pronta, `Referrer-Policy: no-referrer`, ticket só no corpo, CSRF como no `/api/pay/card` |
| Política de privacidade em URL pública | **Não atende** | Domínio (fundador) + página `/privacidade` no host público + revisão jurídica |
| Exclusão de dados sem excluir a conta (Google, opcional) | Parcial: DSR por e-mail | Opcional |
| Data Safety e App Privacy | A tabela de `checklist-publicacao-lojas.md` §5 está **incompleta** | Acrescentar as linhas abaixo (dono: PO/CEO edita o checklist) |

Inventário para os formulários (de acordo com o código em `5ef97fe`):

| Dado | Google (categoria) | Apple (tipo) | Obrigatório? | Vinculado | Compartilhado com terceiros | Finalidade |
|---|---|---|---|---|---|---|
| Nome, e-mail, celular | Informações pessoais | Contact Info | Sim | Sim | Lojista do pedido | Conta, pedido, suporte |
| Endereço e ponto no mapa | Informações pessoais: endereço | Contact Info: Physical Address | Para entrega | Sim | Lojista e Logística do pedido; **ViaCEP recebe o CEP e o IP direto do app** (pendência 1) | Entrega |
| Localização aproximada (só em uso) | Local aproximado | Coarse Location | Não | Não precisa | Não | Lojas perto |
| CPF (só se o MP exigir) | Informações pessoais: outras | Other Data / Sensitive | Condicional | Sim | Mercado Pago | Pagamento |
| Histórico de compras | Informações financeiras: histórico de compras | Purchases | Sim | Sim | Lojista (o próprio pedido) | Funcionamento, trocas, fiscal |
| Fotos (defeito na troca) | Fotos e vídeos | Photos or Videos | Não | Sim | Lojista da troca | Troca |
| Avaliações, "como vestiu", denúncias | Atividade no app: outro conteúdo gerado pelo usuário | User Content: Other | Não | Sim | Público (avaliação, sem o nome completo) | Reputação e moderação |
| Busca no app | Atividade no app: histórico de pesquisa | Search History | Não | Sim | Não | Últimas buscas |
| Abertura de push de campanha | Atividade no app: interações | Product Interaction | Não | Sim | Não | Medir campanha (com consentimento) |
| Token de push e id aleatório do aparelho | IDs do dispositivo ou outros | Device ID | Sim | Sim | Expo/FCM/APNs (operadores, não "compartilhamento") | Notificação e segurança da sessão |
| Dados do cartão | **Não coletados pelo app** (página segura do MP no navegador) | Não | — | — | Mercado Pago direto | — |
| Diagnóstico/crash | Não (Sentry desligado) | Não | — | — | — | Revisar quando o DT-039 ligar o Sentry |
| Rastreamento entre apps / publicidade | Não | Não (sem ATT) | — | — | — | — |

Marcar também: dados criptografados em trânsito (sim, quando o SEC-172 garantir HTTPS); o usuário pode pedir exclusão (sim, no app e na URL de WB-214).

## Limites desta revisão

- Análise estática e ataques contra a API local, com Postgres e Redis reais, storage em memória e provedor de pagamento falso. Também o build do `apps/web` com a API desligada, para cabeçalhos e CSRF. **Sem** pentest de rede, **sem** aparelho físico (o armazenamento do app foi verificado pelo código, não com root ou jailbreak), **sem** o Mercado Pago real (Brick, 3DS e iframes de bancos) e sem várias instâncias.
- O spec de ataque (B1 a B7) ficou no scratchpad e **não foi versionado**. B2, B6 e B7 devem virar E2E do backend-dev junto com SEC-168, 169 e 170.
- Textos de prazo, IP truncado, user agent e a promessa de 2 h: recomendação técnica, **validar com o advogado do fundador** antes do G5.
