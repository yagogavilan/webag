# Revisão visual final das capturas oficiais (v1.0)

> Autor: product-designer. Data: 2026-11-20. Escopo: as 70 imagens de `docs/telas/` (índice em `docs/telas/README.md`), abertas uma a uma. Régua: `docs/design/direcao-v3.md` (P1 a P7, §4), `kit-marca-v3.md`, DEC-040 a DEC-054, e os achados H-xx de `heuristica-nielsen.md` / T1-T4 de `usabilidade-4-tarefas.md`.
> Escala (a mesma do relatório anterior): 0 não é problema | 1 cosmético | 2 menor | 3 maior (entra na Onda 8 visual) | 4 bloqueia a publicação.
> Dono: `mobile-dev` = apps/mobile; `web` = apps/web (painéis e site; mesmo agente, mas separado para o PM). Seed = `apps/api/seed`.
> `[HIPÓTESE]` = depende de confirmar no código ou em aparelho. **Limites desta revisão:** só pixels (não rodei o app; abri o código apenas para confirmar o placeholder do site e a origem do seed); sem fotos reais (S3 ausente, README) e sem Android/iOS em aparelho; datas e horas do seed distorcem alguns estados.

## 1. Tabela por imagem

### App do cliente (390x844)

| Arquivo | Estado | Defeito concreto | Sev | Correção | Dono |
|---|---|---|---|---|---|
| 01-app-inicio | defeito | Banner do seed "Frete grátis acima de R$ 50" com selo "FRETEGRATIS" (código cru em caixa-alta como selo): contradiz HIP-L12 (frete grátis desligado no lançamento) e aparece na 1ª tela oficial. Categorias: "Farmácia" usa a mesma cesta (azul) e Pet/Casa usam objetos diferentes: 4 categorias, 3 objetos, nenhum de farmácia. "Casa e cons" cortado sem indício de rolagem. Cumprido: topo da 1ª loja visível (y 649), hero compacto | 2 | Seed troca o banner (cupom de boas-vindas, selo com texto humano, nunca o código); objeto de farmácia do kit em Farmácia; esmaecer a borda direita da faixa de categorias; não usar esta captura nas vitrines das lojas até trocar | mobile-dev (+ seed) |
| 02-app-busca | defeito | 60% da tela vazia; 7 pílulas com contorno roxo (sinal nº 3 da v3, "pílula em tudo") quando a Início já tem o padrão objeto + nome: dois padrões para a mesma coisa; sem sugestões nem recentes (o README promete histórico) | 2 | Grade de 2 colunas com o mesmo componente de categoria da Início; "Buscas recentes" só se houver; ícone da aba ativa sem disco lilás | mobile-dev |
| 03-app-resultados | ok com ressalva | "Fechada" em todos os produtos sem dizer quando abre; todos com a mesma cesta marrom (ver G1); preço em 14 px, mais fraco que o nome | 1 | "Fechada · abre 7h" ou ocultar o selo quando a loja abre em breve; fallback por categoria (G1) | mobile-dev |
| 04-app-loja | defeito | **Nenhum produto na 1ª tela**: capa 220 + título em 2 linhas + faixa azul 130 + tabela de estatísticas + 2 chips + 3 links; "Destaques" só em y 790. Com entrega fechada a tabela mostra dois "—" como valor, "Entrega volta amanhã às 9h" aparece 3 vezes (faixa, estatística e chip), e "entrega Webag" encosta no fio da coluna | 3 | Fundir faixa e estatísticas (1 só vez o aviso); esconder estatística sem valor; título de loja em 36 px; ver V8.6 | mobile-dev |
| 05-app-produto | ok | Preço-herói 68 px funciona; botão com valor. "Novo" com ícone de estrela (estrela = nota, confunde); arte é a cesta verde para um sabonete (G1) | 1 | Ícone de "novo" que não seja estrela; fallback por categoria | mobile-dev |
| 06-app-sacola | defeito | Linha da loja com o glifo cinza de "imagem" (H-10 persiste só no logo da loja; os produtos já têm objeto); "Peça também" são 3 cestas iguais; entrega x retirada não aparece (só no checkout) | 2 | Inicial da loja em quadrado (como em Pedidos: "FS") no lugar do glifo; G1 | mobile-dev |
| 07-app-checkout-pix | ok com ressalva | Retirada sem o endereço da loja antes de pagar (só aparece depois); PIX já vem marcado, em cartão rosado e com "Aprovação na hora" (DEC-052: PIX é um meio entre outros, sem destaque); resumo bom, barras de divisor como na v3 | 2 | Mostrar "Retire em <endereço>" na linha de Retirada; tirar "Aprovação na hora" ou dar a mesma linha de apoio a todos os meios | mobile-dev |
| 08-app-checkout-cartao | ok | Aviso do cartão claro (cadeado + MP). Cadeado lilás duotone fica abaixo de 3:1 (G4) | 1 | Camada principal do ícone em roxo ação | mobile-dev |
| 09-app-pix | ok com ressalva | Cronômetro de 56 px é o herói e "14:59" aparece 2 vezes (anel e "Vence em"); código truncado com "…"; o "Copiar código" só no rodapé; cartão "Como pagar" em lilás pastel (> 10% da área, contra P2) | 1 | Um só "14:59"; cartão "Como pagar" em branco com fio; manter "Copiar código" (já é primário) | mobile-dev |
| 10-app-pedido-confirmado | defeito | Em pedido de **retirada** o aviso diz "Quer ser avisado quando o pedido sair?" (retirada não "sai": fica pronto). Celebração boa (lima, "Pedido feito.", código de retirada como herói) | 2 | Copy por tipo: retirada = "quando estiver pronto"; entrega = "quando sair" | mobile-dev |
| 11-app-acompanhamento | defeito | Faixa "20:50 – 21:15" quebra em 2 linhas (direção §8b pede 1 linha, 52 px); "Saiu para entrega 15:16" contra chegada às 20:50 (dado do seed, 5 h de diferença) | 2 | `numberOfLines={1}` + `adjustsFontSizeToFit` ou 44 px nos dígitos; ajustar o seed da captura | mobile-dev (+ seed) |
| 12-app-acompanhamento-atrasado | ok | "ATRASADO" com ícone + texto, "Passou 40 min. Já estamos cuidando disso." e as duas saídas; sem promessa de compensação. Dois botões de contorno com o mesmo peso (aceitável: decisão do cliente) | 0 | Nenhuma | - |
| 13-app-pedidos | defeito | Dois títulos gigantes empilhados ("Pedidos" 48 e "Em andamento" 32); "Ajuda" repetido em toda linha (H-13 persiste) e linha de ~160 px para 3 informações; selo em pílula azul; sem "Chega entre" (pendente do backend, U8.5) | 2 | "Em andamento" em 20 px; "Ajuda" só no detalhe; selo só texto + ícone; quando o contrato trouxer `eta`, a faixa vira a 2ª linha | mobile-dev |
| 14-app-troca | ok | Item, motivo e prazo claros; "Hoje você paga R$ 0,00." Faixa azul "i" pastel é o componente padrão de template, mas é feedback legítimo. O botão "Pedir troca" está ativo sem motivo escolhido (confirmar que valida e diz o quê) | 1 | Desabilitar até escolher o motivo, ou mensagem "Escolha o motivo" | mobile-dev |
| 15-app-conta | ok | Lista padrão e limpa; é a tela mais "de template" do app, aceitável para Conta | 1 | Polir: nada | - |
| 16-app-cupons | ok | Cupom de compensação com validade do servidor; sem promessa extra | 0 | Nenhuma | - |
| 17-app-licencas | defeito leve | "Ver licença / Ver o projeto" recuados ~20 px da borda do texto do cartão | 1 | Alinhar à esquerda do conteúdo | mobile-dev |
| 18-app-exclusao-de-conta | defeito | Ícones lilás duotone com camada principal em `#E198EC` sobre papel: contraste calculado 2,0:1 (a v3 exige 3:1 em ícone informativo) e tamanhos óticos diferentes (cadeado largo, pessoa pequena); título repetido (barra de topo + H1 de 48 px) | 2 | Camada principal em roxo ação (6,0:1) e a lilás só de fundo; remover o título da barra ou o H1 | mobile-dev |

### Painel do lojista (1440x900 e 390x844)

| Arquivo | Estado | Defeito concreto | Sev | Correção | Dono |
|---|---|---|---|---|---|
| 19-lojista-inicio-desktop | defeito | "Resumo do cadastro" (CPF, "Documentos: 0 enviados") em loja **aprovada** (H-23 persiste, e "0 enviados" contradiz "Aprovada"); miniatura em branco em "Mais vendidos" (sem foto, sem fallback); cabeçalho roxo de 190 px (H-22) | 2 | Trocar o card por "Primeiros passos" ou remover; fallback de imagem (V8.3); cabeçalho compacto fora do Início | web |
| 19-lojista-inicio-mobile | ok | Banner noite "1 pedido novo" + botão lima funciona. "Pausar ou ajustar" sublinhado sozinho numa linha (vocabulário de web) | 1 | Botão de texto sem sublinhado, na mesma linha do estado | web |
| 20-lojista-pedidos-novos-desktop | defeito | Código "WB-DM002" é o maior texto do cartão (H-25 persiste); 3 pílulas por cartão; todo tempo em vermelho "há 3 h 28 min" (seed) e nada se prioriza; "Novos" só começa em y 400 por causa do cabeçalho (H-22) | 2 | Itens como título, código em legenda; só a pílula de status; cor só após o limite de atraso | web |
| 20-lojista-pedidos-novos-mobile | ok | U8.7 cumprida: "Aceitar pedido" e "Recusar" na 1ª tela, sem barra por cima. Aba "Prontos (2" cortada sem indício de rolagem | 1 | Esmaecer a borda das abas | web |
| 21-lojista-produtos-desktop | defeito | **Ícone de imagem quebrada do navegador** nas 6 linhas; "Editar" é só texto sem affordance de botão | 3 | Fallback no `onError` com o objeto do kit; "Editar" como botão de texto roxo; ver V8.3 | web |
| 21-lojista-produtos-mobile | defeito | ~330 px por produto: 1 produto por tela (6 produtos = 2000 px); checkbox sozinho numa linha; miniatura quebrada; botão "Adicionar produto" fixo cobre a 2ª linha. Tarefa central do lojista no celular (pausar/ajustar estoque) | 3 | Linha compacta de 88 px (foto, nome, preço, estoque, interruptor); seleção em lote só em modo "Selecionar"; ver V8.7 | web |
| 22-lojista-produto-voce-recebe-desktop | defeito | Miniatura da capa quebrada com o texto alternativo "Capa 1 (capa)" vazando por cima; "Remover" e "Tirar foto" empilhados com ~60 px de vão ("Tirar foto" não faz sentido no desktop); parágrafo do preço com entrelinha dupla; "Você recebe R$ 5,52 (estimado)" está claro | 3 | Placeholder "Sem foto" com ação "Adicionar"; ações em linha; entrelinha 1,5; ver V8.3 | web |
| 22-lojista-produto-voce-recebe-mobile | ok | Valor líquido legível; "Quero receber um valor" desalinhado 18 px à direita do rótulo; barra "Salvar" cobre o campo Estoque na rolagem (esperado) | 1 | Alinhar o link | web |
| 23-lojista-trocas-desktop | ok | Cartão claro; miniatura com glifo de imagem (G1); cabeçalho de 190 px | 1 | G1, G3 | web |
| 23-lojista-trocas-mobile | ok | Sem defeito além do glifo de imagem | 0 | - | - |
| 24-lojista-avaliacoes-desktop | ok | Uma das melhores telas: barras lima na faixa noite, resposta com fio roxo. Filtros em pílula (sinal 3) | 1 | Filtros como abas de texto | web |
| 24-lojista-avaliacoes-mobile | defeito leve | "Respondidas" quebra sozinho para a 2ª linha | 1 | Rolagem horizontal ou abas | web |
| 25-lojista-financeiro-desktop | defeito leve | O herói é "Vendas"; "Você recebe" (o que o lojista leva, DEC-074e) é o menor dos três; "Ticket médio" é jargão (H-26); cartão com vazio embaixo | 1 | "Você recebe" como herói; "Valor médio por pedido" | web |
| 25-lojista-financeiro-mobile | defeito leve | Chip "Este mês" quebra para a 2ª linha | 1 | Rolagem horizontal | web |
| 26-lojista-minha-loja-desktop | defeito | **Contradição de estado:** "Loja fechada agora" com opções de pausa ("30 min, 1 h, 2 h, até o fim do dia") e botão "Pausar loja", enquanto o Início diz "Loja no ar" e há pedido esperando. Não dá para pausar o que está fechado. Cabeçalho roxo vazio com o título dentro do cartão (as outras telas põem o título no roxo); "Titular ***.***.***-**" todo mascarado sem utilidade `[HIPÓTESE: o horário da loja foi alterado na captura (README); confirmar no app]` | 3 | Um só estado da loja (aberta, fechada pelo horário, pausada) com a ação certa em cada um; ver V8.5 | web |
| 26-lojista-minha-loja-mobile | defeito | Mesma contradição "Loja fechada agora" + "Pausar loja" | 3 | V8.5 | web |
| 27-lojista-cadastro-desktop | defeito | Primeira impressão do lojista é uma página branca sem bloco de marca: 3 vantagens flutuam à esquerda sem título, 400 px de vazio; logo e "Já tem conta? Entrar" a 16 px da borda, fora da grade. Parece template de formulário | 2 | Cabeçalho roxo com corte diagonal e título "Venda no Webag" no lugar do vazio; vantagens como lista sob o título; conteúdo na grade de 1120 px | web |
| 27-lojista-cadastro-mobile | ok | Curto e legível; sem nenhum traço de marca além do logo | 1 | Bloco roxo curto no topo | web |
| 28-lojista-revisao-desktop | defeito | 3 miniaturas idênticas de documento (ícone, sem nome) e cabeçalho roxo vazio de 190 px; o lojista não vê o que enviou | 2 | Nome do arquivo e tipo sob cada miniatura | web |
| 28-lojista-revisao-mobile | defeito leve | Faixa cinza atrás do botão fixo (cor diferente do cartão); chip "Cadastro em andamento" quebra em 2 linhas | 1 | Fundo do rodapé = fundo da página; chip só "Em andamento" | web |

### Painel admin (1440x900 e 390x844)

| Arquivo | Estado | Defeito concreto | Sev | Correção | Dono |
|---|---|---|---|---|---|
| 29-admin-inicio-desktop | defeito | "Super admin" 3 vezes (selo, pílula do topo, "Super Admin · Super admin"); 11 atalhos repetem a barra lateral (H-31 persiste); 4 contadores com "0" e um 5º cartão órfão | 2 | Atalhos só no celular; 1 só identificação do perfil; contadores zerados em linha única | web |
| 29-admin-inicio-mobile | ok | Banner "6 entregas esperando motoboy" com ação lima; "Alertas abertos 13" em âmbar | 0 | - | - |
| 30-admin-alertas-desktop | defeito | **A lista falha ("Não conseguimos carregar agora") com os 4 indicadores carregados (13 abertos)**: ou o endpoint da lista quebra ou é ambiente. Copy errada para leitura: "Seus dados estão salvos" (H-24 persiste); selects nativos fora do estilo | 3 | Achar a causa e recapturar com a lista; copy de leitura "Não carregou os alertas. Tente de novo."; V8.4 | web (+ backend-dev se for a API) |
| 30-admin-alertas-mobile | defeito | Mesmo; o erro fica abaixo da dobra | 3 | V8.4 | web |
| 31-admin-usuarios-desktop | defeito leve | 3 linhas idênticas "Cliente D." (nome mascarado igual para todos); botão "Buscar" 24 px abaixo do campo; campo sem placeholder (H-37) | 1 | Alinhar pela base do campo; placeholder; mostrar o final do e-mail ou id curto | web |
| 31-admin-usuarios-mobile | defeito | Filtros e busca ocupam a tela inteira antes do 1º resultado | 2 | Filtros recolhidos ("Filtros (2)") | web |
| 32-admin-pedidos-desktop | defeito leve | Campos de data em "mm/dd/yyyy" (formato dos EUA num produto pt-BR); lista boa | 1 | Fixar `locale: 'pt-BR'` no Playwright de captura; conferir `lang="pt-BR"` | web (script) |
| 32-admin-pedidos-mobile | defeito | 3 telas de filtros (pílulas + 3 selects + datas) antes do 1º pedido | 2 | Filtros recolhidos | web |
| 33-admin-lojas-desktop | ok | Título "Fila de aprovação" difere do item "Lojas" do menu (1 nome só) | 1 | Igualar | web |
| 33-admin-lojas-mobile | ok | Lista vira cartão sem perda; botão "Abrir" fica sob a barra (esperado) | 0 | - | - |
| 34-admin-loja-aprovacao-desktop | defeito | O visualizador de documento mostra o erro de leitura (captura de ambiente, S3): o fluxo central de aprovação **não está demonstrado**; mesma copy "Seus dados estão salvos"; 7 botões de contorno nos primeiros 200 px; "Conferir tudo" ativo sem abrir documento (H-34) | 2 | Copy "Não abriu o documento. Tente de novo."; foto fictícia de documento no seed da captura; ver V8.4(c) | web |
| 34-admin-loja-aprovacao-mobile | defeito leve | Abas Documentos/Dados/Decisão boas; zoom, girar e baixar ocupam a tela inteira | 2 | Controles num menu "Visualização" | web |
| 35-admin-logistica-desktop | ok | Boa hierarquia (banner noite + KPIs por estado). Tudo vermelho nos dados do seed, mas é o estado real | 1 | H-33 (borda neutra nas corridas) | web |
| 35-admin-logistica-mobile | ok | Chave "Desligado" cortada pela barra na rolagem | 0 | - | - |
| 36-admin-parametros-entrega-desktop | defeito leve | "min/km" encosta na borda do cartão (x 935 de 955); unidade solta fora do campo | 1 | Unidade dentro do campo (sufixo) | web |
| 36-admin-parametros-entrega-mobile | ok | Legível; unidade ao lado do campo estreita o campo | 1 | Sufixo dentro do campo | web |
| 37-admin-comissoes-desktop | defeito | Nome de variável interna na tela: "use Parâmetros (comissao_padrao_pct)"; 80% da página vazia | 2 | "Para mudar, use a página Parâmetros, com motivo." | web |
| 37-admin-comissoes-mobile | defeito | Mesma variável interna na copy | 2 | Idem | web |
| 38-admin-relatorios-desktop | defeito | "R$ 5.940,60" e "R$ 1.771,47" quase encostam na borda do cartão (≈5 px): um valor de 7 dígitos corta; "sem comparação" 7 vezes; "GMV" sem explicação (o "i" existe); 3 botões de exportação | 2 | Valor com `adjustsFit` ou 2 colunas; "sem comparação" só no tooltip; "Vendas totais (GMV)" | web |
| 38-admin-relatorios-mobile | defeito leve | 3 telas de filtros e exportações antes dos números | 1 | Filtros recolhidos | web |
| 39-admin-manutencao-desktop | ok | O que para x o que continua, botão destrutivo vermelho separado | 0 | - | - |
| 39-admin-manutencao-mobile | ok | Idem | 0 | - | - |

### Site (1440x900 e 390x844)

| Arquivo | Estado | Defeito concreto | Sev | Correção | Dono |
|---|---|---|---|---|---|
| 40-site-home-desktop | defeito | **Botões tracejados "[link da Google Play]" e "[link da App Store]"** na home pública (`apps/web/app/(publico)/page.tsx:40-41`, também travado por `e2e/publico.e2e.ts:12`); hero em `#6B1580`, cor que não existe nos tokens nem em nenhuma outra tela (o app e os painéis usam `#C02EF0`/noite); coluna de 700 px com logo a 16 px da borda; "Como funciona" em 3 cartões com fio sem número nem ícone; zero objeto do kit | 3 | V8.2: sem placeholder (botão só com URL; sem URL = nada); hero em noite com bloco `#C02EF0` e corte de 8 graus; passos numerados; 1 objeto do kit | web |
| 40-site-home-mobile | defeito | Mesmos placeholders tracejados em largura total (parecem erro) e mesmo hero | 3 | V8.2 | web |
| 41-site-privacidade-desktop | defeito | **"Minuta técnica de partida, sujeita a revisão jurídica antes da publicação nas lojas."** visível; política de **um parágrafo**; "Em vigor desde 31 de dezembro de 2025" (data que já passou, não é da publicação); metade da página vazia | 4 (G5) | V8.1; o texto é do jurídico/PO (J1 a J16); o web entrega estrutura (seções, lista, sumário) e some com a minuta no build de produção | web + PO |
| 41-site-privacidade-mobile | defeito | Idem | 4 (G5) | V8.1 | web + PO |
| 42-site-termos-desktop | defeito | Mesma minuta; **5 cláusulas num parágrafo corrido** ("1. ... 2. ... 3. ...") e "Tem uma loja? Leia os Termos do lojista" centralizado numa página alinhada à esquerda | 4 (G5) | V8.1 | web + PO |
| 42-site-termos-mobile | defeito | Idem | 4 (G5) | V8.1 | web + PO |
| 43-site-exclusao-de-conta-desktop | ok | Vias A/B claras, formulário curto, linguagem simples | 0 | - | - |
| 43-site-exclusao-de-conta-mobile | ok | Idem | 0 | - | - |
| 44-site-licencas-desktop | ok | "Outfit: fonte de materiais de marca e das telas antigas do painel" é texto interno | 1 | "Fonte do logotipo" | web |
| 44-site-licencas-mobile | ok | Sem defeito | 0 | - | - |

### Defeitos sistêmicos (aparecem em várias imagens)

| # | Defeito | Onde | Sev | Correção |
|---|---|---|---|---|
| G1 | **Uma cesta para tudo**: o fallback de produto é sempre a cesta com garrafa (pão, sabonete, creme dental, caderno...), em cores diferentes; a Farmácia usa um frasco na capa e uma cesta no produto. É o sinal nº 1 de template enquanto não há fotos | 03, 05, 06, 01 | 2 | Fallback por categoria com os 12 objetos do kit (`kit-marca-v3.md` §7); cesta só para "outros" |
| G2 | Pílula e contorno em tudo (busca, filtros, status, abas): o sinal nº 3 da direção v3 que o fundador aprovou eliminar | 02, 13, 24, 25, 31, 32, 38 | 1 | Filtros como abas de texto; pílula só em contagem e status |
| G3 | Cabeçalho roxo de 190 px em todas as telas de trabalho (H-22 persiste): "Novos" começa em y 400, Revisão e Minha loja têm o roxo vazio | 19 a 39 desktop | 2 | Cabeçalho de 96 px fora do Início |
| G4 | Lilás pastel como fundo e como camada principal de ícone (contraste 2,0:1 calculado, `#E198EC` sobre `#FAF8FB`) | 08, 09, 18 | 2 | Camada principal em roxo ação; lilás só atrás |
| G5 | Dados do seed distorcem a leitura (tudo atrasado em vermelho, saída 5 h antes da chegada, banner de frete grátis, datas do mês) | 01, 11, 20, 35 | 1 | Seed da captura com horas coerentes e sem frete grátis |

## 2. Prioridade

**Bloqueia o v1.0 (G4/G5):**
1. V8.1 Páginas legais com a minuta visível, em 1 parágrafo e data vencida (sev 4, G5; o texto é do jurídico/PO).
2. V8.2 Home do site com placeholders de loja e hero fora da paleta (sev 3, vai ao ar com o v1.0).
3. V8.3 Imagem quebrada no painel do lojista (sev 3: acontece em produção sempre que uma foto falha).
4. V8.4 Admin: lista de Alertas falha com os indicadores carregados e a copy de erro mente (sev 3; se for ambiente, cai para 1 e só recapturar).
5. V8.5 Minha loja: "fechada agora" com botão de pausar, contra "no ar" no Início (sev 3; bloqueia **até confirmar** que não é efeito do horário alterado na captura).

**Polir se der tempo (ordem de retorno):** V8.6 Loja sem produto na 1ª tela (sev 3, mas o fluxo de compra funciona); V8.7 Produtos do lojista no celular (sev 3 de uso, não bloqueia); G1 fallback por categoria; G3 cabeçalho compacto; copy do Pedido confirmado em retirada (10); endereço da retirada no checkout (07); remover "Ajuda" repetido (13); cadastro do lojista com bloco de marca (27); ícones lilás (18); copy interna em Comissões (37).

**Fase 2:** Busca com grade de categorias e recentes; atalhos do Início do admin só no celular; filtros recolhidos em admin; "Você recebe" como herói do Financeiro; seleção em lote por modo; sumário e busca nas páginas legais; fotos reais e guia de foto.

## 3. Nota geral

**Coerência visual: 7 de 10 entre app e painéis; 4 de 10 no site e nas páginas públicas.** Por superfície: app 7,5, painel do lojista 7, admin 6,5, site e cadastro 4.

- **O que está coeso e é assinatura de verdade:** Bricolage em escala de cartaz (Sacola, Pedidos, Conta, "Boa noite, Marcos"), bloco magenta com corte diagonal no topo dos painéis, faixas noite com ação lima ("1 pedido novo", "6 entregas esperando motoboy", acompanhamento), selo inclinado "20% off", barras como divisor e progresso (07, 11), o preço de 68 px (05) e "Pedido feito." (10). A mesma gramática aparece no app e nos dois painéis: quem abre o painel reconhece o app.
- **Onde quebra:** o site usa um roxo que não existe no sistema (`#6B1580`) e nenhum elemento da marca além do logo; o cadastro do lojista (27) é um formulário branco; as páginas legais são texto corrido sem estrutura.
- **Ainda parece feito por IA?** Parcialmente. As telas de transação e de status (05, 10, 11, 12, 19, 24, 35) não parecem. Parecem as telas de contêiner: (a) a cesta idêntica em todo produto (03, 06); (b) o painel admin com 11 atalhos que repetem o menu e quatro "0" (29), mais a faixa azul de "i" e os cartões cinza com raio igual em 14, 15, 16, 37 e 39; (c) filtros em pílula contornada empilhados em 02, 24, 31, 32, 38; (d) a home do site, com 3 cartões de fio e botões tracejados; (e) lilás pastel nos ícones e no cartão "Como pagar". Um olho treinado lê a v3 como direção, não como template, nas telas fortes; nas telas de contêiner (listas, filtros, páginas públicas), o "feito sozinho" ainda aparece. **O que decide é a foto real**: sem ela, o app inteiro depende dos 12 objetos do kit, e hoje só se usa 1 (G1).
- **Cumpridas desde a revisão anterior (verificadas nos pixels):** H-01 (checkout abre: 07), H-02 (1ª loja na 1ª tela: 01), H-05 (troca com lista de itens: 14), H-20 (Aceitar/Recusar na 1ª tela: 20-mobile), H-21 (cadastro e revisão sem promessa de adiar). Persistem: H-10 (glifo no logo da loja), H-13, H-22, H-23, H-24, H-25, H-31.
- **Conformidade com as decisões:** sem gradiente e sem emoji em nenhuma das 70 imagens; sem "compre de quem é daqui" (a home do site diz "lojas parceiras", neutro); sem "2 h" prometido como número fixo (as faixas são "chega entre", e "2 h" só aparece como duração de pausa em 26); o PIX tem destaque residual no checkout (pré-marcado e com "Aprovação na hora", item 07), contra a DEC-052.

## 4. Itens de severidade 3 e 4

Registrados como V8.1 a V8.7 em `docs/gestao/fila-mobile.md`, seção "Onda 8 visual", com critério de aceite.
