# Brief do Fundador — Webag (oficial, 2026-11-18)

> Briefing oficial do fundador (Yago), recebido em 2026-11-18. Substitui a versão anterior. Aprova os gates G0–G3 (ver `docs/decisoes.md` DEC-002).
> Fonte de verdade de escopo da versão 1.0. O CEO mantém; o fundador não edita.

## 1. Modo de trabalho da missão
- **Autonomia total até a entrega da 1.0.** G0, G1, G2 e G3 aprovados com as decisões deste documento. QA e Security mantêm veto em G4 e G5.
- Decisão de negócio faltando: escolher o padrão de mercado mais sensato, registrar em `docs/decisoes.md` como `[HIPÓTESE]` com o porquê, deixar configurável no admin quando possível, seguir.
- **Nenhuma pergunta ao fundador durante a execução.** O que depender dele (contas, chaves, Mercado Pago, lojas) fica em modo simulado ou com valor de exemplo no `.env.example`, listado no relatório final.
- **Proibido o irreversível:** apagar histórico, force push na `main`, tornar o repo público, gastar dinheiro. Se parecer necessário: pular, registrar, seguir.
- Tarefa travada: registrar motivo, seguir para a próxima, voltar depois.
- **Começar do zero.** Não reaproveitar código, telas, visual do MVP HTML antigo nem o plano de back-end antigo. A configuração do time (`.claude/`, `CLAUDE.md`, `docs/` do time) continua valendo.
- **Pesquisar antes de decidir**, citando fontes em ADRs e specs. Meta: parecer feito por equipe sênior de produto de empresa grande, não por IA.
- **Economia:** no máximo 3 tarefas em paralelo; Sonnet para execução; Opus só para arquitetura, segurança e decisões difíceis.
- Commit e push ao fim de cada etapa. Andamento sempre em `docs/status.md`.

## 2. O que é o Webag
Marketplace regional de **bens de consumo (não comida)** para Francisco Morato e região (Franco da Rocha, Caieiras, Campo Limpo Paulista e arredores), SP. Lógica de iFood: abre o app, vê lojas perto, compra, recebe em casa ou retira na loja. Categorias (cadastradas pelo admin): moda e vestuário, calçados, cosméticos e perfumaria, eletrônicos e acessórios, casa e utilidades, papelaria, pet, presentes, entre outras.

### Quem usa
| Perfil | Características |
|---|---|
| Cliente | Morador da região, Android de entrada, tela pequena, internet móvel instável, desconfiado de app novo, quer PIX e receber rápido |
| Lojista | Pequeno comércio, muitas vezes MEI, pouco tempo e pouca familiaridade com sistemas; opera pelo celular ou computador do balcão |
| Admin | O fundador; edita tudo da plataforma sem mexer em código |

## 3. Escopo da 1.0

### 3.1 App do cliente (Android e iOS) — publicado nas lojas
- **Entrada sem fricção:** explorar sem login; cadastro só no checkout. Login e-mail/senha; cadastro completo (nome, e-mail, celular, senha com medidor de força, confirmação, aceite de termos/LGPD, confirmação por código); "esqueci a senha" com código dentro do app. Preparado para login Google e Apple (Apple obrigatório na App Store se houver login social).
- **Endereço:** localização do aparelho ou CEP com autocompletar; vários endereços salvos; só mostra lojas que entregam no endereço.
- **Início:** banners editáveis pelo admin, categorias, lojas perto de mim, ofertas, mais vendidos, lojas novas.
- **Busca:** produtos e lojas; filtros (categoria, preço, distância, entrega grátis, avaliação, aceita troca); histórico de buscas.
- **Loja:** capa, logo, avaliação, horários, aberta/fechada, tempo e taxa de entrega, retirada, política de trocas, vitrine por seções.
- **Produto:** galeria, variações (tamanho, cor, outras) com estoque por variação, preço e promocional, descrição, avaliações.
- **Carrinho:** uma loja por pedido (padrão de mercado — decisão registrada), aviso ao trocar de loja, cupom, resumo de valores sem surpresa.
- **Checkout:** entrega ou retirada, endereço, PIX (QR + copia e cola com contagem regressiva) e cartão de crédito. Poucas etapas, nenhum campo desnecessário.
- **Pedido em tempo real:** linha do tempo (recebido, aceito, em separação, saiu para entrega / pronto para retirada, entregue), push, contato da loja via WhatsApp.
- **Trocas ("Retira Troca") — diferencial:** pedido de troca no app dentro do prazo da loja; motivo (tamanho errado, defeito, cor diferente, arrependimento); fotos; acompanhamento de status. A loja define se aceita, o prazo e a taxa de coleta.
- **Conta:** pedidos, favoritos, endereços, cupons, notificações, dados pessoais, ajuda, exportar meus dados, excluir conta no app (Apple + LGPD).
- **Avaliação:** loja e produto após a entrega.

### 3.2 Área do lojista — painel web responsivo (celular e balcão)
- Cadastro e onboarding guiado: CPF ou CNPJ (MEI incluso), dados da loja, documentos, conta de recebimento. Loja visível só após aprovação do admin.
- Configuração: logo, capa, descrição, categorias, horários (feriados, pausa temporária), raio de entrega, taxa (fixa ou por distância), pedido mínimo, entrega grátis acima de X, retirada, WhatsApp, política de trocas.
- Catálogo: fotos (upload com recorte e compressão), variações, estoque por variação, promoção com período, seções da vitrine, importação por planilha, ação em massa (pausar, mudar preço).
- Pedidos em tempo real: alerta sonoro, aceitar/recusar com motivo, mudar status, imprimir comanda, histórico.
- Trocas: fila, aprovar/recusar, acompanhar coleta.
- Cupons próprios, resposta a avaliações, equipe (dono e funcionários com permissões diferentes).
- Financeiro: vendas, comissão Webag, a receber, repasses, extrato exportável.
- Painel inicial: vendas do dia/semana, ticket médio, mais vendidos, avaliação média.

### 3.3 Área do admin — painel web
- Usuários: clientes, lojistas, admins; busca, bloqueio, redefinição de senha; perfis (super admin, operação, financeiro, suporte).
- Lojas: fila de aprovação, documentos, suspensão, edição de qualquer dado, comissão por loja.
- Catálogo da plataforma: categorias/subcategorias com ícone e ordem; moderação de produtos.
- Pedidos e trocas: visão geral, filtros, intervenção (cancelar, estornar, mediar disputa).
- Financeiro: comissões (padrão, por categoria, por loja), taxa de serviço, repasses, conciliação com o provedor, relatórios exportáveis.
- Marketing e conteúdo: banners, destaques, cupons da plataforma, push segmentado, termos e privacidade editáveis.
- Regiões: cidades e bairros atendidos; liberar/fechar áreas.
- Configurações: parâmetros do negócio, feature flags, modo manutenção.
- Relatórios: pedidos, GMV, novas lojas, novos clientes, recompra, cancelamentos.
- Log de auditoria de toda ação administrativa.

### Fora da 1.0 (modelo de dados preparado) — fase 2
App do entregador (despacho e rastreio), programa de pontos, assinatura, chat interno.

## 4. Pagamentos
- Camada independente de provedor (`PaymentProvider`) com adaptador **Mercado Pago completo**: PIX, cartão via tokenização (Bricks/Checkout Transparente, nunca guardar cartão), estorno total e parcial, webhooks com verificação de assinatura, idempotência, reprocessamento, conciliação.
- Marketplace: pesquisar e implementar **split do Mercado Pago** (OAuth do lojista, Webag retém comissão). Se não servir ao MVP: recebimento centralizado com repasse controlado, registrado em ADR. Segundo adaptador (Pagar.me ou Asaas) se a pesquisa mostrar vantagem.
- **Provedor simulado** para dev: aprova/recusa, gera PIX falso, dispara webhooks — app funciona ponta a ponta sem chaves.
- Trocar simulado → real só preenchendo o `.env`. README explica onde pegar cada chave e como cadastrar o webhook.
- Produto físico usa pagamento próprio (sem IAP da Apple/Google).

## 5. Experiência e visual (padrão exigido)
- Pouco texto, muito visual; frases curtas, ícones, números grandes, uma ação principal por tela.
- Intuitivo sem tutorial: morador que nunca usou compra em **menos de 2 minutos** sem ajuda.
- Jornada clara (explorar, comprar, acompanhar). Clean e harmônico: respiro, grade de 8 pt, hierarquia tipográfica, uma cor de destaque com disciplina, paleta neutra.
- **Sem cara de IA:** nada de gradiente roxo genérico, emoji como ícone, cards todos iguais, sombras exageradas, marketing vazio. Uma família de ícones, fotografia bem tratada, microcopy humano.
- Todos os estados: skeleton, vazio com próximo passo, erro com o que fazer, sem conexão, sucesso.
- Qualidade: transições suaves, haptics, pull to refresh, imagens progressivas com cache, teclado certo, máscaras CPF/CEP/telefone, botões ao alcance do polegar.
- Nativo: Apple HIG e Material 3. Acessibilidade WCAG 2.2 AA (contraste, labels, alvos 44–48 pt, fonte dinâmica). Desempenho em celular fraco e 3G.
- Português do Brasil, sem emojis na interface.
- Designer pesquisa referências (iFood, Mercado Livre, Shopee, Rappi, Zé Delivery, varejo bem avaliado) e cria identidade própria. Design system em tokens consumidos pelo app e pelos painéis.

## 6. Arquitetura proposta (Tech Lead pode ajustar via ADR)
- Monorepo pnpm + Turborepo: `apps/mobile` (Expo + TS + Expo Router), `apps/web` (Next.js: lojista + admin, rotas e permissões separadas), `apps/api` (NestJS, REST + OpenAPI, WebSocket), `packages/` (tokens, tipos e cliente gerados do OpenAPI, validações).
- PostgreSQL + PostGIS, migrações versionadas e seed. Redis (cache, filas, pub/sub). S3-compatível (MinIO local) com redimensionamento. Expo Push + e-mail plugável (Mailpit local).
- Segurança: Argon2, JWT curto + refresh rotativo, RBAC por papel e por loja, rate limit, validação de entrada, CORS restrito, segredos só no `.env`, auditoria, LGPD (consentimento, exportação, exclusão). Revisão OWASP ASVS e MASVS.
- Observabilidade: logs estruturados, health check, Sentry plugável.

## 7. Qualidade
- Testes unitários e de integração na API (pedido, estoque, pagamento, comissão, trocas — cobertura alta); E2E Playwright nos painéis; Maestro no app.
- CI GitHub Actions: lint, typecheck, testes, build a cada push.
- Revisão final: teste funcional de todos os fluxos, heurística de Nielsen, usabilidade com tarefas reais (comprar, cadastrar loja, aprovar loja, pedir troca) contando toques/telas/palavras, teste de carga na API. Corrigir tudo antes de entregar.
- Capturas de todas as telas em `docs/telas/`.

## 8. Definição de pronto da missão
1. Tudo em `yagogavilan/webag` (privado), na `main`, histórico limpo, tag `v1.0.0`.
2. Roda com `git clone` + `.env.example → .env` + `docker compose up` (ou `pnpm setup`): banco, Redis, storage, e-mail de teste, API e painéis, com migrações e seed. App abre no Expo Go/dev build e no navegador. Instruções Windows, macOS, Linux.
3. Dados de demonstração realistas da região (lojas fictícias em bairros reais de Francisco Morato e Franco da Rocha, fotos livres, pedidos, trocas, avaliações). Credenciais demo para cliente, lojista dono, lojista funcionário e admin no README.
4. Pagamento simulado ponta a ponta; pronto para Mercado Pago real só com as chaves.
5. Pronto para servidor: Dockerfiles de produção, variáveis documentadas, guia de deploy (VPS com Docker + opção gerenciada), backup do banco, checklist de publicação nas lojas.
6. README completo e `docs/` atualizado (arquitetura, ADRs, modelo de dados, contrato da API, design system, decisões e hipóteses).
7. Relatório final curto: o que foi construído, como rodar, o que depende do fundador, hipóteses assumidas, backlog da fase 2.

## 9. Atualizações do fundador (2026-11-19)
- **Comissão:** percentual retido pela Webag em cada venda, configurado no admin por loja (ex.: 15%), com padrão geral e por categoria. O lojista cadastra o preço do produto já incluindo a comissão. (DEC-035)
- **Logística é da Webag:** o lojista prepara e marca "pronto para coleta"; a Webag despacha o motoboy. O admin precisa de uma área simples para ver os pedidos a entregar, atribuir o motoboy e acompanhar (inclui a coleta de trocas). A taxa de entrega passa a ser da Webag. Substitui o modelo "lojista entrega" (DEC-007). Detalhes e hipóteses em DEC-036. App do entregador continua fase 2.
