# Tela: Cadastro rápido de produto (celular)   (WB-370 a WB-375, WB-378, WB-379)

> Autor: product-designer. Data: 2026-11-22. Status: proposta para G2. Release R1 (WB-373 e WB-378: R2 e R5, mesma tela).
> Protótipo: `docs/prototipo/v1-1-lojista-e-admin.html#/l/produtos` (botão "Novo produto"; cronômetro na barra do protótipo). Em celular real, "Tirar foto" abre a câmera do aparelho. Barra do protótipo, em Estado: "Sem rede" (botão inerte), "Foto demora" (`UPLOAD_NOT_READY`; "Simular que passaram 30 s") e "Resposta perdida" (1º toque sem confirmação, 2º publica como sucesso).
> Base: `prd/v1-1-cadastro-rapido.md`, `direcao-v3.md`, `design-system.md` §3.1b (VariationGrid, EarningsHint, PhotoPicker). Telas relacionadas: `v1-1-importar-colar.md`, `v1-1-edicao-em-massa.md`.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Uma tela só, sem assistente.** Foto, depois formulário de 3 campos, depois Publicar. Grade, detalhes, código de barras e IA abrem **no mesmo lugar** (acordeão), nunca em outra página | Cada tela extra custa ~5 s e perde contexto. É o único jeito de caber em 60 s |
| 2 | **O rascunho nasce ao tocar em "Novo produto", antes da câmera** | No Android de entrada a câmera é outro app; o navegador pode descarregar a aba e recarregar ao voltar (risco conhecido `[HIPÓTESE: validar em aparelho, T1]`). Sem rascunho prévio, o lojista perde o que fez |
| 3 | Foto por `<input type=file capture>` (câmera nativa); código de barras por leitor **ao vivo na página** | A câmera nativa tem flash, foco e qualidade; `getUserMedia` só vale para o leitor. iOS Safari mostra um menu ("Tirar foto / Fototeca"): +1 toque, inevitável |
| 4 | **Publicar nunca fica desabilitado** (RN-17): erro aparece no campo e a tela rola até o primeiro | Botão morto sem motivo é o erro nº 1 de formulário |
| 5 | **Descrição opcional: aceito**, com 3 condições: lembrete "X produtos sem descrição" na lista (não bloqueia); campo "Mais detalhes" sugere material e medidas em moda; **medir conversão e reverter se cair** (PRD) | Responde à pergunta do PRD. Risco: CDC art. 31 (informação adequada). Quem decide é o PO/jurídico, não eu |
| 6 | Depois de publicar, **"Cadastrar outro" (primário) e "Duplicar este" (secundário) lado a lado** | Quem tem 15 camisetas quer repetir; quem tem produtos diferentes quer a câmera de novo. Os dois em 1 toque |
| 7 | **Cor com foto própria = Duplicar**, não grade | Em moda o cliente quer ver a cor. A grade cobre tamanho (e cor quando a foto é genérica). Ver pergunta 1 ao PO |
| 8 | IA: **sugestão por campo**, com "Usar" e "Ignorar"; nunca preenche sozinha; sem preço; só aparece com a flag ligada | RN-Q10, CDC art. 37 |

## 1. Meta de 60 s: contagem de toques (plausível, sem folga)

Caminho feliz, produto simples com 15 unidades (camiseta). Tempos `[HIPÓTESE]`, a validar no teste do PO (WB-379).

| Passo | Toques | Digitação | Tempo |
|---|---|---|---|
| "Novo produto" | 1 | 0 | 1 s |
| Câmera nativa: disparar, confirmar | 2 (iOS: 3) | 0 | 6 a 10 s |
| Nome (foco automático após a foto) | 0 | ~22 caracteres | 8 a 12 s |
| Preço (tecla "Próximo" leva ao campo; máscara de centavos: digita `4990`) | 1 | 4 dígitos | 4 a 6 s |
| Quantidade (padrão 1; digita `15`) | 1 | 2 dígitos | 3 a 4 s |
| Categoria: já vem a última usada; só conferir | 0 | 0 | 1 a 2 s |
| "Publicar" (foto sobe em segundo plano) | 1 | 0 | 1 a 2 s |
| **Total** | **6 a 7** | **~28** | **25 a 38 s** (45 a 60 s com 1 correção e câmera lenta) |

| Variação | Toques extras | Tempo total `[HIPÓTESE]` | Meta do PRD |
|---|---|---|---|
| 3 tamanhos, 1 cor (abrir grade, P M G, "Preencher todos com 3") | +6 | 70 a 85 s | <= 120 s |
| 3 tamanhos x 2 cores | +9 | 90 a 105 s | <= 120 s |
| Duplicar para outra cor (câmera, trocar nome, publicar) | 1 + 3 | 25 a 35 s | n/d |
| 20 produtos | n/d | ~1 min cada = 20 min | <= 20 min |

**O que estoura a meta:** iOS (+1 toque), trocar categoria (+3 toques, +6 s), câmera lenta, nome longo, erro de preço. **O que protege:** upload em segundo plano (nunca espera), foco automático, "Próximo" no teclado, categoria e quantidade com padrão, nenhuma tela de confirmação. Se a mediana da 3ª tentativa passar de 120 s, vale o critério de morte do PRD.

## 2. Layout (de cima para baixo, 390 px)

Tela de tarefa: sem barra inferior; cabeçalho roxo com título "Novo produto" (Bricolage 36), voltar em pastilha noite.

| # | Componente | Conteúdo real de exemplo |
|---|---|---|
| 1 | Faixa de estado | "Salvo no aparelho · 14:32" (check + texto); "Sem internet" quando offline |
| 2 | Foto (PhotoPicker) | Capa 4:3 com selo "Capa"; miniaturas 64x72; "+" e "Galeria"; "3 de 8 fotos". Primeira vez: dica "Deixe o produto ocupando 80% do quadro. Use luz do dia." |
| 3 | Sugestão automática (só com flag) | Botão "Sugerir pela foto" |
| 4 | Nome do produto | Campo 52 px, foco automático, `enterkeyhint=next`, contador a partir de 60 ("63 de 80") |
| 5 | Preço | Prefixo R$, máscara de centavos, `inputmode=decimal`; abaixo **EarningsHint** (caixa noite): "Você recebe cerca de **R$ 41,92**" (DEC-035) |
| 6 | Quantidade em estoque | Stepper 48 px com campo numérico, padrão 1. Com grade, vira "18 unidades no total" (soma, só leitura) |
| 7 | Categoria | Linha: "Categoria · a última que você usou / **Camisetas**" + "Trocar" (BottomSheet com lista e busca) |
| 8 | "Tem tamanhos ou cores?" | Linha com seta; abre a grade no lugar (§4) |
| 9 | "Mais detalhes (opcional)" | Descrição, código de barras com "Ler" |
| 10 | Rodapé fixo | "Publicar" (lg, largura total) + "Guardar rascunho" (texto) |

Mínimo para publicar (RN-Q1): nome, preço, 1 foto, quantidade (ou grade com estoque), categoria (sugerida).

## 3. Interações e navegação

| Ação | O que acontece |
|---|---|
| "Novo produto" (lista de Produtos) | Cria rascunho local, abre a câmera. Voltar da câmera sem foto: formulário com bloco "Falta a foto" |
| Foto tirada | Volta ao formulário, capa preenchida, **foco no Nome**, leitor de tela anuncia "Foto adicionada. 1 de 8." Compressão e envio em segundo plano (RN-Q3) |
| Teclado "Próximo" | Nome, Preço, Quantidade; "Pronto" no último |
| "Publicar" com erro | Erro no campo (ícone + texto), rola e foca o primeiro. Nada digitado se perde |
| "Publicar" com foto enviando | Tela "Enviando a foto… 60%" com barras da marca; "Publica sozinho ao terminar. Você não perde o que digitou." Botões: "Cadastrar outro enquanto isso" e "Voltar ao cadastro" |
| "Publicar" ok | Tela "Publicado": miniatura, nome, preço, "Já aparece na sua loja. Se a loja estiver fechada, aparece quando abrir." Botões "Cadastrar outro", "Duplicar este", link "Ver meus produtos" |
| "Duplicar" (lista ou pós-publicação) | Rascunho com nome "<nome> (cópia)", categoria, preço, variações; **sem** fotos, EAN, SKU, promoção (RN-Q4); câmera para a nova foto. Toast "Cópia criada sem fotos. Tire a foto desta versão." |
| "Guardar rascunho" ou fechar | Toast "Rascunho guardado. Continue quando quiser." Volta a Produtos > Rascunhos |
| Categoria proibida | Recusa com o texto padrão do WB-060 C6 (PO fornece; não invento) |

**Rascunho (WB-371).** Topo de Produtos: cartão noite "Continuar: Camiseta básica preta · Falta o preço · salvo há 2 h". Aba "Rascunhos (n)" separada dos ativos; cada linha mostra o que falta ("Falta a foto", "Falta o preço") e, aos 27 dias, "Será apagado em 3 dias". Limite 100 (DEC-118): "Limite de 100 rascunhos. Publique ou apague algum para criar outro." Conflito entre 2 aparelhos: diálogo "Este rascunho foi alterado em outro aparelho às 14:10. Qual versão manter?" com "Manter a deste aparelho" e "Usar a do outro aparelho" (mostra nome e preço de cada uma). Rascunho nunca aparece ao cliente.

## 4. Grade tamanho x cor (WB-374, WB-375)

| Parte | Regra |
|---|---|
| Chips de tamanho | Vêm do **modelo da categoria** (Calçados: 34 a 44; Camisetas: P, M, G, GG). Nenhum vem marcado: o lojista toca nos que tem (evita estoque falso). Quadrado de 44 px, marcado = noite + check |
| Chips de cor | Amostra + **nome escrito**. "Outra cor" abre campo de texto |
| Tabela | **Cartão de linha**, não tabela (celular): "M · Preto" + stepper de estoque; "Outro preço" abre campo com "Você recebe cerca de R$ X nesta opção" (C5) |
| "Preencher todos com [3] Aplicar" | Preenche todas as células (C2) |
| Totais | "6 combinações · 18 unidades" (região viva) |
| Limite | `variacoes_max` (30 no protótipo `[HIPÓTESE]`): "Máximo de 30 combinações. Tire alguma opção." |
| Duplicado | "Essa combinação já existe" |
| Remover combinação com reserva (edição) | "3 unidades reservadas em pedidos. Não dá para remover agora." |
| Ajuda | "Cada cor com foto própria? Publique e use Duplicar." |

Modelos (RN-Q6): categoria com "tabela de medidas" (moda e calçado) mostra o aviso "A tabela de medidas ajuda o cliente a acertar o tamanho. Adicione depois."; categoria íntimos/higiene sugere "Não aceita troca por tamanho ou cor". Sempre sugestão, nada obrigatório (C4).

## 5. Código de barras (WB-373, R2)

BottomSheet em tela cheia: viewfinder com moldura lima, texto "Aponte para o código. Com pouca luz, use a lanterna do aparelho.", campo "Ou digite o código" e "Usar". Moda e calçado: o botão "Ler" fica **secundário** (cinza) em "Mais detalhes" (C8); cosméticos, pet e papelaria: botão contornado.

| Resultado | Tela |
|---|---|
| Na própria loja | "Você já tem este produto" + nome e estoque; "Abrir" e "Aumentar estoque" (C4) |
| No catálogo de referência | "Encontramos este código": nome, marca, categoria; "Dados de outros cadastros do Webag, sem foto. Confira antes de usar." "Usar estes dados" / "Não usar" (C5) |
| Desconhecido | "Código guardado. Não achamos este produto. Siga o cadastro normal: o código fica salvo nele." (C6) |
| Dígito verificador errado | "Código inválido: confira os números." (C3) |
| Sem leitor (Safari) ou câmera negada | "Este navegador não lê o código ao vivo aqui. Digite o código abaixo." / "Sem acesso à câmera. Digite o código ou escolha uma foto da galeria. Para liberar: Ajustes do navegador, Permissões, Câmera." (C2) |

## 6. IA de visão (WB-378, R5; interface e provedor `fake` entram em R1/R2 atrás de flag)

Botão "Sugerir pela foto" abaixo da foto (secundário). Carregando: "Analisando a foto…" (limite 8 s). Resultado: cartão com **borda tracejada roxa** e selo "Sugestão automática: revise"; uma linha por campo (Nome, Categoria, Cor, Descrição curta) com **"Usar"** e **"Ignorar"**; rodapé "Nada muda sem o seu toque em 'Usar'. A sugestão não inclui preço." Nada é preenchido antes do toque (C2, C3).

| Estado | Texto |
|---|---|
| Falha ou > 8 s | "Não deu para sugerir agora. Siga o cadastro normal." (cadastro segue, nada trava; C7) |
| Limite diário | "Limite diário atingido. Siga o cadastro normal." (C5) |
| Flag desligada | O botão não existe (C8) |
| Provedor real, 1º uso | BottomSheet "Enviar a foto para gerar a sugestão?": "A foto será enviada para <provedor>. Ela pode mostrar pessoas ou lugares ao fundo. Você pode continuar sem a sugestão." Botões "Concordo e enviar" / "Agora não". Consentimento registrado (C4). Texto jurídico final: Security |

## 7. Estados

| Estado | Comportamento |
|---|---|
| Carregando | Formulário usável de imediato; categoria e modelo em skeleton até chegarem; foto mostra "Preparando a foto…" enquanto comprime; envio com barra "Enviando a foto… 60%" (anunciado a 25/50/75/100) |
| Vazio (Produtos sem nenhum item) | Sacola da marca, "Sua vitrine está vazia", "Tire a foto de um produto para começar. Leva cerca de 1 minuto.", botão "Novo produto" + link "Colar lista do WhatsApp" |
| Erro ao publicar (servidor) | Aviso no topo "Não conseguimos publicar agora. Seu produto está guardado. Tente de novo." + botão "Tentar de novo" |
| Sem rede (DEC-126: **sem fila offline**) | Faixa "Sem internet. O que você digitou fica neste aparelho; publique quando voltar." "Publicar" e "Novo produto" ficam **inertes (`aria-disabled`, sem mudar de cor para "morto")**: ao tocar, mensagem "Sem internet. Conecte para publicar." (`role=alert`), nada é enviado e nada se perde. Sem selo "Na fila" e sem envio automático: ao voltar a rede, o lojista toca em "Publicar" e publica uma vez só. A **cópia local do formulário protege só contra recarga** da aba (volta da câmera), não é fila. Foto em envio pausa com "Sem internet. Conecte para enviar a foto." |
| Publicando (WB-370 C3, C14) | Toque em "Publicar" com tudo válido: o botão vira "Publicando…" (`aria-busy`, `aria-disabled`, mesma largura; segundo toque é ignorado), anúncio "Publicando…". É **uma chamada só, tudo ou nada**: se qualquer regra falhar, nada é gravado e o formulário fica como estava |
| Foto ainda enviando (`UPLOAD_NOT_READY`, C6) | O servidor ainda não terminou a foto. **Sem erro:** tela "Foto ainda enviando…" + "Falta pouco. Publicamos sozinho quando terminar. Você não perde o que digitou." O app repete com a mesma chave por até 30 s. Passou de 30 s: aviso "A foto está demorando. Tente publicar de novo." + botão "Publicar de novo"; nada se perde |
| Resposta perdida (C15) | 1º toque sem resposta (rede caiu): "Não recebemos a confirmação. Toque em Publicar de novo: não vai duplicar." O 2º toque recebe conflito (409): o app consulta o produto e, se está ATIVO com os dados digitados, mostra **"Publicado" como sucesso, sem erro e sem citar conflito**. Se está ATIVO com outros dados: "Este produto já está publicado" (C16) com "Ver produto" `[proposta; PO valida]` |
| Grade preenchida (C16) | "Publicar" segue o caminho da grade; o lojista não vê nenhuma diferença nem erro técnico |
| Regra recusada (C17) | Erro no campo certo (nome, preço, descrição, categoria) com o texto do campo; o produto continua rascunho |
| Sucesso | Tela "Publicado" (§3). Pausa de moderação: "Enviado para análise. Aparece na vitrine depois da aprovação." (se WB-107 se aplicar; PO confirma) |
| Permissão negada (câmera) | "Sem acesso à câmera. Escolha uma foto da galeria." + "Como liberar" (passo a passo) |
| Sem permissão de catálogo (funcionário) | "Você não tem acesso a Produtos. Peça ao dono da loja para liberar o catálogo para você." |

### Mensagens de validação (final, pt-BR)

| Campo | Mensagem |
|---|---|
| Nome vazio | "Escreva o nome do produto." |
| Nome > 80 | "Use até 80 caracteres." |
| Preço vazio ou 0 | "Informe o preço, ex.: 49,90." |
| Preço > máximo | "O preço máximo é R$ 99.999,99." |
| Foto | "Falta a foto. Tire uma foto do produto." |
| Quantidade | "Use um número de 0 a 99.999." |
| Rascunho sem foto ao publicar | "Falta a foto. Nada foi perdido." |
| Código EAN | ver §5 |

## 8. Movimento

| Gatilho | Propósito | Propriedade | Duração | Easing | Movimento reduzido | Háptico |
|---|---|---|---|---|---|---|
| Toque em botão/chip/linha | Feedback | scale 0,97 | `motion.fast` 150 | ease-out | só cor de fundo | `selection` em chip e tamanho |
| Miniatura entra | Mostrar a foto nova | opacity + translateY 8 | 150 | ease-out | só opacity | `impactLight` |
| Barras de envio | Estado do upload | transform (scaleX) | linear contínuo | linear | texto "60%" sem animação | não |
| Selo "Publicado" | Confirmar o fato (único momento de destaque) | scale 0,95 a 1 | `motion.base` 250 | spring leve | troca direta | `notificationSuccess` |
| Abrir grade/detalhes | Continuidade | opacity + altura por transform | 200 | ease-out | abre sem animar | não |

Nada em loop; nada animado no campo de preço nem no "Você recebe".

## 9. Acessibilidade

Ordem de leitura = visual: título, estado, foto, nome, preço, recebe, quantidade, categoria, grade, detalhes, Publicar. Foto: botão com rótulo "Adicionar foto" e miniatura com "Foto 2 de 8, remover". Erros com `role=alert` e `aria-describedby`; foco no primeiro erro. "Você recebe" com `role=status`. Alvos 48 px (chips 44 px com 8 de espaço). Texto >= 16 px no celular (rótulos e ajuda inclusive). Rodapé deixa de ser fixo com o teclado aberto, para não cobrir o campo (WCAG 2.4.11). Fonte do sistema a 200%: grade e rodapé empilham, sem truncar valor. Lima nunca carrega texto sobre branco. Estado nunca só por cor ("Falta o preço" tem ícone e texto). Arrastar não existe (reordenar fotos: "Mover para a frente").

## 10. Android x iOS

| Tema | Android (Chrome) | iOS (Safari) |
|---|---|---|
| Câmera | Abre a câmera direto | Menu "Tirar foto / Fototeca": +1 toque |
| Leitor de código | `BarcodeDetector` quando existe; senão biblioteca WebAssembly | Biblioteca WebAssembly ou digitar (decisão do mobile-dev, pergunta 5) |
| Teclado | `inputmode` numérico/decimal | idem; fonte >= 16 px evita zoom automático |
| Aba descarregada ao voltar da câmera | Mais provável em 2 a 3 GB | Possível; mesmo rascunho prévio resolve |
| Área segura | n/a | `env(safe-area-inset-bottom)` no rodapé |

## 11. Eventos de analytics (servidor, sem texto do produto)

Do PRD: `product_create_started`, `photo_captured`, `product_create_published` (via, duration_s, photos_count, variations_count), `product_duplicated`, `barcode_scanned`, `ai_suggestion_requested`. **Proponho acrescentar (PO valida):** `draft_resumed`, `publish_blocked` (reason_code: name, price, photo, qty), `grade_opened`, `category_changed` (mede o custo do passo 7), `draft_expired`.

## 12. Mapa WB para a tela

| História | Onde na tela | História | Onde |
|---|---|---|---|
| WB-370 C1 a C10 | §2, §3, §7 (câmera, foco no nome, Publicar, categoria, erro no campo, envio 60%, câmera negada, sem rede, proibida, "Você recebe") | WB-374 C1 a C6 | §4 |
| WB-371 C1 a C6 | §3 (Rascunho) | WB-375 C1 a C5 | §4 (modelos) |
| WB-372 C1 a C5 | §3 (Duplicar); C2 (duplicar variação): botão "Duplicar" na linha da grade `[a implementar: não está no protótipo]` | WB-378 C1 a C9 | §6 |
| WB-373 C1 a C8 | §5 | WB-379 C1 a C4 | §11 e cronômetro do protótipo |

## 13. Revisão heurística (protótipo, 2026-11-22)

**Nota 4 de 5.** Não testado com usuário; o cronômetro do protótipo serve ao teste do PO.

| ID | Heurística | Sev. | Achado | Correção | Dono |
|---|---|---|---|---|---|
| CR-1 | H5 | 3 | Máscara de centavos: digitar `499` vira R$ 4,99; quem pensa em reais erra por 100x | O valor aparece grande no campo e o "Você recebe" muda na hora; testar se confunde. Alternativa: aviso suave só se o preço for 5x a mediana da loja na categoria `[HIPÓTESE]` | designer, PO |
| CR-2 | H3 | 2 | Fechar com "X" guarda rascunho sem perguntar; pode parecer descarte | Toast explícito + "Desfazer"; já no texto | designer |
| CR-3 | H7 | 2 | Autocompletar nome com nomes antigos da loja ("Camiseta básica ") poderia cortar 5 s | Could; medir primeiro | PO |
| CR-4 | H1 | 3 | Upload em 3G pode passar de 10 s; "Publicar" parece travado | Tela "Enviando a foto… 60%" + permitir sair; botão "Cadastrar outro enquanto isso" | designer (feito) |
| CR-5 | H8 | 2 | "Mais detalhes" esconde a descrição; produto sem descrição pode converter menos | Lembrete na lista; medir (PRD) | PO |

**Top 3:** (1) rascunho antes da câmera; (2) máscara de preço; (3) iOS com +1 toque. **Está bom, não desfazer:** foco automático no nome, "Você recebe" visível, Publicar sempre ativo, upload em segundo plano. **Teste com 3 a 5 pessoas:** a máscara de preço e a descoberta de "Duplicar".

## 14. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Foto por cor dentro de um produto com grade (moda): entra na v1.1 ou "Duplicar" basta? 2. Descrição opcional vale também para categorias de risco (cosméticos, eletrônicos)? 3. Texto padrão de "categoria proibida" (WB-060 C6) 4. Valor de `variacoes_max` 5. Moderação deixa o produto "em análise" ou ativo? 6. Sem rede, "Guardar rascunho" também fica inerte ("Sem internet. Conecte para guardar.")? Assumi que sim, por coerência com DEC-126 (C8 só cita "Publicar" e "Novo produto"). 7. Texto da resposta perdida no 1º toque e do 409 com dados diferentes (C15 só cobre dados iguais): proponho os do §7 |
| mobile-dev / tech-lead | 5. Leitor no Safari: biblioteca e licença; 6. Rascunho local: IndexedDB, limite e limpeza; 7. A aba recarrega ao voltar da câmera nos 3 aparelhos do T1? |
| Security | 8. Rascunho no aparelho guarda nome e preço sem login por quanto tempo? Limpar ao sair da conta? 9. Texto do consentimento da IA e do aviso de EXIF removido |
| backend-dev | 10. Compressão e remoção de EXIF no cliente ou no servidor |
