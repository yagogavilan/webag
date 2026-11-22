---
name: react-native-performance
description: Checklist de performance do app Webag em Android de entrada (listas com FlashList, re-render, imagens, estado, animação, bundle, medição em build de release). Use ao implementar listas e telas pesadas, ao investigar travamento ou antes de fechar uma tela de catálogo.
---

# Método: medir, hipótese, corrigir, medir
Sem medida, sem otimização. Meça em **build de release** no aparelho mais fraco que o fundador/QA tiver (2 a 3 GB de RAM), nunca só em dev/emulador. Ferramentas: Profiler do React DevTools (quem re-renderizou e por quê), Sentry Performance (`@sentry/react-native`), perfilador do Hermes, Android Studio profiler. Registre antes/depois no PR.

# Orçamentos [HIPÓTESE: validar em aparelho real]
Abertura a frio até a home interativa ≤ ~3 s; rolagem sem queda visível de quadros na lista de lojas e produtos; toque responde em < 100 ms; sem pico de memória que mate o app em segundo plano. Os números finais saem da primeira medição e viram critério no QA.

# Listas (impacto crítico)
| Regra | Como |
|---|---|
| Virtualizar | FlashList 2 para lojas, produtos, pedidos; nunca `ScrollView` + `.map` |
| Item barato | Componente do item memoizado (`memo`); dados já prontos (formate preço fora do item ou memoize) |
| Referências estáveis | `renderItem`/callbacks fora do render ou com `useCallback`; sem objeto/array de estilo inline que mude a cada render |
| Item pesado | Nada de `Intl`, regex ou cálculo caro por item; hoistar formatadores |
| Heterogêneas | Informar tipo do item (`getItemType`) para reciclar certo (loja, banner, cabeçalho de seção) |
| Chave estável | ID do servidor, nunca índice |
| Imagem na lista | Miniatura do tamanho exibido, não a original |

# Imagens
`expo-image` com `contentFit`, `placeholder` (thumbhash) e cache em disco; escolher a variante WebP certa (160/400/800/1600 px, ADR-005) em vez de redimensionar no aparelho: 160 a 400 em lista, 800 no detalhe; prioridade só no que está na tela; evitar imagem grande em lista e em carrossel. Foto de produto/loja é o maior consumo de dados e memória.

# Estado e re-render
- Assine só o pedaço do estado que a tela usa (seletores no Zustand); não guarde dado de servidor em store (TanStack Query cuida).
- Derive durante o render em vez de `useEffect` + `setState`. Dependências de efeito primitivas. Não defina componente dentro de componente.
- Trabalho caro e não urgente: `useDeferredValue`/`startTransition` (busca por digitação).
- Contexto que muda muito (ex.: relógio do PIX) isolado num componente pequeno, não na tela inteira.
- Se o React Compiler estiver habilitado (confirmar no ADR), siga suas regras (desestruturar funções, atenção a shared values do Reanimated) e não memoize por reflexo.

# Animação
Só `transform` e `opacity`, na thread de UI (ver `movimento-e-microinteracoes`); `Gesture.Tap` quando a latência do `Pressable` importar; sem `setState` por quadro.

# Bundle, inicialização e dependências
- Sem barrel imports de bibliotecas grandes; importe o que usa. Carregamento tardio de telas raras (rotas do Expo Router já dividem por arquivo).
- Splash até a sessão restaurar; não bloquear a abertura com requisição desnecessária; analytics e Sentry depois do primeiro render quando possível.
- Hermes é o padrão: mantenha o bytecode; evite polyfills pesados e JSON enorme no bundle.
- Monorepo: dependências nativas declaradas em `apps/mobile`; **uma versão** de cada pacote no workspace (ADR-001: uma versão de React).
- Cada lib nativa nova pesa no APK e exige dev build: justifique no PR.

# Diagnóstico rápido
| Sintoma | Causa provável | Ação |
|---|---|---|
| Rolagem trava | Item pesado ou imagem grande | Profiler; miniatura; memo |
| Tela toda re-renderiza ao digitar | Estado alto demais ou contexto largo | Descer o estado; seletor |
| App morre em segundo plano | Memória (imagens, listas não virtualizadas) | Reduzir resolução; virtualizar |
| Abertura lenta | Trabalho síncrono no boot, bundle grande | Adiar, dividir, medir |

## Fontes e licença
- vercel-labs/agent-skills, skill `react-native-skills` (MIT; MIT também no repositório), consultada em 2026-11-22. Adaptado: prioridades (listas, animação, navegação, estado, renderização, monorepo, configuração) reescritas para FlashList 2, expo-image e Android de entrada; orçamentos e tabela de diagnóstico próprios.
