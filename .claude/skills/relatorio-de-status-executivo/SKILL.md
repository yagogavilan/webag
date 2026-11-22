---
name: relatorio-de-status-executivo
description: Regras do PM para o status executivo ao CEO: semáforo com critério objetivo, evidência em cada item, o que mudou desde o último relatório, bloqueios e decisões pendentes. Use ao escrever o status semanal ou de fim de sessão, ao mudar a cor da saúde do projeto ou ao preparar insumo para o report do CEO ao fundador.
---
# Relatório de status executivo (PM)

O formato do relatório está em `.claude/agents/project-manager.md` ("Formato do status report"); o CEO usa o seu em `ceo.md`. Esta skill define **como preencher com honestidade**. Para o `/status` rápido do CEO, os mesmos dados: `board.md`, `decisoes.md`, sprint atual.

## 1. Semáforo com critério (cor pelo pior fator, não pela média)
| Cor | Quando |
|---|---|
| VERDE | Meta no ritmo; nenhum bloqueio aberto no caminho crítico; sem veto de QA/Security; nenhum risco com score 6 a 9 sem plano |
| AMARELO | Bloqueio com data de saída definida; desvio recuperável com o buffer; risco 6 a 9 com plano em curso; folga do caminho crítico abaixo da margem combinada |
| VERMELHO | Caminho crítico bloqueado sem data de saída; veto aberto; meta inatingível sem cortar escopo; risco 6 a 9 sem dono |
Verde com bloqueio no caminho crítico é mentira (`project-manager.md`). Se estava AMARELO, mantenha uma linha explicando a cor, e o que faz mudar de cor.

## 2. Evidência em tudo
- "Concluído" = Aceito conforme DoD, com **link** (relatório do QA, commit, DEC). "Quase pronto" não entra como concluído.
- "% concluído da meta" = tarefas aceitas / tarefas da meta (ou pesos do board). Mostre a conta (ex.: 16 de 18). Estimativa de peso vem marcada `[HIPÓTESE]`.
- Datas e números vêm de arquivo (board, sprint, `git log`), não de memória. Se o board está desatualizado, atualize antes de relatar.

## 3. O que mudou
Compare com o último relatório e dê só o **delta**: o que fechou, o que abriu, cor anterior para a atual, folga anterior para a atual, riscos que subiram ou desceram (ID). Sem delta, o relatório é inútil para quem já leu o anterior.

## 4. Bloqueios e decisões pendentes (a parte que o CEO mais usa)
```
Bloqueado: <item> | motivo | quem desbloqueia | até quando | efeito na folga
Decisão pendente: <pergunta> | dono | prazo | custo de esperar | opção recomendada
```
Decisões e insumos que só o fundador resolve vêm em **lote**, por urgência, para o CEO levar em uma conversa (`comunicacao-com-o-fundador`). Itens reiterados de um relatório para outro ficam em destaque com a idade ("há 3 sessões").

## 5. Tamanho e linguagem
Cabe em uma tela (~25 linhas). Primeira linha: cor, meta e o que mais precisa de atenção. Frases curtas, sem jargão técnico além do necessário, IDs entre parênteses. Resultado e risco, não lista de atividades.

## 6. Checagem antes de enviar
- [ ] Board e RAID atualizados na mesma sessão (datas AAAA-MM-DD)?
- [ ] Cada cor e cada "concluído" tem evidência?
- [ ] Bloqueios têm dono e prazo?
- [ ] Riscos novos ou alterados têm dono e gatilho?
- [ ] Mencionei escopo que entrou depois da planning e o que saiu?
- [ ] Dá para o CEO decidir sem me perguntar nada?

## 7. Anti-padrões
Relatório "melancia" (verde por fora, vermelho por dentro); mudar a cor só no fim; esconder atraso até o gate; relatar esforço (horas, nº de commits) como progresso; texto igual ao anterior; pedir decisão sem opção e recomendação.

## Fontes e licença
- phuryn/pm-skills, skill `stakeholder-map` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22: plano de comunicação por público, adaptado como cadência e conteúdo do relatório.
- Critérios de semáforo (RAG), evidência e delta: práticas gerais de gestão de projetos (inspirado em); limites numéricos são `[HIPÓTESE]` do time, ajustáveis em retro.
