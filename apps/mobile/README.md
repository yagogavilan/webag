# @webag/mobile

App do cliente (Expo SDK 58, React Native 0.88, Expo Router, TypeScript strict). Lojista e admin são web (`apps/web`, DEC-005).

## Rodar

```bash
pnpm --filter @webag/mobile dev          # Metro; abra no Expo Go ou em dev build
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 pnpm --filter @webag/mobile android   # emulador Android: localhost é o próprio emulador
pnpm --filter @webag/mobile web          # navegador (ou `pnpm web` na raiz): http://localhost:8081, contra a API local
```

**No navegador (DEC-058, `react-native-web`):** é um terceiro alvo para desenvolvimento e demonstração, não para produção. A sessão fica só na memória da aba (`src/lib/secure-store.web.ts`: sem localStorage; recarregar sai da conta), não há push nem localização do aparelho. SVG decorativo usa `src/lib/a11y.ts` (a web não aceita `accessibilityElementsHidden`/`importantForAccessibility` no `react-native-svg`; era o erro do DT-067 que cobria a tela). Fumaça com Chromium: `pnpm web:smoke` na raiz (usa o Playwright de `apps/web`; cidade, login, loja, produto e sacola). O CORS da API já libera `localhost:8081`. Builds nativos e `expo export` não mudam.

Compra de ponta a ponta no navegador (U8.1): com a API (`pnpm dev`), o app web (`pnpm web`) e o site (`apps/web`, porta 3001) no ar, `pnpm web:compra [entrega-pix|retirada-pix|cartao]` na raiz (usa o Playwright de `apps/web`, sem instalar nada global) percorre cadastro ou login, loja, produto, Sacola, Checkout, pagamento simulado, Pedido confirmado e acompanhamento, e salva as capturas em `docs/qa/relatorios/compra-e2e/`. Resultado de 2026-11-19: `docs/qa/relatorios/compra-e2e/README.md`.

Checkout: não há variável que o desligue. `isCheckoutEnabled()` (`src/features/checkout/config.ts`) é `true` em desenvolvimento, staging e produção (DEC-043); a Sacola abre `/checkout` com `router.push` (U8.1). O que muda por ambiente é só o provedor: `EXPO_PUBLIC_PAYMENT_MODE=fake` (padrão fora de produção) ou `mercadopago` (sempre em produção).

Variáveis (todas públicas, embutidas no app): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_PAYMENT_MODE`, `EXPO_PUBLIC_MP_PUBLIC_KEY`, `EXPO_PUBLIC_SUPPORT_WHATSAPP` (opcional, só dígitos com DDI). Ver `infra/env.example`. Os scripts `dev`, `android` e `ios` leem o `.env` **da raiz do repositório** (o Expo, sozinho, só leria um `.env` dentro de `apps/mobile`); depois de mudar uma variável, reinicie o Metro com `--clear` se o valor antigo persistir. No celular físico use o IP da máquina em vez de `localhost` (API e site público). Para concluir um pedido PIX em desenvolvimento: o botão "Simular pagamento" da tela do PIX (só com `EXPO_PUBLIC_PAYMENT_MODE` diferente de `mercadopago` e `EXPO_PUBLIC_APP_ENV` diferente de `production`; nunca existe no build de loja, DT-065) chama `POST /v1/dev/orders/{id}/payment/approve`, rota que a API ainda precisa expor (`docs/gestao/fila-mobile.md`); até lá use `pnpm pagar` na raiz.

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
| `EXPO_PUBLIC_WEB_URL` | Site público do Webag (`WEB_PUBLIC_URL`): o cartão abre `<url>/pagar/cartao?i=<token>` no navegador do sistema (o app não vê o cartão). Padrão `http://localhost:3001`; em staging e produção, o domínio real |
| `EAS_PROJECT_ID` | Necessário para o token de push (`expo-notifications`); sem ele o registro falha em silêncio |

Código nativo novo desta entrega (exige **development build**, não roda no Expo Go): `expo-notifications` (push), `expo-image-picker` (foto do defeito), `react-native-webview` (3DS). Ícone, splash e ícone adaptativo: `pnpm --filter @webag/mobile assets` (símbolo v4a + cor de marca do tema).
