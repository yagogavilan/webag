# PRD v1.1: Coleta de acessos, análises do admin e módulo pago "Análises" do lojista

Status: proposta | Dono: product-owner | Data: 2026-11-22 | Histórias: WB-360 a WB-369
Base: `v1-1-pesquisa.md` §3; `prd/lgpd.md` (WB-210, WB-211, WB-216); RN-14 (lojista só vê dado de cliente em pedido ativo); DEC-016 (sem retenção no split); DEC-073 (piloto sem analytics; `relatorio-final.md` (e)1: analytics antes de campanha paga); SEC-156, SEC-159; `docs/seguranca/inventario-lojas.md` (Data Safety e App Privacy).

## Problema
- **Quem sofre:** o lojista (não sabe se a vitrine atrai ou converte; só vê vendas, WB-078), o fundador (não sabe quais lojas e produtos o cliente abre, onde o funil quebra, nem se um banner funciona) e o próprio negócio (cupom e frete sem dado de conversão).
- **Evidência:** o v1.0 não tem coleta de navegação; "mede-se o que o banco guarda" (DEC-073). Pedido do fundador (2026-11-22): análises de visitas e cliques para o lojista como **módulo pago**, e acessos no admin. **Não há evidência de que o lojista pague por isso** `[HIPÓTESE; HIP-A1]`.
- **Posição crítica.**
  1. **"Por usuário" ao lojista, identificando o cliente: não.** É finalidade nova sem base legal, contradiz a RN-14 e a política de privacidade, e o ganho é baixo (`pesquisa` §3). O nível entregue é **agregado, com mínimo de 5 por célula**, sem nome, lista ou exportação por pessoa.
  2. **Com 5 a 30 lojas, o funil de uma loja terá poucas dezenas de visitas por semana.** O módulo pago só tem valor com volume. Por isso a **coleta começa cedo** (acumula dado), o **admin é o primeiro usuário** e o módulo do lojista sai por último, atrás de uma **porta falsa** que mede interesse antes de construir.
  3. **Cobrança:** não pode ser desconto no repasse (DEC-016). Na v1.1 é manual (F6).

## Objetivo e métrica de sucesso
| Objetivo | Métrica `[HIPÓTESE]` | Fonte |
|---|---|---|
| Medir o funil geral e por loja sem identificar pessoas | 100% dos eventos sem `user_id`, sem texto livre e sem IP gravado (teste) | schema e testes |
| O fundador usa os acessos para decidir (banner, destaque, loja a apoiar) | >= 1 decisão por semana registrada ligada a um número de acesso | revisão semanal |
| Lojista quer o módulo | Cliques em "Quero testar" >= 40% das lojas ativas em 2 semanas (porta falsa); >= 3 lojas aceitam pagar após o teste | HIP-A1 |
| Lojista que ativou usa | >= 60% abrem a tela 2 vezes por semana durante o teste | evento `analytics_screen_viewed` |
| Cobertura da medição | >= 85% das sessões do app com eventos aceitos (opt-out até 15%) | taxa de opt-out |

## Fora do escopo (com gatilho de volta)
| Item | Motivo | Gatilho |
|---|---|---|
| **Qualquer dado de navegação identificado ao lojista** (quem visitou, lista de visitantes, histórico por cliente) | LGPD (finalidade, base legal), RN-14 | Cliente "segue a loja" com consentimento específico + parecer J24 |
| Lojista exportar lista de clientes ou "top clientes" | Mesmo motivo; nome e telefone só em pedido ativo | idem |
| Visitantes únicos e retenção por pessoa | Exige id persistente | Parecer + consentimento |
| SDK de terceiros (Google Analytics, Firebase, Mixpanel) | Dado sai do Webag; ATT/Data Safety; custo | Nunca no v1.1 |
| Impressões de listas (cada loja que passou na tela) | Volume e pouco valor | Pedido de CTR por posição |
| Texto de busca do cliente | Texto livre pode ter dado pessoal | Lista curada de termos (fase 2) |
| Cobrança recorrente automática | Integração nova paga (regra 6) | 20 lojas pagantes ou 3 atrasos por mês |
| Análises do site público e dos painéis | Fora da jornada de compra | Pedido |
| Comparar a loja com a média das concorrentes | Exige 5 ou mais lojas por categoria e cidade | Densidade |
| Previsão e recomendações por IA | Sem evidência | 3 meses de dados |

## Usuários e cenários
| Persona | Cenário |
|---|---|
| Carla (cliente) | Abre o app; vê o aviso "Ajudar o Webag a melhorar" e pode desligar em Conta > Privacidade; compra normalmente |
| Seu Marcos | Vê "Análises (teste de 30 dias)": 128 visitas à loja, 41 abriram um produto, 12 colocaram na sacola, 5 pediram; 60% das visitas vieram do banner. Percebe que a camiseta X tem muita visita e pouca venda e ajusta o preço |
| Yago (admin) | Vê as 10 lojas e os 10 produtos mais abertos da semana, e que 70% abrem só o perfil da loja e não o produto; ajusta o destaque da home |
| Yago | Em Admin > Lojas, ativa o módulo para a Loja A por 30 dias de teste; no dia 31 registra "pago até 30/12" |

## Requisitos funcionais
**Coleta (todas as histórias de análise dependem dela)**
1. Eventos de navegação do app do cliente enviados em lote ao próprio servidor (sem SDK de terceiros).
2. Aviso e controle de privacidade no app; respeito ao opt-out; atualização da política de privacidade e do inventário das lojas.
3. Agregação diária, mínimo de 5 por célula e retenção curta do bruto.

**Admin**
4. Análise de acessos: lojas e produtos mais acessados, acesso só ao perfil da loja versus ao produto, funil geral e por loja, origem, por cidade e período. Entra também como métricas no construtor de painéis (`prd/v1-1-admin-e-paineis.md` WB-356).

**Lojista (módulo pago)**
5. Tela "Análises" da própria loja: vendas (já existentes, exatas), visitas à loja, aberturas de produto, adicionados à sacola, pedidos, origem, produto visto versus vendido, horário de pico, comparação com o período anterior.
6. Ativação por loja no admin (teste grátis, validade, suspensão), estados da assinatura, porta falsa antes do módulo.

## Dados: eventos, volume, retenção
**Esquema `analytics_events`** (append-only, particionado por dia) `[HIPÓTESE; backend-dev e Security fecham o desenho]`

| Campo | Tipo | Observação |
|---|---|---|
| `event_id` | uuid do cliente | Deduplicação em reenvio |
| `name` | enum | Lista abaixo |
| `occurred_at` / `received_at` | timestamp | Servidor corrige relógio fora de +-10 min |
| `session_id` | uuid aleatório | Nasce a cada abertura do app, vence após 30 min sem evento ou 24 h; **não é gravado em log, pedido nem tabela de usuário**; não é ligado à conta |
| `platform`, `app_version` | texto curto | android, ios, web |
| `city_id` | id | Cidade escolhida pelo cliente (não GPS) |
| `store_id`, `product_id` | id | Quando se aplica |
| `origin` | enum | `home_banner`, `home_stores`, `home_offers`, `category`, `search`, `favorites`, `reorder`, `external_link`, `push`, `direct` |
| `banner_id` | id | Só em eventos de banner |

**Fora do esquema, por regra:** `user_id`, e-mail, telefone, CPF, endereço, IP, texto de busca, nome do aparelho, localização precisa, qualquer campo livre.

**Eventos (gatilho exato):** `app_session_started` (abertura com tela inicial visível), `store_viewed` (perfil da loja renderizado), `product_viewed` (página do produto renderizada), `item_added` (toque em adicionar com sucesso), `bag_viewed`, `checkout_started` (abrir o checkout), `banner_clicked`, `search_performed` (sem texto; só `results_count` em faixa), e do servidor: `order_paid` (pagamento aprovado; **sem order_id e sem user_id**; com `store_id`, `city_id`, `session_id` quando o app o enviou, `is_new_to_store` booleano). O funil do lojista é: `store_viewed` -> `product_viewed` -> `item_added` -> `order_paid`, contado por **sessão** (visita), não por pessoa.

**Volume para 10 mil usuários** (`[HIPÓTESE]`, ordem de grandeza): 10.000 ativos no mês, 25% por dia = 2.500; 1,6 sessão por dia = 4.000 sessões; ~25 eventos por sessão = **~100.000 eventos por dia** (cenário alto, 3x: 300.000). Linha de ~200 bytes: ~20 MB por dia, ~600 MB por mês no bruto; com índices ~1,2 GB por mês e **~3,6 GB com 90 dias**. Taxa média ~1,2 evento por segundo; pico 10x ~12 por segundo. Lote do app a cada 30 s ou ao ir para segundo plano: ~1 requisição por sessão a cada 30 s; trivial para a API e o PostgreSQL atuais.

**Retenção:** bruto 90 dias (depois, partição apagada por job); agregados por loja, produto, dia e origem **25 meses**, sem `session_id`. Parâmetros editáveis (RN-02). Justificativa de 90 dias: refazer agregação após correção de regra e investigar anomalia `[HIPÓTESE; jurídico J24]`.

## Regras de negócio
**RN-A1 Privacidade por desenho.** O lojista só vê contagens agregadas. Nenhuma tela, API, exportação ou e-mail do módulo contém dado de pessoa. O que a loja já vê de clientes (pedido ativo, RN-14) não muda.

**RN-A2 Agregação mínima.** Célula (loja x dia x origem, ou produto x período) com **menos de 5 sessões** aparece como "menos de 5" e não entra em quebra por origem; loja com menos de 30 visitas no período mostra só os totais, com o aviso "Poucos dados ainda". O mesmo vale no admin para quebras por loja. Os 5 e os 30 são parâmetros `[HIPÓTESE]`.

**RN-A3 Base legal e transparência `[HIPÓTESE; encarregado e advogado, J24]`.** Medição agregada do próprio Webag, sem identificar a conta, apoiada em **legítimo interesse** (LGPD art. 7º IX; guia ANPD de cookies trata analítica como candidata, fonte secundária), com aviso claro e **opt-out em um toque** (Conta > Privacidade > "Ajudar o Webag a melhorar"). O dado só é anônimo se o Webag não consegue relacioná-lo à pessoa por meios razoáveis: por isso `session_id` não vai a log, pedido nem usuário (teste de varredura de log no QA). Qualquer vinculação à conta (ex.: recomendar produto) é outra finalidade e exige consentimento específico (`consents`, WB-211). A alternativa mais prudente é **opt-in**, ao custo de cobertura menor e viés no funil (F7).

**RN-A4 Opt-out.** Ao desligar, o app deixa de enviar na hora; eventos já enviados são anônimos e não podem ser apagados por conta (a tela diz isso). Na exclusão de conta nada de analytics precisa ser apagado (não há ligação); o teste de classificação de colunas ligadas a `users` (SEC-158) cobre.

**RN-A5 Definições.** Visita = sessão com `store_viewed` da loja; "abriu produto" = sessão com `product_viewed` de produto da loja depois da visita; "sacola" = `item_added`; "pedido" = `order_paid` da loja com o mesmo `session_id`. Uma sessão conta em cada loja visitada. Conversão = pedidos / visitas. Pedido sem `session_id` (web, versão antiga, opt-out) conta nas vendas, **não** no funil (nota na tela). "Perfil x produto": visitas em que a sessão **não** abriu produto.

**RN-A6 Origem.** O app grava `origin` na navegação (de onde veio o toque). Link externo: o link compartilhável da loja aceita `?o=<canal>` (ex.: ig, wa) e vira `external_link` com o canal em categoria curada (lista fixa, não texto livre).

**RN-A7 Módulo pago (estados).** `store_modules`: `INATIVO` -> `TESTE` (30 dias, parâmetro) -> `ATIVO` (até `valido_ate`) -> `VENCIDO` (leitura bloqueada, vendas continuam no painel inicial) ou `SUSPENSO`. Ativar e desativar: super admin e financeiro, com motivo (auditoria). Preço e período são **decisão do fundador** (F5): o sistema guarda o `preco_centavos` do momento da ativação. **Cobrança manual na v1.1:** a Webag cobra fora do sistema (PIX para a conta da empresa) e o admin registra "pago até DD/MM"; nada é descontado do repasse (DEC-016) e **nenhum provedor novo é integrado**. Nota fiscal do serviço: contador do fundador (J11).

**RN-A8 Gatilho de lançamento do módulo** `[HIPÓTESE]`: 8 semanas de coleta, 5 lojas com pelo menos 100 visitas no mês, e a porta falsa com interesse. Antes disso, só o admin usa.

## Requisitos não funcionais
- **Ingestão:** `POST` em lote, <= 100 eventos e <= 64 KB por requisição, validação rigorosa (Zod; nome e `origin` por lista), limite de 60 requisições por minuto por sessão e por IP (IP só em Redis com validade curta), idempotente por `event_id`, resposta 202. Eventos com `store_id` ou `product_id` inexistente são descartados.
- **Desempenho:** ingestão p95 <= 100 ms; consulta do módulo p95 <= 1,5 s; agregação diária por job (idempotente).
- **Offline:** o app guarda até 500 eventos em fila local e envia ao reconectar; nunca bloqueia a navegação.
- **Segurança:** o módulo só mostra dados da própria loja (RBAC por loja, IDOR testado); fraude de volume (loja inflando as próprias visitas) é limitada pelo mínimo e pelo limite de requisições; o app **não envia eventos quando a conta logada é de membro de loja ou de admin** (a decisão é do app, o evento não guarda quem é).
- **Acessibilidade:** gráficos com texto e tabela; números grandes.
- **LGPD:** inventário das lojas atualizado (Data Safety: "Interações do app/Analytics", não vinculado a você; App Privacy: "Dados de uso", não usado para rastreamento); política de privacidade atualizada antes do release.

## Histórias e critérios de aceite

### WB-360 Aviso, controle e opt-out de medição no app — Must — dep: WB-211
Como cliente, quero saber da medição e poder desligá-la, para controlar meus dados.
- **C1** Dado o primeiro uso após a atualização, então aparece um aviso curto (o que se mede, para quê, que não identifica a conta) com "Entendi" e link para Privacidade; não bloqueia a navegação.
- **C2** Dado Conta > Privacidade, quando desligo "Ajudar o Webag a melhorar", então nenhum evento novo é enviado a partir daquele toque.
- **C3** Dado o interruptor desligado, então a escolha persiste após fechar o app e a tela explica o que já foi enviado.
- **C4** Dado o app sem internet, então o interruptor funciona do mesmo jeito.
- **C5** Dado a política de privacidade, então cita a medição, a finalidade, a retenção de 90 dias e o canal do titular (WB-217).

### WB-361 Coleta de eventos de navegação — Must — dep: WB-360
Como Webag, quero registrar a jornada da sessão sem identificar o cliente, para medir o funil.
- **C1** Dado a abertura do app, então `app_session_started` é enviado com `platform`, `app_version`, `city_id` e `session_id` novo.
- **C2** Dado abrir o perfil de uma loja, então um `store_viewed` com `store_id` e `origin`; reabrir a mesma loja na mesma sessão dentro de 30 s não duplica.
- **C3** Dado tocar em adicionar com sucesso, então um `item_added`; falha de estoque não gera evento.
- **C4** Dado pagamento aprovado, então o servidor grava `order_paid` com `store_id`, `session_id` (se enviado) e `is_new_to_store`, **sem** `order_id` e **sem** `user_id`.
- **C5** Dado reenvio do mesmo lote, então nada duplica (por `event_id`).
- **C6** Dado evento com campo fora do esquema (texto livre, `user_id`), então a API o rejeita e conta a rejeição.
- **C7** Dado opt-out ligado, então 0 eventos chegam daquela sessão.
- **C8** Dado a varredura dos logs de aplicação e das tabelas de pedido e usuário, então `session_id` não aparece em nenhum (teste do QA).
- **C9** Dado 61 requisições por minuto da mesma sessão, então a 61ª recebe 429.
- **C10** Dado rede 3G instável, então o app mantém a fila e envia sem travar a tela.

### WB-362 Admin: análise de acessos — Should — dep: WB-361, WB-363, WB-356
Como fundador, quero ver o que o cliente abre, para decidir destaque, banner e apoio a lojas.
- **C1** Dado o período de 7 dias, então vejo as 10 lojas com mais visitas e os 10 produtos com mais aberturas, com variação sobre o período anterior.
- **C2** Dado a loja, então mostra "só perfil" (visita sem abrir produto) versus "abriu produto".
- **C3** Dado o funil geral e por cidade: visita, produto, sacola, checkout, pedido pago, com a conversão de cada etapa separada (não só a final).
- **C4** Dado a quebra por origem, então célula com menos de 5 sessões aparece "menos de 5".
- **C5** Dado o filtro de cidade, então todos os números respeitam.
- **C6** Dado o perfil suporte, então não acessa (dado de negócio, RN-13).
- **C7** Dado a falta de dados, então estado vazio "Ainda sem dados: o app precisa ser atualizado".

### WB-363 Agregação, mínimo de 5 e retenção — Must — dep: WB-361
Como Webag, quero agregar e apagar o bruto, para entregar só dado anônimo e curto.
- **C1** Dado o fim do dia, então o job gera contagens por loja, produto, origem, cidade e dia sem `session_id`; reexecutar não duplica.
- **C2** Dado o bruto com mais de 90 dias, então a partição é removida e o agregado permanece.
- **C3** Dado a regra RN-A2, então nenhuma API devolve célula com menos de 5 (teste com 4 e com 5 sessões).
- **C4** Dado o parâmetro de retenção alterado, então vale na próxima execução e fica auditado.
- **C5** Dado falha do job, então alerta ao admin e o dia é reprocessável.

### WB-364 Lojista: painel Análises (visitas, funil e origem) — Should — dep: WB-363, WB-366
Como lojista, quero ver visitas e conversão da minha loja, para ajustar vitrine e preço.
- **C1** Dado módulo ativo e 7 dias, então vejo visitas, aberturas de produto, adicionados à sacola e pedidos, cada etapa com a conversão sobre a anterior, e o comparativo com os 7 dias anteriores.
- **C2** Dado a quebra por origem (banner, home, busca, categoria, favoritos, link externo, push), então cada barra com menos de 5 sessões mostra "menos de 5".
- **C3** Dado loja com menos de 30 visitas, então só totais e "Poucos dados ainda".
- **C4** Dado funcionário sem a permissão `vendas_valores`, então não vê valores em R$ (RN-13); contagens seguem a permissão `analises`.
- **C5** Dado pedido sem sessão (web, opt-out), então as vendas incluem o pedido e o funil não, com a nota "Pedidos sem medição de navegação: N".
- **C6** Dado que outra loja tenta acessar o ID desta, então 404 (RBAC por loja).
- **C7** Dado nenhuma tela ou arquivo, então nome, telefone, endereço ou lista de pessoas jamais aparecem.

### WB-365 Lojista: produto visto versus vendido e horário de pico — Should — dep: WB-364
Como lojista, quero saber o que atrai e não vende, para agir.
- **C1** Dado a lista de produtos, então cada linha mostra aberturas, adicionados à sacola e unidades vendidas no período (vendas exatas do banco).
- **C2** Dado produto com mais de 20 aberturas e nenhuma venda, então a linha traz o selo "Muito visto, nada vendido".
- **C3** Dado o horário de pico, então um gráfico por hora (0 a 23) das visitas, com células abaixo de 5 ocultas.
- **C4** Dado produto com menos de 5 aberturas, então mostra "menos de 5".

### WB-366 Admin: ativar, testar e suspender o módulo por loja — Should — dep: WB-350
Como fundador, quero ligar o módulo por loja e controlar o teste, para cobrar quem usa.
- **C1** Dado a ficha da loja, quando ativo "Teste de 30 dias", então o estado vira `TESTE` com a data final e o lojista é avisado.
- **C2** Dado o fim do teste sem ativação, então o estado vira `VENCIDO` e a tela do lojista mostra o convite, sem apagar dados.
- **C3** Dado "Registrar pagamento até 30/12" (financeiro), então o estado é `ATIVO` com `valido_ate` e o preço do momento; fica na auditoria.
- **C4** Dado vencimento, então 7 dias antes o lojista vê um aviso no painel e por e-mail.
- **C5** Dado perfil operação, então não ativa nem registra pagamento.
- **C6** Dado a loja suspensa, então o módulo fica inacessível e o valor não é recalculado.
- **C7** Dado nenhum desconto no repasse, então o extrato do lojista (WB-076) não muda (teste de regressão do ledger).

### WB-367 Lojista: porta falsa e convite do módulo — Should — dep: WB-078
Como fundador, quero medir interesse antes de construir, para não gastar com módulo sem demanda.
- **C1** Dado o painel inicial, então há um cartão "Análises da sua loja: visitas, funil e origem" com o botão "Quero testar".
- **C2** Dado o toque, então registra `analytics_interest_clicked` e mostra "Avisamos você quando abrir. Quanto você pagaria por mês?" com 4 faixas e um campo opcional curto (sem pedir dado pessoal além do que o lojista já tem no cadastro).
- **C3** Dado o fundador, então vê no admin quantas lojas clicaram e as faixas escolhidas.
- **C4** Dado que o módulo ainda não existe, então a tela não promete data nem recurso (sem "em breve" com data).

### WB-368 Origem por canal do link da loja — Could — dep: WB-361
Como lojista, quero saber qual rede traz visitas, para divulgar onde funciona.
- **C1** Dado o link compartilhável da loja, então o lojista gera links por canal (Instagram, WhatsApp, outro) da lista curada.
- **C2** Dado visitas pelo link do Instagram, então a quebra por origem mostra "Instagram".
- **C3** Dado `?o=` com valor fora da lista, então vira `external_link` genérico.

### WB-369 Direitos do titular e medição — Must — dep: WB-217, WB-215
Como cliente, quero que a exclusão da minha conta e o pedido de dados sigam valendo, para ter meus direitos.
- **C1** Dado exportar meus dados (WB-212), então o arquivo informa que a medição de uso é anônima e não está ligada à conta.
- **C2** Dado excluir conta, então nenhuma tabela nova de analytics tem coluna ligada a `users` (teste de classificação SEC-158/167 passa).
- **C3** Dado pedido de oposição (LGPD art. 18 §2) por canal do titular, então a operação orienta o opt-out do app e registra o atendimento.

## Eventos de analytics do próprio módulo (servidor, sem pessoa)
`analytics_screen_viewed` (store_id), `analytics_interest_clicked` (store_id, faixa), `store_module_changed` (store_id, de, para), `analytics_job_run` (dia, linhas, duração).

## Dependências e riscos
| Item | Tratamento |
|---|---|
| Parecer sobre base legal e retenção (J24) | **Bloqueia WB-361 em produção**; em desenvolvimento e staging segue |
| Política de privacidade e Data Safety/App Privacy | Atualizar antes de publicar (Security: inventário) |
| Dado "anônimo" que não é (log, header, pedido) | RN-A3, teste de varredura; Security revisa |
| Pouco volume no piloto | Mínimo de 5 e de 30; módulo só após RN-A8 |
| Lojista não paga | Porta falsa e entrevista (F5); descontinuar o módulo se < 3 aceitam |
| Cobrança manual vira trabalho do fundador | Gatilho de automação (F6) |
| Fraude de visita (loja ou concorrente inflando) | Rate limit, app sem envio para conta de equipe, mínimo por célula |
| Nota fiscal do serviço | Contador do fundador (J11) |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Legítimo interesse com opt-out ou opt-in? Retenção de 90 dias? (J24) | Encarregado/advogado; Security |
| `session_id` entre cliente e servidor sem passar por log: onde (cabeçalho, corpo)? | backend-dev e Security |
| Web (site público) coleta? Recomendo não na v1.1 | CEO |
| Preço do módulo, duração do teste e formato de cobrança | Fundador (F5, F6) |
| O app do lojista (PWA) precisa do mesmo opt-out? Não coleta o lojista | designer |
