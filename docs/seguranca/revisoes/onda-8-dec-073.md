# Revisão de segurança da entrega DEC-073 (B2 a B5, manutenção, DEC-072)

- **Data:** 2026-11-19 | **Revisor:** security-engineer | **Base:** `claude/admiring-lamport-62tq1a` em `04bb1d9`. O código vem de `2aa8916`, `39d3d1a`, `3cfbff8`, `f0f9dc6`, `84c433d` e `3ce2ff8`; `9a09400` só tem docs. Continua `onda-7-pos-dec-059.md`.
- **Escopo:** B4 usuários admin (`backoffice/accounts.*`), B5 pedidos admin (`orders/admin-orders*`), B3 alertas (`backoffice/alerts.*`, `admin/alert-catalog.ts`), modo manutenção (`admin/maintenance.service.ts`, criação de pedido e intenção de cartão), B2 e-mail de pedido novo (`notifications.service.ts`, `catalog.ts`, `PUT /v1/stores/{id}/notifications`), DEC-072 (dados do cliente ao lojista, comissão, parâmetros, `Store.providerFeePct`), `platform/http/pii-mask.ts` e `permissions.ts`.
- **Método:**
  - Leitura do código.
  - E2E do repositório contra Postgres e Redis reais, em banco próprio (`webag_sec181_test`): `b4-admin-users`, `b5-admin-orders`, `b3-admin-alerts`, `wb121-maintenance`, `b2-store-order-email`, `dec072-rules` e `rbac` (**41 testes, todos passam**), mais `sec180-code-budget` e `privacy-web-deletion` (**14, todos passam**).
  - **Ataques próprios:** uma spec E2E fora do repositório, com 7 cenários e de 3 a 4 ataques por área (resultados abaixo).
  - Teste de injeção de cabeçalho no nodemailer 10.6.0, busca de segredos no diff `12b3f68..3ce2ff8` e `pnpm audit --prod`.

## Pareceres

| Gate | Parecer | Condições |
|---|---|---|
| **G4** (segurança) | **APROVADO COM RESSALVAS** | Não há Crítica nem Alta abertas. Ressalvas (Médias) a corrigir **antes do piloto com usuários reais**: **SEC-181** (busca de usuários desfaz o mascaramento) e **SEC-182** (conta bloqueada não consegue pedir exclusão). O SEC-180 está corrigido na API (abaixo) |
| **G5 Google Play** | **COM RESSALVAS** (sem mudança) | Continuam valendo as condições de `onda-7-pos-dec-059.md`: URL `/excluir-conta` no ar, Data Safety por `inventario-lojas.md` e revisão jurídica. O SEC-182 é recomendado antes do envio: a política de exclusão do Google vale para todo usuário, inclusive o bloqueado. A DEC-073 não traz dado novo coletado pelo app |
| **G5 App Store** | **COM RESSALVAS** (sem mudança) | Mesmas condições de antes (política, textos jurídicos, App Privacy com Precise Location enquanto o SEC-179 estiver aberto) |

## Achados novos

| ID | Sev. | Dono | Resumo |
|---|---|---|---|
| SEC-181 | **Média** | backend-dev | A busca de usuários por trecho funciona como oráculo: o suporte recupera o celular inteiro com 13 buscas e o e-mail com 223. Essas buscas não são auditadas |
| SEC-182 | **Média** | backend-dev (e security no runbook, já feito) | Conta bloqueada não tem nenhum caminho para pedir exclusão: app 403, via A silenciosa, via B 401 enganoso, e não existe ferramenta no servidor |
| SEC-183 | Baixa | backend-dev | O motivo interno do bloqueio vai ao lojista: e-mail de suspensão com "Motivo: Dono bloqueado: ..." e `decisionReason` visível à equipe |
| SEC-184 | Baixa | backend-dev | O detalhe do pedido no admin mostra comissão, tarifa da plataforma e líquido da loja para a operação e o suporte (RN-13) |
| SEC-185 | Baixa | backend-dev + PO (prazo) | `user_status_history` não tem prazo de retenção, e o motivo é texto livre |

## Status dos anteriores

| ID | Status | Evidência |
|---|---|---|
| SEC-180 | **CORRIGIDO na API** (app M.2 pendente) | O E2E `sec180-code-budget` passa (4 testes): o D2 com 21 requisições vira 403 `LOGIN_CODE_REQUIRED` **com** o código, o dono reabre a conta, nenhum código é reemitido com outro ainda válido e sai 1 alerta sem dado pessoal. Os contadores ficaram separados (`code:h:anon:<e-mail>:<ip>`, `code:h:proved:<conta>`). **Não** repeti o ataque contra o BFF em build de produção. Resíduo aceito pelo backend: atacante com muitos IPs ainda manda código ao e-mail da vítima (5/h por IP); o controle real é WAF ou CAPTCHA na borda |
| Demais (SEC-146, 149, 150, 161, 162, 163, 169, 174, 178, 179) | Sem mudança | Ver `onda-7-pos-dec-059.md` |

## Verificação por área (ataques próprios)

| Área | Ataque | Resultado |
|---|---|---|
| B4 | Suporte reconstrói o celular mascarado `(11) 9****-5926` buscando dígito a dígito (`q=1193`, `q=11931`...) | **Falha: SEC-181.** `11931415926` em **13** buscas |
| B4 | Suporte reconstrói o e-mail `u***@dominio` por trecho | **Falha: SEC-181.** E-mail inteiro em **223** buscas (abaixo de 2 min com o limite de 120/min por IP) |
| B4 | Bloquear com campo extra (`status`); token do bloqueado logo depois; login | 400 (`strictObject`); o token antigo dá **401 na hora** (`principal.service.ts:31` relê o status a cada requisição; o socket cai por `revoked$`); login dá 403 `ACCOUNT_BLOCKED` |
| B4 | Bloqueado pede exclusão: via A, via B e app | **Falha: SEC-182.** Via A responde 200 e não envia código; via B com a senha **certa** dá 401 `INVALID_CREDENTIALS`; o app não entra |
| B4 | Operação bloqueia super admin; suporte e financeiro bloqueiam | 404 (`notAdmin()`, inclusive admin inativo); 403. Bloquear suspende só a loja `approved` do **dono** (operação já tem `stores:decide`, então não há escalada) |
| B5 | Operação e suporte em `POST /admin/orders/{id}/cancel` e `/refunds` | **403** nos quatro (`orders:refund` = financeiro e super admin, com reautenticação; o teto `estorno_super_admin_cents` e o pedido contestado são conferidos no servidor, `orders.service.ts:700-702`). `allowedActions` só reflete o servidor |
| B5 | Detalhe pelo suporte: procurar e-mail inteiro, rua e CEP | Ausentes (nome "Maria L.", e-mail e celular parciais, só bairro, cidade e UF). **Mas** `values.commission`, `applicationFee` e `merchantNetBeforeProviderFee` aparecem: **SEC-184** |
| B5 | Busca por e-mail | Só por e-mail **exato**, por isso não há oráculo por trecho (é o contraste com o B4) |
| B3 | Operação encerra alerta de dinheiro (`refund_exhausted`); suporte encerra; `?kind=refund_exhausted` pela operação; `/summary` do suporte | 404; 403; lista vazia; o tipo não aparece. O RBAC por tipo está no servidor (`canSeeAlertKind`, `alertKindsVisibleTo`) |
| B3 | Vazamento em `details` | Conferi todos os `raiseAlert` e `insert(paymentAlerts)`: só ids, números, valores, minutos e motivos técnicos, sem nome, e-mail, telefone ou endereço do cliente. `courierId` e `registeredBy` são ids internos |
| Manutenção | Operação liga | 403 (`maintenance:write` = super admin; com motivo e auditoria) |
| Manutenção | Ligada: `POST /v1/orders`; corpo do 503; `GET /v1/config/maintenance` | 503 `MAINTENANCE` em problem+json com `Retry-After: 60`, sem stack. O público só expõe `active`, `message` e `expectedBackAt`. O 503 **não** fica gravado na `Idempotency-Key` (`keepError` só para `PAYMENT_DECLINED`): a mesma chave funciona quando a manutenção acaba |
| Manutenção | Mensagem `<script>` gravada pelo super admin | Vai como texto no JSON; o app e o web exibem como texto (React escapa). Só o super admin escreve. Aceito |
| B2 | Funcionário com **todas** as permissões atribuíveis, dono de outra loja e admin em `PUT /stores/{id}/notifications` | 403 / 403 ou 404 / recusado: só o dono (`settings`, OWNER_ONLY) |
| B2 | Pagamento confirmado duas vezes; procurar e-mail, rua, nome e "R$" no e-mail | **1** e-mail (claim atômico `store_notified_at`); nenhum desses dados aparece |
| B2 | `\r\nBcc:` no nome da loja para injetar cabeçalho no assunto | O nodemailer 10.6.0 troca CRLF por espaço, então não há injeção. Além disso, o conteúdo é da própria loja e vai para a própria equipe |
| B2 | Link do painel e phishing | Montado com `ADMIN_WEB_URL` da configuração, nunca com o `Host` da requisição. Em produção o boot exige https público (`env.ts:192-195`) |
| B2 | Spam para terceiro | Os destinatários são só membros **ativos** da loja, e o funcionário só entra por convite com token aceito pelo próprio e-mail (`team.service.ts:97-123`). Cliente que quer encher a caixa de um concorrente precisa **pagar** cada pedido; são no máximo 2 e-mails por pedido (novo e lembrete) |
| DEC-072 | Lojista lê detalhe e comanda de pedido recusado | O E2E `dec072-rules` passa: `address: {}`, `phone: null`, comanda "Entrega". No código, `ACTIVE_STATUSES` exclui os 4 terminais (`delivered`, `cancelled`, `refused`, `expired`), e `load()` exige `paidAt`. Fora da DEC-072, conferi o socket da loja (`realtime.service.ts:25-35`): só ids, estado e número |
| DEC-072 | `providerFeePct` e comissão para funcionário e público | Nulo para o funcionário; `presentStore` não tem visão pública (só dono, funcionário e admin) |
| DEC-072 | Parâmetros | `comissao_padrao_pct` 0 a 30 (padrão 15), `taxa_provedor_*` 0 a 10 e 0 a 15, `troca_resposta_h` 6 a 72, só `parameters:write` (super admin). A tolerância de decimal de 1e-6 não abre 3 casas (4,985 é recusado). A intenção de cartão usa os mesmos `parcelas_max` e `parcela_min_cents`. Não reverifiquei que o pagamento recusa parcela fora da regra (o D-09 diz que sim) |

**Observações sem ID:**
1. `PUT /v1/admin/maintenance` não pede reautenticação. É coerente com `parameters` e `flags`: o super admin já tem MFA, e há auditoria com motivo. Se o fundador quiser um degrau a mais para "parar as vendas", basta `@RequireReauth()`.
2. Sobre a busca sem índice (dúvida 7 do backend): a fração `%trecho%` em `users` e `orders.number` faz varredura. No piloto aguenta, com o limite de 120/min por IP e `q` de 2 a 100 caracteres. A correção do SEC-181 já tira e-mail e celular da varredura. `pg_trgm` só passa de ~50 mil contas.
3. B2: o claim de `store_notified_at` acontece **antes** do envio. Se a fila de e-mail falhar, o aviso se perde sem nova tentativa. É disponibilidade, não segurança; o som e o alerta do painel continuam (DEC-074a).
4. Encerrar à mão um alerta de dinheiro (por exemplo, `refund_covered_payout_pending`) só tira o alerta da caixa. Nenhuma regra de pagamento depende do `resolvedAt` manual (`payments.service.ts:691,771` olham a intenção), e o ato fica auditado com a nota. Aceito.
5. Sobre a dúvida 5 do backend (operação cancelar pedido): a DEC-074c resolveu que não. Do lado da segurança, **mantenho**: cancelar estorna, então o cancelamento fica com quem estorna.

---

### SEC-181 | Severidade: Média | Status: Aberto
Onde: `apps/api/src/modules/backoffice/accounts.service.ts:46-54` (`users.email like %q%` e `users.phone like %dígitos%` a partir de 4 dígitos); `accounts.controller.ts:30` (limite por IP, sem auditoria).
Problema: o detalhe e a lista mascaram e-mail e celular (WB-102 C2), mas a busca aceita **trecho** desses campos e devolve o ID de quem casou. Um perfil `users:read` (suporte, operação) recupera o dado inteiro dígito a dígito, sem o "Revelar" auditado (fase 2). Nada dessa busca fica registrado.
Cenário de ataque: provado localmente. Um suporte mal-intencionado, ou uma sessão de suporte roubada, montou uma lista de celulares e e-mails de clientes (13 buscas por celular, ~220 por e-mail) para revenda ou golpe por WhatsApp. O mascaramento vira só cosmético, o que fere a minimização da LGPD (art. 6, III) e o desenho do RN-13. O impacto é vazamento em massa feito por insider.
Correção recomendada:
1. E-mail e celular **só por valor exato**: e-mail normalizado com `eq`, como já faz o B5; celular só com 10 ou 11 dígitos completos, `eq` depois de normalizar com o `phoneSchema`. Nome continua por trecho (o suporte precisa), com mínimo de 3 caracteres.
2. Auditar a busca (`user.search`, com o tipo do termo, o `sha256` do termo e o número de resultados, nunca o termo cru) e limitar por **admin** (`userId`), não só por IP (sugestão: 60/min).
Como verificar a correção: no E2E, `q=11977` e `q=<parte do e-mail>` devolvem `[]`; o celular completo e o e-mail exato devolvem 1; a auditoria tem 1 linha `user.search` por busca, sem o termo em claro. Repetir o ataque B4-1 e o B4-2 tem de dar 0 recuperações.

### SEC-182 | Severidade: Média | Status: Aberto
Onde: `privacy/account-deletion.service.ts:165` (`status !== 'active'` → 404); `privacy/web-deletion.service.ts:64,72,91` (via A não envia, via B responde 401); `identity/auth.service.ts:187` (login 403). Não existe comando no `cli.ts` para executar uma exclusão. O `runbook-dsr.md` regra 4 mandava "tratar aqui", mas não havia meio.
Problema: antes do B4 ninguém ficava `blocked`. Agora a conta bloqueada perde **todo** caminho de exclusão. O direito do art. 18, VI, da LGPD e a exigência de exclusão pela web do Google Play ficam sem atendimento para esse grupo. Na via B, a senha certa responde "credenciais inválidas", o que engana o titular.
Cenário de ataque/impacto: um cliente bloqueado por engano, ou um lojista que encerrou a relação, pede exclusão e não consegue. O encarregado não tem ferramenta e só consegue cumprir os 15 dias desbloqueando. Se o bloqueio foi por fraude, isso devolve o acesso ao fraudador. O risco é sanção da ANPD e reclamação na loja.
Correção recomendada:
- **Opção A, preferida:** aceitar `blocked` nas vias A e B da página `/excluir-conta`. Elas não criam sessão, e o `closeAccount` já revoga tudo. A anonimização preserva o que a retenção manda guardar (pedidos, `user_status_history`, auditoria).
- **Atenção:** o arrependimento (`account-deletion.service.ts:289` e o `privacy:cancel-deletion`) põe a conta em `active`. Ele precisa **voltar ao status anterior**: gravar `previousUserStatus` em `account_deletions` e restaurar `blocked`. Sem isso, "excluir e desistir" vira um jeito de **furar o bloqueio**.
- **Opção B:** comando `privacy:delete-account --email --identity-proof --reason [--dry-run]` (super admin, auditado, mesmo `closeAccount`).
Como verificar a correção: no E2E, a conta bloqueada pede exclusão pela via A (o código chega), conclui e fica `deleted`/`pending`. Se desistir, volta `blocked` e o login continua 403. A conta ativa que desiste continua voltando `active`.
**Contorno até a correção:** o `runbook-dsr.md` foi atualizado (regra 4).

### SEC-183 | Severidade: Baixa | Status: Aberto
Onde: `backoffice/accounts.service.ts:154` (`adminStores.suspend(..., \`Dono bloqueado: ${reason}\`)`); `stores/admin-stores.service.ts:175` e `platform/mail/templates.ts:171` ("Motivo: ..." no e-mail ao dono); `stores.controllers.ts` (`decisionReason` para o funcionário).
Problema: o motivo do bloqueio é uma nota **interna** da operação (por exemplo, "denúncia do cliente X, possível golpe"). Ele é copiado para a suspensão da loja e sai por e-mail ao dono e no painel para a equipe.
Cenário: um admin escreve no motivo um dado de terceiro, como o denunciante, ou a estratégia antifraude. O lojista investigado recebe tudo isso, o que leva a retaliação contra o denunciante ou ajuda a contornar o controle.
Correção recomendada: usar um texto fixo na suspensão causada pelo bloqueio ("A conta do responsável pela loja foi bloqueada. Fale com o suporte."). O motivo fica só em `user_status_history` e na auditoria. A tela do B4 (web) deve avisar que o motivo é interno.
Como verificar a correção: E2E bloqueando o dono de uma loja aprovada; o e-mail de suspensão e o `decisionReason` não contêm o texto do motivo.

### SEC-184 | Severidade: Baixa | Status: Aberto
Onde: `orders/admin-orders-read.service.ts:138-148` (`values.commission`, `applicationFee` e `merchantNetBeforeProviderFee` para todo perfil com `orders:read`).
Problema: o RN-13 e a tabela de permissões deixam comissão e repasse com o financeiro e o super admin (`commissions:read`, `reports:finance`). O detalhe do pedido entrega esses valores à operação e ao suporte. A comissão negociada por loja é dado comercial sensível.
Cenário: um suporte ou operador vê a comissão por loja pedido a pedido e repassa a um concorrente, ou a usa em negociação paralela. O impacto é comercial e não envolve dado pessoal.
Correção recomendada: esses três campos ficam `null` quando o perfil não tem `commissions:read`. O total, o subtotal, a entrega e os descontos continuam para todos.
Como verificar a correção: E2E em que suporte e operação recebem `commission: null` e o financeiro recebe o valor.

### SEC-185 | Severidade: Baixa | Status: Aberto
Onde: `privacy/privacy-map.ts:69` (`user_status_history: retain`, sem prazo); `accounts.controller.ts:22` (motivo é texto livre de 10 a 300 caracteres).
Problema: o histórico de bloqueio é guardado para sempre, e "o motivo não tem dado do cliente" é uma promessa que o código não garante.
Correção recomendada: definir um prazo, por exemplo o mesmo da auditoria (`[validar com o jurídico]`), e apagar na retenção diária. Na tela, colocar a orientação "não escreva dado pessoal no motivo".
Como verificar a correção: o `privacy-map` passa a ter o prazo; o E2E da retenção apaga a linha vencida.

## Inventário e LGPD

- `inventario-lojas.md`: a linha "Loja do pedido" (§3) foi ajustada à DEC-072 (contato e endereço só com o pedido ativo). Nenhum dado **novo** é coletado pelo app: o B2 usa o e-mail do lojista já cadastrado, e `user_status_history`, `maintenance_state` e `payment_alerts.resolution_note` são registros internos do admin. O Data Safety e o App Privacy não mudam.
- `runbook-dsr.md`: a regra 4 ganhou o procedimento para conta bloqueada (contorno do SEC-182).

## Limites desta revisão

- Ambiente **local**, com provedor de pagamento falso, e-mail em memória e sem nginx. Não houve pentest, Mercado Pago real nem aparelho.
- As telas web de B3, B4 e B5 **não** foram revisadas (ainda não existem ou não eram escopo). O mascaramento só vale se o web não buscar outra fonte, e isso tem de ser conferido quando as telas chegarem.
- A spec de ataque ficou fora do repositório. Os cenários B4-1, B4-2 e B4-3 devem virar E2E junto com o SEC-181 e o SEC-182.
