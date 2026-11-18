# PRD: App do Cliente (Android e iOS)

Status: pronto para G3 (aguarda estimativa dos devs e specs do designer) | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-001 a WB-038
Regras numéricas: `docs/produto/regras-de-negocio.md` (RN-xx). Hipóteses: `docs/decisoes.md` (HIP-xxx). Escopo de origem: brief §3.1.

## Problema
Quem sofre: Carla (P1, `personas.md`). Compra pelo celular, mas hoje acha produto de loja do bairro só por WhatsApp/Instagram, sem preço, estoque nem pagamento confirmado; ou compra de marketplace nacional com prazo de dias. Evidência: WhatsApp é o canal nº 1 do pequeno negócio (82%, Sebrae 2026) e Shopee/ML dominam bens de consumo (`pesquisa-mercado.md` §3-4). Frequência: compra de bens de consumo mensal; urgência semanal `[HIPÓTESE]`.

## Objetivo e métrica de sucesso
Permitir que morador da região encontre loja perto, compre e receba/retire em casa ou na loja, em menos de 2 minutos, sem tutorial.
| Métrica (AARRR) | Meta piloto `[HIPÓTESE]` (HIP-043) |
|---|---|
| Ativação: abre app > vê loja aberta > 1º item no carrinho | >= 50% dos que informam localização |
| Ativação: carrinho > pedido pago | >= 40% |
| Tempo médio do 1º pedido (abrir app até pagar), usuário novo | <= 2 min em teste de usabilidade (brief §5) |
| Receita: PIX / total de pedidos | >= 70% |
| Retenção: recompra em 30 dias | >= 25% |
| Indicação: pedidos com cupom de indicação | fora da 1.0 |

**Eventos de analytics** (nome_evento: propriedades): `app_open`, `location_set {method}`, `region_unavailable`, `signup_started/completed`, `login_success`, `search {query_len, results}`, `filter_applied {type}`, `store_viewed {store_id}`, `product_viewed`, `add_to_cart`, `cart_store_switch {confirmed}`, `coupon_applied {ok}`, `checkout_started`, `payment_method_selected {pix|card}`, `payment_result {ok, reason}`, `order_created`, `order_cancelled_by_customer`, `review_submitted`, `exchange_requested`. Sem dado pessoal nas propriedades (IDs apenas).

## Fora do escopo (1.0)
Pagamento na entrega (dinheiro/maquininha); carrinho com várias lojas; agendamento de entrega; rastreio do entregador no mapa (fase 2); chat interno (usa WhatsApp); pontos e assinatura (fase 2); cartão salvo; boleto e débito; SMS/WhatsApp como canal de código (HIP-022); indicação; "carrinho compartilhado"; pedido por voz; notas fiscais no app.

## Usuários e cenários
1. Carla abre o app no trem, define o CEP, vê lojas abertas perto, compra um presente, paga por PIX, acompanha.
2. Primeira compra: explora sem conta; cadastra só ao pagar.
3. Compra de moda com dúvida: abre a política de troca da loja antes de comprar.
4. Pedido não chega: usa o WhatsApp da loja; depois "não recebi".
5. Pede troca de tamanho (PRD trocas).

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-CLI-01 | Localização por GPS, CEP ou cidade; só mostra lojas que entregam no endereço; região fechada tem lista de espera | 001-004, 036 |
| RF-CLI-02 | Navegação sem login; conta só no checkout/favoritos | 005 |
| RF-CLI-03 | Cadastro, confirmação por código, login, esqueci a senha, preparado para login social | 006-010 |
| RF-CLI-04 | Home com banners, categorias e seções | 011, 012 |
| RF-CLI-05 | Busca, filtros e histórico | 013-015 |
| RF-CLI-06 | Páginas de loja e produto, avaliações, favoritos | 016-019 |
| RF-CLI-07 | Carrinho de 1 loja, aviso de troca, cupom e resumo sem surpresa | 020-022 |
| RF-CLI-08 | Checkout entrega/retirada com PIX e cartão, poucas etapas | 023-026 |
| RF-CLI-09 | Pedido em tempo real, cancelamento, contato WhatsApp, "não recebi" | 027-029, 037 |
| RF-CLI-10 | Conta: pedidos, perfil, cupons, ajuda; avaliação; denúncia | 030-034, 038 |
| RF-CLI-11 | Estados de erro/sem conexão em todas as telas | 035 |
| RF-CLI-12 | Exportar dados e excluir conta | PRD LGPD (WB-212, 213) |
| RF-CLI-13 | Trocas ("Retira Troca") | PRD trocas (WB-170 a 178) |

## Regras de negócio
RN-03 (visibilidade), RN-04 (frete), RN-05 (carrinho e preço), RN-06 (estoque), RN-07 (estados), RN-08 (cancelamento), RN-09 (cupons), RN-12 (avaliações).

## Requisitos não funcionais
- **Desempenho:** primeira tela útil (skeleton) < 2 s e conteúdo < 4 s em 3G Fast simulado num Android de 3 GB `[HIPÓTESE; meta a confirmar pelo mobile-dev]`; listas paginadas (20 por página); imagens progressivas com cache e tamanho adaptado; APK/IPA dentro dos limites das lojas.
- **Offline/instável:** navegação já carregada permanece; carrinho preservado; ações de escrita mostram erro claro com "Tentar de novo", nunca perdem o carrinho; pagamento nunca duplica ao reenviar (idempotência).
- **Acessibilidade:** WCAG 2.2 AA, alvos >= 44 pt (iOS) / 48 dp (Android), rótulos de leitor de tela, fonte dinâmica, contraste AA.
- **Idioma e texto:** pt-BR; sem emoji na interface; frases curtas (brief §5).
- **Segurança/LGPD:** localização só com permissão e finalidade; senha com medidor; sem dado de cartão no app além do token do provedor; tokens em armazenamento seguro; logs sem dado pessoal.
- **Compatibilidade:** Android 8+ e iOS 15+ `[HIPÓTESE; confirmar com mobile-dev pela cobertura do Expo]`.

## Histórias e critérios de aceite

### WB-001 Definir onde estou — Must — dep: WB-118
Como visitante, quero informar onde estou por GPS, CEP ou cidade, para ver só lojas que entregam em mim.
- **C1** Dado primeiro uso, quando abro o app, então vejo opções "Usar minha localização", "Digitar CEP" e "Escolher cidade", sem exigir login.
- **C2** Dado que concedi a permissão, quando o GPS retorna posição dentro de região ativa, então o app mostra o bairro/cidade e carrega lojas daquele ponto.
- **C3** Dado que neguei a permissão ou o GPS falhou após 10 s, quando toco "Digitar CEP" ou "Escolher cidade", então posso continuar sem a localização precisa e vejo lojas da cidade escolhida (sem frete exato, "a partir de").
- **C4** Dado que a posição está fora de qualquer região ativa, então vejo WB-004.

### WB-002 Endereço por CEP com autocompletar — Must — dep: WB-001
Como cliente, quero informar meu endereço digitando o CEP, para não preencher tudo.
- **C1** Dado CEP válido (8 dígitos, máscara 00000-000), quando termino de digitar, então rua, bairro e cidade são preenchidos e o foco vai ao campo Número.
- **C2** Dado CEP inexistente ou serviço de CEP indisponível, quando tento continuar, então vejo "Não achamos esse CEP. Preencha rua e bairro" e os campos ficam editáveis.
- **C3** Dado endereço completo, quando salvo, então o endereço é geocodificado; se falhar, peço confirmar a posição (pino no mapa) antes de concluir.
- **C4** Dado campo Complemento/ponto de referência, então é opcional (até 80 caracteres); Número aceita "S/N".
- **C5** Dado que a cidade/bairro do CEP está inativo, então vejo WB-004 e não salvo como endereço de entrega.

### WB-003 Gerenciar endereços salvos — Must — dep: WB-002, WB-006
Como cliente, quero guardar vários endereços, para pedir para casa, trabalho ou outro lugar.
- **C1** Dado até 8 endereços, quando adiciono o 9º, então vejo "Limite de 8 endereços. Apague um para adicionar".
- **C2** Dado lista de endereços, quando escolho um, então ele vira o endereço atual e a lista de lojas recarrega.
- **C3** Dado endereço padrão, quando o excluo, então o app pede para escolher outro como atual; se era o único, volta ao WB-001.
- **C4** Dado visitante (sem conta), então o endereço atual fica salvo só no aparelho e é movido para a conta no cadastro.

### WB-004 Região não atendida e lista de espera — Should — dep: WB-118
Como visitante fora da área, quero saber que ainda não chegaram aí e ser avisado, para não achar que o app está quebrado.
- **C1** Dado cidade/bairro inativo, então vejo "Ainda não chegamos em [bairro]" e a opção de ver lojas de uma cidade atendida.
- **C2** Dado que toco "Avisar quando chegar" e dou consentimento explícito (e-mail), então guardo e-mail, cidade e bairro e confirmo "Anotado".
- **C3** Dado e-mail inválido, então vejo erro no campo e nada é salvo.
- **C4** Dado que o admin ativa o bairro depois, então os inscritos ficam disponíveis para push/e-mail segmentado (WB-197), respeitando o consentimento.

### WB-005 Navegar sem login — Must — dep: WB-001
Como visitante, quero explorar lojas, produtos e preços sem criar conta, para decidir antes de me cadastrar.
- **C1** Dado visitante, quando navego por home, busca, loja e produto e adiciono ao carrinho, então nenhuma tela pede login.
- **C2** Dado visitante, quando toco "Finalizar pedido", favoritar ou "Meus pedidos", então vejo a tela de entrar/cadastrar e, após o login, volto exatamente para a ação.
- **C3** Dado visitante com carrinho, quando faz login, então o carrinho é preservado (regra RN-05).

### WB-006 Cadastro de conta — Must — dep: WB-210
Como visitante, quero criar conta com poucos campos, para finalizar a compra.
- **C1** Dado a tela de cadastro, então peço nome, e-mail, celular (máscara (11) 99999-9999), senha, confirmação da senha e aceite de termos/privacidade, e declaração de 18+ (HIP-026); não peço CPF, endereço nem data de nascimento.
- **C2** Dado senha com menos de `senha_min` caracteres, ou comum/vazada, quando digito, então o medidor mostra "Fraca" e o botão Continuar fica inativo; com 8+ e score >= médio, "Boa". Medidor do app: zxcvbn, nota 0-4 (0-1 "Fraca", 2 "Média", 3-4 "Boa"); "Continuar" fica ativo só com nota >= 2 **e** senha fora da lista de senhas comuns/vazadas (>= 10 mil entradas, SEC-001). O servidor repete a validação e decide de verdade; o medidor é só orientação (R-05).
- **C3** Dado e-mail já cadastrado, então vejo "Esse e-mail já tem conta. Entrar?" sem revelar se a conta foi confirmada. Esta rota (e `exists`) é enumeração de e-mail conhecida, risco **aceito** na 1.0 (DEC-017) e limitada por rate limit (SEC-005); o teste de QA verifica os limites, e o Security registra o parecer (R-31).
- **C4** Dado termos não marcados, então o botão fica inativo e o texto de privacidade abre em tela própria (link visível).
- **C5** Dado o cadastro concluído, então a conta fica "não confirmada" até WB-007, mas **posso finalizar o 1º pedido pago antes de confirmar** (DEC-014/015); os limites de uma conta não confirmada (2º pedido, cupom, exportação etc.) estão em WB-224.
- **C6** Dado e-mail com domínio provavelmente errado (ex.: "gmial.com"), então vejo a sugestão "Você quis dizer gmail.com?" e posso aceitar ou manter (WB-224 C5).

### WB-007 Confirmar conta por código — Must — dep: WB-006, WB-194
Como novo usuário, quero confirmar meu e-mail por código, para provar que a conta é minha.
- **C1** Dado cadastro concluído, então recebo e-mail com código de 6 dígitos válido por `otp_validade_min` (10 min); o e-mail traz só o código e texto genérico, sem nome, endereço, itens ou valores (WB-224 C6).
- **C2** Dado código correto dentro do prazo, então a conta é confirmada e sigo para onde estava.
- **C3** Dado código errado, então vejo "Código incorreto" e restam tentativas; após `otp_tentativas` (5) erros, o código é invalidado e preciso pedir outro.
- **C4** Dado "Reenviar", então só é possível após 60 s e no máximo 5 vezes por hora; o código anterior é invalidado.
- **C5** Dado código expirado, então vejo "Código vencido" e o botão Reenviar.

### WB-008 Entrar com e-mail e senha — Must — dep: WB-006
Como cliente, quero entrar com e-mail e senha, para acessar meus pedidos.
- **C1** Dado credenciais corretas, então entro e continuo logado por até 30 dias **deslizantes** neste aparelho, com limite **absoluto de 90 dias** (SEC-011). No dia 91 de uso contínuo preciso entrar de novo, com o texto "Entre de novo por segurança" (R-03).
- **C2** Dado credenciais erradas, então vejo "E-mail ou senha incorretos" (mesma mensagem para e-mail inexistente).
- **C3** Dado `login_falhas` (5) falhas seguidas **do mesmo dispositivo/IP contra a mesma conta**, então esse dispositivo/IP espera `login_espera_min` (15 min) e vê "Muitas tentativas. Tente em 15 minutos ou redefina a senha". **A conta nunca é bloqueada para o dono**: quem erra de outro dispositivo/IP não afeta quem tem a senha certa (WB-221; SEC-102).
- **C4** Dado conta bloqueada pelo admin, então vejo "Conta indisponível. Fale com o suporte" com link de contato.
- **C5** Dado conta não confirmada, então entro normalmente e vejo o aviso "Confirme seu e-mail" (WB-007); só o que WB-224 limita fica bloqueado.

### WB-009 Esqueci a senha — Must — dep: WB-008, WB-194
Como cliente, quero redefinir a senha dentro do app, para voltar a entrar.
- **C1** Dado e-mail informado (cadastrado ou não), então vejo sempre "Se o e-mail existir, enviamos um código" (sem revelar existência).
- **C2** Dado código válido por `otp_validade_min` (10 min; 6 dígitos, 5 tentativas), quando defino nova senha (regras de WB-006), então a senha muda, o e-mail passa a "confirmado", todas as sessões e renovações antigas são encerradas (WB-219) e eu entro.
- **C3** Dado código inválido ou expirado, então vejo o erro e posso pedir novo código.
- **C5** Dado nova senha recusada por ser fraca ou vazada, então o código **não é consumido** e posso tentar outra senha dentro da validade (R-21a).
- **C6** Dado conta bloqueada pelo admin, então o reset funciona (a senha muda) mas o login segue "Conta indisponível" (WB-008 C4) (R-21b).
- **C4** Dado a troca de senha, então recebo e-mail de aviso "Sua senha foi alterada".

### WB-010 Login Google e Apple (preparado) — Could — dep: WB-008, WB-120
Como cliente, quero entrar com Google ou Apple, para não criar senha.
- **C1** Dado feature flag `login_social` desligada (padrão), então os botões não aparecem.
- **C2** Dado a flag ligada e credenciais configuradas, então aparecem Google **e** Apple juntos (obrigatório na App Store se houver login social) e o login cria/associa a conta pelo e-mail verificado.
- **C3** Dado Apple "ocultar e-mail", então a conta é criada com o e-mail relay e o celular é pedido no checkout.
- **C4** Dado conta social, então "Excluir conta" também revoga o vínculo (WB-213).

### WB-011 Home: banners e categorias — Must — dep: WB-115, WB-106
Como cliente, quero ver ofertas e categorias ao abrir, para chegar rápido ao que procuro.
- **C1** Dado banners ativos na minha cidade e no período, então vejo o carrossel por ordem; toque abre o destino (loja, categoria, produto ou cupom).
- **C2** Dado nenhum banner ativo, então a área não aparece (sem espaço vazio).
- **C3** Dado categorias ativas, então vejo ícone e nome na ordem do admin; toque lista lojas/produtos da categoria na minha região.
- **C4** Dado categoria sem loja visível na região, então ela não é exibida.

### WB-012 Home: seções de lojas e produtos — Must — dep: WB-011, WB-016
Como cliente, quero ver lojas perto, ofertas, mais vendidos e lojas novas, para descobrir o que comprar.
- **C1** Dado endereço atual, então "Lojas perto de mim" lista lojas que entregam, abertas primeiro, depois distância e avaliação (RN-03), com nome, logo, nota, tempo e taxa.
- **C2** Dado produtos com promoção vigente, então "Ofertas" mostra de/por e % de desconto, só de lojas visíveis.
- **C3** Dado a regra RN-03, então "Mais vendidos" só aparece com 5+ pedidos nos últimos 30 dias na região e "Lojas novas" só com loja aprovada há <= 30 dias.
- **C4** Dado seção sem itens, então ela é ocultada; dado nenhuma loja visível, então vejo estado vazio "Ainda não há lojas aqui. Avisar quando houver?" (WB-004).
- **C5** Dado puxar para atualizar, então a home recarrega e preserva a posição.

### WB-013 Buscar produtos e lojas — Must — dep: WB-016, WB-017
Como cliente, quero buscar por nome, para achar rápido.
- **C1** Dado o termo "tenis" ou "Tênis", então ambos retornam o mesmo resultado (sem distinção de acento e maiúscula) e tolera 1 erro de digitação.
- **C2** Dado resultados, então há abas Produtos e Lojas, só de lojas que entregam no endereço atual, em até 1 s no p95 (servidor).
- **C3** Dado nenhum resultado, então vejo "Nada para [termo]" com sugestões (categorias) e opção de limpar filtros.
- **C4** Dado termo com menos de 2 caracteres, então não busca. Dado digitação, então há sugestões após 2 caracteres, sem disparar requisição a cada tecla (espera 300 ms).
- **C5** Dado produto de loja fechada, então aparece com selo "Fechada" e não pode ir ao checkout.

### WB-014 Filtros e ordenação — Must — dep: WB-013
Como cliente, quero filtrar por categoria, preço, distância, entrega grátis, avaliação e "aceita troca", para reduzir as opções.
- **C1** Dado filtros aplicados, então o resultado respeita todos juntos (E) e mostra contador de filtros ativos.
- **C2** Dado preço mínimo > máximo, então vejo erro no campo e o filtro não aplica.
- **C3** Dado "aceita troca", então só lojas com troca voluntária ativa (prazo > 0) aparecem.
- **C4** Dado distância (1, 3, 5, 10 km), avaliação (3+, 4+) e "entrega grátis" (frete R$ 0 nesse endereço), então filtra conforme RN-04.
- **C5** Dado ordenação (relevância, menor preço, distância, avaliação), então a lista reordena e mantém os filtros; "Limpar tudo" restaura.

### WB-015 Histórico de buscas — Should — dep: WB-013
Como cliente, quero ver minhas últimas buscas, para repetir rápido.
- **C1** Dado que busquei, então os últimos 10 termos distintos aparecem ao focar a busca, do mais recente ao mais antigo.
- **C2** Dado "Limpar histórico", então tudo é apagado do aparelho e da conta.
- **C3** Dado visitante, então o histórico fica só no aparelho.

### WB-016 Página da loja — Must — dep: WB-055, WB-056, WB-057
Como cliente, quero ver a loja com horário, taxa, prazo e política de trocas, para confiar antes de comprar.
- **C1** Dado a loja, então vejo capa, logo, nome, nota (ou "Novo" com menos de 3 avaliações), aberta/fechada com horário de hoje, tempo estimado, taxa de entrega para meu endereço (ou "Grátis acima de R$ X"), pedido mínimo, opção de retirada e política de trocas resumida.
- **C2** Dado vitrine, então os produtos aparecem por seções na ordem da loja; produto sem estoque aparece como "Indisponível", ao final.
- **C3** Dado loja fechada, então vejo "Fechada. Abre às HH:MM" e posso navegar, mas o carrinho não finaliza (RN-03).
- **C4** Dado loja que não entrega no meu endereço, então vejo "Não entrega no seu endereço" e, se aceita retirada e estiver a <= 10 km, "Retirar na loja".
- **C5** Dado que toco "Política de trocas", então vejo prazos e taxa de coleta da loja e os direitos fixos (arrependimento 7 dias, defeito) em linguagem simples.
- **C6** Dado a identificação do fornecedor, então vejo razão social/nome e CPF/CNPJ (parcial) e endereço da loja (Decreto 7.962/2013 `[validar com jurídico]`).

### WB-017 Página do produto — Must — dep: WB-060, WB-061, WB-062
Como cliente, quero ver fotos, variações, preço e estoque, para escolher certo.
- **C1** Dado o produto, então vejo galeria (swipe, zoom), nome, preço (de/por quando promoção vigente), descrição, variações e avaliações.
- **C2** Dado variações (ex.: tamanho, cor), então só as combinações com estoque são selecionáveis; as sem estoque aparecem riscadas e não clicáveis.
- **C3** Dado "Adicionar" sem escolher variação obrigatória, então vejo "Escolha o tamanho" e o seletor é destacado.
- **C4** Dado estoque disponível <= 3 numa variação, então vejo "Últimas X unidades".
- **C5** Dado promoção expirada enquanto vejo a tela, então ao adicionar o preço é atualizado e aviso o cliente (RN-05).
- **C6** Dado produto pausado ou removido por moderação, então vejo "Produto indisponível" com atalho para a loja.

### WB-018 Avaliações de loja e produto — Must — dep: WB-031
Como cliente, quero ler avaliações verificadas, para decidir.
- **C1** Dado avaliações, então vejo média, quantidade e lista paginada (10 por página), mais recentes primeiro, marcadas "Compra verificada".
- **C2** Dado menos de 3 avaliações, então a média não aparece e vejo "Novo"; os comentários existentes aparecem.
- **C3** Dado resposta da loja, então aparece abaixo do comentário.
- **C4** Dado nenhuma avaliação, então vejo "Ainda sem avaliações".

### WB-019 Favoritos — Should — dep: WB-008
Como cliente, quero favoritar lojas e produtos, para voltar depois.
- **C1** Dado login, quando toco o coração numa loja ou produto, então ele entra em Favoritos (sincronizado entre aparelhos).
- **C2** Dado visitante, quando toco o coração, então sigo WB-005 C2.
- **C3** Dado favorito de loja/produto indisponível, então aparece com selo "Indisponível" e posso remover.
- **C4** Dado lista vazia, então vejo "Você ainda não favoritou nada" com atalho para a home.

### WB-020 Carrinho — Must — dep: WB-017
Como cliente, quero ver e ajustar meu carrinho, para revisar antes de pagar.
- **C1** Dado item adicionado, então o carrinho mostra loja, itens com variação, quantidade (+/-), subtotal e permite remover.
- **C2** Dado quantidade maior que o estoque disponível, então ajusta ao máximo e avisa "Só temos X unidades".
- **C3** Dado item que ficou indisponível ou mudou de preço desde que adicionei, então vejo aviso por item e o total recalculado antes de continuar (RN-05).
- **C4** Dado carrinho vazio, então vejo "Seu carrinho está vazio" e botão para explorar.
- **C5** Dado subtotal abaixo do pedido mínimo, então vejo "Faltam R$ X para o pedido mínimo" e o botão de finalizar fica inativo.
- **C6** Dado carrinho parado por mais de `carrinho_validade_dias` (7), então é esvaziado.

### WB-021 Aviso ao trocar de loja — Must — dep: WB-020
Como cliente, quero ser avisado ao adicionar item de outra loja, para não perder o carrinho sem querer.
- **C1** Dado carrinho da Loja A, quando adiciono item da Loja B, então vejo "Trocar de loja? Seu carrinho da [A] será esvaziado" com "Trocar" e "Cancelar".
- **C2** Dado "Cancelar", então o carrinho da Loja A permanece e o item não entra.
- **C3** Dado "Trocar", então o carrinho passa a ser só da Loja B com o item novo.

### WB-022 Cupom no carrinho — Must — dep: WB-020, WB-073, WB-116
Como cliente, quero aplicar um cupom, para pagar menos.
- **C1** Dado código válido (RN-09), então o desconto aparece em linha própria e o total é recalculado.
- **C2** Dado código inexistente, expirado, esgotado, já usado ou com pedido mínimo não atingido, então vejo o motivo específico ("Cupom vencido", "Pedido mínimo R$ X") e o total não muda.
- **C3** Dado um cupom já aplicado, quando aplico outro, então ele substitui o primeiro (não cumulativo).
- **C4** Dado cupom que zeraria o total, então o total mínimo cobrado é R$ 1,00 (HIP-037).
- **C5** Dado "Remover cupom", então o total volta ao original.
- **C6** Dado conta com e-mail não confirmado e cupom da plataforma ou de primeira compra, então vejo "Confirme seu e-mail para usar este cupom" e o total não muda (WB-224 C2).
- **C7** Dado cupom da plataforma que, no modo split, excederia a comissão do pedido, então o desconto aplicado é limitado a esse teto e o resumo mostra o valor realmente aplicado (WB-116 C6).

### WB-023 Checkout: entrega ou retirada — Must — dep: WB-020, WB-003, WB-005
Como cliente, quero escolher entrega ou retirada e confirmar o endereço, para fechar o pedido em poucos toques.
- **C1** Dado login (e-mail confirmado ou, no 1º pedido pago, ainda não confirmado, WB-224), então o checkout tem no máximo: (1) entrega/retirada + endereço, (2) pagamento, (3) revisar e pagar; nenhum campo extra além de CPF quando o provedor exigir.
- **C2** Dado resumo, então vejo subtotal, desconto, frete (ou "Grátis"), taxa de serviço (se houver) e **total** antes de pagar, com o mesmo valor que será cobrado.
- **C3** Dado loja que não aceita retirada, então a opção não aparece; dado endereço fora do raio, então só retirada (se houver) ou aviso para trocar de endereço.
- **C4** Dado loja fechada, pausada ou que fechou durante o checkout, então bloqueio com "Loja fechada" e o carrinho é mantido.
- **C5** Dado alteração de preço, estoque ou frete desde o carrinho, então vejo "Algo mudou" com o que mudou e confirmo antes de pagar (RN-05).
- **C6** Dado total acima de `pedido_max_cents` (R$ 2.000,00), então bloqueio com mensagem clara.
- **C7** Dado que o provedor exige CPF, então pedimos CPF com máscara e validação, uma vez, e guardamos para os próximos pedidos (LGPD: finalidade pagamento).
- **C8** Dado loja nova com total acima do limite de WB-225, então bloqueio com "Esta loja é nova e aceita pedidos de até R$ X por enquanto" e o carrinho é mantido.
- **C9** Dado conta não confirmada que já fez 1 pedido pago, então o checkout pede a confirmação do e-mail antes de pagar (WB-224 C1).

### WB-024 Pagar com PIX — Must — dep: WB-023, WB-151
Como cliente, quero pagar por PIX com QR ou copia e cola, para confirmar na hora.
- **C1** Dado "Pagar com PIX", então o pedido é criado (AGUARDANDO_PAGAMENTO), o estoque reservado e vejo QR, botão "Copiar código" e contagem regressiva de `pix_expiracao_min` (15 min).
- **C2** Dado pagamento aprovado, então a tela muda sozinha em até 5 s (push/WebSocket, com polling de contingência) para o pedido RECEBIDO.
- **C3** Dado a contagem chegando a zero, então vejo "PIX expirado" com "Gerar novo PIX" (o pedido anterior vira EXPIRADO e o estoque é liberado; novo PIX cria novo pedido se o estoque permitir).
- **C4** Dado "Copiar código", então confirma "Copiado" e o código fica na área de transferência; QR respeita contraste e tamanho legíveis.
- **C5** Dado que saí do app com PIX pendente, então ao voltar vejo o PIX pendente com o tempo restante em "Meus pedidos".
- **C6** Dado erro de rede ao criar o PIX, então vejo "Não conseguimos gerar o PIX. Tente de novo" e nenhum pedido duplicado é criado (idempotência).

### WB-025 Pagar com cartão de crédito — Must — dep: WB-023, WB-152
Como cliente, quero pagar com cartão com segurança, para parcelar quando precisar.
- **C1** Dado "Cartão", então número, validade, CVV e nome são digitados no campo seguro do provedor (nunca nos nossos servidores) e vejo as parcelas (1x a `parcelas_max`, parcela >= R$ 30) com o **total final com juros**.
- **C2** Dado aprovação, então o pedido segue para RECEBIDO.
- **C3** Dado recusa, então vejo o motivo amigável (saldo, dados incorretos, recusado pelo banco) e posso tentar outro cartão ou PIX sem perder o carrinho; o pedido continua AGUARDANDO_PAGAMENTO até expirar.
- **C4** Dado 3DS exigido pelo provedor, então o desafio abre dentro do app (ou, se a tela interna não suportar o banco emissor, no navegador do sistema) e, ao concluir, volta ao pedido (WB-152 C7).
- **C5** Dado 5 tentativas de cartão em 1 hora, então bloqueio temporário de cartão com sugestão de PIX.
- **C6** Dado timeout do provedor, então vejo "Estamos confirmando seu pagamento" e o app consulta o status; nunca cobra duas vezes.

### WB-026 Retirada: código e instruções — Must — dep: WB-023, WB-058
Como cliente, quero retirar na loja com um código, para buscar sem filas.
- **C1** Dado pedido de retirada pago, então vejo endereço da loja, horário, instruções e o código de 4 dígitos.
- **C2** Dado status PRONTO_PARA_RETIRADA, então recebo push "Seu pedido está pronto" e o código fica em destaque.
- **C3** Dado que não retirei em `retirada_prazo_horas` (48 h), então o pedido é cancelado com estorno total e eu sou avisado 24 h antes.
- **C4** Dado "Como chegar", então abre o mapa do aparelho com o endereço.

### WB-027 Acompanhar o pedido — Must — dep: WB-024, WB-025, WB-069
Como cliente, quero ver em que etapa está o meu pedido, para saber quando chega.
- **C1** Dado pedido ativo, então vejo a linha do tempo (recebido, aceito, em separação, saiu para entrega / pronto para retirada, entregue) com a etapa atual destacada e hora de cada uma.
- **C2** Dado mudança de status, então a tela atualiza em até 5 s sem eu fazer nada, e recebo push (WB-191).
- **C3** Dado sem conexão, então vejo o último estado salvo com "Atualizado há X min" e a tela atualiza ao voltar a conexão.
- **C4** Dado pedido recusado, cancelado ou expirado, então a linha do tempo mostra o motivo, o ator e o estado do estorno.
- **C5** Dado o tempo estimado da loja, então ele aparece como informado (ex.: "30 a 60 min").
- **C6** Dado ENTREGUE, então aparece "Avaliar" (WB-031) e "Pedir troca" (WB-170) dentro dos prazos.

### WB-028 Cancelar pedido — Must — dep: WB-027, WB-154
Como cliente, quero cancelar enquanto a loja não separou, para não receber o que não quero.
- **C1** Dado RECEBIDO ou ACEITO, quando toco "Cancelar pedido" e confirmo, então o pedido vira CANCELADO (ator cliente), o estoque é liberado e o estorno total é iniciado; vejo o prazo (PIX: conta de origem; cartão: até 2 faturas).
- **C2** Dado EM_SEPARACAO, então o botão vira "Pedir cancelamento": a loja decide em 10 min; sem resposta, o admin decide; vejo o andamento.
- **C3** Dado SAIU_PARA_ENTREGA ou PRONTO_PARA_RETIRADA, então não há cancelar; vejo "Fale com a loja" e, após receber, "Pedir troca ou devolução".
- **C4** Dado AGUARDANDO_PAGAMENTO, então cancelo sem custo.
- **C5** Dado cancelar duas vezes (toque duplo), então só um cancelamento e um estorno ocorrem.

### WB-029 Falar com a loja pelo WhatsApp — Must — dep: WB-055
Como cliente, quero chamar a loja pelo WhatsApp, para tirar dúvida do pedido.
- **C1** Dado pedido ativo ou concluído há <= 30 dias, então vejo "Falar com a loja" e o WhatsApp abre com mensagem pronta "Olá, sobre o pedido #[número]".
- **C2** Dado WhatsApp não instalado, então abre a versão web; sem nenhum, mostra o número para copiar.
- **C3** Dado loja sem WhatsApp cadastrado, então o botão não aparece e mostro o telefone da loja, se houver.

### WB-030 Meus pedidos e pedir de novo — Must (pedir de novo: Should) — dep: WB-027
Como cliente, quero ver meus pedidos e repetir um, para comprar de novo sem procurar.
- **C1** Dado pedidos, então vejo lista por data, com loja, valor, status e itens, paginada (20) e mais recente primeiro; ativos no topo.
- **C2** Dado nenhum pedido, então vejo "Você ainda não pediu" e botão para explorar.
- **C3** Dado "Pedir de novo", então os itens ainda disponíveis vão ao carrinho (RN-05) e os indisponíveis são listados no aviso; se a loja estiver fechada, aviso antes.
- **C4** Dado detalhe do pedido, então vejo itens, endereço, forma de pagamento, valores (com snapshot da época), comprovante e opções cabíveis (avaliar, trocar, ajuda).

### WB-031 Avaliar loja e produto — Must — dep: WB-027
Como cliente, quero avaliar após receber, para ajudar outros e premiar a loja.
- **C1** Dado ENTREGUE, então em até 30 dias posso dar nota 1 a 5 à loja e a cada produto do pedido, com comentário opcional de até 500 caracteres.
- **C2** Dado nota sem comentário, então envio normalmente; dado comentário > 500 caracteres, então contador e bloqueio.
- **C3** Dado pedido já avaliado, então a tela mostra minha avaliação e não permite reenviar (só apagar e reenviar na janela).
- **C4** Dado pedido cancelado/recusado/expirado, então o botão não existe.
- **C5** Dado janela de 30 dias encerrada, então vejo "Prazo para avaliar encerrado".
- **C6** Dado envio sem conexão, então o texto é preservado e reenvio ao reconectar.

### WB-032 Perfil e dados pessoais — Must — dep: WB-008
Como cliente, quero ver e editar meus dados, para mantê-los corretos.
- **C1** Dado perfil, então posso editar nome e celular (máscara) e ver e-mail; trocar e-mail exige a senha (reautenticação de 5 min) e confirmar por código no **novo** e-mail, com aviso ao e-mail antigo; conta com e-mail ainda não confirmado não troca e-mail por este caminho, usa "Corrigir e-mail" (WB-224 C4).
- **C2** Dado "Alterar senha", então peço a atual, a nova e a confirmação (regras de WB-006) e encerro outras sessões.
- **C3** Dado "Sair", então o app limpa tokens do aparelho; os favoritos e o carrinho continuam na conta.
- **C4** Dado dados inválidos, então erro no campo e nada é salvo.

### WB-033 Meus cupons — Should — dep: WB-022
Como cliente, quero ver cupons disponíveis, para usar antes de vencer.
- **C1** Dado cupons nominais/de campanha ativos para mim, então vejo código, desconto, loja ou "toda a plataforma", mínimo e validade; "Usar" aplica ao carrinho se for da mesma loja.
- **C2** Dado nenhum cupom, então vejo "Sem cupons agora".
- **C3** Dado cupom a vencer em 48 h, então tem selo "Vence em breve".

### WB-034 Ajuda e suporte — Should — dep: WB-119
Como cliente, quero achar ajuda rápido, para resolver sem depender do acaso.
- **C1** Dado "Ajuda", então vejo perguntas frequentes (pedido, pagamento, troca, conta), com texto editável pelo admin, e o contato do suporte Webag (WhatsApp e e-mail).
- **C2** Dado pedido selecionado, então "Ajuda com este pedido" leva ao suporte com o número do pedido preenchido.
- **C3** Dado links de termos e privacidade, então abrem a versão vigente (WB-117).

### WB-035 Sem conexão e erros — Must — dep: transversal
Como cliente com internet instável, quero que o app me diga o que fazer, para não ficar preso.
- **C1** Dado perda de conexão, então aparece uma faixa "Sem conexão" e o conteúdo já carregado continua visível.
- **C2** Dado erro de servidor (5xx) numa tela, então vejo "Algo deu errado. Tentar de novo" sem código técnico; o toque tenta novamente.
- **C3** Dado ação de escrita (pagar, cancelar, avaliar) sem conexão, então é bloqueada com explicação, sem fila silenciosa para pagamento.
- **C4** Dado modo manutenção (WB-121), então todas as telas mostram "Voltamos já" com a mensagem do admin.
- **C5** Dado versão do app obsoleta e incompatível com a API, então vejo "Atualize o app" com link da loja.

### WB-036 Modo Retirada na home — Should — dep: WB-012, WB-058
Como cliente, quero alternar para Retirada, para ver lojas onde posso buscar.
- **C1** Dado "Retirada" selecionada, então vejo lojas com retirada ativa a <= `retirada_distancia_max_km` (10), com distância.
- **C2** Dado nenhuma loja, então vejo estado vazio com "Voltar para entrega".
- **C3** Dado a escolha, então ela persiste até eu trocar.

### WB-037 "Não recebi meu pedido" — Must — dep: WB-027, WB-110
Como cliente, quero avisar que o pedido não chegou, para ser atendido sem esperar o prazo automático.
- **C1** Dado SAIU_PARA_ENTREGA há mais de 2 h ou ENTREGUE há <= 48 h, então vejo "Não recebi".
- **C2** Dado que toco e confirmo, então o pedido entra em disputa (admin notificado, loja notificada) e vejo o protocolo; o admin pode estornar a partir da conta do lojista (WB-110 C4), sem depender de retenção de repasse.
- **C3** Dado a disputa aberta, então a conclusão automática de 24 h (RN-07) fica suspensa.
- **C4** Dado resolução do admin, então recebo notificação com o resultado (estorno ou confirmação).

### WB-038 Denunciar avaliação, produto ou loja — Must — dep: WB-124
Como usuário, quero denunciar conteúdo impróprio, para manter o app seguro (exigência das lojas de apps).
- **C1** Dado avaliação, produto ou loja, então vejo "Denunciar" com motivos (ofensivo, falso, produto proibido, golpe, outro) e texto opcional de até 200 caracteres.
- **C2** Dado denúncia enviada, então vejo "Recebemos. Vamos analisar" e a denúncia entra na fila do admin (WB-124).
- **C3** Dado denúncia repetida do mesmo usuário ao mesmo item, então é ignorada com a mesma mensagem.
- **C4** Dado visitante, então a denúncia exige login para evitar abuso.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Geocodificação e CEP (provedor externo, custo/limite) | Dependência técnica | ADR do backend; fallback de pino no mapa; aprovação do fundador se houver custo |
| Credenciais Mercado Pago e Apple/Google | Dependência do fundador | Provedor simulado; `.env.example` |
| Cold start (poucas lojas) | Risco de produto | Seed realista; seções vazias ocultadas; abrir por bairro |
| Login social exige Apple se Google ligado | Regra de loja | Flag desligada por padrão |
| Textos de política de trocas e identificação do fornecedor | Risco jurídico | Parecer do fundador/jurídico antes de G5 |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Provedor de geocodificação e mapa (custo, limites) | backend-dev + tech-lead (ADR); fundador se pago |
| Cobertura mínima de Android/iOS suportada | mobile-dev |
| Texto final de termos, privacidade e política de trocas | fundador/jurídico (PO fornece minuta técnica) |
| Meta de desempenho em 3G (números finais) | tech-lead + mobile-dev |
