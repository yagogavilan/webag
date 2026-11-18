# ADR-004: Tempo real (status de pedido, novos pedidos, trocas)

- **Status:** Aceita
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** backend-dev, mobile-dev, security-engineer

Legenda de fontes: ver ADR-001.

## Contexto
Cliente acompanha o pedido em tempo real (linha do tempo + push). Lojista recebe pedido novo com alerta sonoro no painel web. PIX precisa refletir "pago" em segundos. Rede do cliente é 3G instável. Todo fluxo de tempo real é **servidor → cliente**; mutações já são REST.

## Opções consideradas
| Opção | Prós | Contras | Custo/complexidade |
|---|---|---|---|
| **A. Socket.IO 4.8 (gateway Nest) + Redis adapter** | Reconexão e fallback para long-polling prontos; salas; cliente RN funciona sem polyfill; gateway Nest first-party [V] | Protocolo próprio; com >1 instância e polling exige sticky session | Baixo |
| B. SSE (Server-Sent Events) | HTTP puro, `Last-Event-ID`, simples | RN não tem `EventSource` nativo (precisa polyfill); uma conexão por stream; auth por cookie/query | Baixo |
| C. Só polling | Trivial | Atraso e consumo de dados/bateria; pior percepção | Muito baixo |
| D. SaaS (Pusher, Ably) | Escala gerenciada | Custo mensal; dado fora | Baixo + custo |
| E. WebSocket cru (`ws`) | Leve | Reimplementar reconexão, salas, fan-out | Médio |

## Decisão
**Opção A**, com o socket tratado como **aviso**, nunca como fonte da verdade.

- Namespace único `/rt`. Autenticação no handshake: mobile em `auth.token` (access JWT); web por cookie. Token expirado → servidor desconecta com motivo `token_expired`, cliente renova e reconecta.
- Salas definidas **pelo servidor** a partir do banco: `user:{id}`, `store:{id}` (membros com permissão `orders:read`), `admin:ops`. Para `order:{id}` o cliente pede `subscribe`; o servidor só aceita se o pedido for do usuário ou da loja dele.
- Eventos mínimos e versionados: `{ type: 'order.status_changed', orderId, status, version, occurredAt }`, `order.created`, `payment.status_changed`, `exchange.status_changed`. O cliente invalida/atualiza o cache do TanStack Query e, se faltar algo, busca via REST.
- Emissão **depois do commit** (evento de domínio → gateway). Perdeu evento? O cliente recupera: refetch ao reconectar, ao voltar ao foreground e polling de 15 s nas telas críticas (acompanhamento de pedido e PIX) enquanto o socket estiver desconectado.
- Push (app em segundo plano): Expo Push Service via `expo-server-sdk` em job BullMQ, com leitura de recibos e remoção de token `DeviceNotRegistered`. Credenciais FCM v1 e APNs ficam no EAS (dependem do fundador; gratuito).
- Painel do lojista: navegadores bloqueiam áudio sem gesto do usuário; o painel exige um clique em "Ativar alerta sonoro" por sessão e marca o título da aba com contador. Web Push fica para a fase 2.
- Escala: uma instância na 1.0. Com mais de uma, ativar sticky session no balanceador (exigência do Socket.IO com polling) — o Redis adapter já fica configurado.

## Consequências
- Positivas: experiência "ao vivo" sem custo extra; correção não depende do socket.
- Negativas / dívida: sticky session ao escalar; eventos best-effort (sem outbox) — aceitável porque o estado sempre é recuperável por REST (DT-004).
- Reavaliar se: app do entregador (fase 2) precisar de localização contínua (alto volume de mensagens cliente → servidor).

## Fontes
- [V] npm 2026-11-18: `socket.io` 4.8.4, `@socket.io/redis-adapter` 8.3.0, `@nestjs/websockets` / `@nestjs/platform-socket.io` 12.5.1, `expo-server-sdk` 8.0.0, `expo-notifications` ~58.1.9.
- [N] https://socket.io/docs/v4/redis-adapter/ ; https://socket.io/docs/v4/using-multiple-nodes/ (sticky session) ; https://docs.nestjs.com/websockets/gateways
- [N] https://docs.expo.dev/push-notifications/sending-notifications/ ; https://developer.chrome.com/blog/autoplay (política de autoplay)
