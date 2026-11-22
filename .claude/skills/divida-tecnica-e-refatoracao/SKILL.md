---
name: divida-tecnica-e-refatoracao
description: Classificar, priorizar e pagar dívida técnica no Webag, e refatorar sem mudar comportamento. Use ao registrar um item em divida-tecnica.md, decidir se paga agora ou depois, planejar uma refatoração ou migração (schema, módulo, versão de lib) ou remover código morto.
---

# Dívida técnica e refatoração

## 1. O que é (e o que não é) dívida
Dívida = atalho ou limitação **conhecida** que cobra juros em trabalho futuro. Não é dívida: gosto de estilo, "código feio" que ninguém toca, abstração que ainda não existe. Esses vão para Nit ou para o lixo.

| | Prudente | Imprudente |
|---|---|---|
| **Deliberada** | "Sem outbox na 1.0, evento best-effort" (DT-004): aceitar, com gatilho | "Não temos tempo para teste": recusar no review |
| **Inadvertida** | "Agora sabemos que o módulo certo era outro": refatorar quando tocar | Falta de conhecimento: ensinar e corrigir cedo |

## 2. Registro (`docs/arquitetura/divida-tecnica.md`)
Antes de criar, `Grep` pelo maior `DT-` (já houve ID duplicado, evite). Colunas do arquivo: item, impacto, custo de pagar (P/M/G), **quando (gatilho)**, origem, status. Regras:
- Gatilho mensurável: "primeiro p95 > meta no k6", "2+ instâncias da API", "Drizzle 1.0 GA", "antes do G4". Sem gatilho, é desejo.
- Dono (agente) e origem (ADR, review, bug). Status: Aberta, Aceita, Mitigada, Paga.
- Atualize o status ao pagar, com data e evidência.

## 3. Priorizar (juros, não tamanho)
Pontue 1 a 3 e some: **juros** (quanto custa por sprint em retrabalho, bug ou lentidão) + **raio** (quantas histórias/módulos tocam a área) + **risco** (dinheiro, dado, segurança, disponibilidade) - **custo** de pagar.
| Situação | Decisão |
|---|---|
| Risco de dinheiro, dado ou segurança (Crítica/Alta) | Paga já; bloqueia G4 |
| A próxima história vai passar pela área | Paga junto (escoteiro), dentro da história |
| Juros baixos, área estável | Deixe aberta com gatilho; não refatore "por higiene" |
| Depende de terceiro (versão de lib, peer dep) | Espere o gatilho externo (DT-001, DT-002, DT-003) |
Limite sugerido de capacidade para dívida: ~10 a 20% por sprint `[HIPÓTESE]`; o PM decide com o CEO.

## 4. Refatorar com segurança
1. **Cerca de Chesterton:** entenda por que está assim (git log/blame, testes, chamadores) antes de mexer. Não consegue explicar? Leia mais.
2. **Teste antes:** sem teste que fixe o comportamento, escreva-o primeiro (caracterização). Teste existente não deve ser alterado para passar.
3. **Comportamento idêntico**, incluindo erros, ordem de efeitos e mensagens.
4. **Um passo por commit**, testes verdes a cada passo. Refatoração **nunca** junto com feature ou correção.
5. Simplifique só o que o código recente toca; preferir explícito a compacto; não inline helper que dá nome a conceito.
6. Pare quando o ganho acabar. Código mais longo ou mais difícil de ler não é simplificação.

## 5. Migrações e remoção
- Schema (Drizzle): **expandir, migrar, contrair**: adiciona coluna/tabela, preenche (em lotes), escreve nos dois lados, troca a leitura, remove em outro deploy. Nunca renomeie coluna "no lugar". Backfill com limite e rollback testado.
- Troca de implementação: adaptador (`PaymentProvider`) ou strangler com flag; verifique cada consumidor.
- Contrato `/v1` em app publicado: depreciação com prazo e uso medido; remova só com uso zero.
- Código morto: liste e **pergunte ao dono** antes de apagar; git guarda o histórico.

## 6. Saída
Entrada no `divida-tecnica.md` + (se pagar) história no backlog via PM com critério de pronto: comportamento preservado, testes verdes, evidência (skill `verificacao-antes-de-concluir`).

## Fontes e licença
- addyosmani/agent-skills, skills `deprecation-and-migration` e `code-simplification` (MIT, Addy Osmani), consultadas em 2026-11-22. Adaptado: cerca de Chesterton, regras de simplificação, expandir/migrar/contrair, zumbi.
- Quadrante da dívida técnica (Martin Fowler, 2009), conhecimento geral, reescrito. A fórmula de pontuação e o limite de 10 a 20% são do autor desta skill `[HIPÓTESE]`.
- Webag: `docs/arquitetura/divida-tecnica.md` (DT-001 a DT-079).
