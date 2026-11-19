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

## Pagamento e tempo real (Onda 4 e 5)
| Variável | Uso |
|---|---|
| `EXPO_PUBLIC_API_URL` | API REST e canal Socket.IO `/rt` (mesma origem) |
| `EXPO_PUBLIC_PAYMENT_MODE` | `fake` (padrão fora de produção): cartões de teste com token `fake_tok_*`; `mercadopago`: cartão exige a página segura do Mercado Pago (pendência 9 em `docs/arquitetura/pendencias-contrato-mobile.md`; hoje indisponível, só PIX) |
| `EAS_PROJECT_ID` | Necessário para o token de push (`expo-notifications`); sem ele o registro falha em silêncio |

Código nativo novo desta entrega (exige **development build**, não roda no Expo Go): `expo-notifications` (push), `expo-image-picker` (foto do defeito), `react-native-webview` (3DS). Ícone, splash e ícone adaptativo: `pnpm --filter @webag/mobile assets` (símbolo v4a + cor de marca do tema).
