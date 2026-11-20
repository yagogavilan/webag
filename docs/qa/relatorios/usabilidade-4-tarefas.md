# Teste de usabilidade "de mesa" — 4 tarefas do brief §8

Autor: product-designer | Data: 2026-11-19 | Branch `claude/admiring-lamport-62tq1a` | Roteiros e metas: `docs/qa/roteiros-usabilidade.md` e `docs/design/fluxos.md` §2.
Método: **percurso cognitivo cronometrado por contagem**, sobre o que o código realmente faz (`apps/mobile/app`, `apps/mobile/src/i18n/pt-BR.ts`, `apps/web/src/features`). Não há usuário, aparelho nem render novo. Todo número abaixo é `[HIPÓTESE]` até o teste com 5 pessoas do perfil (recomendação do roteiro §1, mantida).
Como contei: **toque/clique** = botão, link, caixa, item de lista, aba (rolar e digitar não contam; campo conta à parte). **Tela** = rota distinta visitada (volta à mesma rota conta de novo; diálogo e folha à parte). **Palavras** = texto de interface na tela de decisão (título, rótulo, botão, ajuda, aviso; sem nome de loja/produto, preço, número, endereço), lido do catálogo `pt-BR.ts`/JSX com margem de ±10%; onde existe captura, conferido nela. **Tempo** = modelo de `fluxos.md` §2 (toque ~1,2 s com leitura; campo 3 a 8 s; banco 25 s fora do Webag).

## 1. Resultado em uma tabela

| Tarefa | Telas (meta) | Toques (meta) | Campos | Palavras na maior tela de decisão (meta) | Tempo no app (meta) | Cumpre hoje? | Veredito para a v1.0 |
|---|---|---|---|---|---|---|---|
| T1 Comprar (cliente novo, camiseta, PIX) | **11 visitas / 9 distintas** (7) | **17** (13) | 7 (6) | PIX ~39, Checkout ~30 a 41, Criar conta ~48 (25) | **~124 s** (93 s); ~149 s com o banco (meta 120 s) | **Não: bloqueada em H-01** | **Não aceitável hoje. Aceitável com U8.1 a U8.3**, com desvio aceito pelo PO e pelo designer nos toques e no tempo |
| T1b Comprar (recorrente) | 6 (6) | 10 (10) | 0 | ~30 | ~50 s (45 s) | Só depois de U8.1 | Aceitável depois de U8.1 |
| T2 Cadastrar loja (lojista) | 8 + MP externo (conta + 4 etapas + revisão = 7) | **20** (≤20; 3 deles são no site do MP) | 13 + 3 docs (≤13 + 3 ou 4) | Etapa 4 ~45, Etapa 3 ~49, Conta ~58 (≤40) | 8 a 10 min (≤10 min) | No limite | **Aceitável com U8.8**; risco real é a conta Mercado Pago, não a tela |
| T3 Aprovar loja (admin) | 2 + diálogo (1 caso) | **5** (≤10); da 2ª loja em diante **3** | 0 | Caso ~80 (n/a: tela de trabalho) | 15 a 20 s se carimbar, 60 a 100 s se conferir de verdade (≤90 s) | **Sim** | **Aceitável.** A previsão do QA (11) vale só marcando item a item |
| T4 Pedir troca (cliente) | 4 (5) | **6** (≤11) | 0 (+ nota opcional) | **~110** (≤25) | ~45 s (≤90 s) | **Sim**, com ressalva de leitura | **Aceitável com U8.4** (item em pedido com 2+ itens) |

## 2. T1 — Comprar um produto

Cenário: "Preciso de uma camiseta para amanhã. Compro de uma loja que entrega no meu endereço, pagando com PIX." Cliente novo, Android de entrada, escolhe a cidade ou usa o GPS (a localização aproximada não traz rua nem número).

| # | Tela (rota) | Toques | Campos | Palavras | O que o código faz (fonte) |
|---|---|---|---|---|---|
| 1 | Onde receber (`/location`) | 2 (GPS + permissão do SO) ou 3 (cidade, cidade, bairro) | 0 | 20 | Porta obrigatória: `(customer)/_layout.tsx:11` redireciona sem endereço. Sem login, sem rua |
| 2 | Início (`/`) | 1 | 0 | ~16 | `real-app-inicio.png`: 1ª loja fica abaixo da 1ª tela (H-02) |
| 3 | Loja (`/store/[id]`) | 1 | 0 | n/c (sem captura) | Toque no produto |
| 4 | Produto (`/product/[id]`) | 3 (tamanho, cor, Adicionar) | 0 | ~17 | "Adicionar" sempre ativo: sem escolha, rola, balança e diz "Escolha o tamanho" (`product/[id].tsx:143-149`) |
| 5 | Sacola (`/cart`) | 2 ("Ver sacola" no aviso, "Ir para o pagamento") | 0 | ~20 visíveis, ~32 com o resumo | Visitante: `onSubmit` manda para criar conta (`cart.tsx:148`) |
| 6 | Criar conta (`/signup`) | 2 (caixa de aceite, Criar conta) | 5 (nome, e-mail, celular, senha, confirmar) | ~48 | Volta para `/cart` (`returnTo`), não para o checkout (H-07) |
| 7 | Sacola (2ª vez) | 1 | 0 | ~20 | Mesmo botão outra vez |
| 8 | Checkout (`/checkout`) | 1 ("Completar endereço") | 0 | ~41 | Endereço aproximado: "Falta a rua e o número para calcular a entrega." |
| 9 | Endereço (`/address/form`) | 1 (usar este endereço) | 2 (CEP, número) | ~35 | Formulário completo |
| 10 | Checkout (2ª vez) | 2 (PIX, "Pagar com PIX · R$") | 0 | ~30 | Nenhum meio vem marcado (DEC-035/052): quem toca em pagar sem escolher recebe "Escolha PIX ou cartão para continuar." |
| 11 | PIX (`/pay/[orderId]`) | 1 (Copiar código) | 0 | ~39 | Contador, QR e código; tela muda sozinha para Confirmado |
| | **Total** | **17** | **7** | | Depois do **bloqueio H-01**: com o código atual o passo 5/7 termina num aviso, não no checkout |

Tempo `[HIPÓTESE]`: 10 + 8 + 6 + 12 + 8 + 42 + 4 + 25 + 6 + 3 = **~124 s** no app; +25 s do banco = **~149 s** (meta 120 s). Mesmo com as correções (sem a 2ª Sacola, endereço inline) fica em ~112 s no app e ~137 s com o banco: **só passa de 120 s total com "Entrar com Google/Apple"** (alavanca 1 de `fluxos.md` §2, que depende de contas do fundador e não existe no app: busca em `app/(auth)` vazia).

**Recorrente** (endereço completo salvo, sessão aberta): Início (loja 1) → Loja (produto 1) → Produto (3) → Sacola (2) → Checkout (PIX 1, pagar 1) → PIX (1) = **10 toques, 6 telas, 0 campos, ~50 s** (meta 10 / 6 / 0 / 45 s). Só funciona depois de U8.1.

Erros prováveis (o que o executor vai fazer errado):
1. Tocar "Ir para o pagamento" e não acontecer nada (H-01): desiste ou toca de novo; **abandono certo**.
2. Tocar "Adicionar" sem tamanho (tratado: rola e explica; erro recuperável).
3. Depois de criar a conta, cair na Sacola e tocar de novo (H-07): hesita ~3 s.
4. Pagar sem escolher o meio (mensagem clara, custo ~3 s).
5. Descobrir o endereço incompleto só no checkout (H-11).
6. Sair do app no PIX e voltar: tratado ("Sair do pagamento?" informa a validade).

Atritos, em ordem de custo: (a) **H-01** bloqueia a tarefa; (b) 1ª loja abaixo da dobra (H-02); (c) 2ª passada pela Sacola e endereço no fim: 4 toques e 2 telas que o fluxo desenhado não tinha; (d) 3 telas com 30 a 48 palavras (Criar conta, Checkout, PIX) contra a meta de 25; as de PIX e Checkout são aceitáveis porque o botão principal é óbvio e o resto é apoio.

Correções priorizadas: **U8.1** (H-01, sev 4) → **U8.2** (H-07: `returnTo` no checkout) → **U8.3** (H-02: 1ª loja na 1ª tela) → **U8.9** (H-11: endereço no checkout, sev 2). Alavanca fora do escopo v1.0: Google/Apple.

Veredito: **não aceitável hoje** (a tarefa não termina). **Aceitável para a v1.0 com U8.1, U8.2 e U8.3**, registrando o desvio: ~15 toques e ~2 min 15 s com o banco, acima da meta de 13 toques e 2 min; o PO e o designer aceitam o desvio até o teste com 5 pessoas (critério 1 de `roteiros-usabilidade.md` §7). Com o bloqueio aberto, **não há G4**.

## 3. T2 — Cadastrar uma loja (lojista, painel web, celular 390 px)

Cenário: "Vendo roupas e quero vender pelo Webag. Crio minha conta de vendedor e mando a loja para análise." Caminho CPF/MEI com 3 documentos; `Etapa 1 CPF` (CNPJ: 2 documentos, +2 toques, +1 campo).

| # | Tela (rota) | Toques | Campos | Palavras | Observação (fonte) |
|---|---|---|---|---|---|
| 1 | Conta (`/lojista/cadastro`) | 2 | 5 | ~58 | `signup-form.tsx`: 14 palavras de "como funciona" + formulário. Promete "Cadastro em 4 etapas" e são 7 telas |
| 2 | Código por e-mail | 0 (envia sozinho ao completar 6 dígitos) | 1 | ~20 `[est.]` | Obrigatório antes de seguir: sai para o app de e-mail (+~45 s) |
| 3 | Etapa 1 (`/lojista/onboarding/1`) | 1 | 1 | 18 (CNPJ: 35) | Máscara com dígito verificador |
| 4 | Etapa 2 | 3 | 5 (nome, categoria, WhatsApp, CEP, número) | ~40 | CEP preenche rua/bairro/cidade; cidade fora vira lista de espera |
| 5 | Etapa 3 (documentos) | 7 ("Tirar foto" + "Usar esta" x3, Continuar) | 0 | ~49 | `doc-slot.tsx`: câmera, prévia, recorte |
| 6 | Etapa 4 (receber) | 6 (Conectar, confirmar senha, 3 no site do MP, Continuar) | 1 (senha) | ~45 | Pede a senha de novo (SEC-109) e sai para o Mercado Pago |
| 7 | Revisão | 1 | 0 | ~35 | Bloqueia sem conta conectada |
| 8 | Sucesso | 0 | 0 | ~11 | "Respondemos em até 2 dias úteis." |
| | **Total** | **20** (17 no site do Webag) | **13 + 3 docs** | maior: Conta ~58 | Meta ≤20 / ≤13+3 / ≤40 palavras por passo |

Tempo `[HIPÓTESE]`: conta 60 s + código 45 s + Etapa 1 20 s + Etapa 2 75 s + documentos 3 min + Mercado Pago 100 s + revisão 20 s = **8 a 10 min** (meta ≤10). Estoura se o lojista não tem conta Mercado Pago pronta.

Erros prováveis: senha fraca; e-mail com erro de digitação (há sugestão de domínio); e-mail de quem já é cliente (há "Entrar e abrir minha loja"); CNPJ/CPF inválido; CEP não achado; foto escura ou arquivo grande; **tocar "Conectar depois" e ser barrado na Revisão (H-21)**; conta Mercado Pago "sem nível" (`PAYMENT_ACCOUNT_LEVEL_INSUFFICIENT`, tem mensagem).

Atritos: (1) "Conectar depois" promete o que a Revisão nega (**H-21, sev 3**); (2) a conta Mercado Pago é pré-requisito do **envio**, não só da publicação: o lojista pequeno sem MP é o gargalo real e a interface não resolve isso (decisão PO/backend, ver U8.8 opção B); (3) código por e-mail antes de qualquer coisa: sair do site no celular; o campo aceita colar e tem "Reenviar"; (4) "4 etapas" vs 7 telas: expectativa curta demais; trocar por "Leva cerca de 10 minutos" (já está no título) e tirar "Cadastro em 4 etapas"; (5) 3 telas acima de 40 palavras (Conta 58, Etapa 3 49, Etapa 4 45): Etapa 4 tem 3 frases de apoio que cabem em 1.

Correções priorizadas: **U8.8** (H-21, sev 3) → sev 2: cortar "Cadastro em 4 etapas" e fundir as 3 frases da Etapa 4.

Veredito: **aceitável para a v1.0 com U8.8**. Fora disso o fluxo está no orçamento, com rascunho salvo ("Salvo às 14:32", barra "Etapa X de 4"), erro por campo e retomada: é o melhor desenhado dos quatro.

## 4. T3 — Aprovar uma loja (admin, desktop 1366x768)

Cenário: "Há lojas novas esperando. Revise a mais antiga e decida."

| # | Tela | Cliques | Palavras | Observação (fonte) |
|---|---|---|---|---|
| 1 | Menu "Lojas" → Fila de aprovação | 1 | ~40 | `queue-page.tsx`: ordenada da mais antiga, selo de prazo, busca local |
| 2 | Abrir a loja (`/admin/lojas/[id]`) | 1 | ~80 (dados + checklist) | Documento ao lado dos dados (`caseGrid`); 6 itens do checklist |
| 3 | Revelar CPF para comparar com o documento (opcional) | 0 a 1 | | `Reveal`: dado mascarado por padrão |
| 4 | "Conferir tudo" | 1 | | Marca os 6 itens (`approval-case.tsx:110`) |
| 5 | "Aprovar loja" | 1 | | Habilita com 6 itens `ok` |
| 6 | Diálogo "Aprovar X?" → "Aprovar loja" | 1 | ~35 | Avisa: só aparece com 1 produto ativo e conta conectada |
| | **Total** | **5** (6 com o CPF; 11 se marcar item a item) | | Meta ≤10 cliques e ≤90 s |

Depois da decisão, `afterDecision` abre a próxima loja da fila ("Próxima loja da fila."): **da 2ª loja em diante são 3 cliques** (Conferir tudo, Aprovar, Confirmar). A previsão do QA (11 cliques, `roteiros-usabilidade.md` §4 R3) só vale marcando item a item; "Conferir tudo" já existe e a meta de 10 está cumprida com folga.

Tempo `[HIPÓTESE]`: 15 a 20 s se carimbar; 60 a 100 s lendo os documentos e comparando CPF, endereço e categoria. É a tarefa em que o tempo certo é o **maior**: o desenho não deve premiar pressa (H-34).

Erros prováveis: aprovar sem abrir documento ("Conferir tudo" não exige); marcar "Problema" sem escrever o motivo (bloqueia com "Escreva o que está errado em cada item com problema."); dois admins na mesma loja (diálogo "Esta loja já foi decidida", com "Ver decisão" e "Voltar à fila"); no celular, 3 abas (Documentos, Dados, Decisão) obrigam a trocar de aba para comparar (aceitável: o admin trabalha no desktop).

Atritos: (1) **H-34**: "Conferir tudo" transforma a checklist de KYC em carimbo; (2) a barra lateral tem ~22 itens e "Lojas" fica a 1 clique, bom, mas o grupo final aparece cortado (H-30); (3) busca sem placeholder (H-37).

Correções: sev 2 apenas (H-34, H-30, H-37). Nada de sev 3.

Veredito: **aceitável para a v1.0.** Cumpre a meta com folga e tem o que falta a muito painel: auditoria de acesso ao documento, conflito entre admins e próxima loja automática.

## 5. T4 — Pedir uma troca (cliente, app)

Cenário: "A camiseta que comprei ficou pequena. Peço para trocar por um tamanho maior e acompanho."

| # | Tela (rota) | Toques | Campos | Palavras | Observação (fonte) |
|---|---|---|---|---|---|
| 1 | Pedidos (aba) | 1 | 0 | ~25 | Pedido entregue fica em "Anteriores", abaixo dos ativos (rolar) |
| 2 | Pedido (`/order/[id]`) | 1 (abrir) + rolar até o botão | 0 | ~40 | "Pedir troca" é botão secundário **depois** do herói, avisos e linha do tempo (`order/[id].tsx:241-247`) |
| 3 | Pedir troca (`/exchange/new`): motivo "Tamanho errado" | 2 (Pedir troca, motivo) | 0 | ~110 na tela inteira | Tela única; prazo "até DD/MM" na própria opção |
| 4 | Novo tamanho (chip) | 1 | 0 | | Sem estoque aparece riscado e "Sem estoque" |
| 5 | Devolução: "Levar à loja" já marcado | 0 | 0 | | Coleta em casa mostra a taxa e "cobrada só se a loja aprovar" |
| 6 | Enviar ("Pedir troca") → sucesso | 1 | 0 (nota opcional) | ~15 | "Protocolo X. A loja responde até DD/MM HH:MM." + "Acompanhar troca" |
| | **Total** | **6** | **0** | maior: ~110 | Meta ≤11 toques / ≤25 palavras / ≤90 s |

Tempo `[HIPÓTESE]`: ~45 s (meta 90 s). **Defeito** (fotos): +1 toque por foto, "Receber outro igual" e permissão de câmera: ~12 toques, acima de 11, aceitável porque é o caminho raro.

Erros prováveis: (1) pedido com 2+ itens e a tela mostra só o primeiro (**H-05**) `[HIPÓTESE: confirmar o que a API devolve]`; (2) não achar o botão (fica depois da linha do tempo); (3) loja sem troca por tamanho: as opções aparecem cinza com o motivo ("Essa loja não faz troca por tamanho ou cor.") e "Defeito" e "Desistir" continuam; (4) fora do prazo: mensagem + WhatsApp; (5) escolher "Desistir da compra" achando que é troca: o botão muda para "Pedir reembolso" e o subtítulo diz "Reembolso total, com o frete", sem ambiguidade; (6) Defeito sem foto: "Adicione ao menos 1 foto."

Atritos: (1) 110 palavras numa tela, com o mesmo aviso "nada é cobrado agora" 4 vezes (H-06): o cliente lê a mesma frase em vez de decidir; (2) item único (H-05); (3) botão escondido atrás da linha do tempo em pedido entregue.

Correções priorizadas: **U8.4** (H-05, sev 3 `[HIPÓTESE]`) → sev 2: H-06 (cortar repetição) e, para pedido entregue, mostrar as ações antes da linha do tempo.

Veredito: **aceitável para a v1.0 com U8.4.** É a melhor tarefa em toques e tempo; o desenho em uma tela (em vez dos 4 passos do `fluxos.md` §6) cortou 5 toques e 1 tela.

## 6. Render que o CEO precisa rodar (lista exata)

Sem Bash, não vi nenhuma destas telas. Capturar **viewport** (sem `fullPage`, que desloca a barra fixa e esconde o problema de rolagem), PNG 2x, e salvar em `docs/qa/relatorios/ux-v1/<id>.png`. App: Metro web (`pnpm web`, `http://localhost:8081`) contra a API local com seed (`pnpm dev`); cliente de demonstração e senha do seed estão em `apps/mobile/scripts/web-smoke.cjs`; lojista e admin em `apps/web/e2e-real/helpers.ts`. Viewport 390x844; painéis também em 1366x768.

| ID | URL / passo | Estado | Prova |
|---|---|---|---|
| R1 | `/location` | Primeira abertura (limpar armazenamento) | T1 passo 1 |
| R2 | `/` depois de escolher a cidade | 1ª tela e rolado até a 1ª loja | H-02 |
| R3 | `/store/<loja de moda do seed>` | 1ª tela e rolado | T1 passo 3 |
| R4 | `/product/<camiseta com cor e tamanho>` | Sem seleção; com "Adicionar" sem tamanho (erro); com seleção completa | T1 passo 4 |
| R5 | `/cart` logado, **tocar em "Ir para o pagamento"** | Captura logo após o toque (esperado: aviso "O pagamento fica disponível na próxima etapa do app.") | **H-01, a prova do sev 4** |
| R6 | `/signup?returnTo=/cart&context=checkout` | Vazio, com erros (tocar em "Criar conta") e preenchido | T1 passo 6 |
| R7 | `/checkout` (por URL, com sessão) | (a) endereço aproximado, (b) pronto sem meio escolhido + toque em pagar, (c) pronto com PIX | H-11, T1 passo 8-10 |
| R8 | `/pay/<pedido novo>` | Sem rolar e rolado | T1 passo 11 |
| R9 | `/confirmed/<pedido>` e `/orders` (aba) | Pedido ativo e entregue | H-03, H-08 |
| R10 | `/order/<pedido entregue com 1 item>` e `/order/<pedido entregue com 2 itens>` | Sem rolar e rolado até "Pedir troca" | T4, H-05 |
| R11 | `/exchange/new?orderId=<id>` | Inicial; "Tamanho errado" com tamanho; "Defeito" com fotos; sucesso; e o de 2 itens | T4, H-05, H-06 |
| R12 | `/lojista/cadastro`, `/lojista/onboarding/1`, `/2`, `/3`, `/4` (com e sem conta conectada), `/revisao` (com "Falta:") e sucesso | 390x844 e 1366x768 | T2, H-21 |
| R13 | `/lojista/pedidos` com 1 pedido novo | **390x844 viewport** e 1366x768, com o alerta de som visível | H-20, H-22 |
| R14 | `/admin/lojas` com 3 lojas na fila | 1366x768 e 390x844 | T3 passo 1 |
| R15 | `/admin/lojas/<id>` | Desktop: inicial, depois de "Conferir tudo", diálogo "Aprovar", diálogo "Pedir correção"; celular: as 3 abas | T3, H-34 |

Se a rodada for curta, a ordem de valor é **R5, R13, R2, R10/R11, R12, R15**.

## 7. Correções priorizadas (entram na Onda 8 UX de `docs/gestao/fila-mobile.md`)

| Prio | ID | Sev | Tarefa | Resumo | Esforço |
|---|---|---|---|---|---|
| 1 | U8.1 | 4 | T1 | Sacola abre o checkout (H-01) | P (1 linha + testes) |
| 2 | U8.2 | 3 | T1 | Criar conta vinda da Sacola volta ao checkout (H-07) | P |
| 3 | U8.3 | 3 | T1 | 1ª loja na 1ª tela do Início (H-02) | M |
| 4 | U8.8 | 3 | T2 | "Conectar depois" honesto (H-21) | P (A) / M (B) |
| 5 | U8.7 | 3 | lojista | Som e "Aceitar" acima da dobra no celular (H-20) | M |
| 6 | U8.4 | 3 | T4 | Escolher o item na troca (H-05) | M |
| 7 | U8.5 | 3 | T1b/pós-compra | Pedidos mostra item e faixa de chegada (H-03) | P (item) + backend (faixa) |
| 8 | U8.6 | 3 | pós-compra | Herói reflete o cancelamento aceito (H-04) | P |
| 9 | U8.9 | 2 | T1 | Endereço completo dentro do checkout (H-11) | M |
