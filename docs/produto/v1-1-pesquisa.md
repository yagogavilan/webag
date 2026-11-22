# Pesquisa do v1.1 — cupons, análises, cadastro, mapa, rota, app do motoboy

Status: v1 | Dono: product-owner | Data: 2026-11-22 | Consulta das fontes: 2026-11-22 (todas)
PRDs: `docs/produto/prd/v1-1-*.md`. Backlog: `docs/produto/backlog.md` §10. Propostas de decisão: `docs/decisoes.md` (DEC-088 a DEC-101).

## 0. Método e limites (leia antes)

- **Só consegui ler resumos de busca.** A ferramenta de abrir páginas não resolveu nenhum domínio (planalto.gov.br, gov.br, saipos.com, infomoney.com.br, agenciagov.ebc.com.br). Portanto **nenhum texto de lei, portaria ou termo de plataforma foi lido na fonte primária**. Onde cito artigo, é o que consta em reportagem, cartilha ou blog jurídico indicado. Tudo que vai para contrato, copy ou decisão do fundador precisa de conferência pelo advogado (J22 a J27, §11).
- Rótulos: **[Fato-s]** = afirmado por fonte secundária citada; **[Fato-p]** = fonte primária ou oficial do próprio órgão/projeto, via resumo; **[HIPÓTESE]** = inferência minha, com plano de validação; **[não verificado]** = busca não trouxe.
- Nenhum número de mercado do v1.1 vem de dado do piloto (ainda não existe). Volumes e custos abaixo são ordens de grandeza.

### Perguntas que a pesquisa responde e quem decide
| # | Pergunta | Decide |
|---|---|---|
| Q1 | Existe um "cupom fake" legítimo (custo zero para o Webag) ou ele é publicidade enganosa? Qual o desenho que dá o efeito comercial sem o risco? | Fundador (política de cupom), CEO |
| Q2 | Dá para mostrar análises de navegação ao lojista sem identificar o cliente? Com que base legal e agregação mínima? | Fundador, encarregado/advogado, Security |
| Q3 | Qual o caminho de menor custo para mapa, rota e app do motoboy com 1 a 2 motoboys? Quando evoluir? | Fundador (custo recorrente), Tech Lead |
| Q4 | Como cadastrar produto em até 60 s, a custo zero, e quando entra IA paga? | Fundador (provedor pago), Designer (fluxo) |

## 1. Como as plataformas financiam cupom e desconto

| Plataforma | O que a pesquisa mostra | Fonte (consulta 2026-11-22) | Nível |
|---|---|---|---|
| iFood | Cupom de fidelidade da loja (ex.: R$ 30 a cada 5 pedidos em 20 dias, 15 dias de validade) **custeado pelo restaurante**. Cupom de cadastro (10 cupons de R$ 10) é o único gratuito ao parceiro. Um cupom por pedido. Cupons de parceiros externos: o banco paga (Nubank, R$ 20 com pedido mínimo de R$ 60, Black Friday). **Divisão de custo dos cupons do próprio iFood: não aparece em nenhuma fonte.** Cupons criados em Central de Crescimento > Promoções | Saipos (fornecedor de software, terceiro): saipos.com/integracoes/ifood/cupom-ifood; TecMundo: tecmundo.com.br/mercado/408689-... | Fato-s; divisão iFood x loja **não verificado** |
| iFood, taxa de serviço | Desde maio de 2025, R$ 0,99 em todos os pedidos (antes só pedidos de até R$ 20); Tecnoblog viu R$ 1,99 à noite sem explicação; paga o **cliente**, não altera a comissão do parceiro; Procon-SP: a cobrança deve ser justificada de forma transparente | Tecnoblog: tecnoblog.net/noticias/nao-e-impressao-o-ifood-agora-cobra-taxa-de-servico-em-todos-os-pedidos/; Serasa (guia) | Fato-s |
| 99Food | Cupom de primeira compra (relato de 70% até R$ 30 na Grande SP, 2025). Lojistas relatam **promoções ativadas pela plataforma sem autorização**, que reduziram o repasse (Correio Braziliense, abril de 2026; blog Seu Crédito Digital, pouca apuração). "Entrega grátis" com **taxa de serviço base variável de até 5,6% do pedido**, que o app diz ir aos parceiros de entrega (InfoMoney). Pesquisa PiniOn/Smart Research (2.500 recibos, SP): restaurante bancou **até 82% do desconto** na 99Food e 68,7% na Keeta em set/2026 (uma só reportagem, sem o relatório) | blogs.correiobraziliense.com.br/denise/vendedores-relatam-problemas-com-cupons-na-99food/; infomoney.com.br/?p=3161711; congressoemfoco.com.br/noticia/123417/... | Fato-s; 82% é fonte única |
| Rappi | Isenção de comissão por 3 anos em troca de "ofertas exclusivas" no app (declaração do CEO Brasil, reportagem). **Cofinanciamento e cupom financiado pelo parceiro: não encontrei** | Seu Crédito Digital / Saipos (secundárias) | Não verificado |
| Mercado Livre | Campanhas **cofinanciadas**: em campanhas automáticas e de preço competitivo o ML assume um percentual do desconto; há variante 100% financiada pelo ML; vendedor adere por campanha. Cupons ao consumidor valem só para produtos participantes, em geral percentual com pedido mínimo e teto | developers.mercadolivre.com.br/pt-br/campanhas-smart-price-matching | Fato-p (documentação do próprio ML) |

**Leitura.** O padrão do mercado é **cupom da loja = custo da loja, com adesão** e **cupom da plataforma = custo da plataforma, com orçamento**; o cofinanciamento percentual existe no ML (documentado). A tendência mostrada (99Food, Keeta) é a plataforma passar o custo ao lojista; o efeito colateral é reclamação e processo quando **a adesão não é explícita**. Para o Webag, com 5 a 30 lojas e dependência de confiança do lojista, a adesão por campanha é obrigatória `[HIPÓTESE; validar na entrevista V1/V4]`.

## 2. "Cupom fake" (preço inflado ou frete maior para depois descontar)

### 2.1 O que a pesquisa encontrou (e não encontrou)
- **Não encontrei fonte que mostre iFood, Rappi ou 99Food inflando preço ou frete para depois "dar cupom".** O que existe de documentado é outra coisa, e vale separar:
  1. **Preço de app maior que o do balcão, decisão do lojista** para absorver comissão: a Abrasel (2022, processo no Cade) estimou o iFood 17,5% mais caro ao consumidor que o restaurante; o iFood contesta a metodologia (TNH1/MoneyTimes). Não é cupom nem decisão da plataforma. **O Webag já faz isso por desenho (DEC-035: o lojista cadastra o preço já com a comissão).**
  2. **Taxa de serviço** universal (iFood, R$ 0,99) e **"entrega grátis" com taxa de serviço variável** (99Food, até 5,6%): o custo reaparece em outra linha. É exatamente o que o regulador está olhando agora (item 2.2).
  3. **Cofinanciamento** (ML): o desconto é dividido entre plataforma e vendedor com regra publicada.
- Logo, a ideia do fundador (d) "sai custo zero para o Webag de alguma forma (aumenta o preço ou cobra mais no frete)" **descreve o item 2 acima, que hoje é alvo de processo**, não uma prática validada de mercado.

### 2.2 Enquadramento legal (fontes secundárias; o PO não é advogado)
| Norma | O que consta (fonte) | Implicação para o Webag |
|---|---|---|
| CDC art. 6º III, 30, 31 | Informação adequada e clara; oferta vincula o fornecedor; o preço informado pode ser exigido (cartilhas Procon-SP e Prefeitura de Guarulhos; texto dos artigos **não aberto**) | Todo cupom é oferta: o que aparece vale. Cupom encerrado de surpresa gerou notificação do Procon-SP ao PayPal (2021, Tecnoblog) |
| CDC art. 37 §1º e §3º; art. 67 | Preço entre os dados protegidos contra informação enganosa; omissão de dado essencial; crime de publicidade enganosa (detenção de 3 meses a 1 ano e multa) (Migalhas; Agência Gov) | Preço de referência inflado = enganosa. Aplica também ao "de R$ X por R$ Y" **da loja**: risco do marketplace (art. 7º pu e 25 §1º, tema J7) |
| Senacon, Black Friday 2024 | A prática de elevar o preço pouco antes do desconto fere o CDC; comerciante pode ser penalizado (Agência Gov, nov/2024) | Confirma a posição do fundador |
| **Portaria Senacon 61/2026 ("Portaria da Transparência", publicada em 2026-03-24)** | Aplica-se a plataformas de intermediação de **transporte e de coleta e entrega de bens, inclusive refeições**. Exige informar a composição do preço: parcela retida pela plataforma, repasse ao entregador e ao estabelecimento. Senacon abriu processo contra **iFood e Keeta (2026-05-27)** e **99Food (2026-06-23)**; multa de até R$ 14 milhões; a Senacon exige **comprovar que "taxa de entrega" = valor ao entregador e "taxa de serviço" = parcela retida pela plataforma**; "segredo de negócio" foi rejeitado como defesa (Tecnoblog, Canaltech, Mobile Time, Brasil de Fato, jun/2026). **Texto da portaria: não aberto** | **O Webag provavelmente é destinatário** (intermedia coleta e entrega com motoboys contratados). **A taxa de entrega do Webag é receita da plataforma e hoje excede o custo do motoboy em alguns cenários (RN-10; DEC-036a) e o custo previsto do seed supera a taxa (`relatorio-final.md` (d)4).** Risco novo para o **v1.0 também** (J22). Um cupom "fake" escondido em frete ou taxa agrava |
| Decreto 7.962/2013 (art. 2º a 5º) | Informações claras, preço total com despesas de entrega discriminadas (Senado, bases legais; **texto não aberto**) | Já no checkout do v1.0 (WB-023). O cupom precisa aparecer discriminado |
| Lei 13.455/2017 | Autoriza diferenciar preço por prazo ou instrumento de pagamento; exige informar o desconto em local visível (art. 5º-A da Lei 10.962/2004); revogou o art. 39 X do CDC segundo a Migalhas (Dizer o Direito discorda em parte) (Migalhas, Dizer o Direito) | Preço diferente **por meio de pagamento** é lícito se informado; "desconto no PIX" seria legítimo, mas **conflita com a DEC-052** (sem destaque ao PIX) |
| Conar (CBAP art. 27) | Recomenda cuidado redobrado com a palavra "grátis" (Conjur, julgado); texto integral não aberto | "Frete grátis" só com a rubrica real visível |
| Pedido mínimo | Procon-MG multou o iFood em R$ 1,5 milhão por impor valor mínimo (venda casada; 2025-10-01); TJ-SC anulou multa semelhante e TJ-GO validou o pedido mínimo (MPMG; Migalhas) | **Divergência de tribunais.** Pedido mínimo **como condição de cupom** é prática comum; o **pedido mínimo global** da RN-04 (R$ 20) merece olhar do advogado (J23) |
| CADE, TCC do iFood (2023, vigente até 2027-08) | Proíbe cláusula de paridade de preço **entre marketplaces** (MFN) (CNN Brasil, Bloomberg Línea) | O Webag **não deve exigir paridade de preço** do lojista em nenhum termo (preço de app livre) |

### 2.3 Conclusão sobre o "cupom fake"
**Confirmo a posição do fundador: recusar o cupom "fake" na forma de preço inflado, frete inflado ou taxa escondida.** Não há evidência de que a prática seja padrão do iFood, há norma e processo ativos (Portaria 61/2026) e o risco recai sobre o Webag como plataforma e como co-responsável pelo preço do lojista.

**O que dá o mesmo efeito comercial, de forma legítima** (desenho em `prd/v1-1-cupons.md`):
1. **Autofinanciado**: o desconto sai de uma parcela da margem de contribuição prevista do próprio pedido, com teto por regra, orçamento e transparência. Não é "custo zero": é **custo limitado e nunca maior que a margem do pedido** (o pedido não dá prejuízo por causa do cupom). Honestidade: o custo existe, só não passa do que o pedido rende.
2. **Cofinanciado** com adesão e percentual conhecido (modelo ML).
3. **Taxa de serviço visível** (modelo iFood R$ 0,99), com nome e valor reais, se o fundador quiser que o cliente financie marketing e margem de entrega. Entra na Portaria 61/2026: precisa corresponder ao que a plataforma retém.
4. **Preço promocional da loja com preço de referência comprovado**: "de/por" só se o preço anterior foi praticado por pelo menos 30 dias `[HIPÓTESE; regra conservadora, sem norma brasileira expressa achada; advogado]`.

## 3. Análises do lojista e LGPD

| Tema | O que a pesquisa mostra (fonte) | Efeito no desenho |
|---|---|---|
| Dado pessoal | Informação relacionada a pessoa natural **identificada ou identificável** (LGPD art. 5º I, via ANPD e resumos). Dado de navegação ligado a conta ou aparelho recorrente é dado pessoal | Evento com `user_id` ou id de aparelho persistente é dado pessoal |
| Anonimização | O dado anonimizado deixa de ser pessoal, salvo reversão por esforço razoável (LGPD art. 12; **texto não aberto**, citado por mim a partir de conhecimento geral: **[não verificado]**) | A **agregação com mínimo de 5** é a barreira entre o dado interno do Webag e o que o lojista vê |
| Legítimo interesse x consentimento | Guia ANPD de cookies (2022-10-18): analítica (medição de audiência) pode apoiar-se em legítimo interesse; publicidade tende a exigir consentimento; cookies necessários, legítimo interesse (Mattos Filho, Machado Meyer, Lefosse, Canaltech: secundárias). Guia ANPD de legítimo interesse (2024) existe; texto não aberto | Medição agregada para a própria plataforma: legítimo interesse **plausível**, com aviso e opt-out `[HIPÓTESE; encarregado/advogado]`. **Compartilhar navegação identificada com terceiro (o lojista) é outra finalidade**: exigiria consentimento específico, e fica fora |
| Finalidade e minimização | Princípios do art. 6º: finalidade, necessidade, transparência (TRT-9 e outras, via busca de geolocalização) | O que o Webag prometeu ao cliente (RN-14: o lojista só vê dados em pedido ativo) é incompatível com mostrar navegação do cliente à loja |
| Geolocalização do entregador | Monitoramento deve ter finalidade legítima, ser necessário e proporcional; monitoramento fora do expediente é excessivo; consentimento em relação de subordinação é frágil; **retenção: nenhuma fonte achada** (TRT-9, Legale, PUC-SP) | GPS só em corrida ativa, aviso claro, retenção curta, acesso do próprio motoboy ao seu histórico. Também pesa no risco de vínculo (J8) |

**Posição.** "Por usuário" ao lojista, com identidade do cliente, **não**: finalidade nova sem base legal, contradiz RN-14 e a política de privacidade, e o ganho do lojista (saber quem visitou) é baixo. Nível seguro proposto no PRD: agregado, com mínimo de 5 por célula, sem nome, sem lista, sem exportação por pessoa. Nível 2 (cliente que **segue** a loja e consente em receber ofertas) fica para depois, com parecer.

## 4. Cadastro de produto: benchmark

| Referência | O que faz | Fonte | Nível |
|---|---|---|---|
| WhatsApp Business (catálogo) | Cadastro pelo app: foto, título único, preço opcional; até 10 imagens por item; item vai a aprovação; teto de 500 itens por catálogo | developers.facebook.com (catálogos), WATI, respond.io | Fato-s |
| iFood Portal do Parceiro | Cadastro por Cardápio, categorias; **pré-cardápio gerado** a partir de informações enviadas (texto antigo); recomenda foto e descrição de qualidade. Importação por planilha e IA de cadastro: **não verificado**. Há IA "Toqan" para parceiros (iFood Move 2026), sem relação comprovada com cadastro | Saipos, Remessa Online, Bling blog, Canaltech | Fato-s; planilha/IA **não verificado** |
| Mercado Livre | Título até 60 caracteres, categoria obrigatória antes de publicar; IA própria para **imagens** (modelo vestindo a peça, set/2025); IA de título e atributos vem de ferramentas de terceiros (UpSeller) | UpSeller, Base.com, Mobile Time | Fato-s; IA de cadastro pela foto **não verificado** |
| Shopify | App móvel: sobe foto, define preço, lê código de barras **para ajustar estoque**; Magic aparece só para fundo de imagem na busca. Cadastro por código de barras e por foto vêm de **apps de terceiros** (Scalez: 20 leituras grátis; Qiksy: IA lê nome, marca, tamanho, código e validade da foto, 200 fotos grátis/mês) | apps.shopify.com | Fato-s |
| Square | **Importação CSV/XLSX** com mapeamento de colunas; variação é uma linha por variação; GTIN com 8 a 13 dígitos; cadastro novo por leitura de código no app: **não achei** | squareup.com/help | Fato-s |
| Bling | Importar e atualizar por planilha (máx. 1.000 produtos); produto-pai com variações (grade tamanho e cor); distingue SKU (interno) de GTIN/EAN | ajuda.bling.com.br, blog.bling.com.br | Fato-s |
| Rappi | Catálogo de parceiros por questionário e integração; detalhes de cadastro e cofinanciamento: **não achei** | ecommercenapratica | Não verificado |

**Leitura.** Planilha e grade de variações são o piso do mercado (o Webag já tem planilha, WB-065). Ninguém, nas fontes achadas, oferece foto com câmera + 2 campos como fluxo principal para pequeno lojista: é onde o Webag pode ganhar `[HIPÓTESE; validar no teste de usabilidade]`. **Para moda e calçado (o miolo do piloto) o EAN quase não existe** (etiqueta da própria loja) `[HIPÓTESE; perguntar na entrevista]`, então leitura de código vale para cosméticos, eletrônicos, pet e papelaria; foto, duplicar e grade valem para todos.

### 4.1 Leitura de código de barras no navegador
| Item | Fato | Fonte |
|---|---|---|
| `BarcodeDetector` | Chrome Android com Google Play Services (a partir do Chrome 83); desktop só ChromeOS e macOS; **Safari iOS desabilitado por padrão**; Firefox não; não é Baseline; a recomendação é feature-detect + polyfill (ex.: WebAssembly) | caniuse, MDN, developer.chrome.com |
| Base de EAN gratuita | Open Food Facts e Open Beauty Facts (licença ODbL, exige atribuição e compartilhamento igual); a cobertura brasileira fora de alimentos **não verificada**. Cosmos (Bluesoft): busca por GTIN existe, **termos e limites da API não verificados**. GS1 Brasil: prefixos 789 e 790 (fonte secundária) | openfoodfacts, App Store (Cosmos) |

## 5. IA de visão para o cadastro (adaptador opcional)

Princípio igual ao `PaymentProvider`: interface `ProductVisionProvider`, provedor `fake` por padrão (determinístico, sem rede), provedor real só com autorização do fundador (regra 6: custo recorrente e envio de dado a terceiro).

| Opção | Custo (ordem de grandeza) | Riscos e limites | Nível |
|---|---|---|---|
| `fake` (padrão) | R$ 0 | Não sugere nada útil; serve a testes e demonstração | n/a |
| Modelo pequeno de visão via API (ex.: família Flash-Lite do Gemini; modelos "mini"/"Haiku" de outros fornecedores) | Gemini API: US$ 0,30 por milhão de tokens de entrada e US$ 2,50 de saída (página de preços, **valores conflitantes entre páginas**, alguns promocionais até 2026-12-31 e com mudança em 2027-01-01); Haiku 5.5: US$ 0,10 e US$ 0,50 por milhão em agregadores; Haiku 4.5: US$ 1 e US$ 5. Cálculo meu: **cerca de US$ 0,0002 a 0,003 por foto** (imagem de algumas centenas a 1.600 tokens, resposta de ~300). 2.000 fotos (10 lojas x 200 produtos): **abaixo de US$ 10 no total** | Envia a foto a terceiro (LGPD art. 33 se o servidor for fora do país; contrato de operador; verificar se o fornecedor treina com o dado); a foto pode conter pessoa, rosto, fundo com endereço; sugestão errada vira anúncio enganoso (CDC art. 37) se publicada sem revisão; preço atual **não verificado em página oficial** | Preços: Fato-s/agregadores; cálculo: HIPÓTESE |
| API de rótulos de imagem (visão clássica) | Preço **não verificado** | Devolve etiquetas, não texto de anúncio | Não verificado |
| Modelo no aparelho (ex.: classificação zero-shot no navegador) | R$ 0 recorrente | Download de dezenas de MB em 3G; só categoria; **conhecimento geral, não verificado** | HIPÓTESE |

**Recomendação.** Construir só a interface e o `fake` na v1.1 (esforço pequeno, nada pago). O que a IA sugere: **nome, categoria, atributos (cor, material) e descrição curta, sempre como rascunho que o lojista revisa**. **Não sugerir preço a partir da foto** (não há base: seria chute); preço sugerido vem de dado interno (mediana da categoria na região, quando houver 5 ou mais lojas) fora da v1.1. Teto por loja (50 sugestões por dia) e orçamento mensal global com chave de desligar. Quem decide ligar o real: fundador, com parecer do Security (suboperador, política de privacidade) e custo mensal definido.

## 6. Mapa e tiles

| Opção | Licença e termos | Custo | Produção permitida? | Fonte |
|---|---|---|---|---|
| tile.openstreetmap.org (servidor da fundação) | Política OSMF: sem limite numérico; **pode bloquear sem aviso**; baixar área para uso offline é proibido; aplicativos com uso pesado devem usar servidor próprio ou de terceiro; lista de usos "pesados" inclui app de consumo e site comercial em produção (lista de e-mail de 2013, não oficial) | R$ 0 | **Não recomendado em produção** | operations.osmfoundation.org/policies/tiles/ (via busca) |
| **Protomaps (PMTiles) hospedado por nós** | Código BSD-3, desenho CC0, **dados ODbL com atribuição visível a OpenStreetMap**; um arquivo único servido por HTTP range, sem servidor de mapas; planeta ~120 GB (z0-15), **existem extratos regionais** (tamanho do extrato da Grande SP: **não verificado**) | Armazenamento e banda (já existem: armazenamento S3/MinIO do projeto) | **Sim** | protomaps.com, docs.protomaps.com |
| MapLibre GL JS / Native (renderizador) | Código aberto (fork do Mapbox GL antes da mudança de licença; **conhecimento geral, não verificado nesta pesquisa**) | R$ 0 | Sim | docs.protomaps.com/basemaps/maplibre (uso com Protomaps) |
| MapTiler Cloud | **Plano grátis só não comercial** e P&D; ~5.000 sessões e 100.000 requisições/mês (terciária); plano para produção a partir de ~US$ 2.500/ano (terciária, **não confirmado**) | Pago para produção | Só pago | maptiler.com/cloud/terms |
| Stadia Maps | Plano grátis **não permite uso comercial** (qualquer produto que gere receita) | Pago para produção | Só pago | stadiamaps.com/learn |
| Mapbox / Google Maps (mapa) | Chave e cobrança por uso; Mapbox: sem cartão, 10.000 requisições/mês por API (documentação de cadastro) | Pago | Sim, com custo | docs.mapbox.com, developers.google.com |

**Recomendação (custo zero):** MapLibre + Protomaps com extrato regional hospedado no armazenamento do projeto, atribuição OpenStreetMap visível. **Pergunta ao Tech Lead e ao mobile-dev:** o app Expo usa módulo nativo do MapLibre (exige build de desenvolvimento, não roda no Expo Go) ou WebView com MapLibre GL JS? Isso afeta o fluxo do fundador (Expo Go no iPhone, DEC-087).

## 7. Roteirização

Contexto: 1 a 2 motoboys; lote até `entrega_lote_max` corridas da mesma cidade (RN-18). Com até 8 paradas, a ordem ótima se calcula por **enumeração exata em milissegundos**; heurística (vizinho mais próximo + 2-opt) basta além disso.

| Opção | Custo | Licença / termos | Observações | Fonte |
|---|---|---|---|---|
| **Heurística própria** (distância em linha reta x fator 1,3, restrição coleta antes da entrega, prazo restante) | R$ 0, sem dependência | Próprio | Combina com o ETA já em produção (RN-19). Erra onde a rua dá volta (rio, linha de trem, morro) | n/a |
| **Abrir no Google Maps ou Waze** (link por parada) | R$ 0 | Maps URLs: `google.com/maps/dir/?api=1`, com paradas intermediárias e modo de viagem; **limite de paradas e comportamento iOS/Android não verificados** | O motoboy já usa o app que conhece; navegação por voz | developers.google.com/maps/documentation/urls |
| OSRM hospedado por nós | Servidor (VPS); **memória do extrato regional não verificada** | Código aberto (BSD, conhecimento geral); o **servidor demo público não é para produção** e o acesso pode ser retirado a qualquer momento (FOSSGIS) | Dá distância e geometria reais; operação extra (atualizar extrato, monitorar) | OSRM wiki, routing.openstreetmap.de |
| Valhalla hospedado | Servidor | **MIT**; ladrilhos de roteamento a partir de extrato; matriz padrão limitada a 20 pontos (configurável) | Inclui matriz e otimização de roteiro | github.com/Valhalla |
| OpenRouteService (API pública) | Plano grátis; cotas **conflitantes** entre páginas (ex.: 2.000 rotas/dia e 40/min; ou 10.000/60; otimização de rotas 500/dia em 2020); 429 ao exceder | Termos de uso comercial **não verificados** | Opção de teste; produção pede hospedagem própria ou contato | openrouteservice.org/plans |
| Google Routes / Route Optimization | Routes Essentials 10.000 grátis/mês e ~US$ 5 por mil depois; Route Optimization cobra por parada, 5.000 grátis (veículo único, ~US$ 10 por mil) (**snapshots conflitantes**) | Conta com faturamento | **Exige cartão e autorização do fundador** | developers.google.com/maps/billing-and-pricing |
| Mapbox Directions/Optimization | 10.000 requisições/mês sem cartão (cadastro) | Token e licença do Mapbox | Autorização do fundador | docs.mapbox.com/accounts |

**Recomendação.** Heurística própria + "abrir no Maps/Waze". **Gatilho para motor de rota próprio (OSRM ou Valhalla):** o erro mediano entre ETA estimado e real passar de 10 minutos por distância subestimada, ou 3 ou mais motoboys simultâneos, ou 15 entregas por hora no pico (mesmo gatilho do backlog §6.1). **Gatilho para provedor pago:** só se a operação do motor próprio custar mais horas do fundador do que a fatura, decisão dele.

## 8. App do motoboy: PWA x nativo

| Opção | GPS com Waze/Maps aberto? | Custo | Distribuição | Limites |
|---|---|---|---|---|
| PWA (site instalado) | **Não.** Chrome Android para `watchPosition` com a página em segundo plano; iOS não executa página em segundo plano; Wake Lock mantém a **tela** ligada (iOS em PWA instalado tinha bug em 2023) | R$ 0 | Link | Se o motoboy navega no Waze, o PWA fica em segundo plano e o rastreio some. Serve só a quem **usa o próprio app Webag como navegação** (pior experiência) | 
| **App nativo Android (Expo) por APK direto** | **Sim**, com serviço em primeiro plano e notificação fixa | R$ 0 (build EAS: plano gratuito com franquia mensal; **valor atual não verificado**) | Link do APK (instalar de fonte desconhecida; aviso do Play Protect) | Atualização manual ou OTA só de JavaScript; sem revisão de loja |
| Android na Google Play | Sim | Taxa única de US$ 25 (artigo brasileiro, secundária) | Loja | Exige declaração de localização em segundo plano e revisão; só se justificar |
| iOS nativo | Sim | **US$ 99 por ano** (Apple, documentação do programa) | TestFlight/App Store | Pede conta Apple Developer (regra 6: autorização) |
| WhatsApp "localização em tempo real" (conta do motoboy com a operação) | Sim (app do WhatsApp) | R$ 0 | Já existe | **Não alimenta o mapa do cliente** (sem integração); serve de "concierge" na primeira semana |

**Recomendação.** (1) Semana 0 do piloto: motoboy compartilha localização com a operação pelo WhatsApp (custo zero, mede a necessidade de rastreio). (2) v1.1: **app Android separado (`apps/courier` no monorepo)** por APK direto, exigindo Android do motoboy; "app separado" mantém a localização em segundo plano fora do app do cliente (evita ressalva de privacidade e revisão da Play para todos os clientes). (3) iOS do motoboy: só se um motoboy contratado tiver iPhone e o fundador autorizar a conta Apple; até lá, modo degradado (PWA com tela ligada, sem rastreio contínuo). `[HIPÓTESE: motoboys locais têm Android de entrada; validar na cotação de 3 a 5 motoboys]`.

## 9. Rastreio ao vivo: frequência e bateria `[HIPÓTESE; calibrar no piloto]`
- Ponto do motoboy a cada **8 a 10 s em movimento** e a cada **30 s parado** (velocidade menor que 1 m/s), enviado em lote quando houver sinal; o servidor entrega ao cliente no máximo **1 atualização a cada 5 s**; o app do cliente **anima o marcador** entre pontos (a fluidez vem da animação, não de mais pontos).
- Volume: 2 motoboys x 10 h x ~360 pontos/h = ~7.200 pontos/dia por motoboy. Desprezível para PostgreSQL.
- Bateria: GPS de alta precisão é o maior custo; a precisão cai para "equilibrada" quando parado. Medir no teste em aparelho real (a validar com QA: 1 h de corrida, consumo de bateria em Android de entrada).
- ETA ao vivo: recalculado a cada ponto (distância restante em linha reta x 1,3 x min/km do RN-19, suavizado); **informativo**, nunca substitui a faixa prometida (DEC-076 A-06).

## 10. Lacunas e próximas validações
| # | Lacuna | Quem preenche | Como |
|---|---|---|---|
| L1 | Texto da Portaria Senacon 61/2026 e se o Webag é destinatário | Advogado do fundador | J22 |
| L2 | Termos de cupons do iFood e do Rappi (divisão de custo) | Fundador | Entrevista com 3 lojistas que já vendem em app; pedir print do relatório de repasse |
| L3 | Disposição a pagar pelo módulo Análises | Fundador | Entrevista (5 lojistas) + botão de interesse no painel (teste de porta falsa) |
| L4 | Lojistas de moda usam EAN? | Fundador | Pergunta na entrevista: "como você identifica o produto hoje?" |
| L5 | Tamanho do extrato Protomaps da Grande SP; RAM do OSRM | Tech Lead | Spike de 1 dia |
| L6 | Limite de paradas e comportamento do link do Google Maps no Android e iOS | mobile-dev | Teste em aparelho |
| L7 | Preços atuais de IA de visão e política de treinamento com dados | Fundador, Security | Só se for ligar o provedor real |
| L8 | Motoboys locais têm Android? Aceitam app e rastreio? | Fundador | Cotação de 3 a 5 motoboys |
| L9 | Coberturas de EAN brasileiros no Open Food Facts/Beauty e no Cosmos | Backend | Spike com 100 EANs reais da loja do piloto |

## 11. Decisões que só o fundador toma (recomendação padrão de custo zero)

| # | Decisão | Opções | Recomendação padrão (custo zero) | Custo / risco | Bloqueia |
|---|---|---|---|---|---|
| F1 | **Política de cupom** | (a) só fontes legítimas; (b) aceitar "cupom fake" | **(a)**: Plataforma, Loja (com adesão), Cofinanciado e Autofinanciado. Recusar preço, frete ou taxa inflados | (b) expõe o Webag ao CDC art. 37, art. 67 e à Portaria 61/2026 | WB-340 a 349 |
| F2 | Teto do autofinanciado e **orçamento mensal de cupons do Webag** | percentual da margem prevista; valor em R$ | Teto = **50% da margem prevista do pedido** (`[HIPÓTESE]`, editável) e **orçamento de R$ 0 até o fundador definir um valor**; cupom da plataforma só com orçamento > 0 | Todo cupom é custo real; o teto impede prejuízo por pedido, não impede o gasto total (orçamento impede) | WB-341 |
| F3 | **Taxa de serviço** visível para financiar marketing e margem de entrega | ligar ou não; valor | **Desligada** (como hoje). Se ligar, rubrica com nome e valor reais | Conversão do cliente; Portaria 61/2026 | decide junto com F4 |
| F4 | **Margem de entrega negativa** (custo previsto do motoboy acima da taxa cobrada no seed): ajustar a tabela ou aceitar | ajustar tabela; subsidiar; frete grátis acima de X | Cotar motoboys antes e ajustar a tabela; **sem frete grátis** até haver margem (backlog §7 item 13) | Sem isso, "autofinanciado" cai a zero em entrega | WB-341 |
| F5 | **Preço do módulo Análises** e teste grátis | mensalidade; % da venda; grátis | **Não fixar preço agora.** Teste de porta falsa + 5 entrevistas; sugestão inicial `[HIPÓTESE]`: teste grátis de 30 dias, depois valor que não passe de ~5% da comissão mensal média da loja pagante | Receita incerta; construir antes da demanda é desperdício | WB-360 a 369 |
| F6 | **Cobrança do módulo** | manual por PIX fora do sistema; cobrança recorrente automática (Mercado Pago, custo e integração novos) | **Manual**: o admin ativa a loja e registra "pago até DD/MM". **Não** como desconto no repasse (DEC-016: sem retenção no split) | Automatizar só com 20 lojas pagantes ou 3 atrasos por mês; exige autorização (regra 6) | WB-366 |
| F7 | **Base legal da coleta de eventos** | legítimo interesse + opt-out; consentimento opt-in | **Legítimo interesse + opt-out** para medição agregada com id de sessão rotativo; vinculação a conta só com consentimento. Depende do parecer do encarregado | Opt-in reduz cobertura e enviesa o funil; opt-out sem parecer é risco | WB-361 |
| F8 | **IA de visão real** | fake; provedor real | **Fake.** Real só com autorização, parecer do Security e teto mensal em R$ | Custo por uso, envio da foto a terceiro | WB-378 |
| F9 | **Base de EAN externa** | desligada; Open Food Facts/Beauty (grátis, ODbL); Cosmos | **Só base própria do Webag** na v1.1; externa atrás de flag, desligada | Licença ODbL (atribuição); termos do Cosmos não verificados | WB-373 |
| F10 | **Distribuição do app do motoboy** | APK direto; Google Play (US$ 25); iOS (US$ 99/ano) | **APK direto, Android obrigatório**; sem Play e sem Apple | Instalação com aviso do Play Protect; sem iOS | WB-385 |
| F11 | **Mapa e rota** | Protomaps próprio + heurística + Maps/Waze; provedores pagos | **Protomaps + heurística + Maps/Waze** (sem fatura nova) | Rota em linha reta pode errar; gatilho na §7 | WB-380, 381, 392 |
| F12 | **Confirmação de saída pela loja** | estrita (nunca automática); automática após 5 min com o motoboy a até 150 m da loja | **Automática com aviso à loja** (a loja que esquece não trava o pedido); medir % | Estrita bloqueia pedido se a loja ignora; automática enfraquece a cadeia de custódia | WB-390, 391 |
| F13 | **Rastreio em lote** | mapa sempre; só quando o pedido é a próxima parada | **Só como próxima parada** (privacidade do vizinho) | Menos "uau" | WB-392 |
| F14 | **Retenção** | GPS 7 dias; eventos brutos 90 dias; agregados 25 meses | Como proposto (`[HIPÓTESE]`; jurídico) | Prova em disputa x minimização | WB-363, 389, 395 |
| F15 | **Admin "ver como o lojista"** | somente leitura; entrar como o lojista (escrita) | **Somente leitura**, com motivo e log. Sem "entrar como" | Escrita em nome do lojista apaga a trilha de quem fez | WB-352 |
| F16 | **Parecer jurídico antes de construir o app do motoboy e antes de contratar qualquer motoboy** (já era regra, DEC-039) | sim | **Sim, bloqueia WB-383 a 389** | Vínculo (J8): o app com rota e GPS aumenta o indício de subordinação | WB-383 a 389 |
| F17 | **Parecer sobre a Portaria Senacon 61/2026 e a rubrica "taxa de entrega"** (vale para o v1.0) | sim | **Sim, antes do piloto** | Multa de até R$ 14 milhões em casos abertos | G5 do v1.0 |

## 12. Fontes (todas consultadas em 2026-11-22; via resumo de busca)
- Cupons iFood: https://saipos.com/integracoes/ifood/cupom-ifood ; https://www.tecmundo.com.br/mercado/408689-ifood-oferece-cupons-de-ate-r-20-para-clientes-nubank-veja-como-aproveitar.htm
- Taxa de serviço iFood: https://tecnoblog.net/noticias/nao-e-impressao-o-ifood-agora-cobra-taxa-de-servico-em-todos-os-pedidos/ ; https://www.serasa.com.br/renda-extra/abrir-loja-no-ifood/
- 99Food: https://blogs.correiobraziliense.com.br/denise/vendedores-relatam-problemas-com-cupons-na-99food/ ; https://www.infomoney.com.br/?p=3161711 ; https://seucreditodigital.com.br/99food-descontos-sem-consentimento/ ; https://www.congressoemfoco.com.br/noticia/123417/pesquisa-aponta-que-restaurantes-bancam-ate-82-dos-cupons-de-delivery
- Mercado Livre (campanhas cofinanciadas): https://developers.mercadolivre.com.br/pt-br/campanhas-smart-price-matching
- Abrasel x iFood: https://www.tnh1.com.br/noticia/nid/comida-no-ifood-fica-175-mais-cara-do-que-no-restaurante-diz-associacao/
- CDC e desconto falso: https://agenciagov.ebc.com.br/noticias/202411/black-friday-saiba-como-identificar-descontos-enganosos ; https://www.migalhas.com.br/coluna/abc-do-cdc/292017/black-friday---o-cdc-ainda-esta-em-vigor ; Procon-SP/PayPal: https://tecnoblog.net/noticias/exclusivo-procon-sp-notifica-paypal-por-cupons-de-r-50-cancelados/
- Portaria Senacon 61/2026 e processos: https://tecnoblog.net/noticias/governo-abre-processo-contra-99food-por-omissao-de-taxas-dos-clientes/ ; https://tecnoblog.net/noticias/governo-abre-processo-que-pode-render-multa-milionaria-a-ifood-e-keeta/ ; https://www.mobiletime.com.br/noticias/24/06/2026/senacon-99food-sancao/ ; https://www.brasildefato.com.br/2026/05/27/keeta-e-ifood-podem-receber-multa-milionaria-por-ignorar-transparencia/ (texto da portaria: https://www.gov.br/mj/pt-br/assuntos/noticias/mjsp-publica-portaria-que-obriga-plataformas-de-transporte-e-delivery-a-detalhar-composicao-de-precos-ao-consumidor/Portaria061240326.pdf, **não aberto**)
- Lei 13.455/2017: https://www.migalhas.com.br/quentes/294521/advogada-explica-diferenciacao-de-precos-em-estabelecimentos-comerciais ; https://www.dizerodireito.com.br/2017/06/lei-134552017-comercianteprestador-de.html
- Decreto 7.962/2013: https://www12.senado.leg.br/noticias/materias/2013/05/21/comercio-eletronico-ja-tem-regulamentacao (texto no Planalto, **não aberto**)
- Pedido mínimo: https://www.mpmg.mp.br/portal/menu/comunicacao/noticias/procon-mpmg-multa-ifood-em-r-1-5-milhao-por-impor-valor-minimo-em-pedidos.shtml ; https://www.migalhas.com.br/quentes/443531/tj-sc-anula-multa-ao-ifood-e-nega-venda-casada-no-pedido-minimo ; https://www.migalhas.com.br/quentes/451729/tjgo-valida-cobranca-de-pedido-minimo-por-restaurantes-no-ifood
- CADE e iFood: https://www.cnnbrasil.com.br/economia/mercado/ifood-assina-termo-de-compromisso-com-cade-para-reduzir-concentracao-de-mercado/
- LGPD e cookies (ANPD): https://www.mattosfilho.com.br/unico/anpd-guia-cookies-protecao-dados/ ; https://lefosse.com/noticias/anpd-publica-guia-orientativo-sobre-o-uso-de-cookies ; https://canaltech.com.br/governo/guia-do-governo-traz-orientacoes-sobre-cookies-e-protecao-de-dados-227679/ ; geolocalização de trabalhador: https://www.migalhas.com.br/depeso/368015/lgpd-e-a-geolocalizacao-como-meio-de-prova-trabalhista
- Cadastro: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalogs-overview/ ; https://apps.shopify.com/scalez-barcode-scanner ; https://apps.shopify.com/qiksy-shelf ; https://squareup.com/help/us/en/article/5153-import-items-online ; https://ajuda.bling.com.br ; https://www.mobiletime.com.br/noticias/26/09/2025/mercado-livre-ia/ ; https://www.upseller.com/pt/doc-article/777
- Código de barras: https://caniuse.com/mdn-api_barcodedetector ; https://developer.chrome.com/docs/capabilities/shape-detection ; https://world.openfoodfacts.org
- IA: https://ai.google.dev/gemini-api/docs/pricing ; https://docs.claude.com/en/docs/about-claude/pricing ; agregador https://www.activepieces.com/blog/claude-haiku-55-api-pricing-rates-and-costs-for-2026.md
- Mapa e rota: https://operations.osmfoundation.org/policies/tiles/ ; https://docs.protomaps.com/basemaps/maplibre ; https://protomaps.com/faq ; https://www.maptiler.com/cloud/terms/ ; https://stadiamaps.com/learn/what-does-a-free-map-api-cost/ ; https://github.com/Project-OSRM/osrm-backend/wiki/API%20Usage%20Policy ; https://routing.openstreetmap.de/about.html ; https://github.com/Valhalla/valhalla ; https://openrouteservice.org/plans/ ; https://developers.google.com/maps/billing-and-pricing/pricing ; https://developers.google.com/maps/documentation/urls/get-started ; https://docs.mapbox.com/accounts/guides/signup/
- App: https://bugs.webkit.org/show_bug.cgi?id=254545 ; https://developer.apple.com/br/help/account/membership/program-enrollment/ ; https://support.google.com/googleplay/android-developer/answer/6106161 ; https://docs.expo.dev/billing/plans/ ; https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados
