# Revisão crítica do kit social v2.1 (perfil, 4 posts, 2 vídeos de 15 s)

Autor: product-designer | Data: 2026-11-22 | Rubrica: `.claude/skills/avaliar-post` (pesos: gancho 25, ideia 15, identificação 15, prova 15, miniatura 10, CTA 10, autenticidade 10) | Parecer de origem: `avaliacoes/2026-11-22-resumo.md`
**Limite (leia primeiro):** não tenho Bash e **não renderizei nada**. A v2 foi reprovada porque eu julguei o layout que escrevi. Desta vez as notas abaixo são **conservadoras e mostram a conta**; a margem de erro é de ±0,3 e só o render e a estrategista confirmam. Onde o critério depende de ativo que não existe (captura limpa, clipe, usuário do Instagram, foto real) eu **limito a nota** em vez de supor que ele vai chegar.

## 0. v2.2 (2026-11-22): ativos reais entram (captura e clipe no lugar do cartão desenhado)

Mesmo limite: **sem Bash, nada renderizado**. Li as imagens de `src/capturas/` e os scripts de `src/capturas/gerador/` (`clip-*.mjs`); **não consegui ver os MP4** (a ferramenta de leitura não abre vídeo). Os tempos dos clipes abaixo são **calculados dos scripts** (cada `rec.run(s)` grava s segundos; a espera de rede não é gravada), não conferidos quadro a quadro. O primeiro render precisa checar a coluna "Conferir".

### 0.1 O que usa ativo real, onde e como foi recortado

| Peça | Ativo | Recorte (coordenadas do ativo) | O que cobri ou deixei fora e por quê | Conferir no render |
|---|---|---|---|---|
| Post 2 (cliente) | `capturas/app-acompanhamento.png` em 3 faixas da mesma imagem (y 252-650, 1152-1297, 1808-2270 de 2532), 849 x 729 px = **42% do post**; UI de 34 a 58 px | Topo do cartão escuro ("Saiu para entrega", moto), barra de progresso, 3 últimas etapas da linha do tempo | **Fora**: faixa "Chega entre 22:11 – 22:34" (regra 7), nº do pedido (cabeçalho), 2 primeiras etapas, botão "Falar com a loja". O fundo do cartão é chapado: a emenda não aparece. "Remover um acessório": a montagem é edição do print; dito aqui e na nota do HTML | Emendas das faixas (1 px de serrilhado possível) |
| Post 3 (lojista) | `capturas/painel-pedido-novo-alerta.png`, alerta "Pedido novo" (x 1008-1872, y 466-1326 de 2880x1800), 794 x 790 px = **43% do post**; UI de 29 a 44 px | O alerta inteiro: "Pedido novo", R$ 135,80, 2 itens, camiseta e bermuda, "Responda em 9:53", "Aceitar" | O alerta **não tem** nome, telefone nem endereço (só o código fictício do pedido). Escolhi o alerta, e não `painel-pedido-aceitar.png`, justamente porque este mostra "Paulo", (11) 99999-0003 e a rua. Fundo escurecido (com "Pago no app") fica fora do recorte. **Cobri** a ponta do botão "Recusar" que aparece colada na borda esquerda do alerta (faixa branca de 31 px). Itens são roupa, sem seed de comida | Faixa branca não pode tocar o texto (sobra 5 px) |
| Vídeo do cliente, cena 2 "Escolha na loja." (3,5 a 5,0 s) | `clips/app-loja.mp4`, de 2,5 a 4,0 s, janela 912 x 1000 | y 130-1413 do clipe: vitrine da Moda Express Franco terminando de rolar, toque na camiseta, página do produto com preço | **Só usei a partir de 2,5 s**: antes disso rolam na tela o "22:38 – 23:08" da loja e dos cards do início, e o endereço de retirada. A conta: rolagem de 1560 px em 1,5 s (a partir de 1,46 s) com in-out cúbico; a linha do horário (y 1038-1272) sai acima do recorte (y 130) em 2,42 s. "20% off" já foi removido do banco | Se o quadro 0 da cena ainda mostrar o horário, subir `inn` para 2,6 |
| Cena 3 "Peça." (5,0 a 6,5 s) | `clips/app-sacola.mp4`, de 0,3 a 1,8 s, janela 912 x 858 | y 1430-2532: tênis casual, chips de número, botão Adicionar, aviso "Adicionado à sacola." no rodapé | **Parei antes de 2,08 s**: a sacola aberta mostra "Chega entre 22:50 e 23:20". Não mostro a sacola nem "Ir para o pagamento" (regra 1: pagamento não é argumento). **Mudei a copy** "Pediu." para "Peça." (adicionar à sacola ainda não é pedir; fica paralelo a "Escolha" e "Acompanhe") | O dedo no número 38 e no Adicionar fica dentro do recorte |
| Cena 4 "Acompanhe cada etapa." (6,5 a 10,5 s) | `clips/app-acompanhar.mp4` inteiro (4 s), janela 912 x 930 | y 1135-2328: barra de progresso e linha do tempo; etapa nova em 7,6 s e 8,8 s | O recorte começa **abaixo** do "Chega entre ..." do cartão escuro (que vai até y~1105 no estado mais alto). Sem montagem: no vídeo o recorte é contínuo | **Maior risco do kit**: não vi os estados "Em separação" e "Aguardando motoboy". Se o título deles for de 1 linha, o cartão fica ~120 px mais curto e aparece uma faixa escura no topo da janela com a barra cortada. Se algum quadro mostrar horário, subir o recorte (`top` de `#slot4 video`) |
| Vídeo do lojista, cenas 3 e 4 (4,5 a 8,0 s) | `clips/painel-pedido-novo.mp4`, de 1,07 s em diante (alerta abre em 1,0 s), janela 836 x 871 | Alerta em x 673-1247, y 241-839 do clipe de 1920x1080 | **Fora**: a fila dos primeiros 1,0 s e a fila depois do clique (mostram "Pago no app" e códigos de outros pedidos). Em 6,93 s um painel lima "Pedido aceito." (tipografia) cobre a janela antes do alerta fechar (clipe 3,55 s): troca o aviso real, que ficaria na fila. Mesma faixa branca no "Recusar". 16:9 inteiro **não** serve: a 912 px de largura o texto de 16 px do painel vira 8 px | Posição do alerta na altura (calculei centrado em 810 px: y 231-849). Se aparecer 1 a 2 px de fundo escuro, a moldura de 6 px esconde; mais que isso, ajustar `top` de `#slot3 video` e `#slot4 video` |

Cortes visíveis (meta 8 a 10, gancho 1 s, promessa antes de 4 s, CTA único mantidos): **lojista 8** (6 de cena, abertura do alerta, "Pedido aceito."); **cliente 8** (4 de cena, toque que abre o produto, toque em Adicionar, 2 trocas de etapa do acompanhamento). Promessa em 3,0 s (lojista) e 2,3 s (cliente), sem mudança.

### 0.2 Mudança de caminho (a instrução dizia `../clips/`)

Os arquivos estão em `src/clips/` e `src/capturas/`. A partir dos vídeos (`src/`) o caminho é `clips/...`; a partir de `src/instagram/` é `../capturas/...`. Usei esses. Se o pipeline copiar os HTML para outra pasta, os caminhos quebram.

### 0.3 "Isso para o dedo?" (reavaliação, conta à vista)

| Peça | Antes (prova / média) | Agora (prova) | Média nova | Por que a prova sobe |
|---|---|---|---|---|
| Post 2 | 3,5 / 3,98 | **4,0** (autenticidade 3,5 para 4,0) | 4,10 | Tela real a 42% do post e UI legível; trava em 4,0 por ser montagem de faixas e a tela ser uma linha do tempo, não a compra |
| Post 3 | 3,5 / 3,98 | **4,5** (aut. 4,0) | 4,18 | O alerta real com "Aceitar" é exatamente a promessa para o lojista; sem dado pessoal |
| Vídeo do lojista | 3,5 / 4,03 | **4,5** (aut. 4,0) | 4,23 | Cursor real indo ao "Aceitar" e apertando |
| Vídeo do cliente | 3,5 / 3,95 | **4,0** (aut. 4,0) | 4,08 | Dedo real tocando produto e Adicionar; acompanhamento avançando pela API. Trava em 4,0: a cena 4 é um recorte da linha do tempo (sem o cartão escuro) e o app mostra ilustração chapada, não foto |
| Post 0 e post 1 | 3,95 / 4,03 | sem mudança | 3,95 / 4,03 | Seguem tipográficos por decisão (post 0 sem tela; post 1 é a conversa). A prova 3,0 do post 0 continua sendo o item mais baixo do kit |

Pergunta "isso para o dedo?" por peça: **vídeo do lojista** sim, o alerta real abre em 4,5 s e o cursor chega ao botão em 6,5 s; o gancho segue sendo a conversa. **Vídeo do cliente** talvez: a cena 2 abre com rolagem em curso (movimento no 1º quadro, bom) mas a cena 4 é mais calma; é o trecho a medir na retenção. **Post 3** sim, é a única peça com botão e valor reais; **post 2** razoável: a moto e "Saiu para entrega" ancoram o olhar, a linha do tempo é leitura lenta. Margem de erro ±0,3 e **nenhuma nota aqui substitui o render e a estrategista**.

### 0.4 O que descobri e deixo para outros papéis

| # | Achado | Dono |
|---|---|---|
| 1 | **Bug no painel do lojista**: no alerta "Pedido novo" o botão "Recusar" aparece cortado e colado na borda esquerda do alerta (só a ponta direita do contorno é visível, ao lado de "Aceitar"). No real, o lojista pode não conseguir recusar pelo alerta. Cobri na peça, mas é defeito de produto | mobile-dev (painel) e QA |
| 2 | **Chip "Entrega" no alerta** (post 3 e vídeo do lojista): o post 3 deixou de ser "sem promessa de entrega" (era o motivo do chip "Outro bairro" na v2.1). Depende do parecer J8 como o resto do kit. Se o CEO quiser o post 3 antes do J8, cobrir o chip (um `div` de 120 x 40 px sobre o chip) ou usar `Outro bairro` só no texto | CEO, jurídico |
| 3 | `video-engine.js` registra `.webm` como segunda fonte. Se o Chromium do render não tiver H.264, o MP4 não toca e o `.webm` não existe (404 derruba o render). Gerar `.webm` dos 4 clipes ou usar Chrome com H.264 | mobile-dev (pipeline) |
| 4 | `video-roteiro.md` (§1, §2, §3, §5) e `instagram-legendas.md` ainda descrevem cartões desenhados e "Pediu."; o roteiro não foi reescrito nesta rodada (decisão de economia): a fonte de verdade das cenas agora são os comentários dos dois HTML | product-designer (próxima rodada) |

### 0.5 Passada "remover um acessório"

Saíram: o rótulo "Tela ilustrativa." (os 3 cartões e os 2 posts), o toque desenhado e a animação do botão que virava "Pedido aceito" (o toque agora é do clipe), o subtítulo "Peça sem sair do lugar." do post 2 subiu para junto do CTA para a captura ganhar altura.

## 1. O que mudou por peça (resposta ao parecer)

| Peça | Parecer v2 | Feedback específico | O que fiz |
|---|---|---|---|
| Post 0 | 2,8 refazer | Frase terminava em "agora"; destaque na palavra errada; banner borrado e botão falso; sem CTA | Mesma arte vira: "Aquela loja que você adora. ~~Não~~ Agora entrega." ("Não" riscado em lima, "Agora" ao lado, "entrega." em marca-texto lima nos dois estados). Sem banner nem botão: par de ilustrações loja para moto. CTA "Siga e ative o sininho." 52 px na arte |
| Post 1 (era post 2) | 3,3 (trava 5) | Cartão com WB-DM002, banana, "Pago no app"; adesivo colidindo; recrutar com a conversa | Agora é o post 1 do lojista: a conversa "Tem no 38? / Moro longe. Dá pra entregar? / Só retirando, tá?" + "Quantas vendas essa frase já custou?". Sem tela, sem seed, sem promessa de entrega |
| Post 2 (era post 1) | 3,6 | Sem CTA; prova repetida e borrada; adesivo ambíguo; "19h40" pequeno | Cena mantida ("Voltando do trabalho. Não deu pra passar na loja?", sem hora); um cartão desenhado de linha do tempo (sem seed, sem horário, sem comida); CTA 48 px; adesivo saiu |
| Post 3 | 2,8 refazer | Pede antes de dar; dois sininhos | Convite descartado. Vira o post de recrutamento: "Tem loja? Venda além da sua rua." com cartão de pedido de loja de moda, valores redondos, chip "Outro bairro", **sem adesivo**, CTA "Chame no direct para entrar na lista." 52 px |
| Perfil | 4,0 | Bio sem caminho do lojista | Foto igual; bio A/B/C em `instagram-legendas.md` §1 com "Tem loja? Chame no direct" |
| Vídeo | 3,3 | Dois públicos; promessa no 10º s; corte do "+"; sino | Dois vídeos, um por público, promessa em 3,0 s (lojista) e 2,3 s (cliente), sem corte do "+" nem "Do outro lado:" |

## 2. Nota por peça (conta à vista)

Cada linha: critérios na ordem gancho, ideia, identificação, prova, miniatura, CTA, autenticidade. Média ponderada.

| Peça | G | I | Id | P | M | C | A | Nota | Leitura |
|---|---|---|---|---|---|---|---|---|---|
| Post 0 (cliente) | 4 | 5 | 4 | 3 | 4 | 4 | 3,5 | **3,95** | No limite. Reescrita não resolve sozinha: falta prova real (ver §3) |
| Post 1 (lojista, conversa) | 4 | 5 | 4,5 | 3 | 4,5 | 3,5 | 3,5 | **4,03** | Passa. Mais forte do kit na identificação |
| Post 2 (cliente, pergunta) | 4 | 4,5 | 4,5 | 3,5 | 4 | 3,5 | 3,5 | **3,98** | No limite |
| Post 3 (lojista, recrutamento) | 4 | 4,5 | 4,5 | 3,5 | 4 | 3,5 | 3,5 | **3,98** | No limite |
| Vídeo do lojista | 4 | 4,5 | 4,5 | 3,5 | 4 | 4 | 3,5 | **4,03** | Passa |
| Vídeo do cliente | 4 | 4,5 | 4 | 3,5 | 4 | 4 | 3,5 | **3,95** | No limite |
| Perfil | n/a | 4 | 3,5 | n/a | 5 | n/a | 4 | 4,0 (parecer) | Foto igual |

Por que **nenhuma passa de 4,1** e por que **prova nunca passa de 3,5**: toda tela de app aqui é cartão desenhado (rotulado "Tela ilustrativa."), porque não existe captura nem clipe sem seed (pendência I6). Prova de produto "real em uso" só existe com captura nova do `mobile-dev` ou com a gravação do fundador. Por que **CTA 3,5 nos posts**: o caminho do lojista ainda não tem usuário nem link (IF1); a arte diz "Chame no direct" mas não mostra para quem.
O que sobe a nota (cada item é `[HIPÓTESE]` do efeito): usuário e link preenchidos +0,1 a +0,15 em todos; clipe ou captura limpa no lugar do cartão (prova 3,5 para 4,5) +0,15 nos vídeos e nos posts 2 e 3; foto real do fundador (mão com sacola) no lugar da ilustração do post 0 (autenticidade e prova) +0,2.
Travas: nenhuma peça tem pagamento, prazo, superlativo, regional como mensagem, emoji, degradê, mascote, imagem de IA, dado de seed ou código de pedido. **Trava 6**: `[J8]` está marcado em `pendencias.md` IJ1 e em `instagram-legendas.md` (posts 0 e 2, vídeo do cliente, cena 6 do vídeo do lojista). Os posts 1 e 3 e as cenas 1 a 5 e 7 do vídeo do lojista **não prometem entrega**.

## 3. Reescrita das peças abaixo de 4,0

| Peça | Primeira leitura | O que reescrevi | Nota depois |
|---|---|---|---|
| Post 2 | 3,8 | Voltou a cena concreta ("Voltando do trabalho.", 56 px, sem hora): identificação 4 para 4,5, ideia 4 para 4,5. Subtítulo "Peça sem sair do lugar." fecha a ideia | 3,98 |
| Post 3 | 3,9 | Chip do cartão "Agora" para "Outro bairro": o cartão passa a provar a promessa do título ("além da sua rua"); identificação 4 para 4,5. Adesivo retirado (era a colisão com o título) | 3,98 |
| Post 0 | 3,95 | **Sem reescrita que eu consiga justificar**: as duas alavancas que sobram são ativos que não tenho (foto real; usuário). Avaliei (no papel, não renderizei) trocar as ilustrações por um cartão de loja do app (40% da área, regra 4): custaria o título de 148 px para 112 px e o cartão não leria em miniatura; a nota fica igual (gancho cai, prova sobe). Mantive o título grande | 3,95 |
| Vídeo do cliente | 3,95 | Nada a reescrever no roteiro: o limitante é prova real (clipes) e a dependência do J8 | 3,95 |

Se a estrategista medir 3,9 em post 0 e vídeo do cliente, a ação certa é ativo real (foto/clipe), não mais texto.

## 4. O que verificar no primeiro render (não consegui medir)

| # | Item | Peça | Risco |
|---|---|---|---|
| 1 | Larguras: 0,53 em/caractere (Bricolage 800, tracking -0,045 em). Linhas de maior risco: "passar na loja?" (890 de 936, 112 px), "Aquela loja" (863, 148 px), "Só retirando," (772 + padding, balão lima 108 px) | posts 0, 1, 2 | Estourar a margem; reduzir o `font-size` da linha |
| 2 | Vídeo: "Só retirando," a 112 px ancorado à direita (875 de 912); "cada etapa." a 150 px (874); "na loja." a 190 px (805); "sua rua." a 210 px (890) | vídeos | Linha passa de 912 px (margem de 84 px) |
| 3 | Altura dos cartões (calculada em "em"): post 2 ~620 px, post 3 ~580 px, vídeos 650 a 690 px. Folga ao CTA: 30 a 50 px | posts 2 e 3 | Cartão encostando no CTA; reduzir `font-size` do cartão (1 linha) |
| 4 | Marcadores da linha do tempo: o "check" é uma borda girada dentro de um círculo; posição calculada, pode ficar 1 a 2 px fora do centro | posts 2, vídeo cliente | Cosmético |
| 5 | `.mk` (marca-texto inclinado) e `.strike` (risco inclinado) sobre texto: o risco passa a 52% da altura da palavra "Não" | post 0, vídeo cliente | Risco cobrir pouco ou demais; ajustar `top` em `.strike` |
| 6 | O render serve `docs/` inteira (confirmado em `scripts/marketing-render.mjs`): fontes e SVG resolvem. Nenhum PNG de captura é usado mais; `assets-social/` não é mais referenciado | todas | n/a |
| 7 | O pipeline só renderiza `video-story` (agora um stub de 1 s). Ajustar para os dois nomes antes de renderizar | vídeos | Render de 1 s por engano |
| 8 | Vídeo: `setTime(0)` no quadro 0 mostra só o 1º balão (lojista) e as 3 primeiras linhas (cliente): é intencional; conferir que a capa `--capa 3` (lojista) e `--capa 3` (cliente) é a promessa | vídeos | Capa sem a promessa |

## 5. Checagem das regras de `direcao-criativa.md` §2

| Regra | Post 0 | Post 1 | Post 2 | Post 3 | Vídeos |
|---|---|---|---|---|---|
| 1 Sem pagamento como argumento | ok | ok | ok | ok | ok |
| 2 Uma ideia | A loja agora entrega | A conversa que custou vendas | Pedir sem sair do lugar | Venda além da sua rua | Uma por vídeo |
| 3 Título >= 110 px e <= 10 palavras | 148 px, 7 palavras | 110 px (pergunta) e 108 px (resposta), 6 palavras | 112 px, 6 palavras | 140 px, 6 palavras | 150 a 230 px |
| 4 Tela >= 40% e UI >= 24 px | **Desvio consciente**: sem tela; par de ilustrações | **Desvio consciente**: a peça é a conversa, não o produto | Cartão 936x~620 = 40%; UI 44 px | Cartão 936x~580 = 37%; UI 42 px | Cartões 912x~650; UI 46 a 50 px |
| 5 Voz humana | ok | frase literal do lojista (reencenada) | ok | ok | ok |
| 6 Sem emoji, degradê, mascote, IA | ok | ok | ok | ok | ok (nenhum rosto, nenhuma foto) |
| 7 Pré-lançamento | "Em breve" | "Em breve" | "Em breve"; sem hora | "Cadastro em breve" | "Em breve", sem data |

## 6. Riscos para o CEO e o fundador

1. **Parecer J8** segura posts 0 e 2 e o vídeo do cliente. O lojista (posts 1 e 3, vídeo sem a cena 6) pode sair antes: decisão do CEO.
2. **Reencenação, não print**: a conversa do post 1 é escrita por nós. Se o fundador tiver a frase literal de uma visita, trocar: é mais forte e mais honesto.
3. **"Casa Lar"** (cartão do cliente) e os produtos são fictícios; conferir que não há loja real da região com esse nome.
4. **Post 3 e custo**: a peça não diz "sem mensalidade" nem comissão (IF5). O fundador decide.
5. O "em breve" sem data por 3 semanas desgasta (IP3 em `pendencias.md`).
