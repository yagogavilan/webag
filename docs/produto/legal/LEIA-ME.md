# Textos legais do v1.0: proposta para o advogado do fundador

Dono: product-owner | Data: 2026-11-20 | Decisões: DEC-078 (rótulo "versão para revisão"), DEC-080 (estes textos são proposta) | Lista J1 a J16 em `docs/decisoes.md` (seção "Revisão jurídica do fundador") | Origem: V8.1 de `docs/qa/relatorios/revisao-visual-final.md`

**O PO não é advogado.** Estes quatro textos são uma PROPOSTA para o advogado do fundador revisar, cortar, corrigir e aprovar. Nada aqui afirma conformidade com o CDC, o Decreto 7.962/2013, a LGPD ou o Marco Civil. Nenhuma frase foi tirada de modelo de terceiros; todas partem das regras do produto (`docs/produto/regras-de-negocio.md`), do inventário de dados (`docs/seguranca/inventario-lojas.md`) e das decisões (DEC-011 a DEC-079).

## 1. Arquivos

| Arquivo | Substitui | Tipo no sistema | Fecha |
|---|---|---|---|
| `politica-de-privacidade.md` | Política de 1 parágrafo da página `/privacidade` | `privacy` | SEC-178; G5 (URL pública da política); J10, J15, J17, J18 |
| `termos-de-uso-cliente.md` | Bloco único de 5 cláusulas de `/termos` | `customer_terms` | G5; J7, J9, J11, J14, J16, J19 |
| `termos-do-lojista.md` | Bloco único de `/termos/lojista` | `merchant_terms` | Antes do 1º lojista do piloto; J12, J20, J21 |
| `politica-de-trocas-e-reembolsos.md` | Minuta "Como funciona o direito de desistir" (WB-178 C6) e política de WB-016 C5 | **sem tipo hoje** (ver §6, item 5) | J1 a J6, J13, J16 |

## 2. Como o web e o mobile consomem (formato)

- Cada arquivo tem um bloco de metadados no topo (NÃO publicar), o texto público entre `<!-- TEXTO-PUBLICO-INICIO -->` e `<!-- TEXTO-PUBLICO-FIM -->` e uma lista consolidada de revisão no fim (NÃO publicar). Só o trecho entre os marcadores vira conteúdo.
- O texto público usa só o que o `markdown-lite` renderiza (`apps/web/src/lib/markdown-lite.tsx`): títulos `##` e `###`, parágrafos separados por linha em branco, listas com "- ", `**negrito**` e links `[texto](https://...)`. Sem tabela, sem lista numerada, sem HTML. Links só `https://` ou `mailto:`: por isso os links usam `{{SITE_URL}}`.
- Os marcadores `[REVISAR JURÍDICO ...]` são inline e sem colchete dentro: remover com a expressão `\s?\[REVISAR JURÍDICO[^\]]*\]` **antes de publicar uma versão aprovada**. Se algum sobrar, a publicação deve falhar (sugestão ao tech-lead: teste no seed ou no admin que recuse o texto com a palavra "REVISAR").
- Variáveis (`{{...}}`) são trocadas na publicação. Nenhum valor foi inventado. Quem responde cada uma está no §7.
- **Não integrar ainda ao `apps/web` nem ao seed (`apps/api/seed/onda1.ts`).** O mobile-dev integra depois da aprovação (DEC-080). Até lá, vale a DEC-078: rótulo honesto "versão para revisão".

## 3. Vigência, versionamento e aceite registrado (J15)

| Regra proposta | Como o sistema já suporta | Falta |
|---|---|---|
| `{{VIGENCIA}}` é a data de publicação da versão, definida pelo admin ao publicar. **Nunca uma data fixa no texto nem no código** (o "31 de dezembro de 2025" da V8.1 estava vencido) | `legal_documents` guarda versão imutável e a página mostra versão e data no topo | O web deve ler a data da versão e nunca ter uma constante |
| `{{VERSAO}}`: `0.x` enquanto for proposta; `1.0` na primeira versão aprovada pelo jurídico; mudança posterior = nova versão (correção = nova versão, R-32) | `relevant_change` e `change_summary` ("o que mudou") | Convenção de numeração (decisão do PO, a validar) |
| Mudança relevante exige novo aceite no próximo uso; correção de texto, não | WB-210 C3: API devolve 403 `terms_acceptance_required` em toda rota autenticada, salvo aceite, logout e exclusão | Antecedência do aviso (`{{AVISO_MUDANCA_DIAS}}` no lojista; no cliente, J15) |
| Aceite registra versão do documento, data e hora, IP e plataforma (família e versão do app) | `terms_acceptances` e `consents`, append-only; IP truncado (/24, /48) e plataforma reduzida à família na anonimização (SEC-159, SEC-173) | Prova de aceite por **5 anos** depois da exclusão `[HIPÓTESE]`, **J15**, e depois expurgo por job |
| Dono da loja aceita os Termos do Lojista; funcionário aceita só termos de uso e privacidade | WB-117 C2 | Nada |

Procedimento recomendado de aprovação (cada passo é de quem está na coluna):

1. Advogado devolve os textos com ajustes (fundador encaminha). PO consolida.
2. PO entrega uma versão **sem marcadores** e com a lista de decisões resolvidas.
3. Admin (super admin) publica como nova versão marcada "mudança relevante", com `change_summary`.
4. QA confere os números do §8 contra os parâmetros e as páginas públicas.
5. CEO remove o rótulo "versão para revisão" (DEC-078, DEC-080) e registra em `docs/decisoes.md`.

## 4. Ordem de revisão sugerida

| Ordem | Arquivo | Por quê |
|---|---|---|
| 1 | `politica-de-trocas-e-reembolsos.md` | J1 a J6, J13 e J16 se repetem nos Termos do Cliente e do Lojista: decidir uma vez. É a parte de maior risco de multa (art. 49) |
| 2 | `termos-de-uso-cliente.md` | G5; J7 (solidariedade), J14 e J16 (prazo e compensação), J19 |
| 3 | `politica-de-privacidade.md` | G5 (lojas exigem URL e coerência com Data Safety e App Privacy). Pode ir em paralelo a outro revisor (especialista em LGPD): J10, J15, J17, J18 |
| 4 | `termos-do-lojista.md` | Contrato de adesão com cláusula de ressarcimento: J12, J20, J21. Necessário antes de aprovar o primeiro lojista real, não antes do G5 das lojas de apps |
| Fora da fila | J8 (motoboys) e J11 (fiscal) | Têm parecer próprio (advogado trabalhista e contador). **Nenhum motoboy é contratado ou pago antes do parecer** (DEC-039) |

## 5. O que os textos assumem (para o advogado conferir)

| # | Premissa assumida | Origem | Risco se estiver errada |
|---|---|---|---|
| 1 | A loja é a fornecedora do produto; o Webag é intermediário, cobrador e entregador e responde pelo que presta. Os textos **não tentam afastar** a solidariedade (CDC arts. 7º pu, 25 §1º, 34) | J7; PRD de trocas | Cláusula de exclusão seria nula (CDC art. 51, I) |
| 2 | Arrependimento vale também na retirada na loja (contrato fechado no app) | `prd/trocas.md` linha 48 | Pedido de desistência recusado indevidamente |
| 3 | Reembolso integral no arrependimento, **incluindo a taxa de entrega**, coleta por conta da Webag | DEC-037, J2 | Custo; ou, se a Webag cobrar frete, risco de multa |
| 4 | Meta de iniciar o estorno em até 3 dias úteis do recebimento do item (art. 49 fala em "de imediato") | RN-11, `reembolso_dias_uteis`, J3 | Maior risco de multa do pacote (Shopee, J3). Alternativa no texto de trocas |
| 5 | Vestuário e calçado = duráveis (90 dias) | J4 | Prazo menor ou maior |
| 6 | Taxa de troca por tamanho/cor, só depois da aprovação da loja; aprovação automática em 24 h por silêncio | DEC-037, J5 | Oferta que vincula (art. 30); abusividade |
| 7 | Faixa estimada de entrega é o compromisso da Webag; atraso: cancelar sem custo (estorno total com frete) e entrega grátis no próximo pedido; sem compensação em falha do cliente | DEC-053, DEC-054, DEC-064, DEC-076, J14, J16 | Art. 35 (opções do consumidor); Conar. **Os textos não escrevem "2 h"** |
| 8 | Texto fixo de estorno: PIX "até 1 dia útil"; cartão "até 2 faturas" | DEC-065, RN-08, J16 | Informação ou promessa de prazo |
| 9 | Falha de entrega por culpa do cliente: estorno total hoje (taxa de entrega não retida) | DEC-038d, DEC-039e, J9 | Perda de margem; ou, se reter, abusividade |
| 10 | Entregador descrito só como "parceiro", sem afirmar autonomia | J8 | Vínculo (a decidir pelo advogado trabalhista) |
| 11 | Webag é controladora de conta e pedido; loja é controladora própria para entrega e nota; Mercado Pago opera o pagamento e também controla o próprio antifraude | `prd/lgpd.md` linha 56, inventário §3 | Papéis errados mudam o dever de informar |
| 12 | Bases legais por finalidade (art. 7º) e prazos de guarda do inventário e do privacy-map, que são "recomendação técnica [validar com o jurídico]" | `inventario-lojas.md` §1, `privacy-map.ts`, DEC-063 | Guarda sem base; prazos |
| 13 | IP truncado na prova de aceite por 5 anos | DEC-050b, DEC-063, J15 | Marco Civil art. 15 e LGPD art. 16 |
| 14 | Exclusão em 72 h de arrependimento + anonimização em até 15 dias, e a página `/excluir-conta` usa os mesmos números | DEC-050a, DEC-056, `public-deletion.ts` | Texto divergente da página (SEC-178) |
| 15 | App só para maiores de 18, por autodeclaração | `auth.schemas.ts`, inventário §1 | ECA Digital (J17) |
| 16 | Ressarcimento: estorno e chargeback saem da conta do lojista; a Webag pode adiantar até R$ 300 e cobrar; sem desconto automático (no split não existe) | DEC-016, DEC-020a e f | J21 |

## 6. Pontos para o advogado (J1 a J16 e os novos J17 a J21)

**J1 a J16** (detalhe e fontes em `docs/decisoes.md`): os textos marcam cada trecho dependente com o número do J. Os dez pontos de maior risco, em ordem:

1. **J3** Reembolso do arrependimento: "de imediato" (art. 49) x meta de 3 dias úteis do recebimento do item. Dois textos alternativos a decidir (iniciar o estorno no pedido de desistência, ou após a conferência do item).
2. **J2** Taxa de entrega devolvida no arrependimento e coleta por conta do fornecedor; e se também em defeito (hoje não).
3. **J14 e J16** Faixa estimada como oferta que vincula; compensação por atraso; exceções por falha do cliente; texto "até 1 dia útil" e "até 2 faturas".
4. **J7** Solidariedade da Webag como marketplace e por ato do entregador (art. 34), com direito de regresso contra a loja.
5. **J5** Taxa de troca voluntária e aprovação por silêncio da loja (nos Termos do Cliente, nos Termos do Lojista e na política de trocas: os três textos precisam coincidir).
6. **J12 e J21** Contrato de adesão do lojista, ressarcimento e cobrança.
7. **J10 e J15** Bases legais, prazos de guarda (5 anos de aceite com IP truncado, 30 dias de backup, 120 dias de tokens do Mercado Pago, 7 dias de contato na corrida), antifraude como legítimo interesse, WhatsApp ao entregador, transferência internacional.
8. **J8** Natureza do entregador (parecer trabalhista; bloqueia contratar motoboy).
9. **J1, J4, J6** Texto oficial dos artigos, vestuário durável, itens excluídos do arrependimento.
10. **J11 e J13** NFS-e e tributos; texto "Como funciona o direito de desistir".

**Pontos novos propostos por este PO** (entram na lista J; registrar em `docs/decisoes.md` quando o fundador aceitar):

| # | Pergunta | Por que importa |
|---|---|---|
| J17 | O ECA Digital (Lei 15.211/2025, em vigor desde 2026-03-17, regulamentado por decreto) alcança o app? A autodeclaração de 18 anos basta ou exige verificação de idade? | O app não tem verificação. Fontes secundárias dizem que a lei rompe com a autodeclaração para serviços acessíveis a menores. **Pode exigir mudança de produto** |
| J18 | Encarregado: quem é (o fundador?), e-mail dedicado, publicação do contato; dispensa para agente de pequeno porte (Resolução CD/ANPD nº 2/2022 `[confirmar número]`) vale para marketplace? | A política e a página de exclusão precisam de nome e e-mail reais (WB-217) |
| J19 | Limitação de responsabilidade, foro (do consumidor no cliente; `{{FORO_COMARCA}}` no lojista) e cláusulas que o CDC art. 51 pode considerar nulas | Cláusula nula arrisca o contrato todo |
| J20 | Alteração unilateral da comissão e dos Termos do Lojista, aviso de `{{AVISO_MUDANCA_DIAS}}` dias, rescisão sem motivo e aceite eletrônico como prova | Hoje o aviso automático de mudança de comissão foi cortado (DEC-071; WB-242 C4) |
| J21 | Cláusula de ressarcimento e teto de cobertura (R$ 300 `[HIPÓTESE]`), limite de loja nova (R$ 500, 30 dias, 20 pedidos `[HIPÓTESE]`), juros e multa | É o que sustenta o risco residual do split (DEC-016, DEC-020) |

## 7. Variáveis a preencher (quem responde)

| Variável | Quem responde |
|---|---|
| `{{COMPANY_NAME}}`, `{{COMPANY_CNPJ}}`, `{{COMPANY_ADDRESS}}`, `{{FORO_COMARCA}}` | Fundador (razão social, CNPJ, sede, comarca) |
| `{{DPO_NAME}}`, `{{DPO_EMAIL}}` | Fundador (encarregado, J18) |
| `{{SUPPORT_EMAIL}}`, `{{SUPPORT_WHATSAPP}}` | Fundador (`EXPO_PUBLIC_SUPPORT_WHATSAPP`, DEC-028d) |
| `{{SITE_URL}}` | Fundador (domínio, condição C1 do G5, DEC-079) |
| `{{HOSTING_PROVIDER}}`, `{{EMAIL_PROVIDER}}`, `{{MP_LEGAL_NAME}}` | Tech-lead (prestadores contratados no lançamento) e fundador |
| `{{AVISO_MUDANCA_DIAS}}` | Advogado (J20); proposta do PO: 15 `[HIPÓTESE]` |
| `{{VIGENCIA}}`, `{{VERSAO}}` | Preenchidos na publicação (§3) |

## 8. Números dos textos que precisam bater com a plataforma

Os textos citam os padrões atuais. Se o admin mudar um parâmetro, o texto fica errado até uma nova versão. Quem muda o parâmetro avisa o PO; o QA confere antes do G5.

| Número no texto | Onde | Parâmetro ou regra |
|---|---|---|
| 7 dias (arrependimento), 30 e 90 dias (defeito) | trocas, termos | Fixos, não editáveis (DEC-011, RN-02) |
| 3 a 30 dias, padrão 7 (troca por tamanho/cor) | trocas, lojista | `troca_voluntaria_dias_min`, `_max`, `_padrao` |
| 24 h (resposta da loja à troca) | trocas, termos, lojista | `troca_resposta_h` |
| 48 h (pagar a taxa de troca) | trocas | `troca_taxa_pagamento_h` |
| 5 dias úteis (mediação), 7 dias (contestar) | trocas | `mediacao_dias_uteis`, `contestacao_dias` |
| 3 dias úteis (agendar coleta), 1 dia útil (novo prazo), 2 reagendamentos | trocas | `coleta_agendamento_dias_uteis`, `coleta_atrasada_dias_uteis` e regra RN-11 |
| 3 dias úteis (meta de estorno) | trocas | `reembolso_dias_uteis` |
| 10 min (aceite da loja), lembrete aos 5 | termos, lojista | `loja_aceite_timeout_min`, `loja_aceite_lembrete_min` |
| 15 min (tolerância), 10 min (resposta ao cancelamento em rota) | termos | `entrega_atraso_tolerancia_min`, `entrega_cancel_resposta_min` |
| Cupom de compensação: 30 dias, 1 uso, só entrega | termos | `entrega_compensacao_tipo` (RN-19 4c) |
| 24 h (baixa automática da entrega), 48 h (retirada) | termos | `auto_conclusao_entrega_h`, `retirada_prazo_horas` |
| 2 dias úteis (análise da loja) | lojista | `aprovacao_loja_sla_dias_uteis` |
| R$ 300 (cobertura de estorno), R$ 500 / 30 dias / 20 pedidos (loja nova) | lojista | `estorno_cobertura_teto_cents`, `loja_nova_*` |
| 72 h (desistir da exclusão), 15 dias (anonimizar e responder titular) | privacidade | `exclusao_arrependimento_horas`, `exclusao_anonimizacao_dias`, DSR 15 dias (`public-deletion.ts`) |
| 5 anos (pedidos), 6 meses (acesso), 180 dias (fotos de troca) | privacidade | `retencao_fiscal_anos`, `retencao_log_acesso_meses`, `retencao_foto_troca_dias` |
| 5 anos (aceite e consentimento, bloqueio, DSR), 30 dias (backup), 120 dias (tokens MP), 90 dias (documentos reprovados) | privacidade | DEC-063, `retencao_bloqueio_anos`, `privacy-map.ts` |
| 7 dias (sacola, exportação, códigos de e-mail, contato da corrida), 30 dias (sessão) | privacidade | `carrinho_validade_dias`, `exportacao_validade_dias`, `pii_corrida_retencao_dias` |

## 9. O que os textos prometem e o produto precisa cumprir antes de publicar

| # | Promessa no texto | Situação | Dono |
|---|---|---|---|
| 1 | Confirmação imediata do pedido de desistência, com protocolo | WB-178 C7: verificar no app e no e-mail | QA e mobile-dev |
| 2 | Aviso de mudança de comissão com `{{AVISO_MUDANCA_DIAS}}` dias | Cortado do produto (DEC-071). Sem o aviso automático, a operação avisa por e-mail na mão, ou o CEO reabre o item | CEO |
| 3 | Aceite e consentimento "depois de 5 anos, apagamos" | O trigger append-only bloqueia DELETE; o job de expurgo exige exceção (DT-063, `reviews/onda-8.md`) | backend-dev |
| 4 | Correção de nome e celular no app | CC2 pendente (DEC-055); se não sair, retirar a frase do item 7 da política | mobile-dev e PO |
| 5 | Política de trocas em URL própria | Não existe `/termos/trocas`, nem tipo em `legal_documents` | mobile-dev e tech-lead |
| 6 | Entregador apaga o dado depois da corrida | Sem documento nem treinamento: preparar orientação ao motoboy (confidencialidade) junto do parecer J8 | Fundador e PM |
| 7 | Loja vê "o nome" do cliente | Inventário §3 diz "primeiro nome"; WB-216 C1 diz "nome": alinhar e corrigir o texto | PO e backend-dev |
| 8 | Nota fiscal com CPF | O Webag não repassa CPF à loja; fluxo não existe (J11) | PO e contador |
| 9 | Compensação por atraso e "cancelar sem custo" | O app só promete se `Order.compensation` vier do contrato (RN-19 4d, F2): conferir que o texto e a tela dizem o mesmo | QA |
| 10 | Antifraude como "decisão automatizada" | Se o enquadramento for confirmado, precisa de caminho de revisão por pessoa (hoje só o e-mail do encarregado) | Security e jurídico |
| 11 | "Sem análise, sem cookie de terceiros" | Conferido no código (nenhuma ferramenta de análise; e2e exige zero cookies nas páginas públicas). Reconferir se algo for ligado antes do G5 | tech-lead |
| 12 | Monitoramento de erros do servidor sem dado pessoal | Plugável e desligado sem DSN (DEC-032b). Se não for ligado no lançamento, tirar a frase | tech-lead |

## 10. Fontes e o que foi conferido (pesquisa de 2026-11-20)

**O texto oficial do Planalto, da Câmara e de portais jurídicos não abriu neste ambiente** (`planalto.gov.br`, `www2.camara.leg.br`, `confidata.com.br` e `admdireito.com.br` falharam na resolução de rede). A conferência foi por buscas e resumos secundários. Legenda: **V** = o resumo secundário bate com o que o texto afirma; **N** = não pude conferir nesta sessão (citado a partir de J1 e de conhecimento do PO). **Todos precisam ser conferidos no texto oficial pelo advogado.**

| Dispositivo citado nos textos | Uso | Status | Fonte (acesso em 2026-11-20) |
|---|---|---|---|
| CDC art. 49 (7 dias, a contar da assinatura ou do recebimento; "de imediato" no parágrafo único) | Arrependimento | V no caput; parágrafo único **N** | `jus.com.br/artigos/30766`; `projuris.com.br/blog/direito-de-arrependimento-2/`; `aurum.com.br/blog/cdc-comentado/art-46-a-50-cdc` |
| Decreto 7.962/2013 art. 5º (informar os meios; mesma ferramenta; confirmação imediata; §§2º a 4º) | Arrependimento | V | `goias.gov.br/procon/decreto-no-7-962-de-15-de-marco-de-2013-...`; `migalhas.com.br/depeso/179259/`; `coad.com.br/home/noticias-detalhe/50028/` |
| Decreto 7.962/2013 art. 2º (informações da oferta e do fornecedor) e art. 4º | Identificação da Webag e da loja | **N** | mesmo decreto |
| CDC art. 35 (cumprimento forçado, outro produto ou rescindir com restituição) | Atraso na entrega | V | `modeloinicial.com.br/lei/CDC/codigo-defesa-consumidor/art-35`; `aurum.com.br/blog/cdc-comentado/art-30-a-35-cdc/` |
| CDC arts. 6º III, 7º pu, 14, 18, 25, 26, 27, 30, 31, 34, 51 (I), 101 (I) | Informação, solidariedade, defeito, oferta, nulidade, foro | **N** (J1 e J7 trazem resumos secundários; arts. 30, 31 e 35 aparecem nas pesquisas) | `modeloinicial.com.br/lei/CDC/`; `aurum.com.br/blog/cdc-comentado/` |
| LGPD art. 7º (I, II, V, VI, IX), art. 8º §2º, art. 16, art. 18, art. 20, art. 33 (II e IX), art. 37, art. 41, art. 48 | Bases legais, direitos, guarda, transferência | art. 18 e 19: V; os demais **N** | `aurum.com.br/blog/lgpd-comentada/art-17-a-22-lgpd`; `legjur.com.br/legislacao/art/LEI_00137092018-19` |
| LGPD art. 19, II (15 dias) | Prazo de resposta ao titular | V (o §4º permite prazos diferentes por setor) | `legjur.com.br/legislacao/art/LEI_00137092018-19`; `aurum.com.br/blog/lgpd-comentada/art-17-a-22-lgpd` |
| LGPD art. 14 (melhor interesse) | Crianças | V | `aurum.com.br/blog/lgpd-comentada/art-14-lgpd/`; `migalhas.com.br/depeso/335550/` |
| Marco Civil (Lei 12.965/2014) art. 15 (registros de acesso por 6 meses) | Retenção do `access_log` | V | `modeloinicial.com.br/lei/27460/marco-civil-internet/art-15` |
| ECA Digital (Lei 15.211/2025, vigência 2026-03-17; Decreto 12.880/2026) | Idade | V em fontes de imprensa e escritórios; texto oficial **N** | `machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/direito-digital/estatuto-digital-da-crianca-e-do-adolescente-lei-n-15-211-2025-entra-em-vigor-em-17-de-marco-de-2026`; `computerweekly.com/br/reportagen/ECA-Digital-...` |
| Resolução CD/ANPD nº 19/2024 (transferência internacional) | Item 12 da política | V (citada em resumo secundário) | `confidata.com.br/blog/transferencia-internacional-dados-guia-completo` |
| Resoluções CD/ANPD nº 2/2022 (pequeno porte) e sobre encarregado | J18 | **N** (número a confirmar) | ANPD (`gov.br/anpd`) |
| STJ REsp 1.340.604/RJ (frete e devolução) | J2 | **N** (via J2) | Idec, fonte secundária |

## 11. Próximos passos

| Quem | O quê |
|---|---|
| Fundador | Encaminhar os 4 textos e este arquivo ao advogado; responder as variáveis do §7; pedir parecer trabalhista (J8) e do contador (J11) |
| CEO | Decidir os itens 2 e 5 do §9 e registrar J17 a J21 em `docs/decisoes.md`; manter o rótulo "versão para revisão" até a aprovação |
| PO | Consolidar a versão limpa depois do parecer; conferir §8 com o QA |
| Mobile-dev e tech-lead | Depois da aprovação: seed, tipo de documento de trocas, URL `/termos/trocas`, teste que recusa "REVISAR" e variáveis não preenchidas |
| Security | Conferir o inventário contra a política (itens 3, 5, 6, 12) e o prazo de incidente à ANPD |
