# Crítica do CEO à rodada 1 do protótipo v3 (2026-11-19)

Renders em `docs/prototipo/render/r1/` (390x844, 2x). **Direção aprovada**: título enorme, blocos sólidos de cor, selo adesivo, cortes diagonais, barras de velocidade, mini sacola fixa. Defeitos e pedidos, em ordem de impacto:

## Bloqueantes de qualidade
1. **Ilustrações de produto fracas** (o maior sinal de "feito por IA" que restou). A camiseta é um polígono com manchas cinza nas mangas e dois círculos brancos vazando; o vestido e a bolsa são rudimentares. Redesenhar o conjunto de produtos com **fidelidade e estilo único**: formas geométricas limpas, 2 a 3 tons por objeto (cor base, sombra sólida, realce), traço de contorno consistente OU totalmente sem contorno, proporções corretas (manga encaixada na cava, gola, barra), sombra dura sólida embaixo. Se não for possível fazer bem, abstraia mais (objetos icônicos e estilizados), nunca meio-realista torto. Mostrar variações coerentes: camiseta, vestido, bolsa, tênis, calça, perfume, fone, vaso, caderno, ração.
2. **Início**: a lista de categorias em texto gigante quebra em 3 linhas e perde imagem. Transformar em faixa de categorias com **objeto ilustrado + nome** (carrossel horizontal com formatos variados, tamanho maior para a categoria em destaque), mantendo a ousadia tipográfica nos títulos de seção. O herói corta o tênis e a sacola de forma confusa: recompor (produto inteiro legível, sacola atrás, selo -17% sem tapar).
3. **Pedido confirmado**: "18:45 – 19:00" quebra em duas linhas e a última é cortada pela folha escura. Hierarquia: título, hora (uma linha, tamanho que caiba), resumo em cartão, "Acompanhar pedido" como ação principal, "Voltar ao início" centralizado como ação secundária; alinhar o interruptor de aviso; respiro.
4. **Acompanhamento**: bug no indicador de etapas (um segmento verde-lima solto, desalinhado, abaixo da barra de 5 etapas). Corrigir: 5 segmentos alinhados, o atual em lima com o rótulo; destaque de "Etapa 2 de 5".

## Importantes
5. **Loja**: mostrar produto na 1ª dobra (cartões "Destaques" com foto grande e preço), cartões de cupom, abas fixas visíveis acima da mini sacola; reduzir a capa (altura) para liberar espaço. Insights do iFood: `docs/design/insights-ifood.md` §1 itens 8 e 9.
6. **Produto**: variações como grupo obrigatório com selo "Obrigatório" e amostras maiores; botão "Adicionar" só ativo com a variação escolhida (hoje a cor aparece cortada pela barra inferior: aumentar espaço do conteúdo).
7. **Sacola**: preço com vão exagerado entre "49" e ",90"; ajustar o kerning dos números. Adicionar "Peça também" (carrossel curto) e o resumo de valores completo; manter a barra de progresso de frete grátis só se o parâmetro existir (HIP-L12 diz que o frete é da Webag).
8. **Início, rolagem**: a mini sacola cobre o conteúdo; adicionar padding inferior e respiro.

## Decisões do CEO
- Acento: **lima #D6FF4A** (aprovado; "sol" fica descartado). Regra: ≤ 5% da tela, texto sempre escuro sobre ele.
- Título da Início: "O que vai pra sacola hoje?" aprovado; o PO fecha a copy final.
- Manter Bricolage Grotesque (display) + Figtree (interface).
