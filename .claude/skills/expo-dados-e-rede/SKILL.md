---
name: expo-dados-e-rede
description: Padrões de dados e rede do app Webag para internet instável (TanStack Query com hooks gerados pelo Orval, cache, retry, offline, timeout, idempotência, tokens, estados de tela). Use ao integrar um endpoint, tratar erro de rede ou revisar telas que carregam dados.
---

# Base
Hooks vêm de `packages/shared` (Orval a partir de `openapi.yaml`; ver `contrato-api`). Não escreva tipo de API nem `fetch` solto: use o cliente gerado com um **wrapper único** de HTTP que (a) usa `fetch` do Expo, sem axios, (b) confere `response.ok`, (c) lança `ApiError` tipado a partir de `application/problem+json` (`status`, `code`, `detail`, `errors[]`), (d) trata falha de rede como `NETWORK_ERROR`, (e) anexa `Authorization` e `X-Request-Id`.

# Os 4 estados (todo dado de servidor)
Checar nesta ordem: **hidratando/carregando** (skeleton) -> **erro sem cache** (mensagem + "Tentar de novo") -> **vazio** (explica e oferece ação) -> **conteúdo**. "Carregando" nunca é "vazio". Refresh que falha **mantém os dados antigos** com aviso não bloqueante. `isLoading` para o primeiro spinner, `isFetching` para atividade de fundo. Sem conexão: banner persistente + dados em cache.

# Timeout e retry
| Caso | Regra |
|---|---|
| Timeout de requisição | `AbortSignal.timeout` em todo fetch (~15 s [HIPÓTESE], ajustar com métricas) |
| Query (GET) | `retry: 2`, backoff exponencial com jitter; **não** repetir 4xx (exceto 408/429) |
| Mutação (POST/PUT) | Sem retry automático, **exceto** com `Idempotency-Key` |
| Pedido/pagamento | Gerar `Idempotency-Key` uma vez por intenção (ao abrir o checkout), reutilizar em cada tentativa; botão desabilitado com `isPending` |
| Polling de status | Só como fallback do WebSocket; intervalo crescente; parar em estado final |

# Cache (staleTime por tipo de dado) [HIPÓTESE: calibrar com uso]
| Dado | staleTime | Observação |
|---|---|---|
| Catálogo/lojas/categorias | ~5 min | Refetch ao focar e ao reconectar |
| Horário e aberto/fechado | curto (~1 min) | Mostrar "atualizado há X" se cache |
| Pedido ativo | 0 + WebSocket | Ao reconectar, **refetch via REST** (o cliente sempre recupera o estado) |
| Status de pagamento | 0 | Vem do servidor; app nunca marca pago localmente |
Chaves de query por convenção da lib gerada; invalidar chaves relacionadas ao concluir mutação. Listas por cursor: `useInfiniteQuery` com `nextCursor` (contrato-api).

# Offline
`NetInfo` ligado ao `onlineManager` do TanStack Query; queries pausam offline, mostram cache. Persistência do cache em disco **só** para dados públicos (catálogo, lojas); **nunca** token, endereço completo, dados de pagamento ou PIX. Escrita offline não entra na fila silenciosa: pedido/pagamento exigem conexão, com mensagem clara. Update otimista só para ação reversível e não financeira (favoritar); no erro, reverter o valor.

# Sessão e tokens
Tokens só em `expo-secure-store`. Segurar a UI de rotas protegidas até a sessão restaurar (sem piscar a tela errada na abertura a frio). Refresh com **promessa compartilhada** (single-flight): várias requisições 401 simultâneas geram um único refresh; refresh falhou, limpar sessão e ir ao login. Refresh token rotativo: tratar reuso como logout.

# Ambiente
Só `EXPO_PUBLIC_*` vai ao app e é **público** (inlined no build): nunca segredo, chave privada ou token do Mercado Pago. URL da API por ambiente via `app.config.ts`/EAS env.

# Cancelamento e corrida
O TanStack Query cancela por sinal; em fetch manual use `AbortController` ao desmontar. Digitação em busca: debounce curto + `placeholderData` para não piscar.

# Checklist de integração de endpoint
- [ ] Hook gerado usado; sem tipo manual
- [ ] Os 4 estados + erro por `code` com mensagem (ver `microcopy-e-ux-writing-ptbr`)
- [ ] Retry/timeout conforme tabela; mutação protegida contra duplo toque
- [ ] Teste com RNTL simulando erro, vazio e offline

## Fontes e licença
- expo/skills, skill `expo-data-fetching` (MIT, LICENSE conferido), consultada em 2026-11-22. Adaptado: quatro estados, ApiError, refresh single-flight, SecureStore, variáveis públicas; ligado a Orval, RFC 9457, Idempotency-Key, WebSocket+REST e política de persistência do Webag. Descartado: comando de feedback ao Expo e exemplo de retry manual (usamos o da lib).
