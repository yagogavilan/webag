# v1.1: índice das telas, mapa de histórias e pendências (R1 a R5)

> Autor: product-designer. Datas: 2026-11-22. Protótipos: `docs/prototipo/v1-1-lojista-e-admin.html` (R1 e R2) e **`docs/prototipo/v1-1-logistica-e-analises.html` (R3 a R5)**. Rode `python3 docs/prototipo/inject_fonts.py` para embutir as fontes nos dois. Rotas e parâmetros no comentário do topo de cada arquivo.
> **Limite honesto:** os dois protótipos foram escritos sem poder executá-los (sem Bash/navegador no ambiente do designer), **inclusive na revisão da DEC-137 (2026-11-22): as edições nos protótipos desta rodada não passaram por Chromium**. O CEO abre no celular e no desktop antes de mostrar ao fundador e me devolve o que quebrar; trato como defeito meu. O segundo é maior e mais arriscado (simulação ao vivo): se travar, teste primeiro com `?estatico=1`.

## 0. Revisão DEC-137 (2026-11-22): correções de spec da R2

O PRD prevalece sobre a spec (DEC-137). Cada linha abaixo é o que mudou; o detalhe está na seção "Revisão" no topo de cada spec.

| Spec | O que mudou | Protótipo (não executado) |
|---|---|---|
| `v1-1-cupom-cliente.md` | Sem "confirmar celular" (vira "Confirme seu e-mail para usar este cupom", WB-344 C4); sem produto no "Faltam R$ X" (só "Ver mais da loja"); textos de fraude ("Não foi possível aplicar este cupom a este pedido" + "Falar com o suporte"), "Cupom inválido" e os demais **idênticos à tabela "Mensagens ao cliente" do PRD**; 10 tentativas por hora; frete grátis em duas linhas ("Entrega R$ 8,00" e "Desconto Webag (frete) -R$ 8,00"); vitrine só com elegíveis; eventos `coupon_shortfall_*`; todos os estados, movimento, celular e tela larga | `#/c/sacola`: códigos novos (EMAIL, USADO, PRIMCOMPRA, APARELHO, MARGEM); "Faltam" sem produto; notas neutras; atalho de teste renomeado "Só no protótipo" |
| `v1-1-admin-cupons.md` | **Pior caso por pedido** do percentual (WB-340 C12) com "até N pedidos no pior caso"; teto em R$ obrigatório; **3 parâmetros desligados por padrão** (`campanha_frete_gratis`, `campanha_parte_da_loja`, `selo_de_por`) em Configurações, com a dependência de parecer (J22/J23, J27, J23) e a razão escrita onde o admin esbarra; orçamento mensal global R$ 0 (C10) e soma (C11); "Duplicar" sem orçamento; convite "Responda em 7 dias"; limite do cupom próprio (30%) | `#/a/cupom-novo`: bloco "Pior caso"; Frete grátis, Loja paga e Dividido desabilitados com a razão; "Ativar" pendente por orçamento mensal R$ 0. Liberar para testar: `?orcmes=1000&frete=1&parteloja=1` |
| `v1-1-admin-paineis.md` | Painel **Vendas** incluído; "Logística" vira **"Entrega"**; os 5 painéis com o conteúdo do PRD (WB-357 C7) e o que cada perfil vê; **classes Geral, Operacional, Financeira**; widget sem permissão aparece como "Sem permissão" e não é consultado (C8); baixa amostra com `n` na tabela por loja (C9); export de widget marcado como cortado (DEC-104) | `#/a/paineis?p=vendas` e `p=entrega`; cupons e visão geral com o conteúdo do PRD; cartão "Sem permissão". **Lojas ainda é a versão anterior** (a tabela multimétrica só existe na spec) |
| `v1-1-transparencia-medicao.md`, `v1-1-analises-lojista.md` | "Anônimo" sai; entra a frase SEC-194 **"dados de uso não ligados à sua conta, guardados por até 90 dias"** ao cliente; tag do lojista "Medição agregada" | `#/c/privacidade`, folha `#/c/aviso` e `#/l/analises` com os textos novos |
| Protótipo `v1-1-lojista-e-admin.html` | **Defeito que encontrei na leitura:** o clique em botão sem `type` era ignorado pelo guard `t.type==='submit'` (o navegador devolve "submit" para botão sem atributo); troquei por `getAttribute('type')`. Se o protótipo já funcionava para o CEO, reverta essa linha | idem |

**Perguntas novas ao PO desta rodada:** cupom próprio do lojista depende de `campanha_parte_da_loja`?; canal do "Falar com o suporte"; a linha de apoio do "Faltam" ("Seu pedido tem R$ 80,00. O cupom vale a partir de R$ 120,00.") é aceita?; contagem de widgets do snapshot (WB-357 C7) onde o PRD junta métricas com "e"; coluna sem permissão em tabela de classes mistas (omitir ou bloquear); aba "Vendas" do Suporte (tudo bloqueado). Detalhe em `v1-1-cupom-cliente.md` §13, `v1-1-admin-cupons.md` §10 e `v1-1-admin-paineis.md` §9.

## 1. Telas, rotas e notas (revisão heurística, 1 a 5)

| # | Tela | Spec | Rota do protótipo | Release | Nota |
|---|---|---|---|---|---|
| 1 | Cadastro rápido | `v1-1-cadastro-rapido.md` | `#/l/produtos`, `#/l/novo` | R1 | **4** |
| 2 | Adicionar vários | `v1-1-importar-colar.md` | `#/l/colar` | R1 | **3** (4 com a etapa de fotos) |
| 3 | Preços e estoque | `v1-1-edicao-em-massa.md` | `#/l/massa` | R1 | **4** |
| 4 | Admin: lojas e "Ver como" | `v1-1-admin-lojas.md` | `#/a/lojas` | R1 | **3** |
| 5 | Admin: cupons | `v1-1-admin-cupons.md` | `#/a/cupons` | R2 | **3** |
| 6 | Cliente: cupom | `v1-1-cupom-cliente.md` | `#/c/sacola` | R2 | **4** |
| 7 | Admin: painéis e construtor | `v1-1-admin-paineis.md` | `#/a/paineis`, `#/a/construtor` | R2/R3 | **3** |
| 8 | **Admin: despacho, rota e motoboys** | `v1-1-admin-despacho.md` | `#/a/despacho` (L) | R3 | **4** |
| 9 | **Lojista: "Saiu com o motoboy" e avisos** | `v1-1-loja-confirma-saida.md` | `#/l/pedidos`, `#/l/avisos` (L) | R3 | **4** |
| 10 | **Fluxo de estados e notificações** | `v1-1-notificacoes.md` | `#/n/fluxo`, `#/c/avisos` (L) | R3 | **4** |
| 11 | **App do motoboy** | `v1-1-app-motoboy.md` | `#/m/...` (L) | R4 | **4** |
| 12 | **Cliente: rastreio ao vivo** | `v1-1-rastreio-cliente.md` | `#/c/pedido` (L) | R4 | **4** |
| 13 | **Lojista: Análises (módulo pago)** | `v1-1-analises-lojista.md` | `#/l/analises` (L) | R5 | **4** |
| 14 | **Admin: acessos, saída e módulo** | `v1-1-analises-admin.md` | `#/a/acessos` (L) | R5 | **3** |
| 15 | **Transparência da medição** | `v1-1-transparencia-medicao.md` | `#/c/aviso`, `#/c/privacidade` (L) | R5 | **4** |

(L) = `v1-1-logistica-e-analises.html`. Fluxos Mermaid: R1/R2 em `docs/design/fluxos/v1-1-*.md`; R3 a R5 em `v1-1-pedido-estados.md`, `v1-1-turno-motoboy.md`, `v1-1-despacho.md`. Notas são de especificação e protótipo, sem teste com usuário. **Toda nota abaixo de 4 tem a correção na seção "Revisão heurística" da spec** (telas 2, 4, 5, 7, 14).

## 2. Mapa de histórias para tela

| História | Tela | História | Tela |
|---|---|---|---|
| WB-340 a 342, 345, 349 | 5 | WB-370 a 372, 374, 375, 378, 379 | 1 |
| WB-341, 347, 348 | 5, 6 | WB-373, 376, 377 | 1, 2, 3 |
| WB-343, 344, 346 | 5, 6 | WB-350 a 355 | 4 |
| WB-356 a 359 (WB-357 C6 a C9: 5 painéis, "Sem permissão", baixa amostra; WB-359 cortada) | 7 | **WB-360 (aviso e opt-out)** | **15** |
| **WB-361 (coleta)** | sem tela; depende de 15 | **WB-362** | **14** |
| **WB-363 (agregação)** | 14 (job com falha), mínimo de 5 em 13 e 14 | **WB-364, 365** | **13** |
| **WB-366** | 14 (admin) e 13 (avisos do lojista) | **WB-367** | **13** |
| **WB-368** | 13 (só a origem "Link externo"); **geração de links por canal sem tela** (Could) | **WB-369** | **15** |
| **WB-380, 381, 382** | **8** | **WB-383** | **8 (convite) e 11 (aceite)** |
| **WB-384, 385, 386, 387, 389** | **11** | **WB-388** | **8** |
| **WB-390** | **9** | **WB-391** | **10 e fluxo `v1-1-pedido-estados.md`** |
| **WB-392, 393, 394, 395, 399** | **12** | **WB-396, 397** | **9 e 10** |
| **WB-398** | **14 (aba Saída e rastreio)** | | |

## 3. O que o protótipo R3 a R5 cobre

| Coberto | Só na spec |
|---|---|
| Mapa simulado e **motoboy animado** para o admin e para o cliente; rota calculada de verdade (todas as ordens com coleta antes da entrega); validações de lote; envio, aceite, recusa, reatribuição; faixa "Saiu" com lembrete, automática (5 min, a 150 m) e desfazer; rastreio com "Você é o 2º", sem sinal (90 s e 5 min), mapa indisponível, sem app; código com teclado e bloqueio; sem rede; GPS, bateria e modo PWA; Análises em 5 estados do módulo; admin com acessos, saída e módulo por loja; opt-out | Alertas por e-mail; Web Push real; página "Instalar" com imagens; conflito de dois motoboys; job de agregação com falha; geração de links por canal (WB-368); conferência posterior do código; reabrir o app após fechamento forçado |
| Simplificação do protótipo | Ações do motoboy sem rede refletem na hora nas outras telas (no real só depois de sincronizar) |

## 4. Decisões de UX para o CEO validar (R3 a R5)

1. **Rastreio só com app Android; PWA em "modo navegador" com aviso honesto** (o pedido falava em PWA primeiro; PWA não rastreia com o Waze aberto).
2. **Motoboy "disponível" sem posição no mapa** (RN-D7 vence a WB-380 C1): a operação perde a noção de proximidade.
3. **Faixa fixa "Saiu com o motoboy" em toda tela do lojista**, 1 toque para vários pedidos do mesmo motoboy, com regra automática e contagem visível.
4. **Mapa do cliente só na próxima parada**, com "Você é o 2º" e horário; ETA ao lado da faixa prometida que não muda.
5. **Código de entrega** com teclado numérico próprio e confirmação ao 4º dígito; **o buraco do código sem sinal** vai ao PO e Security.
6. **Botão e setas no lugar de arrastar** (arrastar só atalho no computador).
7. **Análises: nada de "Hoje"**, "menos de 5" em texto, só totais abaixo de 30 visitas, porta falsa sem prévia de gráficos e sem data.
8. **Avaliação na hora da entrega e convite em 1 h**: os dois convivem?

## 5. Riscos

| Risco | Gravidade | Tratamento |
|---|---|---|
| Parecer J8 e J26 bloqueiam app do motoboy e GPS em produção | Alta | Protótipo e dev seguem; flag desligada (DEC-102) |
| Código de entrega sem sinal vira entrega sem prova | Alta | Pergunta ao PO e Security (app do motoboy §8) |
| Lojista esquece o OK | Alta | Faixa fixa, lembrete, automática, alerta ao admin; medir % automático |
| Subtração revela célula "menos de 5" | Média | Supressão complementar (Security) |
| Poucos dados nas análises por semanas | Média | Admin primeiro; módulo só após RN-A8; contador "faltam N visitas" |
| Motoboy disponível sem posição reduz a qualidade do despacho | Média | Aceitar com 1 a 2 motoboys; revisar no gatilho de 3 motoboys |
| PWA gera expectativa de rastreio | Média | Faixa fixa e aviso ao abrir o mapa |
| Protótipo não executado por mim | Média | CEO abre e devolve falhas |
| Teste em campo (sol, uma mão, luva) não feito | Média | 3 motoboys antes de G5 |

## 6. Perguntas consolidadas (cada spec tem a lista completa)

| Para | O que preciso |
|---|---|
| **PO** | Motoboy disponível sem posição; "1 ou 2 motoboys" = dividir lote?; reatribuir lote parcial; limiares de alerta; confirmar vários pedidos com 1 toque; "Ainda estou separando"; "Saiu" sem chegada registrada; push de "a caminho da loja"; negativa de ranking no app; espera mínima antes de "cliente ausente"; avaliação imediata x 1 h; "Você é o 2º"; faixas de preço da porta falsa; matriz métrica x dimensão com "Origem"; "Atribuir" para Rafael sem posição |
| **Security** | Código sem sinal; código visível na tela do pedido; supressão complementar do "menos de 5"; opt-out x opt-in e como medir opt-out; funcionário sem permissão e aviso de chegada; posição ao perfil Suporte; nome do motoboy no push |
| **mobile-dev / tech-lead** | MapLibre nativo x WebView (DEC-087); pinos HTML x camada de símbolos; limite de paradas do link do Maps (L6); Android 14/15 e permissão "o tempo todo"; app separado `apps/courier`; Web Push no iPhone; tokens `color.chart.*`, `color.map.*` (ver `tokens-propostos.md`) |
| **backend-dev** | `n` por célula; deduplicação do push; opt-out mensurável; validação de relógio do aparelho |
| **Fundador** | Aparelho e plano de dados do motoboy; preço do módulo; testar o APK com 1 motoboy; abrir o protótipo no celular com o cronômetro da etapa de lote (meta 90 s) |

---

# Anexo: R1 e R2 (mantido da rodada anterior)

## A1. O que o protótipo R1/R2 cobre e o que só a spec cobre

| Coberto no protótipo | Só na spec |
|---|---|
| Cadastro com câmera real, cronômetro, grade, duplicar, rascunho, leitor, IA `fake` por flag, estados; colar (regras do PRD), correção, fotos, planilha simulada; edição em massa com erros por linha, reajuste com prévia, 30%, desfazer 10 min; admin: lista, ficha em 5 abas, preço/estoque com motivo e desfazer, pausar, situação, comissão, histórico com restaurar, "Ver como"; cupons com simulação, pendências, 2º fator, relatório, Suspeitos, convite; cliente: 9 respostas de cupom; painéis e construtor | Conflito de rascunho em 2 aparelhos; limite de 100 rascunhos; duplicar variação; consentimento da IA real; limite de 5 MB; histórico de alterações em massa; conflito "o lojista alterou agora"; edição em massa pelo admin; exportação real; convites dentro do formulário; Configurações > Campanhas (os 3 parâmetros, só a razão do bloqueio aparece no formulário); vitrine de cupons em BottomSheet; checkout passo 2; consulta pesada, 429 e dado defasado; barra empilhada |

## A2. Decisões de UX R1/R2 para validar

1. Cadastro em **tela única**, rascunho criado antes da câmera, Publicar sempre ativo. 2. **Descrição opcional aceita**, com lembrete. 3. Colar lista exige **etapa de fotos**. 4. Admin: **motivo por sessão** com confirmação a cada alteração. 5. "Ver como o lojista" com **etiquetas "só o lojista"**. 6. Cupons: **simulação por faixa ao vivo** e "Ativar" com pendências escritas. 7. Cliente: **cupom recolhido**, "Faltam R$ X" com ação. 8. Painéis **prontos antes do construtor**; "Enviar cópia" no lugar de "Compartilhar". 9. `dataviz` não existe no ambiente: regras de gráfico na spec 7 §1.

## A3. Riscos R1/R2

| Risco | Gravidade | Tratamento |
|---|---|---|
| Meta de 60 s sem folga (25 a 38 s feliz, 45 a 60 s com 1 erro) | Alta | Teste do PO com cronômetro antes de codar |
| Aba descarrega ao voltar da câmera no Android de entrada | Alta | Rascunho prévio; validar no T1 |
| Admin edita dinheiro do lojista | Alta | Prévia "Você recebe", > 30%, desfazer, restaurar, aviso |
| Painéis têm RICE baixo e custo alto | Média | Prontos primeiro; medir salvos por semana |

## A4. Perguntas R1/R2

| Para | O que preciso |
|---|---|
| **PO** | ~~Foto por cor; juntar linhas coladas; descrição opcional; texto "categoria proibida"; vitrine de cupons; "Enviar cópia"; limiares; matriz e RN-15; painel "Vendas"~~ **respondidas** (`v1-1-respostas-ao-time.md` §D). Abertas: ver §0 |
| **Security** | Motivo por sessão; tempo e escopo do "Ver como"; rascunho local sem login; consentimento da IA; mensagens neutras de fraude; "Revelar dado" nos Suspeitos |
| **tech-lead / mobile-dev** | Visão espelho; leitor de código no Safari; biblioteca de gráficos sem texto em SVG; tokens `color.chart.*`; `enterkeyhint` com lista virtualizada |
| **backend-dev** | Custo previsto do motoboy por faixa (F4); `n`, `atualizado_em`, `em_cache`; reajuste em massa transacional; aviso agregado ao lojista em edição em massa do admin |
| **Fundador** | Orçamento mensal de cupons (F2); testar o cadastro no próprio celular com o cronômetro |
