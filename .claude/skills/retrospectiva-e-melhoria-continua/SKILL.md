---
name: retrospectiva-e-melhoria-continua
description: Retrospectiva do PM com dados de fluxo (lead time, cycle time, WIP, throughput, retrabalho), formatos curtos, causa raiz sem culpa e no máximo 3 ações com dono, prazo e métrica. Use ao fechar sprint ou onda, após incidente (limite de uso, bug escapado, gate reprovado) ou ao revisar se as ações anteriores funcionaram.
---
# Retrospectiva e melhoria contínua (PM)

Registre no arquivo da sprint (`docs/gestao/sprints/sprint-NN.md`, seção Retro). Lições duráveis que valem para o time inteiro vão em `docs/gestao/licoes.md` (uma linha: contexto, lição, ação que mudou). O time é de agentes: a causa raiz quase sempre está no **briefing, no contexto, na fronteira de arquivos ou na DoR**, não em "o agente errou".

## 1. Prepare os dados antes (do board, `git log`, relatórios do QA)
| Métrica | Como medir |
|---|---|
| Previsto x feito | itens aceitos / itens comprometidos; o que sobrou e por quê |
| Lead time | do pedido (criado no board) até Aceito |
| Cycle time | do início (Em andamento) até Aceito |
| WIP | itens simultâneos em Em andamento, Em revisão e Em QA. Limite sugerido: 3 por vez (DEC-010) |
| Throughput | itens aceitos por semana/sprint |
| Retrabalho | % de itens devolvidos pelo tech-lead, QA ou Security; bugs escapados e severidade |
| Bloqueios | dias parados por dependência e quem era o dono |
| Idade do item | maior tempo parado em uma coluna |
Relação útil (Lei de Little): lead time médio = WIP / throughput. Lead time alto com WIP alto: pare de começar, comece a terminar. Se um dado não existe, diga "indisponível", não zero. Use como diagnóstico, nunca para comparar agentes.

## 2. Escolha o formato (15 min de leitura no máximo)
| Formato | Quando |
|---|---|
| Começar / Parar / Continuar | padrão |
| 4Ls (gostei, aprendi, faltou, desejei) | fim de onda ou marco com muito aprendizado |
| Barco (vento, âncora, pedras, destino) | muitas dependências externas ou riscos à frente |
Peça a cada papel envolvido (PO, devs, QA, Security, designer) 3 pontos independentes e **só depois** agrupe em temas; assim a opinião mais forte não domina. Inclua o ponto de vista do fundador, que o CEO traz (tempo de resposta, qualidade percebida).

## 3. Passos
1. **Reveja as ações da retro anterior** primeiro: feita, parcial ou não feita; funcionou? (a métrica melhorou?). Ação não feita não é substituída por outra sem conversa.
2. Mostre os dados e a meta cumprida.
3. Agrupe temas e escolha os **2 ou 3** de maior efeito. O resto vai ao estacionamento.
4. **Causa raiz** de cada um: 5 porquês, sem culpado. Pergunte: o briefing estava completo? A história passou na DoR? Havia dependência não mapeada? O limite de uso interrompeu (R-04)?
5. **Ações (no máximo 3).** Formato: `ação | dono | prazo AAAA-MM-DD | métrica de sucesso | como saberemos`. Ex.: "briefing com lista de arquivos proibidos | CEO | 2026-12-05 | zero conflito de arquivo em 2 sprints".

## 4. Bom e ruim
Ação boa: específica, muda o processo, tem dono, cabe na próxima sprint, mede-se. Ruim: "comunicar melhor", "ter mais cuidado", mais de 3 ações, ação sem dono, ação sobre algo fora do controle do time (leve ao CEO como risco).

## 5. Gatilhos de retro extra (curta, 1 página)
Limite de uso interrompendo o trabalho duas vezes; bug Crítico/Alto escapado; gate reprovado; estimativa errada em mais de 30% `[HIPÓTESE]`; mudança de escopo no meio da sprint.

## 6. Fechar o ciclo
Publique um resumo de 5 linhas ao CEO: o que melhorou, o que não, as ações com dono. Na próxima sprint, a primeira pergunta da planning é o estado dessas ações. Resultado esperado ao longo do tempo: lead time e retrabalho caindo, throughput estável, WIP dentro do limite.

## Fontes e licença
- product-on-purpose/pm-skills, skill `iterate-retrospective` (Apache-2.0, Copyright Jonathan Prisant), e phuryn/pm-skills, skill `retro` (MIT, Copyright Pawel Huryn), consultadas em 2026-11-22. Adaptado: formatos, revisão de ações anteriores, limite de 2 a 3 ações com dono e prazo, texto próprio.
- Métricas de fluxo (lead time, cycle time, WIP, throughput, Lei de Little) e 5 porquês: conhecimento geral de Kanban/Lean (inspirado em).
