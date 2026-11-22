---
name: adr-e-decisoes-de-arquitetura
description: Quando e como escrever um ADR no Webag, com análise de trade-offs, classificação por reversibilidade, gatilho de revisão e ciclo de vida. Use ao propor, revisar ou substituir uma decisão de arquitetura (stack, módulo, dado, auth, pagamento, infra, contrato de API).
---

# ADR e decisões de arquitetura

## 1. Precisa de ADR?
| Pergunta | Se sim |
|---|---|
| Reverter depois custa mais de ~2 dias de um dev, ou exige migração de dados / app já publicado? | ADR |
| Toca auth, pagamento, dado pessoal, infra com custo? | ADR com `security-engineer` (e fundador se gastar dinheiro, CLAUDE.md §7) |
| Dois devs divergem e o resultado será copiado em muitos lugares? | ADR |
| É escolha local, trocável em um PR? | Comentário no código ou no PR, sem ADR |
Decisão de **negócio ou do fundador** vai para `docs/decisoes.md` (DEC-###); ADR é para **como construir**. Se uma depende da outra, uma cita a outra.

## 2. Classifique antes de gastar tempo
- **Porta de mão dupla** (trocar custa pouco: lib de data, nome de campo interno, cache TTL): decida rápido, registre em 5 linhas.
- **Porta de mão única** (tipo de ID público, modelo de pedido/ledger, contrato de API em app publicado, provedor de pagamento, fronteira de módulo): gaste o tempo; exija opções reais e prova.
- Para mão única, procure o **passo reversível**: feature flag, adaptador (`PaymentProvider` com `fake`), expand/contract em migração, versão `/v1`.

## 3. Fluxo
1. Ler ADRs vizinhas (`docs/arquitetura/adr/`, `Glob` + `Grep` por tema) e o `docs/decisoes.md`. Não contradiga sem substituir.
2. Contexto em 5 a 10 linhas: forças reais (1 dev, 1 VPS, LGPD, prazo, custo), não história do mundo.
3. **2 a 4 opções reais**, incluindo "não fazer / fazer o simples". Opção espantalho derruba a credibilidade do ADR.
4. Tabela de trade-offs com critérios do Webag: custo de operação, risco de dinheiro/dado, reversibilidade, curva para 1 dev, encaixe na stack (ADR-001).
5. Decisão em **uma frase**, com o porquê no critério que pesou mais.
6. Consequências com **negativas e dívida assumida** (vira DT-### se houver) e o **gatilho de revisão** ("reavaliar se p95 > X, se houver 2+ devs back-end, se o MP mudar o webhook").
7. Revisores do template: `security-engineer` (auth/dado/pagamento), `backend-dev`/`mobile-dev` (quem implementa), `qa-engineer` se muda estratégia de teste.

## 4. Padrão de qualidade do ADR
- Template: `docs/arquitetura/adr/ADR-000-template.md`. Próximo número: `Glob` em `adr/` e pegue o maior + 1.
- Fato de versão ou comportamento externo tem fonte e data, na legenda do ADR-001 (`[V]` verificado, `[N]` documentação). Sem fonte, marque `[HIPÓTESE]` e diga como validar (spike de 1 dia, teste de carga, prova com o `fake`).
- Escreva **antes** de implementar. ADR escrito depois só para justificar é registro, e deve ser marcado assim.
- Curto: o ADR-007 é a régua de densidade. Sem história, sem tutorial.

## 5. Ciclo de vida
`Proposta` -> `Aceita` -> `Substituída por ADR-YYY` ou `Descartada`. Nunca apague nem reescreva ADR aceito: crie outro que o substitua e atualize o status do antigo. Correção de erro factual pode ser editada com nota datada.

## 6. Erros comuns (barre no review)
Decisão sem alternativa; "vamos precisar disso um dia" como argumento; ADR para coisa trivial; consequência só positiva; sem gatilho de revisão; ADR que muda contrato publicado sem plano de compatibilidade (consulte `contrato-api`); skill ou doc do time contradizendo o ADR (ver DT-009).

## Fontes e licença
- addyosmani/agent-skills, skill `documentation-and-adrs` (MIT, Addy Osmani), consultada em 2026-11-22. Adaptado: quando escrever, status e "não apagar".
- Inspirado em "Documenting Architecture Decisions" (Michael Nygard, 2011) e na ideia de decisões de mão única/dupla (Jeff Bezos, carta de 2015), conhecimento geral; nenhum texto copiado.
- Webag: ADR-000, ADR-001, ADR-007, `docs/decisoes.md`.
