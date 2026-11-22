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
| 5 | **"Ver como o lojista" reaproveita a mesma moldura do lojista** e troca ações de escrita e menus fora da lista por uma etiqueta "Só o lojista" (não-botão, sem foco), mantendo o layout idêntico. Nível **visualizador** (DEC-119, DEC-120): nenhum dado pessoal de cliente, nem em pedido ativo (§4) | O suporte guia o lojista ao telefone ("toque em Aceitar") e precisa ver onde fica o botão, não o telefone do cliente; nada que altere dado existe como `<button>` (C1) |
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

## 4. "Ver como o lojista" (WB-352, nível visualizador)

> Reescrito em 2026-11-22 conforme DEC-119 a DEC-121, WB-352 C2 e C8 a C15 e `seguranca/threat-model-v1-1.md` §14. Protótipo: `#/a/ver-como?aba=ped|prod|troca|aval|loja|mais` (barra do protótipo: "Faltam 5 min" e "Terminou") e `#/a/pedido?n=E-2031`. **Mudou:** antes a visão espelhava a regra do lojista (RN-14: telefone e endereço em pedido ativo); agora o admin é "visualizador" fixo e dado de cliente só existe na ficha do pedido (§4.6).

**Posição crítica (custo para o suporte).** O suporte perde o telefone do cliente na visão. Isso é correto: o que ele precisa para guiar o lojista é ver onde fica o botão, e não o contato. O custo real é o caso "o cliente não atende": o caminho é a ficha do pedido (outra aba, auditada) e o canal da Webag, 2 toques a mais. `[HIPÓTESE]` medir no piloto quantas vezes o suporte abre a ficha a partir da visão; DEC-121 já fixa o gatilho (3 casos sem solução) para rever.

### 4.1 O que a visão mostra e o que não mostra

| Tela da visão | Aparece | Não aparece (a API já não envia: o dado não está na tela, nem escondido) |
|---|---|---|
| Pedidos | Número, **primeiro nome e bairro**, itens, preços, totais, status, linha do tempo, hora | Sobrenome, telefone, e-mail, CPF, rua, número, complemento, CEP, observação do cliente, código de entrega. **Sem máscara** (nada de "M••••• S•••••" ou "(11) •••••-••78": máscara revela tamanho e formato). Vale também para pedido ativo |
| Trocas | Motivo (código), status, prazo, itens | Texto livre e fotos do cliente, dados de reembolso |
| Produtos | Foto, nome, preço, estoque, status | "Você recebe", comissão e tarifa |
| Dados da loja | Nome, situação, categorias, horário, pausa, entrega, retirada, política de troca | CPF/CNPJ, razão social, comissão, conta de recebimento, contato de notificação |
| Avaliações | O mesmo que a vitrine pública | n/a |

Campo que não aparece **não ganha placeholder** (sem "oculto", sem traço). Cada lista traz uma linha de ajuda que diz o que falta e por quê (microcopy em 4.3).

### 4.2 Abrir a visualização (diálogo)

| Elemento | Conteúdo |
|---|---|
| Título e texto | "Ver como o lojista". "Você vai ver as telas da loja do jeito que o lojista vê, **sem poder alterar nada**. Dados pessoais de clientes não aparecem. A abertura fica registrada com o seu nome e o motivo." |
| Regra do tempo (item 5) | "Dura até 30 minutos e não renova. Para continuar depois, abra de novo." |
| Aviso, se já há visão aberta (C10) | Nota âmbar: "Você já tem uma visualização aberta. Abrir esta fecha a anterior." (uma visão ativa por admin, mesma loja ou outra) |
| Motivo | Lista com placeholder "Escolha o motivo": Suporte ao lojista por telefone, Investigar um problema, Conferir o cadastro, Outro. "Outro" abre "Descreva o motivo (até 200 caracteres)". Foco inicial na lista |
| Botões | [Cancelar] [Abrir visualização] |

| Estado do diálogo | Comportamento e texto |
|---|---|
| Sem motivo (422) | Erro inline na lista: "Escolha o motivo para abrir." Foco no campo. Em "Outro" sem texto: "Descreva o motivo em poucas palavras." |
| Abrindo | Botão vira "Abrindo…", desabilitado, `aria-busy`; nada abre antes da linha de auditoria existir (C9) |
| Limite (429, C10) | Faixa de erro no diálogo: "Muitas aberturas. Tente em alguns minutos." Botão volta ativo; sem contagem regressiva inventada |
| Erro de rede ou 5xx | "Não conseguimos abrir a visualização agora. Tente de novo em instantes." O diálogo fica aberto com o motivo preenchido |
| Sem conexão | "Sem conexão. A visualização não abriu. Conecte-se e tente de novo." |
| Sem permissão (403) | "Você não tem acesso a essa área. Peça ao administrador para liberar o seu perfil." (§5) |
| Reabrir depois de terminar | Motivo **vem preenchido** com o anterior e a linha "Mesmo motivo da visualização anterior. Troque se mudou." `[proposta; Security decide: o PRD diz "novo motivo". Preencher mantém a confirmação ativa e evita 4 toques no meio de uma ligação; se Security exigir escolha nova, tirar o preenchimento]` |

### 4.3 Dentro da visão

**Banner permanente (C1).** Barra fixa no topo, cor noite (`--noite`, a do admin, para ninguém confundir com a conta do lojista), sempre visível: olho + **"Visualizando como Moda Morato (somente leitura)"** + cronômetro + botão lima **"Sair da visualização"**. Não rola para fora e existe em todos os estados da visão (carregando, vazio, erro, sem rede). Em tela estreita quebra em duas linhas; a 200% de fonte cresce, nunca corta.

| Cronômetro | Texto e forma |
|---|---|
| Mais de 5 min | Selo lima com relógio: "Restam 28 min" (minutos cheios, numerais tabulares; só muda a cada minuto, para não distrair) |
| 5 min ou menos | Selo **âmbar** com relógio (a cor não é a única pista: o texto também mostra o valor) e anúncio único: "A visualização fecha em 5 minutos." |
| Último minuto | "Restam 0:45", contando segundos; anúncio único "A visualização fecha em 1 minuto." |
| Fim | Tela "A visualização terminou" (4.4) |

O tempo é **absoluto**: não desliza com o uso e não renova (C6, C11). Tocar em "Sair da visualização" encerra na hora (a credencial deixa de valer), volta à ficha da loja e mostra o toast "Visualização encerrada." O motivo e a hora de abertura **não** ficam no banner (quem está ao lado do suporte não precisa ver a nota do admin); estão no Histórico, filtro Acesso.

**Menu: a mesma moldura do lojista** (decisão 5), com os itens fora da lista fechada trocados por etiqueta, nunca por botão:

| Item | Na visão |
|---|---|
| Pedidos, Produtos | Abrem (barra inferior) |
| Mais, com Trocas, Avaliações, "Dados da loja, horário e política de troca" | Abrem |
| Início, Financeiro (barra inferior) | Texto inerte com a etiqueta **"Só o lojista"** embaixo do rótulo. Não é link, não recebe foco |
| Equipe e convites, Cupons, Conversa com clientes, Documentos, Comanda, Notificações da loja, Exportações (dentro de Mais) | Linha inerte com selo cadeado **"Só o lojista"** |

`[PERGUNTA ao PO/Security]` "Início" (painel de vendas) não está entre as 13 rotas da lista fechada (§14.4); tratei como "Só o lojista". Se o suporte precisar da contagem de pedidos, entra por `countStoreOrders` com parecer do Security. A visão abre direto em **Pedidos**.

**Pedidos.** Cartão: "Pedido E-2031" + selo de status (ícone + texto); "**Mariana** · Centro"; itens ("2x Camiseta básica preta"); "R$ 99,80 · Recebido às 14:02"; etiqueta "Aceitar e recusar: só o lojista" (pedido novo) ou "Marcar como entregue: só o lojista" (saiu); link "Ficha na Webag (outra aba)" (4.6). Linha de ajuda acima da lista: "Nome completo, contato, endereço e observações do cliente não aparecem nesta visualização. Para falar com o cliente, abra a ficha do pedido pelo número." Pedido entregue, ativo ou novo: **mesma forma** (RN-14 não vale aqui).
**Trocas.** "Troca T-118" + status; "Pedido E-2024 · 1x Camiseta básica branca"; "Motivo: Tamanho não serviu"; prazo. Ajuda: "O texto e as fotos do cliente não aparecem nesta visualização."
**Produtos.** Linha: foto, nome, "R$ 49,90 · 15 em estoque", selo "Só o lojista" no lugar do botão de estoque. Ajuda: "Alterar preço e estoque: só o lojista." **Sem** "Você recebe" nem comissão.
**Dados da loja.** Lista nome/valor (Loja, Horário, Pausa, Entrega e retirada, Política de troca) e nota: "CNPJ, razão social, comissão, conta de recebimento e contatos de notificação não aparecem nesta visualização." **Sem** CPF/CNPJ nem razão social.
**Avaliações.** Resumo e lista como na vitrine; ajuda "Igual ao que os clientes veem na vitrine."

Sem tempo real: a visão atualiza por consulta periódica (§14.4). Não anunciar "atualizado agora"; o suporte puxa para atualizar.

### 4.4 Estados da visão

| Estado | Comportamento e texto |
|---|---|
| Carregando | Banner já visível com o cronômetro; skeleton de 5 linhas no corpo (o tempo corre durante o carregamento) |
| Vazio (por tela) | Pedidos: "Nenhum pedido nesta loja ainda" / "Quando a loja receber pedidos, eles aparecem aqui." Produtos: "Nenhum produto nesta loja" / "Quando a loja cadastrar produtos, eles aparecem aqui." Trocas: "Nenhuma troca aberta" / "Quando um cliente pedir troca, ela aparece aqui." Avaliações: "Ainda sem avaliações" / "Quando um cliente avaliar, aparece aqui." |
| Erro | "Não conseguimos carregar esta tela" / "Tente de novo em instantes. O tempo da visualização continua correndo." [Tentar de novo] |
| Sem conexão | Faixa padrão "Sem conexão. Mostrando o que já carregou." + nota âmbar "O tempo da visualização continua correndo." (H1: o tempo não pausa) |
| Fora da lista (403 `VIEW_AS_READ_ONLY`) | Nunca vira tela de erro: o item já nasce com a etiqueta "Só o lojista". Se um link antigo cair numa rota fora da lista: o corpo mostra o selo "Só o lojista" e "Esta parte é só do lojista." |
| **A visualização terminou** (30 min, `VIEW_AS_EXPIRED`, C11) | Sai o banner; nenhum dado fica na tela. Moldura do admin; título "Ver como o lojista"; ícone de relógio; "**A visualização terminou**" / "Por segurança, ela dura 30 minutos e não renova. Abra de novo para continuar. A nova abertura fica registrada com o motivo." [Abrir de novo] (abre o diálogo 4.2 com o motivo anterior) · link "Voltar para a ficha da loja". Foco vai para o título; leitor de tela anuncia o texto (`role=status`) |
| Visão substituída | Quando o admin abre outra visão (outra aba), a primeira mostra o mesmo "A visualização terminou" e, na linha de ajuda, "Você abriu outra visualização." |
| Sessão do admin expirou (C5) | A visão fecha junto e vai ao login; ao voltar, abre a ficha da loja, sem visão |

### 4.5 Códigos da API e o que a tela diz

| `code` (HTTP) | Mensagem | Ação |
|---|---|---|
| `VIEW_AS_EXPIRED` (403) | "A visualização terminou. Abra de novo para continuar." | [Abrir de novo] |
| `VIEW_AS_READ_ONLY` (403) | "Esta parte é só do lojista." | Nenhuma; etiqueta "Só o lojista" |
| Muitas aberturas (429) | "Muitas aberturas. Tente em alguns minutos." | [Fechar] |
| Motivo ausente (422) | "Escolha o motivo para abrir." | Foco no campo |
| Permissão (403 na abertura) | "Você não tem acesso a essa área. Peça ao administrador para liberar o seu perfil." | [Voltar ao painel] |
| Desconhecido ou 5xx | "Não conseguimos abrir a visualização agora. Tente de novo em instantes." | [Tentar de novo] |

Nunca mostrar `code`, nome de cabeçalho nem a lista de campos retirados além do texto das linhas de ajuda.

### 4.6 Tela: Ficha do pedido (admin)   (WB-108 C2; WB-352 C14)

**Objetivo do usuário nesta tela:** entender o pedido e saber como falar com o cliente, sem ver dado pessoal completo. Rota `#/a/pedido?n=<número>`. Entra pela busca "Número do pedido" da lista de pedidos do admin (M1, `onda-5-posvenda.md`) ou pelo link "Ficha na Webag (outra aba)" da visão. **Abre em outra aba**, para o suporte não perder a visão de 30 min. Todo perfil abre (`orders:read`).

**Layout (de cima para baixo):**
1. Cabeçalho: voltar, `h1` "Pedido E-2031".
2. Nota azul (`info`, ícone escudo): "**Dados do cliente protegidos.** Mostramos só uma parte do nome, do e-mail e do celular. Esta abertura ficou registrada com o seu nome." (diz a verdade: a linha de auditoria existe antes do dado, C14).
3. Linha: "Moda Morato · Recebido às 14:02, há 12 min" + selo de status (ícone + texto).
4. **Cliente:** Nome "Mariana S." · E-mail "m*****@g****.com" · Celular "(11) 9****-5678". Ajuda: "Para falar com o cliente, use o canal da Webag: suporte Webag ou o operador de entrega. Não peça nem copie o contato completo." Não há "Revelar" (DEC-071, DEC-121).
5. **Entrega:** Bairro "Centro" · Cidade "Francisco Morato, SP". Ajuda: "Rua, número e complemento não aparecem aqui." Pedido de retirada: "Retirada na loja" no lugar do bloco.
6. **Itens:** "2x Camiseta básica preta · R$ 99,80".
7. **Pagamento:** forma e quando ("PIX, pago às 14:02"), subtotal, frete ("Grátis" ou valor), total. Valores de comissão e repasse seguem a M1 e só para quem a M1 já autoriza.
8. **Linha do tempo:** hora + evento, do mais antigo ao mais novo ("14:02 Pagamento confirmado").
9. Ações do perfil (cancelar, estornar): como M2, só aparecem se `allowedActions` permitir; não são desta spec.

**Interações:** rolagem única; sem edição de dado pessoal. Abrir a ficha de novo grava nova linha de auditoria.

| Estado | Texto |
|---|---|
| Carregando | Skeleton de 6 blocos; a nota de proteção só aparece quando o dado chega (não prometer registro antes dele) |
| Pedido não encontrado (404 ou número errado) | "Não encontramos o pedido E-2031" / "Confira o número e busque de novo." [Voltar para as lojas] |
| Erro | "Não conseguimos abrir este pedido" / "Tente de novo em instantes. Nada foi alterado." [Tentar de novo] |
| Sem conexão | Faixa "Sem conexão. Mostrando o que já carregou." Sem a nota de registro novo se a ficha veio do cache |
| Sem permissão (403) | "Você não tem acesso a essa área. Peça ao administrador para liberar o seu perfil." [Voltar ao painel] |
| Atenção | Se `disputedAt` ou `notReceivedAt`: nota âmbar no topo "O cliente disse que não recebeu o pedido." ou "O pagamento foi contestado." |
| Sucesso | n/a (leitura) |

**Acessibilidade:** `h1` do pedido; cada bloco é `section` com `h2`; Cliente e Entrega como lista de definição (nome/valor); o valor mascarado é lido como está, e a ajuda abaixo explica; selos com ícone e texto; linha do tempo em lista ordenada; contraste AA; alvos 44 px. **Android x iOS:** n/a (web do admin).

### 4.7 Acessibilidade da visão

Banner: `role=region` com rótulo "Visualização do admin" (não `role=status`, que leria o relógio a cada atualização). Cronômetro com `role=timer` e rótulo "Tempo restante da visualização: 12 minutos" (atualizado por minuto); avisos aos 5 min e 1 min numa região `aria-live=polite` separada. Banner sticky não pode cobrir o campo focado (WCAG 2.4.11): `scroll-padding-top` igual à altura do banner. Itens "Só o lojista": texto estático, sem `tabindex`; o leitor lê "Financeiro, Só o lojista". Etiqueta nunca depende só de cor (cadeado + texto). Barra inferior: rótulo 12 px já é o padrão do lojista; os demais textos >= 16 px no celular. Diálogo: foco inicial na lista de motivo, Esc fecha, foco volta ao botão.

### 4.8 Eventos de analytics (com o PO)

`admin_view_as_opened` (store_id, reason_code, reabertura: sim/não), `admin_view_as_closed` (causa: saiu, expirou, substituída, sessão; duração; leituras), `admin_view_as_denied_ui` (o que o suporte tentou: rótulo da etiqueta), `admin_order_sheet_opened` (origem: busca ou visão; order_id; **sem nome nem contato**). Nunca enviar nota do motivo nem dado de cliente a analytics.

### 4.9 O que mudou desta versão e por quê

| Antes | Agora | Por quê |
|---|---|---|
| Nome, telefone e endereço em pedido ativo | Primeiro nome e bairro, sempre | DEC-120: a visão abre a loja para 4 perfis, sem registro por pedido |
| "Dados mascarados depois de alguns dias" | Sem máscara: o campo some | Máscara mostra tamanho e formato; menos coisa a manter |
| 30 min "renovável com novo motivo" | 30 min, sem renovação, abre outra | C6, C11; uma visão ativa por admin |
| Banner com motivo e hora | Banner com loja, "somente leitura" e tempo restante | Motivo é nota do admin; o tempo é o que o suporte precisa saber |
| Só Pedidos e Produtos | Pedidos, Produtos, Trocas, Avaliações, Dados da loja; o resto com "Só o lojista" | As 13 rotas da lista fechada; o suporte vê onde cada coisa fica |

## 5. Permissões por perfil (WB-355)

| Ação | Super admin | Operação | Financeiro | Suporte | O que a tela faz sem permissão |
|---|---|---|---|---|---|
| Ver ficha, histórico, "Ver como" (visualizador, §4) e ficha do pedido (§4.6) | sim | sim | sim | sim | n/a |
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

Abas com `role=tablist` ou links com `aria-current`; título da ficha é `h1`; tabelas com `<th scope>` e `caption` no celular via rótulo "label: valor". Selos com ícone + texto. Diálogos prendem o foco, Esc fecha, foco volta ao gatilho; foco inicial no primeiro campo. Banner da visão: ver §4.7 (`role=region`, cronômetro `role=timer`). Alvos 44 a 48 px (botões `sm` do admin têm 44). Texto >= 16 px no celular. DiffView: leitor lê "Preço: antes R$ 52,00, depois R$ 49,90, motivo Solicitado pelo lojista".

## 8. Eventos

PRD: `admin_store_edited` (store_id, field_group, reason_code), `admin_view_as_opened`. "Ver como" e ficha do pedido: §4.8. Proponho: `admin_edit_undone`, `admin_restore_confirmed_conflict`, `admin_permission_denied` (acao).

## 9. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-350 C1 a C4 | §2 Resumo e Histórico; C2 §5 |
| WB-351 C1 a C6 | §3.3, §3.5, §5, §2 (C4: sem campo), §3.4 (C5), §3.1 (C6) |
| WB-352 C1 a C13, C15 (C15 é da R1.3) | §4.1 a §4.5, §4.7 |
| WB-352 C14 (ficha do pedido) | §4.6 |
| WB-353 C1 a C8 | §3.1, §3.2, §2 Catálogo (C6, C8), §5 (C7) |
| WB-354 C1 a C3 | §2 Histórico (Restaurar, conflito, CSV) |
| WB-355 C1 a C3 | §5 |

## 10. Revisão heurística

**Nota 3 de 5** (tela grande, alta densidade, dinheiro de terceiros). AL-1 (sev. 3, H5): "Desfazer" de 8 s é curto para quem só percebe o erro depois; o "Restaurar" do histórico cobre, mas é 3 toques. AL-2 (sev. 3, H8): 5 abas + ações + motivo = muita coisa para o suporte (perfil "só ver"); no perfil suporte a ficha fica com 3 abas visíveis. AL-3 (sev. 2, H4): "Alterar situação" fica escondido em Resumo; mover para o menu da ficha. AL-4 (sev. 4 se ignorado, H5): preço com mudança < 30% que ainda é erro de dedo (R$ 49,90 para R$ 4,99 é 90%, pegaria; R$ 49,90 para R$ 39,90 não): a prévia "Você recebe" é a barreira. Bom: motivo pré-preenchido, antes/depois, ações ausentes sem permissão. **Teste:** operação trocando 5 preços (meta 30 s cada) e suporte guiando um lojista por telefone na visão espelho.

## 10b. Perguntas

| Para | Pergunta |
|---|---|
| PO / Security | 1. Motivo por sessão atende "motivo em toda edição"? 2. ~~"Ver como": tempo máximo e se grava as telas abertas~~ **Resolvida** (30 min sem renovação, só a abertura, DEC-119; WB-352 C9). **Aberta:** reabrir com o motivo anterior preenchido (§4.2) e "Início" fora da lista (§4.3) 3. Aviso ao lojista é imediato ou resumo a cada N min quando o admin edita 30 produtos? 4. Aba Comissão: faltam regras por categoria na prévia (RN-10) |
| tech-lead | 5. Visão espelho: mesma página com modo somente leitura ou páginas espelho? (muda o custo de manter) 6. Versão por produto para o conflito de edição |
| backend-dev | 7. Edição em massa de 200 itens: 1 aviso ao lojista ou 200? |
| CEO | 8. Suporte pode pausar loja em emergência? (hoje não, RN-13) |
