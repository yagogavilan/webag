# Roteiro das apresentações v3 (lojista e cliente)

Autor: social-media-strategist | Data: 2026-11-25 | Para: `product-designer` montar (o visual vem depois) | Base: `direcao-criativa.md`, `revisao-decks-v2.md`, `pendencias.md` (V1 a V12, K1 a K6), `avaliacoes/`, DEC-008, 039, 040, 128 a 132, 142, 143, PRD `prd/v1-1-cadastro-rapido.md`; v1 e v2 lidas no git (`9c9a24e^`).
Legenda: `[J8]` = depende do parecer sobre motoboys (DEC-039); `[confirmar]` = decisão ou fato do fundador, do jurídico ou de outro papel; `[HIPÓTESE]` = não validado. Nada aqui é preço, comissão ou marca decididos.

## 0. O que muda em relação à v2 (aprendizado, em 5 linhas)

- A v2 vendia o painel com cartões **desenhados**. A v3 usa **captura real limpa** (lista na seção 5) e põe o que é novo no centro: a lista do WhatsApp vira a loja (v1.1), que responde "dá trabalho cadastrar" e "não entendo de sistema".
- **Erro da v2 corrigido:** "Enquanto isso, cadastre seus produtos" (guia, slide 2) é falso. O catálogo só abre com a loja aprovada (`catalog-gate.tsx`, 409 `STORE_NOT_APPROVED`). Na v3 o produto vem depois da aprovação.
- A dependência de J8 foi concentrada: no lojista em 2 slides (L4 e G5) mais a objeção "não quero entregar"; no cliente em 2 (C2 e C4). O resto sobrevive sem o parecer.
- Saem da peça: troca (J2), "10 minutos para aceitar" (V4), taxa do cliente e frete (J6), qualquer horário ou prazo, "som" do painel (V10: exige ativar no navegador).
- Entra uma regra que a v2 não tinha: tudo que for tempo medido (a meta de 1 minuto por produto) só imprime depois do teste de 60 s (DEC-129), com mediana e número de pessoas.

## 1. Ideia central e ganchos de abertura

### Lojista
**Ideia em 1 frase:** quem mora longe e hoje ouve "só retirando" passa a pedir pelo app, você só separa, e a lista de preços que você já manda no WhatsApp vira a sua loja.
Ação única: mandar "quero entrar" ao WhatsApp do Yago (entrar na lista de abertura).

| | Gancho (L1) | Fórmula | Por que | Risco |
|---|---|---|---|---|
| **A (recomendado)** | Conversa de WhatsApp: "Tem no 38?" / "Tem sim." / "Moro longe. Dá pra entregar?" / "Só retirando, tá?" (visto, sem resposta). Título: **Quantas vendas "só retirando" já custou?** | Cena + identificação | O dono reconhece a própria frase em 1 s; a dor vira venda perdida, não "falta de sistema". É o gancho que a v2.2 mediu mais forte (nota 5 no s1). Serve na porta: ele lê o slide e já responde com a boca | É reencenação: precisa do selo "Cena de exemplo" (não é depoimento) e, melhor, da frase **literal** ouvida em visita (IF8) |
| B | Print de lista de preços de WhatsApp (6 linhas, valores redondos). Título: **Essa lista você já tem.** | Curiosidade honesta (a peça cumpre no L5) | Não depende de J8; mostra esforço baixo | Sem dor, sem emoção: o dono entende o "como" antes de querer o "porquê" |
| C | Duas colunas: 6 mensagens de ida e volta (tamanho, foto, preço, endereço) x 1 cartão de pedido pronto. Título: **Um pedido não precisa de uma conversa.** | Contraste antes/depois | Mostra o produto já no frame 1 | "Manda o PIX" na conversa viraria pagamento em cena (trava 1); fica abstrato sem a captura real do pedido (P10) |

**Escolha: A** no slide 1; **B** vira o título do L5 ("Sua lista do WhatsApp vira sua loja"), onde a peça cumpre a curiosidade.

### Cliente
**Ideia em 1 frase:** aquela loja que você gosta e que só vende no balcão passa a estar no seu celular, com o tamanho que tem à vista e o pedido acompanhado até a sua porta `[J8]`.
Ação única: seguir o Instagram do Webag (`@webag` provisório) para saber quando abre.

| | Gancho (L1) | Fórmula | Por que | Risco |
|---|---|---|---|---|
| **A (recomendado)** | **Aquela loja que você adora. Não entrega.** + "Só dá pra comprar indo lá." | Identificação / quebra de crença | Cada pessoa pensa numa loja específica, em 1 s. É a ideia já aprovada na direção criativa (§3). Sem emoji, só tipografia | A resposta (C2) é J8. Parece com a v2: o diferencial vem do C3 e do CTA |
| B | **Tem no 38? Você vê antes de pedir.** | Identificação + produto | Espelha o gancho do lojista (a mesma pergunta, do outro lado); a prova (tamanho esgotado marcado) não depende de J8 | Estreita para moda e calçado; "Aquela loja" cobre casa e acessórios |
| C | **Sai do trabalho às 18h. A loja fecha às 18h.** | Cena | Específico e comum | Empurra para prazo e horário de entrega (trava 2) e a loja só vende com a loja aberta (HIP-E08) |

**Escolha: A** no slide 1; **B** vira o slide 3 (prova de produto). Se J8 negativo, B abre o deck (plano B, §3).

## 2. Lojista

Formato: PDF 16:9, mostrado pelo fundador no celular ou impresso. Titulo no máximo 10 palavras, mínimo 110 px; UI da captura no mínimo 24 px na peça (`direcao-criativa.md` §2). Rodapé fixo: "Em breve" sem data; **Francisco Morato e região** só no rodapé do L8 `[confirmar]`.

### Parte 1, "A conversa" (8 slides, 3 minutos na porta da loja)

**L1. Gancho (cena)**
- Ideia: o dono reconhece a dor e a conta em vendas perdidas.
- Título: **Quantas vendas "só retirando" já custou?** (6 palavras)
- Apoio: "O cliente quis comprar. Você não tinha como entregar." + selo "Cena de exemplo" (32 px).
- Tela do app: nenhuma. Conversa desenhada em tipografia, sem logo nem UI do WhatsApp, sem nome nem número reais.
- Confirmar: frase literal ouvida nas visitas (IF8); foto da fachada de loja só com autorização escrita do dono (IF6).

**L2. Tese**
- Ideia: a resposta ao L1: a loja dele aparece para quem não passa na porta.
- Título: **Venda além da sua rua.** (5)
- Apoio: "Sua loja no celular de quem mora longe." Tag "Para lojistas. Em breve."
- Tela: **A1** (app do cliente, página da loja), recorte do topo (nome, categoria) e da grade de produtos, grande, no lado direito.
- Confirmar: nome fictício da loja de captura ("Loja Exemplo", sem coincidir com loja real); sem promessa de volume de vendas (posicionamento §5.2).

**L3. Pedido chega**
- Ideia: o que ele vai ver e fazer: um toque.
- Título: **Chegou pedido. Aceite com um toque.** (6)
- Apoio: "Itens, total e dois botões: Aceitar pedido ou Recusar."
- Tela: **P10** (painel, pedidos novos, celular), recorte do cartão do pedido: itens, total, botões.
- Confirmar: sem "10 minutos" nem "o pedido é cancelado" (V4, flag `prazoAceite` desligada); Recusar visível inteiro (bug do botão cortado em I1: mobile-dev confirmar corrigido).

**L4. Entrega** `[J8]`
- Ideia: a objeção "e a entrega?" respondida: não é dele.
- Título: **Você separa. O Webag leva.** (5)
- Apoio: "Marcou pronto para coleta, o motoboy busca na loja."
- Tela: **P12** (painel, caixa "Pronto para coleta" com volumes), recorte sem o número do pedido.
- Confirmar: J8 e DEC-039 (nenhum motoboy contratado antes do parecer); o modelo (lojista liga ou desliga a entrega) vale também para o L7.
- Sem J8: não há plano B de uma linha. Ver §3.

**L5. Novo: a lista vira loja**
- Ideia: tirar o medo de "ter que cadastrar tudo"; é o que ele já faz no WhatsApp.
- Título: **Sua lista do WhatsApp vira sua loja.** (7)
- Apoio: "Cole os preços, tire a foto de cada produto e publique."
- Tela: **P4** (colar) ao lado de **P5** (revisar), as duas na altura do slide; legenda "1. Cole  2. Confira  3. Fotos".
- Confirmar: **nenhum tempo impresso** até o teste de 60 s (DEC-129): quando houver, entra "No nosso teste, cada produto levou X segundos" (mediana real, n real, 5 pessoas do perfil P2); o app já diz "cerca de 1 minuto" na vitrine vazia (`products-page.tsx`), que não tem medição: mobile-dev/PO decidir se mantém antes de capturar. R1.2 está aceito para o QA, não aprovado: confirmar estado antes de imprimir.

**L6. Quanto sobra**
- Ideia: a conta em reais, sem calculadora.
- Título: **Vendeu R$ 100? Veja quanto fica com você.** (8)
- Apoio: "R$ 100, menos a comissão do Webag, menos a tarifa de pagamento: cerca de R$ 80 caem na sua conta." Nota de 32 px: "Exemplo: comissão de 15% e tarifa de pagamento de até 4,98%. Condições finais no cadastro."
- Tela: nenhuma (aritmética em tipografia grande). Tag "Sem mensalidade" **só** com a flag `semMensalidade = true`.
- Confirmar: V1 (sem mensalidade), V2 (15% e 4,98% são hipótese; J5: lido como proposta), V3 (split do Mercado Pago: "cai na sua conta"). O fundador decide o texto; eu não decido comissão.

**L7. Dúvidas, uma por uma**
- Ideia: quatro respostas curtas no lugar de um manual.
- Título: **Suas dúvidas, uma por uma.** (5)
- Apoio (4 blocos): "Preciso de CNPJ? Não. Pode ser CPF." · "Não entendo de sistema. Foto, nome e preço, como no WhatsApp." · "Não quero entregar? Você liga ou desliga a entrega. A retirada na loja continua." · "Como vejo o que ganhei? Extrato, pedido a pedido."
- Tela: nenhuma (opcional **P15**, liga/desliga da entrega, no bloco 3).
- Confirmar: J4/V7 (documentos), flag da retirada ligada no lançamento (HIP-042) e J8 (bloco 3), "Pode ser CPF" com o PO. **Troca fica fora** (J2, flag `trocaNoPainel`): responder de viva voz e anotar a pergunta.

**L8. Ação**
- Ideia: um passo, uma pessoa.
- Título: **Seu nome na lista de abertura.** (6)
- Apoio: "Fale com o Yago. Mande “quero entrar” no WhatsApp: (número)." + QR do `wa.me`. Nota: "Usamos seu contato só para avisar da abertura do cadastro."
- Tela: nenhuma. Foto do fundador opcional (IF6).
- Confirmar: WhatsApp (V9; vazio vira linhas para escrever à mão), nome e "Estou montando o Webag" (V17), como a lista é guardada (V8: finalidade, base legal, onde fica; `security-engineer`), "Em breve" sem data.

### Parte 2, "Guia de início" (6 slides, para consultar depois)
Divisor antes (não conta): "Parte 2. Guia de início. Para consultar depois." com as 6 etapas em linha. Rodapé de cada slide: "Dúvida? WhatsApp do Yago: (número)".

**G1. Cadastrar a loja**
- Título: **Cadastre sua loja em quatro etapas.** (6)
- Apoio: "Quem vai vender, sobre a loja, documentos, onde você recebe. Depois o Webag confere. Faltou algo? O painel mostra o que corrigir."
- Tela: **P1** (quatro recortes de topo das etapas, em fila).
- Confirmar: lista de documentos fica fora (J4/V7); "análise de 2 dias úteis" não entra (prazo, HIP-030); a etapa 4 usa o nome do Mercado Pago como passo do cadastro, nunca como benefício.

**G2. Produtos, o jeito rápido**
- Título: **Foto, nome e preço. Ou cole a lista.** (8)
- Apoio: "Um produto: toque em Novo produto, tire a foto, escreva nome e preço. Vários: cole a lista (até 100 linhas), confira e tire as fotos. O que você não terminar fica em rascunho."
- Tela: **P3** (novo produto) e **P6** (fotos da lista), lado a lado.
- Confirmar: o produto só abre após a aprovação (diga "Com a loja aprovada"); rascunho guardado por 30 dias (RN-Q2); "Você recebe cerca de R$..." só com V2 confirmado.

**G3. Preço e estoque**
- Título: **Mudou o preço? Ajuste vários de uma vez.** (8)
- Apoio: "Marque os produtos, escolha +10% ou +R$ 5 e veja a prévia. Errou? Desfaça em até 10 minutos."
- Tela: **P8** (prévia) e **P9** (aviso "Desfazer"), desktop.
- Confirmar: reajuste em massa e desfazer são R1.3 (DEC-132): só imprimir depois do aceite do QA; "só o dono" faz preço em massa (`isCatalogOwner`).

**G4. Receber pedido**
- Título: **Chegou pedido? Confira e aceite.** (5)
- Apoio: "O painel mostra os itens e o total. Não pode atender? Recuse."
- Tela: **P10** (já usada no L3, agora a tela inteira).
- Confirmar: sem prazo de aceite (V4).

**G5. Pronto para coleta** `[J8]`
- Título: **Separou? Marque pronto para coleta.** (5)
- Apoio: "Diga quantos volumes. O motoboy do Webag busca na loja."
- Tela: **P11** (pedido em separação) e **P12** (a caixa).
- Confirmar: J8; sem horário e sem "até 2 h".

**G6. O que você ganhou**
- Título: **Veja quanto você recebeu.** (4)
- Apoio: "Vendas, comissão e o que cai na sua conta, com extrato por pedido."
- Tela: **P13** (resumo) e **P14** (extrato), desktop, com selo "Exemplo".
- Confirmar: V2 e V3; recortar o aviso de "carência de X dias" (é prazo) e o número do pedido.

## 3. Plano B se J8 vier negativo

- **Cliente:** C2 vira "Agora ela está no seu celular." (apoio: "Veja os produtos e os tamanhos que tem."); C4 vira "Acompanhe o pedido." com **A3** (Em separação) no lugar de **A4**; sem "motoboy" nem "porta". O deck fica de pé.
- **Lojista:** não há plano B honesto. O L1 vende a dor de "só retirando" e o L4 não resolve; remendar com "o cliente retira" repete o erro do slide 6 da v2.2 (contradição). **Recomendação:** se J8 for negativo, pausar o deck do lojista e voltar ao fundador com nova tese (ex.: "Sua loja no app, o cliente retira" só se a retirada estiver ligada), em vez de maquiar.

## 4. Cliente

Canal: PDF recebido por WhatsApp ou Instagram, lido no celular em 30 s e mostrado pelo fundador (V21). **Decisão do CEO/fundador `[confirmar]`:** formato 4:5 em pé (1080x1350), que dobra a leitura no celular, em vez de 16:9 (V22). O roteiro vale nos dois; texto mínimo 56 px, no máximo 3 blocos por slide. Rodapé: "Em breve" sem data; "Francisco Morato e região" só no C5 `[confirmar]`.

**C1. Gancho**
- Título: **Aquela loja que você adora. Não entrega.** (7)
- Apoio: "Só dá pra comprar indo lá."
- Tela: nenhuma. Tipografia grande; foto de fachada só com autorização (IF6).
- Confirmar: nada além do gancho (é fato do dia a dia, não do Webag).

**C2. Virada** `[J8]`
- Título: **Agora ela entrega.** (3)
- Apoio: "Está no app. Você escolhe e pede de onde estiver." Tag "Em breve".
- Tela: **A1** (loja no app), grande.
- Confirmar: J8. Plano B no título (§3). Foto de produto real (nada de degradê de placeholder).

**C3. Prova: o tamanho**
- Título: **Tem no 38? Você vê antes de pedir.** (8)
- Apoio: "Tamanho esgotado aparece marcado. Sem esperar resposta no WhatsApp."
- Tela: **A2** (produto com tamanhos, dois esgotados), recorte do seletor.
- Confirmar: que o app marca o tamanho sem estoque (existe `variantSoldOut` no código do produto; mobile-dev confirmar na captura); só tem sentido para produtos com variação.

**C4. Acompanhar** `[J8]`
- Título: **Acompanhe o pedido até a sua porta.** (7)
- Apoio: "Pedido recebido, confirmado, em separação, a caminho, entregue. Dúvida? Fale com a loja."
- Tela: **A4** (etapa "A caminho", sem horário, sem código de entrega).
- Confirmar: J8 ("a caminho"); "Falar com a loja" existe no app (`talkStore`); "aviso a cada etapa" (WB-191) **fica fora** até o mobile-dev confirmar a notificação (V21); sem mapa nem previsão (R4 não existe).

**C5. Ação**
- Título: **Saiba quando abre.** (4)
- Apoio: "Siga @webag no Instagram." Rodapé pequeno: "Tem uma loja? Mostre isto ao dono."
- Tela: nenhuma (opcional: o ícone do app).
- Confirmar: @ real (o `@webag` é provisório, V9/IF1); sem WhatsApp enquanto vazio. Variante para teste `[HIPÓTESE]`: "Qual loja você quer ver aqui? Mande o nome." (traz a lista de lojas a visitar, que é o gargalo): só com o fundador de acordo e um canal para receber.

## 5. Capturas necessárias (para o `mobile-dev` gerar; o designer só recorta)

**Regras para todas.** Um único banco de captura: 1 loja aprovada, "Loja Exemplo" `[confirmar o nome]`, moda e casa; seg a sáb 09h às 18h; capturar em dia útil entre 10h e 16h com relógio do aparelho conferido (K4); `deviceScaleFactor` 3 no celular (390x844) e 2 no desktop (1440x900) (K1); 6 produtos com **foto real** (o fundador fotografa; sem degradê de placeholder, sem IA, sem pessoas): camiseta básica preta R$ 59,00, vaso de cerâmica R$ 45,00, calça jeans R$ 129,00, toalha de banho R$ 39,00, luminária de mesa R$ 89,00, tênis casual R$ 199,00 (estoque 8 ou mais, para não aparecer "Últimas unidades"); 5 pedidos entregues de R$ 200,00 (financeiro redondo); nada de alimento (K2); sem "20% off", "Retire grátis", nota, estrelas, "Som desligado", atraso em vermelho, "(demonstração)" nem banner de ambiente de teste; sem e-mail, CPF, telefone, endereço, código de pedido nem código de entrega visíveis (trava 5): o que a tela exibir e não puder ser neutro fica **fora do recorte** e o designer cobre com a margem do slide, nunca com tarja.

| ID | Tela e rota | Estado e dados que devem aparecer | Usada em |
|---|---|---|---|
| **A1** | App cliente, loja `/store/[id]` | Loja aberta, nome "Loja Exemplo", categoria "Moda e casa"; grade com os 6 produtos e preços redondos; sem faixa de tempo estimado, sem taxa, sem selo | L2, C2 |
| **A2** | App, produto `/product/[id]` | Calça jeans R$ 129,00; tamanhos 36, 38, 40, 42, 44 com 36 e 44 **esgotados** e 38 selecionado; botão de sacola; sem "Últimas unidades" | C3 |
| **A3** | App, pedido `/order/[id]` | Etapa 3 de 5 "Em separação"; 2 itens; botão "Falar com a loja"; sem horário, número, código de entrega ou mapa | plano B de C4 |
| **A4** | Mesma tela | Etapa 4 de 5 "A caminho" `[J8]`; sem nome ou foto de motoboy | C4 |
| **P1** | Painel, cadastro `/lojista/onboarding/1` a `4` (celular) | Topo de cada etapa: "Etapa X de 4", título ("Quem vai vender?", "Sobre a sua loja", "Envie seus documentos", "Onde você recebe?"); campos vazios; sem CPF, CNPJ, endereço ou WhatsApp | G1 |
| **P3** | Painel, `/lojista/produtos/novo` (celular) | Foto real da camiseta na capa; nome "Camiseta básica preta"; preço 59,00; quantidade 1; categoria Moda e vestuário; botão Publicar. **Duas versões:** com e sem a linha "Você recebe cerca de R$..." (a com só se V2 confirmado) | G2 |
| **P4** | `/lojista/produtos/adicionar-varios`, passo Colar (celular) | Lista de 6 linhas, sem tamanhos: "Camiseta básica preta 59,00 - 10 un", "Vaso de cerâmica 45,00 - 4 un", "Calça jeans 129,00 - 3 un", "Toalha de banho 39,00 - 8 un", "Luminária de mesa 89,00 - 2 un", "Tênis casual 199,00 - 5 un"; contador "6 linhas · até 100 por vez. Pode colar direto do WhatsApp." | L5, G2 |
| **P5** | Mesmo fluxo, passo Revisar | As 6 linhas como o leitor entendeu, sem editar à mão (a captura prova o leitor real); statuses como o app mostra | L5 |
| **P6** | Mesmo fluxo, passo Fotos | Cartão por produto; 3 com foto real e 3 aguardando; botão de publicar | G2 |
| **P7** | `/lojista/produtos` (celular) | 6 produtos; 5 "Vendendo" e 1 "Pausado" (chip em texto); 1 rascunho | reserva de G2 |
| **P8** | `/lojista/produtos/precos` (desktop) | 6 linhas com preço e estoque; 3 selecionadas; barra de reajuste em "+R$ 5" com prévia (R$ 59,00 para R$ 64,00 etc.) | G3 |
| **P9** | Mesma tela, depois de aplicar | Aviso de "Desfazer" visível, com o tempo | G3 |
| **P10** | `/lojista/pedidos`, aba de novos (celular) | 1 pedido novo, idade "agora" ou "há 1 min", 2 itens (camiseta preta R$ 59,00 e calça jeans R$ 129,00), total R$ 188,00; botões Aceitar pedido e Recusar **inteiros**; nome do cliente neutro ("Cliente"), sem telefone nem endereço; número do pedido fora do recorte | L3, G4 |
| **P11** | Pedido aceito, em separação (celular) | Botão "Pronto para coleta" visível; sem número | G5 |
| **P12** | Caixa "Pronto para coleta" `[J8]` | Volumes = 1, observação vazia; título da caixa traz o número do pedido: recorte abaixo do título | L4, G5 |
| **P13** | `/lojista/financeiro`, Resumo (desktop) | Vendas R$ 1.000,00 (5 x R$ 200,00); comissão, tarifa e "Você recebe" **como o sistema calcular** (cerca de R$ 800,00 só se bater com V2); sem o aviso de carência | G6 |
| **P14** | `/lojista/financeiro`, Extrato (desktop) | 5 linhas de pedido; sem nome do cliente; numeração dos pedidos neutra ("#1 a #5") se o seed permitir, senão recortar a coluna | G6 |
| **P15** (opcional) | `/lojista/loja/entrega` (celular) | Entrega e retirada ligadas; sem endereço de retirada real | L7 |

Prioridade: **P10, P4, P5, A1** (Parte 1 e cliente) primeiro; P12 e A4 só valem com J8. Capturas das flags desligadas (cupons, campanhas, mapa, app do motoboy) **não** são pedidas.
Fotos de produto são o gargalo de autenticidade: sem elas as capturas ficam com a cara do banco de demonstração (v2). Pedido ao fundador: 6 fotos de produto reais, fundo liso, sem pessoas (celular serve).

## 6. Objeções do lojista, respondidas na peça

| Objeção | Onde responde | Resposta na peça | Depende de |
|---|---|---|---|
| "Dá trabalho cadastrar tudo." | L5; G2 | "Sua lista do WhatsApp vira sua loja." Foto, nome e preço | Teste de 60 s antes de qualquer número |
| "Não entendo de sistema." | L7 (bloco 2) | "Foto, nome e preço, como no WhatsApp." | Nada |
| "E a entrega? Não tenho motoboy." | L4 | "Você separa. O Webag leva." | J8 |
| "E se eu não quiser entregar?" | L7 (bloco 3) | "Você liga ou desliga a entrega. A retirada continua." | J8; flag da retirada |
| "Quanto custa?" | L6 | Conta de R$ 100 como exemplo marcado | V1, V2 |
| "Como eu recebo?" | L6; G6 | "Cai na sua conta", extrato por pedido | V3 |
| "Preciso de CNPJ?" | L7 (bloco 1) | "Não. Pode ser CPF." | J4/V7 |
| "Quem é você?" | L8 | "Fale com o Yago", foto e uma frase dele | V17 |
| "E se o cliente quiser trocar?" | **Fora da peça** | Responder de viva voz; anotar | J2 |
| "Vou ficar o dia no computador?" | Fala do fundador (o painel abre no celular) | Mostrar P10 no celular | PO confirmar que o painel responsivo cobre o uso do balcão |

## 7. Avaliação do roteiro (rubrica `avaliar-post`; nota conservadora, sem render)

**Lojista, Parte 1**
Peça: roteiro lojista P1 | Público: lojista | Nota: 4,1/5 | Veredito: AJUSTAR (publicar após os 3 itens do fundador)
Sente em 1 s: "já ouvi isso" | Ação: mandar "quero entrar" ao WhatsApp do Yago | Travas: nenhuma formal; J8 marcado (L4 e o bloco 3 do L7); pagamento só como linha de custo (L6) e passo do cadastro (G1), nunca argumento
Notas: gancho 4,5 · ideia 4 · identificação 4,5 · prova 3,5 · miniatura 4 · CTA 4 · autenticidade 4
Faça: (1) preencher o WhatsApp e confirmar a lista (V8, V9): sem número, CTA cai para 3 e a nota para 4,0; (2) fotos reais de produto (a prova sobe para 4,5 e a autenticidade para 4,5); (3) pedir ao fundador a frase literal de uma visita para trocar a reencenação do s1.
Pergunta de teste: sem o logo, de quem seria? De qualquer app de loja, **exceto** o L1 e o L5, que só existem com a lista de WhatsApp e o "só retirando". Por que passaria o dedo? Se o dono já entrega ou vende pouco por WhatsApp, o L1 não é dele (hipótese a registrar nas visitas).
Teste A/B (porta a porta, visitas pares e ímpares): A = abrir pelo L1 (conversa), B = abrir pelo L5 ("Essa lista você já tem"). Métrica: nome anotado e WhatsApp recebido por visita; 10 visitas por versão, direcional.

**Lojista, Parte 2** (consulta, fora da nota): sem trava; depende de R1.2 e R1.3 aceitos pelo QA e de J8 no G5.

**Cliente**
Peça: roteiro cliente | Público: cliente | Nota: 3,9/5 | Veredito: AJUSTAR (abaixo de 4,0 até o @ e a foto serem reais)
Sente em 1 s: "é verdade" | Ação: seguir o Instagram | Travas: nenhuma formal; J8 em C2 e C4
Notas: gancho 4,5 · ideia 4 · identificação 4 · prova 3,5 · miniatura 4,5 · CTA 3 · autenticidade 3,5
Faça: (1) @ real e link tocável (sem isso o CTA fica em 2 e a peça volta); (2) foto real de loja ou de mão com sacola no C1 (autorização escrita); (3) decidir o formato 4:5 e, se possível, testar o CTA "Qual loja você quer ver aqui?".
Pergunta de teste: o que um concorrente não poderia dizer? iFood poderia dizer "Agora ela entrega"; **não** diria "Tem no 38? Você vê antes de pedir" sobre a loja de bairro. O C3 é o único slide com diferenciação e não depende de J8: se for preciso cortar, cortar o C4.
Teste A/B: A = abrir pelo gancho "Aquela loja que você adora. Não entrega." / B = abrir por "Tem no 38?". Métrica: toques no @ por envio. Amostra pequena: só leitura direcional.

Risco que a nota não captura: a peça do cliente pede um produto que **não existe ainda**; sem data, o "Saiba quando abre" tem prazo de validade curto (IP3).

## 8. O que depende de quem

| Quem | O que |
|---|---|
| **Fundador** | WhatsApp, nome e @ reais (V9); frase literal de visita (IF8); 6 fotos de produto e, se quiser, foto dele (IF6); ligar flags `semMensalidade` e `trocaNoPainel` só com confirmação escrita (V1, J2); valores de exemplo 15% e 4,98% (V2, V3); como guardar a lista de abertura (V8); formato 4:5 do cliente; teste de 60 s (DEC-129) |
| **Jurídico** | J8 (motoboys, DEC-039), J4 (documentos), J5 (conta de exemplo como proposta) |
| **mobile-dev** | Banco de captura e capturas A1 a A4, P1 a P15; Recusar cortado (I1); decidir a frase "cerca de 1 minuto" da vitrine vazia; confirmar "aviso a cada etapa" (WB-191) e a marcação de tamanho esgotado |
| **PO** | "Pode ser CPF" (CNPJ x MEI), flag da retirada no lançamento, painel responsivo no balcão, estado de R1.3 |
| **security-engineer** | Lista de abertura do lojista (finalidade, base legal, guarda); foto de loja real |
| **product-designer** | Formato 4:5 do cliente; layout só depois deste roteiro aprovado; devolver o quadro que estourar |
