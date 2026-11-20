# Relatório de QA: reverificação da Onda 7 (correções das Ondas 6 e 7)

Data: 2026-11-19 | Autor: qa-engineer | Branch: `claude/admiring-lamport-62tq1a` | Código testado: `98764b2` (1ª rodada das suítes) e `b550088` (HEAD, rodada final; o código da API é o de `0378693`) | Anterior: `onda-2.md`, `onda-3-5.md`, `setup-do-zero.md`
Não é o parecer final de G4: é o **parecer preliminar** pedido pelo CEO. Marcação `NÃO TESTADO` = não executei; não aprovo o que não executei.

## 1. Parecer preliminar de G4

**REPROVADO (preliminar), por falta de evidência, não por defeito Crítico ou Alto.** Nenhum bug Crítico ou Alto está aberto: o BUG-011 (Alta) está **fechado com evidência** e os BUG-012 a 018 também. Mas o G4 pede "regressão ok" e "QA e Security aprovam", e hoje não consigo dar essa evidência. Para virar **APROVADO COM RESSALVAS** faltam exatamente estes itens (dono entre parênteses):

| # | O que falta | Por quê | Dono |
|---|---|---|---|
| G4-1 | CI da API verde e estável: corrigir **BUG-024** (2 arquivos e2e, 14 testes, quebram no `beforeAll` desde o SEC-169, determinístico) e **BUG-019** (5 falhas intermitentes diferentes em 2 execuções completas do mesmo commit); 3 execuções completas seguidas sem falha | O backend avisou que o e2e completo não foi reexecutado depois da última correção: **confirmado, está vermelho** (§3). Suíte que falha ao acaso não serve de regressão | backend-dev |
| G4-2 | **BUG-020** (RN-07: "não recebi" não impede a auto-conclusão de 24 h): corrigir, ou o PO registrar o risco aceito com dono | Reproduzido (teste de reprodução falha); risco de CDC; correção pequena | backend-dev, PO |
| G4-3 | **BUG-021** (entrega oferecida com a faixa terminando depois do fechamento) e **BUG-022** (validações cruzadas da RN-02 ausentes): corrigir, ou o PO decidir que a regra mudou e ajustar a RN-19/RN-02 | Mesmo dano do BUG-016 na borda do expediente; admin consegue desligar a entrega da plataforma com um valor | backend-dev, PO |
| G4-4 | **Security reverifica** SEC-175 a 179, SEC-166 e a Onda 6 (o veto é dele) | Fora do meu escopo; as correções SEC-168/169/170 passaram no meu smoke funcional (§6), mas isso não é revisão de segurança | security-engineer |
| G4-5 | **Aparelho real** (Android de entrada e iPhone): roteiro do §10 | Nenhuma tela do app foi tocada num celular; GPS, câmera, teclado, push, PIX/cartão/3DS, desempenho em 3G e acessibilidade seguem `NÃO TESTADO` | fundador |
| G4-6 | **Mercado Pago real** (sandbox): PIX, cartão, 3DS, `application_fee`, webhook assinado, estorno | Nunca exercitado; tudo foi pelo provedor `fake` | fundador (credencial) |
| G4-7 | Corrigir o **BUG-025** (CORS do armazenamento local) e o padrão de `REAL_DB_URL` do `e2e-real`, para o Playwright real passar no ambiente padrão sem ajuste manual | Hoje passa 8 de 8 só com os meus ajustes (§3) | tech-lead, mobile-dev |
| G4-8 | Carga em staging com k6 e **BUG-010** (imagens em paralelo, não retestado) | O que fiz é indicativo (§8) | QA, tech-lead |

Ressalvas que eu aceitaria no APROVADO COM RESSALVAS (nenhuma bloqueia sozinha): BUG-023 (cupom de seed sem teto, Baixa), 2 chaves do BUG-017 só por teste automatizado, domingo e dias úteis `NÃO TESTADO`, carga só indicativa até o staging.

## 2. Ambiente e método

| Item | Valor |
|---|---|
| Máquina | sandbox Linux, 4 vCPU, 16 GB, **compartilhada** com sessões de outros agentes (carga média 2 a 7 durante as medições); Node 22.23, pnpm 10.28, Docker 29.10 |
| Subida do zero | clone novo da branch, `pnpm install --frozen-lockfile` (5,7 s, loja de pacotes quente) e `pnpm run setup` (**31 s**: PostgreSQL 18.6 + PostGIS 3.6, Redis 8, RustFS, Mailpit, 49 migrações (0000 a 0048), seed completo de 12 lojas, 6 clientes, 60 pedidos de demonstração). Portas 5432 e 6379 já estavam ocupadas na máquina: no checkout compartilhado o `setup` **recusou** com a instrução exata (comportamento documentado, porque já havia `.env`); no clone novo o `.env` novo escolheu 5433 e 6380 sozinho |
| API sob teste | `pnpm --filter @webag/api dev` na porta 3300 com `TRUST_PROXY=1` (como atrás do nginx/BFF; o limite de taxa é por IP e o gerador usa um IP de origem fictício por conta); provedor de pagamento `fake`, geocodificação `fake`, e-mail no Mailpit, armazenamento RustFS |
| Retestes | `docs/qa/retestes/onda-7.mjs` + `lib.mjs` (HTTP puro contra a API real; o relógio é recuado só pelo banco e a varredura é a do próprio servidor, 20 a 30 s). Saída completa: `docs/qa/retestes/resultados/onda-7-saida.txt` |
| Parâmetro de acomodação | `pix_hora_max=30` durante os retestes (o limite padrão é 5 PIX por hora por conta e os cenários precisam de mais); restaurado ao padrão no fim. Estoque do Mercadinho Boa Compra reposto a 500 no banco (os pedidos entregues consomem estoque) |
| Incidente (meu) | Uma execução do `pnpm smoke` foi apontada por engano para a porta 3010, que era a API do mobile-dev (banco `mobile_web`): criou 1 cliente `smoke.*` com 1 pedido de retirada aguardando pagamento e **configurou o TOTP do admin** dessa instância. Reverti o TOTP do admin (segredo, confirmação, 10 códigos de recuperação) no mesmo minuto; o cliente e o pedido de teste continuam lá (inofensivos). Daí em diante usei a porta 3300 |

## 3. Suítes completas (números e falhas)

| Suíte | Resultado | Observação |
|---|---|---|
| `pnpm generate:check` (OpenAPI e cliente `shared`) | **OK** (2,9 s), `git diff` vazio | em `98764b2` e em HEAD |
| `pnpm typecheck` | **OK**, 7 tarefas (36 s) | idem |
| `pnpm lint` | **OK**, 6 tarefas, 0 avisos (55 s) | idem |
| `pnpm build` | **OK**, 5 tarefas (80 s): API (nest build), web (next build), app (`expo export` iOS e Android), shared, tokens | em `c0dc9ac` |
| API unitários | `98764b2`: **288** em 37 arquivos; HEAD: **300** em 38 | todos OK |
| API e2e, banco e Redis reais, execução 1 (`98764b2`, 537 s) | 81 arquivos, **677 passaram, 4 falharam**, 1 ignorado (682) | falhas: `admin-contract-gaps` (auditoria, 409 ao criar cidade), `seed-onda3` (banners 2 em vez de 3), `fix-r3-dispute-fee` (2 testes, pedido ficou `awaiting_payment`). Cada um **passa isolado** (15 de 15). O `stores-settings` que o backend citou **passa** (corrigido em `d7364f1`) |
| API e2e, execução 2 (mesmo commit, 537 s) | **680 passaram, 1 falhou**, 1 ignorado | falha diferente: `orders` "6 clientes disputam as 3 últimas unidades" (um perdedor com 409 de outro `code`); passa isolado (6 de 6). O mesmo cenário por HTTP contra a API real deu sempre 3 vencedores e 3 `STOCK_CONFLICT`. => **BUG-019 reaberto** |
| API e2e em HEAD `b550088` (604 s) | 83 arquivos, **688 passaram**, 15 ignorados; a única falha é o teste de reprodução do BUG-020 que eu pus (esperado) | os 15 ignorados: 14 são os 2 arquivos que quebram no `beforeAll` desde o SEC-169 (`reports`: 6, `marketing-push`: 8), mais 1 ignorado de sempre. **BUG-024**, determinístico (falha também isolado) |
| Web (Vitest) | **535** em 68 arquivos, OK (62 s), em `98764b2` e em HEAD | |
| Web, Playwright com a API falsa | **38 de 38** (1,5 min) | só funcionou com `PW_CHANNEL=chrome`: sem isso os 38 falham com "Executable doesn't exist" (o Playwright instalado quer o Chromium 1255 e a máquina tem o 1243); ajuste de ambiente, o `playwright.config.ts` já documenta |
| Web, Playwright contra a API real (`e2e-real`, 8 testes) | **8 de 8 passam, mas só depois de dois ajustes de ambiente** (execução final: 5 + 3). Com o ambiente padrão: 1 passou e 5 falharam, 2 não rodaram | (1) **BUG-025**: o RustFS do `docker compose` não tem CORS e o upload de documento é um POST assinado direto ao bucket: sem CORS o cadastro de loja não conclui (confirmado pelo trace: `POST localhost:9000/webag-private` bloqueado). Apliquei CORS (GET, PUT, POST, HEAD) nos dois buckets do meu contêiner. (2) O teste 04 lê o banco por `REAL_DB_URL`, cujo padrão é `localhost:5432/webag_qa35e` (um banco antigo do QA, não o do `pnpm run setup`): rodei com `REAL_DB_URL` apontando para o meu; documentar no README do teste. (3) Uma execução intermediária falhou por limite de 20 cadastros por hora por IP (`register`) que eu mesmo consumi |
| App (Jest) | `98764b2`: **301 de 302** (falhou `home.test.tsx` "região sem loja", estouro do limite de 5 s sob carga; falhou de novo isolado com a máquina carregada); HEAD: **350 de 350** em 37 suítes | teste sensível a carga (parte do BUG-019) |
| `packages/shared` | 3 de 3 | |
| `pnpm smoke` | **36 de 36** verificações, 2 s | cadastro e e-mail, logins, TOTP do admin, busca PostGIS, pedido de retirada e de entrega, funcionário sem acesso ao financeiro |
| Retestes HTTP contra a API real (§4 a §7) | **120 verificações PASS, 3 FALHA, 3 NÃO TESTADO** (contando a última execução de cada seção; as 3 falhas são os achados BUG-021, BUG-022 e BUG-023; os 3 NÃO TESTADO estão no §9) | `onda-7-saida.txt` traz duas passagens; onde uma seção aparece duas vezes (bug013, sec170, bug017, sec168, estoque) vale a segunda: a primeira acusou defeitos do meu script (estoque do seed esgotado, assertivas erradas) |

## 4. Bug a bug

| ID | Sev. original | Veredito | Evidência (seção do `onda-7.mjs`; detalhes em `docs/qa/bugs/BUG-0xx.md`) |
|---|---|---|---|
| BUG-011 | Alta | **FECHADO** | `bug011` 11/11: admin cancela pedido pago (200, `cancelled`, estorno total, restante 0); loja que tenta aceitar depois 409; **estorno total manual leva o pedido a `cancelled`** (o defeito original); estorno parcial mantém ativo; entregue 409; corrida aberta cancelada junto; estoque volta (50/2, 46/2 com o pedido, 50/2); sem motivo 400; cliente comum 403; exige reautenticação (403 `REAUTH_REQUIRED` observado) |
| BUG-012 | Média | **FECHADO** | `bug012` 5/5: cancelar a corrida pronta encerra o pedido (`cancelled`), estorno total, loja não volta para separação (409), repetir não estorna duas vezes, corrida atribuída também fecha o pedido |
| BUG-013 | Baixa | **FECHADO** | `bug013` 2/2: 3 criações simultâneas com chaves diferentes = 1 pedido (2 x 409 `CART_CHANGED`); mesma chave = 1 pedido |
| BUG-014 | Média | **FECHADO** | `bug014` 6/6: aviso único 24 h antes (`pickup_reminded_at`, não repete); pronto há 49 h cancelado pelo sistema com estorno total e estoque devolvido; retirado a tempo não é cancelado |
| BUG-015 | Média | **FECHADO** (rotas) | `bug015` 14/14: pedir cancelamento em separação (aceita, recusa, sem resposta em 10 min = alerta ao admin), "não recebi" (202, idempotente, 1 alerta, 404 alheio, 409 cedo). A parte "RN-07: não recebi impede a auto-conclusão" **falha**: **BUG-020** |
| BUG-016 | Média | **FECHADO** (escopo original) | `bug016` 12 de 12 executáveis: pausa geral e por cidade com motivo, `LOGISTICS_CLOSED` na sacola e no servidor, retirada segue, retomar 204 / 409, fora do horário com `opensAt` e "Entrega volta às HH:MM". **Domingo: NÃO TESTADO** (hoje é quinta; só `logistics-hours.e2e-spec`). Lacuna nova: **BUG-021** |
| BUG-017 | Média | **FECHADO** (2 chaves só por teste automatizado) | `bug017` 6/6 + 1 NÃO TESTADO: 3 chaves aposentadas somem do painel; `codigo_retirada_digitos`, `loja_aceite_lembrete_min`, `retirada_prazo_horas`, `troca_voluntaria_dias_padrao` alteram o comportamento de verdade. **NÃO TESTADOS pela API real:** `cancelamento_loja_alerta_pct` e `coleta_agendamento_dias_uteis` (cobertos por `bug017-parameters.e2e-spec` e `parameters-wired.spec`). Vizinho: **BUG-022** |
| BUG-018 | Média | **FECHADO** | `bug018` 3/3: "Mais vendidos" com 6 produtos de 6 lojas pelo seed; vazio fora da região |
| BUG-019 | Baixa | **REABERTO (sobe a Média)** | §3: 5 falhas intermitentes distintas em 2 execuções completas + 1 do app |
| BUG-010 | Média | **NÃO RETESTADO** | precisa de 40 MP simultâneos e carga; nenhuma evidência nova |
| BUG-020 | nova, Média | **ABERTO** | RN-07: "não recebi" não impede a auto-conclusão de 24 h; `docs/qa/retestes/repro/qa-notreceived-autoconclude.e2e-spec.ts` falha (pedido vira `delivered`). Pela API real não dá (histórico `delivery_events` é append-only, correto) |
| BUG-021 | nova, Média | **ABERTO** | RN-19 §2: com a logística fechando em 20 min, a entrega com faixa de 21 a 51 min é oferecida e o pedido é criado (201) |
| BUG-022 | nova, Média | **ABERTO** | RN-02: `entrega_max_min=40` e `entrega_faixa_min=60` salvam com 200; com 40 toda loja some do modo Entrega (aconteceu na minha rodada) |
| BUG-023 | nova, Baixa | **ABERTO** | cupom de seed BEMVINDO10 (primeira compra) sem `max_uses`, contra a regra do admin |
| BUG-024 | nova, Média | **ABERTO** | e2e `reports` e `marketing-push` quebram desde o SEC-169 (14 testes ignorados) |
| BUG-025 | nova, Média | **ABERTO** | o RustFS do `docker-compose.yml` não tem CORS: upload de foto/documento pelo navegador falha no ambiente padrão (ver `docs/qa/bugs/BUG-025.md`) |

## 5. DEC-054 e RN-19 contra a API real (seções `teto` e `atraso`)

Todos os cenários abaixo usam o relógio recuado pelo banco (`orders.eta_to_at`, `order_cancel_requests.requested_at`) e a varredura do próprio servidor.

| Cenário | Resultado |
|---|---|
| **Teto no FIM da faixa, 119 / 120 / 121 min** (endereços reais em Caieiras a 8,76 / 8,87 / 9,02 km da loja, com os parâmetros padrão; sem mexer em nenhum parâmetro) | **PASS** nos três. Fim 119: oferecida; pedido criado e faixa gravada `89 a 119`. Fim 120: oferecida; faixa gravada `90 a 120` (o limite é inclusivo, como a regra "fim da faixa <= 120"). Fim 121: `OUT_OF_RANGE`, sem faixa, e **o servidor recusa criar o pedido (422)**, não só a tela |
| Sem atraso: dentro da faixa | `delay.late=false`; `cancel-late` 409 `LATE_CANCEL_NOT_AVAILABLE` |
| Atraso de 5 min | `late=true`, aviso uma vez (`late_notified_at`); cancelar sem custo ainda 409 (tolerância de 15 min) |
| Tolerância: 14 min / 16 min depois do fim | 14: não libera; 16: libera, `cancelMode=immediate` antes da saída |
| **Cancelamento sem custo ANTES de sair** | toque duplo (2 chamadas simultâneas): 200 e 200, um só efeito; pedido `cancelled` (cliente, motivo "Atraso na entrega"); **estorno total incluindo a taxa de entrega** (pago 3.196 com frete de 600; estornado 3.196); com o pedido pronto para coleta a corrida também é cancelada |
| **Cancelamento DEPOIS de sair** | vira pedido à operação (`pending`, pedido segue `out_for_delivery`); a operação responde "chega em até 10 min" (200, pedido `refused`) e o cliente pode pedir de novo |
| **Aceite automático** | sem resposta em 10 min o sistema aceita (`approved` por `system`), a corrida vai a `not_delivered`; responder depois: 409 `NO_CANCEL_REQUEST`; a loja confirma a devolução e o pedido fica `cancelled` com estorno total |
| **Compensação** | quem cancelou por atraso: **0 cupons**. Entregue 20 min depois do fim: **1 cupom** `ATRASO...` de frete grátis, pessoal, 1 uso, 30 dias; outra conta recebe `COUPON_NOT_FOUND` (não revela que existe); não vale em retirada (422); no próximo pedido de entrega zera a taxa (desconto = 600) e o resgate fica registrado (1); entregue no prazo: 0; 14 min depois do fim: 0; 16 min depois: 1 (um só) |
| Horário da logística | ver BUG-016 e **BUG-021** (fim da faixa x fechamento) |
| Validação do teto no admin | **BUG-022** |

**Exchanges e logística (seção `troca`, 11/11 PASS):** pedido de outra conta 404; arrependimento nasce aprovado e a resolução é reembolso; o mesmo item não troca duas vezes (422 `EXCHANGE_ALREADY_OPEN`); entrega na loja com o código do balcão: concluída e reembolso total (3.196 de 3.196); coleta em casa: nasce a corrida `exchange_pickup`, percorre atribuir, a caminho, coletou, entregue à loja, a loja confirma e o reembolso é total; fora dos 7 dias: 422 `EXCHANGE_WINDOW_EXPIRED`; troca voluntária nasce `requested`; **aprovação automática** com a loja em silêncio (`autoApproved=true`, `decidedBy=system`); recusa da loja + contestação do cliente vai à fila de mediação do admin. A jornada completa pedido > pagamento > aceite > separação > pronto > motoboy > entrega > troca passou também pela API (36/36 do smoke e seções acima); pela **interface** do painel (Playwright real, 8 de 8 com o ambiente ajustado) a jornada aceitar > pronto > motoboy > troca também passou.

## 6. Smoke de segurança funcional do que mudou (não substitui a revisão do Security)

| Item | Resultado |
|---|---|
| **SEC-169 ponto x CEP** | 8/8 PASS: ponto a ~27 km do CEP recusado (422 `ADDRESS_PIN_FAR_FROM_CEP`); CEP de Francisco Morato com cidade "Franco da Rocha" 422 `ADDRESS_CEP_CITY_MISMATCH`; ponto a ~200 m aceito; sem ponto usa o do CEP; **editar** para um ponto longe também recusa; fronteira de 2.000 m: 1,9 km aceito e 2,1 km recusado; CEP de São Paulo 422 `REGION_NOT_SERVED`; CEP que não existe (00000-000) 422 `ADDRESS_CEP_NOT_FOUND` (commit `ceebc28`). O E.3 (teto no fim da faixa) fecha o ataque B6 (loja disponível com faixa de 102 a 132 min): TETO 119/120/121 acima. Limite: com `fake` o "centro do CEP" é o ponto determinístico do provedor; contra ViaCEP/Nominatim reais `NÃO TESTADO` (o commit `ceebc28` desliga o geocodificador real por padrão) |
| **SEC-170 e SEC-155 cupom de primeira compra** | 8/9 PASS: primeira compra com cupom de teste leva desconto; **outra conta no mesmo CEP + número (só o complemento muda) não leva**; 2 pedidos simultâneos não pagos no mesmo endereço: só 1 leva o desconto; quem já comprou não usa de novo; **e-mail não confirmado** `COUPON_EMAIL_UNVERIFIED`; o admin **recusa criar cupom de primeira compra sem `maxUses`** e **recusa remover o teto depois** (PATCH `maxUses: null`), e aceita com teto. A 9ª falha é o cupom de seed BEMVINDO10 sem teto (**BUG-023**, Baixa). Chave por documento do pagador (CPF): `NÃO TESTADO` (precisa do documento no pagamento) |
| **SEC-168 limite de tentativas na exclusão (arrependimento de 72 h)** | 6/6 PASS contra o código de HEAD (inclui a mudança do SEC-176): 10 senhas erradas de IPs diferentes (metade pela rota, metade pelo login) somam no contador da conta e a senha certa então recebe 403 `LOGIN_CODE_REQUIRED` (não reabre direto); código errado 400, conta continua fechada, **código certo 204, código de uso único**; 12 tentativas erradas de IPs diferentes: todas 401, **sem 429** (o SEC-176 trocou o 429 por e-mail, que deixava um terceiro trancar o dono, pelo step-up); o dono com a senha certa e o código reabre; **sem ataque, reabre direto**; e-mail não confirmado sob ataque: 401 genérico, nunca o código; mesmo IP: a 6ª tentativa é 429. Observação de UX: depois de reabrir sob ataque o login ainda pede um 2º código (aceitável, registrar na ajuda) |

## 7. Disputa de estoque e idempotência (indicador de concorrência)

6 clientes simultâneos disputando 12 unidades (4 cada), 3 rodadas, por HTTP: **3 vencedores e 3 `409 STOCK_CONFLICT` em todas**, reserva exatamente 12 de 12. Isto é o oposto do que sugere a falha intermitente do teste correspondente na suíte (BUG-019 f): o produto está correto.

## 8. Carga

Indicativa, no sandbox (limites no `docs/qa/carga/README.md`). **k6 não foi executado** (a execução do binário baixado foi negada; esboço em `docs/qa/carga/s1-navegacao.k6.js`); o gerador foi `docs/qa/carga/carga-curta.mjs` (Node). 100 VUs, ~280 req/s por 60 s em home, busca, loja e produto: **p95 de 63 a 198 ms, p99 de 99 a 338 ms, 0 respostas 5xx**, 1% de erros todos 429 do limitador por IP. Rajada sem pausa (20 VUs, 1.169 req/s): 89% 429, **nenhum 5xx**; RSS da API subiu 302 > 651 MB e não voltou (investigar no soak). Nada disto aprova desempenho de produção.

## 9. O que NÃO foi testado (não aprovo)

Aparelho real (tudo do app); GPS, câmera, teclado, push e acessibilidade; desempenho em 3G e experiência offline; Mercado Pago real (PIX, cartão, 3DS, webhook assinado, `application_fee`, estorno); ViaCEP e Nominatim reais; WhatsApp do motoboy; carga de produção, soak e rajada de webhooks; BUG-010; domingo e calendário de dias úteis; `cancelamento_loja_alerta_pct`; chave por CPF do SEC-170; Playwright real no ambiente padrão sem ajuste manual; exploratórios E5-1 a E5-4; revisão de segurança (é do Security); contas Apple e Google, política de privacidade e checklist das lojas (G5).

## 10. Roteiro curto para o fundador no celular (para G4-5)

1. Instalar o app (Expo Go ou build de teste) com `EXPO_PUBLIC_API_URL` apontando para o IP da sua máquina; rodar `pnpm run setup` e `pnpm dev`.
2. Cadastrar um cliente novo, confirmar o e-mail pelo Mailpit (`http://<IP>:8025`) e cadastrar o endereço com GPS ligado e depois negado.
3. Pedido de **retirada**: loja "Mercadinho Boa Compra", pagar com o botão "simular pagamento" (só em desenvolvimento) e, no computador, aceitar pelo painel da loja; conferir o push e o código de retirada.
4. Pedido de **entrega** num celular com internet fraca (modo avião no meio do PIX, depois religar; fechar e abrir o app com o pedido em andamento): o pedido não pode duplicar nem ficar sem estado.
5. Com `pnpm pagar`, atrasar o pedido de entrega (peça ao QA para recuar o relógio) e ver "Atrasado", "Cancelar sem custo" e o cupom de compensação.
6. Tela pequena e fonte grande do sistema: abrir Home, Loja, Sacola e Checkout e ver se algo corta ou sobrepõe.
7. Anotar aparelho, versão do Android/iOS e print de qualquer erro.

## 11. Arquivos

`docs/qa/retestes/lib.mjs`, `docs/qa/retestes/onda-7.mjs`, `docs/qa/retestes/resultados/onda-7-saida.txt`, `docs/qa/retestes/repro/qa-notreceived-autoconclude.e2e-spec.ts` (copiar para `apps/api/test/` para reproduzir o BUG-020), `docs/qa/carga/*`, `docs/qa/bugs/BUG-011..025.md`. Como rodar os retestes: `pnpm run setup`, API com `TRUST_PROXY=1`, `API_URL=http://localhost:<porta> QA_TOTP_FILE=<arquivo> node docs/qa/retestes/onda-7.mjs <seção...>` (seções: `bug011 bug012 bug013 bug014 bug015 bug016 bug017 bug018 teto atraso troca sec168 sec169 sec170 estoque limpeza`).
