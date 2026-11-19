# Telas da Onda 7: faixa de entrega, atraso e fora da área (app do cliente)

> Autor: product-designer. Data: 2026-11-19. Histórias: WB-249 a WB-254 (`prd/cliente.md`, `prd/logistica.md`). Regras: RN-18, RN-19. Decisões: DEC-053, DEC-054, DEC-052 (pagamento sem destaque ao PIX), DEC-051/052 (direção v3).
> Protótipo: `docs/prototipo/app-cliente-v3.html?estado=<estado>` (lista na §6). Base visual: `direcao-v3.md`, `kit-marca-v3.md`. Telas já especificadas e não repetidas: checkout e PIX (`onda-4-transacao.md` S5), cancelamento comum (`onda-5-posvenda.md`), Logística do admin e preparo do lojista (`onda-4d-logistica-admin.md` e `onda-7-paineis-v3.md`).
> Prefixo de teste do app: `<tela>.<elemento>` (padrão do repositório, ex.: `order.eta`, já existente em `OrderHero.tsx`).

## 0. Decisões de UX desta onda (e onde divergem do PRD)

| # | Decisão | Por quê | Muda o quê |
|---|---|---|---|
| D1 | **O app não escreve "2 h" em lugar nenhum.** Sem endereço, o cartão não mostra prazo; a loja diz "Informe o endereço para ver o horário". Fora do alcance, o texto é "longe demais", sem número | DEC-054 proíbe "até 2 h" em material externo até medir 95% no piloto, e **as capturas das lojas de apps são telas do app**: qualquer "2 h" na interface vaza para a vitrine. A faixa real basta para decidir | `cliente.md` copy "Mensagem geral", "Cartão sem endereço", "Loja fora do alcance" e "Endereço sem lojas"; WB-250 C4; WB-249 C3 e C10. **PO confirma** |
| D2 | Faixa em **minutos** na descoberta ("35–65 min"); em **relógio** da loja em diante ("18:45 – 19:20"), em janelas de 5 min | RN-19 item 3. Minutos comparam lojas; relógio planeja a vida. Janela de 5 em 5 (já em `eta.ts`) evita a faixa "dançar" a cada minuto | Nada |
| D3 | Reabertura das entregas em **hora falada** ("9h", "9h30", "amanhã às 9h"); faixa de chegada em **relógio** | Reabertura é anúncio (ninguém precisa do minuto); faixa é compromisso com minuto. Formatos distintos evitam ler "9:00" como faixa | `cliente.md` "Entrega volta às 09:00" vira "Entregas voltam às 9h" |
| D4 | **Atraso mostra a hora em que nasce o direito de cancelar** ("Se passar de 19:35, você pode cancelar sem custo") já no 1º aviso | Tira a ansiedade de "até quando espero?" e evita contato com o suporte só para perguntar. Transparência pedida pelo CDC art. 6º III **[HIPÓTESE jurídica, J14]** | Acrescenta a frase ao aviso de WB-253 C1 |
| D5 | **"Continuar esperando" não tira o direito de cancelar.** Depois de escolher esperar, "Cancelar sem custo" fica como link até o pedido sair da loja | A escolha não pode ser uma armadilha de 1 toque; o direito existe até SAIU (RN-19 4d). WB-253 C4 diz "o botão some": leio como o botão de esperar | WB-253 C4. **PO confirma** |
| D6 | **Cancelar sem custo e continuar esperando têm o mesmo peso visual** (dois botões contornados, empilhados) | Sem padrão obscuro em nenhum sentido: a Webag não empurra o cliente a ficar nem a sair. A compensação por esperar é dita em texto, não em cor | Nada |
| D7 | Fora do alcance na sacola: **nenhuma opção pré-selecionada**; o botão vira "Escolha como receber" | Trocar sozinho para retirada mudaria o total e o modo de receber sem o cliente perceber (Nielsen: controle e liberdade) | WB-251 C3 |
| D8 | "Ainda não chegamos em [bairro]" e "Nenhuma loja entrega aí" **viram um estado só** | Para o cliente as duas situações são iguais (não há como receber). Um texto, uma ação (lista de espera) | `cliente.md` copy "Endereço sem lojas" e "Região não atendida" |
| D9 | Cabeçalho do acompanhamento em atraso: rótulo "Atrasado · 19:28" com ícone, título "Passou do horário previsto", faixa prometida mantida em tamanho menor como "Previsto entre" | Nunca inventar horário (RN-19 4b) e nunca culpar ninguém (WB-253 C8). Atraso não depende só de cor: ícone + palavra | Nada |
| D10 | Compensação aparece como **bilhete** (mesmo componente dos cupons da loja) na tela do pedido entregue e em "Meus cupons" | Reaproveita o componente; o bilhete é lido como "ganhei algo" sem festa num momento de falha (humor nunca em erro, `direcao-v3.md` §2) | Nada |

## 1. Componente `EtaBand` (fonte única da faixa)

| Variante | Onde | Conteúdo | Rótulo acessível |
|---|---|---|---|
| `chip` | Capa do cartão de loja | Ícone `clock-circle` duotone + "35–65 min" (Figtree 14/800, `tabular-nums`) em pastilha branca 32, raio 10 | "Chega em 35 a 65 minutos" |
| `stat` | Tabela de números da loja (coluna 2) | "35–65" Bricolage 24/800 + "min até você" 13 | idem |
| `line` | Loja (abaixo dos números), sacola, checkout | Ícone 22 + texto 15/22; horário em `noite` 800 | "Pedindo agora, chega entre 18 horas e 45 minutos e 19 horas e 20 minutos" |
| `fact` | Produto (linha de fatos) | "Chega hoje entre 18:45 e 19:20" + "Entrega Webag R$ 5,00 · ou retire grátis na loja" | idem |
| `option` | Opção "Entrega Webag" da sacola (ReceiveOption) | "18:45 – 19:20" no lugar do texto de apoio | "Entrega Webag, chega entre (...), 5 reais" |
| `hero` | Pedido confirmado, acompanhamento | "Chega entre" 19/24 + "18:45 – 19:20" Bricolage 52 a 54/800 | idem |

Regras: a faixa vem **do servidor** (`eta.fromAt`/`toAt`, `deliveryEta()` em `apps/mobile/src/features/catalog/eta.ts`); traço **meia-risca com espaços** no relógio ("18:45 – 19:20") e sem espaços nos minutos ("35–65"); nunca número único; sem endereço ou sem faixa, a variante não renderiza (não há "—" solto). `useReducedMotion`: sem animação na troca de valor.

## 2. Matriz: superfície x estado

Legenda das superfícies: **T1** cartão de loja (Início, busca, categoria) · **T2** loja · **T3** produto · **T4** sacola · **T5** checkout (S5, `onda-4-transacao.md`) · **T6** pedido confirmado · **T7** acompanhamento · **T8** Pedidos (cartão "em andamento") · **P** push.

| Estado | Quando | T1 | T2 | T3 | T4 / T5 | T6 | T7 | T8 / P |
|---|---|---|---|---|---|---|---|---|
| **E1 Normal** | Faixa dentro do teto, logística aberta | chip "35–65 min" | stat + line "Pedindo agora, chega entre 18:45 e 19:20" | fact | option + line "O horário conta a partir do pagamento aprovado." | hero | hero + "Se adiantar, a gente avisa." | "Etapa 2 de 5 · chega entre 18:45 – 19:20" |
| **E2 Sem endereço** | Visitante só com cidade, ou endereço sem posição | sem chip; meta "Entrega a partir de R$ 5,00" | stat "—" "informe o endereço" (link) | fact "Informe o endereço para ver o horário" (link) | sacola pede o endereço antes de mostrar a faixa | n/a | n/a | n/a |
| **E3a Faixa mudou antes de pagar** | 409 `ETA_CHANGED` (WB-249 C5) ou recálculo da sacola passou da folga | n/a | n/a | n/a | folha "O horário mudou" (§3.2) | mostra a faixa nova | n/a | n/a |
| **E3b Chega mais cedo** | Em SAIU, deslocamento encurtou (RN-19 item 3) | n/a | n/a | n/a | n/a | n/a | "Agora chega mais cedo" 18:40 – 19:05 e "Antes: ~~18:45 – 19:20~~" | P (1 vez): "Seu pedido chega mais cedo: entre 18:40 e 19:05." |
| **E4 Atrasando** | Passou do fim da faixa, antes da tolerância | n/a | n/a | n/a | n/a | n/a | §3.3, cartão "Seu pedido está demorando mais que o previsto" | T8 "Atrasado"; P (1 por pedido) |
| **E5 Atrasado, antes de SAIU** | Fim + `entrega_atraso_tolerancia_min` (15) | n/a | n/a | n/a | n/a | n/a | §3.4 "Passamos do prazo" com "Continuar esperando" e "Cancelar sem custo" | T8 "Atrasado" |
| **E5b Atrasado, em SAIU** | Idem, pedido com o motoboy | n/a | n/a | n/a | n/a | n/a | §3.5 "Pedir cancelamento" e resposta em 10 min | P só na resposta |
| **E6 Cancelado por atraso** | Cliente confirmou, ou cancelamento aceito | n/a | n/a | n/a | n/a | n/a | §3.6 "Pedido cancelado" "Devolvemos R$ 156,79" | P "Pedido cancelado. Devolvemos o valor inteiro, com a entrega." |
| **E7 Entregue com atraso** | ENTREGUE depois de fim + tolerância (WB-254) | n/a | n/a | n/a | n/a | n/a | §3.7 bilhete "Entrega grátis no próximo pedido" | P com o bilhete; "Meus cupons" |
| **E8 Loja fora da área** | Fim da faixa > teto, ou fora de `raio_max_km` (WB-251) | a loja **não aparece** | §3.8 caixa "Não entrega no seu endereço" | fact "Não entrega no seu endereço" + retirada | opção Entrega inativa com motivo; nada pré-selecionado (D7) | n/a | n/a | n/a |
| **E9 Nenhuma loja entrega no endereço** | Lista vazia para o endereço (WB-251 C4, WB-004 C5) | §3.9 estado vazio e lista de espera | n/a | n/a | n/a | n/a | n/a | n/a |
| **E10 Entregas fechadas** | Fora de `logistica_horario` ou fim da faixa depois do fechamento | chip "Entrega volta às 9h"; meta "Retire grátis" | stat "9h" "entregas voltam" + line "Hoje dá para retirar até 21h." | fact "Entregas voltam amanhã às 9h" | opção inativa "Volta amanhã às 9h" + line | n/a | n/a | faixa da Início §3.10 |
| **E10b Entregas pausadas** | Pausa da operação (RN-18) sem hora de volta | chip "Entrega pausada" | stat "—" "entregas pausadas" | fact "Entregas pausadas agora" | opção inativa "Pausada agora" | n/a | n/a | faixa §3.10 |
| **E10c Perto do fechamento** | Logística aberta, mas a faixa passaria do fechamento (RN-19 item 2) | chip "Entrega volta às 9h" | line "Entregas de hoje até 20h. Este pedido chegaria depois disso." | fact idem | opção inativa "Volta amanhã às 9h" | n/a | n/a | n/a |
| **E11 Sem conexão** | Sem rede | último valor | line + "Atualizado há 3 min" | idem | faixa com "Atualizado há 3 min"; botão inativo "Sem conexão. Conecte-se para pagar." (WB-250 C9) | n/a | último estado + faixa EP | n/a |
| **E12 Falha no cálculo** | Erro ou lentidão do servidor no ETA (WB-249 C10) | sem chip (a loja segue visível) | line "Não conseguimos calcular o horário agora." + "Tentar de novo" | idem | idem; pagamento bloqueado até a faixa voltar | n/a | n/a | n/a |
| **E0 Carregando** | Primeira carga | skeleton do chip (pastilha 32 x 96) | skeleton do stat | skeleton da linha | botão "Calculando o horário" inativo | n/a | skeleton do herói | n/a |
| **Retirada** | Pedido de retirada (WB-250 C5) | n/a | tix "Retire grátis" | n/a | opção Retirada: endereço; sem faixa | "Pronto em 20 a 40 min" (preparo da loja) | etapas de retirada (sem atraso por faixa, WB-253 C6) | n/a |
| **Pedido antigo** | Sem ETA gravado (WB-252 C7) | n/a | n/a | n/a | n/a | n/a | texto antigo de tempo estimado, sem atraso | n/a |

## 3. Telas e estados em detalhe

### 3.1 T1 a T4: faixa normal (E1) — WB-250
**Objetivo:** escolher a loja e pagar sabendo quando chega.
- **T1 cartão de loja** (Início "Abertas agora", busca, categoria): chip na capa. Ordenação continua RN-03 (a faixa não reordena). testID: `home.store-card-<id>`, `home.store-card-<id>.eta`.
- **T2 loja**: coluna 2 da tabela de números "35–65 / min até você"; logo abaixo, `EtaBand line` "Pedindo agora, chega entre **18:45 e 19:20**" (ícone relógio duotone). A linha é recalculada a cada minuto com a tela aberta. testID: `store.eta`, `store.eta-line`.
- **T3 produto**: primeiro fato "Chega hoje entre 18:45 e 19:20" / "Entrega Webag R$ 5,00 · ou retire grátis na loja". "hoje" só dentro do horário da logística. testID: `product.eta`.
- **T4 sacola**: opção "Entrega Webag" com "18:45 – 19:20" e "R$ 5,00"; abaixo das opções, linha "O horário conta a partir do pagamento aprovado." (PO: "A contagem começa quando o pagamento for aprovado"; encurtei). Recalcula ao abrir e a cada minuto. testID: `cart.receive-delivery`, `cart.receive-pickup`, `cart.eta`, `cart.checkout`.
- **T5 checkout**: a mesma `line` acima do botão de pagar, com o horário recalculado no momento (S5 sem outras mudanças). testID: `checkout.eta`.
- **T6 confirmado**: herói "Chega entre / 18:45 – 19:20" (faixa reancorada no pagamento). testID: `order-confirmed.eta`.
- **T7 acompanhamento**: herói + "Se adiantar, a gente avisa." (o horário não muda antes de SAIU; só pode ficar mais cedo). testID: `tracking.eta`.
- **T8 Pedidos**: cartão noite "Etapa 2 de 5 · chega entre / 18:45 – 19:20". testID: `orders.live`.

### 3.2 E3a: o horário mudou antes de pagar (folha)
Folha (raio 30) sobre a sacola ou o checkout, ao tocar em "Ir para o pagamento".
- Título "O horário mudou" · texto "A previsão mudou desde que você abriu a sacola. Confira antes de pagar." · comparação em 2 blocos: **Antes** ~~18:45 – 19:20~~ (cinza) | **Agora chega entre** 19:00 – 19:35 (bloco noite) · botão primário "Continuar com o novo horário" · texto "Voltar à sacola".
- Só aparece se a diferença passar da folga (WB-249 C5); diferença menor atualiza a faixa sem folha.
- A11y: foco no título; comparação lida "Antes, 18:45 a 19:20. Agora, 19:00 a 19:35". testID: `cart.eta-changed-sheet`, `cart.eta-changed-accept`, `cart.eta-changed-back`. Evento: `eta_updated {deltaMin}`.

### 3.3 E4: atrasando (passou do fim da faixa) — WB-253 C1
- **Cabeçalho noite:** rótulo `danger-triangle` duotone (camada lima) + "ATRASADO · 19:28" (branco, caixa alta, 13/800); título "Passou do horário previsto"; segmentos e etapa continuam; "Previsto entre" + **18:45 – 19:20** em 40 px `neutral.300` (a promessa fica visível, menor); "Passou 8 min. Já estamos cuidando disso." (branco 16/700; o número atualiza por minuto, **sem** anunciar ao leitor de tela).
- **Cartão abaixo (neutro.100, raio 24):** "Seu pedido está demorando mais que o previsto" · "Já estamos cuidando disso. Se passar de **19:35**, você pode cancelar sem custo." · botão noite "Falar com a Webag" (WhatsApp da Webag com o número do pedido).
- **Push (1 por pedido):** título "Seu pedido está demorando mais que o previsto" · corpo "Já estamos cuidando disso. Toque para ver o pedido."
- Código de entrega e etapas continuam abaixo. testID: `tracking.late-banner`, `tracking.late-contact`. Evento: `late_notice_shown`.

### 3.4 E5: atrasado, antes de sair da loja — WB-253 C2, C4; WB-254
- Cabeçalho igual ao E4 ("Passou 17 min.").
- **Cartão:** título "Passamos do prazo" · "Você pode cancelar sem custo e receber **R$ 156,79** de volta, com a entrega. Se preferir esperar, ganha entrega grátis no próximo pedido." · 2 botões contornados de mesmo peso, empilhados: "Continuar esperando" e "Cancelar sem custo" (D6) · link "Falar com a Webag".
  - Com `entrega_compensacao_tipo` = `cupom_valor`: "...ganha R$ 10,00 de desconto no próximo pedido."; com `nenhuma`: a frase da compensação some.
- **"Continuar esperando":** o cartão vira "Combinado, seguimos" · "Quando o pedido chegar, você ganha **entrega grátis no próximo pedido**. Se mudar de ideia antes de ele sair da loja, ainda dá para cancelar sem custo." · link "Cancelar sem custo" (D5). Foco vai ao título novo.
- **"Cancelar sem custo":** folha de confirmação "Cancelar o pedido #4821?" · "Você recebe **R$ 156,79** de volta, com a entrega, em até 1 dia útil no PIX. Os itens voltam para a loja." · botão destrutivo (`danger` #B3261E, branco 6,5:1) "Cancelar pedido" · texto "Voltar". O prazo e o meio vêm do pagamento (WB-028 C1; no cartão: "em até 2 faturas" conforme o emissor **[PO confirma o texto]**). Toque duplo = 1 cancelamento (WB-253 C5).
- **Corrida contra o motoboy:** se o pedido sair da loja com a folha aberta, a confirmação responde "Seu pedido acabou de sair da loja. Agora o cancelamento precisa da resposta da Webag." e a tela passa ao E5b. Se foi entregue: "Seu pedido já foi entregue." (WB-253 C5).
- testID: `tracking.late-wait`, `tracking.late-cancel`, `tracking.late-cancel-sheet`, `tracking.late-cancel-confirm`. Eventos: `late_cancel_requested {status}`, `late_cancel_done`.

### 3.5 E5b: atrasado, já com o motoboy — WB-253 C3; WB-255 C6
- **Cartão:** "Passamos do prazo" · "Seu pedido já está com o motoboy. Se quiser cancelar mesmo assim, a Webag responde em até 10 min. Sem resposta, o cancelamento é aceito." · "Continuar esperando" e "Pedir cancelamento" (mesmo peso).
- **Enviado:** "Pedido de cancelamento enviado" · "A Webag responde até **19:48**. Sem resposta, cancelamos e devolvemos o valor inteiro, com a entrega."
- **Resposta "chego em até 10 min":** "Chega até 19:48" · "O motoboy está perto. Se não chegar até lá, o cancelamento é aceito sozinho e devolvemos o valor inteiro." (P: "A Webag respondeu: seu pedido chega até 19:48.")
- **Aceito (pela operação ou pelo silêncio):** "Cancelamento aceito" · "O motoboy devolve o pedido à loja. Devolvemos **R$ 156,79**, com a entrega, em até 1 dia útil no PIX." (estorno ao concluir a devolução, RN-18).
- testID: `tracking.late-request-cancel`, `tracking.late-request-sent`.

### 3.6 E6: cancelado por atraso
- Cabeçalho noite sem segmentos: "CANCELADO · 19:40" (ícone fechar) · "Pedido cancelado" · "Devolvemos" + **R$ 156,79** (Bricolage 54) · "O valor inteiro, com a entrega."
- Cartão: "Cancelado sem custo" · "Devolvemos **R$ 156,79** no PIX, com a entrega. Cai em até 1 dia útil. Os itens voltaram para a loja." · botão noite "Voltar ao início". Sem código de entrega, sem etapas. Não há compensação (RN-19 4d).
- testID: `tracking.refund`, `tracking.late-cancelled`.

### 3.7 E7: entregue com atraso e compensação — WB-254
- Cabeçalho: "ENTREGUE · 19:52" · "Pedido entregue" · "Entregue às / 19:52" · "Previsto entre 18:45 – 19:20." (fato, sem drama). 5 segmentos concluídos.
- **Bilhete** (neutro.100, recortes laterais, ícone `ticket-sale` em quadrado noite 56 com camada lima): "Entrega grátis no próximo pedido" · "Pedimos desculpas pelo atraso. Vale por 30 dias, em pedidos com entrega." · link "Ver meus cupons". Variante `cupom_valor`: "R$ 10,00 de desconto no próximo pedido" · "...Vale por 30 dias. O desconto pode ser menor em pedidos pequenos." **[PO confirma, ligado ao teto da comissão, WB-022 C7]**.
- Dentro da tolerância: nada aparece (WB-254 C4).
- testID: `tracking.compensation`, `tracking.compensation-open`. Evento: `late_compensation_granted {type}` (servidor).

### 3.8 E8: loja fora da área — WB-251 C2, C3
- **T2:** coluna 2 "— / não entrega aqui", coluna 3 "Grátis / retirada na loja"; caixa contornada 2 px noite (sem cor de erro: não é erro do cliente): ícone `map-point` + "Não entrega no seu endereço" + "Av. Brasil, 1200 fica longe demais desta loja. Retire grátis na loja ou veja quem entrega aí." + links "Retirar na loja" (só se a loja aceita retirada e está a ≤ `retirada_distancia_max_km`) e "Ver lojas que entregam aí". O "+" dos produtos continua (vale para retirada).
- **T3:** fato "Não entrega no seu endereço" / "Retire grátis na loja · Av. Dr. Lúcio, 88".
- **T4:** opção "Entrega Webag" inativa com motivo escrito "Não entrega aqui" (texto `warning.base` 7,2:1, não só cinza) e valor "—"; tocar explica num toast. Nenhuma opção selecionada; botão "Escolha como receber" (inativo, mas tocável: rola até as opções e as balança). Caixa abaixo: "A entrega não chega no seu endereço" · "Av. Brasil, 1200 fica longe demais desta loja. Retire grátis na loja ou troque o endereço." · link "Trocar endereço". Sacola mantida.
- Servidor recusa com 422 `OUT_OF_RANGE` se algo escapar: mesma caixa, foco nela.
- testID: `store.out-of-range`, `store.pickup`, `store.see-others`, `cart.change-address`. Evento: `eta_out_of_range {surface}`.

### 3.9 E9: nenhuma loja entrega no endereço (lista de espera) — WB-251 C4, WB-004 C5, WB-211
- Início com o cabeçalho de sempre (endereço "Rua das Flores, 45"); no lugar das categorias e listas: ilustração (sacola da marca, trilha pontilhada que não chega, pino noite com centro lima; sem rosto), título "Ainda não entregamos em Mairiporã." (Bricolage 36), "A Webag está chegando em novos bairros. Quer um aviso quando chegar aí?", botão "Avisar quando chegar", texto "Trocar endereço".
- **Folha de consentimento** (finalidade única, LGPD): "Avisar quando chegar" · "Usamos seu e-mail só para avisar quando a Webag chegar em Mairiporã. Você cancela quando quiser." · linha com o e-mail da conta · "Quero o aviso" · "Agora não". Visitante: campo de e-mail obrigatório (`email`, validação "Digite um e-mail válido, como nome@email.com.").
- **Confirmado:** caixa com check lima "Anotado. Avisamos você por e-mail quando a Webag chegar em Mairiporã." Repetir não duplica.
- Se há loja com **retirada** a ≤ 10 km: abaixo, "Retire em lojas perto" com os cartões (sem chip de faixa).
- testID: `home.empty-out-of-area`, `waitlist.open`, `waitlist.sheet`, `waitlist.confirm`, `waitlist.cancel`, `waitlist.confirmed`, `home.change-address`.

### 3.10 E10: entregas fechadas, pausadas ou perto do fechamento — RN-18, RN-19 item 2, WB-249 C7
- **Faixa da Início** (bloco noite raio 22, entre categorias e "Abertas agora"): ícone `scooter` duotone (camada lima) + **"Entregas voltam amanhã às 9h"** / "Hoje ainda dá para retirar na loja." Pausa: **"Entregas pausadas agora"** / "Retire grátis na loja ou tente daqui a pouco." (sem motivo interno; se a operação informar previsão, "Entregas voltam às 17h").
- **Cartões:** chip "Entrega volta às 9h" ou "Entrega pausada"; meta "Retire grátis · 1,8 km". As lojas continuam listadas (retirada funciona).
- **Loja, produto, sacola:** ver matriz. Sacola: "As entregas de hoje acabaram às 20h. Hoje dá para retirar na loja até 21h."
- **E10c** (faixa passaria do fechamento): line "Entregas de hoje até 20h. Este pedido chegaria depois disso. Retire na loja ou peça a partir das 9h."
- Loja fechada (horário da própria loja) continua "Fechada · Abre às 9h" (`onda-3`), independente da logística.
- testID: `home.ops-banner`, `store.eta`, `store.eta-line`, `product.eta`, `cart.receive-delivery`.

## 4. Microcopy final (pt-BR)

| Chave i18n (sugestão) | Texto |
|---|---|
| `eta.chip` | `{min}–{max} min` |
| `eta.store.line` | Pedindo agora, chega entre {start} e {end} |
| `eta.product` | Chega hoje entre {start} e {end} |
| `eta.cart.note` | O horário conta a partir do pagamento aprovado. |
| `eta.noAddress` | Informe o endereço para ver o horário |
| `eta.stale` | Atualizado há {n} min |
| `eta.error` | Não conseguimos calcular o horário agora. · Tentar de novo |
| `eta.changed.title` / `.body` / `.accept` / `.back` | O horário mudou · A previsão mudou desde que você abriu a sacola. Confira antes de pagar. · Continuar com o novo horário · Voltar à sacola |
| `eta.hero.label` / `.note` | Chega entre · Se adiantar, a gente avisa. |
| `eta.earlier.label` / `.was` / push | Agora chega mais cedo · Antes: {start} – {end} · Seu pedido chega mais cedo: entre {start} e {end}. |
| `late.tag` / `.title` / `.passed` | Atrasado · Passou do horário previsto · Passou {n} min. Já estamos cuidando disso. |
| `late.notice.title` / `.body` / push | Seu pedido está demorando mais que o previsto · Já estamos cuidando disso. Se passar de {tolerancia}, você pode cancelar sem custo. · Já estamos cuidando disso. Toque para ver o pedido. |
| `late.contact` | Falar com a Webag |
| `late.decide.title` / `.body` | Passamos do prazo · Você pode cancelar sem custo e receber {total} de volta, com a entrega. Se preferir esperar, ganha entrega grátis no próximo pedido. |
| `late.wait` / `late.cancel` | Continuar esperando · Cancelar sem custo |
| `late.waiting.title` / `.body` | Combinado, seguimos · Quando o pedido chegar, você ganha entrega grátis no próximo pedido. Se mudar de ideia antes de ele sair da loja, ainda dá para cancelar sem custo. |
| `late.confirm.title` / `.body` / `.cta` | Cancelar o pedido #{n}? · Você recebe {total} de volta, com a entrega, em até {prazo} no {meio}. Os itens voltam para a loja. · Cancelar pedido |
| `late.out.body` / `.request` | Seu pedido já está com o motoboy. Se quiser cancelar mesmo assim, a Webag responde em até 10 min. Sem resposta, o cancelamento é aceito. · Pedir cancelamento |
| `late.out.sent` | Pedido de cancelamento enviado · A Webag responde até {hora}. Sem resposta, cancelamos e devolvemos o valor inteiro, com a entrega. |
| `late.out.eta10` | Chega até {hora} · O motoboy está perto. Se não chegar até lá, o cancelamento é aceito sozinho e devolvemos o valor inteiro. |
| `late.out.accepted` | Cancelamento aceito · O motoboy devolve o pedido à loja. Devolvemos {total}, com a entrega, em até {prazo} no {meio}. |
| `late.cancelled` | Pedido cancelado · Devolvemos {total} · O valor inteiro, com a entrega. · Cancelado sem custo |
| `late.raceOut` / `late.raceDelivered` | Seu pedido acabou de sair da loja. Agora o cancelamento precisa da resposta da Webag. · Seu pedido já foi entregue. |
| `comp.freeDelivery` | Entrega grátis no próximo pedido · Pedimos desculpas pelo atraso. Vale por 30 dias, em pedidos com entrega. · Ver meus cupons |
| `comp.value` | R$ 10,00 de desconto no próximo pedido · Pedimos desculpas pelo atraso. Vale por 30 dias. O desconto pode ser menor em pedidos pequenos. |
| `oor.title` / `.body` | Não entrega no seu endereço · {endereço} fica longe demais desta loja. Retire grátis na loja ou veja quem entrega aí. |
| `oor.cart.title` / `.body` | A entrega não chega no seu endereço · {endereço} fica longe demais desta loja. Retire grátis na loja ou troque o endereço. |
| `oor.option` / `.cta` / `.actions` | Não entrega aqui · Escolha como receber · Retirar na loja · Ver lojas que entregam aí · Trocar endereço |
| `empty.area.title` / `.body` / `.cta` | Ainda não entregamos em {bairro}. · A Webag está chegando em novos bairros. Quer um aviso quando chegar aí? · Avisar quando chegar |
| `waitlist.consent` / `.accept` / `.decline` / `.done` | Usamos seu e-mail só para avisar quando a Webag chegar em {bairro}. Você cancela quando quiser. · Quero o aviso · Agora não · Anotado. Avisamos você por e-mail quando a Webag chegar em {bairro}. |
| `ops.closed` / `.closedSub` | Entregas voltam amanhã às 9h · Hoje ainda dá para retirar na loja. |
| `ops.paused` / `.pausedSub` | Entregas pausadas agora · Retire grátis na loja ou tente daqui a pouco. |
| `ops.chip.closed` / `.paused` / `.option` | Entrega volta às 9h · Entrega pausada · Volta amanhã às 9h |
| `ops.nearClose` | Entregas de hoje até 20h. Este pedido chegaria depois disso. Retire na loja ou peça a partir das 9h. |

Formatação: `{start}`/`{end}` em HH:MM; `{tolerancia}` = fim da faixa + `entrega_atraso_tolerancia_min`; "amanhã" só se a reabertura for no dia seguinte (senão "às 9h" ou "na segunda às 9h"); valores e prazos vêm do pedido e dos parâmetros, **nunca fixos** no app. Todo texto de atraso, cancelamento e compensação passa pelo jurídico antes do G5 (J14).

## 5. Acessibilidade, plataforma e eventos

- **Ordem de leitura do acompanhamento em atraso:** voltar · "Pedido 4821" · "Atrasado, 19 horas e 28" · título · "Etapa 3 de 5, motoboy na loja" · "Previsto entre 18:45 e 19:20. Passou 8 minutos." · cartão (título, texto, botões). Mudança para atraso anuncia **uma vez** (região viva educada); contador de minutos não anuncia.
- **Não depender de cor:** atraso tem ícone + palavra; opção inativa tem motivo escrito; faixa antiga tem "Antes:" além do riscado.
- **Contraste:** branco sobre noite 17,6:1; `neutral.300` sobre noite 11,6:1 (faixa prevista); lima sobre noite 15,3:1 (ícone); `warning.base` sobre branco 7,2:1 (motivo da opção); branco sobre `danger` 6,5:1 (botão "Cancelar pedido").
- **Alvos:** botões 56 (cartão) e 44 (links com área de 44); folhas com foco preso e retorno do foco ao botão de origem.
- **Fonte grande (200%):** horário do herói quebra em 2 linhas ("18:45 –" / "19:20") sem cortar; a faixa da Início empilha ícone e texto.
- **Android x iOS:** folhas: Android fecha com voltar do sistema; iOS com gesto de arrastar. Push do atraso: canal "Pedidos" (Android, importância alta), `interruption-level` "time-sensitive" no iOS **[HIPÓTESE: confirmar a permissão no Expo]**.
- **Eventos (sem dado pessoal, RN-19):** `eta_shown {surface, minMin, maxMin}`, `eta_out_of_range {surface}`, `eta_updated {deltaMin}`, `late_notice_shown`, `late_cancel_requested {status}`, `late_cancel_done`, `late_compensation_granted {type}`; novos, a validar com o PO: `late_wait_chosen`, `waitlist_joined {bairro}`, `ops_closed_shown {surface}`.

## 6. Protótipo (para o render)

`docs/prototipo/app-cliente-v3.html` com `?estatico=1&estado=`:

| Estado | Hash padrão | Também ver |
|---|---|---|
| `normal` | `#inicio` | `#loja`, `#produto`, `#sacola`, `#confirmado`, `#acompanha`, `#pedidos` |
| `ajustada` | `#sacola` (com `&folha=1` abre "O horário mudou") | `#acompanha` (chega mais cedo) |
| `atrasando` | `#acompanha` | `#pedidos` |
| `atrasado` | `#acompanha` (com `&folha=1`, confirmação de cancelar) | |
| `atrasado-saiu` | `#acompanha` | |
| `cancelado` | `#acompanha` | |
| `compensacao` | `#acompanha` | |
| `fora-loja` | `#loja` | `#produto`, `#sacola` |
| `fora-area` | `#inicio` (com `&folha=1`, consentimento) | |
| `fechado` | `#inicio` | `#loja`, `#sacola` |
| `pausado` | `#inicio` | `#sacola` |

Fora do protótipo (só nesta spec): E2, E10c, E11, E12, E0 da faixa.

## Z. Pendências

| # | Item | Quem |
|---|---|---|
| 1 | D1 (sem "2 h" no app), D3, D5, D7, D8: ajustar copy e critérios em `cliente.md` | PO |
| 2 | Texto do prazo de estorno por meio de pagamento no cancelamento por atraso | PO |
| 3 | Revisão jurídica de atraso, cancelamento e compensação (J14), incluindo a frase D4 | Fundador / jurídico |
| 4 | Canal de "Falar com a Webag" (WhatsApp da operação ou ajuda no app) | PO |
| 5 | Push "time-sensitive" no iOS | mobile-dev |
