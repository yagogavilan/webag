# Fluxos v1.1: cadastro rápido, colar lista e edição em massa

> Autor: product-designer. Data: 2026-11-22. Specs: `telas/v1-1-cadastro-rapido.md`, `telas/v1-1-importar-colar.md`, `telas/v1-1-edicao-em-massa.md`.

## 1. Cadastro rápido de 1 produto (caminho feliz e erros)

```mermaid
flowchart TD
  A[Produtos: toca Novo produto] --> B[Cria rascunho local<br/>antes da camera]
  B --> C{Camera do aparelho}
  C -->|Foto tirada| D[Formulario: foco no Nome<br/>foto sobe em segundo plano]
  C -->|Permissao negada| C1[Galeria + Como liberar a camera]
  C1 --> D
  C -->|Fecha sem foto| D0[Formulario com Falta a foto]
  D0 --> D
  C -->|Aba recarregada| R[Restaura rascunho local] --> D
  D --> E[Nome, Preco, Quantidade<br/>categoria sugerida]
  E --> F{Tem tamanhos ou cores?}
  F -->|Sim| G[Grade no mesmo lugar<br/>Preencher todos com N] --> H
  F -->|Nao| H[Publicar]
  E -->|Codigo de barras| BC[Leitor] --> BR{Resultado}
  BR -->|Ja na loja| BR1[Abrir ou Aumentar estoque]
  BR -->|Na referencia| BR2[Preenche nome, marca, categoria] --> E
  BR -->|Desconhecido| E
  BR -->|Digito invalido| BR3[Codigo invalido: confira] --> BC
  D -->|Sugerir pela foto| IA[Sugestao por campo<br/>Usar ou Ignorar] --> E
  H --> V{Valido?}
  V -->|Nao| V1[Erro no campo, foca o primeiro] --> E
  V -->|Categoria proibida| V2[Recusa com texto padrao] --> E
  V -->|Sim| N{Rede?}
  N -->|Sem rede| N1[Guarda para enviar depois<br/>fila no aparelho] --> LST[Produtos > Rascunhos]
  N -->|Servidor falhou| N2[Nao conseguimos publicar agora.<br/>Produto guardado] --> H
  N -->|OK| U{Foto terminou de subir?}
  U -->|Nao| U1[Enviando a foto 60%<br/>publica sozinho] --> U
  U1 -->|Sair| BG[Segue em segundo plano] --> LST
  U -->|Sim| P[Publicado]
  P --> P1[Cadastrar outro] --> B
  P --> P2[Duplicar este<br/>sem fotos, EAN, SKU] --> C
  P --> P3[Ver meus produtos]
```

## 2. Rascunho: retomar, limite, expirar, conflito

```mermaid
flowchart TD
  L[Produtos] --> CT[Cartao Continuar: nome]
  L --> TB[Aba Rascunhos]
  CT --> F[Formulario]
  TB --> F
  TB --> X{Rascunho parado}
  X -->|27 dias| W[Sera apagado em 3 dias]
  X -->|30 dias| DEL[Removido]
  L --> NEW[Novo produto] --> LIM{50 rascunhos?}
  LIM -->|Sim| LIM1[Limite de 50 rascunhos.<br/>Publique ou apague] --> TB
  LIM -->|Nao| OK[Segue o cadastro]
  F --> SV[Salvar] --> CF{Alterado em outro aparelho?}
  CF -->|Sim| CF1[Qual versao manter?<br/>deste aparelho / do outro] --> F
  CF -->|Nao| SV1[Salvo no aparelho]
  F --> PUB[Publicar sem foto] --> PUB1[Falta a foto. Nada foi perdido.] --> F
```

## 3. Colar lista do WhatsApp (e planilha)

```mermaid
flowchart TD
  S[Mais > Adicionar varios] --> T{Aba}
  T -->|Colar texto| C1[Campo grande]
  T -->|Planilha| P1[Escolher arquivo ou baixar modelo]
  C1 --> L{Ler a lista}
  L -->|Vazio| E1[Cole a lista primeiro] --> C1
  L -->|Mais de 100 linhas| E2[Cole ate 100 por vez<br/>Usar as 100 primeiras] --> C1
  L -->|Nada reconhecido| E3[Nao encontramos produtos] --> C1
  L -->|OK| R[Revisar: cartao por linha]
  P1 --> M[Qual coluna e cada coisa?] --> R
  P1 -->|Arquivo invalido| E4[Nao conseguimos ler o arquivo] --> P1
  R --> J{Linhas parecem o mesmo produto?}
  J -->|Sim| J1[Juntar em 1 com tamanhos] --> R
  R --> FIX[Corrige preco, nome, qtd<br/>selo Pronta / Falta o preco]
  FIX --> CR[Criar N rascunhos]
  CR --> FT[Tirar as fotos: Foto em cada linha]
  FT --> PB{Publicar os validos n}
  PB -->|n = 0| PB1[Nenhum produto pronto.<br/>Tire as fotos primeiro] --> FT
  PB -->|n maior que 0| PB2[Publica os completos<br/>demais ficam rascunho] --> LST[Produtos]
  CR -->|Sem rede| CR1[Guarda no aparelho<br/>envia quando voltar] --> LST
```

## 4. Edição em massa

```mermaid
flowchart TD
  M[Produtos > Precos e estoque] --> RO{Permissao de catalogo?}
  RO -->|Nao| RO1[Somente leitura:<br/>Voce pode ver, mas nao editar]
  RO -->|Sim| ED[Lista com Preco e Estoque]
  ED --> IN[Digita valor] --> VL{Valido?}
  VL -->|Preco fora do limite| VL1[Erro na linha, valor anterior fica]
  VL -->|Estoque menor que reservado| VL2[Estoque menor que o reservado N]
  VL -->|Conflito| VL3[Produto alterado agora: ver valor novo]
  VL -->|OK| SV[Salvo na linha + voce recebe]
  ED --> SEL[Seleciona produtos] --> BAR[Barra: Reajustar preco / Pausar]
  BAR --> RJ[Reajuste: tipo, sinal, valor] --> PV[Previa: antes, depois, voce recebe]
  PV --> G30{Algum item acima de 30%?}
  G30 -->|Sim| G31[Caixa Conferi os valores] --> AP
  G30 -->|Nao| AP[Aplicar aos selecionados]
  AP --> UN[Aviso: desfazer por 10 min]
  UN -->|Desfazer| UN1[Precos voltam] --> ED
  UN -->|Passou 10 min| UN2[Botao some]
  BAR --> PA[Pausar N produtos: confirmacao] --> ED
```
