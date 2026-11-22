# Instagram do Webag (pré-lançamento), v2.3: bio, legendas e calendário

Autor: product-designer | Data: 2026-11-22 | Substitui a v2.1 | Peças: `src/instagram/*.html`, `src/video-lojista.html`, `src/video-cliente.html` | Roteiros: `video-roteiro.md` | Auto-crítica: `revisao-social-v2.md` | Pareceres: `avaliacoes/2026-11-22-*.md`
Regras (`direcao-criativa.md` §2, `produto/posicionamento.md` §7): sem emoji, sem prazo de entrega, sem superlativo, sem número inventado, sem PIX/cartão/pagamento como argumento, sem "compre de quem é daqui". Região só como escopo.
Legenda: a 1ª linha é o gancho (aparece antes do "mais") e faz sentido sozinha. No máximo 2 hashtags, no fim. **CTA único em toda peça: seguir a página (cliente) ou chamar no direct (lojista). Sem "sininho".**
**Marca `[J8]`** = depende do parecer jurídico sobre motoboy (DEC-039, `pendencias.md` IJ1). Nada marcado `[J8]` é postado antes do parecer e do G5.
**O que as artes mostram (para legenda e alt text baterem):** as telas são **capturas reais recortadas e ampliadas** do painel (post 3, vídeo do lojista) e do app (vídeo do cliente, cenas 2 e 3), ou **réplicas desenhadas** do cartão do app (posts 0 e 2, vídeo do cliente, cena 4). Todas rotuladas "Tela de exemplo". Nenhuma mostra código de pedido, horário, contagem regressiva, "Pago no app", "Últimas unidades" nem comida. Os valores e produtos (R$ 135,80; camiseta e bermuda; camiseta R$ 49,90) vêm do banco de demonstração: são **exemplo**, e a legenda não os usa como oferta.

## 1. Perfil

| Campo | Valor |
|---|---|
| Foto | `src/instagram/perfil.html` (1080x1080), sem alteração (parecer: 4,0, publicar) |
| Nome | `Webag` |
| Usuário e link | **Pendência do fundador** (IF1). O `@webag` nas artes é provisório e vem de `src/config.json` (campo `instagram`); o link da bio vai para o WhatsApp do fundador (`wa.me`, grátis). Sem link falso na bio |
| Categoria | "Compras e varejo" (ou a mais próxima) |

### Bio B (sem promessa de entrega; **pode sair antes do J8**)

```
Aquela loja que você adora, pedindo pelo app.
Em breve em Francisco Morato e região.
Tem loja? Chame no direct.
```

### Bio A (recomendada depois do J8; 111 caracteres de 150; sem emoji) `[J8]`

```
Aquela loja que você adora agora entrega.
Em breve em Francisco Morato e região.
Tem loja? Chame no direct.
```

Com link: ele entra no campo de link da bio (não no texto) e a linha 3 vira "Tem loja? Chame no direct ou no link."

### Bio C (teste A/B do parecer: lojista na linha 1) `[J8]`

```
Tem loja? Chame no direct.
Aquela loja que você adora agora entrega.
Em breve em Francisco Morato e região.
```

Teste: A contra C, por 2 semanas depois do post 3. Métrica: mensagens diretas de lojistas por visita ao perfil. Sem amostra antes disso `[HIPÓTESE]`.

## 2. Legendas (4 posts + 2 vídeos), na ordem cliente, lojista, cliente, lojista

### Post 0, cliente, apresentação (dia 0). `[J8]` ("Agora entrega", "Saiu para entrega" na arte)

```
Aquela loja que você adora. Não entrega. Agora entrega.

Estamos construindo o Webag: um app para pedir de lojas que hoje só vendem no balcão e acompanhar o pedido até a sua porta.

Ainda não abriu. Siga a página e a gente avisa quando abrir. Começamos por Francisco Morato e região.

#Webag #FranciscoMorato
```

Texto alternativo: "Fundo roxo. Texto grande: Aquela loja que você adora. A palavra Não está riscada e ao lado aparece Agora: Agora entrega. Embaixo, uma ilustração de loja de bairro, uma seta e uma tela de exemplo do app com o aviso A caminho, Saiu para entrega, e a moto com a sacola do Webag. Legenda: Tela de exemplo. Siga @webag. Selo: Em breve."
Mudanças v2.3: sai o sininho (na arte e na legenda); a arte mostra o cartão "Saiu para entrega" no lugar da moto solta.

### Post 1, lojista, a conversa (semana 1). Sem `[J8]`: **primeiro a sair**

```
Tem no 38? Moro longe. Dá pra entregar? Só retirando, tá?

Quantas vendas essa frase já custou para a sua loja?

No Webag, o pedido de quem mora longe chega no seu painel. O cadastro de lojas abre em breve. Chame no direct para entrar na lista.
```

Texto alternativo: "Fundo noite. Conversa de mensagens. Cliente: Tem no 38? Moro longe. Dá pra entregar? Resposta da loja em lima: Só retirando, tá? Pergunta: Quantas vendas essa frase já custou? Abaixo: No Webag, o pedido de quem mora longe chega no seu painel. Chame no direct: @webag. Selo: Em breve."
Mudança v2.3: a arte e a legenda ganham a linha de solução ("No Webag, o pedido de quem mora longe chega no seu painel."), sem prazo, sem preço e sem a palavra "entrega". O PO deve confirmar que "mora longe" não é lido como promessa de entrega (`pendencias.md` IP7).
Linha opcional, só após o parecer: "Você separa e o Webag leva." `[J8]`
Pendência do fundador: se ele ouviu essa frase (ou outra) nas visitas, trocar pela frase literal dele (IF8).

### Post 2, cliente, a pergunta do dia (semana 2). `[J8]` ("A caminho", "Saiu para entrega" na arte)

```
Não deu pra passar na loja?

Peça da loja, sem sair do lugar, e acompanhe cada etapa do pedido, da loja até você.

Ainda não abriu. Siga a página que a gente avisa.

#Webag
```

Texto alternativo: "Fundo roxo. Voltando do trabalho. Não deu pra passar na loja? Tela de exemplo do app: Etapa 4 de 5, A caminho, Saiu para entrega, com a moto do Webag e a barra de progresso; embaixo, a linha do tempo com Em separação concluída, Saiu para entrega em andamento e Entregue. Peça da loja, sem sair do lugar. Siga @webag. Selo: Em breve."
Mudanças v2.3: a captura real (com horários e "Aguardando motoboy") virou réplica limpa do cartão do app, em tipo grande, com o selo "Tela de exemplo".

### Post 3, lojista, recrutamento (semana 3). Sem `[J8]` (o chip "Entrega" saiu; nada promete entrega)

```
Tem loja? Venda além da sua rua.

Quem passa na sua porta já conhece você. O Webag coloca a sua loja diante de quem mora mais longe: o pedido chega no painel e você aceita com um toque.

O cadastro de lojas abre em breve. Chame no direct para entrar na lista.

#Webag #FranciscoMorato
```

Texto alternativo: "Fundo lima. Tem loja? Venda além da sua rua. Tela de exemplo do painel da loja no Webag: Pedido novo, R$ 135,80, 2 itens, etiqueta Outro bairro, 1 camiseta básica de algodão branca M e 1 bermuda de sarja 40, com o botão roxo Aceitar. Chame no direct: @webag. Selo: Cadastro em breve."
Mudanças v2.3: o alt text antigo (R$ 60, boné, R$ 100) descrevia um cartão que não existe mais; este descreve a arte. A legenda diz "aceita com um toque" no lugar de "você separa" (o que a tela mostra).
Pendência (IF5): não escrever "sem mensalidade" nem percentual de comissão até o fundador confirmar. Resposta padrão a "quanto custa?": "A comissão é só quando você vende. Mando os detalhes quando o cadastro abrir."

### Vídeo do lojista (Stories; Reel opcional). Cenas 1 a 5 e 7 sem `[J8]`; a cena 6 ("O Webag leva.") é `[J8]`

```
Tem no 38? Só retirando, tá?
Venda além da sua rua. Chegou pedido. Aceita com um toque. Você separa. O Webag leva. [J8]
Tem loja? Chame no direct: @webag.
```

### Vídeo do cliente (Stories; Reel opcional). `[J8]`

```
Aquela loja que você adora. Não entrega. Agora entrega. Em breve.
Escolha na loja. Peça. Acompanhe cada etapa.
Siga @webag.
```

Sem hashtag no Stories. Sem adesivo de contagem (exige data) e sem enquete: o CTA é um só em cada vídeo.

## 3. Calendário (3 semanas)

Sem data de lançamento, o calendário é relativo ao "dia 0". Nenhuma peça diz "em 3 semanas": a série numera, não promete. Ordem do feed: cliente, lojista, cliente, lojista (parecer: lojista é o gargalo; o vídeo do lojista abre os Stories).

| Quando | Peça | Onde | Depende de |
|---|---|---|---|
| Dia 0 (segunda), 19h | Foto, **bio B** e **post 1** (lojista: "Só retirando, tá?") | Feed | nada (só o @ confirmado, IF1) |
| Dia 0, 19h30 | **Post 3** (lojista: "Tem loja? Venda além da sua rua.") ou o vídeo do lojista sem a cena 6 | Feed / Stories | nada; o vídeo precisa da versão sem a cena 6 (pedir ao designer) |
| Depois do J8 | **Post 0**, **post 2**, **vídeo do cliente**, bio A | Feed / Stories | J8 |
| Todos os dias | Responder comentário e mensagem em até 24 h | | |

Se o J8 atrasar: o post 1, o post 3 e a foto saem sem esperar; o resto aguarda. Decisão do CEO. Esta ordem substitui a da v2.1 (cliente primeiro), porque o cliente depende do J8.
Respostas padrão: "Quando abre?" -> "Ainda não temos data. Siga a página que avisamos." "Aceita minha loja?" -> "Anotei. Qual o nome da loja e o WhatsApp? O cadastro abre em breve." (guardar contato só com consentimento; finalidade: avisar a abertura; LGPD, IF7.)
Horário: dias úteis, 19h (Brasília) `[HIPÓTESE]`; sem fonte brasileira medida. Depois do post 3, abrir Insights > "Seus seguidores mais ativos" e ajustar.

## 4. Kit visual

| Peça | Público | Fundo | Ideia | Imagem dominante |
|---|---|---|---|---|
| Perfil | ambos | Roxo | Símbolo grande | O símbolo |
| Post 0 | cliente | Roxo | "Não" riscado, "Agora entrega." na mesma arte | Título de 140 px + loja para cartão "Saiu para entrega" (réplica) |
| Post 1 | lojista | Noite | A conversa que custou vendas + o que o Webag faz | Balões; "Só retirando, tá?" em lima |
| Post 2 | cliente | Roxo | Pedir sem sair do lugar | Réplica do cartão de acompanhamento (936 x 708), UI a 44 px ou mais |
| Post 3 | lojista | Lima | Venda além da sua rua | Captura real do pedido novo, em 4 faixas, UI a 45 px; chip "Outro bairro" e botão desenhados |

Grade (3 colunas, mais novo primeiro): cores alternam; composições diferentes (tipografia + par de ilustrações, balões, cartão de linha do tempo, captura de pedido).
Recorte do feed: 4:5 vira 3:4 na grade (corta ~34 px de cada lado); todo conteúdo fica a 72 px das bordas.
Contraste: branco sobre roxo 4,29:1 (só texto >= 24 px em negrito); noite sobre lima 15,3:1; lima sobre noite 15,3:1; lima sobre roxo ~3,9:1 (só texto >= 44 px em negrito: "Agora", "Siga @webag" no post 2).

## 5. Render

`pnpm marketing instagram` (mesmos 5 nomes de arquivo). Vídeos: `pnpm marketing video-lojista` e `video-cliente` (o pipeline aceita os dois alvos). Os HTML leem `src/config.json` (campo `instagram`) por `src/social-cfg.js`; sem config vale `@webag`.
