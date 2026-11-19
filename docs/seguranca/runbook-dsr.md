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
4. Conta **bloqueada** pelo admin não exclui pelo app: tratar aqui, com a mesma conferência.
5. Pedido sem conta com o e-mail: responder que não há conta; não confirmar nem negar outros dados.

## Por tipo

| Tipo | O que fazer | Resposta (sem dados) |
|---|---|---|
| Acesso / portabilidade | Orientar a exportação no app (Conta > Privacidade e dados > Exportar). Sem acesso ao app: "Esqueci a senha" (confirma o e-mail) e depois exportar | "Peça seus dados no app em Conta > Privacidade e dados > Exportar. Quando o arquivo ficar pronto, o link de download é de uso único." |
| Correção | Nome e celular: o próprio app (CC2, quando existir) ou correção pelo suporte após a conferência | "Corrigimos ..." ou o caminho no app |
| Exclusão | Com acesso ao app: orientar o caminho no app. **Sem o app:** hoje o sistema **não tem** como executar (SEC-166, aberto). Até a correção, não usar SQL manual em produção: registrar o pedido, informar o prazo e escalar ao CEO | "Recebemos seu pedido de exclusão (protocolo ...). Vamos concluir até <data>." |
| Oposição / revogação | Consentimentos: o titular muda no app (Conta > Privacidade e dados > Notificações). Antifraude (legítimo interesse): avaliar com o jurídico | Orientação |

## Depois de responder

- Marcar "respondido" no painel (o titular recebe o aviso uma vez).
- Pedido de exclusão concluído: conferir em 15 dias que a anonimização rodou (o painel alerta falha e atraso, SEC-160).
- Restauração de backup reabre contas já excluídas até o SEC-161 ser corrigido: depois de qualquer restauração, avisar o security-engineer.
