# Revisão funcional final do v1.0 (aceite do PO, história a história)

Autor: product-owner | Data: 2026-11-19 | Branch: `claude/admiring-lamport-62tq1a` | Escopo: brief §3, §4, §8 e §9; 178 histórias de `docs/produto/backlog.md`
Método e limite: **li código, OpenAPI, testes e relatórios; não executei nada** (a sessão não tem shell). "ACEITA" só aparece onde há evidência escrita de teste (QA ou testes do dev que rodaram verdes) **e** o código lido confirma a tela ou a rota. O que não consegui confirmar fica `NÃO VERIFICADO`. `docs/qa/relatorios/g4-final.md` ainda não existe; este documento não substitui o parecer de G4 do QA nem o do Security.
Fontes: `qa/relatorios/onda-2.md`, `onda-3-5.md`, `onda-7-reverificacao.md` (QA7), `heuristica-nielsen.md` (designer, 2026-11-19), `gestao/fila-backend-dev.md` (seções W, X, Y, Z), `gestao/fila-mobile.md`, `status.md`, `decisoes.md` (DEC-035 a DEC-069).

## 0. Veredito do PO

**O v1.0 não está aceito.** O dinheiro, a logística, as trocas e a LGPD passam na API e nos painéis, mas há 1 defeito que derruba a compra no app e 4 lacunas de operação que o brief e os PRDs pedem como Must. Em números: **104 aceitas, 37 aceitas com pendência, 14 não entregues, 19 não verificadas, 4 fase 2** (de 178). Bloqueiam o v1.0 (§4): **B1** o botão "pagar" da Sacola do app não abre o checkout; **B2** o lojista não é avisado de pedido novo com o painel fechado; **B3** os alertas de operação não têm tela; **B4** o admin não tem Usuários (bloquear); **B5** o admin não tem Pedidos (achar, cancelar, estornar). Cada um é pequeno e eu proponho o corte que o paga (§8). Fora do PO e ainda abertos: reteste do QA na Onda 8, aparelho real e Mercado Pago real (G4-5, G4-6), revisão jurídica J1 a J16.

## 1. Convenções e pendências transversais

| Código | Significa | Vale para |
|---|---|---|
| ACEITA | Critérios testados passam no que o ambiente permite; tela e rota confirmadas no código | |
| ACEITA COM PENDÊNCIA | Funciona, mas falta algo nomeado (critério, bug sem reteste, divergência) | Não bloqueia a história; bloqueia o G4 se for Must e a pendência for de produto |
| NÃO ENTREGUE | Falta rota, tela ou o caminho até ela | |
| NÃO VERIFICADO | Existe e tem teste do dev, mas nenhum relatório de QA cobre; o PO não aceita sem reteste | Ondas 5b e 6 quase inteiras |
| FASE 2 | Fora do v1.0 por decisão registrada | |

Transversais (não repito por história): **T1** nenhuma tela do app foi tocada em aparelho Android/iOS (QA7 §9); **T2** Mercado Pago real nunca exercitado, tudo é provedor `fake` (aceito para a definição de pronto do brief §8.4, não para o piloto); **T3** textos e regras jurídicas J1 a J16 (`decisoes.md`) antes do G5; não decido jurídico; **T4** o QA ainda não retestou BUG-019 a 025, SEC-175 a 180 e as seções W, X e Y do backend (`status.md`): onde a história depende disso a coluna diz "sem reteste QA".

## 2. Matriz história x status

### 2.1 Cliente (46)

| ID | Status | Evidência e pendência |
|---|---|---|
| 001, 003, 005 | ACEITA | O3-LOC OK (QA35); `location.tsx`, `addresses.tsx`; GPS em aparelho = T1 |
| 002 | ACEITA COM PENDÊNCIA | SEC-169 8/8 (QA7 §6); o visitante ainda consulta o ViaCEP direto (M.6); geocodificador real não contratado (DEC-067) |
| 004 | ACEITA COM PENDÊNCIA | C1 (vazio com "ver outra cidade") em `region-unavailable.tsx`; C2 a C4 = FASE 2 (DEC-061); o evento `region_not_served_shown` não existe no código (L-19); "outra cidade" é sempre a 1ª da lista |
| 006, 007, 008, 009 | ACEITA | smoke Onda 1 (QA2 §5), `pnpm smoke` 36/36 (QA7), e2e `auth`, `codes-reset` |
| 010 | FASE 2 | `login_social` é só um flag sem provedor; Could; DEC-063e |
| 011, 012, 013, 014, 015 | ACEITA | O3-HOM, O3-BUS OK; BUG-018 fechado (QA7) |
| 016, 017, 018, 019 | ACEITA | O3-LOJ, O3-FAV OK |
| 020 | ACEITA COM PENDÊNCIA | Sacola na API OK (O3-SAC); o CTA "Ir para o pagamento" só mostra um aviso (B1) |
| 021 | ACEITA | `cart/store.ts`; O3-SAC (loja única) |
| 022 | ACEITA COM PENDÊNCIA | cupom da plataforma OK (O3-CUP, SEC-170 8/9; BUG-023 corrigido sem reteste); cupom da loja não tem origem (WB-073) |
| 023, 024, 025, 026 | NÃO ENTREGUE | `checkout.tsx`, `pay/[orderId].tsx`, `card-wait.tsx` existem e a API passa (O4-PED/PAG, Playwright real), mas **nenhuma rota do app leva da Sacola ao checkout**: `cart.tsx:174-181` mostra `cart.payPending` no caso `pay` e as únicas referências a `/checkout` são voltas. Achado H-01 do designer (sev. 4), confirmado por mim no código. O fluxo principal do app é inalcançável |
| 027, 028, 029, 030, 031, 032 | ACEITA | O4-CAN, QA7 (BUG-011 a 014 fechados), `order/[id].tsx`, `wa.me`, `review/[orderId].tsx`; "pedir de novo" leva à Sacola e herda B1 |
| 033 | ACEITA | `my-coupons` e2e; `coupons.tsx` |
| 034 | NÃO VERIFICADO | `/v1/help` e `help.tsx` (Onda 6); nenhum caso de QA |
| 035 | ACEITA COM PENDÊNCIA | `OfflineBanner`, `AsyncBoundary`; offline e 3G só em Jest (T1) |
| 036 | NÃO VERIFICADO | `catalog/queries.ts`; nenhum caso de QA |
| 037 | ACEITA COM PENDÊNCIA | rotas OK (BUG-015); BUG-020 corrigido (`bug020-not-received.e2e`) sem reteste QA; o alerta de auto-conclusão retida não tem tela (B3) |
| 038 | NÃO VERIFICADO | `ReportSheet` no app; Onda 6 sem QA |
| 250, 252 | ACEITA | teto no fim da faixa 119/120/121 e faixa gravada (QA7 §5); `eta-delivery` e2e |
| 251 | ACEITA COM PENDÊNCIA | C2 e C5 passam; BUG-021 corrigido (`hours.ts`) sem reteste; borda exclusiva x PRD inclusivo (D-05) |
| 253 | ACEITA COM PENDÊNCIA | C2, C3, C5 aceitos pela API (QA7); app só validado no navegador; C4, C10, C11 a reaceitar no app |
| 254 | ACEITA COM PENDÊNCIA | C1, C3 a C5 OK (QA7); C7 (apagar cupom não usado) e C8 (SEC-177) implementados, sem teste de aceite do QA |
| 259, 260 | ACEITA COM PENDÊNCIA | `Order.refund` e `unavailableReason` (e2e `wb259-261`); `RefundBlock`, `unavailable.ts`; texto de prazo é `[HIPÓTESE; J16]`; sem reteste QA |
| 261 | NÃO ENTREGUE | `ETA_CHANGED` na API e `EtaChangedSheet` no app, mas só dispara a partir do checkout (B1); o cartão por página segura não confere a faixa (Z.5) |

### 2.2 Lojista (32)

| ID | Status | Evidência e pendência |
|---|---|---|
| 050, 051, 054, 055, 056, 057, 058, 059 | ACEITA | QA2 O2 (`stores-onboarding`, `stores-settings`), Playwright real 8/8 |
| 052 | ACEITA COM PENDÊNCIA | O2-DOC OK; BUG-025 (CORS do storage) corrigido em `infra/storage-init.sh` e **não testado contra o RustFS** (backend-dev); S3 real não testado |
| 053 | ACEITA COM PENDÊNCIA | `stores-team-payment`; OAuth do Mercado Pago real = T2; H-21: "Conectar depois" promete o que a Revisão nega (designer, sev. 3) |
| 257 | ACEITA COM PENDÊNCIA | preparo entra na faixa (`eta-delivery`); C6 "Seu preparo real está em N min" não feito (Z.3) |
| 060, 061, 062, 063, 064, 244 | ACEITA | QA2 O2 (variações, promoção, estoque, seções, moderação) |
| 065, 066 | ACEITA | QA2 I9 (importação em duplicidade) e I4 (preço em massa) |
| 067, 068, 069, 072 | ACEITA | O5-PRO, O5-PNL; Playwright real; som no painel (`order-alert.tsx`) |
| 070 | NÃO ENTREGUE | sem rota nem tela (O4-CAN-10 BLQ; busca no código confirma) |
| 071 | NÃO VERIFICADO | `pedidos/[id]/comanda/page.tsx` e `/ticket`; sem caso de QA |
| 073 | NÃO ENTREGUE | o motor do carrinho aceita cupom `scope=store`, mas não há rota nem tela do lojista (`/v1/admin/coupons` é só da plataforma) |
| 074 | NÃO VERIFICADO | `reviews/{id}/reply`, `avaliacoes/page.tsx`; sem caso de QA |
| 075, 076 | ACEITA | O2 (equipe), O5-PNL (financeiro bate com o ledger, QA35 O4-FIN-11) |
| 077 | ACEITA COM PENDÊNCIA | CSV só com campos do sistema; injeção de fórmula sem teste (O5-PNL-07 PARC) |
| 078 | ACEITA COM PENDÊNCIA | `w6-store-home` e2e; "loja no ar" é `[HIPÓTESE]` (DEC-069, Z.1); sem QA |
| 079 | NÃO ENTREGUE | TOTP só do admin; nenhuma tela de 2FA do lojista; Should |
| 227 | NÃO VERIFICADO | `merchant-help-page.tsx`; sem caso de QA |

### 2.3 Admin (26)

| ID | Status | Evidência e pendência |
|---|---|---|
| 100, 101 | ACEITA | smoke Onda 1, `admin-mfa`, `rbac` |
| 102 | NÃO ENTREGUE | `admin-users.controller` só gerencia admins; não há rota nem tela para achar, bloquear ou redefinir cliente ou lojista (B4) |
| 103, 104, 106, 107 | ACEITA | QA2 O2-APR, moderação |
| 105 | ACEITA | QA35 O4-FIN, `finance`; tela `comissoes` |
| 108 | NÃO ENTREGUE | só há relatórios agregados e a fila da Logística; nenhuma lista, filtro ou detalhe de pedido no admin (B5) |
| 109 | ACEITA COM PENDÊNCIA | API: BUG-011 fechado 11/11 (QA7); UI: só a Logística (cancela a corrida) e a fila de estornos; não há tela para cancelar ou estornar um pedido qualquer (B5) |
| 110 | ACEITA COM PENDÊNCIA | mediação de troca 11/11 (QA7); o "não recebi" retido depende de alerta sem tela (B3) |
| 111 | ACEITA COM PENDÊNCIA | comissão e taxa de serviço OK; padrão da API é 10% e o PRD diz 15% (D-01) |
| 112 | FASE 2 | no split o repasse é do Mercado Pago (ADR-002, DEC-016, DEC-060b); só faria sentido no modo centralizado, que não existe |
| 113 | NÃO ENTREGUE | o job de conciliação e `GET /v1/admin/payments/alerts` existem; **o web não consome**; ninguém vê divergência (B3) |
| 114 | ACEITA COM PENDÊNCIA | 2 CSV (DEC-060), `dt060-finance-csv` e2e, botões em `reports`; sem QA |
| 115 | ACEITA | QA35 BAN; `banners` |
| 116 | ACEITA COM PENDÊNCIA | teto obrigatório e "usos por loja" (e2e), BUG-023 corrigido, `coupons-page` já exige teto; sem reteste QA |
| 117, 118, 120, 123 | ACEITA | smoke Onda 1; auditoria O5-ADM-04 |
| 119 | ACEITA COM PENDÊNCIA | BUG-017: 4 chaves provadas pela API real, 2 só por teste do dev; não auditei as ~90 chaves; alcance mínimo de 3 km ausente (D-04) |
| 121 | NÃO ENTREGUE | sem flag nem tela; HIP-D11 o cita como o único jeito de parar as vendas (L-08) |
| 122, 124, 125 | NÃO VERIFICADO | `reports` e2e e `reports-page`; `denuncias`; Início do admin; Onda 6 sem QA |

### 2.4 Pagamentos (12), Logística (19), Trocas (15)

| ID | Status | Evidência e pendência |
|---|---|---|
| 150, 151, 152, 153, 154, 155, 156, 157, 158, 160 | ACEITA | provedor `fake` ponta a ponta: O4-PAG, O4-FIN (20.000 cenários, soma do ledger = 0), O4-EXT, concorrência (QC); webhook assinado e `application_fee` reais = T2 |
| 159 | NÃO VERIFICADO | código de chargeback em `payments`/`ledger`; sem caso de QA; Should |
| 161 | FASE 2 | Won't |
| 229, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240 | ACEITA | O5-PRO, O5-MOT, O5-ATR, O5-EST, O5-TAB, O5-CST, O5-REL; Playwright real |
| 230 | ACEITA COM PENDÊNCIA | BUG-016 fechado (pausa, horário); domingo NÃO TESTADO; borda do fechamento (BUG-021) sem reteste |
| 241 | ACEITA COM PENDÊNCIA | coleta e reentrega 11/11 (QA7); C7 a C9 (DEC-062) implementados, sem reteste |
| 242 | ACEITA COM PENDÊNCIA | "Você recebe" existe (`receive.ts`, `product-extras.tsx`); C1 sem a tarifa do provedor (D-02); C4 sem aviso de mudança (D-03) |
| 249 | ACEITA COM PENDÊNCIA | C2 e C5 passam (QA7); BUG-021 e BUG-022 sem reteste; 3 km ausente (D-04) |
| 255 | ACEITA COM PENDÊNCIA | atraso e "Em risco" na fila OK; C5 causa do atraso sem API (Z.2) |
| 256 | NÃO VERIFICADO | `assign-batch`, `batch-dialog.tsx`; sem caso de QA |
| 258 | ACEITA COM PENDÊNCIA | `delivery-params-page`; prévia por km e não por CEP (Z.4); "Prazo no piloto" sem API do lojista (Z.3) |
| 262 | ACEITA COM PENDÊNCIA | `wb262-delivered-at` e2e; sem reteste QA |
| 170 | ACEITA COM PENDÊNCIA | API 11/11 (QA7); o app só deixa trocar o **1º item** do pedido (`exchange/new.tsx:69`, H-05) |
| 171, 172, 173, 174, 175, 176, 177, 178, 243, 244 | ACEITA | O5-TRO, O5-TAX, O5-SLA, O5-COL, O5-RES (QA35); QA7 §5; "4 toques" e Maestro = T1 |
| 245, 247, 248 | NÃO VERIFICADO | diferença de preço, "Como vestiu" (o app já exibe `review.fit`), relatório de trocas; sem caso de QA nomeado |
| 246 | ACEITA COM PENDÊNCIA | o lojista cadastra e a API devolve `sizeChart`; **o app não exibe a tabela** |

### 2.5 Notificações (10), LGPD (9), Segurança de acesso (9)

| ID | Status | Evidência e pendência |
|---|---|---|
| 190 | ACEITA COM PENDÊNCIA | `push.ts`, `/me/push-devices`; FCM/APNs reais = T1 e G5 |
| 191, 193, 194 | ACEITA | `notifications` e2e, `catalog.ts`; e-mails de código e de pedido |
| 192 | ACEITA COM PENDÊNCIA | som e faixa no painel OK; **C2 e C3 sem canal fora do painel**: o aviso ao lojista é só push (`storeOrderNotice` não tem e-mail), o lojista é web e o Web Push ficou para a fase 2 (ADR-004) (B2) |
| 195 | NÃO ENTREGUE | não há `/me/notifications` nem tela; Should |
| 196, 197 | NÃO VERIFICADO | `privacy/notifications.tsx`; `marketing-push` e2e; sem QA |
| 198 | NÃO ENTREGUE | 13 tipos de alerta vão para `payment_alerts` e para o log do servidor; nenhuma tela nem e-mail (B3) |
| 199 | FASE 2 | Could; não construído |
| 210, 211, 216, 218 | ACEITA | smoke Onda 1; O5 (minimização); O2 (documentos) |
| 212, 217 | NÃO VERIFICADO | `privacy-export` e2e, `titulares`; sem QA |
| 213, 214, 215 | ACEITA COM PENDÊNCIA | fluxos A e B, 72 h, SEC-168 (QA7 §6); app M.2 sem reteste do Security; C6 a C8 de DEC-063 implementados, sem QA; J15 |
| 219, 220, 221, 222, 224, 225, 226 | ACEITA | smoke Onda 1, `admin-mfa`, `order-limits`, `sec155`, código de entrega (O5-EST) |
| 223 | ACEITA COM PENDÊNCIA | o endereço próprio do painel só existe no deploy (domínio do fundador) |
| 228 | NÃO VERIFICADO | `profile-page.tsx`; sem QA |

### 2.6 Resumo

| Épico | Total | Aceita | Com pendência | Não entregue | Não verificado | Fase 2 |
|---|---|---|---|---|---|---|
| Cliente | 46 | 26 | 11 | 5 | 3 | 1 |
| Lojista | 32 | 21 | 5 | 3 | 3 | 0 |
| Admin | 26 | 12 | 6 | 4 | 3 | 1 |
| Pagamentos | 12 | 10 | 0 | 0 | 1 | 1 |
| Logística | 19 | 11 | 7 | 0 | 1 | 0 |
| Trocas | 15 | 10 | 2 | 0 | 3 | 0 |
| Notificações | 10 | 3 | 2 | 2 | 2 | 1 |
| LGPD | 9 | 4 | 3 | 0 | 2 | 0 |
| Segurança de acesso | 9 | 7 | 1 | 0 | 1 | 0 |
| **Total** | **178** | **104** | **37** | **14** | **19** | **4** |

Dos 14 não entregues, **8 são Must** (023, 024, 025, 026, 261 por B1; 102; 108; 113) e 6 são Should (070, 073, 079, 121, 195, 198).

## 3. O que o aceite NÃO cobre

Aparelho real e Mercado Pago real (T1, T2); code review do tech-lead; parecer do Security; o reteste do QA depois das seções W, X e Y; usabilidade com pessoas (`qa/roteiros-usabilidade.md` é só roteiro; a avaliação heurística do designer deu 6,5 de 10 e depende do B1 para subir a ~7,5); desempenho em 3G; capturas de todas as telas em `docs/telas/` (a pasta não existe, as capturas estão em `qa/relatorios/capturas-v3/`).

## 4. Lacunas entre o brief e o construído

"Bloqueia" = bloqueia o v1.0 como o brief o define (§3 e §8). "Piloto" = não bloqueia a tag, bloqueia o piloto com dinheiro real.

| # | Lacuna (brief) | Estado real | Bloqueia? |
|---|---|---|---|
| B1 | Comprar no app (§3.1 checkout, §5 "comprar em menos de 2 min") | Tela de checkout pronta e API verde; **o botão da Sacola não navega**. Nenhum teste Jest, web-smoke ou Maestro cobre o trecho Sacola para checkout | **Sim, Alta.** Correção: `router.push('/checkout')` no caso `pay` e um teste até `checkout.screen` |
| B2 | Pedido em tempo real ao lojista (§3.2 "alerta sonoro") | Som só com a aba aberta e ativada por um clique (ADR-004). Sem e-mail de pedido novo e sem Web Push. Pedido sem aceite em 10 min cancela com estorno | **Sim.** Mínimo: e-mail ao dono e ao funcionário com permissão "pedidos" no pedido novo e no lembrete de aceite (sem dado do cliente). Web Push = fase 2 |
| B3 | Admin com visão da operação (§3.3 pedidos e conciliação; WB-113, WB-198) | 13 tipos de alerta (pagamento divergente, "não recebi" com auto-conclusão retida, cancelamento sem resposta, estorno atrasado, custo alto, loja com cancelamento alto) só em tabela e log; `GET /v1/admin/payments/alerts` sem consumidor | **Sim.** Mínimo: lista somente leitura de alertas abertos, com contador no Início do admin. A salvaguarda do BUG-020 só funciona se alguém a vê |
| B4 | Usuários: busca, bloqueio, redefinição de senha (§3.3; WB-102) | Não existe | **Sim, versão mínima:** buscar por e-mail, nome ou celular; detalhe mascarado; bloquear e desbloquear com motivo (sessões caem). Redefinir senha sai (o usuário tem "esqueci a senha") |
| B5 | Pedidos e trocas: visão geral, filtros, intervenção (§3.3; WB-108, WB-109) | Só rotas de cancelar e estornar; trocas e disputas têm tela; pedido não | **Sim, versão mínima:** lista com filtros (número, loja, estado, período), detalhe com linha do tempo e as duas ações. Sem CSV, sem "Atenção", sem "Revelar" |
| L-06 | Conciliação com o provedor (§3.3) | Job diário e alertas prontos; sem tela de resolução | Não (a lista de B3 cobre a leitura; "resolver" e "ajustar" = fase 2). **Piloto:** sim |
| L-07 | Repasses (§3.3) | Split: o Mercado Pago repassa; o lojista vê "a receber" e extrato (WB-076, 077) | Não |
| L-08 | Modo manutenção (§3.3 Configurações) | Não existe. Desligar PIX e cartão juntos é bloqueado de propósito (HIP-D11) | Não para a tag. **Piloto:** recomendo uma versão mínima (flag que recusa `POST /v1/orders`); hoje não há botão de parar a plataforma |
| L-09 | Cadastro e aprovação de loja (§3.2) | Completo: cadastro, documentos, conta de recebimento, fila, correção, suspensão; Playwright real 8/8 | Não. Pendências: CORS do storage sem reteste, OAuth do MP real (T2), "Conectar depois" (H-21) |
| L-10 | Produto com "Você recebe" (§9, DEC-035) | Existe, com calculadora "quanto quero receber" e explicação | Não. Divergências D-02 e D-03 |
| L-11 | Cupons (§3.2, §3.3) | Plataforma: completo, com teto de usos. Próprios do lojista: não (WB-073) | Não |
| L-12 | Avaliações (§3.1, §3.2) | Cliente avalia, exibe, lojista responde, moderação, "Como vestiu" | Não (074, 124, 247 sem QA) |
| L-13 | Trocas "Retira Troca" (§3.1, §9) | Ponta a ponta na API (QA7 11/11), 3 tipos, taxa só após aprovação, coleta, SLA de 24 h. No app: só o 1º item do pedido (H-05); tabela de medidas não aparece | Não, mas H-05 e WB-246 são pequenos e quebram a promessa do diferencial |
| L-14 | Logística da Webag (§9) | Fila, motoboys, WhatsApp, estados, custo, falha, lote, atraso, `deliveredAt`; sem app do motoboy (fase 2) | Não. Falta a causa do atraso (Z.2) |
| L-15 | Comissão no financeiro (§3.2, §3.3) | Lojista vê vendas, comissão, tarifa, a receber, extrato; admin: 2 CSV (Receita por pedido, Estornos); comissão padrão, por categoria e por loja | Não |
| L-16 | Relatórios do admin (§3.3) | GMV, ticket, novas lojas, novos clientes, recompra, cancelamento, CSV | Não (sem QA) |
| L-17 | LGPD (§3.1) | Exportar, excluir (app e web), consentimentos, DSR, minimização, retenção | Não. Security repete D1 contra o app; J15; G5 |
| L-18 | Notificações (§3.1 Conta, push) | Push de pedido e troca, e-mails de conta e de pedido, preferências. Central de notificações no app: não | Não (Should) |
| L-19 | Métricas por funcionalidade (AARRR; DoD "eventos instrumentados") | **Zero** dos ~25 eventos dos PRDs (`eta_shown`, `late_*`, `region_not_served_shown`, `refund_info_shown`...) está no código; não há camada de analytics | Não para a tag. O piloto mede só o que o banco guarda (pedidos, prazo, recompra, cancelamento); HIP-E10 (conversão pela faixa) e a demanda por região **não se medem** |
| L-20 | Login Google e Apple "preparado" (§3.1) | Só o flag `login_social` desligado; nenhum código | Não (Could; a Apple só exige se houver login social) |
| L-21 | Definição de pronto §7 e §8 | `docs/telas/` ausente; usabilidade com pessoas não feita; Windows e macOS não testados (README admite); relatório final e tag dependem do fundador; nada em `main` | Parte do fechamento (CEO e fundador) |

## 5. Divergências entre PRD e comportamento real

| # | PRD diz | Código faz | Decisão do PO |
|---|---|---|---|
| D-01 | Comissão padrão 15% (HIP-C01, DEC-035) | `comissao_padrao_pct` nasce 10 (`parameters.definitions.ts:36`); só o seed sobe para 15 se ninguém editou | PRD vale: backend muda o padrão para 15 (1 linha). Ambiente sem seed cobraria 10% |
| D-02 | "Você recebe cerca de R$ Y" = preço menos comissão **menos a estimativa da tarifa do provedor** (WB-242 C1, HIP-C02, HIP-004: a tarifa é do lojista) | `receive.ts` subtrai só a comissão e escreve "Você recebe"; os parâmetros `taxa_provedor_*_pct` não existem. O extrato mostra "Tarifa do pagamento" depois | **Corrigir no v1.0** (pequeno): 2 parâmetros, subtrair e dizer "cerca de". Hoje a tela promete 1% a 5% a mais do que cai na conta |
| D-03 | Aviso "Sua comissão mudou de A% para B%" no painel e por e-mail (WB-242 C4) | Não existe | **Corto para a fase 2.** Contorno: o fundador avisa a loja; no piloto a comissão não muda sozinha |
| D-04 | Alcance mínimo de 3 km ao salvar parâmetros de ETA (DEC-064e, HIP-P08) | `assertEtaRules` só exige teto menos folga >= preparo + despacho + 5 min; com os padrões o admin pode salvar teto 60 e fica com alcance de ~1,3 km (BUG-022 só em parte) | Backend recusa `reachKm < 3` (1 linha; QA registra como bug Média) |
| D-05 | Entrega só se o fim da faixa for **<=** fechamento (inclusivo, RN-19 §2) | `endsBeforeClosing` usa `minutes < endMin` (exclusivo, no minuto) | **PO aceita o código** (mais conservador, 1 minuto). RN-19 atualizada |
| D-06 | `ETA_CHANGED` com "qualquer diferença" (WB-261 C1) | só se o fim novo passar mais de 5 min (DEC-068) | PRD atualizado (WB-261 C1) |
| D-07 | RN-08: `Order.refund.status = processing\|done` | API devolve `completed` (DEC-068) | RN-08 atualizada |
| D-08 | `troca_resposta_h` de 6 a 72 (RN-02) | definição aceita 4 a 120; com SLA de 4 h os lembretes "12 h e 4 h antes" ficam no passado | RN vale: backend alinha a definição a 6-72 |
| D-09 | Parcelas em até `parcelas_max` e mínimo `parcela_min_cents` (HIP-011) | o servidor lê os dois ao pagar, mas a página do cartão manda `installmentsMax: 3` fixo (`card-intent.service.ts:78`) | Backend lê os parâmetros também na intenção (Baixa) |
| D-10 | WB-192 C2: Web Push e e-mail quando o painel está fechado | Nenhum dos dois (B2); Web Push é fase 2 pela ADR-004 | C2 passa a ser só e-mail no v1.0; Web Push = fase 2 |
| D-11 | HIP-036: lojista vê o cliente por 30 dias depois da conclusão | só enquanto o pedido está ativo; `dados_cliente_visivel_dias` fica desligado de propósito | **Aceito** (mais restritivo, LGPD); sem mudança |
| D-12 | Prévia de entrega do lojista com 3 endereços da região (spec) | prévia por distância em km (Z.4) | Aceito |
| D-13 | "Loja no ar" indefinido no PRD | aprovada + produto ativo + conta conectada (DEC-069), igual ao HIP-030 | **Confirmado** pelo PO |
| D-14 | WB-255 C5 (causa do atraso) e WB-257 C6 (preparo real do lojista) | sem API (Z.2, Z.3) | **Corto para a fase 2.** Contorno: a operação usa a nota obrigatória de `deliveredAtReason` e o relatório de prazo agregado (WB-258) |
| D-15 | Botão "Chego em até 10 min" lê `entrega_cancel_resposta_min` (WB-253) | o 10 é fixo no texto (Z.7) | Backend expõe o número (Baixa) |
| D-16 | `ETA_CHANGED` também no cartão (WB-261) | `card-intent` não confere (Z.5) | **Risco aceito no v1.0** (não sei qual meio predomina: a DEC-052 não destaca o PIX; medir a mistura PIX x cartão no piloto e, se o cartão pesar, fazer o `card-intent` conferir a faixa) |

## 6. Hipóteses ainda sem validação e onde se ajusta no admin

Lista para o relatório final ao fundador. "Admin" = tela do painel; chaves em `apps/api/src/modules/admin/parameters.definitions.ts` (admin > Todos os parâmetros) salvo indicação. Validação = o que medir no piloto de 5 lojas (HIP-043).

| Hipótese | Valor assumido | Onde ajusta | Como validar |
|---|---|---|---|
| HIP-C01 comissão padrão | 15% (a API nasce 10, D-01) | `comissao_padrao_pct`; admin > Comissões (por categoria e por loja, com vigência) | 5 lojistas aceitam o "Você recebe" (V1/V4) |
| HIP-C02 / HIP-004 tarifa do provedor | PIX 0,99%, cartão 4,98%, paga o lojista | **não configurável hoje** (D-02) | contrato do Mercado Pago e sandbox (T2) |
| HIP-L01 tabela de taxa de entrega | R$ 8 a R$ 18 por faixa de distância | admin > Frete por região | cotar 3 a 5 motoboys antes do piloto; relatório de margem (WB-240) |
| HIP-L02 custo do motoboy | R$ 7 a R$ 16 por corrida | lançado por corrida em Logística; sem parâmetro | custo real por entrega (WB-239) |
| HIP-L10 / HIP-E08 horário da logística | seg a sáb, 09:00 às 20:00 | `logistica_horario`, `logistica_dias`; pausa por cidade em Logística | o fundador define com os motoboys reais |
| HIP-E01 a E03 ETA | preparo 20, despacho 15, 1,30 x 6 min/km, folga 15, teto 120 | admin > Parâmetros de entrega (`entrega_*`) | relatório de prazo (WB-258): meta 95% em até 2 h |
| HIP-E04, E05, E06 atraso e compensação | tolerância 15 min; entrega grátis no próximo pedido; resposta em 10 min | `entrega_atraso_tolerancia_min`, `entrega_compensacao_tipo`, `entrega_compensacao_cents`, `entrega_cancel_resposta_min` | custo da compensação; J14 |
| HIP-E09 copy "até 2 h" | **proibida** até 95% medidos | não é parâmetro; é regra de comunicação (lojas de apps, landing) | 95% das entregas do piloto em até 2 h do pagamento |
| HIP-E10 faixa aumenta a conversão | carrinho para pedido pago >= 40% | **não mensurável** (L-19) | exige analytics (fase 2) |
| HIP-T01 a T05 trocas | 7, 30 e 90 dias fixos; 1 troca voluntária; SLA 24 h; taxa da tabela | `troca_voluntaria_*`, `troca_resposta_h`, `troca_taxa_pagamento_h`, `taxa_coleta_max_cents`; taxa em Frete por região; prazos legais **não editáveis** | taxa de troca por loja (alerta 25%, `troca_taxa_alerta_pct`), arrependimento x troca |
| HIP-P03 coleta atrasada | 1 dia útil, relógio pausado | `coleta_atrasada_dias_uteis` | % de coletas atrasadas |
| HIP-008 aceite da loja | 10 min, lembrete aos 5 | `loja_aceite_timeout_min`, `loja_aceite_lembrete_min` | aceite mediano < 3 min; cancelamento por timeout (depende de B2) |
| HIP-006, 011, 012 pagamento | PIX 15 min; 3x, parcela mínima R$ 30; teto R$ 2.000 | `pix_expiracao_min`, `parcelas_max`, `parcela_min_cents` (D-09), `pedido_max_cents` | recusas e abandono |
| HIP-L12 pedido mínimo e frete grátis | R$ 20; frete grátis desligado | `pedido_minimo_cents`, `frete_gratis_acima_cents` | ticket médio |
| HIP-003 taxa de serviço | desligada | flag `taxa_servico`, `taxa_servico_tipo`, `taxa_servico_valor` | só se a margem de logística pedir |
| HIP-D07 e-mail não confirmado | 1 pedido antes de confirmar | `email_nao_confirmado_pedidos_max`, flag `confirmacao_email_bloqueia_compra` | fraude x fricção |
| DEC-016 loja nova | R$ 500 por pedido, 30 dias ou 20 pedidos | `loja_nova_dias`, `loja_nova_pedidos`, `loja_nova_pedido_max_cents` | valor médio das 5 lojas |
| HIP-P01 cupom da plataforma | teto de usos obrigatório; sem alvo por região | cupom: admin > Cupons (o teto não é opcional) | usos por loja (relatório do cupom) |
| HIP-P07 `deliveredAt` | recuo máx. 60 min, motivo acima de 5 min | constantes no código, **não configuráveis** | distribuição dos recuos por operador |
| HIP-P08 alcance mínimo | 3 km | **não implementado** (D-04) | n/a |
| HIP-P09 prazo de estorno | PIX "até 1 dia útil", cartão "até 2 faturas" | texto fixo no servidor; não configurável | tempo real no sandbox (T2); J16 |
| HIP-P10 e HIP-024 retenção | 5 anos com IP truncado; anonimização em 15 dias | `exclusao_anonimizacao_dias`, `retencao_*`; o prazo de 5 anos da prova de aceite não é parâmetro | J15 |
| HIP-027 push de marketing | opt-in, 2 por semana, 9h às 20h, mínimo de 20 destinatários | `push_mkt_max_semana`, `push_mkt_janela`, `push_mkt_min_segmento` | taxa de abertura |
| HIP-030 aprovação de loja | SLA de 2 dias úteis; "no ar" = aprovada + produto + conta | `aprovacao_loja_sla_dias_uteis` | tempo real de análise |
| HIP-043 meta do piloto | 20 lojas, 1.000 pedidos por mês, aceite < 3 min, cancelamento < 8%, recompra em 30 dias | relatórios do admin | é a própria medida |

## 7. Backlog da fase 2 (priorizado, 15 itens)

Critério: (1) risco de dinheiro ou de operação no piloto; (2) o que a medida do piloto precisa; (3) esforço pequeno; (4) tem gatilho. Sem RICE (sem dado de uso).

| # | Item | Justificativa e gatilho |
|---|---|---|
| 1 | Modo manutenção mínimo (WB-121) | Hoje não há botão de parar a plataforma. Recomendo **antes do piloto**; gatilho: já existe (incidente) |
| 2 | Analytics de produto: eventos do `region_not_served_shown`, `eta_shown`, `late_*`, `refund_info_shown` (L-19) | Sem isso HIP-E10 e a demanda por região não se medem. Gatilho: antes de qualquer campanha paga |
| 3 | Web Push do painel do lojista (WB-192 C2 e C3 completos) | O e-mail do B2 é o mínimo; o lojista de celular precisa do aviso nativo. Gatilho: cancelamento por timeout de aceite > 5% |
| 4 | Conciliação completa: resolver e ajustar divergência, alerta por e-mail (WB-113 C2 e C4, WB-198) | Leitura entra no B3; a ação é do financeiro com dinheiro real. Gatilho: 1ª divergência no sandbox ou na produção |
| 5 | App ou link do motoboy, rastreio, despacho automático (WB-300 a 309) | Já decidido (DEC-036); gatilho: > 15 entregas por hora ou p90 de atribuição > 10 min |
| 6 | Estorno parcial da taxa de troca, `expectedBy`, `arrivesBy`, eventos de atraso em tempo real, `earlier` (DT-062; F3b, F5, F6b, F7) | Conforto, não hipótese. Gatilho: 3 casos por mês ou "cadê meu estorno" > 10% do suporte |
| 7 | Cupons próprios do lojista (WB-073) e alvo do cupom da plataforma por cidade, categoria e loja (DT-059) | Marketing local; gatilho: loja pede campanha ou 2 cidades ativas |
| 8 | Causa do atraso e preparo real do lojista (WB-255 C5, WB-257 C6, Z.2, Z.3) | Calibra o ETA depois dos primeiros dados |
| 9 | Aviso de mudança de comissão (WB-242 C4) | Contorno manual; gatilho: 1ª mudança de comissão |
| 10 | Login Google e Apple (WB-010) | Fricção de cadastro; ligar exige antes a exclusão de conta de quem só tem login social (DEC-063e) |
| 11 | Lista de espera por região (WB-004 C2 a C4, F8) | Gatilho em `backlog.md` §6.5: > 50 aberturas por semana |
| 12 | Central de notificações no app (WB-195) | O push cobre; gatilho: reclamação de aviso perdido |
| 13 | Item indisponível com estorno parcial (WB-070) | Contorno: recusar e refazer; gatilho: cancelamentos por falta de estoque > 3% |
| 14 | 2FA opcional do lojista (WB-079) e repasses do modo centralizado (WB-112), segundo provedor (WB-161) | Segurança do dono; centralizado só se o KYC do MP barrar lojistas |
| 15 | Pontos, assinatura, chat (WB-310 a 334) | Fora do brief da 1.0; gatilhos em `backlog.md` §6 |

## 8. Pacote mínimo para fechar os bloqueadores e o que paga por ele

Não crio escopo novo sem cortar outro. O pacote B1 a B5 **não é escopo novo**: são histórias Must já existentes (020/023 a 026/261, 192, 198, 102, 108/109). O que corto para caber:

| Corte | Economiza |
|---|---|
| WB-102 C4 (redefinir senha pelo admin) | o usuário usa "esqueci a senha" |
| WB-108 C3, C4, C5 (destaque "Atenção", "Revelar", CSV) | a Logística já destaca atraso; dado pessoal fica mascarado por padrão |
| WB-113 C2 e C4 (resolver, ajustar, alerta de 3 dias) | fase 2 (#4) |
| WB-192 C2 Web Push | fase 2 (#3) |
| WB-242 C4, WB-255 C5, WB-257 C6 | fase 2 (#8, #9) |
| WB-070, 073, 079, 195 (Should não construídos), WB-010 e 199 (Could) | formalizados como fase 2 |

Ordem se o prazo apertar (do que nunca cortar ao que corta primeiro): **B1** (sem compra, nada vale), **B2** (pedido perdido por falta de aviso), **B3**, **B4**, **B5**. Para o B5 o contorno é o fundador consultar o banco, aceitável só no piloto de 5 lojas.

Correções pequenas, sem escopo novo, que recomendo junto (dono entre parênteses): D-01 padrão 15% (backend); D-02 tarifa do provedor no "Você recebe" (backend e web); D-04 alcance de 3 km (backend); D-08 e D-09 (backend); H-05 escolher o item da troca (app); WB-246 exibir a tabela de medidas no app; H-21 trocar "Conectar depois" por "Salvar e continuar depois" (web).

## 9. O que mudou nos documentos nesta rodada

Editei só o que é do PO: `docs/produto/backlog.md` (status por história, seção 9 e quadro de alterações), `docs/produto/regras-de-negocio.md` (RN-08 `completed`; RN-19 §2 fechamento exclusivo), `docs/produto/prd/cliente.md` (WB-261 C1: tolerância de 5 min) e linhas novas no fim de `docs/decisoes.md` (DEC-070 a DEC-072; a proposta de bloqueadores aguarda o CEO). **Não consegui fazer commit nem push**: a sessão não tem shell. O CEO precisa commitar os 5 arquivos acima com `git add` explícito.
