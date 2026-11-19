# Telas da Onda 5B: troca sem atrito, "Retira Troca" (DEC-037)

> Autor: product-designer. Data: 2026-11-19. Decisões: DEC-037 (estratégia de trocas), DEC-036 (a Webag faz a coleta), DEC-011 e DEC-023b (piso legal fixo), DEC-024b (motivo inerte com texto) e 024e (taxa só depois da aprovação), HIP-D09 e HIP-D21 (taxa: 48 h para pagar), HIP-018 a 020. Base: `design-system.md` v0.3.0, `identidade.md` §8, `onda-5-posvenda.md`, `onda-4d-logistica-admin.md` (fila de coleta), `prd/trocas.md` (**ainda na versão antiga**: coleta feita pela loja, SLA de 48 h, sem diferença de preço; o PO reescreve em paralelo; onde houver conflito, **esta spec segue a DEC-037** e a §Z lista o que o PRD precisa refletir).
> **Esta spec substitui:** `onda-5` **X1** (4 passos), **X2** (tabela de estados; mantida a estrutura, trocados os estados abaixo), **T1** (folha "Combinar a devolução" some) e **T2** (agendar coleta some). **Mantém:** X3 (contestar), M3 (mediação) com os acréscimos da §C.
> Prefixos de teste: app `exchange.`; lojista `lojista.trocas.`; admin `admin.trocas.`. Estados padrão: app EP-app (`onda-3` §0.2); web EP (`onda-2` §0.2). Datas no formato `25 nov` (`identidade.md` §8), não "DD/MM": evita ambiguidade e lê mais rápido.

## 0. Convenções

**0.1 Os 3 tipos, com prazo, custo e quem decide** (números marcados são parâmetros do admin, valores de partida **[HIPÓTESE]**):

| Tipo (rótulo no app) | Prazo (conta da **entrega confirmada**) | Custo ao cliente | Loja decide? | Resolução |
|---|---|---|---|---|
| **Desistir da compra** (arrependimento) | 7 dias corridos | Nenhum; **reembolso integral com o frete**; a Webag cobre a coleta | Não recusa; confere a peça depois | Reembolso |
| **Defeito ou avaria** | 30 dias (90 em durável; por categoria) | Nenhum; coleta grátis; fotos obrigatórias | Aprova ou contesta; contestar vai à mediação | Troca ou reembolso (cliente escolhe) |
| **Tamanho errado** e **Cor diferente** (voluntária) | Prazo da loja (padrão 7; mín. e máx. do admin) | **Levar à loja: grátis. Coleta em casa: taxa de coleta e entrega da região, cobrada só depois que a loja aprovar** | Aprova ou recusa com motivo; responde em **24 h** | Peça nova (só com estoque) ou reembolso |

Condições da troca voluntária: peça sem uso, com etiqueta e embalagem; **1 troca por pedido** **[HIPÓTESE]**. Produto marcado pela loja como **"sem troca voluntária"** (sob medida, íntimo, higiene) mostra "Tamanho errado" e "Cor diferente" **inertes com o motivo escrito** (ver ajuste em `onda-5c`).

**0.2 Orçamento de toques (a partir de "Meus pedidos", item único, 1 unidade).** Meta da DEC-037: "3 toques". **Medido no desenho, honestamente:**

| Caso | Toques | Sequência |
|---|---|---|
| Desistir da compra | **3** | "Trocar" na linha do pedido > "Desistir da compra" > "Pedir reembolso" |
| Tamanho errado, levando à loja | **4** | "Trocar" > "Tamanho errado" > novo tamanho > "Pedir troca" (devolução já vem em "Levar à loja") |
| Tamanho errado, com coleta em casa | **5** | + "Coleta em casa" |
| Defeito | **5 a 6** | "Trocar" > "Defeito" > "Tirar foto" > (obturador do sistema) > "Pedir troca" |

São **3 decisões** (motivo, peça nova, como devolver) mais abrir e enviar; **nada para digitar**. O X1 antigo tinha 4 telas e >= 7 toques. Não vendo "3 toques" como número mágico: vendo "1 tela, sem digitar".

**0.3 Prazo sempre escrito como data** ("Você tem até 25 nov"). Aparece em 4 lugares: linha do pedido em S8, S7 (botão), cada motivo na X1b e a ficha do produto como "N dias" (`onda-5c`). Uma data por motivo, nunca duas na mesma linha (a Zara mostra 30 dias para vale e 7 para o dinheiro de volta na mesma página e isso confunde [S, resumo de busca do help center da Zara Brasil; página não abri, domínio bloqueado]).

**0.4 Referências usadas (resumo de busca; **[M]** onde não abri a fonte).**

| Marca | Padrão extraído | Decisão |
|---|---|---|
| Mercado Livre [S: Canaltech, Tecnoblog, mercadolivre.com.br/seguranca] | Ação "Devolver grátis" na compra e **só visível dentro do prazo**; motivo; código ou QR; reembolso em 3 dias úteis; **não faz troca**, só devolve e recompra | Diferencial Webag: troca direta com peça nova reservada |
| Shopee [S: blog oficial, Tecnoblog; prazos divergem entre fontes] | "Minhas compras" > Devolução > motivo > evidências (fotos); itens íntimos excluídos; **relatos de reembolso cancelado quando a coleta falha** | Item íntimo vira marcador da loja; **falha de coleta nunca prejudica o cliente** |
| Zara Brasil [S: help center, resumo] | Troca só em loja física para compra em loja; online é devolução (vale ou dinheiro) | Webag permite trocar compra online **levando à loja** (grátis) |
| Renner | Sem fonte localizada; **não usado** | n/a |

---

# Parte A. Cliente (app)

## X1b. Pedir troca (tela única; substitui X1)

**Objetivo:** pedir a troca em poucos toques, sem digitar e sem surpresa de custo. **Ação principal:** **"Pedir troca"** (ou "Pedir reembolso" quando o motivo termina em reembolso), rodapé fixo `lg`.
**Entradas:** (1) botão texto **"Trocar · até 25 nov"** na linha do pedido entregue em S8 (novo; some fora do prazo); (2) "Pedir troca · até 25 nov" e "Desistir da compra" em S7 (este abre com "Desistir" já marcado). Pedido fora de todos os prazos: no lugar do botão, S7 mostra o EmptyState `Clock` "O prazo de troca acabou em 12 nov" / "Fale com a loja se precisar." / "Falar no WhatsApp".

| Breakpoint | Layout |
|---|---|
| Celular (app) | **Uma tela rolável com seções que se abrem em sequência.** Seção concluída recolhe e mostra a escolha ("Motivo: Tamanho errado · Alterar"). Rodapé fixo com **resumo vivo** (1 a 2 linhas) e o botão. Teclado só abre se a pessoa tocar no campo de texto opcional |
| Tablet >= 600 | Coluna centrada de 560; resumo continua no rodapé fixo |

**Layout (de cima para baixo):**
1. Header "Pedir troca" + voltar. Linha de contexto `caption`: "Pedido #1042 · Casa Bela · entregue em 18 nov".
2. **Banner de prazo** (info, `Clock`): "Você tem até 25 nov para trocar por tamanho ou cor." (a data da troca voluntária; as outras datas aparecem no motivo).
3. **O que você quer trocar?** Pedido de 1 item e quantidade 1: **uma linha só de resumo**, sem escolha (foto 56, nome, "M · Preto"). Vários itens: caixa por item e QuantityStepper até a quantidade comprada (como X1). Item já trocado: "Já trocado. Só vale por defeito." (inerte). Item com troca aberta: "Em troca · Ver" (sem caixa).
4. **O que aconteceu?** (RadioCard, alvo >= 56; **ordem por frequência**): 
   - **Tamanho errado** · "Troque por outro tamanho · até 25 nov"
   - **Cor diferente** · "Troque por outra cor · até 25 nov"
   - **Defeito ou avaria** · "Sem custo · até 18 dez"
   - **Desistir da compra** · "Reembolso total, com o frete · até 25 nov · sem custo"
   Inertes com o motivo escrito (`opacity.disabled` + `Info`; **tocar explica, não dá erro**): "Essa loja não faz troca por tamanho ou cor." · "Prazo encerrado em 12 nov." · "Este produto não tem troca por tamanho ou cor: é feito sob medida." · "...: é um item de higiene." Nada é escondido (DEC-024b).
5. **Seção contextual** (aparece depois do motivo):
   - **Tamanho errado / Cor diferente:** título **"Trocar por"**. VariantSelector com **só o que dá para trocar**: chips de tamanho (ou amostras de cor com o nome escrito) da **mesma peça**; opção atual marcada "Seu tamanho: M" e inerte; **sem estoque** aparece riscado com o texto "Sem estoque" e não seleciona (anunciado "G, sem estoque"); com 3 ou menos, "Resta 1". Se **nenhuma** opção tem estoque: "Sem estoque para trocar." + botão **"Pedir reembolso"** (muda a resolução; o resumo passa a "Reembolso"). Ao escolher: "Vamos separar a peça nova para você quando a loja aprovar." Se o preço difere: linha **Diferença de preço** ("O tamanho G custa R$ 10,00 a mais. Você paga se a loja aprovar." ou "O tamanho P custa R$ 5,00 a menos. Devolvemos para você.").
   - **Defeito:** PhotoPicker **1 a 5 fotos obrigatórias** ("Mostre o defeito de perto.") + rádio **"O que você prefere?"**: "Receber outro igual" / "Receber o dinheiro de volta" + campo "Quer contar mais? (opcional)" até 300.
   - **Desistir:** "Devolva o produto sem sinais de uso, com etiqueta e embalagem. Você recebe o valor total, com o frete." + link "Como funciona o direito de desistir" (folha com a minuta; `[validar com jurídico]`, WB-178 C6). Fotos opcionais.
6. **Como devolver?** (RadioCard, **"Levar à loja" já marcado**):
   - **Levar à loja** · **"Grátis"** · "Casa Bela · Rua das Palmeiras, 120 · seg a sex, 9h às 18h".
   - **Coleta em casa** · tamanho ou cor: **"R$ 5,00 · cobrada só se a loja aprovar"**; defeito e desistência: **"Grátis. A Webag busca na sua casa."** Subtexto: "Retira Troca: a Webag busca a peça e leva a nova na mesma viagem." Fora da região: inerte, "Coleta indisponível no seu bairro. Leve à loja."
   - **Aviso da taxa (Banner info, sempre visível quando a taxa existe e a coleta está marcada):** "Você não paga nada agora. Se a loja aprovar, avisamos e você paga a taxa de R$ 5,00 pela coleta e pela entrega da peça nova. Prefere não pagar? Leve à loja: é grátis."
7. **Rodapé fixo.** Linha 1 (resumo vivo, `bodyStrong`): "Trocar M por G". Linha 2 (`caption`): **"Hoje você paga R$ 0,00."** Botão `lg` **"Pedir troca"**. O botão fica **sempre ativo**: se faltar escolha, rola até a seção, borda `border.danger` e "Escolha o novo tamanho." / "Escolha o motivo." / "Adicione ao menos 1 foto." (DS §6; haptic de erro).

**Preço e dinheiro.** Hoje nada é cobrado. Depois da aprovação o cliente paga **uma vez só**: taxa de coleta e entrega (se Coleta em casa e troca voluntária) **mais** a diferença de preço (se houver), com o valor **congelado na aprovação** (HIP-D21). Diferença a favor do cliente: devolvida junto do reembolso/fechamento, em até 3 dias úteis. **[HIPÓTESE, DEC-037 diz "paga ou estornada na hora"; interpreto "na hora" como no momento da aprovação, para não cobrar algo que a loja pode recusar; PO confirma.]** A diferença compara o **preço que a variação nova tinha no dia da compra** com o que o cliente pagou, para que o fim de uma promoção não vire cobrança surpresa **[recomendação ao PO/backend]**.

**Rascunho e rede:** cada seção salva no aparelho; fotos ficam no aparelho até enviar. Sem conexão ao enviar: "Sem conexão. Seu pedido está guardado." + "Enviar quando voltar" (envia sozinho e avisa por toast). O prazo conta da data em que a pessoa iniciou **[HIPÓTESE, WB-170 C8]**.
**Envio:** fotos sobem com barra por foto; falha de uma não derruba as outras ("Foto 2 não enviou. Tentar de novo."). Botão "Enviando…" (inerte, sem duplicar, idempotência).
**Sucesso (tela):** `CheckCircle` Fill, **"Pedido de troca enviado"** (`title1`), "Protocolo TR-1042. A loja responde até 20 nov, 14:30. Se ela não responder, a Webag aprova a troca." CTA **"Acompanhar troca"** (X2b), link "Voltar aos pedidos". Haptic success; push permitido ou banner de avisos (S6). A frase de aprovação automática só aparece com a flag `troca_aprovacao_automatica` ligada **[HIPÓTESE, DEC-037]**.

**Estados.** Skeleton: item, motivos e política em skeleton enquanto confere prazos, estoque e política da loja. Vazio: sem motivo válido = EmptyState da fora do prazo (acima). Erro: EP-app; **estoque acabou entre a escolha e o envio:** "O tamanho G acabou agora. Escolha outro ou peça o reembolso." (mantém o resto preenchido); envio falhou: Banner "Não conseguimos enviar. Suas fotos estão guardadas." + "Tentar de novo"; foto grande: "Essa foto tem 8 MB. O máximo é 5 MB."; formato: "Use JPG ou PNG."; item já em troca: "Esse item já tem uma troca aberta." + "Ver troca". Offline: acima. Sucesso: acima. Permissão: câmera ou fotos negadas: "Sem acesso à câmera. Escolha uma foto da galeria." + "Abrir ajustes".
**Acessibilidade:** motivos e formas de devolver como grupos de rádio com o rótulo completo ("Tamanho errado, troque por outro tamanho, até 25 de novembro"); seção que abre anuncia seu título e recebe o foco; tamanho sem estoque lido "G, sem estoque"; resumo do rodapé em região viva educada ("Trocar M por G, hoje você paga zero"); fonte a 150%: o rodapé empilha em 3 linhas sem truncar valor nem data; alvo >= 48 e 8 de espaço. **Android x iOS:** Photo Picker (Android 13+) e PHPicker (iOS) sem permissão ampla; EXIF e local removidos no envio.
**testID:** `exchange.screen`, `exchange.deadline-banner`, `exchange.item-<id>`, `exchange.item-<id>-qty`, `exchange.reason-size`, `exchange.reason-color`, `exchange.reason-defect`, `exchange.reason-regret`, `exchange.reason-<id>-info`, `exchange.swap-<variacaoId>`, `exchange.swap-none-refund`, `exchange.price-diff`, `exchange.photo-camera`, `exchange.photo-gallery`, `exchange.photo-<n>-remove`, `exchange.defect-prefer-swap`, `exchange.defect-prefer-refund`, `exchange.note`, `exchange.return-store`, `exchange.return-pickup`, `exchange.fee-notice`, `exchange.summary`, `exchange.pay-today`, `exchange.submit`, `exchange.success-track`, `exchange.section-error`.
**Analytics:** `exchange_started`, `exchange_reason_selected {motivo}`, `exchange_return_selected {modo}`, `exchange_submitted {motivo, modo, tem_taxa}`, `exchange_abandoned {secao}` (a seção onde a pessoa saiu mede onde ainda há atrito).

## X2b. Acompanhar a troca (estrutura do X2; estados novos)

**Objetivo:** saber o próximo passo em uma frase e **o que vem a seguir sem pagar nada por surpresa**. **Ação principal:** muda por estado. Entradas: Conta > Trocas, S7 (cartão da troca), push.
**Layout (mantém X2):** header "Troca TR-1042" · cartão **Próximo passo** (NextStepCard) · **StatusTimeline** de 7 passos: **Enviada · Em análise · Aprovada · Devolução (coleta ou loja) · Recebida pela loja · Peça nova ou reembolso · Concluída** (ramos Recusada, Em mediação, Cancelada, Expirada no último nó, com motivo) · resumo (item, motivo, fotos, o que foi escolhido, **valores**) · "Falar com a loja" · "Ajuda com esta troca". Cada passo mostra a data; o atual, o prazo ("até 20 nov, 14:30").

| Estado | Próximo passo (texto) | Ação principal |
|---|---|---|
| Solicitada | "Aguardando a loja. Ela responde até 20 nov, 14:30." Barra fina de tempo restante (24 h) com o texto; "Se ela não responder, a Webag aprova a troca." | "Falar com a loja"; texto "Cancelar troca" |
| **Aprovada, falta pagar** (tamanho ou cor com coleta, e/ou diferença de preço) | "Troca aprovada. Pague R$ 15,00 até 22 nov, 14:30 para marcarmos a coleta." Abaixo, o **extrato**: "Taxa de coleta e entrega R$ 5,00 + Diferença de preço R$ 10,00 = R$ 15,00. Valor fechado, não muda." Se não pagar no prazo: "A troca é cancelada. Você pode pedir de novo ou levar à loja." | **"Pagar com PIX · R$ 15,00"** (folha de PIX ou cartão, como S5/S4); texto **"Prefiro levar à loja, sem taxa"** (Dialog "Levar à loja?" / "Você não paga a taxa de coleta. A diferença de preço de R$ 10,00 continua." / "Levar à loja" · "Voltar") |
| Aprovada, levar à loja | "Troca aprovada. Leve o produto à loja até 27 nov." + endereço, horário e **código da troca** em `numeral` | "Copiar endereço" |
| **Coleta marcada** (Webag) | "Coleta prevista: amanhã. O motoboy avisa antes de chegar. Deixe a peça na embalagem, com a etiqueta." | "Falar com a Webag" |
| **Motoboy a caminho** | "O motoboy está a caminho da sua casa." (+ nome, sem telefone) | "Falar com a Webag" |
| **Peça coletada** | "Recebemos a peça. Ela está a caminho da loja." | n/a |
| **Troca em casa** (ida e volta) | "O motoboy levou o tamanho G e buscou o M." | n/a |
| **Falha de coleta** | "Não conseguimos buscar a peça. Nova tentativa: 23 nov. **Seu prazo não foi prejudicado.**" Na 3ª falha da Webag: "O prazo foi estendido. Vamos combinar com você." | "Falar com a Webag" |
| Recebida pela loja | "A loja recebeu a peça e está conferindo." | n/a |
| Em mediação | "A Webag está analisando. Resposta em até 5 dias úteis." | "Enviar mais fotos" |
| Reembolso processando | "Reembolso de R$ 89,90 a caminho. Chega em até 3 dias úteis." + "PIX volta para a conta de origem. No cartão, pode levar até 2 faturas." | n/a |
| Concluída | "Troca concluída." | "Avaliar a troca" (nota 1 a 5, opcional) |
| **Recusada** | Ver o cartão abaixo | "Contestar recusa" (X3) |
| Cancelada | "Você cancelou esta troca." Se já pagou: "Devolvemos R$ 15,00." | "Ver pedido" |
| Expirada (cliente não levou) | "O prazo para entregar o produto acabou em 28 nov." | "Falar com a loja" |

**Cartão "A loja não aceitou a troca" (recusa com motivo e o que fazer).** Fundo `danger.subtle`, ícone `XCircle` + texto (nunca só cor). Conteúdo: **Motivo** em 1 frase, vindo da loja ("Produto com sinais de uso.") + observação da loja, se houver · bloco **"O que você pode fazer"** com 3 caminhos em linha, cada um com verbo:
1. **Contestar a recusa**, botão primário: "A Webag analisa em até 5 dias úteis. Você tem até 25 nov." (X3).
2. **Falar com a loja**, botão secundário (WhatsApp): "Talvez ela tenha entendido errado."
3. **Pedir outra coisa**: se for tamanho/cor e o prazo de defeito ou arrependimento ainda vale, link "Desistir da compra" (reembolso) com a data. 
Arrependimento nunca chega aqui. **Recusa final** (depois da mediação): "A Webag manteve a recusa: [justificativa]. Você ainda pode procurar um órgão de defesa do consumidor." (informativo, sem promessa) + "Falar com a Webag".
**Alertas:** em D-2 do prazo para levar à loja, Banner de alerta "Faltam 2 dias para levar o produto." (também push). **Tempo real:** push e puxar para atualizar; mudança anunciada ao leitor.
**Estados.** Skeleton: cartão e timeline. Vazio (lista "Minhas trocas"): `ArrowsClockwise` "Nenhuma troca em andamento" / "Se algo não servir, peça a troca em Pedidos." / "Ver pedidos". Erro/Offline: EP-app; "Conecte-se para pagar. Seus dados estão guardados." Sucesso: toasts "Taxa paga. A coleta será marcada." / "Troca cancelada." Permissão: só o dono do pedido ("Não encontramos essa troca.").
**Acessibilidade:** timeline lida "Passo 3 de 7, Aprovada, concluído em 20 nov"; o extrato é lista de pares nome e valor lidos em ordem; valor "R$ 15,00" por extenso; código da troca com "Copiar" e leitura por dígito; contagem do prazo de pagamento **não** é lida a cada minuto.
**testID:** `exchange.list-tab-open`, `exchange.list-tab-done`, `exchange.list-item-<id>`, `exchange.next-step`, `exchange.timeline`, `exchange.fee-statement`, `exchange.pay`, `exchange.switch-to-store`, `exchange.switch-confirm`, `exchange.copy-address`, `exchange.pickup-info`, `exchange.cancel`, `exchange.cancel-confirm`, `exchange.rejected-card`, `exchange.rejected-reason`, `exchange.contest`, `exchange.contact-store`, `exchange.try-regret`, `exchange.add-photos`, `exchange.rate`, `exchange.help`.

---

# Parte B. Lojista (web)

## TL1. Trocas: fila com aprovação em 1 toque (substitui T1)

**Objetivo:** decidir dentro de **24 h** sem abrir cada troca e sem perder a lei. **Ação principal:** **"Aprovar troca"** (ou "Aceitar desistência"). Menu Trocas (permissão "trocas"). Prefixo `lojista.trocas.`. **O que mudou:** não existe mais a folha "Combinar a devolução": a **Webag cuida da coleta**; aprovar é **1 toque**; recusar são **3** (abrir, motivo, confirmar).

| Breakpoint | Layout |
|---|---|
| Celular | Tabs "Para responder (2)", "Em andamento (3)", "Concluídas". **Cartões que já contêm tudo para decidir** (abaixo) e **os botões dentro do cartão**; o toque no resto do cartão abre o detalhe |
| Desktop >= 1024 | 2 colunas: fila (440) com os mesmos cartões e detalhe à direita sem trocar de página; ordenada por **prazo mais curto** |

**Cartão da fila** (de cima para baixo): 1) **SLA visível:** chip "Responda em 20 h" (normal > 8 h; atenção <= 8 h com `Warning`; urgente <= 2 h com `WarningCircle` e fundo de erro; sempre com texto); selo do motivo ao lado · 2) foto 56 + "Camiseta Básica · **M para G**" + "TR-1042 · Carla S." · 3) **linha de contexto por motivo:** tamanho ou cor: "Estoque do G: restam 2" ou "Sem estoque do G: vira reembolso"; defeito: **3 miniaturas de 56** (toque abre a galeria com zoom) + a frase do cliente em 2 linhas; desistência: "Por lei, o cliente pode desistir em até 7 dias." · 4) **devolução:** "Cliente leva à loja" ou "Webag busca em casa. Sem custo para você" **[HIPÓTESE, quem arca com a coleta de defeito e desistência; DEC-037 diz que a Webag cobre, configurável]** · 5) **botões:** conforme a tabela.

| Motivo | Botões no cartão | Regra |
|---|---|---|
| Desistência | **"Aceitar desistência"** (único) | Sem "Recusar" (RN-11). Você confere a peça quando ela chegar |
| Defeito | **"Aprovar troca"** · "Contestar defeito" | Contestar pede justificativa e foto opcional; vai à mediação; **não é recusa final** |
| Tamanho, cor | **"Aprovar troca"** · "Recusar" | Sem estoque da peça nova: o botão vira **"Aprovar e reembolsar"** (a resolução é reembolso) |

**Aprovar (1 toque):** muda na hora, reserva 1 unidade da peça nova (se houver), avisa o cliente. Toast "Troca aprovada. Carla S. foi avisada. A Webag cuida da coleta." Sem diálogo de confirmação (ação de baixo risco, reversível só pelo suporte). **Recusar:** abre a folha **"Por que recusar?"** com chips (rádio): "Produto com sinais de uso" · "Sem etiqueta ou embalagem" · "Item diferente do vendido" · "Fora do prazo" · "Outro" (texto obrigatório, 10 a 200); aviso "O cliente pode contestar com a Webag."; botão destrutivo **"Recusar troca"**. O motivo escolhido é o texto que o cliente lê no cartão de recusa (X2b), por isso as frases são curtas e sem jargão. Recusa fora do prazo: "Fora do prazo" já marcado.
**Prazo vencido (24 h):** o cartão sai de "Para responder" com o selo **"Aprovada automaticamente"** e o texto "Você não respondeu a tempo. A Webag aprovou a troca para o cliente." **[HIPÓTESE, DEC-037: aprovação automática; defeito e o resto seguem a regra do PRD, HIP-019 dizia mediação]**. **Lembretes:** com 12 h e 4 h (e-mail, faixa global, push), som discreto de "Nova troca" (não usa o alerta de tela cheia dos pedidos).

**Estados.** Skeleton: 3 cartões. Vazio: `ArrowsClockwise` "Nenhuma troca pendente" / "Quando um cliente pedir troca, avisamos com som e e-mail." / "Ver política de trocas" (C5). Erro: EP-web; decisão que falha: "Não foi possível salvar. Sua decisão não foi perdida." + "Tentar de novo". Conflito: "A Webag já decidiu esta troca." + "Ver decisão". Offline: "Conecte-se para decidir. A troca continua esperando." (o prazo segue contando). Sucesso: toasts acima. Permissão: só quem tem "trocas" (dono sempre); fotos e dados do cliente só enquanto a troca está ativa (RN-14).
**Acessibilidade:** o prazo restante é texto ("Responda em 20 horas"), anunciado só ao mudar de nível; botões com rótulo completo ("Aprovar troca TR-1042"); miniaturas com `alt` "Foto 1 de 3 enviada pelo cliente"; ordem de foco: chip de prazo, dados, fotos, Aprovar, Recusar.
**testID:** `tab-pending`, `tab-open`, `tab-done`, `card-<id>`, `deadline-<id>`, `stock-line-<id>`, `photos-<id>`, `photo-<id>-<n>`, `approve-<id>`, `approve-refund-<id>`, `accept-regret-<id>`, `reject-<id>`, `reject-sheet`, `reject-reason-<id>`, `reject-text`, `reject-confirm`, `contest-defect-<id>`, `contest-text`, `auto-approved-badge`, `detail`, `policy-card`, `empty`. **Analytics:** `exchange_approved {origem: cartao|detalhe}`, `exchange_rejected {motivo}`, `exchange_escalated`, `exchange_auto_approved`.

## TL2. Troca em andamento (substitui T2)

**Objetivo:** fechar a troca sabendo o que **é** da loja (preparar e conferir) e o que **não é** (coleta e entrega, da Webag). **Ação principal:** o **próximo passo** (StatusAction `lg`), como em P2.

| Estado | Próximo passo (botão do lojista) | Detalhes |
|---|---|---|
| Aprovada, cliente leva à loja | **"Marcar item recebido"** | Campo "Código da troca" (4 dígitos; confirma que é a troca certa). Se há peça nova: depois da conferência, "Entregar a peça nova agora" (cliente no balcão) |
| Aprovada, coleta pela Webag, **com peça nova** | **"Peça nova pronta para coleta"** (prazo "Prepare até 21 nov", 1 dia útil **[HIPÓTESE]**) | Cria o trabalho "Troca ida e volta" na Logística (`onda-4d`). Aviso: "Deixe a peça nova embalada. O motoboy leva e traz a antiga." |
| Aprovada, coleta pela Webag, **só reembolso** | Sem botão | Faixa "A Webag busca a peça com o cliente. Avisamos quando ela chegar à loja." |
| Motoboy a caminho / com o cliente | Sem botão | Nome do motoboy, estado ("A caminho do cliente"), sem telefone |
| **Peça antiga na loja** | **"Item conferido, está OK"** (primário) · "Reprovar item" (secundário) | Reprovar abre folha com motivo e 1 foto; vai à mediação (a loja não recusa sozinha depois de receber, WB-173 C4). **Aviso de risco:** na ida e volta a peça nova já foi entregue; reprovar com foto é o que sustenta a mediação |
| Item OK, resolução reembolso | Automático | "Reembolso de R$ 89,90 em andamento"; caixa "Voltar o item ao estoque" (defeito: desmarcada). Texto do modo split: "O reembolso sai da sua conta Mercado Pago. A comissão de R$ 9,00 volta para você." **[HIPÓTESE, ADR-002]** |
| Em mediação | Sem botão | "A Webag está decidindo. Resposta em até 5 dias úteis." |
| Concluída, Recusada final, Cancelada, Expirada | n/a | Resumo financeiro: valor devolvido, comissão devolvida. **A taxa de coleta é da Webag (DEC-036a): não aparece como receita da loja** (substitui a hipótese de WB-175 C4 em T2) |

**Estados.** Skeleton: cartão e timeline. Vazio: n/a. Erro: EP-web; "Reembolso pendente. Tentando de novo." Offline: "Conecte-se para atualizar a troca. Nada foi alterado." Sucesso: toasts "Peça nova pronta. A Webag foi avisada." / "Item recebido." / "Item conferido." Permissão: como TL1.
**testID (prefixo `lojista.trocas.`):** `next-step`, `pickup-code-input`, `received`, `new-piece-ready`, `deliver-now`, `inspect-ok`, `inspect-reject`, `inspect-reject-reason`, `inspect-reject-photo`, `restock-checkbox`, `refund-status`, `webag-pickup-banner`, `driver-info`, `timeline`.

---

# Parte C. Admin

## AT1. Relatório de trocas (novo; DEC-037 "trocas viram relatório")

**Objetivo:** saber **onde as trocas custam caro** para ajustar taxa, prazo e tabela de medidas. **Ação principal:** abrir a loja ou categoria com mais trocas (e "Exportar CSV" como apoio). Menu Pedidos > Relatório de trocas (super, operação, financeiro em leitura). Prefixo `admin.trocas.`

| Breakpoint | Layout |
|---|---|
| Celular | Período em chips (7 dias · Mês · Escolher); **5 números** em lista: Trocas, **Taxa de troca** (trocas ÷ pedidos entregues; alerta com ícone e texto acima de 25%, meta abaixo de 15%, HIP-043), Taxas recebidas, Custo das corridas de troca, **Saldo das trocas** (taxas menos custo; negativo = "prejuízo"). Depois, 3 visões em Tabs: **Por loja · Por categoria · Por produto** (lista de linhas com a taxa de troca e o motivo principal) |
| Desktop | KPI (5) em linha + DataTable por visão. Colunas "Por loja": Loja, Pedidos entregues, Trocas, **Taxa de troca**, Motivo principal, Custo logístico, Taxas, Saldo, "Aprovada automática (%)". "Por produto": Produto, Loja, Trocas por tamanho, **Tem tabela de medidas?** (Sim/Não), Link "Ver produto" |

- A coluna **"Tem tabela de medidas?"** liga o relatório à ação: produto com muita troca por tamanho e sem tabela vira lista de contato ("Peça à loja para preencher"). Botão "Avisar loja" com texto pronto (Should).
- Cartão "Atenção": "3 lojas com taxa de troca acima de 25%" abre a lista filtrada.
**Estados.** Skeleton: KPIs + 6 linhas. Vazio: `ArrowsClockwise` "Ainda sem trocas no período" / "Quando houver, o relatório aparece aqui." / "Ver este mês". Sem resultado de filtro: "Nenhuma troca neste filtro." + "Limpar filtros". Erro/Offline: EP-web. Sucesso: "Exportação pedida. Registrada na auditoria." Permissão: financeiro lê; suporte sem acesso.
**Acessibilidade:** tabela com cabeçalhos; alerta de 25% com ícone e palavra "Atenção"; números por extenso. **testID:** `report.period-7d`, `report.period-month`, `report.kpi-count`, `report.kpi-rate`, `report.kpi-fees`, `report.kpi-cost`, `report.kpi-balance`, `report.tab-store`, `report.tab-category`, `report.tab-product`, `report.row-<id>`, `report.alert-card`, `report.notify-store-<id>`, `report.export`.

## AT2. Taxas e parâmetros de troca (novo)

**Objetivo:** ajustar o custo da troca sem mexer no que é lei. **Ação principal:** "Salvar" em cada parâmetro (ReasonDialog com antes e depois, TOTP se pedir, auditoria). Menu Configurações > Trocas (super; operação lê). Reaproveita ParamRow (DS §3.1c).
**Layout:** duas seções.
1. **Taxa de coleta e entrega por região** (tamanho ou cor com coleta em casa): tabela/lista Região (cidade ou faixa de distância, a mesma tabela de entrega, DEC-036a) · Taxa de entrega (referência, somente leitura) · **Taxa de troca** (moeda; **padrão = taxa de entrega da região**, selo "Padrão" quando igual; teto R$ 30,00, HIP-018) · **Campanha** (chave "Troca sem taxa" com datas início e fim: "Sem taxa até 30 nov"; vale a todas as regiões ou a uma). O efeito aparece escrito antes de salvar: "Quem pedir coleta de 25 a 30 nov não paga a taxa. Custo estimado: R$ 6,00 por troca." 
2. **Parâmetros** (ParamRow com "Padrão X · de A a B"): Prazo da troca voluntária da loja (padrão 7; **mínimo 3 e máximo 15** **[HIPÓTESE]**) · Resposta da loja (24 h) · Aprovação automática ao vencer (Ligada) · Trocas por pedido (1) · Quem cobre a coleta de desistência (Webag) · Prazo para pagar a taxa (48 h). **Selo "Lei"** e campo bloqueado, com o texto "Fixado por lei, não editável" (DEC-023b): arrependimento 7 dias, defeito 30/90 dias.
**Estados.** Skeleton: linhas de região. Vazio: "Nenhuma região cadastrada" / "Cadastre as regiões de entrega primeiro." / "Ir para regiões". Erro: "Não foi possível salvar. Nada foi alterado." Offline: EP. Sucesso: toast "Taxa de Francisco Morato salva. Vale para novas trocas." Permissão: operação lê e vê "Peça a um super admin para alterar".
**testID:** `params.region-<id>-fee`, `params.region-<id>-campaign`, `params.campaign-start`, `params.campaign-end`, `params.effect`, `params.row-<chave>`, `params.locked-<chave>`, `params.save`, `params.reason`.

## AT3. Troca no admin: acréscimos à M3

Na página da troca (M3 e link do pedido), além do caso e da decisão de mediação:
- Bloco **Logística:** estado do trabalho, motoboy, tentativas, link "Ver na Logística" (`onda-4d` LG2).
- Bloco **Valores:** taxa de coleta e entrega (valor congelado, estado: "pendente", "paga em 20 nov", "isenta"), diferença de preço, reembolso.
- Ações: **"Isentar a taxa"** (ReasonDialog; se já paga, mostra "A taxa de R$ 5,00 será devolvida ao cliente"), para resolver casos de suporte sem decisão de mediação **[HIPÓTESE; perfis: operação e super]**; selo **"Aprovada automaticamente"** na linha do tempo, com o ator "Sistema".
- Falha de coleta pela Webag (3 tentativas): alerta "Prazo do cliente estendido. Fale com ele." (sem prejudicar o cliente, LG5).
**testID:** `admin.trocas.detail-logistics`, `admin.trocas.detail-values`, `admin.trocas.waive-fee`, `admin.trocas.waive-confirm`, `admin.trocas.auto-approved`.

---

## Z. Hipóteses, conflitos e perguntas

**Conflitos com o PRD antigo (o PO reescreve; peço que reflita):**
1. **SLA da loja:** PRD 48 h (HIP-019, WB-172, WB-177) x DEC-037 **24 h**. Segui 24 h. Lembretes mudam de 24 h e 4 h para 12 h e 4 h.
2. **Aprovação automática:** PRD faz só desistência aprovar sozinha, o resto vai à mediação; DEC-037 diz aprovar após 24 h. Segui a DEC como **[HIPÓTESE]** e coloquei flag. Risco: loja perde troca de defeito sem ler. Mitigação: lembretes e selo claro.
3. **Diferença de preço:** PRD (fora do escopo, WB-174 C5) x DEC-037 (paga ou estornada). Segui a DEC; momento da cobrança proposto na §X1b (**depois da aprovação, junto da taxa**); regra do preço de referência recomendada.
4. **Coleta:** PRD "loja coleta" (WB-173 C1, agendar) x DEC-036/037 **Webag coleta**: somem "Agendar coleta" e a folha "Combinar a devolução"; entra "Peça nova pronta para coleta".
5. **Taxa de coleta:** PRD "receita da loja" (WB-175 C4) x DEC-036a **receita da Webag**.
6. **Taxa por loja (teto R$ 30 definido pela loja)** x DEC-037 **tabela do admin por região**: o campo "Taxa de coleta" do C5 (`onda-2`) deixa de existir no lojista (fica prazo e marcador). C5 precisa de ajuste curto; **não feito nesta rodada**.

**Riscos que nomeio:** (a) a peça nova sai antes de a antiga ser conferida na ida e volta (fraude de peça diferente); (b) o prazo de troca depende de o admin marcar "Entregue" (`onda-4d` §Z risco 1); (c) "1 troca por pedido" com vários itens pode irritar quem quer trocar 2 peças de tamanhos diferentes: a X1b permite vários itens na mesma troca, uma taxa só; o PO confirma se isso é "1 troca" ou 2.

**Perguntas ao PO:** diferença de preço (quando e com qual preço de referência); quem arca com a coleta de defeito e desistência (a Webag, conforme DEC-037; a loja concorda?); o prazo do defeito por categoria (30 ou 90); reparo como terceira opção do defeito (CDC art. 18): hoje só "outro igual" ou "dinheiro de volta"; nome "Retira Troca" no app (usei "Coleta em casa" no rótulo e "Retira Troca" no subtexto).
**Ao fundador:** revisão jurídica do texto de desistência e da regra de prazo antes do G5 (DEC-037). **[HIPÓTESE] a validar** com 5 moradores que já trocaram roupa online: entendem "Hoje você paga R$ 0,00" e a taxa depois da aprovação? E com 3 lojistas: aprovam pelo cartão sem abrir o detalhe?
