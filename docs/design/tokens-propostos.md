# Tokens propostos (não gravados em `tokens.json`)

> Autor: product-designer. Data: 2026-11-22. O `mobile-dev` e o tech-lead decidem se entram em `docs/design/tokens.json`. Contraste medido sobre branco `#FFFFFF`, salvo indicação.

## 1. Gráfico (R2, repetido aqui por ser a fonte única)

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `color.chart.1` | `#A21FBE` | série principal | 6,0:1 |
| `color.chart.2` | `#1C1721` | 2ª série | 17:1 |
| `color.chart.3` | `#28569E` | 3ª série | 7,2:1 |
| `color.chart.4` | `#1B6E3C` | 4ª série | 6,3:1 |
| `color.chart.5` | `#B45F06` | 5ª série | 4,6:1 |
| `color.chart.6` | `#5F566A` | "Outros", período anterior | 7,0:1 |
| `color.chart.grid` | `#E8E3EB` | linhas de grade | decorativo |

## 2. Novos em R3 a R5

| Token | Valor | Uso | Contraste / nota |
|---|---|---|---|
| `color.chart.funnel` | `#A21FBE` (= `chart.1`) | barras do funil | 6,0:1; **uma cor só**, a ordem das etapas e o texto da conversão carregam a informação |
| `color.chart.track` | `#F3F0F5` | fundo da barra (trilho) | decorativo |
| `color.chart.empty` | `#B3ABB9` (contorno 2 px) | coluna "menos de 5" no horário de pico | 2,2:1 decorativo; a informação está no texto "menos de 5" e no traço pontilhado |
| `color.map.base` | `#EEEAF1` | fundo do mapa | |
| `color.map.block` | `#F8F6F9` | quadras | |
| `color.map.street` | `#FFFFFF` com contorno `#D6CFDB` | ruas | |
| `color.map.water` | `#D3E3F4` | água | |
| `color.map.park` | `#DAEBDC` | parque | |
| `color.map.rail` | `#837A8A` tracejado | trilho | |
| `color.map.route` | `#A21FBE` 5 px com contorno branco 11 px | rota | 6,0:1 sobre `map.base` ~5,3:1 |
| `color.map.courier` | `#1C1721` com anel lima | marcador do motoboy | > 12:1 sobre o mapa |
| `color.map.courier.stale` | `#837A8A` | motoboy sem atualização | 3,9:1; **sempre com a etiqueta "Sem atualização"** |
| `color.map.pin.store` | `#A21FBE` | loja | 6,0:1 |
| `color.map.pin.dest` | `#1C1721` / `#A21FBE` | destino / "Você" | |
| `size.map.pin` | 44 | área de toque do pino | alvo mínimo |
| `size.map.pin.visual` | 36 (motoboy 44) | visual do pino | |
| `color.status.alert.attention` | `#7A4E00` sobre `#FFF3D6` | alerta "Atenção" | 7,4:1 |
| `color.status.alert.urgent` | `#B3261E` sobre `#FCEAE8` | alerta "Urgente" | 6,0:1; sempre com a palavra |
| `color.banner.pickup` | `#1C1721` | faixa "motoboy chegou" | |
| `color.banner.pickup.strong` | `#B3261E` (texto branco 6,5:1) | lembrete aos 3 min | |
| `size.touch.courier` | 56 (primário 72) | alvo no app do motoboy | acima do mínimo |
| `font.size.courier.body` | 18 | texto do app do motoboy | |
| `font.size.courier.action` | 20 | botão de etapa | |
| `motion.marker` | 1000 a 2000 ms suavizado | marcador entre pontos | `transform`; sem movimento com redução |
| `motion.reduced.marker` | 0 | marcador salta a cada ponto | |

## 3. Regras de uso

- Nada de degradê e nenhuma sombra nos gráficos.
- Cor nunca é a única pista: alerta tem palavra ("Atenção", "Urgente"); motoboy sem sinal tem etiqueta; célula pequena tem "menos de 5".
- Lima `#D6FF4A` só sobre noite, nunca sobre mapa claro ou branco.
- Tema escuro **não** existe no app do motoboy (sol forte).
