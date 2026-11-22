---
name: nextjs-react-boas-praticas
description: Boas práticas de performance e arquitetura React/Next.js (App Router) para o apps/web do Webag (áreas /lojista e /admin), priorizadas por impacto, com regras de isolamento entre áreas. Use ao implementar ou revisar páginas, tabelas, formulários e componentes do painel.
---

# Contexto Webag
`apps/web`: Next.js 16.4 (App Router) + React 19.3.0, **CSS Modules com variáveis `--wb-*`** (ADR-001), duas áreas no mesmo app (DEC-005), origens/subdomínios separados por segurança (DEC-018). Telas densas: tabelas, filtros, formulários, painel de pedidos em tempo real. Autorização real é da API (ADR-003); a guarda do web só evita renderizar a área errada. Detalhes de cache mudam entre versões do Next: **confirme na documentação da versão fixada** antes de aplicar regra de cache [HIPÓTESE sobre compatibilidade das regras abaixo com a 16.4].

# Prioridades (do maior impacto ao menor)
**1. Eliminar cascatas (crítico)**
- Trabalho independente em paralelo (`Promise.all`); `await` só dentro do ramo que usa o valor; iniciar a promessa cedo e esperar tarde.
- `Suspense` para transmitir a parte lenta (ex.: gráfico de vendas) sem travar o resto da página.

**2. Tamanho do bundle (crítico)**
- Sem barrel imports de pacotes grandes; `dynamic()` para o pesado e raro (gráficos, editor de imagem/recorte, exportação CSV, tela do Card Payment Brick do Mercado Pago só na rota que precisa).
- Scripts de terceiros (Sentry, analytics) depois da hidratação. Pré-carregar no hover/foco de links previsíveis.

**3. Servidor (alto)**
- **Server Action é endpoint público:** autentique e autorize como em qualquer rota da API; valide entrada com Zod (`packages/shared`); nunca confie em campo vindo do cliente (loja, papel, preço).
- Passe ao Client Component **só o mínimo** (campos usados, não o objeto do banco/API inteiro). Regra de isolamento: dado de `/admin` nunca entra em componente ou bundle de `/lojista`, e vice-versa.
- Deduplicar leitura na requisição com `React.cache`; trabalho que não bloqueia a resposta (log, métrica) depois da resposta.

**4. Dados no cliente (médio-alto)**
Dados do servidor com a camada gerada (hooks Orval/TanStack Query), não `useEffect`+`fetch`. Dados em tempo real (pedido novo): WebSocket com reconexão e refetch via REST ao reconectar. Listeners globais dedupados; `localStorage` versionado e **sem dado pessoal ou token**.

**5. Re-render (médio)**
Estado derivado calculado no render, não em efeito; dependências de efeito primitivas; `setState` funcional; `startTransition`/`useDeferredValue` para filtro e busca em tabela; sem componente definido dentro de componente; assine só o estado usado.

**6. Renderização (médio)**
Hoistar JSX estático; ternário em vez de `cond && <X/>` quando o valor pode ser `0`; `content-visibility` e virtualização em listas/tabelas com mais de ~50 linhas; `next/image` com `width`/`height` e `sizes` (usar variantes de imagem do ADR-005).

**7. JavaScript (baixo)**
`Map`/`Set` para lookup; um laço em vez de várias passadas; retorno antecipado; regex e `Intl` criados uma vez; `toSorted` para não mutar.

# Específico do painel
- Filtro, ordenação, página e aba **na URL** (`searchParams`): link compartilhável, voltar funciona.
- Tabelas: paginação por cursor da API; cabeçalho fixo; truncar texto longo; estado vazio, erro e carregando em toda tabela.
- Formulários: React Hook Form + Zod; erro inline, foco no primeiro erro, botão com estado de envio; ação financeira ou destrutiva com confirmação nomeada e `Idempotency-Key`.
- Acessibilidade web e foco: ver `acessibilidade-wcag-mobile-web`. Estilo: variáveis `--wb-*`, sem cor solta.
- Alerta de pedido novo do lojista: som + indicador visual; a aba em segundo plano não pode perder o evento (refetch ao voltar).
- Pedir `typecheck`, `lint` e teste de componentes com regra (Vitest + Testing Library); fluxos no Playwright (ADR-006).

# Checklist de PR (web)
- [ ] Sem cascata de `await` independentes
- [ ] Nenhum import pesado no caminho inicial
- [ ] Server Actions autenticam, autorizam e validam
- [ ] Props de Client Components mínimas; sem vazamento entre áreas
- [ ] 4 estados e URL como fonte do filtro

## Fontes e licença
- vercel-labs/agent-skills, skill `react-best-practices` (MIT, indicado no frontmatter e na página do repositório; arquivo LICENSE bruto não pôde ser baixado), consultada em 2026-11-22. Adaptado: as 8 categorias de regras reescritas e priorizadas para o painel Webag; adicionadas regras de isolamento entre áreas, Server Actions e URL como estado. Não copiadas as ~70 regras individuais.
