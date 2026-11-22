# Tela: Fluxo de estados e notificações, o que cada papel vê e recebe   (WB-391, WB-396, WB-397, WB-398 parcial)

> Autor: product-designer. Data: 2026-11-22. Release R3. Protótipo: `v1-1-logistica-e-analises.html#/n/fluxo` (a linha do pedido #1042 fica marcada "Agora" e acompanha a simulação) e `#/c/avisos` (tela bloqueada do cliente). Diagrama: `docs/design/fluxos/v1-1-pedido-estados.md`.
> Regras do catálogo `prd/notificacoes.md` valem: transacional sempre enviado, sem emoji, sem dado pessoal sensível, deduplicação, **código de entrega nunca no push**. Limites: título <= 60 e corpo <= 120 caracteres (PRD); mantive os do `microcopy` (~40 e ~90) onde coube.

## 0. Decisões de UX

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Só 3 pushes ao cliente em todo o trajeto**: "saiu para entrega", "motoboy chegando", "entregue". O resto é in-app | Push demais vira silenciar o app; o cliente que quer detalhe abre a tela |
| 2 | **Cada papel tem um canal por urgência**: lojista = faixa com som (urgente), motoboy = push com som, admin = painel com som só nos de decisão (sem OK 10 min, sem sinal, atraso), e-mail só em resumo | Evita e-mail com latência em evento de minutos (PRD) |
| 3 | **Tela bloqueada sem dado sensível**: sem endereço, sem nome, sem código, sem o nome do motoboy | LGPD e segurança de quem entrega; o app mostra o resto ao abrir |
| 4 | **Estado em tela primeiro, push depois**: se o push não chegar (economia de bateria, permissão), o app abre no estado certo (C7 da WB-396) | Push é entrega sem garantia |
| 5 | **Dedup visível**: mudanças em < 30 s agrupam na última | C2 da WB-396 |

## 1. Matriz por etapa (resumo; a tabela completa e interativa está no protótipo)

| Etapa | Cliente | Lojista | Motoboy | Admin |
|---|---|---|---|---|
| Pedido aceito | in-app | vê "Preparando" | n/a | n/a |
| Pronto para coleta | in-app "Pronto, aguardando o motoboy" | marca pronto | n/a | fila; alerta aos 10 e 20 min sem motoboy |
| Rota enviada | n/a | n/a | **push com som e vibração** "Nova rota: 3 entregas" (3 min) | "Aguardando aceite"; alerta aos 3 min |
| A caminho da loja | in-app (sem push) | painel sem som | navega | mapa ao vivo |
| Na loja | in-app "O motoboy chegou à loja" | **faixa + som + vibração** (+ Web Push) | "Aguardando a loja confirmar" | n/a |
| Lembrete 3 min | n/a | **som forte, faixa vermelha** | "A loja foi lembrada" | n/a |
| **Saída confirmada** (loja, automática ou operação) | **push** "Seu pedido saiu para entrega" (abre o mapa) | "Saída registrada às 15:42" (+ e-mail de resumo se automática) | próxima parada | histórico com fonte |
| Sem OK 10 min | n/a | n/a | segue aguardando | **painel com som** "Ligue para a loja" |
| Chegando (<= 3 min ou 300 m) | **push** sem o código | n/a | "Cheguei ao cliente" | n/a |
| Pode atrasar | in-app, 1 vez, sem push | n/a | n/a | amarelo/vermelho |
| Sem sinal | depois de 90 s: "Sem atualização há 2 min" | n/a | faixa "Sem sinal" | painel após 3 min |
| Entregue | **push** "Pedido entregue às 15:54"; avaliação disponível e convite 1 h depois | painel "Pedido #1042 entregue" | próxima parada ou resumo | histórico; "fora do ponto" sem som |

## 2. Textos (título / corpo)

| Destino | Título | Corpo |
|---|---|---|
| Cliente, saiu | Seu pedido saiu para entrega | Acompanhe o motoboy no mapa. |
| Cliente, chegando | O motoboy está chegando | Tenha o código de entrega à mão. |
| Cliente, entregue | Pedido entregue | Entregue às 15:54. Obrigado por comprar no Webag. |
| Cliente, desfeito | O pedido ainda não saiu | A loja corrigiu a confirmação. Avisamos de novo quando sair. |
| Motoboy, oferta | Nova rota: 3 entregas | Toque para ver e aceitar. Sem valores no aviso. |
| Lojista, chegou | Carlos chegou para o pedido #1042 | Entregue e toque em “Saiu com o motoboy”. |
| Lojista, lembrete | O motoboy aguarda o pedido #1042 | Toque para confirmar a saída. |
| Admin, 10 min | Pedido #1042 sem OK da loja há 10 min | Ligue para a loja. |
| Admin, sem sinal | Carlos sem sinal há 3 min | Entrega #1042. Veja no mapa. |

## 3. Estados e erros

| Situação | Comportamento |
|---|---|
| Push desligado no sistema | Estado certo ao abrir o app; e-mail só nos críticos já definidos (C7) |
| Falha de entrega do push | Registra e não reenvia em loop (C9) |
| Tela do admin sem permissão | Operação vê; Suporte não recebe alerta sonoro `[proposta]` |
| Carregando, erro | Esqueleto e "Não conseguimos carregar agora. Tente de novo em instantes." |
| Cliente sem internet | "Sem conexão. Atualizado há 3 min. Mostramos o último estado." |

## 4. Acessibilidade

Painel: `aria-live="polite"` para avisos comuns e `assertive` só na faixa de saída e no alerta Urgente. Som sempre acompanhado de sinal visual e vibração. Cada linha da matriz é uma seção com título; a linha atual tem `aria-current="step"` e a palavra "Agora". Push com texto curto, sem abreviação.

## 5. Eventos

`push_sent` (type), `push_failed`, `notification_opened` (type), `dispatch_alert_shown`. Sem posição, nome ou endereço.

## 6. Mapa WB

| História | Onde |
|---|---|
| WB-391 C1 a C11 | Estados e timeouts: fluxo `v1-1-pedido-estados.md`; matriz §1 (C10: toda transição dispara a notificação) |
| WB-396 C1 a C9 | §1 e §2 (C8 limites de caracteres) |
| WB-397 C1 a C4 | `v1-1-loja-confirma-saida.md` §1 e §2 |
| WB-398 C1 a C5 | Aba "Saída e rastreio" em `v1-1-analises-admin.md` |

## 7. Revisão heurística

**Nota 4 de 5.** NT-1 (sev. 2, H4): 4 canais x 4 papéis é denso; a matriz do protótipo mostra só a linha atual em destaque, mas o documento é grande: manter como **referência**, não como tela de produto. NT-2 (sev. 3, H1): o cliente só recebe push ao "saiu"; entre "pronto" e "saiu" pode passar 20 min sem sinal. Mitigação: manter o texto "Estamos escolhendo o motoboy" em tela e medir "cadê meu pedido" (HIP-R1). Bom: tela bloqueada sem dado pessoal, urgência proporcional por papel. **Teste:** 5 clientes leem a tela bloqueada e dizem o que está acontecendo.

## 8. Perguntas

PO: 1. Cliente deve receber push de "motoboy a caminho da loja"? Recomendo que não. 2. Suporte recebe alerta sonoro? Backend: 3. Deduplicação de 30 s por pedido ou por usuário? Security: 4. Nome do motoboy no push do cliente (hoje fora; só no app).
