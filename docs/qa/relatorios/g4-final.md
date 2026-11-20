# Relatório de QA: parecer FINAL de G4 (Onda 8, T8-01)

Data: 2026-11-19 | Autor: qa-engineer | Branch: `claude/admiring-lamport-62tq1a` | **Código testado: commit congelado `0d902ab` (DEC-069); `25ce4c7` só acrescenta documentos (conteúdo de `apps/` e `packages/` idêntico)** | Anteriores: `onda-7-reverificacao.md` (preliminar), `setup-do-zero.md` | Saídas completas: `docs/qa/retestes/resultados/g4-*.txt`, `docs/qa/carga/resultados/g4-*.txt`
Marcação `NÃO TESTADO` = não executei; não aprovo o que não executei.

## 1. Parecer de G4

**APROVADO COM RESSALVAS, somente para o commit `0d902ab`, e NÃO é aprovação de G5 (publicação).** Nenhum bug Crítico ou Alto aberto; o único bug aberto é o BUG-019 (Média, de teste). O fluxo de negócio de ponta a ponta, os bugs 009, 010 e 020 a 025 e os 9 fluxos novos passaram contra Postgres, Redis, armazenamento e e-mail reais com o provedor `fake`. As ressalvas não são cosméticas: três delas só o fundador fecha (aparelho, Mercado Pago, staging) e uma é do processo (o branch andou depois do congelamento).

| # | Ressalva / condição | Por quê | Dono | Bloqueia |
|---|---|---|---|---|
| R1 | **O branch mudou depois do congelamento.** Há 27 commits em `apps/` e `packages/` depois de `25ce4c7` (144 arquivos, migrações 0051 a 0053): DEC-072 em código (comissão 15%, alcance de 3 km, `troca_resposta_h`, parcelas, tarifa do provedor, dados do cliente só em pedido ativo), modo manutenção (WB-121), e-mail ao lojista (B2), caixa de alertas, usuários e pedidos do admin (B3 a B5), `Store.live`, `arriveSoonMinutes`, `OrderSummary.eta` e telas novas do app e do painel. **Nada disso foi testado por mim.** O parecer vale para `0d902ab`; o ponta do branch precisa de reteste próprio (T8-08) antes de virar release candidate | O pedido foi congelar o alvo; o alvo andou. Se o CEO quiser que o ponta do branch seja o RC, rodo o mesmo pacote (`docs/qa/retestes/*.mjs`, ~1 h) no commit novo | CEO decide; QA retesta | G4 do ponta do branch |
| R2 | **BUG-019 (Média, backend-dev):** `seed-onda3.e2e` "banners: 3" falha em checkout limpo (cache frio do vitest, como no CI): 1ª execução completa 762 de 763; reproduzido 2 de 2 com cache novo. Correção de 1 linha de teste (§3). As execuções 2 e 3 (763 de 763) só passaram porque o vitest põe o arquivo que falhou no início da fila | O CI da API fica vermelho na primeira execução de um clone novo | backend-dev; QA roda 1 execução completa a frio | "CI verde" do DoD; não é defeito do produto |
| R3 | **Aparelho real** (Android de entrada e iPhone): nada do app foi tocado num celular (§9, roteiro §10) | Só rodei o app no navegador (react-native-web) | fundador | G5 |
| R4 | **Mercado Pago real (sandbox):** PIX, cartão, 3DS, `application_fee`/split, webhook assinado de verdade, estorno | Tudo foi pelo provedor `fake` | fundador (credencial) | G5 |
| R5 | **k6 em staging:** o que rodei é indicativo (§8); memória da API chegou a ~950 a 975 MB com imagens | Sandbox compartilhado, tudo na mesma máquina | QA + tech-lead (staging) | G5 |
| R6 | **Decisões do PO sobre o que os testes mostraram** (§9.1): tarifa do provedor sobre pedido cancelado, efeito do fechamento da logística na promessa de entrega | Regras `[HIPÓTESE]` implementadas como estão | PO | não |
| R7 | **Security repete** SEC-166/176/180 no app e o que mudou desde `dad9c96` (o veto é dele) | Meu smoke de papéis (§7) não é revisão de segurança | security-engineer | G4 (parecer dele) |

Para a ressalva R2 virar zero basta: backend-dev corrige a linha 39 do teste (ou o seed) e eu rodo 1 execução completa a frio (~10 min).

## 2. Ambiente e método

| Item | Valor |
|---|---|
| Máquina | sandbox Linux 4 vCPU, 16 GB, compartilhada; Node 22.23, pnpm 10.28, Docker 29.10 |
| Subida do zero | clone novo do branch (`git clone`), `pnpm install --frozen-lockfile` (3,6 s, loja quente), `pnpm run setup` (**28,8 s**: PostgreSQL 18 + PostGIS, Redis 8, RustFS, Mailpit; **51 migrações (0000 a 0050)**; seed de 12 lojas, 12 funcionários, 6 clientes, 60 pedidos de demonstração; as portas 5432 e 6379 estavam ocupadas e o `.env` novo escolheu 5433 e 6380 sozinho). **`pnpm smoke`: 36 de 36 verificações em 2 s** (saúde, logins, TOTP do admin, busca PostGIS, retirada e entrega até a coleta, funcionário sem financeiro) |
| API sob teste | `node dist/main.js` (compilada, `NODE_ENV=development` só para as rotas de pagamento simulado) na porta 3400 com `TRUST_PROXY=1` (limite por IP; o gerador usa um IP fictício por conta); provedor de pagamento e geocodificação `fake`; e-mail no Mailpit; armazenamento RustFS; web em `next start` (build de produção) na 3101; app no navegador na 8091 |
| Isolamento | clone próprio em pasta temporária da sessão; banco e Redis do meu `docker compose`; e2e com banco `webag_<pid>_test` e Redis lógico próprios por execução. Não usei o checkout principal |
| Relógio | recuado só pelo banco (SQL), varredura é a do servidor (20 s a 5 min); `pix_hora_max` subiu a 30 durante os scripts e voltou ao padrão |
| Retestes | `docs/qa/retestes/`: `onda-7.mjs` (regressão dos bugs 011 a 018), `onda-8.mjs` (bugs 010 e 019 a 025 e fluxos novos), `regressao-negocio.mjs`, `papeis.mjs`, `excluir-conta-web.mjs`, `app-web.mjs`; helper `lib.mjs` |

## 3. Suítes completas

| Suíte | Resultado | Observação |
|---|---|---|
| `pnpm generate:check` | **OK** (2,2 s), `git diff` vazio | OpenAPI e cliente `shared` em dia |
| `pnpm lint` | **OK**, 6 tarefas, 0 avisos (50 s) | |
| `pnpm typecheck` | **OK**, 7 tarefas (26 s) | |
| `pnpm build` | **OK**, 5 tarefas (58 s): API, web (next build), app (expo export iOS e Android), shared, tokens | 2 de 5 vieram do cache do turbo |
| API unitários | **308 de 308**, 41 arquivos | |
| **API e2e, banco e Redis reais, 3 execuções completas seguidas** | **execução 1: 762 passaram, 1 falhou; execuções 2 e 3: 763 de 763, 0 ignorados** (631 s, 579 s, 596 s; 95 arquivos) | falha da execução 1 e por que as outras passaram: abaixo |
| Web Vitest | **601 de 601**, 74 arquivos | |
| Web Playwright, API falsa (`PW_CHANNEL=chrome`) | **46 passaram, 2 ignorados** (as capturas `CAPTURE_V3`, de propósito), 1,4 min | |
| Web Playwright contra a API real (`e2e-real`) | **8 passaram, 3 ignorados** (capturas), 1,8 min, **sem ajuste manual de CORS** | só precisou de `REAL_DB_URL` (BUG-025, resíduo) |
| App Jest | **398 de 398**, 42 suítes (40 s) | |
| `packages/shared` | 3 de 3 | |
| `pnpm web` (app no navegador) contra a API real | **5 de 5** (`app-web.mjs`): primeira tela pergunta onde receber, home e categorias e banners com 200, lojas do seed, página da loja com preço, nenhuma requisição bloqueada por CORS | capturas em `retestes/resultados/app-web-*.png`; visitante sem localização usa cidade e bairro (o CEP de visitante vai ao ViaCEP, sem rede aqui) |

**A falha do e2e (BUG-019).** `seed-onda3.e2e-spec.ts:39` (`expected 2 to be greater than or equal to 3`). `apps/api/seed/onda3.ts:197` só cria os 3 banners se não existir NENHUM banner; o banco do e2e é compartilhado e `banners.e2e-spec.ts` deixa banners; se `banners.e2e` roda antes de `seed-onda3`, o seed pula e o teste lê 2. O vitest ordena por falha anterior e duração em cache: **com cache frio (clone novo, CI) a ordem é a que falha** (2 de 2 execuções frias só com os 2 arquivos, e a 1ª execução completa); nas execuções 2 e 3 o arquivo falhou antes e foi para o início da fila. Ou seja, "3 execuções verdes seguidas" só vale com cache aquecido. Os outros 5 sintomas do BUG-019 (`orders` "6 clientes", `fix-r3`, `admin-contract-gaps`, `s62`, `logistics-report`) e o BUG-024 (reports 6/6, marketing-push 8/8) passaram nas 3 execuções, com **0 testes ignorados**.

## 4. Bug a bug

| ID | Sev. | Estado | Evidência deste reteste |
|---|---|---|---|
| BUG-001 a 008 | M/A | FECHADOS (Ondas 2 e 3) | não reexecutados um a um; cobertos pela suíte e2e (763) e pela regressão de negócio (§6) |
| BUG-009 | M | **FECHADO** | loja nova: sacola de R$ 550 bloqueada (`NEW_STORE_LIMIT`) e servidor recusa (422); `exposure-limit` mostra R$ 500, 30 dias e `ordersToEnd`; admin lê. Não executado: ajuste do admin e virada por 20 pedidos (só e2e) |
| **BUG-010** | M | **FECHADO** (indicativo) | 40 envios simultâneos de 12 contas (JPEG 39,9 MP, PNG 25 MP, PNG 39,7 MP): válidos aceitos, PNG acima do teto 422, 0 erro 5xx, home p95 542 a 735 ms durante; k6 S9: 279 aceitos, 134 recusados, 0 5xx, home p95 21 ms. **RSS chegou a ~950 a 975 MB** (ressalva de capacidade) |
| BUG-011 a 018 | A/M/B | **FECHADOS, regressão OK** | `onda-7.mjs` (bug011 a bug018, teto 119/120/121, atraso e compensação, trocas, estoque, SEC-168/169/170): 121 verificações PASS na 1ª passagem; as 2 falhas (`TETO-119b/120b`, LOGISTICS_CLOSED às 18 h 55 BRT) eram do teste, que não levava em conta o BUG-021; com a logística aberta o dia todo no teste, a seção passou 8 de 8; 3 `NÃO TESTADO` iguais aos da Onda 7 (domingo, 2 chaves do BUG-017); o "não recebi" que era `NÃO TESTADO` agora está no BUG-020 |
| **BUG-019** | **M** | **ABERTO** (resíduo) | R2 e §3: `seed-onda3` "banners" depende da ordem; o resto estável |
| **BUG-020** | M | **FECHADO** | 6 de 6 pela API real: com "não recebi" a corrida de 25 h NÃO é concluída, aviso gravado, 1 alerta, operação ainda decide; controle sem aviso é concluído pelo sistema |
| **BUG-021** | M | **FECHADO** | fim da faixa depois do fechamento: não oferece na sacola, no servidor (422) nem no cartão (em até 30 s por cache); borda 1 min depois oferece, 2 min antes não; sem falso bloqueio com fechamento distante; app mostra "Entregas voltam amanhã às 9h" |
| **BUG-022** | M | **FECHADO** | 40, 59 e folga 60 recusados (422 com teto mínimo e alcance em km); `min_por_km` 60 e negativo recusados; 110 aceito; reset volta |
| **BUG-023** | B | **FECHADO** | `BEMVINDO10` com `max_uses` 100; nenhum cupom ativo sem teto |
| **BUG-024** | M | **FECHADO** | `reports` 6/6 e `marketing-push` 8/8 nas 3 execuções; 0 ignorados |
| **BUG-025** | M | **FECHADO** (resíduo Baixa) | do zero, CORS nos 2 buckets para 3001, 3101 e 8081; upload real com `Origin` 204 + `complete` 200; Playwright real 8 de 8. Resíduo: padrão de `REAL_DB_URL` do teste 04 ainda é `webag_qa35e` |

**Abertos hoje: 1 (BUG-019, Média). Críticos: 0. Altos: 0.**

## 5. Novos fluxos (reteste explícito, API real)

| Fluxo | Resultado |
|---|---|
| **WB-259 estorno** (`Order.refund`) | 11/11: nulo sem estorno e com pedido pago em andamento; cancelamento por PIX = valor total, `pix`, `completed`, texto "até 1 dia útil"; bate com o ledger; parcial de R$ 2,50 = 250, não o total; parcial + cancelamento soma; cartão pela página segura = `card` e "até 2 faturas"; cartão recusado 422 `PAYMENT_DECLINED`; 3DS devolve `threeDsUrl` e não paga antes; outra conta 404 |
| **WB-261 ETA_CHANGED** (tolerância de 5 min) | 11/11: igual ou melhor ou app antigo cria (201); visto 3 e 4 min antes do fim atual: 201; 7, 8 e 20 min antes: 409 `ETA_CHANGED` com `eta {fromAt,toAt}` e nenhum pedido nem pagamento criado; reenviar com o `toAt` novo cria; inválido 400; a faixa anda em passos de minutos |
| **WB-262 deliveredAt** | 12/12: sem a hora vale a do clique; recuo de 4 min sem motivo; acima de 5 min exige motivo (400) e "outro" exige nota; histórico com `clickedAt`, `deliveredAt`, motivo e recuo; futuro, antes da saída e mais de 60 min: 422 com o código certo e nada muda; compensação usa a hora real (12 min depois do fim: 0 cupom; 17 min: 1; 30 min: 1; hora informada dentro do prazo: 0); sem correção depois de entregue (409) |
| **Coleta atrasada 1 dia útil** | 9/9: parâmetro 1 (faixa 1 a 5); troca com coleta em casa cria a corrida; fica "Atrasada"; a varredura avisa UMA vez com prazo de 1 dia útil (quinta: sexta, +24 h; não 3 dias), 1 alerta; **relógio do item pausado** (item vencido sem motoboy não expira a troca); ao atribuir o motoboy o prazo ganha o atraso (`item_clock_paused`); coleta que não atrasou não mexe. Fim de semana e feriado: `NÃO TESTADO` pela API real (hoje é quinta) |
| **SEC-180** (ataque de 21 requisições, em tempo real, 61 s entre rodadas) | 9/9: 11 senhas erradas de 11 IPs + 5 rodadas de via A e "esqueci a senha" de 1 IP: 401 nas erradas, 200/202 nas rodadas, **nenhum e-mail ao dono**; o dono de IP novo com a senha certa recebe **403 `LOGIN_CODE_REQUIRED` COM o código** (antes era 429 e a exclusão ficava sem volta); repetir a senha certa não emite outro código; código errado 400, certo 204 uma só vez; a conta reabre; alerta à operação sem e-mail no conteúdo |
| **Cupom com `maxUses` obrigatório** | 14/14: percentual, fixo e frete grátis sem teto ou com 0: 400; PATCH `maxUses: null`: 400; com teto: 201; detalhe com `maxCost` e `usesByStore`; primeira compra com teto 201; lista sem cupom ativo sem teto |
| **CSVs financeiros e limite 10.000** | 10/10: Receita (15 colunas) e Estornos (10 colunas), valores em reais com vírgula; bruto, comissão, taxa de entrega, `application_fee` e total batem com o banco; pedido cancelado mostra estorno = total; soma da `application_fee` bate; exportação auditada; **10.001 linhas = 422 `EXPORT_TOO_LARGE` (rows 10001, maxRows 10000), 10.000 exporta**; dono 403, sem login 401, intervalo invertido 400; **motivo "=HYPERLINK(...)" sai escapado** (SEC-156). A 1ª passagem do script caiu num `fetch failed` do cliente de teste (socket ocioso); o `lib.mjs` agora repete 1 vez o GET e a seção passou 10/10 |
| **Exclusão de conta pelo site (vias A e B)** | API 12/12 + **pela página real 6/6** (`excluir-conta-web.mjs`, painel em build de produção): `/v1/help` traz 72 h, 5 anos, 6 meses, 15 dias; via A: e-mail, código lido no Mailpit, revisão, confirmação (`deleted`, efetivação em 72,00 h, sem cookie nem sessão), ticket de uso único (410), "Mudou de ideia?" com a senha reabre; via B: senha certa dá o ticket, errada 401 igual; e-mail inexistente = mesma resposta; dono de loja com pedido aberto: revisão aponta o bloqueio |
| **Privacidade V.6** | 5/5 + 1 `NÃO TESTADO`: cupom pessoal não usado e linhas de `push_campaign_recipients` são apagados na anonimização (antes 1, depois 0); SEC-162 (120 dias): só por e2e com relógio injetado |

## 6. Regressão de ponta a ponta com o provedor fake (`regressao-negocio.mjs`: 51 PASS, 0 falha, 1 NÃO TESTADO)

| Etapa | Resultado |
|---|---|
| Cadastro da loja (como o lojista pelo painel) | conta, e-mail confirmado, papel de lojista; loja de CPF (CPF inválido 400); perfil e CEP; 3 documentos pelo POST assinado (204); conta de recebimento (OAuth simulado, titular confere); envio para análise; antes da aprovação a loja não aparece na busca e o catálogo responde 409 |
| Aprovação | admin aprova (409 se repetir); e-mail de aprovação chega |
| Produto | rascunho, 2 variações (M e G, estoque 30), foto (variantes WebP sem EXIF), publicação; horário, entrega pela Webag e retirada configurados; a loja aparece na busca por proximidade e o cliente vê o produto. **Observação:** sem horário a loja aprovada fica fechada (`STORE_CLOSED`); o checklist do painel já traz "Definir horário" |
| Compra por retirada (PIX) | pedido, reserva de estoque (30/0 para 30/2), PIX simulado, aceite, separação, pronto, código errado 422, código certo conclui, baixa (28/0). **Limite da loja nova (BUG-009) confere** |
| Compra por entrega (PIX e cartão) | 2 pedidos PIX e 1 de cartão simulado pela página segura; faixa e taxa da tabela do admin |
| Logística | corridas nascem na fila (a loja não consegue marcar "saiu": 400); **lote** de 2 corridas ao mesmo motoboy; **WhatsApp** com link `wa.me`, mensagem só com loja, endereços, 1º nome e telefone, volumes e observação, **sem e-mail, CPF, valores nem código de entrega**; "WhatsApp enviado" registrado; entrega com o código (errado 422, certo 200); pedido `delivered` |
| Avaliação | loja (201), produto com "como vestiu" (201), repetir 409, outra conta 404; resumo do lojista com média, distribuição e sem resposta |
| **Troca dos 3 tipos** | arrependimento (na loja, código do balcão): aprovado na hora, concluído, reembolso do item e do frete (5.600 de 5.600); defeito (com foto, coleta em casa): vai à loja, aceito, taxa 0; tamanho/cor: nasce `requested`, a loja aprova em 1 toque e a variação G é reservada só ao aprovar (30/0 para 30/1) |
| Estorno | cancelamento pelo cliente (total, estoque devolvido) e parcial pelo admin (R$ 3,00, Idempotency-Key) |
| **Comissão no financeiro** | comissão de cada pedido = 15% do subtotal (centavo a centavo); resumo e extrato do lojista; **CSV da loja nova: 7 de 7 pedidos, comissão 6.000 = banco**; CSV de estornos; **ledger `commission_revenue` = 4.460 = comissão menos a parte devolvida em cada estorno (proporcional)**. `NÃO TESTADO`: split real do Mercado Pago |

## 7. Exploratório de segurança funcional de papéis (`papeis.mjs`: 11 PASS, 2 NÃO TESTADO; matriz de 143 verificações, 143 conforme)

Atores: 2 clientes, dono e funcionário (orders + catalog) da loja A, dono da loja B e os **4 perfis de admin** (super, operação, financeiro, suporte, criados por convite de verdade: e-mail, aceite, TOTP). A matriz confere a tabela de permissões (`permissions.ts`) e o RN-13 por HTTP:

| Eixo | Verificações | Resultado |
|---|---|---|
| Cliente x cliente (IDOR) | pedido, cancelar, "não recebi", opções de troca, avaliar, aprovar PIX pela rota dev, endereço (ler, alterar, apagar), mass assignment em `PATCH /me` | todas 404/400 |
| Cliente e sem login x loja e admin | listar pedidos, financeiro, aceitar, criar produto; parâmetros, logística, estorno, CSV | 401/403/404 |
| Funcionário x dono | com `orders` e `catalog`: lista pedidos e produtos e aceita pedido (200); financeiro, extrato, conta de recebimento, equipe, convite, política de trocas, trocas, avaliações, ranking: 403 | conforme RN-13 |
| Dono da loja B x loja A | pedidos, financeiro, produtos, aceitar, equipe, upload: 404; pedido de outra loja pela URL da própria: 404 | sem vazamento por ID |
| Lojista x admin | 7 rotas de leitura, aprovar a própria loja, alterar a própria comissão | 403 |
| 4 perfis de admin | 11 leituras e 12 escritas por perfil (parâmetros, admins, DSR, fila de estornos, CSV, relatórios, alertas, cupons, moderação, aprovar loja, estornar, atribuir motoboy, cobrir estorno só super, comissão, mediação, lote do motoboy só financeiro e super, contato, WhatsApp) | conforme a tabela, incluindo "autorização antes da validação" |
| Sessão | convite não vale duas vezes (410); sessão limitada do convite NÃO acessa o admin antes de confirmar o TOTP; JWT forjado (`alg none`) 401; refresh token como access 401; suporte vê na auditoria só as próprias ações (super vê as de todos); detalhe da corrida para o suporte sem telefone nem endereço (SEC-144) | OK |

Não executado: funcionário removido pelo dono perde o acesso na hora (só e2e `O2-EQP`). **Observação para o Security (PAP-2b):** depois de confirmar o TOTP o mesmo token do convite passa a acessar o admin (200); confirmar que é intencional ("confirmar o TOTP abre a sessão completa").

## 8. Carga (k6 v1.4.0 rodou; indicativo; ver `docs/qa/carga/README.md`)

| Cenário | Resultado (API compilada, sandbox compartilhado) |
|---|---|
| S1 navegação, 200 VUs, 9.051 requisições | 0% de falha; p95 da home 7 ms, busca 9 ms, loja 14 ms, produto 17 ms (metas 500 e 1.000 ms) |
| S4-B disputa, 40 clientes, estoque 12 | **3 vencedores, 37 conflitos, 0 erro 5xx, reservado 12/12** |
| S5 rajada de 3.001 webhooks assinados (50/s, 60 s; 15% inválidos, vencidos ou desconhecidos) | 0 erro 5xx, inválida e vencida 401, válida 200 duplicada; **ledger idêntico antes e depois**; p95 245 ms |
| S9 imagens (BUG-010) | 279 aceitas, 134 recusadas (PNG acima de 25 MP), 0 5xx; home p95 21 ms durante; **RSS ~950 a 975 MB** |

Scripts prontos e documentados: `s1`, `s4b`, `s5` (+ preparo), `s9` (+ gerador de imagens), `lib-setup`. Não escritos (precisam de staging, `seed-large` ou conta do MP): S2, S3, S4 sob rampa, S6, S7, S8, S10, S11, S12.

## 9. Achados e observações (não são bugs abertos)

### 9.1 Para decisão do PO (R6)
- **Tarifa do provedor em pedido cancelado:** no CSV de receita, pedido cancelado pelo cliente antes do aceite e estornado por inteiro aparece com `liquido_lojista` = **-0,30** (a tarifa do PIX fica com a loja). Confirmar que a loja deve arcar com a tarifa de um cancelamento que ela não causou; o ledger fecha com a regra atual.
- **Fechamento da logística x promessa:** pela RN-19 §2 (BUG-021), o fim da faixa precisa cair antes das 20 h. Resultado prático: a loja com faixa de 90 a 120 min deixa de ter entrega a partir das ~18 h (vimos às 18 h 55 BRT) e todas deixam de ter 1 h antes de fechar. A regra está implementada como `[HIPÓTESE]`; se o horário de operação for curto, "até 2 h" quase não será oferecido à noite.
- **Cache de 30 s na descoberta:** pausa, horário e parâmetros aparecem nos cartões em até ~30 s; a sacola e o servidor respeitam na hora. Aceitável se o PO concordar.

### 9.2 Processo
- **Branch andou depois do congelamento** (R1). Para o ponta do branch eu não afirmo nada.
- **Incidente meu (sem dano):** a primeira chamada do `onda-8.mjs` caiu na porta 3000, que era a API de outro agente (o meu `pnpm dev` ainda não tinha subido na 3000); o script fez 4 tentativas de login do `admin@webag.local` dela com um código TOTP que não era o dela e eu repeti 1 vez à mão: **5 `MFA_INVALID` no admin dessa instância**, que pode ter ficado travado por um tempo. Nenhum dado foi lido ou alterado. Dali em diante usei só as portas 3400 (API), 3101 (web) e 8091 (app), com o meu banco. Aviso a quem usa a API da 3000.
- O harness ganhou 1 repetição do GET em falha de transporte (`lib.mjs`); nenhum POST é repetido.

## 10. NÃO TESTADO (não aprovo)

Aparelho real (Android de entrada, iPhone): toque, GPS e permissão negada, câmera, teclado, push real, PIX/cartão/3DS no aparelho, 3G e modo avião no meio do PIX, tela pequena, fonte grande, acessibilidade, o app fechado com pedido em andamento; **Mercado Pago real** (PIX, cartão, 3DS, `application_fee`, webhook assinado real, estorno, tarifa); ViaCEP e geocodificador reais (CEP de visitante vai ao ViaCEP); WhatsApp real do motoboy (só o link); push e e-mail de produção; **k6 em staging**, soak, S2/S3/S6/S7/S8/S10/S11/S12; domingo, fim de semana e feriado pela API real (`logistica_dias`, dia útil); `cancelamento_loja_alerta_pct` e `coleta_agendamento_dias_uteis` pela API real (só e2e); chave por CPF do SEC-170; SEC-162 (120 dias); funcionário removido perde acesso (só e2e); ajuste do limite da loja nova pelo admin; fluxo "Mudou de ideia?" com código DENTRO DO APP (só Jest, `cancel-deletion.test.tsx`; a página web foi testada de verdade); **o ponta do branch depois do congelamento** (R1); revisão de segurança (é do Security); contas Apple e Google, política de privacidade pública, Data Safety, checklist das lojas (G5); Windows e macOS (só Linux).

## 11. Roteiro curto para o fundador (R3 e R4)

**Celular (R3), 15 minutos, no `0d902ab` ou no commit que o CEO escolher:** 1) `pnpm run setup` e `pnpm dev`, app no Expo Go com `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_WEB_URL` apontando para o IP do computador; 2) cadastrar cliente, confirmar o e-mail pelo Mailpit (`http://<IP>:8025`), endereço com GPS ligado e depois negado; 3) pedido de retirada no Mercadinho Boa Compra, "simular pagamento" (só em desenvolvimento), aceitar pelo painel; 4) pedido de entrega com a internet fraca (modo avião no meio do PIX, religar, fechar e abrir o app com o pedido em andamento): não pode duplicar nem perder o estado; 5) tela pequena e fonte grande: Home, Loja, Sacola e Checkout sem corte; 6) anotar aparelho, versão e print de qualquer erro. **Mercado Pago (R4):** credenciais de teste no `.env`, `PAYMENT_PROVIDER=mercadopago` com `APP_ENV=staging`, 1 PIX e 1 cartão (inclusive 3DS) até a conta do vendedor, 1 estorno total e 1 parcial, e conferir no painel do MP a comissão (`application_fee`) e a tarifa; me passe o resultado e eu fecho o R4.

## 12. Arquivos

Relatório: este. Scripts: `docs/qa/retestes/{lib,onda-7,onda-8,regressao-negocio,papeis,excluir-conta-web,app-web}.mjs`. Saídas: `docs/qa/retestes/resultados/g4-{suites,onda-7-saida,onda-8-saida,regressao-negocio-saida,papeis-saida,excluir-conta-web-saida,app-web-saida}.txt` e `app-web-*.png`. Carga: `docs/qa/carga/` (README, 4 cenários k6, `resultados/g4-*.txt`). Bugs: `docs/qa/bugs/BUG-009, 010, 019 a 025`. Como rodar do zero: `pnpm run setup`; API compilada com `API_PORT=3400 TRUST_PROXY=1 node --env-file=../../.env dist/main.js` em `apps/api`; `API_URL=http://localhost:3400 QA_TOTP_FILE=<arquivo com o segredo do admin impresso pelo pnpm smoke> node docs/qa/retestes/onda-8.mjs <seção...>` (seções: `bug020 bugs imagens wb259 wb261 wb262 coleta sec180 cupom csv exclusao v6`); o TOTP do admin é um só: não rodar dois scripts de admin ao mesmo tempo.
