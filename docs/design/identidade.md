# Identidade Webag

> Autor: product-designer. Data: 2026-11-18. Base: brief §5; pesquisa em `pesquisa-referencias.md`. Valores em `packages/tokens/tokens.json` (fonte única). Decisões de marca são **[HIPÓTESE]** (brief §1) e estão listadas na §10.

## 1. Essência

| | |
|---|---|
| Posicionamento | O comércio da sua região, na sua porta. Lojas reais, de gente que você pode encontrar, com troca fácil |
| Promessa | Compra rápida, preço sem surpresa, e se não servir, troca (Retira Troca) |
| Personalidade | Vizinho que atende bem: claro, calmo, confiável, sem pressa de empurrar |
| Contraste com a concorrência | Menos grito promocional que iFood, Shopee e Rappi; mais calor local que um marketplace nacional |
| Sentimento pretendido | "Esse app é sério e é daqui" (resposta à desconfiança do público) |

## 2. Marca

**Nome:** Webag. Em texto corrido, sempre "Webag" (inicial maiúscula). Nunca "WebAg", "WEBAG" ou "web bag". O recurso de trocas chama-se **Retira Troca** (iniciais maiúsculas, dois termos).

**Símbolo [HIPÓTESE]:** sacola de compras com um "w" no corpo. Duas ideias (web + bag) numa forma que funciona em 16 px. Arquivos: `docs/design/assets/webag-simbolo.svg` (símbolo em petróleo) e `docs/design/assets/webag-icone-app.svg` (ícone do app, 1024×1024). São rascunhos vetoriais de geometria simples: um designer gráfico pode refinar sem mudar a ideia. A marca não é irreversível até o G5 (publicação).

**Logotipo:** símbolo + "webag" em minúsculas, Figtree Bold (700), sem tracking extra, alinhado pela linha de base do "w" do símbolo. Altura do texto (altura de x) = 40% da altura do símbolo; espaço entre os dois = largura do traço do "w".

| Regra | Valor |
|---|---|
| Tamanho mínimo | Símbolo 16 px; logotipo completo 72 px de largura |
| Área de proteção | 1/2 da altura do símbolo em todos os lados |
| Versões | (a) petróleo `brand.600` sobre claro; (b) branco sobre `brand.600` ou foto com scrim; (c) preto `neutral.900` para impressão monocromática |
| Proibido | Gradiente, sombra, contorno, girar, esticar, trocar a cor, aplicar sobre foto sem scrim, usar o símbolo como ícone de "sacola" da navegação (esse é ícone Phosphor `Handbag`) |

**Ícone do app:** fundo `brand.600` sangrado, sacola branca, "w" em `brand.600`. Conteúdo central ocupa ≤ 45% do lado, dentro da zona segura do ícone adaptativo do Android (círculo ≈ 61% do lado). iOS: 1024×1024 sem transparência e sem cantos arredondados. Nome sob o ícone: "Webag".

**Tela de abertura (splash):** fundo `brand.600`, símbolo branco centralizado, 96 px. Sem animação além de fade de 250 ms. Some assim que a primeira tela estiver pronta (máx. 2 s).

## 3. Cor

**Uma cor de destaque, com disciplina:** verde-azulado profundo ("petróleo"), `brand.600 #00696F`. **[HIPÓTESE]** Razões: (1) os concorrentes ocupam vermelho, amarelo, laranja, coral e azul-royal; (2) tom escuro e frio comunica seriedade para quem desconfia de app novo; (3) é distinto do verde de sucesso (`#1B6E3C`), do azul de informação e do vermelho de erro, então não há conflito semântico; (4) tem contraste alto com branco (6,4:1) sem ficar "gritando". Risco: parecido com o teal do PIX (`#32BCAD`, [M]); a diferença de luminosidade (o nosso é bem mais escuro) evita confusão, e o botão de PIX usa o primário do app mesmo.

### Onde o destaque aparece (lista fechada)

1. Botão primário (1 por tela).
2. Item selecionado ou ativo: aba, chip, opção de rádio, variação escolhida.
3. Links e texto de ação.
4. Anel de foco.
5. Progresso (barra de etapas, linha do tempo concluída, barra de frete grátis).

**Nunca:** fundo de seção grande, ícone decorativo, banner de loja, texto corrido, cabeçalho inteiro colorido. Quando em dúvida, usar neutro.

### Paleta

| Papel | Token | Hex | Uso |
|---|---|---|---|
| Destaque | `brand.600` | #00696F | Botão primário, selecionado, foco |
| Destaque hover / texto | `brand.700` | #005A5F | Hover web, links e texto de ação |
| Destaque pressionado | `brand.800` | #004A4F | Pressionado |
| Destaque suave | `brand.50` / `brand.100` | #E6F3F3 / #CBE6E6 | Fundo de chip selecionado, selo suave |
| Fundo de tela | `neutral.50` | #F7F5F2 | Plano de fundo (neutro quente) |
| Superfície | `neutral.0` | #FFFFFF | Cartão, folha, campo |
| Rebaixado | `neutral.100` | #EFEBE6 | Campo de busca, chip neutro, skeleton claro |
| Divisor | `neutral.200` | #E2DDD6 | Linhas e bordas decorativas |
| Borda de controle | `neutral.500` | #7D766E | Campos, checkbox, ícone inativo (só não-texto) |
| Texto secundário | `neutral.600` | #5E5851 | Descrições, metadados, placeholder |
| Texto principal | `neutral.900` | #1A1816 | Títulos, corpo, preço |
| Sucesso | `feedback.success.base` | #1B6E3C | Entregue, aberta, pago (sempre com ícone e texto) |
| Alerta | `feedback.warning.base` | #7A4E00 | Prazo, estoque baixo |
| Erro | `feedback.danger.base` | #B3261E | Erro, recusado, destrutivo |
| Informação | `feedback.info.base` | #28569E | Avisos neutros |
| Estrela | `rating.star` | #B76E00 | Só a estrela de nota (a nota vai em número também) |

Cores funcionais (sucesso, alerta, erro, info, estrela) **não são destaque**: só aparecem para comunicar estado, nunca para decorar. Cada uma tem versão `subtle` (fundo do selo ou aviso) e `border`.

Sem tema escuro na 1.0 **[HIPÓTESE]**: o brief não pede, e sob sol forte o tema claro lê melhor. A camada semântica (`surface.*`, `text.*`) permite adicionar depois sem tocar nos componentes.

### Contraste comprovado em números

Razão pela fórmula WCAG 2.x (luminância relativa sRGB), calculada pelo designer e **verificável com `pnpm --filter @webag/tokens check`** (pares em `packages/tokens/a11y/contrast-pairs.json`; a CI deve falhar se algum cair abaixo do mínimo). Valores arredondados para baixo em 1 casa. Meta: texto 4,5:1; não-texto 3:1.

| Par (frente sobre fundo) | Razão | Mín. | Resultado |
|---|---|---|---|
| Texto principal `#1A1816` sobre cartão `#FFFFFF` | 17,7:1 | 4,5 | Passa |
| Texto principal sobre fundo de tela `#F7F5F2` | 16,2:1 | 4,5 | Passa |
| Texto principal sobre rebaixado `#EFEBE6` | 14,9:1 | 4,5 | Passa |
| Texto secundário `#5E5851` sobre cartão | 7,0:1 | 4,5 | Passa |
| Texto secundário sobre fundo de tela | 6,4:1 | 4,5 | Passa |
| Texto secundário sobre rebaixado | 5,9:1 | 4,5 | Passa |
| Branco sobre botão primário `#00696F` | 6,4:1 | 4,5 | Passa |
| Branco sobre primário hover `#005A5F` | 7,9:1 | 4,5 | Passa |
| Branco sobre primário pressionado `#004A4F` | 10,0:1 | 4,5 | Passa |
| Texto de marca/link `#005A5F` sobre cartão | 7,9:1 | 4,5 | Passa |
| Texto de marca/link sobre fundo de tela | 7,3:1 | 4,5 | Passa |
| Texto de marca/link sobre rebaixado | 6,7:1 | 4,5 | Passa |
| Texto de marca sobre `brand.50` | 7,0:1 | 4,5 | Passa |
| Branco sobre destrutivo `#B3261E` | 6,5:1 | 4,5 | Passa |
| Erro `#B3261E` sobre cartão / sobre `#FCEAE8` | 6,5:1 / 5,6:1 | 4,5 | Passa |
| Sucesso `#1B6E3C` sobre cartão / sobre `#E5F4EA` | 6,2:1 / 5,5:1 | 4,5 | Passa |
| Alerta `#7A4E00` sobre cartão / sobre `#FFF3D6` | 7,2:1 / 6,5:1 | 4,5 | Passa |
| Info `#28569E` sobre cartão / sobre `#E8F0FB` | 7,2:1 / 6,2:1 | 4,5 | Passa |
| Branco sobre snackbar `#1A1816` / ação `#9FD0D1` sobre snackbar | 17,7:1 / 10,4:1 | 4,5 | Passa |
| Branco sobre foto com scrim 72% (pior caso: foto branca) | 7,0:1 | 4,5 | Passa |
| Foco `#00696F` sobre cartão / sobre fundo de tela (não texto) | 6,4:1 / 5,9:1 | 3 | Passa |
| Borda de campo `#7D766E` sobre cartão / tela / rebaixado (não texto) | 4,4:1 / 4,1:1 / 3,7:1 | 3 | Passa |
| Estrela `#B76E00` sobre cartão / tela (não texto) | 4,0:1 / 3,6:1 | 3 | Passa |

**Proibido como texto** (existem na paleta, mas reprovam): `neutral.500` sobre branco = 4,4:1 (abaixo de 4,5); `neutral.400` sobre branco ≈ 2,5:1 (só desabilitado, que a WCAG isenta); `brand.300` a `brand.500` (decorativos). Placeholder usa `neutral.600`.

## 4. Tipografia

**Família única: Figtree** (OFL-1.1) **[HIPÓTESE]**, geométrica e amigável, sem a "cara de template" do Inter. Plano B: Inter (mesma escala, sem retrabalho). Pendente: teste de renderização de "R$ 1.234,56 ç ã é" e de números tabulares (`pesquisa-referencias.md` §6).

- **App (Expo):** 3 pesos embutidos: Regular 400, SemiBold 600, Bold 700 (`@expo-google-fonts/figtree`). Fallback: fonte do sistema (Roboto / San Francisco) se não carregar em 2 s.
- **Web (Next.js):** `next/font/google` auto-hospedado, mesmos 3 pesos, `display: swap`. Sem requisição ao Google em produção (LGPD e velocidade em 3G).
- Orçamento de peso **[HIPÓTESE]**: ≤ 150 KB de fonte no total por plataforma; medir e reduzir com subset latino se passar.

| Estilo | Tamanho / altura de linha | Peso | Uso |
|---|---|---|---|
| `numeral` | 40 / 48 | Bold, tabular | Contagem do PIX, total do pedido, números de painel |
| `display` | 32 / 40 | Bold | Preço do produto, título de tela de sucesso |
| `title1` | 24 / 32 | Bold | Título de tela |
| `title2` | 20 / 28 | SemiBold | Título de seção, nome da loja |
| `price` | 20 / 28 | Bold, tabular | Preço em card e lista |
| `body` / `bodyStrong` | 16 / 24 | Regular / SemiBold | Texto corrido, campos, itens |
| `label` | 16 / 24 | SemiBold | Botões |
| `caption` / `captionStrong` | 14 / 20 | Regular / SemiBold | Tempo, taxa, distância, ajuda de campo |
| `micro` | 12 / 16 | SemiBold | Só selos curtos ("Aberta", "Frete grátis"). Nunca informação essencial |

Regras: corpo mínimo **16**; informação que decide a compra (tempo, taxa, preço, prazo) mínimo **14**; nada abaixo de 12. Hierarquia por peso e tamanho, não por cor. Máximo de 3 níveis de tamanho por tela. Alinhado à esquerda; sem justificado; sem caixa alta corrida; entrelinha ≥ 1,4 no corpo. Números de dinheiro em tabular quando em coluna. Fonte dinâmica: ver `design-system.md` §7.

## 5. Ícones

**Família única: Phosphor Icons** (MIT) **[HIPÓTESE]**. Escolha: traço consistente, vocabulário de varejo (`Storefront`, `Handbag`, `Package`, `Receipt`, `Tag`, `MapPin`, `Truck`, `ArrowsClockwise` para troca) e peso `Fill` para estado selecionado (padrão HIG de tab bar). Plano B: Lucide.

| Peso | Onde | Tamanho |
|---|---|---|
| Regular | Navegação, botões, listas | 24 (`iconMd`), 20 em linhas de metadado, 32 em ação de destaque |
| Fill | Aba ativa, favorito marcado, estrela de nota | 24 |
| Duotone | Só ilustração de estado vazio/erro, 64 px sobre círculo `neutral.100` | 64 (`iconEmpty`) |

Regras: nunca emoji como ícone; nunca misturar outra família; ícone sozinho precisa de `accessibilityLabel`; ícone que carrega significado vem com texto ao lado (exceto ícones universais: lupa, voltar, fechar). Traço herda a cor do texto ao redor (`currentColor`); só `brand.600` quando ativo. Ícones de categoria (cadastrados pelo admin) saem do mesmo conjunto: o admin escolhe por nome da lista, não faz upload de ícone (garante consistência).

## 6. Fotografia e imagem

Fotografia é o principal construtor de confiança. Estilo: **real, clara, local**.

| Tipo | Estilo | Proporção / tamanho |
|---|---|---|
| Produto | Luz natural ou de estúdio simples, fundo liso claro, produto inteiro, sem filtro nem moldura. Moda: peça em manequim, cabide ou modelo. Mínimo de 3 fotos recomendado | 1:1, 800×800, exibição recortada ao centro |
| Capa da loja | Fachada, balcão ou vitrine reais. Sem banner de arte cheia de texto | 16:9, 1280×720 |
| Logo da loja | Marca da loja em círculo | 1:1, 256×256, exibido em círculo |
| Banner da Home (admin) | Foto de produto ou loja com no máx. 6 palavras. Texto sobre imagem exige scrim 72% (contraste 7,0:1) | 2:1, 1200×600 |
| Foto de troca (cliente) | Defeito ou etiqueta, câmera do aparelho | 4:3, até 1600 px no lado maior |

Tratamento técnico (brief §5: imagens progressivas com cache, 3G): WebP (JPEG de reserva), qualidade ≈ 80, lado máximo 1280, gerar 3 larguras (320, 640, 1280) com `srcset`/`expo-image`; placeholder de baixa resolução (blurhash ou cor dominante) para evitar salto de layout; carregamento progressivo; cache em disco; lazy fora da tela. Recorte e compressão no upload do lojista (brief §3.2). Raio de imagem: `radius.md` (8). Sem sombra em foto.
Dados de demonstração (brief §8): só imagens de licença livre (ex.: Unsplash, Pexels), com a atribuição registrada em `docs/design/creditos-imagens.md` a ser criado pelo `mobile-dev` junto com o seed.
**Imagem sem foto:** nunca deixar vazio; usar placeholder `neutral.100` com o ícone `Image` (regular, `neutral.500`) e, em produto sem foto, o texto "Sem foto".

## 7. Forma e composição

| Elemento | Regra |
|---|---|
| Grade | 8 pt, com meio-passo de 4 (`space.1`). Margem lateral 16 |
| Raios [HIPÓTESE] | Controles e imagens 8; selos/etiquetas 4 (motivo "etiqueta de preço"); folhas (bottom sheet) 24 no topo; chips e avatares totalmente redondos. Retos o bastante para parecer varejo sério, não brinquedo |
| Elevação | Cartões não têm sombra: fio de 1 px `neutral.200` sobre fundo `neutral.50`. Sombra só em: barra fixa (`sm`), folha e menu (`md`), diálogo (`lg`). Máx. 14% de opacidade |
| Respiro | Entre seções 24 a 32; dentro de bloco 8 a 16. Uma ação principal por tela |
| Motivo gráfico | Selo em formato de etiqueta (retângulo, raio 4) para "Aberta", "Frete grátis", "Aceita troca" |
| Movimento | 150 ms (toque), 250 ms (transição), 400 ms (folha grande). Curva `standard (0.2, 0, 0, 1)`. Respeita "reduzir movimento" |
| Haptics | Seleção (chip, aba, stepper), leve (adicionar à sacola), sucesso (pagamento confirmado, loja aprovada), erro (envio inválido). Nunca em rolagem |

## 8. Tom de voz e microcopy

**Voz:** vizinho prestativo. Direto, caloroso, sem gíria forçada, sem diminutivo. Fala "você". Frase curta (até 12 palavras). Verbo no botão. Número antes de adjetivo. Nenhum ponto de exclamação, exceto uma vez na confirmação de pedido.

**Proibido:** "Ops!", "Oops", "Algo deu errado" sozinho, "Erro 500", "Falha", "Inválido", "Por favor" em excesso, "Continuar" quando existe verbo melhor, jargão ("token", "payload", "timeout"), culpar o usuário ("você digitou errado"), urgência falsa.

**Formatos:** moeda `R$ 1.234,56`; tempo `30 a 45 min`; distância `1,2 km`; data `18 nov` e `18 nov, 14:30`; telefone `(11) 91234-5678`; CEP `07900-000`; "R$ 0,00" de frete vira "Grátis".

| Situação | Texto |
|---|---|
| Pedir localização | "Onde você quer receber?" / botão "Usar minha localização" / link "Digitar o CEP" |
| Permissão de localização negada | "Sem a localização, digite o CEP." Botão "Digitar o CEP". Link secundário "Abrir ajustes" |
| Fora da área | "Ainda não entregamos em Vila Nova. Quer ser avisado quando chegarmos?" Botão "Avisar quando chegar" |
| Busca sem resultado | "Nada para "tênis azul" por aqui. Tente outra palavra ou veja as lojas perto de você." Botão "Ver lojas" |
| Loja fechada | "Fechada agora. Abre amanhã às 9h." Botão "Ver produtos" (não compra) |
| Produto esgotado | "Esgotado nesse tamanho." Botão "Ver outros tamanhos" |
| Adicionar | Botão "Adicionar · R$ 89,90". Se faltar variação: "Escolha o tamanho" (aviso no grupo) |
| Trocar de loja | Título "Esvaziar a sacola?" Texto "Sua sacola tem itens da Casa Bela. Cada pedido é de uma loja só." Botões "Esvaziar e continuar" / "Manter minha sacola" |
| Pedido mínimo | "Faltam R$ 12,00 para o pedido mínimo da loja." |
| Cupom inválido | "Esse cupom venceu em 10 nov." / "Esse cupom vale a partir de R$ 80,00." |
| Pagamento PIX | Botão "Pagar com PIX · R$ 89,90". Tela: "Copie o código e pague no app do seu banco." Botão "Copiar código". Contador "Vence em 09:42" |
| PIX copiado | "Código copiado. Abra o app do seu banco e cole." |
| PIX vencido | "O código venceu. Gere outro para pagar." Botão "Gerar novo código" |
| Pagamento aprovado | "Pagamento confirmado. A loja já recebeu seu pedido!" Botão "Acompanhar pedido" |
| Cartão recusado | "O banco não aprovou esse cartão. Tente outro cartão ou pague com PIX." Botões "Trocar cartão" / "Pagar com PIX" |
| Senha fraca | "Senha fraca. Use 8 caracteres ou mais, com letras e números." |
| Senhas diferentes / iguais | "As senhas não são iguais." / "As senhas são iguais." |
| E-mail já existe | "Já existe uma conta com esse e-mail." Botão "Entrar" |
| Código errado | "Código incorreto. Confira o código que enviamos para o seu e-mail." Link "Reenviar código" |
| Sem conexão | "Sem conexão. Mostrando o que já carregou." Botão "Tentar de novo" |
| Erro de servidor | "Não conseguimos carregar agora. Seus dados estão salvos." Botão "Tentar de novo" |
| Sucesso (toast) | "Adicionado à sacola." / "Endereço salvo." |
| Pedido recusado pela loja | "A loja não pôde atender seu pedido: sem estoque. O valor volta para você em até 2 dias úteis." (prazo [HIPÓTESE], definir com Financeiro) |
| Troca: prazo | "Você tem até 25 nov para pedir a troca." |
| Troca: fora do prazo | "O prazo de troca dessa loja acabou em 12 nov. Fale com a loja se precisar." Botão "Falar no WhatsApp" |
| Troca: enviada | "Pedido de troca enviado. A loja responde em até 2 dias." (prazo configurável) |
| Troca: recusada | "A loja não aceitou a troca: item usado. Você pode pedir ajuda ao Webag." Botão "Pedir ajuda" |
| Excluir conta | Título "Excluir sua conta?" Texto "Apagamos seus dados e pedidos antigos. Isso não pode ser desfeito." Botões "Excluir conta" (destrutivo) / "Cancelar" |
| Lojista: pedido novo | "Pedido novo · R$ 89,90 · 3 itens" botões "Aceitar" / "Recusar" |
| Lojista: loja em análise | "Recebemos seu cadastro. Respondemos em até 2 dias úteis." (prazo [HIPÓTESE], configurável) |
| Admin: recusar loja | Campo obrigatório "Motivo (o lojista vai ler)". Botão "Recusar loja" |

**Botão = verbo no infinitivo + objeto:** "Pagar com PIX", "Adicionar à sacola", "Pedir troca", "Enviar fotos", "Aprovar loja". Evitar "OK", "Continuar", "Enviar" sozinho, "Confirmar" sem objeto. Confirmação destrutiva repete a ação no botão.

## 9. Ativos de loja (com o PO)

Ícone: `assets/webag-icone-app.svg`. Capturas: 5 telas (Início, Loja, Produto, PIX, Acompanhamento) de Android de 6,5" e iPhone de 6,7", com título de 6 palavras no topo de cada ("Lojas perto de você", "Compre em 2 minutos", "Pague com PIX", "Acompanhe em tempo real", "Troque sem complicação"). Texto da vitrine em tom de voz acima; sem prometer tempo de entrega nem desconto que a plataforma não controla. Gerado a partir das capturas reais em `docs/telas/` (brief §7), não de mockup.

## 10. Hipóteses de design a validar (registradas em `docs/decisoes.md`)

| ID | Hipótese | Como validar |
|---|---|---|
| HIP-D01 | Destaque petróleo `#00696F` | Teste de 5 segundos com 5 moradores: "o app parece confiável?" |
| HIP-D02 | Figtree (plano B Inter) | Teste de renderização e peso em Android de entrada |
| HIP-D03 | Phosphor (plano B Lucide) | Verificar a porta React Native e o peso do bundle |
| HIP-D04 | Símbolo sacola + "w" | Teste de reconhecimento a 16 px; contratar refino gráfico antes do G5 se o fundador quiser |
| HIP-D05 | Texto da interface usa "Sacola" (como iFood [M]) em vez de "Carrinho", reforça o nome Webag | Teste de compreensão; trocar é só texto |
| HIP-D06 | ~~Cadastro sem campo "confirmar senha"~~ **Rejeitada por DEC-012**: o campo fica, com um único olho para as duas senhas. Custo no orçamento: ≈ +7 s (`fluxos.md` §2) | Encerrada |
| HIP-D07 | Confirmação de e-mail por código não bloqueia a compra (confirma depois do pedido) | Parecer do Security; custo em `fluxos.md` §2 |
| HIP-D08 | Orçamento de tempo da compra (modelo de toques e segundos) | Teste de usabilidade cronometrado (brief §7) |
| HIP-D09 | Taxa de coleta da troca cobrada após a aprovação da loja (diverge de HIP-018) | Decisão do PO |
| HIP-D10 | CPF só pedido no checkout, e só se o Mercado Pago exigir; mapa **só como exceção** (geocodificação falhou, WB-002 C3 e ADR-008) e no endereço da loja, nunca no caminho normal | Backend confirma com a API do MP |

Tema escuro fica fora da 1.0 (registrado em HIP-D01).
