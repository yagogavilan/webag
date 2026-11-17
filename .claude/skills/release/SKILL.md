---
name: release
description: Prepara e decide uma release do Webag (gates G4 e G5) com pareceres de QA, Security e PO e checklist das lojas. Use antes de gerar build de produção ou enviar para as lojas.
argument-hint: <versão, ex. 1.0.0>
disable-model-invocation: true
---

# /release $ARGUMENTS

## G4 — Release candidate
Delegue em paralelo:
- `qa-engineer`: regressão dos fluxos críticos, bugs abertos por severidade, parecer em `docs/qa/release-$ARGUMENTS.md`, roteiro de teste em aparelho para o fundador.
- `security-engineer`: revisão do diff desde a última release, auditoria de dependências, busca de segredos, checklist MASVS/LGPD aplicável, parecer em `docs/seguranca/release-$ARGUMENTS.md`.

Se qualquer um REPROVAR: liste os bloqueantes, delegue as correções e repita. Você não derruba veto — só o fundador, com risco registrado em `docs/decisoes.md`.

## G5 — Publicação (primeira publicação ou mudança de privacidade/permissões)
- `product-owner` + `security-engineer`: preencher o checklist da skill de lojas — peça que leiam `.claude/skills/publicacao-lojas/SKILL.md` e confirmem nas páginas oficiais os itens que podem ter mudado. Textos da loja, Data Safety/App Privacy, conta demo.
- `mobile-dev`: build de produção via EAS, versão/buildNumber corretos, notas da versão.

## Decisão
Apresente ao fundador: pareceres, riscos aceitos, o que ele precisa fazer (enviar para revisão, testar no aparelho, aprovar). **Envio às lojas e deploy em produção só com autorização explícita dele.**
