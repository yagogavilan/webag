---
name: padroes-mobile
description: Padrões de engenharia do app Webag (React Native + Expo para Android/iOS) e do admin web. Use ao implementar telas, estado, integração com API, builds e publicação técnica.
---

# Stack
- Expo (SDK estável mais recente), TypeScript strict, **Expo Router** (rotas por arquivo, grupos `(customer)`, `(merchant)`, `(auth)`).
- Dados do servidor: **TanStack Query** (cache, retry, refetch on focus/reconnect). Estado local/UI: **Zustand** (pouco). Nada de dado de servidor duplicado em store global.
- Formulários: React Hook Form + Zod (schemas de `packages/shared` quando existirem).
- Estilo: tokens de `docs/design/tokens.json` exportados para um tema; estilização definida em ADR (proposta: NativeWind). Nenhuma cor/tamanho "mágico" no componente.
- Listas: FlashList. Imagens: `expo-image` com cache.
- Mapas/localização: `react-native-maps` + `expo-location`. Push: `expo-notifications`. Segredos/tokens: `expo-secure-store`.
- Erros e performance: Sentry (`sentry-expo`/`@sentry/react-native`).

# Estrutura
```
apps/mobile/
  app/            # rotas (Expo Router)
  src/components/ # componentes do design system
  src/features/   # por domínio: catalog, cart, checkout, orders, store-admin...
  src/api/        # cliente gerado + hooks do TanStack Query
  src/lib/        # utilitários, formatação (moeda BRL, datas)
```

# Regras
- Toda tela: carregando (skeleton), vazio, erro com ação de tentar de novo, sem conexão.
- Rede ruim é o padrão: timeouts razoáveis, retry com backoff, botões de ação desabilitados durante envio (evita pedido duplo) + `Idempotency-Key`.
- Pagamento: o app mostra QR/código PIX e acompanha o status pelo servidor (WebSocket/polling). Nunca marca como pago localmente.
- Permissões pedidas no momento do uso, com tela explicativa antes; tratar "negado" e "negado para sempre" (abrir configurações).
- Acessibilidade: labels, roles, alvo ≥ 44pt/48dp, contraste AA, fonte dinâmica sem quebrar layout.
- Android: botão voltar, edge-to-edge/safe areas, teclado (`KeyboardAvoidingView`), aparelhos de 2–3 GB de RAM. iOS: safe areas, gestos de voltar.
- Formatação: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

# Qualidade
- Jest + React Native Testing Library (comportamento, não implementação).
- Maestro para E2E dos fluxos críticos (`apps/mobile/e2e/`).
- `expo-doctor`, lint, typecheck e testes no CI.

# Build e entrega
- EAS Build com perfis `development`, `preview` (testers internos) e `production`. EAS Submit para as lojas. EAS Update (OTA) só para correções JS sem mudança nativa, com canal por ambiente.
- Variáveis por ambiente via `app.config.ts` + EAS env; nada sensível embutido no app (tudo no app é público).
- Versionamento: `version` semântica + `buildNumber`/`versionCode` incrementais automáticos.
