# Fluxos v1.1: turno e etapas do motoboy (R4)

> Autor: product-designer. Data: 2026-11-22. Spec: `telas/v1-1-app-motoboy.md`. Regras: RN-D5 a RN-D8 do PRD de despacho.

## 1. Entrada, permissão e turno

```mermaid
flowchart TD
  L[Link do convite] --> V{Convite valido?}
  V -->|Nao: usado ou vencido| X1[Convite invalido + Falar com a operacao]
  V -->|Sim| AV{App Android na versao minima?}
  AV -->|Nao| X2[Atualize para continuar]
  AV -->|Sim| LG[Aviso de localizacao: Li e aceito]
  LG --> T[Meu turno: Fora do turno]
  T --> IT[Iniciar turno]
  IT --> PM{Permissao de localizacao?}
  PM -->|Negada| PN[Sem permissao: nao aceita corridas + Abrir configuracoes]
  PM -->|GPS desligado| PG[GPS desligado: ligar]
  PM -->|Ok| D[Disponivel: sem coletar localizacao]
  D --> OF[Nova rota: 3 min para responder]
  OF -->|Recusa ou 3 min| D
  OF -->|Aceita| R[Corrida: GPS liga, notificacao fixa]
  R --> FIM[Rota concluida: GPS desliga]
  FIM --> D
  D --> ET[Encerrar turno: Fora do turno]
  R -->|Encerrar turno| BL[Bloqueia: termine as paradas ou fale com a operacao]
  X1 --> FIM2[Fim]
```

## 2. Etapas de uma parada

```mermaid
flowchart TD
  A[Parada de coleta: Vai] --> A1[Cheguei a loja ou a 100 m]
  A1 --> A2[Peguei o pedido]
  A2 --> A3[Aguardando a loja confirmar]
  A3 -->|Loja, sistema ou operacao| A4[Proxima parada]
  A3 -->|Sem OK 3 min| A5[Lembrete a loja] --> A3
  A4 --> B[Parada de entrega: Vai]
  B --> B1[Cheguei ao cliente]
  B1 -->|Mais de 300 m| B2[Voce esta longe: confirma] --> B3
  B1 --> B3[Entreguei: codigo de 4 digitos]
  B3 -->|Certo| B4[ENTREGUE]
  B3 -->|Errado| B5[Restam N tentativas] --> B3
  B3 -->|3 erros| B6[Bloqueia + Chamar a operacao]
  B3 -->|Sem sinal| B7[Guarda e confere depois]
  B1 --> B8[Nao consegui entregar: motivo] --> B9[NAO_ENTREGUE]
  B4 --> N{Tem outra parada?}
  B9 --> N
  N -->|Sim| A
  N -->|Nao| F[Rota concluida]
```

## 3. Sinal, GPS e bateria durante a corrida

```mermaid
flowchart TD
  C[Corrida ativa] --> RD{Rede do aparelho?}
  RD -->|Sem rede| Q1[Faixa Sem sinal; acoes e pontos em fila local ate 8 h]
  Q1 -->|Rede volta| Q2[Envia na ordem; N acoes enviadas]
  RD -->|Ok| GP{GPS?}
  GP -->|Desligado| G1[Faixa GPS desligado + Ligar GPS; cliente ve Sem atualizacao]
  GP -->|Fraco| G2[Faixa GPS fraco]
  GP -->|Ok| BT{Bateria?}
  BT -->|20 por cento ou menos| B1[Faixa: ligue o carregador]
  BT -->|10 por cento ou menos| B2[Faixa: desative a economia de bateria para o Webag]
  C --> PW{Modo navegador PWA?}
  PW -->|Sim| P1[Faixa fixa: cliente so ve com a tela aberta; ao abrir o Waze a posicao para]
```
