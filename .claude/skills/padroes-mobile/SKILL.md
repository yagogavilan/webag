---
name: padroes-mobile
description: Regras de projeto do app Webag (Expo) e do web (apps/web): stack real, pastas, comandos. Ponto de entrada; o detalhe está nas skills especializadas citadas.
---

# Stack real (ADR-001, DEC-005)
- **`apps/mobile`**: só o app do **cliente** (Android + iOS). Expo SDK 58, React Native 0.88, TypeScript strict, **Expo Router** (grupos `(auth)` e `(customer)`), TanStack Query, React Hook Form + Zod, FlashList, `expo-image`, `expo-secure-store`, `expo-location`, `expo-notifications`. Testes: **Jest (jest-expo) + React Native Testing Library**; E2E com Maestro.
- **`apps/web`**: Next.js 16 (App Router) com lojista em `/lojista` e admin em `/admin`. **Não existe `apps/admin`.** Testes: Vitest + Testing Library; E2E Playwright.
- **Estilo**: sem NativeWind. Mobile = `StyleSheet` + tema tipado de `@webag/tokens/native` (`src/theme`); web = CSS Modules + variáveis `--wb-*` geradas dos tokens. Nenhuma cor/tamanho "mágico" no componente.
- **Cliente da API**: gerado do OpenAPI com **Orval** em `packages/shared` (tipos, Zod, hooks); o app nunca escreve tipo de API à mão. Pacotes `zustand`, `react-native-maps` e Sentry nativo ainda **não** estão no `apps/mobile`: confirmar no ADR antes de adotar.

# Pastas
```
apps/mobile/
  app/             # rotas (Expo Router)
  src/components/  # design system
  src/features/    # por domínio: catalog, cart, checkout, orders, pix, address...
  src/api/         # wrappers sobre o cliente gerado, sessão, query-client
  src/theme/ src/lib/   # tema dos tokens; formatação BRL/datas, máscaras, hooks
  e2e/             # fluxos Maestro (*.yaml)
apps/web/          # app/ (rotas /lojista e /admin), CSS Modules
packages/shared/   # gerado do OpenAPI; packages/tokens/ # tokens de design
```

# Comandos (de `apps/mobile`, ou `pnpm --filter @webag/mobile <script>`)
| Tarefa | Comando |
|---|---|
| Dev / Android / iOS | `pnpm dev` / `pnpm android` / `pnpm ios` |
| Tipos, lint, testes (Jest) | `pnpm typecheck` / `pnpm lint` / `pnpm test` |
| Saúde do projeto Expo / E2E | `pnpm doctor` / `pnpm e2e` |
| Web (`apps/web`) | `pnpm --filter @webag/web dev` (porta 3001), `test` (Vitest), `test:e2e` (Playwright) |
| Regenerar cliente após mudar o contrato | `pnpm generate` (raiz) |

# Onde está o detalhe (não repetir aqui)
- Telas nativas, safe area, teclado, listas, checklist de tela pronta: `expo-ui-nativa`.
- Dados, rede ruim, retry, offline, idempotência, tokens, estados de tela: `expo-dados-e-rede`.
- Performance em Android de entrada: `react-native-performance`.
- Painel web, isolamento entre áreas: `nextjs-react-boas-praticas`.
- Build, perfis, OTA, lojas, credenciais: `eas-build-e-publicacao` (e `publicacao-lojas`).
- Acessibilidade: `acessibilidade-wcag-mobile-web`; design system: `design-system`.

# Regras de projeto (valem sempre)
- Toda tela trata carregando, vazio, erro com "tentar de novo" e sem conexão.
- Pagamento: o app mostra o PIX e acompanha o status pelo servidor; **nunca** marca como pago localmente.
- Token e sessão só em `expo-secure-store`; nada de segredo no app (tudo no app é público); variáveis via `app.config.ts` + EAS env.
- Moeda sempre com `Intl.NumberFormat('pt-BR', { currency: 'BRL' })` sobre valor em centavos; lib em `src/lib/format.ts`.
- CI: `generate:check`, lint, typecheck e testes; `expo-doctor` antes de build.
