# @webag/tokens

Fonte unica de design do Webag. Regras de uso: `docs/design/design-system.md`. Racional da marca: `docs/design/identidade.md`.

| Arquivo | Papel |
|---|---|
| `tokens.json` | Fonte. Editar so aqui. Referencias entre tokens: `{color.brand.600}` |
| `src/tokens.ts` | Saida TS tipada (`as const`) para app e web. Gerada |
| `src/native.ts` | Adaptadores React Native (estilos de texto por peso, sombras, hitSlop). Manual, deriva dos tokens |
| `css/tokens.css` | Saida CSS variables `--wb-*` + classes `.wb-text-*` + `.wb-focus-ring`. Gerada |
| `a11y/contrast-pairs.json` | Pares de contraste que a CI verifica (WCAG 2.2 AA) |
| `scripts/` | `build.mjs` (gera saidas), `check-contrast.mjs` (verifica contraste) |

## Comandos

```bash
pnpm --filter @webag/tokens build   # regera src/tokens.ts e css/tokens.css
pnpm --filter @webag/tokens check   # falha se algum par de contraste ficar abaixo do minimo
```

A CI deve rodar `build` seguido de `git diff --exit-code packages/tokens` e `check`.
Nota: na versao 0.1.0 as saidas geradas foram escritas manualmente (sem shell na sessao de design); o primeiro `build` pode reformatar o arquivo, sem mudar valores. Se mudar valor, ha erro de transcricao: o `tokens.json` manda.

## Expo (apps/mobile)

```bash
npx expo install expo-font @expo-google-fonts/figtree expo-haptics
```

```ts
import { useFonts, Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { tokens } from '@webag/tokens';
import { textStyles, shadows, hitSlopFor } from '@webag/tokens/native';
```

- Carregar somente os 3 pesos acima. Manter a tela de splash ate as fontes carregarem (ou cair na fonte do sistema apos 2 s).
- Nunca usar `fontWeight` junto com a fonte customizada; usar `textStyles.*` (que ja escolhe a familia por peso).
- Aplicar `maxFontSizeMultiplier` (exportado em `@webag/tokens/native`) nos textos; nao usar altura fixa em contêineres de texto.
- Metro resolve o TypeScript do workspace direto; nenhum build do pacote e necessario.

## Next.js (apps/web)

```ts
// next.config.ts
export default { transpilePackages: ['@webag/tokens'] };
```

```tsx
// app/layout.tsx
import '@webag/tokens/css';
import { Figtree } from 'next/font/google';
const figtree = Figtree({ subsets: ['latin'], display: 'swap', weight: ['400', '600', '700'] });
// <html className={figtree.className}> -- fonte auto-hospedada (sem requisicao ao Google em runtime)
```

Usar as variaveis (`var(--wb-color-action-primary)`) ou as classes `.wb-text-*`. Nao escrever hex nem px solto em componentes.
Se o projeto adotar Tailwind, mapear `theme` para as variaveis `--wb-*` (decisao do `mobile-dev`).
