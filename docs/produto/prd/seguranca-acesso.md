# PRD: Segurança de acesso e risco de loja (histórias transversais)

Status: pronto para G3 (aguarda estimativa, specs e threat model já feito em `docs/seguranca/threat-model-auth-pagamento.md`) | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-219 a WB-226 e WB-228
Origem: parecer `docs/seguranca/revisao-adrs.md` (SEC-101, 102, 103, 106, 105) e requisitos `docs/seguranca/requisitos-seguranca.md` (SEC-004, 008, 015, 016, 017, 060, 062, 067, 082); decisões DEC-014 a DEC-018 em `docs/decisoes.md`. Os critérios abaixo dizem **o que** o usuário vê; o **como** (Argon2, HMAC, Redis, cookies) é do `backend-dev` e do `tech-lead`.

## Problema
- Quem sofre: lojista que perde pedido com a conta travada por terceiros; cliente deslogado no meio do PIX em 3G; Webag, exposta a lojista que recebe e não entrega, sem poder reter dinheiro no split (DEC-016); admin como alvo de maior valor.
- Evidência: parecer do Security (design, sem código ainda). Frequência de uso real: `[HIPÓTESE]`, validar no piloto.

## Objetivo e métrica de sucesso
| Objetivo | Métrica (piloto) |
|---|---|
| Ninguém consegue travar a conta de outra pessoa | 0 contas de lojista inacessíveis por tentativas de terceiros |
| Logout involuntário raro | < 1% das sessões com 401 de refresh sem logout do usuário |
| Prejuízo por loja nova limitado | Exposição máxima por pedido de loja nova = `loja_nova_pedido_max_cents`; "não recebi" de lojas novas < 5% |
| 1ª compra rápida preservada | Compra <= 2 min com e-mail não confirmado (HIP-D07) |

**Eventos:** `login_delay_applied`, `login_stepup_required`, `session_revoked {reason}`, `token_refresh_replayed`, `email_verification_required`, `email_corrected`, `admin_totp_enrolled`, `admin_totp_failed`, `new_store_limit_hit`, `store_risk_alert {type}`, `delivery_code_failed`.

## Fora do escopo
Login social (WB-010); biometria; captcha de terceiro pago (se necessário, decisão do fundador por custo e LGPD); antivírus de PDF (fase 2); 2FA obrigatório para lojista (opcional, WB-079).

## Usuários e cenários
Seu Marcos (lojista) entra no painel de qualquer lugar mesmo sob ataque; Joana (funcionária) é removida e perde o acesso na hora; cliente com 3G ruim segue logado; Yago/financeiro (admin) estorna com TOTP.

## Regras de negócio
RN-02 (parâmetros `login_*`, `email_nao_confirmado_pedidos_max`, `loja_nova_*`, `reauth_min`), RN-09/RN-10 (teto de cupom no split), HIP-023, HIP-D07, DEC-014 a DEC-018.

## Requisitos não funcionais
Mensagens de erro sem revelar se o e-mail existe; tempos de resposta iguais para e-mail existente/inexistente; todo evento de segurança auditado (WB-123); LGPD: IP e dispositivo usados só para segurança (base: legítimo interesse, registrado em `docs/seguranca/`).

## Histórias e critérios de aceite

### WB-219 Encerrar acesso na hora (logout, troca de senha, remoção) — Must — dep: WB-008, WB-075
Como usuário ou dono de loja, quero que sair, trocar a senha ou remover um funcionário corte o acesso imediatamente, para que ninguém siga vendo dados de clientes depois.
- **C1** Dado "Sair de todos os dispositivos" ou troca/redefinição de senha, quando confirmo, então toda sessão antiga recebe 401 na próxima requisição e as conexões em tempo real (status de pedido, painel da loja) caem em até 5 s.
- **C2** Dado funcionário removido pelo dono, ou admin desativado/bloqueado, então o mesmo vale para as sessões dele; ele sai da sala de pedidos da loja e não recebe mais eventos.
- **C3** Dado a sessão revogada, então o app/painel mostra "Sua sessão foi encerrada. Entre de novo" sem perder carrinho nem rascunhos.
- **C4** Dado o acesso antigo de uma sessão ainda dentro do prazo de validade, então ele é recusado (a revogação não espera o vencimento).
- **C5** Dado qualquer revogação, então grava auditoria (quem, motivo, hora).

### WB-220 Renovação de sessão tolerante a rede instável — Must — dep: WB-008
Como cliente com internet ruim, quero continuar logado quando a resposta de renovação se perde, para não ser deslogado no meio do pagamento.
- **C1** Dado a renovação enviada duas vezes em seguida (resposta perdida ou duas telas ao mesmo tempo), então as duas recebem a mesma sessão válida e nenhuma é deslogada (janela de 30 s).
- **C2** Dado o app, então dispara uma só renovação por vez (as demais esperam o resultado).
- **C3** Dado reuso de uma renovação antiga **fora** da janela de 30 s, então toda a família de sessões é revogada e o usuário vê "Entre de novo por segurança" (WB-219 C3).
- **C4** Dado o evento, então `token_refresh_replayed` é registrado com a classificação (dentro/fora da janela).

### WB-221 Proteção contra senha adivinhada sem travar o dono — Must — dep: WB-008, WB-100
Como dono de conta (cliente, lojista ou admin), quero que tentativas erradas de outras pessoas não me impeçam de entrar, para não perder pedidos nem acesso.
- **C1** Dado 5 senhas erradas contra a mesma conta vindas do mesmo dispositivo/IP, então a 6ª tentativa desse dispositivo/IP recebe "Muitas tentativas. Tente em 15 minutos ou redefina a senha" (429) e a conta **continua livre** para os demais.
- **C2** Dado outro dispositivo/IP com a senha certa durante a espera do primeiro, então entra normalmente.
- **C3** Dado mais de `login_stepup_falhas_h` (20) falhas na conta em 1 hora, vindas de qualquer origem, então o próximo login com a senha certa pede um código enviado ao e-mail (step-up); com o código certo, entra.
- **C4** Dado e-mail inexistente ou senha errada, então a mensagem e o tempo de resposta são iguais ("E-mail ou senha incorretos").
- **C5** Dado a espera ativa, então o app mostra o tempo restante e o atalho "Redefinir senha".
- **C6** Dado o mesmo limite, então vale para login de cliente, lojista e admin, e para a confirmação de senha em "Excluir conta" e "Exportar dados" (WB-213 C9).
- **C7** Dado conta de lojista sob ataque, então o dono recebe um e-mail "Tentativas de acesso na sua conta" (no máximo 1 por hora).

### WB-222 TOTP obrigatório para admin — Must — dep: WB-100
Como Webag, quero que todo admin use verificação em duas etapas, para que uma senha vazada não permita estornar dinheiro nem ver documentos.
- **C1** Dado admin recém-convidado (convite de 48 h, WB-101), então na criação da senha configura o app autenticador (QR/segredo) e confirma com um código antes de acessar qualquer tela.
- **C2** Dado a configuração, então vê 10 códigos de recuperação **uma única vez** (cada um vale uma vez).
- **C3** Dado login de admin sem TOTP configurado, então só abre a tela de configurar (nada além).
- **C4** Dado código TOTP errado, então 401 sem dizer qual passo falhou; falhas contam no limite de WB-221.
- **C5** Dado perda do aparelho, então um código de recuperação entra uma vez e força reconfigurar o TOTP; super admin pode redefinir o TOTP de outro admin (auditado; não o próprio).
- **C6** Dado estornar, revelar dado pessoal ou gerenciar admins, então pede TOTP novo se o último tiver mais de `reauth_min` (5) minutos (SEC-016).
- **C7** Dado o dono da loja, então ativar TOTP é opcional (WB-079); não é exigido na 1.0.

### WB-223 Painel admin em endereço próprio — Must — dep: WB-100
Como Webag, quero o admin em endereço separado do painel do lojista, para que um conteúdo malicioso de lojista não rode com a sessão do admin.
- **C1** Dado o painel admin, então abre só em endereço próprio (ex.: `admin.<domínio>`), com cookies que não são enviados ao painel do lojista nem ao contrário.
- **C2** Dado login de lojista no painel do lojista, então a sessão não vale no endereço do admin (403).
- **C3** Dado nome, descrição ou resposta de avaliação com código (ex.: `<script>`), então aparece como texto no admin, sem executar.
- **C4** Dado o admin, então as páginas têm política de segurança de conteúdo estrita (sem scripts embutidos).
- **Nota:** decisão técnica no ADR-001 ou ADR novo (tech-lead); é configuração de implantação, mesmo build `apps/web` (DEC-018).

### WB-224 Conta com e-mail não confirmado: 1 pedido, limites e correção — Must — dep: WB-006, WB-007, WB-023
Como novo cliente, quero comprar antes de confirmar o e-mail, mas com limites, para fechar o 1º pedido em até 2 min sem abrir porta para fraude.
- **C1** Dado conta não confirmada com 1 pedido pago, quando tento pagar o 2º, então vejo "Confirme seu e-mail para continuar" com o campo do código na própria tela e, confirmado, o pagamento segue (limite `email_nao_confirmado_pedidos_max` = 1; API 403 `email_verification_required`).
- **C2** Dado conta não confirmada, então ficam bloqueados: cupom da plataforma e de primeira compra, exportar dados, trocar e-mail, tornar-se lojista e aceitar convite de funcionário/admin; cada um mostra "Confirme seu e-mail" com atalho.
- **C3** Dado conta não confirmada, então **excluir conta continua permitido só com a senha** (WB-213; DEC-014/015).
- **C4** Dado e-mail digitado errado, quando toco "Corrigir e-mail" (com a senha), então o novo e-mail recebe o código, o código anterior deixa de valer e o e-mail antigo não recebe mais nada.
- **C5** Dado e-mail com domínio parecido com um comum (ex.: "gmial.com"), então vejo a sugestão antes de enviar (WB-006 C6).
- **C6** Dado e-mail enviado a endereço não confirmado, então traz só o código e texto genérico, sem nome, endereço, itens ou valores.
- **C7** Dado redefinição de senha concluída, então o e-mail passa a "confirmado" (WB-009 C2).
- **C8** Dado login social (se a flag ligar), então não se vincula a conta existente não confirmada (WB-010).
- **C9** Dado a flag `email_nao_confirmado_compra` desligada (HIP-D07 "Sim (flag)"; WB-120 C1), então volta a valer "confirmar antes de comprar" (156 s) sem mudança de código.
- **C10** O limite de C1 é aplicado **na criação do pedido**, por **contador atômico por conta** (pedidos pagos + pendentes <= `email_nao_confirmado_pedidos_max`); pedido pago e depois estornado **não conta**; com dois checkouts abertos ao mesmo tempo, só um cria o pedido e o outro recebe a mensagem de C1. Teste de concorrência obrigatório (R-11).
- **Evento:** `email_verification_required`, `email_corrected`; métrica: % de contas que confirmam em 24 h e fraude de 1ª compra `[HIPÓTESE]`.

### WB-225 Limite de exposição da loja nova e alertas de risco — Must — dep: WB-057, WB-067, WB-198
Como Webag, quero limitar o valor por pedido de lojas novas e ser avisada de comportamento de risco, para reduzir o prejuízo de um lojista que recebe e não entrega (DEC-016: no split não há como reter).
- **C1** Dado loja nova, definida como a que **ainda não cumpriu as duas condições**: `loja_nova_dias` = 30 dias desde a aprovação **e** `loja_nova_pedidos` = 20 pedidos ENTREGUE (deixa de ser nova só quando cumpre ambas; é a leitura mais conservadora de SEC-062) `[HIPÓTESE; valores no admin]`, quando o **total cobrado do cliente** (itens + frete + taxa de serviço - desconto; é o valor exposto) passa de `loja_nova_pedido_max_cents` (R$ 500,00), então recebe "Esta loja é nova e aceita pedidos de até R$ [valor do parâmetro] por enquanto" (422; a mensagem **lê o parâmetro**, não um texto fixo) e o carrinho é mantido (R-10).
- **C2** Dado o limite, então aparece no painel do lojista ("Loja nova: pedidos de até R$ 500,00 até [data/pedidos]") e o admin pode liberar a loja antes (com motivo, auditado) ou ajustar o limite por loja.
- **C3** Dado loja com "não recebi" > 5% ou cancelamento causado pela loja > 15% nos últimos 30 dias, com no mínimo 10 pedidos, então o admin recebe alerta "Loja em risco" (WB-198) e a loja entra na fila "Em risco" (WB-104 C5). **Sem suspensão automática**.
- **C4** Dado conta de recebimento trocada nos últimos 7 dias, então a loja também entra no alerta de risco (WB-053 C4).
- **C5** Dado loja que cumpriu as duas condições do C1 (>= 30 dias **e** >= 20 pedidos ENTREGUE), então o limite cai e vale só `pedido_max_cents` global (R$ 2.000,00).
- **C6** Dado que o piloto tem poucas lojas, então a métrica mostra quantos pedidos foram barrados pelo limite, para recalibrar (HIP).

### WB-226 Código de entrega do cliente — Should — dep: WB-069, WB-027, WB-190
Como cliente, quero informar um código ao receber o pedido, para que a loja não marque "entregue" sem entregar.
- **C1** Dado `codigo_entrega` ligada (flag em WB-120), pedido de entrega em SAIU_PARA_ENTREGA, então o cliente vê no app o código de 4 dígitos (mesmo padrão do código de retirada, HIP-040).
- **C2** Dado "Marcar entregue", então o lojista informa o código dito pelo cliente; código certo conclui; código errado: "Código incorreto" e, após 5 erros, só o admin conclui.
- **C3** Dado cliente sem o app à mão, então o lojista usa "Cliente sem código" com motivo e o pedido segue a regra de HIP-038 (conclusão automática após `auto_conclusao_entrega_h`), sinalizado no relatório de risco da loja (WB-225 C3).
- **C4** Dado pedido de retirada, então vale o código de retirada existente (WB-026).
- **Nota:** reduz o abuso "entregue falso" e dá prova nas disputas (WB-037); custo de UX para o cliente e para o lojista, por isso Should e com flag `[HIPÓTESE]`; validar no piloto.

### WB-228 Admin: meu perfil e segurança — Must — dep: WB-100, WB-222, WB-219
Como admin, quero cuidar do meu próprio acesso, para manter minha conta segura (tela AC6, `onda-1b-contas.md`; nova, sem história até DEC-024). O **como** do TOTP, dos códigos de recuperação e da recuperação do super admin é do Security (R-06/R-07, WB-222) e não é definido aqui.
- **C1** Dado o menu do usuário > "Meu perfil", então vejo nome, e-mail, perfil (selo) e data/hora do último acesso; não edito perfil nem e-mail (só super admin altera admins, WB-101).
- **C2** Dado "Alterar senha", então informo a atual, a nova e a confirmação (regras de WB-006 C2 e RN-17); a ação exige TOTP vigente (`reauth_min`, WB-222 C6); ao concluir, as outras sessões e renovações caem (WB-219 C1) e vejo "Senha alterada.".
- **C3** Dado "Sair de todos os aparelhos", então confirmo em diálogo e toda sessão antiga recebe 401 na próxima requisição (WB-219 C1).
- **C4** Dado "Minha atividade", então abre a Auditoria (WB-123) já filtrada nas minhas próprias ações (perfil "leitura própria"); nenhum admin vê a atividade de outro sem a permissão de auditoria.
- **C5** Dado "Gerar novos códigos de recuperação" (comportamento definido em WB-222 C5/C6), então a tela só expõe a ação; regras e limites vêm do Security.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Captcha por dispositivo exige provedor externo (custo, LGPD) | Dependência do fundador | Começar só com atraso progressivo + step-up por e-mail (sem captcha) |
| Limite de loja nova reduz ticket e pode irritar o lojista honesto | Risco de adoção | Liberação manual pelo admin; limite visível; revisar com dados do piloto |
| Código de entrega aumenta fricção e pode ser ignorado | Risco de UX | Flag desligável; Should |
| Sem retenção no split, o risco residual de lojista que some é aceito em DEC-016 | Risco financeiro | WB-225, WB-109 (estorno pelo admin), suspensão, Termos do Lojista |
| IP/CGNAT: vários clientes legítimos atrás do mesmo IP | Risco de falso positivo | Espera por conta+IP, limite por IP alto (60/min, SEC-004) |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Valores de loja nova (30 dias, 20 pedidos, R$ 500) são adequados ao ticket das lojas do piloto? | fundador (V1/V4) |
| ~~A Webag cobre o estorno com recurso próprio quando o lojista não tem saldo? Teto?~~ Respondida: sim, só super admin, teto R$ 300 `[HIPÓTESE]` (DEC-020a, WB-109 C9); fundador revisa o teto e o backend confirma a viabilidade no MP | fundador |
| Captcha de terceiro entra na 1.0? | fundador + security-engineer |
| Exclusão pela web com e-mail não confirmado: senha ou código (SEC-002 `delete_web`)? | security-engineer |
