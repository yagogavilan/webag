# Instalar o Webag no iPhone como app (IPA / TestFlight)

**Nada deste guia foi executado.** É o roteiro para quando o fundador autorizar (CLAUDE.md §7; registrar a autorização em `docs/decisoes.md` antes do primeiro comando remoto). Enquanto isso, use o Safari: `docs/guias/rodar-no-meu-computador.md` (grátis, sem conta).

## Grátis x custa

| Caminho | Custo | Precisa de conta? | Serve para |
|---|---|---|---|
| Safari + "Adicionar à Tela de Início" (`pnpm iphone`) | Grátis | Não | Ver e testar o app inteiro com a API do seu computador |
| Expo Go (App Store) | Grátis | Não | Só se a versão da App Store abrir o SDK 58 (abaixo) |
| Build para o seu iPhone (ad hoc, perfil `preview`) | **Apple Developer Program**: anual, `[confirmar valor atual no site da Apple]` (o `docs/deploy/checklist-publicacao-lojas.md` cita US$ 99/ano, não reverificado em 2026-11-22). **EAS**: criar a conta é grátis; limites e preço dos builds `[confirmar em expo.dev/pricing]` | Apple Developer (pago) + conta Expo | Instalar um `.ipa` de verdade em aparelhos cadastrados |
| TestFlight (`production` + `eas submit`) | Mesmo Apple Developer Program | Apple Developer + conta Expo + App Store Connect | Testers instalarem pelo app TestFlight; é o passo antes da App Store |
| Xcode com Apple ID gratuito (só Mac) | Grátis | Apple ID comum | Instalar no seu iPhone um build local; `[confirmar]` expira em poucos dias e exige Mac com Xcode. **NÃO TESTADO** |
| App Store | Mesmo programa; revisão da Apple | Tudo acima + G4 e G5 | Publicação (fora deste guia: `docs/deploy/checklist-publicacao-lojas.md`) |

Um `.ipa` ou TestFlight **sempre** exige o Apple Developer Program (pago, anual); não existe caminho oficial grátis para distribuir um app nativo a um iPhone sem Mac. `[HIPÓTESE sobre exceções: confirmar com a Apple]`.

## Expo Go x SDK 58 (pesquisa de 2026-11-22)

Pergunta: o Expo Go da App Store abre projetos SDK 58 (o `apps/mobile` usa `expo ~58.0.26`)?

**Resposta: não consegui confirmar.** Os sites expo.dev, docs.expo.dev e itunes.apple.com estão bloqueados no ambiente onde pesquisei (não resolvem/recusados pelo proxy), então não li a página de download nem a ficha da App Store. O que foi verificado, com fonte:

| Fato | Fonte |
|---|---|
| `expo@58.0.0` foi publicado no npm em **2026-09-29**; a tag `latest` é `58.0.26` (não 2026-10-15, como se supunha) | `https://registry.npmjs.org/expo` (campo `time` e `dist-tags`), consultado em 2026-11-22 |
| O Expo Go só suporta o SDK mais recente: "Expo Go as it only supports the latest SDK version and previous versions are no longer supported" | `docs/pages/workflow/upgrading-expo-sdk-walkthrough.mdx` no repositório `expo/expo` (branch `main`), via `raw.githubusercontent.com`, 2026-11-22 |
| A documentação manda baixar outras versões do Expo Go pela página de download ("You can also download any version of Expo Go from the download page", link `expo.dev/go`) e descreve o Expo Go como "playground for students and learners"; apps de verdade usam development build | `docs/pages/get-started/set-up-your-environment.mdx`, mesmo repositório |
| Existe o comando (oculto) `eas go`: "create a custom Expo Go and submit to TestFlight", com `--sdk-version`; exige login no Expo e fala com o App Store Connect (credenciais Apple, app e grupo de TestFlight); bundle id padrão `com.<usuario>.expogo` | Código-fonte `packages/eas-cli/src/commands/go.ts` (`expo/eas-cli`, `main`); changelog do eas-cli 27.11.0 (2026-11-19) cita correções do `eas go` para SDK 57 |
| O CHANGELOG do `expo/expo` em `main` ainda termina o topo em 57.0.0 (2026-07-08): não achei nele o texto de lançamento do 58 | `CHANGELOG.md`, `main` |

**Não verificado** (precisa de quem tem acesso): qual SDK a versão atual do Expo Go na App Store aceita. Como conferir em 1 minuto, sem custo: App Store > Expo Go > "Novidades" (nota da versão), ou `expo.dev/go`; ou simplesmente escanear o QR do `pnpm iphone` no Expo Go: se for incompatível, ele avisa e você usa o Safari.

**`eas go` como saída** (se a App Store estiver atrás do SDK 58): cria o *seu* Expo Go no SDK 58 e envia ao TestFlight. Pelo código, exige conta Expo e acesso ao App Store Connect, ou seja, **o Apple Developer Program pago** `[HIPÓTESE, inferido do código; confirmar]`. Não compensa: pelo mesmo custo você testa o próprio Webag no TestFlight (abaixo). Recomendação: Safari para ver o app agora; TestFlight quando o fundador autorizar o programa da Apple.

## O que já existe no repositório

| Item | Onde | Valor / observação |
|---|---|---|
| Identificador iOS | `apps/mobile/app.config.ts` | `ios.bundleIdentifier: br.com.webag.app`; `supportsTablet: false`; `ITSAppUsesNonExemptEncryption: false` |
| Perfis EAS | `apps/mobile/eas.json` | `development` (dev client, `ios.simulator: true`, só simulador), `preview` (`distribution: internal`), `production` (`autoIncrement`, loja). `appVersionSource: remote`, `cli.version >= 16.0.0` |
| Trava de URL | `app.config.ts` (`assertPublicUrl`) | Em `preview` e `production` o build **falha** se `EXPO_PUBLIC_WEB_URL`/`EXPO_PUBLIC_API_URL` não forem `https://` de domínio real (recusa `localhost`, IP e `SEU-DOMINIO`). Os dois perfis hoje têm `https://SEU-DOMINIO` e `https://api.SEU-DOMINIO`: **precisam ser trocados** |
| Envio à loja | `eas.json` `submit.production.ios` | `{}` (sem `ascAppId`; será perguntado ou criado) |
| Id do projeto EAS | `app.config.ts` | Vem da variável `EAS_PROJECT_ID` (não há `app.json` para o `eas init` gravar) |
| Checklist da loja | `docs/deploy/checklist-publicacao-lojas.md` | App Privacy, textos, contas |

Consequência importante: **um `.ipa` preview/production não fala com a API do seu computador** (a trava exige HTTPS público; e o iOS bloqueia http fora da rede local). Para testar um `.ipa` é preciso API e site de **staging com HTTPS** (`docs/deploy/guia-deploy.md`). Um build de desenvolvimento para iPhone físico apontando para o computador (dev client) exigiria um perfil novo, por exemplo `development-device` (`developmentClient: true`, `distribution: internal`, sem `ios.simulator`); ele **não existe** hoje e não foi criado `[HIPÓTESE: confirmar o comportamento do ATS do iOS com http://<IP-da-rede> num dev client]`.

## Passo a passo (só depois da autorização)

Antes de qualquer comando remoto, escrever no `docs/decisoes.md`: projeto, conta Expo, `bundleIdentifier` (`br.com.webag.app`), perfil e destino (aparelhos cadastrados ou grupo de TestFlight), e o custo aceito.

1. **Contas (feitas pelo fundador, com a senha e o 2º fator dele; ninguém do time recebe senha)**: Apple Developer Program (individual ou organização; ver o checklist) e conta Expo. Confirmar o valor e o plano nos sites oficiais `[confirmar]`.
2. **Ambiente de staging com HTTPS** e as variáveis `EXPO_PUBLIC_*` reais (`WEB_URL`, `API_URL`; `EXPO_PUBLIC_APP_ENV=staging` para o provedor simulado, ou chaves de teste do Mercado Pago). Atenção: `APP_ENV=production` esconde "Simular pagamento" e exige Mercado Pago real.
3. **EAS CLI com versão fixada** (não usar `@latest` solto): por exemplo `pnpm dlx eas-cli@27.11.0 --version` (a 27.11.0 é a mais recente que vi, 2026-11-19; fixe a que o time validar). Daqui em diante `eas` abaixo = esse comando.
4. `eas login` e `eas init` (o id do projeto vai para a variável `EAS_PROJECT_ID`, não há `app.json`). Sempre dentro de `apps/mobile`.
5. **Instalar direto no seu iPhone (ad hoc)**: `eas device:create` (abre um link para registrar o iPhone pelo Safari; usa o Apple Developer; a Apple limita aparelhos por ano `[confirmar]`), depois `eas build -p ios --profile preview`. O EAS pede o login da Apple na primeira vez (você digita; nunca cole senha em chat) e gera os certificados. Ao terminar, abra o link/QR do build no iPhone. No iOS 16 ou mais novo pode ser preciso ligar o **Modo de Desenvolvedor** (Ajustes > Privacidade e Segurança) `[confirmar]`.
6. **TestFlight**: `eas build -p ios --profile production` e depois `eas submit -p ios --profile production --id <ID-do-build>` (sempre um ID explícito, nunca "o último"). Em App Store Connect > TestFlight, adicione você como testador **interno** (instala sem revisão da Apple) e instale pelo app TestFlight. Testadores externos passam por revisão beta `[confirmar]`.
7. **Depois**: registrar em `docs/` a tupla versão, ID do build, commit e perfil; a publicação na App Store segue o G4 e o G5 (`docs/deploy/checklist-publicacao-lojas.md`). Nada de `eas submit` para a loja pública, `eas update` em produção ou troca de plano sem nova autorização.

Segredos: nunca commitar `.p8`, `.p12`, `.mobileprovision`, chaves nem `.env` (o `.gitignore` já cobre); conferir `.easignore` antes do primeiro upload [o repositório não tem `.easignore` em `apps/mobile` hoje: criar excluindo `.env*` e chaves].

Para o `security-engineer`: o fluxo toca armazenamento local (SecureStore), pagamento e credenciais de loja; revisar antes do TestFlight.
