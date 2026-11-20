# Política de Trocas e Reembolsos (PROPOSTA para revisão do advogado)

Metadados (NÃO publicar; o web e o seed consomem só o trecho entre os marcadores):

| Campo | Valor |
|---|---|
| Status | **PROPOSTA do PO, não aprovada pelo jurídico.** Substitui a "minuta" de WB-178 C6 e WB-016 C5 (J13) quando aprovada. Não afirma conformidade com o CDC |
| Dono | product-owner; revisão: advogado do fundador |
| Data da proposta | 2026-11-20 |
| Tipo no sistema | **Não existe tipo próprio** em `legal_documents` (hoje `customer_terms`, `merchant_terms`, `privacy`). Opções para o mobile-dev e o tech-lead: (a) novo tipo `exchange_policy` com versão e aceite próprios; (b) publicar como anexo dentro de `customer_terms`. Recomendação do PO: (a), porque o app já mostra "Como funciona o direito de desistir" em tela própria (WB-178 C8) |
| Baseado em | DEC-011, DEC-023b, DEC-037, DEC-038, DEC-039, DEC-062, DEC-065; `regras-de-negocio.md` RN-08, RN-10, RN-11, RN-18; `prd/trocas.md` |
| Texto fixo de prazo de estorno | RN-08, DEC-065, HIP-P09 (literal, por meio de pagamento, sem data prometida) |
| Variáveis | `{{SUPPORT_EMAIL}}`, `{{SUPPORT_WHATSAPP}}`, `{{SITE_URL}}`, `{{VIGENCIA}}`, `{{VERSAO}}` |
| Marcador de revisão | `[REVISAR JURÍDICO Jn]` inline; remover antes de publicar. Lista consolidada no fim |

<!-- TEXTO-PUBLICO-INICIO -->

## 1. Resumo: os três tipos de troca

- Arrependimento: você desiste da compra em até 7 dias corridos depois de receber, sem motivo. Você recebe tudo de volta, inclusive a taxa de entrega, e não paga a coleta.
- Defeito ou avaria: o produto veio com problema ou diferente do anunciado. Você reclama em até 30 dias (produto não durável) ou 90 dias (produto durável), contados da entrega. A coleta é grátis.
- Troca por tamanho ou cor: política da loja, não obrigação da lei. A loja define se aceita e o prazo. Levando à loja, é grátis; com coleta em casa, há uma taxa, cobrada só depois que a loja aprova.

Tudo é pedido pelo app, em Meus pedidos, escolhendo o pedido e o item. Em poucos toques, você escolhe o motivo, envia fotos quando for defeito e confirma.

## 2. Como contamos os prazos

Os prazos contam da entrega confirmada (ou da retirada na loja), e não da data do pedido. No app, ao abrir um pedido entregue, você vê "Você tem até DD/MM" para cada tipo de troca. Se a coleta atrasar por causa do Webag (por exemplo, não conseguirmos um entregador no prazo), o prazo para você entregar o item fica pausado. Se atrasar por sua causa (você não estava), o prazo segue. [REVISAR JURÍDICO J1: dia inicial da contagem e dias corridos.]

## 3. Arrependimento (7 dias)

- Quem pode: toda compra feita pelo app, inclusive as com retirada na loja, porque o contrato é fechado à distância (CDC, art. 49; Decreto 7.962/2013, art. 5º).
- Prazo: 7 dias corridos a partir do recebimento do produto.
- Como: no app, em Meus pedidos, "Desistir da compra". Você não precisa dar motivo. Você recebe na hora a confirmação de que recebemos o seu pedido de desistência, com um número de protocolo. A loja não pode recusar. [REVISAR JURÍDICO J13: confirmar o texto e a obrigação de confirmação imediata; verificar que o app envia a confirmação.]
- Como devolver: o Webag busca o item na sua casa, sem custo para você, em uma janela combinada pelo app. Você também pode levar o item à loja.
- Condição do item: devolva o item como o recebeu, na embalagem, com os acessórios e a etiqueta, sem sinais de uso além do necessário para conhecê-lo. Se a loja encontrar sinais de uso além do razoável, o caso vai para análise do Webag, e você pode contestar. [REVISAR JURÍDICO J6: condições de devolução e itens sob medida, lacrados ou íntimos (hoje nenhum é excluído do arrependimento).]
- Reembolso: você recebe todos os valores pagos, incluindo a taxa de entrega e a taxa de serviço, se houver. [REVISAR JURÍDICO J2: devolução da taxa de entrega e coleta por conta do fornecedor (STJ, REsp 1.340.604/RJ, a confirmar).]
- Quando: o reembolso começa depois que a loja confirma o recebimento do item. Nossa meta é iniciar o estorno em até 3 dias úteis da confirmação. [REVISAR JURÍDICO J3: o CDC (art. 49, parágrafo único) fala em devolução "de imediato". Alternativa a avaliar: iniciar o estorno no momento do pedido de desistência, antes do item voltar, com o risco de fraude que isso traz.]

## 4. Defeito ou avaria

- Quem pode: quem recebeu produto com defeito, avariado, faltando algo ou diferente do anunciado (CDC, arts. 18 e 26).
- Prazo: 30 dias para produtos não duráveis e 90 dias para duráveis, contados da entrega; se o defeito só aparecer depois (defeito oculto), o prazo conta a partir de quando ele aparece. Roupas e calçados são tratados como duráveis (90 dias). [REVISAR JURÍDICO J1 e J4: prazos e se vestuário e calçado são duráveis.]
- Como: no app, "Pedir troca", motivo "defeito ou avaria", com 1 a 5 fotos. As fotos são obrigatórias. Não é preciso comprovar com laudo.
- A loja responde em até 24 horas. Se ela não responder, a coleta é aprovada automaticamente. A loja só pode recusar depois de receber e inspecionar o item, com prova; nesse caso, o caso vai para a mediação do Webag, que decide em até 5 dias úteis.
- Coleta: grátis. O Webag busca o item, ou você pode levá-lo à loja.
- Solução: troca por produto igual, reparo ou reembolso, conforme a lei (CDC, art. 18). Se o defeito comprometer o uso do produto, você pode pedir o reembolso sem esperar o reparo. A loja ou o Webag combinam com você a melhor solução no app. [REVISAR JURÍDICO J1: prazo de 30 dias para sanar o vício e escolha do consumidor entre substituição, restituição e abatimento (art. 18, §1º e §3º).]

## 5. Troca por tamanho ou cor (política da loja)

- Não é obrigação da lei. É um serviço que a loja oferece, e o prazo é o da loja (hoje entre 3 e 30 dias, geralmente 7), mostrado no produto e no pedido. O Webag define o mínimo e o máximo. Lojas e produtos que não aceitam essa troca aparecem como "sem troca por tamanho ou cor" com o motivo. [REVISAR JURÍDICO J5: oferta divulgada vincula (CDC, art. 30).]
- Condições: o item sem uso, com etiqueta e na embalagem; dentro do prazo; uma troca por pedido (vale para um ou mais itens do mesmo pedido). Um item já trocado só volta de novo por defeito. A loja pode recusar se não houver as condições, sempre com motivo.
- O app só mostra os tamanhos e cores que a loja tem em estoque. Quando a loja aprova, a peça nova fica reservada para você.
- Aprovação: a loja tem 24 horas para responder. Se não responder, a troca é aprovada automaticamente. [REVISAR JURÍDICO J5: aprovação por silêncio da loja.]
- Taxa de troca: levar à loja é grátis. Com coleta e reentrega em casa, há uma taxa, que o app mostra antes de você pedir. A taxa só é cobrada depois que a loja aprova a troca, e você tem até 48 horas para pagá-la; se não pagar, a troca é cancelada sem cobrança. Se a loja recusar, nada é cobrado. A taxa não é devolvida, exceto se você cancelar a troca depois de pagar e antes da coleta, quando devolvemos o valor. Não é possível converter em "levar à loja" uma taxa já paga; nesse caso, você cancela a troca (com estorno integral da taxa) e pede de novo. [REVISAR JURÍDICO J5: cobrança, informação prévia e justificativa da taxa.]
- Diferença de preço: se a peça nova custar mais, você paga a diferença, junto com a taxa, na aprovação. Se custar menos, devolvemos a diferença.
- Reposição: a peça nova só sai depois de a loja conferir a peça devolvida, salvo quando a troca é feita na própria loja.

## 6. Coleta e devolução do item

- Coleta em casa: depois da aprovação, o Webag agenda uma janela e envia um entregador. O Webag procura agendar a coleta em até 3 dias úteis; se atrasar, avisamos você e damos um novo prazo, em até 1 dia útil. Se você não estiver, reagendamos até 2 vezes. Depois disso, a troca pode expirar.
- Leve à loja: use o código da troca mostrado no app. A loja confirma o recebimento.
- Embale o item. Se tiver a embalagem original, use.
- O item deve chegar à loja dentro do prazo informado no app. Enquanto o Webag não concluir a coleta por culpa dele, você não perde a troca.

## 7. Reembolso: como e quando

O reembolso volta sempre pelo mesmo meio de pagamento que você usou. O app mostra o valor, o meio e a situação (em processamento ou concluído). Os prazos dependem do meio:

- PIX: volta para a conta que pagou o PIX. Costuma levar até 1 dia útil.
- Cartão: aparece na fatura do cartão em até 2 faturas, conforme o seu banco.

[REVISAR JURÍDICO J16: o texto de prazo por meio de pagamento é informação adequada ou promessa de prazo (CDC, arts. 31 e 49)?]

O que o reembolso inclui:

- Arrependimento: o valor dos itens, a taxa de entrega e a taxa de serviço, se houver.
- Defeito: o valor dos itens devolvidos. A taxa de entrega não é devolvida por padrão, porque a entrega foi realizada; a coleta é grátis. [REVISAR JURÍDICO J2: confirmar se a taxa de entrega deve ser devolvida quando o defeito é o motivo; hoje o produto não a devolve.]
- Cupons: se você usou cupom, o reembolso considera o valor efetivamente pago. Em pedidos cancelados, o cupom volta, se ainda estiver na validade.

## 8. Quando a loja recusa

Se a loja recusar um pedido de defeito, ou o Webag entender que o item voltou com sinais de uso além do razoável, você recebe a explicação por escrito no app. Você tem 7 dias para contestar, enviando mais fotos ou informações. O Webag faz a mediação e decide em até 5 dias úteis. A decisão do Webag não impede que você procure o Procon, o consumidor.gov.br ou a Justiça.

## 9. Pedido que não chegou ou foi cancelado

- Se o pedido foi cancelado antes da entrega (por você, pela loja ou pelo Webag, por indisponibilidade ou falha de entrega), o estorno é total, incluindo a taxa de entrega.
- Se a entrega atrasar mais que o combinado, você pode cancelar sem custo, com estorno total. As regras estão nos Termos de Uso, item sobre atraso.
- Se o app mostrar o pedido como entregue e você não o recebeu, use "Não recebi" no pedido. O Webag apura e, se confirmar a falha, faz o estorno.

## 10. Fale com a gente

Se você não conseguir usar o app, escreva para {{SUPPORT_EMAIL}} ou chame no WhatsApp {{SUPPORT_WHATSAPP}}. Também pode usar o Procon da sua cidade e o consumidor.gov.br.

## 11. Alterações e vigência

Podemos alterar esta política para pedidos futuros; o que valia no momento do seu pedido (ou do seu pedido de troca) continua valendo para ele. A versão em vigor está sempre em [{{SITE_URL}}/termos/trocas]({{SITE_URL}}/termos/trocas). Os direitos do CDC não mudam por esta política. Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.

<!-- TEXTO-PUBLICO-FIM -->

## Lista consolidada [REVISAR JURÍDICO] desta política (NÃO publicar)

| Item | Onde | O que o advogado precisa decidir |
|---|---|---|
| J1 | 2, 4 | Texto oficial dos arts. 18, 26 e 49 do CDC e do art. 5º do Decreto 7.962/2013; contagem (dias corridos, dia da entrega); defeito oculto; 30 dias para sanar; escolha entre substituição, restituição e abatimento |
| J2 | 3, 7 | Taxa de entrega devolvida em arrependimento; coleta por conta do fornecedor (REsp 1.340.604/RJ, ementa a confirmar); taxa de entrega em defeito |
| J3 | 3 | Prazo do reembolso do arrependimento: "de imediato" x até 3 dias úteis do recebimento do item x estorno no pedido (risco de fraude) |
| J4 | 4 | Vestuário e calçado como duráveis (90 dias) |
| J5 | 5 | Taxa de troca voluntária, informação prévia, aprovação automática por silêncio da loja, vinculação da oferta (CDC art. 30) |
| J6 | 3 | Condições de devolução no arrependimento; itens sob medida, lacrados e íntimos (hoje nenhum é excluído) |
| J13 | 3 | Texto "Como funciona o direito de desistir" e confirmação imediata (Decreto 7.962/2013, art. 5º); o app envia a confirmação? (WB-178 C7) |
| J16 | 7 | Texto de prazo de estorno por meio (PIX e cartão) |
| (produto) | 1 | Tipo de documento próprio ou anexo; URL pública `/termos/trocas` não existe hoje |
