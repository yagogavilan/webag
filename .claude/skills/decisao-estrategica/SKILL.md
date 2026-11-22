---
name: decisao-estrategica
description: Método do CEO para decisões de rumo: classificar reversível x irreversível, revisar plano de forma crítica, pre-mortem e red team das premissas, e registrar em docs/decisoes.md. Use ao avaliar pedido do fundador, mudança de escopo, abrir cidade, mudar modelo de receita ou antes de qualquer gasto/publicação.
---
# Decisão estratégica (CEO)

## 1. Classifique a porta (30 segundos)
| Tipo | Teste | O que fazer |
|---|---|---|
| Reversível (porta de mão dupla) | Desfazer custa menos de 1 sessão de trabalho e nenhum dinheiro/dado externo | Decida você, registre DEC, siga. Não gaste rodada de pesquisa |
| Irreversível ou cara | Dinheiro, conta (Apple, Google, MP, domínio), jurídico, marca, publicação, apagar dados, mudar modelo de negócio (CLAUDE.md §7) | Passos 2 a 5 completos e pergunta ao fundador, com recomendação |
| Reversível, mas com custo de espera alto | Atrasar derruba o caminho crítico | Decida com 70% da informação; defina gatilho de revisão |

## 2. Revisão crítica do plano (antes de delegar)
1. **Problema real:** quem sofre, qual evidência (fonte/data ou `[HIPÓTESE]`), e o custo de NÃO fazer.
2. **Alternativas (mínimo 3):** inclua "não fazer" e "fazer na mão" (ex.: piloto por WhatsApp antes de construir). Escolha com critério explícito, não por entusiasmo.
3. **Modo de escopo** (declare um): Reduzir (menor coisa que testa a hipótese; padrão no Webag), Manter (escopo fixo, só testar a robustez) ou Expandir (só com evidência de demanda e capacidade; cada adição com custo e decisão sim/depois/não).
4. **Caminhada do implementador:** simule as primeiras horas de quem executa; liste as ambiguidades que ele travaria (critério de aceite faltando, credencial do fundador, contrato de API).
5. **Saída do plano:** meta mensurável, o que fica FORA, dono e data de cada dependência.

## 3. Pre-mortem (decisão irreversível ou cara)
Suponha que, em 90 dias, deu errado (lojas não ativaram, pedido sem motoboy, estorno em massa). Liste causas e classifique:
- **Tigre:** ameaça real e com evidência. Ordene: bloqueia a decisão / resolver em 30 dias / só monitorar.
- **Tigre de papel:** soa grave, é improvável. Registre o porquê e não invista.
- **Elefante:** preocupação que ninguém fala (ex.: o fundador não ter tempo de visitar lojas). Investigue.
Cada Tigre bloqueante vira ação com dono e data no RAID (peça ao `project-manager`).

## 4. Red team das premissas
Extraia só as premissas que derrubam o plano se falsas. Para cada uma: argumento mais forte a favor, depois o ataque, e uma condição falsificável "Falha se ___". Ranqueie por impacto x chance de estar errada x barateza do teste. Para as 3 primeiras defina o menor teste desta semana e o limite que mata a ideia (ex.: "menos de 3 de 10 lojistas aceitam cadastro assistido").

## 5. Registre (docs/decisoes.md)
`DEC-### | data | decisão | porquê (1 linha) | quem decidiu | alternativas descartadas | status` e, em decisão cara, acrescente: **gatilho de reversão** (sinal mensurável que faz reabrir) e **risco aceito**.

## Armadilhas do Webag
- Copiar o iFood em escala: 30 lojas em uma cidade pedem densidade e confiança antes de recursos (ver `economia-de-marketplace`).
- Promessa operacional sem operação: a entrega em até 2 h (DEC-053) exige despacho humano (R-18). Toda promessa ao cliente precisa de dono operacional.
- Decidir por quem pediu: ideia do fundador também passa nos passos 2 a 4. Discorde com evidência e deixe a decisão com ele (`comunicacao-com-o-fundador`).
- Decisão sem evidência escrita: se o dado é `[HIPÓTESE]`, a decisão é um experimento com prazo, não um compromisso.

## Fontes e licença
- phuryn/pm-skills, skills `pre-mortem` e `strategy-red-team` (MIT, Copyright Pawel Huryn), consultadas em 2026-11-22. Adaptado: categorias Tigre/Tigre de papel/Elefante, condição "Falha se", ranqueamento e limite de morte, aplicados ao Webag.
- Classificação reversível x irreversível e modos de escopo: conhecimento geral de gestão (inspirado em), sem texto de terceiros.
