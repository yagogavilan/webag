# Fluxos v1.1: admin, gestão das lojas

> Autor: product-designer. Data: 2026-11-22. Spec: `telas/v1-1-admin-lojas.md`.

## 1. Da lista à edição (com motivo, aviso e auditoria)

```mermaid
flowchart TD
  A[Lojas: busca e filtros] --> B[Ficha da loja]
  B --> T{Aba}
  T --> T1[Resumo] & T2[Catalogo] & T3[Horario e pausa] & T4[Comissao] & T5[Historico]
  T2 --> PM{Perfil pode editar?}
  PM -->|Nao| PM1[Somente leitura:<br/>Voce pode ver, mas nao editar]
  PM -->|Sim| MS{Motivo da sessao definido?}
  MS -->|Nao| MS1[Escolher motivo<br/>Solicitado pelo lojista + canal e data] --> ED
  MS -->|Sim| ED[Alterar preco ou estoque]
  ED --> DG[Dialogo: antes e depois, motivo pre-preenchido]
  DG --> V{Valido?}
  V -->|Preco: motivo fora da lista| V1[Trocar para um dos 4 motivos] --> DG
  V -->|Estoque menor que reservado| V2[Bloqueia: use N ou mais] --> DG
  V -->|Mudanca acima de 30%| V3[Caixa Conferi o valor novo] --> CF
  V -->|OK| CF{Lojista alterou agora?}
  CF -->|Sim| CF1[O lojista alterou este produto agora<br/>Recarregar; nada sobrescrito] --> DG
  CF -->|Nao| OK[Salva + audit_log + aviso ao lojista]
  OK --> TS[Toast com Desfazer 8 s]
  TS -->|Desfazer| UN[Valor anterior volta + novo registro]
  OK --> T5
  T1 --> ST[Alterar situacao] --> ST1{Transicao valida RN-16?}
  ST1 -->|Sim| ST2[Motivo 10 a 200 + Suspender nome da loja] --> OK
  T3 --> PA[Pausar por duracao + motivo] --> OK
  T4 --> CM{Super admin ou Financeiro?}
  CM -->|Nao| CM1[Leitura: so eles mudam]
  CM -->|Sim| CM2[Comissao + vigencia + previa Voce recebe] --> OK
  T5 --> RS[Restaurar valor anterior] --> RS1{Valor mudou depois?}
  RS1 -->|Sim| RS2[Aviso + confirmar mesmo assim] --> OK
  RS1 -->|Nao| OK
```

## 2. "Ver como o lojista" (somente leitura)

```mermaid
flowchart TD
  F[Ficha] --> BT[Ver como o lojista] --> PR{Perfil}
  PR -->|Qualquer um dos 4| MO[Dialogo: motivo obrigatorio<br/>30 min, sem renovacao]
  MO -->|Cancelar| F
  MO -->|Sem motivo 422| MO
  MO -->|Muitas aberturas 429| MO
  MO -->|Abrir visualizacao| LG[audit_log gravado ANTES do dado<br/>fecha a visao anterior do mesmo admin]
  LG --> VW[Telas do lojista com banner fixo<br/>Visualizando como loja - somente leitura - tempo restante]
  VW --> PD[Pedidos e trocas: primeiro nome e bairro,<br/>sem telefone, endereco nem texto do cliente]
  VW --> AC[Acoes de escrita e menus fora da lista:<br/>etiqueta So o lojista, sem botao]
  VW -->|Precisa falar com o cliente| FP[Ficha do pedido no admin, outra aba]
  VW -->|Requisicao direta de escrita ou rota fora da lista| E403[Servidor recusa 403]
  VW -->|Sessao do admin expira| EX[Visao fecha, vai ao login]
  VW -->|Sair da visualizacao| F
  VW -->|Faltam 5 min e 1 min| AV[Aviso unico no banner]
  VW -->|30 min completos| FIM[A visualizacao terminou: nenhum dado na tela]
  VW -->|Admin abre outra visao| FIM
  FIM -->|Abrir de novo| MO
  FIM -->|Voltar| F
  FP --> FP1{orders:read?}
  FP1 -->|Nao| FP2[403: sem acesso a essa area]
  FP1 -->|Sim| FP3[audit_log: quem, pedido, quando] --> FP4[Nome abreviado, e-mail e celular parciais,<br/>bairro e cidade, itens, pagamento, linha do tempo]
  FP4 -->|Cliente nao atende| CN[Canal da Webag: suporte ou operador de entrega.<br/>Sem Revelar na v1.1]
```

## 3. Permissões na tela (o que aparece)

```mermaid
flowchart LR
  P[Perfil] --> SA[Super admin]
  P --> OP[Operacao]
  P --> FI[Financeiro]
  P --> SU[Suporte]
  SA --> A1[Tudo: editar, preco, situacao, comissao, exportar]
  OP --> A2[Editar, preco com 4 motivos, situacao, exportar operacional<br/>Comissao: leitura]
  FI --> A3[Comissao e exportar<br/>Resto: leitura]
  SU --> A4[Ver ficha, historico, Ver como<br/>Sem nenhum botao de escrita]
```
