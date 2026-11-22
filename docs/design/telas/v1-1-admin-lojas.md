# Tela: Admin, gestão das lojas   (WB-350 a WB-355)

> Autor: product-designer. Data: 2026-11-22. Release R1. Protótipo: `#/a/lojas`, `#/a/loja?id=l1&aba=resumo|cat|hor|com|hist`, `#/a/ver-como`. **Troque o "Perfil admin" na barra do protótipo** para ver a matriz de permissões mudar a tela.
> Reaproveita: moldura e tabela responsiva de `onda-7-paineis-v3.md`, ReasonDialog e DiffView de `design-system.md` §3.1c, tela "Lojas" atual (`docs/telas/33-admin-lojas-*`) e "Comissões" (`37-admin-comissoes-*`). Cadastro de produto pelo admin usa a tela de `v1-1-cadastro-rapido.md`; edição em massa usa `v1-1-edicao-em-massa.md`.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Ficha em abas** (Resumo, Catálogo, Horário e pausa, Comissão, Histórico), cada aba na URL (`?aba=`) | A ficha 360 do PRD tem 9 blocos; numa página só vira rolagem infinita. Aba na URL deixa o suporte mandar o link ao colega |
| 2 | **Motivo uma vez por sessão, com confirmação a cada alteração** ("Motivo desta sessão: Solicitado pelo lojista (WhatsApp, 24/11)"), pré-preenchido no diálogo de cada mudança | O PRD exige motivo em toda edição e meta de 30 s por preço. Pedir motivo do zero 30 vezes custa ~8 s cada. Cada alteração continua gravando o motivo no `audit_log`. **Security/PO confirmam que isso cumpre "motivo em toda edição"** (pergunta 1) |
| 3 | Preço só aceita 4 motivos (lista fechada do PRD); o motivo da sessão que não vale para preço **é trocado no diálogo**, com a lista reduzida | Evita erro silencioso |
| 4 | **Ação sem permissão não aparece** (não fica cinza), e a aba mostra a faixa "Você pode ver, mas não editar." | WB-351 C3 e `design-system` §9. Cinza sem motivo gera chamado de suporte |
| 5 | **"Ver como o lojista" reaproveita a mesma moldura do lojista** e troca ações de escrita por uma etiqueta "só o lojista" (não-botão, sem foco), mantendo o layout idêntico | O suporte guia o lojista ao telefone ("toque em Aceitar") e precisa ver onde fica o botão; nada que altere dado existe como `<button>` (C1) |
| 6 | Auditoria mostra **antes e depois lado a lado, motivo e "Restaurar"** em preço e estoque | WB-354. Se o valor já mudou depois, o sistema avisa e pede confirmação (C2) |

## 1. Lista de lojas

Cabeçalho "Lojas" + busca + chips de filtro. Desktop: tabela. Celular (< 760): cada loja vira cartão de 2 a 3 linhas (padrão `.rt` do painel v3), **nunca rolagem lateral**.

| Componente | Conteúdo real |
|---|---|
| Busca | "Buscar por nome ou cidade" (`/` foca no desktop). Filtra ao digitar |
| Chips | Situação: Todas, Ativa, Em análise, Pausada, Suspensa. Atalhos: **"Sem produto publicado"** (ativa sem produto: é a loja a ativar; métrica "1º produto em 24 h") e **"Comissão própria"** |
| Colunas | Loja (nome, cidade · dono) · Situação (selo com ícone) · Produtos ativos (selo "Nenhum" em âmbar) · Vendas em 30 dias ("Sem pedidos") · Comissão (% + selo "Própria") |
| Contagem | "8 lojas" em região viva |

Estados: carregando (skeleton de 6 linhas), **vazio** ("Ainda não há lojas. As lojas aparecem aqui depois do cadastro."), **sem resultado de filtro** ("Nenhuma loja com esses filtros. Tire um filtro ou confira a escrita da busca." + "Limpar filtros"), erro ("Não conseguimos carregar agora. Tente de novo em instantes."), sem rede (faixa "Sem conexão. Mostrando o que já carregou."). Filtros e busca na URL. Paginação 25/50/100 no servidor.

## 2. Ficha da loja

Topo: nome (título), selo de situação, cidade e dono. Ações (só se o perfil pode): **"Ver como o lojista"**, **"Pausar loja"**. Abas abaixo.

| Aba | Conteúdo | Quem edita |
|---|---|---|
| **Resumo** (WB-350 C1, C3) | 5 números de 30 dias: vendas, pedidos, cancelamentos (com %), produtos ativos, comissão em vigor ("Própria desta loja" ou "Padrão da Webag"). Sem pedidos: "Sem pedidos nos últimos 30 dias." e dica se não há produto. Abaixo, **Dados da loja**: nome de exibição, WhatsApp, descrição, modos de entrega, política de trocas. Caixa fixa: "CNPJ, razão social, documentos e conta de recebimento só o lojista altera, pelo fluxo de análise." (C4: **não existe campo**). "Alterar situação da loja" | Super admin, Operação |
| **Catálogo** | Faixa roxa "Você edita como Webag. O lojista é avisado de preço, estoque, situação, horário e pausa. Motivo desta sessão: …" [Trocar motivo]. Lista de produtos (foto, nome, preço, estoque com "(2 reservadas)"), ações **"Alterar preço"** e **"Estoque"** por linha, **"Novo produto"** (abre o cadastro rápido com faixa "Cadastrando na loja Moda Morato como Webag"), "Editar em massa" (até 200 itens, WB-353 C6) | Super admin, Operação |
| **Horário e pausa** | Estado atual: "Loja aberta agora. Fecha às 18:00." ou "Loja pausada até 14:30 por Operação. Motivo: …" + "Reabrir agora". Tabela dos horários; "Editar horário" | Super admin, Operação |
| **Comissão** | Tabela de regras com vigência (padrão, categoria, loja); vale a mais específica. "Mudar comissão" abre diálogo com % e data de início e **prévia**: "Num pedido de R$ 100,00, a loja recebe R$ 86,01". Aviso: "O lojista é avisado por e-mail. Pedidos já feitos mantêm a comissão antiga." (DEC-081) | Super admin, Financeiro |
| **Histórico** (WB-350 C4, WB-354) | Filtros Tudo, Preço, Estoque, Horário, Acesso (+ autor e período no desktop). Cada linha: tipo e objeto, quando e **quem** (nome do admin; o lojista só vê "Webag"), caixas Antes (vermelho claro) e Depois (verde claro), motivo, "Restaurar" em preço e estoque. "Exportar CSV" (proteção de fórmula) | Ver: todos. Restaurar: Super admin, Operação |

## 3. Fluxos de edição

### 3.1 Alterar preço (WB-353 C1 a C3, C5)

Diálogo "Alterar preço: Camiseta básica preta": campo Novo preço (máscara), **prévia Antes/Depois com "Você recebe"**, Motivo (4 opções) + "Canal e data" quando "Solicitado pelo lojista" (ex.: "WhatsApp, 24/11"). Variação > 30% (`admin_preco_variacao_max_pct`): aviso âmbar "Mudança de 45%. Confira o valor novo antes de salvar." + caixa "Conferi o valor novo" (botão só confirma marcada). Botão: **"Alterar preço"**. Depois: toast "Preço alterado. O lojista foi avisado." com **"Desfazer"** (8 s). Conflito (C5): faixa no diálogo "O lojista alterou este produto agora." [Recarregar]; nada é sobrescrito.

### 3.2 Alterar estoque (C4)

Mesmo diálogo; abaixo do reservado: "Estoque menor que o reservado (3). Use 3 ou mais." (campo com erro; botão não confirma).

### 3.3 Pausar loja (WB-351 C1)

Diálogo "Pausar a loja": "A loja fecha para novos pedidos. Pedidos em aberto seguem." Duração (30 min, 1 h, **2 h** padrão, até reabrir) + motivo. Botão **"Pausar por 2 horas"** (verbo e duração). Resultado: faixa âmbar na aba, toast "Loja pausada. O lojista foi avisado no painel e por e-mail."

### 3.4 Alterar situação (RN-16)

Só as transições válidas da situação atual aparecem (ex.: ativa: "Suspender loja"). Motivo de 10 a 200 caracteres; botão repete o alvo: **"Suspender Moda Morato"** (destrutivo). Erro: "Informe o motivo (10 a 200 caracteres)."

### 3.5 Motivo da sessão (ReasonDialog)

Campo Motivo: Solicitado pelo lojista, Correção de erro, Moderação, Decisão operacional, Outro (com texto). "Solicitado pelo lojista" exige "Canal e data": "Informe o canal e a data." Sem motivo: o botão de salvar continua ativo e mostra "Informe o motivo" (WB-351 C2).

## 4. "Ver como o lojista" (WB-352)

1. Botão abre diálogo: "Você vai ver as telas da loja do jeito que o lojista vê, **sem poder alterar nada**. A abertura fica registrada com o seu nome e o motivo." Motivo obrigatório (Suporte ao lojista por telefone, Investigar um problema, Conferir o cadastro, Outro). [Cancelar] [Abrir visualização].
2. Abre a visão com **faixa fixa noite no topo**: olho + "Visualização do admin" + selo lima "Somente leitura" + loja e motivo + "Sair da visualização". A faixa **não rola para fora** e tem a cor do admin para ninguém confundir com a conta do lojista.
3. Pedidos: dado do cliente como o lojista vê (nome, telefone e endereço só em pedido ativo e por alguns dias depois; mascarados depois, RN-14): "M••••• S••••• · (11) •••••-••78 · Endereço oculto".
4. Ações de escrita: etiqueta "Aceitar e recusar: só o lojista" (sem botão, sem foco).
5. Sessão do admin expira: a visão fecha e vai ao login (C5). Tempo máximo de uma visualização: **30 min, renovável com novo motivo** `[proposta; Security decide]`.

## 5. Permissões por perfil (WB-355)

| Ação | Super admin | Operação | Financeiro | Suporte | O que a tela faz sem permissão |
|---|---|---|---|---|---|
| Ver ficha, histórico, "Ver como" | sim | sim | sim | sim | n/a |
| Editar dados, horário, pausa | sim | sim | não | não | Botões e campos **não aparecem**; campos viram texto desabilitado; faixa "Você pode ver, mas não editar." |
| Criar/editar produto, estoque | sim | sim | não | não | idem |
| Alterar preço | sim | sim (4 motivos) | não | não | idem |
| Alterar situação | sim | sim | não | não | idem |
| Alterar comissão | sim | não | sim | não | Aba Comissão em leitura: "Só Super admin e Financeiro mudam a comissão." |
| Exportar CSV do histórico | sim | sim (operacional) | sim | não | Botão ausente |

O servidor confere sempre (403); a tela só reflete. Perfil novo sem permissão explícita: nada aparece (C3). Tentativa negada vira "Você não tem acesso a essa área. Peça ao administrador para liberar o seu perfil." [Voltar ao painel].

## 6. Estados (ficha)

| Estado | Comportamento |
|---|---|
| Carregando | Skeleton do cabeçalho e dos 5 números; abas já visíveis |
| Vazio | Sem pedidos / sem produto (§2) |
| Erro | "Não conseguimos carregar esta loja agora. Tente de novo em instantes." [Tentar de novo] |
| Sem rede | Faixa; **edições ficam inertes com o motivo escrito** ("Conecte-se para editar. Nada foi alterado.") — admin não edita em fila local (dinheiro do lojista) |
| Sucesso | Toast com "Desfazer" quando reversível; histórico ganha a linha |
| Concorrência | §3.1 |

## 7. Acessibilidade

Abas com `role=tablist` ou links com `aria-current`; título da ficha é `h1`; tabelas com `<th scope>` e `caption` no celular via rótulo "label: valor". Selos com ícone + texto. Diálogos prendem o foco, Esc fecha, foco volta ao gatilho; foco inicial no primeiro campo. Faixa "Visualização do admin" com `role=status`. Alvos 44 a 48 px (botões `sm` do admin têm 44). Texto >= 16 px no celular. DiffView: leitor lê "Preço: antes R$ 52,00, depois R$ 49,90, motivo Solicitado pelo lojista".

## 8. Eventos

PRD: `admin_store_edited` (store_id, field_group, reason_code), `admin_view_as_opened`. Proponho: `admin_edit_undone`, `admin_restore_confirmed_conflict`, `admin_permission_denied` (acao).

## 9. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-350 C1 a C4 | §2 Resumo e Histórico; C2 §5 |
| WB-351 C1 a C6 | §3.3, §3.5, §5, §2 (C4: sem campo), §3.4 (C5), §3.1 (C6) |
| WB-352 C1 a C5 | §4 |
| WB-353 C1 a C8 | §3.1, §3.2, §2 Catálogo (C6, C8), §5 (C7) |
| WB-354 C1 a C3 | §2 Histórico (Restaurar, conflito, CSV) |
| WB-355 C1 a C3 | §5 |

## 10. Revisão heurística

**Nota 3 de 5** (tela grande, alta densidade, dinheiro de terceiros). AL-1 (sev. 3, H5): "Desfazer" de 8 s é curto para quem só percebe o erro depois; o "Restaurar" do histórico cobre, mas é 3 toques. AL-2 (sev. 3, H8): 5 abas + ações + motivo = muita coisa para o suporte (perfil "só ver"); no perfil suporte a ficha fica com 3 abas visíveis. AL-3 (sev. 2, H4): "Alterar situação" fica escondido em Resumo; mover para o menu da ficha. AL-4 (sev. 4 se ignorado, H5): preço com mudança < 30% que ainda é erro de dedo (R$ 49,90 para R$ 4,99 é 90%, pegaria; R$ 49,90 para R$ 39,90 não): a prévia "Você recebe" é a barreira. Bom: motivo pré-preenchido, antes/depois, ações ausentes sem permissão. **Teste:** operação trocando 5 preços (meta 30 s cada) e suporte guiando um lojista por telefone na visão espelho.

## 10b. Perguntas

| Para | Pergunta |
|---|---|
| PO / Security | 1. Motivo por sessão atende "motivo em toda edição"? 2. "Ver como": tempo máximo e se grava as telas abertas ou só a abertura 3. Aviso ao lojista é imediato ou resumo a cada N min quando o admin edita 30 produtos? 4. Aba Comissão: faltam regras por categoria na prévia (RN-10) |
| tech-lead | 5. Visão espelho: mesma página com modo somente leitura ou páginas espelho? (muda o custo de manter) 6. Versão por produto para o conflito de edição |
| backend-dev | 7. Edição em massa de 200 itens: 1 aviso ao lojista ou 200? |
| CEO | 8. Suporte pode pausar loja em emergência? (hoje não, RN-13) |
