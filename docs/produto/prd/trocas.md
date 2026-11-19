# PRD: Trocas ("Retira Troca")

Status: pronto para G3 (reescrito pela DEC-037; aguarda spec do Designer e parecer jurídico do fundador antes do G5) | Dono: product-owner | Data: 2026-11-19 | Histórias: WB-170 a WB-178 (reescritas) e WB-243 a WB-248 (novas)
Regras: RN-11 (tipos, estados, prazos, financeiro), RN-18 (corrida de coleta), RN-08 e RN-10 em `docs/produto/regras-de-negocio.md`. Origem: brief §3.1 (diferencial), §9; DEC-011 (piso legal fixo), DEC-037 (estratégia). Logística da coleta: `docs/produto/prd/logistica.md` (WB-241). Hipóteses: HIP-T01 a HIP-T12 em `docs/decisoes.md` (substituem HIP-017 a HIP-019 onde divergem).

## Problema
Quem sofre: Carla (medo de comprar roupa ou calçado local e não poder trocar) e Seu Marcos (troca por WhatsApp sem registro, prazo nem taxa clara). A Webag sofre de um terceiro lado: com logística própria, **cada troca gera 1 a 2 corridas de motoboy**, então "troca sempre grátis" quebra a conta (DEC-037). Evidência: a troca é um freio conhecido de compra de moda e calçado online `[HIPÓTESE; validar V3]`; marketplaces grandes tratam troca de tamanho como devolução mais recompra (ver §Comparação). Frequência: 5 a 15% dos pedidos de moda e calçado `[HIPÓTESE]`.

## Objetivo e métrica de sucesso
Trocar sem atrito para o cliente, sem prejuízo para a Webag e sem violar o CDC.
| Métrica | Meta `[HIPÓTESE; HIP-043]` |
|---|---|
| Troca por tamanho/cor pedida em **4 toques** (3 decisões: novo tamanho, como devolver, revisar; mais "Enviar"; 1 item, sem fotos; DEC-038b) | 100% (teste de usabilidade) |
| Loja responde dentro de 24 h (sem aprovação automática) | >= 70% |
| Trocas resolvidas em <= 7 dias da solicitação | >= 80% |
| Trocas que vão à mediação | < 15% |
| Taxa de troca / pedidos ENTREGUE (por loja e categoria) | < 15% (alerta acima de 25%) |
| Troca por tamanho resolvida como **troca** (não como arrependimento + recompra) no 1º a 7º dia | >= 60% |
| Custo líquido de logística de trocas por 100 pedidos (WB-248) | <= 20% da margem de logística `[HIPÓTESE; §Economia]` |
| Satisfação de quem trocou (nota 1-5) | >= 4,0 |

**Eventos:** `exchange_requested {type, reason}`, `exchange_approved {auto}`, `exchange_rejected`, `exchange_fee_paid`, `exchange_pickup_scheduled`, `exchange_item_received`, `exchange_completed {resolution}`, `exchange_contested`, `exchange_mediated {outcome}`, `exchange_expired`, `exchange_in_store {result}`, `size_chart_viewed`, `fit_feedback_submitted {fit}`. Sem dado pessoal.

## Fora do escopo (1.0)
Frete reverso por Correios/transportadora e etiqueta; crédito na loja ou vale-troca; troca entre lojas; garantia estendida ou contratual; peritagem técnica; chat na troca (usa WhatsApp); troca de produto por **outro produto** (só a mesma peça em outra variação, com diferença de preço quando houver, ou reembolso); reparo do produto pela loja (a loja pode oferecer por fora, a Webag oferece troca ou reembolso); app do motoboy (fase 2).

## Usuários e cenários
1. Carla pediu 38, cabe 37. Em "Meus pedidos" toca "Trocar" no item, escolhe o 37 e "Levar à loja (grátis)" ou "Coleta em casa (R$ 9,00, só se a loja aprovar)". A loja aprova em horas (ou o sistema aprova em 24 h). O motoboy coleta o 38; a loja confere; **só então** o 37 sai em uma segunda corrida (DEC-038f). Levando à loja, o 37 é entregue no balcão na hora.
2. Carla se arrepende em 3 dias: "Desistir da compra", sem custo, reembolso total com a taxa de entrega.
3. Produto com defeito: fotos obrigatórias; coleta grátis; troca ou reembolso; a loja contesta na inspeção e o admin media.
4. Marcos recebe a fila, aprova (ou deixa o prazo correr), confere o item que chega e libera a resolução.
5. O admin (Yago) vê o relatório: a loja X tem 30% de troca por tamanho em calçados; pede tabela de medidas ou ajusta a taxa.

## Os 3 tipos de troca e a base legal
Esta tabela é a fonte do que é **piso legal** (fixo, não editável por ninguém, DEC-011 e DEC-023b) e do que é **política** (configurável). Texto de lei conferido por fontes secundárias porque o site do Planalto não abriu neste ambiente: **[confirmar] cada artigo no texto oficial antes do G5**.

| | 1. Arrependimento | 2. Defeito ou avaria (vício) | 3. Tamanho ou cor (voluntária) |
|---|---|---|---|
| Base legal | CDC art. 49 (compra fora do estabelecimento, 7 dias, "a qualquer título", valores devolvidos de imediato e atualizados); Decreto 7.962/2013 art. 5 (informar os meios, exercer pela mesma ferramenta da compra, confirmação imediata do recebimento do pedido) | CDC art. 18 caput (responsabilidade solidária dos fornecedores), §1º (30 dias para sanar; depois o consumidor escolhe: substituição, restituição ou abatimento), §3º (vício essencial: sem esperar); art. 26 I e II (reclamar em 30 dias, não durável, e 90 dias, durável), §1º (conta da **entrega efetiva**) e §3º (vício oculto: a partir de quando aparece) | **Nenhuma obrigação legal**: é política comercial. Se a loja ou a Webag **anuncia**, vincula (CDC art. 30, oferta) |
| Prazo | 7 dias corridos do recebimento (dia da entrega ou retirada) | 30 dias (não durável) ou 90 dias (durável), da entrega; padrão do app: categoria durável = 90 `[HIPÓTESE; jurídico]` | Prazo da **loja**: padrão 7 dias, mínimo 3 e máximo 30 (admin); 0 = não aceita |
| Precisa de motivo? | Não | Sim, com fotos (1 a 5) | Sim (tamanho ou cor), foto opcional |
| Loja pode recusar? | **Não** | Só após a inspeção, com prova; vai à mediação | Sim: fora do prazo, item usado, sem etiqueta ou sem embalagem; sempre com motivo |
| Custo ao cliente | **Zero.** Reembolso integral **inclui a taxa de entrega**; coleta por conta da Webag (o STJ, REsp 1.340.604/RJ, atribui ao fornecedor os custos da devolução em venda à distância; fonte secundária, **[confirmar] a ementa**) ou "Levar à loja" | **Zero.** Coleta grátis | **Taxa de coleta e reentrega** da tabela do admin por região (padrão = taxa de entrega da região), cobrada **só depois que a loja aprova**; "Levar à loja" é **grátis**; zerável por região ou campanha |
| Resolução | Reembolso (mesmo meio de pagamento) | Troca por igual, ou reembolso | Mesma peça em outra variação com estoque (reservada ao aprovar), com diferença de preço; ou reembolso se não houver estoque |
| Conta no limite de 1 troca por pedido? | Não | Não | **Sim** (1 por pedido) `[HIPÓTESE]` |
| Quem aprova | Automático e imediato | Loja em 24 h; sem resposta, **aprovação automática da coleta** (a resolução depende da inspeção) | Loja em 24 h; sem resposta, **aprovação automática** `[HIPÓTESE, DEC-037]` |

Nota sobre direito de arrependimento e retirada: o contrato é fechado no app, então vale também quando o cliente **retira na loja** (a compra foi à distância). A Webag exibe os meios de exercer o direito de forma clara (Decreto 7.962/2013) e envia **confirmação imediata** do recebimento do pedido de desistência (WB-178 C7).

## Comparação com marketplaces e varejistas
Fontes: buscas na web em 2026-11-19; as **páginas oficiais não abriram** (domínios bloqueados) ou não apareceram, então tudo abaixo é fonte secundária e vai marcado **[confirmar]** na Central de Ajuda de cada empresa.

| Quem | Prazo | Troca de tamanho | Frete de devolução | Observação (fonte) |
|---|---|---|---|---|
| Mercado Livre | Devolução em 7 dias (CDC); 30 dias só para tecnologia desde 1/4/2024 | **Não troca**: cancela e compra de novo (Tecnoblog, 2021, pode estar desatualizado) | Devolução grátis na maioria (site de cupons, fraca) | Roupas e calçados aceitos com etiqueta e sem uso; reembolso começa ~3 dias úteis após a chegada (Canaltech). [confirmar] |
| Shopee | 7 dias gerais; até 30 dias para divergência ou defeito (guias de terceiros) | Não achei | Depende do motivo: Shopee ou vendedor (guias); arrependimento só devolve o frete se o vendedor ofereceu frete grátis (1 fonte, **conflita com o CDC e o Idec**) | Blog da Shopee: reembolso inicia em 7 dias úteis após a postagem; roupa íntima, banho, maquiagem usada e itens de adultos não são devolvíveis. Multa de mais de R$ 750 mil por não devolver dinheiro a arrependidos (Correio 24 horas, 2025). [confirmar] |
| Magalu | Não achei a página oficial | Não achei | Não achei | Só o quadro legal geral. [confirmar] |
| Amazon Brasil | Roupas e calçados até 30 dias, novos e com etiqueta (blog de e-commerce) | Não achei | Fontes **se contradizem** (grátis x tarifa de processamento) | [confirmar] |
| Renner | Loja física 30 dias; online 7 dias (guia de terceiros) | Troca em loja (política da empresa) | Não achei | [confirmar] |
| C&A | 30 dias após o recebimento (site de cupons); troca em loja física ou pelos Correios | Em loja | Não achei coleta em casa | [confirmar] |
| Zattini | 30 dias; primeira troca grátis; coleta pelos Correios sem custo (Promobit, Consumidor Moderno antigo); 60 dias foi temporário na pandemia | Sim | Grátis na 1ª troca | Reclamações de demora na análise (5 dias úteis). [confirmar] |
| **Webag (DEC-037)** | Arrependimento 7 dias; defeito 30/90; tamanho/cor 7 (loja, 3 a 30) | **Sim: a Webag coleta e depois entrega a peça nova (2 corridas), com o tamanho reservado; na loja, troca na hora** | Arrependimento e defeito: Webag; tamanho/cor: taxa pequena só se a loja aprovar; **na loja, grátis** | Taxa só após aprovação; 1 troca por pedido; reserva do tamanho novo |

**Leitura crítica:** (1) nenhum concorrente que achei cobra o cliente por uma troca de tamanho por coleta; os grandes usam devolução + recompra (ML) ou 1ª troca grátis (Zattini). Cobrar uma taxa é **risco de conversão**, mitigado pela troca na loja grátis, pela taxa baixa e por só cobrar depois da aprovação. (2) O diferencial real da Webag é "a Webag busca a peça, o tamanho novo fica reservado e entregamos a nova", que ML e Shopee não fazem; a DEC-038f impede a peça nova de sair antes da antiga conferida, então **a troca em casa é mais lenta que desistir e recomprar** (ver §Economia). (3) Cuidado com o Shopee: a regra de "frete só se o vendedor ofereceu frete grátis" é exatamente o que a Webag **não pode** copiar, porque contraria o CDC art. 49 (reembolso "a qualquer título").

## Economia da troca (hipóteses para decidir a taxa)
Números `[HIPÓTESE]`: pedido médio R$ 80; comissão 15% = R$ 12,00; taxa de entrega R$ 9,00 (faixa de 2 a 5 km); custo do motoboy R$ 9,00 por corrida (apps pagam de R$ 7,50 a R$ 10 de piso e motoboys pedem R$ 10 + R$ 2,50/km em SP, março/2026; fontes em `decisoes.md`). **A troca em casa são 2 corridas** (coleta; depois, com a peça antiga conferida, reentrega: DEC-038f), ou seja R$ 18,00. Cobra-se a taxa de troca = R$ 9,00 (padrão = taxa de entrega).

| Cenário | Receita Webag | Custo motoboy | Resultado Webag | Diferença contra o pedido sem troca (+R$ 12,00) |
|---|---|---|---|---|
| Pedido sem troca | 12,00 + 9,00 | 9,00 | **+12,00** | 0 |
| Troca por tamanho, coleta em casa (2 corridas) | 21,00 + 9,00 (taxa de troca) | 9,00 + 18,00 | **+3,00** | -9,00 |
| Troca por tamanho, levando à loja | 21,00 | 9,00 | **+12,00** | 0 |
| Defeito, coleta grátis e reentrega | 21,00 | 9,00 + 18,00 | **-6,00** | -18,00 |
| **Arrependimento com coleta** (estorno total devolve comissão e taxa) | 0 | 9,00 + 9,00 | **-18,00** | **-30,00** |
| Arrependimento e **recompra** de outro tamanho (2 pedidos) | 0 + 21,00 | 18,00 + 9,00 | **-6,00** (2 pedidos) | -18,00 (de +12,00 para -6,00) |

Em 100 pedidos (8 trocas por tamanho com coleta, 4 arrependimentos com coleta, 2 defeitos): margem-base R$ 1.200 menos R$ 72, R$ 120 e R$ 36 = **R$ 972**, uma perda de ~19%. Três conclusões:
1. A taxa de troca **cobre metade** do custo das 2 corridas; com taxa zerada (campanha) o resultado da troca vai a -R$ 18,00.
2. **Um arrependimento custa mais de 3 vezes uma troca por tamanho.** O arrependimento é livre por lei nos 7 primeiros dias e a Webag **não pode esconder nem dificultar** (Decreto 7.962/2013).
3. **Para o cliente, trocar e desistir-e-recomprar custam o mesmo** (R$ 9,00: a taxa de troca, ou a nova taxa de entrega da recompra, porque a original é devolvida), e a recompra é **mais rápida** (chega em cerca de 1 h; a troca em casa leva dias por causa da coleta e da conferência). A troca só ganha se tiver vantagem clara: **tamanho reservado**, **grátis na loja** e **taxa menor que a entrega**. Alavancas: a coluna "taxa de troca" da tabela (WB-236) permite cobrar, por exemplo, 50% da taxa de entrega (resultado da troca em casa vai a -R$ 1,50 contra -R$ 18,00 do arrependimento, a Webag ainda perde menos), e o fluxo de desistência traz a troca como alternativa **não obstrutiva** (WB-170 C13). Medir a proporção "resolvida como troca" no piloto.

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-TRO-01 | Pedir troca pelo app: 3 tipos, prazos "Você tem até DD/MM", 4 toques no caso simples | 170 |
| RF-TRO-02 | Acompanhar status | 171 |
| RF-TRO-03 | Loja: fila, aprovar/recusar em 24 h, recebimento e resolução | 172-174 |
| RF-TRO-04 | Taxa de coleta e reentrega pela tabela do admin, só após a aprovação | 175 |
| RF-TRO-05 | Contestação e mediação do admin | 176 (+ WB-110) |
| RF-TRO-06 | Prazos e aprovação automática (SLA 24 h) | 177 |
| RF-TRO-07 | Arrependimento (CDC art. 49) | 178 |
| RF-TRO-08 | Troca na loja (grátis) | 243 |
| RF-TRO-09 | Produto sem troca voluntária | 244 |
| RF-TRO-10 | Diferença de preço na troca | 245 |
| RF-TRO-11 | Tabela de medidas e "como vestiu?" (reduzir troca na origem) | 246, 247 |
| RF-TRO-12 | Relatório de trocas (loja e categoria) | 248 |
| RF-TRO-13 | Coleta e reentrega pela logística da Webag | WB-241 (`logistica.md`) |
| RF-TRO-14 | Exibir política e filtro "aceita troca" | WB-014, WB-016, WB-059 |

## Regras de negócio
RN-11 (completa e atualizada). Pontos-chave:
- Arrependimento (7 dias corridos) e defeito (30 ou 90 dias) são **piso legal**, fixos e não editáveis por nenhum perfil (PARAMETER_LOCKED); a loja só define a troca voluntária (aceita, prazo dentro de min e máx do admin).
- Prazo conta da **entrega confirmada** (estado ENTREGUE da corrida, WB-233), nunca da data do pedido; a tela mostra "Você tem até DD/MM" por motivo.
- **1 troca voluntária por pedido** (pode incluir vários itens); arrependimento e defeito não entram nesse limite; item já trocado só volta por defeito.
- **Taxa de troca só após a aprovação da loja**, valor congelado na aprovação, paga em até `troca_taxa_pagamento_h` (48 h); recusa nunca gera cobrança; troca levando à loja = R$ 0; a taxa é **receita da Webag** (não da loja) e pode ser zerada por região ou campanha no admin.
- **SLA da loja 24 h** (`troca_resposta_h`), com lembretes em 12 h e em 4 h do fim; sem resposta, aprovação automática (arrependimento é imediato, sem esperar).
- **Reserva** do novo tamanho ao aprovar (libera se cancelar ou expirar); só aparecem tamanhos com estoque. **A peça nova só sai depois da antiga conferida** pela loja (DEC-038f), exceto na troca na loja; a troca em casa são 2 corridas (coleta e reentrega), cobertas pela taxa de troca.
- **Diferença de preço** (WB-245): paga ou estornada na hora da aprovação.
- **Itens sem troca voluntária:** definidos pela categoria (admin) e pela loja no produto; arrependimento e defeito continuam valendo (conservador; ver Perguntas).
- Reembolso em até 3 dias úteis após ITEM_RECEBIDO `[HIPÓTESE; o art. 49 pede devolução "de imediato": ver Perguntas]`; comissão devolvida proporcionalmente (RN-10); em arrependimento a **taxa de entrega também** volta ao cliente.

## Requisitos não funcionais
- **Fotos:** até 5 imagens, JPG/PNG, até 5 MB cada, comprimidas no app; armazenadas privadas, visíveis ao cliente, à loja do pedido e ao admin; EXIF e localização removidos (LGPD).
- **Offline:** rascunho no aparelho e envio ao voltar a conexão (a foto pode ser reenviada).
- **Auditoria:** toda decisão (aprovar, recusar, aprovar automático, mediar) grava ator (inclusive "sistema"), hora e motivo.
- **Segurança:** só o dono do pedido abre a troca; a loja só vê trocas dos pedidos dela (autorização por objeto); admin e logística veem o mínimo (endereço de coleta só em corrida ativa).
- **Acessibilidade:** fluxo em até 4 toques no caso simples, texto curto, alvo >= 56 px, prazo e custo lidos no rótulo.
- **LGPD:** foto de produto pode conter pessoa ou cenário; aviso "Fotografe só o produto"; retenção das fotos por 6 meses após o encerramento `[HIPÓTESE; security valida]`.

## Histórias e critérios de aceite

### WB-170 Pedir troca no app — Must — dep: WB-027, WB-059, WB-244
Como cliente, quero pedir troca ou devolução de um item entregue em poucos toques, para resolver sem sair de casa.
- **C1** Dado pedido ENTREGUE dentro de algum prazo (RN-11), então vejo "Trocar" ou "Desistir da compra" em cada item elegível; fora de todos os prazos, vejo "Prazo encerrado" com a data de cada um.
- **C2** Dado o passo de motivo, então vejo os 4 motivos (arrependimento, defeito, tamanho, cor), cada um com **"Você tem até DD/MM"** e o custo escritos (ex.: "Tamanho errado: até 25 nov. Levando à loja é grátis; em casa custa R$ 9,00, só se a loja aprovar"); motivo fora do prazo ou não aceito aparece **inerte com o motivo escrito** ("Prazo encerrado em 12 nov"); tocar nele só explica, sem erro (DEC-024b).
- **C3** Dado motivo "defeito", então exijo 1 a 5 fotos; nos demais, fotos são opcionais.
- **C4** Dado "tamanho" ou "cor", então escolho a variação desejada entre **as que têm estoque**; sem estoque, vejo "Sem estoque nesse tamanho. Quer o reembolso?" (muda a resolução).
- **C5** Dado a loja sem troca voluntária (prazo 0), prazo voluntário vencido, ou produto marcado "sem troca voluntária" (WB-244), então "tamanho" e "cor" aparecem **inertes com o motivo** ("Essa loja não faz troca por tamanho ou cor", "Prazo encerrado em [data]", "Este produto não tem troca por tamanho"); arrependimento e defeito seguem ativos dentro do piso legal.
- **C6** Dado item com solicitação aberta, então "Trocar" não aparece e vejo o status; dado pedido que já teve uma troca voluntária (limite de 1 por pedido), então "tamanho" e "cor" aparecem inertes com "Este pedido já teve uma troca" e defeito e arrependimento seguem ativos.
- **C7** Dado enviar, então crio a troca SOLICITADA, notifico a loja (WB-193) e vejo o protocolo e "A loja responde em até 24 h; se não responder, aprovamos".
- **C8** Dado sem conexão, então salvo como rascunho com aviso e envio depois (prazo conta da data em que o cliente iniciou `[HIPÓTESE]`).
- **C9** Dado o passo "Como devolver", então vejo "Levar até a loja (grátis)" com endereço e horário, e "Coleta em casa" com o valor da tabela e o texto "cobrada só se a loja aprovar" (só em tamanho/cor; só se o endereço está em região atendida e a logística aberta); em defeito e arrependimento ambas são "sem custo para você". Em "Coleta em casa" escolho uma janela preferida (dia e período), que a logística confirma (WB-241).
- **C10** Dado o caso simples (1 item de 1 unidade, tamanho ou cor, sem fotos), então o pedido de troca leva **4 toques a partir de "Meus pedidos"**: 3 decisões (novo tamanho, como devolver, conferir a revisão) mais "Enviar pedido de troca", sem digitar nada (DEC-038b aceitou 4 toques); o fluxo tem no máximo 4 telas e o item e o motivo vêm pré-selecionados a partir do botão "Trocar" do item; verificado no teste de usabilidade.
- **C11** Dado arrependimento, então o texto "Devolva o produto sem sinais de uso além do razoável" aparece antes de enviar (WB-178 C4) e a opção **não é escondida** nem desestimulada.
- **C12** Dado "tamanho" ou "cor" escolhidos dentro dos 7 dias, então a tela mostra, em texto neutro, "Você também pode desistir da compra sem custo" com link para o fluxo de arrependimento (transparência, Decreto 7.962/2013).
- **C13** Dado o fluxo de **arrependimento**, então, abaixo da confirmação e sem bloquear nada, há a linha "Era o tamanho? Você pode trocar por outro" com link para o fluxo de troca; o botão de desistir continua sendo a ação principal `[HIPÓTESE; jurídico valida que não obstrui]`.

### WB-171 Acompanhar a troca — Must — dep: WB-170
Como cliente, quero ver o status da troca, para saber o próximo passo.
- **C1** Dado a troca, então vejo a linha do tempo (solicitada, aprovada, devolução, recebida pela loja, reembolso ou novo envio, concluída) com data e o "próximo passo" em uma frase (ex.: "Leve o 38 à loja até 27 nov", "O motoboy chega amanhã das 14h às 18h").
- **C2** Dado mudança de status, então recebo push (WB-193) e a tela atualiza.
- **C3** Dado recusa, então vejo o motivo da loja e o botão "Contestar" (WB-176) até `contestacao_dias`.
- **C4** Dado reembolso, então vejo valor, forma e previsão (até 3 dias úteis após o item recebido) e, em arrependimento, que **o valor inclui a taxa de entrega**.
- **C5** Dado "Cancelar troca" antes da coleta, então vira CANCELADA, a taxa de troca já paga é estornada e a reserva do tamanho novo é liberada.
- **C6** Dado aprovação automática por tempo, então vejo "Aprovada automaticamente: a loja não respondeu em 24 h".

### WB-172 Loja: fila de trocas e decisão — Must — dep: WB-170, WB-075
Como lojista, quero ver e decidir as trocas, para atender dentro do prazo de 24 h.
- **C1** Dado a fila, então vejo as trocas por prazo restante (24 h), com pedido, itens, motivo, fotos, tipo e a política aplicada; permissão "trocas" necessária.
- **C2** Dado "Aprovar", então a troca vira APROVADA e o cliente é notificado.
- **C3** Dado "Recusar" em troca voluntária, então exijo motivo; recusa por fora do prazo ou do limite de 1 troca por pedido é permitida com o motivo correspondente.
- **C4** Dado arrependimento, então "Recusar" não existe (RN-11) e a troca já nasce APROVADA; dado defeito, "Recusar" exige justificativa e vai à mediação (não é final).
- **C5** Dado sem resposta em `troca_resposta_h` (24 h), então segue WB-177 C1 (aprovação automática); a loja recebe lembretes em 12 h e 4 h antes do fim e vê "Aprovada automaticamente" no histórico.
- **C6** Dado nenhuma troca, então "Nenhuma troca pendente".
- **C7** Dado a loja ver que o cliente vai levar o item à loja (WB-243), então a troca aparece em "Chegando na loja" com o prazo.

### WB-173 Recebimento e inspeção do item — Must — dep: WB-172, WB-241
Como lojista, quero confirmar o recebimento e a inspeção, para liberar a resolução.
- **C1** Dado devolução "Coleta em casa", então a **Webag coleta** (WB-241); a loja **não agenda coleta** e vê o status da corrida ("Motoboy a caminho do cliente", "Item a caminho da loja"); dado devolução "Levar à loja", então o cliente apresenta o código da troca no balcão (WB-243).
- **C2** Dado o item chegando à loja, então marco "Item recebido" e escolho a inspeção: OK ou "Reprovar" (motivo + foto); a inspeção confere **só** os critérios da política (sem uso, etiqueta, embalagem; em defeito, se o defeito procede).
- **C3** Dado cliente ausente na coleta, então segue WB-241 C4 (até 2 reagendamentos; na 3ª, EXPIRADA, sem devolver a taxa se a falha foi do cliente).
- **C4** Dado inspeção reprovada, então a troca vai à mediação (WB-110); a loja não recusa unilateralmente após o recebimento; arrependimento não pode ser reprovado por motivo que não seja sinal de uso além do razoável.
- **C5** Dado item recebido OK, então marco se ele volta ao estoque (RN-06; defeito: padrão "não").
- **C6** Dado item recebido e **sem confirmação da loja em 48 h** `[HIPÓTESE]`, então alerta ao admin e a troca segue com a confirmação do motoboy como evidência.

### WB-174 Resolução: reposição ou reembolso — Must — dep: WB-173, WB-154
Como cliente e lojista, quero concluir a troca com a peça nova ou o dinheiro de volta, para encerrar.
- **C1** Dado troca por variação e estoque disponível, então o sistema **reserva a unidade ao aprovar**; a peça nova **só sai depois da antiga conferida** pela loja (inspeção OK, DEC-038f): na troca na loja, a loja a entrega no balcão na hora; na coleta em casa, a loja marca "Pronto para reentrega" e nasce a corrida REENTREGA_TROCA (WB-241); a troca vira CONCLUIDA (trocada) quando a peça nova é entregue.
- **C2** Dado arrependimento ou ausência de estoque da variação, então a resolução é reembolso: após ITEM_RECEBIDO o sistema estorna o valor do item **e a taxa de entrega paga** (arrependimento) em até 3 dias úteis, e a troca vira CONCLUIDA (reembolsada). Em tamanho/cor sem estoque: reembolso do item, **sem devolver a taxa de entrega original** (o serviço foi prestado) `[HIPÓTESE; jurídico]`.
- **C3** Dado reembolso, então comissão e taxa de entrega devolvidas proporcionalmente (RN-10) e o ledger é atualizado; o custo da coleta vira custo de logística da Webag (WB-238 C4).
- **C4** Dado falha do estorno, então a troca fica "Reembolso pendente" com retentativa e alerta ao financeiro (WB-154 C5).
- **C5** Dado reposição com preço diferente, então segue WB-245.
- **C6** Dado concluir, então o cliente pode avaliar a experiência (nota 1-5, opcional).

### WB-175 Taxa de troca (coleta e reentrega) — Must — dep: WB-170, WB-154, WB-236
Como Webag, quero cobrar uma taxa pequena pela coleta e reentrega da troca voluntária, para a logística não dar prejuízo.
- **C1** Dado troca por tamanho/cor com "Coleta em casa" e taxa > 0, então o cliente vê o valor **antes de enviar** ("cobrada só se a loja aprovar"), mas **não paga ao solicitar** (HIP-D09, DEC-024e). Só depois da aprovação, a troca fica "Aprovada, taxa pendente" e o cliente paga por PIX ou cartão; a taxa é cobrada **uma vez**, com **valor congelado na aprovação**.
- **C2** Dado o valor, então vem da tabela do admin (coluna "taxa de troca" da faixa e do escopo do **endereço de coleta**; padrão = taxa de entrega); pode ser R$ 0 por região ou campanha e nunca excede `taxa_coleta_max_cents`.
- **C3** Dado recusa da loja, então **não há cobrança nem estorno**. Dado cancelamento pelo cliente após pagar a taxa e antes da coleta, então a taxa é estornada integralmente.
- **C4** Dado defeito, arrependimento ou devolução "Levar à loja", então a taxa é R$ 0 e a troca nunca entra em "taxa pendente".
- **C5** Dado a taxa, então é **receita da Webag** (não da loja), cobrada em pagamento separado do pedido; o ledger a lança como receita de logística e o custo da corrida como custo (WB-238); o provedor cobra a própria taxa `[a forma de cobrar na conta da Webag é decisão do backend (ADR), porque o split é por loja]`.
- **C6** Dado troca "Aprovada, taxa pendente" sem pagamento em `troca_taxa_pagamento_h` (48 h; lembrete em 24 h), então vira CANCELADA com o motivo "Taxa de troca não paga", a reserva é liberada e o cliente é avisado; pode pedir de novo ou escolher "Levar à loja".
- **C7** Dado falha no pagamento da taxa, então a troca segue "Aprovada, taxa pendente" e o cliente pode tentar de novo até o prazo de C6; pagamento confirmado por webhook cria a corrida (WB-241) e notifica a loja.
- **C8** Dado troca por reposição aprovada, então o estoque da variação nova é reservado na aprovação mesmo com a taxa pendente; se C6 cancelar, a reserva é liberada.
- **C9** Dado aprovação automática por SLA (WB-177), então o mesmo fluxo de taxa se aplica a partir do instante da aprovação automática.

### WB-176 Contestar recusa e mediação — Must — dep: WB-171, WB-110
Como cliente, quero contestar uma recusa, para ter uma segunda análise.
- **C1** Dado troca RECUSADA há <= `contestacao_dias` (7), então "Contestar" abre campo de texto (até 500 caracteres) e permite fotos adicionais.
- **C2** Dado contestação, então a troca vai a EM_MEDIACAO e o admin e a loja são notificados.
- **C3** Dado decisão do admin (WB-110), então a troca vira APROVADA (segue o fluxo, inclusive a taxa) ou RECUSADA_FINAL; as partes recebem a justificativa.
- **C4** Dado prazo de contestação vencido, então o botão some e vejo "Prazo para contestar encerrado".
- **C5** Dado a recusa final, então o cliente vê que ainda pode procurar órgãos de defesa do consumidor (texto informativo, sem promessa).

### WB-177 Prazos automáticos e aprovação por SLA — Must — dep: WB-172
Como sistema, quero aplicar os prazos, para nenhuma troca ficar parada.
- **C1** Dado troca SOLICITADA sem resposta da loja em `troca_resposta_h` (24 h), então: arrependimento já nasceu aprovada; **tamanho/cor e defeito são aprovados automaticamente** (ator "sistema") e a resolução do defeito continua sujeita à inspeção (WB-173 C4); cliente, loja e admin são notificados.
- **C2** Dado lembrete, então a loja recebe aviso com 12 h e 4 h para o fim do prazo (WB-193).
- **C3** Dado APROVADA sem item entregue em `coleta_entrega_item_dias` (7), então EXPIRADA e o cliente é avisado antes (D-2).
- **C4** Dado ITEM_RECEBIDO sem resolução em `reembolso_dias_uteis`, então alerta ao financeiro.
- **C5** Dado mediação acima de `mediacao_dias_uteis`, então "Atrasado" no admin (WB-110).
- **C6** Dado fim de semana e feriado, então dias úteis são contados sem eles (RN-16: sem feriados na 1.0).
- **C7** Dado aprovação automática de troca **voluntária** que a loja considera indevida, então ela pode abrir "Contestar aprovação" só **antes** da coleta, com motivo, e a troca vai à mediação; depois da coleta vale a inspeção.

### WB-178 Arrependimento (CDC art. 49) — Must — dep: WB-170
Como cliente, quero desistir da compra em até 7 dias, para exercer meu direito.
- **C1** Dado pedido ENTREGUE (entrega ou retirada), então por 7 dias corridos a partir do dia do recebimento vejo "Desistir da compra" sem precisar justificar.
- **C2** Dado a solicitação, então é aprovada **na hora**, sem análise da loja (a loja é notificada) e a Webag organiza a coleta grátis ou o cliente leva à loja.
- **C3** Dado ITEM_RECEBIDO, então o reembolso integral (item e taxa de entrega) segue WB-174 C2.
- **C4** Dado inspeção reprovada por sinais de uso além do razoável, então vai à mediação (WB-173 C4); o texto "sem sinais de uso" aparece ao cliente antes de enviar.
- **C5** Dado o 8º dia, então a opção some; defeito e política da loja continuam valendo.
- **C6** Dado texto exibido, então segue minuta revisada pelo fundador/jurídico antes de G5.
- **C7** Dado o pedido de desistência enviado, então o cliente recebe a **confirmação imediata** do recebimento (push, in-app e e-mail com protocolo; Decreto 7.962/2013 art. 5).
- **C8** Dado o fluxo, então os meios para desistir ficam visíveis no detalhe do pedido (S7) e na política da loja, nunca só em termos de uso.

### WB-243 Troca na loja (grátis) — Must — dep: WB-170, WB-172
Como cliente, quero levar o item à loja e trocar sem pagar nada, para ter a opção mais barata.
- **C1** Dado "Levar até a loja", então a troca vira APROVADA (quando a loja aprova ou o SLA aprova) e o cliente vê o **código da troca** de 6 caracteres, o endereço, o horário e "Leve até DD/MM".
- **C2** Dado o cliente no balcão, então a loja informa o código no painel (WB-173), confere o item e escolhe OK ou Reprovar; com OK e a peça nova em estoque, entrega o novo item na hora e marca "Novo item entregue".
- **C3** Dado a troca na loja, então a taxa é sempre R$ 0, não há corrida e o cliente não paga nada, em qualquer tipo.
- **C4** Dado código incorreto, então "Código incorreto" (5 tentativas, depois o admin).
- **C5** Dado a reserva do novo tamanho, então vale até `coleta_entrega_item_dias` (7); passado o prazo sem o cliente aparecer, a troca EXPIRA e libera a reserva.
- **C6** Dado a loja fechada, então o app mostra o horário e "Abre às HH:MM"; o prazo da troca continua correndo.

### WB-244 Produto sem troca voluntária — Must — dep: WB-060, WB-106
Como lojista e admin, quero marcar o que não aceita troca por tamanho ou cor, para não trocar peça íntima ou sob medida.
- **C1** Dado o cadastro de produto, então há a opção "Não aceita troca por tamanho ou cor" com motivo escolhido (sob medida ou personalizado, íntimo ou de higiene, outro); o cliente vê o aviso na página do produto e no checkout **antes** de comprar.
- **C2** Dado categorias (admin), então cada categoria tem o atributo "troca voluntária permitida" (padrão sim; lingerie, meias íntimas, higiene e cosméticos abertos: não, `[HIPÓTESE]`) e o atributo "durável" (padrão sim: defeito 90 dias; consumíveis: não, 30 dias; WB-106).
- **C3** Dado produto marcado ou categoria sem troca, então "tamanho" e "cor" aparecem inertes com o motivo (WB-170 C5); **arrependimento e defeito continuam oferecidos** (a exceção de itens personalizados e lacrados exige parecer jurídico antes de mudar).
- **C4** Dado a marca mudar depois da compra, então o pedido mantém o que valia na compra (snapshot, como WB-059 C3).
- **C5** Dado produto marcado sem motivo, então erro no campo (RN-17).

### WB-245 Diferença de preço na troca — Should — dep: WB-174, WB-154
Como cliente, quero pagar ou receber só a diferença quando o tamanho novo tem preço diferente, para não refazer o pedido.
- **C1** Dado reposição por variação com preço próprio diferente, então a diferença é `preço vigente hoje da variação nova - preço vigente hoje da original`; se as duas valem o mesmo hoje, a diferença é **R$ 0** mesmo que o cliente tenha pago preço promocional (promoção expirada não cobra mais).
- **C2** Dado diferença positiva, então é cobrada **junto da taxa de troca**, em um só pagamento, depois da aprovação (HIP-D09); a comissão incide sobre a diferença (RN-10).
- **C3** Dado diferença negativa, então o valor é estornado ao cliente (estorno parcial, WB-154) quando o item é recebido; a comissão é devolvida proporcionalmente.
- **C4** Dado o cliente não querer pagar a diferença, então escolhe outra variação ou o reembolso.
- **C5** Dado a diferença e a taxa, então a tela mostra as duas linhas e o total antes da aprovação do cliente.
- **C6** Dado a 1.0 sem esta história pronta, então o fluxo cai para "reembolso do item e novo pedido" (contorno manual); por isso é Should.

### WB-246 Tabela de medidas — Should — dep: WB-060, WB-017
Como lojista, quero cadastrar as medidas do produto, para o cliente escolher o tamanho certo e eu receber menos trocas.
- **C1** Dado o cadastro de produto (categoria de moda ou calçado), então posso preencher "Tabela de medidas": linhas = tamanhos (puxados das variações), até `medidas_max_colunas` (6) medidas com nome livre ou modelo ("Busto", "Cintura", "Comprimento", "Pé em cm"), valores de até 12 caracteres, mais "Como medir" (até 300 caracteres).
- **C2** Dado a página do produto, então o cliente vê "Tabela de medidas" (folha/modal legível a 150% e com rolagem horizontal acessível) quando preenchida, e vê "A loja não informou as medidas" se a categoria for de moda e estiver vazia.
- **C3** Dado a loja, então o painel mostra "X de Y produtos de moda sem tabela" como lembrete (sem bloquear a publicação).
- **C4** Dado copiar de outro produto ("Usar a mesma tabela"), então preenche sem digitar de novo; erro de tamanho que não existe nas variações é apontado.
- **C5** Dado o admin, então mede se a taxa de troca por tamanho é menor em produtos com tabela (WB-248), para validar a hipótese `[HIPÓTESE]`.

### WB-247 "Como vestiu?" na avaliação — Should — dep: WB-031
Como cliente, quero dizer como o tamanho serviu, para ajudar quem vai comprar.
- **C1** Dado avaliação de produto de categoria de moda ou calçado, então há a pergunta opcional "Como vestiu?" com "Ficou pequeno", "Ficou no tamanho" ou "Ficou grande" e o tamanho comprado já preenchido.
- **C2** Dado ao menos `como_vestiu_min_exibicao` (5) respostas, então a página do produto mostra "X% disseram que veste no tamanho" (e a maioria de pequeno ou grande); com menos, não mostra.
- **C3** Dado a resposta, então não é editável depois de enviada (como a avaliação, RN-12) e não é obrigatória para publicar a nota.
- **C4** Dado trocas por tamanho abertas para o mesmo produto, então o admin vê a correlação no relatório (WB-248).
- **C5** Dado a pergunta não aplicável (categoria sem tamanho), então não aparece.

### WB-248 Relatório de trocas (admin) — Should — dep: WB-177, WB-239
Como admin, quero ver trocas por loja e categoria, para ajustar a taxa, pedir tabela de medidas e achar abuso.
- **C1** Dado período e filtros (cidade, loja, categoria, tipo, motivo), então vejo: pedidos ENTREGUE, trocas por tipo, taxa de troca, trocas por tamanho com e sem tabela de medidas, resolvida como troca x arrependimento, aprovação automática, mediações, tempo até resolver.
- **C2** Dado custo, então vejo a receita da taxa de troca, o custo das corridas e o **custo líquido de logística das trocas** (WB-241 C6).
- **C3** Dado loja com taxa de troca acima de `troca_taxa_alerta_pct` (25), então destaque e alerta (WB-198).
- **C4** Dado exportar, então CSV auditado; período sem dados: "Sem dados neste período"; totais conferem com a lista de trocas.
- **C5** Dado perfis, então operação e financeiro veem; só super admin e financeiro veem custos.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| **Arrependimento domina a troca por tamanho** nos 7 dias (grátis para o cliente, 5 vezes mais caro à Webag) | Risco de margem | Troca mais atraente (peça nova na viagem, grátis na loja), alternativa não obstrutiva (WB-170 C13), medir no piloto |
| Parecer jurídico: frete de devolução e reembolso do frete em arrependimento; reembolso "de imediato" x após o recebimento; 90 dias para duráveis (e se vestuário é durável); exceções de itens personalizados, lacrados e íntimos; cobrar taxa em troca voluntária; aprovação automática por silêncio; solidariedade do marketplace (CDC art. 7º pu, 25 §1º, 34) | **Risco jurídico: revisão do fundador/advogado antes do G5** | Marcado `[validar]`; piso legal fixo; lista de perguntas abaixo |
| Aprovação automática de troca voluntária pode irritar a loja e gerar churn | Risco de adoção | Lembretes em 12 h e 4 h; só vale dentro da política e do limite de 1 por pedido; inspeção na chegada; contestação antes da coleta (WB-177 C7) |
| Cliente fraudando (item usado, outro item) | Risco financeiro | Fotos, inspeção, mediação, 1 troca por pedido, relatório por cliente |
| Taxa de troca é receita da Webag, não da loja, mas o split é por loja | Risco técnico | Backend decide a cobrança na conta da Webag (ADR); sem isso, fallback: taxa dentro da `application_fee` de um pedido de troca |
| Troca consome estoque e a peça nova pode esgotar | Risco de estoque | Reserva ao aprovar; só tamanhos com estoque |
| Coleta depende da logística aberta e de motoboy (WB-241); a peça nova só sai depois da conferência (DEC-038f), então a troca em casa leva dias | Dependência e risco de experiência | Janela confirmada; SLA de conferência da loja de 24 h `[HIPÓTESE]`; "Levar à loja" (na hora) sempre disponível |
| Falta de dado de custo real do motoboy | Hipótese | Taxa editável; relatório WB-248 |

## Perguntas em aberto (revisão jurídica do fundador)
| Pergunta | Quem responde |
|---|---|
| Confirmar o texto oficial dos arts. 18, 26 e 49 do CDC e do art. 5 do Decreto 7.962/2013 (o Planalto não abriu neste ambiente) | fundador/advogado |
| Reembolso do frete (taxa de entrega) e coleta grátis em arrependimento: confirmar o REsp 1.340.604/RJ | fundador/advogado |
| Reembolso "de imediato" (art. 49, parágrafo único) x "até 3 dias úteis após o item recebido" | fundador/advogado |
| Vestuário e calçado são produtos duráveis (90 dias) para o art. 26? Padrão atual: sim | fundador/advogado |
| Cobrar taxa de coleta em troca por tamanho é lícito se informado antes? Aprovação automática por silêncio da loja vale entre as partes (Termos do Lojista)? | fundador/advogado |
| Itens personalizados, lacrados e íntimos podem excluir o **arrependimento**? Hoje nenhum exclui | fundador/advogado |
| Responsabilidade da Webag como marketplace e por ato do motoboy (CDC art. 7º pu, 25 §1º, 34) | fundador/advogado |
| Quem arca com o custo da coleta em defeito e arrependimento: na 1.0 a Webag absorve (DEC-016: sem desconto da loja); cobrar da loja só por cláusula | fundador |
| Retenção das fotos (6 meses) e do histórico | security-engineer |
