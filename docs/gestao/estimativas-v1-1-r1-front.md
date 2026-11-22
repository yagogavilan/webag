# Estimativas do mobile-dev: front-end da v1.1 R1 (web admin, web do lojista, app do cliente)

Dono: mobile-dev | Data: 2026-11-22 | Para: project-manager (R-46, DEC-124 item 3), tech-lead | Par desta: `estimativas-v1-1-r1.md` (backend-dev). Nada daqui foi implementado, **exceto** o reajuste em massa da WB-377 (ver §5). Tudo marcado `[HIPÓTESE]` não foi medido.

## 1. Premissas

| # | Premissa |
|---|---|
| P1 | **UT** = a do `plano-v1-1.md` §1 (um marco fechado por um agente numa janela de uso, com testes, commit e push). Três pontos O / M / P; PERT = (O + 4M + P) / 6 |
| P2 | **Onde cada história mora (DEC-005):** WB-350 a 355 e WB-370 a 377, 379 são **web** (`apps/web`: `/admin` e `/lojista`, o cadastro rápido é uma página para celular no navegador, não app). O **app do cliente** (`apps/mobile`) só leva WB-360, 361 (emissor) e 369 (texto). Não existe app do lojista. WB-363 é job do servidor: sem front |
| P3 | Inclui: consumo do contrato, componentes, os 4 estados da spec, testes (Vitest + Testing Library; fake-api do Playwright para as rotas novas), lint, typecheck, commit e push |
| P4 | **Não inclui:** revisão do tech-lead, Security e QA; aceite do PO; teste de 60 s com 5 pessoas (fundador); validação em aparelho real; retrabalho depois de parecer (buffer de 15% do PM, à parte) |
| P5 | Só uso a rota nova depois que o PR do backend remove a marca `x-planned` (E-10). Se o backend atrasar, a história do front para: sem contrato, não ando |
| P6 | **Corte já assumido na conta:** sem fila offline (IndexedDB) para "Guardar para enviar depois" (cadastro) e "Na fila" (edição em linha). As duas specs pedem isso; o skill `expo-dados-e-rede` proíbe fila silenciosa; e custa **+0,5 UT (M)** se mantida. Sem rede, o botão fica inerte com o motivo escrito. Decisão ao PO/designer |
| P7 | Reuso: `product-form`, `variants-editor`, `photo-gallery`, `product-extras` (EarningsHint), `import-page`, `store-detail` e os componentes `ui` já existem; a conta é de evolução, não de tela do zero, exceto "Ver como" e a tela única do cadastro |
| P8 | Sem aparelho real nesta sessão: câmera nativa, aba descarregada ao voltar da câmera (risco A3 do designer) e a meta de 60 s **não** são validáveis aqui; viram tarefa do fundador/T1 |

## 2. Por história (O / M / P / PERT, em UT)

| Item | O que o front faz | O | M | P | PERT |
|---|---|---|---|---|---|
| BASE | Fake-api e wrappers `lib/api` das rotas novas; regenerar `shared` a cada PR de contrato | 0,30 | 0,50 | 0,80 | 0,52 |
| **Admin web** | | | | | |
| WB-355 | Matriz de 5 perfis em `admin-access.ts` + 4 chaves novas, ação sem permissão some (não fica cinza), faixa "só ver", testes por perfil | 0,15 | 0,25 | 0,40 | 0,26 |
| WB-350 | Lista de lojas (busca, chips, indicadores 30 dias, URL) + ficha em 5 abas (`?aba=`) + aba Resumo | 0,60 | 1,00 | 1,60 | 1,03 |
| WB-351 | Editar dados, horário, pausa, situação: `ReasonDialog` (motivo por sessão), 409 `STORE_VERSION_CONFLICT`, avisos | 0,60 | 1,00 | 1,60 | 1,03 |
| WB-352 | "Ver como": diálogo de abertura, credencial `x-view-as` pelo BFF, moldura do lojista em modo leitura com etiqueta "Só o lojista", máscara, fim/expiração, estados da §4.4 da spec, ficha de pedido do admin | 1,20 | 2,00 | 3,20 | 2,07 |
| WB-353 | Aba Catálogo do admin: lista, "Alterar preço" (4 motivos, caixa "Conferi" > 30%), estoque, edição em massa do admin (prévia + `expectedVersions` + `Idempotency-Key`), "Novo produto" como Webag (reuso do cadastro), fotos | 1,20 | 2,00 | 3,20 | 2,07 |
| WB-354 | Aba Histórico: antes/depois, filtros, Restaurar com aviso de valor mudado, Exportar CSV | 0,40 | 0,70 | 1,20 | 0,73 |
| **Lojista web (cadastro rápido e massa)** | | | | | |
| WB-370 (+I11) | Tela única: rascunho criado antes da câmera, foto com compressão e envio em segundo plano com progresso, 3 campos com máscara de centavos e "Próximo", EarningsHint, categoria "a última usada", `quickPublishProduct`, tela "Publicado", câmera negada, erros no campo com foco, medição com RTT de 400 ms | 1,20 | 2,00 | 3,20 | 2,07 |
| WB-371 | Rascunhos: cartão "Continuar", aba com "o que falta", aviso de vencimento, teto de 100 (DEC-118), `If-Match`/409 | 0,30 | 0,50 | 0,90 | 0,53 |
| WB-372 | Duplicar (lista e pós-publicação), nome "(cópia)", sem foto/EAN/SKU/promoção; duplicar variação (não está no protótipo) | 0,15 | 0,25 | 0,40 | 0,26 |
| WB-374 | Grade tamanho x cor no mesmo lugar: chips, cartão por combinação, "Preencher todos", totais, limite, duplicado, remover com reserva | 0,40 | 0,70 | 1,20 | 0,73 |
| WB-375 | Chips vindos do modelo da categoria, avisos de tabela de medidas e de troca, `descriptionRequired` | 0,15 | 0,25 | 0,50 | 0,27 |
| WB-376a | **Parser local** do texto colado em `packages/shared/src/paste-parser/` (função pura, tabela de casos; A6 do tech-lead) | 0,30 | 0,40 | 0,70 | 0,43 |
| WB-376b | Tela "Adicionar vários" em 3 etapas (colar, revisar em cartões/tabela, fotos) + aba Planilha (`.xlsx` convertido para CSV no navegador, plano B D4) + `createProductDraftsBatch` | 0,70 | 1,10 | 1,90 | 1,17 |
| WB-377 | "Preços e estoque": cartões (celular) e tabela (desktop) com edição em linha e salva após 0,7 s, `If-Match`, seleção, aviso e contagem do desfazer 10 min, somente leitura (C6). **Líquido do que já foi feito hoje (§5), cerca de -0,3** | 0,70 | 1,10 | 1,80 | 1,15 |
| WB-379 | Eventos e roteiro do cronômetro no front (`via`, duração); a gravação é do servidor | 0,10 | 0,20 | 0,30 | 0,20 |
| **App do cliente (`apps/mobile`)** | | | | | |
| WB-360 | Folha do 1º uso, interruptor em Conta > Privacidade, preferência local (SecureStore/AsyncStorage sem dado pessoal), teste de que desligado não envia nada | 0,30 | 0,50 | 0,80 | 0,52 |
| WB-361 | Emissor de eventos: lote, `session_id` efêmero, sem texto de busca, sem posição, não coleta com conta de loja/admin, para com o opt-out, atrás de flag desligada | 0,40 | 0,70 | 1,20 | 0,73 |
| WB-369 | Texto "a medição é anônima e não entra neste arquivo" na tela de exportar dados | 0,05 | 0,10 | 0,20 | 0,11 |
| TIPOS | Tipos `...ViewAs` e demais regenerados em `shared`; conferir que o app 1.0 não quebra | 0,10 | 0,10 | 0,20 | 0,12 |
| **Total front R1** | | **9,30** | **15,35** | **25,30** | **16,0** |

Por grupo (O / M / P / PERT): admin web 4,15 / 6,95 / 11,2 / **7,2**; lojista web 4,0 / 6,5 / 10,9 / **6,8**; app do cliente e base 1,15 / 1,9 / 3,2 / **2,0**.

**Contra o que existe:** o plano dá ao mobile-dev cerca de 45% de 31,7 (~14,3) e o board usa o piso de 14,7 (R-46). Minha conta é **16,0 PERT** (faixa 15,4 M a 25,3 P), ou seja, 9% acima do piso e com a cauda longa em WB-352, 353 e 370. Somada à do backend (13,8) dá ~30 UT de trabalho de código, antes de revisão, retrabalho e teste com gente. `[HIPÓTESE]`: a UT não foi calibrada; o primeiro dado real é o que esta sessão gastou no reajuste (§5).

## 3. Ordem de implementação

Segue a cadeia do backend do board (R1.1 a R1.3); o front de cada onda começa quando o PR do backend remove o `x-planned`.

| # | O quê | Depende de | UT (PERT) |
|---|---|---|---|
| 0 | **Reajuste em massa corrigido (feito)** | contrato R1.2 | gasto |
| 1 | BASE (fake-api, wrappers) e **WB-355** (piso) | R1.1-a | 0,8 |
| 2 | **WB-352 "Ver como"** (piso; mexe em auth, pede revisão do Security no PR) | R1.1-b, SEC-206/207/209 | 2,1 |
| 3 | WB-350, depois WB-351 | R1.1-d | 2,1 |
| 4 | Cadastro rápido: **WB-370, 371, 372, 375, 374, 379** (nesta ordem; 370 é o caminho crítico) e **teste de 60 s do fundador no aparelho** | R1.2 (backend) | 4,1 |
| 5 | WB-377 (restante), depois WB-353 e WB-354 | R1.3, D18 | 4,0 |
| 6 | WB-376a e 376b | R1.3 | 1,6 |
| 7 | App do cliente: WB-360, 361, 369 (em paralelo a qualquer etapa; staging, flag desligada até o J24) | WB-211, J24 | 1,4 |

Por que 370 antes de 353: a hipótese do projeto é o tempo de cadastro; o admin "Novo produto" reaproveita a tela. Por que 352 antes de 350/351: é piso e o de maior risco; descobrir cedo.

## 4. O que cortar primeiro (ordem; economia em M)

Nunca cortar: WB-355, WB-352, WB-370, WB-379 (pisos/meta) e WB-360, 361, 369 (LGPD).

| # | Corte | Economia | Custo do corte |
|---|---|---|---|
| 1 | WB-376b: aba Planilha (xlsx) e "Juntar linhas" ficam para depois; só texto colado | ~0,4 | Lojista com planilha usa o CSV de modelo que já existe (WB-065) |
| 2 | WB-353: edição em massa do admin e "Novo produto como Webag" | ~0,7 | Admin edita um produto por vez; operação lenta, mas o dinheiro de terceiros fica com menos superfície |
| 3 | WB-354: Exportar CSV | ~0,15 | O histórico na tela basta no piloto |
| 4 | WB-374: "Outro preço" por combinação e duplicar variação | ~0,2 | Preço único por produto; o resto por Duplicar |
| 5 | WB-350: indicadores de 30 dias e filtro "Comissão própria" na lista | ~0,2 | Ficha mostra os números; a lista fica enxuta |
| 6 | WB-377: tabela de desktop (só cartões) | ~0,2 | Joana repõe no celular de qualquer jeito |

Cortes 1 a 6 somam ~1,85 UT (M), levando o total de M 15,35 para ~13,5.

## 5. O que já foi feito (R-46 e gate da R1.2)

Reajuste em massa do painel web (`bulk-bar.tsx`): prévia pelo servidor (`dryRun`), aplicar com `Idempotency-Key` (uma por prévia, reaproveitada na retentativa, nova depois de prévia nova) e `expectedVersions` da prévia, caixa "Conferi os valores novos" quando `requiresConfirmation`, 409 `BULK_VERSION_CONFLICT` com mensagem nomeando os produtos e prévia recarregada. Testes: `bulk-bar.spec.tsx` (6 casos), `bulk.spec.ts`, `products-page.spec.tsx`. Pausar, reativar e mover de seção seguem sem chave (estados absolutos, contrato). `stock_adjust` em massa só existe no admin (`bulkAdminStoreProducts`), cuja tela é a WB-353 e **ainda não existe no web**: nasce já com chave e versões (linha da WB-353).
Medida de calibração: este marco (corrigir, testar, estimar) coube em **uma janela**, perto de 0,3 a 0,4 UT de front, compatível com a conta acima `[HIPÓTESE]`.

## 6. Riscos e pendências (cada um com dono)

| # | Risco / pendência | Dono |
|---|---|---|
| F-1 | **Não validei em aparelho** câmera, aba descarregada ao voltar da câmera e os 60 s; a hipótese central do projeto depende disso | Fundador / T1 |
| F-2 | WB-352 altera o BFF (`x-view-as`) e o que o lojista vê: auth, máscara de dado pessoal. Sinalizo ao `security-engineer` antes de começar | Security |
| F-3 | Spec de edição em massa e de cadastro pedem fila offline ("Na fila", "Guardar para enviar depois"); proponho cortar (P6) | PO, designer |
| F-4 | Spec diz "limite de 50 rascunhos"; DEC-118 fixou 100. Spec diz "acima de 30%" fixo; o limite é o parâmetro `reajuste_max_pct`, que a resposta não devolve (a tela hoje diz "variação grande"). Pedido de campo `limitPct` na prévia | designer, backend-dev (via CEO) |
| F-5 | Spec da prévia pede **tabela com `caption`** (produto, antes, depois, você recebe); entreguei lista com o mesmo conteúdo. Ajuste de ~0,1 UT na WB-377 | mobile-dev |
| F-6 | Leitor de código de barras (WB-373) é R2; não está na conta | PM |
| F-7 | Disco a 99% (~560 MB livres): rodar Playwright e builds é arriscado; só Vitest foi rodado | CEO (I-05) |
| F-8 | Pareceres bloqueantes pendentes (J24 para coleta em produção; J27 para preço pelo admin) valem como flag desligada, não como atraso de código | Jurídico |
