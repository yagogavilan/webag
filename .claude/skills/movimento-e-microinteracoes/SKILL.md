---
name: movimento-e-microinteracoes
description: Regras de movimento e microinteração para o Webag (quando animar, durações, easing, propriedades baratas, háptico, redução de movimento, orçamento de performance em Android de entrada) e como especificá-las. Use ao desenhar feedback de toque, transições, skeletons e ao revisar animações implementadas.
---

# Porta de entrada: precisa animar?
Anime só com propósito nomeado: **feedback** (toquei, funcionou), **estado** (mudou de carregando para pronto), **continuidade espacial** (de onde veio), **evitar corte brusco**, **explicar** uma mudança. "Ficar bonito" sozinho não conta.
Não anime ações muito frequentes: troca de aba, abrir/fechar teclado, rolagem, entrada de itens em lista virtualizada. Um momento orquestrado por tela, no máximo.

# Tabela de decisão
| Situação | Movimento | Duração | Easing |
|---|---|---|---|
| Toque em botão/linha | Escala 0,97 ou destaque de fundo na pressão | 100 a 150 ms | ease-out |
| Toggle, chip, stepper (+/-) | Troca de estado com cor/escala leve | 150 a 200 ms | ease-out |
| Entrada/saída de elemento | Fade + translate curto (de escala 0,95, nunca de 0) | 150 a 250 ms | ease-out |
| Movimento na tela (reordenar, mover) | Transform | 200 a 300 ms | ease-in-out |
| Bottom sheet, modal | Padrão nativo da plataforma | ~300 ms | nativo |
| Indicador contínuo (spinner, skeleton) | Loop | ciclo 1 a 1,5 s | linear |
| Depois de gesto com inércia (arrastar sheet) | Mola (spring) para manter velocidade | n/a | spring |
Regra: UI em até 300 ms; ease-in puro não se usa em interface; tokens `motion.fast` (150) e `motion.base` (250) de `docs/design/tokens.json`, nada de número solto.

# Performance (Android de 2 a 3 GB, 3G)
- Anime só `transform` e `opacity`. Evite largura, altura, margem, padding, flex, top/left. No web, nunca `transition: all`.
- Mobile: animação na thread de UI (Reanimated), sem `setState` por quadro; preferir navegação, sheets, abas e menus nativos a recriar em JS.
- Skeleton: pulsar opacidade baixa, sem gradiente deslizante sobre listas inteiras. Lottie só para ilustração pontual, com peso medido.
- Teste de sensação sempre em build de release e no aparelho mais fraco suportado, nunca só em emulador/dev. Se cair quadros, corte o movimento.

# Redução de movimento (obrigatório)
Mobile: ler preferência do sistema (`useReducedMotion` ou `AccessibilityInfo.isReduceMotionEnabled`). Web: `@media (prefers-reduced-motion: reduce)`. Mantenha fade e mudança de cor; remova translação, escala, parallax e overshoot. Autoplay acima de 5 s precisa de pausar.

# Háptico
Usar com moderação: seleção (stepper), impacto leve (adicionar à sacola, código PIX copiado), notificação de sucesso/erro (pagamento). Um disparo por ação, no mesmo instante do visual, nunca como único feedback.

# Microinterações do Webag (propostas, validar no protótipo)
| Momento | Feedback |
|---|---|
| Adicionar à sacola | Botão vira stepper; contador da sacola pulsa uma vez; háptico leve |
| Copiar código PIX | Rótulo muda para "Código copiado" por 2 s; háptico; anúncio de acessibilidade |
| Pagamento confirmado | Transição suave para a linha do tempo; sem confete que atrase a leitura do status |
| Status do pedido | Etapa atual destacada; mudança anunciada ao leitor de tela |
| Lojista: pedido novo | Som alto + vibração + destaque visual persistente (não depende de animação) |
| Erro de campo | Realce de cor + texto; tremor opcional e só sem redução de movimento |

# Como especificar (seção "Movimento" na spec de tela)
`gatilho | propósito | propriedade animada | duração (token) | easing | versão com movimento reduzido | háptico`. Se não consegue preencher "propósito", remova a animação.

# Checklist de revisão
- [ ] Cada animação tem propósito e versão reduzida
- [ ] Só transform/opacity; duração dentro da tabela
- [ ] Interrompível: tocar durante a animação responde
- [ ] Não bloqueia a tarefa (nenhum toque perdido durante transição)
- [ ] Medido em release no aparelho fraco

## Fontes e licença
- expo/skills, skill `expo-animation` (MIT, LICENSE conferido), consultada em 2026-11-22. Adaptado: porta de entrada, durações, easing, háptico e redução de movimento; microinterações e tabela de decisão criadas para o Webag. Descartado: comando de envio de feedback a Expo.
- vercel-labs/web-interface-guidelines (MIT), 2026-11-22: regras web de animação (reduced-motion, transform/opacity).
