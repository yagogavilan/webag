# Vídeos de 15 s para Stories (v2.1): um por público

Autor: product-designer | Data: 2026-11-22 | Peças: `src/video-lojista.html` e `src/video-cliente.html` (1080x1920, 30 fps, 15 s) | Motor: `src/video-engine.js`; estilos: `src/video.css`, `src/social.css` | Substitui o conceito único "Um pedido, dois lados" (v2, nota 3,3) e a v1 (mp4 nota 2,6, descartada) | Parecer: `avaliacoes/2026-11-22-video.md` | Legendas: `instagram-legendas.md` | Auto-crítica: `revisao-social-v2.md`
Regras: `direcao-criativa.md` §2 e skills `roteiro-de-video-curto`, `ganchos-virais`. Pesquisa e referências da v2 (Nubank, 99Food, Wabi, Magalu, Shopee): não mudaram; ficam no histórico do git (`video-roteiro.md` de 2026-11-22, commit anterior). O que o parecer corrigiu: um público por vídeo; promessa antes dos 4 s; sem o corte do "+"; sem "Do outro lado:"; CTA que recruta (lojista) ou segue (cliente).

## 1. Ficha de cada peça

| Campo | Vídeo do LOJISTA (primeiro) | Vídeo do CLIENTE |
|---|---|---|
| Público | Quem tem loja e vende no balcão/WhatsApp | Quem compra de loja que não entrega |
| Ideia em 1 frase | "Venda além da sua rua." | "Aquela loja que você adora. Agora entrega." |
| Sentimento | "isso é comigo" | reconhecimento, depois alívio |
| Ação única | Chamar no direct | Seguir e ativar o sininho |
| Gancho (1 s) | Balão "Tem no 38?" no quadro 0; "Moro longe. Dá pra entregar?" em 0,35 s; "Só retirando, tá?" em lima em 0,85 s | "Aquela loja que você adora." no quadro 0; "Não entrega." em 0,7 s |
| Promessa | 3,0 s | 2,3 s ("Agora entrega.") |
| Prova em tela | Cartão desenhado de pedido novo com toque em "Aceitar pedido" (4,5 a 8,0 s) | Cartões desenhados: loja no app, 1º passo marcado, linha do tempo (3,5 a 11,0 s) |
| Depende do parecer J8 | Só a cena 6 ("O Webag leva.") | A promessa "Agora entrega." e "A caminho" |

## 2. Storyboard do LOJISTA

Cortes em múltiplos de 0,5 s (120 BPM): `[0, 3, 4.5, 6, 8, 9.5, 11.5, 15]`. Cada cena tem o título opaco no 1º quadro (só desloca poucos px); fade só no que entra depois do corte.

| Tempo | Cena | Quadro | Texto (Bricolage 800 / Figtree) | Movimento |
|---|---|---|---|---|
| 0,0 a 3,0 | 1. Conversa (noite) | Balões de mensagem | "Tem no 38?" (76 px) / "Moro longe. Dá pra entregar?" / **"Só retirando, tá?"** (112 px, lima) | Balão 1 no quadro 0; 2 e 3 aparecem com escala (88% e 80% a 100%) |
| 3,0 a 4,5 | 2. Promessa (lima) | Tipografia | **Venda / além da / sua rua.** (210 px; "além" em bloco noite) | Título no corte; "além da" salta |
| 4,5 a 6,0 | 3. Pedido novo (roxo) | Cartão de pedido desenhado (camiseta M R$ 60, boné R$ 40, total R$ 100, chip "Outro bairro") | **Chegou / pedido.** (190 px) | Cartão sobe 90 px e vibra 0,2 s: o painel apitou |
| 6,0 a 8,0 | 4. Aceita (roxo) | Mesmo cartão | **Aceita com / um toque.** (150 px) | Toque (64 px) em 6,55 s; botão afunda; vira "Pedido aceito" em 6,85 s |
| 8,0 a 9,5 | 5. Você separa (lima) | Ilustração `etapa-separando` | **Você / separa.** (210 px) | Ilustração salta de 85% |
| 9,5 a 11,5 | 6. O Webag leva (noite) `[J8]` | Ilustração `etapa-a-caminho` | **O Webag / leva.** (210 px, lima) | Moto entra da esquerda em 0,35 s |
| 11,5 a 15,0 | 7. CTA (roxo) | Logo branco | **Tem loja?** (180 px); em 12,0 s bloco lima **Chame no / direct.** (150 px); "Cadastro de lojas em breve. Francisco Morato e região." (38 px) | CTA sobe 60 px; parado de 12,1 a 15,0 s |

Sem som, entendido pelo texto. Todo texto entre y=290 e y=1500 (zona segura: topo 250, base 340).

## 3. Storyboard do CLIENTE

Cortes: `[0, 3.5, 6, 7.5, 11, 15]`.

| Tempo | Cena | Quadro | Texto | Movimento |
|---|---|---|---|---|
| 0,0 a 3,5 | 1. Gancho e virada na mesma arte (roxo) | Tipografia + par de ilustrações (fachada, seta, moto) | "Aquela loja / que você / adora." no quadro 0; "Não" + **"entrega."** (lima) em 0,7 s; em 2,1 s o risco lima cai sobre "Não" e entra **"Agora"**; moto e seta em 2,3 s (150 px) | O risco cresce em 0,14 s; "entrega." salta |
| 3,5 a 6,0 | 2. A loja no app (noite) | Cartão desenhado: loja "Casa Lar", vaso R$ 80, almofada R$ 50, botão "Fazer pedido" | **Escolha / na loja.** (190 px) | Cartão sobe 60 px; toque em "Fazer pedido" em 5,25 s |
| 6,0 a 7,5 | 3. Pediu (lima) | Cartão de linha do tempo, 1º passo "Pedido enviado" | **Pediu.** (230 px) + "Sem sair do lugar." (72 px) | 1º marcador salta em 6,3 s |
| 7,5 a 11,0 | 4. Acompanhar (noite) | Mesmo cartão, 4 etapas | **Acompanhe / cada etapa.** (150 px) | Em 9,0 s o destaque lima desce: "Loja separando" marcada, "A caminho" vira a atual `[J8]` |
| 11,0 a 15,0 | 5. CTA (roxo) | Logo branco | **Em breve.** (180 px); em 11,25 s bloco lima **Siga e ative / o sininho.** (120 px); "Começamos por Francisco Morato e região." | CTA sobe 60 px; parado de 11,4 a 15,0 s |

## 4. Contrato técnico (igual nos dois)

`window.__duration = 15`, `window.__fps = 30`, `window.setTime(t)` devolve Promise (resolve após `seeked` de clipes ativos, se houver, mais 2 quadros). Sem CSS animation/transition, sem Date.now, sem Math.random: a imagem é função pura de `t`. `window.__ready` espera as fontes. Régua de pré-visualização com `?preview` na URL.
O render deve rodar os dois arquivos (`pendencias.md` I2). `src/video-story.html` virou um stub de 1 s: apagar quando o pipeline mudar.
Sem clipes, nenhum pedido de rede além de fontes e SVG do kit (um 404 de clipe faz o render falhar de propósito). Com clipes: preencher `clips` no fim de cada HTML (exemplo no comentário) e dar o nome combinado no README de `src/clips/`.

## 5. Clipes reais (quando existirem, `src/clips/`)

| Clipe | Cena | O que precisa mostrar | Cuidados |
|---|---|---|---|
| `painel-pedido-novo` | Lojista, 3 e 4 | Pedido novo entrando e toque em "Aceitar pedido" | Loja de moda ou casa, valores redondos, sem código de pedido, sem "Pago no app", sem idade do pedido, sem "Som desligado" |
| `app-loja` | Cliente, 2 | Página de uma loja de moda/casa | Sem "20% off", sem "Retire grátis", sem horário previsto |
| `app-acompanhar` | Cliente, 4 | Linha do tempo avançando | Sem faixa de horário; fora de madrugada |

O clipe cobre o cartão desenhado (mesma caixa, `object-fit: cover`). O cartão é vertical largo; clipe de celular (390x844) fica cortado: quando o clipe chegar, o designer reenquadra a cena (um ajuste de layout, não de motor). Até lá, vale o cartão. A gravação do fundador (10 a 15 s, ele como cliente e como loja) pode valer mais que qualquer arte `[HIPÓTESE]`.

## 6. Som

Trilha da biblioteca do Instagram (escolha do fundador, IF2): instrumental, sem vocal, 120 BPM (aceita 112 a 126), batida seca, começar na batida 1, sem fade-in. Acentos em 0,0, 3,0 (lojista) ou 2,1 (cliente), no corte do CTA e na batida final; queda em 11,5 (lojista) ou 11,0 (cliente); fade no último segundo. Alerta de notificação em 4,5 s no vídeo do lojista (opcional). Os dois são entendidos sem som.

## 7. Aceite do pedido do CEO

| Critério | Lojista | Cliente |
|---|---|---|
| Gancho no 1º segundo | Balão "Tem no 38?" no quadro 0 e mais dois balões até 0,85 s | Título no quadro 0 e "Não entrega." em 0,7 s |
| Promessa antes dos 4 s | 3,0 s | 2,3 s |
| Um CTA | "Chame no direct." | "Siga e ative o sininho." |
| Sem pagamento como argumento | Nenhuma cena | Nenhuma cena |
| Sem prazo, data, superlativo | "Em breve", sem data | "Em breve", sem data |
| Sem dado de demonstração | Cartão desenhado, valores redondos | Cartões desenhados, valores redondos |
| Entendido sem som | Todo conteúdo é texto de 76 a 230 px | Idem |

## 8. Medir e riscos

Depois de publicar: skip rate nos 3 s, retenção em 10 s, seguidores por alcance (cliente); mensagens diretas e visitas ao perfil por alcance (lojista). Metas de partida são `[HIPÓTESE]`. Se o skip rate do lojista for alto, trocar só a cena 1 (alternativa: abrir pela promessa, cena 2).
- **J8**: vídeo do cliente e a cena 6 do lojista não saem antes do parecer e do G5. Plano B do lojista sem a cena 6: pedir ao designer (sai "Você separa." direto para o CTA).
- **Não renderizei** (sem Bash). Larguras com 0,53 em/caractere: linhas de maior risco em `revisao-social-v2.md` §4.
- O nome "Casa Lar" e os produtos do cartão do cliente são fictícios; conferir que não existe loja real da região com esse nome.
- Reduced motion: vídeo gravado, não se aplica.
