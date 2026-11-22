# PRD v1.1: Despacho, rota e app do motoboy

Status: proposta | Dono: product-owner | Data: 2026-11-22 | Histórias: WB-380 a WB-389
Base: `prd/logistica.md` (WB-229 a 262), `regras-de-negocio.md` RN-18 (estados e lote) e RN-19 (ETA); DEC-036, DEC-053, DEC-064, DEC-076; backlog §6.1 (WB-300 a 309; este PRD absorve WB-301, WB-308 e parte de WB-302 e WB-304: ver backlog §10); `v1-1-pesquisa.md` §6 a §9. Rastreio e confirmação da loja: `prd/v1-1-rastreio-e-notificacoes.md`.

## Problema
- **Quem sofre:** a operação (1 pessoa despachando por WhatsApp, atribuindo e atualizando estados à mão), o motoboy (recebe texto solto, decide a ordem sozinho, não tem onde marcar coleta e entrega) e, por tabela, o cliente (atraso por ordem ruim, "cadê meu pedido").
- **Evidência:** v1.0 despacha por admin + WhatsApp (DEC-036); lote por área existe (RN-18) sem ordem de paradas. Gatilho do backlog §6.1 para o app: > 15 entregas por hora, p90 de atribuição > 10 min por 2 semanas ou > 20% de reclamação "cadê meu pedido". **Nenhum foi medido (v1.0 sem piloto).** Pedido do fundador em 2026-11-22.
- **Posição crítica.**
  1. Com 1 a 2 motoboys e poucas entregas por hora, **a heurística de rota e o link "abrir no Maps/Waze" resolvem 80% do ganho a custo zero e podem sair antes do app**. O app nativo é o item caro (esforço, distribuição, privacidade, risco trabalhista). Recomendo entregar nessa ordem e **começar o piloto com localização compartilhada pelo WhatsApp** (concierge) para medir se o rastreio é necessário.
  2. **PWA não serve para rastreio:** o motoboy navega com Waze ou Maps na frente; o PWA vai para segundo plano e o GPS para (`pesquisa` §8). Só app nativo Android mantém o ponto.
  3. **Risco de vínculo trabalhista (J8, DEC-039):** app com rota imposta e GPS contínuo reforça indício de subordinação. **Nenhum motoboy é contratado nem o app é distribuído antes do parecer jurídico** (F16). Mitigação no desenho: rota é sugestão, o motoboy recusa corrida, GPS só em corrida, sem ranking nem penalidade automática, sem horário mínimo.

## Objetivo e métrica de sucesso
| Métrica `[HIPÓTESE]` | Meta | Fonte |
|---|---|---|
| Tempo do operador para montar e enviar um lote de 3 corridas | <= 90 s (hoje: medir no piloto) | observação |
| Entregas por hora por motoboy | +20% com lote ordenado, sobre o piloto sem rota | relatório de logística (WB-240) |
| Atribuição até aceite do motoboy | mediana <= 2 min; p90 <= 5 min | eventos |
| Entregue na faixa prometida | >= 95% (meta de DEC-054) | `deliveredAt` |
| Corridas fechadas pelo app (não pela operação) | >= 90% após 2 semanas | eventos |
| Bateria do motoboy | <= 12% por hora de corrida em Android de entrada | teste em aparelho |
| Custo mensal adicional | R$ 0 | decisões F10 e F11 |

## Fora do escopo (com gatilho de volta)
| Item | Motivo | Gatilho |
|---|---|---|
| Despacho automático por proximidade (WB-302) | 1 a 2 motoboys; a operação decide | > 15 entregas por hora no pico ou p90 de atribuição > 10 min por 2 semanas |
| Motor de rota próprio (OSRM ou Valhalla) | Heurística em linha reta x 1,3 já usada no ETA | Erro mediano do ETA > 10 min por distância, ou 3 ou mais motoboys, ou 15 entregas por hora |
| Google Routes, Mapbox ou outro provedor pago | Fatura nova; autorização do fundador | Operação do motor próprio custar mais que a fatura |
| App iOS do motoboy (conta Apple, US$ 99 por ano) | Custo; exigir Android | Motoboy contratado com iPhone e autorização do fundador |
| Publicar o app na Google Play | Revisão de localização em segundo plano; US$ 25 | Instalação por APK virar barreira |
| Prova de entrega por foto (WB-304) | O código de entrega (WB-226) já prova | Fraude de entrega > 1% |
| Pagamento e extrato do motoboy no app (WB-305) | Pagamento é fora do app (DEC-036c) | 5 ou mais motoboys |
| Cadastro com CNH, curso de motofrete e seguro no sistema (WB-300, WB-309) | Parecer jurídico define o que se exige | Parecer J8 |
| Chat motoboy-cliente, ligação mascarada | Número mascarado é serviço pago | Reclamação de contato |
| Coleta e reentrega de troca em lote | Fora do lote na 1.0 (RN-18) | Volume de trocas |
| Otimização com trânsito em tempo real | Sem dado | Provedor pago autorizado |

## Usuários e cenários
| Persona | Cenário |
|---|---|
| Operação | Seleciona 3 corridas prontas da mesma cidade, escolhe o Carlos, toca "Gerar rota": vê a ordem das 6 paradas (2 coletas, 4 entregas) no mapa, com horário previsto em cada, e o aviso "A entrega do pedido 1042 pode atrasar"; troca a ordem de 2 paradas e envia |
| Carlos (motoboy, Android) | O celular vibra: "Nova rota: 3 entregas". Abre o app, aceita, toca "Navegar" e o Waze abre na primeira parada. Na loja toca "Cheguei"; depois de a loja confirmar, toca "Cheguei ao cliente" e digita o código de 4 dígitos que o cliente informa |
| Carlos sem sinal | Entra num trecho sem cobertura; os botões continuam; as ações e os pontos sobem quando o sinal volta |
| Fundador | Vê no mapa onde estão os motoboys, quais corridas estão em risco e a média de entregas por hora |

## Requisitos funcionais
**Admin**
1. Mapa da fila de corridas (lojas, destinos, motoboys) com MapLibre e mapa próprio (Protomaps), atribuição pelo mapa ou pela lista.
2. **Agrupar e gerar rota** de 1 a `entrega_lote_max` corridas para 1 motoboy, com ordem de paradas, horário previsto em cada, distância total e avisos de atraso; reordenar e recalcular.
3. Enviar a rota ao motoboy: no app (push) e **por link** (abrir no Maps ou Waze parada a parada, com mensagem de WhatsApp, já usada no v1.0).
4. Ver motoboys com última posição, estado (disponível, em corrida, sem sinal, offline) e corrida atual; reatribuir.
5. Cadastro e convite do motoboy com aceite do aviso de GPS.

**App do motoboy (Android, separado do app do cliente)**
6. Entrar, ver a(s) corrida(s) e a rota do dia, aceitar ou recusar.
7. Mapa com a rota sugerida e a posição; "Navegar" abre Waze ou Maps na parada.
8. Botões das etapas: "Cheguei à loja", "Peguei o pedido", "Cheguei ao cliente", "Entreguei" (código de entrega), "Não consegui entregar" (motivo).
9. GPS só durante a corrida, em segundo plano, com notificação fixa; funciona sem sinal e sincroniza depois.
10. Ver o próprio histórico e o que o app coleta.

## Regras de negócio
**RN-D1 Elegibilidade do lote.** Corridas de **entrega** em PRONTA_PARA_COLETA (ou já atribuídas ao mesmo motoboy), mesma cidade de destino (RN-18), de 2 a `entrega_lote_max`; coleta e reentrega de troca fora do lote. O lote não altera a faixa prometida de nenhum pedido (DEC-076 A-06).

**RN-D2 Rota (regra, não algoritmo).** A ordem minimiza o **tempo total estimado**, sujeita a: (a) a coleta de um pedido vem antes da sua entrega; (b) a capacidade do motoboy em volumes (`motoboy_capacidade_volumes`, padrão 4 `[HIPÓTESE]`) não é excedida; (c) desempate pelo menor prazo restante (a corrida mais urgente primeiro). Distância = linha reta x `entrega_rota_fator_pct`/100 (RN-19), tempo = km x `entrega_min_por_km`, mais `parada_min` (padrão 3) por parada `[HIPÓTESE]`. Até 8 paradas a ordem é **exata**; acima disso, boa o bastante (até 5% pior que o ótimo `[HIPÓTESE]`). Sem dependência de serviço externo. A rota é **sugestão**: a operação pode reordenar; o motoboy pode seguir outra ordem (a divergência é registrada, sem penalidade).

**RN-D3 Avisos de atraso.** Para cada entrega, horário previsto > fim da faixa prometida gera "Esta corrida pode atrasar" (mesmo texto da RN-18); a operação decide tirar do lote. Sem bloqueio.

**RN-D4 Estados.** Os da RN-18, mais os do PRD de rastreio (`MOTOBOY_NA_LOJA` e o OK da loja). O app é a fonte da hora de cada etapa (servidor registra a hora de recebimento e a hora do aparelho). Estado alterado pela operação em nome do motoboy (modo WhatsApp) continua possível, com motivo e ator `admin`.

**RN-D5 Aceite.** Corrida atribuída aparece como oferta; o motoboy tem `courier_accept_timeout_min` (padrão 3) para aceitar; sem resposta ou com recusa, volta a PRONTA_PARA_COLETA e alerta a operação; recusa não gera penalidade.

**RN-D6 Código de entrega.** Com a flag ligada (padrão, DEC-039d), "Entreguei" exige o código de 4 dígitos informado pelo cliente; 3 erros bloqueiam e acionam a operação. Sem código: "Não consegui entregar" com motivo (RN-18).

**RN-D7 Privacidade do motoboy.** GPS só com corrida aceita e termina ao ENTREGUE, NAO_ENTREGUE final ou cancelamento; nunca em disponibilidade sem corrida; o motoboy vê "Localização ativa: corrida 1042" e o histórico dos próprios pontos; retenção do ponto bruto **7 dias** (`gps_retencao_dias`, F14); sem uso para ranking, nota ou desconto; acesso do admin ao histórico só em disputa, com auditoria. Aviso e aceite no 1º acesso (J26).

**RN-D8 Dados do cliente no app.** Primeiro nome, endereço de entrega, observação e volumes; telefone do cliente só durante a corrida ativa e por botão de ligar (nunca copiável em tela); sem CPF, e-mail, itens ou valores (alinha RN-18 "Dados").

**RN-D9 Custo.** Segue RN-18: o admin registra o custo da corrida; o app não calcula nem mostra ganhos.

**RN-D10 Requisito de aparelho.** Android (versão mínima definida pelo mobile-dev) com GPS e dados móveis; o Webag não fornece aparelho na 1.0 `[HIPÓTESE; validar na cotação]`.

## Requisitos não funcionais
- **Desempenho:** gerar rota de 6 paradas em <= 1 s; abrir o app e ver a corrida em <= 3 s em Android de entrada.
- **Bateria e dados:** ver `rastreio` (intervalos adaptativos); consumo de dados <= 15 MB por hora de corrida `[HIPÓTESE]`.
- **Offline:** ações e pontos em fila local (até 8 h); ordem preservada; nenhuma perda de ação por queda de rede.
- **Segurança:** acesso por convite de uso único e sessão ligada ao aparelho; token revogável pelo admin; nenhuma ação de outro motoboy (IDOR); chave de API de mapa (se houver) fora do app; APK assinado; Security revisa (ataques a localização, replay, falsificação de posição).
- **Acessibilidade:** botões grandes (alvo >= 56 pt), contraste alto ao sol, uma ação principal por tela, luva (toque sem gesto).
- **Licença:** atribuição "© OpenStreetMap" visível no mapa (ODbL); Solar e fontes seguem a DEC-055 (a tela "Licenças" do app do motoboy também).

## Histórias e critérios de aceite

### WB-380 Admin: mapa da fila e atribuição visual — Should — dep: WB-230, WB-232, WB-385
Como operação, quero ver pedidos e motoboys no mapa, para decidir quem leva o quê.
- **C1** Dado corridas prontas, então o mapa mostra a loja e o destino (pino) de cada uma com o prazo restante, e o motoboy com a última posição e a hora dela.
- **C2** Dado o mapa, então a atribuição também funciona pela lista (o mapa não é obrigatório).
- **C3** Dado o mapa sem rede de tiles, então a lista segue funcionando com a mensagem "Mapa indisponível".
- **C4** Dado o mapa, então mostra "© OpenStreetMap" e carrega tiles do armazenamento do próprio projeto (nenhuma requisição aos servidores da fundação OSM, teste de rede).
- **C5** Dado destino dentro do raio, então o pino usa o ponto do endereço confirmado (ADR-015); sem ponto, o destino aparece "sem posição" e não entra no cálculo de rota.

### WB-381 Admin: agrupar e gerar rota — Must — dep: WB-256, WB-249
Como operação, quero que o sistema proponha a ordem das paradas, para entregar mais por hora sem pensar na ordem.
- **C1** Dado 3 corridas prontas da mesma cidade, quando seleciono e toco "Gerar rota", então vejo a ordem de paradas com coleta antes da entrega de cada pedido, horário previsto por parada e distância total.
- **C2** Dado até 8 paradas, então a ordem é a de menor tempo total (teste contra força bruta em 20 conjuntos de referência).
- **C3** Dado uma entrega com horário previsto depois do fim da faixa, então vejo "Esta corrida pode atrasar" naquela parada e posso removê-la do lote.
- **C4** Dado a capacidade de 4 volumes e 5 volumes selecionados, então a tela recusa com "Passa da capacidade de 4 volumes: tire 1 corrida".
- **C5** Dado corridas de cidades de destino diferentes, então recusa com "Só da mesma cidade" (RN-18).
- **C6** Dado "mover para cima/para baixo" uma parada, então recalcula horários e avisos; coleta nunca passa depois da sua entrega.
- **C7** Dado confirmar, então todas as corridas vão para AGUARDANDO_MOTOBOY do mesmo motoboy com a ordem gravada, auditada (ator, hora, motivo da alteração de ordem).
- **C8** Dado a rota gerada, então nenhuma chamada a serviço externo é feita (teste de rede).
- **C9** Dado 1 corrida só, então "Gerar rota" mostra a parada da coleta e da entrega (rota simples).

### WB-382 Rota por link: abrir no Maps ou Waze — Must — dep: WB-381, WB-232
Como motoboy sem o app, quero abrir cada parada no meu aplicativo de mapa, para navegar sem digitar endereço.
- **C1** Dado a rota confirmada, então a mensagem de WhatsApp lista as paradas na ordem, cada uma com link que abre o destino no Maps ou no Waze.
- **C2** Dado o link, então traz só coordenadas ou endereço da parada (sem nome completo do cliente nem telefone no próprio link).
- **C3** Dado parada de entrega, então a mensagem traz o primeiro nome do cliente e a observação (RN-18 "Dados").
- **C4** Dado iPhone e Android, então os links abrem o app de mapa do aparelho (teste manual em aparelho; limite de paradas por link: pergunta L6).
- **C5** Dado o app do motoboy instalado, então a mensagem também chega por push e a de WhatsApp só em contingência.

### WB-383 Cadastro e convite do motoboy — Must — dep: WB-231, parecer J8 e J26
Como operação, quero convidar o motoboy, para ele entrar no app sem senha compartilhada.
- **C1** Dado o cadastro do motoboy (nome, WhatsApp), quando toco "Convidar", então ele recebe um link de uso único (validade 48 h) para instalar e entrar.
- **C2** Dado o 1º acesso, então o aviso de GPS aparece (o que coleta, quando, retenção de 7 dias, quem vê) e exige "Li e aceito"; o aceite é gravado com versão e hora.
- **C3** Dado o link reutilizado ou vencido, então "Convite inválido" e nada acontece.
- **C4** Dado "Revogar acesso" pelo admin, então a sessão do aparelho cai em até 1 minuto.
- **C5** Dado motoboy desativado, então não recebe corrida.
- **C6** Dado o cadastro, então não há CPF nem documento no sistema nesta fase (decisão do parecer J8).

### WB-384 App: ver, aceitar e recusar corridas — Must — dep: WB-383, WB-381
Como motoboy, quero ver minhas corridas e aceitar, para trabalhar sem mensagens soltas.
- **C1** Dado rota atribuída, então recebo push com som e vejo "Nova rota: 3 entregas", com ganhos não exibidos.
- **C2** Dado a oferta, quando toco "Aceitar", então as corridas viram MOTOBOY_A_CAMINHO e a operação vê o aceite em tempo real.
- **C3** Dado "Recusar" ou 3 minutos sem resposta, então a rota volta à fila e a operação é alertada, sem penalidade.
- **C4** Dado nenhuma corrida, então a tela mostra "Sem corridas agora" e o estado "Disponível" ou "Offline".
- **C5** Dado sem internet, então vejo a última rota salva e "Sem conexão".
- **C6** Dado corrida cancelada pela operação com o motoboy a caminho, então o app avisa na hora e some da lista.

### WB-385 Instalar e atualizar o app (APK Android) — Must — dep: parecer J8 e J26, F10
Como operação, quero distribuir o app por link, para não pagar loja de aplicativos.
- **C1** Dado a página de instalação, então traz o APK, instruções com imagens para liberar "instalar de fonte desconhecida" e o aviso sobre o Play Protect.
- **C2** Dado o APK, então é assinado com a chave do projeto e tem número de versão; a página mostra a versão atual e o hash.
- **C3** Dado versão mínima exigida, então app mais velho mostra "Atualize para continuar" e não recebe corrida.
- **C4** Dado iPhone, então a página explica que o app é só Android e o motoboy iOS segue no modo WhatsApp.
- **C5** Dado o link, então só abre com o convite (não é público).
- **C6** Dado nova versão, então o motoboy atualiza por novo APK ou por atualização do código (OTA, quando permitido) sem perder a fila local.

### WB-386 App: etapas e botões de coleta e entrega — Must — dep: WB-384, WB-391
Como motoboy, quero marcar cada etapa com um toque, para a loja, o cliente e a operação saberem onde estou.
- **C1** Dado a parada da loja, quando toco "Cheguei à loja" (ou o aparelho está a até 100 m), então o estado vira MOTOBOY_NA_LOJA e a loja é avisada (PRD rastreio).
- **C2** Dado "Peguei o pedido", então registra a hora e aguarda o OK da loja; a tela diz "Aguardando a loja confirmar".
- **C3** Dado o OK da loja, então a tela mostra a próxima parada e o botão "Navegar".
- **C4** Dado "Cheguei ao cliente", então registra a hora; se a posição estiver a mais de 300 m do endereço, mostra aviso "Você está longe do endereço" e permite seguir (a divergência é registrada).
- **C5** Dado "Entreguei" com o código de 4 dígitos correto, então ENTREGUE com `deliveredAt` do aparelho e a próxima parada.
- **C6** Dado código errado 3 vezes, então bloqueia e o botão "Chamar a operação" abre o WhatsApp da Webag.
- **C7** Dado "Não consegui entregar", então escolho o motivo (RN-18) e vira NAO_ENTREGUE.
- **C8** Dado duplo toque em qualquer botão, então a etapa é registrada uma vez (idempotência).
- **C9** Dado etapa fora de ordem (ex.: "Entreguei" antes de "Peguei"), então o botão não aparece.

### WB-387 App: GPS só na corrida, em segundo plano e sem sinal — Must — dep: WB-384
Como motoboy, quero que o app rastreie só enquanto trabalho e não perca dado sem sinal, para não gastar bateria nem dado à toa.
- **C1** Dado corrida aceita, então o app inicia o serviço de localização com notificação fixa "Webag Entregas: corrida em andamento", e a localização continua com o Waze em primeiro plano.
- **C2** Dado fim da corrida, então o serviço de localização encerra na hora e a notificação some.
- **C3** Dado motoboy "Disponível" sem corrida, então o app não coleta localização.
- **C4** Dado sem sinal, então ações e pontos ficam numa fila local com a hora do aparelho e sobem na ordem ao voltar a rede; o servidor aceita a hora do aparelho se estiver dentro de 60 minutos antes do recebimento e nunca no futuro.
- **C5** Dado intervalo de pontos, então segue a RN do rastreio (8 a 10 s em movimento, 30 s parado) e a precisão cai quando parado.
- **C6** Dado permissão de localização negada ou GPS desligado, então a corrida não pode ser aceita e o app explica como ligar.
- **C7** Dado 1 hora de corrida em Android de entrada, então a bateria consome <= 12% (teste de QA em aparelho real).
- **C8** Dado o app fechado à força pelo sistema, então a operação vê "sem sinal" e o app, ao reabrir, retoma sem pedir de novo o aceite.

### WB-388 Admin: motoboys ao vivo, sem sinal e reatribuir — Should — dep: WB-380, WB-387
Como operação, quero ver quem está sem sinal e reatribuir, para não deixar cliente esperando.
- **C1** Dado motoboy sem ponto há mais de 3 minutos em corrida, então aparece "Sem sinal" no mapa e na lista e um alerta ao admin (RN-19 alerta de atraso segue valendo).
- **C2** Dado "Reatribuir" com motivo, então a corrida volta a PRONTA_PARA_COLETA ou vai a outro motoboy, com auditoria.
- **C3** Dado o histórico de uma corrida, então a operação vê a linha do tempo de etapas com hora e fonte (app, admin, automático).
- **C4** Dado perfil suporte, então vê a posição só de corrida ativa e sem histórico de pontos.

### WB-389 Privacidade do motoboy — Must — dep: WB-383, WB-387
Como motoboy, quero saber e controlar o que o app coleta, para confiar nele.
- **C1** Dado a tela "Privacidade", então lista o que coleta (posição na corrida, etapas, hora), a finalidade, a retenção de 7 dias e o canal para pedir os dados.
- **C2** Dado "Meus dados", então vejo o histórico dos meus pontos das últimas corridas.
- **C3** Dado pontos com mais de 7 dias, então foram apagados (job) e a corrida mantém só distância total e o ponto de entrega com a hora.
- **C4** Dado consulta do admin ao histórico de pontos, então só em disputa de entrega, com motivo e registro em auditoria.
- **C5** Dado o motoboy desativado, então os pontos seguem a retenção e o acesso ao app cai.
- **C6** Dado a mensagem do app, então nunca diz que há ranking, bônus ou punição ligados ao GPS (porque não há).

## Eventos de analytics (servidor)
`route_generated` (stops, total_km, late_warnings), `route_sent` (channel: app, whatsapp), `courier_offer_accepted` (seconds), `courier_offer_declined` (reason), `courier_step` (step, source: app, admin), `courier_offline_flush` (points, delay_s), `courier_signal_lost` (seconds), `delivery_code_failed`. IDs opacos; sem nome nem endereço.

## Dependências e riscos
| Item | Tratamento |
|---|---|
| Parecer jurídico sobre motoboy (J8), LGPD do GPS do motoboy (J26) | **Bloqueia WB-383 a 389 em produção**; desenvolvimento segue |
| Margem de entrega negativa (F4) | Rota mais eficiente ajuda, não resolve; cotar motoboys |
| Android de entrada e bateria | Teste em aparelho real; intervalos adaptativos |
| Instalação por APK assusta o motoboy | Instruções com imagem e acompanhamento do fundador na 1ª instalação |
| Mapa próprio (extrato e hospedagem) | Spike do Tech Lead (L5) |
| Heurística em linha reta erra onde a rua dá volta | Aviso "estimado"; gatilho do motor de rota (§Fora do escopo) |
| Vínculo trabalhista | Mitigações do desenho e parecer; sem ranking, sem penalidade |
| Falsificação de posição | Registro da divergência endereço x posição; código de entrega |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Módulo nativo do MapLibre exige build de desenvolvimento (não roda no Expo Go): o fluxo do fundador (DEC-087) muda? App separado `apps/courier` ou perfil no app do cliente? | mobile-dev, tech-lead (ADR) |
| Capacidade do motoboy em volumes: onde a loja informa o volume? Já existe no pedido? | backend-dev |
| Limite de paradas no link do Google Maps e comportamento no iOS | mobile-dev (L6) |
| Convite de uso único e sessão ligada ao aparelho: nível de segurança | Security |
| Quem fornece o aparelho e o plano de dados do motoboy | Fundador (cotação de motoboys) |
| Motoboy deve ver o valor da corrida no app? (hoje não, RN-D9) | Fundador |
