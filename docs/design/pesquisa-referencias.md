# Pesquisa de referências — Webag

> Autor: product-designer. Data: 2026-11-18. Base: `docs/00-visao/brief.md` §2, §3, §5.
> Marcas: **[V]** verificado em fonte aberta nesta sessão; **[S]** lido só em resumo de busca (fonte secundária, conferir antes de citar fora do time); **[M]** conhecimento do designer, não reaberto nesta sessão (conferir no app/doc oficial); **[HIPÓTESE]** inferência a validar.

## 1. Método e limites (leia primeiro)

- O ambiente de pesquisa bloqueou `baymard.com`, `w3.org`, `m3.material.io`, `docs.expo.dev` e `apps.apple.com`; `developer.apple.com` devolveu só o título. Por isso **Apple HIG, Material 3, Baymard e a maior parte do WCAG 2.2 entram como [M] ou [S]**. Só o texto do WCAG 2.5.8 foi aberto direto (via repositório W3C no GitHub).
- Nenhum app concorrente foi instalado ou testado por mim. As observações sobre iFood, Mercado Livre, Shopee, Rappi e Zé Delivery são [M] e servem de hipótese de padrão, não de prova. **Ação:** antes do G4, rodar a revisão heurística em Android real com os 5 apps (1 h cada; checklist na §7).
- Não houve pesquisa com usuários. O perfil vem do brief (§2) e de dados públicos de mercado.

## 2. Quem estamos desenhando (restrições que mandam no design)

| Fato | Fonte | Consequência de design |
|---|---|---|
| Android responde por 72% a 88% dos celulares no Brasil, conforme a metodologia (StatCounter, uso: 88,3% em mai/2025 e 81,9% em fev/2026; pesquisa Mobile Time/Opinion Box: 72%). Samsung e Motorola lideram | [S] [Oficina da Net, mai/2025](https://www.oficinadanet.com.br/smartphones/62204-market-share-celulares-maio-2025-brasil), [fev/2026](https://www.oficinadanet.com.br/smartphones/68378-market-celulares-fevereiro-2026-brasil) | Android é o alvo de teste principal; iOS não pode ficar para trás (App Store exige qualidade e Sign in with Apple) |
| Cliente tem Android de entrada, internet instável, sol na tela, desconfiança | Brief §2 | Contraste alto (≥ 4,5:1 em tudo que importa), texto ≥ 16, poucas fontes, imagens leves, skeleton em vez de spinner, estado offline de primeira classe |
| Lojista é MEI, pouco tempo, usa celular ou PC do balcão | Brief §2 | Uma ação por tela, wizard curto com rascunho salvo, alertas inequívocos, botões grandes |
| Admin é o fundador (edita tudo sem código) | Brief §2 | Densidade maior e atalhos, mas mesma linguagem visual; tudo auditável |

## 3. Referências de mercado: o que copiar, o que evitar

Cor de destaque de cada referência é [M]. O objetivo é saber que espaço de marca está ocupado.

| Referência | Padrões que funcionam (aplicar) | O que evitar | Destaque [M] |
|---|---|---|---|
| **iFood** | Endereço fixo no topo; categorias em ícones; lista de lojas com tempo e taxa visíveis antes do clique; barra "Sacola" flutuante; linha do tempo do pedido; "pedir de novo". Em 2025 reforçou a identidade como marketplace além de comida ([Meio & Mensagem](https://www.meioemensagem.com.br/comunicacao/ifood-quer-reforcar-sua-identidade-como-marketplace) [S, só título]; atualização de app com visual novo e memória de pedidos anteriores: [Mobile Time](https://www.mobiletime.com.br/?p=212043) [S]) | Home saturada de banners, cupons e rótulos; muitos formatos competindo por atenção; vermelho em tudo | Vermelho |
| **Mercado Livre** | Confiança por evidência (reputação do vendedor, avaliações, prazo e frete antes do carrinho, devolução explícita); busca e filtros fortes; sistema de design único para web, iOS e Android ([Figma, caso Mercado Libre](https://www.figma.com/customers/mercado-libre-scales-design-across-latin-america/) [S]) | Página de produto longa e carregada de selos; informação demais para tela pequena | Amarelo |
| **Shopee** | PIX com "Copiar código Pix", abrir app do banco e colar, ou usar QR ([blog oficial](https://shopee.com.br/blog/metodos-de-pagamento/) [S]); cupons visíveis na sacola | Gamificação e urgência artificial (contagem, "últimas unidades" falsas) que alimentam a desconfiança do nosso cliente; poluição visual | Laranja |
| **Rappi** | Vitrines horizontais por tipo de loja (varejo e mercado, não só comida); busca por produto entre várias lojas | Rotulagem de marketing; muitas camadas de promoção | Coral/vermelho |
| **Zé Delivery** | Simplicidade e voz própria; app com nota máxima na App Store segundo [ABC da Comunicação](https://www.abcdacomunicacao.com.br/ze-delivery-contrata-executiva-do-uber-eats-para-ser-chief-marketing-officer/) [S]; recompensa e diversão como posicionamento ([Mundo do Marketing](https://mundodomarketing.com.br/diversao-e-recompensa-a-estrategia-do-ze-delivery-para-ampliar-numero-de-usuarios) [S]) | Personalidade de "rolê" não cabe em perfumaria, papelaria e pet; copiar só o tom direto | Amarelo |
| **Varejo bem avaliado** (Magalu, Amazon Brasil, Americanas) [M] | Foto grande, preço grande, parcelamento claro, "comprar agora"; política de troca no produto; rastreio simples | Banner de promoção em cada seção; preço e desconto competindo na mesma linha | Azul, laranja, vermelho |

**Lacuna de marca:** vermelho, amarelo, laranja, coral e azul-royal estão ocupados no varejo brasileiro [M]. Roxo é Nubank e é proibido pelo brief. O Webag usa um **verde-azulado profundo (petróleo)**, ver `identidade.md` §3.

## 4. Evidência de comportamento em e-commerce

| Achado | Fonte | Aplicação no Webag |
|---|---|---|
| Custos extras no checkout são o motivo nº 1 de abandono (≈ 39% em levantamento do Baymard; outras compilações citam 40% a 61% conforme a pergunta) | [S] [Baymard](https://baymard.com/learn/reduce-cart-abandonment) | Frete e taxa aparecem no card da loja e no produto; resumo da sacola mostra o total final, sem surpresa no passo de pagamento (brief §3.1) |
| Conta obrigatória derruba ≈ 19% (outras compilações: 18% a 35%) e o convidado precisa ser a opção mais evidente | [S] Baymard (mesma página) | Explorar e montar a sacola sem conta; cadastro só no checkout (brief §3.1); cadastro com o mínimo de campos |
| Filtros aplicados devem ficar visíveis; oferecer "Limpar tudo" e limpar por grupo; a maioria dos sites mobile filtra mal | [S] [Baymard, filtros](https://baymard.com/learn/ecommerce-filter-ui), [filtros mobile](https://baymard.com/mcommerce-usability/benchmark/mobile-page-types/filtering-options) | Barra de chips com filtros ativos abaixo da busca; folha de filtros com contador "Ver 23 resultados" |
| Fluxo PIX de mercado: copiar código, pagar no app do banco, retornar | [S] Shopee (acima) | Botão "Copiar código" grande, QR secundário, contagem regressiva, confirmação automática por WebSocket |
| Mercado Pago (nosso provedor) orienta combinar cor, forma e texto e evitar cores muito brilhantes e saturadas | [S] [Mercado Pago Developers, acessibilidade](https://mercadopago.com.br/developers/en/docs/mini-apps/additional-content/best-practices/accessibility) | Nunca só cor para status; paleta sóbria |

**Os números de abandono variam entre fontes. [HIPÓTESE]:** usar apenas a direção (custo surpresa e conta obrigatória são os maiores vilões) e medir os nossos no funil do checkout (eventos em `fluxos.md` §8).

## 5. Normas e guias de plataforma

| Norma | Regra usada | Marca |
|---|---|---|
| WCAG 2.2 SC 1.4.3 Contraste (AA) | Texto normal ≥ 4,5:1; texto grande (≥ 24 px, ou ≥ 18,66 px negrito) ≥ 3:1 | [M] |
| WCAG 2.2 SC 1.4.11 Contraste não textual (AA) | Bordas de campo, ícones e estados ≥ 3:1 contra o fundo | [M] |
| WCAG 2.2 SC 1.4.1 Uso de cor (A) | Estado nunca só por cor: ícone e texto junto | [M] |
| WCAG 2.2 SC 2.5.8 Tamanho do alvo, mínimo (AA, novo na 2.2) | Alvo ≥ 24×24 px CSS, salvo exceções: espaçamento (círculo de 24 px sem tocar outro alvo), equivalente, em linha, controle do navegador, essencial | **[V]** [texto da norma](https://raw.githubusercontent.com/w3c/wcag/main/guidelines/sc/22/target-size-minimum.html) |
| WCAG 2.2 SC 2.4.11 Foco não obscurecido (AA, novo) | Barra fixa não pode cobrir o campo focado, relevante para o teclado e a barra "Ir para o pagamento" | [M] |
| WCAG 2.2 SC 3.3.7 Entrada redundante (A, novo) | Não pedir de novo dado já informado (endereço, telefone) | [M] |
| WCAG 2.2 SC 3.3.8 Autenticação acessível (AA, novo) | Permitir colar senha e código e usar gerenciador de senhas; sem "teste cognitivo" | [M] |
| Apple HIG | Alvo ≥ 44×44 pt; Dynamic Type; tab bar de 3 a 5 itens; não depender só de cor | [M] (página oficial não carregou) |
| Material Design 3 | Alvo ≥ 48×48 dp; navigation bar de 3 a 5 destinos; camadas de estado (hover 8%, foco 10%, pressionado 10%) | [M] |

**Decisão:** alvo mínimo **48** nas duas plataformas e no web touch (cobre 44 pt, 48 dp e o AAA 2.5.5 de 44 px). Controle compacto de 40 só em tabela de admin no desktop, com ≥ 24 px de espaço ao redor.

## 6. Biblioteca de ícones e tipografia: o que foi verificado

| Item | Resultado | Marca |
|---|---|---|
| Phosphor Icons | 1.248 ícones, 6 pesos (Thin, Light, Regular, Bold, Fill, Duotone), licença MIT; pacote web oficial; porta React Native mantida pela comunidade ([repo](https://github.com/phosphor-icons/homepage)) | [V] |
| Lucide | ISC, ~1.600 a 2.000 ícones, pacote React Native `lucide-react-native` ([repo](https://github.com/lucide-icons/lucide)) | [V] |
| Inter | OFL-1.1, variável, números tabulares ([repo](https://github.com/rsms/inter)) | [V] |
| Figtree | OFL-1.1, "geométrica, simples e amigável" ([repo](https://github.com/erikdkennedy/figtree)); pacote Expo `@expo-google-fonts/figtree` com pesos 300 a 900 ([repo](https://github.com/expo/google-fonts/tree/main/font-packages/figtree)) | [V] |
| Figtree: números tabulares e cobertura de acentos do português | Não confirmado na página | **[HIPÓTESE]**: validar com um teste de renderização "R$ 1.234,56 ç ã é" antes de travar a fonte; plano B: Inter |

## 7. Anti-padrões (o que o Webag não faz) e como verificar

| Anti-padrão | Fonte da exigência | Regra no design system |
|---|---|---|
| Gradiente roxo, brilho "neon" | Brief §5 | Sem gradiente em UI. Única exceção: scrim preto sob texto em foto |
| Emoji como ícone | Brief §5 | Uma família (Phosphor). Emoji só em conteúdo digitado pelo usuário |
| Cards iguais empilhados | Brief §5 | Regra dos 3 formatos: linha, tile sem caixa, card de capa (`design-system.md` §4) |
| Sombra pesada | Brief §5 | 3 níveis de sombra, máx. 14% de opacidade; cartões usam fio, não sombra |
| Urgência falsa e marketing vazio | Brief §5 + desconfiança do público | Sem contador de "oferta termina em", sem "últimas unidades" se não vier do estoque real |
| Spinner no lugar de skeleton | Brief §5 | Skeleton com a forma do conteúdo; spinner só em ação pontual de botão |
| Erro genérico ("Ops!") | Skill design-system | Erro diz o que houve e o que fazer (`identidade.md` §8) |

**Checklist de revisão heurística (G4):** 10 heurísticas de Nielsen em cada fluxo-chave; contagem de toques, telas e palavras (alvos em `fluxos.md` §2); teste com 5 pessoas da região em Android de entrada (ex.: Moto E, Galaxy A0x) sob luz forte e 3G simulado.

## 8. Fontes

**Abertas e lidas [V]:** texto do WCAG 2.5.8; READMEs de Phosphor, Lucide, Inter, Figtree e do pacote Expo de Figtree (links na §6 e §5).
**Lidas em resumo de busca [S]:** Baymard (abandono, filtros), Shopee (PIX), Oficina da Net (participação do Android), Mobile Time e Meio & Mensagem (iFood), Figma (Mercado Libre), ABC da Comunicação e Mundo do Marketing (Zé Delivery), Mercado Pago Developers (acessibilidade). Links nas tabelas acima, acessados em 2026-11-18.
**Não acessadas, citadas de memória [M]:** Apple HIG, Material 3, páginas de entendimento do WCAG (exceto 2.5.8), documentação Expo. Pedir ao CEO para liberar `w3.org`, `m3.material.io`, `developer.apple.com`, `baymard.com` e `docs.expo.dev` no ambiente, se quiserem fechar essas lacunas.
