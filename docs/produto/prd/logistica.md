# PRD: Logística da Webag (entrega, motoboys e coleta de trocas)

Status: pronto para G3 (aguarda spec de tela do Designer e estimativa); **atualizado em 2026-11-19 pela DEC-053 (entrega em até 2 h), histórias novas WB-249, 255, 256 e 258 abaixo, e WB-250 a 254 em `cliente.md`** | Dono: product-owner | Data: 2026-11-19 | Histórias: WB-229 a WB-242, WB-249 a WB-258, WB-262 (DEC-064, hora real da entrega) (+ WB-057 e WB-069 reescritas); WB-241 C7 a C9 (DEC-062, coleta atrasada)
Decisões: DEC-036 (logística é da Webag; substitui DEC-007), DEC-035 (comissão), DEC-037 (coleta de troca na fila), **DEC-053 (promessa de entrega em até 2 h por distância)**. Regras numéricas: `docs/produto/regras-de-negocio.md` (RN-02, RN-04, RN-10, RN-18, **RN-19**). Fila do backend: `docs/gestao/fila-backend-dev.md` L.1 a L.5 e E.1, E.2. Hipóteses: `docs/decisoes.md` (HIP-L01 a HIP-L14, HIP-C01, **HIP-E01 a E10**).

## Problema
Quem sofre: o lojista do perfil do fundador (brief §9) não tem motoboy nem entrega; sem entrega ele só vende a quem passa na rua. Carla (cliente) só compra de loja que entrega e quer saber quando chega. Evidência: afirmação direta do fundador (brief §9); o contraponto é que a Shopee entrega no dia seguinte na Grande SP (`pesquisa-mercado.md` §4), então a vantagem local só existe se a entrega for **em horas**. Frequência: todo pedido de entrega. `[HIPÓTESE]` Proporção de pedidos de entrega vs. retirada: sem dado; medir no piloto.

## Objetivo e métrica de sucesso
Cada pedido pronto vira uma corrida despachada, acompanhada e fechada com custo registrado, por uma operação de 1 a 2 pessoas, sem app novo (DEC-036e).
| Métrica | Meta `[HIPÓTESE; sem série histórica]` |
|---|---|
| Pronto para coleta até motoboy atribuído (p90) | <= 10 min |
| Pedido pago até entregue (mediana; antes "pronto até entregue", DEC-053) | <= centro da faixa (estimativa), em média por loja |
| **Entregas no prazo prometido** (entregue <= fim da faixa reancorada no pagamento; DEC-053) | >= 85% |
| **Entregas dentro de 2 h do pagamento** (a promessa da copy) | >= 95% (HIP-E09) |
| Precisão da estimativa: mediana de \|entregue - centro da faixa\| | <= 10 min |
| Pedidos atrasados (passaram do fim da faixa + tolerância) | < 8% |
| Corridas em lote (de entregas, quando há 2+ prontas na mesma cidade) | acompanhar; sem meta (HIP-E07) |
| Entregas não realizadas | < 5% |
| Margem de logística = taxa de entrega cobrada - custo do motoboy (média por entrega) | >= R$ 0,00 (alerta se negativa por 7 dias) |
| Pedidos de entrega sem custo registrado após 48 h | 0 |

**Eventos:** `delivery_ready`, `delivery_assigned {seconds}`, `delivery_whatsapp_sent`, `delivery_status_changed {to}`, `delivery_failed {reason}`, `delivery_completed {minutes}`, `delivery_cost_recorded {cents}`, `delivery_paused {city}`, `delivery_fee_table_changed`. Sem dado pessoal nos eventos.

## Fora do escopo (1.0)
App ou página do motoboy (link com token) e rastreio em tempo real (fase 2, DEC-036e); despacho automático por proximidade; pagamento ao motoboy dentro do app (é fora, DEC-036c); roteirização automática de várias entregas por motoboy (a operação agrupa à mão, em lote por cidade, WB-256); agendamento de entrega e "entregar amanhã" (HIP-014; sem isso, a entrega só é oferecida dentro do horário, RN-19 item 2); ETA que reage à fila em tempo real, trânsito e rota real (RN-19 item 6); renegociar o horário com o cliente; entrega por transportadora/Correios; dinheiro ou maquininha na entrega (brief §4); seguro e gestão de frota; chat com o motoboy dentro do app (WhatsApp); cálculo de rota real (distância é linha reta, HIP-013).

## Usuários e cenários
1. **Seu Marcos (lojista)** aceita o pedido, separa e toca "Pronto para coleta". Pronto: não liga para motoboy, não define frete.
2. **Operadora (admin, perfil operação)** vê o alerta, abre a fila, escolhe o motoboy, toca "Enviar no WhatsApp", o motoboy responde "OK", ela marca "A caminho da loja", depois "Saiu para entrega" e "Entregue".
3. **Carla (cliente)** vê "Pronto, aguardando o motoboy", "Motoboy a caminho da loja", "Saiu para entrega", "Entregue", com push em cada etapa.
4. **Troca:** a coleta da troca por tamanho entra na mesma fila (corrida de coleta de troca); **a peça nova só sai depois que a antiga foi conferida pela loja** (DEC-038f), em uma segunda corrida de reentrega, salvo na troca feita na loja.
5. **Financeiro (Yago)** fecha a semana: quantas entregas, custo por motoboy, margem de logística, quanto pagar a cada motoboy (por PIX fora do app).

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-LOG-01 | Lojista marca "pronto para coleta" (fim do papel dele na entrega) | 229, 069 |
| RF-LOG-02 | Área Logística no admin: fila em tempo real, alerta, pausar entregas | 230 |
| RF-LOG-03 | Cadastro de motoboys | 231 |
| RF-LOG-04 | Atribuir motoboy e mensagem pronta de WhatsApp | 232 |
| RF-LOG-05 | Estados da entrega, linha do tempo e auditoria | 233 |
| RF-LOG-06 | Entrega não realizada: reentrega ou devolução à loja | 234 |
| RF-LOG-07 | Cliente acompanha e é avisado | 235 |
| RF-LOG-08 | Taxa de entrega por região e faixa; pedido mínimo e frete grátis globais | 236 |
| RF-LOG-09 | Checkout calcula a taxa e o split leva a taxa na `application_fee` | 237, 238 |
| RF-LOG-10 | Custo por entrega, histórico e pagamento ao motoboy (controle) | 239 |
| RF-LOG-11 | Relatórios de logística | 240 |
| RF-LOG-12 | Coleta e reentrega de troca na fila | 241 |
| RF-LOG-13 | Lojista configura só "entrega pela Webag" e/ou "retirada" | 057 |
| RF-LOG-14 | Comissão transparente para o lojista ("Você recebe R$ X") | 242 |
| RF-LOG-15 | Promessa de entrega em até 2 h: faixa por loja e endereço, teto, fora do alcance (DEC-053) | 249 a 252, 257, 258 |
| RF-LOG-16 | Atraso: alerta à operação, aviso e cancelamento sem custo ao cliente, compensação | 253, 254, 255 |
| RF-LOG-17 | Lote de corridas por área | 256 |

## Regras de negócio
Fonte única dos números e dos estados: **RN-18** (estados e parâmetros), **RN-04** (taxa, mínimo e grátis), **RN-10** (fórmulas de `application_fee`), **RN-07** (estado do pedido). Pontos-chave:
- **Papéis:** a loja prepara e marca "pronto para coleta"; a Webag despacha, acompanha e fecha. A loja **não** marca "saiu" nem "entregue" em entrega Webag; só em retirada (código de 4 dígitos, WB-069 C3).
- **Quem marca "Entregue":** o admin (operação), a partir do aviso do motoboy. Para o "entregue" não ser falso, o **código de entrega de 4 dígitos do cliente (WB-226) passa a proteger a Webag contra o motoboy**, não mais contra a loja; recomendo ligar por padrão para entrega Webag `[HIPÓTESE; flag]` e reavaliar WB-226 de Should para Must.
- **Taxa de entrega:** vem da tabela do admin por **cidade/bairro de destino** e **faixa de distância** em linha reta loja-endereço; é cobrada do cliente e é **receita da Webag** (entra na `application_fee`). O lojista não vê nem edita taxa e não tem raio próprio; vale o `raio_max_km` global.
- **Horário da logística:** entrega Webag só é oferecida quando a logística está aberta (`logistica_horario` por cidade) e não está pausada. Fora disso o checkout oferece só retirada e diz "Entrega volta às 09:00". É regra nova e necessária: uma operação de 1 pessoa não despacha 24 h (HIP-L10).
- **Pagamento ao motoboy fora do app (DEC-036c):** o sistema só registra o custo da corrida e gera o relatório "a pagar por motoboy"; o PIX ao motoboy é feito pelo financeiro fora do sistema. Nenhum valor em dinheiro é cobrado do cliente pelo motoboy na 1.0.
- **Valor a cobrar:** o campo existe na mensagem (DEC-036), mas na 1.0 é sempre "Pago no app. Não cobrar do cliente", porque dinheiro na entrega está fora do escopo.
- **Frete grátis e pedido mínimo (DEC-036b):** parâmetros globais do admin (padrão: mínimo R$ 20,00 e frete grátis desligado) `[HIPÓTESE]`. Frete grátis é **subsídio da Webag** (ela paga o motoboy sem receber a taxa); por isso nasce desligado e o relatório mostra o custo do subsídio.
- **Mensagem de WhatsApp (dados mínimos, LGPD):** link `wa.me` ao telefone do motoboy com texto pronto. Modelo (campos entre colchetes):

```
Webag - Entrega #[número]
COLETA: [loja], [rua, nº, bairro, cidade]. Contato da loja: [telefone]
ENTREGA: [rua, nº, complemento, bairro, cidade]. Cliente: [1º nome], [telefone]
Volumes: [n]. Obs.: [até 100 caracteres da loja]
Pagamento: pago no app. Não cobrar do cliente.
Ao entregar, peça o código de 4 dígitos ao cliente.
Responda OK para confirmar.
```
Nunca vão na mensagem: CPF, e-mail, itens e valores do pedido, o **código** de entrega, CEP completo além do necessário. Corrida de troca usa modelo próprio (WB-241). Quando o pedido tem "valor a cobrar" no futuro, a linha de pagamento muda; não na 1.0.
- **Dado do cliente e do motoboy:** o telefone do cliente só aparece ao operador em entrega ativa (mesma regra RN-14); a mensagem sai do aparelho do operador, então **o dado fica no WhatsApp da Webag e do motoboy fora do nosso controle** (risco LGPD, ver Dependências).
- **Motoboy é terceiro autônomo `[HIPÓTESE]`:** cadastro só com nome, telefone (WhatsApp), ativo e um aceite interno "documentos conferidos fora do app" com data (CNH categoria A há 2+ anos, 21+ anos, curso de motofrete, colete; Lei 12.009/2009, ver Riscos). Sem upload de documento e sem CPF no sistema (minimização).

## Requisitos não funcionais
- **Tempo real:** o alerta de pedido pronto chega ao painel do admin em <= 3 s (Socket.IO, com reconexão e polling de contingência, como WB-067) com som (ativar na 1ª interação) e faixa quando o som ou a conexão cair.
- **Operação:** a fila é usável no **celular** do operador (o fundador despacha andando) e no desktop; ação principal a 1 toque; fonte legível.
- **Auditoria:** toda atribuição, troca de motoboy, mudança de estado, custo e cancelamento grava ator, hora, motivo e valor anterior (append-only, WB-123). Falha ao gravar a auditoria cancela a ação.
- **Concorrência:** dois operadores atribuindo o mesmo pedido: vale o primeiro, o outro vê "Já atribuído a [motoboy] por [nome]".
- **Desempenho:** lista paginada, filtros no servidor; fila ativa com até 200 corridas sem lentidão perceptível.
- **Acessibilidade:** WCAG 2.2 AA; cor nunca é o único sinal (SLA vermelho tem ícone e texto "Atrasado").
- **LGPD:** finalidade = executar a entrega (art. 7º, V); dados do cliente visíveis ao operador só em entrega ativa e mascarados depois com "Revelar" auditado; histórico de entregas retido 5 anos como dado fiscal/financeiro `[validar com security]`.

## Histórias e critérios de aceite

### WB-229 Lojista marca "Pronto para coleta" — Must — dep: WB-068, WB-069
Como lojista, quero avisar que o pedido está pronto, para a Webag mandar o motoboy sem eu ligar para ninguém.
- **C1** Dado pedido de entrega ACEITO ou EM_SEPARACAO, então vejo o botão "Pronto para coleta"; em pedido de retirada o botão é "Pronto para retirada" (RN-07).
- **C2** Dado tocar, então informo (opcionais) número de volumes (padrão 1) e observação de até 100 caracteres ("tocar a campainha"), o pedido vira PRONTO_PARA_COLETA, a entrega nasce em PRONTA_PARA_COLETA (RN-18), o cliente é avisado (WB-235) e o admin é alertado (WB-230).
- **C3** Dado PRONTO_PARA_COLETA, então não vejo "Saiu para entrega" nem "Entregue"; vejo "Aguardando o motoboy da Webag" com o estado da entrega e o primeiro nome do motoboy quando houver.
- **C4** Dado toque duplo, então uma só entrega é criada (idempotência).
- **C5** Dado pedido cancelado pelo cliente ou pelo admin antes do toque, então o botão falha com "Pedido cancelado" e some.
- **C6** Dado o pedido PRONTO_PARA_COLETA e a loja precisar desfazer (marcou sem querer), então "Voltar para separação" é permitido **enquanto a entrega estiver em PRONTA_PARA_COLETA** (sem motoboy); com motoboy atribuído, só o admin desfaz (e avisa o motoboy).
- **C7** Dado funcionário sem a permissão "pedidos", então 403 no servidor.

### WB-230 Admin: área Logística, fila em tempo real e alerta — Must — dep: WB-229, WB-100
Como operadora, quero ver os pedidos a despachar e ser avisada na hora, para o cliente não esperar.
- **C1** Dado o menu do admin, então existe a página **Logística** (simples e separada) para operação e super admin; financeiro e suporte entram só para leitura (matriz de permissões em `admin.md`).
- **C2** Dado a fila, então listo corridas ativas ordenadas por tempo desde "pronto" (a mais antiga primeiro), com número do pedido, loja e bairro, bairro e cidade do destino, tipo (entrega, coleta de troca, reentrega de troca), volumes, taxa cobrada, estado, motoboy (se houver) e o contador de espera.
- **C3** Dado espera sem motoboy acima de `logistica_sla_atribuir_min` (10), então a linha fica amarela com o texto "Espera longa"; acima de `logistica_sla_atribuir_critico_min` (20), vermelha com "Atrasado" (ícone e texto, não só cor).
- **C4** Dado nova corrida PRONTA_PARA_COLETA, então o painel mostra a linha no topo em até 3 s com som repetido a cada 30 s até alguém atribuir, e a faixa de som/conexão de WB-067 C2; **além disso o admin (operação) recebe Web Push e e-mail**, para o aviso **não depender da aba aberta** (DEC-038c).
- **C5** Dado filtros, então filtro por cidade, loja, motoboy, estado e tipo; abas "Ativas" e "Concluídas hoje".
- **C6** Dado "Pausar entregas" (por cidade ou geral) com motivo e previsão, então o checkout deixa de oferecer entrega Webag naquela área até reabrir (as corridas já criadas seguem), e o admin vê o aviso "Entregas pausadas em [cidade]". Dado `logistica_horario` encerrado, a pausa é automática.
- **C7** Dado fila vazia, então "Nenhuma entrega para despachar" e a hora da última atualização.
- **C8** Dado queda de conexão, então reconecta e mostra "Sincronizado há X s".
- **C9** **(substituído pela DEC-053; ver WB-255)** O destaque por tempo em SAIU deixa de ser fixo em 60 min: vale o fim da faixa do pedido ("Em risco" e "Atrasada"). `logistica_alerta_entrega_min` só vale para corrida sem ETA (WB-108 C3 continua: pedido SAIU há mais de 4 h é "Atenção").
- **C10** Dado perfil sem permissão, então 403 no servidor.

### WB-231 Admin: cadastro de motoboys — Must — dep: WB-100
Como operadora, quero cadastrar os motoboys que atendem a Webag, para escolher quem leva cada corrida.
- **C1** Dado "Novo motoboy", então informo nome (até 60 caracteres), telefone/WhatsApp com máscara e validação, observação (até 100) e o aceite "Documentos conferidos fora do app" com a data; telefone duplicado entre ativos: erro "Esse telefone já está cadastrado".
- **C2** Dado a lista, então vejo nome, telefone, status (ativo/inativo), entregas nos últimos 7 dias e se está em corrida agora; busca por nome.
- **C3** Dado "Inativar", então ele sai da escolha de atribuição; histórico e custos permanecem. Dado inativar motoboy com corrida ativa, então o sistema pede "Reatribuir a corrida primeiro".
- **C4** Dado excluir, então **não existe** exclusão (só inativar), para preservar histórico e auditoria; anonimizar nome e telefone em 15 dias só a pedido do titular (LGPD, WB-215).
- **C5** Dado nenhum motoboy ativo, então a fila mostra o aviso "Cadastre um motoboy para despachar" e o botão de atribuir fica ausente (não desabilitado sem explicação, RN-17).
- **C6** Dado qualquer alteração, então auditoria com antes e depois.

### WB-232 Admin: atribuir motoboy e mensagem de WhatsApp — Must — dep: WB-230, WB-231
Como operadora, quero atribuir um motoboy e mandar os dados pelo WhatsApp com 2 toques, para despachar em segundos.
- **C1** Dado corrida PRONTA_PARA_COLETA, então "Atribuir" abre a lista de motoboys ativos (com quem está em corrida marcado) e ao escolher a corrida vira AGUARDANDO_MOTOBOY.
- **C2** Dado a atribuição, então o botão "Enviar no WhatsApp" abre `wa.me/<telefone do motoboy>` com o texto do modelo (regras acima) preenchido; o sistema registra `delivery_whatsapp_sent` e a hora. Sem WhatsApp instalado, abre a versão web; sem nenhuma, mostra o texto para copiar.
- **C3** Dado a resposta "OK" do motoboy, então "Motoboy confirmou" leva a MOTOBOY_A_CAMINHO; se o motoboy recusar, "Reatribuir" volta a PRONTA_PARA_COLETA com o motivo (recusou, sem resposta) e o contador de espera continua do **horário original de pronto**.
- **C4** Dado AGUARDANDO_MOTOBOY sem confirmação em 5 min `[HIPÓTESE]`, então a linha mostra "Sem resposta do motoboy" com "Reatribuir" em destaque.
- **C5** Dado a mensagem, então contém **só** os campos do modelo (sem CPF, e-mail, itens, valores nem o código de entrega) e informa "Pago no app. Não cobrar do cliente"; teste automatizado verifica ausência de campos proibidos.
- **C6** Dado endereço do cliente incompleto (sem número ou bairro), então o botão avisa "Endereço incompleto. Confirme com o cliente" e exige a ação "Já confirmei" antes de enviar.
- **C7** Dado atribuir um motoboy a mais de 1 corrida ao mesmo tempo, então permitido (a operação agrupa), com aviso "Já tem 2 corridas ativas".
- **C8** Dado dois operadores, então vale o primeiro (concorrência, RNF).

### WB-233 Admin: atualizar os estados da entrega — Must — dep: WB-232
Como operadora, quero registrar cada etapa, para o cliente e a loja saberem onde está o pedido.
- **C1** Dado a corrida, então só avanço pelas transições válidas de RN-18; "Saiu para entrega" exige que a loja não tenha desfeito o pronto; voltar um estado só por "Reatribuir" ou "Desfazer" com motivo e auditoria.
- **C2** Dado "Saiu para entrega" (motoboy pegou o pacote), então o pedido vira SAIU_PARA_ENTREGA e o cliente recebe o push (WB-235).
- **C3** Dado "Entregue", então, com `codigo_entrega` ligado, informo o código de 4 dígitos que o motoboy recebeu do cliente; código errado: "Código incorreto" (5 tentativas, depois super admin); sem a flag, só confirmo. O pedido vira ENTREGUE, abre avaliação e troca (RN-07) e inicia os prazos de RN-11.
- **C4** Dado "Não entregue", então exijo o motivo (cliente ausente, endereço não encontrado, cliente recusou, risco/segurança, outro com texto) e sigo WB-234.
- **C5** Dado cada transição, então grava ator, hora e motivo e notifica o cliente; a loja é notificada em coletado e entregue.
- **C6** Dado "Cancelar corrida" com motivo (pedido cancelado, loja desistiu), então a corrida vira CANCELADA e o motivo vai ao pedido; o custo eventual do deslocamento pode ser registrado (WB-239).
- **C7** Dado o padrão de auto-conclusão (`auto_conclusao_entrega_h`, 24 h `[HIPÓTESE]`; é o mesmo parâmetro que a DEC-038c chama de `entrega_auto_h`: o backend usa a chave existente), então corrida SAIU há 24 h sem fechamento gera alerta ao admin e, sem ação e sem "não recebi" do cliente, o pedido vira ENTREGUE (HIP-038), registrado como "fechado pelo sistema".

### WB-234 Entrega não realizada: reentrega ou devolução à loja — Must — dep: WB-233
Como operadora, quero tratar a falha de entrega, para o cliente não perder o dinheiro nem a loja o produto.
- **C1** Dado "Não entregue" com motivo, então o cliente é avisado na hora ("Não conseguimos entregar: cliente ausente") com a opção "Combinar nova tentativa" (WhatsApp com a Webag) e a corrida fica NAO_ENTREGUE.
- **C2** Dado nova tentativa combinada, então a corrida volta a SAIU_PARA_ENTREGA (reentrega); máximo `entrega_reentrega_max` (1) **sem custo ao cliente**: o custo da entrega frustrada e da 2ª viagem é da Webag na 1.0 (DEC-038d) e é registrado (WB-239).
- **C3** Dado a reentrega também falhar por culpa do cliente (**repetição**), então o cliente pode pedir **nova tentativa paga** (taxa de entrega da tabela, cobrança separada, DEC-038d `[HIPÓTESE]`); sem o pedido ou sem o pagamento em 24 h, "Devolver à loja": a corrida vira DEVOLVIDA_A_LOJA quando o motoboy entregar o pacote e a loja confirmar o recebimento; o pedido vira CANCELADO (ator admin, motivo) com **estorno total** (inclui a taxa de entrega e a comissão, RN-10) `[HIPÓTESE: reter a taxa nesse caso só após parecer jurídico]`.
- **C4** Dado o produto devolvido, então a loja marca "Recebi de volta" e o item volta ao estoque se estiver em condição de revenda (RN-06); sem a confirmação em 48 h, alerta ao admin.
- **C5** Dado falha por culpa da loja (endereço da loja errado, pedido não estava pronto), então o motivo "falha da loja" entra no índice de cancelamento da loja (RN-08) e o admin é alertado.
- **C6** Dado pedido não entregue há 24 h sem desfecho, então destaque "Atenção" no WB-108 e alerta no WB-198.

### WB-235 Cliente: acompanhar a entrega e receber avisos — Must — dep: WB-233, WB-027, WB-191
Como cliente, quero saber onde meu pedido está, para esperar em casa.
- **C1** Dado pedido de entrega, então a linha do tempo mostra: Recebido, Aceito, Em separação, **Pronto, aguardando o motoboy**, **Motoboy a caminho da loja**, **Saiu para entrega**, Entregue; etapa atual destacada com a hora de cada uma.
- **C2** Dado mudança de estado da entrega, então a tela atualiza em até 5 s e recebo push (PRONTO_PARA_COLETA: in-app sem push; MOTOBOY_A_CAMINHO: in-app; SAIU_PARA_ENTREGA e ENTREGUE: push; NAO_ENTREGUE: push e e-mail).
- **C3** Dado o motoboy atribuído, então vejo só o **primeiro nome** (sem telefone nem foto na 1.0); para dúvidas, "Falar com a Webag" por WhatsApp (conteúdo editável WB-034).
- **C4** **(DEC-053; detalhe em WB-252)** Dado o tempo estimado, então mostro a faixa de chegada (RN-19) em horário ("Chega entre 15:40 e 16:10"), atualizada conforme o status, sem horário único.
- **C5** Dado `codigo_entrega` ligado, então vejo o código de 4 dígitos em destaque desde SAIU_PARA_ENTREGA com o texto "Informe ao motoboy só ao receber".
- **C6** Dado NAO_ENTREGUE, então vejo o motivo e "Combinar nova tentativa".
- **C7** Dado sem conexão, então vejo o último estado salvo com "Atualizado há X min" (WB-027 C3).

### WB-236 Admin: tabela de taxa de entrega, pedido mínimo e frete grátis — Must — dep: WB-118, WB-119
Como financeiro, quero definir quanto cobro de entrega por região e distância, para a logística se pagar.
- **C1** Dado a tabela, então defino por **escopo** (padrão geral, cidade ou bairro) até **6 faixas** `[de_km, ate_km)` contíguas, sem lacuna nem sobreposição (a coluna "De" é automática e a última faixa termina no `raio_max_km`), cada faixa com: taxa de entrega (R$ 0 a R$ 50), **taxa de troca/coleta** (padrão = a taxa de entrega, editável, 0 permitido; DEC-037), custo previsto do motoboy (informativo, para margem) e deslocamento estimado em minutos.
- **C2** Dado precedência, então vale bairro > cidade > padrão geral; o escopo usado é o do **endereço de destino**; cidade sem linha própria usa o padrão.
- **C3** Dado faixa com limite superior pertencente à seguinte (2,00 km cai em 2-5, não em 0-2); última faixa inclui o raio (RN-04).
- **C4** Dado `pedido_minimo_cents` e `frete_gratis_acima_cents`, então o grátis precisa ser estritamente maior que o mínimo; 0 desliga o grátis (RN-04).
- **C5** Dado salvar, então exijo motivo, a mudança vale a partir da data/hora indicada, **não é retroativa** (pedido guarda snapshot da taxa) e entra na auditoria com histórico visível; edição com controle de versão (409, WB-119 C6).
- **C6** Dado "Prévia", então informo CEP de loja e de destino e vejo a taxa, o custo previsto e a margem; o valor é **igual** ao do checkout para o mesmo par (teste).
- **C7** Dado taxa abaixo do custo previsto em alguma faixa, então aviso "Esta faixa dá prejuízo de R$ X por entrega" sem bloquear (decisão comercial é do fundador).
- **C8** Dado taxa de troca acima de `taxa_coleta_max_cents`, então erro com o teto.
- **C9** Dado perfil sem permissão (só super admin e financeiro editam), então 403.

### WB-237 Checkout: taxa de entrega pela tabela — Must — dep: WB-236, WB-023
Como cliente, quero ver a taxa de entrega exata antes de pagar, para não ter surpresa.
- **C1** Dado endereço completo, então a taxa é a da faixa e do escopo do destino (WB-236); com endereço aproximado a loja mostra "a partir de R$ X" (menor faixa da região).
- **C2** Dado subtotal >= `frete_gratis_acima_cents`, então a taxa é R$ 0 ("Grátis") e o resumo diz "Entrega grátis"; cupom de frete grátis também zera a taxa (RN-09).
- **C3** Dado subtotal < `pedido_minimo_cents`, então o checkout não avança e mostra "Faltam R$ X" (RN-04, RN-17).
- **C4** Dado destino fora do `raio_max_km`, **fora do alcance da faixa de 2 h (WB-251)**, de região inativa ou logística fechada/pausada, então só retirada (se houver) com o motivo escrito ("Entrega Webag volta às 09:00"); a sacola é mantida.
- **C5** Dado a taxa mudar entre o carrinho e o pagamento, então "Algo mudou" (RN-05).
- **C6** Dado o pedido, então grava snapshot da taxa, da faixa e da distância (RN-05).
- **C7** Dado loja que só tem retirada, então o checkout não cobra taxa e não mostra entrega.

### WB-238 Ledger: taxa de entrega como receita da Webag — Must — dep: WB-156, WB-236
Como financeiro, quero que a taxa de entrega entre na receita da Webag, para o extrato fechar.
- **C1** Dado pagamento aprovado, então `application_fee` = comissão + taxa de entrega + taxa de serviço - cupom da plataforma (RN-10); o lojista recebe só itens menos cupom da loja menos comissão menos taxa do provedor.
- **C2** Dado o exemplo de RN-10 (subtotal R$ 100,00, cupom da loja R$ 10,00, taxa de entrega R$ 8,00, comissão 15%, PIX 0,99%), então o líquido do lojista é R$ 75,53 e a receita da Webag R$ 21,50 (teste automatizado; substitui o teste de R$ 88,03).
- **C3** Dado estorno total, então a taxa de entrega e a comissão são devolvidas; estorno parcial devolve proporcional (RN-10); em arrependimento a taxa de entrega é devolvida ao cliente (WB-174).
- **C4** Dado o custo do motoboy (WB-239), então vira lançamento de **custo de logística** da Webag, separado da receita; a soma de lançamentos continua fechando com o pago (invariante WB-156 C4).
- **C5** Dado extrato do lojista, então a taxa de entrega **não aparece como receita dele**; aparece como informação ("Entrega pela Webag: R$ 8,00, paga pelo cliente").

### WB-239 Admin: custo por entrega e histórico — Must — dep: WB-233
Como financeiro, quero registrar quanto custou cada corrida e ver o histórico, para saber se a logística dá prejuízo.
- **C1** Dado corrida ENTREGUE, NAO_ENTREGUE ou DEVOLVIDA_A_LOJA, então a operação registra o custo pago ao motoboy em centavos (sugestão automática = custo previsto da faixa, editável); sem registro em 48 h, alerta.
- **C2** Dado o histórico, então vejo por corrida: pedido, motoboy, tipo, estados com horas, taxa cobrada, custo, margem, motivo de falha e quem registrou; filtros por período, motoboy, cidade, loja.
- **C3** Dado corrigir um custo, então a edição exige motivo, preserva o valor anterior e entra na auditoria (nunca sobrescreve em silêncio).
- **C4** Dado "Marcar como pago" (controle, sem movimentar dinheiro), então informo a data do PIX feito fora do app para um lote de corridas de um motoboy; o relatório "a pagar" só soma as não pagas.
- **C5** Dado perfil financeiro, então leitura e exportação; só operação e super admin registram.

### WB-240 Admin: relatórios de logística — Should — dep: WB-239
Como financeiro e operação, quero relatórios, para ajustar a tabela e cobrar a operação.
- **C1** Dado período e filtros (cidade, loja, motoboy, tipo), então vejo: entregas, no prazo, falhas por motivo, tempo médio (pronto até atribuído, até coletado, até entregue), taxa cobrada, custo, margem e **custo do subsídio de frete grátis**.
- **C2** Dado "A pagar por motoboy", então total de custo das corridas não pagas por motoboy no período, exportável em CSV (auditado).
- **C3** Dado margem negativa por faixa ou cidade, então destaque.
- **C4** Dado período sem dados, então "Sem dados neste período"; totais conferem com a lista de corridas.

### WB-241 Coleta e reentrega de troca na fila — Must — dep: WB-230, WB-233, WB-172
Como operadora, quero tratar a coleta da troca na mesma fila, para uma só rotina de despacho.
- **C1** Dado troca APROVADA com "Coleta em casa" e (se houver taxa) paga, então nasce uma corrida **COLETA_TROCA** (cliente para loja); a corrida aparece na fila com o rótulo "Troca" e a janela escolhida pelo cliente. **A peça nova só sai depois da antiga conferida pela loja** (DEC-038f): quando a loja marca a inspeção OK, nasce a corrida **REENTREGA_TROCA** (loja para cliente) na mesma fila, sem nova cobrança ao cliente (a taxa de troca já cobre coleta e reentrega); em troca por reembolso não há reentrega. **Exceção:** na troca feita na loja (WB-243) a peça nova é entregue no balcão logo após a conferência.
- **C2** Dado mensagem de WhatsApp, então usa o modelo de troca: "COLETAR com [1º nome], [endereço], [telefone]. LEVAR PARA: [loja, endereço]. Cliente entrega o item na embalagem. Sem cobrança." e, na reentrega, o modelo de entrega comum com a observação "Troca: peça nova".
- **C3** Dado coleta feita e item entregue à loja, então o estado vira ENTREGUE na corrida e a troca avança para ITEM_RECEBIDO quando a **loja** confirma o recebimento (WB-173), nunca só pelo motoboy; a reentrega só é criada depois da inspeção OK.
- **C4** Dado cliente ausente na coleta, então NAO_ENTREGUE (motivo) e a troca segue WB-173 C3 (até 2 reagendamentos; na 3ª, EXPIRADA); a taxa **não** é devolvida se a falha for do cliente `[HIPÓTESE; jurídico]` e é devolvida se for da Webag/loja.
- **C5** Dado troca com "Levar à loja", então **não** há corrida.
- **C6** Dado o custo da corrida, então vira custo de logística ligado à troca (relatório de trocas, WB-248), com o tipo de motivo (arrependimento/defeito: custo da Webag; tamanho/cor: coberto pela taxa).
- **C7** Dado prazo `coleta_agendamento_dias_uteis` (3) estourando sem atribuir, então "Atrasada" (alerta ao admin) e o cliente recebe **1 push** (`collection_late_notice`) com o **novo prazo = `coleta_atrasada_dias_uteis` (1, parâmetro novo, DEC-062, `[HIPÓTESE; HIP-P03]`) dias úteis a contar do aviso**: "A coleta da sua troca atrasou. Nova previsão: até [data]. Você não perde o prazo da sua troca." (reuso dos 3 dias foi descartado: o cliente já esperou 3 e ficaria 6 dias úteis sem item e sem resposta). Texto neutro, sem culpar ninguém.
- **C8** Dado a coleta "Atrasada" por causa da Webag (sem motoboy atribuído), então o relógio `coleta_entrega_item_dias` fica **pausado** e a troca não expira (RN-11); volta a contar quando a corrida é atribuída. Dado falha por cliente ausente, o relógio não pausa.
- **C9** Dado nova passagem do prazo atrasado (a coleta segue sem atribuição depois de `coleta_atrasada_dias_uteis`), então novo alerta **ao admin** (não novo push ao cliente: 1 por corrida) e a troca aparece no topo da fila.

### WB-242 Lojista: comissão transparente ("Você recebe R$ X") — Must — dep: WB-060, WB-105
Como lojista, quero ver quanto recebo por produto e entender a comissão, para precificar sem surpresa.
- **C1** Dado o formulário de produto (e o preço por variação e o promocional), então ao lado do preço mostro "Comissão Webag ([pct]%): -R$ X" e **"Você recebe cerca de R$ Y"** = preço menos comissão **menos a estimativa da tarifa do provedor** (PIX por padrão; "no cartão, cerca de R$ Z" em detalhe), calculado com a comissão **efetiva da loja hoje** (loja > categoria > padrão, RN-10) e arredondamento half-up (RN-01); atualiza ao digitar. As tarifas estimadas são os parâmetros `taxa_provedor_pix_pct` e `taxa_provedor_cartao_pct` (RN-02; DEC-038a), editáveis no admin; o valor real do pedido vem do provedor (ledger).
- **C2** Dado o texto fixo abaixo do campo de preço, então: "Cadastre o preço que o cliente paga aqui, já com a comissão. 'Cerca de' porque a tarifa do Mercado Pago é uma estimativa `[confirmar no contrato do MP]`." (nunca a taxa de entrega: ela é da Webag).
- **C3** Dado preço que, após a comissão e a estimativa da tarifa, deixa o lojista com menos que R$ 0,01, então erro no campo.
- **C4** Dado a comissão da loja mudar (WB-105), então o lojista vê o aviso "Sua comissão mudou de A% para B% a partir de DD/MM" no painel e por e-mail; produtos mostram o novo "Você recebe" e pedidos já pagos mantêm o snapshot (RN-10).
- **C5** Dado o onboarding (WB-051), então uma tela de **uma frase** explica: "O Webag fica com [pct]% de cada venda e cuida da entrega. Você cadastra o preço final e vê quanto recebe." mais o link "Como é calculado" (exemplo de RN-10); o aceite dos Termos do Lojista cita comissão e entrega (jurídico).
- **C6** Dado produto da categoria com comissão própria, então o "Você recebe" usa a da categoria; dado item com cupom da loja, a prévia explica que a comissão incide após o cupom da loja (RN-09).
- **C7** Dado lojista com comissão promocional com data de fim (HIP-002), então o painel mostra "Comissão reduzida até DD/MM" e o "Você recebe" dos produtos não muda sozinho (só os pedidos novos usam a regra vigente).

## Promessa de entrega em até 2 h (DEC-053): evidência, histórias de logística e copy
Regra completa e fórmula: **RN-19**. Histórias do cliente (descoberta, loja, sacola, pedido, atraso, compensação): `cliente.md` WB-250 a WB-254. Copy: `cliente.md`, seção "Copy da promessa de entrega".

**Evidência de mercado (pesquisa de 2026-11-19; sites oficiais e boa parte dos veículos não abriram no ambiente, então tudo abaixo é secundário e marcado `[confirmar]` no app ou na central de ajuda de cada empresa):**
- **iFood:** mostra o prazo em faixa de minutos e acompanha o pedido; pedido atrasado permite pedir cancelamento com reembolso pelo app, em Ajuda, motivo "pedido atrasado". Guias de terceiros divergem no limite: **15 min** após o prazo para restaurante e **30 min** para mercado/farmácia (Saipos, guia de reembolso) e **10 min** (Tecnoblog, "Como pedir reembolso no iFood"); se o pedido já saiu para entrega, o estabelecimento pode negar. Em 2024 o iFood lançou ferramenta para o restaurante **propor novo horário** ao cliente atrasado, com **95%** dos clientes aceitando esperar (Mercado & Consumo, 2024-06-10). Não achei compensação oficial em cupom por atraso. `[confirmar]`
- **Rappi:** a promessa é velocidade ("em minutos"); a compensação por atraso não é pública e as reclamações (reclamos.cl, 2025-2026) mostram o risco de uma política opaca: cancelamento só depois de 4 horas, compensação irrisória, estorno negado sem revisão. A lição para a Webag é a **regra clara e automática**, não o valor. `[confirmar]`
- **Mercado Livre:** envio com data prevista ou faixa de datas ("chega entre..."); o ressarcimento por atraso no Full é **ao vendedor**, não ao comprador (GoSmarter, 2026-05); os cupons de "entrega Full" são promoção, não compensação. A lição: a regra de atraso ao **cliente** da Webag precisa ser própria. `[confirmar]`
- **Entrega em lote:** DoorDash descreve em patentes o agrupamento de pedidos por **proximidade do primeiro cliente** e a atualização do ETA a cada novo evento (pedido aceito, coletado, entregue) (Justia Patents, `patents.justia.com/patent/11037055` e `10872305`); é intenção de desenho, não prova de produção. Serve de base para duas regras da Webag: lote por área e ETA que se atualiza por status. Entrega **agendada** (Rappi, iFood) existe, mas fica fora da 1.0.
- **Leitura crítica do PO:** iFood e Rappi sustentam a promessa com milhares de entregadores e dados de trânsito; a Webag promete "até 2 h" com 1 a 2 operadores, poucos motoboys e linha reta. A promessa é **honesta só porque tem teto largo, faixa e válvula de saída (cancelar sem custo)**. Sem a válvula, a primeira falha vira reclamação pública (CDC art. 30, 35; ver J14 em `decisoes.md`).

### WB-249 Motor de ETA: faixa por loja e endereço, teto e recálculo — Must — dep: WB-236, WB-119, WB-057 (E.1 do backend)
Como cliente, quero ver quando meu pedido chega antes de pagar, para decidir se compro aqui.
- **C1** Dado loja e endereço com posição, então a API devolve a faixa pela fórmula de RN-19 item 1 (exemplo: loja a 2,0 km, preparo 20: faixa 36 a 66 min; a 5,0 km: 59 a 89 min) e a conta é **a mesma** na descoberta, loja, produto, sacola e pedido (teste com o mesmo par em todas as rotas).
- **C2** Dado que o fim da faixa passa de `entrega_max_min`, então a loja não está disponível para o endereço (`available=false`, motivo `OUT_OF_RANGE`, `eta=null`); no limite: fim da faixa em 120 entrega, em 121 não (teste de fronteira).
- **C3** Dado endereço sem posição exata (só cidade), então não há faixa por distância: a API devolve só "Chega em até 2 h" e o mínimo (preparo + despacho), e a faixa real aparece quando o endereço for confirmado.
- **C4** Dado `entrega_preparo_padrao_min`, quando a loja define o seu (WB-257), então vale o da loja; loja sem valor usa o padrão.
- **C5** Dado criação do pedido, então o servidor **recalcula** (nunca usa a faixa enviada pelo app), grava a faixa e os termos (preparo, despacho, deslocamento, distância) e responde 409 `ETA_CHANGED` **se o fim da faixa ficou mais tarde** do que o mostrado na sacola (qualquer diferença; faixa igual ou mais cedo cria o pedido sem aviso), com a faixa nova para o cliente confirmar (mesmo padrão "Algo mudou", RN-05; WB-261, DEC-065).
- **C6** Dado pagamento aprovado, então a faixa é reancorada: mesmos minutos a partir do pagamento (teste: PIX pago aos 14 min não perde 14 min).
- **C7** Dado `logistica_horario` e o fim da faixa depois do fechamento, então a entrega não é oferecida e o texto diz "Entrega volta às HH:MM" (RN-19 item 2) `[HIPÓTESE; HIP-E08]`.
- **C8** Dado parâmetro alterado no admin, então vale em até 60 s para novas consultas e **não altera** pedido já criado.
- **C9** Dado distância exatamente na fronteira de arredondamento, então `ceil` com tolerância de 1e-9 (sem "salto" de 1 min por ponto flutuante).
- **C10** Dado resposta lenta ou falha do PostGIS, então a loja segue visível com "Chega em até 2 h" e o checkout recalcula no servidor (nunca bloqueia a descoberta por erro de cálculo).
- **Eventos:** `eta_shown`, `eta_out_of_range` (RN-19).

### WB-255 Admin: atraso na fila, "Em risco" e causa do atraso — Must — dep: WB-249, WB-230, WB-233 (E.2) (substitui WB-230 C9)
Como operadora, quero ser avisada antes e depois de o pedido passar do prazo prometido, para agir a tempo.
- **C1** Dado corrida com ETA, então a fila mostra o **prazo restante** em minutos (negativo = atraso) e ordena pelo mais urgente (RN-18).
- **C2** Dado restar <= `entrega_faixa_min` e a corrida ainda não SAIU, então a linha fica amarela "Em risco" (ícone e texto).
- **C3** Dado passar do fim da faixa antes de ENTREGUE, então a linha fica vermelha "Atrasada", sobe ao topo e gera **um** alerta (painel, som, e-mail/Web Push da operação, como WB-230 C4); nova passagem pela mesma corrida não repete o alerta (idempotência por corrida, `late_alerted_at`).
- **C4** Dado corrida sem ETA (pedido anterior à DEC-053), então vale `logistica_alerta_entrega_min` (60).
- **C5** Dado fechar a corrida atrasada, então a operação marca a **causa** (loja demorou, sem motoboy, trajeto, cliente/endereço, outro com texto) e isso alimenta o relatório (WB-240) e o índice da loja (RN-19 item 4e).
- **C6** Dado "Pedir cancelamento por atraso" do cliente em SAIU (WB-253), então aparece um alerta e a linha com contagem de `entrega_cancel_resposta_min`; a operação escolhe "Chego em até 10 min" (informa ao cliente) ou "Aceitar cancelamento" (corrida vira devolução); sem resposta, aceita sozinho e registra "aceito pelo sistema".
- **C7** Dado perfil sem permissão de Logística, então 403.
- **C8** Dado a resposta da operação ao pedido de cancelamento por atraso, então grava `late_cancel_answered {answer: accepted|arrive_soon|auto_accepted}` e, na recusa ("Chego em até 10 min"), a **nota é obrigatória** e vem com a sugestão "Chegamos até HH:MM" (DEC-065, F5).

### WB-262 Admin: informar a hora real da entrega — Must — `[HIPÓTESE; HIP-P07]` — dep: WB-233, WB-253, WB-254, WB-258
Como operadora que atualiza o status por WhatsApp com alguns minutos de atraso, quero registrar a hora em que o pedido realmente chegou, para o cliente não ser compensado por atraso que não houve e para o piloto medir o prazo de verdade.
- **C1** Dado marcar ENTREGUE na corrida (WB-233), então o painel mostra "Entregue às HH:MM" preenchido com a hora atual, editável **até 60 minutos para trás** (nunca no futuro nem antes da saída para entrega); a API grava `deliveredAt`.
- **C2** Dado recuo de mais de 5 min, então o motivo curto é obrigatório (lista: "Motoboy avisou depois", "Estava sem sinal", "Outro" com texto); dado recuo de até 5 min, o motivo é opcional.
- **C3** Dado `deliveredAt` e o valor anterior (hora do clique), então os dois ficam no histórico da corrida com ator e hora (auditoria; WB-123).
- **C4** Dado `deliveredAt` posterior ao fim da faixa + `entrega_atraso_tolerancia_min`, então a compensação (WB-254) usa essa hora; dado anterior, nenhuma compensação nasce; a compensação já concedida **não** é revogada se a hora for corrigida depois (um só sentido, sem sumir cupom da mão do cliente).
- **C5** Dado o relatório "Prazo" (WB-258 C5) e a meta de 95% (HIP-E09), então usam `deliveredAt`.
- **C6** Dado valor fora da janela (futuro, antes de SAIU, mais de 60 min atrás), então 422 com o motivo escrito e nada muda.
- **C7** Dado perfil sem permissão de Logística, então 403.
- **Risco:** a operação recuar a hora sistematicamente para esconder atraso; mitigação: relatório mostra a distribuição dos recuos por operadora e o fundador confere no piloto.

### WB-256 Admin: lote de corridas por área — Should — dep: WB-232, WB-249 (E.2)
Como operadora, quero mandar várias entregas da mesma região no mesmo motoboy, para atender mais pedidos no prazo com poucos motoboys.
- **C1** Dado 2 ou mais corridas de **entrega** PRONTA_PARA_COLETA da **mesma cidade de destino**, então posso selecioná-las e atribuir a um motoboy (limite `entrega_lote_max`, 4).
- **C2** Dado corridas de cidades diferentes, de troca ou fora de PRONTA_PARA_COLETA, então erro "Só entregas prontas da mesma cidade entram no mesmo lote" e nada é atribuído.
- **C3** Dado a seleção, então o painel mostra o prazo restante de cada corrida e avisa "Esta corrida pode atrasar" quando alguma tem prazo restante <= `entrega_faixa_min`; a operação decide, o sistema não bloqueia.
- **C4** Dado confirmar o lote, então **cada corrida** vai a AGUARDANDO_MOTOBOY e todas saem numa **única** mensagem de WhatsApp com as coletas e entregas numeradas (mesmas regras de dado mínimo de WB-232 C5, sem código de entrega nem valores).
- **C5** Dado uma corrida perder a disputa (outra operadora já atribuiu), então as demais são atribuídas e a que falhou aparece com o motivo (`failed` com código); nada duplica.
- **C6** Dado uma corrida do lote cancelada, devolvida ou com falha, então as outras seguem normalmente e o custo é lançado por corrida (WB-239).
- **C7** Dado o lote, então o ETA gravado nos pedidos **não muda** (RN-19 item 5) e `delivery_batch_created {n}` é registrado.
- **C8** Dado motoboy já com corridas ativas, então vale o aviso de WB-232 C7 somado ao do lote ("Já tem N corridas ativas").

### WB-258 Admin: parâmetros do ETA, prévia e relatório de prazo — Should — dep: WB-249, WB-119, WB-240
Como fundador, quero ajustar a estimativa com o dado do piloto e ver se a promessa está sendo cumprida, para calibrar sem mexer em código.
- **C1** Dado a tela de parâmetros (RN-02), então os parâmetros `entrega_*` de RN-02 ficam agrupados em "Entrega em até 2 h", com padrão, faixa válida e a frase "valor de partida, calibrar com o piloto".
- **C2** Dado salvar valor que quebra a validação de RN-02 (teto menos folga menor que preparo + despacho + 5; folga acima de teto/4), então 422 com o motivo escrito; a edição exige motivo e vira histórico (WB-119).
- **C3** Dado `raio_max_km` maior que o alcance dos parâmetros (RN-19: com os padrões, ~9,0 km), então aviso amarelo "Faixas de taxa acima de 9,0 km não serão usadas" (não bloqueia).
- **C4** Dado "Prévia de ETA" (loja + CEP de destino), então vejo preparo, despacho, deslocamento, estimativa, faixa e se entra no alcance; o resultado é **idêntico** ao do checkout para o mesmo par (teste).
- **C5** Dado o relatório "Prazo" (WB-240), então mostra por período, loja e cidade: % no prazo, % dentro de 2 h, precisão mediana, atrasos por causa (WB-255 C5), cancelamentos por atraso e compensações concedidas com custo.
- **C6** Dado a loja com mais de 3 pedidos e mediana real de preparo (ACEITO até PRONTO) acima do preparo configurado em 10 min ou mais, então o painel sinaliza "Preparo real maior que o informado" (a loja ajusta em WB-257; a Webag não altera o preparo da loja sozinha).
- **C7** Dado perfil sem permissão, então 403.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| **DEC-053: prometer "em até 2 h" com operação de 1 a 2 pessoas, poucos motoboys e linha reta; o ETA não enxerga a fila nem o trânsito** | Risco de negócio e de reputação | Faixa e teto largos; válvula de saída (WB-253); alerta de atraso e "Em risco" (WB-255); parâmetros conservadores e calibrados (WB-258); piloto com 5 lojas e meta de 95% em 2 h (HIP-E09); pausa de entregas (WB-230 C6) |
| **Teto na estimativa x teto no fim da faixa:** a DEC-053 e o código usam estimativa <= 120; com folga de 15 min a faixa chega a 135 min e "até 2 h" fica falso | **Decisão pedida ao CEO/fundador** | Recomendação PO: teto no fim da faixa (RN-19 item 2); custo: alcance de ~10,9 para ~9,0 km; backend ajusta E.1 |
| Compensação por atraso: custo não previsto e abuso (cancelar por qualquer atraso, pedir toda vez) | Risco financeiro | Padrão "entrega grátis no próximo pedido" (custo = receita perdida da taxa, limitado); 1 por pedido atrasado; tolerância de 15 min; relatório de custo (WB-258 C5); `nenhuma` desliga |
| Cancelar em SAIU: cliente cancela quando o motoboy já está na porta | Risco operacional e de fraude | Em SAIU o cancelamento é "pedido" com resposta da operação em 10 min; o pacote volta à loja antes do estorno final (fluxo de devolução) |
| Entrega próxima do fechamento da logística | Risco operacional | Oferta só se o fim da faixa cabe no horário (RN-19 item 2; HIP-E08); fundador define o horário (pergunta abaixo) |
| Preparo informado pela loja é otimista | Risco de dado | Padrão 20 min; sinal de "preparo real maior" (WB-258 C6); relatório de causa do atraso |
| **Economia da entrega:** a taxa que cobre o custo do motoboy (R$ 8 a R$ 18 `[HIPÓTESE]`) é maior que os R$ 3 a R$ 8 que o time supôs aceitos (V2); conversão pode cair | Risco de negócio crítico | Revalidar V2 no piloto com a tabela real; começar com a tabela da RN-18 e subsídio só por campanha; relatório de margem (WB-240) |
| **Operação de 1 pessoa não despacha 24 h** | Risco operacional | `logistica_horario`, pausar entregas (WB-230 C6), perfil de operação delegável; M1 com poucas lojas |
| Motoboy autônomo: vínculo empregatício, Lei 12.009/2009 (21+ anos, CNH A há 2+ anos, curso, colete), seguro e acidente; responsabilidade solidária por ato de preposto (CDC art. 34) e do marketplace pela cadeia (art. 7º, parágrafo único, art. 25 §1º) | **Risco jurídico: revisão do fundador/advogado antes do G5** | Aceite interno de documentos; contrato de prestação; seguro [decisão do fundador, custo]; **não contratar nem pagar motoboys sem a análise** (DEC-003) |
| Dado pessoal do cliente sai no WhatsApp (fora do sistema) | Risco LGPD | Dados mínimos, só 1º nome e telefone; orientar o motoboy a apagar a conversa após a entrega; **Security valida** o modelo da mensagem |
| Produto grande ou frágil não cabe na moto | Risco operacional | Loja marca "só retirada" até haver regra de porte; Designer inclui aviso; perguntar ao fundador (abaixo) |
| Dinheiro: Webag adianta o custo do motoboy e recebe a taxa pelo split | Risco financeiro | Ledger separa receita e custo (WB-238); relatório "a pagar" (WB-240) |
| NFS-e / tributo sobre a taxa de entrega e a comissão da Webag | Risco fiscal | **Contador do fundador** (backlog "Depois": NFS-e) |
| Motoboy fraudando "entregue" | Risco de fraude | Código de entrega (WB-226 sugerido ligado); custo registrado pelo financeiro |
| Webhooks/estados: `application_fee` maior no split | Risco técnico | Backend confirma no sandbox que a `application_fee` aceita o valor total e a devolução proporcional (L.2) |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Valores da tabela de taxa (HIP-L01) e do custo previsto (HIP-L02): cotar com 3 a 5 motoboys de Francisco Morato antes do piloto | fundador |
| Horário da logística (padrão seg a sáb 09:00 às 20:00) e quem despacha fora dele; **com a DEC-053 isso define quando a promessa de 2 h existe** (HIP-E08) | fundador |
| DEC-053: teto no fim da faixa (recomendado) ou na estimativa? Compensação em atraso (entrega grátis no próximo pedido, cupom de R$ 10 ou nenhuma)? Quem paga? Cobrar mais por distância (a tabela de taxa já escala; subir a taxa das faixas longas)? | fundador/CEO |
| Motoboys: autônomos pagos por corrida? Quem seleciona e contrata? Há seguro? | fundador/jurídico |
| Falha de entrega por culpa do cliente: cobrar a taxa? | fundador/jurídico |
| Tamanho máximo do pacote (baú de moto) e como a loja declara | fundador (decisão) e Designer (campo) |
| Frete grátis acima de X liga no piloto? Quanto a Webag aceita subsidiar por pedido? | fundador |
| `application_fee` aceita o total e devolve proporcional no estorno parcial? | backend-dev (sandbox) |
| Mensagem do WhatsApp e retenção do dado fora do sistema | security-engineer |
