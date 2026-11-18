# Revisão de segurança dos ADRs 002–005 (e PRDs ligados)

- **Revisor:** security-engineer | **Data:** 2026-11-18 | **Escopo:** ADR-002 (pagamentos), ADR-003 (auth), ADR-004 (tempo real), ADR-005 (arquivos); PRDs de pagamentos, cliente, lojista, admin, LGPD; HIPs relacionadas. **Não há código de auth ou de pagamento ainda**: esta é uma revisão de design.
- **Ameaças e requisitos:** `threat-model-auth-pagamento.md`, `requisitos-seguranca.md`.

## Parecer por ADR (o tech-lead atualiza o campo Status)

| ADR | Parecer | Condição |
|---|---|---|
| ADR-002 Pagamentos | **Aprovado com correções** | SEC-104, SEC-105, SEC-107, SEC-109 resolvidos no ADR **antes** do código de WB-151..154 |
| ADR-003 Autenticação | **Aprovado com correções** | SEC-101, SEC-102, SEC-103, SEC-110; 2FA de admin decidido: obrigatório (SEC-015) |
| ADR-004 Tempo real | Aprovado | Revogação derruba sockets (parte de SEC-101) |
| ADR-005 Arquivos | Aprovado | SEC-108 (risco aceito proposto) e SEC-111 |

Resumo: 0 Crítica, 1 Alta (SEC-105), 7 Médias, 4 Baixas. Nada aqui bloqueia o início do trabalho. A Alta bloqueia o código de pagamento até virar decisão escrita.

---

SEC-101 | Severidade: Média | Status: Aberto
Onde: ADR-003 (linhas "Access token" e "Sessões"); ADR-004 (handshake); WB-075 C3
Problema: o access JWT vale 15 min e o ADR não manda checar o `sid` a cada request. Logout, troca de senha e remoção de funcionário deixam o token e o socket vivos por até 15 min. O ADR também não manda derrubar o socket na revogação.
Cenário de ataque: o dono remove um funcionário que está saindo da empresa; por 15 min esse funcionário segue vendo pedidos com nome, telefone e endereço dos clientes, inclusive pelo socket da loja. Ladrão de celular com sessão aberta segue ativo depois de a vítima "sair de todos os dispositivos".
Correção recomendada: guard verifica `sid` ativo (Redis `session:{sid}` com fallback no banco; invalidação no logout/revogação). Evento `session.revoked` desconecta os sockets do `sid`/usuário e tira o membro da sala `store:{id}`. Papéis já são lidos do banco (ADR-003), o que está correto.
Como verificar a correção: SEC-010 e SEC-014 (access antigo → 401 e socket desconectado em até 5 s).

SEC-102 | Severidade: Média | Status: Aberto
Onde: HIP-023 e WB-008 C3 ("conta bloqueada por 15 min") × ADR-003 ("atraso progressivo em vez de bloqueio duro")
Problema: PRD e ADR se contradizem. O bloqueio duro por conta permite que qualquer pessoa trave a conta de outra só sabendo o e-mail.
Cenário de ataque: um concorrente ou desafeto roda 5 senhas erradas a cada 15 min contra o e-mail de um lojista; o lojista não entra no painel e perde pedidos (aceite em 10 min, HIP-008).
Correção recomendada: adotar o ADR. Espera de 15 min por **conta+IP**; acima de 20 falhas/h na conta, step-up por código no e-mail (o dono legítimo sempre consegue entrar). A mensagem ao usuário pode continuar a mesma. O PO ajusta HIP-023/WB-008 C3.
Como verificar a correção: SEC-004.

SEC-103 | Severidade: Média | Status: Aberto
Onde: ADR-003 ("reuso de token antigo revoga a família inteira")
Problema: em 3G instável, o servidor rotaciona o refresh, a resposta se perde e o app tenta de novo com o token antigo. Também ocorre com duas requisições paralelas que disparam refresh. Isso é lido como "reuso", revoga a família e desloga cliente legítimo, no meio do PIX.
Cenário de ataque: não é ataque; é disponibilidade. Logout aleatório derruba a confiança do cliente desconfiado (brief §2) e gera reclamação.
Correção recomendada: janela de tolerância de 30 s em que o token anterior devolve o **mesmo** par recém-emitido (idempotente), mais single-flight do refresh no cliente. Fora da janela, revogar a família, como no ADR. RFC 9700 admite essa prática.
Como verificar a correção: SEC-011 (dois refresh simultâneos → mesmo par; reuso após 31 s → família revogada).

SEC-104 | Severidade: Média | Status: Aberto
Onde: ADR-002 §Desenho 5 (webhook)
Problema: (1) no SDK oficial, `toleranceSeconds` é **opcional e desligado por padrão** [V `mercadopago@3.6.2`]. Sem ele, não há proteção de replay pelo `ts`. (2) A assinatura cobre só `data.id` **da query**, `x-request-id` e `ts`: o **corpo não é assinado** [V]. (3) O ADR resolve o token pelo `collector_id`, que não vem na notificação. O campo equivalente do corpo (`user_id`) não é assinado. (4) A re-consulta não manda conferir valor, referência e recebedor.
Cenário de ataque: uma notificação vazada (log, proxy, ambiente de staging com o mesmo segredo) é reenviada depois; um campo do corpo alterado escolhe o token/loja usado na re-consulta; um pagamento com valor diferente do pedido (bug, cobrança antiga) é aceito como pagamento do pedido.
Correção recomendada: `validate({ ..., dataId: query['data.id'], toleranceSeconds: 300 })`; deduplicar `x-request-id` (Redis, 24 h); resolver a loja/token **pela tentativa de pagamento salva na criação** (`provider_payment_id` → tentativa → loja); rejeitar notificações sem assinatura (IPN legado/QR); só aprovar se `external_reference`, `transaction_amount`, `currency_id`, recebedor e `application_fee` baterem. Segredo de webhook diferente por ambiente. Confirmar no sandbox qual segredo assina as notificações de pagamentos criados com o token OAuth do lojista `[verificar]`.
Como verificar a correção: SEC-032, SEC-033, SEC-034.

SEC-105 | Severidade: Alta | Status: Aberto
Onde: ADR-002 (Opção A, split 1:1) × PRDs: WB-154 C6 ("débito a recuperar no próximo repasse"), WB-109 C4 ("repasse é ajustado"), WB-159 C1 ("repasse fica retido"), WB-110 C4 ("repasse retido até a decisão"), WB-112 e HIP-015 (repasse semanal), RN-10 (`cupom_plataforma_reembolsado_pela_webag`), WB-116 (cupom da plataforma, inclusive "frete grátis")
Problema: no split 1:1 o dinheiro cai direto na conta MP do lojista e a Webag recebe só a `application_fee`. Não existe "repasse" controlado pela Webag para reter, ajustar ou descontar. As regras citadas ficam sem mecanismo. Além disso, um cupom da plataforma maior que a comissão exigiria `application_fee` negativa (impossível). Assim, o subsídio da Webag ao lojista não tem como ser pago dentro do split.
Cenário de ataque: (a) lojista mal-intencionado vende, saca o saldo e some; o estorno do "não recebi" falha por saldo insuficiente e a Webag não tem o que reter (comportamento do MP com saldo negativo `[verificar]`); (b) a campanha de cupom de R$ 20 em pedido com comissão de R$ 9 não fecha a conta: ou o lojista recebe menos do que o prometido, ou alguém faz PIX manual fora do sistema; (c) autoconsumo com cupom da Webag (threat model §5).
Atualização 2026-11-18: o ADR-002 (commit `c08f324`) já registra que, no split, a Webag não retém dinheiro e que o repasse vira informativo. Isso fecha o item no ADR. **Continua aberto:** os PRDs (WB-154 C6, WB-109 C4, WB-110 C4, WB-112, HIP-015) e o subsídio de cupom/frete da plataforma maior que a `application_fee`.
Correção recomendada (tech-lead + PO, antes do código de pagamento): (1) reescrever no PRD as regras de "repasse retido/ajustado" para o modo split: o recurso passa a ser suspender a loja e cobrar contratualmente pelos Termos do Lojista; (2) no split, limitar o cupom da plataforma e o frete grátis subsidiado a <= `application_fee` do pedido (SEC-060), ou desligá-los até haver mecanismo de pagamento ao lojista aprovado pelo fundador; (3) limites de loja nova (SEC-062) e código de entrega (SEC-067); (4) pesquisar no sandbox/contrato se o MP permite ao marketplace definir prazo de liberação (`money_release_days` ou equivalente) `[verificar]`; (5) registrar o risco residual em `docs/decisoes.md`.
Como verificar a correção: PRDs e ADR-002 sem referência a repasse controlado pela Webag no modo split; teste do SEC-060 (cupom > fee recusado ou flag desligada); decisão registrada.

SEC-106 | Severidade: Média | Status: Aberto
Onde: DEC-005 / ADR-001 (`apps/web` único para lojista e admin), brief §6
Problema: lojista e admin na mesma origem compartilham cookies e contexto. Um XSS armazenado em conteúdo controlado pelo lojista (nome da loja, descrição, resposta a avaliação, motivo de recusa) roda com a sessão do admin quando ele abre a fila de aprovação.
Cenário de ataque: lojista cadastra a loja com payload no campo descrição; o admin abre a fila e o script, com a sessão do admin, emite estornos ou aprova lojas. O cookie HttpOnly não impede ações feitas a partir da mesma origem.
Correção recomendada: manter um build, mas servir o admin em host próprio (`admin.`), com cookies host-only (`__Host-`); CSP estrita; conteúdo de usuário sempre como texto (React já escapa; proibir `dangerouslySetInnerHTML`). Custo baixo, é configuração de deploy. O tech-lead registra no ADR-001 ou num ADR novo.
Como verificar a correção: SEC-082, SEC-083.

SEC-107 | Severidade: Média | Status: Aberto
Onde: ADR-002 §Desenho 4 (WebView com `/pagamento/cartao/[tentativa]`, "token de uso único")
Problema: o ADR não diz onde vai o token (na query ele vaza em log de acesso, histórico e `Referer`), nem a política da página (scripts de terceiros comprometem o SAQ A do PCI DSS 4.0.1), nem como a WebView limita a navegação, sabendo que o 3DS navega para domínios do emissor.
Cenário de ataque: o token aparece no log do proxy/CDN e outra pessoa abre a página de pagamento da tentativa; um script de analytics comprometido na página lê o formulário (skimming).
Correção recomendada: token no fragmento `#t=`, TTL 10 min, uso único, trocado por POST; página sem nenhum script além do próprio e do MP, CSP restrita, `Referrer-Policy: no-referrer`; WebView com allowlist de navegação e sem bridge; se o 3DS não funcionar na allowlist, usar o plano B do ADR (navegador do sistema / Custom Tabs / `ASWebAuthenticationSession`).
Como verificar a correção: SEC-037.

SEC-108 | Severidade: Baixa | Status: Risco aceito proposto (CEO valida)
Onde: ADR-005 (DT-005: sem antivírus em PDF) e decisão 4/5
Problema: o PDF de documento do lojista não passa por antivírus; o ADR também não fixa o limite de pixels do `sharp` nem diz que a chave do objeto é gerada pelo servidor.
Cenário de ataque: um PDF malicioso explora o leitor do admin; uma imagem "bomba" trava o worker.
Correção recomendada (parecer pedido em DT-005): aceitar a falta de antivírus na 1.0 com mitigação: PDF servido pela origem do storage (não do painel), URL de 5 min, `nosniff`, admin com navegador atualizado; ClamAV na fase 2. Obrigatórios agora: `limitInputPixels` <= 40 MP, timeout no job e chave gerada pelo servidor.
Como verificar a correção: SEC-050, SEC-051.

SEC-109 | Severidade: Média | Status: Aberto
Onde: ADR-002 §Desenho 1 (OAuth com "`state` assinado, ligado à loja e ao usuário") e guarda dos tokens
Problema: um `state` só assinado (sem registro no servidor) pode ser reutilizado e não se liga à sessão do navegador. O ADR também não fala de PKCE nem de AAD na cifragem.
Cenário de ataque: CSRF de login OAuth. O atacante inicia o fluxo com a conta MP dele e faz o dono da loja abrir o callback; a loja da vítima passa a receber na conta do atacante. Com AES-GCM sem AAD, quem tem acesso de escrita ao banco troca o ciphertext de uma loja pelo de outra.
Correção recomendada: `state` aleatório guardado no servidor, uso único, 10 min, ligado ao `sid` e à loja; PKCE S256 se o MP suportar `[verificar]`; só o dono, com reautenticação; AAD = `store_id` + versão da chave; comparar o titular da conta MP com o CPF/CNPJ da loja.
Como verificar a correção: SEC-045, SEC-046, SEC-047, SEC-048.

SEC-110 | Severidade: Baixa | Status: Aberto
Onde: ADR-003 ("código de 6 dígitos, guardado com hash")
Problema: hash simples de um código de 6 dígitos é revertido em milissegundos (10^6 possibilidades) por quem tiver acesso ao banco.
Cenário de ataque: alguém com leitura do banco (backup vazado, SQL injection futura) lê os códigos de reset ativos e toma contas dentro da janela de 10 min.
Correção recomendada: HMAC-SHA256 com chave do servidor fora do banco (ou reaproveitar a chave de cifragem com outro rótulo) e código ligado à finalidade.
Como verificar a correção: SEC-002.

SEC-111 | Severidade: Média | Status: Aberto
Onde: WB-065 C6 (planilha com "URL da foto" baixada pelo servidor); ADR-005 não cobre
Problema: o servidor busca uma URL fornecida pelo lojista. O PRD exige só HTTPS, o que não basta.
Cenário de ataque: SSRF. URL que resolve para `169.254.169.254` (metadata do provedor de nuvem), para o Redis/Postgres internos ou para o painel do RustFS, ou redirect para esses endereços. Isso vaza credenciais da infraestrutura ou varre a rede interna.
Correção recomendada: o tech-lead inclui no ADR-005 o "fetch de mídia externa" com as regras do SEC-053; se não der tempo, WB-065 sai sem C6 (o lojista sobe as fotos pelo app).
Como verificar a correção: SEC-053.

SEC-112 | Severidade: Baixa | Status: Aberto
Onde: vários
Problema: inconsistências que viram bug ou teste ambíguo: (a) validade do código de reset 10 min (ADR-003) × 15 min (WB-009 C2); (b) ~~PIX 30 min no ADR-002 × 15 min na HIP-006~~ corrigido no ADR-002 (`c08f324`); (c) provedor `fake` (ADR-002) × `simulated` (PRD pagamentos, WB-150); (d) 2FA de admin "security decide" (PRD admin) → decidido: obrigatório (SEC-015); (e) WB-079 C3 (alterar conta de recebimento exige senha e aviso) está como Could e precisa ser Must (SEC-048).
Cenário de ataque: não se aplica; risco de implementação divergente.
Correção recomendada: PO e tech-lead alinham (a) 10 min, (b) HIP-006, (c) um nome só, (d)/(e) conforme SEC.
Como verificar a correção: PRDs e ADRs com os mesmos valores.

## Riscos aceitos propostos (decisão do CEO, registrar em `docs/decisoes.md`)
| Item | Risco | Por que aceitar |
|---|---|---|
| T-03 | Enumeração de e-mail pela tela "e-mail primeiro" | Padrão de mercado; ganho de UX; mitigado por SEC-005 |
| SEC-108 | PDF sem antivírus na 1.0 | Só o admin abre, com origem separada; ClamAV na fase 2 |
| SEC-086 | Sem certificate pinning na 1.0 | Risco de quebra maior que o ganho no MVP |
