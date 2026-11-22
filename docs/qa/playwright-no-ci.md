# Playwright do painel no CI (DT-095, R-50)

> Autor: mobile-dev. Data: 2026-11-22. Workflow: `.github/workflows/ci.yml`, job `e2e-web`.

## O que roda

`apps/web/e2e/*.e2e.ts` (lojista e admin, 76 casos + 3 de captura que só rodam com `CAPTURE_V3=1`) contra a API falsa (`e2e/fake-api/server.mjs`), em **build de produção** (`next build` + `next start`, para a CSP com nonce valer) e Chrome em 1 worker. Inclui os casos de celular que pegam a família do BUG-043/048: `lojista-produtos-mobile` (3 produtos na 1ª tela), `lojista-rascunhos-mobile` (nome legível, alvo de 44 px) e `lojista-precos-mobile` (WB-377).

## Por que job separado (e não um passo no `checks`)

| Motivo | Detalhe |
|---|---|
| Recurso | O `checks` já sobe Postgres e Redis, faz 2 `docker build` e tem teto de 30 min; o Playwright não usa serviço nenhum e só precisa do web |
| Disco | Instala só `@webag/web...` (`pnpm install --filter`), sem API, mobile nem Docker; o build do web fica em ~650 MB (`.next`); **nenhum browser é baixado**: usa o Google Chrome que já vem no runner (`PW_CHANNEL=chrome`, o mesmo do QA local) |
| Tempo | Roda em paralelo ao `checks`; o `next build` é um só (o `checks` faz o do `pnpm build` à parte) |
| Diagnóstico | Falha de painel aparece sozinha, sem esconder lint nem typecheck; relatório HTML só sobe se falhar (3 dias) |
| Trace | `--trace off` (o trace é o maior arquivo); o relatório sem trace basta para ver o passo que quebrou |

## Orçamento

| Etapa | Medido local (2026-11-22, cache quente) | Estimado no runner `[HIPÓTESE]` |
|---|---|---|
| 76 casos, 1 worker, Chrome | 2,5 min | 3 a 4 min |
| `next build` | ~1 min (cache) | 2 a 3 min a frio; menos com `actions/cache` de `.next/cache` |
| Install filtrado + build de shared e tokens | n/a | 1 a 2 min |
| **Total** | | **~6 a 9 min**; teto do job 20 min |

Regra do DT-095: se passar de **10 min por PR** de forma estável, vira job noturno (`schedule`) e o PR roda só os casos `*-mobile` e `login`. `retries: 1` no CI cobre o flaky isolado (R-48); flaky recorrente vira bug, não mais retry.

## Pendências (dependem de gente, não de código)

- **Primeira execução no Actions ainda não foi vista**: este ambiente não roda o runner. Confirmar verde na aba Actions do HEAD antes de contar o DT-095 como fechado (o CI não é visível ao CEO, R-49).
- Tornar `e2e-web` **status obrigatório** na proteção do `main` (tech-lead ou fundador; é configuração do GitHub).
- Se o Chrome do runner mudar de forma que o Playwright 1.65 não aceite, trocar por `pnpm exec playwright install --with-deps chromium` (+ cache de `~/.cache/ms-playwright`): custa ~1 min e ~400 MB.
- `apps/web/playwright.tmp.config.ts` está versionado com caminho fixo de Chromium da sandbox (`/opt/pw-browsers/...`): sobra de ambiente local, não é usado pelo CI; remover (o `rm` pode exigir autorização).
- A API falsa ganhou `GET products/table`, reajuste em massa com prévia/`expectedVersions`/`Idempotency-Key`, `undo` e `productVersion` no ajuste de estoque: ela **não valida o contrato** (isso é do e2e da API); só serve ao fluxo da tela.
