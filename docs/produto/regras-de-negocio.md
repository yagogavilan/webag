# Regras de Negócio — Webag 1.0

Status: rascunho para G3 | Dono: product-owner | Data: 2026-11-18
Fonte única das regras numéricas. PRDs e histórias citam `RN-xx` e `HIP-0xx` (hipóteses em `docs/decisoes.md`). Mudou valor: muda aqui e em `decisoes.md`, nunca só no código.

## RN-01 Dinheiro e arredondamento
- Valores em centavos (inteiro). Exibição `R$ 1.234,56`.
- Percentuais aplicados sobre centavos com arredondamento half-up por linha; a soma das partes é sempre igual ao total (a diferença de centavo vai para o lojista).
- Fuso de todas as regras de horário: `America/Sao_Paulo`.

## RN-02 Parâmetros configuráveis no admin (WB-119)
Todo valor abaixo vive em tabela de parâmetros editável (super admin), com histórico e auditoria. "Padrão" é o valor de seed.

| Chave | Padrão | Faixa | Hipótese |
|---|---|---|---|
| `comissao_padrao_pct` | 10,00 | 0-30 | HIP-001 |
| `taxa_servico_tipo` / `taxa_servico_valor` | nenhuma / 0 | fixa em centavos ou %, teto próprio | HIP-003 |
| `pix_expiracao_min` | 15 | 5-60 | HIP-006 |
| `loja_aceite_timeout_min` / `loja_aceite_lembrete_min` | 10 / 5 | 3-30 | HIP-008 |
| `parcelas_max` / `parcela_min_cents` | 3 / 3000 | 1-12 / 1000+ | HIP-011 |
| `pedido_max_cents` | 200000 | 10000+ | HIP-012 |
| `raio_max_km` / `raio_padrao_km` | 15 / 5 | 1-50 | HIP-013 |
| `retirada_distancia_max_km` | 10 | 1-30 | HIP-013 |
| `retirada_prazo_horas` | 48 | 12-168 | HIP-038 |
| `auto_conclusao_entrega_h` | 24 | 6-72 | HIP-038 |
| `repasse_periodicidade` / `repasse_carencia_dias` | semanal (segunda) / 7 | semanal, quinzenal / 0-30 | HIP-015 |
| `troca_arrependimento_dias` | 7 | piso 7 | HIP-017 |
| `troca_defeito_dias` | 30 | piso 30 | HIP-017 |
| `troca_voluntaria_dias_padrao` | 7 | 0-30 | HIP-017 |
| `taxa_coleta_max_cents` | 3000 | 0-10000 | HIP-018 |
| `troca_resposta_h` | 48 | 12-120 | HIP-019 |
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
- **Loja** aparece ao cliente se: status APROVADA, não suspensa, conta de recebimento ativa, 1+ produto ativo, e (para entrega) distância em linha reta do endereço <= raio da loja (<= `raio_max_km`) e endereço em região liberada. Loja só com retirada aparece no modo Retirada se distância <= `retirada_distancia_max_km`.
- **Produto** aparece se: status ATIVO, loja visível, 1+ variação com estoque disponível > 0 (produto sem estoque aparece como "Indisponível" na página da loja, não nas ofertas nem na busca de produtos).
- **Aberta agora:** dentro do horário do dia, sem pausa ativa, e fora de feriado marcado. Loja fechada pode ser vista, mas não recebe pedido (checkout bloqueado com aviso "Abre às HH:MM").
- **Ordenação da home/lojas perto:** abertas primeiro, depois distância, depois avaliação (HIP-032). "Lojas novas": aprovadas há <= 30 dias. "Mais vendidos": unidades em pedidos ENTREGUE/em andamento nos últimos 30 dias na região, mínimo 5 pedidos. "Ofertas": produtos com promoção vigente, maior desconto percentual primeiro. Seção sem item é ocultada.

## RN-04 Entrega, frete, pedido mínimo
- Taxa **fixa** (R$ 0 a R$ 50) ou **por distância**: até 5 faixas `[de_km, ate_km, valor]` contíguas, sem lacuna; última faixa termina no raio da loja.
- Distância = linha reta entre loja e endereço (HIP-013). Fora do raio: loja some da lista; se o cliente chegar por link, mostra "Não entrega no seu endereço".
- **Pedido mínimo** compara com o subtotal de produtos (preço vigente, antes de cupom e frete). Abaixo: checkout bloqueado e texto "Faltam R$ X".
- **Entrega grátis acima de X:** compara com o mesmo subtotal; frete = R$ 0 se subtotal >= X.
- **Tempo estimado:** faixa em minutos definida pela loja (ex.: 30-60); exibido como informado, sem recálculo.
- Retirada: sem frete; loja informa endereço de retirada (padrão: o da loja), instruções e tempo de preparo (faixa em minutos).
- Pagamento só online (PIX ou cartão). Dinheiro/maquininha na entrega **fora da 1.0** (brief §4).

## RN-05 Carrinho e preços
- 1 loja por carrinho (DEC-006). Adicionar item de outra loja: confirmação "Trocar de loja? Seu carrinho atual será esvaziado."; Cancelar mantém o carrinho.
- Carrinho de visitante fica no aparelho; no login, junta com o da conta (mesma loja: soma quantidades até o estoque; lojas diferentes: mantém o carrinho da conta e avisa). Expira em `carrinho_validade_dias`.
- Quantidade por linha: 1 a min(estoque disponível, `item_qtd_max`).
- **Preço vigente** = promocional se hoje dentro de [início, fim], senão preço normal. Promocional deve ser menor que o normal. Preço mín. R$ 0,01, máx. R$ 99.999,99.
- Ao abrir o checkout e ao pagar, preços, estoque, horário e frete são revalidados; se mudou, mostra o que mudou e pede confirmação (nunca cobra valor diferente do exibido). O pedido grava **snapshot** de preço, nome, variação e taxas.
- Total = subtotal produtos − cupom + frete + taxa de serviço, mínimo `cupom_total_minimo_cents` e máximo `pedido_max_cents`.

## RN-06 Estoque
- `disponível = estoque − reservado`. Reserva ao criar o pedido (AGUARDANDO_PAGAMENTO). Baixa definitiva ao pagamento aprovado. Liberação em EXPIRADO, CANCELADO, RECUSADO.
- Concorrência: a última unidade vai a quem reservar primeiro (operação atômica). Quem perde vê "Acabou o estoque de X" e volta ao carrinho com a quantidade ajustada.
- Reintegração ao estoque após troca/devolução: só se a loja marcar "item em condição de revenda" (defeito não reintegra por padrão).
- Estoque negativo não existe. Lojista ajustando para menos que o reservado: bloqueado com aviso.
- Estoque baixo: alerta ao lojista quando `disponível <= estoque_baixo_un`.

## RN-07 Estados do pedido

| Estado | Significado | Próximos | Quem aciona |
|---|---|---|---|
| AGUARDANDO_PAGAMENTO | Pedido criado, estoque reservado | RECEBIDO, EXPIRADO, CANCELADO | sistema (pagamento/tempo), cliente |
| RECEBIDO | Pago, espera a loja | ACEITO, RECUSADO, CANCELADO | loja, cliente, sistema (timeout) |
| ACEITO | Loja confirmou | EM_SEPARACAO, SAIU_PARA_ENTREGA*, PRONTO_PARA_RETIRADA*, CANCELADO | loja, cliente, admin |
| EM_SEPARACAO | Loja preparando | SAIU_PARA_ENTREGA, PRONTO_PARA_RETIRADA, CANCELADO | loja, admin (cliente só por solicitação aprovada) |
| SAIU_PARA_ENTREGA | A caminho (só entrega) | ENTREGUE, CANCELADO | loja, sistema (24h), admin |
| PRONTO_PARA_RETIRADA | Aguardando cliente (só retirada) | ENTREGUE, CANCELADO | loja (com código), sistema (48h) |
| ENTREGUE | Concluído (retirado = entregue) | (terminal; abre avaliação e troca) | n/a |
| CANCELADO | Cancelado; guarda ator e motivo | terminal | cliente, loja, admin, sistema |
| RECUSADO | Loja recusou (motivo) | terminal | loja |
| EXPIRADO | Pagamento não ocorreu no prazo | terminal | sistema |

\* Loja pode pular EM_SEPARACAO (poucos cliques). Não há retrocesso, exceto admin com motivo e auditoria. Toda transição grava evento (estado, ator, hora, motivo) e dispara notificação (PRD notificações) e atualização em tempo real.

Prazos: aceite `loja_aceite_timeout_min` (cancelamento automático + estorno total); retirada não feita em `retirada_prazo_horas`; SAIU sem fechamento em `auto_conclusao_entrega_h` vira ENTREGUE, salvo "não recebi" do cliente (abre disputa).

## RN-08 Cancelamento e estorno

| Quando | Quem pode | Efeito |
|---|---|---|
| AGUARDANDO_PAGAMENTO | cliente, sistema | Libera estoque; sem estorno (nada cobrado) |
| RECEBIDO ou ACEITO | cliente (livre, motivo opcional) | Estorno total automático; sem comissão |
| RECEBIDO | loja recusa (motivo obrigatório) ou timeout | Estorno total; conta no índice de cancelamento da loja |
| ACEITO / EM_SEPARACAO | loja cancela (motivo obrigatório) | Estorno total; conta no índice da loja |
| EM_SEPARACAO | cliente **solicita**; loja aprova ou nega em 10 min; sem resposta vai ao admin | Se aprovado, estorno total |
| SAIU / PRONTO | só admin (ou loja com "entrega não realizada") | Estorno total ou parcial, com motivo |
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
- **No modo split, o desconto da plataforma (cupom ou frete grátis subsidiado) em um pedido é limitado à comissão do pedido** (`application_fee` não pode ser negativa; DEC-016, SEC-060). Acima do teto o desconto é cortado e o cliente vê o valor aplicado. Cupom que exija mais fica desligado até haver mecanismo de pagamento ao lojista aprovado pelo fundador.
- Cupom da plataforma e "primeira compra" exigem e-mail confirmado (DEC-014) e são recusados em autoconsumo (membro da loja; SEC-061).

## RN-10 Comissão, taxa de serviço e repasse
Fórmulas (por pedido ENTREGUE ou conforme ledger do pagamento):
```
base_comissao   = subtotal_produtos − cupom_loja
comissao        = round_half_up(base_comissao × pct)       pct: loja > categoria > padrão
taxa_servico    = parametro (paga pelo cliente; receita Webag)
total_cliente   = subtotal_produtos − cupom_loja − cupom_plataforma + frete + taxa_servico
taxa_provedor   = cobrada pelo provedor sobre total_cliente
liquido_lojista = total_cliente + cupom_plataforma − taxa_servico − comissao − taxa_provedor
receita_webag   = comissao + taxa_servico − cupom_plataforma     (>= 0)
```
No split, o "reembolso" do cupom da plataforma é a própria `application_fee` menor: `application_fee = comissao + taxa_servico − cupom_plataforma`, com `cupom_plataforma <= comissao` (a Webag nunca paga ao lojista por fora). O termo `cupom_plataforma_reembolsado_pela_webag` deixa de existir.
Exemplo: subtotal R$ 100,00, cupom da loja R$ 10,00, frete R$ 8,00, sem taxa de serviço, PIX. Base = R$ 90,00; comissão 10% = R$ 9,00; total do cliente R$ 98,00; taxa PIX 0,99% = R$ 0,97 (taxa do MP, a confirmar); líquido do lojista = R$ 88,03. Com cartão 4,98%: taxa R$ 4,88 e líquido R$ 84,12.
- Precedência de comissão: loja (com vigência opcional) > categoria do produto > padrão. Pedido com produtos de categorias diferentes: usa a categoria de cada item sobre sua parte da base.
- Comissão congela no pedido (snapshot) no momento do pagamento; mudança posterior não é retroativa.
- Estorno total: devolve comissão e taxa de serviço. Estorno parcial: devolve proporcional. Taxa do provedor não volta (HIP-016).
- Repasse (modo centralizado, só com parecer jurídico): semanal (segunda), de pedidos ENTREGUE há `repasse_carencia_dias` sem troca ou disputa aberta; saldo negativo (estornos acima de vendas) abate do próximo repasse. **Em split (OAuth MP, modo preferido), não existe repasse controlado pela Webag**: o dinheiro cai na conta do lojista, a liberação segue o provedor, o "repasse" é informativo, e **a Webag não retém, ajusta nem desconta** (DEC-016). Estorno de pedido do lojista sai da conta dele; se faltar saldo, o recurso é suspensão da loja, estorno pelo admin e cobrança pelos Termos do Lojista. Decisão split vs. centralizado: ADR de pagamentos (WB-155).
- Extrato do lojista lista, por pedido: bruto, comissão, taxa do provedor, estornos, líquido, status (a receber, em carência, repassado).

## RN-11 Trocas ("Retira Troca") e arrependimento
**Elegibilidade:** pedido ENTREGUE; itens do pedido; 1 solicitação aberta por item; prazo conta do dia da entrega/retirada.

| Motivo | Prazo | Loja pode recusar? | Custo ao cliente | Resolução |
|---|---|---|---|---|
| Arrependimento | 7 dias corridos (piso legal) | Não | Nenhum (frete e coleta por conta da loja) | Reembolso |
| Defeito | 30 dias (piso; duráveis 90, validar jurídico) | Só com prova (inspeção), vai à mediação | Nenhum | Troca por igual, ou reembolso |
| Tamanho errado / cor diferente | Definido pela loja (padrão 7; 0 = não aceita) | Sim, se fora do prazo ou política "não aceita"; motivo obrigatório | Taxa de coleta da loja (<= `taxa_coleta_max_cents`), paga ao solicitar | Troca por outra variação disponível, ou reembolso se não houver |

Fotos: 1 a 5 (JPG/PNG, até 5 MB cada); obrigatórias para defeito, opcionais nos demais.

**Estados da troca:**
SOLICITADA → APROVADA | RECUSADA | CANCELADA (cliente, antes da coleta)
APROVADA → COLETA_AGENDADA (loja informa data/janela; ou "cliente leva à loja") 
COLETA_AGENDADA → ITEM_RECEBIDO | COLETA_FALHOU (até 2 reagendamentos; depois EXPIRADA)
ITEM_RECEBIDO → inspeção OK → REEMBOLSO_PROCESSANDO ou REPOSICAO_ENVIADA → CONCLUIDA; inspeção reprovada → EM_MEDIACAO
RECUSADA → EM_MEDIACAO (cliente contesta em até `contestacao_dias`) → APROVADA ou RECUSADA_FINAL
APROVADA/COLETA_AGENDADA sem item entregue em `coleta_entrega_item_dias` → EXPIRADA.

**Prazos:** loja responde em `troca_resposta_h` (sem resposta: arrependimento é aprovado; demais vão à mediação); loja agenda coleta em até `coleta_agendamento_dias_uteis`; reembolso em até `reembolso_dias_uteis` após ITEM_RECEBIDO; mediação decide em `mediacao_dias_uteis`.
**Financeiro:** reembolso devolve valor dos itens (e frete original em arrependimento, a validar com jurídico) pelo provedor; comissão devolvida proporcional (RN-10). Taxa de coleta não é reembolsada, exceto se a loja recusar ou a troca for cancelada antes da coleta. Reposição não gera nova cobrança nem nova comissão; consome estoque (reserva ao aprovar a troca).
Troca de item trocado: não permitida (nova solicitação só por defeito).
**Regra de produto:** o switch "aceita troca" da loja controla só a troca voluntária (tamanho/cor). A UI nunca oferece desligar arrependimento ou defeito.

## RN-12 Avaliações
- Só cliente com pedido ENTREGUE; 1 avaliação de loja por pedido e 1 por produto do pedido; janela `avaliacao_janela_dias`; nota 1-5 (obrigatória), comentário opcional até 500 caracteres; não editável após enviada (pode apagar e reenviar dentro da janela).
- Média da loja/produto pública a partir de `avaliacao_min_exibicao` avaliações; antes disso, rótulo "Novo".
- Loja responde 1 vez por avaliação (até 500 caracteres). Qualquer usuário denuncia; admin remove avaliação com ofensa, dado pessoal ou conteúdo ilegal, com motivo registrado. Avaliação não é removida por ser negativa.
- Pedido cancelado, recusado ou expirado não gera avaliação.

## RN-13 Papéis e permissões
**Admin:** super admin (tudo); operação (lojas, catálogo, pedidos, trocas, regiões, marketing, conteúdo; sem financeiro nem admins); financeiro (comissões, repasses, estornos, conciliação, relatórios financeiros; leitura de pedidos); suporte (leitura de clientes, lojas e pedidos, redefinir senha de cliente, abrir mediação; sem estorno e sem edição de loja).
**Lojista:** dono (tudo, incluindo financeiro, conta de recebimento, equipe, configurações) e funcionários com permissões marcáveis: pedidos, catálogo/estoque, trocas, cupons, avaliações. Financeiro, dados bancários e equipe são só do dono. Escopo sempre limitado à própria loja.
**Cliente:** só os próprios dados.
Todo acesso é validado no servidor por papel e por loja (nunca só pela interface).

## RN-14 Dados pessoais (resumo; detalhe no PRD LGPD)
Lojista vê nome, telefone e endereço do cliente apenas em pedido ativo e por `dados_cliente_visivel_dias` após conclusão; depois mascarados. Documentos de loja só o admin vê, com registro de acesso. Dados fiscais/financeiros retidos `retencao_fiscal_anos` mesmo após exclusão de conta (anonimizados quando possível).

## RN-15 Definições de métricas
- **GMV**: soma de `total_cliente` dos pedidos que chegaram a RECEBIDO, exceto cancelados/recusados; "GMV concluído" = só ENTREGUE.
- **Receita Webag**: `receita_webag` (RN-10).
- **Ticket médio**: GMV concluído / pedidos ENTREGUE.
- **Recompra**: % de clientes com 2+ pedidos ENTREGUE em 30 dias após o primeiro.
- **Cancelamento**: pedidos CANCELADO + RECUSADO / pedidos que chegaram a RECEBIDO, por ator e motivo.
- **Tempo de aceite**: RECEBIDO até ACEITO (mediana e p90).
- **Loja ativa**: aprovada, com 1+ pedido ENTREGUE nos últimos 30 dias.
