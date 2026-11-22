# Fluxos v1.1: despacho e rota (R3) e análises (R5)

> Autor: product-designer. Data: 2026-11-22. Specs: `telas/v1-1-admin-despacho.md`, `v1-1-analises-admin.md`, `v1-1-analises-lojista.md`.

## 1. Despacho: fila, lote, rota, envio

```mermaid
flowchart TD
  F[Fila de coleta] --> S{Seleciona pedidos}
  S -->|1 pedido: Atribuir a Carlos| P1[Rota simples coleta e entrega]
  S -->|Varios| V{Valida}
  V -->|Cidades diferentes| E1[Só da mesma cidade]
  V -->|Mais de 4 volumes| E2[Passa da capacidade: tire N corrida]
  V -->|Mais de 4 pedidos| E3[No maximo 4 pedidos]
  V -->|Pedido sem posicao| E4[Confirme o endereco antes]
  V -->|Ok| G[Gerar rota]
  E1 --> S
  E2 --> S
  E3 --> S
  E4 --> S
  P1 --> R
  G --> R[Rota proposta: ordem, horario, km, minutos]
  R --> AT{Parada pode atrasar?}
  AT -->|Sim| AT1[Tag de atraso + Tirar do lote] --> R
  R --> MV[Subir ou descer parada]
  MV --> OK{Coleta antes da entrega?}
  OK -->|Nao| MV1[Toast e nao muda] --> R
  OK -->|Sim| MT[Motivo da mudanca: 4 chips] --> R
  R --> EN{Enviar}
  EN -->|Sem motivo apos mudar| EN1[Escolha o motivo] --> R
  EN -->|Ok| O[Oferta ao motoboy: 3 min]
  EN -->|Alternativa| W[Abrir no Maps ou Waze, ou WhatsApp]
  O -->|Aceita| C[Em corrida: mapa ao vivo]
  O -->|Recusa ou 3 min| F
  C --> AL{Alertas}
  AL -->|Sem sinal 3 min| RA[Reatribuir: so antes da saida]
  AL -->|Sem OK da loja 10 min| LG[Ligar para a loja; confirmar por ela com motivo]
  AL -->|Previsto apos a faixa| AT2[Atencao ou Urgente]
```

## 2. Análises: coleta, agregação e o que cada um vê

```mermaid
flowchart TD
  U[App do cliente] --> OP{Medicao ligada?}
  OP -->|Nao: opt-out| Z[Nenhum evento]
  OP -->|Sim| EV[Eventos sem user_id, IP ou texto livre]
  EV --> AGR[Agregacao diaria: minimo 5 por celula; bruto 90 dias]
  AGR --> AD[Admin: acessos, funil, origem, por cidade]
  AGR --> M{Modulo da loja}
  M -->|Inativo| PF[Porta falsa: Quero testar; sem data]
  M -->|Teste 30 dias| LJ[Lojista ve agregados da propria loja]
  M -->|Ativo ate DD/MM| LJ
  M -->|Vencido| VC[Leitura bloqueada; vendas seguem no painel]
  M -->|Suspenso| SP[Modulo suspenso]
  LJ --> CK{Menos de 30 visitas?}
  CK -->|Sim| T1[So totais: Poucos dados ainda]
  CK -->|Nao| T2[Funil, origem, produtos, horario; menos de 5 em texto]
  AD --> BD[Construtor de graficos: metricas novas e dimensao Origem]
```

## 3. Módulo por loja (admin)

```mermaid
stateDiagram-v2
  [*] --> INATIVO
  INATIVO --> TESTE: Ativar teste de 30 dias (super, financeiro, com motivo)
  TESTE --> ATIVO: Registrar pagamento ate DD/MM
  TESTE --> VENCIDO: 30 dias sem pagamento
  ATIVO --> VENCIDO: passou valido_ate
  VENCIDO --> ATIVO: Registrar pagamento
  TESTE --> SUSPENSO: Suspender
  ATIVO --> SUSPENSO: Suspender
  SUSPENSO --> ATIVO: Reativar
```
