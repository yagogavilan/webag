# Fluxos v1.1: estados do pedido e da entrega (R3 e R4)

> Autor: product-designer. Data: 2026-11-22. Specs: `telas/v1-1-notificacoes.md`, `v1-1-loja-confirma-saida.md`, `v1-1-rastreio-cliente.md`. Regra é do PRD `v1-1-rastreio-e-notificacoes.md` (tabela de estados); aqui só o desenho do que cada papel vê.

## 1. Estados da entrega e quem muda

```mermaid
stateDiagram-v2
  [*] --> PRONTA_PARA_COLETA: loja marca Pronto
  PRONTA_PARA_COLETA --> AGUARDANDO_MOTOBOY: operacao envia rota
  AGUARDANDO_MOTOBOY --> MOTOBOY_A_CAMINHO: motoboy aceita
  AGUARDANDO_MOTOBOY --> PRONTA_PARA_COLETA: recusa ou 3 min sem resposta
  MOTOBOY_A_CAMINHO --> MOTOBOY_NA_LOJA: Cheguei (ou a 100 m)
  MOTOBOY_A_CAMINHO --> PRONTA_PARA_COLETA: reatribuir
  MOTOBOY_NA_LOJA --> SAIU_PARA_ENTREGA: loja confirma / sistema (5 min e a 150 m) / operacao
  SAIU_PARA_ENTREGA --> MOTOBOY_NA_LOJA: loja desfaz (2 min e a 150 m)
  SAIU_PARA_ENTREGA --> ENTREGUE: motoboy com codigo
  SAIU_PARA_ENTREGA --> NAO_ENTREGUE: motoboy com motivo
  ENTREGUE --> [*]
  NAO_ENTREGUE --> [*]
```

## 2. O que cada papel vê, por etapa (sequência do caminho feliz)

```mermaid
sequenceDiagram
  participant C as Cliente
  participant L as Lojista
  participant M as Motoboy
  participant A as Admin
  L->>A: Pronto para coleta (fila; alerta 10 e 20 min)
  A->>M: Rota enviada (push com som, 3 min)
  M->>A: Aceita (GPS liga)
  A-->>C: in-app a caminho da loja (sem push)
  M->>L: Cheguei (faixa com som)
  M->>L: Peguei o pedido
  alt Loja confirma
    L->>C: PUSH Saiu para entrega (abre o mapa)
  else 3 min: lembrete forte
    L->>C: PUSH Saiu para entrega
  else 5 min e a 150 m: automatica
    A-->>L: aviso e e-mail de resumo; contestar em 10 min
    A->>C: PUSH Saiu para entrega
  else 10 min sem OK
    A->>A: alerta com som: ligue para a loja
  end
  M-->>C: posicao (so se o pedido e a proxima parada)
  A->>C: PUSH O motoboy esta chegando (3 min ou 300 m)
  M->>C: Entreguei com codigo -> PUSH Entregue; mapa fecha
```

## 3. Caminhos de erro e divergências

```mermaid
flowchart TD
  S[Saiu para entrega] --> SG{Ponto de GPS recente?}
  SG -->|Sim| OK[Mapa e ETA ao vivo]
  SG -->|Mais de 90 s| ST1[Marcador cinza e Ultima posicao as HH:MM; ETA congelado]
  ST1 -->|Mais de 5 min| ST2[Estamos tentando reconectar + Falar com a Webag]
  ST1 -->|Mais de 3 min| AL[Alerta ao admin: motoboy sem sinal]
  OK --> LT{Pedido e a proxima parada?}
  LT -->|Nao| Q[Texto: Voce e o 2o. Sem mapa]
  LT -->|Sim| M[Mapa so com o trecho ate o destino]
  M --> CH{ETA <= 3 min ou 300 m}
  CH -->|Sim| P[PUSH chegando, 1 vez]
  P --> E[Entreguei com codigo]
  E --> C3{Codigo certo?}
  C3 -->|Nao, 3 erros| B[Bloqueia + Chamar a operacao]
  C3 -->|Sim| F[ENTREGUE: mapa fecha em 10 s; avaliacao]
  E -->|Sem sinal| PD[Guarda o codigo; confere ao voltar - pergunta ao PO]
  E -->|Nao consegui| NE[NAO_ENTREGUE com motivo + Combinar nova tentativa]
```

## 4. Quem vê o quê (resumo)

| Estado | Cliente | Lojista | Motoboy | Admin |
|---|---|---|---|---|
| Pronto | "Pronto, aguardando o motoboy" | "Pronto para coleta" | n/a | fila |
| Oferta | n/a | n/a | oferta com contagem | "Aguardando aceite" |
| Na loja | "O motoboy chegou à loja" | faixa com som | "Aguardando a loja" | n/a |
| Saiu | mapa ou "Você é o 2º" | "Saída registrada" | próxima parada | histórico com fonte |
| Entregue | "Entregue às HH:MM" | "Entregue" | próxima parada | histórico |
