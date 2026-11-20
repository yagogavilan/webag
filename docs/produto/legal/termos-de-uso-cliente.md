# Termos de Uso do Cliente (PROPOSTA para revisão do advogado)

Metadados (NÃO publicar; o web e o seed consomem só o trecho entre os marcadores):

| Campo | Valor |
|---|---|
| Status | **PROPOSTA do PO, não aprovada pelo jurídico.** Não afirma conformidade com o Código de Defesa do Consumidor (CDC) nem com o Decreto 7.962/2013. Até a aprovação, a página pública mostra "versão para revisão" (DEC-078, DEC-080) |
| Dono | product-owner; revisão: advogado do fundador |
| Data da proposta | 2026-11-20 |
| Tipo no sistema | `customer_terms` (`legal_documents`, versão imutável, aceite registrado) |
| Baseado em | `regras-de-negocio.md` RN-02, RN-04, RN-05, RN-07, RN-08, RN-09, RN-10, RN-11, RN-12, RN-18, RN-19; DEC-011, DEC-016, DEC-037, DEC-038, DEC-039, DEC-053, DEC-054, DEC-062, DEC-064, DEC-065, DEC-072; `prd/trocas.md`; `prd/pagamentos.md` |
| Regra de copy | **Nenhum texto escreve "2 h"** nem promete prazo único (DEC-054, DEC-064g): só a faixa estimada que o app mostra. Pagamento apresentado como um meio entre outros, sem destaque ao PIX (DEC-052) |
| Variáveis | `{{COMPANY_NAME}}`, `{{COMPANY_CNPJ}}`, `{{COMPANY_ADDRESS}}`, `{{SUPPORT_EMAIL}}`, `{{SUPPORT_WHATSAPP}}`, `{{DPO_EMAIL}}`, `{{SITE_URL}}`, `{{VIGENCIA}}`, `{{VERSAO}}` |
| Marcador de revisão | `[REVISAR JURÍDICO Jn]` inline; remover antes de publicar. Lista consolidada no fim |

<!-- TEXTO-PUBLICO-INICIO -->

## 1. Quem somos e o que é o Webag

O Webag é um aplicativo e site de compras que conecta você a lojas. Quem vende o produto é a loja. O Webag:

- mostra as lojas e os produtos;
- recebe o seu pedido e o repassa à loja;
- cobra o pagamento por meio do Mercado Pago;
- faz a entrega, por entregadores parceiros, ou libera a retirada na loja;
- cuida das trocas, dos estornos e do atendimento.

O Webag é operado por {{COMPANY_NAME}}, CNPJ {{COMPANY_CNPJ}}, com sede em {{COMPANY_ADDRESS}}. Atendimento: {{SUPPORT_EMAIL}} e WhatsApp {{SUPPORT_WHATSAPP}}. A identificação da loja que vende cada produto aparece na página da loja e no pedido. [REVISAR JURÍDICO J7: confirmar a descrição do papel do Webag (intermediário, cobrador e entregador) e a identificação da loja exigida pelo Decreto 7.962/2013, art. 2º.]

## 2. Aceite destes termos

Ao criar a conta ou usar o app, você declara que leu e aceita estes Termos e a [Política de Privacidade]({{SITE_URL}}/privacidade). Registramos a versão aceita, a data, a hora e a plataforma. Se você não concordar, não use o serviço. Estes Termos complementam a [Política de Trocas e Reembolsos]({{SITE_URL}}/termos/trocas), que faz parte deles.

## 3. Sua conta

- Você precisa ter 18 anos ou mais. [REVISAR JURÍDICO J17: autodeclaração de idade e ECA Digital.]
- Informe dados verdadeiros e mantenha-os atualizados: nome, e-mail, celular e, para entrega, um endereço correto e completo.
- A conta é pessoal. Não a compartilhe, nem a sua senha. O que acontecer com a sua conta por uso da sua senha é responsabilidade sua, até você nos avisar do problema.
- Pedimos que você confirme o seu e-mail com um código. Antes da confirmação, você pode fazer um primeiro pedido, e alguns recursos (como cupons da plataforma, exportação de dados e troca de e-mail) ficam bloqueados até confirmar.
- Podemos limitar ou bloquear a conta em caso de fraude, abuso, uso indevido ou descumprimento destes Termos, com aviso quando possível. Se achar que foi um engano, fale com o suporte.
- Você pode excluir a conta quando quiser, pelo app ou pelo site (veja a Política de Privacidade). Pedidos e trocas em andamento precisam ser concluídos antes.

## 4. Como funciona um pedido

- Cada pedido é de uma única loja. Se você adicionar um item de outra loja, o app pergunta se quer esvaziar a sacola.
- Você escolhe entrega ou retirada na loja (se a loja oferecer), confere o resumo e paga. Antes de pagar, o app mostra todos os valores, a forma de entrega e a faixa de horário estimada.
- Preços, estoque, horário da loja e frete são conferidos de novo ao pagar. Se algo mudou, o app mostra o que mudou e pede a sua confirmação. Você nunca é cobrado por valor diferente do mostrado.
- A loja pode estar fechada. Você pode montar a sacola, mas só consegue pagar com a loja aberta.
- Depois do pagamento, a loja tem 10 minutos para aceitar o pedido. Se ela recusar, cancelar ou não responder a tempo, o pedido é cancelado e você recebe o estorno total.
- Se um item acabar depois do aceite, a loja o marca como indisponível. Você recebe o estorno do valor do item e pode cancelar o pedido inteiro (estorno total) se ele ainda não tiver saído para entrega.
- A nota fiscal ou outro documento fiscal da venda é responsabilidade da loja. [REVISAR JURÍDICO J11: como o cliente pede nota com CPF, já que o Webag não repassa o CPF à loja.]

## 5. Preços, frete e taxas

- O preço de cada produto é definido pela loja e já inclui o que a loja repassa ao Webag.
- A taxa de entrega é cobrada pelo Webag e depende da distância entre a loja e o seu endereço. Ela aparece antes do pagamento e faz parte do total. Em algumas campanhas ou acima de certo valor de compra, a entrega pode ser gratuita; isso aparece no app.
- Pode haver pedido mínimo, informado no app.
- Pode haver taxa de serviço, informada antes do pagamento. Hoje não há taxa de serviço, e avisaremos antes de cobrar qualquer uma. [REVISAR JURÍDICO: manter ou retirar a frase, conforme a decisão do fundador sobre taxa de serviço (DEC-008).]
- O total do pedido é: produtos, menos descontos, mais a taxa de entrega e a taxa de serviço, se houver. Todos os valores são em reais.

## 6. Pagamento

- O pagamento é feito somente dentro do app ou do site, online, por um dos meios oferecidos no checkout (hoje, cartão de crédito e PIX), por meio do Mercado Pago. Não há pagamento em dinheiro nem na maquininha na entrega, e o entregador não cobra nada. O Webag nunca pede pagamento por mensagem, link de terceiros ou transferência.
- Os dados do cartão são digitados em página do Mercado Pago e nunca passam pelos servidores do Webag.
- No PIX, o código tem validade, mostrada na tela. Se vencer sem pagamento, o pedido expira e o estoque é liberado. Se você pagar depois de vencido, devolvemos o valor.
- No cartão, o parcelamento e os juros, se houver, são informados antes de você confirmar. O pagamento pode ser recusado ou ficar "em análise" pelo emissor ou pelo Mercado Pago, o que pode atrasar a confirmação do pedido.
- O Mercado Pago pode pedir o seu CPF. O Webag guarda só uma versão irreversível dele.
- O Mercado Pago é um serviço independente, com termos próprios.
- Se houver contestação do pagamento junto ao emissor do cartão (chargeback), o Webag e a loja podem tomar as providências cabíveis e solicitar informações a você.

## 7. Entrega

- Entrega Webag: depois que a loja deixa o pedido pronto, a operação do Webag escolhe um entregador parceiro para buscar e levar o pedido a você. [REVISAR JURÍDICO J8: natureza do entregador e sua descrição ao consumidor.]
- A entrega acontece dentro do horário de funcionamento da logística e da área atendida, informados no app. Fora do horário ou da área, o app oferece só a retirada, quando houver.
- O app mostra uma faixa estimada de chegada (por exemplo, "entre 15:40 e 16:40"), calculada pelo preparo da loja, pela espera pela coleta e pela distância. É uma estimativa baseada em regras do Webag, não uma hora exata. O Webag assume essa faixa como compromisso de entrega e, se ela não for cumprida, aplica o item 8. [REVISAR JURÍDICO J14: a faixa vincula como oferta (CDC arts. 30, 31 e 35); revisar a redação do compromisso.]
- Você é responsável por informar o endereço correto e estar disponível para receber. Pode informar uma observação (por exemplo, portaria).
- Código de entrega: o app pode mostrar um código, que você informa ao entregador na hora de receber. Não o envie a ninguém antes. Ele protege o seu pedido.
- Se não conseguirmos entregar por sua causa (você não está, recusa, ou o endereço não é encontrado), o entregador tenta contato. O Webag pode fazer uma nova tentativa sem custo para você; se a falha se repetir, a nova tentativa pode ser paga (valor informado antes) ou o pedido volta à loja e você recebe o estorno. [REVISAR JURÍDICO J9: hoje o estorno é total; ajustar se o fundador decidir cobrar a taxa de entrega em falha do cliente.]
- Você pode indicar outra pessoa para receber, informando o código a ela. O Webag não se responsabiliza por pedido entregue a quem apresentou o código correto.
- Retirada na loja: você retira com o código mostrado no app, dentro do prazo informado (hoje, 48 horas). Passado o prazo, o pedido pode ser cancelado.
- Se o app marcar o pedido como entregue e você não o recebeu, use a opção "Não recebi" no app. O pedido é considerado entregue automaticamente depois de 24 horas da saída para entrega, salvo se você nos avisar antes, quando abrimos uma apuração. [REVISAR JURÍDICO J14: confirmar o texto da baixa automática.]

## 8. Se a entrega atrasar

Se o pedido passar do fim da faixa estimada e de mais 15 minutos de tolerância:

- Você pode cancelar sem custo, com estorno total, incluindo a taxa de entrega. Se o pedido já saiu para entrega, você faz o pedido de cancelamento e a operação responde em até 10 minutos; sem resposta, o cancelamento é aceito e o pacote volta à loja.
- Você também pode continuar esperando e, mesmo assim, cancelar depois, até receber.
- Se o pedido for entregue depois desse prazo, você recebe entrega grátis no seu próximo pedido, na forma de um cupom pessoal de 30 dias, de 1 uso, válido só para entrega, que não pode ser transferido. O prazo e a compensação podem ser ajustados por nós para pedidos futuros, e o app mostra as regras vigentes.

Não há compensação quando: você cancelou o pedido; a falha de entrega foi sua (ausente ou recusou); o endereço não foi encontrado por informação sua (salvo se a operação concluir que a causa foi nossa); ou a entrega ocorreu dentro do prazo acima. A compensação não é reconhecimento de culpa e não afasta outros direitos seus. [REVISAR JURÍDICO J14 e J16: compensação, exceções e compatibilidade com o CDC, art. 35 (cumprimento da oferta, outro produto ou desfazer o contrato com restituição).]

## 9. Cancelamento do pedido

- Antes do pagamento: você cancela sem custo, e nada é cobrado.
- Depois do pagamento e até a loja começar a separar: você cancela no app, com estorno total e sem custo.
- Com a loja separando o pedido: você solicita o cancelamento. A loja aprova ou nega em 10 minutos; sem resposta, o pedido segue para a análise da operação. Aprovado, o estorno é total.
- Pedido pronto para coleta, a caminho ou pronto para retirada: o cancelamento só é feito pela operação, mediante pedido pelo suporte, com estorno total ou parcial conforme o caso. Depois de recebido, vale o direito de arrependimento (item 10).
- O Webag e a loja podem cancelar pedidos por indisponibilidade, suspeita de fraude ou falha de entrega, com estorno total.

## 10. Direito de arrependimento (7 dias)

Como a compra é feita à distância, você pode desistir da compra em até 7 dias corridos a partir do recebimento, sem dar motivo (CDC, art. 49), inclusive nas compras com retirada na loja. Você recebe de volta todos os valores pagos, incluindo a taxa de entrega, e a coleta do item é por conta do Webag, ou você pode levá-lo à loja. O pedido de desistência é feito no próprio app, no detalhe do pedido, e você recebe a confirmação de que o pedido foi recebido. Os detalhes estão na Política de Trocas e Reembolsos. [REVISAR JURÍDICO J1, J2, J3 e J6: frete devolvido, coleta por conta do fornecedor, prazo do reembolso ("de imediato") e itens sob medida, lacrados ou íntimos.]

## 11. Produto com defeito

Se o produto vier com defeito, avaria ou diferente do anunciado, você tem direitos pelo CDC (arts. 18 e 26): pode reclamar em até 30 dias, para produtos não duráveis, e em até 90 dias, para produtos duráveis, contados da entrega (ou de quando o defeito se mostrar, se for oculto). O app trata roupas e calçados como duráveis. A coleta é gratuita. Você pede a troca no app, com fotos, e a solução pode ser a troca por produto igual, o reparo ou o reembolso, conforme a lei. Veja a Política de Trocas e Reembolsos. [REVISAR JURÍDICO J1 e J4: prazos e se vestuário e calçado são duráveis.]

## 12. Troca por tamanho ou cor

Além dos direitos acima, muitas lojas oferecem troca por outro tamanho ou cor. É uma política comercial da loja, com prazo definido por ela (informado em cada produto), e não uma obrigação da lei. A loja pode recusar se o item estiver usado, sem etiqueta ou embalagem, fora do prazo ou se o produto não aceitar troca. Você pode trocar uma vez por pedido. Levando o item à loja, a troca é grátis. Se pedir a coleta em casa, há uma taxa de coleta e reentrega, que o app mostra antes de você confirmar e que só é cobrada depois que a loja aprovar a troca. Se a loja não responder em 24 horas, a troca é aprovada automaticamente. A taxa e as condições vigentes aparecem no app no momento do pedido de troca e valem para ele. [REVISAR JURÍDICO J5: taxa de troca, aprovação automática por silêncio da loja, e vinculação da oferta (CDC, art. 30).]

## 13. Reembolsos

O reembolso volta pelo mesmo meio de pagamento. O app mostra o valor, o meio e a situação do estorno. Os prazos variam conforme o meio:

- PIX: volta para a conta que pagou o PIX. Costuma levar até 1 dia útil.
- Cartão: aparece na fatura do cartão em até 2 faturas, conforme o seu banco.

[REVISAR JURÍDICO J16: o texto de prazo é informação adequada ou promessa de prazo?]

## 14. Cupons e promoções

Cupons têm regras próprias (validade, valor mínimo, limite de uso), mostradas no app. Um cupom por pedido. Cupons de primeira compra e da plataforma exigem e-mail confirmado e podem ser recusados em caso de uso em várias contas ou por quem trabalha na própria loja. O desconto da plataforma pode ser limitado por pedido. Cupons não são transferíveis nem trocáveis por dinheiro, e cupons pessoais não usados se perdem na exclusão da conta. Se o pedido for cancelado, o cupom volta, se ainda estiver na validade.

## 15. Avaliações e conteúdo que você publica

Você pode avaliar pedidos entregues (uma avaliação de loja por pedido e uma por produto), com nota de 1 a 5 e um comentário. A média só aparece depois de um número mínimo de avaliações. Escreva só a sua experiência, sem ofensas, dados pessoais de terceiros ou conteúdo ilegal. A loja pode responder uma vez. Qualquer pessoa pode denunciar uma avaliação, e o Webag remove conteúdo ofensivo, com dados pessoais ou ilegal, com registro do motivo. Não removemos uma avaliação só por ser negativa. Ao publicar, você autoriza o Webag e a loja a exibirem o texto no app, sem o seu nome completo, enquanto ele estiver publicado, e você pode apagá-lo.

## 16. Regras de conduta

Você se compromete a não:

- fraudar pedidos, pagamentos, cupons ou trocas (por exemplo, criar várias contas para usar o mesmo cupom, ou pedir arrependimento ou defeito sem motivo verdadeiro);
- usar dados de outra pessoa;
- ofender ou ameaçar lojas, entregadores ou a equipe;
- tentar acessar áreas ou dados que não são seus, burlar a segurança, copiar dados em massa ou fazer engenharia reversa do app;
- usar o serviço para fim ilegal.

O descumprimento pode levar ao cancelamento de pedidos, ao bloqueio da conta e a medidas legais.

## 17. Responsabilidades

- A loja é responsável pelo produto: descrição, qualidade, estoque, preço, preparo e documento fiscal.
- O Webag é responsável pelo que presta: o funcionamento do app, a cobrança por meio do Mercado Pago, a entrega e o atendimento.
- A lei pode atribuir ao Webag e à loja responsabilidade conjunta perante você, e nada nestes Termos limita os direitos que o CDC garante (arts. 7º, parágrafo único, 14, 18, 25, 34 e 51). Você pode cobrar de qualquer um deles. [REVISAR JURÍDICO J7: solidariedade do marketplace e responsabilidade por ato do entregador (CDC, art. 34).]
- Na medida permitida pela lei, o Webag não responde por: falhas de serviços de terceiros fora do nosso controle (internet, operadora, Mercado Pago, emissor do cartão); indisponibilidade temporária por manutenção ou força maior; informação incorreta que você forneceu (como o endereço); uso da sua conta por quem tinha a sua senha. [REVISAR JURÍDICO J19: redação e validade desta limitação (CDC, art. 51, I).]
- O app pode ficar fora do ar por manutenção ou problema técnico. Procuramos avisar quando possível.

## 18. Privacidade

Tratamos os seus dados como descrito na [Política de Privacidade]({{SITE_URL}}/privacidade). Em resumo: usamos só o necessário, a loja e o entregador recebem só o que precisam para entregar, e você pode exportar e excluir os seus dados.

## 19. Propriedade intelectual

O nome Webag, o logotipo, o app, o site e os textos são do Webag ou usados com licença. Você recebe uma licença pessoal, limitada, revogável e não exclusiva para usar o app. Os créditos de softwares e ícones de código aberto estão em Conta, Sobre, Licenças. Marcas e imagens das lojas são delas.

## 20. Atendimento e reclamações

- Fale com a gente: {{SUPPORT_EMAIL}} e WhatsApp {{SUPPORT_WHATSAPP}}, nos horários informados no app. Procuramos responder o mais rápido possível.
- Se não resolvermos, você pode usar o Procon da sua cidade e a plataforma pública consumidor.gov.br.
- Pedidos sobre dados pessoais: {{DPO_EMAIL}}.

## 21. Alterações destes Termos

Podemos alterar estes Termos. A versão em vigor está sempre em [{{SITE_URL}}/termos]({{SITE_URL}}/termos), com a data de vigência. Mudanças relevantes são avisadas no app e por e-mail, e pedimos o seu novo aceite no próximo uso; mudanças que não alteram seus direitos (por exemplo, correção de texto) valem na publicação. A mudança não alcança pedidos já pagos. Se não concordar, você pode excluir a conta. [REVISAR JURÍDICO J15: antecedência do aviso e efeito da recusa.]

## 22. Lei aplicável e foro

Estes Termos seguem as leis do Brasil. Para ações sobre a relação de consumo, fica garantido o foro do seu domicílio. [REVISAR JURÍDICO J19: foro do consumidor (CDC, art. 101, I).]

## 23. Versão e vigência

Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.

<!-- TEXTO-PUBLICO-FIM -->

## Lista consolidada [REVISAR JURÍDICO] destes Termos (NÃO publicar)

| Item | Onde | O que o advogado precisa decidir |
|---|---|---|
| J7 | 1, 17 | Papel do Webag (intermediário, cobrador, entregador); solidariedade do marketplace e por ato do entregador (CDC arts. 7º pu, 25 §1º, 34); identificação da loja (Decreto 7.962/2013 art. 2º) |
| J8 | 7 | Como descrever o entregador ao consumidor sem afirmar a natureza da relação |
| J9 | 7 | Falha de entrega por culpa do cliente: estorno total hoje; cobrar a taxa de entrega e nova tentativa paga |
| J11 | 4 | Documento fiscal e pedido de nota com CPF |
| J14 | 7, 8 | Faixa estimada como oferta; compensação por atraso; cancelamento sem custo; baixa automática em 24 h; ausência do "2 h" (DEC-054) |
| J16 | 8, 13 | Compensação e exceções (art. 35); prazos de estorno por meio como informação ou promessa |
| J1 a J6 | 10 a 12 | Prazos e custos de arrependimento e defeito; frete e coleta; "de imediato"; duráveis; taxa de troca; aprovação por silêncio; itens excluídos |
| J15 | 21 | Aviso de alteração e efeito da recusa |
| J17 | 3 | Maioridade e ECA Digital |
| J19 | 17, 22 | Cláusula de limitação de responsabilidade e foro (CDC arts. 51 e 101) |
| (sem J) | 5 | Taxa de serviço: manter ou retirar a frase (DEC-008) |
