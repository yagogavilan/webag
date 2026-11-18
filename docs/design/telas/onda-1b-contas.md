# Telas da Onda 1B: contas, acesso e configuração do admin

> Autor: product-designer. Data: 2026-11-18. Histórias: WB-006 a 010, 210, 211, 219 a 224, 079 (acesso do cliente e do lojista); WB-100, 101, 106, 117 a 120, 123 (admin, sub-onda 1A). Base: `design-system.md` (v0.3.0), `identidade.md` §8, `fluxos.md` §7. Decisões: DEC-012 (senha com confirmação), DEC-014 e 015 (e-mail confirmado depois da 1ª compra), DEC-018 (TOTP do admin e origem própria). Itens **[HIPÓTESE]** na §Z.
> Já existem e **não são repetidos**: criar conta e entrar dentro do checkout (S2, `onda-4-transacao.md`), criar conta do lojista e código do lojista (L1, L2, `onda-2-lojista-admin.md`). Aqui estão as versões completas, usadas também fora do checkout, mais tudo o que falta de acesso e do admin. Onde S2, L1 ou L2 divergirem, vale este arquivo.
> Plataformas: **app do cliente** (Expo, prefixo de teste `auth.`), **painel do lojista** (web, `lojista.`) e **painel admin** (web em endereço próprio, `admin.`).

## 0. Convenções

**0.1 Estados padrão.** App: `onda-3-descoberta-cliente.md` §0.2 (EP-app). Web: `onda-2-lojista-admin.md` §0.2 (EP-web). Acessibilidade e testID: §0.3 e §0.4 dos mesmos arquivos. Aqui só o que for diferente.

**0.2 Estados de acesso (EA), valem para toda tela de entrada, app e web:**

| Situação | Título | Texto | Ação |
|---|---|---|---|
| Espera por tentativas (WB-221 C1, C5) | "Muitas tentativas" | "Tente de novo às 14:47 ou redefina a senha." | "Redefinir senha" (primário); o botão do formulário fica inerte com o motivo no rótulo: "Tente às 14:47" |
| Conta bloqueada pelo admin (WB-008 C4) | "Conta indisponível" | "Fale com o suporte para entender o motivo." | "Falar com o suporte" (WhatsApp do Webag) |
| Sessão encerrada pelo servidor (WB-219 C3) | "Sua sessão foi encerrada" | "Entre de novo para continuar. Sua sacola e o que você digitou continuam aqui." | "Entrar" |
| Renovação reusada (WB-220 C3) | "Entre de novo por segurança" | "Notamos um uso estranho da sua sessão. Sua sacola continua aqui." | "Entrar" |
| Manutenção | G1 do app / EP-web | n/a | n/a |

- O tempo de espera aparece como **horário** ("às 14:47"), não como contagem regressiva por segundo (não distrai nem cansa o leitor de tela).
- Mensagem de login errado é **uma só**, para e-mail inexistente e senha errada: "E-mail ou senha incorretos." Mesma regra para qualquer tela que aceite e-mail (WB-009 C1, WB-221 C4). Tempo de resposta igual é do servidor; a tela não pode "pensar" mais para uns do que para outros (o botão entra em "Entrando…" por no mínimo 600 ms nos dois casos).
- Nenhuma tela de acesso diz se um e-mail tem conta, **exceto o cadastro** (risco aceito em DEC-017, mitigado por limite de tentativas).

**0.3 Senha nova (DEC-012).** Onde há senha nova (cadastro, redefinir, alterar, convite): **Senha + Confirmar senha** com um único olho, medidor "Fraca/Média/Forte" em texto, colar permitido, `new-password` nos dois campos, confirmação valida ao sair do campo ou ao igualar o tamanho. Mensagens fixas: "Senha fraca. Use 8 caracteres ou mais, com letras e números." · "Essa senha é muito comum. Escolha outra." · "As senhas são iguais." · "As senhas não são iguais." A senha **nunca** vai para rascunho, log, analytics nem para a URL.

**0.4 Botão sempre ativo.** Para todas as telas de formulário vale a regra do design system (§3.1b): o botão de envio fica ativo e o erro aparece ao tocar (rola e foca o 1º campo com erro). Isso **substitui** "botão inativo" dos critérios WB-006 C2 e C4; o PRD precisa ser lido assim (pendência Z-1).

**0.5 Eventos de analytics (sem dado pessoal, sem e-mail, sem senha):** `signup_started`, `signup_completed {method}`, `login_success`, `login_failed {motivo: senha|espera|bloqueada}`, `login_stepup_shown`, `otp_sent {finalidade}`, `otp_verified {finalidade}`, `otp_failed {finalidade}`, `otp_resend {finalidade}`, `password_reset_requested`, `password_reset_completed`, `email_verification_required`, `email_corrected`, `terms_accepted {versao}`, `terms_declined`, `totp_setup_completed`, `recovery_code_used`. Os eventos de admin (`admin_login`, `param_changed`, `flag_changed`) vêm do servidor (auditoria é a fonte).

**0.6 Origens separadas (WB-223, DEC-018).** O painel admin abre só em endereço próprio. Para evitar golpe de página falsa, a tela de entrada do admin tem o rótulo fixo "Painel administrativo" e o título da aba "Webag Admin". O painel do lojista nunca tem link para o admin e o contrário também. Cookie de um não vale no outro (resultado visível: o e-mail do lojista no admin recebe "E-mail ou senha incorretos.").

**0.7 Mapa das telas.**

| Parte | Telas |
|---|---|
| A. Cliente (app) | E1 Criar conta · E2 Entrar · E3 Esqueci a senha · E4 Código por e-mail (compartilhada) · E5 Confirmar e-mail depois da compra · E6 Novos termos |
| B. Lojista (web) | E7 Entrar no painel · E8 Segurança da conta |
| C. Admin: acesso | AC1 Entrar · AC2 Configurar verificação em duas etapas · AC3 Código de recuperação · AC4 Aceitar convite · AC5 Reautenticar e sessão · AC6 Meu perfil |
| D. Admin: configuração (1A) | AD0 Estrutura e padrões · AD1 Regiões · AD2 Categorias · AD3 Parâmetros · AD4 Feature flags · AD5 Termos e privacidade · AD6 Auditoria · AD7 Admins e perfis |

**0.8 Componentes novos desta onda** (registrados em `design-system.md` §3.1c): **TotpSetup**, **RecoveryCodes**, **EmailConfirmSheet**, **ReasonDialog**, **IconPicker**, **RichTextLite**, **VersionList**, **DiffView**, **FlagRow**, **ParamRow**. Todos compostos com tokens existentes.

---

# Parte A. Cliente (app)

## E1. Criar conta (WB-006, 210, 211, 224 C5 e C6; DEC-012)

**Objetivo:** ter conta em menos de 40 s. **Ação principal:** "Criar conta".
**Entradas:** Conta (visitante) > "Criar conta"; S2 no checkout (mesma tela, com a faixa "Falta pouco para pagar. Sua sacola fica guardada."); favoritar (retorno exato, `onda-3` §0.6). Visitante nunca é empurrado para cá fora dessas ações.

| Breakpoint | Layout |
|---|---|
| Celular | Header "Criar conta" com voltar e link "Já tenho conta". Texto de contexto (1 linha, muda por entrada: "Crie sua conta para acompanhar pedidos e salvar favoritos."). Formulário. Rodapé fixo: botão `lg` "Criar conta" |
| Tablet (≥ 600 dp) | Formulário de 480 centrado; botão no fim do formulário (não fixo) |

**Campos (nesta ordem; "Próximo" no teclado avança; "Pronto" no último envia):**
1. **Nome completo** (`name`, capitaliza palavras)
2. **E-mail** (`email`, sem capitalizar). Sugestão de domínio abaixo do campo ao sair dele: "Você quis dizer gmail.com?" com dois botões de 48: "Usar gmail.com" e "Manter como está" (WB-006 C6).
3. **Celular** (máscara `(00) 00000-0000`, teclado de telefone)
4. **Senha** (medidor) e 5. **Confirmar senha** (§0.3)
6. Caixa única: "Tenho 18 anos ou mais e aceito os Termos de uso e a Política de Privacidade." Acima dela, uma linha de resumo: "Usamos seus dados para entregar pedidos e proteger sua conta." (WB-210 C1). Os dois links abrem em tela própria e voltam sem perder o formulário. Grava versão, data e plataforma (WB-210 C2).

**Decisão de design: consentimento de marketing NÃO aparece aqui.** WB-211 C1 exige consentimento separado e desmarcado; uma 2ª caixa no cadastro custa ≈ 2 s e 1 toque (a folga da compra é de ≈ 2 s, `fluxos.md` §2) e quase ninguém marca. O pedido vai para (a) o momento do aviso de push depois do 1º pedido (S6) e (b) Conta > Notificações (onda 6, WB-196). O app funciona inteiro sem ele (WB-211 C4).

**Mensagens (campo):** "Digite seu nome." · "Confira o e-mail." · "Confira o celular com DDD." · senha e confirmação: §0.3 · "Marque a caixa para continuar." · e-mail existente: "Esse e-mail já tem conta." + botão secundário "Entrar" (leva ao E2 com o e-mail preenchido; a mesma frase vale para conta confirmada ou não).
**Mensagens (tela):** rede: "Não conseguimos criar a conta agora. O que você digitou está aqui." + "Tentar de novo" · muitas tentativas: "Muitas tentativas. Espere alguns minutos e tente de novo."

| Estado | Comportamento |
|---|---|
| Skeleton | n/a. Botão em "Criando conta…" (spinner, inerte, largura fixa) |
| Vazio | n/a |
| Erro | Campo com erro: borda `border.danger` + ícone + texto; foco no 1º. Erro de rede: Banner de erro acima do botão. Campos preservados; **senha e confirmação não** (limpam, com a frase "Digite a senha de novo.") |
| Offline | "Conecte-se para criar a conta. O que você digitou está aqui." (botão ativo) |
| Sucesso | Haptic success. Vai para a origem (checkout S3, favorito marcado, ou Conta com toast "Conta criada. Bem-vindo ao Webag."). O e-mail do código sai em segundo plano; aparece o banner de E5. **Não** há tela de código no caminho (DEC-015) |
| Permissão | n/a |
| Flag `login_social` ligada (WB-010) | Acima do formulário: "Continuar com Google" e (iOS e Android juntos) "Continuar com Apple", divisor "ou". Desligada: nada aparece, sem espaço vazio |

**A11y:** ordem de leitura = ordem visual; `autocomplete` `name`, `email`, `tel`, `new-password` nos dois campos de senha; medidor lido "Força da senha: média"; links dos termos com texto "Termos de uso" e "Política de Privacidade" (nunca "clique aqui"); erro anunciado como alerta e foco no 1º campo com erro. **Android x iOS:** iOS oferece "Senha forte" e preenche a confirmação junto; Android Autofill idem; "Continuar com Apple" em preto ou branco. **testID:** `auth.signup-name-input`, `auth.signup-email-input`, `auth.signup-email-suggestion-accept`, `auth.signup-email-suggestion-keep`, `auth.signup-phone-input`, `auth.password-input`, `auth.password-confirm-input`, `auth.password-toggle`, `auth.terms-checkbox`, `auth.terms-link`, `auth.privacy-link`, `auth.signup-submit`, `auth.go-login`, `auth.google`, `auth.apple`. **Analytics:** `signup_started`, `signup_completed`.

## E2. Entrar (WB-008, 219, 220, 221)

**Objetivo:** voltar à conta sem esforço. **Ação principal:** "Entrar".

| Breakpoint | Layout |
|---|---|
| Celular | Header "Entrar" com voltar e link "Criar conta". Campos E-mail e Senha (olho 48, `current-password`). Link "Esqueci a senha" abaixo da senha (alvo 48). Rodapé fixo: botão `lg` "Entrar" |
| Tablet | Coluna de 480 centrada; botão no fim do formulário |

- **Entrou com sucesso:** volta ao ponto de origem (WB-005 C2, `onda-3` §0.6); a sacola do visitante migra (WB-005 C3). Mantém logado por até 30 dias neste aparelho (WB-008 C1).
- **Conta não confirmada:** entra normalmente; vê o banner de E5 (WB-008 C5).
- **Erro de credencial:** Banner de erro acima do botão, "E-mail ou senha incorretos." Os campos ficam; a senha **não** limpa (o usuário costuma errar 1 letra); foco na senha.
- **Espera (WB-221 C1, C5):** EA "Muitas tentativas". O 1º toque após a 5ª falha já mostra o banner com o horário e o botão "Redefinir senha" (leva ao E3 com o e-mail preenchido). Não menciona outros aparelhos.
- **Step-up (WB-221 C3):** senha certa mas a conta passou de 20 falhas na última hora, de qualquer origem: abre o E4 com a finalidade "step-up", título "Confirme que é você", texto "Vimos várias tentativas de entrar na sua conta. Enviamos um código para m***@gmail.com." (e-mail **mascarado** aqui, porque quem digitou a senha pode não ser o dono). Com o código certo, entra.
- **Conta bloqueada:** EA "Conta indisponível" no lugar do formulário, sem revelar o motivo.
- **Sessão encerrada (WB-219 C3, WB-220 C3):** não é esta tela; é a EA aplicada por cima da tela atual, com "Entrar" que abre o E2 e volta à tela de origem com rascunhos e sacola preservados.

| Estado | Comportamento |
|---|---|
| Skeleton | n/a. Botão em "Entrando…" (mínimo 600 ms, §0.2) |
| Vazio | n/a |
| Erro | Acima; rede: "Não conseguimos entrar agora. Tente de novo." + "Tentar de novo" |
| Offline | "Conecte-se para entrar." (botão ativo) |
| Sucesso | Haptic success; volta à origem |
| Permissão | n/a |

**A11y:** erro como alerta; `autocomplete` `email` e `current-password`; o olho tem rótulo "Mostrar senha"/"Ocultar senha" e estado. **testID:** `auth.login-email-input`, `auth.login-password-input`, `auth.password-toggle`, `auth.forgot-password`, `auth.login-submit`, `auth.login-error`, `auth.login-wait-banner`, `auth.login-reset-from-wait`, `auth.go-signup`, `auth.blocked-support`. **Analytics:** `login_success`, `login_failed {motivo}`, `login_stepup_shown`.

## E3. Esqueci a senha (WB-009, 219, 224 C7; DEC-012)

**Objetivo:** voltar a entrar em 3 passos curtos. **Ação principal:** muda por vista (tabela). Uma rota, 3 vistas, com "Passo 1 de 3" no header (texto, sem barra).

| Vista | Conteúdo | Botão |
|---|---|---|
| 1. E-mail | Título "Esqueceu a senha?" · texto "Digite seu e-mail. Enviaremos um código." · campo E-mail (preenchido se veio do E2) | "Enviar código" |
| 2. Código | E4 (finalidade "reset"). Título "Digite o código" · "Se o e-mail existir, enviamos um código." (**mesma frase**, exista ou não a conta, WB-009 C1) | automático no 6º dígito |
| 3. Nova senha | Título "Crie uma nova senha" · Senha + Confirmar senha (§0.3) | "Salvar senha e entrar" |

- **Mensagens:** vista 1: "Confira o e-mail." · limite: "Muitos pedidos de código. Tente de novo em 40 minutos." Vista 3: erros de §0.3; código que venceu enquanto digita: "Esse código venceu. Peça outro." (volta à vista 2 com o e-mail mantido; a senha digitada **não** é guardada).
- **Sucesso:** toast "Senha alterada. Você já entrou." Entra na conta; as outras sessões caem (WB-219 C1) e o e-mail passa a confirmado (WB-009 C2, WB-224 C7); o banner de E5 some. Chega o e-mail "Sua senha foi alterada" (WB-009 C4), fora da tela.
- **Voltar:** da vista 3 para a 2 e da 2 para a 1 sem perder o e-mail; sair da rota descarta o código.

| Estado | Comportamento |
|---|---|
| Skeleton | n/a. Botões em "Enviando…" e "Salvando…" |
| Vazio | n/a |
| Erro | Rede: Banner "Não conseguimos agora. Tente de novo." O e-mail digitado permanece |
| Offline | "Conecte-se para pedir o código." / "Conecte-se para salvar a senha." (botões ativos) |
| Sucesso | Acima |
| Permissão | n/a |

**A11y:** ao trocar de vista, o foco vai ao título e ele é anunciado; "Passo 2 de 3" lido. **testID:** `auth.reset-email-input`, `auth.reset-send-code`, `auth.otp-input`, `auth.otp-resend`, `auth.reset-password-input`, `auth.reset-password-confirm-input`, `auth.password-toggle`, `auth.reset-submit`. **Analytics:** `password_reset_requested`, `password_reset_completed`.

## E4. Código por e-mail: tela compartilhada (WB-007, 009, 221 C3, 224; também web)

**Objetivo:** provar que o e-mail é do usuário. **Ação principal:** digitar ou colar os 6 dígitos (verifica sozinho no 6º; sem botão de enviar). Mesma tela no app, no painel do lojista (L2) e na web pública; muda só o texto por **finalidade**.

| Finalidade | Título | Texto | Onde nasce |
|---|---|---|---|
| `signup_verify` | "Confirme seu e-mail" | "Enviamos um código de 6 dígitos para maria@gmail.com." | E5, L2 |
| `reset` | "Digite o código" | "Se o e-mail existir, enviamos um código." | E3 |
| `stepup` | "Confirme que é você" | "Vimos várias tentativas de entrar na sua conta. Enviamos um código para m***@gmail.com." | E2, E7 |
| `email_gate` | "Confirme seu e-mail para continuar" | texto do contexto (E5) | E5 |
| `delete_web` | (onda 6) | n/a | `onda-6-conformidade.md` |

| Breakpoint | Layout |
|---|---|
| App celular | Header com voltar. Título `title1`. Texto. OTPInput (6 caixas 48x56). "O código vale por 10 minutos." (`caption`). Contador "Reenviar código em 1:00", que vira o link "Reenviar código". Botão secundário "Abrir meu e-mail" (abre o app de e-mail do sistema). Link "Trocar e-mail" só na finalidade `signup_verify` (leva a "Corrigir e-mail" de E5) |
| Web (lojista) | Coluna de 400 centrada, mesmo conteúdo, sem "Abrir meu e-mail" |

**Regras (valores vêm dos parâmetros):** validade `otp_validade_min` (10); tentativas `otp_tentativas` (5); reenvio só após `otp_reenvio_s` (60 s) e no máximo 5 por hora; reenviar invalida o código anterior. **O texto de espera lê "1:00", não "0:30":** o design system e L2 diziam 0:30 e estavam errados contra WB-007 C4 e HIP-022; corrigidos.
**Mensagens:** errado: "Código incorreto. Restam 3 tentativas." (caixas com borda `border.danger`, limpam, foco na 1ª) · 5 erros: "Muitas tentativas. Peça um novo código." + botão "Enviar novo código" · vencido: "Código vencido. Peça outro." · limite de reenvio: "Você pediu muitos códigos. Tente de novo em 40 minutos." · envio: "Enviamos um novo código." (toast).

| Estado | Comportamento |
|---|---|
| Skeleton | As 6 caixas já aparecem, foco na 1ª; linha "Enviando o código…" até a confirmação do envio |
| Vazio | n/a |
| Erro | Acima; falha de rede ao verificar: "Não conseguimos verificar. Tente de novo." e as caixas mantêm o que foi digitado |
| Offline | "Sem conexão. Conecte-se para confirmar." |
| Sucesso | Check 400 ms (estático com reduzir movimento), haptic success, segue para onde estava (E5: a ação pendente continua; E3: vista 3; E2: entra) |
| Permissão | n/a |

**A11y:** cada caixa "Dígito 1 de 6"; erro anunciado como alerta; `textContentType="oneTimeCode"` / `autocomplete="one-time-code"`; aceita colar os 6 de uma vez; contador de reenvio **só anunciado ao liberar**. **testID:** `auth.otp-input`, `auth.otp-digit-<n>`, `auth.otp-resend`, `auth.otp-open-mail`, `auth.otp-change-email`, `auth.otp-error`. **Analytics:** `otp_sent`, `otp_verified`, `otp_failed`, `otp_resend` (todos com `finalidade`).

## E5. Confirmar e-mail depois da compra (WB-007, WB-224; DEC-014 e 015)

**Objetivo:** confirmar sem atrapalhar a 1ª compra e destravar o que ficou limitado. **Ação principal:** "Digitar código". Quatro peças, todas usando o E4:

**E5a. Banner "Confirme seu e-mail"** (componente Banner, info). Aparece em S6 (pedido confirmado), S7, Conta e no topo de Meus pedidos, até confirmar. Texto: "Confirme seu e-mail para fazer outros pedidos e usar cupons." Ação: "Digitar código" (abre E4 `signup_verify`). Em S6 e S7 pode ser dispensado até o próximo abrir; na Conta **não** é dispensável. Segunda linha menor: "Código enviado para maria@gmail.com." com link "Corrigir e-mail" (E5c).

**E5b. Folha "Confirme seu e-mail"** (EmailConfirmSheet, BottomSheet no app, Dialog na web). Abre sozinha quando uma ação limitada é tocada (WB-224 C1 e C2). A ação que o usuário queria **continua sozinha** depois do código certo. O texto de contexto muda:

| Ação tocada | Título | Contexto (1 linha) |
|---|---|---|
| Pagar o 2º pedido | "Confirme seu e-mail para continuar" | "Falta só isso para pagar. Sua sacola está guardada." |
| Cupom da plataforma ou 1ª compra | "Confirme seu e-mail" | "Para usar esse cupom, confirme seu e-mail." |
| Exportar meus dados | "Confirme seu e-mail" | "Para exportar seus dados, confirme seu e-mail." |
| Trocar e-mail | "Confirme seu e-mail" | "Confirme o e-mail atual antes de trocar." |
| Cadastrar loja ou aceitar convite | "Confirme seu e-mail" | "Para abrir uma loja, confirme seu e-mail." |

Dentro da folha: OTPInput, contador, "Abrir meu e-mail", link "Corrigir e-mail". **Excluir conta nunca passa por aqui:** pede só a senha (WB-224 C3). Variante B (flag `confirmacao_email_bloqueia_compra`, DEC-014 C9): a mesma folha abre ao tocar "Pagar" no 1º pedido, com o texto "Falta confirmar seu e-mail para pagar."

**E5c. Folha "Corrigir e-mail"** (WB-224 C4). Campos: **Novo e-mail** (sugestão de domínio de E1) e **Senha** (`current-password`, pede para impedir que outra pessoa com o celular desvie o e-mail). Botão "Enviar novo código". Texto: "O código anterior deixa de valer. O e-mail antigo não recebe mais nada." Erros: "Senha incorreta." (conta no limite de WB-221) · "Esse e-mail já tem conta." · "Confira o e-mail." Sucesso: abre o E4 com o novo endereço; toast "Enviamos o código para ana@gmail.com."
**E5d. Confirmado:** toast "E-mail confirmado."; banner some; a ação pendente executa; em Conta > Dados pessoais aparece "E-mail confirmado" com check (texto + ícone).

| Estado | Comportamento |
|---|---|
| Skeleton | n/a |
| Vazio | n/a (banner some quando confirmado) |
| Erro / Offline | EP-app + E4. Ação pendente fica guardada: "Conecte-se para confirmar. Sua sacola está salva." |
| Sucesso | Acima |
| Permissão | n/a |

**A11y:** banner anunciado ao abrir a tela (região viva educada); folha com foco no título e retorno do foco ao gatilho. **testID:** `auth.email-banner`, `auth.email-banner-open`, `auth.email-banner-correct`, `auth.email-sheet`, `auth.email-sheet-close`, `auth.email-correct-new-input`, `auth.email-correct-password-input`, `auth.email-correct-submit`. **Analytics:** `email_verification_required {acao}`, `email_corrected`.

## E6. Novos termos (WB-210 C3, WB-117 C2)

**Objetivo:** aceitar a versão nova sem perder o que estava fazendo. **Ação principal:** "Aceitar e continuar". Tela cheia, **bloqueante**, mostrada no próximo uso (app: ao abrir ou ao retomar; painel do lojista: ao entrar; para o lojista, "Termos do lojista" também).
- **Layout:** título "Atualizamos nossos termos" · "Leia e aceite para continuar usando o Webag." · cartão "O que mudou" com o texto curto escrito pelo admin (até 280 caracteres, AD5) · links "Ler os Termos de uso (versão 2.1)" e "Ler a Política de Privacidade" (tela própria, voltam sem perder o aceite) · caixa "Li e aceito os documentos atualizados." · botão `lg` "Aceitar e continuar" (ativo; sem a caixa marcada, ao tocar: "Marque a caixa para continuar.").
- **Recusar:** link de texto "Não aceito" abre Dialog "Sem aceitar, não dá para usar o Webag." / "Você sai da conta agora. Se quiser, também pode excluir sua conta." Botões empilhados: "Sair da conta" (primário), "Excluir minha conta" (texto; leva ao fluxo da onda 6), "Voltar".

| Estado | Comportamento |
|---|---|
| Skeleton | Texto "O que mudou" em skeleton |
| Vazio | n/a |
| Erro / Offline | EP; botão ativo; offline: "Conecte-se para aceitar. Seu pedido está guardado." |
| Sucesso | Grava versão, data, IP e plataforma; segue para onde estava; analytics `terms_accepted {versao}` |
| Permissão | n/a |

**A11y:** foco no título; links com texto completo. **testID:** `auth.terms-update`, `auth.terms-update-changes`, `auth.terms-update-checkbox`, `auth.terms-update-accept`, `auth.terms-update-decline`, `auth.terms-decline-logout`, `auth.terms-decline-delete`.

---

# Parte B. Lojista (web)

## E7. Entrar no painel da loja (WB-008, 075 C1, 079 C1, 221)

**Objetivo:** abrir o painel no celular ou no PC do balcão sem tropeço. **Ação principal:** "Entrar". Prefixo `lojista.login.`

| Breakpoint | Layout |
|---|---|
| Celular (< 640) | Logo, título `title1` "Entrar no painel da loja", campos E-mail e Senha (olho), link "Esqueci a senha", botão `lg` fixo "Entrar"; abaixo, link "Quero cadastrar minha loja" (leva a L1) |
| Tablet e desktop | Coluna central de 400, sobre fundo `surface.background`; sem coluna de propaganda (quem entra aqui já é lojista); botão no fim do formulário |

- **Mensagens e esperas:** as mesmas do E2 (EA da §0.2). Sem "Lembrar de mim": a sessão do painel dura até 30 dias, e o botão **Sair** fica sempre visível no cabeçalho do painel (PC compartilhado do balcão) **[HIPÓTESE, validar com Security: 30 dias para o painel]**.
- **Verificação em duas etapas, só se o dono ativou (WB-079):** depois da senha, 2ª vista "Código de verificação" · "Abra seu app autenticador e digite o código de 6 dígitos." · OTPInput · link "Usar um código de recuperação" (campo único, formato `XXXXX-XXXXX`; usado: "Esse código só vale uma vez. Restam 9."). Erro: "Código incorreto ou vencido." (não diz qual etapa falhou).
- **Esqueci a senha:** mesmas 3 vistas do E3, em coluna de 400; no fim entra no painel.
- **Casos de conta:**

| Situação | Resultado |
|---|---|
| Conta de cliente sem loja | Entra e vê EmptyState `Storefront`: "Você ainda não tem uma loja" / "Cadastre a sua em cerca de 10 minutos." / "Cadastrar minha loja" (L1 sem recriar conta, L1 C2) |
| Funcionário | Entra e vê só o que a permissão libera (L9) |
| Loja em análise, correção, recusada, suspensa | Vai para L8 |
| Loja no ar | Vai para Pedidos (P1) |
| Credencial de admin | Mensagem comum "E-mail ou senha incorretos." (WB-223 C2, nada a revelar) |
| Convite de funcionário pendente | Link do e-mail leva ao L10, não a esta tela |

| Estado | Comportamento |
|---|---|
| Skeleton | n/a. Botão "Entrando…" |
| Vazio | n/a |
| Erro / Offline | EP-web; formulário preservado, senha não |
| Sucesso | Redireciona conforme a tabela; o foco vai ao título da página aberta |
| Permissão | n/a |

**A11y:** título h1 com foco ao abrir; "Pular para o conteúdo" não se aplica (página de 1 formulário); `autocomplete` `username`/`email`, `current-password`, `one-time-code`. **testID:** `email-input`, `password-input`, `password-toggle`, `forgot-password`, `submit`, `error`, `wait-banner`, `totp-input`, `recovery-toggle`, `recovery-input`, `recovery-submit`, `signup-link`.

## E8. Segurança da conta do lojista (WB-079, 219; Should)

**Objetivo:** proteger o dinheiro da loja. **Ação principal:** "Ativar verificação em duas etapas" (dono) ou "Alterar senha" (funcionário). Em Mais > Segurança (celular) e Minha loja > Segurança (desktop; para o funcionário, só em Mais). Prefixo `lojista.seguranca.`

| Breakpoint | Layout |
|---|---|
| Celular | 3 seções empilhadas |
| Desktop | Coluna de 640 ao lado do submenu |

1. **Senha:** "Alterar senha": Senha atual (`current-password`) · Nova senha + Confirmar senha (§0.3) · botão "Salvar nova senha". Sucesso: toast "Senha alterada. Os outros aparelhos saíram da conta." (WB-219 C1).
2. **Verificação em duas etapas (só dono):** estado "Desligada" (selo neutro com `ShieldWarning`) ou "Ligada" (selo de sucesso com `ShieldCheck`). Texto: "Além da senha, pede um código do seu celular. Protege o dinheiro da sua loja." Botão "Ativar" abre o **TotpSetup** (AC2, variante opcional: tem "Agora não", fecha sem salvar). Ligada: "Gerar novos códigos de recuperação" (pede senha) e "Desativar" (Dialog "Desativar a verificação em duas etapas?" / "Sua conta fica protegida só pela senha." / "Desativar" destrutivo, pede senha + código).
3. **Aparelhos:** botão secundário "Sair de todos os aparelhos" com Dialog "Sair de todos os aparelhos?" / "Você e sua equipe precisam entrar de novo. O painel de pedidos para de tocar até lá." / "Sair de todos" (destrutivo) · "Cancelar". O aviso sobre o painel de pedidos existe porque sair derruba o alerta sonoro (risco de perder pedido).

| Estado | Comportamento |
|---|---|
| Skeleton | 3 blocos |
| Vazio | n/a |
| Erro / Offline | EP-web; ações de rede bloqueadas offline com "Conecte-se para alterar sua conta." |
| Sucesso | Toasts acima |
| Permissão | Funcionário: só seções 1 e 3. Dono com e-mail não confirmado: tudo liberado (trocar senha não é limitado em WB-224) |

**testID:** `password-current-input`, `password-input`, `password-confirm-input`, `password-toggle`, `password-submit`, `totp-status`, `totp-enable`, `totp-disable`, `recovery-regenerate`, `logout-all`, `logout-all-confirm`.

---

# Parte C. Admin: acesso (WB-100, 101 C1, 222, 223)

> Todas as telas abrem só no endereço do admin, com `Painel administrativo` visível (§0.6). Sem demonstração de credenciais na tela. Prefixo `admin.<tela>.`

## AC1. Entrar no admin (WB-100, 222, 221)

**Objetivo:** entrar com senha e código. **Ação principal:** "Entrar" (passo 1) e "Verificar" (passo 2, automático no 6º dígito).

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Logo + selo "Painel administrativo" (`Lock`); coluna de 400; campos E-mail e Senha (olho); "Esqueci a senha"; botão `lg` |
| Desktop | Igual, centrado, fundo `surface.background`; sem imagem |

**Passo 2: "Verificação em duas etapas".** "Digite o código de 6 dígitos do seu app autenticador." OTPInput (sem reenvio, pois não é e-mail) · link "Usar um código de recuperação" (AC3) · link "Voltar". Erro único: "Código incorreto ou vencido." Contam no limite de WB-221 C6. Dois passos revelam a quem erra o código que a senha estava certa; é o padrão do mercado e WB-222 C3 já o implica **[validar com Security, Z-2]**.
**Esqueci a senha (admin) [HIPÓTESE, Z-3]:** mesmas 3 vistas do E3; no fim **ainda pede o código do autenticador** (redefinir senha nunca dispensa o 2º fator) e o evento vai à auditoria. Sem isso o último super admin que esquece a senha fica sem caminho.

| Situação | Resultado |
|---|---|
| Admin sem 2FA configurado (WB-100 C6, WB-222 C3) | Após a senha, só abre AC2; nada além |
| Cliente ou lojista tenta | "E-mail ou senha incorretos." e o servidor registra (WB-100 C4) |
| 5 falhas do mesmo aparelho | EA "Muitas tentativas" (WB-100 C2); evento na auditoria |
| Sessão de 30 min sem atividade | AC5; ao voltar, "Sua sessão terminou por inatividade." e o login devolve à última página |
| Admin desativado | EA "Conta indisponível" |
| Sem permissão para a URL (WB-100 C1) | ErrorState `Lock` "Você não tem acesso a essa área" / "Peça ao administrador para liberar seu perfil." / "Voltar ao painel" |

| Estado | Comportamento |
|---|---|
| Skeleton | n/a |
| Vazio | n/a |
| Erro / Offline | EP-web |
| Sucesso | Vai à página inicial do perfil: até existir a Visão geral (WB-125, onda 6), ao 1º item do menu permitido |
| Permissão | n/a |

**A11y:** foco no h1; OTP com `one-time-code`; erro anunciado. **testID:** `login.email-input`, `login.password-input`, `login.password-toggle`, `login.forgot-password`, `login.submit`, `login.error`, `login.totp-input`, `login.recovery-link`, `login.back`.

## AC2. Configurar a verificação em duas etapas (WB-222 C1 a C3; componente TotpSetup)

**Objetivo:** ligar o 2º fator antes de qualquer acesso. **Ação principal:** "Verificar e continuar" (passo 2) e "Concluir" (passo 3). Obrigatória para todo admin; no lojista é opcional (E8). Header só com "Sair"; sem menu. "Passo N de 3" + barra.

1. **Instale um app autenticador.** "Use um app como Google Authenticator, Microsoft Authenticator ou Authy." (nomes de apps só como exemplo.)
2. **Escaneie o QR.** QR de 200 (margem 16 branca) · no celular, botão "Abrir no app autenticador" (link `otpauth://`) porque ninguém escaneia a própria tela · "Não consegue escanear? Digite este código:" com o segredo em blocos de 4 e botão "Copiar" · OTPInput "Digite o código de 6 dígitos que o app mostra" · botão "Verificar e continuar". Erro: "Código incorreto ou vencido. Espere o próximo código e tente de novo."
3. **Guarde seus códigos de recuperação** (**RecoveryCodes**): 10 códigos em 2 colunas, fonte tabular (`XXXXX-XXXXX`). Aviso `warning.subtle`: "Esses códigos aparecem só agora. Cada um vale uma vez. Use um se perder o celular." Botões "Copiar tudo", "Baixar arquivo" e "Imprimir". Caixa "Guardei meus códigos em um lugar seguro." libera "Concluir" (o único caso em que o botão fica inerte, e o motivo está escrito: "Marque a caixa para concluir"). Sair da tela antes de concluir: Dialog "Sair sem guardar os códigos?" / "Eles não aparecem de novo." / "Voltar e guardar" (primário) · "Sair".

| Estado | Comportamento |
|---|---|
| Skeleton | QR em skeleton enquanto o segredo é gerado |
| Vazio | n/a |
| Erro | Falha ao gerar: "Não conseguimos gerar o código agora." + "Tentar de novo" (gera novo segredo; o antigo morre) |
| Offline | "Conecte-se para continuar." |
| Sucesso | `CheckCircle` "Verificação em duas etapas ligada" + "Ir para o painel". Evento `totp_setup_completed` |
| Permissão | n/a |

**A11y:** o segredo em texto é a alternativa ao QR (obrigatória); códigos de recuperação em lista, não em imagem; botão copiar anuncia "Copiado". **testID:** `totp.qr`, `totp.secret`, `totp.secret-copy`, `totp.open-app`, `totp.code-input`, `totp.verify`, `totp.recovery-list`, `totp.recovery-copy`, `totp.recovery-download`, `totp.recovery-print`, `totp.recovery-saved-checkbox`, `totp.finish`, `totp.leave-dialog`.

## AC3. Entrar com código de recuperação (WB-222 C5)

**Objetivo:** entrar sem o celular. **Ação principal:** "Entrar com o código". Abre de AC1 passo 2.
- **Layout:** título "Código de recuperação" · "Digite um dos 10 códigos que você guardou. Cada um vale uma vez." · campo único (`XXXXX-XXXXX`, aceita colar, ignora hífen e caixa) · botão.
- **Depois de entrar:** faixa permanente até concluir: "Você entrou com um código de recuperação. Ligue a verificação de novo agora." e **só abre AC2** (reconfigurar o 2FA é forçado). "Restam 7 códigos."
- **Erros:** "Código incorreto ou já usado." · limites de WB-221.
- **Perdeu os códigos também:** texto "Sem os códigos? Peça a um super admin para redefinir sua verificação." (o super admin faz isso em AD7; não pode redefinir a própria).
- Estados: EP-web. **testID:** `recovery.input`, `recovery.submit`, `recovery.error`, `recovery.help`.

## AC4. Aceitar convite de admin (WB-101 C1)

**Objetivo:** criar a senha e ligar o 2FA em uma sequência. **Ação principal:** "Criar senha e continuar". Convite de uso único, ligado ao e-mail, válido por 48 h.
- **Layout:** "Ana, você foi convidada para o Webag Admin." · "Seu perfil: Operação." · Senha + Confirmar senha (§0.3) · botão. Depois, vai direto para AC2.
- **Estados do link:** vencido ou usado: ErrorState `Clock`, título "Convite inválido", texto "Esse convite não vale mais. Peça um novo a um super admin.", sem ação (410). Skeleton: texto do convite em skeleton enquanto valida o link. Erro de rede: EP-web. Se o e-mail do convite já tem conta de cliente não confirmada: pede confirmar o e-mail primeiro (WB-224 C2), com o E4.
- **testID:** `invite.title`, `invite.password-input`, `invite.password-confirm-input`, `invite.password-toggle`, `invite.submit`, `invite.invalid`.

## AC5. Reautenticar e sessão (WB-222 C6, WB-100 C3, SEC-016)

**Objetivo:** proteger ações perigosas sem irritar. **Ação principal:** "Confirmar" (reautenticação) e "Continuar conectado" (inatividade).

**AC5a. Reautenticação (Dialog).** Abre quando o admin estorna, revela dado pessoal ou gerencia admins e o último código TOTP tem mais de 5 minutos (`reauth_min`). Título "Confirme que é você" · linha do motivo, escrita para a ação: "Para estornar R$ 120,00 do pedido #4821." · OTPInput · "Confirmar". Código certo: o Dialog fecha e **a ação continua sozinha** (o motivo e os dados digitados não se perdem). Erro: "Código incorreto ou vencido." Cancelar devolve ao formulário.
**AC5b. Aviso de inatividade (Dialog).** Aos 28 min sem atividade: "Sua sessão vai terminar" / "Por segurança, saímos depois de 30 minutos sem uso. Faltam 2 minutos." / "Continuar conectado" (primário) · "Sair agora". O texto é lido ao abrir e atualizado só em 1:00 e 0:30 (`design-system.md` §7, Temporizadores). Ao fim: tela de login com "Sua sessão terminou por inatividade." e retorno à mesma página; rascunhos de formulário **sem dado pessoal** são mantidos na aba.

| Estado | Comportamento |
|---|---|
| Skeleton | n/a |
| Vazio | n/a |
| Erro / Offline | EP-web |
| Sucesso | A ação segue; analytics no servidor |
| Permissão | n/a |

**A11y:** Dialog prende o foco e devolve ao fechar; `role="alertdialog"` no aviso de inatividade. **testID:** `reauth.dialog`, `reauth.totp-input`, `reauth.submit`, `reauth.cancel`, `session.timeout-dialog`, `session.keep`, `session.logout`.

## AC6. Meu perfil e segurança (admin)

**Objetivo:** cuidar do próprio acesso. **Ação principal:** "Alterar senha". Menu do usuário (nome + perfil) > "Meu perfil".
- **Layout:** cartão "Eu" (nome, e-mail, perfil como selo, último acesso) · **Senha**: atual + nova + confirmar (§0.3), pede TOTP (AC5a) · **Verificação em duas etapas**: "Ligada desde 12 nov", "Gerar novos códigos de recuperação" (pede TOTP; mostra RecoveryCodes uma vez; os antigos morrem) · **Aparelhos**: "Sair de todos os aparelhos" (Dialog) · **Minha atividade**: link para Auditoria filtrada nas próprias ações (WB-123, perfis "leitura própria").
- **Estados:** EP-web. Sucesso: toasts "Senha alterada." / "Novos códigos gerados. Os antigos não valem mais."
- **testID:** `profile.password-current-input`, `profile.password-input`, `profile.password-confirm-input`, `profile.password-submit`, `profile.recovery-regenerate`, `profile.logout-all`, `profile.activity-link`.

---

# Parte D. Admin: configuração (sub-onda 1A)

## AD0. Estrutura e padrões do admin (valem para AD1 a AD7)

**Navegação.** Barra lateral de 240 (recolhível para 72) a partir de 1024; abaixo disso, ícone de menu que abre uma gaveta. Cabeçalho: nome da tela, busca global (`/`), **selo do ambiente de pagamento** ("Pagamentos: simulado" em alerta, "Pagamentos: real" em neutro, para ninguém estornar de teste achando que é real) **[HIPÓTESE, Z-4]** e menu do usuário (Meu perfil, Sair). O item que o perfil não acessa **não aparece**; link direto mostra ErrorState "Você não tem acesso a essa área" (EP-web).

**Matriz de menu e edição (fonte: `prd/admin.md`, matriz de permissões):**

| Área | Super admin | Operação | Financeiro | Suporte |
|---|---|---|---|---|
| Regiões, Categorias | edita | edita | não vê | não vê |
| Parâmetros, Feature flags, Modo manutenção | edita | não vê | não vê | não vê |
| Termos e Privacidade | edita | lê | não vê | não vê |
| Admins e perfis | edita | não vê | não vê | não vê |
| Auditoria | tudo | só as próprias ações | só as próprias ações | só as próprias ações |

**Padrão "Motivo" (ReasonDialog).** Toda alteração que muda regra, dinheiro ou acesso abre um Dialog com: título que repete o **nome do alvo** ("Alterar Tempo para pagar o PIX?"), resumo do **antes e depois** (DiffView), campo **Motivo** (obrigatório, de 10 a 200 caracteres, contador; opções rápidas em chips quando a ação tem motivos comuns) e botões "[Verbo] [alvo]" (primário, ou destrutivo se desliga ou apaga) e "Cancelar". Sem motivo: "Escreva o motivo (mínimo 10 caracteres)." Isso vale para parâmetros, flags, regiões fechadas, categorias inativadas, perfis e termos.
**Falha fechada (WB-123 C4):** se o servidor não conseguir gravar a auditoria, a ação **não** acontece e a tela mostra Banner de erro: "Não foi possível registrar na auditoria. Por segurança, nada foi alterado." + "Tentar de novo".
**Concorrência:** se outro admin alterou o mesmo item, o salvar mostra "Ana alterou isso às 10:42. Veja o valor atual antes de salvar." + "Ver valor atual".
**Tabelas:** DataTable do design system (§3.1) com os 4 estados. Mobile < 1024: lista de linhas. Toast de sucesso inclui "Registrado na auditoria." só nas ações que a fonte exige (A seção "Sucesso" de cada tela diz qual).
**Altura de controles no desktop:** Button `sm` (40) só dentro de tabela; formulários e Dialog usam 48.

## AD1. Regiões (WB-118)

**Objetivo:** abrir e fechar áreas conforme há lojas. **Ação principal:** "Adicionar cidade". Prefixo `admin.regioes.`

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Lista de linhas (ListItem 72): cidade, "SP · 12 bairros · 5 lojas", Switch "Ativa/Inativa" (texto) à direita; toque na linha abre o detalhe |
| Desktop | DataTable: Cidade (UF), Status (Switch com texto), Bairros, Lojas visíveis, Na lista de espera, "Abrir". Botão principal no cabeçalho |

**Detalhe da cidade** (página; no celular em tela cheia): cabeçalho com nome, Switch e totais. Tabs "Bairros" e "Lista de espera". **Bairros:** lista com nome, Switch, e "Adicionar bairro" (campo + botão) e "Adicionar vários" (colar uma lista, um por linha; prévia com contagem e duplicados marcados). Texto de apoio fixo: "Bairro que você não cadastrar segue a regra da cidade." (WB-118 C4). **Lista de espera (C5):** número total e por bairro, sem nome nem e-mail ("42 pessoas esperando em Vila Rosa"), ordenado do maior para o menor, com "Ativar" ao lado de cada bairro inativo.
**Formulário (Adicionar cidade):** Nome (2 a 60) · UF (lista, SP padrão) · Switch "Começar ativa" (desligado). Erros: "Digite o nome da cidade." · "Essa cidade já está na lista."
**Fechar (inativar) cidade ou bairro:** ReasonDialog "Fechar Caieiras?" / "O app deixa de mostrar lojas ali e novos pedidos nessa região são bloqueados. Pedidos em andamento seguem." / 3 pedidos em andamento (número real) / motivo / "Fechar cidade" (destrutivo). Bairro: mesmo texto com o nome do bairro.
**Abrir (ativar) sem loja (C3):** Dialog "Nenhuma loja atende aqui ainda." / "Quem abrir o app em Caieiras vê a tela de região sem lojas." / "Ativar mesmo assim" (primário) · "Cancelar".

| Estado | Comportamento |
|---|---|
| Skeleton | 4 linhas |
| Vazio | EmptyState `MapPin`: "Nenhuma cidade cadastrada" / "Cadastre a primeira para o app saber onde entregar." / "Adicionar cidade" (só em ambiente sem seed) |
| Erro / Offline | EP-web; Switch volta ao valor antigo se salvar falhar, com "Não foi possível alterar. Tentar de novo." |
| Sucesso | Toast "Caieiras fechada." / "Vila Rosa ativado." / "Cidade adicionada." |
| Permissão | Super admin e Operação editam; os outros não veem o menu |

**A11y:** Switch com rótulo "Caieiras, ativa" e estado em texto; tabela com cabeçalhos; salvando = Switch com spinner e "Salvando…" anunciado. **testID:** `add-city`, `city-<id>`, `city-<id>-switch`, `city-<id>-open`, `neighborhood-input`, `neighborhood-add`, `neighborhood-bulk-open`, `neighborhood-bulk-input`, `neighborhood-<id>-switch`, `waitlist-tab`, `close-reason`, `close-confirm`, `activate-anyway`.

## AD2. Categorias (WB-106)

**Objetivo:** organizar o app por categorias que fazem sentido. **Ação principal:** "Nova categoria". Prefixo `admin.categorias.`

| Breakpoint | Layout |
|---|---|
| Celular | Lista de categorias (nível 1) com ícone 40, nome, "18 produtos · 3 lojas", selo "Inativa" quando for; toque expande as subcategorias (nível 2) logo abaixo; menu `DotsThree` por linha |
| Desktop | Duas colunas: árvore à esquerda (categoria > subcategorias, expansível); à direita, o formulário de edição da linha escolhida e a prévia "Como aparece no app" (círculo 64 `surface.sunken` + ícone + rótulo) |

**Ordem:** **ReorderList** com alça e botões "Subir" e "Descer" (nunca só arrastar, WCAG 2.5.7), dentro do mesmo nível; vale na próxima abertura do app (WB-106 C2).
**Formulário (drawer 480 ou tela cheia no celular):** Nome (até 30, contador "12 de 30") · Ícone (**IconPicker**: grade de 40 ícones da biblioteca fixa, cada um com o **nome escrito** embaixo e check no escolhido; busca por nome) · Pertence a ("Nenhuma, é categoria principal" ou uma categoria; só 2 níveis) · Switch "Ativa". Botão "Salvar categoria".
**Mensagens:** "Digite o nome da categoria." · "Já existe uma categoria com esse nome aqui." · "Escolha um ícone."
**Inativar (C3):** ReasonDialog "Inativar Calçados?" / "Ela some do app e das buscas. Os 18 produtos ficam guardados e os 3 lojistas são avisados." / "Inativar categoria".
**Excluir (C4):** com vínculos, Dialog informativo (sem motivo, sem destrutivo): "Não dá para excluir Calçados." / "Ela tem 18 produtos e 3 lojas. Mova para outra categoria ou inative." / "Inativar categoria" · "Fechar". Sem vínculos: Dialog "Excluir Calçados?" com motivo e "Excluir categoria" (destrutivo). O menu mostra "Excluir" sempre, mas a explicação vem ao tocar (nunca item inerte sem motivo).

| Estado | Comportamento |
|---|---|
| Skeleton | Árvore em skeleton |
| Vazio | EmptyState `Tag`: "Nenhuma categoria ainda" / "Sem categorias, os lojistas não conseguem cadastrar produtos." / "Nova categoria" |
| Erro / Offline | EP-web |
| Sucesso | Toast "Categoria salva." / "Calçados inativada." / "Ordem salva." |
| Permissão | Super admin e Operação editam |

**A11y:** árvore com `role="tree"`; setas expandem e recolhem; reordenar anuncia "Calçados, posição 2 de 8". **testID:** `new-category`, `category-<id>`, `category-<id>-menu`, `category-<id>-up`, `category-<id>-down`, `name-input`, `icon-picker`, `icon-<nome>`, `parent-select`, `active-switch`, `submit`, `inactivate-confirm`, `delete-confirm`, `delete-blocked`, `preview`.

## AD3. Parâmetros do negócio (WB-119)

**Objetivo:** ajustar uma regra sem pedir deploy e sem errar. **Ação principal:** "Salvar parâmetro" (no painel de edição). Só super admin. Prefixo `admin.parametros.`

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Busca no topo; grupos recolhíveis; cada linha é um **ParamRow** (ListItem 72); toque abre folha de edição em tela cheia |
| Desktop | Lista agrupada à esquerda (até 720) e painel de edição fixo à direita (drawer 400), que mostra o parâmetro escolhido |

**Grupos:** Pedido e pagamento · Entrega e retirada · Trocas · Avaliações · Código e acesso · Loja nova e risco · Privacidade e retenção · Marketing · Repasses. Os valores e faixas vêm de `regras-de-negocio.md` RN-02 (fonte única; a tela não os inventa).
**ParamRow:** nome legível ("Tempo para pagar o PIX") · valor atual em `bodyStrong` com unidade ("15 min", "R$ 2.000,00") · linha secundária "Padrão 15 · de 5 a 60" · chave técnica em `caption` (`pix_expiracao_min`, para o dev e a auditoria) · selo "Alterado" (ícone `PencilSimple`) quando difere do padrão. Valores em centavos aparecem em reais.
**Painel de edição:** descrição de 1 linha do que o parâmetro faz · campo com unidade (número, moeda ou lista) · faixa e padrão · **Motivo** (§AD0) · aviso fixo "Vale a partir de agora. Pedidos já feitos mantêm as regras da época." · botão "Salvar parâmetro" · link "Restaurar padrão (15)" que abre Dialog "Restaurar o padrão?" / "O valor volta para 15 min." / "Restaurar" · link "Ver histórico" (últimas 5 mudanças: quem, quando, antes para depois, motivo; "Ver tudo" abre a Auditoria filtrada).
**Parâmetros compostos** (`parcelas_max` + `parcela_min_cents`, `loja_aceite_timeout_min` + `lembrete`, `loja_nova_*`) aparecem numa linha só, com os campos lado a lado (empilham no celular).
**Comissão e taxa de serviço não se editam aqui:** a linha mostra o valor atual e o link "Editar em Financeiro > Comissões" (uma só porta de entrada para dinheiro, WB-111; evita duas telas para a mesma coisa).
**Pisos legais (C5):** `troca_arrependimento_dias` e `troca_defeito_dias` ganham selo "Lei" (`Scales`) e Banner de alerta no painel: "Esse prazo é o mínimo previsto no Código de Defesa do Consumidor. Reduzir abaixo dele expõe o Webag a risco jurídico." O campo **não aceita** valor abaixo do piso: "O mínimo é 7 dias." Aumentar é permitido.
**Mensagens:** fora da faixa: "O valor vai de 5 a 60." · vazio: "Digite um valor." · decimal onde só cabe inteiro: "Use um número inteiro."

| Estado | Comportamento |
|---|---|
| Skeleton | 8 linhas |
| Vazio | Busca sem resultado: "Nenhum parâmetro com esse nome." + "Limpar busca" |
| Erro | EP-web; falha ao salvar: Banner "Não foi possível salvar. O valor anterior continua valendo." |
| Offline | EP-web; salvar: "Conecte-se para salvar. O que você digitou está aqui." |
| Sucesso | Toast "Parâmetro salvo. Registrado na auditoria." e a linha mostra "Alterado" |
| Permissão | Só super admin; outros perfis não veem o menu |

**A11y:** cada grupo é `<h2>` e região recolhível com `aria-expanded`; valor lido com unidade ("15 minutos"); faixa ligada ao campo por `aria-describedby`. **testID:** `search-input`, `group-<id>`, `param-<chave>`, `param-<chave>-edit`, `value-input`, `reason-input`, `submit`, `restore-default`, `restore-confirm`, `history-link`, `legal-banner`.

## AD4. Feature flags (WB-120)

**Objetivo:** ligar ou desligar uma função sem deploy, entendendo o efeito. **Ação principal:** alternar uma flag (confirmação sempre). Só super admin. Prefixo `admin.flags.`

| Breakpoint | Layout |
|---|---|
| Celular | Lista de **FlagRow**: nome, 1 linha de efeito, Switch com texto "Ligada/Desligada", "Alterada por Ana em 12 nov, 10:15" |
| Desktop | Mesma lista em 1 coluna de até 880; cada linha tem o efeito completo à direita do nome. Sem tabela |

**Flags e o que acontece ao desligar (texto da linha, 1 frase):**

| Flag | Efeito ao desligar |
|---|---|
| Pagamento com cartão | "O cartão some do pagamento na próxima abertura do app." |
| Pagamento com PIX | "O PIX some do pagamento na próxima abertura do app." |
| Retirada na loja | "A opção Retirada some do app e do cadastro das lojas." |
| Login com Google e Apple | "Os botões somem do cadastro e do login." |
| Taxa de serviço | "O cliente deixa de ver a linha de taxa no pagamento." |
| Cadastro de lojista | "Quem abrir o cadastro vê a lista de espera." |
| Trocas voluntárias (tamanho e cor) | "Lojas deixam de aceitar novas trocas por tamanho ou cor. Trocas abertas terminam normalmente." |
| Push de marketing | "Nenhum push de marketing é enviado." |
| Confirmar e-mail antes de comprar | "Ligada: o 1º pedido só sai depois do código. Desligada (padrão): confirma depois." (HIP-D07, WB-224 C9) |
| Código de entrega do cliente | "O lojista conclui a entrega sem pedir o código." (WB-226) |

**Alternar:** abre ReasonDialog. Desligar: título "Desligar pagamento com cartão?", texto "O cartão some do pagamento em até 1 minuto. Pedidos já criados seguem normalmente.", botão "Desligar cartão" (destrutivo). Ligar: "Ligar pagamento com cartão?" e botão primário "Ligar cartão". Motivo obrigatório. **Trava contra erro caro:** desligar PIX ou cartão quando o outro já está desligado mostra Banner de erro dentro do Dialog, "Sem PIX e sem cartão, ninguém consegue pagar.", e o botão fica "Desligar mesmo assim" **[HIPÓTESE, Z-5: bloquear ou só avisar]**. Depois de salvar, a linha mostra "Chega ao app em até 1 minuto." por 60 s (WB-120 C4).

| Estado | Comportamento |
|---|---|
| Skeleton | 6 linhas |
| Vazio | n/a (flags vêm do seed) |
| Erro | O Switch volta ao estado anterior; Banner "Não foi possível alterar. A flag continua [ligada]." |
| Offline | Switch ativo; ao tocar, "Conecte-se para alterar." |
| Sucesso | Toast "Cartão desligado. Registrado na auditoria." |
| Permissão | Só super admin |

**A11y:** Switch com rótulo "Pagamento com cartão, ligada"; estado em texto; Dialog com foco no título. **testID:** `flag-<chave>`, `flag-<chave>-switch`, `flag-<chave>-meta`, `confirm-dialog`, `reason-input`, `confirm`, `cancel`, `last-payment-warning`.

## AD5. Termos e privacidade (WB-117, 210 C5)

**Objetivo:** publicar uma versão nova sem deploy e com prova do que valeu quando. **Ação principal:** "Nova versão". Super admin edita; Operação lê. Prefixo `admin.termos.`

**Lista (AD5a).** 3 documentos, cada um com versionamento próprio (C5): "Termos de uso (cliente)", "Termos do lojista", "Política de privacidade". Cartão por documento: versão vigente ("Versão 2.1 · vigente desde 02 nov"), se há rascunho ("Rascunho da 2.2, salvo às 14:32"), botões "Nova versão" (primário) e "Ver versões". Desktop: 3 cartões em linha; celular: empilhados.
**Versões (AD5b), VersionList:** tabela (celular: lista) com Versão, Vigência, "Mudança relevante" (Sim/Não com ícone), Publicada por, Status (Vigente · Agendada · Anterior). Linha abre o texto em leitura. Versão publicada **nunca** é editada ("Para corrigir, publique uma nova versão.").
**Editor (AD5c):**

| Breakpoint | Layout |
|---|---|
| Celular | Campos em sequência; botão "Pré-visualizar" abre tela cheia; rodapé fixo com "Publicar versão 2.2" |
| Desktop | Duas colunas: editor (esquerda) e pré-visualização ao vivo (direita, em largura de celular e de página web, com alternador) |

Campos: **Texto** (**RichTextLite**: títulos nível 2 e 3, negrito, lista, link; botões **com rótulo de texto**, nenhum HTML cru aceito, colar vira texto limpo) · **Vigência a partir de** (data nativa, hoje ou depois) · **Mudança relevante** (Switch; texto: "Todos os usuários precisam aceitar de novo no próximo uso." e a contagem "Hoje 1.240 pessoas veriam a tela de aceite.") · **O que mudou** (até 280, obrigatório só quando "relevante" estiver ligada; é o texto que o usuário lê no E6). Rascunho automático: "Rascunho salvo às 14:32".
**Publicar:** Dialog "Publicar a versão 2.2 dos Termos de uso?" / "Vale a partir de 20 nov. Não dá para editar depois; para corrigir, publique outra versão." / "Publicar versão 2.2" · "Cancelar". Sem texto ou sem data: "Escreva o texto antes de publicar." / "Escolha a data de vigência." (C4).
**Páginas públicas (AD5d):** `/termos`, `/termos-lojista` e `/privacidade`, sem login. Título, "Versão 2.1 · vigente desde 02 nov", índice por âncoras (≥ 1024: lateral fixo; abaixo: recolhido "Neste documento"), texto em coluna de 680 e corpo 16, botão "Imprimir". Sem versão publicada: "Documento em preparação." (não ocorre em produção: o seed publica a v1).

| Estado | Comportamento |
|---|---|
| Skeleton | Cartões e linhas em skeleton; página pública com título e 6 linhas |
| Vazio | Documento sem nenhuma versão: EmptyState `FileText` "Nenhuma versão publicada" / "O app só abre com a versão 1 dos termos publicada." / "Escrever versão 1" |
| Erro / Offline | EP-web; rascunho guardado no navegador e no servidor ("Salvo neste aparelho" quando offline) |
| Sucesso | Toast "Versão 2.2 publicada. Registrado na auditoria." |
| Permissão | Operação vê tudo sem botões de edição |

**A11y:** editor com `role="textbox"` multilinha, barra de ferramentas com `aria-label` por botão e atalhos (`Ctrl+B`); pré-visualização é `aria-hidden` do leitor (o texto está no editor); página pública com `<h1>..<h3>` reais, `lang="pt-BR"`, contraste 4,5:1. **testID:** `doc-<tipo>`, `doc-<tipo>-new-version`, `doc-<tipo>-versions`, `version-<id>`, `editor-text`, `toolbar-<acao>`, `effective-date`, `relevant-switch`, `changes-input`, `preview-toggle`, `publish`, `publish-confirm`, `draft-saved`.

## AD6. Auditoria (WB-123)

**Objetivo:** responder "quem fez o quê, quando e de onde". **Ação principal:** "Filtrar" (a tela é de leitura; sem editar nem apagar). Super admin vê tudo; os outros perfis veem só as próprias ações (faixa fixa: "Você vê só as suas ações."). Prefixo `admin.auditoria.`

| Breakpoint | Layout |
|---|---|
| Celular | Busca + botão "Filtros" (folha); lista de linhas: ação em texto ("Parâmetro alterado"), alvo, "Ana · Operação · 18 nov, 10:42"; toque abre o detalhe em tela cheia |
| Desktop | Chips de filtro acima; DataTable com colunas Quando, Quem (nome e perfil), Ação, Alvo, IP, "Ver". Detalhe em drawer 480 sem sair da lista |

**Filtros (C2):** Período (Hoje, 7 dias, 30 dias, Personalizado), Quem (busca por nome), Ação (grupos: Acesso, Lojas, Pedidos e dinheiro, Catálogo, Marketing, Configuração, Dados pessoais), Alvo (texto livre: nº do pedido, nome da loja, chave). Paginação de 50. "Atualizada às 10:42" + "Atualizar".
**Detalhe (AuditRow + DiffView):** Quem (nome, perfil, e-mail) · Quando (`18 nov 2026, 10:42:31`, fuso de Brasília) · De onde (IP e aparelho resumido: "Chrome, Windows") · Ação e alvo · Motivo · **Antes e depois**: duas colunas (empilham no celular) com o campo alterado; o que saiu leva "−" e o que entrou "+" **além** da cor (`danger.subtle`/`success.subtle`). Eventos de "revelar dado pessoal" mostram **quais campos** foram revelados, nunca os valores. Rodapé fixo: "Este registro não pode ser editado nem apagado." Não existe nenhum botão de editar ou excluir (C3).
**Exportar (CSV, só super admin):** respeita o filtro; abre AC5a (TOTP); acima de 10 mil linhas: "A exportação é grande. Enviaremos o link por e-mail." A própria exportação aparece na lista.

| Estado | Comportamento |
|---|---|
| Skeleton | 8 linhas com cabeçalho real |
| Vazio | EmptyState `ClockCounterClockwise`: "Nenhum registro neste período" / "Tente outro período ou tire um filtro." / "Limpar filtros" |
| Erro / Offline | EP-web; lista em cache com "Atualizada às 10:42" |
| Sucesso | n/a (leitura); exportação: toast "Exportação pedida. Registrada na auditoria." |
| Permissão | Perfil comum: só as próprias linhas; tentar abrir registro de outro: Sem acesso |

**A11y:** tabela com `<caption>` "Registro de auditoria" e ordenação anunciada ("ordenado por mais recente"); diff como lista "Campo: antes X, depois Y" para o leitor de tela. **testID:** `filter-period`, `filter-actor`, `filter-action`, `filter-target`, `row-<id>`, `row-<id>-open`, `detail`, `detail-diff`, `export`, `refresh`, `own-only-banner`.

## AD7. Admins e perfis (WB-101, WB-222 C5 e C6)

**Objetivo:** dar o acesso certo e tirá-lo na hora. **Ação principal:** "Convidar admin". Só super admin. Toda ação desta tela pede TOTP vigente (AC5a). Prefixo `admin.admins.`

| Breakpoint | Layout |
|---|---|
| Celular | Tabs "Admins" e "O que cada perfil vê". Lista de linhas (72): avatar com iniciais, nome, e-mail, perfil (selo), status |
| Desktop | Mesmas Tabs; "Admins" em DataTable: Nome e e-mail, Perfil, Verificação em duas etapas (Configurada / Pendente), Último acesso, Status, menu `DotsThree` |

**Status:** "Ativo" · "Convite enviado · vence em 40 h" · "Desativado". A linha do próprio usuário mostra "Você" e **não tem ações destrutivas**.
**Convidar (drawer 480 ou tela cheia):** Nome · E-mail · **Perfil** em rádios grandes, cada um com 1 frase: Super admin ("Tudo, inclusive admins, parâmetros e flags") · Operação ("Lojas, catálogo, pedidos, marketing e regiões") · Financeiro ("Comissões, repasses, conciliação e estornos") · Suporte ("Consulta pedidos, lojas e usuários e abre trocas") · botão "Enviar convite". Texto: "O convite vale 48 horas e só serve para este e-mail." Erros: "Confira o e-mail." · "Esse e-mail já é de um admin." · "Esse e-mail é de um cliente não confirmado. Peça para confirmar primeiro." (WB-224 C2).
**Menu da linha:** "Alterar perfil" (ReasonDialog, "Vale na hora. As sessões de Ana são encerradas.") · "Reenviar convite" (o anterior deixa de valer) · "Cancelar convite" · "Redefinir verificação em duas etapas" (ReasonDialog; **não aparece na própria linha**; o admin precisa configurar de novo no próximo login) · "Desativar" (ReasonDialog destrutivo "Desativar Ana?", "Ela perde o acesso agora e as sessões dela são encerradas.").
**Último super admin (C3):** "Desativar" e "Alterar perfil" no último super admin mostram Dialog informativo: "Precisa existir ao menos 1 super admin." / "Dê o perfil de super admin a outra pessoa antes." / "Entendi".
**Tab "O que cada perfil vê":** tabela somente leitura com as 4 colunas de perfil e as linhas da matriz da §AD0 estendida pela matriz de `prd/admin.md` (Aprovar loja, Estornar até R$ 500, Estornar acima de R$ 500, Cancelar pedido, Mediar troca, Ver documentos, Banners e push, etc.), usando "Pode", "Só vê", "Não" em **texto com ícone** (nunca só cor). Serve para o super admin decidir sem abrir o PRD.

| Estado | Comportamento |
|---|---|
| Skeleton | 4 linhas |
| Vazio | n/a (sempre existe ao menos o super admin) |
| Erro / Offline | EP-web |
| Sucesso | Toast "Convite enviado para ana@exemplo.com." / "Perfil alterado. As sessões de Ana foram encerradas." / "Ana foi desativada." / "Verificação de Ana redefinida." |
| Permissão | Só super admin |

**A11y:** rádios de perfil em `fieldset` com legenda "Perfil"; tabela de perfis com cabeçalho de linha e coluna. **testID:** `tab-admins`, `tab-profiles`, `invite-open`, `invite-name-input`, `invite-email-input`, `invite-profile-<id>`, `invite-submit`, `admin-<id>`, `admin-<id>-menu`, `admin-<id>-change-profile`, `admin-<id>-reset-totp`, `admin-<id>-deactivate`, `last-super-dialog`, `profile-matrix`.

---

## Z. Hipóteses, divergências e perguntas

| # | Item | Para quem | Proposta |
|---|---|---|---|
| Z-1 | WB-006 C2 e C4 dizem "botão inativo"; o design system manda botão ativo com erro ao tocar | PO | Ler os critérios como "ao tocar, não envia e mostra o erro". QA testa assim |
| Z-2 | Login do admin em 2 passos revela que a senha estava certa a quem erra o código | Security | Padrão de mercado; manter. Alternativa de 1 formulário com 3 campos piora o uso sem ganho real |
| Z-3 | "Esqueci a senha" do admin: o PRD não prevê; sem ela o último super admin fica sem caminho | Security, PO | Reset por código no e-mail **e** TOTP obrigatório no fim; auditado |
| Z-4 | Selo "Pagamentos: simulado/real" no cabeçalho do admin | PO, tech-lead | Evita estorno de teste tomado por real; custo baixo |
| Z-5 | Desligar PIX e cartão ao mesmo tempo: bloquear ou só avisar | PO | Só avisar com confirmação reforçada (decisão do super admin) |
| Z-6 | Sessão do painel do lojista por 30 dias (PC do balcão) | Security | Manter; "Sair" sempre visível; "Sair de todos os aparelhos" em E8 |
| Z-7 | Marketing fora do cadastro (E1) | PO | Pedir no pós-1º pedido e em Conta > Notificações (onda 6, WB-196) |
| Z-8 | Corrigi o design system e L2: espera do reenvio do código é 1:00, não 0:30 (WB-007 C4, HIP-022) | CEO (registro) | Feito neste lote |
| Z-9 | Corrigi `onda-2` A1 a A3: suporte e financeiro **não** veem documentos (WB-218 C1, matriz do PRD); suporte vê lojas sem documentos; financeiro não vê a fila | CEO (registro) | Feito neste lote |
