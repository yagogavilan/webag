# PRD: Pagamentos

Status: pronto para G3 (decisão técnica de split vai a ADR do backend) | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-150 a WB-161
Atualizado: 2026-11-19 (DEC-035/036/037): `application_fee` = comissão + taxa de entrega + taxa de serviço; taxa de entrega é receita da Webag; taxa de troca em cobrança separada (WB-238 em `prd/logistica.md`, WB-175 e WB-245 em `prd/trocas.md`).
Regras: RN-07, RN-08, RN-10 em `docs/produto/regras-de-negocio.md`. Origem: brief §4. Pesquisa: `pesquisa-mercado.md` §6. Regra inviolável: nunca armazenar dado de cartão (CLAUDE.md §7).

## Problema
Cliente quer pagar por PIX/cartão sem medo; lojista quer receber certo e saber quanto; Webag precisa reter comissão e não perder dinheiro nem violar regulação. Dinheiro é a área de maior severidade (Crítica) do produto.

## Objetivo e métrica de sucesso
Pagar, estornar e repassar com consistência total entre pedido, provedor e extrato; trocar do provedor simulado para o Mercado Pago só preenchendo `.env`.
| Métrica | Meta |
|---|---|
| Pedidos pagos sem divergência na conciliação | 100% (divergência > 0 gera alerta) |
| Taxa de aprovação PIX (pagos / PIX gerados) | >= 80% `[HIPÓTESE]` |
| Taxa de aprovação de cartão | >= 85% `[HIPÓTESE]` |
| Tempo da confirmação do PIX até o pedido RECEBIDO | <= 5 s (p95) |
| Pagamentos duplicados | 0 |
| Estornos concluídos no SLA (RN-08) | >= 99% |

**Eventos:** `payment_created {method}`, `payment_approved {method, ms}`, `payment_declined {reason}`, `payment_expired`, `refund_requested {type, amount}`, `refund_completed`, `webhook_received {type, valid}`, `webhook_failed`, `reconciliation_diff {kind}`, `payout_created`.

## Fora do escopo (1.0)
Boleto, débito, carteira Mercado Pago, cartão salvo, dinheiro/maquininha na entrega, parcelamento pago pela loja, PIX Automático/recorrência, pagamento por link externo, cripto, antifraude proprietário, segundo provedor (Pagar.me/Asaas, WB-161), reembolso em crédito na plataforma.

## Usuários e cenários
Cliente (PIX e cartão), lojista (recebe e vê extrato), financeiro/admin (estorna, concilia, repassa), dev (simulado vs. real).

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-PAG-01 | Interface `PaymentProvider` + provedor simulado completo | 150 |
| RF-PAG-02 | Adaptador Mercado Pago: PIX | 151 |
| RF-PAG-03 | Adaptador Mercado Pago: cartão por tokenização, sem dados de cartão | 152 |
| RF-PAG-04 | Webhooks com assinatura, idempotência e reprocessamento | 153 |
| RF-PAG-05 | Estorno total e parcial | 154 |
| RF-PAG-06 | Recebimento do lojista: split OAuth (preferido) ou centralizado | 155 |
| RF-PAG-07 | Ledger de comissão, taxa e extrato | 156 |
| RF-PAG-08 | Conciliação | 157 |
| RF-PAG-09 | PIX tardio/duplicado e chargeback | 158, 159 |
| RF-PAG-10 | Troca simulado/real por `.env` e README | 160 |

## Regras de negócio
- **Estados do pagamento:** CRIADO → PENDENTE → APROVADO | RECUSADO | EXPIRADO | CANCELADO; APROVADO → ESTORNADO_PARCIAL → ESTORNADO_TOTAL; APROVADO → CONTESTADO (chargeback). Só APROVADO move o pedido a RECEBIDO.
- A fonte da verdade é o provedor: ao receber webhook, o sistema **consulta o status na API do provedor** antes de agir (não confia só no corpo).
- Idempotência: chave por pedido+tentativa; mesmo evento de webhook processado uma vez.
- Valores, comissão, taxa e repasse: RN-10. Preço e total cobrados = os exibidos (RN-05).
- Cartão: captura conforme HIP-010; PIX: validade `pix_expiracao_min`. Parcelas: HIP-011. Máx. por pedido: HIP-012.
- **Segurança de segredo:** chaves e tokens só em `.env`/cofre; token OAuth do lojista criptografado em repouso.
- **Provedor simulado:** o valor de configuração é `PAYMENT_PROVIDER=fake` (nome do ADR-002; "simulated" foi abandonado, SEC-112 c). Proibido em produção: a aplicação recusa subir com `fake` em `NODE_ENV=production`.
- **`application_fee` no split (DEC-035, DEC-036):** `application_fee = comissão + taxa de entrega + taxa de serviço − cupom da plataforma` (RN-10), calculada no servidor e gravada no pedido (snapshot); o lojista recebe só os itens menos o cupom da loja, menos a comissão e menos a taxa do provedor. A taxa de entrega é **receita da Webag**; o custo do motoboy é pago **fora do app** e entra no ledger como custo de logística (WB-238, WB-239). Estorno total devolve a taxa de entrega; estorno parcial, proporcional (exceto entrega não realizada e arrependimento, onde a taxa volta inteira).
- **Split não retém dinheiro (DEC-016, SEC-105):** no modo split o valor cai direto na conta do lojista e a Webag recebe só a `application_fee` (comissão, taxa de entrega e taxa de serviço). Não existe "repasse retido, ajustado ou descontado" pela Webag; o repasse do split é **informativo**. Recursos contra lojista que recebe e não entrega: estorno pelo admin a partir da conta do lojista, suspensão da loja, limite de exposição de loja nova (WB-225) e cobrança pelos Termos do Lojista (jurídico, fora do sistema).
- **Cupom/frete grátis da plataforma no split:** desconto da plataforma por pedido <= `application_fee` do pedido (comissão + taxa de entrega + taxa de serviço; WB-116 C6); acima disso o desconto é cortado no teto. Frete grátis por limite de valor (RN-04) zera a taxa de entrega e não deixa a `application_fee` negativa.
- **Taxa de troca e diferença de preço (DEC-037):** cobrança **separada** do pedido, depois da aprovação da loja, por PIX ou cartão (WB-175, WB-245); a taxa é receita da Webag, não da loja. O backend decide no ADR se a cobrança sai na conta MP da Webag (sem split) ou como pedido de troca com `application_fee` integral; sem comissão sobre a taxa. Subsídio maior só com mecanismo de pagamento ao lojista aprovado pelo fundador.
- **Regulatório:** modelo centralizado só após parecer jurídico (`pesquisa-mercado.md` §6); split é o preferido.

## Requisitos não funcionais
- **Consistência:** operações de dinheiro transacionais; nenhum estado "pago sem pedido" ou "pedido sem pagamento" após reprocessamento; testes de falha no meio do fluxo.
- **Desempenho:** webhook responde 2xx em <= 2 s e processa de forma assíncrona (fila) com retentativas exponenciais e fila de falhas (dead-letter) visível ao admin.
- **Segurança:** verificação de assinatura do webhook; HTTPS; rate limit; sem log de dado de cartão, token ou CPF completo; PCI: escopo mínimo SAQ-A via campos seguros do provedor.
- **Observabilidade:** cada pagamento tem ID de correlação; alerta em taxa de falha de webhook > 5%.
- **LGPD:** CPF do pagador só se o provedor exigir, criptografado, finalidade pagamento (HIP/WB-023 C7).

## Histórias e critérios de aceite

### WB-150 PaymentProvider e provedor simulado — Must — dep: nenhuma
Como dev, quero uma interface de provedor e um simulado, para o app funcionar ponta a ponta sem chaves.
- **C1** Dado `PAYMENT_PROVIDER=fake`, então criar PIX devolve um QR/código falso e o pedido fica AGUARDANDO_PAGAMENTO.
- **C2** Dado o painel/endpoint de simulação (só em dev), então "aprovar" ou "recusar" dispara o webhook interno e o pedido muda de estado como no real.
- **C3** Dado que o número do cartão nunca chega à API (só o token do Brick; WB-152 C1, SEC-037), então o provedor `fake` recebe **tokens de texto**: `fake_tok_approved` (aprova), `fake_tok_insufficient` (recusa por saldo), `fake_tok_3ds` (exige 3DS) e `fake_tok_timeout` (timeout), e produz o resultado correspondente. A convenção fica documentada no README do back-end (R-19).
- **C4** Dado estorno no simulado, então total e parcial seguem as mesmas regras e geram eventos.
- **C5** Dado produção, então o provedor `fake` não sobe (RN do PRD).
- **C6** Dado a interface `PaymentProvider`, então outra implementação (ex.: Mercado Pago) pode ser plugada sem mudar o domínio do pedido (contrato único de criar, consultar, estornar, interpretar webhook).

### WB-151 Mercado Pago: PIX — Must — dep: WB-150, WB-155
Como cliente, quero pagar por PIX real, para confirmar na hora.
- **C1** Dado pedido, então criar pagamento PIX no provedor com valor, validade `pix_expiracao_min`, referência do pedido e (se split) a `application_fee` (comissão + taxa de entrega + taxa de serviço − cupom da plataforma, RN-10); retorna QR e copia e cola.
- **C2** Dado webhook de aprovação válido, então o pedido vai a RECEBIDO em <= 5 s.
- **C3** Dado PIX expirado, então o pagamento vira EXPIRADO e o pedido EXPIRADO (WB-024 C3).
- **C4** Dado erro do provedor (5xx/timeout), então nenhum pedido duplicado; tentativa segura com a mesma chave de idempotência.
- **C5** Dado valor menor que o mínimo do provedor, então a validação do carrinho já impede (RN-05, mínimo R$ 1,00).

### WB-152 Mercado Pago: cartão tokenizado — Must — dep: WB-150, WB-155
Como cliente, quero pagar com cartão sem expor dados, para parcelar.
- **C1** Dado o formulário seguro do provedor (Bricks/Checkout Transparente), então o app/servidor só recebe um token; nenhum número, CVV ou validade chega aos servidores ou logs do Webag.
- **C2** Dado parcelas, então o servidor valida parcelas <= `parcelas_max` e parcela >= `parcela_min_cents` e devolve o total com juros do provedor.
- **C3** Dado aprovação, recusa ou pendência (em análise), então cada resultado mapeia a estado e mensagem (WB-025); "em análise" mantém o pedido AGUARDANDO_PAGAMENTO por até 30 min `[HIPÓTESE]` e depois expira com estorno se aprovado tarde.
- **C4** Dado 3DS, então o fluxo de desafio é suportado.
- **C5** Dado captura posterior (HIP-010) viável, então: autoriza na criação, captura na aceitação da loja, cancela a autorização se recusado/timeout; senão captura imediata e estorna em caso de recusa.
- **C6** Dado auditoria de código, então busca por padrões de cartão (PAN, CVV) nos logs e no banco retorna zero.
- **C7** Dado a página/WebView do cartão, então o link da tentativa vale 10 min e uso único e o token não vai na query da URL; a página não carrega script além do próprio e do provedor; a navegação da WebView é limitada à lista permitida (inclui domínios do 3DS) e, se o 3DS do emissor não abrir, o fluxo cai para o navegador do sistema (SEC-107).

### WB-153 Webhooks seguros e reprocessamento — Must — dep: WB-150
Como financeiro/dev, quero que cada evento do provedor seja processado uma vez, com segurança, para não perder nem duplicar dinheiro.
- **C1** Dado webhook com assinatura inválida, então responde 401 e registra (sem processar).
- **C2** Dado o mesmo evento 2 vezes, então a segunda é ignorada com 200 (idempotência).
- **C3** Dado falha ao processar, então reprocessa com **5 tentativas, em 1, 5, 30, 120 e 720 min** e, esgotadas, vai a "falhas" no admin com payload mascarado. O evento é **gravado no banco antes de ser enfileirado** (outbox): se o Redis estiver fora quando o webhook chegar, a notificação não se perde e é enfileirada quando o Redis voltar (R-20).
- **C4** Dado "Reprocessar" no admin (perfil financeiro/super), então reexecuta com a mesma idempotência e audita.
- **C5** Dado eventos fora de ordem (estorno antes da aprovação), então são ordenados por consulta ao provedor, sem estado incoerente.
- **C6** Dado modo manutenção, então o webhook continua sendo aceito (WB-121 C2).
- **C7** Dado notificação com `ts` fora de 300 s, ou com `x-request-id` já visto nas últimas 24 h, então é rejeitada/ignorada (anti-replay); notificação sem assinatura (IPN legado) é rejeitada (SEC-104).
- **C8** Dado a notificação, então a loja e o token usados na re-consulta vêm da **tentativa de pagamento gravada na criação** (não de campo do corpo).
- **C9** Dado a re-consulta ao provedor, então o pagamento só é aprovado se referência do pedido, valor, moeda, recebedor e comissão (`application_fee`) baterem com o pedido; divergência vira alerta ao admin e o pedido não avança.
- **C10** Dado ambientes distintos, então cada um tem segredo de webhook próprio.

### WB-154 Estorno total e parcial — Must — dep: WB-151, WB-152
Como sistema, quero estornar corretamente, para devolver o dinheiro ao cliente.
- **C1** Dado pagamento APROVADO, então estorno total devolve o valor integral ao meio original e o pagamento fica ESTORNADO_TOTAL.
- **C2** Dado estorno parcial, então valor > 0 e <= pago − já estornado; o pagamento fica ESTORNADO_PARCIAL; soma de estornos nunca excede o pago.
- **C3** Dado estorno, então comissão, **taxa de entrega** e taxa de serviço são devolvidas proporcionalmente (total: integralmente) e o ledger reflete (RN-10); o custo já pago ao motoboy não volta (custo da Webag, WB-238 C4).
- **C4** Dado mesma solicitação duas vezes, então 1 estorno (idempotência).
- **C5** Dado provedor indisponível, então o estorno fica "pendente" e é retentado; cliente vê "Estorno em processamento".
- **C6** Dado split, então a divisão entre lojista e Webag segue o provedor (proporcional) e o estorno sai da conta do lojista; se o provedor recusar por saldo insuficiente do lojista, o estorno fica "pendente por saldo do lojista", o admin é alertado (WB-198) e decide entre suspender a loja e acionar a cobrança pelos Termos do Lojista. **Não há débito automático em repasse futuro** (DEC-016) [comportamento do MP com saldo negativo: verificar no sandbox, backend-dev].
- **C7** Dado PIX estornado, então volta à conta de origem; cartão, conforme o emissor; o app informa o prazo.
- **C8** Dado estorno "pendente por saldo do lojista" há mais de 48 h, então o admin recebe alerta crítico; cobrir o estorno com dinheiro da Webag e cobrar do lojista depois é decisão do fundador caso a caso (limite de exposição: WB-225).

### WB-155 Recebimento do lojista: split ou centralizado — Must — dep: pesquisa + ADR
Como Webag, quero reter a comissão e repassar ao lojista, para ter receita sem risco regulatório.
- **C1** Dado a pesquisa do MP (`pesquisa-mercado.md` §6), então o backend entrega um ADR em `docs/arquitetura/adr/` com a decisão split vs. centralizado, custos, KYC exigido do lojista e riscos, antes do código de produção do pagamento.
- **C2** Dado split, então o lojista conecta por OAuth (WB-053), os tokens são guardados criptografados, renovados antes de expirar, e cada pagamento leva a comissão (RN-10). A Webag **não retém, ajusta nem desconta** valores do lojista depois do pagamento (DEC-016); o repasse mostrado ao lojista é informativo.
- **C3** Dado token revogado ou expirado e não renovável, então a loja fica "Conexão com pagamento pendente", novos pedidos não entram e o lojista é avisado.
- **C4** Dado centralizado, então todo pagamento entra na conta da Webag e o ledger controla o saldo de cada loja e o repasse (WB-112); só ativo em produção após parecer jurídico registrado em `docs/decisoes.md`.
- **C5** Dado qualquer modo, então o extrato do lojista mostra os mesmos campos (RN-10).

### WB-156 Ledger: comissão, taxa e extrato — Must — dep: WB-154
Como financeiro, quero lançamentos contábeis por pedido, para que o extrato feche.
- **C1** Dado pagamento aprovado, então grava lançamentos: venda (itens), comissão (snapshot do percentual), **taxa de entrega (receita da Webag)**, taxa de serviço, taxa do provedor (quando conhecida), cupom da plataforma; custo de logística entra depois, por corrida (WB-239).
- **C2** Dado estorno/ajuste, então lançamentos inversos e proporcionais; nunca apaga lançamento (append-only).
- **C3** Dado o exemplo de RN-10 (R$ 100,00, cupom da loja R$ 10,00, taxa de entrega R$ 8,00, comissão 15%, PIX 0,99%), então o líquido do lojista é **R$ 75,53** e a receita Webag **R$ 21,50** (teste automatizado; **substitui** o exemplo antigo de R$ 88,03 e R$ 9,00, que vale só para comissão 10% com frete do lojista, modelo extinto pela DEC-036).
- **C4** Dado soma dos lançamentos de um pedido, então sempre = total pago − estornos (invariante verificada).
- **C5** Dado arredondamento, então half-up e diferença de centavo para o lojista (RN-01).
- **C6** Dado categorias diferentes no pedido, então comissão por item/categoria somada (RN-10).
- **C7** Dado frete grátis (limite de valor ou cupom), então a taxa de entrega é R$ 0, a `application_fee` mantém comissão + taxa de serviço e o subsídio (custo do motoboy sem taxa) aparece no relatório de logística (WB-240), nunca como lançamento negativo ao lojista.
- **C8** Dado a taxa de troca e a diferença de preço (WB-175, WB-245), então entram como receita de logística da Webag em cobrança separada, sem comissão da loja; o estorno da taxa (troca cancelada depois de paga) devolve o valor integral.
- **C9** Dado a soma dos lançamentos de um pedido, então a invariante C4 continua valendo com taxa de entrega e custos de logística separados (receita bruta, custo e receita líquida da Webag por pedido).

### WB-157 Conciliação diária — Must — dep: WB-153
Como financeiro, quero conferir o sistema contra o provedor, para achar divergência cedo.
- **C1** Dado o job diário (ex.: 03:00 BRT), então compara transações do provedor das últimas 48 h com os pagamentos internos.
- **C2** Dado divergência (faltando de um lado, valor ou status diferente), então cria registro para WB-113 com tipo e valores.
- **C3** Dado simulado, então o job usa os dados do simulado e o relatório funciona igual.
- **C4** Dado falha do job, então alerta ao admin (WB-198) e roda de novo.
- **C5** Dado reexecução, então não duplica divergências.

### WB-158 PIX tardio ou duplicado — Must — dep: WB-151, WB-154
Como sistema, quero tratar pagamento fora de hora, para nunca reter dinheiro indevido.
- **C1** Dado PIX confirmado após o pedido EXPIRADO, então o sistema estorna o valor integral automaticamente (ou, se o estoque permitir e o cliente estiver no app, oferece reativar `[HIPÓTESE; padrão: estornar]`) e notifica o cliente.
- **C2** Dado dois pagamentos aprovados para o mesmo pedido, então o segundo é estornado total.
- **C3** Dado pedido CANCELADO e pagamento aprovado depois, então estorno automático.
- **C4** Dado cada caso, então fica registrado como evento e aparece na conciliação como "tratado".

### WB-159 Chargeback — Should — dep: WB-153
Como financeiro, quero ser avisado de contestação de cartão, para me defender e ajustar o extrato.
- **C1** Dado webhook de chargeback, então o pagamento vira CONTESTADO e o admin é alertado; no modo centralizado o repasse correspondente fica retido, no split nada é retido pela Webag (o impacto segue o provedor, C4).
- **C2** Dado perda da contestação, então o ledger registra o débito à loja e o extrato mostra o motivo; no split a recuperação é pelos Termos do Lojista, não por desconto em repasse.
- **C3** Dado ganho, então libera a retenção.
- **C4** Dado split, então o impacto segue o provedor e o ledger registra.

### WB-160 Alternar simulado/real por .env e documentação — Must — dep: WB-151, WB-152, WB-153
Como dev/fundador, quero trocar para o Mercado Pago só preenchendo o `.env`, para ligar sem mexer em código.
- **C1** Dado `.env.example`, então lista Access Token, Public Key, Client ID/Secret (OAuth), segredo do webhook e URLs, com valores de exemplo (nenhum segredo real).
- **C2** Dado o README, então explica onde obter cada chave, como cadastrar a URL do webhook e como testar com contas de teste do MP.
- **C3** Dado chaves ausentes com `PAYMENT_PROVIDER=mercadopago` (e segredo de webhook por ambiente, WB-153 C10), então a aplicação falha ao iniciar com mensagem clara (não em runtime do pedido).
- **C4** Dado health check, então reporta provedor ativo e se está configurado (sem expor segredos).
- **C5** Dado produção, então bloqueia o provedor `fake` (WB-150 C5).

### WB-161 Segundo adaptador (Pagar.me ou Asaas) — Won't (1.0) — dep: WB-150
Como Webag, quero um segundo provedor, para reduzir dependência.
- **C1** Decisão: não entra na 1.0 (sem evidência de vantagem; `pesquisa-mercado.md` §6). A interface de WB-150 C6 garante que entre depois sem mudar o domínio.
- **C2** Reavaliar quando houver dado do piloto (taxa de aprovação, custo, KYC do lojista).

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Conta e chaves do Mercado Pago | Dependência do fundador | Simulado; `.env.example` |
| Split exige conta/KYC do lojista (atrito) | Risco de adoção | Onboarding guiado (WB-053) |
| Centralizado pode ser atividade regulada | Risco regulatório crítico | Preferir split; parecer jurídico; registrar em decisoes |
| Captura posterior com split pode não ser suportada | Risco técnico | HIP-010; ADR |
| Taxas reais do MP no Transparente não confirmadas | Risco de margem | Taxas parametrizáveis no ledger; validar com o MP |
| `application_fee` maior (comissão 15% + entrega + serviço): o MP pode ter teto ou regra para a parcela do marketplace; a taxa do MP incide sobre o total, que inclui a taxa de entrega, e no split quem paga é o lojista | Risco técnico/comercial | backend-dev confirma no sandbox (L.2); o fundador decide se a Webag assume a taxa do MP sobre a entrega |
| Taxa de troca é da Webag mas o split é por loja | Risco técnico | ADR do backend (cobrança na conta da Webag ou pedido de troca com `application_fee` integral) |
| NFS-e/tributos sobre taxa de entrega, taxa de troca e comissão | Risco fiscal | Contador do fundador |
| Chargeback e fraude no início | Risco financeiro | Limite R$ 2.000 (HIP-012), antifraude do MP |
| Lojista recebe, saca e some; estorno falha por saldo (SEC-105; sem retenção possível no split) | Risco financeiro, **risco residual aceito em DEC-016** | Limite de loja nova e alertas (WB-225), código de entrega (WB-226), estorno pelo admin e suspensão (WB-109), cobrança pelos Termos do Lojista |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Split suporta autorização+captura posterior e parcelamento? | backend-dev (ADR) |
| O MP permite ao marketplace definir prazo de liberação ao lojista (`money_release_days` ou equivalente)? E como se comporta com saldo negativo do lojista? | backend-dev (sandbox/contrato) |
| Quando o estorno falha por saldo do lojista, a Webag cobre com recurso próprio? Qual teto? | fundador |
| Tabela de taxas do Checkout Transparente e prazo de liberação ao lojista | fundador (conta MP) / backend-dev |
| Parecer sobre recebimento centralizado | fundador/jurídico, security-engineer |
