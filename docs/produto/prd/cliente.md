# PRD: App do Cliente (Android e iOS)

Status: pronto para G3 (aguarda estimativa dos devs e specs do designer); atualizado em 2026-11-19 pela DEC-053 (entrega em até 2 h) | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-001 a WB-038, WB-250 a WB-254, WB-259 a WB-261 (DEC-060 a DEC-065, 2026-11-19)
Regras numéricas: `docs/produto/regras-de-negocio.md` (RN-xx; a promessa de entrega é a **RN-19**). Hipóteses: `docs/decisoes.md` (HIP-xxx). Escopo de origem: brief §3.1.

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
> **DEC-061 (2026-11-19): a lista de espera (C2 a C4) é FASE 2.** Na 1.0 o estado vazio não captura e-mail: mostra o texto e "Ver lojas de outra cidade" (C1) e dispara o evento `region_not_served_shown {city}`, que mede a demanda por região sem dado pessoal. Gatilho para a fase 2: mais de 50 aberturas por semana em uma região fora da área, ou decisão de abrir a região (backlog §6.5). Corta: tabela, endpoint, consentimento `waitlist` no app e o segmento "lista de espera" do push (WB-197).
- **C2** **(Fase 2)** Dado que toco "Avisar quando chegar" e dou consentimento explícito (e-mail), então guardo e-mail, cidade e bairro e confirmo "Anotado". Modelo `[HIPÓTESE]`: **1 inscrição por e-mail e por bairro** (repetir o mesmo par não duplica nem acusa erro); o consentimento é próprio e fica registrado por inscrição (WB-211); quem se inscreve em 2 bairros tem 2 inscrições, cada uma revogável.
- **C3** **(Fase 2)** Dado e-mail inválido, então vejo erro no campo e nada é salvo.
- **C4** **(Fase 2)** Dado que o admin ativa o bairro depois, então os inscritos ficam disponíveis para push/e-mail segmentado (WB-197), respeitando o consentimento.
- **C5** **(DEC-053, ajustada por DEC-061 e D8)** Dado região ativa em que **nenhuma loja alcança o endereço** (longe demais para a entrega), então o estado vazio é **o mesmo** de "Ainda não chegamos em [bairro]" (um estado só, D8), com o texto da seção "Copy" e a ação "Ver lojas de outra cidade"; se alguma loja aceita retirada a <= `retirada_distancia_max_km`, aparece "Retirar na loja" `[HIPÓTESE; entra com WB-251 C2, sem trabalho novo]`. Sem captura de e-mail na 1.0.
- **C6** Dado o estado vazio exibido, então o app registra `region_not_served_shown {city}` (sem dado pessoal; AARRR: aquisição, demanda por região).

### WB-005 Navegar sem login — Must — dep: WB-001
Como visitante, quero explorar lojas, produtos e preços sem criar conta, para decidir antes de me cadastrar.
- **C1** Dado visitante, quando navego por home, busca, loja e produto e adiciono ao carrinho, então nenhuma tela pede login.
- **C2** Dado visitante, quando toco "Finalizar pedido", favoritar ou "Meus pedidos", então vejo a tela de entrar/cadastrar e, após o login, volto exatamente para a ação.
- **C3** Dado visitante com carrinho, quando faz login, então o carrinho é preservado (regra RN-05).

### WB-006 Cadastro de conta — Must — dep: WB-210
Como visitante, quero criar conta com poucos campos, para finalizar a compra.
- **C1** Dado a tela de cadastro, então peço nome, e-mail, celular (máscara (11) 99999-9999), senha, confirmação da senha e aceite de termos/privacidade, e declaração de 18+ (HIP-026); não peço CPF, endereço nem data de nascimento.
- **C2** Dado senha com menos de `senha_min` caracteres, ou comum/vazada, quando digito, então o medidor mostra "Fraca"; com 8+ e score >= médio, "Boa". Medidor do app: zxcvbn, nota 0-4 (0-1 "Fraca", 2 "Média", 3-4 "Boa"). O botão "Continuar" **fica sempre ativo** (RN-17, DEC-024d): ao tocar com senha de nota < 2 **ou** presente na lista de senhas comuns/vazadas (>= 10 mil entradas, SEC-001), **não envia**, foca o campo da senha e mostra o motivo ("Escolha uma senha mais forte: [dica]"). O servidor repete a validação e decide de verdade; o medidor é só orientação (R-05).
- **C3** Dado e-mail já cadastrado, então vejo "Esse e-mail já tem conta. Entrar?" sem revelar se a conta foi confirmada. Esta rota (e `exists`) é enumeração de e-mail conhecida, risco **aceito** na 1.0 (DEC-017) e limitada por rate limit (SEC-005); o teste de QA verifica os limites, e o Security registra o parecer (R-31).
- **C4** Dado termos (ou a declaração de 18+) não marcados, quando toco "Continuar" (botão sempre ativo, RN-17), então **não envia**, mostra "Aceite os termos para continuar" junto à caixa e leva o foco até ela; o texto de privacidade abre em tela própria (link visível).
- **C7** Dado o cadastro, então **nenhum consentimento de marketing é pedido nele** (DEC-024f): a oferta de "Ofertas e novidades" aparece só depois do 1º pedido pago e em Conta > Notificações (WB-196 C6); recusar ou ignorar não afeta nada.
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
- **C1** Dado endereço atual, então "Lojas perto de mim" lista lojas que entregam, abertas primeiro, depois distância e avaliação (RN-03), com nome, logo, nota, **faixa de chegada em minutos** (WB-250) e taxa; só entram lojas dentro do alcance de 2 h (WB-251).
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
- **C1** Dado a loja, então vejo capa, logo, nome, nota (ou "Novo" com menos de 3 avaliações), aberta/fechada com horário de hoje, **faixa de chegada** para meu endereço (RN-19, WB-250; antes "preparo + deslocamento"), **taxa de entrega da Webag** para meu endereço (tabela do admin, RN-04; "a partir de R$ X" sem endereço completo; ou "Grátis acima de R$ X"), pedido mínimo (global), opção de retirada e política de trocas resumida (prazo da troca por tamanho/cor, "levando à loja é grátis").
- **C2** Dado vitrine, então os produtos aparecem por seções na ordem da loja; produto sem estoque aparece como "Indisponível", ao final.
- **C3** Dado loja fechada, então vejo "Fechada. Abre às HH:MM" e posso navegar, mas o carrinho não finaliza (RN-03).
- **C4** Dado loja que não entrega no meu endereço (inclui fora do alcance de 2 h, WB-251), então vejo o texto da seção "Copy" e, se aceita retirada e estiver a <= 10 km, "Retirar na loja".
- **C5** Dado que toco "Política de trocas", então vejo prazos e taxa de coleta da loja e os direitos fixos (arrependimento 7 dias, defeito) em linguagem simples.
- **C6** Dado a identificação do fornecedor, então vejo razão social/nome e CPF/CNPJ (parcial) e endereço da loja (Decreto 7.962/2013 `[validar com jurídico]`).

### WB-017 Página do produto — Must — dep: WB-060, WB-061, WB-062
Como cliente, quero ver fotos, variações, preço e estoque, para escolher certo.
- **C1** Dado o produto, então vejo galeria (swipe, zoom), nome, preço (de/por quando promoção vigente), descrição, variações, **tabela de medidas** quando a loja a preencheu (WB-246), o resumo "Como vestiu?" quando há respostas suficientes (WB-247), o aviso "Não aceita troca por tamanho ou cor" quando for o caso (WB-244) e avaliações.
- **C2** Dado variações (ex.: tamanho, cor), então só as combinações com estoque são selecionáveis; as sem estoque aparecem riscadas e não clicáveis.
- **C3** Dado "Adicionar" sem escolher variação obrigatória, então vejo "Escolha o tamanho" e o seletor é destacado.
- **C4** Dado estoque disponível <= 3 numa variação, então vejo "Últimas X unidades".
- **C5** Dado promoção expirada enquanto vejo a tela, então ao adicionar o preço é atualizado e aviso o cliente (RN-05).
- **C6** Dado produto pausado ou removido por moderação, então vejo "Produto indisponível" com atalho para a loja.
- **C7** **(DEC-053; WB-250, WB-251)** Dado produto de loja dentro do alcance, então vejo "Chega entre HH:MM e HH:MM" e a taxa de entrega junto ao botão de adicionar; dado loja fora do alcance, então vejo o aviso de WB-251 no lugar do prazo e o botão "Adicionar" continua disponível só se houver retirada.

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
- **C5** Dado subtotal abaixo do pedido mínimo, então vejo "Faltam R$ X para o pedido mínimo" e o botão principal vira "Adicionar mais itens" (leva à loja); não há botão de finalizar desabilitado (RN-17).
- **C6** Dado carrinho parado por mais de `carrinho_validade_dias` (7), então é esvaziado.
- **C7** **(DEC-053; WB-250, WB-251)** Dado carrinho com endereço de entrega, então a sacola mostra "Chega entre HH:MM e HH:MM" (recalculado ao abrir e a cada minuto parado); dado endereço que deixa a loja fora do alcance, então bloqueia com o texto de fora da área, mantém a sacola e oferece "Trocar endereço" e, se houver, "Retirar na loja".

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
- **C3** Dado loja que não aceita retirada, então a opção não aparece; dado endereço fora do `raio_max_km`, **fora do alcance de 2 h (WB-251)**, de região inativa, ou logística fechada/pausada, então só retirada (se houver) ou aviso para trocar de endereço, com o motivo escrito ("Entregas voltam às 9h", hora falada, D3; WB-260); a taxa de entrega vem da tabela da Webag (WB-237) e o resumo a mostra em linha própria "Entrega Webag".
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
- **C1** Dado pedido ativo, então vejo a linha do tempo (recebido, aceito, em separação, **pronto aguardando o motoboy, motoboy a caminho da loja, saiu para entrega** / pronto para retirada, entregue) com a etapa atual destacada e hora de cada uma; os estados da entrega são da logística da Webag (WB-235, RN-18).
- **C2** Dado mudança de status, então a tela atualiza em até 5 s sem eu fazer nada, e recebo push (WB-191).
- **C3** Dado sem conexão, então vejo o último estado salvo com "Atualizado há X min" e a tela atualiza ao voltar a conexão.
- **C4** Dado pedido recusado, cancelado ou expirado, então a linha do tempo mostra o motivo, o ator e o estado do estorno.
- **C5** **(DEC-053; detalhe em WB-252 e WB-253)** Dado pedido de entrega, então vejo a **faixa de chegada em horário** ("Chega entre 15:40 e 16:10") calculada pela Webag (RN-19), atualizada conforme o status e sem horário único; pedido de retirada mostra o preparo informado pela loja (faixa em minutos).
- **C6** Dado ENTREGUE, então aparece "Avaliar" (WB-031) e "Pedir troca" (WB-170) dentro dos prazos.

### WB-028 Cancelar pedido — Must — dep: WB-027, WB-154
Como cliente, quero cancelar enquanto a loja não separou, para não receber o que não quero.
- **C1** Dado RECEBIDO ou ACEITO, quando toco "Cancelar pedido" e confirmo, então o pedido vira CANCELADO (ator cliente), o estoque é liberado e o estorno total é iniciado; vejo o prazo (PIX: conta de origem; cartão: até 2 faturas).
- **C2** Dado EM_SEPARACAO, então o botão vira "Pedir cancelamento": a loja decide em 10 min; sem resposta, o admin decide; vejo o andamento.
- **C3** Dado PRONTO_PARA_COLETA, SAIU_PARA_ENTREGA ou PRONTO_PARA_RETIRADA, então não há cancelar (**exceto "Cancelar sem custo" por atraso da entrega, WB-253**); vejo "Fale com a loja" (e "Falar com a Webag" na entrega) e, após receber, "Trocar" ou "Desistir da compra" (WB-170).
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
- **C7** Dado produto de moda ou calçado, então há a pergunta opcional "Como vestiu?" (WB-247, DEC-037); a avaliação da **entrega** (atraso do motoboy) é uma pergunta separada da nota da loja e do produto, para a loja não pagar pelo atraso da Webag `[HIPÓTESE; Designer desenha]`.

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
- **C1** Dado "Ajuda", então vejo perguntas frequentes (pedido, pagamento, troca, conta), com texto editável pelo admin, e o contato do suporte Webag (WhatsApp e e-mail) e o horário de atendimento. WhatsApp, e-mail, horário (texto até 60) e e-mail do encarregado são **configuração de conteúdo editável no admin sem deploy** (operação e super admin, auditado; tela AJ3), não constantes no código; a mesma configuração alimenta a Ajuda do lojista (WB-227) e WB-217 C1.
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

## Promessa de entrega em até 2 h (DEC-053)
Regra, fórmula e atraso: RN-19. Motor de cálculo, lote, alerta à operação e parâmetros: `logistica.md` (WB-249, 255, 256, 258). Preparo da loja: `lojista.md` WB-057 e WB-257. Nenhuma tela mostra horário único. **O app não escreve "2 h" em lugar nenhum** (D1, DEC-054, HIP-E09); "Chega em até 2 h" só existiria como mensagem geral externa depois de medir 95% no piloto e revisar a copy (J14), e hoje fica fora do app e dos materiais.

### WB-250 Faixa de chegada na descoberta, loja, produto e sacola — Must — dep: WB-249, WB-012, WB-016, WB-017, WB-020
Como cliente, quero ver quando o pedido chega antes de escolher e de pagar, para comprar na loja que atende meu prazo.
- **C1** Dado endereço com posição, quando vejo a lista de lojas (home, busca, categoria), então cada cartão mostra a faixa **em minutos** ("45 a 75 min") e a taxa, e a ordenação "perto de mim" continua RN-03 (a faixa não reordena sozinha; `sort=eta` do contrato é opcional no filtro, WB-014).
- **C2** Dado a página da loja, então vejo a faixa em minutos e, ao lado, o horário de chegada de relógio ("Chega entre 15:40 e 16:10"); dado a página do produto, vejo o horário de relógio junto à taxa; dado a sacola e o checkout, o horário de relógio com a frase "A contagem começa quando o pagamento for aprovado".
- **C3** Dado que o endereço mudou (WB-003), então todas as faixas e a lista são recalculadas; a sacola recalcula ao abrir e a cada minuto com a tela parada; o horário nunca fica "velho" (mostra sempre a partir de agora).
- **C4** Dado sem endereço (visitante com só cidade), então os cartões **não mostram prazo** e a loja pede o endereço ("Informe seu endereço para ver o horário"); nenhuma faixa de distância é inventada e **o app não escreve "2 h" em lugar nenhum** (D1, DEC-054: as capturas das lojas de apps são telas do app; HIP-E09).
- **C5** Dado loja de retirada, então não há faixa de entrega; vale o preparo informado pela loja (WB-058 C1).
- **C6** Dado loja fechada ou logística fechada (RN-04), então a faixa não aparece; aparece "Abre às HH:MM" ou "Entrega volta às HH:MM".
- **C7** Dado o fim da faixa ficar **mais tarde** entre a sacola e a criação do pedido, então "O horário mudou" com a faixa nova e o cliente confirma antes de pagar (WB-261; WB-249 C5).
- **C8** Dado leitor de tela, então o rótulo acessível lê a faixa por extenso ("Chega entre 15 horas e 40 minutos e 16 horas e 10 minutos"); a faixa nunca depende só de cor ou ícone.
- **C9** Dado sem conexão, então vejo o último valor com "Atualizado há X min" e a sacola bloqueia o pagamento até recalcular (a faixa é do servidor).
- **Eventos:** `eta_shown {surface: list|store|product|cart, minMin, maxMin}`; AARRR: ativação (carrinho > pedido pago) por faixa mostrada (HIP-E10).

### WB-251 Loja fora do alcance de 2 h — Must — dep: WB-249, WB-004, WB-016
Como cliente, quero saber por que uma loja não entrega aqui, para escolher outra loja ou retirar.
- **C1** Dado endereço e loja cujo fim da faixa passa de `entrega_max_min`, então a loja **não aparece** na lista nem na busca para esse endereço (RN-03, RN-19).
- **C2** Dado que chego à loja ou ao produto por link, favorito, histórico ou "pedir de novo", então vejo o texto de "fora da área" (seção "Copy"), sem faixa, e o botão de entrega **ausente** (não desabilitado sem explicação, RN-17); se a loja aceita retirada e está a <= `retirada_distancia_max_km`, aparece "Retirar na loja".
- **C3** Dado sacola com item de loja que passou a estar fora do alcance (troquei de endereço), então o checkout bloqueia com o texto de fora da área e a sacola é mantida com "Trocar endereço" e "Ver lojas que entregam aí"; **nenhuma opção de recebimento vem pré-selecionada** e o botão principal vira "Escolha como receber" (D7: trocar sozinho para retirada mudaria total e modo sem o cliente perceber).
- **C3b** Dado o motivo da indisponibilidade, então o texto diz a causa real (WB-260): longe demais, entregas fechadas (com hora de volta) ou entregas pausadas.
- **C4** Dado que **nenhuma** loja alcança o endereço, então vale o estado vazio e a lista de espera (WB-004 C5).
- **C5** Dado servidor recebendo pedido fora do alcance, então 422 `OUT_OF_RANGE` e nenhum pedido é criado (a regra é do servidor).
- **C6** Dado que o fim da faixa só passa do teto por mudança de parâmetro no admin, então pedidos já criados não são afetados (RN-19 item 3).
- **Evento:** `eta_out_of_range {surface}`.

### WB-252 Pedido: faixa gravada e atualizada conforme o status — Must — dep: WB-249, WB-027, WB-235
Como cliente, quero saber quando meu pedido chega e ver o horário acompanhar o andamento, para esperar em casa.
- **C1** Dado pedido de entrega pago, então a tela e o push de "Pedido recebido" mostram "Chega entre HH:MM e HH:MM" (a faixa **reancorada** no pagamento, RN-19 item 3).
- **C2** Dado ACEITO, EM_SEPARACAO, PRONTO_PARA_COLETA e motoboy a caminho, então o horário **não muda**; abaixo vejo o texto "Atualizamos o horário conforme o pedido avança".
- **C3** Dado SAIU_PARA_ENTREGA, então o horário é recalculado só pelo deslocamento restante e **só pode ficar mais cedo**: se encurtou, a tela mostra a faixa nova; o aviso "Chega mais cedo: agora entre HH:MM e HH:MM" (uma vez) é **Could** e o app o decide **comparando com a faixa que já tinha**, sem campo novo na API (DEC-065, F6b); se calcularia mais tarde, mantém o horário prometido (RN-19).
- **C4** Dado passar do fim da faixa, então o estado vira "Atrasado" (WB-253) e a faixa prometida não é empurrada nem substituída por horário novo inventado.
- **C5** Dado ENTREGUE, então a faixa some e a linha do tempo mostra a hora real de entrega; dado CANCELADO ou RECUSADO, a faixa some.
- **C6** Dado pedido em AGUARDANDO_PAGAMENTO, então não há faixa de pedido (só a da sacola); depois da aprovação do PIX a faixa aparece em até 5 s.
- **C7** Dado pedido anterior à DEC-053 (sem ETA gravado), então a tela mostra o texto antigo de tempo estimado e nenhum atraso por faixa.
- **C8** Dado a mesma faixa na tela, no push, no e-mail do pedido e no painel (lojista e admin), então os valores são idênticos (teste de contrato; é a mesma conta gravada no pedido).
- **Eventos:** `eta_updated {deltaMin}`.

### WB-253 Atraso: aviso ao cliente e cancelamento sem custo — Must — dep: WB-252, WB-255, WB-028, WB-154
Como cliente, quero ser avisado quando o pedido atrasa e poder sair sem perder dinheiro, para confiar na promessa de entrega.
- **C1** Dado passar do fim da faixa (em qualquer estado até SAIU), então recebo **1 push** e um aviso na tela com o texto de atraso (seção "Copy") e o botão "Falar com a Webag"; nenhum push repetido para o mesmo pedido.
- **C2** Dado passar do fim da faixa + `entrega_atraso_tolerancia_min` (15) e o pedido ainda **antes de SAIU**, então aparecem "Cancelar sem custo" e "Continuar esperando"; ao confirmar o cancelamento, o pedido vira CANCELADO (ator cliente, motivo `atraso`), o estoque é liberado e o estorno é **total, incluindo a taxa de entrega** (RN-08); vejo o prazo do estorno como em WB-028 C1.
- **C3** Dado o pedido já em SAIU_PARA_ENTREGA, então o botão vira "Pedir cancelamento"; vejo "A Webag responde em até 10 min"; a operação aceita (o motoboy devolve o pacote à loja; estorno total ao concluir a devolução conforme RN-18) ou informa "Chego em até 10 min"; sem resposta em `entrega_cancel_resposta_min`, **aceita** automaticamente.
- **C4** Dado "Continuar esperando", então o botão de esperar some e o aviso fica, **"Cancelar sem custo" permanece como ação secundária** (em SAIU, "Pedir cancelamento") até ENTREGUE, e o direito à compensação (WB-254) permanece, se o contrato a trouxer (RN-19 4d; D5, DEC-064). A escolha é só estado da tela, não é gravada na API; evento `late_wait_chosen`.
- **C5** Dado toque duplo em cancelar ou pedido ENTREGUE no meio, então um só cancelamento ou nenhum (idempotência; pedido ENTREGUE recusa com "Seu pedido já foi entregue").
- **C6** Dado pedido de retirada, então nada disto se aplica (o prazo de retirada é o de WB-026).
- **C7** Dado que a **loja** cancelou ou recusou, então prevalece o fluxo de cancelamento da loja (RN-08); atraso e cancelamento por atraso não se acumulam.
- **C8** Dado a mensagem de atraso, então **não** culpa a loja nem o motoboy e **não** declara responsabilidade jurídica; é neutra (seção "Copy"; revisão do fundador/jurídico, J14).
- **C9** Dado cliente sem conexão, então o estado de atraso é calculado no servidor e aparece ao reconectar; o cancelamento exige conexão.
- **C10** **(F5 e F7, DEC-065)** Dado a tela do pedido aberta, então o aviso de atraso aparece em até **60 s** (push cobre o app fechado) e, com "Pedir cancelamento" pendente, a tela relê a cada **15 s** até a decisão. Antes de pedir, o texto é "A Webag responde em poucos minutos" (**o app nunca escreve um número de minutos que a API não mandou**); depois de pedir, mostra `respondBy`. Recusa da operação mostra a nota escrita pela operação (obrigatória na recusa, com sugestão "Chegamos até HH:MM"); `arrivesBy` e eventos em tempo real de atraso e de decisão são **fase 2**.
- **C11** Dado o cancelamento por atraso concluído, então a tela mostra o valor e o meio do estorno e o texto de prazo por meio de pagamento (WB-259; RN-08), sem data prometida.
- **Eventos:** `late_notice_shown`, `late_cancel_requested {status}`, `late_cancel_done`, `late_wait_chosen`.

### WB-254 Compensação por atraso — Should — `[HIPÓTESE; HIP-E05]` — dep: WB-253, WB-116 (cupom de frete)
Como cliente, quero receber algo quando o pedido chega depois do prazo, para sentir que a Webag cumpre o que promete.
- **C1** Dado pedido ENTREGUE depois do fim da faixa + `entrega_atraso_tolerancia_min`, então, com `entrega_compensacao_tipo` = `frete_gratis_proximo` (padrão), é criado **1 cupom de entrega grátis** (RN-09), válido por 30 dias, intransferível, só para pedido de entrega, e o cliente recebe push e vê em "Meus cupons" (WB-033) com o texto da seção "Copy".
- **C2** Dado o tipo `cupom_valor`, então o cupom é de `entrega_compensacao_cents` (R$ 10,00) e respeita o teto da comissão do pedido onde for usado (WB-022 C7); o texto avisa "desconto de até R$ 10,00".
- **C3** Dado o tipo `nenhuma`, então nada é criado e o aviso de atraso (WB-253 C1) continua.
- **C4** Dado o pedido que o cliente **cancelou** por atraso, então não há compensação; dado pedido com atraso dentro da tolerância, também não.
- **C5** Dado a mesma corrida fechada duas vezes ou reprocessada, então **um** cupom por pedido (idempotência pela chave do pedido).
- **C6** Dado o custo, então o relatório de prazo mostra compensações concedidas e usadas, com o valor de receita de taxa abdicado (WB-258 C5); o custo é da Webag (não desconta do lojista).
- **C7** Dado conta excluída (LGPD), então o cupom **não usado** é apagado junto com a conta e o já usado fica só como registro de resgate do pedido, sem dado pessoal (RN-14, DEC-063); a tela de exclusão avisa que cupons não usados se perdem.
- **C8** Dado a corrida com `not_delivered` por `customer_absent` ou `customer_refused`, ou por `address_not_found` sem correção da causa pela operação, então **não** há compensação (RN-19 4c, SEC-177); o evento `compensation_skipped` guarda a causa.
- **Decisão (DEC-064):** tipo padrão `frete_gratis_proximo`, custo da Webag, valor conforme HIP-E05; o fundador pode trocar no admin sem código.

### WB-259 Estorno: valor, meio e prazo na tela do pedido — Must — dep: WB-028, WB-253, `Order.refund` (F3)
Como cliente que cancelou ou foi estornado, quero ver quanto volta, para onde e em quanto tempo costuma levar, para não ligar para o suporte.
- **C1** Dado pedido com estorno (cancelamento, recusa, atraso, troca), então a tela mostra o **valor** (`refund.amountCents`), o **meio** (PIX ou cartão) e o status (processando ou concluído), vindos da API.
- **C2** Dado meio PIX, então o texto é "Volta para a conta que pagou o PIX. Costuma levar até 1 dia útil." `[HIPÓTESE; HIP-P09; J16]`; dado cartão, "Aparece na fatura do cartão em até 2 faturas, conforme o seu banco."; o app **não** mostra data prometida.
- **C3** Dado estorno parcial (item indisponível, troca), então o valor mostrado é o parcial e o texto diz "Estorno de R$ X" (nunca o total do pedido).
- **C4** Dado API sem `refund` (pedido sem estorno), então a seção não aparece; dado falha ao carregar, então o resto da tela funciona e a seção mostra "Não conseguimos carregar o estorno. Tente de novo".
- **C5** Dado leitor de tela, então valor, meio e status são lidos juntos em uma frase.
- **Evento:** `refund_info_shown {method}`. **Fora (fase 2):** `expectedBy` e rastreio do estorno.

### WB-260 Motivo real da entrega indisponível — Must — dep: WB-251, WB-235 (F4)
Como cliente, quero saber por que a loja não entrega agora, para escolher entre esperar, retirar ou trocar de endereço.
- **C1** Dado loja sem entrega para mim, então o cartão, a loja, a sacola e o checkout mostram a causa que a API manda em `unavailableReason`: `OUT_OF_RANGE` "Longe demais para entregar no seu endereço"; `LOGISTICS_CLOSED` "Entregas voltam às 9h" (hora falada, D3; "amanhã às 9h" se for o caso); `LOGISTICS_PAUSED` "Entregas pausadas agora" (com a hora de volta se houver `logisticsOpensAt`).
- **C2** Dado pausa **sem** previsão de volta, então o texto **não** diz "fora da área" (hoje diz, e é falso) nem inventa hora.
- **C3** Dado a loja aceitar retirada a <= `retirada_distancia_max_km`, então "Retirar na loja" aparece junto (RN-17: sem botão desabilitado sem explicação).
- **C4** Dado API antiga sem o campo, então o app mostra "Entrega indisponível agora" (nunca "fora da área" por omissão).
- **Evento:** `ops_closed_shown {surface}`.

### WB-261 Horário mudou antes de pagar — Must — dep: WB-249 C5, WB-250 C7 (F6a)
Como cliente, quero ser avisado se o horário de chegada piorou entre a sacola e o pagamento, para não pagar uma promessa diferente da que vi.
- **C1** Dado o fim da faixa calculado na criação do pedido **mais tarde** que o mostrado na sacola (**só se passar de 5 min**, `ETA_WORSE_TOLERANCE_MIN`: a faixa anda com o relógio e "qualquer diferença" avisaria a cada minuto; DEC-068; `[HIPÓTESE]`), então a API responde 409 `ETA_CHANGED` com a faixa nova e **nenhum pedido é criado**; o app abre a folha "O horário mudou" com a faixa nova e "Continuar" ou "Voltar à sacola"; ao continuar, o pedido é criado com a faixa nova.
- **C2** Dado a faixa nova **igual ou mais cedo**, então o pedido é criado sem aviso (o cliente vê a faixa real na confirmação; sem folha).
- **C3** Dado a faixa nova que **tira a loja do alcance** (passou do teto ou do fechamento), então vale `OUT_OF_RANGE` (WB-251 C5) e não `ETA_CHANGED`.
- **C4** Dado toque duplo em "Continuar", então um só pedido (idempotência).
- **Fora (fase 2):** o campo `earlier` com a faixa anterior; o aviso "Agora chega mais cedo" é local (WB-252 C3).

### Copy da promessa de entrega (proposta do PO; o designer ajusta o tom e a posição, o fundador aprova; sem emoji; frases curtas)
| Onde | Texto proposto | Observação |
|---|---|---|
| Mensagem geral (home, onboarding, loja de apps, landing) | **"Entrega pelo Webag"** e subtítulo "Veja o horário de cada loja antes de pedir." | **DEC-054 e D1: sem "2 h" no app nem em material externo** até 95% no piloto (HIP-E09) e revisão J14. A frase "Chega em até 2 h" fica reservada para depois da prova. Substitui "30 a 45 min" |
| Cartão da loja (lista) | "45 a 75 min · R$ 8,00" | Faixa em minutos; sem endereço: **sem prazo** (a loja pede o endereço) |
| Página da loja | "Chega entre 15:40 e 16:10" e, abaixo, "45 a 75 min, conforme a distância até você" | |
| Produto | "Receba hoje entre 15:40 e 16:10 · Entrega R$ 8,00" | "hoje" só dentro do horário da logística (HIP-E08) |
| Sacola e checkout | "Chega entre 15:40 e 16:10" e "A contagem começa quando o pagamento for aprovado." | |
| Pedido recebido | "Pedido recebido. Chega entre 15:40 e 16:10." | |
| Acompanhamento | "Atualizamos o horário conforme o pedido avança." ; mais cedo: "Boa notícia: agora chega entre 15:30 e 16:00." | Só encurta, nunca atrasa o prometido |
| Saiu para entrega | "Seu pedido saiu. Chega entre 15:30 e 16:00." | |
| Atraso (aviso e push) | Título "Seu pedido está demorando mais que o previsto". Corpo "Já estamos cuidando disso. Se precisar, fale com a gente." Botão "Falar com a Webag" | Neutro; um push por pedido |
| Atraso, depois da tolerância | "Passamos do prazo. Você pode cancelar sem custo ou continuar esperando." Botões "Cancelar sem custo" e "Continuar esperando" | Em SAIU: botão "Pedir cancelamento" e "A Webag responde em até 10 minutos." |
| Cancelado por atraso | "Pedido cancelado. Devolvemos o valor total, com a entrega, em até [prazo do meio de pagamento]." | Prazo como em WB-028 C1 |
| Compensação | "Pedimos desculpas pelo atraso. Você ganhou entrega grátis no seu próximo pedido, válida por 30 dias." (cupom de valor: "Você ganhou R$ 10,00 de desconto no próximo pedido, válido por 30 dias.") | Texto muda com `entrega_compensacao_tipo` |
| Loja fora do alcance (loja/produto/sacola) | "Esta loja fica longe demais para entregar no seu endereço." e "Veja outras lojas perto de você ou retire no balcão." | Sem número (D1). Botão "Retirar na loja" só se a loja aceita retirada |
| Endereço sem lojas e região não atendida (**um estado só**, D8) | "Ainda não chegamos em [bairro]." e "Ver lojas de outra cidade" | WB-004 C1 e C5; sem captura de e-mail na 1.0 (DEC-061) |
| Lista de espera: consentimento e confirmação | **Fase 2** (DEC-061): "Podemos usar seu e-mail só para avisar quando a Webag chegar em [bairro]. Você cancela quando quiser." / "Anotado. Avisamos você por e-mail quando chegarmos em [bairro]." | Guardado para a fase 2; LGPD: finalidade única, consentimento próprio (WB-211) |
| Entrega perto do fechamento | "Entregas hoje até 20h. Para este pedido o prazo passaria disso. Retire na loja ou peça a partir das 9h." | Hora falada (D3); valores vêm de `logistica_horario` |
| Entrega pausada sem hora | "Entregas pausadas agora." | WB-260 C2; nunca "fora da área" |
| Estorno por PIX / por cartão | "Volta para a conta que pagou o PIX. Costuma levar até 1 dia útil." / "Aparece na fatura do cartão em até 2 faturas, conforme o seu banco." | WB-259; sem data prometida; J16 |
| Sem endereço | "Informe seu endereço para ver o horário." | Único texto de prazo sem endereço (D1) |
| Atraso: horário em que nasce o direito (D4) | "Se passar de 19:35, você pode cancelar sem custo." | No 1º aviso de WB-253 C1; frase em revisão J14 |
| "Continuar esperando" (sem `Order.compensation` no contrato) | "Combinado, seguimos com o seu pedido." | Não cita entrega grátis; com o campo, acrescenta a compensação real (RN-19 4d) |

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| **Prometer "em até 2 h" (DEC-053):** oferta que vincula (CDC art. 30 e 31; Decreto 7.962/2013, prazo de entrega informado; `[confirmar]`, J14) | Risco jurídico e de reputação | Teto no fim da faixa (RN-19); válvula de saída (WB-253); copy aprovada pelo fundador/jurídico antes do G5; não usar "2 h" em lojas de apps antes de medir 95% no piloto (HIP-E09) |
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
