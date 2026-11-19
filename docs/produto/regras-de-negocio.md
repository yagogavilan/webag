# Regras de Negócio — Webag 1.0

Status: rascunho para G3 | Dono: product-owner | Data: 2026-11-18 | Atualizado: 2026-11-19 (DEC-035 comissão, DEC-036 logística da Webag, DEC-037 trocas: RN-02, RN-04, RN-07, RN-09, RN-10, RN-11, RN-13, nova RN-18)
Fonte única das regras numéricas. PRDs e histórias citam `RN-xx` e `HIP-0xx` (hipóteses em `docs/decisoes.md`). Mudou valor: muda aqui e em `decisoes.md`, nunca só no código.

## RN-01 Dinheiro e arredondamento
- Valores em centavos (inteiro). Exibição `R$ 1.234,56`.
- Percentuais aplicados sobre centavos com arredondamento half-up por linha; a soma das partes é sempre igual ao total (a diferença de centavo vai para o lojista).
- Fuso de todas as regras de horário: `America/Sao_Paulo`.

## RN-02 Parâmetros configuráveis no admin (WB-119)
Todo valor abaixo vive em tabela de parâmetros editável (super admin), com histórico e auditoria. "Padrão" é o valor de seed. A alteração vale em até 60 s (mesmo cache das flags) e a edição usa controle de versão (409 se outro admin alterou a mesma chave antes; WB-119 C6, R-22). Os pisos legais de troca são exceção: não são editáveis por ninguém.

| Chave | Padrão | Faixa | Hipótese |
|---|---|---|---|
| `comissao_padrao_pct` | **15,00** `[HIPÓTESE; o fundador confirma o valor padrão]` (era 10; o fundador usa 15% como exemplo, DEC-035) | 0-30 | HIP-C01 (substitui HIP-001) |
| `taxa_servico_tipo` / `taxa_servico_valor` | nenhuma / 0 | fixa em centavos ou %, teto próprio | HIP-003 |
| `pix_expiracao_min` | 15 | 5-60 | HIP-006 |
| `loja_aceite_timeout_min` / `loja_aceite_lembrete_min` | 10 / 5 | 3-30 | HIP-008 |
| `parcelas_max` / `parcela_min_cents` | 3 / 3000 | 1-12 / 1000+ | HIP-011 |
| `pedido_max_cents` | 200000 | 10000+ | HIP-012 |
| `raio_max_km` (global; **a loja não tem raio próprio**, DEC-036b; `raio_padrao_km` deixou de existir) | 15 | 1-50 | HIP-013, HIP-L04 |
| `taxa_entrega_tabela` (tabela, não escalar): escopo padrão/cidade/bairro x até 6 faixas `[de,ate)` km com taxa de entrega, taxa de troca, custo previsto e deslocamento (min) | padrão `[HIPÓTESE]`: 0-2 km R$ 8,00; 2-5 km R$ 10,00; 5-10 km R$ 14,00; 10-15 km R$ 18,00 | taxa R$ 0 a R$ 50 | HIP-L01, WB-236 |
| `pedido_minimo_cents` / `frete_gratis_acima_cents` (globais; opcional por cidade) | 2000 / 0 (desligado) | 0-20000 / 0 ou > mínimo | HIP-L12, DEC-036b |
| `logistica_horario` (por cidade) | seg a sáb 09:00-20:00 | n/a | HIP-L10 |
| `logistica_sla_atribuir_min` / `logistica_sla_atribuir_critico_min` / `logistica_alerta_entrega_min` | 10 / 20 / 60 | 1-120 | HIP-L06 |
| `entrega_reentrega_max` | 1 | 0-3 | HIP-L07 |
| `codigo_entrega` (flag, WB-226): recomendado **ligado** para entrega Webag | ligado `[HIPÓTESE]` | flag | HIP-L05 |
| `retirada_distancia_max_km` | 10 | 1-30 | HIP-013 |
| `retirada_prazo_horas` | 48 | 12-168 | HIP-038 |
| `auto_conclusao_entrega_h` | 24 | 6-72 | HIP-038 |
| `repasse_periodicidade` / `repasse_carencia_dias` | semanal (segunda) / 7 | semanal, quinzenal / 0-30 | HIP-015 |
| `troca_arrependimento_dias` | 7 | **fixo 7, somente leitura para todos os perfis** (DEC-011, DEC-023b) | HIP-017 |
| `troca_defeito_dias` | 30 | **fixo 30, somente leitura para todos os perfis** (DEC-011, DEC-023b) | HIP-017 |
| `troca_defeito_duravel_dias` | 90 (categoria "durável", padrão do app `[HIPÓTESE; jurídico]`) | **fixo 90, somente leitura** | HIP-T01 |
| `troca_voluntaria_dias_padrao` / `troca_voluntaria_dias_min` / `troca_voluntaria_dias_max` (a loja escolhe dentro de min e máx; 0 = não aceita) | 7 / 3 / 30 | 0-30 | HIP-T01 (DEC-037) |
| `troca_voluntaria_max_por_pedido` | 1 | 1-3 | HIP-T02 |
| `taxa_coleta_max_cents` (teto da taxa de troca da tabela; a loja **não** define taxa) | 3000 | 0-10000 | HIP-T05 (substitui HIP-018) |
| `troca_resposta_h` (SLA da loja; sem resposta, aprovação automática) | **24** (era 48) | 6-72 | HIP-T03 (substitui HIP-019) |
| `troca_taxa_alerta_pct` (taxa de troca por loja que gera alerta) | 25 | 5-100 | WB-248 |
| `como_vestiu_min_exibicao` / `medidas_max_colunas` / `medidas_max_linhas` | 5 / 6 / 12 | 3-20 / 2-10 / 4-20 | HIP-T08, HIP-T09 |
| `troca_taxa_pagamento_h` | 48 `[HIPÓTESE]` | 12-120 | HIP-D09, WB-175 C6 |
| `disputa_comprovante_h` | 48 `[HIPÓTESE]` | 12-120 | WB-110 C4 |
| `estorno_cobertura_teto_cents` | 30000 `[HIPÓTESE]` | 0-100000 | DEC-020a, WB-109 C9 |
| `push_mkt_min_segmento` | 20 `[HIPÓTESE]` | 10-1000 | WB-197 C2 |
| `coleta_agendamento_dias_uteis` / `coleta_entrega_item_dias` | 3 / 7 | 1-10 | HIP-019 |
| `reembolso_dias_uteis` | 3 | 1-10 | HIP-019 |
| `mediacao_dias_uteis` / `contestacao_dias` | 5 / 7 | 1-15 | HIP-020 |
| `avaliacao_janela_dias` / `avaliacao_min_exibicao` | 30 / 3 | 7-90 / 1-10 | HIP-021 |
| `otp_validade_min` / `otp_tentativas` / `otp_reenvio_s` | 10 / 5 / 60 | 5-30 / 3-10 / 30-120 | HIP-022 |
| `login_falhas` / `login_espera_min` / `senha_min` | 5 / 15 / 8 | 3-10 / 5-60 / 8+ | HIP-023 (espera por conta+IP/dispositivo; **sem bloqueio da conta**) |
| `login_stepup_falhas_h` | 20 | 10-100 | HIP-023, WB-221 |
| `email_nao_confirmado_pedidos_max` | 1 | 0-3 | DEC-014, WB-224 |
| `loja_nova_dias` / `loja_nova_pedidos` / `loja_nova_pedido_max_cents` | 30 / 20 / 50000 `[HIPÓTESE]` | 7-90 / 5-100 / 10000+ | DEC-016, WB-225 |
| `reauth_min` | 5 | 1-15 | SEC-016 |
| `exclusao_anonimizacao_dias` / `retencao_fiscal_anos` | 15 / 5 | 0-30 / 5 | HIP-024 |
| `exportacao_validade_dias` | 7 | 1-30 | HIP-025 |
| `push_mkt_max_semana` / `push_mkt_janela` | 2 / 09:00-20:00 | 0-7 | HIP-027 |
| `aprovacao_loja_sla_dias_uteis` | 2 | 1-10 | HIP-030 |
| `estoque_baixo_un` (padrão da loja) | 3 | 0-100 | HIP-033 |
| `foto_max_produto` / `upload_max_mb` / `variacoes_max` / `import_max_linhas` | 8 / 5 / 100 / 500 | n/a | HIP-034 |
| `dados_cliente_visivel_dias` | 30 | 0-90 | HIP-036 |
| `cupom_total_minimo_cents` | 100 | 0-1000 | HIP-037 |
| `estorno_super_admin_cents` | 50000 | 1000+ | HIP-039 |
| `codigo_retirada_digitos` | 4 | 4-6 | HIP-040 |
| `carrinho_validade_dias` / `item_qtd_max` / `enderecos_max` | 7 / 50 / 8 | n/a | HIP-041 |
| `cancelamento_loja_alerta_pct` (30 dias) | 10 | 1-50 | HIP-008 |

## RN-03 Visibilidade
- **Região:** cidade precisa estar ativa. Se o bairro do endereço estiver cadastrado, precisa estar ativo; bairro não cadastrado segue a regra da cidade.
- **Loja** aparece ao cliente se: status APROVADA, não suspensa, conta de recebimento ativa, 1+ produto ativo, e (para entrega Webag) distância em linha reta do endereço <= `raio_max_km` (global, DEC-036b), endereço em região liberada e logística aberta e não pausada na cidade de destino (RN-18); a loja que só quer retirada some do modo Entrega. Loja só com retirada aparece no modo Retirada se distância <= `retirada_distancia_max_km`.
- **Produto** aparece se: status ATIVO, loja visível, 1+ variação com estoque disponível > 0 (produto sem estoque aparece como "Indisponível" na página da loja, não nas ofertas nem na busca de produtos).
- **Aberta agora:** dentro do horário do dia, sem pausa ativa, e fora de feriado marcado. Loja fechada pode ser vista, mas não recebe pedido (checkout bloqueado com aviso "Abre às HH:MM").
- **Ordenação da home/lojas perto:** abertas primeiro, depois distância, depois avaliação (HIP-032). "Lojas novas": aprovadas há <= 30 dias. "Mais vendidos": unidades em pedidos ENTREGUE/em andamento nos últimos 30 dias na região, mínimo 5 pedidos. "Ofertas": produtos com promoção vigente, maior desconto percentual primeiro. Seção sem item é ocultada.

## RN-04 Entrega Webag, taxa de entrega, pedido mínimo (DEC-036; substitui o frete do lojista)
- **A taxa de entrega é da Webag** e vem da **tabela do admin** (`taxa_entrega_tabela`, RN-02): escopo do **endereço de destino** (bairro > cidade > padrão geral) e **faixa de distância** `[de_km, ate_km)` em linha reta loja-destino, até 6 faixas contíguas, sem lacuna; o limite superior pertence à faixa seguinte (2,00 km cai em 2-5, não em 0-2); a última faixa inclui o raio (R-17). A loja **não** configura taxa, faixas nem raio.
- Distância = linha reta entre loja e endereço (HIP-013). Fora do `raio_max_km` ou em região inativa: a loja some do modo Entrega; se o cliente chegar por link, mostra "Não entrega no seu endereço". Logística fechada ou pausada (RN-18): só retirada, com "Entrega volta às HH:MM".
- **Pedido mínimo** (global, `pedido_minimo_cents`) compara com o subtotal de produtos (preço vigente, antes de cupom e frete). Abaixo: o checkout não avança e o texto diz "Faltam R$ X" (o botão principal vira "Adicionar mais itens", sem botão desabilitado; RN-17).
- **Entrega grátis acima de X** (global, `frete_gratis_acima_cents`): compara com o mesmo subtotal; taxa = R$ 0 se subtotal >= X; X precisa ser estritamente maior que o pedido mínimo e X = 0 desliga a opção (R-17c). É **subsídio da Webag**: o motoboy continua sendo pago (RN-18) e a `application_fee` perde só a parcela da taxa (nunca fica negativa).
- **Tempo estimado ao cliente** = tempo de preparo informado pela loja (faixa em minutos) + deslocamento da faixa (tabela) + 10 min de despacho `[HIPÓTESE]`; exibido como estimativa.
- A loja escolhe **"entrega pela Webag" e/ou "retirada na loja"** (ao menos uma ligada). Retirada: sem frete; loja informa endereço de retirada (padrão: o da loja), instruções e tempo de preparo (faixa em minutos).
- O pedido guarda **snapshot** da taxa, da faixa, do escopo e da distância (RN-05).
- Pagamento só online (PIX ou cartão). Dinheiro/maquininha na entrega **fora da 1.0** (brief §4).

## RN-05 Carrinho e preços
- 1 loja por carrinho (DEC-006). Adicionar item de outra loja: confirmação "Trocar de loja? Seu carrinho atual será esvaziado."; Cancelar mantém o carrinho.
- Carrinho de visitante fica no aparelho; no login, junta com o da conta (mesma loja: soma quantidades até o estoque; lojas diferentes: mantém o carrinho da conta e avisa). Expira em `carrinho_validade_dias`.
- Quantidade por linha: 1 a min(estoque disponível, `item_qtd_max`).
- **Preço vigente** = promocional se agora estiver dentro de [início, fim], senão preço normal. Início e fim são data e hora em `America/Sao_Paulo`; início inclusivo e fim inclusivo até o minuto informado (padrão da UI: 00:00 e 23:59; R-13). Promocional deve ser menor que o normal. Preço mín. R$ 0,01, máx. R$ 99.999,99.
- Ao abrir o checkout e ao pagar, preços, estoque, horário e frete são revalidados; se mudou, mostra o que mudou e pede confirmação (nunca cobra valor diferente do exibido). O pedido grava **snapshot** de preço, nome, variação e taxas.
- Total = subtotal produtos − cupom + taxa de entrega (RN-04) + taxa de serviço, mínimo `cupom_total_minimo_cents` e máximo `pedido_max_cents`.

## RN-06 Estoque
- `disponível = estoque − reservado`. Reserva ao criar o pedido (AGUARDANDO_PAGAMENTO). Baixa definitiva ao pagamento aprovado. Liberação em EXPIRADO, CANCELADO, RECUSADO.
- Concorrência: a última unidade vai a quem reservar primeiro (operação atômica). Quem perde vê "Acabou o estoque de X" e volta ao carrinho com a quantidade ajustada.
- Reintegração ao estoque após troca/devolução: só se a loja marcar "item em condição de revenda" (defeito não reintegra por padrão).
- Estoque negativo não existe. Lojista ajustando para menos que o reservado: bloqueado com aviso.
- Estoque baixo: alerta ao lojista quando `disponível <= estoque_baixo_un`; rearma quando `disponível > estoque_baixo_un` e alerta de novo ao voltar a `<=` (R-14). Estoque máximo por variação: 99.999 (inteiro); código (SKU) único por loja quando informado (R-25).

## RN-07 Estados do pedido

| Estado | Significado | Próximos | Quem aciona |
|---|---|---|---|
| AGUARDANDO_PAGAMENTO | Pedido criado, estoque reservado | RECEBIDO, EXPIRADO, CANCELADO | sistema (pagamento/tempo), cliente |
| RECEBIDO | Pago, espera a loja | ACEITO, RECUSADO, CANCELADO | loja, cliente, sistema (timeout) |
| ACEITO | Loja confirmou | EM_SEPARACAO, PRONTO_PARA_COLETA*, PRONTO_PARA_RETIRADA*, CANCELADO | loja, cliente, admin |
| EM_SEPARACAO | Loja preparando | PRONTO_PARA_COLETA, PRONTO_PARA_RETIRADA, CANCELADO | loja, admin (cliente só por solicitação aprovada) |
| PRONTO_PARA_COLETA | **Só entrega Webag (DEC-036):** a loja terminou; a corrida está na fila da Logística, com ou sem motoboy ainda a caminho da loja (estados da entrega em RN-18) | SAIU_PARA_ENTREGA, EM_SEPARACAO (loja desfaz só sem motoboy; admin sempre), CANCELADO | loja (marca), admin |
| SAIU_PARA_ENTREGA | Motoboy coletou e está a caminho (só entrega) | ENTREGUE, CANCELADO (falha de entrega, RN-18) | **admin/logística** (a loja **não** marca "saiu" nem "entregue" na entrega Webag), sistema (24h) |
| PRONTO_PARA_RETIRADA | Aguardando cliente (só retirada) | ENTREGUE, CANCELADO | loja (com código), sistema (48h) |
| ENTREGUE | Concluído (retirado = entregue) | (terminal; abre avaliação e troca) | n/a |
| CANCELADO | Cancelado; guarda ator e motivo | terminal | cliente, loja, admin, sistema |
| RECUSADO | Loja recusou (motivo) | terminal | loja |
| EXPIRADO | Pagamento não ocorreu no prazo | terminal | sistema |

\* Loja pode pular EM_SEPARACAO (poucos cliques). Na **entrega Webag** o papel da loja termina em PRONTO_PARA_COLETA; ENTREGUE em retirada continua com o código de 4 dígitos na loja. Não há retrocesso, exceto admin com motivo e auditoria. Toda transição grava evento (estado, ator, hora, motivo) e dispara notificação (PRD notificações) e atualização em tempo real.

Prazos: aceite `loja_aceite_timeout_min` (cancelamento automático + estorno total); retirada não feita em `retirada_prazo_horas`; SAIU sem fechamento em `auto_conclusao_entrega_h` vira ENTREGUE, salvo "não recebi" do cliente (abre disputa).

## RN-08 Cancelamento e estorno

| Quando | Quem pode | Efeito |
|---|---|---|
| AGUARDANDO_PAGAMENTO | cliente, sistema | Libera estoque; sem estorno (nada cobrado) |
| RECEBIDO ou ACEITO | cliente (livre, motivo opcional) | Estorno total automático; sem comissão |
| RECEBIDO | loja recusa (motivo obrigatório) ou timeout | Estorno total; conta no índice de cancelamento da loja |
| ACEITO / EM_SEPARACAO | loja cancela (motivo obrigatório) | Estorno total; conta no índice da loja |
| EM_SEPARACAO | cliente **solicita**; loja aprova ou nega em 10 min; sem resposta vai ao admin | Se aprovado, estorno total |
| PRONTO_PARA_COLETA / SAIU / PRONTO_PARA_RETIRADA | só admin (a falha de entrega é registrada pela logística, WB-234) | Estorno total ou parcial, com motivo; falha de entrega: estorno total com a taxa de entrega `[HIPÓTESE; jurídico]` |
| ENTREGUE | via troca/arrependimento (RN-11) | Estorno conforme resolução |
| Qualquer estado | admin | Cancelar e estornar total/parcial, motivo obrigatório, auditado; acima de `estorno_super_admin_cents` só super admin |

- Item indisponível após aceite: loja marca o item (ACEITO/EM_SEPARACAO) e o sistema estorna parcialmente o valor do item menos o desconto de cupom proporcional; cliente é avisado e, se ainda não SAIU, pode cancelar o pedido inteiro com estorno total. Estorno parcial recalcula a comissão proporcionalmente.
- Prazo de devolução do dinheiro: PIX volta para a conta de origem pela regra do provedor; cartão depende do emissor (o app informa "até 2 faturas"). O app mostra o status do estorno.
- Cupom em pedido cancelado volta ao saldo de usos do cliente se ainda estiver dentro da validade.
- Índice de cancelamento da loja (30 dias, causado pela loja) acima de `cancelamento_loja_alerta_pct` gera alerta ao admin (sem penalidade automática na 1.0).

## RN-09 Cupons
- Tipos: percentual, valor fixo, frete grátis (plataforma). Escopo: loja (custo do lojista) ou plataforma (custo Webag).
- Campos: código (único, 4-20 caracteres A-Z0-9), início, fim, pedido mínimo, limite total de usos, limite por cliente (padrão 1), só primeira compra (opcional), loja(s)/categoria(s) alvo (plataforma).
- 1 cupom por pedido, não cumulativo com outro (HIP-037). Desconto <= subtotal. Percentual com teto opcional.
- Comissão incide sobre o subtotal após **cupom da loja**, e **antes** do cupom da plataforma.
- **No modo split, o desconto da plataforma (cupom ou frete grátis subsidiado) em um pedido é limitado à `application_fee` do pedido** (que agora é comissão + taxa de entrega + taxa de serviço, RN-10; ela não pode ser negativa; DEC-016, SEC-060, DEC-036). Cupom de frete grátis zera a taxa de entrega. Acima do teto o desconto é cortado e o cliente vê o valor aplicado. Cupom que exija mais fica desligado até haver mecanismo de pagamento ao lojista aprovado pelo fundador.
- Cupom da plataforma e "primeira compra" exigem e-mail confirmado (DEC-014) e são recusados em autoconsumo (membro da loja; SEC-061).

## RN-10 Comissão, taxa de serviço e repasse
Fórmulas (por pedido ENTREGUE ou conforme ledger do pagamento):
**Modelo (DEC-035 e DEC-036):** a **comissão** é o percentual que a Webag retém de cada venda; o lojista cadastra o preço **já com a comissão** e vê "Você recebe R$ X" (WB-242). A **taxa de entrega** é cobrada do cliente e é **receita da Webag**; o lojista não recebe frete.
```
base_comissao   = subtotal_produtos − cupom_loja
comissao        = round_half_up(base_comissao × pct)       pct: loja > categoria > padrão
taxa_entrega    = tabela do admin (RN-04); 0 se entrega grátis ou retirada
taxa_servico    = parametro (paga pelo cliente; receita Webag)
total_cliente   = subtotal_produtos − cupom_loja − cupom_plataforma + taxa_entrega + taxa_servico
application_fee = comissao + taxa_entrega + taxa_servico − cupom_plataforma     (>= 0)   [split]
taxa_provedor   = cobrada pelo provedor sobre total_cliente (arcada pelo lojista no split, a confirmar no sandbox)
liquido_lojista = total_cliente − application_fee − taxa_provedor
                = subtotal_produtos − cupom_loja − comissao − taxa_provedor
receita_webag   = application_fee                       (bruta)
custo_logistica = custo pago ao motoboy por corrida (RN-18; lançado depois, fora do app)
receita_liquida_webag = receita_webag − custo_logistica
```
No split, o "reembolso" do cupom da plataforma é a própria `application_fee` menor, com `cupom_plataforma <= application_fee` (a Webag nunca paga ao lojista por fora). Cupom ou frete grátis só reduzem a parcela da Webag.
Exemplo (PIX): subtotal R$ 100,00, cupom da loja R$ 10,00, taxa de entrega R$ 8,00, sem taxa de serviço, comissão **15%**. Base = R$ 90,00; comissão = R$ 13,50; total do cliente R$ 98,00; `application_fee` = R$ 21,50; taxa PIX 0,99% sobre R$ 98,00 = R$ 0,97 (taxa do MP, a confirmar); **líquido do lojista = R$ 75,53**; receita da Webag R$ 21,50; custo do motoboy (hipótese R$ 9,00) deixa R$ 12,50. Com cartão 4,98%: taxa R$ 4,88 e líquido R$ 71,62. (Os R$ 88,03 do exemplo antigo, com comissão de 10% e frete do lojista, deixam de valer.)
Efeito colateral a confirmar: a taxa do provedor incide sobre o total, que inclui a taxa de entrega, e no split quem a paga é o lojista; o impacto é pequeno (R$ 0,08 no PIX e R$ 0,40 no cartão, sobre R$ 8,00) mas é uma assimetria a revisar com o backend (sandbox) e o fundador.
- Precedência de comissão: loja (com vigência opcional) > categoria do produto > padrão. Pedido com produtos de categorias diferentes: usa a categoria de cada item sobre sua parte da base.
- Comissão congela no pedido (snapshot) no momento do pagamento; mudança posterior não é retroativa.
- Estorno total: devolve comissão, **taxa de entrega** e taxa de serviço. Estorno parcial: devolve proporcional (a taxa de entrega só volta em estorno parcial se a entrega não foi realizada ou em arrependimento). Taxa do provedor não volta (HIP-016). **O custo já pago ao motoboy não volta**: é custo da Webag (por isso um arrependimento custa mais que uma troca, `prd/trocas.md` §Economia).
- **Taxa de troca** (RN-11): cobrança separada, receita 100% da Webag, sem comissão da loja; o ledger a lança como receita de logística.
- Repasse (modo centralizado, só com parecer jurídico): semanal (segunda), de pedidos ENTREGUE há `repasse_carencia_dias` sem troca ou disputa aberta; saldo negativo (estornos acima de vendas) abate do próximo repasse. **Em split (OAuth MP, modo preferido), não existe repasse controlado pela Webag**: o dinheiro cai na conta do lojista, a liberação segue o provedor, o "repasse" é informativo, e **a Webag não retém, ajusta nem desconta** (DEC-016). Estorno de pedido do lojista sai da conta dele; se faltar saldo, o recurso é suspensão da loja, estorno pelo admin e cobrança pelos Termos do Lojista. Decisão split vs. centralizado: ADR de pagamentos (WB-155).
- Extrato do lojista lista, por pedido: bruto, comissão, taxa do provedor, estornos, líquido, status (a receber, em carência, repassado).

## RN-11 Trocas ("Retira Troca") e arrependimento
**Reescrita pela DEC-037 (2026-11-19). Detalhe, base legal e comparação com marketplaces: `docs/produto/prd/trocas.md`.**
**Elegibilidade:** pedido ENTREGUE (corrida ENTREGUE ou retirada concluída); itens do pedido; 1 solicitação aberta por item; **o prazo conta da entrega confirmada** (nunca do pedido) e a tela mostra "Você tem até DD/MM" por motivo; **1 troca voluntária por pedido** (`troca_voluntaria_max_por_pedido`; arrependimento e defeito não contam).

| Tipo (motivo) | Base legal | Prazo | Loja pode recusar? | Custo ao cliente | Quem aprova | Resolução |
|---|---|---|---|---|---|---|
| 1. Arrependimento | CDC art. 49; Decreto 7.962/2013 art. 5 | 7 dias corridos (piso legal, fixo) | **Não** | **Nenhum**; reembolso inclui a taxa de entrega; coleta grátis (custo da Webag) ou levar à loja | Automático e imediato | Reembolso |
| 2. Defeito ou avaria | CDC art. 18 e 26 | 30 dias (não durável) ou **90 dias (durável)**, da entrega (piso, fixo); categoria durável por padrão `[HIPÓTESE; jurídico]`; fotos 1 a 5 **obrigatórias** | Só após a inspeção, com prova; vai à mediação | **Nenhum**; coleta grátis | Loja em `troca_resposta_h` (24 h); sem resposta, **aprovação automática da coleta** | Troca por igual, ou reembolso |
| 3. Tamanho ou cor (voluntária) | Política comercial (sem obrigação legal); CDC art. 30 (oferta vincula) | Definido pela loja: padrão 7; mín. 3, máx. 30 (admin); 0 = não aceita | Sim: fora do prazo, limite de 1 troca por pedido, produto ou categoria "sem troca voluntária", item usado/sem etiqueta/sem embalagem; motivo obrigatório | **Levar à loja: grátis.** Coleta em casa: **taxa de troca da tabela do admin** (RN-02; padrão = taxa de entrega da região, zerável por região ou campanha, <= `taxa_coleta_max_cents`), **paga só após a aprovação** (HIP-D09; WB-175) | Loja em 24 h; sem resposta, **aprovação automática** `[HIPÓTESE]` | Troca por outra variação **com estoque** (reservada ao aprovar), com diferença de preço; ou reembolso se não houver estoque |

Fotos: 1 a 5 (JPG/PNG, até 5 MB cada); obrigatórias para defeito, opcionais nos demais.

**Estados da troca:**
SOLICITADA → APROVADA | RECUSADA | CANCELADA (cliente, antes da coleta)
SOLICITADA → APROVADA também **por SLA** (ator "sistema") após `troca_resposta_h`; arrependimento nasce APROVADA.
APROVADA → COLETA_AGENDADA (a **logística da Webag** confirma a janela e cria a corrida de coleta, RN-18, WB-241; ou "cliente leva à loja", sem corrida e com código da troca, WB-243)
Subestado de APROVADA "taxa pendente" (sem novo status): coleta em casa com taxa (e diferença de preço) ainda não paga; a corrida só nasce após o pagamento; sem pagamento em `troca_taxa_pagamento_h`, a troca é CANCELADA (sem cobrança).
COLETA_AGENDADA → ITEM_RECEBIDO (a **loja** confirma o recebimento) | COLETA_FALHOU (até 2 reagendamentos; depois EXPIRADA)
ITEM_RECEBIDO → inspeção OK → REEMBOLSO_PROCESSANDO ou REPOSICAO_ENVIADA → CONCLUIDA; inspeção reprovada → EM_MEDIACAO
RECUSADA → EM_MEDIACAO (cliente contesta em até `contestacao_dias`) → APROVADA ou RECUSADA_FINAL
APROVADA/COLETA_AGENDADA sem item entregue em `coleta_entrega_item_dias` → EXPIRADA.

**Prazos:** loja responde em `troca_resposta_h` (**24 h**, lembretes em 12 h e 4 h do fim; sem resposta: aprovação automática, DEC-037); a Webag agenda a coleta em até `coleta_agendamento_dias_uteis`; reembolso em até `reembolso_dias_uteis` após ITEM_RECEBIDO `[o art. 49 pede devolução "de imediato": validar com jurídico]`; mediação decide em `mediacao_dias_uteis`.
**Financeiro:** reembolso devolve valor dos itens **e, em arrependimento, a taxa de entrega paga** pelo provedor; comissão e taxa de entrega devolvidas proporcionalmente (RN-10). A **taxa de troca** (coleta e reentrega) só é cobrada após a aprovação, em cobrança separada, é **receita da Webag**, não é reembolsada exceto se a troca for cancelada depois de paga e antes da coleta (recusa não gera cobrança). **Diferença de preço** na reposição (WB-245) = preço vigente hoje da variação nova menos o da original: paga na aprovação, junto da taxa, ou estornada ao receber o item. Reposição não gera nova comissão (exceto sobre a diferença positiva); consome estoque (reserva ao aprovar). **Custo da corrida** de coleta: lançado como custo de logística da Webag (arrependimento e defeito: custo da Webag; tamanho/cor: coberto pela taxa); cobrar da loja só com cláusula nos Termos (DEC-016).
Troca de item trocado: não permitida (nova solicitação só por defeito).
**Regra de produto:** o switch "aceita troca" da loja controla só a troca voluntária (tamanho/cor), com prazo dentro de `troca_voluntaria_dias_min` e `_max`; **a loja não define taxa de coleta** (é da tabela do admin). A UI nunca oferece desligar arrependimento ou defeito. Produto marcado "sem troca voluntária" ou categoria sem troca voluntária (WB-244): tamanho e cor ficam inertes com o motivo (arrependimento e defeito seguem). Motivo que a loja não aceita ou fora do prazo aparece inerte, com o motivo escrito (DEC-024b).
**Reduzir troca na origem:** tabela de medidas por produto (WB-246) e pergunta "Como vestiu?" na avaliação (WB-247); relatório de trocas por loja e categoria (WB-248).

## RN-12 Avaliações
- Só cliente com pedido ENTREGUE; 1 avaliação de loja por pedido e 1 por produto do pedido; janela `avaliacao_janela_dias`; nota 1-5 (obrigatória), comentário opcional até 500 caracteres; não editável após enviada (pode apagar e reenviar dentro da janela).
- Média da loja/produto pública a partir de `avaliacao_min_exibicao` avaliações; antes disso, rótulo "Novo".
- Loja responde 1 vez por avaliação (até 500 caracteres). Qualquer usuário denuncia; admin remove avaliação com ofensa, dado pessoal ou conteúdo ilegal, com motivo registrado. Avaliação não é removida por ser negativa.
- Pedido cancelado, recusado ou expirado não gera avaliação.

## RN-13 Papéis e permissões
**Admin:** super admin (tudo); operação (lojas, catálogo, pedidos, trocas, regiões, marketing, conteúdo, **logística: fila, motoboys, atribuir, estados e custo por entrega**; sem financeiro nem admins); financeiro (comissões, **tabela de taxa de entrega**, repasses, estornos, conciliação, relatórios financeiros, **leitura e exportação de custos de logística**; leitura de pedidos); suporte (leitura de clientes, lojas, pedidos e **fila de logística**, redefinir senha de cliente, abrir mediação; sem estorno e sem edição de loja).
**Lojista:** dono (tudo, incluindo financeiro, conta de recebimento, equipe, configurações) e funcionários com permissões marcáveis: pedidos, catálogo/estoque, trocas, cupons, avaliações e **valores de venda** (`vendas_valores`, **desligada por padrão**; só o dono liga; libera vendas em R$, ticket médio e gráfico do painel inicial, nunca o financeiro; DEC-024c, WB-075 C7). Financeiro, dados bancários e equipe são só do dono. Escopo sempre limitado à própria loja.
**Cliente:** só os próprios dados.
Todo acesso é validado no servidor por papel e por loja (nunca só pela interface).

## RN-14 Dados pessoais (resumo; detalhe no PRD LGPD)
Lojista vê nome, telefone e endereço do cliente apenas em pedido ativo e por `dados_cliente_visivel_dias` após conclusão; depois mascarados. Documentos de loja só o admin vê, com registro de acesso. Dados fiscais/financeiros retidos `retencao_fiscal_anos` mesmo após exclusão de conta (anonimizados quando possível).

## RN-16 Estados e transições da loja (R-29)
Dia útil = segunda a sexta, sem feriados na 1.0 (R-15).

| De | Para | Quem aciona | Observação |
|---|---|---|---|
| (novo) | RASCUNHO | lojista | etapas de onboarding salvas (WB-051 C4) |
| RASCUNHO | EM_ANALISE | lojista | ao enviar dados e documentos; começa a contar `aprovacao_loja_sla_dias_uteis` |
| EM_ANALISE | APROVADA | admin (operação/super) | notifica o lojista; visibilidade conforme RN-03 |
| EM_ANALISE | CORRECAO_PEDIDA | admin | motivo por item; rótulo "Aguardando lojista"; **o prazo do SLA fica pausado** |
| CORRECAO_PEDIDA | EM_ANALISE | lojista | ao reenviar; o SLA volta a contar do ponto em que parou |
| EM_ANALISE | RECUSADA | admin | **final**; motivo obrigatório; novo cadastro só com o suporte |
| APROVADA | SUSPENSA | admin (WB-104) | motivo obrigatório; some do app |
| SUSPENSA | APROVADA | admin (WB-104) | reativação; volta visível se atender RN-03 |

Qualquer outra transição (inclusive RECUSADA ou SUSPENSA direto para APROVADA, ou APROVADA para EM_ANALISE por troca de status) é inválida e a API a recusa com erro e auditoria. Alterar nome ou CPF/CNPJ de loja APROVADA abre uma análise de **dados**, mas a loja segue APROVADA, visível e vendendo com os dados antigos até a decisão (WB-055 C4; R-23). Documento de loja RECUSADA sem pedidos fica livre; o de SUSPENSA continua ocupado.

## RN-15 Definições de métricas
- **GMV**: soma de `total_cliente` dos pedidos que chegaram a RECEBIDO, exceto cancelados/recusados; "GMV concluído" = só ENTREGUE.
- **Receita Webag**: `receita_webag` (RN-10).
- **Ticket médio**: GMV concluído / pedidos ENTREGUE.
- **Recompra**: % de clientes com 2+ pedidos ENTREGUE em 30 dias após o primeiro.
- **Cancelamento**: pedidos CANCELADO + RECUSADO / pedidos que chegaram a RECEBIDO, por ator e motivo.
- **Tempo de aceite**: RECEBIDO até ACEITO (mediana e p90).
- **Loja ativa**: aprovada, com 1+ pedido ENTREGUE nos últimos 30 dias.

## RN-18 Entrega Webag: papéis, estados da entrega e custo (DEC-036; `prd/logistica.md`)
**Papéis.** Loja: prepara e marca "pronto para coleta". Webag (admin, perfil operação): despacha, acompanha e fecha. Motoboy: terceiro autônomo que age por WhatsApp (sem app na 1.0). Cliente: acompanha e informa o código de entrega.

**Tipos de corrida:** `ENTREGA` (loja para cliente), `COLETA_TROCA` (cliente para loja), `TROCA_COMBINADA` (loja leva a peça nova ao cliente e traz a antiga de volta). Só a entrega altera o estado do pedido (RN-07); as de troca alteram o estado da troca (RN-11).

**Estados da entrega** (interpretação do PO da lista da DEC-036d; o backend usa estes nomes, L.3; extras marcados com `+`):

| Estado | Significado | Próximos | Quem aciona | Pedido (RN-07) |
|---|---|---|---|---|
| PRONTA_PARA_COLETA | Loja marcou pronto; corrida na fila sem motoboy | AGUARDANDO_MOTOBOY, CANCELADA+ | loja (cria), admin | PRONTO_PARA_COLETA |
| AGUARDANDO_MOTOBOY | Motoboy atribuído e mensagem enviada, sem confirmação | MOTOBOY_A_CAMINHO, PRONTA_PARA_COLETA (reatribuir), CANCELADA+ | operação | PRONTO_PARA_COLETA |
| MOTOBOY_A_CAMINHO | Motoboy confirmou e vai à loja | SAIU_PARA_ENTREGA, PRONTA_PARA_COLETA (reatribuir), CANCELADA+ | operação | PRONTO_PARA_COLETA |
| SAIU_PARA_ENTREGA | Motoboy coletou e vai ao cliente | ENTREGUE, NAO_ENTREGUE | operação | SAIU_PARA_ENTREGA |
| ENTREGUE | Cliente recebeu (código de entrega se a flag estiver ligada) | terminal | operação | ENTREGUE |
| NAO_ENTREGUE | Tentativa falhou, com motivo (cliente ausente, endereço não encontrado, recusou, risco, outro) | SAIU_PARA_ENTREGA (reentrega, até `entrega_reentrega_max`), DEVOLVIDA_A_LOJA+ | operação | SAIU_PARA_ENTREGA |
| DEVOLVIDA_A_LOJA+ | Pacote voltou e a loja confirmou | terminal | operação, loja (confirma) | CANCELADO (estorno total) |
| CANCELADA+ | Corrida cancelada (pedido cancelado, loja desfez) | terminal | operação, sistema | conforme o pedido |

Para as corridas de troca, os mesmos estados valem com os rótulos "a caminho do cliente", "item coletado", "item entregue na loja"; o fim exige a confirmação da **loja** (ITEM_RECEBIDO).
Atribuir, reatribuir e desfazer exigem motivo e auditoria; todo estado grava ator e hora e notifica o cliente (push só em SAIU e ENTREGUE e em falha).

**Fila e SLA:** ordenada pelo "pronto" mais antigo; sem motoboy após `logistica_sla_atribuir_min` fica amarela e após `logistica_sla_atribuir_critico_min` vermelha (com texto); corrida em SAIU há mais de `logistica_alerta_entrega_min` recebe "Atenção"; 24 h sem fechamento: auto-conclusão do pedido (`auto_conclusao_entrega_h`, RN-07).
**Horário e pausa:** entrega Webag só é oferecida dentro de `logistica_horario` da cidade e sem pausa (RN-04); o admin pode pausar por cidade ou geral com motivo.
**Custo:** o admin registra o custo pago ao motoboy por corrida (sugestão = custo previsto da faixa); sem registro em 48 h gera alerta; edição preserva o valor anterior e audita. **O pagamento ao motoboy é feito fora do app** (DEC-036c); o sistema só controla "pago em DD/MM" por lote.
**Dinheiro na entrega:** nenhum; o motoboy não cobra nada na 1.0 (a mensagem diz "Pago no app. Não cobrar").
**Falha de entrega:** 1 reentrega sem custo ao cliente; depois, devolução à loja e estorno total (inclui taxa de entrega) `[HIPÓTESE; cobrar a taxa só com parecer jurídico]`.
**Dados:** mensagem de WhatsApp só com loja, endereços, 1º nome e telefone do cliente, volumes e observação (nunca CPF, e-mail, itens, valores nem o código de entrega); telefone do cliente visível ao operador só em corrida ativa.

## RN-17 Formulários: botão de envio sempre ativo (DEC-024d, WB-006 C2/C4, WB-020 C5)
- O botão principal de um formulário (cadastro, login, contestação, avaliação, configuração etc.) **nunca fica desabilitado** por campo inválido ou faltando: ele fica ativo e, ao tocar, **não envia**, mostra o erro junto ao campo (texto + ícone, nunca só cor) e leva o foco ao primeiro campo com erro (acessibilidade: leitor de tela e quem não percebe o que falta).
- Exceções: estado "Enviando…" (evita envio duplicado) e ação indisponível por permissão ou regra de negócio, que **não aparece** (ou aparece inerte com o motivo escrito, como em RN-11), em vez de um botão desabilitado sem explicação.
- Vale para app e painéis web; casos de teste verificam "toca sem preencher: não envia, mostra erro, foco no campo".
