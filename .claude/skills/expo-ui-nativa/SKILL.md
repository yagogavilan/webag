---
name: expo-ui-nativa
description: Regras para construir telas com cara e comportamento nativos no app Webag (Expo Router, navegação nativa, safe area, teclado, listas, texto, ícones, imagens) e checklist de "tela pronta". Use ao implementar ou revisar qualquer tela do apps/mobile.
---

# Escopo e prioridade
`apps/mobile` é **só o app do cliente** (DEC-005); lojista e admin são web. Onde esta skill divergir de `docs/arquitetura/adr/ADR-001-stack.md`, o ADR vence (ex.: estilo = `StyleSheet` com tema tipado gerado dos `packages/tokens`, não inline nem NativeWind). Android de entrada é o alvo principal.

# Rotas e navegação (Expo Router 58)
- Grupos `(auth)` e `(customer)`; arquivo em kebab-case; alias de path no `tsconfig` em vez de `../../..`.
- Preferir **navegadores nativos** (stack nativo, abas nativas, modal e sheet nativos) a navegadores em JS. O título vem do header do stack, não de um título solto na página.
- Imports de navegação vêm de `expo-router`; não misturar com `@react-navigation/*` direto.
- Deep links (retorno de pagamento) validados: o parâmetro vindo de fora é entrada não confiável.

# Layout, safe area e teclado
- Tela rolável: ScrollView (ou FlashList) como raiz; nunca ScrollView em volta de lista virtualizada.
- Safe area: `contentInsetAdjustmentBehavior="automatic"` e `react-native-safe-area-context`; não usar o `SafeAreaView` do RN (removido). Edge-to-edge no Android.
- Espaço com `gap` e `padding` (de `space.*`), não margem solta. Padding de scroll via `contentContainerStyle`. Dimensões com `useWindowDimensions`, não `Dimensions.get()`.
- Formulário: `keyboardShouldPersistTaps="handled"`; botão principal nunca coberto pelo teclado; ação primária desabilitada durante o envio.
- Cantos arredondados com `borderCurve: 'continuous'` (exceto cápsula). Sombra com `boxShadow` (props legadas de sombra/elevation não); aparelho fraco: use pouca sombra.

# Componentes e bibliotecas
| Precisa de | Use | Evite |
|---|---|---|
| Lista longa/desconhecida | FlashList 2 | `List` de `@expo/ui` (não virtualiza), ScrollView com `.map` |
| Imagem | `expo-image` (placeholder, cache, `contentFit`, tamanho adequado) | `Image` do RN |
| Controles (Switch, Slider, picker, menu) | Nativos / `@expo/ui` quando houver | Reimplementar em JS |
| Ícones | Material (Android, foco) e SF Symbols (iOS), atrás de um componente `Icon` | Emoji como ícone |
| Toque | `Pressable` com área ≥ 44pt/48dp (`hitSlop` se o visual for menor) | `TouchableOpacity` |
| Plataforma | `process.env.EXPO_OS` | `Platform.OS` espalhado |
| Contexto | `React.use` | `useContext` |

# Texto
- `selectable` em código PIX, endereço, número de pedido e mensagens de erro (usuário precisa copiar).
- `fontVariant: ['tabular-nums']` em preço e contadores; moeda via formatador `Intl` criado **uma vez** fora do render.
- Texto sempre dentro de `<Text>`; nada de `cond && <Text>` com valor falso (use ternário).

# Expo Go x dev build
Comece no Expo Go; **avise o time** quando uma lib exigir dev build (mapas, push no Android, módulos nativos): isso muda o fluxo de teste do fundador e o CI.

# Regras de conclusão (tela só está pronta quando)
- [ ] Todo controle habilitado faz o que promete (nada de handler vazio ou sucesso falso)
- [ ] Formulário não fecha antes de salvar com sucesso; rascunho preservado no erro
- [ ] Testados: caminho principal, uma falha com recuperação, teclado, voltar/dispensar (botão voltar do Android), título longo, imagem ausente, busca sem resultado, fonte 200%
- [ ] 4 estados: carregando, vazio, erro, sem conexão (ver `expo-dados-e-rede`)
- [ ] Relatar no retorno o que foi e o que **não** foi rodado/validado (Android x iOS)

## Fontes e licença
- expo/skills, skill `expo-native-ui` (MIT, LICENSE conferido: Copyright 650 Industries), consultada em 2026-11-22. Adaptado: preferências de biblioteca, safe area/teclado, texto, regras de conclusão. Divergências deliberadas: estilo por ADR-001 e cores por tokens do Webag (a fonte usa cores de plataforma e estilo inline). Descartados: comandos `npx --yes ...@latest` de feedback e de build.
- vercel-labs/agent-skills, `react-native-skills` (MIT), 2026-11-22: navegação nativa, `Pressable`, expo-image.
