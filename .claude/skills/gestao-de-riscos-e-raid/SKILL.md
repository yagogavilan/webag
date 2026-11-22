---
name: gestao-de-riscos-e-raid
description: Gestão de riscos do PM no RAID do board: identificar por pre-mortem, pontuar probabilidade x impacto, definir gatilho, resposta, plano B e dono, e manter o log limpo. Use ao abrir um risco, no início de cada sessão, antes de marcos (G4/G5, piloto) ou quando um risco se materializar.
---
# Gestão de riscos e RAID (PM)

O RAID mora em `docs/gestao/board.md` (seção RAID; colunas ID, Tipo, Descrição, Prob., Impacto, Dono, Ação, Status). Mantenha esse formato. Prefixos: R (risco), A (ação), I (problema), D (dependência). Você não decide a resposta de risco de produto ou técnico, mas cobra dono e data.

## 1. Identificar
- **Pre-mortem** antes de cada marco: "daqui a 14 dias deu errado; por quê?" Peça a cada agente suas 3 causas (independentes) e consolide.
- Classifique: **Tigre** (real, com evidência: vira risco com ação), **Tigre de papel** (improvável: registre o porquê, sem ação), **Elefante** (ninguém fala: investigue). Na dúvida, trate como Tigre.
- Categorias para varrer: dependência externa (Apple, Google, Mercado Pago, jurídico), tempo do fundador, limite de uso e perda de trabalho, escopo, qualidade/segurança, legal/LGPD, operação (despacho em 2 h), mercado (lojas não ativam).

## 2. Pontuar
Probabilidade e Impacto em Baixa=1, Média=2, Alta=3; **Score = P x I**.
| Score | Resposta |
|---|---|
| 6 a 9 | Ação agora, dono nomeado, relato ao CEO no mesmo dia se tocar o caminho crítico |
| 3 a 4 | Mitigação planejada e gatilho vigiado |
| 1 a 2 | Monitorar |
Impacto avalia dinheiro, prazo, segurança/legal e reputação perante lojistas. Um risco de segurança ou lei com impacto Alto nunca é rebaixado por baixa probabilidade sem parecer do `security-engineer`/fundador.

## 3. Responder (um por risco)
| Resposta | Quando | Exemplo Webag |
|---|---|---|
| Evitar | dá para tirar a causa | cortar item arriscado de escopo (com o PO) |
| Mitigar | reduzir P ou I | idempotência e testes de concorrência (R-11) |
| Transferir | outro assume | parecer do advogado (R-20, R-27) |
| Aceitar | custo da resposta > dano | só o fundador aceita risco alto, registrado em `decisoes.md` |

## 4. Campos obrigatórios (dentro da coluna Ação, se o board não tiver coluna)
`Ação: ... | Gatilho: <sinal mensurável que dispara o plano B> | Plano B: ... | Dono: <papel ou fundador> | Revisar em: AAAA-MM-DD`
Exemplo: "R-18 Gatilho: 3 pedidos seguidos com atraso por falta de despacho | Plano B: reduzir o raio e a lista de lojas abertas | Dono: fundador/PM | Revisar em 2026-12-01".
Risco sem dono, sem gatilho ou sem data de revisão não está pronto. Dono que não responde em um ciclo: relate ao CEO.

## 5. Manter limpo (todo início de sessão, 5 minutos)
- Reavalie P e I do que mudou; um risco com bloqueio aberto no caminho crítico sobe de cor no status.
- Risco que ocorreu vira **Problema (I-)** com ação; registre "materializado" no original e a lição.
- Encerre com evidência (relatório, commit, DEC); nunca por esquecimento. Mantenha visíveis os 10 maiores abertos; o resto pode ficar abaixo.
- Risco aceito: DEC com o risco aceito e quem aceitou.
- Dependência externa com prazo estourado vira risco com score (D-xx sem data é alerta).

## 6. Saídas
Top 3 riscos no status ao CEO (`relatorio-de-status-executivo`); riscos de G4/G5 listados no parecer; novos riscos de produto ao PO e de segurança ao `security-engineer`.

## Fontes e licença
- phuryn/pm-skills, skill `pre-mortem` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22. Adaptado: Tigre/Tigre de papel/Elefante, priorização e plano de ação com dono e data.
- Matriz probabilidade x impacto, tipos de resposta (evitar, mitigar, transferir, aceitar) e RAID: boas práticas gerais de gestão de projetos (PMBOK; inspirado em), texto próprio.
