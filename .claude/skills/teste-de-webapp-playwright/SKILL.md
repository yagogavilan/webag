---
name: teste-de-webapp-playwright
description: Boas práticas para escrever e depurar testes E2E de web com Playwright no Webag (apps/web: painel do lojista, admin, páginas públicas): seletores estáveis, espera por condição, isolamento de dados, login reutilizado, rede ruim e acessibilidade. Use ao criar, revisar ou consertar um teste Playwright ou ao investigar flakiness de E2E web.
---

# Teste de web com Playwright (apps/web/e2e)

Escopo: só fluxos críticos (ADR-006, `docs/qa/estrategia.md`: E2E de UI é ~5% dos casos). Regra de negócio fica em unitário/integração, não aqui.

## 1. Reconhecer antes de agir
Com a stack no ar (`docker compose`, `PAYMENT_PROVIDER=fake`): abra a tela, espere a página **estar pronta** (elemento-chave visível, não tempo fixo), capture imagem/DOM e só então escolha os localizadores. Gere candidatos com o `codegen` do Playwright e **troque** os frágeis pelos da seção 2. Não escreva teste de tela que você não viu renderizada.

## 2. Seletores (do mais ao menos estável)
1. `getByRole('button', { name: 'Aceitar pedido' })`: espelha o usuário e cobra acessibilidade.
2. `getByLabel`, `getByPlaceholder`, `getByText` (texto visível estável).
3. `getByTestId` (`data-testid`) quando não há rótulo acessível (ex.: linha de tabela repetida).
4. Evitar: CSS por classe de CSS Modules (muda a cada build), XPath, índice `nth()` sem filtro. Encadeie/filtre dentro da região (`locator('tr').filter({ hasText: pedido })`).
Texto de interface é pt-BR; use o texto exato da tela ou um padrão regex, nunca traduzir.

## 3. Espera e asserção
- **Asserções web-first** (`await expect(locator).toBeVisible()`, `toHaveText`, `toHaveURL`): esperam e repetem sozinhas.
- Proibido `waitForTimeout`/sleep. Espere por **condição**: elemento, URL, resposta específica (`waitForResponse` da rota). `networkidle` é frágil com WebSocket/polling; use só como último recurso.
- Não use `isVisible()`/`textContent()` como asserção (retornam na hora, sem esperar).
- `await` em tudo; ESLint `no-floating-promises` ligado. Use `expect.soft` quando quiser listar várias falhas de uma tela.

## 4. Isolamento e dados
- Cada teste cria o que precisa por **builders/API** (loja, produto, pedido) com nome único (sufixo aleatório) e não depende de ordem nem de seed compartilhado (ADR-006).
- **Login uma vez** em projeto de setup que grava `storageState` por papel (lojista, admin); admin exige TOTP: use o segredo de teste do ambiente, nunca o de produção. Teste de login/permissão roda sem `storageState`.
- Terceiros: Mercado Pago é o provedor `fake`; geocodificador, e-mail (Mailpit) e push ficam locais. Não chame serviço externo real.
- Hora: se a regra depende do relógio (horário da loja em `America/Sao_Paulo`), controle com `page.clock` ou dado, não com `now()` do dia.

## 5. O que o Webag exige além do caminho feliz
- Viewport de celular de entrada (360x640) e desktop; rede lenta/offline (`context.setOffline`, throttling) onde o PRD pede estado de erro.
- Autorização: rota de outro lojista e de admin com papel errado retorna 403/redirect, na UI e na API.
- Acessibilidade: varredura com axe-core por tela principal (WCAG 2.2 AA, ver `docs/qa/estrategia.md`).
- Estados vazio, carregando e erro de cada lista. Toque duplo em "Aceitar"/"Pagar": uma só ação.

## 6. Depurar e manter
- CI: `trace: 'on-first-retry'`, 1 retry, relatório e traces como artefato; localmente `--debug` ou UI Mode. Trace é a evidência a anexar ao bug.
- Flaky: reproduza 10 vezes (`--repeat-each`), ache a causa (espera, dado compartilhado, relógio) e conserte; se não der no dia, quarentena com issue e prazo (ADR-006). Nunca "aumentar timeout" como correção.
- Um teste = um fluxo com um objetivo; page objects só se três testes repetem a mesma tela.

## Fontes e licença
- anthropics/skills, `skills/webapp-testing` (Apache-2.0, Anthropic), consultada em 2026-11-22. Adaptado: "reconhecer antes de agir", seletores descritivos, espera por condição. **Descartado:** o script auxiliar `with_server.py` e a orientação de não ler o código dele; aqui o servidor sobe pelo `docker compose` do projeto.
- microsoft/playwright, `docs/src/best-practices-js.md` (Apache-2.0), consultada em 2026-11-22. Adaptado: localizadores, asserções web-first, isolamento, trace.
- Itens do Webag (papéis, TOTP, `fake`, estratégia de QA) escritos pelo autor.
