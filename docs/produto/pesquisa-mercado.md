# Pesquisa de Mercado — Webag (região de Francisco Morato)

Status: v1 para G1 (já aprovado, DEC-002) | Dono: product-owner | Data da pesquisa: 2026-11-18
Método: pesquisa web secundária em 2026-11-18. Não houve entrevista com lojista nem consumidor. Onde a fonte é blog ou imprensa e não o dado primário, está dito. O que não encontrei está marcado `[HIPÓTESE]` com plano de validação (§8). Números de fontes divergentes aparecem como faixa.

## 1. Resumo para decisão
1. **A região é grande o bastante para um piloto, pequena para errar.** As 4 cidades somam ~482,7 mil habitantes (Censo 2022). Um marketplace local vive de densidade: 30 lojas bem escolhidas valem mais que 200 espalhadas.
2. **O concorrente real de produto é o WhatsApp/Instagram da loja e o Shopee/Mercado Livre**, não o iFood. Shopee tem centro de distribuição em Franco da Rocha e entrega no mesmo dia/dia seguinte na Grande SP. O Webag só ganha onde o varejo local é mais rápido, confiável ou tem o produto na hora, e onde **trocar** é fácil.
3. **PIX é o meio dominante e já é nativo no MP** (0,99%). Cartão cobre o resto, mas custa ~4-5% ao lojista. Dinheiro na entrega está fora do brief e é um risco de adoção (§7).
4. **Comissão de 10% (HIP-001) é defensável**, abaixo de iFood (12% + 3,2%) e de Shopee/ML (14-20% + taxa fixa por item), mas só se o Webag não prometer logística.
5. **Maior risco jurídico:** o brief deixa a loja decidir se aceita troca; o CDC impõe piso (arrependimento 7 dias, defeito). Ajustado em HIP-017.

## 2. Região e demanda

| Cidade | População (Censo 2022) | Fonte |
|---|---|---|
| Francisco Morato | 165.139 | IBGE, Cidades@ |
| Franco da Rocha | 144.849 | IBGE, Cidades@ |
| Caieiras | 95.032 | IBGE, Cidades@ |
| Campo Limpo Paulista | 77.632 | IBGE, Cidades@ |
| **Total** | **482.652** | soma |

- Domicílios: ~160 mil `[HIPÓTESE: ~3,0 moradores por domicílio; confirmar no Censo 2022, Panorama]`.
- Deslocamento: segundo estudo Rede Nossa São Paulo/Instituto Cidades Sustentáveis (Mapa da Desigualdade da RMSP, notícia de agosto de 2026), 52% dos moradores de baixa renda de Francisco Morato levam mais de 1 hora no trajeto de trabalho, o pior índice entre 39 municípios da RMSP. A Linha 7-Rubi da CPTM liga a região à capital.
- **Implicação `[HIPÓTESE]`:** morador passa muito tempo fora de casa e compra à noite/fim de semana. Compra "perto de casa" com entrega ou retirada rápida (inclusive retirada na estação/bairro) pode ter valor, mas **não achei dado de renda média nem de gasto em comércio local** das 4 cidades. Validar nas entrevistas.
- Renda e perfil de consumo por bairro: **não encontrado**. Fonte a buscar: IBGE (Censo 2022, rendimento), Mapa da Desigualdade, Sebrae-SP.
- Perfil de dispositivo: Android responde por 75-88% do Brasil conforme o recorte (StatCounter via Oficina da Net, maio/2025: 88,3%; StatCounter, jun-ago/2026: 75-79%). Fontes divergem por metodologia. Para a região `[HIPÓTESE]`: Android >= 85% e aparelhos de entrada; iOS é minoria, mas a App Store é exigida pelo brief.

## 3. Comportamento de compra e pagamento
| Fato | Fonte |
|---|---|
| PIX: 40-42% das compras online em 2025 (FTI Consulting 40%; Ebanx/PCMI 42%, à frente do crédito 41%); projeção de 50% em 2028 (Ebanx) | Finsiders Brasil; Seu Dinheiro (2025-2026) |
| Banco Central: PIX = 54,7% das transações de pagamento no 2º semestre de 2025 (todos os canais), mas 28,6% do valor | Band/BCB, abr/2026 |
| WhatsApp é o principal canal de venda online dos pequenos negócios: 82% dos MEI e micro/pequenas empresas (Pulso dos Pequenos Negócios, 12ª edição, fev-mar/2026, 8,2 mil empreendedores); 73% usam canais digitais para vender | Agência Sebrae |
| Intenção de compra por app local em cidade pequena: aiqfome é o app preferido em 65% das cidades com até 70 mil habitantes (Kantar, citado pela Saipos), mas é **comida**, não bens de consumo | Saipos |
| Cultura de delivery em cidade pequena é um desafio reconhecido pelo próprio aiqfome | Meio & Mensagem |

**Implicação:** PIX primeiro, cartão como complemento, contato por WhatsApp visível. Entrega para loja pequena precisa de **taxa baixa e previsível**.

## 4. Concorrência

| Concorrente | Tipo | O que oferece na região | Modelo de preço ao lojista | Ponto fraco explorável | Fonte |
|---|---|---|---|---|---|
| **WhatsApp/Instagram da loja** | Indireto (o maior) | Catálogo no Business, pedido por conversa, PIX manual, entrega própria | Grátis (tempo do lojista) | Sem estoque real, sem pedido rastreável, sem pagamento confirmado automático, sem vitrine unificada, difícil descobrir a loja | Sebrae (82%) |
| **Shopee** | Direto em bens de consumo | Entrega no mesmo dia/dia seguinte na capital e RMSP (modalidade Entrega Rápida); CD em Franco da Rocha (135 mil m², reportado, a confirmar) | Tabela por faixa de preço, ex.: até R$ 79,99 = 20% + R$ 4,50; R$ 100-199,99 = 14% + R$ 20 (fonte secundária; fontes divergem, confirmar na Central do Vendedor) | Marketplace nacional, vendedores distantes; troca/devolução por logística reversa lenta; loja de bairro não tem espaço | Propmark; Central do Varejo; ViniEnsina; Startups |
| **Mercado Livre** | Direto | Envios, Full, vendedores com CNPJ | Percentual por categoria/anúncio (Clássico ~10-14%, Premium ~15-19%, fonte secundária) + taxa fixa de R$ 6,00-6,75 em itens < R$ 79 (até fev/2026) + frete à parte | Mesmo: não é "do bairro" | Rua CEP (guia mai/2026); Omie |
| **iFood** | Indireto (comida e mercado; hábito de delivery) | Domina delivery de comida (~80%, segundo Abrasel via UAI) | Plano Básico 12% + 3,2% pagamento online + mensalidade R$ 110 acima de R$ 1.800/mês; Plano Entrega 23% + 3,2% + R$ 150 | Não é o foco em moda/cosmético/casa; comissão alta é referência de queixa `[HIPÓTESE]` | Serasa; UAI (mai/2025) |
| **aiqfome / Magalu Delivery** | Indireto, modelo análogo | Licenciamento/franquia local em cidade do interior; 500-700+ cidades (fontes divergem); Magalu lançou delivery com tecnologia aiqfome em set/2026 | Franquia/licença (não detalhada) | Foco em comida/mercado/farmácia; mostra que **operação local licenciada** funciona em cidade pequena | Diário do Comércio; Canaltech; Mercado & Consumo |
| **Comércio de rua e centros de compras** | Indireto | Compra presencial, troca no balcão | n/a | Sem horário flexível, sem comparação de preço, deslocamento longo | `[HIPÓTESE]` |
| **Apps regionais de delivery de bens** | Direto | **Não encontrei** concorrente regional específico nas 4 cidades | n/a | `[HIPÓTESE]` espaço livre, a validar com busca nas lojas de apps e perguntas no piloto | n/a |

**Leitura:** em cidade grande, o lojista já está em ML/Shopee. Em Francisco Morato e vizinhas o diferencial do Webag é **o varejo da esquina, entrega em horas, retirada e troca no balcão**. O Webag não compete em preço nem em prazo contra o CD da Shopee; compete em **"tenho agora, perto de você, e troco fácil"**.

## 5. Modelos de comissão (resumo)
| Plataforma | Modelo | Referência |
|---|---|---|
| iFood Básico | 12% + 3,2% pagamento + mensalidade | Serasa/UAI |
| iFood Entrega | 23% + 3,2% + mensalidade | Serasa/Bling |
| Shopee | 14-20% + valor fixo por item (R$ 4,50-26), +R$ 3 por item para CPF acima de 450 pedidos/90 dias (fonte secundária, validar) | ViniEnsina |
| Mercado Livre | ~10-19% + fixa R$ 6,00-6,75 (<R$ 79) + frete | Rua CEP |
| Mercado Pago (processamento) | PIX 0,99%; crédito 3,98-4,98% conforme prazo de recebimento; sem mensalidade (página de checkouts/links; tabela do Checkout Transparente não localizada) | Mercado Pago |
| **Webag (HIP-001)** | **10% sobre produtos + taxa do provedor repassada ao lojista (~1-5%)**; frete sem comissão | `decisoes.md` |

Custo total ao lojista no Webag: ~11% (PIX) a ~15% (cartão à vista). Sem taxa fixa por item, favorece tickets baixos. `[HIPÓTESE]` Se o ticket médio for ~R$ 90, a receita bruta do Webag é ~R$ 9 por pedido; 1.000 pedidos/mês = ~R$ 9 mil. Validar o ticket real no piloto.

## 6. Mercado Pago: viabilidade do split (insumo para o ADR de pagamentos)
Pelas páginas de documentação "Split de pagamentos 1:1" (Mercado Pago, consultadas via busca em 2026-11-18; a página direta não carregou nesta sessão):
- Cada vendedor autoriza o marketplace por **OAuth** e gera o próprio access token.
- Checkout Transparente (Brasil) usa `application_fee`; Checkout Pro usa `marketplace_fee`.
- A taxa do Mercado Pago sai primeiro; a comissão do marketplace incide sobre o restante.
- Estorno é dividido proporcionalmente entre vendedor e marketplace; sem saldo do vendedor, o marketplace devolve sua parte.
- Pré-requisito citado: conta do vendedor com identificação nível KYC 6 `[confirmar]`. Isso exige **que cada lojista tenha ou abra conta no Mercado Pago**, o que é atrito de onboarding.
- Modelo 1:N restrito a carteira assessorada. No Bricks, parcelamento sem cartão não funciona no fluxo de marketplace.
- **Risco regulatório do modelo centralizado `[HIPÓTESE; encaminhado a security/jurídico]`:** receber dinheiro de terceiros e repassar pode caracterizar atividade de instituição de pagamento regulada pelo Banco Central. O split evita isso porque o provedor regulado faz a divisão. Preferência do PO: split; o recebimento centralizado só como fallback simulado/controlado, com parecer jurídico antes de usar com dinheiro real.
- Segundo adaptador (Asaas/Pagar.me): **não recomendo na 1.0** (sem evidência de vantagem; a interface `PaymentProvider` já o permite depois).

## 7. Riscos de produto identificados na pesquisa
| Risco | Evidência | Mitigação |
|---|---|---|
| Sem pagamento na entrega, parte dos clientes e lojas não adere | Brief exclui; sem dado local `[HIPÓTESE]` | Validar no piloto; backlog "Depois" |
| Desintermediação: loja leva o cliente para o WhatsApp e foge da comissão | WhatsApp é o canal nº 1 (Sebrae) e o brief exige botão de WhatsApp | Valor claro (pagamento confirmado, avaliação, troca); não expor telefone do cliente após 30 dias (HIP-036) |
| Densidade baixa (poucas lojas/bairro) | Mercado pequeno | Abrir por bairro (Regiões no admin); lojas por onda |
| Concorrência de Shopee/ML | CD em Franco da Rocha | Posicionar em "agora e perto" + troca no balcão |
| Lojista fora do painel perde pedido | Painel web (não app), aba pode estar fechada | Web Push, e-mail, timeout de 10 min (HIP-008, HIP-028) |
| Pessoa física vendendo com habitualidade, sem nota | MEI/CPF; regra de nota varia por estado/município; propostas de obrigatoriedade a partir de 2027 em discussão (fontes divergentes) | Termos transferem responsabilidade fiscal; alerta ao fundador/contador; Webag precisa emitir NFS-e da própria comissão |
| Marketplace responde pelo vendedor perante o consumidor | Doutrina e jurisprudência divididas quanto à solidariedade (fontes secundárias; Decreto 7.962/2013 exige identificar fornecedor com CNPJ/CPF e endereço) | Exibir dados do fornecedor na loja; canal de mediação; parecer jurídico antes de G5 |
| Regras de loja de apps | Apple 5.1.1(v): exclusão de conta no app; Google Play exige também link web de exclusão; avaliações são conteúdo gerado por usuário (exigem denúncia/moderação, Apple 1.2 `[confirmar]`) | Histórias WB-213, WB-214, WB-038 |
| Produtos proibidos (armas, vape, medicamentos, bebidas, falsificados) | Políticas das lojas e legislação | Lista de proibidos na moderação (HIP-029) |

## 8. Hipóteses de valor e como validar
| # | Hipótese | Validação | Critério |
|---|---|---|---|
| V1 | Lojista de bairro troca "pedido por WhatsApp" por painel com pagamento confirmado | 10 entrevistas + piloto com 5 lojas | 3 de 5 ativas no 30º dia |
| V2 | Cliente aceita pagar frete de R$ 3-8 por entrega em horas | Entrevista + teste de preço no piloto | Conversão carrinho > checkout >= 40% |
| V3 | "Retira Troca" reduz medo de comprar moda/calçado local | Entrevista com 10 clientes; medir % pedidos de moda/calçado com troca | Troca < 15% dos pedidos e NPS de quem usou >= 50 |
| V4 | Comissão de 10% é aceita sem renegociação | Pergunta direta no piloto | 4 de 5 lojas aceitam |
| V5 | PIX >= 70% dos pedidos | Telemetria `payment_method_selected` | >= 70% |
| V6 | Falta de pagamento na entrega não trava a adoção | Perguntar "já perdeu venda por isso?" | < 20% citam como barreira |
| V7 | Densidade de 5+ lojas por bairro gera recompra | Medir recompra 30 dias por bairro | >= 25% (HIP-043) |

**Roteiro curto para o fundador (lojista, 20 min):** como recebe pedidos hoje e quantos por dia; quando perdeu venda e por quê; como entrega e quanto custa; usa PIX, maquininha ou dinheiro; já vendeu em ML/Shopee/iFood e por que parou; quanto pagaria por venda; como trata troca; quem mexe no celular da loja.
**Cliente (15 min):** última compra de roupa/cosmético/eletrônico local: onde, por quê; o que o impede de comprar online da loja do bairro; aceitaria pagar frete de R$ X; confia em PIX para loja desconhecida; já teve problema de troca.

## 9. Fontes (consultadas em 2026-11-18)
- IBGE, Cidades@ [Francisco Morato](https://www.ibge.gov.br/cidades-e-estados/sp/francisco-morato.html), [Franco da Rocha](https://www.ibge.gov.br/cidades-e-estados/sp/franco-da-rocha.html), [Caieiras](https://www.ibge.gov.br/cidades-e-estados/sp/caieiras.html), [Campo Limpo Paulista](https://www.ibge.gov.br/cidades-e-estados/sp/campo-limpo-paulista.html); [tabela PMSP 1980-2022](https://drive.prefeitura.sp.gov.br/cidade/secretarias/upload/chamadas/313_censo_rm-muni_pop-abs_1980-2022_final_1715805030.htm)
- [Metrópoles: trajeto de 1h de baixa renda](https://metropoles.com/sao-paulo/trajeto-1h-paulistanos-baixa-renda) (Mapa da Desigualdade, ago/2026)
- [Agência Sebrae: WhatsApp nas vendas online](https://agenciasebrae.com.br/dados/whatsapp-se-consolida-nas-vendas-on-line-enquanto-facebook-e-lojas-proprias-perdem-folego/)
- PIX: [Finsiders (Ebanx)](https://finsidersbrasil.com.br/estudos-e-relatorios/pix-deve-concentrar-metade-das-compras-online-no-brasil-ate-2028-projeta-ebanx/), [Seu Dinheiro](https://www.seudinheiro.com/2025/financas-pessoais/nao-tem-mais-como-escapar-pix-esta-em-todos-as-telas-de-pagamento-do-e-commerce-em-2025-diz-pesquisa-paty/), [Band/BCB](https://www.band.com.br/economia/noticias/pix-lidera-pagamentos-no-brasil-com-547-das-transacoes-diz-banco-central-202604081055)
- Android: [Oficina da Net/StatCounter](https://www.oficinadanet.com.br/smartphones/62204-market-share-celulares-maio-2025-brasil), [StatCounter Brasil](https://gs.statcounter.com/os-market-share/mobile/brazil/2025)
- iFood: [Serasa](https://www.serasa.com.br/blog/abrir-loja-no-ifood/), [Bling](https://blog.bling.com.br/como-vender-ifood/), [UAI](https://www.uai.com.br/?p=14487)
- Shopee/ML: [ViniEnsina](https://viniensina.com.br/?p=4619), [Rua CEP](https://www.ruacep.com.br/guias/ecommerce/comissao-marketplace-ml-amazon-shopee-magalu-2026/), [Omie](https://www.omie.com.br/blog/shopee-ou-mercado-livre-onde-vender/index.md), [Propmark](https://propmark.com.br/anunciantes/shopee-anuncia-entregas-no-mesmo-dia-para-rio-de-janeiro-e-belo-horizonte/), [Startups](https://startups.com.br/negocios/ecommerce/shopee-amplia-logistica-e-investe-em-entregas-rapidas-para-crescer-no-brasil/), [Central do Varejo](https://centraldovarejo.com.br/shopee-passa-a-oferecer-entrega-no-mesmo-dia-para-grande-sao-paulo)
- aiqfome/Magalu: [Diário do Comércio](https://diariodocomercio.com.br/negocios/expansao-aiqfome-105-cidades-atendidas-minas-gerais/), [Saipos](https://saipos.com/noticia/aiqfome-e-o-segundo-maior-app-delivery-do-brasil), [Canaltech](https://canaltech.com.br/mercado/magalu-lanca-delivery-de-comida-e-mira-rival-ifood-em-mais-de-mil-cidades/), [Mercado & Consumo](https://mercadoeconsumo.com.br/02/09/2026/foodservice/magalu-lanca-servico-de-delivery-em-mais-de-400-cidades/)
- Mercado Pago: [Split 1:1, integrar marketplace](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace), [pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites), [checkouts e taxas](https://www.mercadopago.com.br/ferramentas-para-vender/check-out)
- Lojas de apps: [Apple, exclusão de conta](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- Legislação (fontes secundárias; conferir texto oficial no Planalto): CDC art. 49 ([Projuris](https://www.projuris.com.br/blog/direito-de-arrependimento-2/)); Decreto 7.962/2013 ([Senado](https://legis.senado.leg.br/norma/413161/publicacao/15762397)); MEI 2026 ([Contmatic](https://simplifique.contmatic.com.br/blogs/limites-de-faturamento-mei-2026))

## 10. Lacunas (o que não achei)
Renda média e gasto em comércio local por cidade; número de lojas de varejo por cidade; reclamações reais de lojistas sobre iFood/Shopee (só a comissão publicada); taxas do Checkout Transparente com split; concorrente regional de bens nas 4 cidades; participação real de Android na região. Todas viram perguntas do piloto (§8).
