# Telas da Onda 6: conformidade, ajuda, marketing, relatórios e equipe

> Autor: product-designer. Data: 2026-11-18. Histórias: WB-032, 212 a 214, 217, 196, 211 (conta e privacidade); WB-034 (ajuda); WB-038, 124 (denúncia e moderação); WB-115, 197 (marketing); WB-114, 122, 125 (relatórios e painel do admin); WB-121, 198 (manutenção e alertas); WB-075 C3 e C5 (equipe). Base: `design-system.md` (v0.3.0), `identidade.md` §8, `prd/lgpd.md`, `prd/notificacoes.md`, `prd/admin.md`. Decisões: DEC-014 e 015 (excluir conta só com senha), DEC-017, HIP-024 a 027. Itens **[HIPÓTESE]** na §Z.
> **6A (LGPD e lojas de apps) bloqueia o G5**: CC2 a CC7, DN1, DN2. O resto (6B) cai conforme `backlog.md` §5.
> **Já existem e não são repetidos:** código por e-mail e folha de confirmar e-mail (`onda-1b-contas.md` E4 e E5), Termos e Privacidade públicos (AD5d), novos termos (E6), Segurança da conta do lojista (E8), lista e convite de equipe (L9, L10).
> Prefixos de teste: **app** `account.`, `help.`, `report.`; **web pública** `public.`; **lojista** `lojista.<tela>.`; **admin** `admin.<tela>.`.

## 0. Convenções

**0.1 Estados.** App: EP-app. Web: EP-web (`onda-3` §0.2, `onda-2` §0.2). Cada tela traz uma linha **Estados** (Skeleton · Vazio · Erro · Offline · Sucesso · Permissão) só com o que é específico. Breakpoints web: `onda-2` §0.1.
**0.2 Senha como confirmação de ação (DEC-015).** Exportar, excluir e trocar e-mail pedem a **senha** (campo `current-password` com olho); a senha errada conta no limite de tentativas (WB-221 C6) e mostra "Senha incorreta." Excluir conta **nunca** pede o código por e-mail. Exportar e trocar e-mail exigem e-mail confirmado: o toque abre a EmailConfirmSheet (`onda-1b-contas.md` E5b).
**0.3 Texto jurídico.** Tudo que descreve direito, prazo ou retenção usa a minuta do PO e é marcado `[validar com jurídico]` até o G5. A tela busca os números dos parâmetros (15 dias, 5 anos, 7 dias) e nunca os escreve fixos.
**0.4 Mapa.**

| Parte | Telas |
|---|---|
| A. Cliente: conta e privacidade (6A) | CC1 Conta · CC2 Dados pessoais e senha · CC3 Exportar meus dados · CC4 Excluir minha conta · CC5 Excluir conta pela web · CC6 Notificações e consentimentos · CC7 Privacidade e canal do titular |
| B. Ajuda | AJ1 Ajuda do cliente · AJ2 Ajuda do lojista (alertas) · AJ3 Conteúdo da ajuda (admin) |
| C. Denúncia (6A) | DN1 Denunciar · DN2 Moderação de denúncias (admin) |
| D. Admin: marketing | MK1 Banners e destaques · MK2 Push segmentado |
| E. Admin: relatórios e operação | RL1 Relatórios · RL2 Painel inicial · OP1 Modo manutenção · OP2 Alertas · OP3 Pedidos de titulares (LGPD) |
| F. Lojista: equipe | EQ1 Permissões, atividade e acesso da equipe |

**0.5 Eventos (sem dado pessoal):** `account_export_requested`, `account_delete_started`, `account_delete_confirmed`, `consent_granted {tipo}`, `consent_revoked {tipo}`, `report_submitted {alvo, motivo}`, `help_opened {origem}`, `push_sent {segment_size}`, `banner_published`, `maintenance_toggled`. Os de admin vêm do servidor (auditoria).

---

# Parte A. Cliente: conta e privacidade

## CC1. Conta (aba)

**Objetivo:** achar qualquer coisa da conta em 1 toque. **Ação principal:** abrir um item (sem botão primário; visitante: "Entrar ou criar conta").
- **Layout (celular):** cabeçalho "Conta" `title1`. **Cartão da pessoa:** avatar com iniciais 56, nome, e-mail, selo "E-mail confirmado" (`CheckCircle` + texto) ou **Banner info "Confirme seu e-mail"** com "Digitar código" (não dispensável aqui; `onda-1b-contas.md` E5a). **Lista** (ListItem 56, ícone 24 + rótulo + `CaretRight`), em 3 grupos separados por 32: **Minha vida no Webag:** Meus dados · Endereços · Favoritos · Cupons · Trocas. **Avisos e ajuda:** Notificações (com contador de não lidas) · Ajuda. **Privacidade e legal:** Privacidade e dados · Termos de uso · Política de privacidade. Por último "Sair da conta" (texto, `text.danger` sem fundo) e a versão "Versão 1.0.0 (123)" em `caption`. Tablet: coluna de 640 centrada.
- **Visitante:** cartão "Entre para ver pedidos, favoritos e cupons" com botão `lg` "Entrar ou criar conta" (S2, volta aqui) e só os itens que não pedem conta: Ajuda, Termos de uso, Política de privacidade.
- **Sair:** Dialog "Sair da conta?" / "Seus favoritos e sua sacola ficam guardados." / "Sair" · "Cancelar". Limpa tokens do aparelho e o token de push (WB-190 C3); toast "Você saiu da conta."
- **Estados.** Skeleton: cartão e 8 linhas. Vazio: n/a. Erro/Offline: EP-app; a lista funciona offline; itens que precisam de rede explicam ao abrir. Sucesso: n/a. Permissão: visitante, acima.
- **A11y:** cartão da pessoa lido "Maria Souza, maria@gmail.com, e-mail confirmado"; contador "Notificações, 3 novas". **Android x iOS:** Android: "Sair" no fim da lista; iOS: idem, fonte do sistema para a versão. **testID:** `account.profile-card`, `account.email-banner`, `account.item-data`, `account.item-addresses`, `account.item-favorites`, `account.item-coupons`, `account.item-exchanges`, `account.item-notifications`, `account.item-help`, `account.item-privacy`, `account.item-terms`, `account.item-policy`, `account.logout`, `account.logout-confirm`, `account.login`, `account.version`.

## CC2. Dados pessoais e senha (WB-032, 224 C4, 219)

**Objetivo:** manter os dados certos sem se perder. **Ação principal:** "Salvar" (nome e celular).
- **Layout:** header "Meus dados". **Seção Dados:** Nome (editável) · Celular (máscara, editável) · **E-mail** (somente leitura, com o selo de confirmado e o link "Trocar e-mail"). Botão `lg` "Salvar" (ativo; salvar sem mudança: toast "Nada mudou."). **Seção Segurança:** "Alterar senha" (ListItem) e "Sair de todos os aparelhos".
- **Trocar e-mail (C1):** folha em 3 passos de uma tela cada: (1) **Senha** (`current-password`; reautenticação válida por 5 min: se tocou há pouco, pula) · (2) **Novo e-mail** (sugestão de domínio) · (3) **Código** enviado ao **novo** endereço (E4). Ao confirmar: toast "E-mail trocado." e o endereço **antigo recebe um aviso** ("Seu e-mail no Webag foi trocado"). Conta com e-mail não confirmado **não vê "Trocar e-mail"**: vê "Corrigir e-mail" (E5c).
- **Alterar senha (C2):** tela com Senha atual · Nova senha + Confirmar senha (`onda-1b-contas.md` §0.3) · botão "Salvar nova senha". Texto fixo: "Os outros aparelhos vão sair da conta." Sucesso: toast "Senha alterada." (esta sessão continua).
- **Sair de todos os aparelhos (WB-219 C1):** Dialog "Sair de todos os aparelhos?" / "Você vai precisar entrar de novo em cada um. Este aparelho também sai." / "Sair de todos" (destrutivo) · "Cancelar".
- **Mensagens:** "Digite seu nome." · "Confira o celular com DDD." · "Senha incorreta." · "Essa senha é igual à atual. Escolha outra." Nada é salvo com dado inválido (C4).
- **Estados.** Skeleton: 3 campos. Vazio: n/a. Erro: EP-app; falha ao salvar: Banner "Não foi possível salvar. O que você digitou está aqui." Offline: "Conecte-se para salvar." (botão ativo). Sucesso: toasts acima. Permissão: e-mail não confirmado, acima.
- **A11y:** e-mail em campo `readonly` com rótulo "E-mail, não editável aqui"; `autocomplete` `name`, `tel`, `current-password`, `new-password`. **testID:** `account.data-name-input`, `account.data-phone-input`, `account.data-email`, `account.data-email-change`, `account.data-save`, `account.change-password`, `account.password-current-input`, `account.password-input`, `account.password-confirm-input`, `account.password-toggle`, `account.password-submit`, `account.logout-all`, `account.logout-all-confirm`, `account.email-change-password-input`, `account.email-change-new-input`, `account.email-change-submit`.

## CC3. Exportar meus dados (WB-212, 224 C2; 6A)

**Objetivo:** receber uma cópia do que o Webag guarda. **Ação principal:** "Pedir exportação". Conta > Privacidade e dados > Exportar meus dados.
- **Layout:** título "Exportar meus dados" · "Enviamos uma cópia por e-mail em até 24 horas. Ela traz seu perfil, endereços, pedidos, trocas, avaliações, favoritos e preferências." · lista curta "Fica de fora: dados de outras pessoas e senhas." · campo **Senha** · botão `lg` "Pedir exportação". Abaixo, **cartão de status** da última exportação.
- **Estados do cartão:** nenhuma (não aparece) · **Em andamento** ("Pedida em 18 nov, 10:15. Avisamos por e-mail." — o botão vira inerte com o rótulo "Você já tem uma em andamento", C4) · **Pronta** ("Pronta. O link vale até 25 nov." + "Baixar arquivos", que exige estar logado) · **Vencida** ("O link venceu em 25 nov. Peça outra.") · **Limite** ("Você pode pedir uma por dia. Tente de novo amanhã.").
- **E-mail não confirmado (WB-224 C2):** ao tocar, abre a EmailConfirmSheet "Para exportar seus dados, confirme seu e-mail." e depois pede a senha.
- **Lojista (web, WB-212 C6):** Minha loja > Segurança tem o bloco "Exportar dados da conta e da loja" com o mesmo texto e cartão, incluindo perfil, loja, pedidos e financeiro; mesma regra de senha.
- **Estados.** Skeleton: cartão de status. Vazio: n/a. Erro: EP-app; "Senha incorreta." · "Não conseguimos pedir agora. Tente de novo." Offline: "Conecte-se para pedir a exportação." Sucesso: tela curta `CheckCircle` "Pedido recebido" / "Enviamos por e-mail em até 24 horas." / "Voltar". Permissão: n/a.
- **testID:** `account.export-password-input`, `account.export-submit`, `account.export-status`, `account.export-download`, `account.export-limit`. **Analytics:** `account_export_requested`.

## CC4. Excluir minha conta (WB-213, 215; Apple 5.1.1(v); 6A)

**Objetivo:** sair do Webag com clareza e sem precisar de suporte. **Ação principal:** "Excluir minha conta" (destrutivo, **nunca** o 1º visual). Caminho: Conta > Privacidade e dados > Excluir minha conta (3 toques, sem ligar para ninguém, C7).
- **Layout (de cima para baixo):** título "Excluir minha conta" · **"O que acontece"** (lista com ícones e texto): "Sua conta fecha agora e você sai de todos os aparelhos." · "Apagamos seu nome, e-mail, celular, endereços, favoritos, buscas e fotos de troca em até 15 dias." · "Pedidos e pagamentos ficam sem o seu nome. Só guardamos o que a lei exige, por até 5 anos." · "Você pode criar outra conta com o mesmo e-mail, sem herdar nada." (os números 15 e 5 vêm dos parâmetros) · link de texto "Quer uma cópia antes? Exportar meus dados" (CC3) · campo **Senha** · botão destrutivo `lg` "Excluir minha conta".
- **Bloqueio (C2):** com pedido ou troca em aberto, no lugar do formulário: ErrorState `Receipt` "Conclua antes de excluir" / "Você tem 1 pedido e 1 troca em andamento." / lista com links ("Pedido #4821 · saiu para entrega", "Troca TR-1042 · aprovada") / botão "Ver pedidos". O botão de excluir não aparece.
- **Confirmação final:** Dialog "Excluir sua conta?" / "Apagamos seus dados e pedidos antigos. Isso não pode ser desfeito." / "Excluir conta" (destrutivo) · "Cancelar" (identidade §8). O foco inicial fica em "Cancelar".
- **Conta só com login social (sem senha):** no lugar do campo, botão "Confirmar com Google" ou "Confirmar com Apple" (nova autenticação do provedor). O vínculo é revogado (WB-213 C5).
- **E-mail não confirmado:** continua permitido, **só com a senha** (DEC-015; WB-224 C3).
- **Mensagens:** "Digite sua senha para excluir." · "Senha incorreta." (conta no limite, WB-221 C6; "Muitas tentativas. Tente de novo às 14:47.").
- **Sucesso:** tela cheia "Sua conta foi excluída" (sem exclamação) / "Enviamos um aviso por e-mail. Obrigado por ter usado o Webag." / "Fechar". O app volta ao estado de visitante e apaga dados locais (sacola, rascunhos, histórico de busca, token de push). E-mail "Sua conta foi excluída" sem dados (C4).
- **Lojista dono (web, C8):** mesmo texto com acréscimo "Sua loja será encerrada." e **bloqueio** enquanto houver pedido aberto, estorno ou disputa pendente (e, no modo centralizado, repasse a pagar): lista com links e "Encerre sua loja antes: finalize esses itens." Funcionário: a exclusão da própria conta é a mesma do cliente; o acesso à loja some.
- **Estados.** Skeleton: lista de bloqueios enquanto confere. Vazio: n/a. Erro: EP-app; "Não conseguimos excluir agora. Sua conta continua ativa." + "Tentar de novo". Offline: "Conecte-se para excluir a conta." (botão ativo). Sucesso: acima. Permissão: n/a.
- **A11y:** botão destrutivo separado do "Voltar" por ≥ 24; ação irreversível dita no Dialog; Dialog com `role="alertdialog"` e foco em "Cancelar". **testID:** `account.delete-info`, `account.delete-export-link`, `account.delete-blockers`, `account.delete-blocker-<id>`, `account.delete-password-input`, `account.delete-social-confirm`, `account.delete-submit`, `account.delete-dialog`, `account.delete-confirm`, `account.delete-cancel`, `account.delete-done`. **Analytics:** `account_delete_started`, `account_delete_confirmed`.

## CC5. Excluir conta pela web (WB-214; Google Play; 6A; página pública)

**Objetivo:** pedir a exclusão sem o app instalado. **Ação principal:** "Enviar código". URL pública `/excluir-conta`, citada na Data Safety e na política. Prefixo `public.excluir.`

| Breakpoint | Layout |
|---|---|
| Celular (< 640) | Logo, título `title1` "Excluir conta Webag", 1 parágrafo, formulário, botão `lg` fixo no rodapé |
| Tablet e desktop | Coluna de 480 centrada, sem menu; rodapé com "Termos de uso" e "Política de privacidade" |

- **Passo 1:** texto "Digite o e-mail da conta. Enviaremos um código para confirmar que é você." · campo E-mail · botão "Enviar código". **Sempre** mostra o passo 2 com "Se existir uma conta com esse e-mail, enviamos um código." (C3, sem revelar a existência) e o mesmo tempo de resposta.
- **Passo 2:** E4 (finalidade `delete_web`) com a mesma frase. **Alternativa sem código (C6, conta não confirmada):** link "Não recebeu o código? Excluir com a senha" troca o passo para **E-mail + Senha** e o botão "Excluir minha conta"; a resposta é igual exista ou não a conta **[confirmar com Security: SEC-002 prevê código]**.
- **Passo 3 (depois de provar o e-mail):** o mesmo conteúdo "O que acontece" de CC4, o bloqueio por pedido ou troca em aberto (aqui já pode ser dito, pois a pessoa provou ser a dona) e o botão destrutivo "Excluir minha conta" com Dialog. Sucesso: "Pedido recebido. Sua conta foi fechada e os dados serão apagados em até 15 dias." + e-mail de aviso.
- **Limite (C5):** 5 por hora por IP e e-mail: "Muitas tentativas. Tente de novo em 1 hora."
- **Estados.** Skeleton: n/a. Vazio: n/a. Erro: EP-web; "Não conseguimos enviar agora. Tente de novo." Offline: "Sem conexão. Conecte-se para continuar." Sucesso: acima. Permissão: n/a.
- **A11y:** página com `<h1>`, `lang="pt-BR"`, contraste 4,5:1, funciona sem JavaScript pesado (LCP < 2,5 s). **testID:** `email-input`, `send-code`, `otp-input`, `use-password`, `password-input`, `delete-submit`, `delete-confirm`, `blockers`, `done`.

## CC6. Notificações e consentimentos (WB-196, 211, 190; 6A)

**Objetivo:** escolher o que recebe, com controle total. **Ação principal:** alternar um Switch (sem botão "Salvar": cada Switch salva na hora, com texto de estado). Conta > Notificações > engrenagem (X6) ou Conta > Privacidade e dados.
- **Grupo 1, "Sobre meus pedidos e trocas":** **sempre ativo** (ícone `Lock` + texto "Sempre ligado"): "Avisos do que você comprou: pedido, pagamento e troca. Não dá para desligar." Linha de **status do sistema**: "Avisos no celular: ligados" ou "Desligados nos ajustes do celular" + "Abrir ajustes".
- **Grupo 2, "Ofertas e novidades":** dois Switches **separados e desligados por padrão** (WB-211 C1): "Ofertas por aviso no celular" e "Ofertas por e-mail". Texto único acima: "Ao ligar, você aceita receber ofertas do Webag, até 2 por semana, entre 9h e 20h. Desligue quando quiser." Ao ligar: toast "Ofertas ligadas." e gravamos o consentimento (data, versão do texto, canal, WB-211 C2); ao desligar, vale na hora (C3). **Ligar o aviso no celular sem a permissão do sistema:** abre a explicação "Para receber, permita os avisos" + "Permitir" (pede a permissão do sistema só aqui, contexto claro).
- **Grupo 3, "Dados de localização e avisos de região":** "Localização precisa: gerencie nos ajustes do celular." + "Abrir ajustes" (WB-211 C5); lista "Avisar quando o Webag chegar em: Vila Rosa" com "Parar de avisar" por item (revoga o consentimento da lista de espera).
- **Flag de marketing desligada (WB-196 C5):** o Grupo 2 mostra "Ofertas indisponíveis por enquanto." sem Switches. A preferência anterior fica guardada.
- **Descadastro por e-mail (público, `/preferencias/descadastrar?t=…`):** página "Você não vai mais receber ofertas por e-mail." com link "Desfazer" e "Ver minhas preferências" (login); funciona com 1 clique (WB-194 C5), sem pedir senha.
- **Estados.** Skeleton: 3 grupos. Vazio: n/a (lista de espera sem itens: o bloco some). Erro: Switch volta ao valor antigo com "Não foi possível salvar. Tentar de novo." Offline: "Conecte-se para mudar suas preferências." (Switch ativo; ao tocar explica) . Sucesso: toasts acima. Permissão: sistema negado, acima.
- **A11y:** Switch com rótulo e estado em **texto** ("Ofertas por e-mail, desligado"); o grupo 1 é texto, não controle. **testID:** `account.prefs-orders`, `account.prefs-system-status`, `account.prefs-open-settings`, `account.prefs-offers-push`, `account.prefs-offers-email`, `account.prefs-permission-explain`, `account.prefs-waitlist-<id>-stop`, `account.prefs-marketing-off`, `public.unsubscribe-undo`. **Analytics:** `consent_granted {tipo}`, `consent_revoked {tipo}`.

## CC7. Privacidade e canal do titular (WB-217; 6A)

**Objetivo:** saber quem responde pelos meus dados e fazer um pedido. **Ação principal:** "Enviar pedido". Conta > Privacidade e dados e Ajuda > Privacidade.
- **Layout:** título "Privacidade e dados" · cartão "Quem cuida dos seus dados": nome do encarregado (`[validar]`: inicialmente o fundador) e e-mail dedicado com "Copiar" e "Escrever" · **"O que você pode fazer"** (ListItem com ação): Ver e corrigir meus dados (CC2) · Pedir uma cópia (CC3) · Excluir minha conta (CC4) · Escolher o que recebo (CC6) · Ler a Política de privacidade · **"Outro pedido"**: botão secundário "Fazer um pedido ao encarregado".
- **Formulário do pedido:** Tipo (lista: "Quero saber que dados vocês têm", "Quero corrigir um dado", "Quero apagar meus dados", "Quero levar meus dados", "Não concordo com um uso dos meus dados", "Outro") · Mensagem (até 500, contador) · E-mail (preenchido, editável) · botão "Enviar pedido". Sucesso: "Recebemos seu pedido. Protocolo PV-0031. Respondemos em até 15 dias." + e-mail de confirmação. O pedido entra em OP3.
- **Estados.** Skeleton: cartão e lista. Vazio: n/a. Erro/Offline: EP-app; texto preservado. Sucesso: acima. Permissão: visitante vê o cartão e o formulário (e-mail obrigatório).
- **testID:** `account.privacy-dpo`, `account.privacy-dpo-copy`, `account.privacy-dpo-mail`, `account.privacy-action-<id>`, `account.privacy-request-open`, `account.privacy-request-type`, `account.privacy-request-text`, `account.privacy-request-email`, `account.privacy-request-submit`.

---

# Parte B. Ajuda

## AJ1. Ajuda do cliente (WB-034, 217 C1)

**Objetivo:** resolver sozinho ou falar com uma pessoa em 2 toques. **Ação principal:** "Falar com o Webag" (WhatsApp). Conta > Ajuda (sem login) e "Ajuda com este pedido" em S7.
- **Layout:** header "Ajuda". **Busca** "O que você precisa?" (filtra as perguntas). **Cartão de contato** no topo: botão `lg` "Falar com o Webag" (WhatsApp, `WhatsappLogo`) e link "Enviar e-mail". Horário de atendimento em `caption` ("Seg a sex, 9h às 18h" **[HIPÓTESE; vem de configuração]**). **Perguntas frequentes** em 4 grupos (Pedido, Pagamento, Troca, Conta), cada pergunta um acordeão (alvo ≥ 56). Fim: links "Termos de uso", "Política de privacidade" (versão vigente, WB-117) e "Privacidade e dados" (CC7).
- **Ajuda com este pedido (C2):** abre o WhatsApp com a mensagem pronta "Olá, preciso de ajuda com o pedido #4821." (o número vem de S7); sem WhatsApp instalado, abre o e-mail com o mesmo texto.
- **Estados.** Skeleton: 6 linhas. Vazio: busca sem resultado "Nada para 'frete'." / "Veja as perguntas ou fale com a gente." / "Falar com o Webag". Erro/Offline: EP-app; perguntas do cache; contato offline: "Sem conexão. Você pode escrever quando voltar." (WhatsApp abre mesmo assim se o app existir). Sucesso: n/a. Permissão: n/a (visitante usa).
- **A11y:** acordeão com `accessibilityState expanded`; botão de WhatsApp com rótulo "Falar com o Webag pelo WhatsApp". **testID:** `help.search`, `help.contact-whatsapp`, `help.contact-mail`, `help.group-<id>`, `help.faq-<id>`, `help.terms`, `help.policy`, `help.privacy`, `help.empty`. **Analytics:** `help_opened {origem}`.

## AJ2. Ajuda do lojista e diagnóstico dos alertas (web)

**Objetivo:** ter certeza de que **não vai perder pedido**. **Ação principal:** "Testar alertas agora". Menu Ajuda. Prefixo `lojista.ajuda.`
- **Layout:** celular em 1 coluna; desktop 2 colunas (diagnóstico à esquerda, ajuda à direita). **Diagnóstico dos alertas** (4 linhas, cada uma com ícone **e** texto de estado, nunca só cor): **Som** ("Ligado" ou "Desligado. Toque em Ligar som.") · **Avisos do navegador** ("Ligados" ou "Desligados" + "Ativar") · **Conexão** ("Sincronizado há 3 s") · **Tela acesa** ("A tela fica acesa nesta página" ou "Deixe a tela ligada para não perder pedidos", dica quando o navegador não suporta **[HIPÓTESE]**). Botão `lg` "Testar alertas agora" toca o som e mostra o modal de teste de P1 (com a frase "Este é um teste").
- **Ajuda:** perguntas frequentes da loja (Pedidos, Produtos, Trocas, Dinheiro, Equipe) em acordeão com busca; cartão de contato "Falar com o Webag" (WhatsApp) e "Enviar e-mail"; links "Termos do lojista" e "Política de privacidade".
- **Estados.** Skeleton: 4 linhas + perguntas. Vazio: busca sem resultado como AJ1. Erro/Offline: diagnóstico mostra "Sem conexão" em erro persistente (Banner); perguntas do cache. Sucesso: toast "Teste enviado. Você ouviu o som?" com "Sim" e "Não, ajudar" (o "Não" abre os passos de correção). Permissão: todos veem (funcionário também; o teste de som é essencial).
- **testID:** `diagnostic-sound`, `diagnostic-push`, `diagnostic-push-enable`, `diagnostic-connection`, `diagnostic-wakelock`, `test-alerts`, `test-heard-yes`, `test-heard-no`, `search`, `faq-<id>`, `contact-whatsapp`, `contact-mail`.

## AJ3. Conteúdo da ajuda (admin, WB-034 C1)

**Objetivo:** atualizar perguntas e contatos sem deploy. **Ação principal:** "Salvar". Menu Marketing > Ajuda. Perfis: operação e super admin. Prefixo `admin.ajuda.`
- **Layout:** Tabs "Perguntas do cliente", "Perguntas do lojista", "Contatos". **Perguntas:** lista por grupo com ReorderList (alça + Subir/Descer), Switch "Publicada"; "Nova pergunta" abre drawer: Grupo · Pergunta (até 100) · Resposta (RichTextLite, até 600) · Publicada. **Contatos:** WhatsApp do suporte (máscara), e-mail do suporte, horário de atendimento (texto até 60), e-mail do encarregado (visível em CC7).
- **Mensagens:** "Escreva a pergunta." · "Escreva a resposta." · "Confira o WhatsApp com DDD." · "Confira o e-mail."
- **Estados.** Skeleton: lista. Vazio: `Question` "Nenhuma pergunta ainda" / "Sem perguntas, a Ajuda mostra só o contato." / "Nova pergunta". Erro/Offline: EP-web. Sucesso: toast "Pergunta salva." / "Contatos salvos." Permissão: operação e super; os demais sem menu.
- **testID:** `tab-customer`, `tab-merchant`, `tab-contacts`, `faq-new`, `faq-<id>`, `faq-<id>-up`, `faq-<id>-down`, `faq-<id>-switch`, `faq-group-select`, `faq-question-input`, `faq-answer-input`, `whatsapp-input`, `mail-input`, `hours-input`, `dpo-mail-input`, `submit`.

---

# Parte C. Denúncia (exigência das lojas de apps)

## DN1. Denunciar avaliação, produto ou loja (WB-038; 6A)

**Objetivo:** avisar o Webag de algo impróprio em 3 toques. **Ação principal:** "Enviar denúncia". Entradas: menu `DotsThree` > "Denunciar" em cada avaliação (D10), no produto (D9) e na loja (D8); no painel do lojista, em cada avaliação (V2).
- **Layout (folha no app; Dialog na web):** título "Denunciar avaliação" (ou "produto", "loja") · **Motivo** em rádios (alvo 56): "Ofensivo", "Falso", "Produto proibido" (só para produto e loja), "Golpe", "Outro" · campo "Quer explicar? (opcional)" até 200 com contador · botão `lg` "Enviar denúncia". O botão fica ativo; sem motivo, ao tocar: "Escolha um motivo."
- **Visitante (C4):** a folha abre o S2 e volta com os dados preservados.
- **Sucesso (C2, C3):** toast e tela curta "Recebemos. Vamos analisar." (a mesma frase para denúncia repetida, sem dizer que já existia). Na avaliação denunciada por mim, o menu passa a mostrar "Denunciada" (inerte, com ícone e texto).
- **Estados.** Skeleton: n/a. Vazio: n/a. Erro/Offline: EP-app; "Conecte-se para enviar a denúncia. O que você escreveu está aqui." Sucesso: acima. Permissão: visitante, acima; a loja não denuncia a si mesma (item não aparece).
- **A11y:** rádios agrupados; menu `DotsThree` com rótulo "Mais opções da avaliação de Maria S."; folha com foco no título. **testID:** `report.open-<id>`, `report.sheet`, `report.reason-<id>`, `report.text`, `report.submit`, `report.done`, `report.login`. **Analytics:** `report_submitted {alvo, motivo}`.

## DN2. Moderação de denúncias (admin, WB-124; 6A)

**Objetivo:** tratar cada denúncia em até 2 dias úteis sem punir opinião. **Ação principal:** "Manter" (a maioria é falso positivo; remover é deliberado). Menu Catálogo > Denúncias. Perfis: operação e super admin. Prefixo `admin.denuncias.`

| Breakpoint | Layout |
|---|---|
| Celular | Tabs "Avaliações (4)", "Produtos (2)", "Lojas (1)". Lista de linhas: trecho do item, motivo, "2 denúncias", **idade** ("há 2 dias" em alerta com `Warning` na mais antiga) |
| Desktop | Fila à esquerda (400) e caso à direita: **Item denunciado** (texto completo, nota, foto ou produto, autor abreviado, loja) · **Denúncias** (motivo, texto, quem denunciou abreviado, quando) · **Histórico** do item e do autor |

- **Avaliação:** **"Manter avaliação"** (primário; encerra e avisa o denunciante: "Analisamos e a avaliação segue publicada.") · **"Remover avaliação"** (secundário; ReasonDialog com motivos "Ofensa", "Dado pessoal", "Conteúdo ilegal", "Spam"; **não existe o motivo "avaliação negativa"**, RN-12; a nota deixa de contar e o autor é avisado). Texto fixo: "Não removemos avaliação só por ser negativa."
- **Produto e loja (C4):** botão "Encaminhar" abre a moderação de produto (A4) ou a loja (A3) já com o caso.
- **Prazo (C5):** meta de 2 dias úteis; o caso mais antigo no topo com selo "Atrasado" quando passar.
- **Estados.** Skeleton: 6 linhas. Vazio: `ShieldCheck` "Nenhuma denúncia para analisar" / "Denúncias de avaliações, produtos e lojas aparecem aqui." / "Ver todas as avaliações". Erro/Offline: EP-web. Sucesso: toast "Denúncia encerrada. O denunciante foi avisado." / "Avaliação removida. O autor foi avisado." e abre a próxima. Permissão: só operação e super.
- **testID:** `tab-reviews`, `tab-products`, `tab-stores`, `row-<id>`, `case`, `reports-list`, `keep`, `remove`, `remove-reason-<id>`, `remove-confirm`, `forward`, `overdue-badge`.

---

# Parte D. Admin: marketing

> Menu Marketing: super admin e operação. Financeiro e suporte não veem. Cupons da plataforma: F5 (`onda-5-posvenda.md`); Termos: AD5. Toda publicação e envio vai à auditoria.

## MK1. Banners e destaques (WB-115)

**Objetivo:** promover sem deploy, sem banner quebrado. **Ação principal:** "Novo banner". Prefixo `admin.banners.`

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Tabs "Banners" e "Destaques". Lista de linhas: miniatura 2:1, título, status, "Francisco Morato, Caieiras", "1.240 impressões · 86 cliques" |
| Desktop | DataTable: Banner (miniatura), Destino, Cidades, Período, Status, Impressões, Cliques, Ativo (Switch), menu. Ordem de exibição por **ReorderList** (alça + Subir/Descer), dentro de "No ar" |

**Status (ícone + texto):** Rascunho · Agendado (início futuro) · No ar · Encerrado · **Destino indisponível** (alerta: o destino foi inativado; o banner sai do app sozinho, C2).
**Formulário (tela cheia no celular; 2 colunas no desktop com prévia):** **Imagem** (FileUpload + ImageCropper com **moldura fixa 2:1**, até 5 MB, saída ≤ 300 KB; a proporção é a do app, `onda-3` D5) · Título opcional (até 40, contador) · **Destino** (rádio "Loja", "Categoria", "Produto", "Cupom" + seletor com busca; só lista itens ativos) · **Cidades** (chips multiselect; "Todas") · **Começa em** e **Termina em** (data e hora) · Switch "Ativo". **Prévia** "Como aparece no app": carrossel de celular com o banner.
**Mensagens:** "Escolha uma imagem." · "Escolha onde o banner leva." · "Esse destino está inativo. Escolha outro." (C2, não publica) · "O fim precisa ser depois do início." · "Esse arquivo tem 8 MB. O máximo é 5 MB."
**Destaques (C4):** lista de itens fixados na Início por cidade e período: "Adicionar destaque": tipo (Loja ou Produto), item (busca), cidade, período; texto "Aparecem antes dos critérios automáticos." Mesmas regras de destino ativo.
**Publicar e despublicar sozinho (C3):** texto "Vai ao ar em 20 nov, 09:00 e sai em 27 nov, 23:59." Ao salvar: Dialog "Publicar o banner?" / "Ele aparece para quem está em Francisco Morato." / "Publicar banner" · "Cancelar" (só quando o status final é "No ar" agora).
**Impressões e cliques (C5):** colunas com contagem; "Taxa de cliques" em texto ("6,9%"); sem gráfico na 1.0.
**Estados.** Skeleton: 5 linhas. Vazio: `Image` "Nenhum banner" / "Banners aparecem no topo da Início do app." / "Novo banner". Sem banner ativo: o app oculta o bloco (aviso na lista: "Nenhum banner no ar agora."). Erro/Offline: EP-web; upload preserva o formulário. Sucesso: toast "Banner publicado." / "Banner agendado." / "Banner pausado." Permissão: acima.
**A11y:** a prévia tem texto alternativo do título; carrossel de prévia com botões "Anterior" e "Próximo". **testID:** `new-banner`, `tab-banners`, `tab-highlights`, `row-<id>`, `row-<id>-switch`, `row-<id>-up`, `row-<id>-down`, `image-upload`, `crop-accept`, `title-input`, `dest-store`, `dest-category`, `dest-product`, `dest-coupon`, `dest-search`, `cities`, `start-input`, `end-input`, `preview`, `submit`, `publish-confirm`, `highlight-add`, `highlight-search`.

## MK2. Push segmentado (WB-197, 196; Should)

**Objetivo:** ativar clientes sem incomodar e sem expor ninguém. **Ação principal:** "Enviar push". Prefixo `admin.push.`

| Breakpoint | Layout |
|---|---|
| Celular e tablet | Tabs "Nova campanha" e "Enviadas". Formulário em 1 coluna; rodapé fixo com a estimativa e o botão |
| Desktop | Formulário à esquerda (560); à direita, cartão fixo **"Quem recebe"** (estimativa) e **prévia** da notificação |

**Formulário:** **Segmento** (rádio: "Cidade", "Bairro", "Sem comprar há N dias", "Comprou na categoria X", "Novos clientes", "Lista de espera de [bairro]" + o seletor do que escolheu) · **Título** (até 60, contador) · **Corpo** (até 120, contador) · **Destino** (a tela que abre: Início, loja, categoria, cupom) · **Quando** ("Agora" ou "Agendar"; fora das 9h às 20h: aviso "Será enviado amanhã às 9:00.").
**Cartão "Quem recebe" (C2):** número grande "412 pessoas" com a legenda "só quem aceitou receber ofertas" e a linha "38 ficam de fora: já receberam 2 avisos esta semana." Abaixo de 20: o número vira "Poucas pessoas (12)", o botão fica **inerte com o motivo no rótulo**: "Mínimo de 20 pessoas" e o texto "Segmentos pequenos podem identificar alguém. Escolha um maior." **[HIPÓTESE, mínimo de 20]**.
**Prévia:** mock de notificação do celular com o título e o corpo, na proporção real; alternador "Android | iPhone".
**Enviar (C5):** Dialog "Enviar para 412 pessoas?" / "Não dá para desfazer depois do envio. Ele respeita a janela das 9h às 20h e o limite de 2 avisos por semana." / "Enviar push" (primário) · "Cancelar". Sucesso: toast "Push enviado para 412 pessoas." e leva à aba "Enviadas".
**Enviadas (C4):** lista (título, segmento, data, **enviados, entregues, abertos, descadastros**; taxa em texto). **Flag desligada (WB-120):** Banner de alerta "O push de marketing está desligado. Nada será enviado." e o botão inerte com o motivo "Push desligado" (link "Ligar em Feature flags" só para super admin).
**Estados.** Skeleton: formulário e cartão. Vazio: Enviadas: `PaperPlaneTilt` "Nenhuma campanha ainda" / "Quando você enviar, os resultados aparecem aqui." / "Nova campanha". Erro: EP-web; estimativa que falha: "Não conseguimos calcular. Tentar de novo." (o envio não libera sem estimativa). Offline: "Conecte-se para enviar. Seu texto está guardado." Sucesso: acima. Permissão: financeiro e suporte não veem (C6).
**A11y:** estimativa em região viva educada ("412 pessoas receberiam"); contadores de caracteres lidos ao passar do limite. **testID:** `tab-new`, `tab-sent`, `segment-<id>`, `segment-value`, `title-input`, `body-input`, `destination`, `schedule-now`, `schedule-later`, `estimate`, `excluded-note`, `preview`, `preview-os-toggle`, `submit`, `send-confirm`, `flag-off-banner`, `sent-row-<id>`.

---

# Parte E. Admin: relatórios e operação

## RL1. Relatórios (WB-122; WB-114 exportáveis)

**Objetivo:** decidir com números que batem com a lista. **Ação principal:** "Exportar CSV". Menu Relatórios (super, operação e financeiro). Prefixo `admin.relatorios.`

| Breakpoint | Layout |
|---|---|
| Celular | Filtros em folha ("Período", "Cidade", "Loja", "Categoria"); KPIs em 2 colunas; seções empilhadas |
| Desktop | Barra de filtros fixa; KPIs até 4 por linha; gráfico e tabelas abaixo |

**Tabs:** **"Operação"** (super, operação, financeiro) e **"Financeiro"** (super e financeiro; WB-114, Should). **Operação:** KPIs **Pedidos** · **GMV** · **GMV concluído** · **Ticket médio** · **Novas lojas** · **Novos clientes** · **Recompra em 30 dias** (cada um com a **definição em 1 linha** ao tocar em `Info`, de RN-15, e a variação "+12% vs. período anterior" com ícone) · gráfico "Pedidos por dia" (1 ou 2 séries, `brand.600` + neutro, tabela alternativa) · tabela **"Cancelamentos por quem e por motivo"** (cliente, loja, sistema, admin × motivo). **Financeiro:** seletor do relatório (Vendas, Comissões, Taxa de serviço, Estornos, Cupons da plataforma, Repasses, Receita Webag), período e filtros, prévia das 10 primeiras linhas e **Totais** (a soma das linhas, que confere com o CSV, WB-114 C2).
**Confere com a lista (C4):** abaixo de cada total, link "Ver os 1.240 pedidos deste filtro" que abre M1 com os mesmos filtros.
**Exportar (C2):** botão `md` "Exportar CSV" com o filtro atual; auditado. Estados do botão: "Preparando…"; abaixo de 10 mil linhas baixa na hora ("Arquivo pronto."); acima: "A exportação é grande. Enviaremos o link por e-mail." (WB-114 C3).
**Estados.** Skeleton: KPIs e gráfico. Vazio: "Sem dados neste período" (C3) / "Tente outro período ou tire um filtro." / "Limpar filtros". Erro: EP-web, por bloco. Offline: números do cache com "Atualizado às 10:42"; exportar: "Conecte-se para exportar." Sucesso: toasts acima. Permissão: operação não vê a aba Financeiro; suporte não vê o menu.
**A11y:** gráfico com resumo em texto e tabela; KPI "GMV, 48.200 reais, mais 12% que o período anterior". **testID:** `tab-operation`, `tab-financial`, `filter-period`, `filter-city`, `filter-store`, `filter-category`, `kpi-orders`, `kpi-gmv`, `kpi-gmv-done`, `kpi-ticket`, `kpi-new-stores`, `kpi-new-customers`, `kpi-repurchase`, `kpi-<id>-info`, `chart`, `cancellations-table`, `see-orders-link`, `report-select`, `report-preview`, `report-totals`, `export`, `export-large-notice`.

## RL2. Painel inicial do admin (WB-125, Should)

**Objetivo:** priorizar o dia ao entrar. **Ação principal:** o primeiro cartão de "Precisa de ação". Antes dele existir, o login cai no 1º item do menu do perfil (AC1). Prefixo `admin.inicio.`
- **Layout:** celular 1 coluna; desktop: faixa "Precisa de ação" no topo e cartões em grade de 3 a 4 colunas. **Cartões (cada um leva à lista já filtrada, C2):** Pedidos de hoje · GMV de hoje · **Lojas na fila** (A1; selo de atraso) · **Trocas e disputas em mediação** (M3; "2 atrasadas") · **Divergências de conciliação** (F4) · **Lojas suspensas** · **Lojas em risco** (A3 C5). **"Precisa de ação" (alertas, OP2):** lista dos 5 alertas mais recentes não lidos com ícone, texto e "Ver".
- **Por perfil (C3):** operação vê lojas, mediação, denúncias; financeiro vê conciliação, repasses, estornos; suporte vê trocas e pedidos; super vê tudo. O cartão que o perfil não pode abrir **não aparece**.
- **Estados.** Skeleton: cartões. Vazio: "Precisa de ação" sem itens: Banner de sucesso "Tudo em dia." Erro: EP-web, por cartão ("Não carregou. Tentar de novo."). Offline: cache com "Atualizado às 10:42". Sucesso: n/a. Permissão: acima.
- **testID:** `needs-action`, `alert-<id>`, `card-orders-today`, `card-gmv-today`, `card-queue`, `card-mediation`, `card-reconciliation`, `card-suspended`, `card-risk`, `all-clear`.

## OP1. Modo manutenção (WB-121, Should)

**Objetivo:** atualizar com segurança sem perder pagamento. **Ação principal:** "Ligar manutenção". Menu Configurações > Manutenção. Só super admin. Prefixo `admin.manutencao.`
- **Layout:** cartão de estado (**"Desligada"** em neutro ou **"Ligada desde 02:00"** em alerta, com ícone `Wrench`). **Formulário:** Mensagem (até 140, padrão "Voltamos em alguns minutos.") · Previsão de volta (data e hora, opcional) · Agendar (início e fim opcionais; "Liga e desliga sozinha") · **prévia** da tela que o cliente vê (G1, "Estamos em manutenção"). Botão "Ligar manutenção agora".
- **Ligar:** ReasonDialog "Ligar o modo manutenção?" / "App e painéis de cliente e lojista mostram 'Voltamos já'. O admin continua acessível. Pagamentos que chegarem são processados normalmente." / "Ligar manutenção" (destrutivo) · "Cancelar". **Ligada:** Banner persistente em **todas as páginas do admin**: "Modo manutenção ligado desde 02:00." + "Desligar" (alerta, nunca some). Desligar: Dialog simples; tudo volta sem ação do usuário (C3).
- **Estados.** Skeleton: cartão. Vazio: n/a. Erro/Offline: EP-web. Sucesso: toasts "Manutenção ligada." / "Manutenção desligada." Permissão: só super admin.
- **testID:** `status`, `message-input`, `eta-input`, `schedule-start`, `schedule-end`, `preview`, `turn-on`, `turn-on-confirm`, `turn-off`, `global-banner`.

## OP2. Alertas ao admin (WB-198, Should)

**Objetivo:** não depender de olhar o painel. **Ação principal:** abrir um alerta. Sino no cabeçalho (contador) > Alertas. Prefixo `admin.alertas.`
- **Layout:** lista (celular: linhas; desktop: tabela) com ícone, **tipo em texto**, resumo, "há 2 h", "Ver" (leva ao item: fila de lojas, caso de mediação, divergência, loja em risco). Tipos: Nova loja na fila · Loja esperando mais que o prazo · Nova disputa ou mediação · Divergência de conciliação aberta · Falha em webhook · Falha em tarefa automática · Loja em risco · Pedido de titular perto do prazo (aos 10 dias, WB-217 C2). Alertas repetidos agrupam em 1 por hora por tipo (C2): "3 novas lojas na fila".
- **Preferências (aba "Preferências"):** por tipo, 2 Switches "No painel" e "Por e-mail"; os **críticos de dinheiro** (conciliação, webhook, estorno pendente) mostram "Sempre ligado" com `Lock` e texto "Não dá para desligar" (C3). Cada perfil vê só os tipos do seu perfil.
- **Estados.** Skeleton: 6 linhas. Vazio: `Bell` "Nenhum alerta" / "Quando algo precisar de ação, aparece aqui." / n/a. Erro/Offline: EP-web. Sucesso: "Preferências salvas." / "Marcar todos como lidos". Permissão: tipos por perfil.
- **testID:** `bell`, `row-<id>`, `row-<id>-open`, `mark-all`, `tab-prefs`, `pref-<tipo>-panel`, `pref-<tipo>-mail`, `pref-<tipo>-locked`.

## OP3. Pedidos de titulares, LGPD (WB-217 C2 a C4)

**Objetivo:** responder a tempo (15 dias) e deixar registro. **Ação principal:** "Registrar resposta". Menu Configurações > Pedidos de titulares. **Só super admin.** Prefixo `admin.titulares.`
- **Layout:** lista (celular: linhas; desktop: DataTable): Protocolo, Tipo, Aberto em, **Prazo** ("Vence em 5 dias"; **"Vence hoje"** em alerta; "Atrasado" em erro, com ícone e texto), Status (Nova, Em andamento, Respondida). Ordem: prazo mais curto. Chips: Todas · Novas · Atrasadas.
- **Detalhe:** quem pediu (nome e e-mail mascarados com "Revelar", TOTP), tipo, mensagem, canal (formulário CC7, e-mail ou web), prazo. **Registrar manualmente** (C2): "Novo pedido" para quem escreveu por e-mail (tipo, data de recebimento, texto). **Resposta:** campo (até 1000), "Marcar como em andamento", **"Registrar resposta e enviar e-mail"** (Dialog "Enviar a resposta?" / "O titular recebe por e-mail e o pedido fecha." / "Enviar resposta"). O histórico guarda o que foi respondido (C3).
- **Estados.** Skeleton: 5 linhas. Vazio: `ShieldCheck` "Nenhum pedido de titular" / "Pedidos feitos em Privacidade e dados aparecem aqui." / n/a. Erro/Offline: EP-web. Sucesso: toast "Resposta enviada. Pedido encerrado." Permissão: só super admin; os demais sem menu.
- **testID:** `row-<id>`, `deadline-<id>`, `chip-<id>`, `new-request`, `detail`, `reveal`, `answer-input`, `in-progress`, `send-answer`, `send-confirm`, `history`.

---

# Parte F. Lojista: equipe

> Lista, convite e aceite: L9 e L10 (`onda-2`). Aqui o que faltava: editar, ver o que o funcionário vê, registrar atividade e o que acontece com quem perde o acesso.

## EQ1. Permissões, atividade e acesso da equipe (WB-075 C2, C3, C5; WB-219 C2)

**Objetivo:** controlar quem faz o quê, sem dar acesso ao dinheiro. **Ação principal:** "Salvar permissões". **Só o dono.** Equipe > pessoa. Prefixo `lojista.equipe.`

| Breakpoint | Layout |
|---|---|
| Celular | Página da pessoa com Tabs "Permissões" e "Atividade" |
| Desktop | 2 colunas: permissões à esquerda (480), **"O que Joana vê"** à direita |

- **Permissões (C5):** grupo de caixas "Permissões de Joana": Pedidos · Catálogo e estoque · Trocas · Cupons · Avaliações, cada uma com **1 frase do que libera** ("Pedidos: vê e atende os pedidos e os dados do cliente do pedido ativo."). Linha fixa e não editável: "Nunca vê: financeiro, conta de recebimento, equipe e configurações da loja." (C2) com `Lock`. Botão `lg` "Salvar permissões". **Vale na próxima requisição:** a tela diz "Joana vê a mudança na hora."
- **"O que Joana vê":** menu em miniatura só com os itens que as permissões liberam (e os dados do cliente apenas com "Pedidos", RN-14), para o dono conferir antes de salvar.
- **Atividade (C5, só dono):** lista "Quem fez o quê" com hora: "Joana marcou o pedido #1042 como entregue · 14:32", "Joana pausou o produto Camiseta Básica", "Marcos alterou as permissões de Joana". Filtro por pessoa e período; somente leitura; sem dados do cliente além do número do pedido.
- **Remover:** Dialog de L9 ("Remover Joana?" + senha do dono). **Do lado do funcionário:** em até 5 s a sessão cai e ele vê, no painel, EA "Seu acesso foi removido" / "Fale com o dono da loja se isso for um engano." / sem botão de entrar na loja; o alerta de pedidos para de tocar e a conexão é derrubada (WB-219 C2). **Permissão alterada com o painel aberto:** Banner info "Suas permissões mudaram. Atualizamos o painel." e o menu se ajusta sem sair.
- **Estados.** Skeleton: caixas e lista. Vazio: Atividade: `ClockCounterClockwise` "Sem atividade ainda" / "As ações da equipe aparecem aqui." / n/a. Erro: EP-web; "Não foi possível salvar. As permissões anteriores continuam valendo." Offline: "Conecte-se para alterar a equipe." Sucesso: toast "Permissões de Joana salvas." Permissão: só dono; funcionário: Sem acesso.
- **A11y:** caixas em `fieldset` "Permissões de Joana"; a miniatura é `aria-hidden` e o texto "Joana vê: Pedidos e Trocas" é a alternativa. **testID:** `member-tab-permissions`, `member-tab-activity`, `perm-orders`, `perm-catalog`, `perm-exchanges`, `perm-coupons`, `perm-reviews`, `never-sees`, `preview-menu`, `submit`, `activity-list`, `activity-filter-person`, `activity-filter-period`, `access-removed`, `permissions-changed-banner`.

---

## Z. Hipóteses, divergências e perguntas

| # | Item | Para quem | Proposta |
|---|---|---|---|
| Z-1 | PRD de banners (WB-115 C1) pede imagem **16:9**; o app exibe **2:1** (`onda-3` D5, design system). Desenhei o corte fixo em 2:1 | PO | Corrigir o critério: o cropper impede subir proporção errada |
| Z-2 | WB-214 C6 (excluir pela web com senha, sem código) segue pendente do Security (SEC-002 prevê código) | Security | Desenhado com a alternativa "Excluir com a senha" e resposta idêntica; ajustar se o parecer mudar |
| Z-3 | Horário e contatos do suporte (WhatsApp, e-mail, horário) e e-mail do encarregado precisam de configuração no admin (AJ3); RN-02 não lista | PO, backend-dev | Tabela de configuração de conteúdo, sem deploy |
| Z-4 | Mínimo de 20 pessoas para o push segmentado (WB-197 C2) é `[HIPÓTESE]` | PO | Parâmetro `push_mkt_min_segmento` no admin |
| Z-5 | Diagnóstico de alertas (AJ2) e "tela acesa" dependem de suporte do navegador (Wake Lock) `[HIPÓTESE]` | tech-lead | Se não houver suporte, só a dica de texto |
| Z-6 | Pedidos de titular (CC7, OP3) precisam de uma entidade e de uma rota pública para o formulário | backend-dev | Criar; WB-217 C2 já pede o registro |
| Z-7 | Tela de consentimento da lista de espera (CC6 grupo 3) assume que a lista tem um item por bairro e por pessoa | PO | Confirmar o modelo de WB-004 |
| Z-8 | Texto de "O que acontece" ao excluir (CC4 e CC5) e prazos de retenção seguem minuta do PO | Fundador, jurídico | Revisar antes do G5 |
