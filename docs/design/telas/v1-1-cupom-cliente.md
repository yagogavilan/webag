# Tela: Cliente, aplicar cupom na sacola e no checkout   (WB-347; efeitos de WB-341, WB-342, WB-344, WB-348)

> Autor: product-designer. Data: 2026-11-22. Release R2. Protótipo: `#/c/sacola` (digite os códigos listados no rodapé: PRIMEIRA8, CASA10, FRETE0, VELHO, ACABOU, HOJE, OUTRA, CEL, BLOQ; o botão "Adicionar Bermuda jeans" muda o subtotal e mostra "Faltam" virando cupom aplicado).
> Estende `direcao-v3.md` §5 (Sacola: cupom recolhido em 1 linha) e `docs/telas/16-app-cupons.png`. Passo 2 do checkout (Pagar) repete o mesmo resumo.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Cupom recolhido em 1 linha**: "Tem cupom? / Você tem 1 cupom para esta loja" + "Ver cupons". O campo só abre ao toque | Campo aberto chama atenção para um desconto que o cliente não tem e faz sair para procurar código (abandono) `[M, hipótese de mercado]`. Já decidido na v3 |
| 2 | **O resumo mostra sempre as mesmas linhas**: Produtos, Entrega, Desconto (com a origem, em verde), Total. Produtos e Entrega **não mudam** com o cupom (RN-C1) e o resumo diz isso em 1 linha | Decreto 7.962/2013 e Portaria Senacon 61/2026; é o que faz o cliente confiar |
| 3 | **"Faltam R$ 40,00 para usar o cupom" é um bloco, não um erro**: barra de progresso da marca ("Seu pedido tem R$ 80,00. O cupom vale a partir de R$ 120,00.") e **um botão que resolve** ("Adicionar Bermuda jeans · R$ 79,90"). O total **não muda** | CDC art. 30: a oferta é inteira ou não é. O texto vem do servidor (X = quanto falta de subtotal). Sem relógio, sem urgência |
| 4 | **Não mostrar o cupom a quem não pode usá-lo.** "Primeira compra" só aparece na vitrine para quem não tem pedido pago; para os outros só funciona digitando o código, e a resposta explica | Mostrar uma oferta inalcançável irrita. Depende do PO (pergunta 1) |
| 5 | Motivo sempre escrito e com próximo passo; **nunca "cupom inválido" seco** | Skill de microcopy |
| 6 | Depois de aplicar, o cupom vira **cartão verde** com código, origem e valor e botão "Remover" | Reversível em 1 toque (H3) |

## 1. Layout da Sacola (de cima para baixo)

| # | Componente | Conteúdo |
|---|---|---|
| 1 | Cabeçalho roxo "Sua sacola" + pastilha "Pedido na Moda Morato" | |
| 2 | Itens | Miniatura, "Camiseta básica branca · R$ 40,00", stepper 48 px |
| 3 | "Adicionar..." | No protótipo, atalho de teste |
| 4 | **Bloco do cupom** | Recolhido (§2) ou aplicado (§3) ou resposta (§4) |
| 5 | **Resumo do pedido** | `PriceSummary`: Produtos R$ 80,00 · Entrega R$ 9,00 · **Desconto Webag − R$ 8,00** (verde, sinal "−" + texto) · divisor de barras · **Total** (Bricolage 28, tabular) |
| 6 | Rodapé fixo | "Ir para o pagamento · R$ 89,00" (o valor acompanha o total) |

Linhas do resumo com cupom: o rótulo muda por origem: **"Desconto Webag"**, **"Desconto da loja"**, **"Desconto Webag e loja"** (campanha dividida), **"Desconto Webag (entrega)"** para frete grátis. Taxa de serviço só aparece se > 0 (F3 desligada hoje).

## 2. Entrada do cupom

1. Toque em "Tem cupom?": abre **o campo "Código do cupom"** (letras maiúsculas automáticas, `autocomplete=off`, `enterkeyhint=go`) com botão "Aplicar". Foco no campo. Colar permitido.
2. "Ver cupons" abre BottomSheet **"Cupons para este pedido"**: cartão por cupom com **valor, condição, validade, origem e restrições em texto** (C2): "R$ 8 de desconto · Primeira compra · pedido a partir de R$ 120,00 · Válido até 31/12 · Desconto Webag". Cada cartão tem "Aplicar" e, se não vale agora, a mesma barra "Faltam R$ 40,00". Percentual mostra "até R$ 15,00".
3. Aplicar: botão com "Aplicando…"; sucesso: o cartão verde aparece, o total conta do valor antigo ao novo (único movimento de dinheiro, só porque o usuário agiu; reduzido: troca direta), toast "Desconto Webag: R$ 8,00 a menos. Total R$ 160,90." e anúncio ao leitor de tela.

## 3. Estado: aplicado (válido)

Cartão verde (`ok`): ícone de bilhete, **"PRIMEIRA8 aplicado"**, "Desconto Webag: R$ 8,00 a menos. Primeira compra · pedido a partir de R$ 120,00." + "Remover". Resumo com a linha de desconto. Remover: toast "Cupom removido." e o total volta.

## 4. Estados de resposta (tabela `motivo -> mensagem -> ação`)

| Situação (código do servidor, só interno) | Mensagem ao cliente | Ação oferecida |
|---|---|---|
| Subtotal abaixo do necessário (WB-341 C2, C3) | **"Faltam R$ 40,00 para usar o cupom."** + barra + "Seu pedido tem R$ 80,00. O cupom vale a partir de R$ 120,00." | "Adicionar Bermuda jeans · R$ 79,90" (sugestão da loja) / "Ver mais produtos" |
| Margem do pedido <= 0 (WB-341 C4) | "Cupom não disponível para este pedido." | Continuar sem cupom |
| Fora da validade (WB-347 C4) | "Esse cupom expirou em 31/10." | "Ver cupons" |
| Esgotado | "Cupom esgotado." | "Continuar sem cupom" |
| Esgotado no dia (WB-342 C1) | "Cupom esgotado hoje. Volta amanhã. Você pode continuar sem ele." | "Continuar sem cupom" (o pedido segue) |
| Não é primeira compra (WB-344 C1) | "Cupom válido só na primeira compra." | n/a |
| Outra loja | "Esse cupom vale só na loja Casa Bela." | "Ver a loja Casa Bela" |
| Sem celular confirmado (WB-344 C4) | "Confirme seu celular para usar este cupom." | "Confirmar celular" (volta à sacola) |
| Sinal de fraude (WB-344 C6) | "Cupom não disponível para este pedido." (neutro; **não** diz o motivo) | Continuar sem cupom |
| 11 tentativas em 1 h (WB-344 C8) | "Muitas tentativas. Tente de novo em 1 hora." (neutro) | n/a |
| Código inexistente | "Não encontramos esse cupom. Confira o código e tente de novo." | Campo com erro e foco |
| Campo vazio | "Digite o código do cupom." | n/a |
| Sem internet (WB-347 C5) | "Sem conexão. Não conseguimos aplicar o cupom agora. Seu resumo continua o mesmo." | O app mantém o último resumo; "Aplicar" tenta de novo |
| Código desconhecido do servidor | "Algo deu errado do nosso lado. Tente de novo em instantes." | "Tentar de novo" |

Erro no campo: borda 2 px de erro + ícone + texto (`role=alert`, `aria-describedby`), nunca só cor. O estado "Faltam" usa o bloco âmbar com ícone de informação, não o vermelho de erro (não é culpa do cliente).

## 5. Selo "de/por" (WB-348, mesma sacola/vitrine)

Preço riscado e percentual só aparecem quando o preço "de" foi praticado por 30 dias; senão a vitrine mostra só o preço atual (sem tela própria). Para o **lojista** (cadastro de promoção): aviso antes de publicar "Seu desconto só aparece depois de 30 dias de preço anterior." (aba de preço no formulário; reaproveita `EarningsHint`).

## 6. Estados da tela

| Estado | Comportamento |
|---|---|
| Carregando | Skeleton das linhas do resumo; o bloco do cupom mostra "Aplicando…" no botão (largura fixa) |
| Vazio (sacola vazia) | "Sua sacola está vazia. Escolha produtos de uma loja perto de você." [Ver lojas] |
| Erro | Linha do resumo "Não conseguimos calcular o desconto agora. Tente de novo." + "Tentar de novo"; o total sem cupom continua correto |
| Sem rede | Faixa "Sem conexão. Mostrando o que já carregou."; último resumo preservado; "Aplicar" mostra a mensagem da §4 |
| Sucesso | §3 |
| Permissão negada | n/a (cupom não usa permissão do sistema) |

## 7. Acessibilidade

Campo com `label` visível; erro e "Faltam" em `role=alert`/região viva educada; total em `aria-live=polite` (anuncia o novo valor uma vez). Barra de progresso `aria-hidden` com o texto completo ao lado (valor atual e valor necessário). Resumo é uma lista de definição (`dl`): rótulo e valor lidos juntos ("Desconto Webag, menos R$ 8,00"). Desconto verde sempre com sinal "−" e nome. Alvos 48 px; texto >= 16 px; fonte 200%: linhas do resumo empilham sem truncar valor. Ajuda consistente (WCAG 3.2.6): o atalho "Falar com a loja" fica onde está no resto do fluxo.

## 8. Eventos (servidor)

PRD: `coupon_applied` (campaign_id, funding_source, discount_cents, store_share_cents), `coupon_rejected` (reason_code: exhausted, min_order, not_first_purchase, fraud_signal, margin). Proponho (PO): `coupon_shortfall_shown` (faltam_cents_band), `coupon_shortfall_resolved` (cliente adicionou produto e o cupom aplicou: mede se a sugestão funciona), `coupon_field_opened`.

## 9. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-347 C1 | §1 (resumo) e §3 |
| WB-347 C2 | §2.2 (vitrine em BottomSheet) |
| WB-347 C3 | §1: Produtos e Entrega iguais (+ teste automatizado do dev) |
| WB-347 C4 | §4 |
| WB-347 C5 | §4 (sem internet) |
| WB-341 C2, C3, C4 | §4 (Faltam; aplicado; indisponível) |
| WB-342 C1 | §4 (esgotado hoje; pedido segue) |
| WB-344 C1, C4, C8 | §4 |
| WB-348 | §5 |

## 10. Revisão heurística

**Nota 4 de 5.** CC-1 (sev. 3, H5): "Faltam R$ 40,00" pode soar como empurrão para gastar mais; o texto fica factual e o cliente decide, mas **medir** `coupon_shortfall_resolved` x abandono `[HIPÓTESE]`; se o abandono subir, trocar por link discreto. CC-2 (sev. 2, H6): o cliente que já usou o cupom e vê "primeira compra" confuso; texto neutro + vitrine filtrada. CC-3 (sev. 2, H1): total muda de valor ao aplicar; anúncio e toast cobrem. CC-4 (sev. 3, H9): mensagens de fraude **precisam** ser neutras e isso frustra cliente legítimo bloqueado; sempre oferecer "Falar com a loja/suporte" no mesmo lugar (C9 do WB-344 libera). Bom: recolhido por padrão, resumo discriminado, "Remover" em 1 toque, a ação ao lado do "Faltam". **Teste com 3 a 5 clientes:** achar e aplicar o cupom sem ajuda; ler o "Faltam" e dizer o que fariam.

## 11. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Vitrine de cupons: mostrar só o que o cliente pode usar ou tudo com motivo? 2. Qual produto a loja sugere no "Faltam" (mais vendido? mais barato que fecha o valor?) 3. Frete grátis aparece como linha de desconto ou como "Entrega: Grátis"? (RN-C1 diz que a entrega exibida antes do cupom é a mesma) 4. Texto exato de WB-347 C4 "Válido até 31/12" no resumo |
| Security | 5. Mensagens neutras de fraude: revisar |
| jurídico (J22) | 6. Rubrica do frete grátis no resumo |
| mobile-dev | 7. Total animado só por ação do usuário; confirmar `motion.count` sem custo no Android de entrada |
