# PRD: Trocas ("Retira Troca")

Status: pronto para G3 | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-170 a WB-178
Regras: RN-11 (estados, prazos, matriz de motivos), RN-08, RN-10 em `docs/produto/regras-de-negocio.md`. Origem: brief §3.1 (diferencial) e §3.2. Hipóteses: HIP-017 a HIP-020.

## Problema
Quem sofre: Carla (medo de comprar roupa/calçado local sem poder trocar) e Seu Marcos (troca por WhatsApp sem registro, sem prazo, sem taxa clara). Evidência: a troca é o principal freio de compra de moda/calçado online `[HIPÓTESE; validar V3]`; marketplaces nacionais têm logística reversa lenta (`pesquisa-mercado.md` §4). Frequência: 5-15% dos pedidos de moda/calçado `[HIPÓTESE]`.

## Objetivo e métrica de sucesso
Transformar a troca em vantagem: pedido no app, regra clara, acompanhamento e coleta, sem briga.
| Métrica | Meta (HIP-043) |
|---|---|
| Conversão de moda/calçado em lojas com "aceita troca" vs. sem | maior (medir; V3) |
| Trocas concluídas dentro do SLA total (solicitação até resolução) | >= 80% em <= 10 dias |
| Trocas que vão à mediação | < 15% |
| Taxa de troca / pedidos ENTREGUE | < 15% (alerta se > 25%) |
| Satisfação de quem trocou (nota 1-5 pós-troca) | >= 4,0 |

**Eventos:** `exchange_requested {reason}`, `exchange_approved/rejected`, `exchange_pickup_scheduled`, `exchange_item_received`, `exchange_completed {resolution}`, `exchange_contested`, `exchange_mediated {outcome}`, `exchange_expired`.

## Fora do escopo (1.0)
Frete reverso integrado (transportadora/correios) e etiqueta; coleta por entregador Webag (fase 2); crédito na loja/vale-troca; troca por produto de **valor diferente** com cobrança/devolução da diferença (só mesmo produto em outra variação, ou reembolso); troca entre lojas; garantia estendida/contratual; peritagem técnica; chat na troca (usa WhatsApp).

## Usuários e cenários
1. Carla pediu 38, cabe 37: abre o pedido entregue, "Pedir troca", motivo "tamanho errado", foto da etiqueta, escolhe "Coleta em casa" (vê "taxa R$ 5,00, cobrada só se a loja aprovar"); a loja aprova, Carla paga a taxa, a loja coleta amanhã e envia o 37.
2. Carla se arrepende em 3 dias: "arrependimento" sem custo, reembolso.
3. Produto com defeito: foto obrigatória; loja contesta; admin media.
4. Marcos recebe a fila, aprova, agenda coleta, confere e marca recebido.

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-TRO-01 | Pedir troca pelo app (prazo, motivo, itens, fotos) | 170 |
| RF-TRO-02 | Acompanhar status | 171 |
| RF-TRO-03 | Loja: fila, aprovar/recusar, coleta, recebimento, resolução | 172-174 |
| RF-TRO-04 | Taxa de coleta | 175 |
| RF-TRO-05 | Contestação e mediação do admin | 176 (+ WB-110) |
| RF-TRO-06 | Prazos automáticos | 177 |
| RF-TRO-07 | Arrependimento (CDC) | 178 |
| RF-TRO-08 | Exibir política e filtro "aceita troca" | WB-014, WB-016, WB-059 |

## Regras de negócio
RN-11 (completa): matriz motivo x prazo x custo x resolução; estados da troca; SLAs; efeito financeiro e de estoque. Pontos-chave:
- Arrependimento (7 dias corridos) e defeito (30 dias) são **piso legal** e não dependem da política da loja (HIP-017).
- A loja define só a troca voluntária (tamanho/cor): se aceita, prazo (padrão 7) e taxa de coleta (<= R$ 30).
- 1 solicitação aberta por item; item trocado não troca de novo (salvo defeito).
- Reembolso em até 3 dias úteis após ITEM_RECEBIDO.

## Requisitos não funcionais
- **Fotos:** até 5 imagens por solicitação, JPG/PNG, até 5 MB cada, comprimidas no app; armazenadas privadas, visíveis ao cliente, à loja do pedido e ao admin (LGPD: sem metadados de localização, EXIF removido).
- **Offline:** o app guarda a solicitação em rascunho e envia ao voltar a conexão (a foto pode ser reenviada).
- **Auditoria:** toda decisão (aprovar, recusar, mediar) grava ator, hora e motivo.
- **Segurança:** só o dono do pedido abre a troca; a loja só vê trocas dos pedidos dela (autorização por objeto).
- **Acessibilidade:** fluxo em <= 4 telas, texto curto.

## Histórias e critérios de aceite

### WB-170 Pedir troca no app — Must — dep: WB-027, WB-059
Como cliente, quero pedir troca de um item entregue, para resolver sem sair de casa.
- **C1** Dado pedido ENTREGUE dentro de algum prazo (RN-11), então vejo "Pedir troca ou devolução" em cada item elegível; fora de todos os prazos, vejo "Prazo encerrado" com a data.
- **C2** Dado escolher o motivo (tamanho errado, defeito, cor diferente, arrependimento), então o app mostra só as opções válidas pelo prazo de cada motivo e explica o custo (ex.: "Taxa de coleta R$ 5,00").
- **C3** Dado motivo "defeito", então exijo 1 a 5 fotos; nos demais, fotos são opcionais.
- **C4** Dado "tamanho errado" ou "cor diferente", então escolho a variação desejada entre as com estoque; sem estoque, vejo "Sem estoque. Pedir reembolso?".
- **C5** Dado a loja sem troca voluntária (prazo 0), então tamanho/cor não aparecem como opção; arrependimento e defeito sim.
- **C6** Dado item com solicitação aberta, então "Pedir troca" não aparece e vejo o status.
- **C7** Dado enviar, então crio a troca SOLICITADA, notifico a loja (WB-193) e vejo o protocolo e o prazo de resposta (48 h).
- **C8** Dado sem conexão, então salvo como rascunho com aviso e envio depois (prazo conta da data de envio aceita pelo servidor; se venceu nesse intervalo, vale a data em que o cliente iniciou `[HIPÓTESE]`).

### WB-171 Acompanhar a troca — Must — dep: WB-170
Como cliente, quero ver o status da troca, para saber o próximo passo.
- **C1** Dado a troca, então vejo linha do tempo (solicitada, aprovada, coleta agendada, item recebido, concluída) com data e o "próximo passo" em uma frase.
- **C2** Dado mudança de status, então recebo push (WB-193) e a tela atualiza.
- **C3** Dado recusa, então vejo o motivo da loja e o botão "Contestar" (WB-176) até `contestacao_dias`.
- **C4** Dado reembolso, então vejo valor, forma e previsão (até 3 dias úteis após o item recebido).
- **C5** Dado "Cancelar troca" antes da coleta, então vira CANCELADA e a taxa de coleta é estornada.

### WB-172 Loja: fila de trocas e decisão — Must — dep: WB-170, WB-075
Como lojista, quero ver e decidir as trocas, para atender dentro do prazo.
- **C1** Dado a fila, então vejo trocas por prazo restante (48 h), com pedido, itens, motivo, fotos e a política aplicada; permissão "trocas" necessária.
- **C2** Dado "Aprovar", então a troca vira APROVADA e o cliente é notificado.
- **C3** Dado "Recusar" em troca voluntária, então exijo motivo; em troca fora do prazo/política, a recusa é permitida com o motivo "fora do prazo".
- **C4** Dado arrependimento, então "Recusar" não existe (RN-11); dado defeito, "Recusar" exige justificativa e vai à mediação (não é final).
- **C5** Dado 48 h sem resposta, então segue WB-177.
- **C6** Dado nenhuma troca, então "Nenhuma troca pendente".

### WB-173 Coleta e recebimento do item — Must — dep: WB-172
Como lojista, quero combinar a coleta e confirmar o recebimento, para fechar a troca.
- **C1** Dado APROVADA, então informo "Vou coletar" com data e janela (em até `coleta_agendamento_dias_uteis`) ou "O cliente leva à loja"; o cliente é notificado.
- **C2** Dado coleta feita, então marco "Item recebido" e escolho a inspeção: OK ou "Reprovar" (motivo + foto).
- **C3** Dado cliente ausente, então marco "Coleta não realizada" (até 2 reagendamentos); na 3ª, a troca EXPIRA e o cliente é avisado.
- **C4** Dado inspeção reprovada, então a troca vai à mediação (WB-110); a loja não pode recusar unilateralmente após recebimento.
- **C5** Dado item recebido OK, então marco se ele volta ao estoque (RN-06; defeito: padrão "não").

### WB-174 Resolução: reposição ou reembolso — Must — dep: WB-173, WB-154
Como cliente e lojista, quero concluir a troca com o novo item ou o dinheiro de volta, para encerrar.
- **C1** Dado troca por variação e estoque disponível, então o sistema reserva a unidade ao aprovar, e a loja marca "Novo item enviado" (e depois "Entregue"); a troca vira CONCLUIDA (trocada).
- **C2** Dado motivo arrependimento ou ausência de estoque da variação, então a resolução é reembolso: após ITEM_RECEBIDO o sistema estorna o valor do item (e o frete original em arrependimento `[validar com jurídico]`) em até 3 dias úteis, e a troca vira CONCLUIDA (reembolsada).
- **C3** Dado reembolso, então a comissão é devolvida proporcionalmente ao lojista (RN-10) e o ledger é atualizado.
- **C4** Dado falha do estorno, então a troca fica "Reembolso pendente" com retentativa e alerta ao financeiro.
- **C5** Dado reposição de valor diferente, então não é permitida na 1.0 (só mesma peça em outra variação ou reembolso).
- **C6** Dado concluir, então o cliente pode avaliar a experiência (nota 1-5, opcional).

### WB-175 Taxa de coleta — Must — dep: WB-170, WB-154
Como lojista, quero cobrar a coleta na troca voluntária, para não ter prejuízo.
- **C1** Dado troca por tamanho/cor com taxa de coleta > 0, então o cliente vê o valor antes de enviar e o paga por PIX ou cartão ao solicitar (mesmo provedor, cobrança separada do pedido).
- **C2** Dado recusa da loja ou cancelamento antes da coleta, então a taxa é estornada integralmente.
- **C3** Dado defeito ou arrependimento, então a taxa é R$ 0 (a loja arca).
- **C4** Dado a taxa, então ela entra no extrato da loja como receita da loja sem comissão `[HIPÓTESE]` e o provedor cobra a própria taxa dela.
- **C5** Dado taxa > `taxa_coleta_max_cents`, então a configuração da loja não deixa salvar (WB-059).
- **C6** Dado falha no pagamento da taxa, então a solicitação não é criada e o cliente vê o motivo.

### WB-176 Contestar recusa e mediação — Must — dep: WB-171, WB-110
Como cliente, quero contestar uma recusa, para ter uma segunda análise.
- **C1** Dado troca RECUSADA há <= `contestacao_dias` (7), então "Contestar" abre campo de texto (até 500 caracteres) e permite fotos adicionais.
- **C2** Dado contestação, então a troca vai a EM_MEDIACAO, o admin e a loja são notificados.
- **C3** Dado decisão do admin (WB-110), então a troca vira APROVADA (segue o fluxo) ou RECUSADA_FINAL; as partes recebem a justificativa.
- **C4** Dado prazo de contestação vencido, então o botão some e vejo "Prazo para contestar encerrado".
- **C5** Dado a recusa final, então o cliente vê que ainda pode procurar órgãos de defesa do consumidor (texto informativo, sem promessa).

### WB-177 Prazos automáticos — Must — dep: WB-172
Como sistema, quero aplicar os prazos, para nenhuma troca ficar parada.
- **C1** Dado troca SOLICITADA sem resposta da loja em `troca_resposta_h` (48 h), então: arrependimento é aprovada automaticamente; defeito e demais vão à EM_MEDIACAO; ambos notificam cliente, loja e admin.
- **C2** Dado lembrete, então a loja recebe aviso com 24 h e 4 h para o prazo.
- **C3** Dado APROVADA sem item entregue em `coleta_entrega_item_dias` (7), então EXPIRADA e o cliente é avisado antes (D-2).
- **C4** Dado ITEM_RECEBIDO sem resolução em `reembolso_dias_uteis`, então alerta ao financeiro.
- **C5** Dado mediação acima de `mediacao_dias_uteis`, então "Atrasado" no admin (WB-110).
- **C6** Dado feriado/fim de semana, então os dias úteis são contados em dias úteis (calendário nacional/SP; feriados cadastráveis `[HIPÓTESE]`).

### WB-178 Arrependimento (CDC art. 49) — Must — dep: WB-170
Como cliente, quero desistir da compra em até 7 dias, para exercer meu direito.
- **C1** Dado pedido ENTREGUE (entrega ou retirada), então por 7 dias corridos a partir do dia do recebimento vejo "Desistir da compra" sem precisar justificar.
- **C2** Dado a solicitação, então é aprovada sem análise (a loja é notificada e organiza coleta/devolução) e o item deve voltar sem sinais de uso além do razoável (conferido na inspeção).
- **C3** Dado ITEM_RECEBIDO, então o reembolso integral segue WB-174 C2.
- **C4** Dado inspeção reprovada, então vai à mediação (WB-173 C4); o texto "sem sinais de uso" aparece ao cliente antes de enviar.
- **C5** Dado o 8º dia, então a opção some; defeito e política da loja continuam valendo.
- **C6** Dado texto exibido, então segue minuta revisada pelo fundador/jurídico antes de G5.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Parecer jurídico: frete de devolução em arrependimento, 90 dias para duráveis, retirada na loja e art. 49 | Risco jurídico | Marcado `[validar]`; encaminhado ao fundador antes de G5 |
| Brief diz "a loja define se aceita"; CDC impõe piso | Conflito de escopo | HIP-017 (decidido pelo PO e sinalizado ao fundador) |
| Lojista faz coleta com os próprios meios (sem rastreio) | Risco operacional | Agenda e status manuais; fase 2 com entregador |
| Fraude de troca (item diferente) | Risco financeiro | Inspeção + mediação; fotos |
| Taxa de coleta via pagamento separado aumenta a complexidade | Risco técnico | WB-175; backend avalia |
| Troca consome estoque | Risco de estoque | Reserva na aprovação (RN-11) |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Frete de devolução em arrependimento por conta da loja (texto e valor) | fundador/jurídico |
| Prazo de defeito para bens duráveis (90 dias) | fundador/jurídico |
| Coleta pela loja no raio de entrega: limite de distância | PO decide: usa o raio da loja (HIP-013) |
