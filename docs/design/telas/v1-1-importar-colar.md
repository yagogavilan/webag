# Tela: Adicionar vários produtos (colar lista do WhatsApp e planilha)   (WB-376; usa WB-370, WB-371, WB-065)

> Autor: product-designer. Data: 2026-11-22. Release R1. Protótipo: `#/l/colar` (já abre com 6 linhas de exemplo, uma sem preço).
> Entrada: Produtos > "Mais" > "Adicionar vários produtos", e link "Colar lista do WhatsApp" no estado vazio de Produtos.

## 0. Achado que muda o fluxo (o PO precisa ver)

Pelo PRD, **todo produto publicado exige 1 foto** (RN-Q1) e o texto do WhatsApp **não traz foto**. Logo, "Publicar os válidos" (WB-376 C4) publicaria **zero** itens logo após a colagem. Se o fluxo parasse aí, o lojista veria 6 rascunhos "Falta a foto" e abandonaria. **Proposta:** depois de "Criar rascunhos", uma etapa **"Tirar as fotos"**: lista dos itens, botão "Foto" em cada linha (câmera abre direto), progresso "2 de 6 com foto" e o botão "Publicar os válidos (n)" sobe a cada foto. Custo estimado: ~10 s por foto `[HIPÓTESE]`, ou seja, 6 produtos em cerca de 1 min 30 s depois da colagem. Sem foto continua rascunho, como manda o PRD.

## 1. Fluxo em 3 etapas

| Etapa | Objetivo do lojista | Ação principal |
|---|---|---|
| 1 Colar | Entregar a lista | "Ler a lista" |
| 2 Revisar | Corrigir o que o sistema leu errado | "Criar N rascunhos" |
| 3 Fotos | Fazer cada item ter foto | "Publicar os válidos (n)" |

Abas na etapa 1: **Colar texto** (padrão, é o que o lojista usa no celular) e **Planilha**.

## 2. Etapa 1: colar

| Componente | Conteúdo |
|---|---|
| Campo grande (8 linhas) | Rótulo "Cole sua lista, uma linha por produto"; exemplo fantasma "Bermuda jeans M 79,90 4 un"; contador "6 linhas · até 100 por vez. Pode colar direto do WhatsApp." |
| "Colar do WhatsApp" | Lê a área de transferência com 1 toque (permissão do navegador); se negado: "Toque no campo e cole pelo menu do teclado." |
| "Ler a lista" | Primário. Ativo mesmo vazio (mostra o erro) |
| Linha de confiança | "O texto fica só no Webag. Nada vai para serviços de fora." (C7) |

Erros: vazio, "Cole a lista primeiro. Cada linha precisa de nome e preço, ex.: Bermuda jeans 79,90."; nada reconhecido, "Não encontramos produtos neste texto. Cada linha precisa de nome e preço, ex.: Bermuda jeans 79,90."; 101 linhas, aviso "Cole até 100 linhas por vez. Você colou 101." com "Usar as 100 primeiras" (C3).

**O que o leitor entende (regras fixas, RN-Q8, sem IA):**

| Linha colada | Nome | Tam. | Preço | Qtd |
|---|---|---|---|---|
| `Bermuda jeans M 79,90 4 un` | Bermuda jeans | M | R$ 79,90 | 4 |
| `Camiseta básica preta P 49.90 x3` | Camiseta básica preta | P | R$ 49,90 | 3 |
| `Vestido floral midi R$ 129,90 - 4 peças` | Vestido floral midi | n/d | R$ 129,90 | 4 |
| `Almofada xadrez 45 cm 35,00 6 un` | Almofada xadrez 45 cm | n/d | R$ 35,00 | 6 |
| `Toalha de banho cinza 4 un` | Toalha de banho cinza | n/d | **Falta o preço** | 4 |

Quantidade ausente vira 1. Tamanho numérico (calçado) **não** é lido da linha por padrão (confunde com medida: "45 cm"); vale só se a categoria for calçado `[a definir com o PO]`.

## 3. Etapa 2: revisar

Topo: **"6 linhas lidas: 5 prontas, 1 com problema"** (região viva, atualiza ao corrigir). Celular: **um cartão por linha** (não tabela): "Linha 3" + selo de situação; campos Nome, Tamanho, Quantidade, Preço em grade 2x2, todos editáveis, 48 px. Desktop (>= 1024): tabela com a mesma ordem e edição em linha.

| Selo | Quando | Ícone |
|---|---|---|
| Pronta | nome e preço válidos e foto | check |
| Falta a foto | nome e preço ok | câmera |
| Falta o preço / Falta o nome | campo vazio ou inválido | alerta (campo com borda de erro e `aria-invalid`) |

Mensagens de campo: "Preço inválido: use 79,90." · "Quantidade inválida: use um número de 0 a 99.999." · "Use até 80 caracteres."

**Sugestão de juntar (proposta, PO decide):** linhas com o mesmo nome e preço e tamanhos diferentes. Aviso azul: "As linhas 1 e 2 parecem o mesmo produto em tamanhos diferentes. Juntar em 'Bermuda jeans' com tamanhos M e G?" [Juntar] [Manter separados]. Sem isso, 6 camisetas P/M/G/GG viram 6 produtos e a vitrine fica poluída. O PRD diz "cada linha vira um item": pergunta 1.

Rodapé fixo: "Criar 6 rascunhos (1 com problema)" + link "Voltar e editar o texto". **Todas as linhas viram rascunho** (RN-Q2: existe desde que haja nome); as incompletas ficam marcadas.

## 4. Etapa 3: fotos

Título "2 de 6 com foto" (região viva). Lista: miniatura (ou câmera vazia), nome e tamanho, selo, botão **"Foto"** (abre a câmera, 44 px) e, só no protótipo, "Simular". Ao voltar da câmera a linha vira "Pronta" e a contagem sobe. Rodapé: **"Publicar os válidos (n)"** (inerte com motivo escrito quando n = 0, via `aria-disabled`; ao tocar: "Nenhum produto pronto. Tire as fotos primeiro.") e "Os que faltam foto ou preço ficam como rascunho." Resultado: toast "4 produtos publicados. 2 ficam como rascunho: faltam foto ou preço."

## 5. Aba Planilha (WB-065 melhorado, C6)

1. Área "Planilha .xlsx ou .csv, até 5 MB" `[limite: PO]` + "Escolher arquivo" + "Baixar modelo com exemplos" (o modelo traz 3 linhas preenchidas, não vazio).
2. **"Qual coluna é cada coisa?"**: um seletor por campo (Nome, Preço, Estoque, Tamanho opcional), já com o palpite do sistema; prévia das 3 primeiras linhas. Aparece só quando o cabeçalho não bate com o modelo.
3. Cai na mesma etapa 2.

Nota no topo: "Planilha é mais fácil no computador. No celular, prefira colar o texto." Erro de arquivo: "Não conseguimos ler este arquivo. Use o modelo ou um arquivo .csv ou .xlsx."

## 6. Estados

| Estado | Comportamento |
|---|---|
| Carregando | "Lendo a lista…" (leitura é local, < 1 s; skeleton só se > 300 ms) |
| Vazio | Campo vazio com exemplo fantasma; "Ler a lista" mostra o erro |
| Erro | §2; falha ao criar rascunhos: "Não conseguimos criar os rascunhos agora. Sua lista está guardada. Tente de novo." |
| Sem rede | A leitura funciona (é local). "Criar rascunhos" guarda no aparelho: "Sem internet: vamos enviar quando voltar." Fotos e publicação esperam a rede |
| Sucesso | Toast com a contagem (§4) e retorno a Produtos |
| Permissão | Clipboard negado (§2); funcionário sem catálogo: "Você não tem acesso a Produtos…" |

## 7. Acessibilidade

Rótulo visível em todo campo de cartão ("Nome", "Preço"…), nunca placeholder. Resumo e contagens em região viva educada, sem repetir a cada tecla. Situação nunca só por cor (ícone + texto). Alvos 48 px; botão "Foto" 44 px com `aria-label` "Tirar foto de Bermuda jeans M". Desktop: tabela com `<th scope>`; Tab percorre linha a linha. Texto >= 16 px. Etapas 2 e 3 sem barra inferior (tarefa focada).

## 8. Eventos

PRD: `paste_import_confirmed` (lines_ok, lines_error). Proponho (PO): `paste_group_suggested` / `paste_group_accepted`, `paste_photos_completed` (n), `paste_abandoned` (etapa).

## 9. Mapa WB para a tela

WB-376 C1 (§2 tabela), C2 (§3), C3 (§2), C4 (§3 e §4), C5 (§2: `79.90`, `79,90`, `R$ 79,90` entram no mesmo valor), C6 (§5), C7 (§2, linha de confiança). Reuso: WB-370 (foto), WB-371 (rascunho).

## 10. Revisão heurística

**Nota 3 de 5** na versão do PRD; **4** com a etapa de fotos. Achados: IC-1 (sev. 4, H1/H7): sem a etapa 3 o fluxo não publica nada; IC-2 (sev. 3, H5): "Criar N rascunhos" com linhas ruins pode poluir a lista, mitigado por selo e filtro `[a validar]`; IC-3 (sev. 2, H8): a sugestão de juntar adiciona 1 decisão, mas poupa N cartões. Bom: leitura local, correção em cartão, exemplo real. **Teste com 3 a 5 lojistas:** colar de verdade a lista deles e ver quantas linhas o leitor erra.

## 11. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Juntar linhas em um produto com variações entra? 2. Tamanho numérico de calçado lido da linha? 3. Limite e formatos da planilha 4. A etapa de fotos substitui "Publicar os válidos" como está no WB-376 C4? 5. Texto com mais de um preço ("P 49,90 G 59,90") |
| mobile-dev | 6. Ler a área de transferência no Safari pede permissão a cada vez? |
| Security | 7. Linhas coladas ficam no aparelho até criar rascunho: retenção? |
