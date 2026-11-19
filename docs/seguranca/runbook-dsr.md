# Roteiro do encarregado: pedidos de titulares (DSR)

- **Dono:** security-engineer (conteúdo); **quem executa:** o encarregado (super admin com `privacy:manage`). Fecha o SEC-163 (a) e (b) quando o fundador adotar. Base: LGPD art. 18 e 19; `docs/produto/prd/lgpd.md` WB-217. Prazo: 15 dias da abertura (o painel alerta aos 10).
- Os pedidos chegam pela fila do admin (formulário público `/excluir-conta` e `/suporte`, app ou registro manual de e-mail).

## Regras que valem para todo pedido

1. **Nunca mande dado pessoal por e-mail.** A resposta orienta e informa o protocolo; os dados saem só pelo autosserviço (exportação no app, link de uso único).
2. **Identidade antes de agir.** Quem escreveu o formulário só provou que digitou um e-mail. Conferir sempre por um destes, nesta ordem:
   - a pessoa entra na conta (app ou senha) e faz pelo autosserviço; ou
   - a pessoa responde, **a partir do e-mail cadastrado e confirmado**, a uma mensagem enviada **por você** para esse e-mail com o protocolo (nunca responder ao endereço que veio no formulário sem conferir que é o cadastrado).
   Registrar no histórico do pedido: "identidade conferida: <meio>, <data>". Sem conferência, não executar nada; responder só com orientação.
3. **"Revelar"** o e-mail e a mensagem só quando necessário, com motivo (fica auditado).
4. Conta **bloqueada** pelo admin (B4) não consegue excluir pelo app nem pela página `/excluir-conta`: a via A não envia código e a via B responde "credenciais inválidas" mesmo com a senha certa (SEC-182, aberto). Até a correção:
   - Confira a identidade (regra 2) e registre o pedido com o prazo de 15 dias. Leia o motivo do bloqueio em Usuários > histórico.
   - **Bloqueio por fraude ou abuso:** **não** desbloqueie, porque isso devolve o acesso. Escale ao CEO e ao backend-dev para executar o SEC-182 dentro do prazo. A anonimização mantém pedidos e o histórico de bloqueio (retenção legal e antifraude).
   - **Bloqueio sem fraude** (por exemplo, por engano): desbloqueie com o motivo "pedido de exclusão LGPD, protocolo ..." e oriente a exclusão pela página. Confira no dia seguinte que a conta ficou `deleted`. Se o titular desistir no período de arrependimento, a conta volta **ativa**: bloqueie de novo se for o caso.
5. Pedido sem conta com o e-mail: responder que não há conta; não confirmar nem negar outros dados.
6. **Reabrir uma exclusão pendente a pedido do dono (SEC-180):** o dono não consegue desistir pelo app nem pela página (conta com e-mail **não confirmado** sob ataque, ou o dono perdeu o e-mail). Só dentro do período de arrependimento (`exclusao_arrependimento_horas`; depois a anonimização é irreversível). Conferir a identidade pela regra 2 (resposta **do e-mail cadastrado** a uma mensagem sua com o protocolo; para conta não confirmada, documento e selfie por canal seguro, a critério do encarregado) e executar, no servidor, como super admin:
   `node dist/cli.js privacy:cancel-deletion --email <e> --reason "<motivo, >= 20 caracteres>" --identity-proof "<como a identidade foi conferida e o protocolo, >= 10 caracteres>" [--dry-run]`
   O comando pede o e-mail de novo para confirmar, reabre a conta (e a loja, se foi encerrada com ela), zera os contadores de ataque da conta, avisa o dono por e-mail e grava na auditoria (`account.deletion_cancelled_by_operator`, ator `cli`, operador do SO e a prova de identidade). Registrar no histórico do pedido: "exclusão reaberta pela operação".
7. **Alerta `account_deletion_under_attack`** (painel de pagamentos/alertas): uma conta em período de exclusão recebeu tentativas demais de desistir (e-mail ou conta passaram do limite). Pode ser o dono esquecendo a senha ou um ataque para tornar a exclusão irreversível. Ação: ver quanto falta para a anonimização; se o dono pedir, executar o passo 6; se for ataque, avisar o security-engineer (SEC-154, SEC-180).

## Por tipo

| Tipo | O que fazer | Resposta (sem dados) |
|---|---|---|
| Acesso / portabilidade | Orientar a exportação no app (Conta > Privacidade e dados > Exportar). Sem acesso ao app: "Esqueci a senha" (confirma o e-mail) e depois exportar | "Peça seus dados no app em Conta > Privacidade e dados > Exportar. Quando o arquivo ficar pronto, o link de download é de uso único." |
| Correção | Nome e celular: o próprio app (CC2, quando existir) ou correção pelo suporte após a conferência | "Corrigimos ..." ou o caminho no app |
| Exclusão | Com acesso ao app: orientar o caminho no app. **Sem o app:** orientar a página `https://<domínio>/excluir-conta` (e-mail + código ou e-mail + senha; SEC-166 fechado). **Conta bloqueada:** regra 4. Nunca usar SQL manual em produção | "Recebemos seu pedido de exclusão (protocolo ...). Vamos concluir até <data>." |
| Oposição / revogação | Consentimentos: o titular muda no app (Conta > Privacidade e dados > Notificações). Antifraude (legítimo interesse): avaliar com o jurídico | Orientação |

## Depois de responder

- Marcar "respondido" no painel (o titular recebe o aviso uma vez).
- Pedido de exclusão concluído: conferir em 15 dias que a anonimização rodou (o painel alerta falha e atraso, SEC-160).
- Restauração de backup reabre contas já excluídas até o SEC-161 ser corrigido: depois de qualquer restauração, avisar o security-engineer.
