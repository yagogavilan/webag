---
name: relato-de-bug-e-causa-raiz
description: Como relatar um bug do Webag com reprodução mínima e evidência, separar severidade de prioridade e chegar à causa raiz (5 porquês) com teste de regressão. Use ao registrar BUG-###, ao reproduzir falha encontrada em teste ou produção, ao reclassificar severidade ou ao fechar um bug.
---

# Relato de bug e causa raiz

Arquivo: `docs/qa/bugs/BUG-###.md` (maior número + 1; `Glob` antes). Cabeçalho no padrão dos existentes: `# BUG-### | Severidade: X | Prioridade: Pn | Status: ABERTO`.

## 1. Antes de registrar
1. **Reproduza** ao menos 2 vezes. Se for intermitente, anote a taxa (ex.: 3 de 10) e o que varia.
2. **Reduza ao mínimo:** remova passos, dados e perfis até restar só o que dispara o defeito. Troque uma variável por vez (conta, loja, produto, rede, versão). A reprodução mínima vale mais que o texto bonito.
3. Procure duplicata (`Grep` no título e no sintoma) e se é regressão (o commit/versão onde funcionava).
4. Separe **fato** (observado) de **hipótese** (causa suspeita); marque `[HIPÓTESE]` ou "verificar".

## 2. Conteúdo do relato
Ambiente (commit/versão, web/Android/iOS, aparelho, rede, `APP_ENV`), **passos** numerados, **esperado** (cite o critério/regra: WB-###, RN-##, DEC-###), **obtido**, frequência, **evidência** (saída de teste, `requestId` e linha de log sem dado pessoal, trace do Playwright, captura em `docs/qa/relatorios/`), impacto (quem perde o quê), história relacionada, contorno se existir. Nunca cole token, CPF completo, dado real de cliente.

## 3. Severidade x prioridade (são coisas diferentes)
| | Pergunta | Quem define |
|---|---|---|
| **Severidade** | Qual o dano quando acontece? Crítica: perda de dinheiro, vazamento, pedido/pagamento inconsistente, crash no fluxo principal. Alta: fluxo principal quebrado com contorno difícil, autorização falha. Média: secundária ou UX relevante. Baixa: cosmético (tabela em `definicao-de-pronto`) | QA, por evidência |
| **Prioridade** | Com que urgência corrigir, dado o negócio? P1 agora, P2 nesta sprint, P3 próxima, P4 backlog | QA propõe, PM/PO decidem |
Severidade alta com prioridade baixa é possível (raro e com contorno); **Crítica e Alta bloqueiam release de qualquer forma**. Não reduza severidade por causa de prazo.

## 4. Causa raiz (junto ao dev, antes de aceitar a correção)
Não conserte sintoma. Cadeia de **5 porquês**, cada elo com evidência:
`Estoque ficou -2 <- dois pedidos aprovados juntos <- leitura do estoque fora da transação <- service novo não usa @Transactional <- review não tinha caso de concorrência`.
Pare quando chegar a algo que **você pode mudar** (código, teste, processo). Classifique a causa: regra de negócio, concorrência, contrato/tipo, dado/migração, integração externa, configuração/ambiente, UX, teste ausente. Se 3 correções seguidas falharam, o problema provavelmente é de desenho: escale ao `tech-lead`.

## 5. Fechar o bug
- **Teste de regressão** no nível mais baixo possível que **falha sem a correção e passa com ela**; sem isso, o bug não fecha.
- Reteste do cenário original e dos vizinhos (variações do mesmo defeito; se houver risco de segurança, avise o `security-engineer` para análise de variantes).
- Registre: causa raiz, commit da correção, evidência do reteste, e "por que escapou" (qual teste ou revisão deveria ter pego). Se a lição é de processo, vire item para o `tech-lead`/PM.
- Status: ABERTO, EM CORREÇÃO, RETESTE, FECHADO, COMO PROJETADO (decisão do PO).

## 6. Caso "não reproduzo"
Peça o que falta (versão, passos, log), tente variar ambiente e dado, anote as tentativas e marque "não reproduzível, aguardando informação". Não feche por cansaço.

## Fontes e licença
- obra/superpowers, skill `systematic-debugging` (MIT, Jesse Vincent), consultada em 2026-11-22. Adaptado: causa raiz antes de corrigir, uma hipótese por vez, regra das três tentativas.
- addyosmani/agent-skills, `agents/test-engineer.md` (MIT), consultada em 2026-11-22: padrão "prove-it" (teste que falha primeiro).
- 5 porquês (método Toyota) e severidade x prioridade: conhecimento geral. Tabela de severidade e formato do Webag vêm de `definicao-de-pronto` e de `docs/qa/bugs/`.
