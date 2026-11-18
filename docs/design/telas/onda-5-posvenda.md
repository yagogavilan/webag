# Telas da Onda 5: pós-venda, dinheiro do lojista e gestão

> Autor: product-designer. Data: 2026-11-18. Histórias: WB-031, 033, 073, 074, 078, 195 (avaliar, cupons, notificações, painel); WB-170 a 178 e 037 (trocas "Retira Troca"); WB-076, 077 (financeiro do lojista); WB-102, 105, 108 a 113, 116 (admin). Base: `design-system.md` (v0.3.0), `identidade.md` §8, `fluxos.md` §6, `regras-de-negocio.md` RN-08 a RN-12, `prd/trocas.md`. Decisões: DEC-011 (piso legal), DEC-016 e 020 (split: sem retenção; teto de cobertura), HIP-D09 (taxa de coleta depois da aprovação). Itens **[HIPÓTESE]** na §Z.
> **Já existem e não são repetidos:** Favoritos (D11, `onda-3`), pontos de entrada de Avaliar, Pedir troca e "Não recebi" (S7, `onda-4`), pedidos e histórico do lojista (P1 a P3, `onda-4`), código por e-mail e folha de confirmar e-mail (`onda-1b-contas.md` E4 e E5), A3 (loja no admin).
> Plataformas e prefixos de teste: **app** `exchange.`, `review.`, `coupons.`, `notifications.`; **painel do lojista** `lojista.<tela>.`; **admin** `admin.<tela>.`.

## 0. Convenções

**0.1 Estados.** App: EP-app (`onda-3` §0.2). Web: EP-web (`onda-2` §0.2). Cada tela abaixo traz uma linha **Estados** com o que é específico: Skeleton · Vazio · Erro · Offline · Sucesso · Permissão.
**0.2 Breakpoints web:** como `onda-2` §0.1: celular < 640 (barra inferior, ação fixa no rodapé), tablet 640 a 1023 (1 coluna de até 640), desktop ≥ 1024 (barra lateral 240, conteúdo até 1200; admin abaixo de 1024 vira lista de linhas).
**0.3 Dinheiro e split (DEC-016).** No modo split o Webag **não retém nem ajusta repasse**. Toda tela que fala de estorno ou repasse mostra o texto certo do modo: "O reembolso sai da sua conta Mercado Pago" (lojista) e "Informativo: o dinheiro vai direto para a loja" (admin). Texto do modo centralizado só aparece com a flag do modo ligada (decisão do fundador, ADR-002).
**0.4 Reautenticação (TOTP, `onda-1b-contas.md` AC5a).** Estorno, "Revelar" dado pessoal, executar repasse, ajuste de conciliação e alterar comissão pedem o código do autenticador se o último tiver mais de 5 minutos. A ação segue sozinha depois.
**0.5 Motivo e auditoria.** ReasonDialog (`onda-1b-contas.md` AD0) em toda ação do admin que mexe em dinheiro, pedido ou usuário. Falha ao gravar a auditoria cancela a ação.
**0.6 Mapa.**

| Parte | Telas |
|---|---|
| A. Cliente (app) | X1 Pedir troca · X2 Acompanhar a troca · X3 Contestar a recusa · X4 Avaliar · X5 Meus cupons · X6 Notificações |
| B. Lojista (web) | T1 Trocas: fila e decisão · T2 Troca em andamento (coleta, recebimento, resolução) · V1 Cupons · V2 Avaliações · F1 Financeiro · H1 Painel inicial |
| C. Admin: pedidos e trocas | M1 Pedidos · M2 Cancelar e estornar · M3 Trocas e disputas · U1 Usuários |
| D. Admin: dinheiro e cupons | F2 Comissões e taxa de serviço · F3 Repasses · F4 Conciliação · F5 Cupons da plataforma |

**0.7 Eventos de analytics** (sem dado pessoal): `exchange_started`, `exchange_reason_selected {motivo}`, `exchange_submitted`, `exchange_approved`, `exchange_rejected`, `exchange_contested`, `exchange_escalated`, `review_submitted {nota}`, `coupon_viewed`, `notification_opened {tipo}`. Os de admin e dinheiro vêm do servidor (`refund_issued {amount}`, `param_changed`).

---

# Parte A. Cliente (app)

## X1. Pedir troca ou devolução (WB-170, 175, 178; `fluxos.md` §6)

**Objetivo:** resolver o problema sem sair de casa e sem redigitar nada. **Ação principal:** "Continuar" nos passos e **"Enviar pedido de troca"** no fim. Entrada: S7 (pedido entregue) > "Pedir troca · até 25 nov" ou "Desistir da compra" (mesmo fluxo, com o motivo Arrependimento já marcado).

**Passos (cabeçalho "Passo 2 de 4" + barra `brand.600`; voltar sempre preserva o que foi escolhido; rodapé fixo com "Voltar" e "Continuar" `lg`).** Pedido com 1 item de quantidade 1 **pula o passo 1** e vira "de 3".

| Passo | Conteúdo |
|---|---|
| 1. O que trocar | Lista dos itens do pedido (foto 56, nome, "M · Preto", quantidade). Caixa por item + QuantityStepper até a quantidade comprada. Item que já tem troca aberta: "Em troca · Ver" (sem caixa). Item que já foi trocado: não elegível ("Já trocado. Só vale por defeito.") |
| 2. Motivo | 4 rádios grandes (alvo ≥ 56), cada um com **prazo e custo escritos**: **Arrependimento** "Até 29 nov · sem custo" (texto: "Você pode desistir em até 7 dias. Devolva o produto sem sinais de uso além do razoável.", WB-178 C4) · **Defeito** "Até 18 dez · sem custo" · **Tamanho errado** e **Cor diferente** "Até 25 nov · se a loja aprovar, a coleta em casa custa R$ 5,00". Motivo fora do prazo ou que a loja não aceita **aparece inerte com o motivo escrito**: "Prazo encerrado em 12 nov" · "Essa loja não faz troca por tamanho ou cor". Toque nele explica em uma frase (sem erro) |
| 3. Fotos e troca por | **Defeito:** PhotoPicker, 1 a 5 fotos **obrigatórias** ("Mostre o defeito de perto."). **Tamanho ou cor:** fotos opcionais + "Trocar por": variações **com estoque** (chips de tamanho ou amostras de cor, como D9); sem estoque: "Sem estoque nesse tamanho. Quer o reembolso?" com botão "Pedir reembolso" (muda a resolução). **Arrependimento:** fotos opcionais; texto "Termina em reembolso." |
| 4. Como devolver | Rádio: "Levar até a loja" (endereço e horário da loja, "Casa Bela · Rua das Palmeiras, 120 · seg a sex 9h às 18h") ou "Coleta em casa" (só se a loja entrega no endereço; "A loja combina o horário com você"). Tamanho e cor com coleta: "Taxa de coleta R$ 5,00, cobrada só se a loja aprovar" (HIP-D09). Defeito e arrependimento: "Sem custo para você." |
| Revisão | Resumo de 5 linhas (item, motivo, fotos em miniatura, troca por, devolução) com "Editar" em cada. Prazo da loja: "A loja responde em até 2 dias." Botão `lg` "Enviar pedido de troca" |

- **Aviso legal curto** no passo 2 (arrependimento): link "Como funciona o direito de desistir" abre folha com a minuta revisada (WB-178 C6, `[validar com jurídico]`).
- **Fora de todos os prazos (WB-170 C1):** em vez do botão em S7, EmptyState `Clock`: "O prazo de troca acabou em 12 nov" / "Fale com a loja se precisar." / "Falar no WhatsApp".
- **Rascunho e rede (C8):** cada passo salva no aparelho; fotos ficam no aparelho até enviar. Sem conexão no envio: tela "Sem conexão. Seu pedido está guardado" + "Enviar quando voltar" (o app envia sozinho ao reconectar e avisa por toast). O prazo conta da data em que o cliente iniciou **[HIPÓTESE, WB-170 C8]**.
- **Envio:** fotos sobem com barra por foto; falha de uma não derruba as outras ("Foto 2 não enviou. Tentar de novo."). Botão em "Enviando…" (inerte, sem duplicar).
- **Sucesso (tela):** `CheckCircle` Fill, "Pedido de troca enviado" (`title1`), "Protocolo TR-1042 · A loja responde em até 2 dias." CTA "Acompanhar troca" (X2), link "Voltar ao pedido". Haptic success; push permitido ou banner de avisos (S6).

**Estados.** Skeleton: itens e motivos em skeleton enquanto confere prazos e política da loja. Vazio: sem motivo válido (EmptyState acima). Erro: EP-app; envio com falha: Banner "Não conseguimos enviar. Suas fotos estão guardadas." + "Tentar de novo"; foto grande: "Essa foto tem 8 MB. O máximo é 5 MB."; formato: "Use JPG ou PNG."; pedido mudou (item já em troca): "Esse item já tem uma troca aberta." + "Ver troca". Offline: acima. Sucesso: acima. Permissão: câmera ou fotos negadas: "Sem acesso à câmera. Escolha uma foto da galeria." + "Abrir ajustes".
**A11y:** rádios como grupo "Motivo" com prazo e custo lidos no rótulo; PhotoPicker com "Remover foto 2" (48); progresso por foto anunciado; foco no título a cada passo ("Passo 3 de 4, Fotos"); fonte a 150% sem truncar prazos. **Android x iOS:** seletor de fotos nativo (Photo Picker do Android 13+, PHPicker no iOS) sem pedir permissão ampla; EXIF/local removido no envio. **testID:** `exchange.step-<n>`, `exchange.item-<id>`, `exchange.item-<id>-qty`, `exchange.reason-arrependimento`, `exchange.reason-defeito`, `exchange.reason-tamanho`, `exchange.reason-cor`, `exchange.reason-<id>-info`, `exchange.photo-camera`, `exchange.photo-gallery`, `exchange.photo-<n>-remove`, `exchange.swap-<variacaoId>`, `exchange.ask-refund`, `exchange.return-store`, `exchange.return-pickup`, `exchange.review`, `exchange.review-edit-<secao>`, `exchange.submit`, `exchange.back`, `exchange.next`, `exchange.success-track`.

## X2. Acompanhar a troca e Minhas trocas (WB-171, 175, 176, 177; WB-174 C6)

**Objetivo:** saber o próximo passo em uma frase. **Ação principal:** muda por estado (tabela). Entradas: Conta > Trocas (lista), S7 (cartão da troca), push (WB-193).

**Lista "Minhas trocas".** Tabs segmentadas "Em andamento" e "Concluídas". Linha (72): foto do item, "Camiseta Básica · TR-1042", StatusBadge da troca, "Próximo passo" em 1 linha ("Leve à loja até 27 nov"). Vazio (DS §5.2): `ArrowsClockwise` "Nenhuma troca em andamento" / "Se algo não servir, peça a troca em Pedidos." / "Ver pedidos".
**Detalhe.** Header "Troca TR-1042" · cartão **"Próximo passo"** no topo (título `title2` + 1 frase + ação) · StatusTimeline de 7 passos (Enviada, Em análise, Aprovada, Devolução, Recebida pela loja, Reembolso ou novo envio, Concluída; ramos Recusada, Em mediação, Cancelada, Expirada no último nó, com motivo) · resumo (item, motivo, fotos) · "Falar com a loja" (WhatsApp, sempre visível) · "Ajuda com esta troca".

| Estado da troca (RN-11) | Próximo passo mostrado | Ação principal |
|---|---|---|
| Solicitada | "Aguardando a loja. Ela responde até 20 nov, 14:30." | "Falar com a loja"; texto "Cancelar troca" (Dialog "Cancelar a troca?" / "Você pode pedir de novo dentro do prazo." / "Cancelar troca" · "Voltar") |
| Aprovada, levar à loja | "Troca aprovada. Leve o produto à loja até 27 nov." + endereço, horário e **código da troca** em `numeral` | "Copiar endereço" (e "Falar com a loja") |
| Aprovada, taxa pendente (tamanho ou cor com coleta) | "Troca aprovada. Pague a taxa de coleta de R$ 5,00 para a loja agendar." | "Pagar taxa · R$ 5,00" (folha com PIX ou cartão, mesmos componentes de S4 e S5; confirmação automática) |
| Aprovada, coleta sem data | "A loja vai combinar a coleta até 21 nov." | "Falar com a loja" |
| Coleta agendada | "Coleta em 21 nov, entre 14h e 18h. Deixe o produto na embalagem, com a etiqueta." | "Falar com a loja" |
| Coleta falhou | "Não conseguimos coletar. Nova tentativa combinada: 23 nov. (1 de 2)" | "Falar com a loja" |
| Item recebido | "A loja recebeu o produto e está conferindo." | n/a |
| Em mediação | "O Webag está analisando. Resposta em até 5 dias úteis." | "Enviar mais fotos" (opcional) |
| Reembolso processando | "Reembolso de R$ 89,90 a caminho. Chega em até 3 dias úteis." + "PIX volta para a conta de origem. No cartão, pode levar até 2 faturas." | n/a |
| Reembolso pendente | "Estamos resolvendo seu reembolso. Avisamos quando sair." | "Falar com o Webag" |
| Reposição enviada | "A loja enviou o novo item (tam. 37)." | "Falar com a loja" |
| Concluída | "Troca concluída." (trocada ou reembolsada) | "Avaliar a troca" (nota 1 a 5, opcional, 1 toque) |
| Recusada | "A loja não aceitou: item usado." + "Você pode contestar até 25 nov." (arrependimento nunca chega aqui) | "Contestar recusa" (X3) |
| Recusa final | "O Webag manteve a recusa: [justificativa]." + "Você ainda pode procurar um órgão de defesa do consumidor." (informativo, sem promessa) | "Falar com o Webag" |
| Cancelada | "Você cancelou esta troca. A taxa de coleta foi devolvida." | "Ver pedido" |
| Expirada | "O prazo para entregar o produto acabou em 28 nov." | "Falar com a loja" |

**Prazo do cliente:** em D-2 aparece Banner de alerta "Faltam 2 dias para levar o produto." (também por push, WB-193 C3). **Tempo real:** a tela atualiza por push e puxar-para-atualizar; mudança anunciada ("Troca aprovada").
**Estados.** Skeleton: cartão "Próximo passo" e timeline. Vazio: lista acima. Erro/Offline: EP-app; ações de rede: "Conecte-se para cancelar a troca." Sucesso: toasts "Troca cancelada." / "Taxa paga. A loja já pode agendar." Permissão: só o dono do pedido abre (outro: "Não encontramos essa troca.").
**A11y:** timeline lida "Passo 3 de 7, Aprovada, concluído em 20 nov"; código da troca com "Copiar" e leitura separada por dígito. **testID:** `exchange.list-tab-open`, `exchange.list-tab-done`, `exchange.list-item-<id>`, `exchange.next-step`, `exchange.timeline`, `exchange.cancel`, `exchange.cancel-confirm`, `exchange.pay-fee`, `exchange.copy-address`, `exchange.whatsapp`, `exchange.contest`, `exchange.add-photos`, `exchange.rate`, `exchange.help`. **Analytics:** `exchange_approved` e demais vêm do servidor.

## X3. Contestar a recusa (WB-176)

**Objetivo:** pedir uma segunda análise. **Ação principal:** "Enviar contestação". Folha em tela cheia aberta de X2 (só troca Recusada, até `contestacao_dias`).
- **Layout:** título "Contestar a recusa" · cartão "Motivo da loja" (texto) · campo "Explique por que você discorda" (até 500, contador "120 de 500") · PhotoPicker (fotos adicionais, opcional) · botão `lg` "Enviar contestação".
- **Mensagens:** "Escreva o motivo da contestação." · prazo vencido: "O prazo para contestar acabou em 25 nov." (botão some em X2, WB-176 C4). Sucesso: tela "Contestação enviada" / "O Webag responde em até 5 dias úteis." / "Ver troca"; X2 passa a "Em mediação".
- **Estados.** Skeleton: n/a. Vazio: n/a. Erro/Offline: texto e fotos preservados; "Conecte-se para enviar. Seu texto está guardado." Sucesso: acima. Permissão: câmera como X1.
- **testID:** `exchange.contest-reason`, `exchange.contest-text`, `exchange.contest-photo-camera`, `exchange.contest-photo-gallery`, `exchange.contest-submit`.

## X4. Avaliar o pedido (WB-031; resposta da loja em V2)

**Objetivo:** avaliar em 10 segundos. **Ação principal:** "Enviar avaliação". Entradas: S7 (pedido entregue) "Avaliar pedido" e o push 1 h depois da entrega (WB-191 C4, uma só vez). Pedido cancelado, recusado ou expirado não tem o botão (C4).
- **Layout:** header "Avaliar pedido". **Bloco 1, a loja:** logo 40 + "Como foi com a Casa Bela?" · **Rating de 5 estrelas de 48** com a palavra ao lado ("Péssimo", "Ruim", "Regular", "Bom", "Ótimo") · campo "Quer contar mais? (opcional)" até 500 com contador. **Bloco 2, os produtos (recolhíveis, fechados por padrão, "Avaliar os produtos · opcional"):** por item, foto 56, nome, Rating e comentário opcional. Rodapé fixo: botão `lg` "Enviar avaliação". Só a nota da loja é obrigatória; produtos podem ficar sem nota.
- **Aviso curto:** "Sua avaliação fica pública com seu primeiro nome." Moderação pós-publicação (HIP-021): o comentário pode ser removido se tiver ofensa ou dado pessoal; não removemos por ser negativo (RN-12), texto em "Como funcionam as avaliações" (link).
- **Já avaliado (C3):** mostra a minha avaliação (estrelas, texto, data) e "Apagar e avaliar de novo" (dentro da janela; Dialog "Apagar sua avaliação?" / "Você pode avaliar de novo até 18 dez." / "Apagar avaliação" · "Cancelar"). **Janela encerrada (C5):** "O prazo para avaliar acabou em 18 dez."
- **Sucesso:** toast "Obrigado. Sua avaliação foi enviada." e volta ao pedido, onde o botão virou "Sua avaliação" (estrelas e texto).
- **Estados.** Skeleton: 1 bloco. Vazio: n/a. Erro: EP-app; "Escolha uma nota para a loja." se faltar nota; comentário acima de 500 trava com contador em `text.danger` ("20 a mais"). Offline (C6): "Sem conexão. Sua avaliação está guardada e será enviada quando voltar." (único caso de envio adiado, não é pagamento). Sucesso: acima. Permissão: n/a.
- **A11y:** Rating como controle ajustável ("Nota da loja, 4 de 5, Bom"); estrelas com borda e preenchimento (não só cor); alvo 48. **testID:** `review.store-rating`, `review.store-comment`, `review.products-toggle`, `review.product-<id>-rating`, `review.product-<id>-comment`, `review.submit`, `review.mine`, `review.delete`, `review.delete-confirm`, `review.closed`. **Analytics:** `review_submitted {nota}`.

## X5. Meus cupons (WB-033; aplicar no carrinho é S1)

**Objetivo:** usar o cupom antes de vencer. **Ação principal:** "Usar". Conta > Cupons (e atalho "Cupons" na Sacola).
- **Layout:** header "Meus cupons"; campo "Tem um código?" + botão secundário "Adicionar" (mesmas mensagens de S1) no topo. Lista em **Linha** (sem caixa, divisor): ícone `Tag`, **código** em `numeralSm` ("BEMVINDO10"), o desconto em palavras ("R$ 10,00 de desconto", "10% até R$ 20,00", "Frete grátis"), escopo ("Em toda a plataforma" ou "Só na Casa Bela"), "Pedidos a partir de R$ 80,00", validade "Vence em 20 nov". Selo **"Vence em breve"** (alerta, `Clock`) quando faltam ≤ 48 h. Ações: "Usar" (primário `md`) e "Copiar código" (texto).
- **"Usar":** com sacola da mesma loja (ou cupom da plataforma): aplica e abre S1 com o toast "Cupom aplicado." Sacola vazia: leva às lojas ("Escolha uma loja para usar"). Sacola de outra loja: Dialog "Esse cupom é da Casa Bela. Sua sacola é de outra loja." / "Ver a Casa Bela" · "Fechar".
- **E-mail não confirmado (WB-224 C2):** cupom da plataforma ou de 1ª compra mostra "Confirme seu e-mail para usar" no lugar de "Usar", que abre a EmailConfirmSheet (`onda-1b-contas.md` E5b).
- **Estados.** Skeleton: 4 linhas. Vazio: `Tag` "Sem cupons agora" / "Cupons novos aparecem aqui." / "Ver ofertas". Erro/Offline: EP-app; lista do cache; "Adicionar" offline: "Conecte-se para adicionar o cupom." Sucesso: toast "Cupom adicionado." Permissão: visitante: EmptyState "Entre para ver seus cupons" + "Entrar" (S2).
- **A11y:** linha lida "BEMVINDO10, R$ 10 de desconto, em toda a plataforma, pedidos a partir de R$ 80, vence em 20 novembro". **testID:** `coupons.code-input`, `coupons.add`, `coupons.item-<id>`, `coupons.item-<id>-use`, `coupons.item-<id>-copy`, `coupons.item-<id>-expiring`, `coupons.other-store-dialog`, `coupons.confirm-email`.

## X6. Notificações (WB-195, Should; preferências em `onda-6-conformidade.md` CC6)

**Objetivo:** não perder nada do pedido, da troca e dos cupons. **Ação principal:** abrir uma notificação. Conta > Notificações; contador de não lidas no ícone da aba Conta (círculo `neutral.900` com número).
- **Layout:** header "Notificações" com "Marcar todas como lidas" (texto, alvo 48) e engrenagem "Preferências" (CC6, onda 6). Seções por data ("Hoje", "Esta semana", "Antes"). Linha (72): ícone por tipo (`Package` pedido, `ArrowsClockwise` troca, `Tag` cupom, `Info` aviso), título (`bodyStrong` se não lida), texto de 1 a 2 linhas, "há 2 h". **Não lida = título em negrito + ponto + texto escondido "não lida" para o leitor** (nunca só o ponto). Toque abre o destino (pedido na etapa atual, troca, cupons) e marca como lida. Rodapé: "Mostrando as últimas 50, dos últimos 30 dias."
- **Permissão de push negada:** Banner no topo "Os avisos estão desligados. Ative para saber quando o pedido sair." + "Abrir ajustes"; a central continua funcionando (WB-190 C2). Nunca pedimos a permissão aqui (já foi pedida depois do 1º pedido, S6).
- **Estados.** Skeleton: 6 linhas. Vazio: `Bell` "Nada por enquanto" / "Avisos de pedidos e trocas aparecem aqui." / "Ver pedidos". Erro/Offline: EP-app; lista do cache; marcar como lida offline entra em fila local (ação segura). Sucesso: contador zera. Permissão: acima. Visitante: "Entre para ver seus avisos." + "Entrar".
- **A11y:** lista como `list`; cada linha com rótulo "Pedido saiu para entrega, há 2 horas, não lida"; contador da aba "Conta, 3 notificações novas". **testID:** `notifications.list`, `notifications.item-<id>`, `notifications.mark-all`, `notifications.settings`, `notifications.push-off-banner`, `notifications.open-settings`, `notifications.empty`. **Analytics:** `notification_opened {tipo}`.

---

# Parte B. Lojista (web)

## T1. Trocas: fila e decisão (WB-172, 175, 193)

**Objetivo:** decidir dentro das 48 h sem perder a troca nem a lei. **Ação principal:** "Aprovar troca" (ou "Aceitar desistência"). Menu Trocas (permissão "trocas"; funcionário sem ela: Sem acesso). Prefixo `lojista.trocas.`

| Breakpoint | Layout |
|---|---|
| Celular | Tabs "Para responder (2)", "Em andamento (3)", "Concluídas". Lista de cartões 1 coluna: "TR-1042 · Camiseta Básica M", selo do motivo, cliente "Carla S.", **prazo restante** ("Responda em 36 h"; a partir de 24 h em alerta com `Warning`; a partir de 4 h em erro com `WarningCircle`, sempre com texto). Toque abre o detalhe em tela cheia |
| Desktop | 2 colunas: fila à esquerda (400), detalhe à direita; sem trocar de página. A fila ordena por prazo mais curto |

**Detalhe:** cabeçalho com protocolo, pedido (#1042, link) e prazo · **Motivo** (selo + texto do cliente) · **Fotos** (miniaturas 96, toque abre galeria com zoom) · **Itens** a trocar (foto, variação, quantidade) · **Trocar por** (variação pedida + "Estoque agora: restam 2" ou "Sem estoque: vira reembolso") · **Devolução pedida** (leva à loja ou coleta em casa, endereço mascarado depois do prazo, RN-14) · **Política aplicada** (cartão `info.subtle`, `Scales`): "Troca por tamanho ou cor em até 7 dias. Taxa de coleta R$ 5,00. Dentro do prazo." · quanto a loja recebe de volta se for reembolso ("A comissão de R$ 9,00 volta para você.").
**Ações por motivo (RN-11, nunca oferecemos o que a lei não permite):**

| Motivo | Botões | Regra na tela |
|---|---|---|
| Arrependimento | **"Aceitar desistência"** (único) | Sem "Recusar". Texto: "Por lei, o cliente pode desistir em até 7 dias. Você confere o produto quando ele chegar." (WB-172 C4, WB-178) |
| Defeito | **"Aprovar troca"** (primário) · "Contestar defeito" (secundário) | Contestar pede justificativa e foto opcional; Dialog: "O Webag analisa e decide. Se o defeito for real, a troca é aprovada." A recusa **não é final** |
| Tamanho errado, cor diferente | **"Aprovar troca"** · "Recusar troca" | Recusar abre folha "Por que recusar?" com rádios "Fora do prazo", "Produto usado", "Item diferente do vendido", "Outro" (texto obrigatório) e "Recusar troca" (destrutivo); aviso "O cliente pode contestar com o Webag." Recusa fora do prazo ou política: "Fora do prazo" já preenchido |

**Aprovar abre folha "Combinar a devolução":** rádio "Vou coletar na casa do cliente" (data e janela: dias úteis até 3 dias, janelas "8h às 12h", "12h às 18h", "Escolher horário"; link "Agendar depois: prazo até 21 nov") ou "O cliente leva à loja" (usa o endereço de retirada da loja) · resumo "Se você aprovar, o cliente é avisado agora." · botão "Aprovar e combinar". Se há estoque da variação pedida, a folha mostra "Vamos reservar 1 unidade do tamanho 37 para esta troca."

**Sem resposta em 48 h (WB-177 C1):** o cartão sai de "Para responder" com o selo "Prazo vencido": arrependimento foi aprovado sozinho e os outros foram à mediação; texto no detalhe "Você não respondeu a tempo. O Webag assumiu." Avisos: faixa global no painel (24 h e 4 h) e e-mail.

**Estados.** Skeleton: 3 cartões. Vazio: `ArrowsClockwise` "Nenhuma troca pendente" / "Quando um cliente pedir troca, avisamos com som e e-mail." / "Ver política de trocas" (leva a C5). Erro: EP-web; decisão que falha: "Não foi possível salvar. Sua decisão não foi perdida." + "Tentar de novo". Conflito: "O Webag já decidiu esta troca." + "Ver decisão". Offline: "Conecte-se para decidir. A troca continua esperando." (o prazo segue contando). Sucesso: toast "Troca aprovada. Carla S. foi avisada." / "Troca recusada. O cliente pode contestar." Permissão: só quem tem "trocas" (dono sempre); fotos e dados do cliente só enquanto ativa (RN-14).
**A11y:** prazo restante em texto ("Responda em 36 horas"); botões com rótulo completo ("Aprovar troca TR-1042"); galeria com `alt` "Foto 1 de 3 enviada pelo cliente". **testID:** `tab-pending`, `tab-open`, `tab-done`, `card-<id>`, `deadline-<id>`, `detail`, `photos`, `photo-<n>`, `policy-card`, `approve`, `accept-regret`, `reject`, `reject-reason-<id>`, `reject-text`, `reject-confirm`, `contest-defect`, `contest-text`, `return-pickup`, `return-store`, `pickup-date`, `pickup-window-<id>`, `schedule-later`, `approve-confirm`, `empty`. **Analytics:** `exchange_approved`, `exchange_rejected`, `exchange_escalated`.

## T2. Troca em andamento: coleta, recebimento e resolução (WB-173, 174)

**Objetivo:** fechar a troca sem esquecer nenhum passo. **Ação principal:** o **próximo passo** (StatusAction), um botão `lg` só, como em P2. Mesma tela de detalhe da T1 (a aba "Em andamento" abre aqui), com o cartão "Próximo passo" no topo e a linha do tempo.

| Estado | Próximo passo (botão) | Detalhes e menu "Mais" |
|---|---|---|
| Aprovada, sem data | "Agendar coleta" | Folha da T1; aviso "Agende até 21 nov" (`coleta_agendamento_dias_uteis`) |
| Aprovada, cliente leva | "Marcar item recebido" | Código da troca informado pelo cliente: campo 4 dígitos "Código da troca" (confirma que é a troca certa) |
| Coleta agendada | "Marcar item recebido" | Menu: "Coleta não realizada" (cliente ausente; até 2 reagendamentos, depois a troca expira e o cliente é avisado, WB-173 C3) · "Reagendar" |
| Item recebido | Inspeção: **"Item conferido, está OK"** (primário) · "Reprovar item" (secundário) | Reprovar abre folha: motivo obrigatório + 1 foto; "O Webag vai analisar. Você não pode recusar sozinho depois de receber." (vai à mediação, C4) |
| Item OK, resolução reembolso | Automático; mostra "Reembolso de R$ 89,90 em andamento" | Caixa "Voltar o item ao estoque" (defeito: desmarcada por padrão; senão marcada). Texto do modo split: "O reembolso sai da sua conta Mercado Pago. A comissão de R$ 9,00 volta para você." **[HIPÓTESE conforme ADR-002]** |
| Item OK, resolução reposição | "Marcar novo item enviado" e depois "Marcar como entregue" | Mesma regra de P2; a unidade foi reservada na aprovação |
| Em mediação | Sem botão | Faixa "O Webag está decidindo. Resposta em até 5 dias úteis." Você vê as justificativas, não decide |
| Concluída, Recusada final, Cancelada, Expirada | n/a | Resumo financeiro da troca (valor devolvido, comissão devolvida, taxa de coleta recebida) |

- **Taxa de coleta:** "Paga pelo cliente: R$ 5,00 (vai para você, sem comissão do Webag)" **[HIPÓTESE, WB-175 C4]**; se o cliente cancelar antes da coleta, a taxa volta para ele e a tela mostra "Troca cancelada pelo cliente."
- **Estados.** Skeleton: cartão e timeline. Vazio: n/a. Erro: EP-web; reembolso com falha: faixa "Reembolso pendente. Tentando de novo." (o financeiro do Webag é avisado). Offline: ações bloqueadas com "Conecte-se para atualizar a troca. Nada foi alterado." Sucesso: toasts "Coleta agendada para 21 nov." / "Item recebido." / "Novo item enviado." Permissão: como T1.
- **testID (prefixo `lojista.trocas.`):** `next-step`, `pickup-code-input`, `received`, `pickup-failed`, `reschedule`, `inspect-ok`, `inspect-reject`, `inspect-reject-reason`, `inspect-reject-photo`, `restock-checkbox`, `replacement-sent`, `replacement-delivered`, `refund-status`, `fee-info`, `timeline`.

## V1. Cupons da loja (WB-073, Should)

**Objetivo:** criar uma promoção sem se arriscar. **Ação principal:** "Criar cupom". Menu Cupons (permissão "cupons"). Prefixo `lojista.cupons.`

| Breakpoint | Layout |
|---|---|
| Celular | Tabs "Ativos" e "Encerrados". Lista de linhas (72): código em `numeralSm`, "10% até R$ 20,00 · mínimo R$ 80,00", "12 de 50 usos · R$ 180,00 de desconto dado", validade, **Switch "Ativo/Pausado"** com texto. Botão principal fixo no rodapé |
| Desktop | DataTable: Código, Desconto, Mínimo, Usos, Desconto dado, Validade, Ativo (Switch), menu |

**Formulário (tela cheia no celular, drawer 480 no desktop):** Código (4 a 20, A a Z e 0 a 9, vira maiúsculas sozinho, botão "Sugerir código") · Tipo (segmentado **"Percentual"** | **"Valor em R$"**) · Valor (% de 1 a 100 ou moeda) · Teto do desconto (só percentual, opcional) · Pedido mínimo (opcional) · Começa em / Termina em (data nativa) · Limite de usos no total · Limite por cliente (padrão 1). **Prévia** "Como o cliente vê: BEMVINDO10 · 10% até R$ 20,00 · pedidos a partir de R$ 80,00".
**Mensagens:** "Use de 4 a 20 letras e números." · "Esse código já existe. Escolha outro." · "O desconto vai de 1% a 100%." · "O fim precisa ser depois do início." **Aviso de risco (C2):** Dialog "Esse desconto é grande" / "Ele é maior que o seu produto mais barato (R$ 29,90). Você pode vender abaixo do custo." / "Salvar mesmo assim" · "Voltar e ajustar" (aparece para percentual acima de 90% ou valor maior que o menor produto sem teto).
**Pausar ou encerrar (C4):** Dialog "Pausar BEMVINDO10?" / "Ele deixa de valer agora. Pedidos já feitos mantêm o desconto." / "Pausar cupom" · "Cancelar".
**Estados.** Skeleton: 5 linhas. Vazio: `Tag` "Nenhum cupom ainda" / "Crie um para atrair o primeiro pedido." / "Criar cupom". Erro/Offline: EP-web; Switch volta ao valor antigo se falhar. Sucesso: toast "Cupom BEMVINDO10 criado." / "Cupom pausado." Permissão: sem "cupons": Sem acesso; **só a loja vê os seus** (cupom da plataforma não aparece aqui).
**A11y:** Switch com rótulo "BEMVINDO10, ativo"; segmentado como grupo de rádio. **testID:** `create`, `tab-active`, `tab-ended`, `row-<id>`, `row-<id>-switch`, `code-input`, `code-suggest`, `type-percent`, `type-value`, `value-input`, `cap-input`, `min-input`, `start-input`, `end-input`, `limit-total-input`, `limit-customer-input`, `preview`, `risk-confirm`, `pause-confirm`, `submit`.

## V2. Avaliações: ler e responder (WB-074, Should)

**Objetivo:** mostrar atenção ao cliente. **Ação principal:** "Responder". Menu Avaliações (permissão "avaliações"). Prefixo `lojista.avaliacoes.`
- **Layout:** topo com resumo (nota média em `numeral`, total, barras de 5 a 1; abaixo de 3 avaliações: "Novo" e a frase "A média aparece a partir de 3 avaliações.") e chip de filtro "Sem resposta (3)". Lista (celular em 1 coluna; desktop em 2: lista à esquerda e a escolhida à direita): nome abreviado "Maria S.", estrelas + nota em número, data, comentário, produto avaliado (quando for de produto), selo "Compra verificada" (`SealCheck`), e a **resposta da loja** recuada, quando houver.
- **Responder (C1, C2):** campo até 500 com contador; aviso "Sua resposta é pública. Você pode apagar, mas só editar em até 24 h."; botão "Publicar resposta". Uma resposta por avaliação. Dentro de 24 h: "Editar" e "Apagar"; depois: só "Apagar".
- **Denunciar (C3):** menu `DotsThree` > "Denunciar avaliação" abre o fluxo de WB-038 (onda 6, `onda-6-conformidade.md` DN1). Mensagem de apoio: "Avaliação negativa não é motivo para denunciar."
- **Estados.** Skeleton: resumo + 4 linhas. Vazio: `Star` "Ainda sem avaliações" / "Elas aparecem aqui depois que os clientes avaliarem pedidos entregues." / "Ver meus pedidos". Sem resultado do filtro: "Todas respondidas." + "Ver todas". Erro/Offline: EP-web; texto da resposta preservado. Sucesso: toast "Resposta publicada." Permissão: sem "avaliações": Sem acesso.
- **A11y:** cada avaliação é um `article` ("Avaliação de Maria S., 4 de 5"). **testID:** `summary`, `filter-unanswered`, `item-<id>`, `item-<id>-reply`, `reply-input`, `reply-submit`, `item-<id>-edit`, `item-<id>-delete`, `item-<id>-report`.

## F1. Financeiro: resumo, recebimentos e extrato (WB-076, 077; só o dono)

**Objetivo:** confiar nos números e saber quando o dinheiro chega. **Ação principal:** "Exportar extrato" (a tela é de leitura). Menu Financeiro; **funcionário não vê** (RN-13): Sem acesso. Prefixo `lojista.financeiro.`

| Breakpoint | Layout |
|---|---|
| Celular | Seletor de período (chips "Hoje", "7 dias", "30 dias", "Este mês", "Escolher datas"). Tabs "Resumo", "Recebimentos" (ou "Repasses"), "Extrato" |
| Desktop | Mesmas Tabs; Resumo em KPIs de até 4 por linha e gráfico ao lado |

**Resumo:** **PriceSummary do lojista** do período: Vendas brutas · Comissão Webag (−) · Taxa de pagamento (−) · Estornos (−) · **Líquido** (`title1`). Abaixo, 3 KPIs: **Em carência** · **A receber** · **Já recebido**. Gráfico "Vendas por dia" (barras em `brand.600`, rótulo direto, tabela alternativa e resumo em texto: "Maior dia: sexta, R$ 1.240,00").
**Recebimentos (modo split, padrão):** Banner info "Você recebe direto na sua conta Mercado Pago. Aqui você acompanha o que já foi liberado." Lista por pedido: nº, data, líquido, **status vindo do provedor** ("Liberado", "A liberar em 24 nov", "Em disputa"). Pedido em disputa: "Um estorno pode sair da sua conta Mercado Pago." (WB-076 C5). **Modo centralizado (só com flag):** a aba se chama "Repasses": lotes com data, valor, status ("Agendado", "Pago", "Falhou"), e a data do próximo ("O primeiro sai em 25 nov"; sem repasse: "Ainda sem repasses.").
**Pedido (detalhe de linha):** composição RN-10 em PriceSummary lojista + status do recebimento.
**Extrato (WB-077):** período de até 12 meses (seletor de datas com limite), botão "Exportar CSV". Estados do botão: "Preparando…" (spinner), depois download automático e toast "Extrato exportado." Valores com ponto decimal e 2 casas; dados do cliente respeitam as máscaras (RN-14). Período sem dados: arquivo só com o cabeçalho e aviso "Sem lançamentos neste período."

**Estados.** Skeleton: KPIs e linhas. Vazio: `Wallet` "Ainda sem vendas" / "Quando o primeiro pedido for entregue, os números aparecem aqui." / "Ver meus pedidos". Erro: EP-web; exportação falhou: "Não foi possível exportar. Tentar de novo." Offline: números do cache com "Atualizado às 10:42"; exportar: "Conecte-se para exportar." Sucesso: toast acima; a exportação vai à auditoria. Permissão: só dono; funcionário: Sem acesso.
**A11y:** gráfico com `role="img"` e `aria-label` com o resumo + tabela alternativa recolhida "Ver os valores por dia"; KPI com variação em texto ("+12% vs. semana passada"); moeda lida por extenso. **testID:** `period-<id>`, `tab-summary`, `tab-payments`, `tab-statement`, `kpi-gross`, `kpi-commission`, `kpi-fee`, `kpi-refunds`, `kpi-net`, `kpi-grace`, `kpi-receivable`, `kpi-received`, `chart`, `chart-table-toggle`, `payment-<id>`, `export`, `export-range`.

## H1. Painel inicial do lojista (WB-078)

**Objetivo:** decidir o dia em 5 segundos. **Ação principal:** a pendência mais urgente (o 1º cartão de "Para fazer agora"). Início (aba central no celular). Prefixo `lojista.inicio.`

| Breakpoint | Layout |
|---|---|
| Celular | Cabeçalho do painel (chip Aberta/Pausada). **"Para fazer agora"** (lista de pendências, cada uma é um cartão-link). **"Hoje"** (vendas e pedidos). **"Últimos 7 dias"**. Ticket médio e avaliação em linha. "Mais vendidos" em lista numerada (1 a 5). Gráfico "Vendas por dia" por último |
| Desktop ≥ 1024 | Pendências em faixa no topo (até 4 lado a lado); 4 KPIs na linha seguinte; abaixo, gráfico (8 colunas) e Mais vendidos (4 colunas) |

**Pendências (C4), por urgência, só as que existem, cada uma com ícone, número e destino:** "2 pedidos novos · responda agora" (P1, `Receipt`) · "1 troca para responder · 36 h" (T1, `ArrowsClockwise`) · "3 produtos com estoque baixo" (K1) · "Loja pausada até 15:30 · Reabrir" (C3) · "Sem horário definido" (C3) · "Falta conectar o Mercado Pago" (L6) · "Loja nova: pedidos de até R$ 500,00 até 18 dez" (informativo, WB-225 C2). Sem pendência: Banner de sucesso curto "Tudo em dia."
**KPIs (RN-15):** Vendas de hoje "R$ 1.240,00 · 14 pedidos" · Últimos 7 dias "R$ 6.180,00 · 71 pedidos" (com variação em texto e ícone vs. os 7 anteriores) · Ticket médio · Avaliação média ("4,8 · 120" ou "Novo"). Números contam pedidos que chegaram a RECEBIDO, sem cancelados.
**Loja nova sem vendas (C2):** no lugar dos KPIs, EmptyState `Storefront`: "Ainda sem vendas" / se não há produto: "Cadastre seu primeiro produto" / "Adicionar produto"; se há produto: "Divulgue sua loja para os vizinhos" / "Compartilhar minha loja" (abre o compartilhamento com o link da loja).
**Funcionário:** vê só as pendências das suas permissões (pedidos, trocas, estoque), **sem valores de venda** **[HIPÓTESE, Z-3: o PRD não diz]**.

**Estados.** Skeleton: faixas e 4 KPIs. Vazio: acima. Erro: EP-web, **por bloco** (um bloco que falha não derruba o painel: "Não conseguimos carregar as vendas. Tentar de novo."). Offline: dados do cache com "Atualizado às 10:42"; pendências de pedido novo seguem pelo P1. Sucesso: n/a (leitura). Permissão: acima.
**A11y:** pendências como lista de links com texto completo; KPI com rótulo, valor e variação lidos juntos ("Vendas de hoje, 1.240 reais, 14 pedidos"); gráfico como em F1. **testID:** `todo-list`, `todo-<id>`, `kpi-today`, `kpi-week`, `kpi-ticket`, `kpi-rating`, `top-products`, `top-<n>`, `chart`, `empty-share`, `empty-add-product`, `all-clear`.

---

# Parte C. Admin: pedidos, trocas e usuários

> Perfis (matriz de `prd/admin.md`): ver pedidos = todos; cancelar = super, operação e financeiro; estornar até R$ 500 = super e financeiro; acima de R$ 500 = só super; mediar = super e operação (suporte **abre**); redefinir senha de cliente = suporte, operação, super; bloquear = operação e super. Botão que o perfil não pode usar **não aparece**; o que depende de valor mostra o motivo escrito (ex.: "Peça aprovação a um super admin").

## M1. Pedidos (WB-108)

**Objetivo:** achar um pedido e entender o que houve. **Ação principal:** abrir o pedido (a busca é o apoio). Prefixo `admin.pedidos.`

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Busca "Número ou nome do cliente"; botão "Filtros" (folha); lista de linhas: "#4821 · Casa Bela", total, StatusBadge, "há 2 h", selo "Atenção" |
| Desktop | Chips de filtro + DataTable: Nº, Data, Cliente (nome abreviado), Loja, Cidade, Tipo, Pagamento, Total, Estado, Atenção. Linha abre o detalhe em página; "Exportar CSV" no cabeçalho. Paginação de 50 |

**Filtros:** período, cidade, loja (busca), estado, tipo (entrega ou retirada), forma de pagamento (PIX ou cartão). **Atenção (C3):** selo `WarningCircle` + texto "Parado: sem aceite há 18 min" (RECEBIDO há mais que o tempo de aceite + 5 min) ou "Parado: saiu há 5 h" (SAIU há mais de 4 h); chip de filtro "Só atenção".
**Detalhe:** cabeçalho (#4821, StatusBadge, loja, "Atenção" se houver) e as ações do perfil (M2: "Cancelar pedido", "Estornar") · **Cliente** (nome abreviado, telefone e endereço **mascarados**, botão "Revelar" que pede TOTP e registra o acesso; mostra por 60 s e volta a mascarar) · **Itens** · **Valores** (todas as linhas de RN-10: subtotal, cupom da loja, cupom da plataforma, frete, taxa de serviço, **total**, comissão, taxa do provedor, **líquido da loja**, receita Webag) · **Pagamento** (forma, status, **eventos** do provedor com hora e id) · **Linha do tempo** (ator, hora, motivo; o ator "Sistema" também aparece) · **Trocas** do pedido (links) · **Avaliações**.
**Exportar CSV:** respeita filtros, auditado; > 10 mil linhas segue por e-mail (WB-122).

**Estados.** Skeleton: 8 linhas com cabeçalho real. Vazio: `Receipt` "Nenhum pedido ainda" / "Os pedidos da plataforma aparecem aqui." / n/a. Sem resultado: "Nenhum pedido neste filtro." + "Limpar filtros". Erro/Offline: EP-web; lista do cache com "Atualizada às 10:42". Sucesso: toast "Exportação pedida. Registrada na auditoria." Permissão: todos veem; botões de ação conforme o perfil; Financeiro vê pedidos em leitura (sem "Revelar" de endereço).
**A11y:** tabela com cabeçalhos e ordenação anunciada; "Atenção" com texto; valores com moeda por extenso. **testID:** `search-input`, `filter-<id>`, `only-attention`, `row-<id>`, `row-<id>-open`, `export`, `detail`, `reveal-customer`, `values`, `payment-events`, `timeline`, `attention-badge`.

## M2. Cancelar e estornar (WB-109)

**Objetivo:** corrigir o problema sem erro de dinheiro. **Ação principal:** "Cancelar pedido e estornar R$ 98,00" ou "Estornar R$ 30,00". Na página do pedido (M1). Prefixo `admin.estorno.`

**Cancelar (estado não terminal, C1).** Dialog "Cancelar o pedido #4821?": **efeito escrito antes de confirmar** ("O cliente recebe R$ 98,00 de volta. A comissão de R$ 9,00 volta para a loja. A taxa do provedor não volta.") · **Motivo** (chips: "Loja não conseguiu atender", "Cliente pediu", "Suspeita de fraude", "Erro de cadastro", "Outro" + texto, mínimo 10) · botão destrutivo "Cancelar pedido e estornar R$ 98,00" · "Voltar". Pede TOTP (AC5a). **Entregue:** só "Estornar" (C4).
**Estornar parcialmente (C2).** Campo **Valor** (moeda; máximo = pago − já estornado, mostrado "Máximo R$ 98,00") · efeito em tempo real ("Estorno de R$ 30,00 · comissão devolvida R$ 2,75 · taxa do provedor não volta") · Motivo · TOTP · botão "Estornar R$ 30,00".
**Acima de R$ 500 (C3):** para financeiro, o botão fica inerte com o rótulo "Peça aprovação a um super admin" e um texto de ajuda; super admin segue normal.
**Pedido entregue no modo split (C4):** Banner de alerta no Dialog: "O estorno sai da conta Mercado Pago da loja. Se ela não tiver saldo, o estorno pode falhar." Se falhar por saldo: aparece "Suspender loja" (leva ao A3). Dinheiro da plataforma cobre até o teto de `[HIPÓTESE DEC-020, R$ 300]` quando o super admin autorizar: segundo botão "Cobrir com o Webag" **só super admin**, com Dialog próprio e motivo.
**Idempotência (C5):** o botão fica em "Estornando…" e inerte; toque duplo não duplica. **Falha do provedor (C6):** o pedido mostra o selo "Estorno pendente", Banner de erro "O provedor não confirmou o estorno. Tentamos de novo sozinhos." + "Tentar agora"; o erro do provedor aparece em texto simples (sem código).
**Pós-ação (C7):** toast "Pedido #4821 cancelado. Estorno de R$ 98,00 enviado." e a linha do tempo ganha o evento com ator e motivo; cliente e loja são avisados (a tela diz "Cliente e loja foram avisados.").

**Estados.** Skeleton: n/a (Dialog abre com o pedido carregado). Vazio: n/a. Erro: estado mudou: "O pedido mudou para Entregue. Revise antes de estornar." (recarrega o Dialog). Offline: "Conecte-se para estornar. Nada foi feito." Sucesso: acima. Permissão: botão ausente para suporte e operação (estorno); operação vê "Cancelar" mas não "Estornar".
**A11y:** efeito do estorno em região viva educada; valores por extenso; foco no motivo ao abrir. **testID:** `cancel-open`, `cancel-reason-<id>`, `cancel-reason-text`, `cancel-confirm`, `refund-open`, `refund-amount`, `refund-effect`, `refund-reason-text`, `refund-confirm`, `needs-super`, `split-warning`, `suspend-store`, `cover-webag`, `retry-refund`, `pending-badge`.

## M3. Trocas e disputas (WB-110, 177)

**Objetivo:** decidir com justiça e no prazo. **Ação principal:** "Registrar decisão". Menu Pedidos > Trocas e disputas. Prefixo `admin.mediacao.`

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Tabs "Em mediação (4)", "Não recebi (2)", "Todas". Lista de linhas: "TR-1042 · Casa Bela", motivo, **prazo** ("Decidir até 24 nov" ou selo "Atrasado há 1 dia" com `WarningCircle`) |
| Desktop | Fila à esquerda (400), caso à direita em 2 áreas: **Caso** (rolável) e **Decisão** (fixa) |

**Caso:** pedido e troca (links) · motivo e texto do cliente · **fotos do cliente** e **fotos da inspeção da loja** lado a lado (zoom) · **justificativas** da loja e, se houve, da contestação do cliente · **política da loja** aplicada e se está dentro do prazo · linha do tempo com ator e hora · histórico de trocas do cliente e da loja (contagem, sem dado pessoal).
**Alerta legal (C3):** em arrependimento ou defeito dentro do prazo, Banner de alerta fixo no topo da decisão: "A lei garante esse direito. A recusa da loja não é permitida." e o chip "Sugestão: a favor do cliente" (não vem marcado).
**Decisão (troca):** rádio **"A favor do cliente"** (a troca segue: aprovada) ou **"A favor da loja"** (recusa final) · **Justificativa** (obrigatória, mínimo 20 caracteres, texto que as duas partes leem: "Explique de forma simples; o cliente e a loja vão ler.") · "Registrar decisão". Dialog de confirmação: "Decidir a favor do cliente?" / "A troca segue e as duas partes são avisadas." / "Registrar decisão" · "Cancelar".
**Disputa "não recebi" (C4):** em vez de rádio, 3 ações: **"Estornar total"** (abre M2 já preenchido: sai da conta da loja, sem retenção, DEC-016; o painel diz "Informativo" no financeiro) · **"Confirmar entrega"** (encerra a disputa e retoma a conclusão automática; pede motivo) · **"Pedir comprovante à loja"** (avisa a loja; "A loja tem 48 h para responder" **[HIPÓTESE]**).
**Suporte:** só vê e usa "Abrir mediação" nas trocas recusadas que ainda não foram contestadas (não decide); faixa "Você pode abrir o caso, mas não decidir."
**Prazo (C5):** acima de `mediacao_dias_uteis` o caso sobe com selo "Atrasado" e vai para o topo da fila.

**Estados.** Skeleton: fila + caso. Vazio: `CheckCircle` "Nenhum caso em mediação" / "Trocas contestadas e disputas aparecem aqui." / "Ver todas as trocas". Erro: EP-web; decisão que falha: "Não foi possível salvar. Sua justificativa continua aqui." Conflito: "Este caso já foi decidido por Ana às 10:42." + "Ver decisão". Offline: "Conecte-se para decidir. Sua justificativa está guardada." Sucesso: toast "Decisão registrada. Cliente e loja foram avisados." e abre o próximo caso. Permissão: acima.
**A11y:** rádio "Decisão" em `fieldset`; fotos com `alt` e legenda "Foto do cliente 1 de 3"; atalhos `j` e `k` trocam de caso. **testID:** `tab-mediation`, `tab-not-received`, `tab-all`, `row-<id>`, `case`, `photos-customer`, `photos-store`, `legal-banner`, `suggestion-chip`, `decision-customer`, `decision-store`, `justification`, `submit`, `confirm`, `refund-total`, `confirm-delivery`, `ask-proof`, `open-mediation`, `overdue-badge`. **Analytics:** `exchange_mediated {resultado}`.

## U1. Usuários (WB-102)

**Objetivo:** achar uma pessoa e resolver o acesso dela. **Ação principal:** "Abrir" (a busca é o apoio). Menu Usuários (suporte, operação e super). Prefixo `admin.usuarios.`
- **Layout:** busca "Nome, e-mail, celular ou ID" (o texto digitado nunca vai para a URL em claro) + Tabs "Clientes", "Lojistas", "Funcionários". Lista paginada (50): nome, e-mail mascarado ("m***@gmail.com"), status (selo "Ativo" ou "Bloqueado"), "e-mail confirmado" (ícone + texto). **Detalhe:** dados **mascarados** com "Revelar" (TOTP; mostra e registra); pedidos recentes (5); lojas vinculadas; histórico de bloqueios (quem, quando, motivo); ações do perfil.
- **Bloquear (C3; operação e super):** ReasonDialog "Bloquear Carla S.?" / "Ela perde as sessões agora e vê 'Conta indisponível'." / motivo / "Bloquear usuário" (destrutivo). **Lojista (C5):** texto extra "A loja dele será suspensa e os pedidos em andamento vão para decisão." Desbloquear: Dialog simples.
- **Redefinir senha (C4; suporte, operação, super):** Dialog "Enviar redefinição de senha?" / "Enviamos um e-mail para m***@gmail.com. Você não define a senha por ela." / "Enviar e-mail". Toast "E-mail enviado."
- **Estados.** Skeleton: 6 linhas. Vazio: busca sem resultado "Ninguém com esse nome ou e-mail." + "Limpar busca". Erro/Offline: EP-web. Sucesso: toasts "Usuário bloqueado." / "Usuário desbloqueado." / "E-mail enviado." Permissão: suporte sem "Bloquear"; financeiro e demais: não veem o menu.
- **A11y:** "Revelar" anuncia "Dado revelado por 60 segundos". **testID:** `search-input`, `tab-customers`, `tab-merchants`, `tab-staff`, `row-<id>`, `reveal`, `block`, `block-reason`, `block-confirm`, `unblock`, `reset-password`, `reset-confirm`, `recent-orders`, `block-history`.

---

# Parte D. Admin: dinheiro e cupons

> Menu Financeiro: super admin e financeiro. Operação e suporte **não veem**. Toda alteração: ReasonDialog + auditoria; as que mexem em dinheiro pedem TOTP (0.4). Prefixos `admin.comissoes.`, `admin.repasses.`, `admin.conciliacao.`, `admin.cupons.`

## F2. Comissões e taxa de serviço (WB-111, 105)

**Objetivo:** ajustar a receita sem deploy e sem surpresa. **Ação principal:** "Salvar comissão". Em Financeiro > Comissões. Perfis: super admin e financeiro editam.

| Breakpoint | Layout |
|---|---|
| Celular | Tabs "Padrão", "Por categoria", "Por loja", "Taxa de serviço". Formulário ou lista em 1 coluna |
| Desktop | Mesmas Tabs; à direita, cartão fixo "Como é calculada": "Loja > categoria > padrão" e a **prévia** viva (pedido de R$ 100,00 → comissão R$ 10,00; líquido da loja) |

- **Padrão (C1):** campo "Comissão padrão (%)" com 2 casas (0 a 30), **"Vale a partir de"** (Agora ou data e hora), Motivo, botão "Salvar comissão". Texto fixo: "Vale para pedidos novos. Pedidos já pagos mantêm a comissão do dia." (C3, snapshot). Erro: "A comissão vai de 0% a 30%."
- **Por categoria:** tabela Categoria, Comissão ("Usa o padrão (10%)" ou "12%"), Editar. Editar abre o ReasonDialog com o campo %.
- **Por loja (C1, C2, C5):** tabela de exceções: Loja, Comissão, Início, Fim, Origem, "Encerrar". "Adicionar comissão por loja": busca da loja, %, início, fim (opcional). Erros: "A comissão vai de 0% a 30%." · "O fim precisa ser depois do início." Texto: "Quando acabar o fim, volta a valer a regra seguinte (categoria ou padrão)." No A3 (loja), a linha "Comissão efetiva hoje: 8% (da loja, até 30 dez)" mostra a **origem** e ganha o link "Editar comissão" (substitui o "somente leitura" de onda 2).
- **Taxa de serviço (C2, C4):** segmentado "Nenhuma" | "Valor fixo (R$ 0 a R$ 10)" | "Percentual (0 a 10%)" + "Teto" para percentual; prévia "O cliente verá: Taxa de serviço R$ 2,00". Se a flag "Taxa de serviço" estiver desligada: Banner info "A taxa está desligada. O cliente não vê a linha." com o link "Ligar em Feature flags" (só super admin; para o financeiro o link some e o texto diz "Peça a um super admin para ligar.").
- **Histórico:** lista (quem, quando, antes e depois, motivo, "vale desde") com link para a Auditoria.
- **Estados.** Skeleton: formulário e 5 linhas. Vazio: "Por loja" sem exceção: `Percent` "Nenhuma comissão especial" / "Todas as lojas usam a comissão padrão." / "Adicionar comissão por loja". Erro: EP-web; "Não foi possível salvar. O valor anterior continua valendo." Offline: "Conecte-se para salvar." Sucesso: toast "Comissão salva. Vale para pedidos novos." Permissão: operação e suporte sem menu.
- **A11y:** campo de % com `inputmode="decimal"` e unidade lida; prévia em região viva educada. **testID:** `tab-default`, `tab-category`, `tab-store`, `tab-fee`, `default-input`, `effective-from`, `reason-input`, `submit`, `category-<id>-edit`, `store-add`, `store-search`, `store-pct-input`, `store-start`, `store-end`, `store-<id>-end`, `fee-none`, `fee-fixed`, `fee-percent`, `fee-value-input`, `fee-cap-input`, `fee-flag-banner`, `preview`, `history`.

## F3. Repasses (WB-112)

**Objetivo:** conferir e, quando for o caso, executar o repasse certo. **Ação principal:** modo split: "Ver composição" (informativo); modo centralizado: "Executar repasse". Perfis: financeiro e super admin.
- **Cabeçalho fixo:** selo do modo ("Modo: split Mercado Pago" ou "Modo: centralizado") e a frase do modo. Split: "O dinheiro vai direto para a conta Mercado Pago da loja. Aqui você só acompanha. O Webag não retém nem ajusta valores."
- **Lista de lotes** (DataTable; celular: linhas): Loja, Período, Pedidos, Líquido, Status (**Split:** "Liberado", "A liberar", "Em disputa", vindo do provedor; **Centralizado:** "Pronto", "Pago", "Falhou"), "Abrir". Filtros por período, loja, status. 
- **Lote (detalhe):** composição por pedido (bruto, comissão, taxa do provedor, estornos, líquido) e total. **Split:** somente leitura; sem "retirar pedido" (C3). **Centralizado:** "Retirar do lote" por pedido (ReasonDialog: ex. disputa); "Executar repasse" (Dialog "Executar repasse de R$ 3.200,00 para Casa Bela?" / "Cria a transferência e registra o comprovante. Não dá para executar de novo." / motivo não exigido, TOTP exigido / "Executar repasse"); **Falhou:** Banner de erro com o motivo do provedor em texto simples + "Reprocessar" (sem duplicar, C5 e C6; o botão fica "Reprocessando…" e inerte); saldo negativo da loja: linha "Abatido do próximo ciclo: R$ 120,00" (C4).
- **Split com dívida da loja (C4):** linha "Dívida registrada: R$ 300,00" e texto "O recurso é estorno pelo Webag, suspensão ou cobrança pelos Termos. Não há desconto automático." com links "Ver loja" e "Suspender".
- **Estados.** Skeleton: 8 linhas. Vazio: `Wallet` "Nenhum repasse neste período" / "Os lotes aparecem a cada ciclo." / "Limpar filtros". Erro/Offline: EP-web; lista do cache. Sucesso: toast "Repasse de R$ 3.200,00 executado." (centralizado). Permissão: executar e retirar só no modo centralizado e só financeiro e super admin.
- **A11y:** status em texto com ícone; valores por extenso. **testID:** `mode-badge`, `row-<id>`, `row-<id>-open`, `filter-<id>`, `batch-orders`, `remove-order-<id>`, `execute`, `execute-confirm`, `reprocess`, `negative-balance`, `debt-note`.

## F4. Conciliação (WB-113)

**Objetivo:** achar dinheiro que não bate. **Ação principal:** "Marcar em análise". Perfis: financeiro e super admin.
- **Cabeçalho:** "Última conciliação: hoje, 03:00" + "Atualizar". Chips: Abertas · Em análise · Resolvidas · Ajustadas.
- **Lista** (celular: linhas): **Tipo** (texto + ícone: "Pagamento sem pedido", "Pedido pago sem pagamento", "Valores diferentes", "Estorno faltando"), pedido ou id do provedor, **valor no Webag × valor no provedor**, **idade** ("há 4 dias", em erro com `WarningCircle` acima de 3 dias, C4), status. Desktop: 2 colunas de valores lado a lado.
- **Ações por divergência:** "Marcar em análise" · **"Resolver"** (nota obrigatória: "Explique o que foi conferido.") · **"Ajustar"** (gera lançamento de ajuste: ReasonDialog com o valor, TOTP, "Registrar ajuste"; o ajuste aparece no ledger e na auditoria). Histórico do caso (quem mudou e quando).
- **Estados.** Skeleton: 6 linhas. Vazio: `CheckCircle` "Tudo conciliado até 17 nov" / "Nenhuma divergência encontrada." / n/a. Erro: EP-web; "A última conciliação falhou. O time técnico foi avisado." Offline: EP-web. Sucesso: toast "Divergência resolvida." / "Ajuste registrado." Permissão: acima.
- **A11y:** "há 4 dias, atrasada" lido; diferenças em texto ("Webag R$ 98,00, provedor R$ 89,00, diferença R$ 9,00"). **testID:** `last-run`, `refresh`, `filter-<id>`, `row-<id>`, `row-<id>-analyze`, `row-<id>-resolve`, `resolve-note`, `resolve-confirm`, `row-<id>-adjust`, `adjust-amount`, `adjust-reason`, `adjust-confirm`, `all-clear`.

## F5. Cupons da plataforma (WB-116)

**Objetivo:** rodar uma campanha com custo conhecido. **Ação principal:** "Criar cupom". Menu Marketing > Cupons. Perfis: operação e super admin.

| Breakpoint | Layout |
|---|---|
| Celular | Lista de linhas: código, "10% · todas as lojas", "340 de 1.000 usos", validade, Switch "Ativo/Pausado" |
| Desktop | DataTable: Código, Tipo e valor, Alvo, Usos, Desconto dado, Validade, Ativo (Switch), "Relatório" |

**Formulário:** Código (4 a 20, A a Z e 0 a 9) · Tipo (segmentado "Percentual" | "Valor" | "Frete grátis") · Valor · Teto · Pedido mínimo · Validade (início e fim) · Limite de usos total · Limite por cliente · Caixa "Só para a primeira compra" · **Alvo** (rádio "Todas as lojas", "Cidades", "Categorias", "Lojas específicas", com seletor múltiplo e busca) · prévia "Como o cliente vê".
- **Aviso do split (C6), fixo no formulário e na lista:** Banner info "O desconto da plataforma é limitado à comissão de cada pedido. Em pedidos com comissão menor, o desconto será cortado em R$ [comissão]." Se o valor do cupom exigir mais do que a comissão padrão cobre, o cupom é salvo **desligado**, com o Banner de alerta "Esse cupom ficou desligado: ele passaria da comissão. Reduza o valor." (decisão DEC-016).
- **Custo:** "É custo do Webag" visível, e a coluna "Desconto dado" soma o custo; entra no financeiro e na conciliação (C2).
- **Pausar (C4):** Dialog "Pausar BEMVINDO10?" / "Ele deixa de valer agora." / "Pausar cupom". Esgotado: selo "Esgotado" (usos atingidos).
- **Relatório (C5):** usos, desconto total, pedidos (lista), maior concentração por loja; se uma loja tem > 30% dos usos, Banner de alerta "Casa Bela concentra 41% dos usos. Pode ser autoconsumo." + "Ver loja" (C7).
- **Estados.** Skeleton: 5 linhas. Vazio: `Tag` "Nenhum cupom da plataforma" / "Crie um para a primeira compra ou uma campanha." / "Criar cupom". Erro/Offline: EP-web. Sucesso: toast "Cupom criado." / "Cupom pausado." Permissão: financeiro e suporte sem menu (financeiro vê o custo em Financeiro).
- **testID:** `create`, `row-<id>`, `row-<id>-switch`, `row-<id>-report`, `code-input`, `type-percent`, `type-value`, `type-shipping`, `value-input`, `cap-input`, `min-input`, `start-input`, `end-input`, `limit-total-input`, `limit-customer-input`, `first-purchase-checkbox`, `target-all`, `target-cities`, `target-categories`, `target-stores`, `target-search`, `split-banner`, `disabled-banner`, `pause-confirm`, `concentration-banner`, `submit`.

---

## Z. Hipóteses, divergências e perguntas

| # | Item | Para quem | Proposta |
|---|---|---|---|
| Z-1 | PRD WB-175 C1 cobra a taxa de coleta **ao solicitar**; HIP-D09 (decisoes.md) cobra **depois da aprovação**. Desenhei pela HIP-D09 (X1, X2) | PO | Confirmar; o PRD e o QA precisam ser ajustados. Sem isso, o pedido de troca ganha um passo de pagamento e o fluxo estoura "até 4 telas" |
| Z-2 | PRD WB-170 C5 manda **esconder** tamanho e cor quando a loja não aceita; `fluxos.md` §6 manda **mostrar inerte com o motivo**. Desenhei mostrando | PO | Mostrar com motivo evita "o app não tem troca por tamanho". Ajustar o critério |
| Z-3 | Painel do lojista para funcionário: o PRD não diz se vê valores de venda | PO | Só pendências, sem valores (financeiro é do dono, RN-13) |
| Z-4 | Corrigi S7 (`onda-4`): "o repasse fica retido" contradiz DEC-016 | CEO (registro) | Feito |
| Z-5 | Cobrir estorno com dinheiro do Webag (teto R$ 300, DEC-020 `[HIPÓTESE]`) aparece como botão exclusivo do super admin em M2 | PO, Security | Confirmar teto e se a UI deve existir na 1.0 |
| Z-6 | "Pedir comprovante à loja" (48 h) em M3 é prazo novo | PO | Parâmetro `disputa_comprovante_h` no admin |
| Z-7 | Pontos de entrada de favoritos ficam em D11 (onda 3); nenhuma tela nova foi criada para eles | CEO | n/a |
| Z-8 | Chargeback (WB-159, Should) não tem tela nesta rodada | PM | Entra como tipo "Chargeback" na Conciliação (F4) quando o backend definir os estados |
