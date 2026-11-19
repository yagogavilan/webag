# PRD: Painel Admin (Webag)

Status: pronto para G3 (aguarda estimativa e specs) | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-100 a WB-125
Atualizado: 2026-11-19 (DEC-035/036/037): nova área **Logística** (fila, motoboys, atribuição, estados, custo; histórias WB-230 a WB-234, WB-239, WB-240 e WB-241 em `prd/logistica.md`), **tabela de taxa de entrega** (WB-236) e relatório de trocas (WB-248, `prd/trocas.md`).
Regras: `docs/produto/regras-de-negocio.md`; hipóteses: `docs/decisoes.md`. Origem: brief §3.3. Mesmo app `apps/web` do lojista, rotas e permissões separadas (DEC-005).

## Problema
Yago (P3) opera sozinho e precisa aprovar lojas, mediar pedidos, mexer em dinheiro e configurar o negócio **sem deploy**. Erro humano em dinheiro e falta de trilha são os maiores riscos. Frequência: diária.

## Objetivo e métrica de sucesso
Operar a plataforma sozinho em escala de piloto (20-50 lojas), com controle e rastreabilidade.
| Métrica | Meta (HIP-043) |
|---|---|
| Fila de aprovação | tempo mediano < 2 dias úteis (HIP-030) |
| Mediação de troca/disputa | decisão em <= 5 dias úteis (HIP-020) |
| Ações administrativas sem registro de auditoria | 0 |
| Mudança de parâmetro/banner/cupom sem deploy | 100% |
| Divergências de conciliação abertas há > 3 dias | 0 |

**Eventos (auditoria é a fonte):** `admin_login`, `store_approved/rejected/suspended`, `order_cancelled_by_admin`, `refund_issued {amount}`, `param_changed {key}`, `flag_changed {key}`, `banner_published`, `push_sent {segment_size}`.

## Fora do escopo (1.0)
Aplicativo admin móvel dedicado; CRM de suporte com tickets (usa WhatsApp/e-mail); BI com dashboards customizáveis; aprovação em 2 etapas para qualquer ação (só estorno alto, HIP-039); automação de punição por cancelamento; antifraude próprio avançado; edição de conteúdo do app por drag-and-drop; multi-idioma; integração contábil/NFS-e automática.

## Usuários e cenários
1. Yago entra, aprova 3 lojas com documentos, recusa 1 com motivo.
2. Cliente reclama de pedido: suporte consulta; financeiro estorna parcialmente; tudo no log.
3. Yago abre um bairro novo, publica banner de lançamento e cupom, dispara push para a cidade.
4. Segunda de manhã: financeiro confere repasses e conciliação.

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-ADM-01 | Autenticação, perfis e gestão de admins | 100, 101 |
| RF-ADM-02 | Usuários: busca, bloqueio, redefinição de senha | 102 |
| RF-ADM-03 | Lojas: aprovação, suspensão, edição, comissão | 103-105 |
| RF-ADM-04 | Catálogo da plataforma e moderação | 106, 107, 124 |
| RF-ADM-05 | Pedidos e trocas: visão e intervenção | 108-110 |
| RF-ADM-06 | Financeiro: comissões, taxa, repasses, conciliação, relatórios | 111-114 |
| RF-ADM-07 | Marketing e conteúdo: banners, cupons, push, termos | 115-117, 197 |
| RF-ADM-08 | Regiões, parâmetros, flags, manutenção | 118-121 |
| RF-ADM-09 | Relatórios, painel inicial e auditoria | 122, 123, 125 |
| RF-ADM-10 | Logística: fila, motoboys, atribuição com WhatsApp, estados, custo por entrega, relatórios | 230-234, 239-241 (`prd/logistica.md`) |
| RF-ADM-11 | Tabela de taxa de entrega por região e faixa; pedido mínimo e frete grátis globais | 236 (`prd/logistica.md`) |
| RF-ADM-12 | Relatório de trocas por loja e categoria | 248 (`prd/trocas.md`) |

## Regras de negócio
RN-02 (parâmetros), RN-03, RN-07, RN-08, RN-10, RN-11, RN-13 (perfis), RN-15 (métricas). Matriz de permissões: abaixo.

| Ação | Super | Operação | Financeiro | Suporte |
|---|---|---|---|---|
| Gerenciar admins, parâmetros, flags, manutenção | Sim | Não | Não | Não |
| Aprovar/suspender/editar loja; moderar | Sim | Sim | Não | Não |
| Comissões, taxa de serviço, repasses, conciliação | Sim | Não | Sim | Não |
| **Tabela de taxa de entrega e de troca (WB-236)** | Sim | Não | Sim | Não |
| **Logística: fila, motoboys, atribuir, estados, custo (WB-230 a 234, 239)** | Sim | Sim | Leitura e exportação de custos | Leitura da fila |
| Relatórios de logística e de trocas (WB-240, 248) | Sim | Sim (sem custos) | Sim (com custos) | Não |
| Estornar (até R$ 500) | Sim | Não | Sim | Não |
| Estornar acima de R$ 500 (HIP-039) | Sim | Não | Não | Não |
| Cancelar pedido | Sim | Sim | Sim | Não |
| Mediar troca/disputa | Sim | Sim | Não | Abrir |
| Banners, cupons da plataforma, push, termos | Sim | Sim | Não | Não |
| Ver clientes, lojas, pedidos | Sim | Sim | Pedidos/lojas | Sim |
| Redefinir senha de cliente / bloquear | Sim | Sim | Não | Redefinir |
| Ver documentos de loja | Sim | Sim | Não | Não |
| Ver auditoria | Sim | Leitura própria | Leitura própria | Leitura própria |

## Requisitos não funcionais
- **Segurança:** RBAC no servidor; senha forte; sessão curta com expiração por inatividade (30 min) `[HIPÓTESE]`; **TOTP obrigatório para todo admin** (DEC-018, SEC-015; WB-222); painel em endereço próprio, separado do lojista (DEC-018; WB-223); reautenticação de 5 min para estorno e para revelar dado pessoal (SEC-016); rate limit; toda ação sensível pede motivo e entra na auditoria.
- **Auditoria:** log append-only, sem edição/exclusão por qualquer perfil; guarda quem, quando, IP, ação, antes/depois; retenção 5 anos (HIP-035).
- **Desempenho:** listas paginadas (50), filtros no servidor; exportação > 10 mil linhas assíncrona com link por e-mail.
- **Usabilidade:** uso em desktop e tablet; confirmação explícita em ações destrutivas; sem emoji; WCAG 2.2 AA.
- **LGPD:** admin vê o mínimo; dados pessoais mascarados por padrão com "Revelar" (registra acesso); exportações são auditadas.

## Histórias e critérios de aceite

### WB-100 Login admin e perfis — Must — dep: base de auth
Como admin, quero entrar com meu perfil, para ver só o que me cabe.
- **C1** Dado credenciais corretas de um admin ativo, então entro e vejo apenas o menu do meu perfil; URL de tela sem permissão responde 403.
- **C2** Dado 5 falhas seguidas do mesmo dispositivo/IP contra um admin, então esse dispositivo/IP espera 15 min e o evento vai à auditoria; a conta do admin **não** é bloqueada para quem tem a senha certa em outro dispositivo (WB-221).
- **C3** Dado 30 min sem atividade, então a sessão expira com aviso. "Atividade" = requisição autenticada iniciada pelo usuário (polling e atualização automática não contam); o refresh do admin vale 30 min deslizantes, sem os 30 dias do cliente (R-04).
- **C4** Dado usuário não admin (cliente/lojista) tentando as rotas admin, então 403 e registro.
- **C5** Dado a matriz de RN-13/PRD, então cada rota e cada ação da API valida o perfil no servidor.
- **C6** Dado senha correta de admin sem TOTP configurado, então só vejo a tela de configurar o TOTP (WB-222); o painel admin só abre no endereço próprio do admin (WB-223).

### WB-101 Gerenciar admins — Must — dep: WB-100
Como super admin, quero criar e desativar admins, para dar acesso conforme a função.
- **C1** Dado novo admin (nome, e-mail, perfil), então ele recebe convite de uso único, ligado ao e-mail e válido por **48 h** (SEC-017) para criar senha e configurar o TOTP (WB-222); convite vencido ou usado: "Convite inválido" (410). Se o e-mail já pertence a um cliente ou lojista, o convite é **recusado** (sem criar segunda conta nem converter a existente): o admin usa e-mail exclusivo, de domínio da Webag (R-36).
- **C2** Dado trocar o perfil ou desativar, então vale na hora e as sessões ativas são encerradas.
- **C3** Dado tentar remover o último super admin, então é bloqueado ("Precisa existir ao menos 1 super admin").
- **C4** Dado qualquer mudança, então vai à auditoria.

### WB-102 Usuários: busca, bloqueio e senha — Must — dep: WB-100
Como suporte/operação, quero achar um usuário e agir, para resolver problemas.
- **C1** Dado busca por nome, e-mail, celular ou ID, então vejo resultados paginados (clientes, lojistas, funcionários) com status.
- **C2** Dado detalhe, então vejo dados mascarados, pedidos recentes, lojas vinculadas e histórico de bloqueios; "Revelar" mostra o dado completo e registra o acesso.
- **C3** Dado "Bloquear", então exijo motivo; o usuário perde as sessões e vê "Conta indisponível" (WB-008 C4); desbloquear reverte.
- **C4** Dado "Redefinir senha", então envio e-mail com link/código ao usuário (nunca defino a senha por ele).
- **C5** Dado bloquear lojista, então a loja dele é suspensa (WB-104) e pedidos em andamento seguem para decisão do admin.

### WB-103 Fila de aprovação de lojas — Must — dep: WB-052
Como operação, quero revisar lojas novas, para só aprovar as legítimas.
- **C1** Dado a fila, então vejo lojas "Em análise" por data de envio, com tempo de espera e destaque em vermelho acima de `aprovacao_loja_sla_dias_uteis`. Dia útil = segunda a sexta, **sem calendário de feriados na 1.0** (documentado; tabela editável de feriados é melhoria futura; R-15a). Loja em "Correção pedida" sai da contagem do prazo até o reenvio (RN-16).
- **C2** Dado abrir uma loja, então vejo dados, documentos (visualização por URL assinada de curta duração, acesso registrado com motivo obrigatório: análise inicial, dúvida ou denúncia; WB-218) e a situação do CPF/CNPJ: como WB-051 C2 já impede duplicidade no cadastro, a fila mostra apenas o vínculo com loja reprovada (documento livre se não teve pedidos) ou suspensa (continua ocupado) (R-15b, R-28a).
- **C3** Dado a loja "Em análise", então tenho 3 desfechos distintos conforme a máquina de estados RN-16: **"Aprovar"** (vira APROVADA e o lojista é notificado), **"Pedir correção"** (motivo por item; status "Aguardando lojista", prazo pausado; o lojista reenvia e a loja volta a "Em análise") e **"Recusar"** (final, com motivo; novo cadastro só com o suporte). Transição inválida (ex.: Recusada ou Suspensa direto para Aprovada) é recusada com erro e auditada (R-29).
- **C4** Dado dois admins na mesma loja, então a segunda decisão vê "Já decidida por [nome]".
- **C5** Dado fila vazia, então "Nenhuma loja aguardando".
- **C6** Dado a loja com a conexão Mercado Pago "Em análise" por titular divergente (WB-053 C7), então aparece na fila com o selo "Titular divergente" e a ativação da venda está **bloqueada** (DEC-020e, DEC-023a).
- **C7** Dado o selo "Titular divergente", então "Liberar" (perfil operação ou super admin) exige motivo obrigatório (mín. 10 caracteres), reautenticação com TOTP vigente (WB-222) e grava auditoria (quem, quando, motivo, CPF/CNPJ do titular mascarado); "Recusar conta" mantém o bloqueio e o lojista é notificado para conectar outra conta. Alerta ao admin em até 1 min da conexão (SEC-047).

### WB-104 Suspender, reativar e editar loja — Must — dep: WB-103
Como operação, quero suspender ou corrigir uma loja, para proteger clientes.
- **C1** Dado "Suspender" com motivo, então a loja some do app imediatamente, não recebe novos pedidos, e os pedidos em andamento ficam sinalizados com "Atenção" no WB-108; o **admin decide caso a caso** (concluir ou cancelar com estorno); o prazo de aceite `loja_aceite_timeout_min` já cobre os pedidos em RECEBIDO; o lojista é notificado (R-24).
- **C2** Dado "Reativar", então volta a ser visível se continuar atendendo RN-03.
- **C3** Dado editar qualquer dado da loja (perfil, horário, entrega, trocas), então a alteração é salva com antes/depois na auditoria.
- **C4** Dado loja com repasse pendente (modo centralizado) ou estorno pendente por saldo (split), então a suspensão não apaga o saldo/dívida e o financeiro é avisado.
- **C5** Dado alerta de risco da loja (WB-225: "não recebi" > 5% ou cancelamento > 15%), então vejo a loja na fila "Em risco" com a ação "Suspender" a um toque.

### WB-105 Comissão por loja e por categoria — Must — dep: WB-111
Como financeiro, quero definir comissão por loja e por categoria, para negociar e incentivar.
- **C1** Dado comissão por loja (0 a 30%) com início e fim opcionais, então vale conforme precedência loja > categoria > padrão (RN-10).
- **C2** Dado fim da vigência, então volta a regra seguinte sozinha.
- **C3** Dado alteração, então não é retroativa (pedidos já pagos mantêm o snapshot) e é auditada com motivo; **o lojista é avisado** ("Sua comissão mudou de A% para B% a partir de DD/MM", WB-242 C4).
- **C4** Dado percentual fora de 0 a 30 ou vigência invertida, então erro.
- **C5** Dado a visão da loja, então vejo a comissão efetiva hoje e a origem (loja, categoria ou padrão).

### WB-106 Categorias e subcategorias — Must — dep: WB-100
Como operação, quero gerenciar categorias, para organizar o app.
- **C1** Dado criar categoria ou subcategoria (2 níveis), então informo nome (até 30), ícone da biblioteca Phosphor (HIP-D03; lista de nomes versionada no código), ordem e ativa/inativa (R-27).
- **C2** Dado reordenar, então o app reflete na próxima abertura.
- **C3** Dado inativar categoria com produtos, então ela some do app e das buscas; os produtos ficam preservados e o lojista é avisado.
- **C4** Dado excluir categoria com produtos ou lojas, então é bloqueado ("Mova antes ou inative"); sem vínculos, exclui.
- **C5** Dado nome duplicado no mesmo nível, então erro; a comparação ignora acento e caixa ("Calçados" = "calcados") (R-27).

### WB-107 Moderação de produtos — Must — dep: WB-060
Como operação, quero remover ou pausar produtos impróprios, para cumprir a lei e as regras das lojas de apps.
- **C1** Dado a lista de produtos com filtro por loja, categoria, data, denunciados, então posso abrir, "Remover" (motivo obrigatório) ou "Pausar".
- **C2** Dado remoção, então o produto sai do app, o lojista é notificado com o motivo e pode contestar por e-mail ao suporte; histórico preservado.
- **C3** Há **duas listas editáveis**: (a) **categorias proibidas**, que **bloqueiam** o cadastro (WB-060 C6); (b) **palavras suspeitas**, que apenas **sinalizam**: produto novo que casar entra em "Revisar", sem bloqueio automático (HIP-029). A palavra casa como **palavra inteira, sem distinção de caixa nem acento** (não por trecho: "pistola" não casa "pistolão"; R-12c).
- **C5** Dado produto removido ou pausado pelo admin, então o status de moderação é separado do status do lojista e o lojista **não** o reativa; só o admin reverte, com auditoria (R-12d).
- **C4** Dado reincidência (3 remoções na loja em 30 dias), então a loja é sinalizada para análise de suspensão.

### WB-108 Pedidos: visão geral e filtros — Must — dep: WB-067
Como operação/suporte, quero ver todos os pedidos, para acompanhar e investigar.
- **C1** Dado a lista, então filtro por período, cidade, loja, estado, tipo, forma de pagamento e busca por número/cliente; paginação de 50.
- **C2** Dado o detalhe, então vejo itens, valores (RN-10), pagamento, linha do tempo com ator/hora/motivo, trocas, avaliações e eventos de pagamento.
- **C3** Dado pedido parado (RECEBIDO há > aceite+5 min, PRONTO_PARA_COLETA sem motoboy há > `logistica_sla_atribuir_critico_min`, SAIU há > 4 h), então destacado como "Atenção"; o detalhe mostra a corrida (motoboy, estados, custo) com link para a Logística.
- **C4** Dado dados pessoais, então mascarados com "Revelar" auditado.
- **C5** Dado exportar CSV, então respeita os filtros e é auditado.

### WB-109 Intervir no pedido: cancelar e estornar — Must — dep: WB-108, WB-154
Como operação/financeiro, quero cancelar e estornar um pedido, para corrigir problemas.
- **C1** Dado pedido em qualquer estado não terminal, então posso "Cancelar" com motivo obrigatório; estorno total automático.
- **C2** Dado "Estornar parcialmente", então informo valor (> 0 e <= pago menos já estornado) e motivo; vejo o efeito na comissão antes de confirmar.
- **C3** Dado valor acima de R$ 500,00 e perfil financeiro, então a ação exige super admin (HIP-039); vejo "Peça aprovação a um super admin".
- **C4** Dado ENTREGUE, então só estorno (parcial ou total) com motivo; no split o estorno sai da conta do lojista no provedor e **não há ajuste de repasse** (DEC-016); se faltar saldo ao lojista, vale WB-154 C6 e posso suspender a loja (WB-104).
- **C5** Dado confirmação dupla (duplo clique), então um só estorno (idempotência).
- **C6** Dado falha do provedor no estorno, então o pedido fica "Estorno pendente" e há tentativa automática; o admin vê o erro e pode reprocessar (WB-153).
- **C7** Dado qualquer intervenção, então cliente e loja são notificados e a ação vai à auditoria.
- **C8** Dado estorno, então exige reautenticação com TOTP vigente (5 min; WB-222) além do motivo.
- **C9** Dado estorno no split que falhou por saldo insuficiente do lojista (WB-154 C6), então **só o super admin** vê a ação "Cobrir com saldo do Webag", limitada a `estorno_cobertura_teto_cents` por pedido (R$ 300,00 `[HIPÓTESE]`, DEC-020a); exige motivo e TOTP vigente, registra o valor como **dívida do lojista** no ledger (cobrança pelos Termos do Lojista, minuta pendente de jurídico) e vai à auditoria. Acima do teto ou sem saldo na conta Webag, a ação não aparece e o texto diz o motivo. Viabilidade de pagar o estorno com saldo próprio no MP: backend-dev confirma no sandbox; se inviável, a ação sai da 1.0 e fica só suspensão + cobrança.

### WB-110 Mediar trocas e disputas — Must — dep: WB-172, WB-037
Como operação, quero decidir trocas contestadas e disputas "não recebi", para resolver com justiça e prazo.
- **C1** Dado a fila "Em mediação" ordenada por prazo (`mediacao_dias_uteis`), então vejo pedido, motivo, fotos, mensagens, política da loja e histórico.
- **C2** Dado decisão "A favor do cliente" ou "A favor da loja" com justificativa obrigatória, então o fluxo continua (troca aprovada/estorno ou recusa final) e as partes são notificadas.
- **C3** Dado arrependimento (7 dias) ou defeito dentro do prazo, então o sistema alerta que a recusa da loja não é permitida por lei e sugere aprovar.
- **C4** Dado disputa "não recebi", então posso estornar total (a partir da conta do lojista, WB-154 C6), confirmar entrega ou pedir comprovante à loja (prazo de resposta da loja `disputa_comprovante_h`, 48 h `[HIPÓTESE]`; sem resposta, a disputa segue sem o comprovante); no modo centralizado o repasse do pedido fica retido até a decisão, no split não há retenção e a ação é o estorno e, se for o caso, a suspensão da loja (DEC-016).
- **C5** Dado prazo estourado, então o item sobe para "Atrasado".

### WB-111 Comissões padrão e taxa de serviço — Must — dep: WB-119
Como financeiro, quero definir comissão padrão e taxa de serviço, para ajustar a receita sem deploy.
- **C1** Dado `comissao_padrao_pct` (0 a 30, 2 casas; seed 15 `[HIPÓTESE, DEC-035]`), então vale para pedidos futuros; a comissão **por loja** (WB-105, ex.: 15%) tem precedência sobre categoria e padrão, e a que vale hoje é a mostrada ao lojista como "Você recebe R$ X" (WB-242).
- **C5** Dado a taxa de entrega, então ela **não** é editada aqui: é a tabela de WB-236 (`prd/logistica.md`); este cartão só mostra o resumo ("Taxa de entrega média hoje: R$ X") com atalho.
- **C2** Dado taxa de serviço, então escolho nenhuma, valor fixo (R$ 0 a R$ 10) ou % (0 a 10), mostrada ao cliente em linha própria no checkout (RN-10).
- **C3** Dado mudança, então exige motivo, entra em vigor na data/hora indicada e é auditada; histórico visível.
- **C4** Dado `feature flag` de taxa desligada, então o cliente não vê a linha.

### WB-112 Repasses — Must — dep: WB-156
Como financeiro, quero acompanhar e executar repasses, para pagar certo e no prazo.
- **C1** Dado o ciclo (`repasse_periodicidade`), então o sistema gera o lote por loja com pedidos elegíveis (ENTREGUE há >= `repasse_carencia_dias`, sem troca/disputa) e o saldo líquido.
- **C2** Dado lote (modo centralizado), então vejo composição por pedido e posso retirar um pedido com motivo (ex.: disputa); no split vejo só a composição.
- **C3** Dado modo split, então o lote é **somente informativo** (mostra o status vindo do provedor; sem retirar pedido nem reter valor, pois a Webag não custodia o dinheiro; DEC-016); dado modo centralizado, então "Executar repasse" cria a transferência e registra o comprovante.
- **C4** Dado saldo negativo da loja no modo centralizado, então abate do próximo ciclo e fica sinalizado; no split, a dívida fica registrada no ledger e é tratada por estorno/suspensão/Termos (WB-154 C6), nunca por desconto automático.
- **C5** Dado falha de transferência, então o lote fica "Falhou" com o motivo e pode ser reprocessado sem duplicar.
- **C6** Dado executar o mesmo lote duas vezes, então só uma execução ocorre.

### WB-113 Conciliação com o provedor — Must — dep: WB-157
Como financeiro, quero ver divergências entre o sistema e o provedor, para não perder dinheiro.
- **C1** Dado o job diário (WB-157), então a lista mostra: pagamento no provedor sem pedido, pedido pago sem pagamento no provedor, valores diferentes, estornos faltantes.
- **C2** Dado uma divergência, então posso marcar "Em análise", "Resolvida" (com nota) ou "Ajustada" (gera ajuste auditado).
- **C3** Dado nenhuma divergência, então "Tudo conciliado até [data]".
- **C4** Dado divergência aberta há > 3 dias, então alerta ao super admin (WB-198).

### WB-114 Relatórios financeiros exportáveis — Should — dep: WB-156
Como financeiro, quero exportar relatórios, para fechar o mês.
- **C1** Dado período e filtros (loja, cidade, categoria), então exporto CSV de: vendas, comissões, taxa de serviço, estornos, cupons da plataforma, repasses e receita Webag (RN-10/RN-15).
- **C2** Dado totais, então batem com a soma das linhas (teste de reconciliação interna).
- **C3** Dado período > 10 mil linhas, então a exportação é assíncrona com aviso por e-mail.
- **C4** Dado exportação, então é auditada.

### WB-115 Banners e destaques — Must — dep: WB-118
Como operação, quero publicar banners e destaques, para promover sem deploy.
- **C1** Dado novo banner, então envio imagem (proporção **2:1**, a mesma exibida no app; DEC-024a; até 5 MB; o recorte fixo em 2:1 impede subir outra proporção; compressão no navegador), título opcional, destino (loja, categoria, produto, cupom), cidades alvo, início/fim, ordem e ativo.
- **C2** Dado destino inexistente ou inativo, então erro e o banner não publica; dado destino que ficar inativo depois, então o banner some do app.
- **C3** Dado período, então publica e despublica sozinho no horário.
- **C4** Dado destaques de lojas/produtos (fixados na home), então escolho item, cidade e período; aparecem antes dos critérios automáticos (RN-03).
- **C5** Dado a lista, então vejo impressões e cliques por banner.

### WB-116 Cupons da plataforma — Must — dep: WB-022
Como operação, quero criar cupons Webag, para campanhas e primeira compra.
- **C1** Dado novo cupom, então defino código, tipo (percentual, valor ou frete grátis), valor, teto, mínimo, validade, limites total e por cliente, "só primeira compra", e alvo (todas as lojas, cidades, categorias ou lojas específicas) (RN-09).
- **C2** Dado o custo do cupom, então ele é custo da Webag e aparece no financeiro (RN-10) e na conciliação.
- **C3** Dado limite de usos atingido, então novos usos falham com "Cupom esgotado".
- **C4** Dado pausar, então deixa de valer imediatamente.
- **C5** Dado relatório do cupom, então vejo usos, desconto total e pedidos.
- **C6** Dado modo split, então o desconto da plataforma (cupom de valor, percentual ou frete grátis subsidiado) em cada pedido é limitado à `application_fee` daquele pedido (comissão + taxa de entrega + taxa de serviço, RN-10; DEC-016, SEC-060, DEC-036); ao salvar o cupom, o painel mostra o aviso "Em pedidos com comissão menor, o desconto será cortado em R$ [comissão]". Um cupom que exigisse mais que isso fica desligado até haver mecanismo de pagamento ao lojista aprovado pelo fundador.
- **C7** Dado cupom da plataforma, então é recusado quando telefone, e-mail ou dispositivo do cliente coincide com membro da loja do pedido (autoconsumo, SEC-061); a loja com > 30% dos usos de um cupom `[HIPÓTESE]` gera alerta ao admin.
- **C8** Dado "primeira compra", então exige e-mail confirmado e nenhum pedido pago anterior do mesmo dispositivo, telefone ou endereço normalizado (SEC-060; WB-224 C2).

### WB-117 Termos e privacidade editáveis — Must — dep: WB-210
Como super admin, quero editar termos e política de privacidade, para refletir mudanças legais sem deploy.
- **C1** Dado o editor (texto formatado simples), então salvo como nova **versão** com data de vigência; versões antigas ficam guardadas e consultáveis.
- **C2** Dado marcar "mudança relevante", então **todos os usuários** do tipo correspondente precisam aceitar a nova versão no próximo uso (WB-210; não só quem entrou nos últimos X dias). Reaceite dos Termos do Lojista vale para o dono; o funcionário aceita só termos de uso e privacidade. A versão publicada é **imutável**: correção = nova versão (R-32).
- **C3** Dado publicação, então as páginas públicas web `/termos` e `/privacidade` e os links do app mostram a versão vigente.
- **C4** Dado texto vazio ou sem data, então não publica.
- **C5** Dado tipos separados (termos do cliente, termos do lojista, privacidade), então cada um tem versionamento próprio.

### WB-118 Regiões: cidades e bairros — Must — dep: WB-100
Como operação, quero liberar e fechar áreas, para crescer onde há lojas.
- **C1** Dado cidades (Francisco Morato, Franco da Rocha, Caieiras, Campo Limpo Paulista no seed), então ativo/inativo e cadastro de bairros por cidade.
- **C2** Dado inativar cidade ou bairro, então o app deixa de mostrar lojas ali, novos checkouts nessa região são bloqueados e pedidos em andamento seguem.
- **C3** Dado ativar com nenhuma loja visível, então aviso "Nenhuma loja atende aqui ainda".
- **C4** Dado bairro não cadastrado, então vale a regra da cidade (RN-03).
- **C5** Dado lista de espera (WB-004), então vejo o número de inscritos por cidade/bairro para decidir a abertura.

### WB-119 Parâmetros do negócio — Must — dep: WB-100
Como super admin, quero editar os parâmetros do negócio, para ajustar sem deploy.
- **C1** Dado a tabela RN-02, então cada chave mostra valor atual, padrão, faixa permitida e descrição.
- **C2** Dado valor fora da faixa, então erro e não salva.
- **C3** Dado salvar, então exijo motivo, a mudança vale a partir de agora (não retroativa a pedidos já criados que têm snapshot) e entra no histórico/auditoria.
- **C4** Dado "Restaurar padrão", então volta ao valor de seed com confirmação.
- **C5** Dado os pisos legais (7 dias de arrependimento, 30 de defeito), então são **fixos e não editáveis por nenhum perfil, nem pelo super admin**: a validação recusa valor menor que o piso e a tela mostra a chave bloqueada; o super admin só pode **aumentar** a parte voluntária. Mudar o piso exige alteração de código e registro em `docs/decisoes.md` (DEC-011, DEC-023b; R-02).
- **C6** Dado alteração de parâmetro, então vale com o mesmo cache de até 60 s das flags (C3 e WB-120 C4); a edição usa controle de versão: se outro admin salvou a mesma chave antes, a resposta é 409 "Este valor foi alterado por [nome]. Recarregue" (R-22).
- **C7** **(DEC-053)** Dado os parâmetros `entrega_*` (RN-02), então ficam num grupo "Entrega em até 2 h" com validação cruzada (teto menos folga >= preparo + despacho + 5; folga <= teto/4), aviso de `raio_max_km` acima do alcance, prévia de ETA e relatório de prazo: tudo em **WB-258** (`logistica.md`).

### WB-120 Feature flags — Must — dep: WB-119
Como super admin, quero ligar e desligar funções, para reagir a problemas.
- **C1** Dado a lista fechada da 1.0 (cartão, PIX, retirada, **entrega Webag (`entrega_webag`, desliga a oferta de entrega em todo o app, sem afetar corridas em andamento)**, login social, taxa de serviço, cadastro de lojista, trocas voluntárias, push de marketing, `email_nao_confirmado_compra` [HIP-D07, WB-224 C9] e `codigo_entrega` [WB-226]), então alterno cada uma com confirmação (R-34).
- **C2** Dado desligar cartão ou PIX, então o checkout deixa de mostrá-lo na próxima abertura; pedidos já criados seguem.
- **C3** Dado a flag desligada mantendo a função em andamento (ex.: trocas já abertas), então processos existentes terminam normalmente.
- **C4** Dado mudança, então é auditada e o app obtém o valor em até 60 s (cache curto).
- **C5** Dado tentar desligar **PIX e cartão ao mesmo tempo**, então a ação é **bloqueada** com "Pelo menos uma forma de pagamento precisa ficar ligada. Para parar as vendas, use o modo manutenção." (WB-121); a API também recusa (409). Decisão `[HIPÓTESE]` mais segura que a proposta do Designer (só avisar): evita app sem como pagar por engano e é trivial de testar.
- **C6** Dado qualquer tela do admin, então o cabeçalho mostra o selo **"Pagamentos: simulado"** (provedor `fake`, WB-150) ou **"Pagamentos: real"** (Mercado Pago), com ícone e texto, lido do servidor (não editável); em produção o selo "simulado" nunca aparece (WB-160 C5). Serve para não tomar um estorno de teste por real.

### WB-121 Modo manutenção — Should — dep: WB-120
Como super admin, quero pôr o sistema em manutenção, para atualizar com segurança.
- **C1** Dado ativar com mensagem e previsão, então app e painéis de cliente/lojista mostram "Voltamos já" e a API responde 503 a eles; o admin continua acessível.
- **C2** Dado manutenção ligada, então os webhooks do provedor de pagamento continuam sendo recebidos e processados (nenhum pagamento é perdido).
- **C3** Dado desligar, então tudo volta sem ação do usuário.
- **C4** Dado agendar início e fim, então liga e desliga sozinho.

### WB-122 Relatórios operacionais — Must — dep: WB-108
Como operação, quero relatórios de pedidos, GMV, lojas, clientes, recompra e cancelamentos, para decidir.
- **C1** Dado período e filtros (cidade, loja, categoria), então vejo: pedidos, GMV e GMV concluído, ticket médio, novas lojas, novos clientes, recompra 30 dias, cancelamentos por ator e motivo (RN-15).
- **C2** Dado exportar, então CSV com os mesmos números; auditado.
- **C3** Dado período sem dados, então "Sem dados neste período".
- **C4** Dado os totais, então conferem com a listagem de pedidos para o mesmo filtro.

### WB-123 Log de auditoria — Must — dep: WB-100
Como super admin, quero ver tudo o que foi feito, para provar e investigar.
- **C1** Dado qualquer ação administrativa (aprovar, suspender, estornar, editar parâmetro, publicar, revelar dado, exportar), então grava ator, perfil, hora, IP, ação, alvo e antes/depois.
- **C2** Dado a tela, então filtro por ator, ação, alvo e período, paginado.
- **C3** Dado tentativa de editar/excluir um registro, então não existe esse caminho (append-only) e uma tentativa direta no banco é negada à role da aplicação.
- **C4** Dado falha ao gravar o log, então a ação sensível **não** é concluída (falha fechada).

### WB-124 Moderação de avaliações e denúncias — Must — dep: WB-038
Como operação, quero tratar denúncias, para manter a plataforma saudável.
- **C1** Dado a fila de denúncias (avaliação, produto, loja), então vejo o item, motivo, quem denunciou e histórico.
- **C2** Dado "Remover avaliação", então exijo motivo (ofensa, dado pessoal, ilegal, spam); a nota deixa de contar e o autor é notificado; não removo por ser negativa (RN-12).
- **C3** Dado "Manter", então a denúncia é encerrada e o denunciante é avisado.
- **C4** Dado denúncias de produto/loja, então encaminha a WB-107/WB-104.
- **C5** Dado meta: tratar em até 2 dias úteis `[HIPÓTESE]`; denúncia mais antiga destacada.

### WB-125 Painel inicial do admin — Should — dep: WB-122
Como admin, quero ver o estado da operação ao entrar, para priorizar o dia.
- **C1** Dado a abertura, então vejo pedidos de hoje, GMV, lojas na fila de aprovação, **entregas para despachar e atrasadas**, trocas/disputas em mediação, divergências de conciliação e lojas suspensas.
- **C2** Dado cada card, então leva à lista filtrada.
- **C3** Dado perfil, então vejo só os cards permitidos.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Operação de 1 pessoa: fila e mediações podem estourar | Risco operacional | SLA visível, alertas (WB-198), perfis para delegar |
| Dinheiro (estorno/repasse) com erro humano | Risco financeiro | Motivo obrigatório, limite HIP-039, TOTP no estorno, auditoria fail-closed |
| Conta admin comprometida ou XSS de lojista chegando ao admin | Risco de segurança (SEC-106) | TOTP (WB-222), endereço próprio e cookies separados (WB-223) |
| Documentos de lojistas são dado sensível | LGPD/segurança | URL assinada, acesso registrado, retenção HIP-035; threat model do security |
| Parâmetros mal configurados (ex.: comissão 0 por engano) | Risco | Faixas, motivo, histórico, não retroativo |
| Modo manutenção bloqueando webhook | Risco | WB-121 C2 |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| ~~2FA obrigatório para admin~~ | Decidido: obrigatório (DEC-018, SEC-015) |
| Retenção e formato final dos logs de auditoria | security-engineer + tech-lead |
| Texto legal de termos | fundador/jurídico |
