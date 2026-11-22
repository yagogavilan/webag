# Tela: Cliente, aplicar cupom na sacola e no checkout   (WB-347; efeitos de WB-341, WB-342, WB-344, WB-348)

> Autor: product-designer. Data: 2026-11-22 (revisada no mesmo dia, DEC-137). Release R2. Protótipo: `#/c/sacola` (códigos de teste listados no rodapé da tela; o botão "Simular: adicionar item de R$ 79,90" existe só no protótipo para mostrar o "Faltam" virando cupom aplicado).
> **Fonte única dos textos: tabela "Mensagens ao cliente" em `docs/produto/prd/v1-1-cupons.md` (DEC-137). Esta spec não cria texto de regra; onde o PRD é omisso (campo vazio, vitrine vazia, erro genérico) o texto está marcado "interface" e o PO confirma.** `reason_code` é interno e nunca aparece.
> Estende `direcao-v3.md` §5 (Sacola: cupom recolhido em 1 linha) e `docs/telas/16-app-cupons.png`. O passo 2 do checkout (Pagar) repete o mesmo resumo.

Objetivo do usuário nesta tela: saber se o cupom vale, de quem é o desconto e quanto vai pagar no total, sem surpresa e sem sair para procurar código.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Cupom recolhido em 1 linha**: "Tem cupom?" / "Você tem 1 cupom para esta loja" + "Ver cupons". O campo só abre ao toque | Campo aberto chama atenção para um desconto que o cliente não tem e faz sair para procurar código (abandono) `[HIPÓTESE de mercado]` |
| 2 | **O resumo mostra sempre as mesmas linhas**: Produtos, Entrega, Desconto (com a origem, em verde), Taxa de serviço (só se > 0), Total. Produtos, Entrega e Taxa **não mudam** com o cupom (RN-C1) e o resumo diz isso em 1 linha | Decreto 7.962/2013 e Portaria Senacon 61/2026. **Nenhum texto ou controle desta tela altera preço, entrega ou taxa** (DEC-088) |
| 3 | **"Faltam R$ X para usar o cupom" é um bloco informativo, não um erro**: barra de progresso e **uma ação só, "Ver mais da loja"**. **Sem produto sugerido** (DEC-137; WB-347 C9). O total **não muda** | CDC art. 30: a oferta é inteira ou não é. Sugerir item empurra o cliente a gastar; o cliente decide sozinho. Medir se isso ajuda ou atrapalha (eventos `coupon_shortfall_*`, §8) |
| 4 | **Não mostrar o cupom a quem não pode usá-lo**: a vitrine lista só cupom público aplicável agora ou aplicável com "Faltam R$ X"; nunca segmentado, de outro público ou esgotado (WB-347 C7; resposta D do PO) | Oferta inalcançável irrita, e listar cupom segmentado vaza campanha |
| 5 | **Sem "confirmar celular".** O celular não é verificado no piloto (DEC-103 D-01, SEC-197). O antifraude é o teto de orçamento por campanha, por dia e por cliente/aparelho, **invisível ao cliente**. Cupom da plataforma e de primeira compra pedem só **e-mail confirmado** (WB-344 C4) | Pedir SMS custa dinheiro (regra 6) e é fricção no checkout; fica só pelo gatilho da RN-C11, decisão do fundador |
| 6 | **Mensagens neutras de propósito.** Fraude: "Não foi possível aplicar este cupom a este pedido" + "Falar com o suporte". Código inexistente, segmentado ou de outro público: "Cupom inválido" (o mesmo texto). O cliente **nunca** vê qual identificador casou nem se o código existe | Evita ensinar o fraudador e enumerar códigos (C-CUP-06). Custo de UX aceito: "Cupom inválido" é seco e frustra o cliente que digitou errado. Mitigação sem texto novo de regra: campo com foco, dica fixa sob o campo e a saída "Falar com o suporte" no caso de fraude (C9 libera o legítimo) |
| 7 | Depois de aplicar, o cupom vira **cartão verde** com código, origem e valor e botão "Remover" | Reversível em 1 toque (H3) |

## 1. Layout da Sacola (de cima para baixo)

| # | Componente | Conteúdo |
|---|---|---|
| 1 | Cabeçalho "Sua sacola" + pastilha "Pedido na Moda Morato" | |
| 2 | Itens | Miniatura, "Camiseta básica branca · R$ 40,00", `QuantityStepper` 48 px |
| 3 | **Bloco do cupom** | Recolhido (§2), aplicado (§3) ou resposta (§4) |
| 4 | **Resumo do pedido** (`PriceSummary`, `dl`) | Produtos R$ 159,90 · Entrega R$ 9,00 · **Desconto Webag − R$ 8,00** (verde, sinal "−" e nome) · divisor · **Total R$ 160,90** (Bricolage 28, tabular). Com cupom: "Produtos e entrega têm o mesmo valor com ou sem cupom." |
| 5 | Rodapé fixo | "Ir para o pagamento · R$ 160,90" (acompanha o total) |

Rótulo da linha de desconto por origem: **"Desconto Webag"**, **"Desconto da loja"**, **"Desconto Webag e loja"** (dividida). **Frete grátis** (WB-347 C8; resposta D do PO): linha "Entrega R$ 8,00" **mais** a linha "Desconto Webag (frete) −R$ 8,00"; **nunca** "Entrega: Grátis" no lugar do valor (rubrica final depende do J22). Taxa de serviço só aparece se > 0 (F3 desligada hoje).

## 2. Entrada do cupom

1. Toque em "Tem cupom?": abre o campo **"Código do cupom"** (maiúsculas automáticas, `autocomplete=off`, `enterkeyhint=go`, colar permitido) e o botão "Aplicar". Foco no campo. Dica fixa abaixo `[interface]`: "Sem espaços. Maiúsculas e minúsculas valem igual."
2. "Ver cupons" abre BottomSheet **"Cupons para este pedido"** (C2, C7): cartão por cupom com **valor, condição, validade, origem e restrições em texto**: "R$ 8 de desconto · Primeira compra · pedido a partir de R$ 120,00 · Válido até 31/12 · Desconto Webag". Percentual mostra "até R$ 15,00". Cada cartão tem "Aplicar"; se ainda não vale, o mesmo bloco "Faltam R$ 40,00 para usar o cupom" com "Ver mais da loja".
3. Aplicar: botão "Aplicando…" (largura fixa). Sucesso: cartão verde, total conta do valor antigo ao novo (único movimento de dinheiro, só porque o usuário agiu; reduzido: troca direta), toast "Desconto Webag: R$ 8,00 a menos. Total R$ 160,90" e anúncio ao leitor de tela.
4. Validade no formato "Válido até 31/12" (o dia final vale até 23:59, `America/Sao_Paulo`).

## 3. Estado: aplicado

Cartão verde: ícone de bilhete, **"PRIMEIRA8 aplicado"**, "Desconto Webag: R$ 8,00 a menos. Primeira compra · pedido a partir de R$ 120,00." + "Remover". Remover: toast "Cupom removido" e o total volta. Se o subtotal cair e o cupom deixar de valer, o cartão some, o total volta e o bloco §4 mostra a mensagem da tabela (nunca um desconto fantasma).

## 4. Respostas do servidor (tabela `situação -> texto -> ação`; textos idênticos ao PRD)

| Situação (interna) | Texto ao cliente (PRD) | Ação | Apresentação |
|---|---|---|---|
| Subtotal abaixo do necessário (WB-341 C2, C3) | **Faltam R$ 40,00 para usar o cupom** (X = subtotal adicional) | **Ver mais da loja** (volta à loja, sacola preservada; **sem produto sugerido**) | Bloco âmbar com ícone de informação, barra e linha de apoio com os dois valores do servidor: "Seu pedido tem R$ 80,00. O cupom vale a partir de R$ 120,00." `[interface; PO confirma]`. Total não muda |
| Margem <= 0 no autofinanciado (WB-341 C4) | Cupom não disponível para este pedido | Continuar sem cupom | Nota neutra |
| Esgotado (total ou usos) (WB-342) | Cupom esgotado | Continuar sem cupom | Nota neutra |
| Esgotado no dia (WB-342 C1) | Cupom esgotado hoje. Volta amanhã | Continuar sem cupom (o pedido segue) | Nota neutra |
| Fora da validade (WB-347 C4) | Esse cupom expirou em 31/10 | Ver cupons | Nota neutra |
| Conta com pedido pago, campanha de primeira compra (WB-344 C1) | Cupom válido só na primeira compra | n/a | Nota neutra |
| Conta sem e-mail confirmado (WB-344 C4) | Confirme seu e-mail para usar este cupom | **Confirmar e-mail** (fluxo de e-mail existente; volta à sacola com o código no campo, sem aplicar sozinho) | Nota neutra com botão secundário |
| Conta já usou, campanha comum (WB-344 C14a) | Você já usou este cupom | n/a | Nota neutra |
| Outro identificador casou: CPF, aparelho, endereço, velocidade (WB-344 C13, C14b) | **Não foi possível aplicar este cupom a este pedido** | **Falar com o suporte** (canal de suporte da Webag, no mesmo lugar do atalho de ajuda do resto do fluxo; não leva o código nem o motivo) | Nota **neutra** (nunca vermelha, nunca "fraude", nunca motivo) |
| Código inexistente, segmentado, privado ou de outro público (WB-344 C8; WB-347 C6) | **Cupom inválido** (o mesmo texto para os quatro casos) | Campo com foco | Erro de campo: borda 2 px, ícone e texto, `role=alert` |
| 10 tentativas por hora por conta, 30 por IP ou 10 por aparelho (WB-344 C8, HTTP 429) | Muitas tentativas. Tente de novo em 1 hora | n/a | Nota neutra; o app não repete a chamada enquanto a mensagem estiver na tela |
| Cupom de loja **pública** usado em outra loja | Esse cupom vale só na loja Casa Bela | Ver a loja Casa Bela | Nota neutra. Só para campanha pública e listada na vitrine; senão vale "Cupom inválido" |
| Sem internet (WB-347 C5) | Sem conexão. Não conseguimos aplicar o cupom agora | Tentar de novo | Nota de aviso; o app mantém o último resumo |

Textos de interface fora da tabela do PRD (validação local ou falha genérica; o PO confirma): campo vazio "Digite o código do cupom" (não chama o servidor); erro desconhecido "Algo deu errado do nosso lado. Tente de novo em instantes." + "Tentar de novo".

Regras de apresentação: nenhuma resposta usa vermelho exceto o erro de campo de "Cupom inválido"; o bloco "Faltam" e as notas neutras não culpam o cliente. **A ordem das checagens é do servidor** (esgotado antes de conta e aparelho, WB-344 C14d); o app só exibe o texto recebido e **nunca monta mensagem a partir de código interno**.

## 5. Selo "de/por" (WB-348, mesma sacola e vitrine)

Preço riscado e percentual só aparecem quando o preço "de" foi praticado por 30 dias (a flag `selo_de_por` fica desligada até o parecer J23, DEC-137); senão a vitrine mostra só o preço atual (sem tela própria). Para o **lojista** (cadastro de promoção): aviso antes de publicar "Seu desconto só aparece depois de 30 dias de preço anterior." (aba de preço; reaproveita `EarningsHint`).

## 6. Estados da tela

| Estado | Comportamento |
|---|---|
| Carregando | Skeleton das linhas do resumo; "Aplicando…" no botão. Vitrine: skeleton de 3 cartões |
| Vazio (sacola) | "Sua sacola está vazia. Escolha produtos de uma loja perto de você." [Ver lojas] |
| Vazio (vitrine) `[interface]` | "Nenhum cupom para este pedido agora. Se você recebeu um código, digite no campo." [Digitar código] |
| Erro | Linha do resumo "Não conseguimos calcular o desconto agora. Tente de novo." + "Tentar de novo"; o total sem cupom continua correto e o pedido pode seguir |
| Sem conexão | Faixa "Sem conexão. Mostrando o que já carregou."; último resumo preservado; "Aplicar" mostra a mensagem de sem conexão da §4 |
| Sucesso | §3 |
| Sem permissão | Não existe permissão de sistema. Cliente sem e-mail confirmado: §4. Conta de loja ou admin (SEC-061) recebe a nota neutra "Não foi possível aplicar este cupom a este pedido" |

## 7. Acessibilidade (WCAG 2.2 AA)

Campo com `label` visível; erro de campo em `role=alert` ligado por `aria-describedby`; notas neutras e "Faltam" em região viva educada (não `alert`: não é culpa do cliente); total em `aria-live=polite` (anuncia o novo valor uma vez). Barra de progresso `aria-hidden` com o texto completo ao lado. Resumo é lista de definição (`dl`): "Desconto Webag, menos R$ 8,00". Desconto verde sempre com sinal "−" e nome; erro nunca só em cor. Alvos 48 px; texto >= 16 px; fonte 200%: linhas do resumo empilham sem truncar valor. Foco: ao abrir o campo, no campo; ao falhar, no campo (exceto 429 e fraude, onde vai à nota); ao fechar a vitrine, volta a "Ver cupons". Ajuda consistente (3.2.6): "Falar com o suporte" no mesmo lugar do atalho de ajuda das outras telas. Entrada redundante (3.3.7): o código digitado permanece no campo após erro e após "Confirmar e-mail". O app não bloqueia colar.

## 8. Celular e tela larga

Celular (alvo): coluna única, rodapé fixo, vitrine em BottomSheet nativo. Tela larga (site/protótipo, >= 768 px): coluna de 480 px centralizada, resumo e rodapé na mesma coluna, vitrine em diálogo centralizado com `Esc` e foco preso. Android x iOS: BottomSheet e teclado nativos de cada plataforma; botão voltar do Android fecha a vitrine antes de sair da sacola; iOS mostra o atalho "Colar" do sistema; sem diferença de texto.

## 9. Movimento

| Gatilho | Propósito | Propriedade | Duração | Reduzido |
|---|---|---|---|---|
| Cupom aplicado: total muda | Estado (explica a mudança de valor) | contagem do valor, `opacity` | `motion.base` (250 ms), ease-out | troca direta, sem contagem |
| Entrada do cartão verde | Continuidade | `opacity` + translate curto | `motion.fast` (150 ms) | só fade |
| Barra "Faltam" | nenhum (sem animação) | n/a | n/a | n/a |

Háptico: nenhum (não é compra concluída).

## 10. Eventos (servidor, exceto onde indicado)

PRD: `coupon_applied` (campaign_id, funding_source, discount_cents, store_share_cents), `coupon_rejected` (reason_code: exhausted, min_order, not_first_purchase, fraud_signal, margin). Do app (desenho CC-1): `coupon_showcase_viewed` (store_id), `coupon_shortfall_shown` (campaign_id, faltam_cents em faixa de R$ 10), `coupon_shortfall_resolved` (o mesmo pedido chegou ao valor), `coupon_shortfall_abandoned` (saiu do checkout sem resolver). Proposta ao PO, fora do PRD: `coupon_field_opened`. Regra de decisão do PRD: abandono com "Faltam" > 10 pontos acima do abandono sem cupom `[HIPÓTESE]` troca o bloco por link discreto. Sem nome, e-mail, CPF nem código digitado.

## 11. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-347 C1, C8 | §1 (resumo; frete grátis em duas linhas) |
| WB-347 C2, C7 | §2.2 (vitrine só com elegíveis e "Faltam") |
| WB-347 C3, C10 | §0.2 e §1 (Produtos, Entrega e Taxa iguais; teste do dev) |
| WB-347 C4, C6, C9 | §4 |
| WB-347 C5 | §4 (sem conexão) e §6 |
| WB-341 C2, C3, C4 | §4 (Faltam; margem) |
| WB-342 C1 | §4 (esgotado hoje; o pedido segue) |
| WB-344 C1, C4, C8, C13, C14 | §4 |
| WB-348 | §5 |

## 12. Revisão heurística

**Nota 4 de 5.** CC-1 (sev. 3, H5): "Faltam R$ 40,00" ainda pode soar como empurrão; sem produto sugerido e sem urgência, o cliente decide; **medir** `coupon_shortfall_resolved` x abandono `[HIPÓTESE]`. CC-2 (sev. 2, H6): quem já usou e vê "primeira compra" fica confuso; resolvido com texto próprio para "Você já usou este cupom" e vitrine filtrada. CC-3 (sev. 2, H1): o total muda ao aplicar; anúncio e toast cobrem. CC-4 (sev. 3, H9): a mensagem de fraude é neutra e frustra o cliente legítimo bloqueado; sempre "Falar com o suporte" (C9 libera). CC-5 (sev. 2, H9): "Cupom inválido" é seco; **mantido** por decisão do PRD (anti-enumeração), com dica fixa e foco no campo; reavaliar só se o suporte registrar muitos contatos por código digitado errado. Bom: recolhido por padrão, resumo discriminado, "Remover" em 1 toque, nenhuma ação que majore preço. **Teste com 3 a 5 clientes:** achar e aplicar o cupom sem ajuda; ler o "Faltam" e dizer o que fariam.

## 13. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. A linha "Seu pedido tem R$ 80,00. O cupom vale a partir de R$ 120,00." (só números do servidor) é aceita junto do "Faltam"? 2. Canal de "Falar com o suporte" (WhatsApp da Webag?) e o que ele recebe 3. Textos de interface fora da tabela (campo vazio, vitrine vazia, erro genérico, dica do campo) |
| Security | 4. Mensagens neutras e "Falar com o suporte" sem motivo: conferir |
| jurídico (J22) | 5. Rubrica do frete grátis no resumo |
| mobile-dev | 6. Total animado só por ação do usuário; confirmar custo no Android de entrada |
