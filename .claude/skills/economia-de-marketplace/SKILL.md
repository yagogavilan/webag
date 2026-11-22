---
name: economia-de-marketplace
description: Unit economics e dinâmica de marketplace de 2 lados para o Webag: GMV, take rate, contribuição por pedido, CAC/LTV/payback, densidade, liquidez e cold start, com premissas sempre marcadas [HIPÓTESE]. Use ao avaliar comissão, frete, abrir bairro/cidade, subsidiar lojista ou decidir se o modelo fecha a conta.
---
# Economia de marketplace (CEO)

Regra: número sem fonte e data é `[HIPÓTESE]`. Toda conta abaixo vive numa tabela de premissas (passo 4) com como validar. Não invente benchmark; se citar taxa de mercado, ponha fonte e data.

## 1. Fórmulas (definições únicas do time)
| Métrica | Fórmula |
|---|---|
| GMV | soma do valor dos produtos dos pedidos concluídos (sem frete) |
| Take rate | receita Webag / GMV (comissão DEC-008/035 + taxa de serviço) |
| Receita por pedido | comissão + taxa de serviço (+ frete cobrado, se for da Webag) |
| Custo variável por pedido | tarifa do Mercado Pago + motoboy (DEC-036: logística é da Webag) + suporte + cupom/subsídio + estorno esperado |
| **Contribuição por pedido** | receita por pedido − custo variável por pedido. Se for negativa, crescer piora |
| CAC lojista / consumidor | gasto (dinheiro + horas do fundador x valor da hora) / ativados no período |
| LTV | contribuição por pedido x pedidos por mês x meses de vida (use vida curta e conservadora) |
| Payback | CAC / contribuição mensal. Meta de partida `[HIPÓTESE]`: menos de 6 meses |

Contar o tempo do fundador como custo de CAC: no porta a porta ele é o custo dominante.

## 2. Perguntas que a conta precisa responder
- Em quantos pedidos por dia, por cidade, a contribuição cobre o custo fixo (despachante, hospedagem, suporte)? Ponto de equilíbrio com 3 cenários (pessimista, provável, otimista).
- O frete cobrado cobre o motoboy? Quem absorve a diferença: Webag, loja ou cliente? (sensibilidade do consumidor a frete é alta `[HIPÓTESE]`).
- A comissão deixa margem ao lojista pequeno? Ele cadastra preço já com a comissão (DEC-035): compare o "você recebe R$ X" com o que ele ganha vendendo por WhatsApp (custo zero de comissão).
- Vazamento: o que impede lojista e cliente de combinar o segundo pedido por fora? Valor recorrente tem que estar no app (pagamento PIX simples, rastreio, troca, confiança).

## 3. Cold start, densidade e liquidez
- **Densidade vence cobertura:** ganhar um bairro/cidade (ex.: Francisco Morato) antes de abrir outra (DEC-009). Meta: o cliente abre o app e acha loja aberta no raio.
- **Liquidez (medir por cidade):** % de sessões com pelo menos 1 loja aberta entregando para o endereço; % de pedidos aceitos pela loja em até N min; % entregues dentro da faixa prometida (DEC-053); tempo do cadastro da loja até o 1º pedido.
- **Oferta primeiro, com valor sozinho:** a loja precisa ganhar algo mesmo sem muito tráfego (catálogo bonito, link para divulgar no WhatsApp/Instagram). Traga a demanda da própria base da loja.
- **Prefira poucas lojas boas e abertas** a muitas paradas. Loja inativa piora a liquidez e a confiança do consumidor.
- Subsídio (comissão zero, frete grátis, cupom) só com prazo, teto de gasto e meta de saída; é dinheiro: pede autorização do fundador.

## 4. Tabela de premissas (docs/00-visao/unit-economics.md; o CEO pode editar)
`premissa | valor usado | status ([HIPÓTESE] ou fonte+data) | como validar | quando | efeito se errar` (ex.: ticket médio, pedidos/loja/semana, custo do motoboy por entrega, % PIX, taxa de estorno). Revise após o piloto com dado real.

## 5. Sinais de alerta
Contribuição negativa por pedido; payback crescendo; poucas lojas concentrando todo o GMV; recompra do consumidor baixa; lojas ativas caindo depois do onboarding; despacho manual virando teto de crescimento (R-18).

## Fontes e licença
- phuryn/pm-skills, skills `monetization-strategy` e `north-star-metric` (MIT, Copyright Pawel Huryn), consultadas em 2026-11-22. Adaptado: análise de unit economics (CAC, LTV, break-even) e jogo de transação, aplicados a marketplace regional.
- Fórmulas de GMV, take rate, contribuição, densidade e liquidez: conhecimento geral de marketplaces (inspirado em); metas numéricas são `[HIPÓTESE]` a validar no piloto.
