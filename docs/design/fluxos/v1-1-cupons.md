# Fluxos v1.1: cupons e campanhas (admin, lojista, cliente)

> Autor: product-designer. Data: 2026-11-22. Specs: `telas/v1-1-admin-cupons.md`, `telas/v1-1-cupom-cliente.md`.

## 1. Admin: criar e ativar campanha

```mermaid
flowchart TD
  L[Cupons > Nova campanha] --> PF{Perfil pode criar?}
  PF -->|Suporte| PF1[Sem acesso: peca ao administrador]
  PF -->|Operacao, Super, Financeiro| S1[1 Nome] --> S2[2 Quem paga]
  S2 --> FR{Tipo frete gratis?}
  FR -->|Sim| FR1[Loja paga e Dividido desabilitados:<br/>O frete e da Webag] --> S3
  FR -->|Nao| S3[3 Desconto: tipo e valor] --> S4[4 Quem pode usar] --> S5[5 Limites e validade]
  S5 --> SIM[Simulacao ao vivo por faixa de entrega]
  SIM --> CK{Para ativar: pendencias?}
  CK -->|Sim| CK1[Lista escrita: falta orcamento, minimo abaixo de R$ X...] --> S3
  CK -->|Nao| WHO{Quem esta logado}
  WHO -->|Operacao| RA[Salvar rascunho<br/>Quem ativa: Super ou Financeiro]
  WHO -->|Super ou Financeiro| AT[Ativar campanha]
  AT --> CW{Custo da Webag maior que zero?}
  CW -->|Sim| FA[2o fator recente: Confirme que e voce]
  FA -->|Falhou| FA1[Codigo invalido: tente de novo] --> FA
  FA -->|OK| ON
  CW -->|Nao| ON[Ativa + audit_log com motivo]
  ON --> DV{Tem parte da loja?}
  DV -->|Sim| CV[Convites enviados: lojas PENDENTE] 
  DV -->|Nao| RUN[Em andamento]
  CV --> RUN
  RUN --> AL{Alertas}
  AL -->|80 por cento do orcamento| AL1[Aviso no painel]
  AL -->|100 por cento ou validade ou usos| ENC[Encerrada com motivo]
  AL -->|Suspeitos acima de 20 por cento| AL2[Sugestao de pausar]
  AL -->|30 dias sem uso| AL3[Aviso Sem uso]
  RUN --> PZ[Pausar com motivo: novos pedidos param em 1 min] --> RUN
  RUN --> ENC
  ENC --> DUP[Duplicar cria rascunho; nao reabre]
```

## 2. Lojista: convite de campanha

```mermaid
flowchart TD
  C[Convite no painel e por e-mail] --> V[Mais > Campanhas e cupons]
  V --> PM{Funcionario sem permissao de cupons?}
  PM -->|Sim| PM1[Nao ve nem aceita]
  PM -->|Nao| LK[Ve sua parte, pedido de exemplo,<br/>voce recebe R$ 79,78 sem cupom R$ 83,93]
  LK --> D{Decisao}
  D -->|Recusar| RC[Nada e descontado da loja]
  D -->|Aceitar| TT[Define limite por mes] --> CF[Confirma: Voce paga X por cento ate R$ N]
  CF --> AC[Aceite registrado: usuario, hora, versao do texto]
  AC --> ATV[Campanha vale nesta loja]
  ATV -->|Sair a qualquer momento| SA[Pedidos novos sem cupom; ja feitos mantem]
  ATV -->|Teto mensal atingido| TP[Campanha para na loja + aviso]
  C -->|7 dias sem resposta| EXP[Convite expira sem custo - sem aceite tacito]
  V --> CP[Cupom proprio: %, minimo, validade, limite mensal obrigatorio]
  CP --> PV[Previa: voce recebe R$ X por pedido de R$ Y] --> CR[Criar cupom]
  CR -->|Teto atingido| TP2[Cupom pausa + aviso]
  CR -->|Admin pausa com motivo| AD[Lojista avisado]
```

## 3. Cliente: aplicar cupom (sacola e checkout)

```mermaid
flowchart TD
  S[Sacola: Tem cupom?] --> A{Como}
  A -->|Digita codigo| IN[Campo Aplicar]
  A -->|Ver cupons| LS[Lista: valor, condicao, validade, origem] --> IN
  IN --> NET{Rede?}
  NET -->|Sem| N1[Sem conexao. Resumo continua o mesmo] --> IN
  NET -->|Com| EV{Servidor avalia}
  EV -->|Codigo nao existe| E1[Nao encontramos esse cupom] --> IN
  EV -->|Muitas tentativas| E2[Tente de novo em 1 hora - neutro]
  EV -->|Expirado| E3[Esse cupom expirou em data]
  EV -->|Esgotado| E4[Cupom esgotado - continuar sem]
  EV -->|Esgotado hoje| E5[Volta amanha - pedido segue sem cupom]
  EV -->|Outra loja| E6[Vale so na loja X]
  EV -->|Nao e 1a compra| E7[Valido so na primeira compra]
  EV -->|Sem celular confirmado| E8[Confirme seu celular] --> CC[Confirmar celular] --> S
  EV -->|Fraude ou margem negativa| E9[Cupom nao disponivel para este pedido - neutro]
  EV -->|Falta subtotal| F[Faltam R$ X para usar o cupom<br/>barra + sugestao de produto]
  F -->|Adiciona produto| EV
  F -->|Ignora| SEM[Segue sem cupom: total nao muda]
  EV -->|Valido| OK[Cartao verde: origem e valor<br/>total recalcula]
  OK --> CK[Pagamento: mesmo resumo]
  OK -->|Remover| S
  CK -->|Pedido nao paga: expira| REV[Reserva volta ao orcamento e ao saldo do cliente]
```

## 4. Suspeitos (admin)

```mermaid
flowchart TD
  SG[Sinal de fraude: 3 contas no aparelho, 3 cancelamentos, mesmo endereco] --> SP[Lista Suspeitos: pedido ID opaco + sinal]
  SP --> DEC{Admin com permissao de cupom}
  DEC -->|Manter| M[Proximo pedido da conta sem cupom]
  DEC -->|Liberar| L[Motivo obrigatorio + auditoria] --> OK[Conta volta a usar cupom]
  SP -->|Revelar dado| RV[Pedido a pedido, com motivo, auditado - Security]
```
