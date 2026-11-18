# Checklist de publicação nas lojas (Google Play e App Store)

Base: skill `publicacao-lojas`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json`, backlog (WB-010, WB-038/124, WB-213/214, WB-217) e `docs/gestao/board.md` (R-08). Escrito em 2026-11-18.

> Regras das lojas mudam. Tudo marcado `[HIPÓTESE]` foi escrito de memória e **precisa ser conferido** nas páginas oficiais (Google Play Console Help; App Store Review Guidelines e App Store Connect Help) no dia do envio. Anote a data da conferência em cada seção (campo "Conferido em").
> Publicar é o gate **G5**: só com G4 aprovado (QA e Security) e **autorização escrita do fundador** em `docs/decisoes.md` (CLAUDE.md, regra 3). Contratar conta paga também exige autorização (regra 6).

## 0. Estado hoje (o que já está pronto e o que bloqueia)

| Item | Estado | Onde |
|---|---|---|
| `eas.json` com perfis `development`, `preview`, `production` (sem credenciais) | Pronto | `apps/mobile/eas.json` |
| Ícone 1024 (sem transparência), ícone adaptativo Android, splash | Pronto (rascunho de marca, ver 4.1) | `apps/mobile/assets/` |
| Bundle id / package | `br.com.webag.app` nas duas lojas. **Não dá para trocar depois de publicado** | `apps/mobile/app.config.ts` |
| Sem backup automático do Android (`allowBackup: false`), localização só aproximada e só em uso | Pronto | `app.config.ts` (SEC-012, SEC-084) |
| Pergunta de criptografia da Apple respondida (`ITSAppUsesNonExemptEncryption: false`) | Pronto (só HTTPS padrão) | `app.config.ts` |
| **Exclusão de conta dentro do app e por página web** | **NÃO existe** no app nem no contrato da API (verificado em 2026-11-18). WB-213/WB-214 | Bloqueia o G5 (Apple 5.1.1(v), Google) |
| **Denúncia/moderação de conteúdo de usuário** (avaliações, lojas) | Backlog (WB-038/124) | Apple 1.2 exige |
| Política de privacidade e termos em URL pública | Textos existem no admin (`apps/web/src/features/legal`); **falta hospedar a URL pública** | Ver seção 5 |
| Conta demo para o revisor | Falta definir (ver 8) | |
| Feature graphic 1024x500, screenshots finais, textos finais | Falta (ver 4 e 6) | Designer + PO |
| Contas Apple/Google/Expo | Dependem do fundador | Seção 1 |

## 1. Contas e acessos (dependem do fundador)

Conferido em: ____/____/______

| Conta | Custo [HIPÓTESE] | Pré-requisitos | Observações |
|---|---|---|---|
| Expo / EAS (https://expo.dev) | Grátis (plano com fila de build; planos pagos para build prioritário) | E-mail | Guarda as credenciais de assinatura. Crie com um e-mail da empresa, não pessoal |
| Google Play Console | US$ 25, uma vez | Conta Google; documento; cartão | Conta **pessoal nova**: a Google exige um período de **teste fechado** (referência: 12 testadores por 14 dias seguidos) antes de liberar produção; **confirmar a regra vigente**. Conta de **organização** exige CNPJ e D-U-N-S |
| Apple Developer Program | US$ 99/ano | Apple ID com 2 fatores; individual (CPF) ou organização (CNPJ + D-U-N-S, leva dias) | Individual mostra o **seu nome** como vendedor; organização mostra a empresa. Decisão do fundador |
| Domínio com páginas públicas | ~R$ 40/ano | `docs/deploy/guia-deploy.md` seção 5 | Política de privacidade, termos e suporte em URLs públicas |
| Conta de teste de pagamento | Grátis | Mercado Pago | Para testar PIX/cartão antes de publicar |

- [ ] Fundador decide: conta de **pessoa física ou CNPJ** nas duas lojas (CNPJ evita mostrar o nome pessoal e é a base para vender como empresa) e registra em `docs/decisoes.md`.
- [ ] Confirmar que `br.com.webag.app` é o identificador desejado (por convenção usa o domínio ao contrário: `webag.com.br`). Depois da primeira publicação não muda.

## 2. Preparação do projeto no EAS (uma vez)

Pré-requisito: Node 24 e pnpm instalados, repositório clonado, `pnpm install` feito. Rode tudo **dentro de `apps/mobile`**. Substitua `SEU-DOMINIO`.

```bash
cd apps/mobile
pnpm dlx eas-cli@latest login            # conta Expo
pnpm dlx eas-cli@latest init             # cria o projeto no Expo e mostra o projectId
```

1. O `eas init` mostra um `projectId` (não é segredo). Como o `app.config.ts` é dinâmico, ele não grava sozinho: coloque o valor na variável `EAS_PROJECT_ID` (veja o passo 2) **ou** cole em `extra.eas.projectId` no `app.config.ts`.
2. Variáveis por ambiente (**públicas**: tudo que está no app é público; nunca ponha chave secreta aqui):

   ```bash
   pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.SEU-DOMINIO --visibility plaintext
   pnpm dlx eas-cli@latest env:create --environment production --name EAS_PROJECT_ID    --value <projectId>             --visibility plaintext
   # repita com --environment preview (API de ensaio, se houver) e --environment development
   ```
   Os nomes de comando do EAS mudam entre versões: se `env:create` não existir, veja `eas --help` e a documentação (https://docs.expo.dev/eas/environment-variables/). `[HIPÓTESE]`
3. Credenciais de assinatura: o **EAS gera e guarda** (keystore Android e certificado/perfil iOS) na primeira build de cada plataforma. **Baixe e guarde um backup do keystore Android** (`eas credentials`): perder a chave de upload dá trabalho para recuperar e a chave de assinatura final fica com a Google (App Signing).
4. Nada de credencial no repositório: `eas.json` não tem chaves. Chave de serviço da Google Play, `.p8` da Apple e `EXPO_TOKEN` ficam no EAS/gerenciador de senhas.

### Perfis (`apps/mobile/eas.json`)

| Perfil | Para quê | Resultado | Distribuição |
|---|---|---|---|
| `development` | Dev client para desenvolver com código nativo | Android `.apk`; iOS só simulador | Interna |
| `preview` | Testadores internos (fundador, lojistas piloto) | Android `.apk` instalável por link; iOS exige aparelhos cadastrados (`eas device:create`) ou use TestFlight com o perfil `production` | Interna |
| `production` | Lojas | Android `.aab`; iOS `.ipa`; número da build sobe sozinho (`autoIncrement`, versão remota) | Lojas |

Comandos:

```bash
pnpm dlx eas-cli@latest build --profile preview    --platform android   # teste interno
pnpm dlx eas-cli@latest build --profile production --platform all       # para as lojas
pnpm dlx eas-cli@latest submit --profile production --platform android  # envia ao Google Play (faixa "interno", rascunho)
pnpm dlx eas-cli@latest submit --profile production --platform ios      # envia ao App Store Connect (TestFlight)
```

Observações:
- **Primeiro envio ao Google Play**: o 1º `.aab` costuma precisar ser enviado **manualmente** pelo Play Console (o envio por API só funciona depois). Para o `submit` automático, crie uma **conta de serviço** (Google Cloud) com acesso ao app no Play Console e cadastre a chave no EAS (`eas credentials`), nunca no repositório. `[HIPÓTESE]`
- **iOS**: o EAS pede o login da Apple e cria certificados e perfis. Use um Apple ID com 2 fatores; o código chega ao aparelho do fundador, então reserve um momento com ele.
- **Versão**: antes da loja troque `version` de `0.1.0` para `1.0.0` em `app.config.ts`. O `buildNumber` (iOS) e `versionCode` (Android) sobem sozinhos.
- **Atualização sem loja (EAS Update/OTA)**: **não está instalada** (`expo-updates` não está nas dependências). É para correções só de JavaScript; entra depois do 1º lançamento, com canal por ambiente (`preview`, `production`). Até lá, toda correção é uma nova versão nas lojas.
- Antes de cada build de loja: `pnpm --filter @webag/mobile doctor` (`expo-doctor`), `lint`, `typecheck` e `test` verdes, e **teste o `.aab`/`.ipa` exato que será enviado** (crash na revisão é motivo comum de rejeição).

## 3. Segurança e conformidade do binário (checar antes do envio)

- [ ] `EXPO_PUBLIC_API_URL` de produção aponta para `https://api.<domínio>` (nunca HTTP, nunca `localhost`).
- [ ] Nenhuma chave secreta em variável `EXPO_PUBLIC_*` (tudo ali vai embutido no app). Tokens ficam só no `expo-secure-store`.
- [ ] Só as permissões usadas: localização **aproximada, apenas em uso** (as de localização precisa e em segundo plano estão bloqueadas). Texto do diálogo em `app.config.ts`, explicado em tela própria antes (design-system §5.6).
- [ ] Sem funcionalidade "em breve", tela vazia ou link quebrado (`docs/qa/`).
- [ ] Pagamento de **bens físicos** por PIX/Mercado Pago: não usar compra dentro do app (Apple/Google) para produtos físicos (Apple 3.1.3(e) `[HIPÓTESE]`).
- [ ] Checklist `checklist-seguranca` e o parecer do `security-engineer` (G4) concluídos.

## 4. Imagens e textos

### 4.1 Ícone, splash e arte

| Item | Especificação [HIPÓTESE, conferir] | Estado |
|---|---|---|
| Ícone iOS | 1024x1024 PNG, **sem transparência e sem cantos arredondados** | Gerado: `apps/mobile/assets/icon.png` |
| Ícone adaptativo Android | Primeiro plano 1024x1024 com transparência (conteúdo na zona segura, ~66% central) + cor de fundo `#00696F` | Gerado: `assets/adaptive-icon.png` |
| Ícone da Google Play (listagem) | 512x512 PNG, até 1 MB | A exportar do mesmo desenho |
| Splash | Fundo `#00696F`, símbolo branco de 96 px (design-system) | Gerado: `assets/splash-icon.png` |
| Feature graphic (Play) | 1024x500 PNG/JPG | **Falta** (Designer) |

Os PNGs saíram de `docs/design/assets/webag-icone-app.svg` (rascunho vetorial: a marca "não é irreversível até o G5", `docs/design/identidade.md`). Se o designer refinar o SVG, gere de novo: a receita é renderizar o SVG a 1024x1024 (ícone sem transparência; primeiro plano e splash sobre fundo transparente) com `sharp`. **Decisão do fundador: aprovar a marca antes de publicar** (depois fica atrelada à loja e a trocar custa uma nova revisão).

### 4.2 Screenshots

- [ ] Telefone Android: no mínimo 2 (a Play pede de 2 a 8; lados entre 320 e 3840 px, proporção até 2:1) `[HIPÓTESE]`.
- [ ] iPhone: o(s) tamanho(s) de tela que a App Store exige hoje (em geral a classe de 6,9" ou 6,5": confira em App Store Connect > Image Specifications) `[HIPÓTESE]`. O app é só iPhone (`supportsTablet: false`): não exige screenshot de iPad.
- [ ] Capturar do build de produção/preview com **dados de demonstração** realistas (sem dado pessoal real), nas telas principais: explorar lojas, loja/produtos, sacola, pagamento PIX, acompanhar pedido, conta.
- [ ] Sem moldura que engane nem promessa fora do app.

### 4.3 Textos (rascunho do PO `[HIPÓTESE]`, revisar com o fundador)

| Campo | Limite [conferir] | Rascunho |
|---|---|---|
| Nome | 30 caracteres | `Webag` |
| Subtítulo (iOS) | 30 | `Compras do seu bairro` |
| Descrição curta (Play) | 80 | `Compre de lojas de Francisco Morato e região e receba em casa.` |
| Descrição completa | 4000 | Explicar: lojas da região, PIX e cartão, acompanhar o pedido, trocas. **Só o que o app faz na versão publicada** |
| Palavras-chave (iOS) | 100, separadas por vírgula | `mercado,lojas,entrega,delivery,Francisco Morato,Franco da Rocha,Caieiras,Cajamar,pix` |
| Categoria | | Compras (Shopping) |
| URL de suporte | | `https://<domínio>/suporte` (a criar) |
| URL de marketing | opcional | Landing page |
| Notas de lançamento | | "Primeira versão" |

## 5. Privacidade

- [ ] **Política de privacidade** em URL pública (`https://<domínio>/privacidade`) e dentro do app (`apps/mobile/app/legal/[type].tsx` já abre os textos do servidor). O texto passa por revisão do fundador/jurídico antes do G5 (HIP-D20; o time não substitui advogado).
- [ ] **Termos de uso** em URL pública e no app.
- [ ] **Encarregado (DPO)** e canal do titular publicados (WB-217).
- [ ] **Exclusão de conta**: ver seção 7 (bloqueio).

### Formulários de privacidade (devem bater com o app real)

Conferir com o `security-engineer` e com `docs/seguranca/` antes de marcar. Rascunho do que o app coleta (`[HIPÓTESE]`, a validar):

| Dado | Coletado? | Finalidade | Vinculado ao usuário | Compartilhado com |
|---|---|---|---|---|
| E-mail, nome, telefone | Sim | Conta e contato do pedido | Sim | Lojista (nome e contato do pedido) |
| Endereço de entrega | Sim | Entregar o pedido | Sim | Lojista/entregador |
| CPF | Só se o Mercado Pago exigir (HIP-D10) | Pagamento | Sim | Mercado Pago |
| Localização aproximada | Sim, só em uso | Mostrar lojas que entregam perto | Não precisa associar `[verificar]` | Não |
| Histórico de pedidos e compras | Sim | Funcionamento, suporte, trocas | Sim | Lojista |
| Identificador do aparelho (id gerado pelo app) | Sim | Segurança de sessão | Sim | Não |
| Diagnóstico/erros | Só quando o Sentry for ligado (DT-039) | Estabilidade | `[verificar]` | Sentry (operador) |
| Dados de cartão | **Nunca** (checkout do Mercado Pago) | | | |
| Publicidade/rastreamento entre apps | **Não** | | | |

- **Google Play, Data Safety**: preencher conforme a tabela; marcar "dados criptografados em trânsito" (HTTPS) e "usuários podem pedir a exclusão" (depende de WB-213/214).
- **App Store, App Privacy ("nutrition labels")**: idem; "não rastreamos" (não precisa do prompt de ATT).
- Apple: confira também o **Privacy Manifest** (`PrivacyInfo.xcprivacy`); o Expo traz o dos módulos oficiais, e o `expo-doctor`/build avisam sobre APIs de "motivo obrigatório" `[HIPÓTESE]`.

## 6. Classificação, acesso do revisor e conta demo

- [ ] **Classificação etária**: questionário IARC (Google) e perguntas da Apple. Conteúdo gerado por usuários (avaliações) e compras em dinheiro real: responda com honestidade (sem bebida alcoólica/tabaco no catálogo? Se o catálogo permitir, a classificação sobe: alinhar com o PO).
- [ ] **Conta de teste para o revisor** (cliente e lojista), com dados de demonstração e **instruções passo a passo** no campo "App access"/"Notas para revisão": e-mail, senha, endereço de teste dentro da área atendida (o app só atende a região; um revisor nos EUA vai cair em "região indisponível" se não houver instrução de endereço de teste).
- [ ] **Como o revisor conclui um pedido sem pagar de verdade?** Em produção o provedor simulado é recusado (a API só sobe com Mercado Pago real). **Decisão aberta** para PO/backend-dev: (a) cupom de 100% reservado à conta do revisor, se pedido de valor zero for suportado; (b) loja de demonstração com produto de R$ 0,01 pago de verdade pelo fundador; (c) instruções + vídeo do fluxo. Sem uma delas o revisor trava no PIX e rejeita. `[HIPÓTESE]`
- [ ] A conta demo e a loja demo existem **em produção** e são marcadas como demonstração (não aparecem a clientes reais).

## 7. Específico da Apple (App Store)

Conferido em: ____/____/______ (App Store Review Guidelines)

- [ ] **5.1.1(v), exclusão de conta**: o app precisa permitir **iniciar a exclusão dentro do app** (não basta mandar e-mail). **Pendente (WB-213)**: não existe hoje. O fluxo está no backlog (senha para confirmar, DEC-015).
- [ ] **4.8, Sign in with Apple**: obrigatório **se** o app oferecer login com Google/Facebook etc. O WB-010 prevê Google **e** Apple juntos, atrás de uma flag. **Mantenha a flag de login social DESLIGADA** no lançamento (se ligar, é preciso oferecer Apple; precisa de conta Apple Developer, Services ID e chaves, e a configuração `usesAppleSignIn` no `app.config.ts`).
- [ ] **1.2, conteúdo de usuário**: avaliações e lojas exigem filtro, **denúncia, bloqueio** e contato do suporte publicado (WB-038/124).
- [ ] **3.1.1 / 3.1.3(e), pagamentos**: bens físicos com PIX/cartão via Mercado Pago, sem In-App Purchase. Mencione isso nas notas de revisão.
- [ ] **2.1, desempenho e completude**: sem travar, sem tela vazia, conta demo funcionando, **testar o `.ipa` enviado**.
- [ ] **4.2, funcionalidade mínima**: não parecer "site embrulhado": o app é nativo (Expo Router).
- [ ] **5.1.2, rastreamento**: não rastreamos entre apps; sem prompt de ATT.
- [ ] **Exportação de criptografia**: respondido no `app.config.ts` (só HTTPS padrão); em App Store Connect confirme a mesma resposta.
- [ ] **Lançamento por fases (phased release)** ligado para iOS.
- [ ] Fluxo: build `production` > `eas submit` > TestFlight (teste interno e depois externo) > "Enviar para revisão".

## 8. Específico do Google Play

Conferido em: ____/____/______ (Google Play Console Help)

- [ ] **Exclusão de conta**: além do botão no app, o Data Safety pede uma **URL na web** onde o usuário solicita a exclusão (WB-214). **Pendente.**
- [ ] **Teste fechado**: se a conta for pessoal nova, cumprir o requisito de testadores/dias antes da produção.
- [ ] **Público-alvo e conteúdo**, **classificação IARC**, **declaração de anúncios** (não há), **Data Safety** e **App access** (credenciais demo) preenchidos.
- [ ] **Nível de API alvo**: o Expo SDK 58 atende ao exigido na data do envio `[HIPÓTESE]`; confirme em Play Console > Qualidade do app.
- [ ] **Assinatura**: ativar Play App Signing (padrão); guardar o keystore de upload.
- [ ] **Relatório pré-lançamento** (pré-launch report) sem crash.
- [ ] **Lançamento gradual**: começar com 10 a 20% e subir.
- [ ] Faixa inicial do `submit` do EAS: `internal` (rascunho), conforme `eas.json`.

## 9. Ordem recomendada (skill `publicacao-lojas`)

1. Teste interno: `preview` (Android APK) e TestFlight/Play teste interno com o fundador e lojistas piloto.
2. Teste fechado com consumidores reais da região.
3. Corrigir bugs Crítica/Alta, repetir os testes: **G4** (QA e Security aprovam).
4. Preencher os formulários (seções 5 a 8), conta demo e screenshots; conferir tudo nas páginas oficiais.
5. Fundador autoriza o envio em `docs/decisoes.md`: **G5**.
6. Enviar para revisão (tempo de revisão não verificado `[HIPÓTESE]`: dias, reserve folga no calendário; R-08).
7. Lançamento gradual (Play: % de usuários; iOS: phased release), acompanhando erros e pedidos.

## 10. O que depende do fundador (lista final)

- [ ] Escolher pessoa física ou CNPJ e criar as contas Apple, Google e Expo (e pagar as taxas).
- [ ] Aprovar a marca (ícone, nome, descrição) e o identificador `br.com.webag.app`.
- [ ] Aprovar os textos das lojas, a política de privacidade e os termos (revisão jurídica).
- [ ] Participar do login Apple (código de 2 fatores) e de ações que só o titular da conta faz (aceitar contratos).
- [ ] Autorizar o envio (G5) e registrar em `docs/decisoes.md`.
- [ ] Decidir como o revisor conclui um pedido (seção 6).
- [ ] Decidir se o login social entra na 1.0 (se sim, Sign in with Apple junto).

## 11. Pendências de código que bloqueiam o G5

| Pendência | História | Dono |
|---|---|---|
| Exclusão de conta no app e por página web | WB-213, WB-214 | backend-dev, mobile-dev |
| Denúncia e moderação de conteúdo | WB-038, WB-124 | backend-dev, mobile-dev |
| Páginas públicas (privacidade, termos, suporte) hospedadas | WB-217, landing | mobile-dev (web), PO |
| Forma de o revisor concluir um pedido | A criar | PO, backend-dev |
| Sentry no app e na API (se for declarado no formulário de privacidade) | DT-039 | backend-dev, mobile-dev |
| `expo-updates` (OTA), se quiser correção rápida de JavaScript | A criar | mobile-dev |
