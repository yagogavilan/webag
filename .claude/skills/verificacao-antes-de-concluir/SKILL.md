---
name: verificacao-antes-de-concluir
description: Regra de evidência antes de afirmar que algo está pronto, corrigido ou aprovado (lint, typecheck, testes, build, contrato, bug). Use antes de emitir parecer de review, dizer que uma correção funcionou, aprovar ADR/contrato ou reportar conclusão ao CEO.
---

# Verificação antes de concluir

Princípio: afirmar sem ter rodado é erro de honestidade, não de processo. "Deve funcionar", "provavelmente passa" e "o dev disse" **não são evidência**.

## Função de portão (toda afirmação de status)
1. Qual comando prova a afirmação? (veja a tabela)
2. Rode-o **agora**, completo, no estado atual do branch (execução antiga não vale depois de mudar o código).
3. Leia a saída inteira: código de saída, número de falhas, avisos relevantes.
4. A saída confirma? Se não, reporte o estado real com a evidência.
5. Só então afirme, **colando o resultado** (contagem de testes, trecho do erro, hash do commit).

## Afirmação -> evidência exigida (Webag)
| Afirmação | Evidência |
|---|---|
| Testes passam | Saída de `pnpm test` (ou filtro do pacote) com 0 falhas e contagem; para a API, integração com banco real, não só unitário |
| Lint e tipos limpos | `pnpm lint` e `pnpm typecheck` com 0 erros (lint passando não prova que compila) |
| Build ok | `pnpm build` com saída 0 |
| Contrato em dia | `pnpm generate:check` sem diff e teste de contrato verde |
| Bug corrigido | O sintoma original **não reproduz mais**; o teste de regressão **falha sem a correção e passa com ela** |
| Dev/subagente terminou | `git diff`/`git log` mostram a mudança; rode os testes você mesmo |
| Critério de aceite atendido | Checklist item a item contra o PRD, cada um com evidência |
| Migração segura | Aplicada do zero e sobre dado existente, rollback testado |
| Refatoração sem mudança de comportamento | Testes antigos passam **sem edição** |
Os nomes dos scripts vêm do `package.json` raiz; confira se mudaram.

## Sinais de alerta (pare e verifique)
Palavras "deve", "provavelmente", "parece"; satisfação antes de rodar; vontade de commitar, abrir PR ou aprovar sem rodar; confiar no relatório de outro agente; checagem parcial ("rodei só o arquivo que mexi") apresentada como total; "só desta vez".

## Quando não dá para verificar
Sem Docker, sem rede, sem permissão, sem aparelho: diga **"não verificado"**, o motivo e o que falta (quem roda e como). Nunca preencha a linha com "ok". Não rode comando que gaste dinheiro, toque produção ou apague dado (CLAUDE.md §7) para conseguir evidência.

## Aplicação no parecer do Tech Lead
A linha `Verificado:` do parecer (`docs/arquitetura/reviews/`) traz, para lint, typecheck, testes, `generate:check` e build: comando, resultado e data/commit. Item não executado aparece como "não executado: motivo". Parecer APROVADO sem essa linha preenchida é inválido. Se o resultado contradiz o relato do dev, o resultado manda, e o fato vai para o parecer.

## Fontes e licença
- obra/superpowers, skill `verification-before-completion` (MIT, Jesse Vincent), consultada em 2026-11-22. Adaptado: função de portão, tabela afirmação/evidência, sinais de alerta; comandos e critérios trocados pelos do Webag (turbo, `generate:check`, banco real).
- Tom e exceções ("não verificado", limites do CLAUDE.md §7) escritos para este projeto.
