# Revisão crítica do kit social v2 (perfil, 4 posts, vídeo de 15 s)

Autor: product-designer | Data: 2026-11-22 | Critério (`direcao-criativa.md` §5): primeiro "pararia o dedo?", depois marca e render.
**Limite:** não tenho Bash e **não renderizei nada**. As notas abaixo são julgamento de design sobre a composição que escrevi, não teste com público. Nota 1 a 5: 5 = para o dedo de quem não conhece a marca; 4 = para o dedo de quem é o público; 3 = informa, não segura; 1 a 2 = ignorado. Regra do pedido: nota < 4 volta para a prancheta.

## 1. O que a pessoa sente em 1 segundo e nota

| Peça | O que a pessoa lê e sente em 1 s | Nota | Por que não é 5 | Refeita? |
|---|---|---|---|---|
| **Perfil** | "A sacola roxa" (reconhecimento, não interesse). A 40 px a silhueta (3 barras + sacola) ainda lê; os dois olhais somem (aceitável) | 4 | Identidade é igual ao ícone do app por escolha. Símbolo de 880 px (era 704): barra do meio com ~2,9 px a 40 px | v1 3, refeita com escala 5,5 |
| **Post 0** "Aquela loja que você gosta agora **entrega**" | Roxo, palavras grandes, uma lima ("agora"), e embaixo o banner lima do app com a sacola e "Entrega pelo Webag" completando a frase. Sente: "ah, agora entrega" + curiosidade pela loja | 4 | A frase é promessa, não cena; o banner é tela de app genérica. Funciona pela frase terminar dentro da tela real | Não |
| **Post 1** "Não deu pra passar na loja?" | Pergunta que a pessoa já fez hoje, "19h40, voltando do trabalho", e a prova: cartão noite "Saiu para entrega" + linha do tempo enorme com adesivo "A loja passa aí." Sente: "é isso mesmo" | 4 | O cliente é a persona P1 `[HIPÓTESE]`, não validada; a tela é um acompanhamento, não uma compra | Não |
| **Post 2** "Tem loja? Venda além da sua rua." | Fundo lima (destoa do feed), pergunta direta ao dono de loja, cartão noite com "Aceitar pedido" em lima e "O motoboy leva." Sente (lojista): "tenho loja, isso é pra mim" | 4 | Para quem não tem loja é invisível, o que é o objetivo. "O motoboy leva" depende do parecer jurídico (J1) | Não |
| **Post 3** "Ativa o sininho." | Noite, título lima gigante, e um aviso de celular com "Abrimos. Aquela loja que você gosta agora entrega." Sente: curiosidade ("quero receber isso") e uma ação de 1 toque | 4 | É convite: segura menos que os outros. O aviso é desenho nosso, rotulado "Assim vai chegar quando abrir" | **Sim:** a 1ª versão (sino lima de 620 px + 'A gente avisa quando abrir.') tirou **3**: era só um ícone e um pedido, sem prova nem tensão. Troquei a imagem dominante pelo aviso |
| **Vídeo** "Um pedido, dois lados" | Quadro 0: a tela do painel vibra, faixa lima "Pedido novo." Sente: "chegou pedido?" (lojista), curiosidade (cliente). Em 1,5 s: "Do outro lado:" | 4 com os clipes; **3 se o render usar só os posters** | O gancho é lido primeiro pelo lojista; o cliente entende no corte 2. Depende de clipes que não existiam em 2026-11-22 | Conceito escolhido entre 3 (`video-roteiro.md` §3); o gancho tem plano B (§8) |

Nenhuma nota ficou abaixo de 4 depois da refeita do post 3. Isso **não** significa que está aprovado: o teste real é o Skip Rate do vídeo e o alcance do post 2 entre lojistas (a medir, `video-roteiro.md` §8).

## 2. O que mudou da v1 (e por que a v1 falhou)

| v1 | v2 |
|---|---|
| "Escolha no app. Receba em casa." com lista 01/02/03 (catálogo de função) | Cada post é uma situação ou um alvo: a pessoa sem o produto (post 1), o dono da loja (post 2), quem quer ser avisado (post 3); a promessa (post 0) termina dentro da tela |
| Celulares de 270 a 440 px com texto de ~10 px | Recortes de tela de 820 a 900 px de largura; texto da UI com 36 a 41 px na peça final; sem moldura de aparelho (a tela é o herói) |
| "Pague com PIX ou cartão" como item e como adesivo | Nenhum post, legenda ou cena de vídeo cita pagamento. Resta só "Pago no app" como rótulo dentro do cartão real do painel (post 2) |
| 4 peças com o mesmo esqueleto (rail, título, painel noite, itens) | 4 composições: tipografia + banner (0), duas telas empilhadas (1), cartão sobre lima com sombra roxa (2), aviso de celular + sino (3) |
| Vídeo de slides de 2 s com captura estática | Clipes reais do app em sangria total, cortes de 1,0 a 2,0 s em 120 BPM, vibração e punch-in |
| Só cliente | Um dos 4 posts recruta lojista e o vídeo mostra o painel (cortes 1, 5 e 6) |

## 3. Checagem das regras de `direcao-criativa.md` §2

| Regra | Post 0 | Post 1 | Post 2 | Post 3 | Vídeo |
|---|---|---|---|---|---|
| 1 Sem pagamento como argumento | ok | ok | ok ("Pago no app" só no cartão real) | ok | ok (barra de pagamento da sacola fora do quadro) |
| 2 Uma ideia em 1 frase | A loja agora entrega | A loja passa aí | Venda além da sua rua | Receba o aviso | Um pedido, dois lados |
| 3 Título >= 110 px e <= 10 palavras | 160 px, 7 palavras | 116 px, 6 palavras | 140 px, 6 palavras | 220 px, 3 palavras | 128 a 340 px |
| 4 Tela >= 40% da área e UI >= 24 px | banner 900x504 = 37% da área + título (a tela é metade da peça; abaixo dos 40% de forma literal, **desvio consciente**: a outra metade é a frase que a tela completa) | 900x793 = 53% | 820x646 = 39% (**desvio de 1 ponto**; subir para 860 se couber no render) | n/a (o aviso é desenho) | cenas 1 a 7 em tela cheia |
| 5 Voz humana | ok | ok | ok | ok | ok |
| 6 Sem emoji, degradê, mascote, IA | ok | ok | ok | ok | ok |
| 7 Pré-lançamento sem data/prazo/superlativo | "Em breve" | "Em breve"; "19h40" é a hora da pessoa, não prazo | "Cadastro em breve" | "Em breve" | "Em breve." |

## 4. Por que não parece IA

| Sinal | O que a peça faz |
|---|---|
| Imagem gerada | Nenhuma. Todo pixel é captura real do app (recortada) ou geometria do símbolo (sino, barras, sacola) |
| Rosto, mão, estoque | Nenhum |
| Degradê, brilho, vidro, sombra difusa | Nenhum: cor chapada e **sombra dura** deslocada (10 a 12 px) |
| Texto "bonito e vazio" | Frases específicas de quem fala ("Não deu pra passar na loja?", "Tem loja?", "Pedido novo."), com hora e verbo |
| Simetria e centralização de template | Alinhamento à esquerda, cortes diagonais, adesivo torto (-6 graus), marca-texto inclinado (-8 graus), tela cortada no meio do componente |
| Ícone genérico | O sino usa a mesma gramática do símbolo (trapézio/alça de curva, pílulas); o aviso usa o ícone real do app |
| Movimento suave demais | Vídeo com cortes secos, vibração do aparelho, punch-in curto; nada flutua |
| O que **ainda trai** | Tela de app com dados de seed ("Banana prata", "Mercadinho"); o que denuncia produto de demonstração é isso, não o estilo. A solução é regerar as capturas (pendência C1/C3) e **foto real do fundador** (mão com sacola, fachada) quando existir |

## 5. O que verificar no primeiro render (não consegui medir)

| # | Item | Peça | Risco |
|---|---|---|---|
| 1 | Larguras: calculei com 0,50 em/caractere. Linhas mais largas: "você gosta" (800 px de 936), "passar na loja?" (870 de 936), "sininho." (880 de 936), "Saiu para" e "escolheu." no vídeo | 0, 1, 3, vídeo | Estourar a margem; reduzir o `font-size` da linha |
| 2 | Recortes: coordenadas tiradas de capturas em 390x844 a olho (±2 px). Faixa de papel nas bordas do recorte do post 0 é proposital; no post 1 confirmar se o "00:51" ficou coberto | 0, 1, 2 | Fio da captura aparecendo na borda do recorte |
| 3 | Nitidez: capturas em 1x (390 px) ampliadas 2,3 a 2,5x ficam macias. Regerar `docs/telas/` com `deviceScaleFactor: 2` (os recortes são proporcionais; não mudam os HTML) | 0, 1, 2 | Texto da UI "mole" |
| 4 | Adesivo do post 1 sobre a linha do tempo e adesivo do post 2 ao lado do título ("Tem loja?" termina em x~700, o adesivo começa em 716) | 1, 2 | Sobreposição |
| 5 | Faixas do vídeo: posição assume clipe 390x844 em `cover` (escala 2,77). Faixa da cena 7 (770 px) cobre o horário previsto do cartão | vídeo | Cobrir o botão certo; ajustar altura e `object-position` |
| 6 | Fonte Bricolage em `design/recursos/fontes/`; Figtree em `design/fonts/`; o servidor do render só serve `src/` (pendência I2) | todas | 404 de fonte |
| 7 | O pipeline mede `scrollHeight` da raiz: o aparelho não sai mais pela base (sem moldura), então não há overflow esperado | posts | n/a |

## 6. Riscos para o CEO e o fundador

1. **Parecer jurídico (J1/DEC-039)**: "a loja passa aí", "agora entrega", "O motoboy leva." e "Saiu para entrega" são promessas de entrega pelo Webag. Nenhuma peça sai antes do parecer e do G5.
2. **Post 2 sem custo**: não afirma "sem mensalidade" nem comissão. O fundador decide o que dizer (`direcao-criativa.md` §3) e o que fazer com o contato do lojista que mandar mensagem (LGPD, finalidade, consentimento).
3. **Post 3**: o caminho "Seguindo > notificações" e a existência do "sininho" dependem da versão do Instagram `[HIPÓTESE]`. O aviso "Abrimos." é desenho nosso: o texto final do push é decisão do PO.
4. **Vídeo**: depende dos clipes (`src/clips/`, ainda inexistente) e do codec (WebM de reserva). Sem clipes, sai com posters estáticos (nota 3).
5. O "em breve" sem data por 3 semanas desgasta (pendência IP3 da v1): decidir se há data ao fim do post 3.
