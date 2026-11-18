# PRD: Área do Lojista (painel web responsivo)

Status: pronto para G3 (aguarda estimativa e specs) | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-050 a WB-079 e WB-227
Regras: `docs/produto/regras-de-negocio.md`; hipóteses: `docs/decisoes.md`. Origem: brief §3.2. Nota: o lojista usa o **painel web** (celular e computador do balcão), não o app (DEC-005); o CLAUDE.md §2 cita app mobile para lojista e foi superado pelo brief.

## Problema
Seu Marcos (P2) vende por WhatsApp/balcão, confere PIX no extrato e controla estoque de cabeça. Perde venda por demora e não sabe o que recebe. Evidência: 82% dos pequenos negócios vendem por WhatsApp (Sebrae 2026); comissão de marketplaces é queixa conhecida (iFood 12-23% + 3,2%, `pesquisa-mercado.md` §4) `[HIPÓTESE sobre a queixa; validar V1/V4]`. Frequência: diária.

## Objetivo e métrica de sucesso
Lojista cadastra a loja, sobe o catálogo, recebe pedidos, entrega e recebe, sem ajuda técnica.
| Métrica | Meta piloto (HIP-043) |
|---|---|
| Aquisição: lojas cadastradas > aprovadas | >= 60% aprovadas em 2 dias úteis |
| Ativação: cadastro > 1º pedido aceito | <= 7 dias; onboarding completo em <= 30 min |
| Catálogo: produtos ativos por loja | >= 20 no 7º dia |
| Operação: tempo mediano de aceite | < 3 min; timeouts < 5% |
| Cancelamento causado pela loja | < 8% |
| Retenção: lojas ativas em 30 dias | >= 60% das aprovadas |
| Receita: comissão por loja | segue HIP-001 |

**Eventos:** `merchant_signup_started/completed`, `onboarding_step_completed {step}`, `store_submitted`, `store_approved/rejected`, `product_created`, `catalog_import {rows, errors}`, `order_alert_shown`, `order_accepted {seconds}`, `order_rejected {reason}`, `order_timeout`, `store_paused {reason}`, `coupon_created`, `payout_viewed`.

## Fora do escopo (1.0)
App nativo do lojista; integração com ERP/PDV; emissão de nota fiscal; impressão térmica direta por USB/Bluetooth (usa impressão do navegador); mais de uma loja por conta (HIP-031); entregador Webag (fase 2); anúncios pagos/destaque pago; campanhas de WhatsApp em massa; relatórios avançados; multi-filial; pagamento na entrega.

## Usuários e cenários
1. Seu Marcos cadastra a loja, envia documentos e aguarda aprovação.
2. Marcos sobe 20 produtos com variações pela planilha e ajusta estoque.
3. Pedido chega: som, aceita em 1 toque, imprime comanda, marca "saiu para entrega".
4. Joana (funcionária) só vê pedidos e trocas.
5. Fim da semana: Marcos vê quanto vendeu, comissão e repasse.

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-LOJ-01 | Cadastro e onboarding guiado (CPF/CNPJ, loja, documentos, conta de recebimento); só visível após aprovação | 050-054 |
| RF-LOJ-02 | Configuração da loja (perfil, horários, entrega, retirada, trocas) | 055-059 |
| RF-LOJ-03 | Catálogo (fotos, variações, estoque, promoção, seções, planilha, ação em massa) | 060-066 |
| RF-LOJ-04 | Pedidos em tempo real com alerta, aceitar/recusar, status, comanda, histórico | 067-072 |
| RF-LOJ-05 | Trocas | PRD trocas (WB-172, 173, 174) |
| RF-LOJ-06 | Cupons, avaliações, equipe | 073-075 |
| RF-LOJ-07 | Financeiro e painel inicial | 076-078 |
| RF-LOJ-08 | Segurança de acesso | 079 |
| RF-LOJ-09 | Ajuda e diagnóstico dos alertas | 227 |

## Regras de negócio
RN-03, RN-04, RN-05, RN-06, RN-07, RN-08, RN-09, RN-10, RN-11, RN-12, RN-13; HIP-030 (visibilidade), HIP-031 (CPF/CNPJ), HIP-034 (limites de catálogo).

## Requisitos não funcionais
- **Responsivo:** usável de 360 px de largura (celular) a monitor do balcão; áreas de toque >= 44 px; fonte legível a 1 m no painel de pedidos.
- **Desempenho:** painel de pedidos atualiza em <= 3 s por WebSocket com reconexão automática e fallback por polling; upload com compressão no navegador antes de enviar.
- **Alerta confiável:** som exige primeira interação (política do navegador): o painel pede "Ativar som" ao abrir e mostra faixa vermelha se o som estiver bloqueado ou a conexão cair.
- **Acessibilidade:** WCAG 2.2 AA; navegação por teclado no balcão.
- **Segurança:** RBAC por loja no servidor; sessão com expiração; documentos em storage privado com URL assinada de curta duração; uploads validados por tipo e tamanho (SVG proibido); ações sensíveis (conta de recebimento, equipe) pedem a senha de novo.
- **LGPD:** dados do cliente mínimos e temporais (RN-14, HIP-036).

## Histórias e critérios de aceite

### WB-050 Criar conta de lojista — Must — dep: WB-100 (base de auth)
Como lojista, quero criar minha conta, para começar o cadastro da loja.
- **C1** Dado a tela inicial, então peço nome, e-mail, celular, senha (regras WB-006) e aceite de termos do lojista.
- **C2** Dado e-mail já cadastrado (cliente ou lojista), então o formulário não confirma nem nega a existência: mostra "Entre para continuar" e leva ao login; só depois de autenticar (senha, e confirmação de e-mail, C4) a conta existente recebe o papel de lojista. Nunca se cria segunda conta nem se concede papel sem login (R-08, SEC-008, SEC-005).
- **C3** Dado cadastro de lojista desligado (feature flag), então vejo "Cadastro de lojas indisponível" com opção de lista de espera por e-mail.
- **C4** Dado e-mail não confirmado (inclusive conta de cliente que quer virar lojista), então confirmo por código (mesmas regras de WB-007) antes de seguir; o papel de lojista não é concedido a e-mail não confirmado (WB-224 C2).

### WB-051 Onboarding: dados da loja e CPF/CNPJ — Must — dep: WB-050, WB-118
Como lojista, quero informar os dados da loja em etapas curtas, para enviá-la à aprovação.
- **C1** Dado a etapa 1, então escolho "CPF" ou "CNPJ (MEI incluso)", e informo o número com máscara e dígito verificador válido; inválido: erro no campo. O validador de CNPJ aceita o formato numérico e o alfanumérico (letras em parte dos caracteres; coluna em texto, máscara aceita letras) `[HIPÓTESE: confirmar data e algoritmo na fonte da Receita antes da sprint; R-18]`.
- **C2** Dado documento já usado por outra loja, então vejo "Esse CPF/CNPJ já tem loja. Fale com o suporte" (1 documento = 1 loja, HIP-031).
- **C3** Dado a etapa 2, então informo nome da loja, categoria principal, telefone/WhatsApp e endereço da loja por CEP (autocompletar, geocodificado); cidade fora das regiões ativas: "Ainda não atendemos [cidade]"; entra na lista de espera **só se marcar o checkbox próprio, desmarcado por padrão** (finalidade com consentimento, WB-211 C1); sem marcar, só vê a mensagem (R-39).
- **C6** Dado documento (CPF/CNPJ) de loja reprovada e sem pedidos, então o documento fica livre para novo cadastro; documento de loja suspensa continua ocupado (R-15).
- **C4** Dado abandono no meio, então o rascunho é salvo e retomo da etapa em que parei, com barra de progresso "Etapa X de 4".
- **C5** Dado CNPJ, então peço razão social e confirmo que a loja é responsável fiscal pelas vendas (aceite registrado, HIP-031).

### WB-052 Onboarding: documentos — Must — dep: WB-051, WB-218
Como lojista, quero enviar meus documentos pelo celular, para provar quem sou.
- **C1** Dado CPF: documento com foto (RG ou CNH, frente e verso) e foto de comprovante de endereço da loja; CNPJ: cartão CNPJ e documento do responsável; formatos JPG, PNG ou PDF, até 5 MB cada.
- **C2** Dado arquivo inválido (tipo ou tamanho), então vejo o motivo e posso reenviar.
- **C3** Dado envio, então os arquivos ficam em área privada, visíveis só ao admin (acesso registrado com **motivo obrigatório** escolhido de lista curta: análise inicial, dúvida, denúncia; WB-218).
- **C4** Dado foto escura ou cortada, então posso refazer antes de enviar (pré-visualização).
- **C6** Dado reenvio de documento, então o novo substitui o anterior e o histórico dos envios (data, quem enviou, resultado da análise) é mantido (R-28d).
- **C7** Dado o dono em "Documentos", então vê a lista enviada e a data de cada envio, mas **não baixa** os próprios arquivos (R-28b).
- **C5** Dado PDF enviado, então o admin o abre por link de 5 min servido pela origem do storage (não do painel), sem varredura de antivírus na 1.0 (risco aceito, DEC-017; ClamAV na fase 2) e com imagens limitadas a 40 megapixels (SEC-108).

### WB-053 Onboarding: conta de recebimento — Must — dep: WB-051, WB-155
Como lojista, quero informar onde recebo, para ser pago pelas vendas.
- **C1** Dado modo split, então toco "Conectar Mercado Pago", autorizo por OAuth e volto ao painel com status "Conta conectada". Só o **dono** conecta, com senha digitada há <= 5 min; funcionário recebe 403 (SEC-109).
- **C2** Dado a autorização negada ou conta sem nível exigido, então vejo o motivo e como resolver (abrir/ajustar conta no provedor) e a etapa fica pendente.
- **C3** Dado modo centralizado (fallback do ADR), então informo chave PIX ou conta bancária do titular, e o titular deve ter o mesmo CPF/CNPJ da loja; divergência bloqueia o envio.
- **C4** Dado qualquer modo, então os dados de recebimento ficam visíveis só ao dono, mascarados, e **trocar ou desconectar a conta de recebimento** exige senha de <= 5 min, envia e-mail de aviso ao dono, grava auditoria e alerta o admin (SEC-048; antes era WB-079 C3, agora Must).
- **C5** Dado provedor `fake` (dev), então a etapa conclui com "Conta de teste conectada".
- **C6** Dado retorno do OAuth, então só vale se o `state` for o gerado para esta sessão e esta loja, de uso único e com no máximo 10 min; caso contrário vejo "Link expirado. Conecte de novo" e nada é vinculado (SEC-109).
- **C7** Dado o titular da conta Mercado Pago com CPF/CNPJ diferente do da loja, então a conexão fica "Em análise" e a **ativação da venda é BLOQUEADA** até o admin liberar (DEC-020e, DEC-023a, SEC-047). O lojista vê "Titular da conta diferente do cadastro. Aguarde a análise ou conecte outra conta"; o admin é alertado e libera em WB-103 C7 (tela, motivo obrigatório, auditoria). Sem liberação a loja não aparece no app (RN-03).
- **C8** Dado uma conta Mercado Pago já vinculada a outra loja, então a conexão é recusada ("Essa conta já está em uso por outra loja. Fale com o suporte"): 1 conta MP = 1 loja (R-37a).
- **C9** Dado duplo toque em "Conectar", então só 1 `state` fica ativo por loja; o anterior é invalidado ao gerar o novo (R-37b).

### WB-054 Acompanhar aprovação — Must — dep: WB-052, WB-103
Como lojista, quero saber em que pé está minha loja, para não ficar no escuro.
- **C1** Dado envio, então o status vira "Em análise" com a mensagem "Respondemos em até 2 dias úteis" (HIP-030).
- **C2** Dado aprovação, então recebo e-mail e notificação, a loja pode ser configurada para ficar visível ao cliente quando tiver 1 produto ativo e conta de recebimento ativa.
- **C3** Dado "Correção pedida", então vejo o motivo por item, com **um item por documento exigido mais "dados da loja"**, e posso corrigir e reenviar sem refazer tudo; o prazo de 2 dias úteis fica pausado até o reenvio (RN-16; R-28c, R-29).
- **C4** Dado loja aprovada mas sem produto ativo, então o painel mostra "Cadastre 1 produto para aparecer no app".
- **C5** Dado "Recusada" (final), então vejo o motivo e a orientação de falar com o suporte; novo cadastro só com o suporte (RN-16).
- **C6** Dado loja ainda em análise, então posso criar e salvar produtos (ficam ATIVOS mas invisíveis, RN-03); a loja só aparece no app após aprovação, conta de recebimento ativa e 1 produto ativo (R-40).

### WB-055 Perfil da loja — Must — dep: WB-054
Como lojista, quero personalizar logo, capa, descrição, categorias e WhatsApp, para a loja ter cara de loja.
- **C1** Dado upload de logo (quadrado) e capa (16:9), então o painel recorta e comprime no navegador (até 5 MB de origem, resultado <= 300 KB) e mostra a prévia.
- **C2** Dado descrição, então até 300 caracteres; categorias, escolho 1 principal e até 2 extras entre as ativas do admin.
- **C3** Dado WhatsApp, então máscara e validação; o número é usado no botão do cliente (WB-029).
- **C4** Dado alterar nome ou CPF/CNPJ após aprovação, então exige nova análise do admin (os demais campos publicam na hora); durante a análise a loja continua visível e vendendo com os dados antigos, e a mudança só vale após a aprovação (R-23).
- **C5** Dado erro de upload, então vejo "Não foi possível enviar. Tentar de novo" e a imagem anterior permanece.

### WB-056 Horários, feriados e pausa — Must — dep: WB-055
Como lojista, quero definir quando abro e pausar quando preciso, para não receber pedido que não posso atender.
- **C1** Dado cada dia da semana, então defino fechado ou até 2 intervalos (ex.: 09:00-12:00 e 14:00-18:00); fim posterior ao início. O fim é **exclusivo** (às 12:00 a loja já está fechada). Intervalo não passa da meia-noite: o último fim é 23:59, e quem fecha depois divide em dois dias (R-16a, R-16b).
- **C2** Dado data de feriado/folga, então marco fechada e a loja aparece "Fechada hoje". Feriado é só manual, sem calendário na 1.0 (R-16d).
- **C3** Dado "Pausar", então escolho 30 min, 1 h, 2 h, até o fim do dia ou até eu reabrir; a loja vira "Fechada" na hora, pedidos em andamento continuam.
- **C4** Dado pausa com prazo, então a loja reabre sozinha ao fim, e vejo aviso "Loja pausada" em destaque no painel.
- **C5** Dado fechamento do horário, então pedidos já aceitos seguem; novos não entram.
- **C6** Dado "Esqueci aberta": loja aberta sem nenhuma interação no painel (conta como interação: login, aceitar, recusar ou avançar pedido, pausar ou reabrir; R-16c) por 3 h e sem pedido aceito: o sistema avisa por e-mail "Sua loja está aberta e ninguém respondeu" e sugere pausar `[HIPÓTESE]`.

### WB-057 Entrega: raio, taxa, mínimo, grátis e tempo — Must — dep: WB-055
Como lojista, quero configurar entrega do meu jeito, para não ter prejuízo com frete.
- **C1** Dado raio, então valor em km de 1 até `raio_max_km` (15; padrão 5); acima: erro com o limite.
- **C2** Dado taxa **fixa** (R$ 0 a R$ 50) ou **por distância** com até 5 faixas contíguas até o raio; faixa com lacuna ou sobreposição: erro "As faixas precisam ser seguidas". Faixa é `[de, até)`: o limite superior pertence à próxima faixa (2,00 km é da faixa 2-5, não da 0-2); a última faixa inclui o raio (R-17a). Reduzir o raio com faixas já cadastradas além dele: recusa e pede o ajuste das faixas (R-17b).
- **C3** Dado pedido mínimo e "entrega grátis acima de R$ X", então X deve ser **estritamente maior** que o mínimo (inclusive quando o mínimo é 0); X = 0 desliga a opção; valores aplicados conforme RN-04 (R-17c).
- **C4** Dado tempo estimado, então informo mínimo e máximo em minutos (min < máx; máx até 1.440).
- **C5** Dado "Prévia", então escolho um endereço de teste e vejo a taxa que o cliente veria. O provedor de geocodificação do CEP é o definido no ADR-008 (tech-lead); o critério de aceite é a taxa igual à do checkout para o mesmo endereço (R-17d).
- **C6** Dado desativar entrega (só retirada), então é permitido se a retirada estiver ativa; nenhuma opção ativa: erro.

### WB-058 Retirada na loja — Must — dep: WB-055
Como lojista, quero oferecer retirada, para vender sem entregar.
- **C1** Dado ativar retirada, então informo endereço de retirada (padrão: da loja), instruções (até 200 caracteres) e tempo de preparo (faixa em minutos).
- **C2** Dado retirada desativada, então a opção some do checkout; pedidos de retirada em andamento seguem.
- **C3** Dado pedido de retirada, então o painel pede o código de 4 dígitos para marcar "Entregue" (WB-069).

### WB-059 Política de trocas — Must — dep: WB-055
Como lojista, quero definir minhas regras de troca, para evitar conflito.
- **C1** Dado "Aceito troca por tamanho ou cor", então defino prazo em dias (1 a 30; padrão 7) e taxa de coleta de R$ 0 a `taxa_coleta_max_cents` (R$ 30).
- **C2** Dado desligar a troca voluntária, então vejo aviso "Arrependimento (7 dias) e defeito continuam valendo por lei" e o prazo voluntário vira 0. O **piso legal (7 dias de arrependimento e defeito) é fixo e não editável por nenhum perfil** (DEC-011, DEC-023b). Ao religar, o prazo volta ao padrão `troca_voluntaria_dias_padrao` e a loja confirma antes de salvar (R-26).
- **C3** Dado a política salva, então vale para novos pedidos; pedidos já feitos mantêm a política vigente no momento da compra (snapshot).
- **C4** Dado a página da loja, então a política aparece resumida (WB-016).

### WB-060 Criar e editar produto com fotos — Must — dep: WB-054, WB-106
Como lojista, quero cadastrar produto com foto, preço e descrição, para vender.
- **C1** Dado novo produto, então informo nome (até 80 caracteres), categoria (do admin), descrição (até 1.000), preço, foto principal e ao menos 1 variação (ou "sem variação", com estoque); salvar como rascunho é permitido **só com o nome preenchido**; o resto é obrigatório apenas ao publicar (R-38).
- **C2** Dado fotos, então até 8 por produto, com recorte e compressão no navegador (origem até 5 MB, destino <= 300 KB, lado maior até 1.600 px); a 1ª é a capa; arrastar muda a ordem.
- **C3** Dado campo obrigatório vazio ou preço inválido (RN-05), então erro no campo e não publica.
- **C4** Dado publicar, então o produto fica ATIVO e visível se a loja estiver visível; "Pausar" tira da vitrine sem apagar.
- **C5** Dado excluir produto com pedido em andamento, então é bloqueado ("Há pedidos em andamento"); sem pedidos, vai para arquivado (histórico preservado).
- **C6** Dado produto cuja categoria está na lista de **categorias proibidas** (do admin), então o cadastro é recusado com "Esse tipo de produto não é permitido no Webag". É a lista que **bloqueia**; a lista de **palavras suspeitas** apenas sinaliza o produto para a fila "Revisar" (WB-107 C3, HIP-029). São duas listas distintas (R-12a, R-12b).
- **C7** Dado produto pausado ou removido pelo admin (moderação), então o lojista **não** consegue reativá-lo: o status de moderação é separado do status do lojista e só o admin o altera (R-12d).

### WB-061 Variações e estoque por variação — Must — dep: WB-060
Como lojista, quero cadastrar tamanhos, cores e outras variações com estoque próprio, para não vender o que não tenho.
- **C1** Dado atributos (tamanho, cor, outro com nome livre), então até 3 atributos e `variacoes_max` (100) combinações; cada combinação tem estoque (inteiro de 0 a 99.999) e, opcionalmente, preço e código (SKU) próprios; o código, quando informado, é único na loja (R-25a, R-25b).
- **C2** Dado combinação duplicada, então erro "Essa combinação já existe".
- **C3** Dado estoque 0, então a variação vira "Esgotado" na vitrine; dado todas esgotadas, o produto sai das ofertas e buscas (RN-03).
- **C4** Dado reduzir estoque abaixo do reservado, então bloqueio com "X unidades estão reservadas em pedidos" (RN-06).
- **C5** Dado preço por variação vazio, então vale o preço do produto. Dado variação com preço próprio, então herda o desconto percentual da promoção do produto (WB-062 C5; R-25c).

### WB-062 Preço e promoção com período — Must — dep: WB-060
Como lojista, quero colocar produto em promoção por período, para atrair clientes.
- **C1** Dado preço promocional menor que o normal, início e fim, então o cliente vê de/por e % apenas dentro do período (RN-05). Início e fim são **data e hora** em `America/Sao_Paulo`; o início é inclusivo e o fim é inclusivo até o minuto informado; a tela pede a hora, com padrão 00:00 (início) e 23:59 (fim) (R-13).
- **C2** Dado promocional >= normal ou fim anterior ao início, então erro.
- **C3** Dado fim da promoção, então o preço volta ao normal sozinho, sem ação.
- **C4** Dado alterar o preço com carrinho aberto de clientes, então eles são avisados no checkout (WB-023 C5).
- **C5** Dado a promoção, então ela é definida **no produto** (não por variação); variação com preço próprio recebe o mesmo desconto percentual (R-25c).

### WB-063 Seções da vitrine — Should — dep: WB-060
Como lojista, quero organizar produtos em seções (ex.: "Camisetas", "Promoções"), para o cliente achar rápido.
- **C1** Dado criar seção com nome (até 40 caracteres), então atribuo produtos e defino a ordem das seções e dos produtos.
- **C2** Dado produto sem seção, então aparece em "Outros" ao final.
- **C3** Dado seção sem produto ativo, então não aparece ao cliente.
- **C4** Dado excluir seção, então os produtos vão para "Outros".

### WB-064 Pausar produto e estoque baixo — Must — dep: WB-061
Como lojista, quero pausar produto e ser avisado de estoque baixo, para não vender o que acabou.
- **C1** Dado a lista de produtos, então pauso/reativo com 1 toque e vejo o status.
- **C2** Dado estoque disponível <= `estoque_baixo_un`, então a variação aparece com selo "Baixo" e uma notificação (WB-192) é enviada 1 vez por variação; o alerta **rearma quando `disponível > estoque_baixo_un`** e dispara de novo ao voltar a `<=` (R-14).
- **C3** Dado ajuste rápido de estoque (+/-) na lista, então salva na hora; erro mostra o motivo.

### WB-065 Importar produtos por planilha — Should — dep: WB-060, WB-061
Como lojista, quero importar uma planilha, para não digitar 100 produtos.
- **C1** Dado "Baixar modelo", então recebo CSV/XLSX com colunas (nome, categoria, descrição, preço, promocional, início/fim, variação 1, variação 2, estoque, código, URL da foto).
- **C2** Dado planilha de até 500 linhas e 5 MB, então o sistema valida e mostra o resumo "X válidas, Y com erro" com a linha e o motivo de cada erro, antes de confirmar.
- **C3** Dado confirmar, então cria apenas as válidas, como rascunho; vejo o relatório final e baixo as linhas com erro.
- **C4** Dado arquivo acima do limite, formato inválido ou cabeçalho errado, então vejo erro e nada é criado.
- **C5** Dado a mesma planilha importada duas vezes, então o sistema avisa "X produtos já existem (mesmo código)" e atualiza só se eu escolher "Atualizar".
- **C6** *(condicionada a SEC-111/SEC-053: só entra se o ADR-005 incluir o "fetch de mídia externa" seguro, com bloqueio de endereços internos e de redirecionamentos para eles; se não estiver pronto na sprint, a coluna "URL da foto" sai do modelo e o lojista sobe as fotos pelo app, sem mudar o resto da história)* Dado URLs de foto, então só HTTPS e imagens válidas são baixadas; falha na foto não impede o produto; URL que aponte para endereço interno ou privado é recusada com "URL de foto não permitida".

### WB-066 Ação em massa — Should — dep: WB-064
Como lojista, quero pausar ou mudar preço de vários produtos, para ganhar tempo.
- **C1** Dado seleção de produtos, então posso pausar, reativar, mover de seção, ou ajustar preço (+/-% ou +/- R$).
- **C2** Dado ajuste que levaria preço a <= R$ 0 ou acima do máximo, então a ação é bloqueada e lista os afetados.
- **C3** Dado confirmar, então vejo a pré-visualização "X produtos serão alterados" e o resultado; a ação fica registrada no histórico da loja.

### WB-067 Painel de pedidos em tempo real — Must — dep: WB-050, WB-024, WB-025
Como lojista ou funcionário, quero ser avisado de novo pedido, para não perder venda.
- **C1** Dado pedido RECEBIDO, então aparece no topo em até 3 s, com alerta sonoro repetido a cada 15 s até eu agir, e faixa visual piscante.
- **C2** Dado o painel aberto, então primeira vez pede "Ativar som" (política do navegador); sem som permitido ou conexão perdida, a faixa avisa em vermelho.
- **C3** Dado a lista, então os pedidos ficam em colunas/abas por estado (Novos, Em separação, Saiu/Pronto) e mostram número, hora, itens, tipo (entrega/retirada) e valor, com contador de tempo desde que chegou.
- **C4** Dado queda de conexão, então reconecta sozinho e atualiza o que perdeu; o painel mostra "Sincronizado há X s".
- **C5** Dado funcionário sem a permissão "pedidos", então não vê a tela (403 no servidor).
- **C6** Dado nenhum pedido, então "Nenhum pedido agora" e dica "Mantenha esta tela aberta".

### WB-068 Aceitar ou recusar pedido — Must — dep: WB-067, WB-154
Como lojista, quero aceitar ou recusar com motivo, para controlar o que consigo atender.
- **C1** Dado pedido RECEBIDO, então "Aceitar" leva a ACEITO com 1 toque e o cliente é notificado.
- **C2** Dado "Recusar", então exijo um motivo (sem estoque, loja fechando, fora da área, problema no pedido, outro com texto) e o sistema estorna total e libera estoque.
- **C3** Dado `loja_aceite_lembrete_min` (5 min) sem ação, então novo alerta forte (som + push + e-mail).
- **C4** Dado `loja_aceite_timeout_min` (10 min) sem ação, então o pedido é cancelado automaticamente (ator sistema), com estorno total, e o cliente é avisado; o evento conta no índice da loja.
- **C5** Dado dois funcionários tocando juntos, então só a primeira ação vale e o outro vê "Pedido já aceito por [nome]".
- **C6** Dado pedido já cancelado pelo cliente, então o botão Aceitar falha com "Pedido cancelado" e some da lista.

### WB-069 Atualizar status do pedido — Must — dep: WB-068
Como lojista, quero avançar o pedido, para o cliente acompanhar.
- **C1** Dado ACEITO, então posso "Iniciar separação" ou ir direto para "Saiu para entrega"/"Pronto para retirada" (RN-07).
- **C2** Dado EM_SEPARACAO, então avanço para SAIU_PARA_ENTREGA (entrega) ou PRONTO_PARA_RETIRADA (retirada).
- **C3** Dado PRONTO_PARA_RETIRADA, então para "Entregue" informo o código de 4 dígitos do cliente; código errado: "Código incorreto" (5 tentativas, depois exige o admin).
- **C4** Dado SAIU_PARA_ENTREGA, então "Marcar entregue" conclui o pedido (com o código de entrega do cliente, se `codigo_entrega` ligado: WB-226) e inicia a contagem do repasse (no modo centralizado; no split o repasse é informativo).
- **C5** Dado voltar um status, então é bloqueado (só admin com auditoria).
- **C6** Dado SAIU_PARA_ENTREGA e "entrega não realizada", então exijo motivo; o pedido é cancelado e estornado (admin é notificado).
- **C7** Dado cada transição, então grava ator, hora e motivo e notifica o cliente (WB-191).

### WB-070 Item indisponível: estorno parcial — Should — dep: WB-068, WB-154
Como lojista, quero marcar um item como faltando depois de aceitar, para corrigir o pedido sem cancelar tudo.
- **C1** Dado ACEITO ou EM_SEPARACAO, quando marco um item (e quantidade) como indisponível, então vejo o valor que será estornado (item menos cupom proporcional) antes de confirmar.
- **C2** Dado confirmar, então o estorno parcial é feito, a comissão é recalculada (RN-10) e o cliente é notificado.
- **C3** Dado que o cliente ainda não teve SAIU, então ele pode cancelar o pedido inteiro com estorno total.
- **C4** Dado todos os itens marcados, então o pedido vira CANCELADO (ator loja, "sem estoque").
- **C5** Dado SAIU/PRONTO, então a ação não está disponível.

### WB-071 Imprimir comanda — Should — dep: WB-067
Como lojista, quero imprimir o pedido, para separar e embalar.
- **C1** Dado um pedido, então "Imprimir" gera comanda com número, hora, cliente (nome e telefone, conforme RN-14), endereço ou "RETIRADA", itens com variação e quantidade, valores e "PAGO ONLINE".
- **C2** Dado a impressão, então o layout cabe em papel de 80 mm e A4 (usa a impressão do navegador).
- **C3** Dado pedido além do prazo de visibilidade de dados do cliente, então endereço e telefone aparecem mascarados.

### WB-072 Histórico de pedidos — Must — dep: WB-067
Como lojista, quero consultar pedidos antigos, para tirar dúvida e conferir vendas.
- **C1** Dado lista, então filtro por período, estado e tipo (entrega/retirada) e busco por número ou nome do cliente; paginação de 20.
- **C2** Dado detalhe, então vejo itens, valores, comissão, status, linha do tempo e avaliação.
- **C3** Dado nenhum resultado, então "Nenhum pedido neste filtro".
- **C4** Dado funcionário sem permissão de pedidos, então 403.

### WB-073 Cupons próprios — Should — dep: WB-020
Como lojista, quero criar cupons da minha loja, para promover.
- **C1** Dado novo cupom, então informo código único (4-20, A-Z0-9), tipo (percentual ou valor), valor, mínimo, validade, limite total e por cliente (RN-09).
- **C2** Dado percentual acima de 90% ou valor maior que o menor produto sem teto, então aviso de risco antes de salvar.
- **C3** Dado código já existente (na loja ou global), então erro.
- **C4** Dado pausar/encerrar, então deixa de valer na hora; pedidos já feitos mantêm o desconto.
- **C5** Dado a lista, então vejo usos e valor total dado de desconto.

### WB-074 Responder avaliações — Should — dep: WB-031
Como lojista, quero responder avaliações, para mostrar atenção.
- **C1** Dado avaliação sem resposta, então posso responder 1 vez, até 500 caracteres, publicamente.
- **C2** Dado a resposta, então não pode ser editada após 24 h (pode ser apagada).
- **C3** Dado avaliação ofensiva, então posso denunciar (WB-038, WB-124).
- **C4** Dado lista de avaliações, então filtro por "sem resposta".

### WB-075 Equipe e permissões — Must — dep: WB-050
Como dono, quero convidar funcionários com permissões, para dividir o trabalho sem dar acesso ao dinheiro.
- **C1** Dado convite por e-mail, então o funcionário recebe link válido por 7 dias para criar senha, e marco permissões: pedidos, catálogo/estoque, trocas, cupons, avaliações e **valores de venda** (C7; desligada por padrão). A conta criada pelo link **nasce com o e-mail confirmado** (o clique prova a posse; não cai em SEC-008b). Reenviar o convite invalida o anterior (R-09b, R-09e).
- **C2** Dado funcionário, então nunca vê financeiro, conta de recebimento, equipe nem configurações da loja (RN-13).
- **C3** Dado remover funcionário, então as sessões e renovações dele terminam e a conexão em tempo real do painel é derrubada em até 5 s (WB-219); a próxima requisição com o acesso antigo recebe 401.
- **C4** Dado e-mail já vinculado a uma loja, então a mensagem é a genérica "Não foi possível convidar este e-mail", sem revelar o motivo (anti-enumeração, SEC-017). Funcionário em duas lojas continua proibido na 1.0, para simplificar o RBAC (registrado; R-09a, R-09c).
- **C6** Dado o dono, então ele **não pode se remover** da própria loja; transferência de propriedade fica fora da 1.0 (R-09d).
- **C5** Dado alterar permissões, então valem na próxima requisição; tudo fica no log da loja.
- **C7** Dado a permissão **"Ver valores de venda"** (`vendas_valores`, DEC-024c), então: **desligada por padrão** em todo convite; só o dono liga ou desliga; a caixa traz a frase "Libera ver quanto a loja vendeu (valores em R$, ticket médio e gráfico). Não libera financeiro, repasses nem conta de recebimento." Sem a permissão, o funcionário vê no painel inicial (WB-078) só as pendências das permissões dele e **contagens** (pedidos, unidades, mais vendidos por unidade), nunca vendas em R$, ticket médio nem gráfico de vendas; a API **não devolve** esses campos (autorização no servidor, não só na tela). Com a permissão, vê esses números do painel inicial, **nunca** o financeiro (WB-076, só dono, C2). Valores de itens e total **dentro de um pedido** continuam visíveis a quem tem "pedidos" (necessário para atender) `[HIPÓTESE]`.
- **C8** Dado o dono em Equipe > pessoa > Atividade, então vê a lista somente leitura "Quem fez o quê" (pessoa, ação, hora), filtrável por pessoa e período, sem dados do cliente além do número do pedido; vazio: "Sem atividade ainda" (tela EQ1, mesma fonte do log de C5).

### WB-076 Financeiro: resumo, a receber e repasses — Must — dep: WB-156
Como dono, quero ver quanto vendi, quanto é comissão e quando recebo, para confiar nos números.
- **C1** Dado o período, então vejo vendas brutas, comissão Webag, taxa do provedor, estornos, líquido, "em carência", "a receber" e "já repassado".
- **C2** Dado um pedido, então vejo a composição (RN-10) e o status do repasse (no split, o status vem do provedor e é informativo).
- **C3** Dado funcionário, então não vê (só dono).
- **C4** Dado nenhum repasse, então "Ainda sem repasses. O primeiro sai em [data]" (modo centralizado) ou "Você recebe direto na sua conta Mercado Pago" (split).
- **C5** Dado repasse retido por disputa ou troca aberta (só no modo centralizado), então o motivo aparece ao lado do pedido; no split, pedido em disputa mostra "Em disputa" e o aviso de que um estorno pode sair da sua conta Mercado Pago.

### WB-077 Extrato exportável — Should — dep: WB-076
Como dono, quero exportar o extrato, para o meu contador.
- **C1** Dado o período (até 12 meses), então exporto CSV com uma linha por lançamento (pedido, data, bruto, comissão, taxa, estorno, líquido, status) com valores com ponto decimal e 2 casas.
- **C2** Dado período sem dados, então o arquivo vem só com o cabeçalho e aviso.
- **C3** Dado a exportação, então o acesso é registrado em auditoria.

### WB-078 Painel inicial — Must — dep: WB-067
Como lojista, quero ver como a loja está indo, para decidir o dia.
- **C1** Dado a abertura, então vejo vendas de hoje e dos últimos 7 dias (valor e pedidos), ticket médio, 5 mais vendidos do período e avaliação média.
- **C2** Dado loja nova sem vendas, então vejo estado vazio com próximo passo ("Cadastre seu 1º produto").
- **C3** Dado os números, então seguem RN-15 (pedidos que chegaram a RECEBIDO, sem cancelados).
- **C4** Dado pendências (pedido sem aceite, troca aguardando, estoque baixo, loja pausada), então aparecem no topo.
- **C5** Dado funcionário **sem** a permissão "Ver valores de venda" (WB-075 C7, padrão), então o painel mostra só as pendências das permissões dele e contagens; os KPIs em R$ (vendas de hoje e 7 dias, ticket médio) e o gráfico de vendas não aparecem nem são devolvidos pela API. O dono sempre vê tudo.

### WB-079 Segurança de acesso do lojista (2FA opcional) — Should — dep: WB-050
Como dono, quero proteger minha conta, para ninguém mexer no meu dinheiro.
- **C1** Dado ativar verificação em duas etapas (app autenticador), então o login passa a pedir o código.
- **C2** Dado perder o aparelho, então posso usar códigos de recuperação gerados na ativação (10 códigos de uso único).
- **C3** *(movido para WB-053 C4, Must: reautenticação e aviso na troca da conta de recebimento)*.
- **Nota:** o 2FA do dono é opcional na 1.0 (SEC-015); sobe de Could para Should. O 2FA do admin é obrigatório (WB-222).

### WB-227 Ajuda do lojista e diagnóstico dos alertas — Should — dep: WB-067, WB-192, WB-034
Como lojista ou funcionário, quero conferir se os alertas de pedido vão tocar e achar ajuda, para não perder venda (tela AJ2, `onda-6-conformidade.md`; nova, sem história até DEC-024).
- **C1** Dado o menu Ajuda, então vejo o diagnóstico com 4 linhas, cada uma com ícone **e** texto (nunca só cor): **Som** (ligado/desligado), **Avisos do navegador** (Web Push ligado/desligado, com "Ativar"), **Conexão** (tempo desde a última sincronização) e **Tela acesa**.
- **C2** Dado "Testar alertas agora", então toca o som e mostra o modal "Este é um teste" **sem criar pedido**; depois pergunta "Você ouviu o som?"; "Não, ajudar" abre os passos de correção.
- **C3** Dado navegador sem suporte a manter a tela acesa (Wake Lock) `[HIPÓTESE]`, então a linha "Tela acesa" mostra só a dica de texto "Deixe a tela ligada para não perder pedidos"; nada quebra.
- **C4** Dado a seção de ajuda, então vejo perguntas frequentes da loja (Pedidos, Produtos, Trocas, Dinheiro, Equipe) com busca, o cartão "Falar com o Webag" (WhatsApp e e-mail, horário) lidos da configuração de WB-034 C1, e links para Termos do Lojista e Política de privacidade.
- **C5** Dado funcionário, então vê a tela inteira (o teste de som é essencial para ele); busca sem resultado mostra "Nada para '[termo]'" com o contato; sem conexão, o diagnóstico mostra "Sem conexão" e as perguntas vêm do cache.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Split MP exige conta e KYC do lojista (`pesquisa-mercado.md` §6) | Risco de adoção | Onboarding assistido; fallback centralizado só com parecer jurídico |
| Lojista recebe direto no split e some sem entregar (Webag não retém dinheiro; DEC-016) | Risco financeiro residual | Limite de loja nova e alertas (WB-225), código de entrega (WB-226), estorno pelo admin, suspensão, Termos do Lojista com cláusula de ressarcimento (jurídico) |
| Lojista com aba fechada perde pedido | Risco operacional | Web Push (WB-192), e-mail, timeout de 10 min, lembrete aos 5 |
| Cadastro de 20+ produtos é trabalhoso | Risco de ativação | Planilha (WB-065); equipe Webag ajuda no piloto (fora do software) |
| Loja CPF sem regularização fiscal | Risco jurídico/fiscal | Aceite em WB-051; encaminhado ao fundador/contador |
| Estoque obrigatório pode irritar quem não controla | Risco de UX | Padrão "estoque alto" sugerido no cadastro; ajuste rápido (WB-064) |
| Moderação pós-publicação deixa produto proibido no ar | Risco de loja/reputação | Lista de proibidos, denúncia, varredura (WB-107) |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Split vs. centralizado (viabilidade e KYC do MP) | backend-dev (ADR) + fundador (conta MP) |
| Documentos exigidos por tipo de loja (revisão jurídica) | fundador/jurídico |
| Web Push em iOS (limita a PWA instalada) e alternativa | mobile-dev/tech-lead |
| Titular MP diferente do CPF/CNPJ da loja: bloquear ou só alertar o admin (WB-053 C7)? | security-engineer + fundador |
