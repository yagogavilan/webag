# Termos do Lojista (PROPOSTA para revisão do advogado)

Metadados (NÃO publicar; o web e o seed consomem só o trecho entre os marcadores):

| Campo | Valor |
|---|---|
| Status | **PROPOSTA do PO, não aprovada pelo jurídico.** É contrato de adesão entre a Webag e o lojista: as cláusulas de comissão, ressarcimento, suspensão e dados do cliente são o ponto mais sensível (J12, J20, J21) |
| Dono | product-owner; revisão: advogado do fundador e contador (J11) |
| Data da proposta | 2026-11-20 |
| Tipo no sistema | `merchant_terms` (aceito pelo dono; funcionário aceita só termos de uso e privacidade, WB-117 C2) |
| Baseado em | DEC-016, DEC-020, DEC-035, DEC-036, DEC-037, DEC-038, DEC-039, DEC-053 a DEC-054, DEC-063, DEC-064, DEC-071, DEC-072; `regras-de-negocio.md` RN-02, RN-04, RN-08, RN-09, RN-10, RN-11, RN-13, RN-14, RN-16, RN-18; `prd/lojista.md`; `prd/trocas.md`; `prd/pagamentos.md` |
| Números [HIPÓTESE] no texto | teto de cobertura de estorno (R$ 300), limite de loja nova (R$ 500, 30 dias, 20 pedidos), aceite em 10 minutos, resposta de troca em 24 horas, análise da loja em 2 dias úteis: todos são parâmetros editáveis no admin; o texto os cita como "valores atuais" |
| Variáveis | `{{COMPANY_NAME}}`, `{{COMPANY_CNPJ}}`, `{{COMPANY_ADDRESS}}`, `{{SUPPORT_EMAIL}}`, `{{SUPPORT_WHATSAPP}}`, `{{DPO_EMAIL}}`, `{{SITE_URL}}`, `{{FORO_COMARCA}}`, `{{AVISO_MUDANCA_DIAS}}`, `{{VIGENCIA}}`, `{{VERSAO}}` |
| Marcador de revisão | `[REVISAR JURÍDICO Jn]` inline; remover antes de publicar. Lista consolidada no fim |

<!-- TEXTO-PUBLICO-INICIO -->

## 1. O que são estes Termos

Estes Termos regulam o uso do painel do lojista e a venda de produtos pelo Webag, entre {{COMPANY_NAME}}, CNPJ {{COMPANY_CNPJ}}, com sede em {{COMPANY_ADDRESS}} ("Webag"), e a pessoa física ou jurídica que cadastra uma loja ("Lojista" ou "você"). Ao aceitar, quem aceita declara ter poderes para representar a loja.

- O Webag é um marketplace: ele mostra a sua loja ao cliente, recebe o pedido e o pagamento, faz a entrega e cuida da troca e do atendimento. A venda do produto é feita por você ao cliente.
- Você é responsável por seus produtos, preços, estoque, qualidade, preparo e documentos fiscais.
- Você não é empregado, sócio nem representante do Webag, e o Webag não é empregador dos seus funcionários. Não há exclusividade: você pode vender em outros canais.
- Estes Termos complementam os Termos de Uso do Cliente e a Política de Trocas e Reembolsos, que você declara conhecer, e a Política de Privacidade. [REVISAR JURÍDICO J12: natureza do contrato e a relação de consumo ou empresarial entre Webag e lojista.]

## 2. Cadastro e aprovação da loja

- Pode ter loja quem tem CPF ou CNPJ (inclusive MEI) e capacidade para contratar. Cada CPF ou CNPJ pode ter uma loja. Cada loja liga a uma conta do Mercado Pago.
- Você informa dados verdadeiros e envia os documentos pedidos (por exemplo, documento com foto, comprovante de endereço da loja e cartão CNPJ). Declara que a loja é responsável fiscal pelas vendas.
- A loja só aparece para clientes depois de aprovada pelo Webag. Hoje a análise leva até 2 dias úteis; se faltar algo, pedimos correção e o prazo pausa até você reenviar. O Webag pode recusar o cadastro com motivo. Cadastro recusado não pode ser refeito pelo painel; fale com o suporte.
- A loja "no ar" precisa ter ao menos um produto ativo e a conta do Mercado Pago conectada.
- Trocar o nome ou o CPF ou CNPJ da loja depois da aprovação exige nova análise. Até a decisão, a loja continua vendendo com os dados antigos.
- Os documentos são vistos apenas por pessoas autorizadas do Webag, e cada acesso é registrado. Documentos de loja recusada são apagados em 90 dias; os da loja ativa ficam durante o contrato e por 5 anos depois, por obrigação fiscal. [REVISAR JURÍDICO J15 e J12: prazos e base legal.]
- Para novas lojas, o Webag pode limitar a exposição (hoje, até R$ 500 por pedido, 30 dias ou 20 pedidos, o que ocorrer primeiro). Os valores são ajustáveis e informados no painel. [REVISAR JURÍDICO J21.]

## 3. Conta de recebimento no Mercado Pago

- O pagamento dos pedidos é dividido automaticamente pelo Mercado Pago: a parte da loja vai para a conta do Mercado Pago que você conectar e a parte do Webag (comissão e taxas) vai para o Webag. O Webag não retém, ajusta nem desconta valores do que cabe a você depois da divisão.
- Só o dono conecta a conta, confirmando a senha. O titular da conta do Mercado Pago deve ter o mesmo CPF ou CNPJ da loja. Se for diferente, a venda fica bloqueada até a análise do Webag.
- A conta do Mercado Pago é sua e segue os termos do Mercado Pago, inclusive os prazos de liberação do dinheiro, tarifas e regras de saque.
- A tarifa do Mercado Pago sobre o pagamento é descontada do seu valor. O painel mostra uma estimativa ("cerca de R$ X"); o valor real é o do Mercado Pago. [REVISAR JURÍDICO J12: quem arca com a tarifa quando há estorno (a tarifa não volta).]
- Você mantém a conta conectada e com saldo ou limite para estornos (item 7).

## 4. Preço, comissão e "Você recebe"

- A comissão é um percentual do valor das vendas que fica com o Webag. Ela é definida por loja, com um padrão geral e, às vezes, por categoria de produto, e aparece no painel, no onboarding e no formulário de produto. O percentual atual da sua loja é o mostrado no painel.
- Você cadastra o preço do produto já incluindo a comissão. O painel mostra "Você recebe": o preço menos a comissão menos a estimativa da tarifa do Mercado Pago. É uma estimativa.
- A comissão é calculada sobre o valor dos produtos depois do cupom da loja e antes do cupom da plataforma, e é fixada no momento do pagamento do pedido. Mudanças futuras não alteram pedidos já pagos.
- A taxa de entrega e a taxa de troca são cobradas do cliente e são do Webag. A loja não recebe frete e não define taxa de entrega nem raio.
- Cupons: o cupom da loja é custo da loja. O cupom da plataforma é custo do Webag e é limitado ao que o Webag recebe por pedido, e não reduz o valor que cabe a você.
- Exemplo ilustrativo, com números de exemplo: produtos de R$ 100,00, cupom da loja de R$ 10,00, comissão de 15%, entrega de R$ 8,00. A comissão é 15% de R$ 90,00, ou R$ 13,50. O cliente paga R$ 98,00. Se a tarifa do Mercado Pago for de R$ 0,97, você recebe R$ 90,00 menos R$ 13,50 menos R$ 0,97, ou R$ 75,53. O Webag recebe R$ 13,50 de comissão mais R$ 8,00 de entrega.
- Mudanças de comissão: o Webag pode alterar o percentual da sua loja para pedidos futuros, avisando com pelo menos {{AVISO_MUDANCA_DIAS}} dias, no painel e por e-mail. Se você não concordar, pode encerrar a loja antes da mudança valer. [REVISAR JURÍDICO J20: alteração unilateral de comissão em contrato de adesão e prazo de aviso. Hoje o aviso automático foi cortado do produto (DEC-071): a operação precisa avisar na mão.]
- A emissão de nota fiscal e o pagamento de tributos sobre as suas vendas são seus. O Webag emite nota sobre as suas próprias receitas (comissão e taxas). [REVISAR JURÍDICO J11: contador do fundador.]

## 5. Pedidos

- Novo pedido: o painel avisa, com som e alerta, e por e-mail. Você tem 10 minutos para aceitar ou recusar. Há lembrete aos 5 minutos. Sem resposta, o pedido é cancelado e o cliente recebe estorno total. O valor de 10 minutos é o atual e pode ser ajustado pelo Webag.
- Recusar ou cancelar exige motivo. Recusa, cancelamento e perda de prazo por culpa da loja contam no índice de cancelamento. Acima de um percentual definido pelo Webag, a operação é alertada e pode conversar com você ou suspender a loja (item 13).
- Mantenha preço, estoque, horário de funcionamento e pausas corretos. Você deve entregar exatamente o que o cliente comprou, em boa condição e com a qualidade anunciada. Produto indisponível após o aceite deve ser marcado, e o cliente é reembolsado do item.
- Você é responsável pela legalidade e pela adequação dos produtos que vende e pela descrição verdadeira deles. É proibido vender o que a lei proíbe ou restringe (por exemplo, armas, medicamentos controlados, falsificados, produtos que exigem autorização que a loja não tem). O Webag pode remover qualquer produto ou conteúdo que descumpra as regras.

## 6. Preparo, "pronto para coleta" e entrega pela Webag

- Você prepara o pedido e marca "pronto para coleta" quando ele estiver pronto e embalado. A partir daí, o Webag despacha um entregador, e o pedido entra na fila da logística do Webag.
- O entregador se identifica na loja. Entregue o pedido a quem estiver ligado ao pedido (nome do cliente e número do pedido) e, se a loja usar, confira o código mostrado.
- Quem marca "saiu para entrega" e "entregue" é a operação do Webag, e não a loja. Se o pacote voltar à loja por falha de entrega, a loja confirma o recebimento.
- Retirada na loja: você entrega o pedido com o código de retirada mostrado pelo cliente. Mantenha o pedido pronto pelo prazo informado.
- O custo do entregador é do Webag. Se o preparo atrasar e fizer o pedido passar da faixa prometida ao cliente, o Webag compensa o cliente, e o motivo "loja demorou" entra no seu índice. O Webag não cobra a compensação de você. Atrasos repetidos podem levar a ajuste do tempo de preparo da loja ou a suspensão. [REVISAR JURÍDICO J12 e J14: confirmar que a compensação por atraso fica com o Webag.]
- A logística do Webag funciona em horário definido por cidade e pode ser pausada pela operação; nesses casos, o app só oferece retirada na loja. O Webag não garante horário nem volume de pedidos.

## 7. Trocas, devoluções e ressarcimento

### 7.1 Regras que a loja não pode mudar

- Arrependimento (7 dias corridos do recebimento, CDC art. 49): a loja não pode recusar. O pedido é aprovado na hora, o Webag organiza a coleta do item e o reembolso inclui a taxa de entrega.
- Defeito ou avaria (30 dias para produtos não duráveis e 90 para duráveis, CDC arts. 18 e 26): o cliente envia fotos. A loja responde em 24 horas; se não responder, a coleta é aprovada automaticamente. A resolução final (troca, reparo ou reembolso) depende da inspeção; a recusa precisa de prova e pode ir à mediação do Webag.
- Esses direitos vêm da lei e não podem ser desligados, encurtados nem condicionados por nenhuma loja. [REVISAR JURÍDICO J1, J2 e J4.]

### 7.2 Troca por tamanho ou cor (política da loja)

- A loja decide se aceita troca por tamanho ou cor e o prazo, dentro do mínimo e do máximo definidos pelo Webag (hoje, de 3 a 30 dias; padrão de 7). Você pode marcar produtos que não aceitam essa troca (por exemplo, sob medida, personalizados, íntimos ou de higiene). Arrependimento e defeito continuam valendo mesmo nesses produtos. [REVISAR JURÍDICO J6.]
- A loja pode recusar a troca se o item estiver usado, sem etiqueta ou embalagem, fora do prazo ou se o limite de uma troca por pedido tiver sido atingido, sempre com motivo.
- Se a loja não responder em 24 horas, a troca é aprovada automaticamente. Você declara conhecer e aceitar essa regra. [REVISAR JURÍDICO J5.]
- A taxa de coleta e reentrega da troca é do Webag, vem de uma tabela do Webag e não é definida nem recebida pela loja.
- Na reposição, o estoque do novo tamanho ou cor fica reservado a partir da aprovação. A peça nova só sai depois de a loja conferir a peça devolvida, salvo nas trocas feitas na loja. A diferença de preço é cobrada ou devolvida ao cliente pelo Webag, na hora.
- A loja confirma o recebimento do item devolvido no painel.
- A loja informa se o item pode voltar ao estoque; item com defeito não volta ao estoque por padrão.

### 7.3 Ressarcimento: quem paga os estornos e as contestações

- No pagamento dividido, o estorno ao cliente sai da conta do Mercado Pago da loja. Você deve manter saldo ou limite para isso. Estornos e contestações de pagamento (chargebacks) de pedidos da sua loja são de sua responsabilidade, inclusive quando a loja recebeu e não entregou, entregou item errado ou com defeito, ou perdeu a contestação.
- A comissão do Webag é devolvida de forma proporcional ao estorno, e a tarifa do provedor de pagamento não volta.
- Se faltar saldo na sua conta e o estorno for recusado, o Webag poderá, a seu critério, pagar o cliente por você, até um teto por pedido (hoje, R$ 300, ajustável), e cobrar você do valor pago, com os meios legais, sem prejuízo da suspensão da loja. O Webag não faz desconto automático em valores futuros. [REVISAR JURÍDICO J21: cláusula de ressarcimento (DEC-016, DEC-020a e f), teto, forma de cobrança, juros e multa, e validade em contrato de adesão.]
- O custo das corridas de coleta e reentrega de arrependimento e defeito é do Webag. O Webag só pode cobrar custos da loja se houver cláusula específica aceita por ela; esta cláusula não os cobra.

## 8. Pagamento, extrato e prazos

- O valor de cada pedido é dividido no pagamento (item 3). O Webag não agenda repasse: o dinheiro cai na sua conta do Mercado Pago, e a liberação segue as regras do Mercado Pago.
- O painel mostra o extrato por pedido: total, comissão, estorno e valor líquido previsto. Em caso de divergência com o Mercado Pago, vale o registro do Mercado Pago, e ajustaremos o painel.
- Você tem acesso aos relatórios de venda conforme as permissões da loja.

## 9. Dados do cliente e privacidade

- O Webag e a loja tratam dados do cliente por conta própria: o Webag é responsável pelos dados da conta e do pedido; a loja é responsável pelos dados que recebe para entregar o pedido e emitir a nota fiscal. Você deve cumprir a LGPD (Lei 13.709/2018). [REVISAR JURÍDICO J12: papéis e base legal da loja.]
- Você vê o nome do cliente e os itens. O telefone e o endereço de entrega só aparecem enquanto o pedido está em andamento, e somem depois que ele termina. Você nunca vê e-mail, CPF nem outros endereços.
- Use os dados do cliente apenas para preparar, entregar e documentar o pedido e atender reclamações dele. É proibido usá-los para marketing, listas, contato fora do pedido, redes sociais, revenda ou cessão, ou copiá-los para fora do painel. Se o cliente pedir, o Webag atende por você; encaminhe-nos qualquer pedido de titular que chegar.
- O dono controla quais funcionários veem pedidos e dados do cliente. Funcionários sem permissão de pedidos não veem nenhum dado. O dono responde pelo uso feito por seus funcionários.
- Avise o Webag em até 24 horas se souber de acesso indevido, perda ou vazamento de dados de clientes (e-mail {{DPO_EMAIL}}). [REVISAR JURÍDICO J12: prazo de aviso de incidente.]
- O Webag registra acessos e pode auditar o uso. O descumprimento pode levar a suspensão, rescisão, responsabilização por perdas e comunicação às autoridades.
- Os seus dados e os da loja são tratados conforme a [Política de Privacidade]({{SITE_URL}}/privacidade).

## 10. Catálogo, imagens e avaliações

- Você garante que tem direito sobre as fotos, textos e marcas que publica e concede ao Webag uma licença para exibi-los no app, no site e em materiais do Webag enquanto a loja existir, sem exclusividade e sem custo. [REVISAR JURÍDICO: confirmar o alcance da licença.]
- As fotos e descrições devem ser verdadeiras. A loja é responsável pela tabela de medidas que informar.
- Avaliações: você pode responder uma vez a cada avaliação, com respeito. Avaliações negativas não são removidas por esse motivo. O Webag remove avaliações ofensivas, com dados pessoais ou ilegais.
- O Webag pode moderar, ocultar ou remover produtos e conteúdos que violem estes Termos ou a lei.

## 11. Equipe da loja

O dono pode convidar funcionários com permissões separadas. Dinheiro, conta de recebimento e equipe são só do dono. Funcionário não vê valores de venda por padrão. O dono é responsável pelos atos dos funcionários e deve retirar o acesso de quem sai da loja.

## 12. Responsabilidades e indenização

- A loja é responsável perante o cliente e o Webag pelos produtos, pela entrega correta e pelas obrigações fiscais e trabalhistas da própria loja.
- A lei pode atribuir ao Webag responsabilidade conjunta com a loja perante o consumidor. Quando o Webag pagar ou for condenado por algo causado pela loja (produto, descrição, preparo, fiscal), você deve ressarcir o Webag, que fica com o direito de cobrar de você. [REVISAR JURÍDICO J7 e J21: direito de regresso.]
- O Webag não garante volume de vendas, funcionamento ininterrupto do app, nem horário de entrega específico, e não responde por falhas de terceiros fora do seu controle (internet, Mercado Pago, WhatsApp), na medida permitida em lei.
- O Webag só responde, perante você, por danos diretos comprovados que causar, na medida permitida em lei. [REVISAR JURÍDICO J19: limitação de responsabilidade.]

## 13. Suspensão e fim da parceria

- O Webag pode suspender ou encerrar a loja, com motivo informado, em caso de: dados falsos; descumprimento destes Termos; fraude, ou suspeita séria dela; ausência de entrega depois de receber o pagamento; saldo insuficiente recorrente para estornos; produtos proibidos; índice alto de cancelamento ou de atraso; uso indevido de dados de clientes; ordem de autoridade. Em casos graves, a suspensão é imediata.
- Loja suspensa deixa de aparecer no app. Você continua responsável pelos pedidos já feitos, e o Webag pode estornar pedidos pendentes e cobrar de você, nos termos do item 7.3.
- Você pode encerrar a loja a qualquer momento, pedindo ao suporte, depois de concluir os pedidos, estornos e trocas em andamento. Você pode pausar a loja sozinho a qualquer hora.
- Se o dono excluir a conta, a loja é encerrada junto, depois de concluídos os pedidos em aberto.
- O Webag pode encerrar o contrato sem motivo, com aviso de {{AVISO_MUDANCA_DIAS}} dias. Depois do encerramento, continuam valendo: os itens 7.3, 9 e 12, as obrigações fiscais e as guardas de dados exigidas por lei. [REVISAR JURÍDICO J20: rescisão sem motivo, aviso e eventuais indenizações.]

## 14. Alterações destes Termos

Podemos alterar estes Termos. A versão em vigor fica no painel e em [{{SITE_URL}}/termos/lojista]({{SITE_URL}}/termos/lojista). Mudanças relevantes são avisadas no painel e por e-mail com pelo menos {{AVISO_MUDANCA_DIAS}} dias de antecedência, e o dono precisa aceitar a nova versão no próximo uso. Sem aceite, o painel não segue; você pode encerrar a loja. A versão aceita, a data, a hora e a plataforma ficam registradas. [REVISAR JURÍDICO J20: aceite eletrônico e valor de prova.]

## 15. Lei aplicável e foro

Estes Termos seguem as leis do Brasil. Fica eleito o foro da comarca de {{FORO_COMARCA}}, com renúncia a qualquer outro, por mais privilegiado que seja. [REVISAR JURÍDICO J19: foro de eleição em contrato de adesão.]

## 16. Contato

Suporte: {{SUPPORT_EMAIL}} e WhatsApp {{SUPPORT_WHATSAPP}}. Dados pessoais: {{DPO_EMAIL}}.

## 17. Versão e vigência

Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.

<!-- TEXTO-PUBLICO-FIM -->

## Lista consolidada [REVISAR JURÍDICO] destes Termos (NÃO publicar)

| Item | Onde | O que o advogado precisa decidir |
|---|---|---|
| J12 | 1, 2, 3, 6, 9 | Natureza do contrato (adesão, empresarial ou consumo); loja como controladora própria; base legal para dados de lojista; prazo de aviso de incidente |
| J20 | 4, 13, 14 | Alteração unilateral de comissão e dos Termos; prazo de aviso `{{AVISO_MUDANCA_DIAS}}`; rescisão sem motivo; aceite eletrônico; hoje o aviso automático foi cortado (DEC-071) |
| J21 | 2, 7.3, 12 | Cláusula de ressarcimento (DEC-016, DEC-020a, DEC-020f): teto de cobertura R$ 300, limite de loja nova R$ 500/30 dias/20 pedidos, cobrança do que a Webag adiantar, juros, multa, regresso; validade em contrato de adesão |
| J1, J2, J4, J5, J6 | 7 | Piso legal de arrependimento e defeito; duráveis; aprovação automática por silêncio (24 h); itens que não aceitam troca voluntária |
| J7 | 12 | Responsabilidade conjunta e direito de regresso contra a loja |
| J11 | 4 | Tributos da loja e NFS-e da Webag (contador) |
| J14 | 6 | Compensação por atraso a cargo da Webag |
| J15 | 2 | Prazos de guarda de documentos |
| J19 | 12, 15 | Limitação de responsabilidade; foro de eleição |
| (sem J) | 10 | Alcance da licença de imagens e textos |
