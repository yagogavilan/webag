# PRD v1.1: Despacho, rota e app do motoboy

Status: pronta para sprint (lado do PO; flags desligadas; liga só com J8 e J26; ver `backlog.md` §10.7) | Dono: product-owner | Data: 2026-11-22 | Atualizado: 2026-11-22 (DoR: controles C-MOT-*, DEC-103 D-05, DEC-110 e DEC-111); **2026-11-23 (DoR da R3: RN-D13 a RN-D15, WB-380 C1 e C6, WB-381 C12, WB-382 C7 e C8; WB-388 C2 passa à WB-391 C21; ver `backlog.md` §10.9)** | Histórias: WB-380 a WB-389
**Escopo por release.** **R3 (sem app, sem GPS):** WB-380, 381, 382 e a operação despachando por WhatsApp (modo operação, RN-D13). **R4 (app, GPS, J8 e J26):** WB-383 a 389. Onde um critério abaixo cita app, GPS ou "motoboy em corrida" com posição, ele **só vale na R4**.
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

**RN-D6 Código de entrega.** Com a flag ligada (padrão, DEC-039d), "Entreguei" exige o código de 4 dígitos informado pelo cliente; 3 erros bloqueiam e acionam a operação. Sem código: "Não consegui entregar" com motivo (RN-18). O app **nunca recebe o código** (C-MOT-07); só o servidor confere, com checagem e contagem atômicas.

**RN-D6a Código sem sinal e prova da entrega (DEC-110).** (1) Sem sinal, o app guarda até 3 digitações em "Entrega a conferir" e **não** marca ENTREGUE; o cliente continua vendo "saiu para entrega". (2) Ao voltar a rede, o servidor confere: certo = ENTREGUE com `prova = codigo` (a hora do aparelho só vale pelas condições da C-MOT-08); errado = conta nas 3 tentativas, e ao esgotar bloqueia como na RN-D6. (3) Sem conferência em 20 min do toque: alerta à operação. (4) O pedido **nunca** vira ENTREGUE sem código conferido pelo servidor, exceto por fechamento da operação (`prova = operacao`, com motivo, por exemplo "cliente confirmou por WhatsApp") ou pela auto-conclusão de 24 h (`prova = automatica`, RN-07). (5) Na disputa "não recebi", `codigo` é prova forte; `operacao` e `automatica` são prova fraca (o estorno segue a RN-07); o % de entregas sem `codigo` é métrica (WB-398). (6) **Cliente ausente:** o motivo só fica disponível 10 minutos após "Cheguei ao cliente" (`cliente_ausente_espera_min`) e com 1 toque em "Ligar"; os demais motivos (endereço, segurança) não têm espera `[HIPÓTESE]`.

**RN-D7 Privacidade do motoboy.** GPS só com corrida aceita e termina ao ENTREGUE, NAO_ENTREGUE final ou cancelamento; nunca em disponibilidade sem corrida; o motoboy vê "Localização ativa: corrida 1042" e o histórico dos próprios pontos; retenção do ponto bruto **7 dias** (`gps_retencao_dias`, F14); sem uso para ranking, nota ou desconto; acesso do admin ao histórico só em disputa, com auditoria. Aviso e aceite no 1º acesso (J26).

**RN-D11 Lote e atribuição (DEC-111).** **1 lote = 1 motoboy.** "1 ou 2 motoboys" descreve a equipe da operação, não a divisão de um lote: para usar os dois, a operação gera dois lotes em sequência. Cada motoboy tem no máximo 1 rota ativa e 1 oferta pendente. Dividir lote automático volta com o gatilho de 3 motoboys, 15 entregas por hora (DEC-096) ou operação acima de 90 s por lote. **Reatribuição de lote parcial:** só paradas **sem "Peguei o pedido"** (ainda na loja) podem ir a outro motoboy ou voltar à fila; parada com "Peguei" ou já SAIU não reatribui: "Marcar problema" leva ao fluxo NAO_ENTREGUE ou DEVOLVIDA_A_LOJA (RN-18), com motivo e auditoria. **Alertas de prazo:** os da RN-18 ("Em risco" a `entrega_faixa_min` do fim da faixa; "Atrasada" ao passar do fim); não há limiar novo.

**RN-D12 O que a operação enxerga do motoboy fora da corrida (DEC-111; a RN-D7 vence a WB-380 C1).** Nenhuma coleta de GPS em "Disponível". A lista mostra estado (Disponível, Em corrida, Sem sinal, Offline), "disponível há N min" e "última entrega concluída: bairro e hora" (dado da corrida já guardada, não é rastreio); o mapa só tem pino de motoboy **com corrida ativa**. A operação pode atribuir a motoboy "sem posição" (a tela avisa, não bloqueia). O perfil suporte vê só a posição atual de corrida ativa, sem histórico. O servidor descarta ponto enviado fora de corrida aceita (C-MOT-11). Revisar no gatilho de 3 motoboys. **Endereço sem ponto:** a operação não corrige endereço nem ponto; liga ao cliente; a parada fica fora do cálculo e na lista (gatilho de volta: > 5% dos pedidos sem ponto).

**RN-D13 Modo operação (R3, sem app) (2026-11-23).** Quem despacha é a **operação da Webag** (perfis Operação e Super admin, RN-13; Suporte só vê; Financeiro só lê). A operação gera o lote, **envia por WhatsApp** (link `wa.me` com o texto pronto; **não há envio automático de WhatsApp**, DEC-003) e **registra no painel, em nome do motoboy**, o que ele responder: "aceitou", "recusou" (com motivo), "chegou à loja", e depois "entregue" (com o código que o cliente informa). Cada registro grava fonte `admin`, ator e hora (RN-07). O estado do motoboy na lista é só **Disponível** (sem rota ativa) ou **Em corrida** (com rota ativa); "Sem sinal" e "Offline" existem só com o app (R4). Não há posição de motoboy em nenhuma tela da R3 (RN-D7, RN-D12). Parâmetros: `courier_accept_timeout_min` (3).

**RN-D14 Motoboy não aceita ou some (2026-11-23).**

| Situação | O que acontece (R3; na R4 o app faz o registro) | Quem decide |
|---|---|---|
| **Recusa** | Operação registra "recusou" + motivo (Sem moto, Longe, Outro). O **lote inteiro** volta a PRONTA_PARA_COLETA **na mesma posição da fila** (o prazo restante e os alertas de 10 e 20 min contam do "pronto", **nunca reiniciam**). Nenhuma nota, contagem exibida ou penalidade ao motoboy (RN-D7, J8); a operação pode oferecer a outro | Operação |
| **Sem resposta em 3 min** | Mesma volta à fila, com alerta "Sem resposta do Carlos em 3 minutos. A rota voltou para a fila." O 3 vale para o WhatsApp e para o app; a operação pode subir o parâmetro (para 5, por exemplo) se as expirações forem frequentes (`courier_offer_expired`, `[HIPÓTESE]` sem dado do piloto) | Operação |
| **Aceitou e não chega** (sem "chegou" nem saída) | Alerta à operação em `motoboy_a_caminho_alerta_min` = 20 `[HIPÓTESE]` contados do aceite (R3, sem GPS); na R4 vira "ETA da loja + 10 min". Sem mudança de estado; a operação liga e, se preciso, **reatribui** com motivo "Motoboy sem resposta" | Operação |
| **Sumiu depois de pegar** (saída registrada) | **Não reatribui** (RN-D11): a operação usa "Marcar problema" (NAO_ENTREGUE ou DEVOLVIDA_A_LOJA, RN-18, com motivo). O cliente recebe a mensagem de não entregue e a regra de estorno (RN-08). Quem arca com a mercadoria **não está definido**: pergunta F-R3-2 ao fundador | Operação; fundador |
| **Corrida cancelada com motoboy a caminho** | Operação cancela; a tela mostra "Avise o Carlos: pedido #1042 cancelado, não precisa ir à loja" com botão de WhatsApp (R3); push no app (R4) | Operação |
| **Aceite parcial** | Não existe: **oferta tudo ou nada** (RN-D11). Tirar 1 corrida: antes de enviar, ou "Reatribuir" antes da saída registrada | Operação |
| **Aceite e expiração no mesmo instante, ou dois registros da operação** | Vale a primeira transição; a segunda recebe 409 e a tela mostra o estado atual | Sistema |

**RN-D15 A rota é sugestão e o texto diz isso (J8, 2026-11-23).** A mensagem ao motoboy abre com "Sugestão de ordem" e traz paradas, links e dados de RN-18; **não traz horário-limite por parada, valor da corrida nem a faixa prometida ao cliente**. O horário previsto por parada existe só na tela da operação. O motoboy pode recusar ou seguir outra ordem, sem registro de "descumprimento". Pedir ao advogado que o J8 cubra explicitamente "rota sugerida por WhatsApp pela operação" (não só o app).

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
- **C1** Dado corridas prontas, então o mapa mostra a loja e o destino (pino) de cada uma com o prazo restante, e o motoboy **em corrida ativa** com a última posição e a hora dela; motoboy "Disponível" aparece só na lista, com "disponível há N min" e "última entrega: bairro e hora" (RN-D12; a RN-D7 vence).
- **C2** Dado o mapa, então a atribuição também funciona pela lista (o mapa não é obrigatório).
- **C3** Dado o mapa sem rede de tiles, então a lista segue funcionando com a mensagem "Mapa indisponível".
- **C4** Dado o mapa, então mostra "© OpenStreetMap" e carrega tiles do armazenamento do próprio projeto (nenhuma requisição aos servidores da fundação OSM, teste de rede).
- **C5** Dado destino dentro do raio, então o pino usa o ponto do endereço confirmado (ADR-015); sem ponto, o destino aparece "sem posição" e não entra no cálculo de rota.
- **C6** (R3, 2026-11-23) Dado a R3 (sem app), então o mapa mostra lojas, destinos e a rota proposta, **sem nenhum pino de motoboy** e sem "última posição" (a segunda metade do C1 só vale na R4); o cartão do motoboy mostra "Disponível" ou "Em corrida" (RN-D13).
- **C7** Dado nenhuma corrida pronta, então o mapa mostra o estado vazio "Nenhum pedido pronto agora" (texto do spec) e a lista idem; dado erro de carga, "Não conseguimos carregar agora" com "Tentar de novo".

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
- **C10** (C-MOT-14) Dado a geração da rota, então o servidor a monta só a partir de ids de corridas, validando cidade e capacidade; corrida de outra cidade enviada pela API retorna 422; a reordenação é auditada.
- **C11** (RN-D11) Dado a atribuição, então cada lote vai a 1 motoboy; motoboy com rota ativa e 1 oferta pendente não recebe outra ("Carlos já tem uma rota ativa"); para usar 2 motoboys a operação gera 2 lotes.
- **C12** (R3, RN-D13) Dado a rota confirmada, então as corridas vão a AGUARDANDO_MOTOBOY e a tela mostra os botões "Carlos aceitou" e "Carlos recusou" (motivo obrigatório: Sem moto, Longe, Outro) e a contagem de 3 minutos; o comportamento de cada resposta é o da WB-391 C16 a C19.
- **C13** (R3) Dado o lote de 3 corridas e uma 2ª seleção de 2 corridas logo depois para o Rafael, então a operação gera o 2º lote sem refazer o 1º (cada lote <= 90 s); não existe "dividir a seleção" em uma só tela (DEC-111).
- **C14** (R3) Dado o perfil Suporte ou Financeiro, então vê fila, mapa e histórico **sem** botão de atribuir, aceitar, recusar ou reordenar (403 se chamar a API).

### WB-382 Rota por link: abrir no Maps ou Waze — Must — dep: WB-381, WB-232
Como motoboy sem o app, quero abrir cada parada no meu aplicativo de mapa, para navegar sem digitar endereço.
- **C1** Dado a rota confirmada, então a mensagem de WhatsApp lista as paradas na ordem, cada uma com link que abre o destino no Maps ou no Waze.
- **C2** Dado o link, então traz só coordenadas ou endereço da parada (sem nome completo do cliente nem telefone no próprio link).
- **C3** Dado parada de entrega, então a mensagem traz o primeiro nome do cliente e a observação (RN-18 "Dados").
- **C4** Dado iPhone e Android, então os links abrem o app de mapa do aparelho (teste manual em aparelho; limite de paradas por link: pergunta L6).
- **C5** Dado o app do motoboy instalado, então a mensagem também chega por push e a de WhatsApp só em contingência.
- **C6** (C-MOT-13) Dado o gerador de link do Maps e do Waze, então um teste garante que a URL leva só coordenadas ou o endereço da parada, sem nome nem telefone do cliente (o histórico do Google não recebe dado pessoal).
- **C7** (RN-D15, J8) Dado a mensagem de WhatsApp da rota, então abre com "Sugestão de ordem" e **não** traz horário-limite por parada, valor da corrida, faixa prometida, código de entrega, CPF, e-mail nem itens (teste de snapshot do template).
- **C8** (R3) Dado a rota com 1 a 4 corridas, então a mensagem cabe em um único `wa.me` (limite de caracteres do link: o mobile-dev confirma na L6; acima do limite, a tela oferece "Copiar mensagem"); dado corrida cancelada depois do envio, então a tela oferece o texto "Pedido #1042 cancelado, não precisa ir à loja" para o mesmo motoboy.

### WB-383 Cadastro e convite do motoboy — Must — dep: WB-231, parecer J8 e J26
Como operação, quero convidar o motoboy, para ele entrar no app sem senha compartilhada.
- **C1** Dado o cadastro do motoboy (nome, WhatsApp), quando toco "Convidar", então ele recebe um link de uso único (validade 48 h) para instalar e entrar.
- **C2** Dado o 1º acesso, então o aviso de GPS aparece (o que coleta, quando, retenção de 7 dias, quem vê) e exige "Li e aceito"; o aceite é gravado com versão e hora.
- **C3** Dado o link reutilizado ou vencido, então "Convite inválido" e nada acontece.
- **C4** Dado "Revogar acesso" pelo admin, então a sessão do aparelho cai em até 1 minuto.
- **C5** Dado motoboy desativado, então não recebe corrida.
- **C6** Dado o cadastro, então não há CPF nem documento no sistema nesta fase (decisão do parecer J8).
- **C7** (C-MOT-01, DEC-103 D-05) Dado o resgate do convite, então o app gera um id de aparelho no SecureStore e a sessão fica presa a ele; um **aparelho novo** do mesmo motoboy fica "pendente" e não recebe corrida até a operação aprová-lo no painel (que mostra modelo e hora); 1 aparelho ativo por motoboy.
- **C8** (C-MOT-01) Dado o token do convite, então tem 128 bits ou mais por CSPRNG, é guardado só como hash, tem uso único atômico (`UPDATE ... WHERE used_at IS NULL`) e validade de 48 h; link reutilizado ou vencido: "Convite inválido".
- **C9** (C-MOT-04) Dado "Revogar acesso", então a próxima chamada do aparelho recebe 401 em até 1 minuto, o socket é derrubado (`disconnectSession`) e o app apaga rota, fila e cache locais.

### WB-384 App: ver, aceitar e recusar corridas — Must — dep: WB-383, WB-381
Como motoboy, quero ver minhas corridas e aceitar, para trabalhar sem mensagens soltas.
- **C1** Dado rota atribuída, então recebo push com som e vejo "Nova rota: 3 entregas", com ganhos não exibidos.
- **C2** Dado a oferta, quando toco "Aceitar", então as corridas viram MOTOBOY_A_CAMINHO e a operação vê o aceite em tempo real.
- **C3** Dado "Recusar" ou 3 minutos sem resposta, então a rota volta à fila e a operação é alertada, sem penalidade.
- **C4** Dado nenhuma corrida, então a tela mostra "Sem corridas agora" e o estado "Disponível" ou "Offline".
- **C5** Dado sem internet, então vejo a última rota salva e "Sem conexão".
- **C6** Dado corrida cancelada pela operação com o motoboy a caminho, então o app avisa na hora e some da lista.
- **C7** (C-MOT-02) Dado os papéis, então o motoboy usa o papel `courier` com audiência própria no token; `/v1/courier/*` só serve motoboy ativo (lido do banco); motoboy não acessa rota de cliente, lojista ou admin e o inverso (teste de matriz com os 4 papéis).

### WB-385 Instalar e atualizar o app (APK Android) — Must — dep: parecer J8 e J26, F10
Como operação, quero distribuir o app por link, para não pagar loja de aplicativos.
- **C1** Dado a página de instalação, então traz o APK, instruções com imagens para liberar "instalar de fonte desconhecida" e o aviso sobre o Play Protect.
- **C2** Dado o APK, então é assinado com a chave do projeto e tem número de versão; a página mostra a versão atual e o hash.
- **C3** Dado versão mínima exigida, então app mais velho mostra "Atualize para continuar" e não recebe corrida.
- **C4** Dado iPhone, então a página explica que o app é só Android e o motoboy iOS segue no modo WhatsApp.
- **C5** Dado o link, então só abre com o convite (não é público).
- **C6** Dado nova versão, então o motoboy atualiza por novo APK ou por atualização do código (OTA, quando permitido) sem perder a fila local.
- **C7** (C-MOT-06) Dado a chave de assinatura do APK, então fica em credencial gerenciada do EAS ou no cofre do fundador, com backup offline, **nunca no repositório**; a página mostra versão, SHA-256 do APK e a impressão digital do certificado.
- **C8** (C-MOT-06) Dado o download, então só com convite, por link assinado de até 1 hora (sem convite: 404); versão abaixo da mínima recebe 426 da API (cabeçalho de versão); APK assinado com outra chave não atualiza o instalado; não há tráfego em texto claro.

### WB-386 App: etapas e botões de coleta e entrega — Must — dep: WB-384, WB-391
Como motoboy, quero marcar cada etapa com um toque, para a loja, o cliente e a operação saberem onde estou.
- **C1** Dado a parada da loja, quando toco "Cheguei à loja" (ou o aparelho está a até 100 m), então o estado vira MOTOBOY_NA_LOJA e a loja é avisada (PRD rastreio).
- **C2** Dado "Peguei o pedido", então registra a hora e aguarda o OK da loja; a tela diz "Aguardando a loja confirmar".
- **C3** Dado o OK da loja, então a tela mostra a próxima parada e o botão "Navegar".
- **C4** Dado "Cheguei ao cliente", então registra a hora; se a posição estiver a mais de 300 m do endereço, mostra aviso "Você está longe do endereço" e permite seguir (a divergência é registrada).
- **C5** Dado "Entreguei" com o código de 4 dígitos correto, então ENTREGUE com `deliveredAt` do aparelho e a próxima parada.
- **C6** (C-MOT-07, SEC-193) Dado código errado 3 vezes, então bloqueia e o botão "Chamar a operação" abre o WhatsApp da Webag. A checagem e a contagem são atômicas, sob trava da corrida; o limite é 3 (parâmetro; o código de hoje usa 5); 50 tentativas paralelas com códigos diferentes avaliam no máximo 3 e as demais recebem 429 `DELIVERY_CODE_LOCKED`; o app nunca recebe o código (a resposta da rota do motoboy não traz `deliveryCode`).
- **C7** Dado "Não consegui entregar", então escolho o motivo (RN-18) e vira NAO_ENTREGUE.
- **C8** Dado duplo toque em qualquer botão, então a etapa é registrada uma vez (idempotência).
- **C9** Dado etapa fora de ordem (ex.: "Entreguei" antes de "Peguei"), então o botão não aparece.
- **C10** (RN-D6a) Dado "Entreguei" sem sinal, então o app guarda o código digitado (até 3 tentativas) em "Entrega a conferir" e **não** marca ENTREGUE; ao voltar a rede o servidor confere (certo: ENTREGUE com `prova = codigo`; errado: conta nas 3 tentativas); sem conferência em 20 minutos do toque, a operação é alertada; o texto na tela é "Sem sinal. Guardamos o código e conferimos quando a rede voltar."
- **C11** (C-MOT-03) Dado motoboy B agindo na corrida de A, então 404; toda ação e todo ponto exigem `courier_id = :me` e estado compatível, sob trava.
- **C12** (C-MOT-05, RN-D8) Dado o fim da entrega ou sair do app, então endereço, observação e telefone do cliente são apagados do aparelho; o telefone **nunca** é persistido (o app o pede ao servidor no toque em "Ligar"); `android:allowBackup=false` (inspeção do armazenamento após a entrega).
- **C13** (C-MOT-09) Dado ponto "suspeito" (`mocked`, velocidade acima de 150 km/h, salto acima de 1 km em 10 s ou precisão pior que 100 m), então não dispara "Cheguei" automático, não serve de evidência e a operação é alertada.
- **C14** (RN-D6a) Dado "Não consegui entregar: Cliente ausente", quando passaram menos de 10 minutos desde "Cheguei ao cliente" ou não houve toque em "Ligar", então o motivo fica indisponível com "Aguarde 10 minutos e tente ligar"; os demais motivos não têm espera.
- **C15** Dado "A loja confirmou a saída" sem o motoboy ter marcado "Peguei" (WB-390 C10), então a tela mostra "Não peguei este pedido", que chama a operação.

### WB-387 App: GPS só na corrida, em segundo plano e sem sinal — Must — dep: WB-384
Como motoboy, quero que o app rastreie só enquanto trabalho e não perca dado sem sinal, para não gastar bateria nem dado à toa.
- **C1** Dado corrida aceita, então o app inicia o serviço de localização com notificação fixa "Webag Entregas: corrida em andamento", e a localização continua com o Waze em primeiro plano.
- **C2** Dado fim da corrida, então o serviço de localização encerra na hora e a notificação some.
- **C3** Dado motoboy "Disponível" sem corrida, então o app não coleta localização.
- **C4** (C-MOT-08) Dado sem sinal, então ações e pontos ficam numa fila local com a hora do aparelho e sobem na ordem ao voltar a rede; o servidor só aceita a hora do aparelho se estiver entre a confirmação de saída **registrada no servidor** e o recebimento, não passar de 60 minutos antes do recebimento e, se diferir do recebimento em mais de 2 minutos, vier marcada como fila offline com pontos que a expliquem; caso contrário vale a hora do servidor e a divergência é registrada (`deliveredAt` anterior à saída: hora do servidor; recuo de 40 minutos sem fila offline: hora do servidor).
- **C5** Dado intervalo de pontos, então segue a RN do rastreio (8 a 10 s em movimento, 30 s parado) e a precisão cai quando parado.
- **C6** Dado permissão de localização negada ou GPS desligado, então a corrida não pode ser aceita e o app explica como ligar.
- **C7** Dado 1 hora de corrida em Android de entrada, então a bateria consome <= 12% (teste de QA em aparelho real).
- **C8** Dado o app fechado à força pelo sistema, então a operação vê "sem sinal" e o app, ao reabrir, retoma sem pedir de novo o aceite.
- **C9** (C-MOT-11) Dado o envio de pontos em lote (até 500, sem duplicata por motoboy e hora), então o servidor descarta ponto fora de corrida aceita (motoboy "Disponível": descartado e contado), rejeita hora futura ou mais antiga que 8 h e limita as requisições.

### WB-388 Admin: motoboys ao vivo, sem sinal e reatribuir — Should — dep: WB-380, WB-387
Como operação, quero ver quem está sem sinal e reatribuir, para não deixar cliente esperando.
- **C1** Dado motoboy sem ponto há mais de 3 minutos em corrida, então aparece "Sem sinal" no mapa e na lista e um alerta ao admin (RN-19 alerta de atraso segue valendo).
- **C2** (RN-D11) Dado "Reatribuir" com motivo, então a corrida volta a PRONTA_PARA_COLETA ou vai a outro motoboy, com auditoria, **só se ainda não houve "Peguei o pedido"**; com "Peguei" ou já SAIU, o botão vira "Marcar problema" (NAO_ENTREGUE ou DEVOLVIDA_A_LOJA, RN-18) com motivo. **A parte "Reatribuir antes da saída registrada" é entregue na R3 pela WB-391 C21** (sem "Peguei", a saída registrada é o marco); o "Peguei" do app entra na R4.
- **C3** Dado o histórico de uma corrida, então a operação vê a linha do tempo de etapas com hora e fonte (app, admin, automático).
- **C4** Dado perfil suporte, então vê a posição só de corrida ativa e sem histórico de pontos (C-MOT-12).
- **C5** (RN-D12) Dado motoboy "Disponível", então a lista mostra "disponível há N min" e "última entrega: bairro e hora", sem pino no mapa; "Atribuir" a motoboy sem posição mostra o aviso e segue.

### WB-389 Privacidade do motoboy — Must — dep: WB-383, WB-387
Como motoboy, quero saber e controlar o que o app coleta, para confiar nele.
- **C1** Dado a tela "Privacidade", então lista o que coleta (posição na corrida, etapas, hora), a finalidade, a retenção de 7 dias e o canal para pedir os dados.
- **C2** Dado "Meus dados", então vejo o histórico dos meus pontos das últimas corridas.
- **C3** Dado pontos com mais de 7 dias, então foram apagados (job) e a corrida mantém só distância total e o ponto de entrega com a hora.
- **C4** (C-MOT-12) Dado consulta do admin ao histórico de pontos, então só em disputa de entrega aberta, com motivo e registro em auditoria; admin sem disputa: 403; suporte só a posição atual de corrida ativa; sem exportação em massa; o job apaga o ponto de 8 dias e mantém distância e ponto da entrega.
- **C5** Dado o motoboy desativado, então os pontos seguem a retenção e o acesso ao app cai.
- **C6** Dado a mensagem do app, então diz "A localização não é usada para ranking, nota ou desconto" (escopada à localização) e nunca diz que há ranking, bônus ou punição ligados ao GPS (porque não há).
- **C7** (D-07, recomendação do PO; o designer decide) Dado aparelho sem bloqueio de tela, então o app avisa no 1º acesso e registra `device_unsecured`, sem bloquear a corrida na v1.1 `[HIPÓTESE]`.

## Eventos de analytics (servidor)
`route_generated` (stops, total_km, late_warnings), `route_sent` (channel: app, whatsapp), `courier_offer_accepted` (seconds), `courier_offer_declined` (reason, source: admin, app), `courier_offer_expired` (seconds), `route_reassigned` (reason), `courier_step` (step, source: app, admin), `courier_offline_flush` (points, delay_s), `courier_signal_lost` (seconds), `delivery_code_failed`. IDs opacos; sem nome nem endereço.

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
| ~~Convite de uso único e sessão ligada ao aparelho~~ **Resolvida:** WB-383 C7 a C9 (C-MOT-01, D-05) | Security confirma |
| Quem fornece o aparelho e o plano de dados do motoboy | Fundador (cotação de motoboys) |
| Motoboy deve ver o valor da corrida no app? PO: não na v1.1 (RN-D9), reavaliar no parecer J8 | Fundador |
| ~~Código sem sinal; "cliente ausente"; 1 ou 2 motoboys; reatribuir lote parcial; motoboy disponível sem posição~~ **Resolvidas** (RN-D6a, RN-D11, RN-D12; `v1-1-respostas-ao-time.md` §A) | PO |
| Bloqueio de tela no aparelho (D-07): avisar ou bloquear | designer |
