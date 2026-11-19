# Insights de design: gravação do app iFood

> Fonte: vídeo de tela enviado pelo fundador (2026-11-19, 85 s), analisado quadro a quadro (`docs/design/referencias/ifood/`). Cobre início, busca, histórico, loja, produto, sacola, entrega e endereço. **Não cobre** checkout final, PIX, acompanhamento nem troca. Objetivo: extrair princípios de um produto de escala para o Webag, **sem copiar a identidade** (vermelho, 3D próprio, campanhas). Itens marcados [HIPÓTESE] são inferência minha sobre a intenção.

## 1. O que dá a sensação de produto "profissional"
| # | Observação no vídeo | Por que funciona | Aplicação no Webag |
|---|---|---|---|
| 1 | **Zona escura de cabeçalho + folha clara com cantos arredondados em cima** (saudação personalizada "Boa noite, NOME", endereço, sino com contador, ícone de assinatura). O conteúdo sobe como uma folha por cima da cor. | Cria profundidade e hierarquia sem sombra; a cor de marca é protagonista e o conteúdo respira. | Cabeçalho roxo sólido com saudação e endereço; conteúdo em folha clara com raio 24 a 32 sobrepondo o cabeçalho; contraste entre zonas. |
| 2 | **Fotografia em tudo**: cada loja tem logo, cada produto tem foto grande, até os adicionais (alface, bacon) têm miniatura. | Reduz leitura, aumenta apetite e confiança; a densidade só funciona com imagem. | Foto grande de produto como regra (ficha, cartões, adicionais/variações, itens da sacola e do pedido). Sem foto o design perde metade da força: tratar como requisito de conteúdo para as lojas. |
| 3 | **Ícones de categoria em 3D** (objetos coloridos, macios), não ícones de traço. É a assinatura visual da grade de serviços. | Dá personalidade e vida; é o oposto do "ícone genérico". | Conjunto próprio de objetos ilustrados em volume (cor sólida, sombra dura) para categorias: camiseta, tênis, perfume, fone, vaso, caderno, patinha. Pede ilustrador ou 3D; sem isso, objetos isométricos sólidos desenhados à mão. |
| 4 | **Campanha como herói** no topo: grande, tipografia enorme, preço gigante ("R$ 19,90"), indicador de páginas em **segmentos finos**, selo adesivo no canto. | A promoção é o conteúdo; o preço é o protagonista. | Banner editável do admin com preço/ oferta em numerais gigantes, selo tipo adesivo, indicador segmentado. |
| 5 | **Ritmo de seções variadas**: título + "Ver mais", carrossel horizontal com formatos diferentes (cartão quadrado de foto com preço, círculos de categoria, banner largo, linhas de loja com logo). Nada se repete duas vezes seguidas. | Dá cadência e quebra a monotonia; permite densidade alta sem confusão. | Alternar tipos de bloco no início; nunca duas grades iguais seguidas. |
| 6 | **Preço com hierarquia**: preço atual em negrito, preço antigo riscado em cinza, selo de desconto em % em pílula colorida, rótulo verde "Item promocional", "Grátis" em verde, raio para "Turbo/entrega rápida". | Escaneabilidade: o olho lê oferta, prazo e frete em 1 s. | Padrão único de preço/ selos/ prazo em todo cartão; verde só para benefício. |
| 7 | **Chips de filtro roláveis** colados sob a busca ("Ordenar", "Entrega grátis", "Turbo", "Perto de mim", "Abertos agora"). | Filtros sem tela extra. | Idem, com chips de nosso contexto (entrega rápida, retirada, aceita troca). |
| 8 | **Página da loja**: capa desfocada com logo circular sobreposto, cartão branco de informações **que cruza a capa**, interruptor "Tá com pressa? Chega em 20 min", **cartões de cupom** (cupom de R$ 10, entrega grátis, cupom de R$ 7), "Destaques" em fotos, abas de seção fixas ao rolar. | Sobreposição, microconteúdo útil (prazo, cupom) e navegação por seção sem sair da tela. | Replicar a estrutura: capa + logo sobreposto + cartão de info + cupons + destaques + abas fixas. |
| 9 | **Produto**: foto de página inteira, chip da loja (logo, nota, tempo, taxa) sobre a foto, preço riscado, **grupos de opções com selo OBRIGATÓRIO**, cada opção com miniatura, controle de quantidade e botão **"Adicionar R$ X" fixo embaixo** que só fica ativo (cor de marca) quando as obrigatórias foram escolhidas. Nota "O preço com desconto aparece na sacola". | Reduz erro, mostra o total ao vivo, a ação principal sempre à mão do polegar. | Variações (tamanho, cor) como grupos obrigatórios com amostras; barra inferior com quantidade e total; só ativa com a variação escolhida. |
| 10 | **Mini sacola persistente** colada acima da barra de navegação em todas as telas ("Total sem entrega R$ 48,81 / 1 item" + avatar da loja + botão "Ver sacola"), com **faixa de progresso** acima: "Faltam R$ 71,19 pra entrega grátis", "4 descontos desbloqueados". | Mantém a compra visível e empurra o ticket médio. | Mini sacola fixa e barra de progresso de frete grátis (já temos o parâmetro no admin). |
| 11 | **Sacola**: cabeçalho da loja, itens com remover/+ , "Peça também" (carrossel com botão + no cartão), **opções de entrega como lista de rádio com prazo e preço** (Padrão x Turbo pago), cupom, **resumo de valores**, CPF na nota, botão "Revisar pedido R$ X". | Cada decisão em um bloco; o preço final sempre à vista. | Idem; "Peça também" depende de catálogo. |
| 12 | **Sheets inteligentes**: "Seu endereço está certo?" aparece quando o endereço difere da localização do aparelho (com **Trocar** e **Continuar assim**); "Que tal economizar R$ 17,98? Esta loja está a 380 m, prefere retirar?" com mapa. | Prevenção de erro e nudge de valor no momento exato. | Idem (retirada na loja já existe); mapa só na fase 2. |
| 13 | **Histórico de pedidos** em cartões: logo, nome, **status "Pedido concluído" com check verde**, destaque de economia, itens com miniatura, ações **"Ajuda"** e **"Adicione à sacola"** (repetir pedido). | Recompra em um toque, suporte à vista. | "Pedir de novo" e "Ajuda" no cartão do pedido. |
| 14 | **Carregamento**: skeleton cinza que **espelha o layout** de cada tela (grade, lista, cartão) e loader de 3 pontos nas abas. | Percepção de velocidade e continuidade. | Skeleton por tela, com forma real do conteúdo; 1 loader próprio (linhas de velocidade). |
| 15 | **Camada de fidelidade**: faixa "Sua economia com o Clube: R$ 2.232,81", presente do Clube, moeda/cupom em sacola. Modal de novidade com CTA laranja e "Agora não" discreto. | Retenção e gamificação. | Fase 2 (pontos/assinatura); preparar a faixa de economia e o modelo de dados. |
| 16 | **Microcopy direta e falada**: "Tá com pressa?", "Que tal economizar", "Boa noite, YAGO", "Mais opções de salgados?". | Voz de pessoa, não de sistema. | Manter nossa voz leve e jovem, sem copiar frases. |
| 17 | **Navegação inferior de 5 abas** com ícone preenchido no ativo, rótulos curtos e ponto de notificação; **Hits** é uma aba de curadoria (descoberta por ofertas). | Descoberta além de busca. | 5 abas: Início, Busca, [Ofertas ou Curadoria], Pedidos, Perfil. |

## 2. O que NÃO copiar (e por quê)
- **Identidade**: vermelho, ícones 3D deles, nomes (Clube, Hits, Turbo). A nossa é roxo sólido, sacola trapézio e barras de velocidade.
- **Campanha invasiva**: modal de tela cheia ao abrir e tomada total da home (Black Friday). Gera atrito; evitar ou limitar a 1 por sessão.
- **Densidade de supermercado**: eles têm milhares de lojas e operação de conteúdo enorme. Com poucas lojas, a home precisa parecer cheia sem estar: priorizar produtos e campanhas editáveis.
- **Anúncios** (rótulo "Ad"): não temos no MVP.

## 3. Diferenças de contexto que mudam o desenho do Webag
1. **Moda e calçado ≠ comida**: tamanho, cor, medidas e **troca** pesam mais que "ponto da carne". O grupo de opções obrigatórias (tamanho/cor) é o equivalente, e a tabela de medidas e "como vestiu" são o diferencial.
2. **Entrega pelo Webag**: a loja não define taxa nem prazo; o prazo e a taxa vêm da logística. O cartão de loja mostra "entrega Webag", não o prazo da loja.
3. **Uma loja por pedido** (como o iFood): mini sacola com avatar da loja é a metáfora certa; avisar ao trocar de loja.
4. **Conteúdo**: sem foto boa o desenho cai. Requisito de produto: padrão de foto para o lojista (fundo claro, 4:5, mín. 1000 px), com guia no cadastro.

## 4. Checklist de lacunas do Webag em relação ao vídeo (priorizado)
| Prioridade | Lacuna | Onde |
|---|---|---|
| Alta | Mini sacola persistente com progresso de frete grátis | App: todas as telas |
| Alta | Folha clara sobrepondo cabeçalho de marca; saudação + endereço | App: início |
| Alta | Fotografia como regra e padrão de foto para lojistas | Conteúdo e cadastro de produto |
| Alta | Variações como grupos obrigatórios com amostra e barra "Adicionar R$ X" ativa só quando válida | App: produto |
| Alta | Skeleton que espelha cada tela | App e painéis |
| Média | Chips de filtro sob a busca; cartões de cupom na loja; interruptor de entrega rápida (se houver) | App |
| Média | "Peça também" e sheets inteligentes (endereço diferente da localização, retirar e economizar) | App: sacola |
| Média | Pedir de novo e Ajuda no cartão do pedido | App: pedidos |
| Média | Ícones de categoria em objetos ilustrados com volume | Kit de marca (precisa ilustrador) |
| Baixa | Aba de curadoria/ofertas; faixa de economia (fidelidade) | Fase 2 |

## 5. Pontos que o vídeo não mostra (pedir ao fundador, se quiser)
Checkout final e pagamento (PIX), acompanhamento em tempo real, pós-entrega e avaliação, e como o iFood trata troca/devolução. São os fluxos em que o Webag mais se diferencia; vale uma segunda gravação.
