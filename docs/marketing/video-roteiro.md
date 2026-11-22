# Vídeos de 15 s para Stories (v2.3): um por público

Autor: product-designer | Data: 2026-11-22 | Peças: `src/video-lojista.html` e `src/video-cliente.html` (1080x1920, 30 fps, 15 s) | Motor: `src/video-engine.js`; estilos: `src/video.css`, `src/social.css`; contato: `src/social-cfg.js` + `src/config.json` | Pareceres: `avaliacoes/2026-11-22-v2-2-video-*.md` | Legendas: `instagram-legendas.md` | Auto-crítica: `revisao-social-v2.md` §0.6
Regras: `direcao-criativa.md` §2 e skills `roteiro-de-video-curto`, `ganchos-virais`. **Esta versão descreve o que existe no HTML hoje** (a v2.1 descrevia cartões desenhados e "Pediu.").

## 1. Ficha

| Campo | LOJISTA | CLIENTE |
|---|---|---|
| Público | Quem tem loja e vende no balcão/WhatsApp | Quem compra de loja que não entrega |
| Ideia em 1 frase | "Venda além da sua rua." | "Aquela loja que você adora. Agora entrega." |
| Ação única | Chamar no direct (`@webag`, de `config.json`) | Seguir `@webag` |
| Gancho (1 s) | Balão "Tem no 38?" (100 px) no quadro 0; "Moro longe. Dá pra entregar?" em 0,35 s; "Só retirando, tá?" em lima em 0,85 s | **Quadro 0 já com as duas frases**: "Aquela loja que você adora. Não entrega." |
| Virada / promessa | 3,0 s ("Venda além da sua rua.") | **1,6 s**: risco em "Não", "Agora" entra, soco de escala no título; seta e cartão "Saiu para entrega" em 1,9 s |
| Prova em tela | Clipe real do painel, recortado e ampliado (k = 2,1, UI a 44 px), limpo: sem código, sem contagem, sem chip "Entrega"; cursor real toca "Aceitar" | Captura real da vitrine e do produto (estáticas, limpas) com toque e zoom; réplica do cartão de acompanhamento sem horário |
| Selo | "Tela de exemplo" na janela | "Tela de exemplo" em cada cena de tela |
| CTA entra | 12,5 s (2,5 s antes do fim) | 12,5 s (2,5 s antes do fim) |
| Depende do J8 | Só a cena 6 ("O Webag leva.") | A promessa "Agora entrega." e "Saiu para entrega" / "A caminho" |

## 2. Storyboard do LOJISTA

Cortes `[0, 3, 4.5, 6, 8, 9.5, 11.5, 15]` (múltiplos de 0,5 s; 120 BPM). Cada cena tem o título opaco no 1º quadro (só desloca poucos px).

| Tempo | Cena | Quadro | Texto | Movimento |
|---|---|---|---|---|
| 0,0 a 3,0 | 1. Conversa (noite) | Balões | "Tem no 38?" (100 px) / "Moro longe. Dá pra entregar?" (76) / **"Só retirando, tá?"** (112, lima) | Balão 1 no quadro 0; 2 e 3 entram com escala |
| 3,0 a 4,5 | 2. Promessa (lima) | Tipografia | **Venda / além da / sua rua.** (210 px) | "além da" salta |
| 4,5 a 6,0 | 3. Pedido novo (roxo) | Clipe real do painel (1,07 a 2,57 s do clipe), janela 912 x 987: "R$ 135,80", "2 itens", chip desenhado "Outro bairro", camiseta e bermuda, botão "Aceitar" | **Chegou / pedido.** (140 px) | A janela sobe 90 px e vibra 0,2 s |
| 6,0 a 8,0 | 4. Aceita (roxo) | Mesmo clipe (2,57 s em diante): o cursor real entra pela direita e aperta "Aceitar" (6,73 a 6,98 s) | **Aceita com / um toque.** (140 px) | Em 6,93 s o painel lima "Pedido aceito." cobre a janela |
| 8,0 a 9,5 | 5. Você separa (lima) | Ilustração `etapa-separando` | **Você / separa.** (210 px) | A ilustração salta de 85% |
| 9,5 a 11,5 | 6. O Webag leva (noite) `[J8]` | Ilustração `etapa-a-caminho` | **O Webag / leva.** (210 px, lima) | A moto entra da esquerda |
| 11,5 a 15,0 | 7. CTA (roxo) | Logo branco | **Tem loja?** (180 px); em **12,5 s** bloco lima **Chame no / direct. / @webag** (150 e 84 px); "Cadastro de lojas em breve. Francisco Morato e região." (44 px) | CTA sobe 60 px; o @ salta em 13,0 s |

Recorte do clipe (detalhe e contas em comentário no HTML): janela mostra x 689 a 1123 e y 360 a 830 do clipe 1920x1080. O código "Pedido WB-..." fica acima do recorte; o chip "Entrega" e a contagem "Responda em ..." ficam sob blocos brancos (o alerta é branco chapado).

## 3. Storyboard do CLIENTE

Cortes `[0, 3, 5.5, 8, 11.5, 15]`. **Nenhum clipe do app** (os clipes têm horário previsto, horários repetidos e "Últimas 2 unidades").

| Tempo | Cena | Quadro | Texto | Movimento |
|---|---|---|---|---|
| 0,0 a 3,0 | 1. Gancho e virada (roxo) | Tipografia; fachada, seta e moto | "Aquela loja / que você / adora. / **Não** / entrega." **no quadro 0**; em 1,6 s o risco corta "Não" e entra **Agora** (150 px) | Aproximação lenta do título de 0 a 1,6 s; a fachada entra pela esquerda; em 1,6 s soco de escala (1,02 para 1,08 e volta); seta e moto em 1,9 s |
| 3,0 a 5,5 | 2. Escolha (noite) | Captura real da vitrine (`app-loja-produtos.png`), janela 912 x 990, 1º produto (camiseta, R$ 49,90) e metade do 2º | **Escolha / na loja.** (130 px) + selo | Toque em 4,1 s; a imagem se aproxima do produto até o corte |
| 5,5 a 8,0 | 3. Peça (roxo) | Captura real do produto (`app-produto.png`): arte, preço e nome, janela 796 x 960 | **Peça.** (190 px) + selo | Aviso "Adicionado à sacola" (46 px) sobe em 6,9 s |
| 8,0 a 11,5 | 4. Acompanhe (noite) | Réplica do cartão de acompanhamento (912 x 809), UI a 44 px ou mais, sem horário | **Acompanhe / cada etapa.** (130 px) | Em 9,6 s: "Em separação" vira "Saiu para entrega" `[J8]`; destaque e marcadores descem; a barra enche |
| 11,5 a 15,0 | 5. CTA (roxo) | Logo branco | **Em breve.** (180 px); em **12,5 s** bloco lima **Siga / @webag** (150 e 100 px); "Começamos por Francisco Morato e região." (44 px) | CTA sobe 60 px; o @ salta em 13,0 s |

Nenhuma cena fica mais de 1,1 s sem movimento (a cena 4 tem a barra enchendo até 10,65 s; o CTA tem o salto do @).

## 4. Contrato técnico (igual nos dois)

`window.__duration = 15`, `window.__fps = 30`, `window.setTime(t)` devolve Promise. Sem CSS animation/transition, sem Date.now, sem Math.random: a imagem é função pura de `t`. `src/social-cfg.js` só troca o texto de `[data-handle]` (e reduz a fonte se o @ passar de `data-fit` px); não altera tempo nem movimento. O lojista usa clipes (`clips` no motor; `.webm` de reserva se o Chromium não tiver H.264, `pendencias.md` I3); o cliente não pede nenhum arquivo de vídeo. Régua de pré-visualização com `?preview`. Render: `pnpm marketing video-lojista` e `video-cliente`.

## 5. Som

Trilha da biblioteca do Instagram (escolha do fundador, IF2): instrumental, sem vocal, 120 BPM (aceita 112 a 126), batida seca, começar na batida 1. Acentos em 0,0; em 3,0 (lojista) ou **1,6 (cliente, no soco da virada)**; no corte do CTA (12,5) e na batida final. Alerta de notificação em 4,5 s no lojista (opcional). Os dois são entendidos sem som.

## 6. Aceite do pedido do CEO (v2.3)

| Critério | Lojista | Cliente |
|---|---|---|
| Gancho no 1º segundo | Balão no quadro 0 e mais dois até 0,85 s | **As duas frases no quadro 0**; movimento desde 0 s |
| Promessa antes dos 4 s | 3,0 s | **1,6 s** |
| Um CTA | "Chame no direct." + `@webag`, entra em 12,5 s | "Siga `@webag`", entra em 12,5 s |
| Sem pagamento como argumento | Nenhuma cena | Nenhuma cena |
| Sem prazo, data, superlativo | "Em breve", sem data | "Em breve", sem data |
| Sem dado de demonstração visível | Sem código, contagem, chip "Entrega" | Sem horário, código, escassez, "Pago no app" |
| UI >= 44 px | 44 a 46 px (k = 2,1) | 44 a 70 px |
| Entendido sem som | Todo conteúdo é texto de 44 a 210 px | Idem |

## 7. Medir e riscos

Depois de publicar: skip rate nos 3 s, retenção em 10 s, seguidores por alcance (cliente); mensagens diretas e visitas ao perfil por alcance (lojista). Metas de partida são `[HIPÓTESE]`.
- **J8**: vídeo do cliente e a cena 6 do lojista não saem antes do parecer e do G5. Plano B do lojista sem a cena 6: **a versão ainda não existe** (pedir ao designer; é um HTML a mais).
- **Não renderizei** (sem Bash): ver `revisao-social-v2.md` §0.6 (o que o CEO deve conferir no primeiro render: recorte do clipe do lojista, blocos brancos, janela do cliente).
- Os produtos e valores são do banco de demonstração; o selo "Tela de exemplo" está em todas as cenas de tela.
