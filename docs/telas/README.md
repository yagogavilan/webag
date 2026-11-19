# Capturas de tela

Capturas das telas principais do Webag, feitas em viewport (não fullPage) com a **API real local** e os dados de demonstração do seed
(`pnpm run setup`). Tudo é fictício. Geradas por `scripts/capture-screens.mjs`; não edite à mão, rode o script de novo.

- **App do cliente**: 390x844 (celular), app Expo exportado para web e aberto no Chrome. A aparência segue o app nativo; o que muda é o
  que só existe no aparelho (barra do sistema, teclado, permissões do sistema).
- **Painel do lojista, painel admin e site**: 1440x900 (`-desktop`) e 390x844 (`-mobile`).
- Numeração = ordem do catálogo no script; o número é estável quando só algumas áreas são regeradas.

## Como gerar

```bash
pnpm run setup                         # infraestrutura, migrações e seed (uma vez)
pnpm dev                               # API (e o resto) no ar; ou só a API em :3000
node scripts/capture-screens.mjs       # tudo (cerca de 10 min, com os builds do site e do app)
ONLY=app,site node scripts/capture-screens.mjs   # só algumas áreas (não reescreve este índice)
```

O script faz o build e sobe sozinho o site/painéis (`next build` e `next start`) e o app em versão web (`expo export` servido por um
servidor estático local) e encerra tudo no fim. Para usar o que já roda: `WEB_URL`, `APP_URL`. Outras variáveis (API_URL, REAL_DB_URL,
SEED_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOTP_SECRET, OUT_DIR, PW_CHANNEL=chrome, REUSE_APP_BUILD=1, REUSE_WEB_BUILD=1) estão no cabeçalho do script.

Ajustes **temporários** de dados fictícios no banco local (desfeitos ao terminar): faixa de entrega de 2 pedidos do seed (um dentro do
prazo, um atrasado), data de entrega de 1 pedido (troca dentro do prazo), 1 cupom pessoal, o estado de 1 loja (rascunho e depois
"em análise") e o horário de 1 loja. Cria 2 clientes de demonstração fixos (`telas.compra@`, `telas.exclusao@seed.webag.local`) e 1 pedido
por execução. Só roda contra banco local (`REAL_DB_URL` em localhost).

## Limites conhecidos destas capturas

| Limite | Efeito |
|---|---|
| Sem armazenamento de objetos (S3) no ambiente da captura | Produtos, lojas e capas aparecem com a ilustração padrão, não com foto |
| Logística da entrega fora do horário | Quando a entrega está fechada, sacola e checkout seguem por **Retirada** (o app avisa e oferece retirar) |
| Horário comercial das lojas | Textos como "Loja fechada agora" e "Entrega volta amanhã" dependem da hora da captura |
| Sem Mailpit (e-mail) | O e-mail dos clientes de demonstração é marcado como confirmado direto no banco |
| Cartão | O cartão é digitado na página segura do Mercado Pago; o app só mostra o checkout com cartão escolhido |

## Índice

| Arquivo | Tela | Perfil | Viewport | O que mostra |
|---|---|---|---|---|
| [01-app-inicio.png](01-app-inicio.png) | Início | Cliente | 390x844 | Lojas perto do cliente, categorias e ofertas, com o ponto de entrega escolhido. |
| [02-app-busca.png](02-app-busca.png) | Busca | Cliente | 390x844 | Aba Buscar com o campo, o histórico e as categorias. |
| [03-app-resultados.png](03-app-resultados.png) | Resultados da busca | Cliente | 390x844 | Lista de lojas e produtos para um termo, com filtros e ordenação. |
| [04-app-loja.png](04-app-loja.png) | Loja | Cliente | 390x844 | Capa, horário, nota, destaques e produtos da loja. |
| [05-app-produto.png](05-app-produto.png) | Produto | Cliente | 390x844 | Fotos, preço, opções (tamanho e cor) e o botão de adicionar à sacola. |
| [06-app-sacola.png](06-app-sacola.png) | Sacola | Cliente | 390x844 | Itens, quantidades e total, com o botão para ir ao pagamento. |
| [07-app-checkout-pix.png](07-app-checkout-pix.png) | Checkout com PIX | Cliente | 390x844 | Entrega, endereço, resumo do pedido e PIX escolhido como forma de pagamento. |
| [08-app-checkout-cartao.png](08-app-checkout-cartao.png) | Checkout com cartão | Cliente | 390x844 | Mesmo resumo com cartão: o cartão é digitado na página segura do Mercado Pago, nunca no app. |
| [09-app-pix.png](09-app-pix.png) | PIX gerado | Cliente | 390x844 | Valor, contagem regressiva do PIX e código copia e cola; a tela muda sozinha quando o servidor confirma o pagamento. |
| [10-app-pedido-confirmado.png](10-app-pedido-confirmado.png) | Pedido confirmado | Cliente | 390x844 | Número do pedido e o que acontece em seguida, depois do pagamento aprovado. |
| [11-app-acompanhamento.png](11-app-acompanhamento.png) | Acompanhamento do pedido | Cliente | 390x844 | Linha do tempo de um pedido a caminho, dentro da faixa de entrega prometida. |
| [12-app-acompanhamento-atrasado.png](12-app-acompanhamento-atrasado.png) | Acompanhamento com atraso | Cliente | 390x844 | Pedido fora da faixa de entrega: aviso de atraso e as opções de esperar ou pedir o cancelamento. |
| [13-app-pedidos.png](13-app-pedidos.png) | Meus pedidos | Cliente | 390x844 | Pedidos em andamento e anteriores. |
| [14-app-troca.png](14-app-troca.png) | Pedir troca | Cliente | 390x844 | Pedido de troca ou devolução de um pedido entregue, com motivo, prazo e como devolver. |
| [15-app-conta.png](15-app-conta.png) | Conta | Cliente | 390x844 | Menu da conta: endereços, cupons, favoritos, trocas, privacidade e ajuda. |
| [16-app-cupons.png](16-app-cupons.png) | Meus cupons | Cliente | 390x844 | Cupons disponíveis para o cliente. |
| [17-app-licencas.png](17-app-licencas.png) | Licenças de código aberto | Cliente | 390x844 | Bibliotecas de terceiros usadas no app e as licenças. |
| [18-app-exclusao-de-conta.png](18-app-exclusao-de-conta.png) | Exclusão de conta | Cliente | 390x844 | Prazo, o que é apagado, impedimentos (pedidos em aberto) e a confirmação com senha. |
| [19-lojista-inicio-desktop.png](19-lojista-inicio-desktop.png) | Início do lojista | Lojista (dono) | 1440x900 | Resumo do dia: pedidos, vendas, avaliação e mais vendidos com "Você recebe". |
| [19-lojista-inicio-mobile.png](19-lojista-inicio-mobile.png) | Início do lojista | Lojista (dono) | 390x844 | Resumo do dia: pedidos, vendas, avaliação e mais vendidos com "Você recebe". |
| [20-lojista-pedidos-novos-desktop.png](20-lojista-pedidos-novos-desktop.png) | Pedidos novos | Lojista (dono) | 1440x900 | Fila de pedidos por etapa, com o pedido novo aguardando aceite. |
| [20-lojista-pedidos-novos-mobile.png](20-lojista-pedidos-novos-mobile.png) | Pedidos novos | Lojista (dono) | 390x844 | Fila de pedidos por etapa, com o pedido novo aguardando aceite. |
| [21-lojista-produtos-desktop.png](21-lojista-produtos-desktop.png) | Produtos | Lojista (dono) | 1440x900 | Lista de produtos com estoque, estado e interruptor de venda. |
| [21-lojista-produtos-mobile.png](21-lojista-produtos-mobile.png) | Produtos | Lojista (dono) | 390x844 | Lista de produtos com estoque, estado e interruptor de venda. |
| [22-lojista-produto-voce-recebe-desktop.png](22-lojista-produto-voce-recebe-desktop.png) | Produto: Você recebe | Lojista (dono) | 1440x900 | Formulário de produto com o valor líquido estimado: preço menos comissão menos a tarifa mais cara do provedor (DEC-074e). |
| [22-lojista-produto-voce-recebe-mobile.png](22-lojista-produto-voce-recebe-mobile.png) | Produto: Você recebe | Lojista (dono) | 390x844 | Formulário de produto com o valor líquido estimado: preço menos comissão menos a tarifa mais cara do provedor (DEC-074e). |
| [23-lojista-trocas-desktop.png](23-lojista-trocas-desktop.png) | Trocas | Lojista (dono) | 1440x900 | Pedidos de troca e devolução dos clientes. |
| [23-lojista-trocas-mobile.png](23-lojista-trocas-mobile.png) | Trocas | Lojista (dono) | 390x844 | Pedidos de troca e devolução dos clientes. |
| [24-lojista-avaliacoes-desktop.png](24-lojista-avaliacoes-desktop.png) | Avaliações | Lojista (dono) | 1440x900 | Nota média, distribuição e comentários dos clientes. |
| [24-lojista-avaliacoes-mobile.png](24-lojista-avaliacoes-mobile.png) | Avaliações | Lojista (dono) | 390x844 | Nota média, distribuição e comentários dos clientes. |
| [25-lojista-financeiro-desktop.png](25-lojista-financeiro-desktop.png) | Financeiro | Lojista (dono) | 1440x900 | Valores a receber, liberados e extrato. |
| [25-lojista-financeiro-mobile.png](25-lojista-financeiro-mobile.png) | Financeiro | Lojista (dono) | 390x844 | Valores a receber, liberados e extrato. |
| [26-lojista-minha-loja-desktop.png](26-lojista-minha-loja-desktop.png) | Minha loja | Lojista (dono) | 1440x900 | Dados da loja, horários, entrega, trocas e avisos. |
| [26-lojista-minha-loja-mobile.png](26-lojista-minha-loja-mobile.png) | Minha loja | Lojista (dono) | 390x844 | Dados da loja, horários, entrega, trocas e avisos. |
| [27-lojista-cadastro-desktop.png](27-lojista-cadastro-desktop.png) | Cadastro do lojista | Visitante | 1440x900 | Criação da conta do lojista (primeira etapa do cadastro). |
| [27-lojista-cadastro-mobile.png](27-lojista-cadastro-mobile.png) | Cadastro do lojista | Visitante | 390x844 | Criação da conta do lojista (primeira etapa do cadastro). |
| [28-lojista-revisao-desktop.png](28-lojista-revisao-desktop.png) | Revisão do cadastro da loja | Lojista (dono) | 1440x900 | Última etapa do cadastro: conferir os dados antes de enviar para análise. |
| [28-lojista-revisao-mobile.png](28-lojista-revisao-mobile.png) | Revisão do cadastro da loja | Lojista (dono) | 390x844 | Última etapa do cadastro: conferir os dados antes de enviar para análise. |
| [29-admin-inicio-desktop.png](29-admin-inicio-desktop.png) | Início do admin | Super admin | 1440x900 | Pendências: lojas, produtos, trocas, denúncias e alertas. |
| [29-admin-inicio-mobile.png](29-admin-inicio-mobile.png) | Início do admin | Super admin | 390x844 | Pendências: lojas, produtos, trocas, denúncias e alertas. |
| [30-admin-alertas-desktop.png](30-admin-alertas-desktop.png) | Alertas | Super admin | 1440x900 | Alertas operacionais com gravidade e estado. |
| [30-admin-alertas-mobile.png](30-admin-alertas-mobile.png) | Alertas | Super admin | 390x844 | Alertas operacionais com gravidade e estado. |
| [31-admin-usuarios-desktop.png](31-admin-usuarios-desktop.png) | Usuários | Super admin | 1440x900 | Busca e lista de usuários (cliente, lojista e equipe). |
| [31-admin-usuarios-mobile.png](31-admin-usuarios-mobile.png) | Usuários | Super admin | 390x844 | Busca e lista de usuários (cliente, lojista e equipe). |
| [32-admin-pedidos-desktop.png](32-admin-pedidos-desktop.png) | Pedidos | Super admin | 1440x900 | Todos os pedidos da plataforma, com filtros. |
| [32-admin-pedidos-mobile.png](32-admin-pedidos-mobile.png) | Pedidos | Super admin | 390x844 | Todos os pedidos da plataforma, com filtros. |
| [33-admin-lojas-desktop.png](33-admin-lojas-desktop.png) | Lojas | Super admin | 1440x900 | Lojas por estado, incluindo a fila de aprovação. |
| [33-admin-lojas-mobile.png](33-admin-lojas-mobile.png) | Lojas | Super admin | 390x844 | Lojas por estado, incluindo a fila de aprovação. |
| [34-admin-loja-aprovacao-desktop.png](34-admin-loja-aprovacao-desktop.png) | Loja: detalhe e aprovação | Super admin | 1440x900 | Dados, documentos e a decisão de aprovar, pedir correção ou recusar. |
| [34-admin-loja-aprovacao-mobile.png](34-admin-loja-aprovacao-mobile.png) | Loja: detalhe e aprovação | Super admin | 390x844 | Dados, documentos e a decisão de aprovar, pedir correção ou recusar. |
| [35-admin-logistica-desktop.png](35-admin-logistica-desktop.png) | Logística | Super admin | 1440x900 | Corridas, entregadores e atrasos. |
| [35-admin-logistica-mobile.png](35-admin-logistica-mobile.png) | Logística | Super admin | 390x844 | Corridas, entregadores e atrasos. |
| [36-admin-parametros-entrega-desktop.png](36-admin-parametros-entrega-desktop.png) | Parâmetros de entrega | Super admin | 1440x900 | Raio, faixas de prazo e regras de entrega. |
| [36-admin-parametros-entrega-mobile.png](36-admin-parametros-entrega-mobile.png) | Parâmetros de entrega | Super admin | 390x844 | Raio, faixas de prazo e regras de entrega. |
| [37-admin-comissoes-desktop.png](37-admin-comissoes-desktop.png) | Comissões | Super admin | 1440x900 | Comissão padrão, por categoria e por loja. |
| [37-admin-comissoes-mobile.png](37-admin-comissoes-mobile.png) | Comissões | Super admin | 390x844 | Comissão padrão, por categoria e por loja. |
| [38-admin-relatorios-desktop.png](38-admin-relatorios-desktop.png) | Relatórios | Super admin | 1440x900 | Indicadores e exportações em planilha. |
| [38-admin-relatorios-mobile.png](38-admin-relatorios-mobile.png) | Relatórios | Super admin | 390x844 | Indicadores e exportações em planilha. |
| [39-admin-manutencao-desktop.png](39-admin-manutencao-desktop.png) | Manutenção | Super admin | 1440x900 | Botão de parar a plataforma e o aviso aos usuários. |
| [39-admin-manutencao-mobile.png](39-admin-manutencao-mobile.png) | Manutenção | Super admin | 390x844 | Botão de parar a plataforma e o aviso aos usuários. |
| [40-site-home-desktop.png](40-site-home-desktop.png) | Home do site | Público | 1440x900 | Página inicial do Webag. |
| [40-site-home-mobile.png](40-site-home-mobile.png) | Home do site | Público | 390x844 | Página inicial do Webag. |
| [41-site-privacidade-desktop.png](41-site-privacidade-desktop.png) | Política de privacidade | Público | 1440x900 | Texto da política (LGPD). |
| [41-site-privacidade-mobile.png](41-site-privacidade-mobile.png) | Política de privacidade | Público | 390x844 | Texto da política (LGPD). |
| [42-site-termos-desktop.png](42-site-termos-desktop.png) | Termos de uso | Público | 1440x900 | Termos de uso do cliente. |
| [42-site-termos-mobile.png](42-site-termos-mobile.png) | Termos de uso | Público | 390x844 | Termos de uso do cliente. |
| [43-site-exclusao-de-conta-desktop.png](43-site-exclusao-de-conta-desktop.png) | Exclusão de conta (site) | Público | 1440x900 | Como pedir a exclusão da conta e dos dados. |
| [43-site-exclusao-de-conta-mobile.png](43-site-exclusao-de-conta-mobile.png) | Exclusão de conta (site) | Público | 390x844 | Como pedir a exclusão da conta e dos dados. |
| [44-site-licencas-desktop.png](44-site-licencas-desktop.png) | Licenças | Público | 1440x900 | Licenças de código aberto usadas pelo Webag. |
| [44-site-licencas-mobile.png](44-site-licencas-mobile.png) | Licenças | Público | 390x844 | Licenças de código aberto usadas pelo Webag. |

## Telas que mostraram erro nesta execução

A captura registra o estado real: nestas telas apareceu uma mensagem de erro (normalmente a API devolveu falha ou faltou o arquivo no armazenamento de objetos). Corrija a causa e capture de novo.

- `admin/alertas`: "Não conseguimos carregar"
- `admin/loja-aprovacao`: "Não conseguimos carregar"
