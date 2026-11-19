# Navegação dos painéis no celular: barra de 4 + "Mais"

> Autor: product-designer. Data: 2026-11-19. Vale para o painel do lojista e o admin (`apps/web`), abaixo de 1024 px. Protótipo: `docs/prototipo/paineis-v3.html` (`?mais=1` abre a folha; `?perfil=` troca o perfil). Visual: `onda-7-paineis-v3.md` §1.
> Fonte da verdade das áreas e permissões: `apps/web/src/lib/lojista-access.ts` (`LOJISTA_NAV`) e `apps/web/src/lib/admin-access.ts` (`NAV_ITEMS`, `VIEW`). Esta spec não cria nem remove área; só decide **onde** cada uma aparece.

## 1. Problema

| Painel | Hoje (código, 2026-11-19) | Custo |
|---|---|---|
| Lojista | Barra inferior com **7 itens** (Início, Pedidos, Trocas, Produtos, Financeiro, Minha loja, Equipe). **Avaliações** é `sideOnly`: **não existe no celular** | 7 itens em 390 px = 55 px por item: rótulos cortados ou minúsculos, alvo estreito, nada se destaca. O lojista que trabalha pelo celular (P2, `lojista.md`) não responde avaliação (WB-195) |
| Admin | Sem barra inferior: **menu hambúrguer** com 22 áreas | Logística, a área mais urgente da operação de 1 a 2 pessoas, fica a 2 toques e **os contadores somem** dentro da gaveta (`onda-4d` §0.7 depende deles) |

Referências [M, não reabertas nesta sessão]: Material 3 recomenda de 3 a 5 destinos na barra de navegação; Apple HIG limita a barra de abas a 5 no iPhone e usa a aba "Mais" para o excedente. iFood para Lojistas e Uber Eats Manager usam barra curta + "Mais" no celular.

## 2. Regra

1. **Barra inferior = 4 destinos + "Mais"**, sempre 5 posições iguais (≥ 72 px de largura em 360). Rótulo sempre visível (Figtree 12/16), ícone Solar 24.
2. **Os 4 destinos são fixos por perfil** (tabela §3). Não mudam com contagem nem com uso: posição estável é memória muscular.
3. **Início à esquerda, "Mais" à direita.** Os demais por frequência de uso.
4. Se o perfil vê **menos de 4** destinos, a barra mostra os que existem + "Mais" (que guarda a conta). Se vê 4 ou menos áreas no total, "Mais" continua: é onde ficam Ajuda, Minha conta e Sair.
5. **Contador:** número lima no destino da barra; no "Mais", **ponto lima** quando alguma área dentro dele tem pendência (o número aparece na linha da folha). Rótulo acessível do "Mais" inclui o total ("Mais, 2 pendentes").
6. **Página atual dentro do "Mais":** o botão "Mais" fica ativo (indicador inclinado + rótulo noite) e a linha da área fica marcada na folha.
7. **Desktop ≥ 1024:** barra lateral com todas as áreas do perfil, em grupos; sem "Mais". **Tablet 640 a 1023:** igual ao celular.
8. Cabeçalho no celular: logo-símbolo, pastilha da loja ou "Administração", som (lojista). **Ajuda, Minha conta e Sair saem do cabeçalho** e vão para o "Mais" (hoje o lojista os tem no topo com rótulo escondido; o admin, no menu do avatar).

## 3. Prioridades por perfil

### 3.1 Lojista (`LOJISTA_NAV`; dono vê tudo, funcionário conforme permissões)

| Perfil | Barra (4) | "Mais" |
|---|---|---|
| **Dono** | Início · Pedidos · Produtos · Trocas | Avaliações · Financeiro · Minha loja · Equipe · Ajuda · Minha conta · Sair |
| Funcionário com Pedidos, Produtos e Avaliações | Início · Pedidos · Produtos · Trocas | Avaliações · Ajuda · Minha conta · Sair |
| Funcionário só com Pedidos | Início · Pedidos · Trocas | Ajuda · Minha conta · Sair |

Ordem de prioridade para preencher a barra: Início > Pedidos > Produtos > Trocas > Avaliações > Financeiro > Minha loja > Equipe. **Por que Produtos antes de Trocas:** pausar produto esgotado é a ação mais frequente depois de aceitar pedido (causa nº 1 de cancelamento no painel geral); troca tem SLA de 24 h e aviso por e-mail. **Por que Avaliações no "Mais" e não na barra:** frequência semanal; o contador no "Mais" e o cartão "2 sem resposta" da Início levam até ela.

### 3.2 Admin (`NAV_ITEMS` filtrado por `VIEW`)

| Perfil | Barra (4) | "Mais" (grupos) |
|---|---|---|
| **Super admin** | Início · Logística · Lojas · Disputas | Operação (Estornos, Moderação, Denúncias, Ajuda) · Dinheiro e dados (Comissões, Frete por região, Relatórios, Relatório de trocas) · Marketing (Banners e destaques, Cupons, Push) · Área e catálogo (Regiões, Categorias) · Sistema (Parâmetros de entrega, Feature flags, Termos e privacidade, Pedidos de titulares, Auditoria, Admins e perfis) · Conta |
| **Operação** | Início · Logística · Lojas · Disputas | Mesmos grupos, só o que `VIEW` libera (sem Estornos, Comissões, Parâmetros, Flags, Titulares, Auditoria, Admins) |
| **Financeiro** | Início · Estornos · Comissões · Relatórios | Logística (leitura) · Frete por região · Relatório de trocas · Cupons · Conta |
| **Suporte** | Início · Lojas · Logística (leitura) · Moderação | Conta |

"Início" do admin é o painel geral (RL2, `onda-6`). Rótulos curtos só na barra: "Lojas", "Disputas" (a folha usa o nome completo).

## 4. Folha "Mais"

| Item | Especificação |
|---|---|
| Abertura | Toque em "Mais" abre **folha inferior** (raio 30, alça, até 88% da altura, rola por dentro). Fundo escurecido `noite` 55% |
| Topo | Título "Mais" (Bricolage 30). Com **mais de 8 áreas**, campo "Buscar área" fixo no topo; filtra as linhas e esconde grupos vazios ("Nenhuma área com esse nome." quando zera) |
| Linhas | 60 de altura: ícone em quadrado 44 raio 14 (`neutral.100`; atual em noite com ícone lima), nome (Figtree 16/700), contador lima à direita, seta. Grupos com rótulo em caixa alta 12/16 (só se houver mais de 1 grupo) |
| Conta (sempre no fim) | Ajuda · Minha conta (com nome e papel em 13/18) · **Sair** em `danger` (abre a confirmação de sempre) |
| Fechar | Tocar fora, arrastar para baixo, Esc, voltar do Android, ou escolher uma área (navega e fecha) |
| Foco | Vai ao título ao abrir; preso na folha; volta ao botão "Mais" ao fechar |
| Movimento | Sobe em 350 ms (`motion.base`); com "reduzir movimento", aparece sem deslizar |

## 5. Estados

| Estado | Comportamento |
|---|---|
| Carregando permissões | Barra com Início + "Mais" (sem pular itens depois); demais posições em skeleton 24 x 24 |
| Sem conexão | Barra funciona (rotas locais); contadores mostram o último valor; faixa global de sem conexão do shell |
| Sem permissão (link direto) | Tela "Você não tem acesso a essa área" + "Voltar ao início"; a área não aparece na barra nem no "Mais" |
| Loja suspensa / em análise | Igual ao hoje (rotas liberadas por status, `lojista-access.ts`); itens bloqueados não aparecem |
| Pedido novo com o lojista em outra área | Contador da barra atualiza + alerta sonoro e toast de sempre (não muda de tela sozinho) |

## 6. Acessibilidade

- `nav` com `aria-label="Menu principal"` (barra) e `"Menu do painel"` (lateral); item atual com `aria-current="page"`; "Mais" com `aria-haspopup="dialog"` e `aria-current` quando a página está dentro dele.
- Alvo ≥ 48 x 60; contraste do rótulo inativo `neutral.600` 6,9:1, ativo `noite`; indicador ativo não depende só de cor (barra inclinada + peso 800).
- Contadores no rótulo acessível ("Pedidos, 2 novos"); o ponto do "Mais" tem texto no rótulo do botão.
- Fonte a 200%: rótulos em 1 linha com reticências e nome completo no `aria-label`; a barra cresce em altura, nunca some.

## 7. Implementação (para o `mobile-dev` e o `tech-lead`)

| Onde | Mudança |
|---|---|
| `lojista-access.ts` | Trocar `sideOnly` por `bottomPriority` (1 a 8); `visibleLojistaNav` continua filtrando por papel e permissão |
| `lojista-shell.tsx` | `Nav variant="bottom"`: primeiros 4 por prioridade + `MoreButton`; Ajuda, Conta e Sair entram na `MoreSheet` abaixo de 1024 |
| `admin-shell.tsx` | Abaixo de 1024: barra inferior + `MoreSheet` no lugar do hambúrguer; acima, a lateral recolhível continua. Mapa de barra por perfil (§3.2) |
| Componentes | `BottomNav`, `MoreButton`, `MoreSheet` (usa o `Dialog`/folha existente com foco preso) |
| testID | Lojista: `lojista.nav.<section>-bottom` (já existe), `lojista.nav.more`, `lojista.nav.more-sheet`, `lojista.nav.more.<section>`. Admin: `nav-bottom-<section>`, `nav-more`, `nav-more-sheet`, `nav-more-search`, `nav-more-<section>` |
| Testes | Por perfil: 4 itens certos na barra, nenhum duplicado no "Mais"; Avaliações alcançável no celular; página dentro do "Mais" marca o botão; contador agregado |
| Eventos | `nav_more_opened {role, perfil}`, `nav_more_item {section}` (mede se alguma área do "Mais" merece subir para a barra) |

## Z. Pendências

| # | Item | Quem |
|---|---|---|
| 1 | Confirmar a ordem Produtos > Trocas com os 5 lojistas do piloto (tarefa: "pausar um produto esgotado" e "responder uma troca") | PO |
| 2 | Revisar a barra do admin depois de 2 semanas com `nav_more_item` | PO + designer |
