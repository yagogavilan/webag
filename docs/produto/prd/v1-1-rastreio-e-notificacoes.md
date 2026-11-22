# PRD v1.1: Rastreio ao vivo, confirmação de saída pela loja e notificações

Status: pronta para sprint (lado do PO; flags desligadas; R4 bloqueada por SEC-193 e SEC-198 e liga só com J8 e J26; ver `backlog.md` §10.7) | Dono: product-owner | Data: 2026-11-22 | Atualizado: 2026-11-22 (DoR: controles C-RT-*, C-NOT-*, C-MOT-08/10, DEC-110 e DEC-112) | Histórias: WB-390 a WB-399
Base: `regras-de-negocio.md` RN-07, RN-08, RN-18, RN-19; `prd/logistica.md` WB-233, WB-235, WB-253 a WB-262; `prd/notificacoes.md` (catálogo de eventos); DEC-045 (ticket de tempo real), DEC-053, DEC-054, DEC-064 (`deliveredAt`), DEC-072, DEC-076 (promessa estável); ADR-004 (Socket.IO `/rt`); WB-303 (rastreio, absorvido); `v1-1-pesquisa.md` §8 e §9; app e despacho: `prd/v1-1-despacho-e-app-motoboy.md`.

## Problema
- **Quem sofre:** Carla (cliente) que não sabe onde está o pedido ("cadê meu pedido" é a reclamação-gatilho do backlog §6.1), a loja (o motoboy chega e ela não tem um passo claro de "entreguei ao motoboy") e a operação (marca o estado à mão).
- **Evidência:** a timeline do v1.0 termina em "Saiu para entrega" (marcado pelo admin) sem mapa. Iguala o padrão iFood só com rastreio. **Sem dado de piloto sobre quanto o rastreio reduz o "cadê meu pedido"** `[HIPÓTESE; HIP-R1]`.
- **Pedido do fundador:** o fluxo "loja aceita, marca pronto, motoboy chega e pega, **a loja dá o OK de que saiu**, o cliente acompanha no mapa, o motoboy confirma a entrega, o rastreio some". A confirmação de saída pela loja é cadeia de custódia: marca quando a responsabilidade pela mercadoria passa ao motoboy e impede mostrar rastreio de quem ainda não saiu.
- **Posição crítica.**
  1. **O OK da loja é o ponto frágil:** o lojista (P2) está no balcão e esquece. Sem fallback, o pedido trava e o cliente fica sem rastreio. O desenho tem **lembrete, confirmação automática com geocerca e alerta ao admin** (F12).
  2. **Rastreio expõe uma pessoa:** o motoboy. Em lote, mostrar o marcador de um motoboy a quem espera a entrega de outro revela o trajeto de terceiros. Por padrão o mapa só aparece quando o pedido do cliente é a **próxima parada** (F13).
  3. **A promessa não muda:** o ETA ao vivo é informativo; a faixa aceita no checkout continua sendo a base de atraso e compensação (DEC-076 A-06).

## Objetivo e métrica de sucesso
| Métrica `[HIPÓTESE]` | Meta | Fonte |
|---|---|---|
| Entregas com rastreio ativo (mapa exibido) entre as elegíveis (app do motoboy e próxima parada) | >= 90% | eventos |
| Tempo entre "Cheguei à loja" e a saída confirmada | mediana <= 2 min; p90 <= 5 min | `delivery_events` |
| Saídas confirmadas automaticamente (sem a loja) | <= 20% após 4 semanas (se mais, o fluxo está pesado) | `delivery_events` |
| Erro mediano do ETA ao vivo (previsto 5 min antes x real) | <= 4 min | comparação |
| Pedidos com contato "cadê meu pedido" por 100 entregas | cair 30% sobre a linha de base do piloto sem rastreio | suporte |
| Pontos de GPS retidos além de 7 dias | 0 | job e teste |
| Notificação de "saiu" entregue em <= 10 s | 95% | Expo/servidor |

## Fora do escopo (com gatilho de volta)
| Item | Motivo | Gatilho |
|---|---|---|
| Mostrar a trilha percorrida, velocidade ou histórico de rota ao cliente | Privacidade do motoboy | Nunca para o cliente |
| Telefone, foto, sobrenome ou placa do motoboy no app do cliente | Privacidade e segurança do motoboy | Incidente de segurança do cliente |
| Compartilhar o rastreio com terceiros (família) por link | Exige link público | 3 pedidos |
| Chat e ligação com o motoboy | Número mascarado é pago | Reclamação |
| Rastreio de retirada na loja e de coleta de troca | Fora do pedido do fundador | Troca em volume |
| Mapa para clientes web | O app é o canal | Pedido |
| Previsão de atraso por modelo estatístico | Sem dado | 3 meses de entregas |
| Notificação por SMS ou WhatsApp automático | Custo por envio (DEC-003) | Reclamação de push não chegar |
| Auto-confirmação de **entrega** (entregue sem o motoboy) | Só a auto-conclusão de 24 h (RN-07) | Nunca fora disso |

## Usuários e cenários
| Persona | Cenário |
|---|---|
| Carla | Recebe "Seu pedido saiu para entrega. Acompanhe no mapa". Abre, vê o motoboy Carlos e "Chega por volta de 15:52" dentro da faixa "15:40 a 16:10". Perto de casa recebe "O motoboy está chegando. Tenha o código de entrega". Informa o código; o mapa some e vê "Entregue às 15:54" |
| Joana (loja) | O painel toca: "Carlos chegou para o pedido 1042". Ela entrega a sacola e toca "Saiu com o motoboy" |
| Seu Marcos esquece | Aos 3 min o painel toca de novo; aos 5 min o sistema confirma sozinho (o motoboy está a 40 m da loja) e a loja vê "Saída confirmada automaticamente 15:42"; aos 10 min sem confirmar o admin teria sido alertado |
| Operação | Vê a corrida em "Aguardando OK da loja há 4 min" em amarelo; liga para a loja; confirma por ela com motivo |
| Carlos sem sinal | O cliente vê "Sem atualização há 2 min. Última posição às 15:48"; o pedido segue a caminho |

## Requisitos funcionais
1. **Confirmação de saída pela loja** ("Saiu com o motoboy") no painel do lojista, com lembrete, confirmação automática por regra e fallback da operação.
2. **Estados e transições** estendidos (quem muda, timeouts, divergências), reconciliados com WB-262 e RN-07, RN-18, RN-19.
3. **Rastreio ao vivo** no app do cliente: marcador do motoboy, destino, ETA ao vivo, só em SAIU_PARA_ENTREGA e (em lote) só quando é a próxima parada; encerra ao entregar.
4. **ETA ao vivo** recalculado a cada posição, sem alterar a promessa.
5. **Sem sinal:** estados "sem atualização" e fallback para linha do tempo sem mapa.
6. **Privacidade e retenção** do rastreio.
7. **Notificações** do fluxo: push do app, aviso no painel, e-mail do lojista, alerta ao admin (matriz abaixo); Web Push do lojista (reabre WB-192 C2).
8. **Métricas** do fluxo (tempo de OK da loja, % automático, sem sinal, erro do ETA).

## Máquina de estados (entrega, reconciliada com a RN-18; `+` = novo)
Mapeamento do **pedido** (RN-07) não muda: PRONTO_PARA_COLETA até a saída confirmada; SAIU_PARA_ENTREGA depois.

| Estado da entrega | Pedido | Quem entra | Próximos | Timeout e o que acontece |
|---|---|---|---|---|
| PRONTA_PARA_COLETA | PRONTO_PARA_COLETA | loja ("Pronto para coleta") | AGUARDANDO_MOTOBOY, CANCELADA | Alertas de fila sem motoboy (10 e 20 min, RN-18) seguem |
| AGUARDANDO_MOTOBOY | idem | operação (atribui) | MOTOBOY_A_CAMINHO; volta a PRONTA | **3 min** sem aceite ou recusa: volta a PRONTA e alerta a operação |
| MOTOBOY_A_CAMINHO | idem | motoboy (aceita no app) ou operação | MOTOBOY_NA_LOJA; volta a PRONTA | Passou de ETA da loja + 10 min sem chegar: alerta à operação |
| **MOTOBOY_NA_LOJA +** | idem | motoboy ("Cheguei à loja", ou a 100 m da loja) ou operação | SAIU_PARA_ENTREGA; volta a PRONTA | **3 min** sem OK da loja: lembrete forte à loja; **5 min após "Peguei o pedido"** e com o motoboy a até 150 m: **confirmação automática**; **10 min** sem confirmar: alerta ao admin |
| SAIU_PARA_ENTREGA | SAIU_PARA_ENTREGA | **loja** (OK), sistema (automática), operação (fallback) | ENTREGUE, NAO_ENTREGUE | O rastreio inicia; 24 h sem fechamento: auto-conclusão (RN-07) |
| ENTREGUE | ENTREGUE | **motoboy** (app, com código) ou operação (fallback) | terminal | Rastreio encerra; avaliação 1 h depois |
| NAO_ENTREGUE, DEVOLVIDA_A_LOJA, CANCELADA | como RN-18 | motoboy, operação, sistema | como RN-18 | Rastreio encerra |

**Quem pode mudar (resumo).** Loja: marca pronto, OK de saída, desfaz saída em até 2 min enquanto o motoboy está a até 150 m (sem GPS: só o admin). Motoboy (app): aceita ou recusa, cheguei à loja, peguei, cheguei ao cliente, entreguei (código), não consegui. Operação: atribui, reatribui, confirma saída por fallback, marca etapas em nome do motoboy (modo WhatsApp), cancela. Sistema: confirmação automática, auto-conclusão, alertas. Cliente: "não recebi" e "pedir cancelamento" (existentes). Toda transição grava ator, hora, **fonte** (`app`, `loja`, `sistema`, `admin`) e motivo (RN-07).

**Divergências e o que fazer**
| Caso | Regra |
|---|---|
| Motoboy "peguei", loja não confirma | Lembrete aos 3 min, automática aos 5 min (se a até 150 m), alerta admin aos 10 min |
| Loja confirma, motoboy nunca marcou "cheguei" | A confirmação da loja vale (fonte `loja`, marca `sem_chegada`); o botão aparece na linha do pedido desde MOTOBOY_A_CAMINHO, com "O motoboy já está com o pedido?"; a operação recebe aviso informativo e o motoboy vê "Não peguei este pedido"; o rastreio mostra só a linha do tempo até o 1º ponto de GPS (WB-390 C10) |
| Loja toca "Ainda estou separando" | Silencia som e lembrete por 3 min, uma vez por pedido, sem mudar estado; se o motoboy já marcou "Peguei", a automática não dispara e o admin é alertado na hora |
| Loja com vários pedidos do mesmo motoboy | Um toque confirma todos os pedidos com "Peguei" registrado e pré-marcados, cada um com sua transição e auditoria (WB-390 C9) |
| Motoboy sem sinal ao entregar | "Entrega a conferir": o servidor confere o código quando a rede voltar; ENTREGUE só com código conferido (`prova = codigo`) ou fechamento da operação (RN-D6a) |
| Loja confirma o pedido errado | "Desfazer" em até 2 min nas condições acima; depois, admin com motivo |
| Motoboy sem app ou sem sinal | Modo WhatsApp: a operação marca as etapas; sem mapa ao cliente (`tracking_available = false`) |
| "Entreguei" a mais de 300 m do endereço | Vale com o código; marca "entrega fora do ponto" para revisão da operação; sem bloquear |
| Código de entrega errado 3 vezes | Bloqueia o botão; "Chamar a operação"; a operação fecha com motivo |
| Cliente diz "não recebi" depois de ENTREGUE | Disputa (RN-07); evidência: hora, ponto de GPS da entrega, código usado; ponto bruto até 7 dias |
| Dois motoboys na mesma corrida | O servidor aceita um só (atomicidade já testada) |
| Pedido cancelado pelo admin depois de SAIU | Rastreio encerra, cliente notificado, estorno pela regra existente (RN-08) |

**`deliveredAt` e WB-262 (DEC-064).** Com o app, `deliveredAt` é a **hora do aparelho** do motoboy no toque de "Entreguei" (aceita se até 60 minutos antes do recebimento e nunca no futuro; senão vale a hora do servidor), fonte `app`. A regra de recuo de até 60 minutos com motivo (WB-262) vale **só quando a operação marca em nome do motoboy** (fonte `admin`). A compensação por atraso e a métrica "entregue em até 2 h" usam esse `deliveredAt` (WB-254, HIP-E09). O objetivo de WB-262 (a operação não fabricar atraso) fica atendido com mais exatidão.

**Alterações propostas às RN (aplicar no `regras-de-negocio.md` quando o CEO validar a DEC-099):** RN-07 (a **loja** passa a confirmar a saída; o admin é fallback), RN-18 (estado MOTOBOY_NA_LOJA, fonte de cada transição, `deliveredAt` pelo app), RN-19 (ETA ao vivo informativo).

## Regras de negócio
**RN-R1 Quando o mapa aparece.** Só se: (a) corrida em SAIU_PARA_ENTREGA com a saída confirmada; (b) `tracking_available` verdadeiro (motoboy com app e ponto recente); (c) o pedido do cliente é a **próxima parada** do motoboy (em lote, o cliente das paradas seguintes vê a fila: "O motoboy está entregando outro pedido antes do seu. Você é o 2º"); (d) o usuário é o **dono do pedido**. Fora disso: linha do tempo sem mapa.

**RN-R2 O que aparece.** Marcador do motoboy (posição, sem trilha), destino do próprio cliente, ETA ao vivo, primeiro nome do motoboy (WB-235 C3). **Nunca:** telefone, foto, sobrenome, placa, velocidade, trilha, outros pedidos do lote.

**RN-R3 Quando acaba.** Ao ENTREGUE, NAO_ENTREGUE, DEVOLVIDA, CANCELADA ou após 24 h: o servidor para de emitir ao cliente; a rota de rastreio responde `410` com "Entrega concluída"; o app fecha o mapa e mostra o resumo ("Entregue às HH:MM"). Reentrega abre novo rastreio só em novo SAIU.

**RN-R4 Frequência `[HIPÓTESE; calibrar]`.** O app do motoboy envia ponto a cada **10 s em movimento** (8 a 10 s) e a cada **30 s parado** (velocidade < 1 m/s); o servidor entrega ao cliente **no máximo 1 atualização a cada 5 s**; o app do cliente **anima** o marcador entre pontos (1 a 2 s). Parâmetros: `tracking_ponto_movimento_s`, `tracking_ponto_parado_s`, `tracking_cliente_min_s`.

**RN-R5 ETA ao vivo.** `eta_vivo = agora + ceil(distancia_restante_km x entrega_rota_fator_pct/100 x entrega_min_por_km)` mais as paradas anteriores na fila (3 min cada), suavizado (média dos últimos 3 cálculos). Mostrado como "Chega por volta de HH:MM", **junto da faixa prometida**, que não muda. Se `eta_vivo` passar do fim da faixa em 5 min ou mais, o texto muda para "Pode atrasar" (uma vez); as regras de atraso, cancelamento sem custo e compensação seguem o **fim da faixa aceita** (RN-19, DEC-076).

**RN-R6 Sem sinal.** Ponto mais antigo que `tracking_stale_s` (90 s): o marcador fica cinza com "Sem atualização há X min. Última posição às HH:MM", **sem extrapolar** a posição; ETA congelado; após 5 min: "Estamos tentando reconectar. Seu pedido segue a caminho" com "Falar com a Webag". Sem internet do cliente: último estado salvo com "Atualizado há X min" (WB-027 C3). O motoboy sem sinal continua usando o app (fila local).

**RN-R7 Retenção e acesso.** Ponto bruto: **7 dias** (`tracking_retencao_dias`, F14); depois fica só a distância total e o ponto e a hora da entrega. Quem lê pontos: o próprio motoboy; a operação só em corrida ativa (tempo real) e, em disputa, o histórico, com motivo e auditoria; o cliente só o ponto atual na janela da RN-R1; ninguém exporta pontos em massa. LGPD do motoboy: ver `prd/v1-1-despacho-e-app-motoboy.md` RN-D7.

**RN-R8 Confirmação automática da saída `[HIPÓTESE; F12]`.** Só dispara se há "Peguei o pedido" do motoboy há `saida_auto_min` (5) minutos **e** o último ponto está a no máximo `saida_auto_raio_m` (150) da loja. Sem GPS, não dispara (vai ao admin). A loja é avisada e pode contestar em até 10 minutos ("Não saiu"): vira divergência para a operação. A fonte `sistema` fica registrada; % automático vira métrica.

**RN-R9 Falha na entrega.** Cancelamento e estorno como RN-08 e RN-18; o rastreio termina em NAO_ENTREGUE final.

**RN-R10 Avaliação, nome e código (DEC-112).** (a) **Um convite só:** o de 1 hora (WB-396 C6); a tela "Entregue" tem o link discreto "Avaliar" e o convite de 1 hora só sai se o pedido ainda não foi avaliado; avalia-se loja e pedido, **nunca o motoboy** (RN-D7; J8). (b) O **nome do motoboy** só aparece depois da saída confirmada, nunca em "a caminho da loja", e nunca no push. (c) "Você é o 2º": "O motoboy está entregando outro pedido antes do seu. Seu pedido é o 2º da rota, por volta de HH:MM." (d) O **código de entrega** fica visível ao cliente só depois de SAIU e deixa de aparecer ao fim da entrega; **risco de exibição na tela aceito** (o código só vale conferido pelo servidor, com 3 tentativas); backend confirma se a reentrega gera código novo; o Security pode pedir máscara ("Toque para mostrar") sem custo. (e) **Push "motoboy a caminho da loja": não** (fica no app). (f) Alerta sonoro de "OK pendente" só à operação e ao super admin; o suporte vê no painel, sem som. (g) Deduplicação de push por (evento, pedido) mais janela de 30 s por pedido.

## Notificações (acrescenta ao catálogo de `prd/notificacoes.md`)
Regras do catálogo valem (transacional sempre enviado; título até 60 e corpo até 120 caracteres; sem emoji; sem dado pessoal sensível; deduplicação; push só depois do 1º pedido). **Código de entrega nunca vai no texto do push.**

| Evento | Destino | Canais | Texto |
|---|---|---|---|
| Motoboy aceitou e vai à loja | Cliente | in-app (sem push) | "O motoboy está a caminho da loja." (existente) |
| **Motoboy chegou à loja** | Loja | painel com som e destaque, Web Push (se ativo). **Sem e-mail** (latência) | "Carlos chegou para o pedido #1042. Entregue e toque em 'Saiu com o motoboy'." |
| **Lembrete de saída (3 min)** | Loja | som forte, painel, Web Push | "O motoboy aguarda o pedido #1042." |
| **OK da loja pendente há 10 min** | Admin (operação) | painel com som (e-mail é fase 2, DEC-074d) | "Pedido #1042 sem OK da loja há 10 min. Ligue para a loja." |
| **Saída confirmada** (loja, automática ou admin) | Cliente | **push**, in-app | "Seu pedido saiu para entrega. Acompanhe no mapa." (abre o mapa) |
| Saída confirmada automaticamente | Loja | painel, e-mail (resumo, sem urgência) | "Confirmamos a saída do pedido #1042 às 15:42 porque o motoboy já estava com ele. Não foi isso? Avise a operação." |
| **Motoboy chegando** (ETA <= 3 min ou a 300 m) | Cliente | push (1 por entrega), in-app | "O motoboy está chegando. Tenha o código de entrega à mão." |
| Pode atrasar (RN-R5) | Cliente | in-app (sem push), 1 vez | "Pode atrasar um pouco. Seguimos acompanhando." |
| Motoboy sem sinal há 3 min | Admin | painel | "Carlos sem sinal há 3 min na entrega #1042." |
| **Entregue** | Cliente | push, in-app; avaliação após 1 h (existente) | "Pedido entregue às 15:54." |
| Entregue | Loja | painel | "Pedido #1042 entregue." (existente) |
| Entrega fora do ponto (> 300 m) | Admin | painel (sem som) | "Entrega #1042 marcada longe do endereço. Revise se houver reclamação." |
| Não entregue | Cliente | push, in-app, e-mail | existente (WB-235 C6) |

## Requisitos não funcionais
- **Tempo real:** o ponto chega ao app do cliente em <= 5 s do envio em 4G; reutiliza o canal Socket.IO `/rt` com **ticket de uso único** e sala por pedido (DEC-045, ADR-004); fallback de polling de 15 s com o último ponto; nenhuma sala permite assinar pedido de outro (IDOR testado).
- **Escala:** 2 motoboys x 1 ponto a cada 10 s: ~0,2 ponto por segundo; sem impacto.
- **Bateria do cliente:** o mapa só abre na tela de acompanhamento; fecha em segundo plano; animação limitada a 30 fps.
- **Mapa:** MapLibre com Protomaps próprio e atribuição OpenStreetMap (`pesquisa` §6); sem chave paga; sem requisição aos servidores da fundação OSM.
- **Acessibilidade:** o estado do mapa tem equivalente em texto ("Motoboy a 1,2 km, chega por volta de 15:52"); não depende de cor; leitores de tela.
- **LGPD:** posição do motoboy é dado pessoal de trabalhador (J26): finalidade, retenção, acesso e aviso; posição do cliente não é coletada; Data Safety e App Privacy do **app do cliente** não ganham "localização em segundo plano" (ele só recebe, não envia).

## Histórias e critérios de aceite

### WB-390 Loja confirma a saída do pedido — Must — dep: WB-229, WB-386, WB-391
Como loja, quero confirmar que entreguei o pedido ao motoboy, para o cliente acompanhar e a responsabilidade ficar clara.
- **C1** Dado o motoboy em MOTOBOY_NA_LOJA, então o painel mostra "Carlos chegou para o pedido #1042" com o botão "Saiu com o motoboy" em destaque e som.
- **C2** Dado o toque no botão, então o pedido vira SAIU_PARA_ENTREGA com fonte `loja`, o cliente recebe o push e o painel mostra "Saída registrada às 15:42".
- **C3** Dado duplo toque, então registra uma vez.
- **C4** Dado que a loja toca "Desfazer" em 2 minutos com o motoboy a até 150 m, então volta a MOTOBOY_NA_LOJA e o cliente recebe "O pedido ainda não saiu"; depois de 2 minutos ou com o motoboy longe, o botão some e só o admin desfaz.
- **C5** Dado funcionário sem a permissão de pedidos, então não vê o botão.
- **C6** Dado pedido de retirada, então não existe o botão (continua o código de retirada, RN-07).
- **C7** Dado o painel fechado, então o lembrete chega por Web Push (se ativo) e a regra automática de 5 min cobre o resto.
- **C8** Dado a loja que confirma sem o motoboy ter marcado "Cheguei", então a confirmação vale e o app do motoboy mostra "A loja confirmou a saída".
- **C9** Dado pedidos do mesmo motoboy em MOTOBOY_NA_LOJA com "Peguei" registrado, então o botão traz "Saiu com o motoboy: #1042, #1043, #1044" com os pedidos pré-marcados; 1 toque confirma todos, cada um com sua transição, fonte `loja` e auditoria; a loja pode desmarcar; nunca mistura motoboys.
- **C10** Dado o pedido em MOTOBOY_A_CAMINHO (sem chegada registrada), quando a loja toca "Saiu com o motoboy", então aparece "O motoboy já está com o pedido?" e, ao confirmar, a saída vale com fonte `loja` e marca `sem_chegada`; a operação recebe aviso informativo e o app do motoboy mostra "A loja confirmou a saída" com "Não peguei este pedido" (chama a operação).
- **C11** Dado "Ainda estou separando", então silencia o som e o lembrete por 3 minutos, uma vez por pedido, sem mudar o estado; se o motoboy já marcou "Peguei", a confirmação automática não dispara e o admin é alertado na hora.
- **C12** Dado funcionário sem a permissão de pedidos, então o aviso de chegada aparece só como texto ("Carlos chegou para o pedido #1042. Avise quem cuida dos pedidos."), sem botão e sem Web Push.

### WB-391 Estados, timeouts e divergências da entrega — Must — dep: WB-233, WB-235
Como operação, quero que cada passo tenha dono e prazo, para o pedido nunca ficar parado sem alerta.
- **C1** Dado a transição de cada linha da tabela de estados, então só o ator permitido a executa (teste de matriz); os demais recebem 403 e a tentativa fica registrada.
- **C2** Dado MOTOBOY_NA_LOJA sem OK da loja por 3 minutos, então a loja recebe o lembrete; por 5 minutos após "Peguei" e com o motoboy a até 150 m, então a saída é confirmada pelo sistema, com fonte `sistema`.
- **C3** Dado a mesma situação sem ponto de GPS recente, então a confirmação automática **não** ocorre e aos 10 minutos o admin é alertado.
- **C4** Dado aceite de corrida sem resposta em 3 minutos, então volta a PRONTA_PARA_COLETA e alerta a operação.
- **C5** (C-MOT-08) Dado `deliveredAt` vindo do app, então vale a hora do aparelho só se estiver entre a confirmação de saída **registrada no servidor** e o recebimento, não passar de 60 minutos antes do recebimento e, se diferir do recebimento em mais de 2 minutos, vier marcada como fila offline com pontos que a expliquem; caso contrário vale a do servidor, a divergência é registrada e a fonte é gravada.
- **C6** Dado a operação marcando ENTREGUE em nome do motoboy, então valem o recuo de até 60 minutos e o motivo da WB-262.
- **C7** Dado a compensação por atraso, então usa o `deliveredAt` e o fim da faixa aceita no checkout (DEC-076), como antes.
- **C8** Dado a loja contestando a saída automática em 10 minutos, então vira divergência na fila da operação.
- **C9** Dado dois motoboys tentando assumir a mesma corrida em paralelo, então só um é aceito.
- **C10** Dado cada transição, então grava ator, fonte, hora e motivo e dispara a notificação da matriz.
- **C11** Dado os parâmetros de tempo e raio, então estão em RN-02, editáveis no admin com auditoria (`saida_lembrete_min`, `saida_auto_min`, `saida_auto_raio_m`, `saida_alerta_admin_min`).
- **C12** (C-MOT-10, C-MOT-09) Dado a confirmação automática, então exige "Peguei", 5 minutos, ponto **não suspeito** de até 60 s e raio de 150 m; a loja contesta em 10 minutos; sem ponto recente não confirma e alerta aos 10 minutos; o % automático por loja e por motoboy vai ao relatório (WB-398).
- **C13** (C-RT-07, C-MOT-03) Dado o gateway, então só o servidor publica em salas (sem handler de repasse); evento de etapa só nasce de transição validada; cliente que emite `position` no socket é ignorado.
- **C14** (RN-D6a) Dado cada ENTREGUE, então grava `prova` (`codigo`, `operacao` ou `automatica`); o relatório de "não recebi" e o WB-398 mostram o % sem `codigo`.

### WB-392 Cliente: acompanhar o motoboy no mapa — Must — dep: WB-387, WB-390, WB-395
Como cliente, quero ver o motoboy a caminho no mapa, para saber quando chega.
- **C1** Dado o pedido em SAIU_PARA_ENTREGA e a loja ter confirmado, então a tela do pedido mostra o botão "Acompanhar no mapa" e o push abre o mapa.
- **C2** Dado o mapa, então mostra o marcador do motoboy com o primeiro nome, o destino e "Chega por volta de HH:MM" ao lado da faixa prometida.
- **C3** (C-RT-05) Dado novos pontos, então o marcador se move com animação, sem saltos, com no máximo 1 atualização por 5 s e posição com 4 casas decimais (cerca de 11 m).
- **C4** (C-RT-02) Dado lote com o pedido não sendo a próxima parada, então o mapa não aparece e a tela diz "O motoboy está entregando outro pedido antes do seu. Seu pedido é o 2º da rota, por volta de HH:MM."; a emissão é filtrada no servidor e o payload traz só `{lat, lng, ts, eta, firstName}` (sem `courierId`, telefone, trilha, velocidade nem outro pedido): o cliente da 2ª parada não recebe posição.
- **C5** Dado entrega sem app do motoboy (modo WhatsApp), então a linha do tempo aparece sem mapa e sem erro.
- **C6** (C-RT-01, SEC-198) Dado outro usuário abrindo o link do mapa de um pedido que não é dele, então 404. A posição vai numa sala própria `track:{orderId}` (nunca `order:{id}`, que aceita membros da loja): a inscrição só vale se `orders.user_id = :me`, a entrega está em SAIU, o rastreio está disponível e o pedido é a próxima parada; senão `{ok:false}`, igual a "não existe"; membro da loja que tenta entrar em `track:` do pedido da loja é recusado.
- **C7** Dado o mapa sem rede de tiles, então a tela mostra a distância e o ETA em texto.
- **C8** Dado o rodapé do mapa, então mostra "© OpenStreetMap".
- **C9** Dado leitor de tela, então a posição é lida em texto ("Motoboy a 1,2 km").
- **C10** Dado o motoboy em "a caminho da loja", então o nome dele não aparece; só depois da saída confirmada (RN-R10 b).

### WB-393 ETA ao vivo sem mudar a promessa — Should — dep: WB-392
Como cliente, quero uma previsão que acompanhe o trânsito real, sem a promessa mudar sob meus pés.
- **C1** Dado o motoboy a 3 km e 6 min por km com fator 1,3, então o ETA ao vivo soma `ceil(3 x 1,3 x 6) = 24` minutos ao horário atual, mais 3 min por parada anterior.
- **C2** Dado ETA ao vivo dentro da faixa, então a faixa prometida continua a mesma na tela.
- **C3** Dado ETA ao vivo 5 minutos ou mais depois do fim da faixa, então aparece "Pode atrasar" uma vez, sem push, e a faixa prometida não muda.
- **C4** Dado atraso real além do fim da faixa mais tolerância, então valem "Cancelar sem custo" e a compensação existentes (RN-19), com o fim da faixa aceita.
- **C5** Dado ponto parado há mais de 2 minutos na porta do destino, então o ETA mostra "Chegou" e não regride.
- **C6** Dado o relatório de precisão, então mede o erro entre o ETA de 5 minutos antes e a entrega real.

### WB-394 Sem sinal do motoboy ou do cliente — Must — dep: WB-392
Como cliente, quero saber quando a localização está desatualizada, para não achar que o pedido parou.
- **C1** Dado ponto com mais de 90 segundos, então o marcador fica cinza com "Sem atualização há 2 min. Última posição às 15:48" e o ETA congela.
- **C2** Dado ponto com mais de 5 minutos, então aparece "Estamos tentando reconectar. Seu pedido segue a caminho" e o botão "Falar com a Webag".
- **C3** Dado a volta dos pontos em lote, então o marcador reaparece sem trilha de "teletransporte" (anima do último ao novo ponto em até 2 s).
- **C4** Dado o cliente sem internet, então vê o último estado e "Atualizado há X min".
- **C5** Dado o motoboy sem sinal ao entregar, então o ENTREGUE chega com a hora do aparelho e o rastreio fecha sem erro.
- **C6** Dado nunca extrapolar a posição, então nenhuma tela inventa deslocamento (teste de interface).

### WB-395 Privacidade e retenção do rastreio — Must — dep: WB-387
Como cliente e como motoboy, quero que a posição só seja vista por quem deve e por pouco tempo, para a minha segurança.
- **C1** Dado o pedido A, quando o cliente B pede o rastreio de A, então 404.
- **C2** (C-RT-03) Dado o pedido ENTREGUE (ou que deixou de ser a próxima parada), quando o cliente pede o rastreio, então 410 "Entrega concluída", o socket sai da sala (`socketsLeave('track:{id}')`) e há 0 eventos de posição nos 10 segundos seguintes.
- **C3** Dado a resposta de rastreio, então não traz telefone, foto, sobrenome, placa, velocidade, trilha nem dados de outro pedido (teste de contrato).
- **C4** Dado pontos com mais de 7 dias, então foram apagados e a corrida guarda só a distância total e o ponto e a hora da entrega (job testado).
- **C5** (C-RT-04) Dado o ticket de tempo real (60 s, uso único), então a reutilização é recusada (DEC-045).
- **C6** Dado a exclusão da conta do cliente, então o rastreio de pedido ativo encerra e nenhum ponto fica ligado ao cliente.
- **C7** Dado consulta do admin ao histórico de pontos, então exige motivo e grava auditoria (SEC-144).
- **C8** Dado Data Safety e App Privacy do app do cliente, então não declaram localização em segundo plano (o app do cliente não coleta posição).
- **C9** (C-RT-06) Dado a revisão do contrato, então não existe link público de rastreio nem trilha; o mapa existe só entre a saída confirmada e o fim; o motoboy não vê a posição do cliente e a do cliente não é coletada; o sinal "mesmo cliente com muitos pedidos ao mesmo motoboy" é registrado para a operação (risco residual de perseguição aceito como baixo).
- **C10** (C-RT-08) Dado o job de retenção, então apaga ponto com mais de 7 dias e mantém só a distância total e o ponto e a hora da entrega.

### WB-396 Notificações do fluxo de saída e entrega — Must — dep: WB-390, WB-191, WB-192
Como cada ator, quero ser avisado do que me cabe na hora certa, para agir sem abrir o painel o tempo todo.
- **C1** Dado MOTOBOY_NA_LOJA, então a loja recebe aviso no painel com som em até 5 s e o lembrete aos 3 minutos; **não** há e-mail desse evento.
- **C2** Dado saída confirmada, então o cliente recebe 1 push "Seu pedido saiu para entrega. Acompanhe no mapa" que abre o mapa; mudanças em menos de 30 s agrupam na última (deduplicação).
- **C3** Dado ETA <= 3 min ou 300 m, então o cliente recebe 1 push "O motoboy está chegando" por entrega, sem o código.
- **C4** Dado saída confirmada automaticamente, então a loja vê o aviso e recebe o e-mail de resumo, sem urgência.
- **C5** Dado OK pendente há 10 minutos, então o admin vê alerta com som no painel.
- **C6** Dado ENTREGUE, então o cliente recebe push "Pedido entregue às HH:MM" e a avaliação 1 hora depois (existente).
- **C7** Dado o cliente com push desligado no sistema, então o estado aparece em tela ao abrir o app e o e-mail só nos eventos críticos já definidos.
- **C8** (C-NOT-02) Dado o texto de todo push, então tem até 60 caracteres no título e 120 no corpo, sem emoji, sem endereço, nome completo, itens, valores nem código de entrega, nem nome do motoboy (teste de snapshot de todos os templates).
- **C9** Dado falha de entrega de push, então registra e não reenvia em loop.
- **C10** (C-NOT-01, SEC-196) Dado o envio pela API do Expo sem token, então é recusado (segurança avançada de push ligada no projeto); dado o boot de produção sem `EXPO_ACCESS_TOKEN`, então falha (a validação do env derruba o boot).
- **C11** (C-NOT-03) Dado o payload `data`, então só traz `type` e `orderId`; o app abre rota interna de uma lista fechada e **relê o estado na API**; push com `url: https://x` é ignorado.
- **C12** (C-NOT-04) Dado o reenvio do mesmo evento, então 1 push (deduplicação por evento e pedido, mais janela de 30 s por pedido), com 1 "saiu" e 1 "chegando" por entrega; push antigo abre o estado atual.

### WB-397 Web Push do painel do lojista — Should — dep: WB-396 (reabre WB-192 C2, cortado na DEC-071)
Como lojista, quero ser avisado com o painel fechado ou no celular, para não deixar o motoboy esperando nem perder pedido.
- **C1** Dado o lojista que ativa avisos no navegador, então recebe push de novo pedido, motoboy chegou e lembrete de saída, sem dados do cliente.
- **C2** Dado Android com Chrome, então funciona com a aba fechada; dado iPhone, então só com o painel adicionado à tela inicial (o texto explica).
- **C3** Dado a permissão pedida, então só depois de toque do lojista, nunca na abertura.
- **C4** Dado desligar nas preferências, então o alerta sonoro do painel e o e-mail de pedido novo nunca desligam (DEC-074a).
- **C5** Dado a chave do servidor de push, então vem do `.env` (nenhum serviço pago).
- **C6** Dado a decisão de ligar na produção, então depende do teste em aparelho real e do inventário de privacidade.
- **C7** (C-NOT-05) Dado o endpoint informado pelo navegador, então só é aceito em HTTPS de serviços conhecidos (FCM, Mozilla, Apple, Microsoft), sem seguir redirecionamento e com timeout; endpoint `http://169.254.169.254/` ou de host interno retorna 422 **sem** chamada; a chave VAPID privada fica só no `.env`.
- **C8** (C-NOT-05) Dado a inscrição de Web Push, então fica ligada a membro e loja e é apagada ao remover o membro, trocar a senha ou sair; o texto do push não traz dado do cliente.

### WB-398 Métricas do fluxo de saída e do rastreio — Should — dep: WB-391
Como fundador, quero medir onde o fluxo trava, para ajustar prazos e decidir o que automatizar.
- **C1** Dado o admin, então vejo a mediana e o p90 do tempo entre "Cheguei à loja" e a saída, por loja.
- **C2** Dado o mesmo relatório, então mostra o % de saídas por `loja`, `sistema` e `admin`, e as contestações.
- **C3** Dado o rastreio, então mostra % de entregas com mapa, % de tempo sem sinal e o erro mediano do ETA.
- **C4** Dado o painel de gráficos (WB-356), então essas métricas existem como itens do catálogo.
- **C5** Dado loja com 5 ou menos saídas no período, então o número aparece com a nota "poucos dados".

### WB-399 Encerrar o rastreio e fechar a entrega — Must — dep: WB-386, WB-392
Como cliente, quero que o mapa saia da tela ao receber, para não ser seguido depois.
- **C1** (C-RT-03) Dado ENTREGUE (app ou operação), então o app do cliente fecha o mapa em até 10 s e mostra "Entregue às HH:MM" com o link discreto "Avaliar" (sem estrelas abertas); o convite de 1 hora só sai se o pedido ainda não foi avaliado; avalia-se loja e pedido, nunca o motoboy; a rota REST de rastreio responde 410.
- **C2** Dado NAO_ENTREGUE, então o mapa fecha, aparece o motivo e "Combinar nova tentativa" (WB-235 C6).
- **C3** Dado o app fechado durante a entrega, então ao abrir o pedido vê o estado final, sem mapa.
- **C4** Dado "não recebi" depois de ENTREGUE, então a operação vê as horas, o ponto de GPS da entrega e se houve código (evidência), sem dar ao cliente o histórico do motoboy.
- **C5** Dado reentrega, então um novo SAIU abre novo rastreio e o anterior segue encerrado.

## Eventos de analytics (servidor)
`pickup_arrived` (store_id, source), `pickup_confirmed` (source: loja, sistema, admin; wait_s), `pickup_confirmation_contested`, `tracking_started`, `tracking_viewed` (seconds), `tracking_stale` (seconds), `eta_live_late_warning`, `delivery_completed` (source, on_time, delivered_far), `push_sent` (type). Sem posição, sem nome, sem endereço.

## Dependências e riscos
| Item | Tratamento |
|---|---|
| App do motoboy e GPS em segundo plano (PRD despacho) | O rastreio só existe com ele; sem app, linha do tempo |
| Parecer jurídico sobre motoboy e LGPD do GPS (J8, J26) | Bloqueia produção |
| Lojista esquece o OK | Lembrete, confirmação automática, alerta ao admin; medir % |
| Confirmação automática enfraquece a custódia | Contestação em 10 min; % medido; opção estrita (F12) |
| Rastreio expõe o motoboy | RN-R1, RN-R2, retenção de 7 dias, sem telefone |
| Rastreio em lote expõe trajeto a terceiros | Mapa só na próxima parada (F13) |
| Push não chega (Android com economia de bateria, iOS sem permissão) | Estado em tela; e-mail nos críticos; teste em aparelho real (T1) |
| Web Push no iPhone só com tela inicial | Texto explicativo; alerta sonoro do painel segue |
| Posição falsificada pelo motoboy | Registro da divergência endereço x posição; código de entrega |
| ETA ao vivo parecer promessa nova | Faixa prometida fixa e visível; "por volta de" |
| Propaganda "rastreio ao vivo" antes de medir | Nada de copy externa até o piloto confirmar o funcionamento (DEC-054) |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Geocerca e tempo de confirmação automática (100 m, 150 m, 5 min) fazem sentido na rua real? | Fundador (F12) e teste no piloto |
| Confirmação estrita (sem automática) ou automática? | Fundador (F12) |
| ~~Texto "Você é o 2º"~~ **Resolvida:** RN-R10 c (com horário); o designer testa a leitura com 5 pessoas | PO |
| A janela do Wake Lock não é necessária no app nativo; o iPhone do cliente precisa de algo? | mobile-dev |
| Onde guardar o ponto bruto (tabela particionada por dia) e o job de expurgo | backend-dev, tech-lead |
| ~~Hora do aparelho do motoboy: validação contra relógio errado~~ **Resolvida:** WB-391 C5 (C-MOT-08) | PO |
| Copy "Acompanhe no mapa" e do aviso de privacidade ao motoboy | designer, PO |
| Código visível na tela durante o rastreio (RN-R10 d) e reentrega com código novo | Security, backend-dev |
| ~~Avaliação imediata x convite de 1 h; nome do motoboy; push "a caminho da loja"; "Ainda estou separando"; "Saiu" sem chegada; vários pedidos com 1 toque~~ **Resolvidas** (RN-R10, WB-390 C9 a C12; `v1-1-respostas-ao-time.md` §A e §E) | PO |
