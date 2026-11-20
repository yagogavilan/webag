# Personas e Jobs-to-be-Done — Webag 1.0

Status: v1 | Dono: product-owner | Data: 2026-11-18
Base: brief §2 e `pesquisa-mercado.md`. Nenhuma persona foi validada em entrevista: todo atributo é `[HIPÓTESE]` até o piloto (`pesquisa-mercado.md` §8). Nomes são fictícios.

## P1 — Cliente: "Carla", 29, Francisco Morato
| | |
|---|---|
| Perfil `[HIPÓTESE]` | Trabalha na capital, volta à noite pela Linha 7. Android de entrada com 3-4 GB de memória, 4G/3G instável, plano de dados limitado. Já compra no Shopee/ML; nunca usou app de loja do bairro |
| Pagamento | PIX no dia a dia; cartão de crédito com parcelamento para compras maiores |
| Medos | App novo pedir dados demais, pagar e não receber, não conseguir trocar |
| Contexto de uso | Celular, uma mão, em trânsito ou à noite; pede em 1-2 minutos |

**Jobs-to-be-Done**
- Quando preciso de algo hoje (presente, cosmético, carregador), quero ver o que tem **perto de mim e abre agora**, para não ir ao centro nem esperar dias.
- Quando compro roupa/calçado de loja que não conheço, quero saber que **posso trocar**, para não ficar com prejuízo.
- Quando pago, quero ver **o total final antes** e pagar por PIX sem digitar dados de cartão.
- Depois de pagar, quero saber **em que pé está** e falar com a loja se preciso.

**Dores:** frete e taxa surpresa no fim; cadastro longo antes de ver preço; loja que não responde; "entrega amanhã" sem aviso.
**Sucesso:** compra em < 2 minutos; recebe no prazo informado; troca sem discussão.

## P2 — Lojista: "Seu Marcos", 46, dono de loja de roupas e acessórios (MEI)
| | |
|---|---|
| Perfil `[HIPÓTESE]` | Vende no balcão, no WhatsApp e no Instagram; 1-3 funcionários; opera pelo celular e por um computador antigo no balcão; pouco tempo e pouca familiaridade com sistemas; faz entrega com moto própria ou parente |
| Hoje | Foto no WhatsApp, PIX manual conferido no extrato, estoque "na cabeça" ou caderno |
| Medos | Comissão alta, perder tempo cadastrando 200 produtos, cliente que pede e some, taxa de cartão |
| Contexto de uso | Entre atendimentos no balcão; o painel pode ficar aberto ou fechado |

**Jobs-to-be-Done**
- Quando chega um pedido, quero ser **avisado na hora** e aceitar em 1 toque, para não perder a venda.
- Quando cadastro meus produtos, quero **subir foto e preço rápido** (ou importar planilha), sem aprender sistema.
- Quando vendo, quero **receber com segurança** e ver quanto cai, quanto é comissão e quando.
- Quando o cliente quer trocar, quero **regras claras** (prazo, taxa de coleta) para não ser pego de surpresa.
- Quando estou ocupado ou saio, quero **pausar a loja** sem mexer em nada mais.

**Dores:** dupla digitação (balcão e app), cliente que pede produto sem estoque, pagamento sem confirmação, imposto/nota (`pesquisa-mercado.md` §7).
**Sucesso:** primeiro pedido aceito no dia 1 de uso; cadastro de 20 produtos em < 30 minutos; repasse sem dúvida.

### P2b — Funcionário da loja: "Joana", 22
Atende o balcão, aceita pedido e separa. Não deve ver financeiro nem conta de recebimento. Precisa de painel de pedidos grande, legível de longe, com som.

## P3 — Admin: Yago (fundador), depois time de operação
| | |
|---|---|
| Perfil | Desenvolvedor, 10+ anos em Customer Success; opera sozinho no início; perfis futuros: operação, financeiro, suporte |
| Contexto | Computador; precisa decidir rápido e **sem mexer em código** |

**Jobs-to-be-Done**
- Quando uma loja se cadastra, quero **aprovar ou recusar com motivo** em minutos, vendo os documentos.
- Quando algo dá errado (pedido, troca, estorno), quero **intervir e deixar registro**.
- Quando quero crescer, quero **abrir um bairro**, trocar banner, criar cupom e disparar push segmentado sem deploy.
- Quando o dinheiro não bate, quero **conciliar** com o provedor e exportar.
- Quando preciso provar o que foi feito, quero um **log de auditoria** confiável.

**Dores:** equipe de uma pessoa; risco de erro em dinheiro; suporte a loja e cliente ao mesmo tempo.
**Sucesso:** fila de aprovação zerada em 2 dias úteis; nenhum estorno sem registro.

## P4 — Entregador (fase 2, fora da 1.0)
Registrado só para o modelo de dados. Na 1.0 a entrega é do lojista (DEC-007). Jobs previstos: receber corridas por proximidade, ver endereço e valor, confirmar coleta e entrega, receber o repasse.

## Mapa persona x épico
| Épico | Carla | Seu Marcos / Joana | Yago |
|---|---|---|---|
| Cliente (PRD cliente) | Principal | | |
| Lojista (PRD lojista) | Indireto (vitrine) | Principal | |
| Admin (PRD admin) | | Indireto | Principal |
| Pagamentos | Principal | Principal | Principal |
| Trocas | Principal | Principal | Mediação |
| Notificações | Principal | Principal | Secundário |
| LGPD | Principal | Secundário | Principal |
