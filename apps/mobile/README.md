# @webag/mobile

App do cliente (Expo SDK 58, React Native 0.88, Expo Router, TypeScript strict). Lojista e admin são web (`apps/web`, DEC-005).

## Rodar

```bash
pnpm --filter @webag/mobile dev          # Metro; abra no Expo Go ou em dev build
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 pnpm --filter @webag/mobile android   # emulador Android: localhost é o próprio emulador
```

Variáveis (todas públicas, embutidas no app): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPPORT_WHATSAPP` (opcional, só dígitos com DDI). Ver `infra/env.example`.

## Verificar

```bash
pnpm --filter @webag/mobile lint typecheck test build   # build = expo export (Android + iOS)
maestro test apps/mobile/e2e                            # E2E: precisa de aparelho/emulador e API com seed
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `app/` | Rotas (Expo Router): `(customer)` início, `(auth)` entrar/criar conta/esqueci a senha/código, `address/`, `legal/` |
| `src/theme` | Único acesso aos tokens (`@webag/tokens`); cor ou espaço solto é bug |
| `src/components` | Design system: Button, TextField, PasswordField, OtpInput, Banner, Skeleton, estados vazio/erro/offline... |
| `src/api` | Saída HTTP única (`request`): Bearer, refresh rotativo single-flight, retry com backoff, `Idempotency-Key`, erros RFC 9457; sessão só em `expo-secure-store` |
| `src/features` | `auth` (formulários, código por e-mail), `address` (CEP, localização, endereços) |
| `src/i18n` | Textos pt-BR |

## Decisões de implementação

- Testes com Jest (`jest-expo`) + React Native Testing Library, não Vitest: o preset do Expo/Metro roda em Jest e o Vitest não transforma React Native sem gambiarras.
- Ícones Phosphor importados por arquivo (`src/components/icons.ts`): a biblioteca inteira tem 1.500 ícones e o Metro não faz tree-shaking.
- Medidor de senha local e leve (sem zxcvbn, que pesa no Android de entrada); quem decide é o servidor.
- Endereços ficam no aparelho até o contrato ter `/v1/me/addresses`.
