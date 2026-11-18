# Backlog Priorizado — Webag 1.0 e Fase 2

Status: v1 | Dono: product-owner | Data: 2026-11-18
Fonte de escopo: `docs/00-visao/brief.md` §3 e §4. Regras: `regras-de-negocio.md`. Hipóteses: `docs/decisoes.md` (HIP-001 a HIP-043). Personas: `personas.md`. Pesquisa: `pesquisa-mercado.md`.

**Onde estão as histórias.** Cada história (WB-###) com "Como..., quero..., para..." e critérios Dado/Quando/Então está no PRD do épico (fonte única, sem duplicar aqui). Este arquivo é o índice: prioridade, ordem de construção, dependências e fase 2.

| Épico | PRD | IDs |
|---|---|---|
| Cliente | `prd/cliente.md` | WB-001 a 038 |
| Lojista | `prd/lojista.md` | WB-050 a 079 |
| Admin | `prd/admin.md` | WB-100 a 125 |
| Pagamentos | `prd/pagamentos.md` | WB-150 a 161 |
| Trocas ("Retira Troca") | `prd/trocas.md` | WB-170 a 178 |
| Notificações | `prd/notificacoes.md` | WB-190 a 199 |
| LGPD | `prd/lgpd.md` | WB-210 a 218 |
| Fase 2 (sem Gherkin até entrar no roadmap) | este arquivo §6 | WB-300 a 334 |

## 1. Como priorizei
- **MoSCoW** dentro da 1.0: **Must** = sem isso o fluxo "explorar, comprar, acompanhar, receber, repassar" ou a publicação nas lojas quebra; **Should** = importante, tem contorno manual ou pode entrar logo após o piloto; **Could** = desejável, só com folga; **Won't** = decidido fora desta versão.
- **RICE não foi calculado** de propósito: sem nenhum dado de uso, Alcance e Impacto seriam chutes com cara de número. A priorização usou (1) o brief, (2) dependência técnica, (3) risco (dinheiro, lei, loja de apps). RICE passa a valer com os dados do piloto (HIP-043).
- Cada história foi escrita para caber em uma sprint; estimativa é dos devs (DoR). "TM" = threat model necessário antes da DoR (login, dados pessoais, pagamento, upload, permissões).

## 2. Contagem

| MoSCoW | Qtde |
|---|---|
| Must | 109 |
| Should | 21 |
| Could | 3 (WB-010, 079, 199) |
| Won't (1.0) | 1 (WB-161) |
| **Total 1.0** | **134** |

Crítica ao escopo: 109 Must é muito para uma "1.0 de piloto". Entrego tudo o que o brief pede, mas recomendo ao PM/CEO o **marco M1 (piloto fechado com 5 lojas)** após as ondas 0 a 3 mais WB-076, 108, 109, 112 e 031, e o restante (trocas completas, banners, relatórios, push segmentado) como M2, sem mudar a definição de pronto da missão. O prazo é decisão do PM e do CEO.

## 3. Ordem sugerida de construção

Legenda: **P** = prioridade; **TM** = threat model.

### Onda 0: fundações (auth, configuração, base de dinheiro)
| # | ID | História | P | Depende de | TM |
|---|---|---|---|---|---|
| 1 | WB-100 | Login admin e perfis | Must | auth base | S |
| 2 | WB-123 | Log de auditoria | Must | 100 | S |
| 3 | WB-101 | Gerenciar admins | Must | 100 | S |
| 4 | WB-119 | Parâmetros do negócio | Must | 100 | S |
| 5 | WB-120 | Feature flags | Must | 119 | |
| 6 | WB-118 | Regiões (cidades e bairros) | Must | 100 | |
| 7 | WB-106 | Categorias e subcategorias | Must | 100 | |
| 8 | WB-194 | E-mails transacionais | Must | SMTP/Mailpit | |
| 9 | WB-117 | Termos e privacidade editáveis | Must | 100 | |
| 10 | WB-210 | Termos: aceite versionado | Must | 117 | S |
| 11 | WB-211 | Consentimentos granulares | Must | 210 | S |
| 12 | WB-006 | Cadastro de conta (cliente) | Must | 210 | S |
| 13 | WB-007 | Confirmar conta por código | Must | 006, 194 | S |
| 14 | WB-008 | Entrar com e-mail e senha | Must | 006 | S |
| 15 | WB-009 | Esqueci a senha | Must | 008, 194 | S |
| 16 | WB-050 | Criar conta de lojista | Must | auth base | S |
| 17 | WB-150 | PaymentProvider e provedor simulado | Must | | S |
| 18 | WB-155 | Recebimento do lojista: ADR split vs. centralizado | Must | pesquisa | S |
| 19 | WB-153 | Webhooks seguros e reprocessamento | Must | 150 | S |

### Onda 1: oferta (lojista, aprovação, catálogo)
| # | ID | História | P | Depende de | TM |
|---|---|---|---|---|---|
| 20 | WB-051 | Onboarding: dados da loja e CPF/CNPJ | Must | 050, 118 | S |
| 21 | WB-052 | Onboarding: documentos | Must | 051 | S |
| 22 | WB-218 | Proteção e registro de acesso a documentos | Must | 052 | S |
| 23 | WB-053 | Onboarding: conta de recebimento | Must | 051, 155 | S |
| 24 | WB-103 | Fila de aprovação de lojas | Must | 052 | S |
| 25 | WB-054 | Acompanhar aprovação | Must | 052, 103 | |
| 26 | WB-104 | Suspender, reativar e editar loja | Must | 103 | |
| 27 | WB-055 | Perfil da loja | Must | 054 | S |
| 28 | WB-056 | Horários, feriados e pausa | Must | 055 | |
| 29 | WB-057 | Entrega: raio, taxa, mínimo, grátis, tempo | Must | 055 | |
| 30 | WB-058 | Retirada na loja | Must | 055 | |
| 31 | WB-059 | Política de trocas | Must | 055 | |
| 32 | WB-060 | Criar e editar produto com fotos | Must | 054, 106 | S |
| 33 | WB-061 | Variações e estoque por variação | Must | 060 | |
| 34 | WB-062 | Preço e promoção com período | Must | 060 | |
| 35 | WB-064 | Pausar produto e estoque baixo | Must | 061 | |
| 36 | WB-063 | Seções da vitrine | Should | 060 | |
| 37 | WB-075 | Equipe e permissões | Must | 050 | S |
| 38 | WB-107 | Moderação de produtos | Must | 060 | |

### Onda 2: descoberta do cliente
| # | ID | História | P | Depende de | TM |
|---|---|---|---|---|---|
| 39 | WB-035 | Sem conexão e erros (transversal) | Must | | |
| 40 | WB-001 | Definir onde estou | Must | 118 | S |
| 41 | WB-002 | Endereço por CEP com autocompletar | Must | 001 | S |
| 42 | WB-005 | Navegar sem login | Must | 001 | |
| 43 | WB-003 | Gerenciar endereços salvos | Must | 002, 006 | S |
| 44 | WB-115 | Banners e destaques | Must | 118 | |
| 45 | WB-011 | Home: banners e categorias | Must | 115, 106 | |
| 46 | WB-016 | Página da loja | Must | 055, 056, 057 | |
| 47 | WB-017 | Página do produto | Must | 060, 061, 062 | |
| 48 | WB-012 | Home: seções de lojas e produtos | Must | 011, 016 | |
| 49 | WB-013 | Buscar produtos e lojas | Must | 016, 017 | |
| 50 | WB-014 | Filtros e ordenação | Must | 013 | |
| 51 | WB-018 | Avaliações de loja e produto (exibição) | Must | 031 (dados) | |
| 52 | WB-020 | Carrinho | Must | 017 | |
| 53 | WB-021 | Aviso ao trocar de loja | Must | 020 | |
| 54 | WB-015 | Histórico de buscas | Should | 013 | |
| 55 | WB-004 | Região não atendida e lista de espera | Should | 118, 211 | S |
| 56 | WB-019 | Favoritos | Should | 008 | |
| 57 | WB-036 | Modo Retirada na home | Should | 012, 058 | |
| 58 | WB-032 | Perfil e dados pessoais | Must | 008 | S |

### Onda 3: transação (checkout, pagamento, pedido em tempo real)
| # | ID | História | P | Depende de | TM |
|---|---|---|---|---|---|
| 59 | WB-111 | Comissões padrão e taxa de serviço | Must | 119 | |
| 60 | WB-105 | Comissão por loja e por categoria | Must | 111 | |
| 61 | WB-151 | Mercado Pago: PIX | Must | 150, 155 | S |
| 62 | WB-152 | Mercado Pago: cartão tokenizado | Must | 150, 155 | S |
| 63 | WB-154 | Estorno total e parcial | Must | 151, 152 | S |
| 64 | WB-156 | Ledger: comissão, taxa e extrato | Must | 154, 105 | S |
| 65 | WB-158 | PIX tardio ou duplicado | Must | 151, 154 | S |
| 66 | WB-157 | Conciliação diária | Must | 153 | S |
| 67 | WB-160 | Alternar simulado/real por .env + documentação | Must | 151-153 | S |
| 68 | WB-023 | Checkout: entrega ou retirada | Must | 020, 003, 005 | S |
| 69 | WB-024 | Pagar com PIX | Must | 023, 151 | S |
| 70 | WB-025 | Pagar com cartão de crédito | Must | 023, 152 | S |
| 71 | WB-026 | Retirada: código e instruções | Must | 023, 058 | |
| 72 | WB-190 | Registro de dispositivo e permissão de push | Must | 008 | S |
| 73 | WB-067 | Painel de pedidos em tempo real | Must | 050, 024, 025 | |
| 74 | WB-216 | Minimização de dados do cliente perante a loja | Must | 067 | S |
| 75 | WB-068 | Aceitar ou recusar pedido | Must | 067, 154 | |
| 76 | WB-069 | Atualizar status do pedido | Must | 068 | |
| 77 | WB-027 | Acompanhar o pedido | Must | 024, 025, 069 | |
| 78 | WB-191 | Notificações de pedido ao cliente | Must | 190, 027 | |
| 79 | WB-192 | Alertas de pedido ao lojista | Must | 067 | |
| 80 | WB-028 | Cancelar pedido | Must | 027, 154 | |
| 81 | WB-029 | Falar com a loja pelo WhatsApp | Must | 055 | |
| 82 | WB-030 | Meus pedidos e pedir de novo | Must (pedir de novo: Should) | 027 | |
| 83 | WB-070 | Item indisponível: estorno parcial | Should | 068, 154 | |
| 84 | WB-071 | Imprimir comanda | Should | 067 | |
| 85 | WB-072 | Histórico de pedidos (lojista) | Must | 067 | |

### Onda 4: pós-venda, dinheiro e gestão
| # | ID | História | P | Depende de | TM |
|---|---|---|---|---|---|
| 86 | WB-031 | Avaliar loja e produto | Must | 027 | |
| 87 | WB-074 | Responder avaliações | Should | 031 | |
| 88 | WB-073 | Cupons próprios | Should | 020 | |
| 89 | WB-116 | Cupons da plataforma | Must | 022 | |
| 90 | WB-022 | Cupom no carrinho | Must | 020, 073, 116 | |
| 91 | WB-170 | Pedir troca no app | Must | 027, 059 | S |
| 92 | WB-171 | Acompanhar a troca | Must | 170 | |
| 93 | WB-172 | Loja: fila de trocas e decisão | Must | 170, 075 | |
| 94 | WB-173 | Coleta e recebimento do item | Must | 172 | |
| 95 | WB-174 | Resolução: reposição ou reembolso | Must | 173, 154 | |
| 96 | WB-175 | Taxa de coleta | Must | 170, 154 | S |
| 97 | WB-178 | Arrependimento (CDC art. 49) | Must | 170 | |
| 98 | WB-177 | Prazos automáticos das trocas | Must | 172 | |
| 99 | WB-193 | Notificações de troca | Must | 170 | |
| 100 | WB-037 | "Não recebi meu pedido" | Must | 027 | |
| 101 | WB-108 | Pedidos: visão geral e filtros (admin) | Must | 067 | |
| 102 | WB-109 | Intervir no pedido: cancelar e estornar | Must | 108, 154 | S |
| 103 | WB-110 | Mediar trocas e disputas | Must | 172, 037 | |
| 104 | WB-176 | Contestar recusa e mediação (cliente) | Must | 171, 110 | |
| 105 | WB-076 | Financeiro do lojista: resumo, a receber, repasses | Must | 156 | S |
| 106 | WB-077 | Extrato exportável | Should | 076 | |
| 107 | WB-078 | Painel inicial do lojista | Must | 067 | |
| 108 | WB-112 | Repasses (admin) | Must | 156 | S |
| 109 | WB-113 | Conciliação com o provedor (admin) | Must | 157 | |
| 110 | WB-102 | Usuários: busca, bloqueio e senha | Must | 100 | S |
| 111 | WB-159 | Chargeback | Should | 153 | S |
| 112 | WB-033 | Meus cupons | Should | 022 | |
| 113 | WB-034 | Ajuda e suporte | Should | 119 | |

### Onda 5: conformidade, gestão e acabamento
| # | ID | História | P | Depende de | TM |
|---|---|---|---|---|---|
| 114 | WB-212 | Exportar meus dados | Must | 032 | S |
| 115 | WB-213 | Excluir conta no app | Must | 032 | S |
| 116 | WB-214 | Excluir conta pela web | Must | 213 | S |
| 117 | WB-215 | Retenção e anonimização | Must | 213 | S |
| 118 | WB-217 | Canal do titular e encarregado | Must | 117 | |
| 119 | WB-196 | Preferências e consentimento de marketing | Must | 211 | S |
| 120 | WB-038 | Denunciar avaliação, produto ou loja | Must | 124 | |
| 121 | WB-124 | Moderação de avaliações e denúncias | Must | 038 | |
| 122 | WB-122 | Relatórios operacionais | Must | 108 | |
| 123 | WB-114 | Relatórios financeiros exportáveis | Should | 156 | |
| 124 | WB-125 | Painel inicial do admin | Should | 122 | |
| 125 | WB-065 | Importar produtos por planilha | Should | 060, 061 | S |
| 126 | WB-066 | Ação em massa | Should | 064 | |
| 127 | WB-121 | Modo manutenção | Should | 120 | |
| 128 | WB-195 | Central de notificações no app | Should | 191 | |
| 129 | WB-197 | Push segmentado pelo admin | Should | 196, 118 | S |
| 130 | WB-198 | Alertas ao admin | Should | 123 | |
| 131 | WB-199 | Carrinho esquecido | Could | 196 | |
| 132 | WB-010 | Login Google e Apple (preparado, flag desligada) | Could | 008, 120 | S |
| 133 | WB-079 | Segurança de acesso do lojista (2FA) | Could | 050 | S |
| 134 | WB-161 | Segundo adaptador de pagamento | Won't (1.0) | 150 | |

Observações de dependência: WB-038 e WB-124 são um par (cliente denuncia, admin trata) e devem ir na mesma sprint, antes de G5 (exigência de lojas de apps para conteúdo de usuário). WB-213 e WB-214 também bloqueiam G5. WB-155 (ADR) precisa estar decidido **antes** de WB-053, WB-151 e WB-152. WB-018 mostra avaliações vazias até WB-031 existir.

## 4. Cobertura do brief (rastreabilidade)

| Brief | Funcionalidade | Histórias |
|---|---|---|
| §3.1 | Entrada sem fricção, cadastro completo, confirmação por código, esqueci a senha, login Google/Apple preparado | 005, 006, 007, 008, 009, 010 |
| §3.1 | Endereço: localização, CEP, vários endereços, só lojas que entregam | 001, 002, 003, 004, RN-03 |
| §3.1 | Início: banners, categorias, perto, ofertas, mais vendidos, lojas novas | 011, 012, 115 |
| §3.1 | Busca, filtros (categoria, preço, distância, grátis, avaliação, aceita troca), histórico | 013, 014, 015 |
| §3.1 | Loja e Produto (galeria, variações, estoque, promoção, avaliações) | 016, 017, 018 |
| §3.1 | Carrinho (1 loja, aviso, cupom, resumo) | 020, 021, 022 |
| §3.1 | Checkout (entrega/retirada, PIX com QR/copia e cola/contagem, cartão) | 023, 024, 025, 026 |
| §3.1 | Pedido em tempo real, push, WhatsApp | 027, 028, 029, 037, 190, 191 |
| §3.1 | Trocas "Retira Troca" | 170 a 178, 059, 172 a 174 |
| §3.1 | Conta: pedidos, favoritos, endereços, cupons, notificações, dados, ajuda, exportar, excluir | 030, 019, 003, 033, 195, 032, 034, 212, 213 |
| §3.1 | Avaliação | 031 |
| §3.2 | Cadastro e onboarding com aprovação | 050 a 054 |
| §3.2 | Configuração (perfil, horários, pausa, raio, taxa, mínimo, grátis, retirada, WhatsApp, trocas) | 055 a 059 |
| §3.2 | Catálogo (fotos, variações, estoque, promoção, seções, planilha, massa) | 060 a 066 |
| §3.2 | Pedidos (alerta, aceitar/recusar, status, comanda, histórico) | 067 a 072 |
| §3.2 | Trocas, cupons, avaliações, equipe | 172 a 174, 073, 074, 075 |
| §3.2 | Financeiro e painel inicial | 076, 077, 078 |
| §3.3 | Usuários e perfis | 100, 101, 102 |
| §3.3 | Lojas (aprovação, suspensão, edição, comissão por loja) | 103, 104, 105 |
| §3.3 | Catálogo da plataforma e moderação | 106, 107, 124 |
| §3.3 | Pedidos e trocas (intervir, estornar, mediar) | 108, 109, 110 |
| §3.3 | Financeiro (comissões, taxa de serviço, repasses, conciliação, relatórios) | 111, 112, 113, 114, 105 |
| §3.3 | Marketing e conteúdo (banners, destaques, cupons, push segmentado, termos) | 115, 116, 197, 117 |
| §3.3 | Regiões | 118 |
| §3.3 | Configurações (parâmetros, flags, manutenção) | 119, 120, 121 |
| §3.3 | Relatórios e auditoria | 122, 123 |
| §4 | Pagamentos (provedor, MP completo, split, simulado, .env/README) | 150 a 160 (161 Won't) |
| §6 | LGPD (consentimento, exportação, exclusão) | 210 a 218 |
| §5 | Estados (skeleton, vazio, erro, sem conexão) | 035 + estados em cada história (DoD) |

Itens do brief §7/§8 que **não** são histórias de usuário (devs/PM): seed, docker compose, CI, Dockerfiles, guia de deploy, README, testes de carga, capturas de tela. Requisitos do PO para o **seed de demonstração**: 4 cidades do DEC-009 com bairros reais de Francisco Morato e Franco da Rocha; 12 ou mais lojas fictícias de 6+ categorias (algumas fechadas, 1 pausada, 1 em análise, 1 suspensa, 1 sem troca); produtos com variações e estoque (alguns esgotados e em promoção vigente/vencida); pedidos em **cada** estado de RN-07; trocas em cada estado de RN-11; avaliações (inclusive loja "Nova" com menos de 3); cupons válidos, vencidos e esgotados; 1 divergência de conciliação; credenciais demo de cliente, lojista dono, lojista funcionário (só pedidos) e admin (um por perfil).

## 5. Cortes se o prazo apertar (ordem sugerida)
1. Could: WB-199, WB-010, WB-079.
2. Should de menor impacto: WB-195, WB-198, WB-066, WB-065, WB-071, WB-036, WB-019, WB-015, WB-033.
3. Should de gestão: WB-125, WB-121, WB-114, WB-077, WB-063.
4. Nunca cortar sem decisão do fundador: tudo em LGPD (210-218), exclusão de conta, denúncia (038/124), pagamentos (150-158, 160), arrependimento (178), auditoria (123), minimização (216). São requisitos de lei, de loja de apps ou de dinheiro.

## 6. Fase 2 (fora da 1.0; modelo de dados preparado)

Sem Gherkin até entrarem no roadmap. Cada épico só entra com o **gatilho** de evidência.

### 6.1 Entregador (WB-300 a 309): app, despacho e rastreio
- **Hipótese:** lojas sem entrega própria confiável e clientes querendo rastreio vão pedir frota. Gatilho: >= 30% das lojas pedem entrega Webag ou atraso > 20% nos pedidos de entrega do piloto.
- Histórias previstas: WB-300 cadastro e aprovação do entregador; WB-301 app do entregador (disponibilidade, receber corrida); WB-302 despacho por proximidade (PostGIS); WB-303 rastreio em tempo real para o cliente; WB-304 prova de entrega (código/foto); WB-305 taxa de entrega Webag e repasse ao entregador; WB-306 coleta de trocas por entregador; WB-307 regras de recusa/timeout; WB-308 painel de operação de despacho no admin; WB-309 seguro/incidentes.
- **Modelo de dados preparado (1.0):** `entrega` separada do `pedido` (tipo: loja, retirada, webag; status; entregador opcional); `entregador` como papel de usuário; `posicao_entregador` (série temporal); `despacho` (oferta, aceite, recusa); `ator` nos eventos de pedido já aceita "entregador". O estado SAIU_PARA_ENTREGA e a prova de entrega permanecem compatíveis.
- Riscos: custo operacional, regime trabalhista do entregador, disputa de entregadores com iFood/aiqfome (Saipos), seguro.

### 6.2 Programa de pontos (WB-310 a 314)
- **Hipótese:** pontos aumentam recompra em 30 dias. Gatilho: recompra < 25% após 90 dias do piloto (HIP-043) e dados de densidade suficientes.
- Previstas: WB-310 acúmulo por pedido ENTREGUE; WB-311 saldo e extrato de pontos; WB-312 resgate como desconto; WB-313 expiração e regras no admin; WB-314 estorno de pontos em cancelamento/troca.
- **Modelo preparado:** `carteira_pontos` com livro-razão append-only (cliente, pedido, tipo, pontos, expira_em); `regra_pontos` parametrizável; ligação opcional com `cupom`.
- Riscos: custo do benefício (quem paga: loja ou Webag), passivo contábil, fraude.

### 6.3 Assinatura (WB-320 a 324)
- **Hipótese:** assinatura de frete grátis (estilo clube) fideliza. Gatilho: frete é o maior motivo de abandono no checkout.
- Previstas: WB-320 planos no admin; WB-321 assinar e pagar recorrente; WB-322 benefício de frete grátis/cupom mensal; WB-323 cancelar assinatura (sem fricção, regra do CDC); WB-324 repasse do custo do frete grátis (quem arca).
- **Modelo preparado:** `plano`, `assinatura` (cliente, plano, status, próximo_ciclo), `beneficio` aplicável no cálculo de frete/cupom (RN-04, RN-09).
- Riscos: cobrança recorrente exige provedor com suporte e regras de cancelamento; frete é do lojista (HIP-005), então o benefício precisa de custo definido.

### 6.4 Chat interno (WB-330 a 334)
- **Hipótese:** chat reduz o desvio para WhatsApp e dá prova nas disputas. Gatilho: > 30% das disputas sem evidência de conversa.
- Previstas: WB-330 conversa cliente-loja por pedido; WB-331 anexos de imagem; WB-332 suporte Webag na conversa; WB-333 moderação e denúncia; WB-334 notificações de mensagem.
- **Modelo preparado:** `conversa` (vinculada a pedido ou troca), `mensagem` (autor, tipo, anexo, lida_em), `participante`.
- Riscos: LGPD (conteúdo livre), moderação, custo de mídia; na 1.0 o canal é o WhatsApp da loja (WB-029).

### 6.5 Depois (sem evidência ou fora do brief; não são fase 2 comprometida)
| Item | Por que não agora | Sinal para reavaliar |
|---|---|---|
| Pagamento na entrega (dinheiro/maquininha) | Fora do brief (§4); some a comissão e abre desvio | > 20% de lojas citam como barreira (V6) |
| Cartão salvo | Escopo de segurança maior; PIX domina | Recompra por cartão relevante |
| Agendamento de entrega | Amplia estados e horários | Pedido fora do horário é frequente |
| Segundo provedor (Pagar.me/Asaas) | Sem vantagem comprovada | Taxa de aprovação MP baixa ou KYC bloqueando lojas |
| NFS-e da comissão / nota do produto no app | Fiscal do fundador/lojista | Exigência do contador ou da prefeitura |
| SMS/WhatsApp para código e alertas | Custo por envio (DEC-003) | Lojistas perdendo pedido por falta de alerta |
| Mais de uma loja por dono | HIP-031 | Dono com filiais |
| Indicação, avaliações com foto, lojas favoritas por bairro | Sem evidência | Dados de retenção |
| Registro de incidentes de segurança no admin | Processo é do security | Após threat model |
| Exigir CNPJ acima de um faturamento | Fiscal | Parecer do contador |

## 7. Decisões e pendências para CEO/fundador
| # | Assunto | Recomendação do PO | Onde |
|---|---|---|---|
| 1 | Brief: "a loja define se aceita troca" x CDC (arrependimento e defeito são direitos) | Loja define só a troca voluntária; piso legal fixo | HIP-017, RN-11 |
| 2 | Split do MP exige conta e KYC do lojista; centralizado pode ser atividade regulada | Preferir split; centralizado só com parecer jurídico | WB-155, `pesquisa-mercado.md` §6 |
| 3 | Pagamento só online (sem dinheiro/maquininha na entrega) | Manter na 1.0; medir no piloto | `pesquisa-mercado.md` §7 |
| 4 | Vendedor pessoa física (CPF) com habitualidade; NFS-e da comissão da Webag | Permitir (brief), termos transferem responsabilidade, consultar contador | HIP-031 |
| 5 | Comissão padrão de 10% | Adotar; revisar com dados do piloto | HIP-001 |
| 6 | Textos de termos, privacidade, política de trocas; encarregado de dados | Minuta técnica do PO; revisão do fundador/jurídico antes de G5 | PRD LGPD |
| 7 | Lojista é painel web (não app): CLAUDE.md §2 ainda cita app para lojista | Seguir o brief; CEO atualizar CLAUDE.md | DEC-005 |
| 8 | CLAUDE.md §1 lista Cajamar; o brief e DEC-009 listam Campo Limpo Paulista | Seguir o brief | DEC-009 |

## 8. Aceite do PO (como vou validar)
Uma história só é aceita se: (1) todos os critérios Dado/Quando/Então do PRD passam, incluindo erro, vazio e limites, verificados pelo QA; (2) DoD da skill `definicao-de-pronto` cumprida; (3) valores numéricos batem com `regras-de-negocio.md`; (4) eventos de analytics do PRD instrumentados. Recuso com motivo objetivo apontando o critério (ex.: "WB-068 C4: timeout de 10 min não cancelou o pedido").
