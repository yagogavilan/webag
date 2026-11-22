# PRD v1.1: Cadastro e manutenção rápida de produtos

Status: proposta | Dono: product-owner | Data: 2026-11-22 | Histórias: WB-370 a WB-379
Base: `prd/lojista.md` WB-060 a WB-066 (aceitas; este PRD acelera o caminho, não o substitui), persona P2 e P2b (`personas.md`: "cadastro de 20 produtos em < 30 minutos"), `v1-1-pesquisa.md` §4 e §5; RN-05, RN-06; DEC-035 ("Você recebe").

## Problema
- **Quem sofre:** Seu Marcos (P2): 46 anos, MEI, balcão e WhatsApp, 1 a 3 funcionários, celular Android de entrada. Medo declarado: "perder tempo cadastrando 200 produtos". A oferta é o gargalo do marketplace (lojas ativas); sem produto publicado não há pedido.
- **Evidência:** persona e brief §2 (`[HIPÓTESE]`, nenhuma entrevista feita). Hoje o cadastro (WB-060) é formulário completo com categoria, descrição e variações; a planilha (WB-065) pede computador e modelo. Não há câmera como porta de entrada, duplicar, grade, rascunho automático nem edição em massa de estoque. Frequência: cada produto novo, toda semana.
- **Benchmark (`pesquisa` §4):** planilha e variações são o piso (Bling, Square, Shopify). Ninguém, nas fontes achadas, oferece foto + 2 campos como fluxo principal. O catálogo do WhatsApp Business (que o lojista já usa) é foto + título + preço.

## Objetivo e métrica de sucesso
| Métrica `[HIPÓTESE]` | Meta | Como mede |
|---|---|---|
| **Tempo para cadastrar 1 produto simples com foto** (do toque em "Novo produto" até "Publicado") | **mediana <= 60 s; p90 <= 90 s** | Teste de usabilidade (abaixo) e evento `product_create_published` |
| Produto com 3 tamanhos x 2 cores com estoque | mediana <= 120 s | Teste |
| 20 produtos de uma loja | <= 20 min (persona pedia 30) | Teste |
| Toques errados e telas de erro na tarefa | <= 1 por produto | Observação |
| Lojas com 1º produto publicado em até 24 h da aprovação | >= 80% | Banco |
| Lojas que usam duplicar, grade ou colar texto na 1ª semana | medir | Eventos |

**Teste de usabilidade (o fundador aplica; roteiro do PO):** 5 pessoas do perfil P2 (ou parentes de lojistas sem vínculo com o fundador), Android de entrada, 4G e 3G simulado; sem demonstração; tarefas: (1) cadastrar 1 produto que está na mão; (2) 1 produto com 3 tamanhos; (3) duplicar para outra cor; (4) subir o preço de 5 produtos em 10%; (5) colar uma lista do WhatsApp com 6 itens. Cronometrar da 1ª à 3ª tentativa; contar toques errados; anotar frases de dúvida. Parar quando as dificuldades se repetirem. Critério de morte: mediana da 3ª tentativa > 120 s ou 3 de 5 pedirem ajuda.

## Fora do escopo (com gatilho de volta)
| Item | Motivo | Gatilho |
|---|---|---|
| **IA real** (visão por provedor pago) | Custo recorrente e foto a terceiro; exige autorização (regra 6) | Fundador autoriza (F8); a interface e o `fake` entram (WB-378) |
| Sugerir **preço** pela foto | Sem base; seria chute | Mediana da categoria na região com 5 ou mais lojas |
| App nativo do lojista | O painel web responsivo resolve (brief §3.2); câmera funciona pelo navegador | Lojista não consegue usar a câmera no navegador em > 20% dos aparelhos |
| Base de EAN externa ligada por padrão | Termos e licença não verificados (ODbL, Cosmos) | F9 |
| Reuso de **foto ou descrição** de outra loja | Direito autoral e responsabilidade | Nunca sem licença; só dado factual (nome, marca, categoria) |
| Importar do catálogo do WhatsApp Business | Sem exportação simples | Pedido de 3 lojistas |
| Remoção automática de fundo, melhoria de foto | Esforço | Foto ruim for motivo de queixa |
| Etiqueta com código de barras impressa pelo Webag | Fora do problema | Pedido |
| Sincronizar com ERP (Bling, etc.) | Esforço e integração | 3 lojas pedem |

## Usuários e cenários
| Persona | Cenário |
|---|---|
| Seu Marcos | Tem 15 camisetas novas. Toca "Novo produto", fotografa, escreve "Camiseta básica preta", preço 49,90, escolhe P, M e G com 3 de cada, publica. Duplica para a cor branca com uma foto nova |
| Joana (P2b) | Com a permissão de catálogo, repõe estoque com o teclado numérico numa tabela, sem abrir cada produto |
| Seu Marcos | Cola do WhatsApp "Bermuda jeans 79,90 - 4 un" e mais 5 linhas; confere a tabela e publica tudo |
| Yago (admin) | Faz o mesmo pelo lojista (PRD admin, WB-353) com a mesma tela |
| Dona Rita (cosméticos) | Aponta a câmera para o código de barras do perfume; o sistema avisa que ela já cadastrou aquele produto |

## Requisitos funcionais
1. **Foto primeiro:** "Novo produto" abre a câmera do celular pelo navegador; até 8 fotos; a primeira é a capa; envio em segundo plano.
2. **Campos mínimos:** nome e preço; quantidade com padrão 1; categoria sugerida; descrição opcional; "Publicar" ou "Guardar rascunho".
3. **Rascunho automático** a cada alteração, com retomada ("Continuar de onde parei") e tolerância a sinal ruim.
4. **Duplicar** produto (nova foto, nome editável) e duplicar variação.
5. **Grade tamanho x cor** com tabela de estoque.
6. **Modelos por categoria** (campos e tamanhos prontos).
7. **Leitura de código de barras (EAN/GTIN)** pela câmera, com aviso de duplicidade.
8. **Colar texto** (WhatsApp, bloco de notas) que vira tabela de revisão.
9. **Edição em massa tipo planilha** de preço e estoque, com reajuste por % e prévia.
10. **IA de visão** como adaptador opcional (interface e `fake`).
11. **Medição do tempo de cadastro** (instrumentação) e roteiro do teste.

## Regras de negócio
**RN-Q1 Publicação mínima (muda WB-060 C1, DEC-094).** Para publicar pelo cadastro rápido: nome (até 80), preço (RN-05), 1 foto e quantidade (inteiro 0 a 99.999; padrão 1) ou variações com estoque. **Categoria** é obrigatória, mas vem sugerida (última usada ou mais frequente da loja). **Descrição passa a opcional** na via rápida, com lembrete "X produtos sem descrição"; o formulário completo continua oferecendo. Produto sem descrição aparece com nome, categoria, variações e a tabela de medidas quando houver `[HIPÓTESE; validar com o designer e a conversão]`. As demais regras (categoria proibida, moderação, "Você recebe", WB-060 C6 a C9) valem igual.

**RN-Q2 Rascunho.** Existe desde que o nome ou a foto exista; é visível só à loja; até 50 por loja; vencido em 30 dias sem alteração (aviso 3 dias antes); publicar um rascunho incompleto é recusado com o que falta, sem perder o que foi digitado. Rascunho do admin vale o mesmo, com o autor.

**RN-Q3 Foto.** Mesmas regras do WB-060 C2 (origem até 5 MB, destino <= 300 KB, lado maior 1.600 px, até 8). O envio é em segundo plano com nova tentativa; produto não é publicado enquanto a capa não terminar de subir.

**RN-Q4 Duplicar.** Copia nome, categoria, descrição, preço, variações e atributos; **não copia** fotos, código de barras, SKU, estoque (começa em 1 por variação ou 0 em grade) nem promoção. Nome ganha o sufixo editável " (cópia)". Cria rascunho.

**RN-Q5 Grade.** Atributos de variação: tamanho e cor (mais 1 livre, WB-061: até 3 atributos e `variacoes_max`). O lojista marca valores de cada atributo (listas por categoria) e o sistema gera todas as combinações; estoque por célula; preço único com troca por combinação opcional. Combinação duplicada ou acima do máximo é recusada (WB-061 C1, C2).

**RN-Q6 Modelos por categoria.** Cada categoria do admin pode ter um modelo: tamanhos sugeridos (P, M, G, GG; 34 a 44 para calçado), atributos úteis, aviso de "tabela de medidas" (moda e calçado, WB-246) e "sem troca voluntária" para íntimos e higiene (WB-244). Modelos iniciais do seed para as categorias do brief; **o admin edita o modelo** (Could). Modelo só sugere; não impede.

**RN-Q7 EAN/GTIN.** Aceita 8, 12, 13 ou 14 dígitos com dígito verificador correto; inválido é recusado com texto. Busca primeiro **na própria loja** (aviso "Você já tem este produto" com atalho "Abrir" ou "Aumentar estoque"), depois no **catálogo de referência do Webag** (nome, marca e categoria vindos de cadastros de lojas, sem foto e sem descrição, moderados). Base externa: desligada por padrão (F9). O EAN fica no produto/variação; único por loja quando informado. **Para moda e calçado o EAN é raro**: a leitura nunca é o caminho principal desses cadastros.

**RN-Q8 Colar texto.** Cada linha vira um item. O sistema entende (em ordem) nome, tamanho ou cor se houver, preço (`R$ 79,90`, `79,90`, `79.90`) e quantidade (`4 un`, `x4`, `4 peças`). Linha sem preço é marcada. Nada é publicado sem a confirmação do lojista na tabela de revisão; itens entram como **rascunho** salvo ação "Publicar os válidos". Até 100 linhas por colagem. Regras determinísticas (sem IA e sem custo).

**RN-Q9 Edição em massa.** Tabela com nome, preço, estoque (e promoção) editáveis em linha, salvando por linha. Reajuste: "+10%" ou "+R$ 5" sobre selecionados com **prévia** e **desfazer por 10 minutos**. Regras de WB-066 C2 (preço > R$ 0 e <= R$ 99.999,99). Reajuste acima de `reajuste_max_pct` (padrão 30) pede confirmação. Estoque menor que o reservado é bloqueado (RN-06).

**RN-Q10 IA de visão (`ProductVisionProvider`).** Entrada: 1 a 3 fotos e a categoria atual (opcional). Saída: nome sugerido, categorias candidatas com confiança, atributos (cor, material) e descrição curta. **Nunca publica sozinha**: tudo entra como sugestão visível e editável, marcada "Sugestão automática: revise"; o aceite é por campo. Não sugere preço. Provedor padrão `fake` (resposta fixa de demonstração, sem rede). Provedor real só com flag ligada, chave no `.env`, **aviso e consentimento do lojista na tela** ("a foto será enviada para <provedor> para gerar a sugestão") e registro do consentimento. Teto: 50 sugestões por loja por dia e orçamento mensal global; flag de desligar. Opções, custo e riscos: `v1-1-pesquisa.md` §5.

**RN-Q11 Medição.** Cada cadastro grava (servidor) hora de início (abrir "Novo produto"), de cada passo e de publicação, com `via` (câmera, duplicar, colar, planilha, formulário). Sem texto do produto.

## Requisitos não funcionais
- **Desempenho (3G):** tela de cadastro interativa em <= 3 s em Android de entrada; foto de 300 KB sobe em <= 10 s em 3G (em segundo plano); botão Publicar nunca fica bloqueado esperando foto sem aviso.
- **Offline e sinal ruim:** o rascunho é guardado no aparelho e sincroniza ao reconectar; conflito (rascunho alterado em dois aparelhos) pergunta qual manter.
- **Acessibilidade:** campos com rótulo, alvos de 48 pt, teclado numérico no preço e na quantidade; legível ao sol; mensagem de erro no campo.
- **Segurança e LGPD:** envio de foto só do lojista autenticado e membro da loja com permissão de catálogo; EXIF (localização da foto) removido no envio; o `fake` não faz chamada externa; provedor real é suboperador listado na política de privacidade (J25).
- **Compatibilidade da câmera:** funciona sem instalar nada no Chrome do Android; em iOS (Safari) abre a câmera ou a galeria; sem permissão negada: cai na galeria com texto de ajuda.

## Histórias e critérios de aceite

### WB-370 Foto primeiro: cadastrar com 2 campos — Must — dep: WB-060
Como lojista, quero tirar a foto e só informar nome e preço, para publicar em um minuto.
- **C1** Dado "Novo produto", quando toco, então a câmera abre na hora com a opção "Escolher da galeria".
- **C2** Dado uma foto tirada, então volto ao formulário com a foto na capa e foco no nome; posso adicionar até 7 fotos.
- **C3** Dado nome e preço preenchidos e quantidade 1 (padrão), quando toco em "Publicar", então o produto fica ATIVO, visível se a loja estiver visível, e vejo "Publicado" com "Cadastrar outro" e "Duplicar".
- **C4** Dado a categoria, então vem sugerida pela última usada; posso trocar com 1 toque.
- **C5** Dado preço vazio ou inválido, então o erro aparece no campo e o botão não está desabilitado (RN-17).
- **C6** Dado a foto ainda enviando, quando publico, então vejo "Enviando a foto... 60%" e o produto publica sozinho ao terminar, sem perder o que digitei.
- **C7** Dado permissão da câmera negada, então abre a galeria e explica como liberar a câmera.
- **C8** Dado sem internet, então guardo como rascunho local e o aviso "Sem internet: vamos enviar quando voltar".
- **C9** Dado categoria proibida (WB-060 C6), então recusa com o texto padrão.
- **C10** Dado o "Você recebe cerca de R$ Y" (DEC-035), então aparece abaixo do preço enquanto digito.

### WB-371 Rascunho automático e retomada — Must — dep: WB-370
Como lojista, quero não perder o que digitei, para continuar depois.
- **C1** Dado que digito o nome e fecho o navegador, então ao voltar vejo "Continuar: Camiseta básica preta" no topo da lista de produtos.
- **C2** Dado 51 rascunhos, então avisa "Limite de 50 rascunhos".
- **C3** Dado rascunho parado há 27 dias, então aviso de que será apagado em 3 dias; aos 30 dias é removido.
- **C4** Dado o mesmo rascunho aberto em 2 aparelhos, então o 2º salvar pergunta qual versão manter.
- **C5** Dado publicar rascunho sem foto, então "Falta a foto" e nada é perdido.
- **C6** Dado a lista de produtos, então rascunhos aparecem separados dos ativos e nunca aparecem ao cliente.

### WB-372 Duplicar produto e variação — Must — dep: WB-370
Como lojista, quero duplicar um produto parecido, para cadastrar a outra cor em segundos.
- **C1** Dado "Duplicar" num produto, então abre um rascunho com nome "<nome> (cópia)", mesma categoria, descrição, preço e variações, sem fotos, sem SKU e sem código de barras, e a câmera para a nova foto.
- **C2** Dado a variação, quando duplico "M", então cria "M (cópia)" para eu trocar o valor do atributo e o estoque, sem duplicar SKU.
- **C3** Dado produto em promoção, então a cópia nasce sem promoção.
- **C4** Dado duplicar produto arquivado ou pausado por moderação, então a cópia é nova e passa pela moderação.
- **C5** Dado uma duplicação, então o histórico registra "duplicado de <id>".

### WB-373 Código de barras com a câmera — Should — dep: WB-370
Como lojista, quero ler o código do produto, para não digitar e não cadastrar duas vezes.
- **C1** Dado "Ler código de barras", então a câmera abre com moldura e lê um EAN-13 válido em até 3 s com luz normal.
- **C2** Dado o navegador sem leitor nativo (Safari), então o app usa a leitura alternativa e funciona, ou oferece "Digitar o código".
- **C3** Dado código com dígito verificador inválido, então "Código inválido: confira os números".
- **C4** Dado código já cadastrado na loja, então "Você já tem este produto" com "Abrir" e "Aumentar estoque".
- **C5** Dado código existente no catálogo de referência, então preenche nome, marca e categoria como sugestão editável, sem foto.
- **C6** Dado código desconhecido, então segue o cadastro normal com o código guardado.
- **C7** Dado base externa desligada (padrão), então nenhuma chamada sai do sistema.
- **C8** Dado categoria moda ou calçado, então a leitura aparece como opção secundária.

### WB-374 Grade tamanho x cor — Should — dep: WB-061, WB-375
Como lojista, quero marcar tamanhos e cores e preencher o estoque numa tabela, para não criar variação por variação.
- **C1** Dado tamanhos P, M, G e cores preto e branco, então a tabela mostra 6 linhas com estoque editável.
- **C2** Dado "Preencher todos com 3", então todas as células recebem 3.
- **C3** Dado mais de `variacoes_max` combinações, então recusa com o limite e o que remover.
- **C4** Dado valor de atributo repetido, então "Essa combinação já existe".
- **C5** Dado preço diferente em uma combinação (ex.: GG), então salva o preço próprio e mostra "Você recebe" dessa linha.
- **C6** Dado produto com grade e pedido em andamento, quando removo uma combinação com unidades reservadas, então bloqueia com "X unidades reservadas" (RN-06).

### WB-375 Modelos por categoria — Should — dep: WB-106
Como lojista, quero tamanhos e campos prontos da minha categoria, para digitar menos.
- **C1** Dado a categoria "Calçados", então sugere tamanhos 34 a 44 e lembra a tabela de medidas.
- **C2** Dado a categoria "Cosméticos", então sugere os campos volume e marca.
- **C3** Dado a categoria com "íntimos/higiene" no modelo, então marca "Não aceita troca por tamanho ou cor" como sugestão.
- **C4** Dado o modelo, então nada é obrigatório além da RN-Q1.
- **C5** Dado categoria sem modelo, então o formulário segue sem sugestão.

### WB-376 Colar texto e importar planilha melhorada — Should — dep: WB-370, WB-065
Como lojista, quero colar minha lista do WhatsApp, para cadastrar vários de uma vez.
- **C1** Dado o texto `Bermuda jeans M 79,90 4 un`, então a tabela de revisão mostra nome "Bermuda jeans", tamanho M, preço R$ 79,90 e quantidade 4.
- **C2** Dado linha sem preço, então fica marcada "Falta o preço" e não entra no "Publicar os válidos".
- **C3** Dado 101 linhas, então "Cole até 100 linhas por vez".
- **C4** Dado confirmar, então cria rascunhos e "Publicar os válidos" publica só os completos (foto obrigatória: sem foto fica rascunho com "Falta a foto").
- **C5** Dado preço `79.90`, `79,90` e `R$ 79,90`, então todos viram R$ 79,90.
- **C6** Dado a planilha (WB-065), então o "Baixar modelo" traz exemplos preenchidos e o mapeamento de colunas permite escolher qual coluna é nome, preço e estoque quando o cabeçalho for diferente.
- **C7** Dado a colagem, então nada sai do sistema (sem serviço externo).

### WB-377 Edição em massa tipo planilha — Should — dep: WB-066
Como lojista ou funcionário, quero ajustar preço e estoque de vários produtos numa tabela, para repor e reajustar rápido.
- **C1** Dado a tabela, quando altero o estoque de um produto, então salva na hora e mostra "Salvo"; erro mostra o motivo na linha.
- **C2** Dado seleção de 8 produtos e "+10%", então a prévia mostra preço antigo, novo e "Você recebe", e só aplica ao confirmar.
- **C3** Dado reajuste acima de 30%, então pede confirmação extra.
- **C4** Dado "Desfazer" em até 10 minutos, então todos voltam ao valor anterior; depois disso, o botão some.
- **C5** Dado estoque abaixo do reservado, então bloqueia a linha.
- **C6** Dado funcionário sem permissão de catálogo, então a tela fica somente leitura.
- **C7** Dado o histórico, então cada alteração em massa fica registrada com quem, quando e quantos itens.

### WB-378 Adaptador de IA de visão (fake por padrão) — Could — dep: WB-370
Como lojista, quero uma sugestão de nome e categoria a partir da foto, para cadastrar mais rápido, se o Webag ligar esse recurso.
- **C1** Dado o provedor `fake` (padrão), então "Sugerir pela foto" devolve uma sugestão fixa de demonstração sem chamar a rede (teste de que nenhuma requisição externa sai).
- **C2** Dado a sugestão, então aparece marcada "Sugestão automática: revise" e nenhum campo muda sem o aceite do lojista.
- **C3** Dado a sugestão de preço, então não existe.
- **C4** Dado provedor real ligado, então a tela pede o consentimento do lojista com o nome do provedor antes do 1º envio e o registra; sem o consentimento, não envia.
- **C5** Dado 51 sugestões no dia, então "Limite diário atingido" e o cadastro continua manual.
- **C6** Dado orçamento mensal esgotado, então o recurso desliga sozinho e o admin é avisado.
- **C7** Dado falha ou lentidão do provedor (acima de 8 s), então o cadastro segue sem a sugestão e sem travar.
- **C8** Dado a flag desligada, então o botão não aparece.
- **C9** Dado EXIF da foto, então foi removido antes de qualquer envio externo.

### WB-379 Medição de tempo e roteiro do teste — Must — dep: WB-370
Como PO, quero medir o tempo de cadastro, para saber se a meta de 60 s foi atingida.
- **C1** Dado um cadastro pela câmera, então o servidor grava `product_create_started`, `photo_captured`, `product_create_published` com `duration_s` e `via`.
- **C2** Dado o painel do admin (métricas, WB-356), então mostra a mediana e o p90 do tempo por `via` e por loja, com mínimo de 5 cadastros.
- **C3** Dado o roteiro de usabilidade, então está em `docs/qa` com as 5 tarefas e o critério de morte da seção Objetivo.
- **C4** Dado o teste, então o resultado e as frases do lojista vão ao `pesquisa-mercado.md` §8 como HIP-Q1.

## Eventos de analytics (servidor, sem texto do produto)
`product_create_started`, `photo_captured`, `product_create_published` (via, duration_s, photos_count, variations_count), `product_duplicated`, `barcode_scanned` (found_in: store, reference, none), `paste_import_confirmed` (lines_ok, lines_error), `bulk_price_adjusted` (items, pct_band), `ai_suggestion_requested` (provider, accepted_fields). Nada de nome, descrição ou preço em evento.

## Dependências e riscos
| Item | Tratamento |
|---|---|
| Câmera no navegador do iPhone e dos Android de entrada varia | Teste em aparelho real (T1 do `status.md`); cair para a galeria |
| Descrição opcional pode piorar conversão e informação (CDC art. 31) | RN-Q1: lembrete; medir; reverter se a conversão cair `[HIPÓTESE]` |
| Reajuste em massa errado | Prévia, confirmação acima de 30%, desfazer 10 min |
| Colar texto errado cria rascunho ruim | Tabela de revisão e rascunho por padrão |
| IA com sugestão errada vira anúncio enganoso | Nunca publica sozinha; revisão por campo; aviso |
| IA envia a foto a terceiro | Consentimento, EXIF removido, suboperador na política, teto, flag; fundador autoriza (F8); J25 |
| EAN externo e licença ODbL | Desligado por padrão; atribuição e compartilhamento igual se ligar; advogado |
| A meta de 60 s pode estar errada | É hipótese; o teste decide; o critério de morte está escrito |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Descrição opcional na via rápida: o designer e o fundador aceitam? | designer, fundador (DEC-094) |
| Leitor de código no Safari: biblioteca (WebAssembly) e licença | mobile-dev e tech-lead |
| Catálogo de referência por EAN: tabela própria, moderação e quem aprova | backend-dev, PO |
| Rascunho local no aparelho (armazenamento do navegador): limites e privacidade | mobile-dev, Security |
| Modelos por categoria: quem escreve os 8 primeiros (PO propõe, designer revisa) | PO, designer |
| Dados de fotos no EXIF e remoção no cliente ou no servidor | backend-dev |
