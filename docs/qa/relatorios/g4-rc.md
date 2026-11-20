# Relatório de QA: reteste do candidato a release (RC) e parecer FINAL de G4

Data: 2026-11-20 | Autor: qa-engineer | Branch: `claude/admiring-lamport-62tq1a` | **Código testado: `f622bc9` (RC, DEC-077)**; `832cb37` (HEAD) só acrescenta documentos (`git diff f622bc9 832cb37 -- apps packages` vazio) | Anterior: `g4-final.md` (commit `0d902ab`; este reteste fecha a ressalva R1 dele: os 27+ commits sem teste) | Saídas: `docs/qa/retestes/resultados/rc-*.txt`, `docs/qa/carga/resultados/rc-*.txt`, capturas em `docs/qa/relatorios/rc-capturas/`
Marcação `NÃO TESTADO` = não executei; não aprovo o que não executei.

## 1. Parecer de G4 sobre o RC `f622bc9`

**APROVADO COM RESSALVAS. Não é aprovação de G5 (publicação).** Nenhum bug Crítico ou Alto aberto. Abertos: BUG-026 (Média, seed/smoke dependem do horário), BUG-027 e BUG-028 (Baixa). Tudo o que mudou desde `0d902ab` (B1 a B5, A-01, A-02, A-06, modo manutenção, DEC-072, "Avaliar", "Pedir troca", "Você recebe", banners, logística) foi exercitado contra Postgres, Redis, armazenamento e e-mail reais com o provedor `fake` e passou. Os dois bloqueantes do tech-lead (A-01 e A-02) estão corrigidos e verificados por mim (não só pelo teste do dev).

| # | Ressalva / condição | Dono | Bloqueia |
|---|---|---|---|
| R1 | **Aparelho real** (Android de entrada, iPhone): nada do app foi tocado num celular; só no navegador (react-native-web). Roteiro em §9 | fundador | G5 |
| R2 | **Mercado Pago real (sandbox)**: PIX, cartão, 3DS, `application_fee`/split, webhook assinado real, estorno e tarifa. Tudo foi `fake` | fundador (credencial) | G5 |
| R3 | **k6 em staging** e capacidade: o que rodei é indicativo (§7). A API chegou a **950 MB de RSS** com imagens grandes (S9); o contêiner precisa de pelo menos 1 GB | QA + tech-lead | G5 |
| R4 | **Security repete o veto dele sobre o RC** (SEC-166/176/180/181/182/184 no `f622bc9`). Meu smoke de papéis (§5) não é revisão de segurança. Observação ao Security: PAP-2b (o token do convite de admin passa a valer como sessão completa depois do TOTP) segue como em `g4-final.md` | security-engineer | G4 (parecer dele) |
| R5 | **BUG-026 (Média)**: `pnpm smoke` e a demonstração falham fora de 7 h a 20 h de Brasília (loja do seed fechada). Não é defeito de produção, mas é o comando que o fundador usa para saber se o ambiente está de pé | backend-dev | não (antes de entregar o ambiente ao fundador) |
| R6 | **Código depois do RC não testado** (parágrafo acima): V8.x, SEC-187, SEC-188, textos legais | CEO decide o commit do release; QA retesta | G4 do tip |
| R7 | **Decisões do PO** (§8): tarifa do provedor em pedido cancelado, fechamento da logística x promessa, faixa reancorada no pagamento, loja suspensa não volta ao desbloquear o lojista | PO | não |

**O branch já andou depois do RC.** Ao fechar este relatório, `origin/claude/admiring-lamport-62tq1a` tem 24 commits depois de `832cb37` e **77 arquivos em `apps/` e `packages/` diferentes** do que testei: correções visuais V8.1 a V8.7 (DEC-078: início sem lojas de enfeite, imagens com fallback, mensagens de erro, status único da loja, listas compactas no celular), subtítulos neutros de PIX e cartão no checkout (DEC-052), copy dos banners do seed (HIP-L12), SEC-187 (versões legais publicadas imutáveis), **SEC-188 (aprovar loja só depois de o admin abrir todos os documentos: muda o fluxo de aprovação que o `e2e-real` 02 exercita)**, textos legais completos e a nova página `/termos/trocas` (DEC-080/081, feature, não correção). **Nada disso foi testado por mim; este parecer vale só para `f622bc9`.** Se o CEO quiser que o tip seja o release, preciso de um mini-reteste (suítes, `e2e-real`, `web:compra` e as seções `rc.mjs banners` e `pedidos`, ~40 min) sobre o commit escolhido; o `e2e-real` 02 e os testes de banner do seed (`seed-onda3`, que já mudou em `f2f7e2d`) são os mais prováveis de reagir.

## 2. Ambiente e método

| Item | Valor |
|---|---|
| Máquina | sandbox Linux 4 vCPU, 16 GB, compartilhada; Node 22.23, pnpm 10.28, Docker 29.10 (o daemon estava parado; subi um próprio) |
| Isolamento | **clone novo** em pasta da sessão; volumes do Docker antigos apagados (`docker compose down -v`) para o "do zero" ser de verdade; API em `node dist/main.js` na 3400 (`TRUST_PROXY=1`, `NODE_ENV=development` só para a rota de pagamento simulado), web `next start` na 3101, Metro (app no navegador) na 8081; e2e da API com banco `webag_<pid>_test` e Redis lógico próprios. O checkout principal e as portas 3000/3001/8091 não foram usados |
| Dados | `pnpm run setup` (sem recursos de rede além do proxy): 57 migrações (0000 a 0056), 12 lojas, 12 funcionários, 6 clientes, 60 pedidos de demonstração |
| Como forcei o que o relógio não deixa | só por SQL no banco local (`store_hours`, `orders.eta_*`, `orders.delivered_at`); a varredura e as regras são as do servidor |
| Novos scripts | `docs/qa/retestes/rc.mjs` (9 seções, 104 verificações) e `admins.mjs` (convida os 3 perfis de admin de verdade: e-mail, aceite, TOTP). Ajustei `lib.mjs` (o reset de `logistica_horario` volta ao valor do seed, 24 h, e não ao padrão do código, 09:00-20:00) e `onda-8.mjs` (janela de BUG-021 não cruza a meia-noite) |

## 3. Do zero e suítes (números)

| Etapa | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | 21,6 s |
| **`pnpm run setup`** em clone novo | **OK, 33 s** (1ª vez com volumes velhos o seed avisou "já existe"; refeito com `down -v`). 5432 e 6379 ocupadas: escolheu 5433 e 6380 sozinho. 57 migrações, 60 pedidos de demonstração, 3 banners com arquivos no armazenamento |
| **`pnpm smoke`** | **1ª passagem FALHOU às 21 h 59 de Brasília** (`STORE_CLOSED`: BUG-026). Com as lojas abertas 24 h por SQL: **TUDO CERTO** (35 `ok` + o TOTP já configurado, 0 falha) |
| `generate:check` | OK (2,4 s), `git diff` vazio |
| `lint` | OK, 6 tarefas, 0 avisos (57 s) |
| `typecheck` | OK, 7 tarefas (29 s) |
| `build` | OK, 5 tarefas (73 s; 2 de 5 vieram do cache do turbo) |
| API unitários | **329 de 329**, 45 arquivos |
| **API e2e, 3 execuções completas seguidas, cache do vitest frio na 1ª** | **827 de 827 nas três** (106 arquivos, 0 falha, 0 ignorado; 648 s, 650 s, 601 s). **Nenhuma passou por reordenação do vitest: nenhuma teve falha para reordenar.** A 1ª execução, a frio, em clone novo, passou inteira (o `seed-onda3` "banners" do BUG-019 não reapareceu). Rodei scripts de reteste ao mesmo tempo nas execuções 1 e 2 e nada falhou por carga |
| Web Vitest | **651 de 651**, 79 arquivos (69 s) |
| Web Playwright, API falsa (`PW_CHANNEL=chrome`) | **58 passaram, 3 ignorados** (capturas de propósito), 2,2 min |
| Web Playwright, API real (`e2e-real`) | **9 passaram, 3 ignorados** (capturas), 1,8 min. A 1ª tentativa falhou 7 de 9 por `EADDRINUSE` na 3101 (o servidor do Playwright anterior ainda não tinha liberado a porta); repetida, passou 9 de 9 (BUG-028c). Precisei de `REAL_DB_URL` e do segredo TOTP do admin no arquivo do helper |
| App Jest | **429 de 429**, 45 suítes (56 s) |
| `packages/shared` | 3 de 3 |
| `pnpm web` (app no navegador) contra a API real | **5 de 5** (`app-web.mjs`): onde receber, home/categorias/banners 200, lojas do seed, loja com preço, nenhuma requisição bloqueada por CORS |
| **`web:compra`** (app no navegador, API real, PIX simulado e página de cartão do site) | **retirada-pix OK** (cadastro a partir da Sacola volta direto ao checkout), **entrega-pix OK**, **cartão OK**. Sacola abre o checkout: **B1 passou nos 3 caminhos**. A 1ª tentativa do cartão falhou porque a API devolvia a página segura em `localhost:3001` e o app estava configurado para `3101` (a origem do link é conferida, de propósito); com `WEB_PUBLIC_URL` igual, passou. Exige o Playwright global (BUG-028b) |

## 4. Bug a bug

| ID | Sev. | Estado | Evidência neste reteste |
|---|---|---|---|
| BUG-001 a 008 | M/A | FECHADOS | cobertos pelo e2e (827) e pela regressão de negócio (§6) |
| BUG-009 | M | FECHADO | `regressao-negocio.mjs`: o limite da loja nova confere na compra por retirada e no CSV (`rc-regressao-negocio.txt`). Não executado: ajuste do limite pelo admin e a virada por 20 pedidos (só e2e) |
| BUG-010 | M | FECHADO (indicativo) | 40 envios simultâneos: 30 válidos aceitos, 10 PNG acima do teto recusados (422), 0 5xx, home p95 198 ms durante, **RSS 372 para 590 MB**; k6 S9: 0 5xx, home p95 25 ms, **RSS até 950 MB** (ressalva R3) |
| BUG-011 a 018 | A/M/B | FECHADOS | `onda-7.mjs`: **123 PASS, 0 FALHA, 3 NÃO TESTADO** (domingo, `cancelamento_loja_alerta_pct`/`coleta_agendamento_dias_uteis`, auto-conclusão de 24 h só por e2e) |
| **BUG-019** | M | **FECHADO** | 3 execuções do e2e verdes a frio (acima). Detalhe em `bugs/BUG-019.md` |
| BUG-020 a 025 | M/B | FECHADOS | `onda-8.mjs`: 108 PASS, 1 NÃO TESTADO (SEC-162, 120 dias); a seção `bugs` quebrou no meio por um defeito do MEU script (janela de logística que cruza a meia-noite às 23 h 06 de Brasília); corrigi o script e repeti: **13 PASS, 1 NÃO TESTADO** (BUG-021c "fechamento 4 h depois"); **BUG-021d (borda de 1 e 2 min) também não rodou** neste horário (o script pulou em silêncio; agora avisa como NÃO TESTADO) e só é executável antes das 20 h de Brasília. BUG-021a/b (20 min antes do fechamento: entrega não oferecida, no servidor e no cartão) e BUG-022 (5 verificações) e BUG-023 passaram. BUG-025: CORS dos buckets e upload com `Origin` OK (resíduo Baixa dentro do BUG-028d) |
| **BUG-026** | **M** | **ABERTO (novo)** | `pnpm smoke` e demonstração falham fora do horário das lojas do seed. `bugs/BUG-026.md` |
| **BUG-027** | **B** | **ABERTO (novo)** | `limit` fora de 1 a 50 não dá 400 (ajusta). `bugs/BUG-027.md` |
| **BUG-028** | **B** | **ABERTO (novo)** | atritos de subir do zero: `test:e2e` ignora o `.env`, `web:compra` pede Playwright global, 2 Playwright seguidos disputam a 3101. `bugs/BUG-028.md` |

**Abertos hoje: 3 (Média 1, Baixa 2). Críticos: 0. Altos: 0.**

## 5. O que mudou desde `0d902ab` (API real, `rc.mjs`: 104 PASS, 0 FALHA)

| Item | Resultado |
|---|---|
| **B1 checkout** | `web:compra` nos 3 caminhos (acima) + Jest 429 de 429. Com manutenção ligada a Sacola e o Checkout mostram o aviso "Voltamos já" e a sacola fica salva (capturas) |
| **B2 e-mail + A-01 (10 verificações, API com 3 hosts DIFERENTES)** | pedido novo pago: o dono recebe 1 e-mail (dedupe), **link no host do LOJISTA** (`http://lojista.webag.test/lojista/pedidos/<id>`), sem e-mail, telefone, nome nem R$; desligar o e-mail para só o e-mail; **convite de funcionário usa o host do lojista e convite de admin o do admin**; A-08 (`lembrete >= timeout - 1` é 422; `timeout - 2` é 200) |
| **B3 alertas (25)** | 38 tipos lidos do código: cada perfil vê exatamente os seus (super 38, financeiro 27, operação 15, suporte 13; desconhecido só o super); contador bate com a lista nos 4 perfis; filtros `status`, `area` (7), `severity` (3), `kind`, combinados; inválidos e cursor adulterado = 400; paginação sem repetir; detalhe de tipo alheio = 404; resolver: sem nota 400, suporte 403, operação 200 (quem, quando, nota), repetir 409, auditado; **alertas REAIS do fluxo (30) sem dado pessoal**. Injetei 1 alerta por tipo por SQL (marcado e apagado) para poder provar o RBAC |
| **B4 usuários (16)** | **SEC-181**: 10 formas de e-mail parcial, 5 de celular parcial, `%` e `_` = lista vazia 200; e-mail inteiro (também em maiúsculas), celular completo, ID e nome (3+ letras) acham, mascarados; 2 letras = 400; busca auditada sem o termo; **limite de 60 por minuto por admin (429 na requisição 61)**; admin nunca aparece. RBAC: financeiro 403, suporte lê e não bloqueia, operação bloqueia. Bloqueio derruba a sessão na hora (401), login 403 `ACCOUNT_BLOCKED`, repetir 409. **SEC-182**: conta bloqueada pede a exclusão (senha), vira `deleted`, **ao desistir volta BLOQUEADA** (não fura o bloqueio). Lojista bloqueado: lojas suspensas e texto neutro; desbloquear NÃO reativa a loja (por desenho, `POST /stores/{id}/reactivate`, testado) |
| **B5 pedidos do admin (17)** | busca por trecho do número, e-mail EXATO, ID do pedido e do cliente (parcial não acha); filtros `status` (lista), `mode`, `paymentMethod`, `storeId`, `userId`, `city`, `from`, `to`; inválidos = 400; cursor 2+1 sem perder; máscara (nome "Beatriz F.", sem rua, número nem CEP); **SEC-184**: comissão, `applicationFee` e líquido `null` para operação e suporte, na lista e no detalhe; `allowedActions` por perfil; **operação e suporte: 403 ao cancelar e ao estornar**; financeiro estorna parcial, passa do teto acumulado = 403 `SUPER_ADMIN_REQUIRED`, super admin estorna; financeiro cancela (estoque devolvido, corrida cancelada, estorno = total, repetir idempotente), entregue = 409, a loja não aceita mais; busca auditada (`order.search`) e limitada a 60/min (A-07) |
| **Modo manutenção (5)** | só o super admin liga (operação e financeiro 403), exige motivo; ligado: pedido novo (retirada e entrega) e cartão = **503 `MAINTENANCE`**; leitura, sacola, lista de pedidos, painel e **pagar o pedido já criado** seguem; idempotente; desligar volta em até 15 s; auditado. **Avisos nas telas**: app (Sacola e Checkout), site e painel do lojista (capturas) |
| **A-02 (4)** | pedido de preparo pendente + loja marca pronto: o pedido de cancelamento vira `superseded`; depois do atraso "Pedir cancelamento" por atraso responde 200 (antes 500) e os dois convivem (`late:pending`, `preparation:superseded`); preparo recusado pela loja e depois atraso também funciona |
| **A-06 (5)** | o fim da promessa na criação fica a 0 s do `acceptedEtaToAt`; ao sair para a entrega a faixa informativa encurta e a promessa não muda; faixa informativa vencida com a promessa no futuro = NÃO atrasado e "cancelar sem custo" 409; só depois do fim da promessa fica atrasado |
| **"Avaliar" e "Pedir troca" (5)** | contados de `delivered_at` (não de `updated_at`): "Avaliar" some aos 30 dias + 1 h (servidor: 422 `REVIEW_WINDOW_CLOSED`; dentro 201; repetir 409); arrependimento aos 6 d 22 h aceito (201) e aos 7 d 2 h recusado (422 `EXCHANGE_WINDOW_EXPIRED`); defeito segue até 31 dias; aos 91 dias a ação "Pedir troca" some |
| **"Você recebe" (3)** | tarifa estimada do provedor vem dos parâmetros (0,99 PIX e 4,98 cartão; muda e volta), comissão efetiva 15%, funcionário não vê; tela: R$ 6,90 - comissão R$ 1,04 - tarifa R$ 0,34 = **R$ 5,52**, conta confere; ranking e extrato trazem `youReceive`, comissão e tarifa |
| **DEC-072 (10)** | comissão padrão 15 (pedido novo: 359 sobre 2.396); `troca_resposta_h` aceita 6 e 72 e recusa 5 e 73; **alcance mínimo de 3 km** recusa o valor que dá 2,6 km (422 com km na mensagem); parcelas: `installmentsMax = min(parcelas_max, total / parcela_min)`, `parcelas_max=2` e parcela mínima alta limitam, e o servidor recusa 2 parcelas (422 `INSTALLMENTS_NOT_ALLOWED`) |
| **Banners** | `GET /v1/banners`: 3 banners x 3 tamanhos, **9 arquivos existem** (200, `image/webp`, com bytes); aparecem na home do app |
| **Fora do horário da logística (3)** | janela fechada: entrega 422 `LOGISTICS_CLOSED`, retirada 201; cartão da busca (após o cache de 30 s) e Sacola dizem o porquê e quando volta; pausa geral recusa e retomar volta |
| Papéis (`papeis.mjs`) | 11 PASS, 2 NÃO TESTADO; matriz de **143 verificações, 143 conforme** (cliente x cliente, cliente x loja x admin, funcionário x dono, loja x loja, 4 perfis de admin) |
| Entrada hostil | 15 entradas estranhas (`%%%`, `' OR 1=1 --`, NUL, emoji, 101 caracteres, UUID nulo) em `users?q`, `orders?q` e `alerts?kind`: 0 erro 5xx, coringas tratados como texto |

Ajustes do MEU teste durante a rodada (não eram defeitos do produto): `limit` fora da faixa é ajustado e não recusado (virou o BUG-027 e verificação informativa); a busca de 60 por minuto contou as buscas anteriores da mesma seção (esperei a janela); pedido mínimo da retirada também é R$ 20; o estoque do produto do seed esgota com tantos pedidos de teste; `estorno_super_admin_cents` tem mínimo R$ 10.

## 6. Regressão de negócio ponta a ponta (`regressao-negocio.mjs`: 51 PASS, 0 FALHA, 1 NÃO TESTADO)

Mesmas etapas do `g4-final.md` §6, agora no RC: cadastro e aprovação da loja, produto com variação e foto, compra por retirada e por entrega (PIX e cartão simulado), logística (lote, WhatsApp só com o necessário), entrega com código, avaliação, os 3 tipos de troca, estorno total e parcial, comissão no ledger (15%, centavo a centavo), CSVs. Papéis: cliente, dono, funcionário, os 4 perfis de admin. Único `NÃO TESTADO`: split real do Mercado Pago (FIN-5).

## 7. Carga (k6 v1.4.0, indicativo; sandbox compartilhado, tudo na mesma máquina)

| Cenário | Resultado |
|---|---|
| S1 navegação, 200 VUs curto (8.980 verificações) | 0% de falha; p95 home 7 ms, busca 8 ms, loja 13 ms, produto 15 ms (metas 500 e 1.000 ms) |
| S4-B disputa, 40 clientes, estoque 12, 4 por pedido (3 execuções limpas) | **3 vencedores, 37 conflitos 409, 0 erro 5xx, reservado 12 de 12** em 3 de 3. A 1ª execução deu 2 vencedores porque pedidos de teste meus ainda seguravam 4 unidades (esperado) |
| S5 rajada de 3.000 webhooks assinados (50/s, 60 s; inválidos, vencidos, desconhecidos) | 0 erro 5xx, inválido e vencido 401, válido 200; **ledger idêntico antes e depois** (1.251 lançamentos, mesma soma); p95 7 ms |
| S9 imagens grandes + leitura | 0 erro 5xx, PNG gigante 422, home p95 25 ms durante; **RSS 950 MB** (R3) |

## 8. Achados para decisão (não são bugs abertos)

- **PO, tarifa do provedor em pedido cancelado** e **fechamento da logística x promessa** (de `g4-final.md` §9.1): sem mudança, seguem `[HIPÓTESE]`.
- **PO, faixa de chegada é reancorada no pagamento** (DEC-053): o cliente aceita "chega até 02:11" no checkout e, ao pagar o PIX, a faixa passa a ser "pagamento + minutos". A duração fica igual, o horário de relógio anda se o PIX demora. Confirmar que é isso que "promessa = faixa aceita" (A-06) quer dizer.
- **Ops/PO, desbloquear lojista não reativa a loja** (por desenho, ADR-014): o treinamento da operação precisa dizer isso, senão o lojista fica "desbloqueado e sem loja".
- **Seed x padrão do código**: o seed de desenvolvimento deixa a logística aberta 24 h (`00:00-23:59`, `seg_dom`); o padrão é `09:00-20:00`, `seg_sab`. "Restaurar padrão" no painel fecha a entrega à noite em desenvolvimento.
- **Screenshots** (`pnpm telas`): 70 capturas, 0 falha. A tela "Loja: detalhe e aprovação" (34) mostra "Não conseguimos carregar agora" no visualizador de documentos: o seed cria a loja "em análise" sem os arquivos dos documentos. Está igual na captura já versionada; o fluxo real (e2e-real 02) abre os documentos. Baixa, dentro do BUG-026 como ajuste do seed.
- O painel em `next start` (build de produção) sem `REALTIME_URL` responde 503 `REALTIME_UNAVAILABLE` no ticket de tempo real e cai no polling (configuração do meu ambiente; em desenvolvimento usa a API). Tempo real dos painéis em build de produção: NÃO TESTADO.

## 9. NÃO TESTADO (não aprovo)

Aparelho real (Android de entrada, iPhone): toque, GPS e permissão negada, câmera, teclado, push real, 3G e modo avião no meio do PIX, tela pequena, fonte grande, acessibilidade, app fechado com pedido em andamento; **Mercado Pago real** (PIX, cartão, 3DS, `application_fee`, webhook assinado real, estorno, tarifa, FIN-5); e-mail e push de produção (o e-mail B2 foi lido no Mailpit, não em caixa real); ViaCEP e geocodificador reais; WhatsApp real (só o link); **k6 em staging**, soak e S2/S3/S6/S7/S8/S10/S11/S12; domingo, fim de semana e feriado pela API real (BUG-016m); BUG-021c e 021d (fechamento 4 h depois e a borda de 1 e 2 min); `cancelamento_loja_alerta_pct` e `coleta_agendamento_dias_uteis` (BUG-017g); "não recebi" com auto-conclusão de 24 h (BUG-015o, só e2e); SEC-162 (120 dias); funcionário removido perde acesso (PAP-8, só e2e); tempo real dos painéis em build de produção; Windows e macOS; imagens Docker de produção; as telas dos painéis B3, B4 e B5 foram lidas com dados reais (e2e-real 06 e capturas) e exercitadas por API, não cliquei cada botão em navegador; Web Push, analytics (fora do v1.0, DEC-071/073); conta Apple e Google, política pública, Data Safety, checklist das lojas (G5); revisão de segurança (é do Security).

## 10. Roteiro curto para o fundador (R1 e R2)

**Celular, 15 minutos** (`pnpm run setup`, `pnpm dev`, app no Expo Go com `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_WEB_URL` no IP do computador): 1) cadastrar cliente, confirmar o e-mail no Mailpit (`http://<IP>:8025`), endereço com GPS ligado e depois negado; 2) pedido de entrega no Mercadinho Boa Compra: **da Sacola direto ao pagamento** (B1), "Simular pagamento", aceitar pelo painel do lojista no computador (confira o e-mail de pedido novo com o link abrindo o painel); 3) modo avião no meio do PIX, religar, fechar e abrir o app com o pedido em andamento: não pode duplicar nem perder o estado; 4) com o pedido entregue, abrir "Avaliar" e "Pedir troca"; 5) tela pequena e fonte grande em Início, Loja, Sacola e Checkout; 6) anotar aparelho, versão e print de qualquer erro. **Atenção:** rode entre 7 h e 20 h (BUG-026) ou peça para abrir as lojas 24 h. **Mercado Pago:** credenciais de teste no `.env`, `PAYMENT_PROVIDER=mercadopago` com `APP_ENV=staging`, 1 PIX e 1 cartão (com 3DS) até a conta do vendedor, 1 estorno total e 1 parcial, conferir `application_fee` e tarifa no painel do MP; me passe o resultado.

## 11. Arquivos

Relatório: este. Scripts novos: `docs/qa/retestes/rc.mjs`, `docs/qa/retestes/admins.mjs`; alterados: `lib.mjs`, `onda-8.mjs`. Saídas: `docs/qa/retestes/resultados/rc-*.txt` (`rc-suites.txt` resume as suítes), `docs/qa/carga/resultados/rc-{s1,s4b,s5,s9}.txt`. Bugs: `docs/qa/bugs/BUG-019` (fechado), `BUG-026` a `BUG-028` (novos). Capturas: `docs/qa/relatorios/rc-capturas/`. Como rodar: `pnpm run setup`; API compilada com `API_PORT=3400 TRUST_PROXY=1 node --env-file=../../.env dist/main.js` em `apps/api`; `API_URL=http://localhost:3400 QA_TOTP_FILE=<segredo do admin> QA_PROFILES_FILE=<arquivo> node docs/qa/retestes/rc.mjs [seção]` (seções: `dec072 b2 alertas usuarios pedidos manutencao a02 a06 janelas vocerecebe banners logistica`; `b2` exige a API com `ADMIN_WEB_URL`, `LOJISTA_WEB_URL` e `WEB_PUBLIC_URL` diferentes entre si). O TOTP do admin é um só: não rodar dois scripts de admin ao mesmo tempo.
