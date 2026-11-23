# v1.1: respostas do PO ao time (W0.1)

Status: **proposta do PO; o CEO valida** (DEC-106 a DEC-113 em `docs/decisoes.md`) | Dono: product-owner | Data: 2026-11-22
Escopo: pendências de DoR do `plano-v1-1.md` §4, perguntas das specs `design/telas/v1-1-*.md`, do Security (`threat-model-v1-1.md` §12) e do backend (`qa/performance/api-2026-11-22.md`, SEC-201).
Padrão adotado: custo zero e privacidade. Tudo que não tem dado é `[HIPÓTESE]` com plano de validação. Onde a regra já está escrita em PRD, a coluna "Onde" aponta o lugar; não repito o texto.

## A. As nove perguntas pedidas pelo CEO

| # | Pergunta | Decisão | Porquê | Quem aplica | Onde |
|---|---|---|---|---|---|
| 1 | Código de entrega sem sinal: como o motoboy confere e quando vira entrega sem prova | **O app não confere**: nunca recebe o código (C-MOT-07). Sem sinal, guarda até 3 digitações em "Entrega a conferir" e **não marca ENTREGUE**. Ao voltar a rede, o servidor confere: certo = ENTREGUE com prova `codigo` (a hora do aparelho só vale pela C-MOT-08); errado = conta nas 3 tentativas. Sem conferência em 20 min do toque: alerta à operação. "Entrega sem prova" = só as fechadas pela operação (`operacao`) ou pela auto-conclusão de 24 h (`automatica`); nunca por fila do app. Na disputa "não recebi" a prova `codigo` pesa mais; o % sem `codigo` vira métrica (WB-398) | Conferir offline exige dar ao app o código ou um hash (10 mil combinações caem em segundos). Só o servidor pode ser o juiz. Custo aceito: a entrega fica "a conferir" por alguns minutos | backend-dev (fila, `prova`), designer (texto), Security (confirma) | despacho RN-D6a; WB-386 C10; rastreio WB-391 C15 |
| 2 | "Saiu" sem chegada do motoboy registrada | Botão "Saiu com o motoboy" **na linha do pedido desde MOTOBOY_A_CAMINHO**, com confirmação "O motoboy já está com o pedido?". Vale com fonte `loja` e marca `sem_chegada`; a operação recebe aviso informativo; o app do motoboy mostra "A loja confirmou a saída" com "Não peguei este pedido" (chama a operação) | Sem GPS ou com motoboy esquecido, a loja ficaria sem botão e a automática não dispara. A contestação do motoboy fecha o abuso "loja marca saída sem entregar a sacola" (threat model §5) | designer, mobile-dev, backend-dev | rastreio WB-390 C10 |
| 3 | Avaliação na entrega x convite de 1 h | **Um convite só: o de 1 h** (WB-396 C6). A tela "Entregue" ganha o link discreto "Avaliar" (sem estrelas abertas); o convite de 1 h só sai se o pedido ainda não foi avaliado. **Avalia-se loja e pedido, nunca o motoboy** | Duas solicitações duplicam (RC-4 do designer); avaliar o motoboy na porta é pressão sobre o trabalhador e fere RN-D7 (sem ranking) e o J8 | designer, mobile-dev | WB-399 C1 |
| 4 | Limiar do alerta de atraso | **Sem limiar novo: vale a RN-18.** "Em risco" (amarelo) a `entrega_faixa_min` (15) do fim da faixa e sem saída; "Atrasada" (vermelho) ao passar do fim da faixa. O "alerta a 10 min" do protótipo sai | A regra existe, é calibrável no admin e já alimenta o alerta da RN-19; dois limiares são duas verdades | designer (ajusta a spec) | `regras-de-negocio.md` RN-18 |
| 5 | Faixas de preço da porta falsa | Cinco opções, **de exemplo e nunca preço final**: "Até R$ 19", "R$ 20 a R$ 39", "R$ 40 a R$ 79", "R$ 80 ou mais" e **"Não pagaria por isso"** (sem esta última o teste enviesa para cima). A tela não diz que será cobrado o valor. Guarda-se o id da faixa. `[HIPÓTESE]`: derivadas do F5 (até ~5% da comissão mensal média) e de comissão de 15% sobre GMV de R$ 2 mil a R$ 4 mil/mês; sem fonte externa de preço de módulo parecido | O objetivo é medir interesse, não fixar preço (F5). Sem a opção negativa não há como matar a hipótese | designer (texto), backend | análises WB-367 C2; HIP-A1 |
| 6 | 1 ou 2 motoboys por lote: regra de atribuição | **1 lote = 1 motoboy.** "1 ou 2 motoboys" é a **equipe** da operação, não dividir um lote. Para usar os dois, a operação gera dois lotes em sequência (cada um <= 90 s). Cada motoboy tem no máximo 1 rota ativa e 1 oferta pendente. Dividir lote automático: gatilho = 3 motoboys, 15 entregas/hora (DEC-096) ou operação passar de 90 s por lote | O pedido do fundador citou 2 motoboys, não lote partido; dividir exige regra de rateio de custo (RN-18) e de prazo | designer, backend | despacho RN-D11; WB-381 C11 |
| 7 | Motoboy disponível sem GPS fora da corrida (RN-D7) e o que a operação enxerga | **RN-D7 vence.** O servidor descarta ponto fora de corrida aceita (C-MOT-11). A operação vê, na lista, o motoboy com estado (Disponível, Em corrida, Sem sinal, Offline), **"disponível há N min" e "última entrega: bairro e hora"** (dado da corrida já guardada, não é rastreio) e pode atribuir mesmo "sem posição". Pino no mapa só com corrida ativa. Revisar no gatilho de 3 motoboys | Rastrear o trabalhador "disponível" não tem base clara (J26) e custa bateria; com 1 a 2 motoboys a operação sabe por WhatsApp onde estão | designer, backend | despacho RN-D12; WB-380 C1 |
| 8 | Células pequenas por subtração do total | **Agrupar e arredondar** (RN-A2): células < 5 viram uma linha "Outras"; se "Outras" for uma célula só, absorve a menor visível; se ainda < 5, mostra "menos de 5" e **nenhum total da mesma resposta é exato** (arredondado a múltiplo de 5, rótulo "cerca de"). Vendas e pedidos do banco seguem exatos. Lojista só vê períodos de 7 e 30 dias terminando ontem (D-08): sem "Hoje", "Ontem" nem intervalo livre | Cumpre a C-ANA-05 (b, c); o designer propunha agrupar ou suprimir: agrupar + arredondar é a única combinação sem perda do total e sem vazar por subtração | backend (regra no servidor), designer (texto "cerca de"), QA | análises RN-A2, WB-363 C6 a C8 |
| 9 | Opt-out medido | **Não medir o opt-out exato.** Mede-se a **cobertura**: `order_paid` do app com `session_id` ÷ `order_paid` do app, por semana e cidade, calculada no job de agregação (sem coluna nova em `orders`, sem evento ao desligar). Meta >= 85% (PRD). Mínimo de 20 pedidos/semana para exibir | Contar o opt-out quebraria a promessa "nada mais a partir de agora" (TM-1). A cobertura é o que importa à decisão (o funil é confiável?) e usa dado que já existe | backend, designer | análises RN-A10 |

## B. Security (D-01 a D-08, DEC-103) e perguntas ao Security

| Item | Decisão | Onde |
|---|---|---|
| D-01 sem OTP | WB-344 C4 reescrito: e-mail confirmado (DEC-014) + tetos por campanha, dia e cliente/aparelho; celular **fora** do antifraude. OTP só por gatilho (usos suspeitos > 20% por 7 dias ou orçamento mensal de cupons Webag > R$ 1.000 `[HIPÓTESE]`) e com autorização do fundador (regra 6) | cupons RN-C6 (a, d), RN-C11; WB-344 C4 |
| D-02 bruto pseudonimizado | Texto "dados de uso não ligados à sua conta, guardados por até 90 dias" no lugar de "anônimo" (SEC-194). Pergunta ao J24 separada: bruto (pseudônimo) x agregado (anônimo) | análises RN-A3, RN-A4, WB-361 C4, WB-363, WB-369 C1 |
| D-03 teto do cupom da loja | `cupom_loja_pct_max` padrão **30** (CEO; a sugestão do Security era 50), editável pelo super admin com auditoria; fixo exige pedido mínimo >= valor / teto; alerta se <= 3 contas concentram > 50% dos usos em 7 dias | cupons RN-C10; WB-346 C7, C8 |
| D-04 redução > 50% | Só super admin; acima de 30% pede confirmação | admin WB-353 C9 |
| D-05 aparelho novo do motoboy | A operação aprova no painel (modelo e hora); 1 aparelho ativo por motoboy | despacho WB-383 C7, C8 |
| D-06 `audit_log` | Papel de banco da API não é dono da tabela | admin WB-354 C4 |
| D-07 bloqueio de tela | Recomendação ao designer: **avisar e registrar**, não bloquear na v1.1 (bloquear reduz adesão; a revogação em 1 min e o aparelho sem telefone do cliente já limitam o dano) `[HIPÓTESE]` | designer decide |
| D-08 período livre | Não: só 7 e 30 dias terminando ontem | análises RN-A9 |
| Motivo por sessão (admin) | Aceito com condição: motivo da sessão **pré-preenche**, mas **cada alteração grava o motivo** no `audit_log` e mostra confirmação; preço exige um dos 4 motivos a cada edição | admin RN de edição |
| Tempo e escopo do "Ver como" | 30 min, ligado a (admin, loja, motivo); grava **abertura e encerramento**, não as telas | admin WB-352 C6 a C9 |
| Rascunho local sem login | Só existe com sessão; chave por usuário e loja; apagado ao sair (avisa se há não enviados); vence em 30 dias (RN-Q2). Linhas coladas: até criar rascunhos ou 24 h | cadastro RN-Q2, WB-371 C7 |
| Mensagens neutras de fraude | Conta com pedido pago anterior: "Cupom válido só na primeira compra". Qualquer outro sinal: "Não foi possível aplicar este cupom a este pedido" + "Falar com o suporte". Inexistente ou fora do público: "Cupom inválido". Nunca diz qual identificador casou | cupons RN-C11; WB-344 C13, WB-347 C6 |
| Posição ao Suporte | Só a posição atual de corrida ativa, sem histórico (coerente com RN-D7) | WB-388 C4 |
| Nome do motoboy no push | Fora (só no app, e só **depois** da saída confirmada) | rastreio WB-392 C10 |
| Código visível na tela do pedido | **Risco aceito**: aparece só depois de SAIU; Security pode pedir máscara ("Toque para mostrar") sem custo. Backend confirma se a reentrega gera código novo | WB-395 |
| Consentimento da IA (texto) | "A foto será enviada para <provedor> só para sugerir nome e categoria. Você revisa tudo antes de publicar. Não use fotos com pessoas ou endereços." As frases "não guarda" e "não usa para treinar" **só entram se o contrato (J25) disser isso**. Aviso do EXIF: "Removemos a localização e os dados da câmera das suas fotos antes de publicar." | cadastro WB-378 C4 |
| Opt-in ou opt-out (F7) | Padrão **opt-out** com aviso (DEC-092), flag desligada até o J24; um parâmetro `medicao_padrao_ligada` muda para opt-in sem refazer tela. Aviso reaparece **só em mudança material** (finalidade, retenção, destinatário), versionado | análises WB-360 |

## C. Backend e tech-lead

| Pergunta | Decisão | Porquê | Quem aplica |
|---|---|---|---|
| **Defasagem da vitrine (SEC-201)** | **Equilíbrio.** (a) **Aceitar os TTLs** para mudança comercial (produto novo, preço, foto, promoção, estoque, horário): home, ofertas e mais vendidos 60+30 s; catálogo da loja 15+30 s; páginas de loja e produto 10 s. O checkout e a sacola releem o banco e seguem como fonte de verdade. (b) **Invalidação imediata (<= 5 s) obrigatória** em: moderação que remove, pausa ou reprova produto; loja suspensa, reprovada ou desativada; conta de recebimento ou cidade desativadas; ordem jurídica ou de autoridade. (c) **Estoque zero não invalida** (cada venda zeraria o cache da home): a página do produto (10 s) e a sacola mostram o estado certo. Multi-réplica: pub/sub do Redis (ADR-017) | Conteúdo ilegal exposto por 90 s é risco de reputação e de lei; produto esgotado por 10 a 60 s é incômodo, não dano. Invalidar por venda destruiria o ganho de desempenho | backend-dev (invalidação nos serviços de moderação e de status), tech-lead, QA (e2e com TTL > 0), Security (re-revisão do SEC-201) |
| `n`, `atualizado_em`, `em_cache` nas consultas | **Sim.** Cada célula traz `n` e `suprimida`; célula suprimida **não traz valor nem `n`** (C-ANA-05); a resposta traz `atualizado_em` e `em_cache` | A tarja "baixa amostra" depende de `n`; a supressão depende de não vazar | backend-dev |
| Custo previsto do motoboy por faixa (F4) | Parâmetro `entrega_custo_motoboy_faixa_cents` por faixa (RN-02), editável por super admin e financeiro com auditoria. Até o fundador cotar: **tabela do seed, marcada `[HIPÓTESE]`**; a tela de campanha avisa "custo previsto: tabela provisória" | DEC-102 (F4 antes do piloto); o motor não pode esperar a cotação | backend-dev |
| Deduplicação do push | Por **(evento, pedido)**, mais janela de 30 s por pedido para transições que se desfazem (saiu, desfeito, saiu). Nunca por usuário (quem tem 2 pedidos precisa dos 2) | C-NOT-04 | backend-dev |
| Validação do relógio do aparelho | Regra da C-MOT-08 virou critério (WB-387 C4, WB-391 C5) | | backend-dev |
| Reajuste e edição em massa | Transação única; 1 aviso agregado ao lojista por ação em massa (não 200) | WB-353 C11 | backend-dev |

## D. Perguntas das specs ao PO (R1 e R2)

| Spec | Pergunta | Decisão | Porquê |
|---|---|---|---|
| cadastro | Foto por cor em produto com grade | **Fora da v1.1; "Duplicar" basta.** Volta se 3 lojistas de moda pedirem ou se > 30% dos duplicados forem só por foto (`product_duplicated`) | Esforço de modelo de dados; sem evidência |
| cadastro | Descrição opcional em categorias de risco | **Opcional no produto, não na via.** Flag `descricao_obrigatoria` por categoria (padrão não); no seed: **Cosméticos e Eletrônicos = sim** (mín. 20 caracteres). Vale na via rápida e no formulário completo `[HIPÓTESE; CDC art. 31; jurídico]` | Regra por via é pesadelo de teste; a informação obrigatória é por tipo de produto |
| cadastro | Texto de "categoria proibida" | Mantém o texto da WB-060 C6 e acrescenta "Ver o que não pode ser vendido" (Termos do Lojista) e "Escolher outra categoria" | Neutro, com saída |
| cadastro | `variacoes_max` | **100** (já é, WB-061 C1) | 8 tamanhos x 12 cores cabem |
| cadastro | Moderação: "em análise" ou ativo | **Ativo e sinalizado em "Revisar"** (WB-107 C3); categoria proibida bloqueia | HIP-029 já decidiu |
| colar | Juntar linhas com variações | **Entra, só como sugestão de 1 toque** (mesmo nome sem tamanho/cor; preços diferentes viram preço por variação); nunca junta sozinho | Moda é o núcleo; poupa N cartões |
| colar | Tamanho numérico de calçado | Só em categoria de calçado (ou nome com tênis, sandália, bota, chinelo, sapato), número de 33 a 48 sem decimal; **sempre marcado "Confira"** `[HIPÓTESE; testar com colagem real]` | Ambiguidade com preço e quantidade |
| colar | Limite e formato da planilha | **1.000 linhas e 1 MB; .xlsx e .csv** (`import_max_linhas` sobe de 500 para 1.000 só nesta via) | C-CAD-05 |
| colar | Etapa de fotos x "Publicar os válidos" | **A etapa de fotos vem antes**; "Publicar" publica os que têm foto, nome e preço | Foto é obrigatória (IC-1) |
| colar | Dois preços na linha ("P 49,90 G 59,90") | Não adivinha: marca "Mais de um preço" e oferece "Separar em 2 linhas" | Erro silencioso de preço é o pior caso |
| edição em massa | Linha acima de 30% pede confirmação | **Sim**, inline, nos dois sentidos, `reajuste_max_pct` | O erro de dedo é o risco (EM-1) |
| edição em massa | Promoção como coluna | **Não na v1.1** (tem período e histórico de 30 dias, WB-348) | Não cabe em célula |
| edição em massa | "Selecionar todos" e o filtro | **Respeita o filtro**, com a contagem no botão ("Selecionar os 12 da busca") | Evita reajustar a loja inteira sem querer |
| admin lojas | Aviso ao lojista: imediato ou resumo | Pausa, status e horário: na hora. Preço, estoque e catálogo: painel por alteração e **e-mail-resumo a cada 10 min** (até 20 itens e "+N"). Ação em massa: 1 aviso | 30 e-mails são spam |
| admin lojas | Aba Comissão (prévia por categoria) | Usar a precedência da RN-10 (loja > categoria > padrão) e mostrar a origem ("categoria Calçados: 12%") | Regra já existe |
| admin lojas | Suporte pausa loja em emergência | **Não** (RN-13); a operação pausa. Vai ao CEO só se o piloto mostrar demora | Mantém a matriz |
| admin painéis | "Compartilhar" | **"Enviar cópia a outro admin"**: leva só a definição, nunca dados; métrica sem permissão do destinatário aparece bloqueada | Painéis são privados |
| admin painéis | Limiares de baixa amostra | **20 pedidos** para taxa, ticket e comparação; **5** para mediana e p90; acessos: célula < 5 | Percentual sobre 5 pedidos engana |
| admin painéis | Painel "Vendas" entra | **Sim**: 5 prontos (Visão geral, Vendas, Lojas, Entrega, Cupons); Acessos com a WB-362 | Reusa métricas |
| admin painéis | Definições (RN-15) e matriz métrica x dimensão | Tabelas no PRD admin (§ "Matriz") | |
| cupons admin | Orçamento mensal global (F2) enquanto R$ 0 | Formulário **salva rascunho**, mas "Ativar" fica indisponível para qualquer campanha com `desconto_webag > 0` (Webag paga, Dividido, Autofinanciado) com "Orçamento mensal de cupons da Webag é R$ 0". **Loja paga** não é afetada. Barra "gasto do mês x orçamento" no topo | DEC-102 F2 |
| cupons admin | `autofin_teto_pct` por campanha | **Só global** (50%), super admin, auditado | Evita vazamento de margem escondido por campanha |
| cupons admin | Só código na 1ª entrega | **Confirmado** (aplicação automática = Could) | |
| cupons admin | "Duplicar" encerrada copia orçamento | **Não**: copia regras; orçamento, validade e código vêm vazios | Evita reativar com saldo velho |
| cupom cliente | Vitrine: só o que pode usar ou tudo | **Só elegíveis e "quase" ("Faltam R$ X")**; nunca segmentado, de outro público ou esgotado | CC-2 e C-CUP-06 |
| cupom cliente | Produto sugerido no "Faltam" | **Nenhum**: só o valor e "Ver mais da loja" | Evita empurrão (CC-1); medir `coupon_shortfall_resolved` |
| cupom cliente | Frete grátis: linha de desconto ou "Entrega: Grátis" | **Linha de desconto**: "Entrega R$ 8,00" e "Desconto Webag (frete) -R$ 8,00" | RN-C1; J22 pode mudar a rubrica |
| cupom cliente | "Válido até 31/12" | Assim, e o dia final vale até 23:59 (`America/Sao_Paulo`) | |

## E. Perguntas das specs ao PO (R3 a R5)

| Spec | Pergunta | Decisão | Porquê |
|---|---|---|---|
| app motoboy | Negativa "não usamos para ranking" | **Manter, escopada à localização** ("A localização não é usada para ranking, nota ou desconto"). Métricas operacionais por motoboy existem e não são ranking exibido | Texto verdadeiro; J8 |
| app motoboy | Espera antes de "cliente ausente" | **10 min** após "Cheguei ao cliente" e com 1 toque em "Ligar" (`cliente_ausente_espera_min`); outros motivos sem espera (segurança) `[HIPÓTESE]` | Evita "ausente" falso |
| app motoboy | Motoboy vê o valor da corrida | **Não** (RN-D9); reavaliar no parecer J8 | |
| admin despacho | Reatribuir lote parcialmente saído | Só paradas **sem "Peguei"** (na loja) podem ir a outro motoboy ou voltar à fila. Pedido já com "Peguei" ou SAIU não reatribui: "Marcar problema" leva ao fluxo NAO_ENTREGUE/DEVOLVIDA (RN-18), com motivo | Custódia clara; evita o mesmo pedido com 2 motoboys |
| admin despacho | Corrigir endereço sem ponto | **Não**: a operação liga ao cliente; pedido sem ponto fica fora do cálculo e na lista. Volta se > 5% dos pedidos vierem sem ponto | Mover o ponto redireciona mercadoria; é dado do cliente |
| loja saída | Confirmar vários com 1 toque | **Sim**, só pedidos do mesmo motoboy com "Peguei" registrado, pré-marcados, cada um com sua transição e auditoria | Loja entrega 3 sacolas de uma vez |
| loja saída | "Ainda estou separando" silencia | Silencia som e lembrete por 3 min, **uma vez por pedido**, sem mudar estado; se o motoboy já marcou "Peguei", a automática não dispara e o admin é alertado na hora | Evita botão que mente |
| loja saída | Funcionário sem permissão | Texto sem botão e sem Web Push | |
| notificações | Push "a caminho da loja" | **Não** (fica no app) | Sem ação do cliente |
| notificações | Alerta sonoro ao Suporte | **Não**; só operação e super admin | Suporte não despacha |
| rastreio | "Você é o 2º" | Aceito com horário: "O motoboy está entregando outro pedido antes do seu. Seu pedido é o 2º da rota, por volta de HH:MM." | O horário ancora a leitura |
| rastreio | Nome do motoboy em "a caminho da loja" | **Não**; só após a saída confirmada | Minimiza exposição |
| análises lojista | Contador "faltam N visitas" | **Sim** a partir de 5 visitas; abaixo de 5, "Ainda poucas visitas" | AL-1; coerente com o mínimo de 5 |
| análises lojista | Períodos | 7 e 30 dias terminando ontem; 90 dias só no admin | D-08 |
| análises admin | Preço, teste, quem registra | Preço: fundador (F5). Teste: 30 dias (parâmetro). Registra pagamento: financeiro ou super admin | WB-366 |
| transparência | Aviso 1 vez ou a cada versão | Só em mudança material (ver B) | |

---

# Fechamento da DoR da R2 (PO, 2026-11-22, após R1.1 a R1.3)

Escopo: WB-340 a 349, 356, 357, 362, 367, 373. Status por história: `backlog.md` §10.8. Tudo abaixo é **proposta do PO; o CEO valida e o fundador decide o que é dele** (preço, comissão e dinheiro nunca são do PO).

## F. Para o fundador (lista curta; tempo estimado ~1 h, mais ~1 h do advogado)

| # | Decisão | Recomendação do PO | Se não decidir |
|---|---|---|---|
| **F2** | Orçamento mensal de cupons pagos pela Webag (hoje R$ 0) | **Manter R$ 0 no sistema até 3 condições:** (1) F4 cotado; (2) 5 lojas com pedidos reais (cupom acelera pedido, não cria loja; DEC-100); (3) J22 resolvido, se for frete grátis. Depois, **R$ 300 no 1º mês e teto de R$ 50 por dia** (`[HIPÓTESE]`: é um limite de perda que o fundador aceita, não um número de mercado; sem fonte externa), só na campanha "Primeira compra R$ 8" **Autofinanciada** (R$ 300 / R$ 8 = ~37 clientes novos). Revisão semanal pelo relatório WB-345; sobe só se o custo por cliente novo ficar abaixo do que o cliente deixa de margem nos 2 primeiros pedidos `[HIPÓTESE]`. Teto do autofinanciado: **50% da margem**, só global | Segue R$ 0: só "Loja paga" ativa (já dá para testar o motor inteiro) |
| **F4** | Custo previsto do motoboy por faixa | **Cotar 3 a 5 motoboys ou serviços locais** (valor por corrida nas 4 faixas 0-2, 2-5, 5-10 e 10-15 km, e se há desconto por lote de 3; ~1 h, o fundador). Hoje: taxa cobrada R$ 8, 10, 14 e 18 x custo do seed R$ 8, 11, 15 e 19 (`regras-de-negocio.md` RN-02; `relatorio-final.md` (d)4), ou seja **R$ 0, -1, -1 e -1 por entrega**, `[HIPÓTESE]` sem cotação. Regra: se o custo real passar da taxa, **subir a taxa da faixa** até cobrir (preferido) ou aceitar o déficit; **sem frete grátis enquanto a margem da faixa for negativa** (pesquisa F4). Cadastrar o custo mais alto cotado (conservador) | Tabela provisória do seed; o autofinanciado destrava só cesta grande, o que é seguro |
| **J22** | Portaria Senacon 61/2026: a Webag é destinatária? Como mostrar taxa de entrega e de serviço? Vale também para o v1.0 (G5) | Só para **ligar**: campanha de **frete grátis** e o selo de composição. A tela do cliente (WB-347 C8) é construída igual | Frete grátis desligado; desconto em valor e percentual segue |
| **J23** | Regulamento mínimo, encerramento antecipado, pedido mínimo global (R$ 20), "de/por" de 30 dias | Só para **ligar**: selo "de/por" (WB-348) e frete grátis. O "pedido a partir de R$ X" como condição de cupom já é prática comum (`pesquisa` §2.2); o advogado confirma | "de/por" desligado: a loja mostra só o preço atual |
| **J27** | Termos do Lojista: adesão e saída de campanha, teto da loja, edição de catálogo e preço pelo admin, módulo pago | Só para **ligar**: campanha com parte da loja (Loja paga e Dividido) e edição pelo admin sem pedido do lojista | Só "Webag paga" e "Autofinanciado"; admin edita só com motivo "solicitado pelo lojista" (já é regra) |

Perguntas exatas ao advogado: `decisoes.md` J22, J23 e J27 (não reescrevo). **Risco que o PO não resolve:** liberar desconto Webag/Autofinanciado em valor ou percentual **sem** J23 depende de o fundador aceitar o risco de regulamento (CDC arts. 30 e 31); mitigação já no PRD: pausa vale para pedidos novos e pedido criado mantém o desconto (WB-349 C1), texto de condição na vitrine (RN-C7). **Recomendação ao CEO e ao backend-dev:** em vez de uma flag só (`campanhas_cupom`), três **parâmetros do admin, padrão desligados**: `campanha_frete_gratis`, `campanha_parte_da_loja`, `selo_de_por`. Assim cada parecer liga a sua parte e o resto não espera o advogado.

## G. Perguntas do designer e do Security ainda abertas (R2)

| Spec | Pergunta | Resposta |
|---|---|---|
| admin cupons CU-2 | Custo variável do percentual | **Pior caso por pedido** na simulação (teto em R$ do desconto) e "até N pedidos no pior caso" contra o orçamento do dia: WB-340 C12 |
| admin cupons CU-4, P1 | Custo acumulado x orçamento global | Barra "gasto do mês x orçamento" no topo (seção D) e recusa de ativação se a soma passar (WB-340 C11) |
| admin cupons P6 | Barra do dia atualiza a cada quanto tempo? | Basta **atualizar a cada 60 s com a tela aberta** `[HIPÓTESE]`; a trava de orçamento é do servidor (reserva atômica), a barra é só leitura. Backend confirma o custo |
| admin cupons P7, P8 | Revelar dado em "Suspeitos"; validade do 2º fator; retenção | Pedido a pedido com motivo e auditoria (WB-344 C12); 2º fator vale **5 min** (`reauth_min`, WB-340 C6); sinais de fraude **12 meses** `[HIPÓTESE; Security e encarregado]` (WB-344 C11) |
| cupom cliente P1, P2, P3, P4 | Vitrine, produto sugerido, frete, "Válido até" | Já respondidas (seção D); a **tabela "Mensagens ao cliente"** do PRD de cupons é a fonte única e prevalece sobre a spec |
| cupom cliente CC-1 | O "Faltam" empurra o cliente? | Medir: eventos `coupon_shortfall_*` (PRD cupons); gatilho para trocar o texto: abandono com "Faltam" > 10 pontos acima do abandono sem cupom `[HIPÓTESE]` |
| painéis P2 | Limiares 20 e 5 | Mantidos. Base: com 20 pedidos uma taxa de ~50% tem margem de erro de ~22 pontos (IC 95%, aproximação normal) e com 5, ~44; **20 é o mínimo para não exibir percentual enganoso**, não uma garantia; reavaliar para 30 quando houver mais de 100 pedidos por semana `[HIPÓTESE]` |
| painéis P3, P4, P5 | Vendas, definições, matriz | Vendas entra (seção D); definições em uma frase e matriz no PRD admin; **novos:** sensibilidade por métrica e conteúdo dos 5 painéis (PRD admin, WB-357 C7 a C9) |
| painéis P9 (Security) | "Enviar cópia" leva dados? | **Só a definição** (WB-358 C10); Security confirma |
| acessos (analytics) | Textos de "anônimo" | Frase oficial SEC-194 em todos os textos ao cliente; tag do lojista "Medição agregada" (RN-A3) |

**Correções que o designer precisa fazer nas specs (divergem do PRD; não toquei em `docs/design`):**
1. `v1-1-cupom-cliente.md` §4: remover "Sem celular confirmado / Confirmar celular" (D-01; vira "Confirme seu e-mail"); remover a sugestão de produto no "Faltam" ("Adicionar Bermuda jeans"; fica "Ver mais da loja"); trocar o texto de fraude por "Não foi possível aplicar este cupom a este pedido" + "Falar com o suporte"; "Não encontramos esse cupom" vira "Cupom inválido"; "vale só na loja X" só para campanha pública; "11 tentativas" vira 10 por hora.
2. `v1-1-admin-cupons.md`: incluir o "pior caso" (WB-340 C12).
3. `v1-1-admin-paineis.md`: incluir o painel "Vendas" e usar "Entrega" no lugar de "Logística"; estado "Sem permissão" no widget bloqueado (WB-357 C8).
4. `v1-1-transparencia-medicao.md` e `v1-1-analises-lojista.md`: trocar "anônimo" pela frase oficial e "Medição agregada".

## H. Checagem final da R2 (critério de aceite testável e DEC-088)

| Verificação | Resultado |
|---|---|
| Cada história R2 (WB-340 a 349, 356, 357, 362, 367, 373) tem Gherkin com caminho feliz, limite, erro e vazio, e valores concretos | Sim, após os acréscimos: WB-340 C12; WB-341 C2 e C3 (parâmetros e limite de R$ 0,01); WB-344 C4 e C14; WB-347 C10; WB-357 C7 a C9; WB-362 C4; WB-367 C5 a C7. WB-373 e WB-345/346/348/349 sem mudança |
| Nenhum campo, regra ou rotina majora preço, entrega ou taxa por cupom | Conferido em RN-C1 a RN-C11 e nas 10 histórias de cupom: **nenhum**. Guardas: RN-C1 (taxa de serviço só global), WB-341 C9 (o corpo aceita só `code`) e **WB-347 C10** (propriedade de 10 mil carrinhos, no CI). Risco residual: lojista subir o preço de lista antes de criar cupom próprio (WB-346); WB-348 impede o selo de "de/por" sem 30 dias e a trilha de preço (WB-348 C4) permite fiscalizar |
| Divergência entre PRD e spec de tela | 4 correções do designer (acima); o PRD prevalece |
| Dependência que pode travar | WB-362 depende de WB-361/363 (R1.4, primeira da fila de corte): se a R1.4 sair da R1, entra no início da R2 e a WB-362 vai por último |

---

# Fechamento da DoR da R3 (PO, 2026-11-23)

Escopo: WB-358, 380, 381, 382, 390, 391 (a e b), 396, 397. Status por história e ponto de corte: `backlog.md` §10.9. Regras: PRDs de despacho (RN-D13 a RN-D15) e de rastreio (RN-R3, RN-R11, RN-R12, matriz N1 a N20). **Proposta do PO; o CEO valida** (registrar em `decisoes.md` como DEC-142 em diante; eu não edito aquele arquivo).

## I.1 Pendências de produto que travavam o backend: fechadas
| # | Pendência | Decisão | Porquê | Onde |
|---|---|---|---|---|
| 1 | Quem despacha | **Operação e Super admin** (RN-13); Suporte vê sem botões; Financeiro lê. Na R3 ela envia por **WhatsApp manual** (`wa.me`) e **registra no painel** o que o motoboy responde (fonte `admin`) | Sem app, a operação é o único ator com acesso; WhatsApp automático custa (DEC-003) | RN-D13 |
| 2 | 1 ou 2 motoboys por rota | **1 lote = 1 motoboy**; 2 motoboys = 2 lotes em sequência (<= 90 s cada); oferta **tudo ou nada**. Fecha a DE-3 do designer | DEC-111; dividir lote exige rateio de custo e prazo; gatilho de volta: 3 motoboys, 15 entregas por hora ou > 90 s por lote | WB-381 C11 a C13; WB-391 C18 |
| 3 | Motoboy não aceita | Lote volta a PRONTA na **mesma posição da fila**; motivo obrigatório (Sem moto, Longe, Outro); sem penalidade nem contagem exibida (J8) | Recusa livre é mitigação do vínculo; reiniciar a fila puniria o cliente | RN-D14; WB-391 C17 |
| 4 | Motoboy não responde | **3 min** (mesmo no WhatsApp) e volta à fila com alerta; a operação sobe o parâmetro para 5 se as expirações forem frequentes (`courier_offer_expired`, `[HIPÓTESE]`) | Uma regra, testada; o ajuste é por parâmetro, sem deploy | RN-D14; WB-391 C4 |
| 5 | Motoboy aceita e some | Alerta aos **20 min** do aceite (`motoboy_a_caminho_alerta_min`, `[HIPÓTESE]`, só R3: sem GPS não há "ETA da loja"); a operação liga e **reatribui antes da saída**; depois da saída: "Marcar problema" (NAO_ENTREGUE ou DEVOLVIDA, RN-18) | O PRD pedia "ETA da loja + 10 min", impossível sem posição | RN-D14; WB-391 C20, C21 |
| 6 | Janela do rastreio | Da **saída confirmada ao fim da entrega**; teto de **180 min** da saída (era 24 h); na R3 não há posição, só linha do tempo | 24 h de posição de trabalhador por um pedido esquecido é desproporcional (RN-D7, J26); 180 = teto de 2 h (DEC-053) + 15 min + folga `[HIPÓTESE]` | RN-R3 (R4) |
| 7 | Privacidade do motoboy ao cliente | **Só o primeiro nome, só depois da saída confirmada, nunca no push**; nunca sobrenome, foto, placa, telefone, trilha, velocidade ou valor; contato por "Falar com a Webag"; avalia-se loja e pedido, nunca o motoboy | DEC-098, DEC-112; **muda a WB-235 C3 da v1.0** (mostra o nome ao atribuir): QA ajusta o teste | RN-R12 |
| 8 | O que a loja vê | Primeiro nome do motoboy desde "a caminho"; a faixa de saída; "Saída registrada"; **nunca** telefone, posição, ETA, pedidos de outras lojas do lote | SEC-198: a loja não pode seguir o motoboy | RN-R11 |
| 9 | Canais por evento | Matriz **N1 a N20** com canal R3 e R4, título e corpo (<= 60 e 120). **Só 3 pushes ao cliente** (saiu, chegando, entregue) | Push demais é silenciado; DEC-112 | Rastreio, "Matriz de canais e textos" |
| 10 | Push "saiu" sem mapa | Na R3 o texto é "Chegada prevista até HH:MM" (fim da faixa aceita); "Acompanhe o motoboy no mapa" só com `rastreio_ao_vivo` ligada | Prometer mapa que não existe é publicidade enganosa `[jurídico]` e torna o golpe do SEC-196 mais crível | WB-396 C2 |
| 11 | Contradição WB-396 C8 x matriz | Nome do motoboy proibido no push **ao cliente**; a **loja** recebe o primeiro nome (painel e Web Push) | A loja precisa saber quem chega; já o vê no painel | WB-396 C8 |
| 12 | R3 sem GPS: "Desfazer" e "automática" | Desfazer vale 2 min **sem** a condição de 150 m, com aviso à operação; **automática não existe** (flag `saida_automatica` desligada; R4) | A condição de 150 m e o "Peguei" exigem app | WB-390 C4, C7; WB-391 C22 |
| 13 | Caminho da loja na R3 | Botão "Saiu com o motoboy" **desde "a caminho"** é o caminho principal; a operação marcar a chegada é opcional (só aciona faixa, som e lembrete) | Evita a operação como intermediária em cada saída | WB-390 C10 |
| 14 | Rota como sugestão (J8) | Texto "Sugestão de ordem"; **sem horário por parada, valor nem faixa** na mensagem ao motoboy | O horário por parada é o tipo de controle que pesa no vínculo | RN-D15; WB-382 C7 |
| 15 | Operação com o painel fechado | **Não é avisada** (e-mail e Web Push do admin são fase 2, DEC-074d); no piloto fica com o painel aberto; gatilho para Web Push do admin: 1 alerta perdido | Custo zero; o risco é operacional e medível | Matriz, regra 4 |
| 16 | SEC-194 nas notificações | Eventos só com IDs opacos, sem `endpoint` nem token; texto de consentimento sem "anônimo"; token e `endpoint` no inventário LGPD antes de ligar a flag | O token de dispositivo é dado pessoal | WB-396 C16; WB-397 C9, C11 |
| 17 | Parâmetros novos (RN-02, editáveis com auditoria) | `courier_accept_timeout_min` (3), `motoboy_a_caminho_alerta_min` (20), `saida_desfazer_min` (2), `tracking_max_min` (180, R4) | Sem número no código | WB-391 C11 |

## I.2 Perguntas ao Security (respondem antes do G4 da R3)
1. Primeiro nome do motoboy no Web Push da **loja** (aparece na tela bloqueada do celular do balcão): aceito?
2. Saída pela loja desde "a caminho", sem chegada, e "Desfazer" sem GPS na R3 com aviso à operação: o controle contra "a loja marca saída sem entregar a sacola" e "desfaz depois de o motoboy sair" basta?
3. A loja entrega a sacola a quem diz o número do pedido; sem documento nem "código de coleta" (RN-R11). Risco Médio ou Baixo? PO: gatilho é o 1º caso.
4. A operação registra etapas em nome do motoboy sem pedir motivo (só recuo de hora e reatribuição exigem): suficiente?
5. Limite de 5 inscrições de Web Push por membro e a regra de apagar em 404/410.
6. A matriz de transições (R3.2) deve cobrir 391a e 391b. A SEC-193 (código de entrega, 5 tentativas e checagem fora da trava) passa a **Alta** na R4; recomendo ao PM e ao tech-lead **antecipá-la à R3.2**, porque mexe no mesmo arquivo da máquina de estados e o limite de 3 tentativas muda comportamento da v1.0 (o quando é do PM).

## I.3 Correções que o designer precisa fazer (o PRD prevalece até lá; não toquei em `docs/design`)
1. `v1-1-admin-despacho.md`: (a) cartão do motoboy "Em turno · a 1,9 km da 1ª loja" e "Disponível · sem localização" vira **"Disponível" ou "Em corrida"** (RN-D12; a R3 não tem GPS); (b) tirar o alerta "a 10 min do limite" da §1.1 (RN-18, resposta nº 4 da seção A); (c) na R3, "Enviar rota" é **WhatsApp**: botões "Carlos aceitou" e "Carlos recusou" (3 chips de motivo), "Chegou à loja" e o texto de cancelamento (N18); push só na R4; (d) DE-3 e perguntas 1 a 5 da §9 estão respondidas.
2. `v1-1-loja-confirma-saida.md`: decisão 6 e §2, "Ainda estou separando" silencia **3 min** (não 2); "Carlos vai buscar o pedido #1042" na linha do pedido (N4) com o botão desde "a caminho" como caminho principal; "Desfazer" sem condição de 150 m na R3; mensagens de erro "Sem conexão. A saída não foi registrada" e "Este pedido mudou. Atualize a tela."; diálogo do Web Push com o texto da WB-397 C9.
3. `v1-1-notificacoes.md` §2: trocar os textos pela matriz do PRD (N7 com as duas variantes; "Pedido entregue" / "Entregue às 15:54."; sem "Obrigado por comprar").

## I.4 Para o fundador (só o que depende dele; ~2 h, quase tudo dentro das janelas A, B e C já pedidas)
| # | Decisão ou ação | Recomendação do PO | Se não decidir |
|---|---|---|---|
| **F4** | Cotar 3 a 5 motoboys (valor por corrida nas 4 faixas, desconto de lote), já pedido na seção F. **Acrescentar 4 perguntas na mesma conversa:** tem Android ou iPhone? aceita receber a rota como sugestão por WhatsApp e recusar corrida? aceita mandar a localização pelo WhatsApp no piloto (semana 0, DEC-097)? tem plano de dados? | Cadastrar o custo cotado mais alto (conservador); as respostas alimentam F10 e o gatilho do app (R4) sem custo extra | Seed provisório; a R3 não é afetada, a R4 decide aparelho às cegas |
| **J8 (e J26)** | **J8 vale para qualquer motoboy real**, inclusive o despacho da R3 e o piloto da v1.0 (DEC-003 e DEC-039: ninguém é contratado ou pago antes do parecer). J26 (GPS) só para a R4. Mandar o J8 com 2 acréscimos: "rota sugerida por WhatsApp, com ordem e sem horário por parada" e "perda de mercadoria" (próxima linha) | Construção e testes **não esperam**; o **piloto com motoboy real** espera. Entra no lote C do plano (~1 h, assíncrono) | Piloto sem motoboy real ou risco aceito por escrito (regra 6) |
| **F-R3-2** | **Quem arca com a mercadoria que o motoboy não entrega nem devolve** (some, roubo, acidente). Nenhum documento define | `[HIPÓTESE; jurídico]` No piloto: a Webag reembolsa o cliente na íntegra (RN-08) e repassa o valor à loja (a logística é da Webag, DEC-036), e cobra do motoboy fora do sistema. **Limitar a exposição:** teto de valor de mercadoria por rota nas 2 primeiras semanas, no número que ele aceita perder (não sugiro valor: é dinheiro dele). Perguntar ao motoboy e ao advogado sobre seguro | A 1ª ocorrência vira decisão no improviso, com dinheiro de terceiro |
| **F-R3-4** | Quem é a **operação** no piloto e em que horário | O fundador (ou 1 pessoa dele) com o painel de despacho **aberto** em `logistica_horario`; o piloto conta quantos alertas foram perdidos | Alertas sem ninguém olhando; a meta de 90 s não se mede |
| **SEC-196** | Ligar a "segurança avançada de push" no painel do Expo e gerar o `EXPO_ACCESS_TOKEN` (~10 min); guardar em cofre ou `.env`, nunca no repositório | Fazer antes do G4 da R3. **Custo: não verificado; confira no painel, e se houver cobrança não ligue e me avise** (regra 6) | O G4 da R3 não passa: o aviso "saiu" vira vetor de golpe |
| **Android real** | ~1,5 h, junto da Janela B: (a) Web Push do lojista com o painel fechado, no Chrome do Android; (b) abrir os links de Maps e Waze da rota no celular do motoboy (e num iPhone, se houver); (c) a faixa "Saiu com o motoboy" ao sol, com som, em celular de entrada; (d) a operação monta um lote de 3 pelo celular | Aparelho de entrada (o do perfil do lojista), não o seu | "RC com ressalva: emulador" (R-34); não bloqueia construir |
| **F12** | **Nada a decidir agora**: a confirmação automática da saída fica desligada na R3 (precisa de GPS) | Decidir na R4, com o % de saídas confirmadas pela loja no piloto | n/a |

**Ao CEO (validações):** (1) registrar as decisões I.1 como DEC-142 em diante; (2) acrescentar `loja_confirma_saida` à C-GEN-01 (nasce desligada; é a flag da mudança da RN-07); (3) aceitar a divisão 391a, 391b (R3) e 391c (R4); (4) aceitar o teto de 180 min do rastreio (troca o de 24 h) e a mudança da WB-235 C3 (nome só depois da saída); (5) **avisar o fundador de que mapa ao vivo e "motoboy confirma entregue" são R4**, e que a R4 ficou por último (DEC-104); (6) pedir ao designer as 3 correções (I.3); (7) a ordem de corte da R3 está no `backlog.md` §10.9.

## I.5 Checagem final da R3
| Verificação | Resultado |
|---|---|
| Cada história R3 tem Gherkin com caminho feliz, limite, erro, vazio, permissão e concorrência, com valores concretos | Sim, após os acréscimos: WB-380 C6, C7; 381 C12 a C14; 382 C7, C8; 390 C13 a C16; 391 C15 a C23; 396 C13 a C16; 397 C9 a C12; 358 C11 a C13 |
| Número sem fonte | Os novos estão marcados `[HIPÓTESE]`: 20 min do alerta de "aceitou e não chega", 180 min do teto, 5 inscrições de Web Push, 3 min no WhatsApp; nenhum é dado de mercado |
| Algum critério depende de app ou GPS na R3? | Foram movidos para a R4: WB-390 C8, WB-391c, WB-396 C3 e C4, "Peguei" (reatribuir usa a saída registrada); a tabela "Escopo por release" do PRD de rastreio lista cada um |
| Divergência entre PRD e spec | 3 correções do designer (I.3); o PRD prevalece |
| Ainda falta | Poker dos devs (PM), contrato R3 (backend, onda R3.1), ADR do mapa e spike L5 (tech-lead), SEC-196 (Security, backend e fundador), DT-102 (tech-lead) |
