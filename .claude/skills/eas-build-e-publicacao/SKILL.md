---
name: eas-build-e-publicacao
description: Fluxo seguro de EAS Build, Submit e Update (OTA) do app Webag - perfis, versionamento, canais, credenciais, trilhas das lojas e o que exige autorização do fundador. Use ao preparar build de teste, build de produção, submissão ou atualização OTA. Nunca peça nem manipule credenciais reais.
---

# Autorização primeiro (CLAUDE.md §7, DEC-003, gate G5)
Build `development`/`preview` interno: livre. **Submit para loja, OTA em produção, mexer em conta/credencial, gastar dinheiro (plano pago do EAS, taxa de conta de desenvolvedor): só com autorização do fundador registrada em `docs/decisoes.md`.** Pedido de "configurar" ou "beta" não autoriza lançamento público. Antes de qualquer comando remoto, confirme e escreva: projeto, conta/equipe, `applicationId`/`bundleIdentifier`, perfil e destino (trilha ou grupo de testers). Checklist de loja: skill `publicacao-lojas`.

# Credenciais (regra de ouro: nunca ver, nunca pedir, nunca colar)
- Primeira configuração de assinatura e acesso às lojas é feita **pelo dono da conta**, pelo fluxo oficial (CLI ou painel). O agente prepara instruções, não executa com senha/MFA.
- Proibido: automatizar senha ou MFA, baixar chave privada, criar/alterar papéis IAM, commitar `.p8`, `.p12`, keystore, JSON de conta de serviço, `.env`. Nada disso em chat, log, issue ou arquivo comprimido.
- CI usa `EXPO_TOKEN` previamente criado e protegido pelo fundador. Falha de build **não** justifica revogar chave, resetar assinatura, aceitar contrato ou trocar plano.
- Conferir `.easignore` (ele substitui o `.gitignore` no upload): excluir chaves e `.env`. Variáveis de EAS: segredo como "secret"; `EXPO_PUBLIC_*` é público por definição.

# Perfis (`eas.json`)
| Perfil | Uso | Pontos |
|---|---|---|
| `development` | Dev client (`developmentClient: true`), distribuição interna | Libs nativas, depuração |
| `preview` | Testers internos/QA, APK/IPA ad hoc ou interno | Mesmo código de produção, API de staging |
| `production` | Loja | `autoIncrement: true`; API de produção; sem dev client |
`appVersionSource: "remote"` (contador de build no EAS) e `cli.version` com piso. Fixe a versão do `eas-cli` no projeto; **não** rodar `npx --yes eas-cli@latest` sem fixar. Criar perfil só se faltar; preservar identificadores existentes.

# Versionamento
`version` semântica no `app.config.ts`; `buildNumber`/`versionCode` incrementais pelo EAS. Registrar em `docs/` (ou no PR de release) a tupla: versão, build ID, commit, perfil. Submeter **um build ID explícito**, nunca "o último".

# Trilhas das lojas
- Android: interna -> fechada -> aberta -> produção. Contas pessoais novas podem exigir período de teste fechado com testers antes da produção [HIPÓTESE: conferir a política vigente do Google Play antes de planejar o cronograma].
- iOS: TestFlight interno/externo -> revisão da App Store. Prazo de revisão não é controlável; planejar folga.
- Estado "na fila" ou "enviado" não é "aprovado" nem "publicado": reporte só o que foi verificado (ID do build, versão, último estado confirmado).

# OTA (EAS Update)
- Só JS e assets: **mudança nativa (lib, permissão, plugin, SDK) exige novo build**. Defina `runtimeVersion` para casar update com binário compatível; update nunca vai para binário incompatível.
- Canal por ambiente: `preview` -> `production`; testar o update no `preview` antes. Manter plano de reversão (republicar o anterior) e mensagem de update descritiva.
- Nada de OTA que mude o propósito do app ou contorne a revisão das lojas [HIPÓTESE: conferir políticas Apple/Google]; ao mexer em auth, pagamento ou permissão, avisar o `security-engineer`.
- Apps antigos ficam meses no ar: OTA e API devem continuar compatíveis (ver `contrato-api`).

# Checklist antes do build de release
- [ ] `expo-doctor`, lint, typecheck, testes e Maestro dos fluxos críticos passando
- [ ] Sem segredo no bundle; `.easignore` revisado; env do perfil correta
- [ ] Permissões e textos de uso (localização, notificação) conferidos; política de privacidade e Data Safety/App Privacy em dia (`publicacao-lojas`)
- [ ] QA e Security aprovaram (G4); fundador autorizou (G5) se for loja
- [ ] Reversão definida (versão anterior, OTA anterior)

## Fontes e licença
- expo/skills, skill `eas-app-stores` (MIT, LICENSE conferido), consultada em 2026-11-22. Adaptado: pré-condições de autorização, regras de credenciais e `.easignore`, perfis, submissão por ID explícito, estado vs. publicação. Descartados: scripts auxiliares, comandos `@latest --yes` e comando de feedback ao Expo.
- OTA/canais/`runtimeVersion` e trilhas das lojas: a fonte não cobre EAS Update; conteúdo escrito a partir de conhecimento geral e da skill `padroes-mobile`. [HIPÓTESE] conferir na documentação oficial do Expo e das lojas na hora de usar.
