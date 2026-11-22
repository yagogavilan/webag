# Tela: Cliente, acompanhar o pedido e o motoboy no mapa   (WB-392, 393, 394, 395, 399)

> Autor: product-designer. Data: 2026-11-22. Release R4. Protótipo: `v1-1-logistica-e-analises.html#/c/pedido` (a tela segue o pedido #1042 em tempo real simulado), `#/c/avisos` (tela bloqueada). Barra do protótipo: "Ir para" (etapa), "Carla é a 2ª (lote)", "Mapa indisponível", "Motoboy sem app (WhatsApp)", sinal do motoboy (sem rede, GPS desligado) e estado "Sem rede". 1 s real = 20 s simulados.
> Mapa real: MapLibre + Protomaps (DEC-102). O protótipo imita com SVG.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **O mapa só aparece quando o pedido é a próxima parada do motoboy.** Em lote, quem não é o próximo lê: "O motoboy está entregando outro pedido antes do seu. **Você é o 2º.**" + (se ainda passa em outra loja) "Antes, ele ainda passa em outra loja." + "Chega por volta de 15:58. O mapa aparece quando for a sua vez." | F13/RN-R1: o marcador de um motoboy a quem espera outro revela o trajeto de terceiros. "Você é o 2º" é claro, mas **o cliente pode estranhar a fila**; a frase explica e dá horário (responde a pergunta do PRD ao designer) |
| 2 | **Privacidade visível na própria tela**: "Você vê só a posição atual do motoboy, até a entrega. Não mostramos telefone, trajeto nem outros pedidos." + "Como protegemos" (4 pontos) | O PRD pede privacidade visível; confiança do cliente e proteção de quem entrega |
| 3 | **Só o primeiro nome do motoboy**, sem foto, telefone, placa, trilha ou velocidade | RN-R2 |
| 4 | **Faixa prometida sempre visível e fixa** ("Prometido: entre 15:40 e 16:10") ao lado do ETA vivo ("Chega por volta de 15:52") | DEC-076: o ETA não muda a promessa. Se o ETA ultrapassa a faixa em 5 min: "Pode atrasar um pouco. Seguimos acompanhando." (1 vez, sem push) |
| 5 | **Sem sinal nunca extrapola**: marcador cinza, "Sem atualização há 2 min. Última posição às 15:48", ETA congelado "(não atualizada)"; depois de 5 min "Estamos tentando reconectar. Seu pedido segue a caminho." + **Falar com a Webag** | RN-R6; mentir deslocamento destrói confiança |
| 6 | **O código de entrega aparece na tela do pedido** (quatro dígitos grandes) a partir da saída, com "Diga este código ao motoboy só quando receber o pedido". Nunca no push | RN-D6 / WB-396 C3 |
| 7 | **"Falar com a loja" e "Ajuda da Webag" no mesmo lugar em todos os estados** (rodapé, lado a lado) | WCAG 3.2.6 (ajuda consistente) e H10 |
| 8 | **Conclusão curta e avaliação opcional na hora**: "Entregue às 15:54", "O acompanhamento no mapa acabou.", 5 estrelas (botões de 52 px com rótulo) e "Se preferir, o convite chega 1 hora depois." | O PRD manda o convite 1 h depois; o pedido do fundador pede avaliação na conclusão. Os dois convivem `[PO decide se mantém o convite de 1 h]` |
| 9 | **Estado em texto antes do mapa**: o título da tela já diz tudo ("Saiu para entrega", "O motoboy está chegando"); o mapa é reforço | Mapa quebra, 3G e leitor de tela |

## 1. Layout (de cima para baixo), por estado do pedido

| Estado | Título e apoio | Mapa | Outros blocos |
|---|---|---|---|
| Preparando | "Estamos preparando o seu pedido" / "A Moda Morato está separando os itens." | não | Faixa prometida, etapas, ajuda |
| Pronto / rota enviada | "Seu pedido está pronto" / "Estamos escolhendo o motoboy. Avisamos quando ele sair." | não | idem |
| A caminho da loja | "O motoboy está a caminho da loja" / "Ainda não saiu com o seu pedido. O mapa aparece quando ele sair." | não | idem |
| Na loja | "O motoboy chegou à loja" / "A loja está entregando o pedido a ele. Falta a confirmação de saída." | não | idem |
| **Saiu para entrega** | "Saiu para entrega" / "Chega por volta de **15:52**" | **sim** (loja, "Você", Carlos) | Privacidade, faixa prometida, **código**, etapas (Saiu: "Confirmado pela loja às 15:42") |
| Chegando (<= 3 min ou 300 m) | "O motoboy está chegando" | sim | idem |
| Motoboy no endereço | "O motoboy chegou" / "Diga o código de entrega." | sim | código em destaque |
| Entregue | Cartão noite: "Entregue às 15:54" | **fecha** | Avaliação, "Não recebi este pedido", ajuda |
| Não entregue | "Não conseguimos entregar" / "Motivo: cliente ausente." | fecha | **Combinar nova tentativa** |

Mapa: loja (quadrado roxo), destino (casa roxa, etiqueta "Você"), motoboy (círculo noite com seta e etiqueta "Carlos"), só o trecho **do motoboy até o destino** (sem trilha percorrida, sem outras paradas), "© OpenStreetMap" no canto. Animação do marcador entre pontos (até ~2 s), sem salto, no máximo 1 atualização a cada 5 s.

## 2. Estados

| Estado | Texto e comportamento |
|---|---|
| Carregando | Skeleton |
| Vazio | "Nenhum pedido em andamento. Quando você fizer um pedido, o acompanhamento aparece aqui." [Ver lojas] |
| Erro | "Não conseguimos carregar agora. Seus dados estão salvos. Tente de novo em instantes." |
| **Cliente sem internet** | Faixa "Sem conexão. Atualizado há 3 min. Mostramos o último estado." (C4 da WB-394) |
| **Mapa indisponível (tiles)** | Cartão "Mapa indisponível agora. O motoboy está a 1,2 km. Chega por volta de 15:52." (C7 da WB-392) |
| **Entrega sem app do motoboy** (WhatsApp) | Sem mapa e sem erro: "O mapa não está disponível para esta entrega. Acompanhe pelas etapas abaixo." |
| Sem sinal do motoboy | Ver decisão 5 (90 s e 5 min) |
| Volta do sinal | Marcador anima do último ao novo ponto em até 2 s, sem "teletransporte" |
| 404 / 410 | Outro usuário: não existe. Pedido encerrado: "Entrega concluída." e a tela vai ao resumo |
| Permissão | O cliente **não** precisa de localização; nada é pedido |

## 3. Tela bloqueada e push (`#/c/avisos`)

Os três pushes (ver `v1-1-notificacoes.md` §2) aparecem sem endereço, sem nome, sem nome do motoboy e sem código. O protótipo mostra a tela bloqueada com os avisos reais da simulação.

## 4. Movimento

| Gatilho | Propósito | Propriedade | Duração | Reduzido |
|---|---|---|---|---|
| Novo ponto do motoboy | Continuidade espacial (de onde veio) | transform do marcador | ~1 a 2 s suavizado | o marcador salta a cada ponto (a cada 30 s simulados) |
| Troca de estado | Orientar | fade do texto | `motion.fast` 150 ms | sem movimento |
Nenhum outro movimento. Háptico: nenhum.

## 5. Acessibilidade

Título e ETA em `aria-live="polite"` e **só atualizam quando o minuto muda** (não a cada ponto). Equivalente em texto do mapa: "Mapa simulado. Carlos a 1,2 km do seu endereço." (C9 da WB-392). Mapa não é a única fonte de nenhum dado. Cinza do "sem sinal" vem com texto. Código com `aria-label` dígito a dígito. Alvos >= 48 px; estrelas com rótulo "4 estrelas". Texto >= 16 px, escala do sistema 200% sem corte (cartões quebram linha). Contraste dos selos > 4,5:1.

## 6. Eventos

`tracking_started`, `tracking_viewed` (seconds), `tracking_stale` (seconds), `eta_live_late_warning`, `tracking_queue_shown` ("Você é o 2º"), `delivery_completed`, `rating_sent` (nota). Sem posição.

## 7. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-392 C1 a C9 | §1 (C2 nome e ETA ao lado da faixa; C4 "Você é o 2º"; C5 WhatsApp; C7 sem tiles; C8 atribuição; C9 texto); C3 é de dev (animação), C6 é de API |
| WB-393 C1 a C6 | §0.4 e §1 (C2 faixa fixa; C3 "Pode atrasar" 1 vez; C5 "Chegou" não regride); C1 e C6 são de cálculo |
| WB-394 C1 a C6 | §0.5 e §2 |
| WB-395 C1 a C8 | §0.2, §0.3 e "Como protegemos"; retenção e 404/410 são de API |
| WB-399 C1 a C5 | §1 (Entregue: mapa fecha em até 10 s; Não entregue: motivo e "Combinar nova tentativa"; app fechado: abre no estado final) |

## 8. Revisão heurística

**Nota 4 de 5.** RC-1 (sev. 3, H1): entre "pronto" e "saiu" o cliente fica sem nada novo; ver NT-2 em `v1-1-notificacoes.md`. RC-2 (sev. 3, H2): "Você é o 2º" pode soar como fila de espera quando o cliente é o 2º **na rota do motoboy**; a frase traz o horário para ancorar. Testar com 5 pessoas a leitura. RC-3 (sev. 2, H8): o código aparece em tela enquanto o mapa está aberto; se o cliente mostrar a tela a terceiros, expõe o código. Mitigação: o código só aparece depois de "saiu" e não é reutilizável. RC-4 (sev. 2, H4): avaliação na hora e 1 h depois duplica convite; escolher uma. Bom: faixa fixa ao lado do ETA, sem extrapolar sinal, privacidade escrita, ajuda no mesmo lugar. **Teste:** 5 clientes leem a tela em 5 s e dizem "onde está e quando chega".

## 9. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Avaliação imediata e convite em 1 h: manter os dois? 2. "Você é o 2º": aceita o texto? 3. Mostrar o nome do motoboy já na etapa "a caminho da loja"? Hoje só depois de sair |
| Security | 4. Código visível na tela do pedido durante o rastreio: risco aceito? |
| mobile-dev | 5. MapLibre nativo x WebView (DEC-087, Expo Go no iPhone do fundador) 6. Animação do marcador a 30 fps e em Android de entrada |
