# PRD v1.1: Admin com mais autonomia e painel de gráficos

Status: pronta para sprint (lado do PO; ver `backlog.md` §10.7). **WB-359 cortada na DEC-104 (só o export); a proteção das consultas passou para a WB-356** | Dono: product-owner | Data: 2026-11-22 | Atualizado: 2026-11-22 (DoR: controles C-ADM-* e C-DSH-*, DEC-108, matriz métrica x dimensão) | Histórias: WB-350 a WB-358
Base: `prd/admin.md` (WB-100 a WB-125), `regras-de-negocio.md` RN-13 (papéis), RN-15 (métricas), RN-16 (estados da loja); DEC-073 e DEC-074 (menor privilégio, sem "revelar dado" na 1.0); ADR-014 (operação do admin); `docs/arquitetura/modelo-dados.md` (`audit_log`, `reports`).

## Problema
- **Quem sofre:** o fundador e, depois, o time de operação. Hoje o admin aprova, suspende, edita dados da loja (WB-104) e define comissão (WB-105), mas **não corrige produto, preço, estoque, horário ou pausa de uma loja**; o lojista que não sabe cadastrar fica parado. E os relatórios são fixos (WB-122, WB-125): o fundador não consegue perguntar "GMV por categoria nas últimas 4 semanas, só entrega".
- **Evidência:** o piloto tem 5 lojas de lojistas com pouco tempo (persona P2) e um fundador sozinho (P3). O brief §3.3 pede "edição de qualquer dado" da loja. Pedido do fundador (2026-11-22). Frequência: todo dia de piloto.
- **Valor de negócio:** o admin que cadastra pelo lojista é o caminho mais rápido de ativar loja (`[HIPÓTESE]` validar no piloto: lojas com 1º produto publicado em até 24 h da aprovação).

## Objetivo e métrica de sucesso
| Objetivo | Métrica `[HIPÓTESE]` | Fonte |
|---|---|---|
| Admin resolve pedido de ajuste de loja sem pedir acesso nem código | 90% dos pedidos de ajuste resolvidos em 1 sessão do admin; tempo para trocar um preço <= 30 s | observação + `audit_log` |
| Toda alteração do admin em loja é rastreável e o lojista é avisado | 100% das edições com autor, motivo, antes/depois e aviso | `audit_log` |
| O fundador responde perguntas de negócio sem pedir relatório ao dev | >= 5 painéis salvos e usados por semana pelo fundador após 4 semanas | uso do painel |
| Painéis rápidos e seguros | p95 de widget <= 2 s; 0 consultas livres; 0 achados Alto de segurança | testes de carga e revisão |

## Fora do escopo (com gatilho de volta)
| Item | Motivo | Gatilho |
|---|---|---|
| **Entrar como o lojista** (sessão de escrita em nome dele) | Apaga a trilha de "quem fez"; vira atalho de abuso | Nunca; usar edição pelo admin com auditoria |
| Editar CPF/CNPJ, documentos, conta de recebimento (OAuth do MP) | Dado fiscal e de dinheiro; fluxo de análise de dados existe (RN-16, WB-055 C4) | Nunca pelo admin direto |
| "Revelar dado" do cliente no admin, redefinir senha | Fase 2 (DEC-074b, DEC-071) | Gatilho do `revisao-funcional.md` §7 |
| SQL livre ou consulta personalizada | Risco de dado pessoal, custo e injeção | Nunca; só métricas catalogadas |
| Alertas e relatórios agendados por e-mail a partir do painel | Sem demanda | 3 pedidos do fundador |
| Compartilhar painel com link externo | Dado financeiro | Nunca; só dentro do admin |
| Drill-down até o cliente individual | LGPD | Nunca nos painéis (pedido a pedido já existe em WB-108) |
| Mapa de calor, funil, coorte como tipos de gráfico | Esforço | Funil entra com as análises (WB-368); coorte: 3 pedidos |
| Alteração em lote de preço de várias lojas de uma vez | Risco de erro em dinheiro | Pedido concreto da operação |
| Previsão e IA gerando gráficos | Sem evidência | Depois dos 3 primeiros meses de dados |

## Usuários e cenários
| Persona | Cenário |
|---|---|
| Yago (super admin) | Seu Marcos manda 30 fotos pelo WhatsApp; o fundador cadastra os produtos na loja dele, com motivo "solicitado pelo lojista (WhatsApp, 24/11)". O lojista recebe aviso e vê tudo no painel dele |
| Operação | Loja esqueceu de pausar na hora do almoço; a operação pausa por 2 h, com motivo |
| Suporte | Para ajudar um lojista ao telefone, abre "Ver como o lojista" (só leitura) e vê o que ele vê |
| Financeiro | Muda a comissão de uma categoria com vigência e vê o impacto no "Você recebe" |
| Yago | Monta o painel "Quinzena" (GMV, pedidos, ticket, novos clientes, cancelamentos por loja) e o duplica para "Mês passado" |

## Requisitos funcionais
**A. Gestão de lojas**
1. Ficha 360 da loja: dados, status, horário e pausa, comissão efetiva, catálogo, pedidos recentes, indicadores (30 dias), cupons e campanhas, histórico de alterações.
2. Edição pelo admin de: dados cadastrais não fiscais (nome de exibição, descrição, contato, WhatsApp), horários, feriados, pausa, modos entrega e retirada, tempo de preparo, política de trocas, status (RN-16).
3. Edição de catálogo pelo admin: produto, variação, **preço**, estoque, ativar e pausar, fotos, seções; ação em massa; criar produto (usa o cadastro rápido, `prd/v1-1-cadastro-rapido.md`).
4. "Ver como o lojista": visão **somente leitura** das telas do lojista, com faixa fixa "Visualização do admin". Nível **visualizador** (DEC-119, DEC-120): **nunca** mostra dado pessoal de cliente (só primeiro nome e bairro, nem em pedido ativo), CPF/CNPJ, razão social, comissão, "Você recebe" nem conta de recebimento. Para dado de cliente, o admin usa a ficha do pedido (WB-108), não esta visão.
5. Comissão por loja e por categoria com vigência (WB-105), no mesmo lugar, com prévia do "Você recebe".
6. Trilha de auditoria por loja, filtrável por autor, tipo e período; "restaurar valor anterior" para preço e estoque.
7. Aviso automático ao lojista (painel e e-mail) de toda alteração do admin em preço, estoque, status, horário e pausa, com o motivo.
8. Permissões por perfil (matriz abaixo), validadas no servidor.

**B. Painel de gráficos**
9. **Catálogo de métricas e dimensões** fixo no servidor, com definição (RN-15) e sensibilidade (geral, operacional, financeira).
10. **Painéis prontos**: Visão geral, Vendas, Lojas, Entrega, Cupons (e Acessos quando existir WB-362).
11. **Construtor**: escolher métrica, dimensão, tipo de gráfico, filtros e período; salvar, renomear, duplicar, reordenar e excluir painéis e widgets.
12. Filtros globais do painel: período (hoje, 7, 30, 90 dias, mês atual, mês passado, personalizado), cidade, loja, categoria, modo, campanha.
13. Comparar com o período anterior (variação em % no número e linha tracejada).
14. Exportar o widget em CSV (valores em reais, UTF-8, proteção de fórmula, SEC-156).
15. Rótulo "Atualizado às HH:MM" e aviso quando o dado está defasado.

## Regras de negócio
**Matriz de permissões (acrescenta à RN-13; o servidor confere, nunca só a tela)**
| Ação | Super admin | Operação | Financeiro | Suporte |
|---|---|---|---|---|
| Ver ficha, histórico e "Ver como o lojista" | sim | sim | sim | sim |
| Editar horário, pausa, descrição, contato, modos | sim | sim | não | não |
| Criar e editar produto, estoque, fotos, pausar | sim | sim | não | não |
| Alterar **preço** | sim | sim, só com motivo do catálogo abaixo | não | não |
| Alterar status da loja (suspender, reativar) | sim | sim (RN-16) | não | não |
| Alterar comissão por loja e categoria | sim | não | sim | não |
| Painéis: métricas gerais e operacionais | sim | sim | sim | só gerais |
| Painéis: métricas financeiras (receita, take rate, custo de logística, custo de campanha) | sim | não | sim | não |
| Exportar CSV de widget | sim | operacional | sim | não |

**Regras de edição**
- **Motivo obrigatório** em toda edição do admin em loja (lista: solicitado pelo lojista, correção de erro, moderação, decisão operacional, outro com texto). "Solicitado pelo lojista" exige canal e data em texto curto. Alteração de **preço** só aceita os motivos: solicitado pelo lojista, erro evidente, ordem de fiscalização ou do jurídico, campanha acordada.
- Alteração de preço maior que `admin_preco_variacao_max_pct` (padrão 30, parâmetro) pede confirmação extra com o valor novo e o "Você recebe". **Redução acima de 50% só pelo super admin** (DEC-103 D-04).
- **Motivo por sessão (DEC-108):** o admin escolhe o motivo ao abrir a loja e a tela o pré-preenche; **cada alteração grava o motivo** no `audit_log` e mostra confirmação com antes e depois; o motivo da sessão vale por 30 min ou até trocar de loja; preço exige um dos 4 motivos permitidos a cada edição.
- **Aviso ao lojista:** pausa, status e horário avisam na hora (painel e e-mail). Preço, estoque e catálogo: uma linha por alteração no painel e **um e-mail-resumo a cada 10 min** (até 20 itens e "+N"). Ação em massa: **1 aviso agregado** com o motivo (não 200).
- **"Ver como o lojista":** credencial de visualização ligada a (admin, loja, motivo), válida por até 30 min, **sem renovação** (para continuar, abre outra, com novo motivo), encerrada com a sessão do admin; **uma visão ativa por admin**; só leituras da lista fechada de telas do lojista (pedidos, produtos, trocas, avaliações, dados e horários da loja); nível visualizador fixo, mesmo se o admin for membro da loja (threat model §14, DEC-119). Grava abertura e encerramento (com a causa e o total de leituras) no `audit_log`, **não** as telas navegadas. O acesso a dado pessoal de cliente **não** passa por aqui: é a ficha do pedido no admin (WB-108 C2: nome abreviado, e-mail e celular parciais, endereço só com bairro e cidade); "Revelar" segue cortado (DEC-071) e só volta pelo gatilho da WB-352 C14.
- **Concorrência:** cada produto tem versão; se o lojista alterou no meio da edição, o admin vê "O lojista alterou este produto agora" e escolhe recarregar. Nunca sobrescreve em silêncio.
- Estoque nunca menor que o reservado (RN-06). Produto ativo exige foto, nome e preço (mesmas regras do lojista, WB-060).
- O admin **não** edita: CPF/CNPJ, razão social, documentos, conta de recebimento, dados bancários, equipe da loja.
- O lojista vê no próprio painel o que o admin mudou, com autor "Webag" (sem nome de pessoa) e motivo. Cláusula nos Termos do Lojista: J27.
- Comissão mudada: o aviso ao lojista segue manual por e-mail (DEC-081); o histórico guarda vigência.

**Regras dos painéis**
- Só métricas do catálogo; definição única (RN-15). Parâmetros validados no servidor; nada de texto livre na consulta.
- **Métricas v1.1:** GMV, GMV concluído, pedidos pagos, pedidos entregues, ticket médio, receita Webag (financeira), take rate = receita Webag / GMV concluído (financeira), novos clientes (1º pedido pago), clientes ativos, recompra em 30 dias (só mensal e agregada), cancelamentos (taxa e quantidade), tempo de aceite (mediana e p90), entregues na faixa prometida (%), tempo do pagamento à entrega (mediana e p90), custo de logística por entrega (financeira), lojas ativas, usos de cupom, desconto total, desconto Webag (financeira), custo por cliente novo (financeira). Com o analytics (`prd/v1-1-analises-lojista.md`): sessões, visitas à loja, visitas ao produto, adicionados à sacola e conversão.
- **Dimensões:** tempo (dia, semana, mês), cidade, loja, categoria (da loja; para GMV por item, categoria do produto), modo (entrega ou retirada), meio de pagamento, campanha ou cupom, faixa de distância da entrega. **Fora:** cliente, motoboy individual, endereço, bairro (alvo muito pequeno).
- Cada métrica declara as dimensões compatíveis (ex.: "novos clientes" não tem dimensão "loja de 2º pedido"); combinação incompatível é recusada com texto (matriz abaixo).
- **Baixa amostra (DEC-108):** taxa, ticket médio e comparação com o período anterior pedem **20 pedidos** no período; mediana e p90 pedem **5**; abaixo disso a tarja diz "Poucos dados" e some o percentual. Métricas de acesso: célula com menos de 5 é suprimida (análises RN-A2).
- **Painéis prontos (5):** Visão geral, Vendas, Lojas, Entrega, Cupons; "Acessos" quando existir a WB-362. **"Enviar cópia a outro admin"** (no lugar de "Compartilhar"): leva só a definição, nunca dados; métrica sem permissão do destinatário aparece bloqueada e não é consultada.

**Matriz métrica x dimensão** (T = tempo dia/semana/mês, CI = cidade, LO = loja, CA = categoria, MO = modo, PG = meio de pagamento, CP = campanha ou cupom, FD = faixa de distância, OR = origem; o registro do servidor espelha esta tabela e é a lista fechada da C-DSH-04):

| Métrica (definição em uma frase) | Dimensões permitidas |
|---|---|
| GMV: soma do total pago pelo cliente dos pedidos recebidos, sem cancelados (RN-15) | T, CI, LO, CA, MO, PG, CP, FD |
| GMV concluído: o mesmo, só pedidos entregues | T, CI, LO, CA, MO, PG, CP, FD |
| Pedidos pagos: pedidos com pagamento aprovado | T, CI, LO, CA, MO, PG, CP, FD |
| Pedidos entregues: pedidos que chegaram a "entregue" | T, CI, LO, CA, MO, FD |
| Ticket médio: GMV concluído dividido por pedidos entregues (RN-15) | T, CI, LO, CA, MO, PG, CP |
| Receita Webag (financeira): comissão, taxa de entrega e taxa de serviço, menos desconto Webag (RN-10) | T, CI, LO, CA, MO, PG, CP |
| Take rate (financeira): receita Webag dividida pelo GMV concluído | T, CI, LO, CA |
| Novos clientes: clientes cujo 1º pedido pago ocorreu no período | T, CI, LO, CP |
| Clientes ativos: clientes com pedido pago no período | T, CI, LO |
| Recompra em 30 dias: % de clientes com 2 ou mais pedidos entregues em 30 dias após o 1º (RN-15) | só T (mês) e CI, agregada |
| Cancelamentos (taxa e quantidade): cancelados e recusados sobre pedidos recebidos (RN-15) | T, CI, LO, CA, MO, PG, FD |
| Tempo de aceite (mediana e p90): do pedido recebido ao aceite (RN-15) | T, CI, LO, MO |
| Entregues na faixa prometida (%): entregues até o fim da faixa aceita (RN-19) | T, CI, LO, FD |
| Tempo do pagamento à entrega (mediana e p90) | T, CI, LO, FD |
| Custo de logística por entrega (financeira): custo lançado da corrida (RN-18) | T, CI, LO, FD |
| Lojas ativas: aprovadas com 1 ou mais pedido entregue nos últimos 30 dias (RN-15) | T, CI, CA |
| Usos de cupom, desconto total, desconto Webag (financeira), custo por cliente novo (financeira) | T, CI, LO, CP |
| Sessões, visitas à loja, visitas ao produto, adicionados à sacola, conversão (acessos; `analises` RN-A5) | T, CI, LO, OR (CA só em visitas ao produto); célula < 5 suprimida |
| Tempo do OK da loja (mediana e p90), % de saídas por fonte (loja, sistema, admin) | T, CI, LO |
| % de entregas com mapa, % de tempo sem sinal, erro mediano do ETA | T, CI (nunca motoboy individual) |
- **Tipos de gráfico:** número (KPI), linha, barra, barra empilhada, rosca (até 6 fatias), tabela ordenável. Rosca e pizza só para parte do todo.
- **Limites:** período máximo 400 dias; 1 métrica por widget (até 3 sem dimensão, como linhas); no máximo 2 dimensões e 10 categorias exibidas mais "Outros"; 12 widgets por painel; 20 painéis por usuário; 5 filtros por widget; resposta até 5.000 pontos.
- **Painéis são privados** do usuário; duplicar cria cópia dele. Painéis prontos pertencem ao sistema (não editáveis; duplicáveis).
- Fuso `America/Sao_Paulo`; semana começa na segunda; dia fecha à meia-noite.

## Requisitos não funcionais
- **Desempenho:** p95 de um widget <= 2 s com 12 meses de dados; painel de 8 widgets carrega em <= 4 s com cache frio e <= 1 s com cache (`[HIPÓTESE]`; testes de carga com volume de 10 mil clientes). Consulta com tempo limite de 5 s e cancelamento. Cache de 5 min por (métrica, parâmetros). Escala: leitura sobre **agregados diários** (tabela de resumo) e não sobre `orders` direto (decisão técnica dos devs); atualização por hora.
- **Segurança:** consultas parametrizadas sobre registro de métricas; lista de permissão de métricas, dimensões e filtros; limite de 30 consultas por minuto por usuário; auditoria de exportação; sem dado pessoal em nenhum widget; revisão do Security antes do release (consulta é superfície de ataque).
- **Acessibilidade:** gráfico com resumo em texto e tabela alternativa; não depender só de cor; teclado.
- **LGPD:** painéis agregados; "Ver como o lojista" é mais restrito que a RN-14: não expõe dado pessoal de cliente nem em pedido ativo (SEC-207, DEC-120) e grava acesso.

## Histórias e critérios de aceite

### WB-350 Ficha 360 da loja no admin — Must — dep: WB-104, WB-105
Como admin, quero ver tudo de uma loja em um lugar, para agir sem trocar de tela.
- **C1** Dado uma loja, então vejo dados, status, comissão efetiva (loja, categoria ou padrão), horário, pausa, número de produtos ativos, pedidos e GMV dos últimos 30 dias, cancelamentos e histórico de alterações.
- **C2** Dado perfil suporte, então vejo a ficha sem botões de edição.
- **C3** Dado loja sem pedidos, então os indicadores mostram "Sem pedidos nos últimos 30 dias".
- **C4** Dado o histórico, então filtro por autor, tipo e período e cada linha mostra antes, depois e motivo.

### WB-351 Admin edita dados, horário, pausa e status — Must — dep: WB-350, WB-056
Como admin, quero ajustar horário, pausa e dados da loja, para resolver pedidos do lojista na hora.
- **C1** Dado a operação pausando a loja por 2 h, quando informa o motivo, então a loja fica fechada, o lojista recebe aviso no painel e por e-mail e `audit_log` registra autor, antes, depois e motivo.
- **C2** Dado edição sem motivo, então o botão salvar mostra "Informe o motivo".
- **C3** Dado perfil financeiro tentando editar horário, então o servidor recusa (403) e a tela não mostra a ação.
- **C4** Dado CPF/CNPJ ou conta de recebimento, então não existe campo de edição.
- **C5** Dado alteração de status, então só as transições da RN-16.
- **C6** (C-ADM-05) Dado o lojista editando o mesmo campo em paralelo, então o admin vê o conflito e não sobrescreve: a gravação é `UPDATE ... WHERE version = :v` e versão diferente retorna 409.
- **C7** (C-ADM-03) Dado o corpo da edição, então o DTO é `.strict()` com lista fechada de campos; `cnpj`, `mpAccountId`, `members`, razão social, documentos ou status fora da RN-16 retornam 422; o motivo vem do catálogo, com texto de até 200 caracteres.

### WB-352 "Ver como o lojista vê" (somente leitura) — Must — dep: WB-350, WB-216
Como suporte, quero ver o painel como o lojista vê, para ajudá-lo sem pedir senha.
- **C1** Dado o botão "Ver como o lojista" e o motivo, então abre as telas do lojista com faixa "Visualização do admin" e nenhum botão que altere dado.
- **C2** (SEC-207, DEC-120) Dado pedido de cliente nessa visão, **inclusive pedido ativo** (recebido, aceito, em preparo, saiu para entrega), então aparecem só primeiro nome, bairro, itens, preços, totais, status e linha do tempo; sobrenome, telefone, e-mail, CPF, rua, número, complemento, CEP, coordenadas, observação do cliente e código de entrega não aparecem (a RN-14 vale para o lojista, não para esta visão).
- **C3** Dado a abertura, então grava em `audit_log` quem, qual loja, quando e o motivo.
- **C4** Dado tentativa de envio de formulário nessa visão por requisição direta, então o servidor recusa (403).
- **C5** Dado a sessão do admin expirando, então a visão fecha.
- **C6** (C-ADM-02) Dado a visão aberta, então a credencial de visualização é ligada a (admin, loja, motivo), vale até 30 minutos e encerra com a sessão do admin; o ator no `audit_log` continua sendo o admin.
- **C7** (C-ADM-02) Dado qualquer método diferente de GET e HEAD, ou GET com efeito (marcar como lido, revelar contato, baixar documento ou exportação), então 403 na visão (guard global).
- **C8** (C-ADM-02, SEC-207, VA-11 a VA-14) Dado qualquer leitura permitida na visão, então a **resposta da API** já vem sem os campos proibidos, em pedido ativo ou não (não só a tela): pedido sem sobrenome, telefone, e-mail, CPF, endereço além do bairro, observação e código de entrega; troca sem texto livre e fotos do cliente nem dados de reembolso; loja sem CPF/CNPJ, razão social, comissão, tarifa, conta de recebimento e contato de notificação; produto sem "Você recebe" nem campo de comissão. Teste: o mesmo pedido ativo lido pelo lojista traz o dado e lido pela visão não traz.
- **C10** Dado admin que já tem uma visão aberta, quando abre outra (mesma loja ou outra), então a primeira deixa de valer na hora e a nova vale por até 30 min; dado a 11ª abertura na mesma hora, então recusa com "Muitas aberturas. Tente em alguns minutos." (429).
- **C11** Dado a visão com 30 min completos, então a próxima leitura é recusada e a tela mostra "A visualização terminou. Abra de novo para continuar" com novo motivo; não há renovação automática. Dado o admin tocando "Sair da visualização", então a credencial deixa de valer imediatamente e o encerramento é gravado.
- **C12** Dado a visão aberta, quando se tenta ler o que fica fora da lista (documentos, conta de recebimento, equipe, convites, financeiro, repasses, cupons, comanda, chat, exportações, notificações), então 403 e a tela mostra a etiqueta "Só o lojista" no lugar; dado a mesma credencial usada em outra loja, em outro navegador ou por outro admin, então 403 sem nenhum dado.
- **C13** (nível fixo) Dado admin que também é membro ou dono da loja, quando abre a visão, então recebe o mesmo nível visualizador (C2 e C8), nunca o de dono.
- **C14** (caminho alternativo; dado de cliente para suporte) Dado que o suporte precisa de dado de cliente (ex.: lojista diz "o cliente não atende"), então o caminho é a ficha do pedido no admin (WB-108 C2), aberta pelo número do pedido: nome abreviado, e-mail e celular parciais, endereço só com bairro e cidade, mais itens, pagamento e linha do tempo; o contato com o cliente sai pelo canal da Webag (suporte Webag ou operador de entrega ativa, `prd/logistica.md`), nunca por dado copiado do lojista. Dado que a ficha precisa ser aberta, então a abertura grava `audit_log` (quem, pedido, quando); dado perfil sem `orders:read`, então 403. **Não há "Revelar" dado completo na v1.1** (DEC-071 cortou WB-108 C4); `[HIPÓTESE]` gatilho de volta: 3 casos em que o suporte não resolveu sem o dado completo, e então volta com motivo, auditoria por pedido e perfil limitado, parecer do Security.
- **C15** (Should; D-09 do threat model) Dado a abertura da visão, então o lojista vê, no feed de alterações do painel dele, "A Webag visualizou o painel da sua loja em <data e hora>", sem nome de pessoa e sem o texto da nota do admin.
- **C9** (C-ADM-02) Dado abrir sem motivo, então 422; dado a abertura, então a linha de `audit_log` existe antes de qualquer dado ser devolvido; o encerramento ou a expiração também é gravado; as telas navegadas não são gravadas.

### WB-353 Admin edita catálogo e preços da loja — Must — dep: WB-350, WB-060, WB-061, WB-066
Como operação, quero cadastrar e corrigir produtos pela loja, para ativar o lojista que não consegue.
- **C1** Dado a edição de preço de R$ 50,00 para R$ 45,00 com motivo "solicitado pelo lojista (WhatsApp, 24/11)", então o preço vigente muda, o lojista é avisado ("A Webag alterou o preço de X de R$ 50,00 para R$ 45,00") e `audit_log` guarda tudo.
- **C2** Dado motivo fora da lista permitida para preço, então a ação é recusada.
- **C3** Dado variação de preço acima de 30%, então a tela pede confirmação mostrando o novo "Você recebe".
- **C4** Dado estoque menor que o reservado, então bloqueia com aviso (RN-06).
- **C5** Dado que o lojista salvou o produto entre a abertura e o salvar do admin, então o admin vê "O lojista alterou este produto agora" e nada é sobrescrito.
- **C6** (C-ADM-07) Dado ação em massa (pausar, mudar estoque) sobre até 200 produtos, então mostra prévia, exige motivo e executa em uma auditoria por item; 201 itens retornam 422; o limite é de 10 ações em massa por hora por admin.
- **C7** Dado perfil sem permissão de catálogo, então 403.
- **C8** Dado produto criado pelo admin, então nasce `ATIVO` só com foto, nome e preço, e a moderação (WB-107) vale igual.
- **C9** (C-ADM-04, DEC-103 D-04) Dado redução de preço acima de 50% feita por perfil que não é super admin, então 403; dado variação acima de 30%, então a confirmação do C3.
- **C10** (C-ADM-04) Dado produto com preço alterado pelo admin há menos de 24 h, quando é comprado por conta ligada a admin ou a membro da loja, então a operação recebe alerta.
- **C11** Dado alterações de preço, estoque ou catálogo da mesma loja em até 10 minutos, então o lojista recebe 1 e-mail-resumo (até 20 itens e "+N") e uma linha por alteração no painel; pausa, status e horário avisam na hora; ação em massa gera 1 aviso agregado com o motivo.

### WB-354 Auditoria por loja e restaurar valor — Should — dep: WB-353, WB-123
Como fundador, quero ver quem mudou o quê numa loja e desfazer, para corrigir erro rápido.
- **C1** Dado uma alteração de preço, quando clico "Restaurar", então o preço anterior volta com novo registro (não apaga o histórico) e o lojista é avisado.
- **C2** Dado o valor anterior já alterado depois por outra pessoa, então o sistema avisa e não restaura sem confirmação.
- **C3** (C-ADM-09) Dado exportação do histórico, então CSV com proteção de fórmula, com permissão própria, até 10 mil linhas, sem dado pessoal e auditada; perfil suporte recebe 403.
- **C4** (C-ADM-06, DEC-103 D-06) Dado o papel de banco da API, quando tenta `UPDATE audit_log` ou `ALTER TABLE audit_log DISABLE TRIGGER`, então erro: a API roda com papel que **não é dono** da tabela (migração com outro papel); o gatilho append-only continua valendo.
- **C5** (C-ADM-08) Dado "Restaurar", então cria novo registro e a contagem de linhas do `audit_log` só aumenta; se o valor mudou depois, pede confirmação.
- **C6** (WB-352 C3, C10, C11) Dado o filtro "Acesso" do histórico, então lista abertura e encerramento de "Ver como" com admin, motivo, causa do fim (saiu, expirou, substituída, sessão encerrada) e total de leituras, sem as telas navegadas e sem dado pessoal; dado perfil sem permissão de ver a ficha, então 403.

### WB-355 Permissões por perfil nas ações novas — Must — dep: WB-100, WB-350
Como fundador, quero que cada perfil faça só o que lhe cabe, para limitar o dano de um erro.
- **C1** (C-ADM-01) Dado a matriz da seção Regras, então cada linha tem teste automatizado de permissão (4 perfis x ações) e um teste de contrato percorre **todas** as rotas `/v1/admin/*` do `openapi.yaml` com os 4 perfis e um perfil sem permissão, comparando com a matriz; rota nova sem permissão declarada falha no CI; o perfil é lido do banco a cada requisição.
- **C2** Dado perfil operação tentando alterar comissão, então 403 e tentativa registrada.
- **C3** Dado perfil novo sem permissão explícita, então nega por padrão.

### WB-356 Catálogo de métricas e dimensões, e proteção das consultas — Must — dep: WB-122
Como fundador, quero que cada número tenha uma definição única, para não discutir "qual GMV".
- **C1** Dado a métrica GMV, então usa a definição RN-15 e a tela mostra a definição em uma frase.
- **C2** Dado combinação métrica x dimensão incompatível, então a API devolve 422 com o motivo e a tela só oferece as compatíveis.
- **C3** Dado métrica financeira e usuário sem permissão, então não aparece no construtor e a API devolve 403.
- **C4** Dado conjunto de pedidos conhecido (seed), então cada métrica bate com um cálculo independente (teste contra oráculo).
- **C5** Dado consulta com parâmetro fora da lista (métrica, dimensão ou filtro desconhecido), então 422, sem executar nada.
- **C6** (C-DSH-01) Dado a requisição `{metricId, dimensionIds[], filters[{dimensionId, op: eq ou in, values}], period}`, então ids são validados contra o registro do servidor e o SQL vem **só** do registro, com valores como parâmetro (`sql.raw` com entrada é proibido por regra de lint no módulo); fuzz com `'; drop`, nome de coluna, `__proto__` e id desconhecido retorna 422 e executa **zero** consultas.
- **C7** (C-DSH-04) Dado o registro, então não existe dimensão de cliente, motoboy, endereço ou bairro (teste da lista fechada = matriz da seção Regras); métricas de acesso herdam a supressão do `analises` RN-A2.
- **C8** (C-DSH-02) Dado métrica financeira aquecida no cache pelo financeiro, quando o suporte pede a mesma, então 403: a permissão por sensibilidade é checada **antes** de ler o cache e a chave do cache traz métrica e parâmetros normalizados.
- **C9** (C-DSH-03; vinda da WB-359 cortada) Dado qualquer consulta de painel, então roda em transação somente leitura com `statement_timeout` de 5 s, em pool separado de 2 conexões (ou réplica), só sobre agregados diários; 30 consultas por minuto e 2 simultâneas por usuário (a 31ª: 429); limites de 400 dias, 2 dimensões, 5 filtros e 5.000 pontos conferidos no servidor (401 dias: 422); consulta lenta forçada é cancelada com "Muito pesado: reduza o período ou o filtro".
- **C10** (C-DSH-03) Dado carga de 20 painéis abertos com 10 mil clientes simulados, então p95 <= 2 s por widget e o p95 do checkout no teste de carga não muda; a mesma consulta repetida em 5 minutos vem do cache e indica "em cache".
- **C11** Dado a resposta de uma consulta, então traz `atualizado_em`, `em_cache` e, por célula, `n` e `suprimida`; célula suprimida não traz valor nem `n`.

### WB-357 Painéis prontos com filtros globais — Should — dep: WB-356
Como fundador, quero abrir painéis prontos, para ter resposta no primeiro dia.
- **C1** Dado "Visão geral", então mostra GMV, pedidos, ticket médio, novos clientes, cancelamentos e entregues na faixa, com variação sobre o período anterior.
- **C2** Dado o filtro de cidade, então todos os widgets do painel respeitam.
- **C3** Dado período sem dados, então cada widget mostra "Sem dados no período" e não zero enganoso.
- **C4** Dado o painel pronto, quando duplico, então ganho uma cópia editável.
- **C5** Dado o rótulo "Atualizado às HH:MM", então reflete a última atualização dos agregados.
- **C6** Dado a lista de painéis prontos, então traz Visão geral, Vendas, Lojas, Entrega e Cupons (Acessos só com a WB-362), todos duplicáveis e nenhum editável.

### WB-358 Construtor de widgets, salvar e duplicar painéis — Should — dep: WB-356
Como fundador, quero montar meus gráficos, para responder minhas perguntas sem pedir ao dev.
- **C1** Dado o construtor, quando escolho "GMV por categoria", barra, últimos 28 dias e modo entrega, então o gráfico aparece e posso salvar no painel "Quinzena".
- **C2** Dado a 13ª widget em um painel, então "Limite de 12 gráficos por painel".
- **C3** Dado período de 500 dias, então "Período máximo de 400 dias".
- **C4** Dado dimensão com 25 lojas, então mostra as 10 maiores e "Outros".
- **C5** Dado rosca com 8 categorias, então agrupa em 6 e "Outros".
- **C6** Dado painel salvo, quando duplico e renomeio, então o original fica intacto.
- **C7** (C-DSH-05) Dado outro admin, então não vê meus painéis; ler, editar ou duplicar painel de outro admin retorna 404 (filtro `owner_admin_id = :me`).
- **C8** Dado excluir painel, então pede confirmação e não afeta os prontos.
- **C9** (C-DSH-06) Dado nome de painel ou widget com até 80 caracteres, então é exibido como texto (sem HTML) e escapado no CSV: `<img onerror>` e `=1+1` saem literais.
- **C10** Dado "Enviar cópia a outro admin", então a cópia leva só a definição (nunca dados) e nasce no destinatário; widget de métrica sem permissão do destinatário aparece bloqueado e não é consultado.

### WB-359 Exportar widget — CORTADA na DEC-104 (2026-11-22); proteção das consultas movida para a WB-356 C9 a C11
Só o **export de widget em CSV** foi cortado (gatilho de volta: o fundador pedir para levar um número ao contador; o export do histórico por loja segue na WB-354 C3). **Não cortar a proteção das consultas** (limite por minuto, tempo limite, cache, carga): é o controle do risco nº 3 do threat model (pontuação 9, C-DSH-03) e vale também para os painéis prontos da R2. Os antigos C2 a C5 desta história são hoje WB-356 C9 e C10.

## Eventos de analytics (servidor)
`admin_store_edited` (store_id, field_group, reason_code), `admin_view_as_opened` (store_id), `dashboard_created`, `dashboard_duplicated`, `widget_saved` (metric, dimension, chart_type), `widget_exported`, `widget_query_slow`. Sem texto livre nem dado pessoal.

## Dependências e riscos
| Item | Tratamento |
|---|---|
| Agregados diários (tabela de resumo) | Decisão técnica dos devs; PO exige os limites acima, não o desenho |
| Termos do Lojista: "a Webag pode editar catálogo a pedido" (J27) | Advogado do fundador; sem a cláusula, só editar com "solicitado pelo lojista" |
| Erro humano em preço (dinheiro do lojista) | Motivo, confirmação acima de 30%, aviso e "restaurar" |
| Visão espelho vazar dado do cliente | Mesmo mascaramento do lojista; Security revisa |
| Painel lento com muita dimensão | Limites e cache; revisão de desempenho |
| Esforço alto para poucos usuários (RICE baixo, ver backlog §10) | Entregar painéis prontos antes do construtor |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Agregar em tabela de resumo ou visão materializada? Atualização por hora basta? | backend-dev e tech-lead |
| Biblioteca de gráficos acessível (resumo textual e tabela) | designer e mobile-dev |
| "Ver como o lojista" reutiliza as telas do lojista com um modo somente leitura ou cria páginas espelho? (o guard global da C-ADM-02 vale nos dois casos) | tech-lead |
| Perfil "suporte" pode pausar loja numa emergência? Resposta do PO: não (RN-13); a operação pausa | CEO, só se o piloto mostrar demora |
| ~~Quais painéis prontos~~ **Resolvida:** os 5 da seção Regras; o fundador ajusta depois de usar | PO |
| ~~Matriz métrica x dimensão, limiares, "Compartilhar", motivo por sessão, tempo do "Ver como"~~ **Resolvidas** (seção Regras e `v1-1-respostas-ao-time.md`); Security confirma o motivo por sessão | PO; Security |
| Cláusula de edição pelo admin nos Termos do Lojista (J27): até lá, produção só com motivo "solicitado pelo lojista" | Jurídico |
