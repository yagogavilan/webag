# Instagram do Webag (pré-lançamento): bio, legendas, calendário e kit visual

Autor: product-designer | Data: 2026-11-20 | Peças: `src/instagram/*.html` e `src/video-story.html` | Vídeo: `video-roteiro.md`
Regras: `produto/posicionamento.md` §5 a §7 (DEC-040): sem emoji (marca), sem prazo, sem "compre de quem é daqui", sem superlativo, sem "lojas perto de você". Região só como **escopo de lançamento**.

## 1. Perfil

| Campo | Valor |
|---|---|
| Foto | `src/instagram/perfil.html` (1080x1080): símbolo branco sobre roxo `#C02EF0`, dentro do círculo seguro de 80% (raio 432 px; o ponto mais distante fica a ~360 px). Mesmo desenho do ícone do app, então o perfil e a loja de apps se reconhecem |
| Nome (campo "Nome", pesquisável) | `Webag` |
| Usuário | **Pendência do fundador** (ver `pendencias.md`). `config.json` traz `@webag` como valor provisório |
| Categoria | "Compras e varejo" (ou a mais próxima que o Instagram oferecer) |
| Link | **Pendência**: página do site quando houver domínio. Sem link, não colocar link falso |

### Bio (100 caracteres, limite 150; 3 linhas, sem emoji)

```
Escolha no app. Receba em casa.
Em breve em Francisco Morato e região.
Siga para saber quando abrir.
```

Por quê: linha 1 é a assinatura C3 do PO (`posicionamento.md` §6); linha 2 diz o escopo sem virar slogan regional e sem data; linha 3 é o CTA único. Não usa "marketplace" (jargão), "tudo" nem prazo.

## 2. Legendas (4)

Hashtags: no máximo 3 por legenda, só as regionais e a da marca, no fim. Nenhuma legenda promete prazo.

### Post 0: apresentação (dia 0)

```
Este é o Webag.

Um app para escolher a loja e o produto, pagar com PIX ou cartão e acompanhar o pedido até a porta. Também dá para retirar na loja.

Estamos preparando o lançamento. Vamos começar por Francisco Morato, Franco da Rocha, Caieiras, Cajamar e arredores.

Siga esta página para saber quando abrir.

#Webag #FranciscoMorato #FrancoDaRocha
```

Texto alternativo: "Cartaz roxo com o texto Escolha no app. Receba em casa. e o selo Em breve. Ao lado, a tela inicial real do app. Três itens: escolha a loja e o produto, pague com PIX ou cartão, acompanhe até a porta."

### Post 1: o problema (semana 1)

```
18h: a loja fecha.
19h: você sai do trabalho.
21h: você chega em casa.
E o presente é pra amanhã.

Estamos preparando outro jeito de comprar: você escolhe a loja pelo app e recebe em casa.

Siga esta página para saber quando abrir.

#Webag #FranciscoMorato
```

Texto alternativo: "Fundo escuro com três horários em lima: 18h, a loja fecha. 19h, você sai do trabalho. 21h, você chega em casa. Abaixo: E o presente é pra amanhã. Webag. Em breve."

### Post 2: o que vem no app (semana 2)

```
O que vem no app:

1. Escolha a loja e o produto.
2. Pague com PIX ou cartão.
3. Acompanhe o pedido até a porta e fale com a loja pelo WhatsApp.

As telas são do app em teste e podem mudar até o lançamento.

Siga esta página para saber quando abrir.

#Webag #Cajamar
```

Texto alternativo: "Três telas reais do app em molduras de celular: a página de uma loja, o pagamento com PIX com contador, e o acompanhamento do pedido com a faixa de horário. Legenda: 1 escolha a loja, 2 pague com PIX, 3 acompanhe o pedido."

### Post 3: convite (semana 3)

```
Vai abrir.

Para ficar sabendo primeiro:
1. Siga esta página.
2. Ative as notificações da página.
3. Avisamos quando abrir.

Começamos por Francisco Morato e região.

#Webag #FranciscoMorato
```

Texto alternativo: "Cartaz roxo com o texto Vai abrir. Quer saber primeiro? e o símbolo da sacola Webag em branco. Três passos: siga esta página, ative as notificações, avisamos quando abrir. Selo: Em breve."

### Legenda do vídeo (Stories; se for também Reel)

```
Escolha a loja. Pague com PIX. Acompanhe até a porta.
Em breve. Siga para saber quando abrir.
```

Sem hashtag no Stories. Sem adesivo de contagem regressiva (exige data) e sem adesivo de enquete: o CTA é um só.

## 3. Calendário (3 semanas) e horário

O lançamento não tem data, então o calendário é relativo ao "dia 0" (dia em que o perfil vai ao ar). Não escrever "em 3 semanas" em nenhuma peça: a série "1 de 3, 2 de 3, 3 de 3" numera as peças, não promete data.

| Quando | Peça | Onde | Observação |
|---|---|---|---|
| Dia 0 (segunda), 19h | Foto de perfil, bio e **post 0** | Feed | Fixar o post 0 no topo |
| Dia 0, 19h30 | **Vídeo de 15 s** | Stories (e Reel, opcional) | Música da biblioteca do Instagram (`video-roteiro.md` §6) |
| Semana 1, quarta, 19h | **Post 1** (o problema) | Feed | Compartilhar nos Stories no mesmo dia |
| Semana 2, quarta, 19h | **Post 2** (o que vem no app) | Feed | Compartilhar nos Stories |
| Semana 3, quarta, 19h | **Post 3** (convite) | Feed | Republicar o vídeo de 15 s nos Stories no mesmo dia |
| Todos os dias | Responder comentários e mensagens em até 24 h | | Quem pergunta "quando abre?" recebe: "Ainda não temos data. Siga a página e ative as notificações que avisamos." |

Horário sugerido: **dias úteis, 19h (Brasília)** `[HIPÓTESE]`.

| Fonte | O que diz | Limite |
|---|---|---|
| [Metricool, estudo de 2026 com 24 milhões de publicações](https://metricool.com/best-time-to-post-instagram/) (via busca, 2026-11-20) | Pico às 20h na maioria dos dias | Global, não é do Brasil |
| [Buffer, 9,6 milhões de publicações](https://buffer.com/library/best-time-to-post-on-instagram) (via busca) | Quinta 9h, quarta 12h e quarta 18h | Global; fuso não informado |
| [TimeToPost, Brasil](https://timetopost.co/best-time-to-post/instagram/brazil/) (via busca) | 9h a 11h em Brasília | A própria página diz ser base editorial, não dado medido |
| Persona Carla (`produto/personas.md`) | Volta do trabalho à noite pela Linha 7, celular na mão | `[HIPÓTESE]`, não validada |

Raciocínio: nenhuma fonte é do Brasil com dados medidos. Fica 19h de quarta porque combina o início do pico global noturno com o horário em que o público do piloto provavelmente já saiu do trabalho. **Com 3 posts não há amostra para testar horário.** Depois do post 3, abrir Insights > "Seus seguidores mais ativos" e ajustar.

## 4. Kit visual: o que foi decidido e por quê

| Peça | Fundo | Ideia | Elemento real da marca | Por quê |
|---|---|---|---|---|
| Perfil | Roxo | Símbolo sozinho | Símbolo v4a branco | Igual ao ícone do app; legível em círculo de 110 px |
| Post 0 | Roxo + painel noite | Apresenta o Webag em uma imagem | Tela real da Início no aparelho que sai pela base; marca-texto lima; adesivo "Em breve" | Cartaz com um herói (o título de 156 px) e a prova do produto real |
| Post 1 | Noite | O problema, em horários | Numerais de 176 px; marca-texto não usado (lima no texto) | Cartaz de horários: reconhecível, sem rosto nem foto |
| Post 2 | Papel + painel noite | O que vem no app | 3 telas reais, em degraus que seguem a diagonal de 8 graus | Mostra o produto; as 3 telas = escolher, pagar, acompanhar |
| Post 3 | Roxo + painel noite | Convite e avisar | Símbolo grande cruzando o corte; 3 passos | O único CTA da série, sem data |

Ritmo da grade (3 colunas, mais novo primeiro): post 3 roxo, post 2 papel/noite, post 1 noite; post 0 roxo na linha seguinte. As cores se alternam e nenhuma peça repete a ideia da outra.
Série: segmentos "1 de 3 / 2 de 3 / 3 de 3" no canto superior direito (as 3 barras do símbolo viram indicador, sempre com texto).
Recorte do feed: o Instagram mostra os posts 4:5 em 3:4 na grade do perfil (corta cerca de 34 px de cada lado); todo conteúdo fica a 72 px das bordas.
Contraste: branco sobre roxo (4,29:1) só em texto grande (>= 24 px, ou >= 19 px em negrito); texto pequeno fica sobre noite (17,6:1) ou papel; lima só sobre noite ou em bloco com texto noite (15,3:1).

## 5. Render

`pnpm marketing instagram` e `pnpm marketing video` (ver `README.md`). As telas reais precisam estar em `src/assets-social/` (ver `pendencias.md`, item 1).
