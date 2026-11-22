---
name: planejamento-e-estimativa
description: Planejamento e estimativa do PM para um time de agentes de IA mais um fundador humano: tamanho relativo, três pontos, capacidade em tempo do fundador e janelas de uso, buffers e plano de sprint/marco. Use ao montar sprint-NN.md, estimar épico, dizer "não cabe" com conta ou reestimar após mudança de escopo.
---
# Planejamento e estimativa (PM)

Realidade do Webag: agentes são rápidos; o gargalo é o **tempo do fundador** (decisões, teste em aparelho, conversa com lojistas), as **dependências externas** (D-01 a D-10 no board) e o **limite de uso por janela** (R-04). Planeje por esses três limites, não por "capacidade de desenvolvedor".

## 1. Estimativa relativa (tamanho, não horas)
- Escala: 1, 2, 3, 5, 8 pontos (Fibonacci). Acima de 8: divida (volte ao PO).
- Âncora: escolha 2 histórias já aceitas como "2" e "5" e compare ("é maior que a do checkout simples?").
- **Poker independente:** peça a estimativa de `backend-dev` e `mobile-dev` separadas, antes de ver a do outro (evita ancoragem). Diferença de 2 níveis ou mais: pergunte a premissa de cada um, reestime. Não faça média cega.
- Estime esforço + incerteza + dependência, não só código. Item que depende de terceiro (Apple, Mercado Pago, jurídico) leva a data da dependência junto.

## 2. Três pontos para itens de risco ou prazo
Otimista (O), provável (M), pessimista (P). Estimativa = (O + 4M + P) / 6; incerteza = (P − O) / 6. Escreva as **premissas** de cada ponto. Estimativa sem premissa não vale (regra do CEO).

## 3. Capacidade da sprint/marco
| Recurso | Como contar |
|---|---|
| Fundador | horas/semana livres x tarefas que só ele faz (revisão, aparelho real, visitas). Se não confirmou as horas, use o mínimo |
| Agentes | pontos por janela de uso, a partir da velocidade média das últimas 3 ondas/sprints; máximo 3 em paralelo (DEC-010) |
| Terceiros | prazo típico `[HIPÓTESE]` + folga (revisão de loja, KYC do Mercado Pago, jurídico) |
**Compromisso = capacidade x (1 − buffer).**

## 4. Buffers
- 15 a 20% para bug, retrabalho e imprevisto `[HIPÓTESE]`; some mais 10 a 20% se há dependência externa na sprint.
- Buffer **no fim do projeto/marco**, não escondido em cada tarefa (cada dono guardaria o seu e gastaria). Mostre-o no plano com nome.
- Nunca consuma o buffer para entrar escopo novo: use-o apenas para imprevistos.

## 5. Plano de sprint (docs/gestao/sprints/sprint-NN.md)
```
Meta (1 frase, entregável e verificável)
Capacidade: fundador Xh | agentes Y pontos | buffer Z%
Itens: ID | história/tarefa | pontos | dono | passa DoR? | dependências | critério de pronto
Decisões/insumos do fundador (em lote) e prazos
Dependências externas e data de pedido
Riscos do sprint e plano B
Resultado ao fechar: feito x previsto, o que sobrou e por quê
```
Ordem: **1)** pedidos a terceiros (têm espera longa, antecipe); **2)** itens que destravam outros; **3)** o que valida a hipótese; **4)** o restante. Marcos pequenos (1 a 3 histórias), commit e push por marco (R-04/R-05); dono e critério por item; só o PM mexe no board.

## 6. Checagens de realismo
- Soma dos pontos acima do compromisso? Diga o que sai, com a conta.
- Item sem DoR (`definicao-de-pronto`) ou sem estimativa dos devs não entra.
- Mais de 1 mudança de escopo depois da planning: "isto entrou depois; o que sai para caber?".
- Quase pronto não conta: ou passou no DoD ou volta com o resto.

## 7. Calibrar
Ao fechar cada sprint, registre previsto x realizado e o motivo do desvio. Se o erro for > 30% duas sprints seguidas `[HIPÓTESE]`, mude a âncora ou o buffer, não o discurso (`retrospectiva-e-melhoria-continua`).

## Fontes e licença
- phuryn/pm-skills, skill `sprint-plan` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22. Adaptado: capacidade, reserva de 15 a 20%, seleção por DoR, dependências e formato do plano, reescrito para agentes e para o fundador como gargalo.
- Estimativa relativa, PERT de três pontos e buffer de projeto: conhecimento geral de gestão (inspirado em), texto próprio.
