# PRD v1.1: Cupons e campanhas por fonte de custo

Status: pronta para sprint (lado do PO; DoR da R2 por história em `backlog.md` §10.8) | Dono: product-owner | Data: 2026-11-22 | Atualizado: 2026-11-22 (DoR: controles C-CUP-* do threat model como critérios; DEC-103 D-01 e D-03; DEC-107; respostas em `v1-1-respostas-ao-time.md`; fechamento da R2: WB-340 C12, WB-341 C2/C3, WB-344 C4 e C14, WB-347 C6 e C10, tabela de mensagens, eventos de "Faltam") | Histórias: WB-340 a WB-349
Base: `regras-de-negocio.md` RN-09 e RN-10; `v1-1-pesquisa.md` §1 e §2; DEC-016, DEC-060 (alvo do cupom da plataforma), SEC-155, SEC-170; WB-116 (cupons da plataforma, aceita com pendência); WB-073 (absorvida por WB-346).

## Problema
- **Quem sofre:** o fundador (precisa de alavanca de crescimento sem perder dinheiro nem a confiança do lojista), o lojista (não quer pagar desconto que não escolheu) e o cliente (quer saber o que vale e quanto paga).
- **Evidência:** o v1.0 tem 3 tipos de cupom (percentual, fixo, frete grátis) e 2 donos (loja, plataforma), com teto `cupom_plataforma <= application_fee` (RN-09). Não há campanha, orçamento por dia, cofinanciamento, relatório de custo real nem antifraude além de 1 uso por cliente. Cupons da plataforma ficam presos a "todas as lojas" (DEC-060) e WB-073 está na fase 2.
- **O teto atual não protege o fundador:** `application_fee` (comissão + frete + taxa de serviço) é antes do custo do motoboy. No seed o custo previsto do motoboy supera a taxa cobrada (`relatorio-final.md` (d)4): um cupom "dentro do teto" pode tornar o pedido deficitário.
- **Pedido do fundador (d), "cupom fake" que custa zero ao Webag inflando preço ou frete:** **recusado** (`pesquisa` §2): não há evidência de que o iFood faça isso, há norma e processo ativos (CDC art. 37 e 67; Portaria Senacon 61/2026) e o risco cai sobre o Webag. O PRD entrega o efeito comercial por vias legítimas (fonte "Autofinanciado").

## Objetivo e métrica de sucesso
Dar ao admin autonomia para criar campanhas com **quem paga explícito**, orçamento duro e relatório do **custo real**, sem pedido deficitário por causa de cupom e sem desconto na loja sem adesão dela.

| Métrica `[HIPÓTESE]` | Meta | Fonte |
|---|---|---|
| Campanhas ativas que estouram o orçamento (gasto > orçamento) | 0 | `coupon_redemptions` x orçamento |
| Pedidos com cupom da plataforma e margem de contribuição prevista < 0 | 0 (por regra) | snapshot do pedido |
| Lojas descontadas por campanha sem aceite registrado | 0 | aceites x resgates |
| Custo Webag por cliente novo (CAC de cupom) | medir; decidir no piloto | relatório WB-345 |
| Usos suspeitos bloqueados / usos totais | medir | WB-344 |
| Tempo para o admin criar e ativar uma campanha | <= 3 min (teste de usabilidade) | observação |

## Fora do escopo (com gatilho de volta)
| Item | Motivo | Gatilho |
|---|---|---|
| "Cupom fake" (preço, frete ou taxa inflados) | Ilegal ou de alto risco (CDC art. 37; Portaria 61/2026) | Nunca na forma inflada. Se o fundador quiser que o cliente financie, usar **taxa de serviço visível** (decisão F3) |
| Desconto por PIX | Legal (Lei 13.455/2017) mas conflita com DEC-052 (sem destaque ao PIX) | Fundador revisar DEC-052 |
| Cashback, pontos, assinatura (cliente paga para ter benefício) | É fase 2 (WB-310 a 324) | Recompra < 25% em 90 dias (HIP-043) |
| Crédito pré-pago ou vale com saldo no Webag | Pode ser arranjo de pagamento regulado (BCB); jurídico | Parecer J23 |
| Grupo de controle aleatório em campanha | Tratamento desigual de preço; sem parecer | Parecer J23 |
| Cupom cumulativo (mais de 1 por pedido) | Mantém HIP-037 | Pedido de 3 lojas |
| Segmentação por e-mail ou lista de clientes | Exige marketing opt-in (WB-196) | WB-197 entregue |

## Usuários e cenários
| Persona | Cenário |
|---|---|
| Yago (admin, super admin/financeiro) | Cria campanha "Primeira compra R$ 8", escolhe Autofinanciado, vê o pedido mínimo necessário, define orçamento diário R$ 100 e total R$ 800, ativa; no 5º dia lê o custo real |
| Admin operação | Prepara rascunho e convida 5 lojas para uma campanha cofinanciada 50/50; só o super admin ativa |
| Seu Marcos (lojista) | Recebe o convite, vê quanto vai pagar e quanto recebe por pedido, aceita com teto próprio de R$ 150/mês; ou cria um cupom próprio de 10% |
| Carla (cliente) | Digita o código, vê "Desconto Webag R$ 8" ou "Desconto da loja R$ 5" e o novo total; se faltar valor, vê "Faltam R$ 12 para usar o cupom" |

## Requisitos funcionais
1. **Campanha** (nova camada sobre `coupons`): nome, objetivo, fonte de custo, tipo (percentual com teto em R$, valor fixo, frete grátis), pedido mínimo, público (todos, primeira compra, reativação: sem pedido entregue há N dias), alvo (todas as lojas e cidades; cidade; loja; categoria), validade, orçamento total e diário, usos totais, usos por cliente (padrão 1), código (opcional; sem código vale para cliente elegível com aplicação automática, Could).
2. **Fontes de custo** (rótulos da tela): **Webag paga**, **Loja paga**, **Dividido (loja X% e Webag Y%)**, **Autofinanciado (sai da margem do próprio pedido)**.
3. **Motor de aplicação** com o desconto dividido em `desconto_loja` e `desconto_webag` (RN-09 e RN-10 inalteradas; ver Regras).
4. **Orçamento** com reserva atômica ao criar o pedido, confirmação ao pagar e devolução ao expirar ou cancelar.
5. **Adesão da loja** por campanha (convite, aceite com teto próprio, saída).
6. **Antifraude:** 1 uso de primeira compra por pessoa (CPF do pagador quando existir e conta; celular não entra, DEC-103 D-01), por aparelho (id de instalação opaco) e por endereço normalizado; sinais de velocidade; painel "Suspeitos".
7. **Relatório de custo real** por campanha, por loja e por fonte, com exportação CSV.
8. **Transparência ao cliente:** a vitrine e a sacola mostram a regra completa e a origem do desconto.
9. **Controles do admin:** pausar e encerrar na hora, alertas de orçamento (80% e 100%), histórico de alterações com autor e motivo (auditoria).
10. **Cupom próprio do lojista** (WB-073 absorvida).
11. **Preço de referência** do "de/por" da loja com histórico mínimo de 30 dias.

## Regras de negócio
**RN-C1 Fontes legítimas.** Só existem as 4 fontes. Não existe campo, parâmetro ou rotina que majore preço de produto, taxa de entrega ou taxa de serviço por causa de um cupom. O preço, a taxa de entrega e a taxa de serviço exibidos antes do cupom são os mesmos com ou sem cupom (teste automatizado; WB-347 C3 e C10). A taxa de serviço, se um dia existir (F3), é parâmetro global (RN-02), igual para todo pedido da mesma faixa, nunca condicionada à presença, ao valor ou à fonte de um cupom; a campanha só **lê** preço, entrega e taxa, nunca escreve neles (WB-341 C9: o contrato aceita só `code`).

**RN-C2 Divisão do desconto** (centavos, `round_half_up`, RN-01):
```
desconto_bruto = regra da campanha (percentual com teto, fixo ou frete)      (<= subtotal; frete: <= taxa_entrega)
desconto_loja  = round(desconto_bruto x loja_pct / 100)
desconto_webag = desconto_bruto - desconto_loja
Webag paga: loja_pct = 0 | Loja paga: 100 | Dividido: 1 a 99 | Autofinanciado: 0
Frete grátis: só Webag paga ou Autofinanciado (a loja não é dona do frete, DEC-036)
```
`desconto_loja` é o `cupom_loja` da RN-10 (reduz a base da comissão); `desconto_webag` é o `cupom_plataforma` (reduz a `application_fee`). Exemplo (dividido 50/50, desconto R$ 10, subtotal R$ 100, entrega R$ 8, comissão 15%, PIX 0,99%): `cupom_loja` 5,00; base 95,00; comissão 14,25; total R$ 98,00; `application_fee` = 14,25 + 8,00 - 5,00 = **17,25**; líquido da loja = 100,00 - 5,00 - 14,25 - 0,97 = **79,78**.

**RN-C3 Tetos (todos valem ao mesmo tempo).**
1. `desconto_webag <= application_fee` antes do cupom (RN-09, DEC-016; split).
2. **Autofinanciado:** `desconto_webag <= floor(autofin_teto_pct/100 x margem_prevista)`, com
   `margem_prevista = comissao + taxa_servico + taxa_entrega - custo_previsto_motoboy` (custo previsto da faixa do pedido; retirada: custo 0). `autofin_teto_pct` padrão **50** `[HIPÓTESE]`, parâmetro (RN-02). Margem <= 0: o cupom autofinanciado não se aplica.
3. **No Autofinanciado o desconto não é cortado: o cupom ou vale inteiro ou não se aplica**, para a oferta não ser maior que o entregue (CDC art. 30). Se `desconto_bruto` excede o teto, a sacola mostra "Faltam R$ X para usar o cupom" (X = subtotal adicional que libera o desconto). Nos tipos "Webag paga" e percentual com teto vale o corte da RN-09 e o texto da vitrine diz "até R$ N".
4. Exemplo (taxa de serviço R$ 0,00, o padrão, F3 desligada): pedido R$ 80, comissão 15% = 12,00, entrega R$ 9,00 e custo previsto R$ 11,00: margem = 12,00 + 0,00 + 9,00 - 11,00 = 10,00; teto 50% = 5,00. Cupom de R$ 5,00 se aplica. Cupom de R$ 8,00 exige margem >= 16,00, ou seja, subtotal >= R$ 120,00: "Faltam R$ 40,00". **Com margem de entrega negativa (seed), o autofinanciado só destrava cesta grande**: é o efeito desejado e a razão da decisão F4.
5. "Webag paga" acima da margem (até a `application_fee`) exige **super admin**, texto de aviso ("pode gerar prejuízo por pedido") e orçamento obrigatório.

**RN-C4 Orçamento.** Webag: `orcamento_total` e `orcamento_dia` em centavos, **obrigatórios** em qualquer campanha com `desconto_webag > 0`. Reserva do `desconto_webag` na criação do pedido (AGUARDANDO_PAGAMENTO); vira gasto ao pagamento aprovado; volta ao expirar, cancelar ou estornar (parcial: proporcional, RN-08). Sem saldo para o desconto inteiro, o cupom responde "Cupom esgotado". Campanha encerra sozinha ao esgotar orçamento, usos ou validade; o dia vira à meia-noite de `America/Sao_Paulo`. Loja: `teto_loja_mensal` próprio (opcional, mesma lógica).

**RN-C5 Adesão da loja.** Campanha com `loja_pct > 0` só desconta de lojas com **aceite registrado** (usuário, hora, versão do texto, teto próprio). Convite por painel e e-mail; o texto mostra por pedido de exemplo "você recebe R$ X (sem o cupom: R$ Y)". Saída a qualquer momento vale para pedidos novos; pedido já criado mantém a regra. Nunca existe adesão automática, nem "padrão para novas campanhas" (lição do caso 99Food, `pesquisa` §1). Cláusula nos Termos do Lojista (J27).

**RN-C6 Antifraude.** (a) Primeira compra: 1 por pessoa, medida por CPF do pagador (quando o provedor devolve), conta, aparelho e endereço, **nunca por celular** (o sistema não verifica celular: SEC-197, DEC-103 D-01); (b) 1 por id de instalação do app; (c) 1 por endereço normalizado (CEP + número + complemento sem acento e sem espaços; fecha SEC-170); (d) cupom da plataforma e "primeira compra" exigem **e-mail confirmado** (DEC-014); **sem OTP de celular no piloto**: o controle principal é o teto de orçamento por campanha, por dia e por cliente/aparelho (RN-C4, WB-344 C4 e C14); OTP só pelo gatilho da RN-C11. **Teto por cliente/aparelho:** `usos_por_cliente` (padrão 1) vale por conta **e** por id de instalação (HMAC), somando as contas do mesmo aparelho; reinstalar o app gera outro id, e é por isso que o orçamento por dia e por campanha, não o aparelho, é o controle que fecha o risco `[HIPÓTESE]`; (e) recusa em autoconsumo (membro da loja, SEC-061); (f) sinal de velocidade: 3 ou mais contas no mesmo aparelho, endereço ou pagador em 24 h, ou 3 cancelamentos com cupom em 7 dias, tira o cupom do próximo pedido e abre "Suspeitos"; (g) loja com mais de 30% dos usos de uma campanha da plataforma gera alerta (antecipa o DT-059); (h) limite de tentativas de código: 10 por hora por conta, 30 por hora por IP e 10 por hora por aparelho; código de campanha segmentada ou privada é gerado pelo sistema com 8 ou mais caracteres aleatórios (código "vaidade" só em campanha pública). Identificadores guardados só como hash com segredo (HMAC); retenção 12 meses `[HIPÓTESE]`; base legal: prevenção à fraude (LGPD art. 7º IX, `[HIPÓTESE; encarregado]`). Decisão final sobre o que medir: Security.

**RN-C7 Transparência.** Vitrine e sacola mostram: valor, condição ("pedido a partir de R$ 50", "primeira compra"), validade e "Desconto Webag" ou "Desconto da loja" (ou "Desconto Webag e loja"). O resumo do pedido discrimina: produtos, desconto (com origem), entrega, taxa de serviço, total (Decreto 7.962/2013; Portaria Senacon 61/2026, J22). Promessa da campanha = comportamento: mensagem e regra vêm da mesma configuração.

**RN-C8 Preço de referência.** O selo "de R$ X por R$ Y" e o percentual de desconto da loja só aparecem se o preço "de" foi praticado de fato por **30 dias seguidos** nos últimos 60 `[HIPÓTESE; jurídico J23]`; senão mostra só o preço atual. O histórico de preço é guardado por produto.

**RN-C9 Custo real** de uma campanha = soma de `desconto_webag` dos pedidos com pagamento aprovado, **menos** o devolvido em cancelamento e estorno. Custo por cliente novo = custo real / clientes cujo 1º pedido pago usou a campanha. Margem de contribuição dos pedidos com cupom = `receita_webag - custo_logistica - desconto_webag` (custo de logística quando lançado, RN-18).

**RN-C10 Cupom próprio da loja (DEC-103 D-03).** Parâmetro `cupom_loja_pct_max` (padrão **30**, editável só pelo super admin, com auditoria). Cupom percentual acima dele é recusado no cadastro. Cupom de valor fixo exige pedido mínimo >= valor / (`cupom_loja_pct_max`/100), arredondado para cima ao centavo (desconto de R$ 20,00 exige mínimo de R$ 66,67). Alerta ao admin se 3 contas ou menos concentram mais de 50% dos usos em 7 dias (evasão de comissão: cupom alto e pagamento por fora). Parte da loja em campanha dividida segue a adesão (RN-C5), não este teto.

**RN-C11 Antifraude: mensagens e escala (DEC-107).** (1) O cliente nunca vê qual identificador casou. Conta com pedido pago anterior: "Cupom válido só na primeira compra". Qualquer outro sinal (CPF de outra conta, aparelho, endereço, velocidade): "Não foi possível aplicar este cupom a este pedido", com "Falar com o suporte". Código inexistente ou fora do público-alvo: "Cupom inválido" (mesmo texto). Motivo detalhado só para regra pública (mínimo, validade, esgotado). (2) **Gatilho para pedir OTP de celular** (custo de SMS ou WhatsApp, regra 6, decisão do fundador): usos suspeitos acima de 20% por 7 dias (WB-349 C3) ou orçamento mensal de cupons Webag acima de R$ 1.000 `[HIPÓTESE]`. (3) Orçamento mensal global de cupons Webag = R$ 0 até o fundador definir (DEC-102 F2): sem ele, só "Loja paga" ativa.

## Requisitos não funcionais
- Aplicar cupom: p95 <= 300 ms; reserva de orçamento atômica (duas compras simultâneas nunca passam o orçamento; teste de concorrência).
- Auditoria: toda criação, alteração, pausa e ativação em `audit_log`, com motivo; ativar campanha com custo Webag exige 2º fator recente (step-up) do super admin.
- Acessibilidade e conteúdo: valores e condições em texto, não só em cor; sem emoji.
- LGPD: relatórios sem dado pessoal (IDs opacos); lista de "Suspeitos" mostra pedido e sinal, com revelar dado auditado (padrão SEC-144).
- Ledger: soma zero preservada; o custo da campanha é conciliável com o ledger (pergunta ao backend-dev, abaixo).

## Estados da campanha
`RASCUNHO` -> `AGENDADA` -> `ATIVA` <-> `PAUSADA` -> `ENCERRADA` (por validade, orçamento, usos ou admin). Campanha com adesão: `CONVITE_ENVIADO` (lojas em `PENDENTE`, `ACEITOU`, `RECUSOU`, `SAIU`) -> `ATIVA` só nas lojas que aceitaram. Quem muda: operação cria e edita rascunho; **super admin ou financeiro** ativa e encerra campanha com custo Webag; qualquer admin com permissão de cupom pausa. `ENCERRADA` não reabre (duplica).

## Histórias e critérios de aceite

### WB-340 Admin: criar campanha com fonte de custo — Must — dep: WB-116, WB-119
Como admin, quero criar uma campanha escolhendo quem paga, para controlar o custo do desconto.
- **C1** Dado o formulário, quando escolho a fonte "Autofinanciado" e informo o desconto, então vejo o **pedido mínimo necessário** por faixa de entrega e não consigo ativar com pedido mínimo menor que o necessário na faixa mais cara que a campanha cobre.
- **C2** Dado fonte "Dividido", quando informo 40% para a loja, então o resumo mostra "Loja 40% e Webag 60%" e um exemplo em reais.
- **C3** Dado tipo frete grátis, quando escolho "Loja paga" ou "Dividido", então o sistema recusa com "O frete é da Webag".
- **C4** Dado campanha com custo Webag sem orçamento total ou diário, então o botão Ativar fica indisponível com o que falta.
- **C5** Dado fonte "Webag paga" com margem prevista menor que o desconto, quando o admin não é super admin, então não pode ativar e vê o motivo.
- **C6** Dado perfil operação, quando salvo, então a campanha fica em `RASCUNHO`; ativar ou encerrar campanha com custo Webag exige super admin ou financeiro com 2º fator confirmado há até 5 minutos.
- **C7** Dado qualquer alteração, então `audit_log` guarda autor, antes e depois e motivo.
- **C8** (C-CUP-08) Dado perfil operação tentando ativar campanha com custo Webag, então 403; dado super admin ou financeiro sem 2º fator recente, então 401 com pedido do 2º fator.
- **C9** (C-CUP-08) Dado `autofin_teto_pct` (global, padrão 50; não existe por campanha), o orçamento mensal global e "Webag paga acima da margem", quando alterados por quem não é super admin, então 403; quando pelo super admin, então `audit_log` guarda antes e depois.
- **C10** (DEC-102 F2) Dado orçamento mensal global de cupons Webag igual a R$ 0 (padrão), quando tento ativar campanha com `desconto_webag > 0` (Webag paga, Dividido ou Autofinanciado), então "Ativar" fica indisponível com "Orçamento mensal de cupons da Webag é R$ 0. Defina em Configurações" e o rascunho continua salvável; campanha "Loja paga" não é afetada.
- **C11** Dado a soma dos orçamentos das campanhas ativas maior que o orçamento mensal global, então "Ativar" recusa e mostra quanto falta.
- **C12** (design CU-2) Dado campanha de tipo percentual com custo Webag (Webag paga ou Dividido), então a simulação mostra, além do pedido de referência, o **pior caso por pedido** (o teto em R$ do desconto, parte Webag) e o custo máximo por pedido x orçamento do dia ("até N pedidos no pior caso"); sem teto em R$ o percentual não salva.

### WB-341 Motor: dividir o desconto e aplicar os tetos — Must — dep: WB-340, WB-238
Como Webag, quero que o desconto nunca passe do que o pedido rende, para não ter prejuízo por cupom.
- **C1** Dado o exemplo da RN-C2 (dividido 50/50), então `cupom_loja` 5,00, `application_fee` 17,25 e líquido da loja 79,78 (teste automatizado contra o oráculo de comissão).
- **C2** Dado o exemplo da RN-C3 item 4 (comissão 15%, taxa de serviço R$ 0,00, entrega R$ 9,00, custo previsto R$ 11,00, subtotal R$ 80,00), quando aplico cupom autofinanciado de R$ 8,00, então a sacola mostra "Faltam R$ 40,00 para usar o cupom" e o total não muda.
- **C3** Dado os mesmos parâmetros e subtotal R$ 120,00 (margem = 18,00 + 9,00 - 11,00 = 16,00; teto 8,00), então o desconto de R$ 8,00 se aplica por inteiro; com subtotal R$ 119,99 mostra "Faltam R$ 0,01".
- **C4** Dado margem prevista <= 0 (custo do motoboy maior que comissão mais taxa), então o cupom autofinanciado não se aplica e o texto é "Cupom não disponível para este pedido".
- **C5** Dado pedido de retirada, então o custo previsto do motoboy é 0 na margem.
- **C6** Dado o pedido criado, então o snapshot guarda campanha, fonte, `desconto_loja`, `desconto_webag`, `autofin_teto_pct` e `margem_prevista` do momento; mudança posterior de tabela não altera o pedido.
- **C7** Dado estorno parcial, então o desconto é devolvido proporcionalmente (RN-08) e o orçamento recebe a devolução.
- **C8** Dado `application_fee` insuficiente para o desconto da plataforma, então vale o corte da RN-09 (nunca negativa).
- **C9** (C-CUP-01) Dado cotação ou pedido com campo extra (`discountCents`, fonte de custo ou `campaignId`), então 422 (Zod `.strict()`), a requisição aceita só `code` (até 32 caracteres, `[A-Z0-9-]`) e o total é o do oráculo de comissão.
- **C10** (C-CUP-09) Dado um gerador de 10 mil carrinhos aleatórios (faixas, retirada, estorno parcial), então nenhum pedido tem `application_fee < 0` nem autofinanciado com margem negativa; os tetos são calculados no servidor com a tabela vigente e gravados no snapshot.
- **C11** Dado o custo previsto do motoboy por faixa, então vem do parâmetro `entrega_custo_motoboy_faixa_cents` (RN-02, editável por super admin e financeiro com auditoria); enquanto o fundador não cotar (F4), vale a tabela do seed marcada `[HIPÓTESE]` e a tela de campanha mostra "custo previsto: tabela provisória".

### WB-342 Orçamento total, diário e usos — Must — dep: WB-341
Como admin, quero um orçamento duro, para não gastar além do que decidi.
- **C1** Dado orçamento diário de R$ 100 e R$ 96 reservados, quando um pedido exige R$ 8, então a resposta é "Cupom esgotado hoje" e o pedido segue sem cupom se o cliente confirmar.
- **C2** (C-CUP-02) Dado 20 pedidos simultâneos disputando os últimos R$ 40 de orçamento, então no máximo R$ 40 são reservados (teste de concorrência). A reserva ocorre **na mesma transação** do pedido, com trava na linha da **campanha** (não só do cupom) e, quando `loja_pct > 0`, na linha de adesão da loja; confere orçamento total, diário (data em `America/Sao_Paulo`), usos e teto mensal da loja antes do commit. Variantes obrigatórias do teste: 2 códigos da mesma campanha e a virada da meia-noite.
- **C3** Dado pedido que expira sem pagamento, então a reserva volta ao orçamento e ao saldo de usos do cliente (RN-08).
- **C4** Dado 80% e 100% do orçamento, então o admin recebe alerta no painel; ao esgotar, a campanha vira `ENCERRADA` com motivo "orçamento".
- **C5** Dado meia-noite em `America/Sao_Paulo`, então o orçamento diário reinicia.
- **C6** Dado campanha sem usos totais definidos, então a tela exige o limite ou o orçamento (um dos dois).
- **C7** (C-CUP-03) Dado expiração e cancelamento do mesmo pedido em paralelo, então a reserva (estados `reservada`, `confirmada`, `devolvida`, transição condicional) é devolvida uma só vez; o estorno parcial devolve no máximo o valor confirmado.

### WB-343 Adesão da loja à campanha — Must — dep: WB-340, WB-192
Como lojista, quero aceitar ou recusar o custo de uma campanha, para nunca pagar um desconto que não escolhi.
- **C1** Dado campanha com parte da loja, quando o admin ativa, então a loja só entra se tiver aceite; sem aceite a campanha não aparece nem desconta naquela loja.
- **C2** Dado o convite, então o lojista vê sua parte em %, um pedido de exemplo ("você recebe R$ 79,78; sem cupom, R$ 83,93"), validade e seu teto mensal, e aceita com um toque de confirmação.
- **C3** Dado aceite, então o sistema grava usuário, hora, versão e hash do texto.
- **C4** Dado que a loja sai da campanha, então pedidos novos não usam a campanha e os já criados mantêm o desconto.
- **C5** Dado `teto_loja_mensal` atingido, então a campanha para naquela loja e o lojista é avisado.
- **C6** Dado funcionário sem permissão de cupons, então não vê nem aceita convite.
- **C7** Dado lojista que nunca respondeu em 7 dias, então o convite expira sem custo (sem aceite tácito).
- **C8** (C-CUP-07) Dado admin (qualquer perfil), funcionário sem permissão `cupons` ou membro de outra loja, quando tenta criar cupom com `loja_pct > 0` ou registrar aceite em nome da loja (inclusive pela visão "Ver como"), então 403 ou 404 e nada é gravado; a loja vem da rota e da membership, nunca do corpo.

### WB-344 Antifraude de cupom e painel "Suspeitos" — Must — dep: WB-341, SEC-155, SEC-170
Como admin, quero impedir uso repetido e multiconta, para o orçamento chegar a clientes novos de verdade.
- **C1** Dado cupom de primeira compra e CPF do pagador que já pagou um pedido, quando tento usar com outra conta, então o cupom é recusado com "Cupom válido só na primeira compra".
- **C2** Dado o mesmo id de instalação com 2 contas, quando a 2ª usa o cupom de primeira compra, então é recusado.
- **C3** Dado o mesmo endereço normalizado (complemento "Apto 1" e "apto1"), então conta como o mesmo endereço.
- **C4** (reescrito: DEC-103 D-01, sem OTP de celular no piloto) Dado conta sem e-mail confirmado (DEC-014), então o cupom da plataforma e o de "primeira compra" são recusados com "Confirme seu e-mail para usar este cupom" e a ação "Confirmar e-mail"; o celular do perfil **não** é critério (não é verificado) e nenhuma tela ou mensagem de cupom pede "confirmar celular".
- **C14** (D-01: os tetos no lugar do OTP) Dado campanha com `usos_por_cliente` = 1, então: (a) conta que já usou: "Você já usou este cupom" (campanha de primeira compra: "Cupom válido só na primeira compra", C1); (b) outra conta no **mesmo aparelho** que já usou: "Não foi possível aplicar este cupom a este pedido" com "Falar com o suporte" (RN-C11; não revela o aparelho); (c) orçamento total, do dia ou usos totais esgotados: "Cupom esgotado" ou "Cupom esgotado hoje"; (d) as quatro checagens valem mesmo que mínimo, validade e público passem, e a ordem é fixa (esgotado antes de conta e aparelho) para a resposta não variar com o tempo; (e) o teste de concorrência da WB-342 C2 cobre o par "2 contas, 1 aparelho".
- **C5** Dado membro da loja comprando na própria loja, então recusa em campanha da plataforma, dividida, de loja e autofinanciada (SEC-061; C-CUP-13).
- **C6** Dado 3 contas no mesmo aparelho em 24 h, então o sinal aparece em "Suspeitos" e o próximo pedido da conta não recebe cupom até o admin liberar.
- **C7** Dado loja com mais de 30% dos usos da campanha, então alerta ao admin.
- **C8** (C-CUP-06) Dado 10 tentativas por hora por conta, 30 por hora por IP ou 10 por hora por aparelho, então a tentativa seguinte retorna 429 com texto neutro e bloqueio de 1 hora; código inexistente e código segmentado de outro público respondem o mesmo "Cupom inválido".
- **C9** Dado cliente legítimo bloqueado por engano, então o admin libera com motivo e o evento fica na auditoria.
- **C10** (C-CUP-04) Dado 2 contas do mesmo aparelho, 2 campanhas de primeira compra e pedidos simultâneos, então só 1 passa: a primeira compra é travada **por identificador** (HMAC de conta, aparelho, endereço normalizado e documento, em ordem fixa, `pg_advisory_xact_lock`), valendo entre campanhas, e a reconferência ocorre sob essa trava.
- **C11** (C-CUP-05) Dado qualquer tabela nova do antifraude, então guarda só HMAC com chave dedicada (`COUPON_FRAUD_HMAC_KEY`, obrigatória no boot, rotacionável), sem CPF, endereço ou id de aparelho em claro, nem em log nem em exportação; o job de expurgo apaga o que passa de 12 meses (teste: 12 meses e 1 dia).
- **C12** (C-CUP-12) Dado "Suspeitos", então a resposta traz só ids opacos (sem nome, telefone nem endereço) e revelar dado é pedido a pedido, com motivo e auditoria (SEC-144); CSV com o helper do SEC-156.
- **C13** (RN-C11) Dado recusa por qualquer sinal que não seja a própria conta com pedido pago anterior (CPF de outra conta, aparelho, endereço, velocidade), então o texto é "Não foi possível aplicar este cupom a este pedido" com "Falar com o suporte"; o cliente nunca vê qual identificador casou (C9 libera o legítimo).

### WB-345 Relatório de custo real por campanha — Must — dep: WB-341, WB-114
Como fundador, quero ver quanto cada campanha custou de fato e o que trouxe, para decidir manter ou parar.
- **C1** Dado campanha com 10 pedidos pagos e 2 cancelados, então "custo real Webag" soma só os 8 e mostra "devolvido em cancelamentos" separado.
- **C2** Dado campanha dividida, então o relatório mostra o total pago pelo Webag e o total pago pelas lojas, por loja.
- **C3** Dado a campanha, então mostra pedidos, GMV, ticket médio com cupom e ticket médio sem cupom da mesma loja no período, clientes novos, custo por cliente novo e recompra em 30 dias (preenche após 30 dias).
- **C4** Dado "margem de contribuição", então usa a logística lançada e marca "parcial" quando há corrida sem custo registrado (RN-18).
- **C5** Dado o total do relatório, então bate com a soma dos resgates confirmados e com a conciliação do ledger (teste).
- **C6** Dado exportação CSV, então valores em reais com vírgula, UTF-8 e células iniciadas por `=`, `+`, `-` ou `@` escapadas (SEC-156).
- **C7** Dado campanha sem uso, então o relatório mostra estado vazio com "Nenhum pedido ainda".
- **C8** (C-CUP-12) Dado o relatório e o CSV, então a resposta não traz nome, telefone nem endereço (teste de contrato); só ids opacos.

### WB-346 Lojista cria cupom próprio (absorve WB-073) — Should — dep: WB-341, WB-343
Como lojista, quero criar um cupom da minha loja, para promover sem depender do admin.
- **C1** Dado o formulário, então escolho percentual ou valor fixo, pedido mínimo, validade, usos totais e por cliente e **teto mensal em R$** (obrigatório).
- **C2** Dado o cupom, então a prévia mostra "Você recebe R$ X por pedido de R$ Y com este cupom".
- **C3** Dado funcionário sem permissão de cupons, então não cria.
- **C4** Dado cupom da loja, então vale só na própria loja e não gera desconto Webag (`loja_pct` 100).
- **C5** Dado teto mensal atingido, então o cupom pausa e o lojista é avisado.
- **C6** Dado o admin, então pode pausar qualquer cupom de loja com motivo (auditoria) e o lojista é avisado.
- **C7** (C-CUP-11, DEC-103 D-03) Dado `cupom_loja_pct_max` (padrão 30), quando o lojista configura cupom percentual acima dele, então 422 "O desconto máximo da loja é 30%"; cupom de valor fixo exige pedido mínimo >= valor / (teto/100) (desconto de R$ 20,00 exige mínimo de R$ 66,67).
- **C8** (C-CUP-11) Dado 3 contas ou menos concentrando mais de 50% dos usos de um cupom da loja em 7 dias, então alerta ao admin (evasão de comissão).

### WB-347 Cliente: ver a origem e a composição do desconto — Must — dep: WB-341, WB-023
Como cliente, quero ver o que o cupom vale, de quem é e quanto pago no total, para confiar no preço.
- **C1** Dado cupom aplicado, então o resumo mostra linhas separadas: produtos, desconto ("Desconto Webag" ou "Desconto da loja"), entrega, taxa de serviço e total.
- **C2** Dado a vitrine do cupom, então mostra valor, condição, validade e restrições (primeira compra, loja, mínimo) em texto.
- **C3** Dado o mesmo carrinho com e sem cupom, então produtos, entrega e taxa de serviço têm o mesmo valor (teste automatizado de RN-C1).
- **C10** (DEC-088, propriedade) Dado 10 mil carrinhos aleatórios (lojas, faixas, retirada, as 4 fontes e os 3 tipos), então para cada um subtotal de produtos, taxa de entrega e taxa de serviço **antes do cupom** são iguais aos do mesmo carrinho sem cupom, e nenhuma resposta de cotação ou pedido traz preço de produto diferente do catálogo vigente; o teste roda no CI e uma mudança que quebre a igualdade reprova o build.
- **C4** Dado cupom inválido, esgotado ou fora da validade, então a mensagem diz o motivo e o que fazer ("Cupom esgotado", "Faltam R$ 12", "Válido até 31/12").
- **C5** Dado sem internet, então o app mantém o último resumo e não aplica cupom até reconectar.
- **C6** (C-CUP-06) Dado cupom inexistente, de campanha segmentada ou de outro público-alvo, então a resposta é "Cupom inválido" (o mesmo texto); o motivo detalhado só aparece para regra pública (mínimo, validade, esgotado). "Vale só na loja X" aparece apenas se a campanha é **pública** e listada na vitrine; código de campanha privada ou segmentada de outra loja responde "Cupom inválido". Os textos ao cliente vêm da tabela "Mensagens ao cliente" abaixo (fonte única; a spec de tela e o app não criam texto próprio).
- **C7** Dado a vitrine de cupons, então lista só cupons públicos aplicáveis agora ou aplicáveis com "Faltam R$ X"; nunca lista cupom segmentado, de outro público ou esgotado.
- **C8** Dado cupom de frete grátis, então o resumo mostra "Entrega R$ 8,00" e, em linha separada, "Desconto Webag (frete) -R$ 8,00"; nunca "Entrega: Grátis" no lugar do valor (RN-C1; a rubrica final depende do J22).
- **C9** Dado "Faltam R$ X", então a ação oferecida é "Ver mais da loja" (sem sugerir produto) e a validade aparece como "Válido até 31/12" (o dia final vale até 23:59 em `America/Sao_Paulo`).

### WB-348 Selo "de/por" só com preço de referência comprovado — Should — dep: WB-062
Como cliente, quero que o desconto anunciado seja real, para não ser enganado.
- **C1** Dado produto com promoção, quando o preço "de" não foi praticado por 30 dias nos últimos 60, então a vitrine mostra só o preço atual e nenhum percentual.
- **C2** Dado preço "de" comprovado, então a vitrine mostra "de R$ X por R$ Y" e o percentual.
- **C3** Dado o lojista cadastrando promoção sem histórico, então vê o motivo "Seu desconto só aparece depois de 30 dias de preço anterior" antes de publicar.
- **C4** Dado mudança de preço normal, então o histórico guarda preço, data e autor.

### WB-349 Pausar, encerrar e alertas de campanha — Must — dep: WB-340
Como admin, quero parar uma campanha na hora, para conter um erro ou abuso.
- **C1** Dado campanha ativa, quando pauso com motivo, então novos pedidos deixam de usá-la em até 1 minuto e os já criados mantêm o desconto.
- **C2** Dado "encerrar", então não reabre (duplicar cria rascunho).
- **C3** Dado campanha com mais de 20% de usos marcados suspeitos, então alerta e sugestão de pausar.
- **C4** Dado campanha ativa por mais de 30 dias sem uso, então aviso "Sem uso".
- **C5** (C-CUP-10) Dado campanha pausada entre a cotação e a criação do pedido, então o pedido sai sem cupom: a transação reconfere `estado = ATIVA` sob a trava da campanha, sem confiar na cotação nem no cache.
- **C6** Dado "Duplicar" em campanha encerrada, então cria `RASCUNHO` com as regras (tipo, valor, público, alvo, mínimo, fonte, usos por cliente) e **sem** orçamento, validade nem código.

### Mensagens ao cliente (fonte única; RN-C7, RN-C11; `reason_code` é interno e nunca vai à tela)
| Situação | Texto | Ação |
|---|---|---|
| Subtotal abaixo do necessário (WB-341 C2) | "Faltam R$ X para usar o cupom" (X = subtotal adicional) | "Ver mais da loja" (sem produto sugerido) |
| Margem <= 0 no autofinanciado (WB-341 C4) | "Cupom não disponível para este pedido" | Continuar sem cupom |
| Esgotado (total ou usos) / esgotado no dia (WB-342 C1) | "Cupom esgotado" / "Cupom esgotado hoje. Volta amanhã" | Continuar sem cupom |
| Validade (WB-347 C4) | "Esse cupom expirou em DD/MM" / "Válido até DD/MM" | "Ver cupons" |
| Conta com pedido pago, campanha de primeira compra (C1) | "Cupom válido só na primeira compra" | n/a |
| Conta sem e-mail confirmado (C4) | "Confirme seu e-mail para usar este cupom" | "Confirmar e-mail" |
| Conta já usou, campanha comum (C14a) | "Você já usou este cupom" | n/a |
| Outro identificador casou (CPF, aparelho, endereço, velocidade; C13, C14b) | "Não foi possível aplicar este cupom a este pedido" | "Falar com o suporte" |
| Código inexistente, segmentado, privado ou de outro público (C8) | "Cupom inválido" | Campo com foco |
| 10 tentativas/h por conta, 30 por IP ou 10 por aparelho (C8) | "Muitas tentativas. Tente de novo em 1 hora" (429) | n/a |
| Cupom de loja pública usado em outra loja | "Esse cupom vale só na loja X" | "Ver a loja X" |
| Sem internet (WB-347 C5) | "Sem conexão. Não conseguimos aplicar o cupom agora" | "Tentar de novo" |

## Eventos de analytics (servidor, exceto onde indicado)
`campaign_created`, `campaign_activated`, `coupon_applied` (campaign_id, funding_source, discount_cents, store_share_cents), `coupon_rejected` (reason_code: exhausted, min_order, not_first_purchase, fraud_signal, margin), `campaign_budget_threshold` (80, 100), `store_campaign_joined`, `store_campaign_left`. **Do app (desenho CC-1, medir se o "Faltam" empurra ou ajuda):** `coupon_showcase_viewed` (store_id), `coupon_shortfall_shown` (campaign_id, faltam_cents em faixa de R$ 10), `coupon_shortfall_resolved` (mesmo pedido chegou ao valor), `coupon_shortfall_abandoned` (saiu do checkout sem resolver); decisão: se o abandono com "Faltam" passar de 10 pontos acima do abandono sem cupom `[HIPÓTESE]`, trocar por link discreto. Sem nome, e-mail, CPF ou código digitado; só IDs opacos.

## Dependências e riscos
| Item | Tipo | Tratamento |
|---|---|---|
| Portaria Senacon 61/2026 e rubrica de frete (J22) | Regulatório | Parecer antes de campanha de frete grátis; discriminação em WB-347 |
| Pedido mínimo como condição (J23) | Jurídico | Divergência de tribunais (`pesquisa` §2.2); manter mínimo só na campanha |
| Margem de entrega negativa no seed (F4) | Negócio | Sem cotação de motoboys o autofinanciado destrava só cesta grande |
| Divisão do custo entre loja e Webag no split do MP | Técnico | A parte da loja já sai pelo `cupom_loja`; backend-dev confirma no sandbox (`application_fee` do MP) |
| Cláusulas nos Termos do Lojista (adesão, teto, saída) | Jurídico | J27 |
| Medição de incremento sem grupo de controle | Produto | O relatório mede ticket e novos clientes, não prova causa; decidir com cautela |
| Fraude (multicontas) | Segurança | RN-C6; Security revisa os identificadores |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Como lançar o custo da campanha no ledger sem duplicar o desconto já refletido na `application_fee` (conta de memória ou despesa de marketing)? | backend-dev e tech-lead |
| O CPF do pagador vem do Mercado Pago no PIX? Quais identificadores são proporcionais (LGPD)? | backend-dev e Security |
| ~~Campanha automática (sem código) entra agora ou só código?~~ **Resolvida:** só código (automática = Could) | PO, 2026-11-22 |
| Valor do orçamento mensal global em R$ (enquanto R$ 0 só "Loja paga" ativa); `autofin_teto_pct` fica 50% e **só global**. Recomendação do PO: `v1-1-respostas-ao-time.md` §F | Fundador (F2, `v1-1-pesquisa.md` §11) |
| Custo previsto do motoboy por faixa (F4); até lá, tabela do seed (R$ 8, 11, 15, 19) marcada provisória. Recomendação do PO: §F | Fundador (cotação) |
| ~~O alerta de autoconsumo (30%) deixa de ser fase 2?~~ **Resolvida:** fica na v1.1 como WB-344 C7 (backlog §10.1: DT-059 absorvido) | PO, 2026-11-22 |
| OTP de celular só pelo gatilho da RN-C11 | Fundador (custo, regra 6), se o gatilho disparar |
| Texto do aceite da loja, rubrica do frete grátis e pedido mínimo | Jurídico: J27, J22, J23 |
