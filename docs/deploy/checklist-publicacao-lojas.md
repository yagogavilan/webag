# Checklist de publicação nas lojas (Google Play e App Store)

Base: skill `publicacao-lojas`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json`, backlog (WB-010, WB-038/124, WB-213/214, WB-217) e `docs/gestao/board.md` (R-08). Escrito em 2026-11-18; **conferido contra o estado do código em 2026-11-19** (Onda 7).

> Regras das lojas mudam. Tudo marcado `[HIPÓTESE]` foi escrito de memória e **precisa ser conferido** nas páginas oficiais (Google Play Console Help; App Store Review Guidelines e App Store Connect Help) no dia do envio. Anote a data da conferência em cada seção (campo "Conferido em").
> Publicar é o gate **G5**: só com G4 aprovado (QA e Security) e **autorização escrita do fundador** em `docs/decisoes.md` (CLAUDE.md, regra 3). Contratar conta paga também exige autorização (regra 6).

## 0. Estado hoje (o que já está pronto e o que bloqueia)

Verificado em 2026-11-19 no repositório (não de memória). "Pronto" = existe e foi testado pelo time; **não** significa aprovado pelo Security/QA nem pela loja.

| Item | Estado | Onde |
|---|---|---|
| `eas.json` com perfis `development`, `preview`, `production` (sem credenciais) | Pronto | `apps/mobile/eas.json` |
| Ícone 1024 (sem transparência), ícone adaptativo Android, splash | Pronto (marca v3/v4a; conferir 4.1) | `apps/mobile/assets/` |
| Bundle id / package | `br.com.webag.app` nas duas lojas. **Não dá para trocar depois de publicado** | `apps/mobile/app.config.ts` |
| Sem backup automático do Android (`allowBackup: false`), localização só aproximada e só em uso | Pronto | `app.config.ts` (SEC-012, SEC-084) |
| Pergunta de criptografia da Apple respondida (`ITSAppUsesNonExemptEncryption: false`) | Pronto (só HTTPS padrão) | `app.config.ts` |
| **Exclusão de conta**: no app, na web e na API | Implementada: app `apps/mobile/app/privacy/delete.tsx` (com arrependimento de 72 h), página pública `/excluir-conta` (vias A e B), API `/v1/auth/account-deletion/*`. **Falta**: o parecer do Security reverificar a página pública e o SEC-168 (DEC-056) e o QA testar a página | Apple 5.1.1(v), Google Play (URL no Data Safety) |
| **Exportar meus dados** (LGPD art. 18) | Implementada no app (`privacy/export.tsx`) e na API | |
| **Denúncia de conteúdo** (avaliações, produtos, lojas) | Implementada: `POST /v1/reports`, fila no admin (`content_reports`), botão no app | Apple 1.2 |
| Política de privacidade, termos, suporte, ajuda e licenças em URL pública | **As páginas existem** no site público (`/privacidade`, `/termos`, `/suporte`, `/ajuda`, `/licencas`, `/excluir-conta`). **Falta**: o domínio (fundador), o deploy com o `PUBLIC_HOST` (guia de deploy, seção 5) e a revisão jurídica dos textos | Seção 5 |
| Tela "Licenças de código aberto" no app | **Não existe** (só a página web `/licencas`). Solar (CC BY 4.0) exige atribuição | Seção 3; `THIRD_PARTY_NOTICES.md`, Pendências |
| Versão do app | `0.1.0` em `app.config.ts`; trocar para `1.0.0` no envio | Seção 2 |
| Conta demo para o revisor | **Decisão aberta** (ver 6): produção não recebe dados de demonstração | |
| Feature graphic 1024x500, screenshots finais, textos finais | Falta (ver 4) | Designer + PO |
| Contas Apple/Google/Expo | Dependem do fundador | Seção 1 |

## 1. Contas e acessos (dependem do fundador)

Conferido em: ____/____/______

| Conta | Custo [HIPÓTESE] | Pré-requisitos | Observações |
|---|---|---|---|
| Expo / EAS (https://expo.dev) | Grátis (plano com fila de build; planos pagos para build prioritário) | E-mail | Guarda as credenciais de assinatura. Crie com um e-mail da empresa, não pessoal |
| Google Play Console | US$ 25, uma vez | Conta Google; documento; cartão | Conta **pessoal nova**: a Google exige um período de **teste fechado** (referência: 12 testadores por 14 dias seguidos) antes de liberar produção; **confirmar a regra vigente**. Conta de **organização** exige CNPJ e D-U-N-S |
| Apple Developer Program | US$ 99/ano | Apple ID com 2 fatores; individual (CPF) ou organização (CNPJ + D-U-N-S, leva dias) | Individual mostra o **seu nome** como vendedor; organização mostra a empresa. Decisão do fundador |
| Domínio com páginas públicas | ~R$ 40/ano | `docs/deploy/guia-deploy.md` seção 5 | Já é o mesmo domínio do servidor (`PUBLIC_HOST`): privacidade, termos, suporte e exclusão de conta em URLs públicas |
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
2. Variáveis por ambiente (lista completa em `docs/deploy/guia-deploy.md`, seção 6.4; **públicas**: tudo que está no app é público; nunca ponha chave secreta aqui):

   ```bash
   pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.SEU-DOMINIO --visibility plaintext
   pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_WEB_URL --value https://SEU-DOMINIO     --visibility plaintext   # o cartão abre SEU-DOMINIO/pagar/cartao; o app só abre esta origem
   pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production               --visibility plaintext
   pnpm dlx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_MP_PUBLIC_KEY --value <chave pública do Mercado Pago> --visibility plaintext   # a mesma de MP_PUBLIC_KEY; não é segredo
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

- [ ] `EXPO_PUBLIC_API_URL` de produção aponta para `https://api.<domínio>` e `EXPO_PUBLIC_WEB_URL` para `https://<domínio>` (nunca HTTP, nunca `localhost`; o IP da máquina de desenvolvimento só vale no Expo Go).
- [ ] `EXPO_PUBLIC_APP_ENV=production` no perfil `production` (senão o app aceitaria o cartão simulado) e `EXPO_PUBLIC_MP_PUBLIC_KEY` preenchida.
- [ ] **Licenças**: tela "Licenças de código aberto" no app (ou link para `https://<domínio>/licencas`) com a atribuição do Solar Icon Set (CC BY 4.0). Ver `THIRD_PARTY_NOTICES.md`, Pendências 1 a 3.
- [ ] `version` do `app.config.ts` em `1.0.0` e `phosphor-react-native` removida se continuar sem uso.
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

- [ ] **Política de privacidade** em URL pública (`https://<domínio>/privacidade`, página pronta) e dentro do app (`apps/mobile/app/legal/[type].tsx` já abre os textos do servidor). O texto passa por revisão do fundador/jurídico antes do G5 (HIP-D20; o time não substitui advogado).
- [ ] **Termos de uso** em URL pública e no app.
- [ ] **Encarregado (DPO)** e canal do titular publicados (WB-217).
- [ ] **Exclusão de conta**: página `https://<domínio>/excluir-conta` (é a URL do Data Safety) e fluxo no app; ver seções 7 e 8.

### Formulários de privacidade (devem bater com o app real)

Conferir com o `security-engineer` antes de marcar. Inventário conferido contra o código em `docs/seguranca/revisao-onda6-frontends.md` (tabela "Inventário para os formulários"); resumo em 2026-11-19:

| Dado | Google (categoria) | Apple (tipo) | Obrigatório? | Vinculado | Compartilhado com terceiros | Finalidade |
|---|---|---|---|---|---|---|
| Nome, e-mail, celular | Informações pessoais | Contact Info | Sim | Sim | Lojista do pedido | Conta, pedido, suporte |
| Endereço e ponto no mapa | Informações pessoais: endereço | Contact Info: Physical Address | Para entrega | Sim | Lojista e logística do pedido; **ViaCEP recebe o CEP e o IP direto do app** | Entrega |
| Localização aproximada (só em uso) | Local aproximado | Coarse Location | Não | Não precisa | Não | Lojas perto |
| CPF (só se o Mercado Pago exigir) | Informações pessoais: outras | Other Data | Condicional | Sim | Mercado Pago | Pagamento |
| Histórico de compras | Informações financeiras: histórico de compras | Purchases | Sim | Sim | Lojista (o próprio pedido) | Funcionamento, trocas, fiscal |
| Fotos (defeito na troca) | Fotos e vídeos | Photos or Videos | Não | Sim | Lojista da troca | Troca |
| Avaliações, "como vestiu", denúncias | Atividade no app: conteúdo gerado | User Content: Other | Não | Sim | Público (avaliação, sem o nome completo) | Reputação e moderação |
| Busca no app | Atividade no app: histórico de pesquisa | Search History | Não | Sim | Não | Últimas buscas |
| Abertura de push de campanha | Atividade no app: interações | Product Interaction | Não | Sim | Não | Medir campanha (com consentimento) |
| Token de push e id aleatório do aparelho | IDs do dispositivo ou outros | Device ID | Sim | Sim | Expo/FCM/APNs (operadores) | Notificação e segurança da sessão |
| Dados de cartão | **Não coletados pelo app** (página segura do Mercado Pago no navegador) | Não | | | Mercado Pago direto | |
| Diagnóstico/crash | **Não declarar no app**: o Sentry só roda na API (servidor); o app não tem Sentry (DT-039). Revisar se o app ganhar Sentry | Não | | | | |
| Rastreamento entre apps / publicidade | Não | Não (sem ATT) | | | | |

- **Google Play, Data Safety**: preencher conforme a tabela; marcar "dados criptografados em trânsito" (HTTPS) e "usuários podem pedir a exclusão" (no app e em `https://<domínio>/excluir-conta`).
- **App Store, App Privacy ("nutrition labels")**: idem; "não rastreamos" (não precisa do prompt de ATT).
- Apple: confira também o **Privacy Manifest** (`PrivacyInfo.xcprivacy`); o Expo traz o dos módulos oficiais, e o `expo-doctor`/build avisam sobre APIs de "motivo obrigatório" `[HIPÓTESE]`.

## 6. Classificação, acesso do revisor e conta demo

- [ ] **Classificação etária**: questionário IARC (Google) e perguntas da Apple. Conteúdo gerado por usuários (avaliações) e compras em dinheiro real: responda com honestidade (sem bebida alcoólica/tabaco no catálogo? Se o catálogo permitir, a classificação sobe: alinhar com o PO).
- [ ] **Conta de teste para o revisor** (cliente e lojista), com dados de demonstração e **instruções passo a passo** no campo "App access"/"Notas para revisão": e-mail, senha, endereço de teste dentro da área atendida (o app só atende a região; um revisor nos EUA vai cair em "região indisponível" se não houver instrução de endereço de teste).
- [ ] **Como o revisor conclui um pedido sem pagar de verdade?** Em produção o provedor simulado é recusado (a API só sobe com Mercado Pago real) e o app em `production` exige o cartão real. O ambiente `staging` aceita o provedor simulado, mas **não** tem as rotas de simulação de PIX (SEC-135) e o app de produção não aponta para ele. **Decisão aberta** para PO/backend-dev (verificado 2026-11-19, sem solução pronta): (a) cupom de 100% reservado à conta do revisor, se pedido de valor zero for suportado; (b) loja de demonstração com produto de R$ 0,01 pago de verdade pelo fundador; (c) um ambiente de demonstração e um build próprio para a revisão (aceito pela Apple se for descrito nas notas, mas é um segundo servidor a manter); (c) instruções + vídeo do fluxo. Sem uma delas o revisor trava no PIX e rejeita. `[HIPÓTESE]`
- [ ] A conta demo e a loja demo existem **em produção** e são marcadas como demonstração (não aparecem a clientes reais). O seed de produção **não** cria lojas nem clientes de demonstração (DEC-030d); as contas `*@seed.webag.local` do desenvolvimento nunca existem lá. Criar a conta do revisor é um passo manual.

## 7. Específico da Apple (App Store)

Conferido em: ____/____/______ (App Store Review Guidelines)

- [ ] **5.1.1(v), exclusão de conta**: o app permite **iniciar a exclusão dentro do app** (senha para confirmar, arrependimento de 72 h; implementado). Testar no `.ipa` enviado, com a conta demo.
- [ ] **4.8, Sign in with Apple**: obrigatório **se** o app oferecer login com Google/Facebook etc. O WB-010 previa Google **e** Apple juntos; hoje o login social **não existe** na API (DT-064), então a regra 4.8 não se aplica. Se um dia entrar, é preciso oferecer Apple (conta Apple Developer, Services ID e chaves, e a configuração `usesAppleSignIn` no `app.config.ts`).
- [ ] **1.2, conteúdo de usuário**: avaliações e lojas exigem filtro, **denúncia, bloqueio** e contato do suporte publicado. Denúncia e fila de moderação existem; **bloqueio de usuário** não foi verificado `[verificar com o PO se a Apple aceitará só a denúncia]`; o contato de suporte está em `/suporte`.
- [ ] **3.1.1 / 3.1.3(e), pagamentos**: bens físicos com PIX/cartão via Mercado Pago, sem In-App Purchase. Mencione isso nas notas de revisão.
- [ ] **2.1, desempenho e completude**: sem travar, sem tela vazia, conta demo funcionando, **testar o `.ipa` enviado**.
- [ ] **4.2, funcionalidade mínima**: não parecer "site embrulhado": o app é nativo (Expo Router).
- [ ] **5.1.2, rastreamento**: não rastreamos entre apps; sem prompt de ATT.
- [ ] **Exportação de criptografia**: respondido no `app.config.ts` (só HTTPS padrão); em App Store Connect confirme a mesma resposta.
- [ ] **Lançamento por fases (phased release)** ligado para iOS.
- [ ] Fluxo: build `production` > `eas submit` > TestFlight (teste interno e depois externo) > "Enviar para revisão".

## 8. Específico do Google Play

Conferido em: ____/____/______ (Google Play Console Help)

- [ ] **Exclusão de conta**: além do botão no app, o Data Safety pede uma **URL na web** onde o usuário solicita a exclusão: `https://<domínio>/excluir-conta` (página pronta; falta o deploy e a reverificação do Security, DEC-056).
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

## 11. Pendências que bloqueiam o G5 (atualizado em 2026-11-19)

| Pendência | Estado | Dono |
|---|---|---|
| Exclusão de conta no app e por página web | Código pronto; falta reverificação do Security (SEC-166, SEC-168) e teste do QA da página `/excluir-conta` | security-engineer, qa-engineer |
| Páginas públicas (privacidade, termos, suporte) no ar | Páginas prontas; falta o domínio e o deploy com `PUBLIC_HOST` | Fundador (domínio), quem fizer o deploy |
| Revisão jurídica dos textos (privacidade, termos, prazos, IP truncado) | Aberta | Fundador / advogado |
| Tela de licenças no app (atribuição do Solar, CC BY 4.0) e remoção de `phosphor-react-native` | Aberta | mobile-dev |
| Forma de o revisor concluir um pedido | Aberta (seção 6) | PO, backend-dev |
| Mercado Pago real exercitado no sandbox (PIX, cartão, estorno, split) | **Nunca foi feito**; `[confirmar no sandbox]` em `apps/api/README.md` | Fundador (chaves), backend-dev |
| Push real (`PUSH_PROVIDER=expo`, FCM/APNs no EAS) | Depende das contas do fundador | Fundador, mobile-dev |
| Sentry no app e no painel web, se for declarado no formulário | Só a API tem (DT-039) | mobile-dev |
| `expo-updates` (OTA), se quiser correção rápida de JavaScript | A criar | mobile-dev |
