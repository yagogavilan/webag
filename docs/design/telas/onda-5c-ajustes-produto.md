# Telas da Onda 5C: ajustes de produto, ficha e avaliação (DEC-035 e DEC-037)

> Autor: product-designer. Data: 2026-11-19. Decisões: DEC-035 (o preço do lojista já inclui a comissão; mostrar "Você recebe"), DEC-037 (tabela de medidas, "sem troca voluntária", "Você tem N dias para trocar", "como vestiu?"), DEC-024c e RN-13 (valores só para o dono), RN-10 (fórmula da comissão). Base: `onda-2-lojista-admin.md` K1 a K3 e L6, `onda-3-descoberta-cliente.md` D8 a D10, `onda-5-posvenda.md` X4 e V2, `onda-5b-troca.md`. **Não repito as telas:** cada item abaixo diz exatamente **o que muda** e onde. Prefixos de teste: `lojista.produto.` (K2/K3), app `product.`, `review.`, `lojista.avaliacoes.`. Estados padrão: EP-web (`onda-2` §0.2) e EP-app (`onda-3` §0.2).

## Parte A. Lojista: formulário de produto (K2, K3, K1, L6)

### A1. Preço e "Você recebe" (altera a seção 4 de K2; mesma linha em K3 "Preço diferente")

**Objetivo:** o lojista cadastra o preço **já com a comissão dentro** e vê quanto cai na conta dele, sem fazer conta. **Ação principal da tela:** continua "Publicar produto".

**Layout (logo abaixo do campo Preço, sem mudar a ordem da tela):**
1. Campo **Preço** (moeda) com ajuda fixa de 1 linha: **"O preço que você cadastra é o que o cliente paga. A comissão da Webag já está dentro dele."** (`caption`, `Info` com link "Como funciona").
2. **Linha "Você recebe"** (cartão `surface.sunken`, sem borda; 2 linhas): `bodyStrong` **"Você recebe R$ 84,91"** e `caption` **"Comissão da Webag: 15% (R$ 14,99). A tarifa do Mercado Pago é descontada à parte."** Atualiza **a cada tecla** com atraso de 300 ms; leitor de tela anuncia só ao sair do campo (região viva educada).
3. **Com promoção ligada:** segunda linha "Na promoção você recebe R$ 67,91." (preço promocional de R$ 79,90; usa o mesmo cálculo).
4. Link **"Quero receber um valor"** (texto, alvo 48) abre uma folha pequena: campo "Quanto você quer receber?" (R$ 100,00) > resultado "Cobre R$ 117,65 para receber R$ 100,00" > botão **"Usar este preço"** (preenche o campo). O app arredonda para o centavo que **garante** o valor (nunca recebe menos que o pedido). Ajuda quem precifica "pelo líquido" **[Should]**.

**Regras de cálculo (RN-10):** `recebe = preço − round_half_up(preço × pct)`; `pct` pela precedência **loja > categoria do produto > padrão** (muda quando o lojista troca a categoria; a linha acompanha). Sem categoria escolhida: usa o percentual da loja e o texto "Pode mudar ao escolher a categoria." Preço vazio ou inválido: a linha mostra "Informe o preço para ver quanto você recebe." (não esconde, para o espaço não pular). A comissão é congelada no momento do pagamento do pedido (RN-10): a linha é **estimativa viva**, e a folha "Como funciona" diz isso: "Vale a comissão do dia da venda."
**Folha "Como funciona" (BottomSheet):** exemplo numérico em 3 linhas: "Preço R$ 100,00 · Comissão (15%) R$ 15,00 · Você recebe R$ 85,00" + "A Webag retém a comissão de cada venda. O percentual da sua loja é definido pela Webag e aparece aqui." + "A tarifa do Mercado Pago (cobrada pelo provedor) também sai do seu valor." **[HIPÓTESE conforme RN-10 e ADR-002: se a tarifa for da Webag, remover as duas frases da tarifa; PO e backend confirmam antes de implementar. Hoje DEC-035 diz só "preço menos comissão"; omitir a tarifa faria o lojista receber menos que o prometido na tela.]**
**Permissão (RN-13, DEC-024c):** quem não é o dono e não tem `vendas_valores` vê **só a ajuda** ("O preço deve incluir a comissão da Webag.") e **não vê** a linha "Você recebe" nem o percentual. O dono sempre vê.
**Comissão mudou:** quando o admin altera a comissão da loja (A3, F2), o painel mostra faixa no topo de Produtos por 7 dias: "A comissão da sua loja mudou para 15% em 20 nov. Seus preços não mudam sozinhos. Confira quanto você recebe." + "Ver produtos" **[Should, HIPÓTESE; evita o lojista descobrir pelo extrato]**. A lista de produtos no desktop ganha a coluna "Você recebe" (dono).

**Estados.** Skeleton: linha em skeleton junto dos campos. Vazio: "Informe o preço para ver quanto você recebe." Erro: percentual não carregou: a linha mostra "Não conseguimos calcular agora. Você pode publicar e conferir depois." + "Tentar de novo" (**nunca bloqueia** a publicação). Offline: usa o último percentual guardado com "Valor estimado. Atualiza quando você estiver online." Sucesso: n/a. Permissão: acima.
**Acessibilidade:** a linha é `role="status"` (educada); valores por extenso ("84 reais e 91 centavos"); o link "Quero receber um valor" tem alvo 48; o aviso fixo não depende de cor.
**Microcopy:** ver acima; botão da folha: "Usar este preço"; erro do campo da folha: "Digite quanto quer receber."
**testID:** `price-hint`, `receive-line`, `receive-promo-line`, `receive-calc-link`, `receive-calc-input`, `receive-calc-result`, `receive-calc-apply`, `receive-how-link`, `receive-how-sheet`, `receive-error-retry`, `commission-changed-banner`.

### A2. Marcador "sem troca por tamanho ou cor" (nova seção 8 de K2)

**Objetivo:** avisar o cliente, **antes de comprar**, que o item não tem troca voluntária (sob medida, íntimo, higiene). **Ação principal da tela:** a mesma. Seção **"Troca"** logo depois de "Seção da vitrine".

**Layout:** Switch **"Aceita troca por tamanho ou cor: Ligado/Desligado"** (texto escrito; **padrão: segue a política da loja**, geralmente Ligado). Ao **desligar**, abre o rádio obrigatório **"Por quê? (o cliente lê)"**: "Feito sob medida ou personalizado" · "Item íntimo ou de higiene" · "Outro motivo" (texto de 10 a 80). Cartão fixo `info.subtle` com `Scales`: **"Desistência em 7 dias e defeito continuam valendo por lei. Você não pode desligar."** Prévia: "Como o cliente vê: Sem troca por tamanho ou cor: feito sob medida."
- **Loja sem troca voluntária** (C5 desligado): o Switch aparece **inerte, Desligado**, com "Sua loja não faz troca por tamanho ou cor. Veja a política." + link para C5.
- **Categoria com marcador do admin** (ex.: moda íntima) **[HIPÓTESE]**: Switch inerte Desligado com "Definido pela Webag para esta categoria: item íntimo ou de higiene."
- O motivo é o texto exato que aparece na ficha (D9) e na tela de troca (X1b: "Este produto não tem troca por tamanho ou cor: é feito sob medida.").
**Mensagens:** "Escolha o motivo." · "Escreva o motivo (mínimo 10 letras)." **Estados.** Skeleton: Switch. Vazio: n/a. Erro/Offline: EP-web. Sucesso: salvo com o produto. Permissão: só quem edita o catálogo; funcionário com "catálogo" **pode** marcar (não envolve valor).
**Acessibilidade:** rádio em grupo "Motivo"; estado do Switch em texto. **testID:** `exchange-switch`, `exchange-reason-custom`, `exchange-reason-hygiene`, `exchange-reason-other`, `exchange-reason-text`, `exchange-legal-card`, `exchange-store-off-note`, `exchange-category-locked`.

### A3. Tabela de medidas (nova seção 9 de K2, depende de K3)

**Objetivo:** ajudar o cliente a escolher o tamanho certo para **não precisar trocar**; a tabela vem **sem redigitar os tamanhos**. **Ação principal da tela:** a mesma; a seção é opcional e salva com o produto.

| Breakpoint | Layout |
|---|---|
| Celular | Seção recolhível "Tabela de medidas · opcional". **Um cartão por tamanho** (P, M, G...), cada um com os campos das medidas empilhados (rótulo acima, número, "cm" fixo à direita) |
| Desktop | Tabela: linhas = tamanhos, colunas = medidas; células numéricas de 48 (40 compacta); rótulo da coluna editável; coluna removível |

**Passos (todos na mesma seção):**
1. **Disponível só com a opção "Tamanho"** em K3. Sem ela: inerte, "Disponível quando o produto tem a opção Tamanho." + botão "Adicionar tamanho" (leva a K3).
2. **"As medidas são:"** segmentado **"Da peça" | "Do corpo"** (padrão: Da peça). Ajuda: "Da peça: a roupa esticada sobre a mesa. Do corpo: a pessoa que veste." (a confusão entre as duas é causa conhecida de troca **[HIPÓTESE]**; o cliente lê qual é na ficha).
3. **"Quais medidas?"** chips múltiplos, **sugeridos pela categoria** (roupa de cima: Largura, Comprimento, Manga; de baixo: Cintura, Quadril, Comprimento; calçado: Comprimento do pé em cm) + "Outra medida" (nome livre, até 20). Máximo 5 colunas.
4. **Grade de valores** (uma linha por tamanho de K3, na mesma ordem). Teclado numérico, vírgula aceita ("52,5"), "cm" fixo.
5. **Atalhos que economizam o dia inteiro:** "Usar a tabela de outro produto" (lista dos produtos da loja com tabela; copia as linhas dos tamanhos iguais), **"Usar modelo da loja"** e **"Salvar como modelo da loja"** (nome até 40, ex.: "Camisetas masculinas"). Quem cadastra 80 camisetas preenche **uma vez**.
6. **Como medir** (opcional, até 200, com sugestão editável: "Meça com a peça esticada sobre uma mesa.").
7. **"Ver como o cliente vê"** abre a mesma folha da ficha (B1).
- **Não aceita imagem da tabela na 1.0** **[HIPÓTESE; lojistas costumam ter a tabela do fornecedor em imagem]:** tabela estruturada funciona com leitor de tela, não corta no celular e alimenta o destaque do tamanho escolhido. Validar com 3 lojistas; se rejeitarem, entra "Enviar imagem" como alternativa com texto descritivo obrigatório.

**Mensagens:** "Use só números." · "Digite uma medida maior que 0." · "O máximo é 300 cm." · ao publicar com tabela incompleta: "Preencha todas as medidas ou remova a coluna." (resumo no topo + foco no 1º vazio; **rascunho aceita vazio**) · **aviso, não erro:** "A medida do M é menor que a do P. Confira." · modelo: "Modelo 'Camisetas masculinas' salvo." Dica (info, `caption`, sem cobrar): "Uma tabela ajuda o cliente a escolher o tamanho certo." **Não** promete redução de troca.
**Em K1 (lista):** chip de filtro **"Sem tabela de medidas"** (aparece só em categorias de moda e calçado) para completar o catálogo aos poucos; selo opcional no desktop.
**Estados.** Skeleton: grade em skeleton. Vazio: seção recolhida com "Adicione para ajudar o cliente." Erro: EP-web; valor inválido na célula com ícone e texto. Offline: edição local; "Conecte-se para salvar. Sua tabela está neste aparelho." Sucesso: toast "Tabela de medidas salva." Permissão: como K2.
**Acessibilidade:** celular = lista de cartões, desktop = `role="table"` com cabeçalhos; cada campo "Largura do M, em centímetros"; atalho de teclado: Tab percorre a linha, Enter desce.
**testID:** `sizechart-section`, `sizechart-disabled-note`, `sizechart-add-size`, `sizechart-basis-piece`, `sizechart-basis-body`, `sizechart-measure-<chave>`, `sizechart-measure-custom`, `sizechart-cell-<tamanho>-<chave>`, `sizechart-copy-product`, `sizechart-use-template`, `sizechart-save-template`, `sizechart-howto`, `sizechart-preview`, `sizechart-warning`, `filter-no-sizechart`.

### A4. Onboarding: a comissão em uma frase (altera L6)

L6 ("Onde você recebe?", `onda-2`) já diz `Receipt` "O Webag desconta a comissão de cada venda." Troca a linha por: **"A Webag retém uma comissão de cada venda. Coloque a comissão no preço dos seus produtos."** O **percentual não aparece** no onboarding (o admin só o define na aprovação, A2/A3); **depois da aprovação**, L8 e a primeira abertura de K2 mostram "Sua comissão é 15%." **[HIPÓTESE]**. Mesmo texto no e-mail de aprovação (com o PO). **testID:** `lojista.onboarding.receive-commission`.

---

## Parte B. Cliente: ficha do produto (D9, D8, D10)

### B1. Tabela de medidas na ficha (altera D9, item 3)

**Objetivo:** escolher o tamanho com segurança. **Ação principal da tela:** continua "Adicionar · R$ 89,90".
**Onde:** logo abaixo do grupo "Tamanho", uma linha de 48 com `Ruler` e o texto **"Tabela de medidas"** + `CaretRight`. **Só aparece se o produto tem tabela** (nada de link para folha vazia).
**Folha "Tabela de medidas" (BottomSheet 90%):**
- Título "Tabela de medidas" e linha `caption` **"Medidas da peça, em cm"** (ou "do corpo"; vem do cadastro).
- **Tabela:** linhas = tamanhos, colunas = medidas; **primeira coluna fixa e rolagem horizontal só dentro da tabela** (tabela de dados é exceção de reflow, WCAG 1.4.10); cabeçalho fixo; texto >= 16. O **tamanho escolhido** fica com borda 2, check e a palavra "Seu tamanho" (não só cor). **Sem estoque**: "Sem estoque" na linha, inerte.
- **Tocar numa linha escolhe o tamanho** (rádio) e o botão do rodapé muda de "Fechar" para **"Usar tamanho M"** (fecha e marca o chip; evita voltar e tocar de novo).
- **"Como medir"** (texto do lojista, até 200).
- **Resumo "Como vestiu"** (quando há `caimento_min_respostas` = 5 respostas **[HIPÓTESE]**): barra de 3 segmentos com **rótulos e percentuais escritos** ("Ficou pequeno 15% · Serviu certinho 78% · Ficou grande 7% · 23 avaliações"). Menos de 5: não aparece.
**Estados.** Skeleton: 4 linhas da tabela. Vazio: o link não existe. Erro: EP-app (dados do produto já carregados; a folha lê o cache). Offline: abre do cache. Sucesso: tamanho marcado e toast "Tamanho M escolhido." Permissão: n/a.
**Acessibilidade:** tabela com cabeçalhos de linha e coluna ("M, largura 52 cm, comprimento 70 cm"); `role="radiogroup"` nas linhas selecionáveis; foco no título; botão Fechar visível; fonte 150% mantém a 1ª coluna fixa sem cortar o tamanho. **Android x iOS:** folha nativa (detents no iOS). **testID:** `product.sizechart-link`, `product.sizechart-sheet`, `product.sizechart-basis`, `product.sizechart-row-<tamanho>`, `product.sizechart-howto`, `product.fit-summary`, `product.sizechart-use`, `product.sizechart-close`. **Analytics:** `sizechart_opened`, `sizechart_size_selected`.

### B2. "Você tem N dias para trocar" (substitui o item 5 de D9 e o texto da folha "Política de trocas" de D8)

**Linha em D9** (48, `ArrowsClockwise`): **"Você tem 7 dias para trocar"** e abaixo `caption` **"Levando à loja, é grátis."** `N` = prazo da loja, contado **a partir da entrega**. Variações:

| Situação | Texto |
|---|---|
| Loja aceita troca voluntária | "Você tem 7 dias para trocar" / "Levando à loja, é grátis." |
| Loja não aceita | "Sem troca por tamanho ou cor nesta loja" / "Desistência em 7 dias e defeito: seus direitos continuam." |
| **Produto com marcador (A2)** | "Sem troca por tamanho ou cor: feito sob medida." / "Desistência em 7 dias e defeito: seus direitos continuam." (o motivo do lojista) |
| Loja pausada ou produto esgotado | Não muda |

**Folha "Política de trocas"** (a de D8 e a de D9; mesmo conteúdo): três linhas com ícone, prazo e custo, cada uma em 1 frase:
1. **Tamanho ou cor** (`ArrowsClockwise`): "Em até 7 dias depois de receber. Levando à loja: grátis. Coleta em casa: R$ 5,00, cobrada só se a loja aprovar." (a taxa mostra o valor da região do endereço escolhido; sem endereço: "a partir de R$ 5,00")
2. **Defeito** (`Wrench`): "Em até 30 dias. Sem custo para você."
3. **Desistir da compra** (`ArrowUUpLeft`): "Em até 7 dias, sem dar motivo. Você recebe o valor total, com o frete. Sem custo para você."
Rodapé: "A peça precisa estar sem uso, com etiqueta e embalagem. Para pedir, abra Pedidos e toque em Trocar." **[HIPÓTESE jurídica, validar antes do G5]** · botão "Fechar". O selo **"Aceita troca"** das listas passa a significar "aceita troca por tamanho ou cor" (sem mudança visual).
**Estados.** Skeleton: n/a (dado do produto). Erro/Offline: dado do cache. Permissão: n/a.
**Acessibilidade:** linha lida "Você tem 7 dias para trocar. Levando à loja, é grátis. Toque para ver as regras."; datas por extenso. **testID:** `product.exchange` (existente, texto novo), `product.exchange-days`, `product.exchange-free-note`, `product.exchange-sheet`, `product.exchange-row-size`, `product.exchange-row-defect`, `product.exchange-row-regret`, `product.exchange-none`. **Analytics:** `exchange_policy_opened`.

---

## Parte C. Avaliação: "Como vestiu?" (altera X4 e V2)

**Objetivo:** capturar **o caimento** com 1 toque para ajudar o próximo cliente a escolher o tamanho certo e para a loja ajustar a tabela. **Ação principal da tela:** continua "Enviar avaliação". **Só aparece** para itens de categorias marcadas como vestuário e calçado (`pergunta_caimento` por categoria no admin) **[HIPÓTESE]**.

**Layout (no bloco 2 "Os produtos" de X4):** nos pedidos com item de moda, o bloco 2 **abre já expandido** (hoje vem recolhido) **mostrando só a pergunta de caimento por item**; nota e comentário do produto seguem opcionais, atrás de "Dar nota ao produto". Para cada item: foto 56, nome, "Você comprou: M · Preto" (automático) e a pergunta **"Como vestiu?"** com 3 chips de 48 (rádio, só 1; tocar de novo limpa): **"Ficou pequeno" · "Serviu certinho" · "Ficou grande"**. Ajuda `caption`: "Ajuda quem vai comprar a escolher o tamanho." **Não pedimos altura nem peso** (dado pessoal que pesa no cadastro e custa atrito **[HIPÓTESE, validar com o Security]**).
**Onde vira informação:** (1) resumo no D9 e na folha de medidas (B1), com no mínimo 5 respostas; (2) na lista de avaliações (D10), linha `caption` "Comprou M · Serviu certinho" sob as estrelas, sem dado pessoal; (3) no painel do lojista (V2): por produto, "Caimento: 60% ficou pequeno (10 respostas)" com a dica "Considere avisar na descrição ou ajustar a tabela de medidas." e link **"Editar tabela de medidas"** (leva a K2, seção 9). Fecha o ciclo: a avaliação melhora a tabela, que reduz a troca.
**Regras:** só o caimento respondido, sem nota, **não é uma "avaliação pública"** e não conta para a média nem para o mínimo de 3; vale a janela de `avaliacao_janela_dias`. A pergunta aparece também no pedido que foi **trocado** por tamanho, com o texto "Como serviu o tamanho G?" **[Should]**.
**Mensagens:** nenhuma obrigatória (campo opcional; nenhum erro). Sucesso: o mesmo toast de X4 "Obrigado. Sua avaliação foi enviada."
**Estados.** Skeleton: 1 bloco. Vazio: n/a. Erro/Offline: como X4 (o caimento vai junto, guardado no aparelho). Sucesso: acima. Permissão: n/a.
**Acessibilidade:** grupo de rádio "Como vestiu o Tênis Runner, tamanho 38?" com 3 opções; selecionado = borda 2 + check + texto; alvo 48 com 8 de espaço; funciona a 150% (os 3 chips empilham em 1 coluna).
**testID:** `review.fit-<itemId>-small`, `review.fit-<itemId>-ok`, `review.fit-<itemId>-large`, `review.fit-<itemId>-clear`, `review.products-expanded`; lojista: `lojista.avaliacoes.fit-<produtoId>`, `lojista.avaliacoes.fit-edit-sizechart`. **Analytics:** `review_fit_selected {caimento}`.

---

## Z. Hipóteses, perguntas e o que muda em outros documentos

**Hipóteses marcadas:** tarifa do Mercado Pago no "Você recebe" (A1); marcador por categoria definido pelo admin (A2); `pergunta_caimento` por categoria (C); mínimo de 5 respostas de caimento (B1, C); sem imagem de tabela (A3); sem altura e peso (C); texto do onboarding sem percentual (A4); faixa "comissão mudou" (A1).
**Perguntas ao PO:** (1) o "Você recebe" desconta só a comissão (DEC-035) ou também a tarifa do provedor (RN-10)? **A decisão muda o número na tela;** (2) arredondamento: `round_half_up` por produto (RN-10) está bem no cálculo vivo? (3) quais categorias entram em `pergunta_caimento` e no marcador automático; (4) o PRD do lojista precisa de histórias para A1 a A3 (campo `tabela_medidas`, marcador e motivo), para B1, B2 e C (resumo de caimento).
**Pergunta ao backend:** os cálculos de A1 usam o mesmo serviço do pedido (uma só fórmula); a folha "Como funciona" não deve duplicar a regra no front.
**Documentos a ajustar (feito por mim):** `design-system.md` §3.1d (componentes novos, versão 0.4.0). **Pelo PO:** `prd/lojista.md` (K2, L6), `prd/cliente.md` (D9, X4), `prd/trocas.md` (já em andamento).
**Consistência de copy:** este lote e as DEC escrevem "a Webag"; as ondas 1 a 5 escrevem "o Webag". Proponho "a Webag" (a marca é lida como "a empresa") e uma varredura única de texto na revisão de copy antes do G4.
