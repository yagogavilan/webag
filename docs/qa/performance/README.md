# Desempenho do app do cliente: como medir e o que o método NÃO prova

Dono: `mobile-dev` | Criado: 2026-11-22 | Resultados: [app-2026-11-22.md](app-2026-11-22.md) | Pedidos ao backend: [pedidos-ao-backend.md](pedidos-ao-backend.md)

## Como rodar
```
pnpm perf:app --label depois                         # compila (expo export -p web), serve com brotli/gzip + cache imutável e mede 3 rodadas
pnpm perf:app --label depois --dist <pasta>          # mede um export que já existe
pnpm perf:app --label dev --url http://localhost:8081  # mede um servidor que já está no ar (ex.: Metro de desenvolvimento)
pnpm perf:app --profile product --dist <pasta>       # CPU por função em um passo (use um export com `expo export -p web --no-minify`)
pnpm perf:app --report docs/qa/performance/app-<data>-antes.json docs/qa/performance/app-<data>-depois.json   # tabela antes x depois
```
Gera `docs/qa/performance/app-<data>-<label>.json`. Testes do medidor: `node --test scripts/perf-app.test.mjs scripts/perf/static-server.test.mjs`.

## O que o medidor faz
| Item | Valor |
|---|---|
| Navegador | Chromium (Playwright) com emulação de iPhone 17 Pro (402x874, fator 3, toque, user-agent iOS) |
| CPU | 4x mais lenta (`Emulation.setCPUThrottlingRate`), aproxima Android de entrada [HIPÓTESE] |
| Rede | CDP `Network.emulateNetworkConditions`. Padrão **4G lento** = 1,6 Mbps, RTT 150 ms (Lighthouse/DevTools Slow 4G); `--net rapido` = 9 Mbps, RTT 60 ms |
| API | Falsa (`scripts/perf/fake-api.mjs`): dados determinísticos no formato do contrato, 60 ms de servidor por chamada, fotos WebP geradas (120/400/800 px, ≈ 5/25/70 KB). Assim o número depende do app, não do servidor real |
| Fluxo | Abertura a frio > cidade > Início > Loja > Produto > adicionar > Sacola > Checkout > PIX > pedido confirmado > acompanhamento; mais a reabertura (endereço salvo, cache HTTP quente) e a rolagem do Início |
| Métricas | Tempo do toque até o conteúdo (relógio dentro da página), 1º feedback visual ao toque, FCP, LCP, TBT (tarefas longas > 50 ms), INP aproximado (maior evento de toque), nº de requisições, bytes transferidos por tipo (JS, imagem, API, fonte) |
| Toque | 80 ms entre encostar e soltar (`--tap`), como um dedo de verdade; importa para o prefetch por intenção |
| Estatística | Mediana de 3 rodadas, cada uma em contexto novo (cache frio); as rodadas ficam no JSON |
| Servidor do app | `scripts/perf/static-server.mjs`: brotli/gzip, `Cache-Control: immutable` nos arquivos com hash, ETag no HTML |

## Metas (hipóteses do fundador; ajustar com dado de aparelho real)
| Métrica | Meta |
|---|---|
| Resposta visível ao toque | ≤ 100 ms (skeleton ou dado em cache) |
| Dado de tela em cache / pela rede em 4G | ≤ 300 ms / ≤ 1 s p95 |
| 1ª tela útil em 4G | ≤ 2,5 s |
| Miniatura de lista | ≤ 30 KB, WebP/AVIF no tamanho certo, com placeholder |
| Cascata de requisições | nenhuma que dê para evitar |
| Lista | virtualizada (FlashList), sem queda de quadros |

## O que NÃO dá para medir aqui (e quem mede)
| Limite | Por quê importa | Quem/como |
|---|---|---|
| Aparelho real (Android de entrada 2-3 GB, iPhone) | CPU, memória, GPU e térmica reais; a CPU 4x do Chromium é só uma régua relativa | Fundador/QA com o build de release no aparelho mais fraco; registrar aqui |
| Hermes e o app nativo (release) | O app nativo roda bytecode Hermes lido do disco: não há download de JS, a abertura depende de carregar/avaliar o bundle, ler AsyncStorage/SecureStore e do tempo da 1ª resposta da API. O medidor mede o app **web** (react-native-web, DOM), então vale para o Safari do iPhone e como régua relativa de peso de JS, não como número absoluto do nativo | Perfil de release com Sentry Performance/Hermes profiler (Sentry nativo ainda não instalado) |
| Animações na thread de UI (Reanimated) e rolagem nativa | No web elas rodam no DOM; "quadros > 50 ms" aqui é indicativo | Profiler do React DevTools + Android Studio profiler |
| Imagens reais da API (peso por variante) | As fotos da API falsa são geradas | Amostrar as URLs do seed/staging e conferir bytes (pedido 4 ao backend) |
| Rede de operadora e servidor reais | RTT variável, perda de pacote, servidor carregado | k6 em staging (`docs/qa/plano-carga.md`); piloto com telemetria |
| Consumo de dados e bateria | Não instrumentado | Piloto |

Números absolutos dependem da máquina que roda o medidor; **compare sempre antes e depois na mesma máquina, na mesma sessão** (foi o que o relatório fez).
