# Clipes de tela (insumos de movimento)

Gravados do app (versão web do Expo) e do painel do lojista, com a API real local e o seed padrão. MP4 H.264 High, yuv420p, 30 fps, sem áudio, BT.709, `+faststart`. Tudo fictício (clientes `*.mkt@seed.webag.local`, loja do seed "Moda Express Franco"). Como foram gerados: `../capturas/README.md`.

| Arquivo | Resolução | Duração | Tamanho | O que mostra |
|---|---|---|---|---|
| `app-loja.mp4` | 1170x2532 | 4,0 s (120 quadros) | 0,6 MB | Início com os cards de lojas; toque no card da Moda Express Franco; a loja abre; rolagem suave pela vitrine (6 produtos); toque na camiseta; abre a página do produto |
| `app-sacola.mp4` | 1170x2532 | 3,0 s (90 quadros) | 0,3 MB | Página do Tênis casual: toca no número 38, toca em Adicionar, aviso "Adicionado à sacola", toca em "Ver sacola", abre a sacola com total e "Ir para o pagamento" |
| `app-acompanhar.mp4` | 1170x2532 | 4,0 s (120 quadros) | 0,3 MB | Acompanhamento do pedido avançando de verdade pela API: "Em separação" (etapa 3 de 5) para "Aguardando motoboy" para "Saiu para entrega" (etapa 4 de 5, "A caminho") |
| `painel-pedido-novo.mp4` | 1920x1080 | 4,0 s (120 quadros) | 0,4 MB | Painel do lojista na fila de pedidos (Novos 0); chega um pedido novo (pago pela rota de simulação), abre o alerta "Pedido novo" com valor e itens; o cursor vai até "Aceitar" e clica; o pedido aceito entra na fila e aparece o aviso "Pedido ... aceito" |

## Como são feitos (e limites)

- Sem moldura e sem barra de status (os clipes são só a tela do app, 390x844 pontos a 3x). A versão com barra de status só existe nas capturas (`*-statusbar.png`).
- Quadros capturados um a um (CDP `Page.captureScreenshot`) e montados com ffmpeg; o movimento do vídeo vem do número do quadro, então é uniforme a 30 fps. Rolagem com easing (in-out cúbico), cursor do painel com easing senoidal, toque no app com indicador (círculo translúcido) e pequeno atraso entre aparecer, apertar e soltar.
- **Cortes secos nas trocas de tela**: depois de um toque, o tempo de rede/carregamento é cortado (o vídeo pula direto para a tela carregada, sem esqueleto). A animação de transição do app não aparece. O mesmo vale para a chegada do pedido no painel e para a mudança de etapa no acompanhamento.
- Animações próprias do app (aviso "Adicionado à sacola", segmento da barra de progresso) rodam em tempo real e são amostradas a cada quadro; ficam com poucos quadros de transição.
- O horário de chegada ("Chega entre 22:28 – 22:51") aparece no acompanhamento e na loja; muda de uma etapa para outra porque o servidor recalcula a faixa. As peças podem cobrir.
- Código de entrega do pedido está oculto (não aparece em nenhum clipe nem captura). No painel, o detalhe do pedido mostra nome, telefone (11) 99999-000X e endereço fictícios.
- As "fotos" dos produtos são ilustrações chapadas no estilo do kit v3 geradas para a captura (o seed usa degradê com formas). São ilustrações, não fotos reais.
