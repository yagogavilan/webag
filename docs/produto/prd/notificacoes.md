# PRD: Notificações

Status: pronto para G3 | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-190 a WB-199
Regras: RN-07 (transições), RN-11 (trocas), HIP-022, HIP-027, HIP-028. Origem: brief §3.1 (push), §3.2 (alerta sonoro), §3.3 (push segmentado).

## Problema
Cliente precisa saber do pedido sem abrir o app; lojista **perde a venda** se não vê o pedido em 10 min (HIP-008); admin precisa saber o que exige ação. Push de marketing mal usado derruba retenção e viola a LGPD (consentimento).

## Objetivo e métrica de sucesso
Entregar a mensagem certa, no canal certo, no momento certo, com consentimento onde exigido.
| Métrica | Meta |
|---|---|
| Notificação de mudança de status ao cliente entregue em <= 10 s (p95) | >= 95% |
| Alerta de novo pedido ao lojista visível/audível em <= 5 s | >= 99% com painel aberto |
| Pedidos que expiram por falta de aceite | < 5% |
| Opt-in de push de marketing | medir (sem meta fixa) |
| Opt-out de marketing por mês | < 3% |
| Marketing: máx. mensagens por usuário | 2/semana (HIP-027) |

**Eventos:** `push_permission_prompted/granted/denied`, `notification_sent {type, channel}`, `notification_opened {type}`, `notification_failed {channel, reason}`, `marketing_optin/optout`.

## Fora do escopo (1.0)
SMS e WhatsApp (custo, HIP-022/028); notificação por voz; automações de ciclo de vida complexas (jornada com N passos); teste A/B de mensagens; notificação ao entregador (fase 2); chat (fase 2); mensagens ricas com imagem (push só com texto e ícone).

## Usuários e cenários
1. Carla paga e recebe "Pedido recebido"; recebe "Saiu para entrega"; recebe pedido de avaliação.
2. Marcos com o painel aberto ouve o alerta; com a aba fechada, recebe Web Push e e-mail.
3. Yago manda push "Cupom de bem-vindo" só para quem aceitou marketing em Franco da Rocha.

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-NOT-01 | Registro de dispositivo, permissão e preferências | 190, 196 |
| RF-NOT-02 | Notificações transacionais (pedido, troca) ao cliente | 191, 193 |
| RF-NOT-03 | Alertas ao lojista (som, Web Push, e-mail) | 192 |
| RF-NOT-04 | E-mails transacionais plugáveis | 194 |
| RF-NOT-05 | Central de notificações no app | 195 |
| RF-NOT-06 | Push segmentado (admin) | 197 |
| RF-NOT-07 | Alertas operacionais ao admin | 198 |
| RF-NOT-08 | Carrinho abandonado (opt-in) | 199 |

## Regras de negócio
**Catálogo de eventos**

| Evento | Destino | Canais | Tipo | Texto (curto) |
|---|---|---|---|---|
| Pagamento aprovado (RECEBIDO) | Cliente | push, in-app, e-mail | Transacional | "Pedido recebido. A loja já foi avisada." |
| PIX perto de expirar (2 min) | Cliente | push (app aberto/fechado), in-app | Transacional | "Seu PIX vence em 2 minutos." |
| ACEITO | Cliente | push, in-app | Transacional | "[Loja] aceitou seu pedido." |
| EM_SEPARACAO | Cliente | in-app (sem push) | Transacional | "Estão separando seu pedido." |
| PRONTO_PARA_COLETA (entrega Webag) | Cliente | in-app (sem push) | Transacional | "Seu pedido está pronto e aguarda o motoboy." |
| Motoboy a caminho da loja | Cliente | in-app (sem push) | Transacional | "O motoboy está a caminho da loja." |
| SAIU_PARA_ENTREGA | Cliente | push, in-app | Transacional | "Seu pedido saiu para entrega." |
| Entrega não realizada | Cliente | push, in-app, e-mail | Transacional | "Não conseguimos entregar: [motivo]. Combine uma nova tentativa." |
| Pedido pronto para coleta; corrida sem motoboy há 10 e 20 min; entrega em atraso | Admin (operação) | painel com som, Web Push, e-mail (não depende da aba aberta, DEC-038c) | Operacional | "Pedido #X pronto na [loja]. Atribuir motoboy." |
| Pedido coletado; entregue; falha de entrega | Loja | painel | Transacional | "O motoboy coletou o pedido #X." |
| Comissão da loja alterada | Loja | painel, e-mail | Transacional | "Sua comissão mudou de A% para B% a partir de DD/MM." |
| PRONTO_PARA_RETIRADA | Cliente | push, in-app | Transacional | "Pronto para retirar. Código [1234]." |
| ENTREGUE | Cliente | push, in-app | Transacional | "Pedido entregue." + 1 h depois "Como foi? Avalie." |
| RECUSADO / CANCELADO / EXPIRADO | Cliente | push, in-app, e-mail | Transacional | "[Motivo]. Estorno de R$ X iniciado." |
| Estorno concluído | Cliente | push, e-mail | Transacional | "Estorno de R$ X concluído." |
| Item indisponível (estorno parcial) | Cliente | push, in-app | Transacional | "[Item] acabou. Estornamos R$ X." |
| Troca: aprovada, coleta agendada, recusada, concluída, expirando | Cliente | push, in-app | Transacional | Conforme status |
| Nova troca; troca expirando (12 h e 4 h antes do fim do SLA de 24 h); troca aprovada automaticamente | Loja | painel, Web Push, e-mail | Transacional | "Nova troca solicitada. Responda em 24 h ou ela será aprovada." |
| Troca aprovada (taxa pendente: pague em 48 h; lembrete em 24 h); coleta confirmada (janela); motoboy a caminho da coleta | Cliente | push, in-app | Transacional | "Troca aprovada. Pague R$ X para agendar a coleta." |
| Desistência recebida (confirmação imediata, Decreto 7.962/2013) | Cliente | push, in-app, e-mail | Transacional | "Recebemos seu pedido de desistência. Protocolo [TR-n]." |
| Novo pedido | Loja | som, painel, Web Push, e-mail | Transacional | "Novo pedido #X" |
| Pedido sem aceite aos 5 min | Loja | som forte, Web Push, e-mail | Transacional | "Aceite agora ou o pedido será cancelado." |
| Pedido cancelado/pedido de cancelamento | Loja | painel, Web Push | Transacional | |
| Estoque baixo, nova avaliação, repasse realizado, loja aprovada/reprovada | Loja | painel, e-mail | Transacional | |
| Nova loja na fila, disputa, divergência de conciliação, webhook com falha, job falhou | Admin | painel, e-mail | Operacional | |
| Cupom perto de vencer; novidade; campanha | Cliente | push | **Marketing (opt-in)** | |
| Carrinho esquecido (24 h) | Cliente | push | **Marketing (opt-in)** | |

**Regras**
- **Transacional** é enviado sempre (base legal: execução de contrato), respeitando só a permissão do sistema operacional; o usuário vê no in-app mesmo sem push.
- **Marketing** só com opt-in explícito e separado dos termos (LGPD, consentimento específico); desmarcado por padrão; revogável em 1 toque; máximo `push_mkt_max_semana` (2), das 9h às 20h (America/Sao_Paulo); nunca de madrugada.
- **Permissão de push no app:** só é pedida **depois do 1º pedido** (valor claro: "Avisamos quando seu pedido sair"), nunca na abertura.
- Texto de push: até 60 caracteres no título e 120 no corpo; sem emoji (brief §5); sem dados pessoais sensíveis no texto (endereço, CPF).
- Deduplicação: o mesmo evento não gera dois pushes; mudanças de estado seguidas em < 30 s são agrupadas na última.
- Falha de entrega: tentativa de e-mail se o push falhar em transacionais críticas (pagamento, cancelamento).
- Toque no push abre a tela do pedido/troca certa (deep link), exigindo login se necessário.
- Lojista: alertas de novo pedido têm prioridade sobre qualquer outro; Web Push depende do navegador (iOS só com PWA instalada, a confirmar pelo mobile-dev).

## Requisitos não funcionais
- **Confiabilidade:** envio via fila com retentativa; token inválido do dispositivo é removido; o evento de pedido não depende do sucesso do push (o pedido segue).
- **Desempenho:** consumo assíncrono; p95 <= 10 s do evento à entrega do push (rede do provedor excluída).
- **Privacidade:** sem dado pessoal no payload além do necessário (número do pedido, loja); tokens de push por dispositivo, apagados no logout e na exclusão de conta.
- **E-mail:** SMTP plugável (Mailpit em desenvolvimento), SPF/DKIM no deploy, link de descadastro nos de marketing; templates em pt-BR, texto curto, sem imagem obrigatória.
- **Acessibilidade:** push e e-mail compreensíveis por leitor de tela; contraste AA nos e-mails.

## Histórias e critérios de aceite

### WB-190 Registro de dispositivo e permissão de push — Must — dep: WB-008
Como cliente, quero decidir sobre notificações no momento certo, para não ser incomodado sem motivo.
- **C1** Dado o 1º pedido pago, então o app explica "Avisamos quando seu pedido sair" e só então pede a permissão do sistema.
- **C2** Dado a permissão concedida, então o token do dispositivo é registrado ao usuário; dado negada, então o app segue funcionando e a central in-app (WB-195) mostra o status.
- **C3** Dado logout ou exclusão de conta, então o token é removido do usuário no servidor.
- **C4** Dado token inválido (aparelho desinstalado), então o servidor o remove após a falha do provedor.
- **C5** Dado vários aparelhos, então todos recebem; cada um registrado separadamente.

### WB-191 Notificações de pedido ao cliente — Must — dep: WB-190, WB-027
Como cliente, quero ser avisado a cada etapa do pedido, para não precisar abrir o app.
- **C1** Dado cada transição do catálogo (RN-07), então o cliente recebe a notificação definida no catálogo, nos canais definidos e dentro de 10 s (p95).
- **C2** Dado a notificação, então ao tocar abre o pedido na etapa atual.
- **C3** Dado duas transições seguidas em < 30 s, então só a última gera push (a anterior fica no in-app).
- **C4** Dado pedido ENTREGUE, então 1 h depois chega o pedido de avaliação (uma vez).
- **C5** Dado a PIX perto de expirar, então 1 aviso 2 min antes, só se ainda pendente.
- **C6** Dado permissão negada, então o evento chega ao in-app e por e-mail nos casos de pagamento e cancelamento.

### WB-192 Alertas de pedido ao lojista — Must — dep: WB-067
Como lojista, quero ser alertado de novos pedidos e prazos, para aceitar a tempo.
- **C1** Dado novo pedido com o painel aberto, então som e faixa imediatos (WB-067).
- **C2** Dado painel fechado e Web Push permitido, então recebo Web Push em <= 5 s; sem permissão, e-mail em <= 60 s.
- **C3** Dado 5 min sem aceite, então novo alerta mais forte (som, Web Push, e-mail "Aceite agora").
- **C4** Dado estoque baixo, nova troca, nova avaliação, repasse, aprovação/reprovação da loja, então notificação conforme o catálogo, sem som.
- **C5** Dado o funcionário, então recebe só as notificações das permissões dele.
- **C6** Dado preferência do dono, então pode desligar e-mails não críticos (alerta de pedido e timeout nunca desligam).

### WB-193 Notificações de troca — Must — dep: WB-170
Como cliente e lojista, quero ser avisado de cada passo da troca, para cumprir os prazos.
- **C1** Dado cada mudança de estado de troca (RN-11), então a parte que precisa agir é notificada (cliente: aprovada, coleta agendada, recusada, reembolso; loja: nova troca, contestação, expirando).
- **C2** Dado prazo da loja (`troca_resposta_h`, **24 h** desde a DEC-037), então avisos com 12 h e 4 h restantes e, ao fim, "Aprovada automaticamente" à loja e ao cliente (WB-177).
- **C3** Dado prazo do cliente (entregar item em 7 dias), então aviso em D-2.
- **C4** Dado o admin, então é notificado de cada entrada em mediação (WB-198).

### WB-194 E-mails transacionais — Must — dep: infraestrutura SMTP
Como usuário, quero receber e-mails importantes, para ter registro.
- **C1** Dado os eventos de código (confirmação, redefinição), pedido (confirmação com resumo e valores, cancelamento, estorno), troca e conta (senha alterada, exclusão), então o e-mail é enviado em pt-BR com remetente único e assunto claro. **Exceção (DEC-023c, SEC-008d):** para conta com e-mail **não confirmado**, o e-mail de pedido sai com texto genérico ("Recebemos seu pedido, veja no app"), **sem itens, valores, nome nem endereço**; só o código de confirmação é o conteúdo dinâmico permitido. Após a confirmação, vale o e-mail completo (R-33).
- **C2** Dado falha do SMTP, então retentativa com espera crescente (até 5 vezes) e registro; o fluxo do usuário não é bloqueado, exceto códigos (que oferecem "Reenviar").
- **C3** Dado ambiente de dev, então os e-mails vão ao Mailpit e nunca a endereços reais.
- **C4** Dado o e-mail, então traz link de ajuda e não traz dados sensíveis (sem CPF, sem senha, sem endereço completo).
- **C5** Dado e-mails de marketing, então só se houver opt-in e com link de descadastro funcional em 1 clique.

### WB-195 Central de notificações no app — Should — dep: WB-191
Como cliente, quero ver minhas notificações dentro do app, para não perder nada.
- **C1** Dado a central, então vejo as últimas 50 notificações (30 dias), mais recentes primeiro, com marcador de não lidas e contador.
- **C2** Dado tocar numa notificação, então abre o destino e a marca como lida.
- **C3** Dado nenhuma, então "Sem notificações".
- **C4** Dado "Marcar todas como lidas", então zera o contador.

### WB-196 Preferências e consentimento de marketing — Must — dep: WB-211
Como cliente, quero escolher se recebo ofertas, para controlar o que chega.
- **C1** Dado a tela, então vejo 2 grupos: "Sobre meus pedidos" (sempre ativo, explicado) e "Ofertas e novidades" (desligado por padrão).
- **C2** Dado ligar "Ofertas", então registro consentimento (data, versão do texto, canal) e posso desligar a qualquer momento em 1 toque.
- **C3** Dado o link de descadastro de e-mail, então desliga o canal e-mail na hora.
- **C4** Dado excluir conta, então os consentimentos são apagados ou anonimizados conforme WB-215, com registro de que existiu consentimento (prova legal por prazo mínimo).
- **C5** Dado flag de marketing desligada (WB-120), então nada é enviado independentemente de preferência.
- **C6** Dado que o marketing **não é pedido no cadastro** (WB-006 C7, DEC-024f), então a oferta de "Ofertas e novidades" aparece só em 2 lugares: (a) uma vez, após o 1º pedido pago, como cartão dispensável na tela de sucesso/pedido (junto da explicação de push de WB-190 C1), com "Agora não" que não pergunta de novo por 30 dias `[HIPÓTESE]`; (b) sempre em Conta > Notificações. A caixa nasce desmarcada e a ação de ligar é explícita (WB-211).

### WB-197 Push segmentado pelo admin — Should — dep: WB-196, WB-118
Como operação, quero enviar push para um segmento, para ativar clientes e lojas.
- **C1** Dado nova campanha, então escolho segmento (cidade, bairro, "sem compra há N dias", "comprou categoria X", "novos clientes"; **"lista de espera de [bairro]" é fase 2**, DEC-061), título (<= 60), corpo (<= 120) e destino (tela do app).
- **C2** Dado o segmento, então vejo a **estimativa** de destinatários **só entre os que têm opt-in**; menos de `push_mkt_min_segmento` (20 `[HIPÓTESE]`, parâmetro no admin, RN-02) destinatários bloqueia (proteção contra reidentificação).
- **C3** Dado enviar, então respeita janela 9h-20h (envio agendado para a próxima janela) e `push_mkt_max_semana` por usuário (quem já atingiu é excluído).
- **C4** Dado campanha enviada, então vejo **enviados (aceitos pelo provedor de push)**, abertos e descadastros; o rótulo **não** diz "entregues" (DEC-061, DT-061: aceito pelo provedor não é recibo de entrega e a métrica seria otimista). Recibos de entrega do provedor (Expo receipts) e a taxa "entregues" são **fase 2** (gatilho: primeira campanha acima de 1.000 destinatários).
- **C5** Dado confirmação, então a tela exige "Enviar para N pessoas?" antes; não há desfazer após o envio.
- **C6** Dado perfil sem permissão (financeiro/suporte), então não vê a tela.
- **C7** Dado a campanha, então é auditada (WB-123).

### WB-198 Alertas ao admin — Should — dep: WB-123
Como admin, quero ser avisado do que exige ação, para não depender de olhar o painel.
- **C1** Dado evento (nova loja na fila, loja esperando mais que o SLA, disputa/mediação nova, divergência de conciliação aberta, webhook com falha acima do limite, job falhou), então envio e-mail ao perfil responsável e mostro no painel.
- **C2** Dado o mesmo alerta repetido, então agrupa em no máximo 1 e-mail a cada hora por tipo.
- **C3** Dado preferência do admin, então pode escolher quais receber (os críticos de dinheiro não desligam).

### WB-199 Carrinho esquecido — Could — dep: WB-196
Como Webag, quero lembrar quem deixou itens no carrinho, para recuperar a venda sem abusar.
- **C1** Dado carrinho com itens há 24 h, sem pedido, e opt-in de marketing, então 1 push "Você deixou itens no carrinho"; nunca mais de 1 por carrinho.
- **C2** Dado item indisponível ou loja fechada, então não envia.
- **C3** Dado sem opt-in, então não envia.
- **C4** Dado `feature flag` desligada, então nada é enviado.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Credenciais FCM/APNs e Expo | Dependência do fundador | Simulado em dev (log); `.env.example` |
| Web Push no iOS limitado a PWA instalada | Risco de lojista iPhone | E-mail + painel; orientar uso no balcão em Android/computador |
| Lojista esquece aba fechada | Risco operacional | Timeout 10 min, e-mail, aviso WB-056 C6 |
| Fadiga de push | Risco de retenção | Limites HIP-027 |
| LGPD (consentimento específico) | Risco legal | WB-196, WB-211 |
| Custo de e-mail em volume | Custo | Plugável; Mailpit em dev; fundador escolhe provedor |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Provedor de e-mail em produção | fundador (custo) + backend-dev |
| Web Push em iOS | mobile-dev/tech-lead |
| Texto de consentimento de marketing | fundador/jurídico |
