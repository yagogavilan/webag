---
name: piramide-e-estrategia-de-testes
description: Decidir em que nível testar cada regra (unitário, integração, contrato, E2E), o que não automatizar, como evitar teste frágil e como tratar flakiness no Webag. Use ao planejar testes de uma história, revisar testes de dev, justificar corte de cobertura ou investigar suíte lenta/instável.
---

# Pirâmide e estratégia de testes (método de decisão)

Ferramentas, ambientes e metas ficam em `docs/qa/estrategia.md` e no ADR-006. Aqui: **como escolher** o nível e **o que não testar**.

## 1. Regra do nível mais baixo que captura o risco
| O risco está em... | Nível | Exemplo Webag |
|---|---|---|
| Cálculo ou regra pura | Unitário (Vitest, sem I/O) | frete, comissão, cupom em centavos; transição da máquina de estados; horário da loja com relógio injetado |
| SQL, PostGIS, lock, migração, fila | Integração com banco real (Testcontainers) | `ST_DWithin`, `FOR UPDATE` com 2 transações, expandir/contrair |
| Contrato HTTP (status, campos, 401/403/404) | E2E de API + validação contra `openapi.yaml` | recurso alheio retorna 404/403; resposta bate com o YAML |
| Integração com terceiro | Adaptador contra **fixtures gravadas**, provedor `fake` no resto | webhook MP: assinatura válida, inválida, repetida, fora de ordem |
| Tela com regra (estado vazio, erro, máscara) | Componente (Testing Library / RNTL) | estados carregando, vazio, erro, offline |
| Jornada que cruza camadas e dá prejuízo se quebrar | E2E de UI (Playwright, Maestro), poucos | comprar com PIX, aceitar pedido, pedir troca |
Se o mesmo erro é pego num nível mais baixo, **apague ou não escreva** o E2E redundante. Proporção-alvo `[HIPÓTESE]`: ~55% unitário, 25% integração, 15% API/contrato, 5% UI.

## 2. Priorize por risco, não por cobertura
Pontue regra: **dano** (dinheiro, dado, pedido inconsistente) x **probabilidade** (código novo, concorrência, terceiro) x **detectabilidade** (alguém percebe sozinho?). Dinheiro, estoque, estado do pedido, pagamento, autorização e troca recebem teste a fundo (meta de cobertura do ADR-006). Texto de tela e cosmético não.
Cobertura de linha é piso, não prova: um teste sem asserção sobre a regra "cobre" e não protege. Verifique **mutação mental**: inverta a condição; algum teste falha?

## 3. O que não automatizar (ou só uma vez)
Gosto visual e copy (revisão humana/designer); fluxo executado uma única vez (migração de uso único: valide com consulta); UI de terceiro (checkout do MP: use o `fake`); permutação combinatória inteira (use pairwise/partições: válido, limite, inválido); teste que repete a implementação linha a linha (quebra a cada refatoração); sensação de performance (isso é k6, não E2E); hardware real (fica no roteiro manual do fundador).

## 4. Higiene de teste
Comportamento, não implementação; um conceito por teste, nome que lê como especificação; independentes (sem ordem, sem estado mutável compartilhado); dados por **builders**; mock **só na fronteira** (banco e rede, não entre funções internas); snapshot só se cada mudança for revisada; erro e vazio sempre testados.

## 5. Flakiness: causas e remédios
| Causa | Remédio |
|---|---|
| Espera por tempo fixo | Esperar condição/evento |
| Relógio e fuso (23:59, virada de dia) | Injetar relógio; fixar `America/Sao_Paulo` |
| Dado compartilhado ou ordem de execução | Builders, banco/esquema por suíte |
| Concorrência sem sincronia | Barreira/`Promise.all` controlada; assertar o invariante, não a ordem |
| Rede/terceiro real | Fixture, `fake`, servidor local |
| Aleatoriedade | Semente fixa registrada no log |
Política: teste instável é **bug do teste**. Reproduza N vezes, isole a causa; sem prazo para o conserto, quarentena com issue e data (ADR-006). Meta: 0 testes em quarentena por mais de 2 sprints. `retry` mascara, não cura.

## 6. Bug novo = teste novo
Escreva primeiro o teste que **falha** reproduzindo o bug (no nível mais baixo possível) e só depois a correção (skill `relato-de-bug-e-causa-raiz`).

## Fontes e licença
- addyosmani/agent-skills, `agents/test-engineer.md` (MIT, Addy Osmani), consultada em 2026-11-22. Adaptado: nível mais baixo, regras de mock/independência, "prove-it".
- Conceito de pirâmide de testes (Mike Cohn; Martin Fowler "TestPyramid"), conhecimento geral, texto próprio. Proporções e pontuação de risco são `[HIPÓTESE]` do autor, alinhadas a `docs/qa/estrategia.md`.
