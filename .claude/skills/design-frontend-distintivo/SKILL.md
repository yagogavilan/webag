---
name: design-frontend-distintivo
description: Método para dar direção estética própria ao Webag e fugir do visual genérico de IA (tipografia, cor, composição, hero, estrutura). Use ao propor a identidade visual, desenhar telas-chave (home, vitrine da loja, landing) ou quando uma tela parecer "template".
---

# Princípio
Distintivo não é enfeitado. No Webag, o visual precisa ser **reconhecível, legível ao sol num Android de entrada e rápido de escanear**. Uma coisa memorável por tela; o resto disciplinado. Se o brief ou o fundador especificar a direção visual, ela vence esta skill.

# Processo em 3 passadas (não pule a revisão)
1. **Plano** (em `docs/design/direcao-visual.md` ou na spec): assunto e público (quem compra, de onde, em que aparelho); 4 a 6 cores com nome e hex; fontes e papéis (títulos, corpo, números/preços); conceito de layout em wireframe ASCII; 3 princípios que governam as escolhas.
2. **Revisão:** descreva a resposta genérica que qualquer IA daria para o mesmo pedido, compare e reescreva o que coincidir. Registre "o que mudou e por quê".
3. **Construção:** só depois do plano passar. Ao final, faça a passada "remover um acessório" (tirar um enfeite que não carrega informação).

# De onde tirar identidade (assunto, não moda)
- Do comércio local da região: placa pintada, fachada, feira, embalagem de bairro, o vocabulário da loja. Evite copiar a identidade do iFood (vermelho + cantos redondos universais). Direção concreta é decisão do fundador [HIPÓTESE: validar 2 a 3 direções em protótipo HTML antes de fixar tokens].
- A foto real da loja e do produto é o principal "ornamento". Moldura e fundo servem a ela.

# Tipografia
- Uma família, ou duas claramente distintas. Defina escala (`font.size` dos tokens) e use o título como elemento de design, não só rótulo.
- Preço e quantidade em numerais tabulares. Linha de texto abaixo de ~75 caracteres.
- Custo: no máximo 2 famílias e 3 pesos embarcados; fonte web com `font-display: swap`; sempre fallback de sistema. Fonte pesada é custo real em 3G.

# Estrutura e composição
- Borda, numeração, selo, divisor e legenda só existem se carregam informação (ex.: numerar passos do checkout, não cards soltos).
- Hero da home/landing: abra com o elemento mais característico do assunto (loja do bairro, produto, prova real de entrega), não com número grande + gradiente por reflexo.
- Variação de ritmo: nem todo bloco é card igual com mesma sombra e raio.

# Catálogo de "cara de IA" (evitar, salvo se justificado)
- Fundo creme + serifa de display + acento terracota; quase-preto com um acento neon.
- Grade SaaS: cards uniformes com raio, sombra e gradiente suave.
- Cabeçalhos com uma palavra em destaque, rótulos em caixa-alta espaçada, "eyebrow" sobre tudo, setas em todo link.
- Emoji como ícone; ilustração 3D genérica; "Ops!" em erro.

# Piso de qualidade (inegociável)
Responsivo; foco visível; contraste AA (ver `acessibilidade-wcag-mobile-web`); `prefers-reduced-motion` respeitado; 4 estados de tela (carregando, vazio, erro, sem conexão); um único momento de movimento orquestrado (ver `movimento-e-microinteracoes`); legível em brilho alto; tokens em `docs/design/tokens.json`, nunca valor solto.

# Entrega
Plano aprovado + tokens atualizados + protótipo HTML da tela-chave + nota "o que é memorável aqui". Divergência de `design-system` vira decisão registrada.

## Fontes e licença
- anthropics/skills, skill `frontend-design` (Apache-2.0, LICENSE.txt conferido), consultada em 2026-11-22. Adaptado: processo plano/revisão/construção, catálogo de padrões genéricos, regras de tipografia e movimento; trazido para contexto de marketplace local, custo de fonte em rede móvel e regra "brief vence". Removidos: passos de memória do cliente e capturas de tela automáticas.
