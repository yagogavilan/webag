# Reverificação de segurança e LGPD: Ondas 6/7 (G4 e G5)

- **Data:** 2026-11-19 | **Revisor:** security-engineer | **Base:** `claude/admiring-lamport-62tq1a` em `98764b2` (back-end até `d7364f1`). Havia mudanças não commitadas do mobile-dev (react-native-web, `secure-store.web.ts`): **fora do escopo**, só observadas.
- **Escopo:** SEC-155, 164 a 173 (correções entregues); cancelamento por atraso (`/v1/orders/{id}/cancel-late`, `/v1/admin/orders/{id}/late-cancel/respond`, aceite automático) e cupom de compensação (migração 0042); trigger append-only (0047); SEC-129 e DT-021; página pública `/excluir-conta` e `public-deletion.ts`; SEC-141 a 151 (achados da logística, nunca reverificados); pendências minhas (SEC-161, 162, 163, 167, 174); inventário das lojas; segredos e dependências.
- **Método:** leitura do código; E2E do repositório contra Postgres 16 e Redis reais (`TEST_DB_NAME=webag_sec7_test`): `late-delivery`, `sec168-170-hardening`, `privacy-*`, `s62-privacy-security`, `sec155-first-purchase`, `marketing-push`, `production-boot`, `sec141-142-refund`, `fix-q1-admin-cancel`, `fix-r1-r2-idempotency`, `order-logistics`, `logistics`, `orders`, `qa-onda3-5-*`, `b1-b2-contract` (**168 testes, todos passam**) e os unitários `env.spec`/`mask.spec` (41). Um **spec de ataque fora do repositório** (8 cenários, L1 a L5, D1, A1, T1; não versionado) e SQL direto no banco de teste, dentro de transações desfeitas. `git grep` e `git log -p --all` de padrões de segredo; `pnpm audit`.

## Pareceres

| Gate | Parecer | Condição |
|---|---|---|
| **G4** (release candidate, segurança) | **APROVADO COM RESSALVAS** | Nenhuma Crítica ou Alta aberta que afete o G4. SEC-129, DT-021, SEC-155 e os achados de dinheiro da logística (SEC-141 a 145, 147, 148, 151) conferidos. Ressalvas (Médias, corrigir antes do piloto com entrega): SEC-175, SEC-169 (parcial), SEC-176. Sem Mercado Pago real e sem pentest (ver Limites) |
| **G5 Google Play** | **REPROVADO** | SEC-166 (Alta) continua **parcial**: a página `/excluir-conta` existe, mas só abre um pedido ao encarregado, e **nada no sistema consegue executar** a exclusão de quem não tem mais o app (ver SEC-166). Vira COM RESSALVAS quando: (1) a página ganhar a via A/B (a API está pronta e testada) **ou** existir a execução pelo super admin; (2) as URLs públicas estiverem no ar (domínio); (3) o Data Safety for preenchido por `docs/seguranca/inventario-lojas.md` |
| **G5 App Store** | **COM RESSALVAS** | A exclusão dentro do app atende a 5.1.1(v). Condições: política em URL pública (domínio, fundador); texto jurídico revisado; App Privacy pelo inventário, declarando a **localização precisa** enquanto o SEC-179 não for corrigido; SEC-176 corrigido (recomendado: desfaz parte do controle do SEC-154) |

Mudança em relação ao DEC-056: o SEC-168 (que reprovava o G5) está corrigido; o SEC-166 trocou de motivo (a página existe, a execução não).

## Status dos achados anteriores

| ID | Sev. | Status | Evidência |
|---|---|---|---|
| SEC-129 | Média | **CORRIGIDO** | `env.ts:174-178`: produção recusa o boot sem `TRUST_PROXY` e sem `BFF_SHARED_SECRET` (>= 32, diferente das outras chaves); `env.spec.ts:97-99,141-144` passa. `docker-compose.prod.yml:148,235-236` fixa `WEB_CLIENT_IP_HEADER=x-real-ip`; `proxy-common.conf` sobrescreve `X-Real-IP`/`X-Forwarded-For` com `$remote_addr` e apaga `X-Webag-Bff-Secret` vindo de fora. Resíduo: o web só **avisa** (não falha) sem cabeçalho de IP em produção (`upstream.ts:20-23`); o compose cobre. O teste de lockout do `guia-deploy.md:205` precisa ser feito no servidor real |
| DT-021 | — | **CORRIGIDO** | `retention.service.ts:80-90` (acesso 6 meses, sessões, códigos, tickets, OAuth, convites, webhooks, links, fotos de troca, documentos reprovados, uploads órfãos); E2E `privacy-dsr-retention` passa. Falta só o DSR sem conta (SEC-163 c) |
| SEC-141, 142 | Média | **CORRIGIDO** | `sec141-142-refund.e2e-spec.ts` e `fix-q1-admin-cancel:100` passam (cobertura bloqueada com estorno em voo; teto do financeiro não contornado). Sem ataque próprio nesta rodada |
| SEC-143, 145, 147, 148, 151 | Média/Baixa | **CORRIGIDO** | Devolução só com a loja confirmando (`order-logistics:123`, `late-delivery:150`); segregação do custo (`qa-onda3-5-jornada:137`); total esperado obrigatório (`orders:88`); 1 pedido por revisão (`fix-r1-r2-idempotency:19`); estorno total cancela o pedido (`qa-onda3-5-lacunas:42`). Por E2E do repositório |
| SEC-144 | Média | **CORRIGIDO** | Telefone mascarado na lista, "Revelar" com motivo e auditoria, apagamento em `pii_corrida_retencao_dias` (7) (`deliveries.service.ts:550-566`, `logistics.controllers.ts:185-225`); `logistics:171` passa |
| SEC-146, 149, 150 | Baixa | ABERTO | Sem mudança (WhatsApp no aparelho do operador; teto da loja nova; limite do código de retirada sem Redis). Não bloqueiam |
| SEC-155 | Alta | **CORRIGIDO** (já em DEC-056) | `sec155-first-purchase` passa |
| SEC-161 | Baixa | ABERTO | Sem mudança. Definição de pronto abaixo |
| SEC-162 | Baixa | ABERTO | Sem mudança |
| SEC-163 | Baixa | ABERTO, **sobe de prioridade** | A página `/excluir-conta` passou a mandar o titular ao formulário do DSR. (a)/(b): roteiro do encarregado criado em `docs/seguranca/runbook-dsr.md` (fecha a parte de processo quando o fundador adotar); (c) retenção do DSR sem conta e (d) teto global do "recebemos": backend-dev |
| SEC-164 | Baixa | **CORRIGIDO** | `data-export.service.ts`: apaga a chave determinística no `catch` e na anonimização; JSON com `contentReports` e `pushCampaignsReceived`. `privacy-export` passa |
| SEC-165 | Baixa | **CORRIGIDO** | Destinatários gravados logo após o envio (fora da transação final), teto de 3 tentativas, `failStuck` em 30 min com alerta `push_campaign_failed`. `marketing-push` passa. Resíduo aceito: se a própria gravação dos destinatários falhar, reenvia no máximo 2 vezes |
| SEC-166 | **Alta** | **PARCIAL** (bloqueia G5 Google Play) | Ver achado abaixo |
| SEC-167 | Baixa | ABERTO | Sem teste de classificação `PRIVACY_MAP`. Definição de pronto abaixo |
| SEC-168 | Média | **CORRIGIDO na API** | `account-deletion.service.ts:203-235`: falha soma em `lfa:<id>`; limite por e-mail sem IP; com step-up ativo, a senha certa exige o código `delete_web` (e-mail confirmado) ou recebe 401 genérico. E2E passa. **Os frontends não tratam o 403 `LOGIN_CODE_REQUIRED`** (item 3 da correção): ver **SEC-176** |
| SEC-169 | Média | **PARCIAL** (reaberto) | Ponto longe do CEP real → 422 (E2E e A1-controle). **Contorno provado (A1):** CEP **inexistente** + cidade atendida + pino em qualquer lugar → **201** com o pino aceito. Ver achado abaixo |
| SEC-170 | Média | **CORRIGIDO** com resíduo aceito | Complemento ignorado; pedido não pago com cupom reservado conta; documento do pagador (HMAC) como chave; `maxUses` obrigatório (`platform-coupons.service.ts`). E2E (a) a (d) passam. Resíduo, coberto pelo teto da campanha (DEC-056): pedido de **retirada** não tem endereço; telefone não é verificado; `deviceId` vem do cliente; o CPF é o informado no app (PIX pode ser pago de outra conta) |
| SEC-171 | Baixa | **CORRIGIDO** (API) / **não testado** (nginx) | `mask.ts:maskTokenPaths` no serializer (`mask.spec` passa). nginx: `00-global.conf.template:28-38` mascara os caminhos e o `log_format` usa `$uri` (sem query: o `?i=` de `/pagar/cartao` não vai ao log). As variáveis `${pre}`/`${post}` dependem de o `envsubst` da imagem só trocar variáveis definidas (comportamento padrão da imagem oficial): **conferir com `nginx -T` e `curl` no primeiro deploy**. CPF da intenção cifrado (AES-GCM, ligado ao usuário) |
| SEC-172 | Baixa | **PARCIAL** | API: produção exige `https` e não-localhost em `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `ADMIN_WEB_URL` (`env.ts`, testes passam). **Falta (mobile-dev):** `app.config.ts` não falha o `eas build` de produção sem `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_WEB_URL` https; `app/privacy/export.tsx:104` abre o link sem conferir a origem; `account-page.tsx:52` aceita `http:`. Risco hoje baixo: a URL vem da API, que já exige https |
| SEC-173 | Baixa | **CORRIGIDO** (jurídico valida) | Grava só a família e a versão; 0047 reduz o legado; E2E passa |
| SEC-174 | Baixa | ABERTO, sem gatilho | `docker-compose.prod.yml` tem um único serviço `api`, sem réplicas. Vira obrigatório antes de escalar |

**Trigger append-only (0047): continua íntegro.** A 0047 só substitui `webag_allow_ip_truncation()`, usada por `terms_acceptances` e `consents`. O ledger usa outra função (`ledger_block_mutation`, 0015), intocada. Ataque T1 (SQL direto): UPDATE e DELETE em `ledger_entries`/`ledger_transactions`, DELETE em `terms_acceptances`, UPDATE de `platform` para outro valor, UPDATE da família junto com outra coluna, troca de IP, UPDATE de outra coluna em `consents` e UPDATE em `audit_log`: **todos negados**. Só passam a redução à família do próprio valor e o truncamento /24. `webag_platform_family` é idempotente (`ios;1.0.0` fica; `ios;1.0.0 extra` vira `ios`).

## Cancelamento por atraso e cupom de compensação (WB-253 a 255)

| Abuso testado | Resultado |
|---|---|
| Cliente cancela pedido **já entregue** | 409 `ORDER_ALREADY_DELIVERED` (E2E). Pedido de outro cliente: 404 (BOLA ok) |
| Estorno em dobro: 6 toques simultâneos antes da saída (L2) | 6 × 200, **1** estorno de R$ 85,00 = valor pago. `FOR UPDATE` no pedido + `refundedOrPendingCents` |
| Corrida de estado: "cancelar sem custo" × operação marcando "coletado" (L3, 6 rodadas) | Sempre consistente (pedido e corrida cancelados, estorno integral; o "coletado" leva 409) |
| Pedido de retirada, aguardando pagamento ou sem faixa | `lateStateOf` devolve "sem atraso" → 409 |
| Cupom: geração | Só na transação da entrega concluída; índice único por `source_order_id` + `onConflictDoNothing`; código `ATRASO` + 8 de 32 símbolos sem viés (`randomBytes`, 256 é múltiplo de 32) |
| Cupom: reuso e transferência | `maxUses 1`, `perCustomerLimit 1`, dono conferido em `coupon.ts:53` (outro cliente recebe `COUPON_NOT_FOUND`, sem revelar que existe); fora da lista do admin |
| **Pedido pendente + entrega concluída + aceite automático (L1)** | **Falha: SEC-175** |
| **Cliente ausente → reentrega → entregue tarde (L4)** | **Ganha a compensação: SEC-177** |

## Achados novos

| ID | Sev. | Tema | Dono | Bloqueia | Status |
|---|---|---|---|---|---|
| SEC-175 | Média | Cancelamento por atraso: aceite (automático ou do admin) sem conferir o estado; pedido entregue recebe "Cancelamento por atraso aceito" | backend-dev | — (antes do piloto com entrega) | Aberto |
| SEC-176 | Média | Arrependimento da exclusão: quem só sabe o e-mail impede o dono de desistir (11 tentativas por hora); app e web não pedem o código do step-up | backend-dev, mobile-dev | — (recomendado antes do G5) | Aberto |
| SEC-177 | Baixa | Compensação paga mesmo quando o atraso foi causado pelo cliente (ausente, endereço não encontrado) | backend-dev, PO | — | Aberto |
| SEC-178 | Baixa | `/excluir-conta`: prazos fixos no código (72 h, 5 anos, 6 meses, 15 dias) divergem se o admin mudar o parâmetro | web (mobile-dev), PO | — | Aberto |
| SEC-179 | Baixa | iOS: localização **precisa** (o Android bloqueia a precisa; o texto diz "aproximada") | mobile-dev | — (decide o rótulo do App Privacy) | Aberto |

---

### SEC-166 | Severidade: Alta | Status: Parcial (bloqueia G5 Google Play)
Onde: `apps/web/app/(publico)/excluir-conta/page.tsx:62-74` (só `PrivacyRequestForm`), `app/api/public/privacy-request/route.ts`; nenhuma rota do web chama `/v1/auth/account-deletion/start|verify-code|review|finish` (a allowlist do BFF só tem `cancel`); `apps/api/src/cli.ts` só tem `admin:reset-access`; nenhuma rota de admin executa exclusão.
Problema: a página existe, mas não cumpre a WB-214 (C1 a C3 e C5: e-mail + código, mesmas regras da WB-213). Ela registra um DSR. Quem desinstalou o app não tem como ser atendido: o encarregado não tem ferramenta para excluir; sobra "reinstale o app" (o que o Google Play proíbe exigir) ou SQL manual em produção (sem bloqueios, sem auditoria, irreversível; viola a regra 6 do CLAUDE.md).
Cenário de ataque: não é ataque. É descumprimento do art. 18 VI da LGPD no prazo de 15 dias e da política de exclusão do Google Play ("sem reinstalar"). Revisão humana do Play ou reclamação na ANPD.
Correção recomendada (escolher uma; a 1 é a mais barata, a API está pronta e foi atacada em B1/B2 da revisão anterior):
1. **Página com a via A/B** (web): na própria `/excluir-conta`, formulário "e-mail → código enviado ao e-mail (senha se o e-mail não estiver confirmado) → revisão dos bloqueios → confirmar", chamando `/v1/auth/account-deletion/*` por rota do host público, com CSRF e `Origin` iguais a `/api/public/privacy-request`, ticket só no corpo e `Referrer-Policy: no-referrer`. O formulário do DSR fica como "não consegue receber e-mail?".
2. **Execução pelo super admin** (backend + painel): no detalhe do DSR do tipo `deletion` com conta, ação "Executar exclusão" (`privacy:manage`, reautenticação TOTP, motivo, registro "identidade conferida" obrigatório, mesmos bloqueios da WB-213, chama `closeAccount(userId, ctx, 'dsr')`, auditoria).
Como verificar a correção: QA executa a exclusão de ponta a ponta **sem o app** (opção 1 ou 2), confere e-mail de aviso, 72 h, anonimização; Security repete B1/B2 contra a página.

### SEC-169 | Severidade: Média | Status: Parcial (reaberto)
Onde: `apps/api/src/modules/addresses/addresses.service.ts:67-70` (`lookup(...).catch(() => null)` e `if (maxM > 0 && found)`), `stores/geocoding.ts:78` (CEP inexistente → `null`) e `:82` (sem coordenada no Nominatim → erro → `null`)
Problema: a conferência só roda quando o geocodificador acha o CEP. CEP inexistente, falha do ViaCEP ou do Nominatim (limite de 1 req/s, rua sem coordenada) **aceitam o pino do app sem conferir**. O CEP é dado do cliente.
Cenário de ataque: provado no A1. `cep: 00012-345`, cidade "Francisco Morato" (atendida) e pino a milhares de km → **201**, pino gravado. Com o pino em cima da loja, volta o B6: loja fora da área disponível, frete mínimo, promessa de 2 h impossível. Agravante operacional: agora **todo** endereço de cliente com pino consulta o Nominatim público, cuja política proíbe volume (ADR-008 o reservou ao cadastro de loja). Sob carga ele recusa, e a conferência fica desligada justamente quando há mais pedidos. O Nominatim também passa a receber rua e cidade de cada cliente (terceiro sem contrato).
Correção recomendada:
1. CEP inexistente (ViaCEP `erro`) → 422 `ADDRESS_CEP_NOT_FOUND`, com ou sem pino.
2. Provedor fora → aceitar, mas marcar `pin_unverified = true` e, no cálculo de raio, teto e faixa, usar o ponto do centro da **cidade** cadastrada (ou recusar a entrega para esse endereço até reconferir); alerta à Logística.
3. Centro do CEP: usar cache por CEP (tabela ou Redis, 30 dias) e trocar o Nominatim público por provedor com contrato antes do piloto, ou geocodificar só a cidade/bairro. Registrar o provedor no inventário (operador) e na política.
Como verificar a correção: A1 vira E2E (CEP com prefixo `000` no fake → 422); provedor lançando erro → endereço marcado e a loja distante continua "fora da área".

### SEC-175 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/orders/late-delivery.service.ts:115-138` (`decide` não confere o estado do pedido nem da corrida; aprova e só age se a corrida estiver `out_for_delivery`; a ação roda **depois** do commit), `:165-179` (`autoAccept`), `:184-212` (a entrega concluída não encerra o pedido de cancelamento pendente)
Problema: o pedido de cancelamento por atraso fica `pending` depois que o pedido é entregue. No aceite (automático em 10 min ou pelo admin), ele vira `approved` e dispara o evento "Cancelamento por atraso aceito" para o cliente, sem efeito no pedido. O mesmo acontece com a corrida já `not_delivered` (L5). Se o `act('not_delivered')` falhar depois do commit (corrida mudou, erro), o pedido fica "aceito" com o motoboy seguindo, e o aceite automático não tenta de novo.
Cenário de ataque: provado no L1. Pedido em saída, cliente pede o cancelamento; o motoboy entrega (com o código); 11 min depois o sistema "aceita": pedido `delivered`, cupom de compensação emitido, **zero estorno** e push "Cancelamento por atraso aceito". O cliente tem o produto e uma mensagem oficial dizendo que o cancelamento foi aceito. É a base de uma disputa no PROCON ou de um chargeback (CDC art. 35, J14) que a Webag perde por contradição própria. Na operação manual (R-18), a defasagem entre o fato e o clique do operador é a regra, não a exceção.
Correção recomendada:
1. Em `decide`, sob `FOR UPDATE` do pedido **e da corrida**: se o pedido não está `out_for_delivery` ou a corrida não está `out_for_delivery`, marcar o pedido de cancelamento como `superseded` (novo estado) com nota, sem evento de "aceito".
2. No `onDeliveryChange` para `delivered`/`not_delivered`/`cancelled`, encerrar na mesma transação os pedidos de cancelamento `late` pendentes (`superseded`).
3. Executar a transição da corrida **dentro** da mesma transação do aceite (ou aprovar só depois que a corrida mudou; em falha, voltar a `pending` para a varredura repetir).
4. Alerta à operação quando um cancelamento do cliente encerra uma corrida que já tinha motoboy (`awaiting_courier`, `courier_en_route`): hoje `cancelForOrderInTx` só registra o evento, e o motoboy pode chegar com um produto de pedido já estornado.
Como verificar a correção: L1 e L5 viram E2E: entregue antes do aceite → pedido de cancelamento `superseded`, nenhum evento "aceito"; corrida `not_delivered` antes do aceite → idem.

### SEC-176 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/privacy/account-deletion.service.ts:210-211` (o limite `deletion-cancel:email:<sha>` soma **toda** tentativa, antes de conferir a senha, e devolve 429 a todos); `apps/mobile/src/features/privacy/CancelDeletionForm.tsx:37-38` e `apps/web/src/features/auth/cancel-deletion-form.tsx:32-37` (sem campo de código: o 403 `LOGIN_CODE_REQUIRED` vira "senha errada"); não existe rota de admin nem comando para desfazer uma exclusão pendente
Problema: o limite por e-mail do SEC-168 vale também para o dono. Quem souber o e-mail mantém o arrependimento bloqueado durante as 72 h com 11 requisições por hora, de qualquer IP. E, mesmo abaixo desse limite, com o step-up ativo (5 falhas na conta) o dono recebe 403 pedindo o código, mas nem o app nem a página do lojista têm onde digitá-lo.
Cenário de ataque: provado no D1. 11 senhas erradas de IPs diferentes; o dono, de outro IP e com a senha certa, recebe **429**. Combinado com o cenário do SEC-154 (senha vazada: o concorrente exclui a conta e a loja), o atacante também impede a volta: a loja some de forma irreversível, e o suporte não tem ferramenta para reverter. Custo do ataque: ~260 requisições em 72 h.
Correção recomendada:
1. API (backend-dev): o limite por e-mail não pode devolver 429 para a senha correta. Contar só falhas (`hit` no ramo de erro, `peek` antes) e, acima do limite, tratar a senha certa como step-up (exigir o código `delete_web`, que já existe) em vez de 429. Manter o 429 só para senha errada.
2. Frontends (mobile-dev): ao receber 403 `LOGIN_CODE_REQUIRED`, mostrar "Enviamos um código ao seu e-mail" e o campo de 6 dígitos, reenviando e-mail, senha e `code` (o BFF já repassa o corpo).
3. Opcional: comando `privacy:cancel-deletion <email>` para o super admin, com identidade conferida pelo `runbook-dsr.md`.
Como verificar a correção: D1 vira E2E: depois de 11 falhas de IPs diferentes, a senha certa recebe 403 `LOGIN_CODE_REQUIRED` e, com o código, 204. QA: no app e em `/lojista/desistir-da-exclusao`, com o step-up ativo, o dono digita o código e reativa a conta.

### SEC-177 | Severidade: Baixa | Status: Aberto
Onde: `apps/api/src/modules/orders/late-delivery.service.ts:184-190`, `domain/late.ts:36-38` (`deservesCompensation` olha só o horário)
Problema: a compensação ignora o histórico da corrida. Atraso causado por `customer_absent`, `address_not_found` ou `customer_refused` com reentrega também gera o cupom. O mesmo vale para o operador que marca "entregue" com atraso (a hora é a do clique, não a da entrega).
Cenário de ataque: provado no L4. Cliente ausente → reentrega → entregue 30 min depois do fim da faixa → 1 cupom de entrega grátis. Repetível a cada pedido; o custo é a taxa de entrega paga pela Webag. Baixo valor, mas é exatamente o tipo de regra que vira "macete" em grupo de WhatsApp.
Correção recomendada: sem compensação se a corrida teve `not_delivered` com motivo atribuível ao cliente (`customer_absent`, `address_not_found`, `customer_refused`); RN-19 ajustada pelo PO. Usar a hora do evento `delivered` informada pelo operador, se houver campo para isso.
Como verificar a correção: L4 vira E2E → 0 cupons.

### SEC-178 | Severidade: Baixa | Status: Aberto
Onde: `apps/web/src/lib/public-deletion.ts:6-11` (usado em `excluir-conta/page.tsx:37,53,54,65`)
Problema: a página pública promete 72 h, 5 anos, 6 meses e 15 dias como texto fixo. Os valores reais são parâmetros do admin (`exclusao_arrependimento_horas`, `retencao_fiscal_anos`, `retencao_log_acesso_meses`; o de 15 dias é a constante `DSR_DEADLINE_DAYS`). Se o admin mudar, a página informa errado (LGPD art. 6 VI, transparência; art. 9 informação clara).
Correção recomendada: expor os 4 números no endpoint público que a página já usa (`loadHelp('customer')` → `privacy`) e ler de lá, com o valor fixo só como reserva; ou travar esses parâmetros (`PARAMETER_LOCKED`) até a revisão jurídica. Dono do texto: PO/jurídico.
Como verificar a correção: mudar `exclusao_arrependimento_horas` para 48 → a página mostra 48.

### SEC-179 | Severidade: Baixa | Status: Aberto
Onde: `apps/mobile/app.config.ts:36` (`infoPlist` sem `NSLocationDefaultAccuracyReduced`), `src/features/address/location.ts:52` (`Accuracy.Balanced`)
Problema: no Android a permissão precisa está bloqueada (SEC-084), mas no iOS o sistema concede a precisa por padrão. As coordenadas vão à API com precisão total (busca por raio). O texto do app e a política falam em "aproximada", e o rótulo do App Privacy teria de ser "Precise Location".
Correção recomendada: `infoPlist: { NSLocationDefaultAccuracyReduced: true }` (a busca de lojas por raio não precisa de mais), ou arredondar para 2 casas antes de enviar. Se o pino do mapa (MapPinPicker) precisar de precisão no futuro, pedir a temporária (`requestTemporaryFullAccuracy`) só nessa tela.
Como verificar a correção: build iOS → Ajustes > Webag > Localização mostra "Localização precisa: desligada"; App Privacy declara só "Coarse Location".

---

## Pendências minhas (SEC-161, 162, 163, 167, 174): definição de pronto

| ID | O que fecha | Dono | Quando |
|---|---|---|---|
| SEC-161 | Lista diária de `user_id` anonimizados fora do banco + `privacy:reapply-deletions --since` + passo no `guia-deploy.md` §8.4 + exercício no teste mensal de restauração | backend-dev (código), tech-lead (runbook) | Antes do 1º backup restaurado em produção |
| SEC-162 | Expurgo: dono excluído + janela de estorno (`troca_defeito_duravel_dias` 90 + 30 d [HIPÓTESE], parâmetro novo) → `disconnected`, `tokens_enc` nulo; revogar no MP se houver API | backend-dev | Antes do 1º lojista excluir a conta |
| SEC-163 | (a)/(b) `runbook-dsr.md` adotado pelo encarregado (feito, falta o fundador adotar); (c) expurgo do DSR sem conta após 5 anos [jurídico]; (d) teto global/hora do e-mail "recebemos" | fundador (a/b), backend-dev (c/d) | (a/b) antes do G5; (c/d) sem prazo |
| SEC-167 | E2E de classificação lendo `information_schema` contra `PRIVACY_MAP` (FK para `users.id` ou texto livre em tabela com essa FK) | backend-dev | Antes da próxima tabela com dado pessoal |
| SEC-174 | `@socket.io/redis-adapter` + revogação publicada no Redis; nota no ADR-004 | backend-dev, tech-lead | Antes de 2 réplicas da API |

## Segredos e dependências

| Verificação | Resultado |
|---|---|
| Arquivos versionados com cara de segredo (`.env*`, `.pem`, `.p8`, `.p12`, `.key`, `.jks`, `google-services`, `credentials`) | Nenhum (só `seller-credentials.ts`, código, e `gen-secrets.sh`, gerador) |
| Histórico completo (`git log --all`): mesmos nomes de arquivo | Nenhum `.env` ou chave jamais versionado; `.env` da raiz é ignorado (`.gitignore:28`) |
| Padrões no HEAD e no histórico (`APP_USR-`, `TEST-<n>-`, `-----BEGIN ... PRIVATE KEY`, `AKIA`, `AIza`, `ghp_`, `github_pat_`, `sk_live_`, `xox?-`, JWT, `ExponentPushToken[...]`) | Nenhuma ocorrência real (só a citação na própria revisão da Onda 1) |
| Atribuições `password/secret/token = "<20+ caracteres>"` fora de testes | Só segredos TOTP de exemplo público (`JBSWY3DPEHPK3PXP...`) em `apps/web/e2e` e tokens fictícios de cartão de teste |
| `eas.json` e `EXPO_PUBLIC_*` | Sem segredo; só URLs e chave pública do MP (`infra/env.example`) |
| `pnpm audit --prod` | 4 moderadas (`glob`, `minimatch` via `expo`/`jest`, ferramentas do app), **nenhuma Alta/Crítica** |
| `pnpm audit` (com dev) | 5 moderadas (+ `esbuild` do servidor de desenvolvimento), nenhuma Alta/Crítica |

## Observações sem ID

- **App no navegador (DEC-058), não commitado:** `src/lib/secure-store.web.ts` guarda a sessão só em memória (não em `localStorage`). Correto. Reverificar quando entrar no branch e garantir que esse build **não** é publicado em produção (CORS da API e cookies não foram pensados para ele).
- **Formulário público do DSR:** CSRF (`X-Webag-Client`, `Sec-Fetch-Site`, `Origin`), host público, `no-store`, corpo `strictObject`; a API responde 202 igual exista ou não a conta, 5/h por IP e 3/dia por e-mail (E2E `privacy-dsr-retention:33`). O protocolo é sequencial (`PV-0001`): revela só o volume de pedidos. Aceito.
- **THIRD_PARTY_NOTICES.md:** conferido do ponto de vista de segurança (nenhum segredo, nenhuma licença copyleft forte em produção). As pendências de atribuição (tela no app) são do tech-lead/mobile-dev (DEC-055), não de segurança.
- **Política de privacidade (texto do seed):** não cita compartilhamento com a loja e o motoboy, os operadores (Mercado Pago, Expo/FCM/APNs, e-mail, armazenamento, ViaCEP, Nominatim), a retenção nem o CPF no pagamento, e diz "Não coletamos CPF" (só vale para o cadastro). Insumos em `inventario-lojas.md`; o texto final é do jurídico.

## Limites desta revisão

- Análise estática, E2E e ataques contra Postgres e Redis **locais**, com provedor de pagamento e geocodificador **falsos** e storage em memória. **Sem** Mercado Pago real (PIX, cartão, 3DS, estorno, split), **sem** nginx rodando (só leitura do template), **sem** aparelho físico e **sem** pentest de rede. Antes de escalar (ou de campanha paga): pentest externo da API e do host público.
- O spec de ataque (L1 a L5, D1, A1, T1) ficou fora do repositório. L1, L4, L5, D1 e A1 devem virar E2E do backend-dev junto com SEC-175, 177, 176 e 169.
- Prazos, bases legais, IP truncado, compartilhamento declarado nas lojas e textos de atraso (J14): recomendação técnica, **validar com o advogado do fundador** antes do G5.
