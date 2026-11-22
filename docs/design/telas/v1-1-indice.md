# v1.1 (R1 e R2): índice das telas, mapa de histórias e pendências

> Autor: product-designer. Data: 2026-11-22. Protótipo único: `docs/prototipo/v1-1-lojista-e-admin.html` (rode `python3 docs/prototipo/inject_fonts.py` para embutir as fontes). Parâmetros e rotas no comentário do topo do arquivo.
> **Limite honesto:** o protótipo foi escrito sem poder executá-lo (sem Bash/navegador no ambiente do designer). O CEO deve abri-lo no celular e no desktop antes de mostrar ao fundador e me devolver o que quebrar; trato como defeito meu.

## 1. Telas, rotas e notas (revisão heurística, 1 a 5)

| # | Tela | Spec | Rota do protótipo | Release | Nota |
|---|---|---|---|---|---|
| 1 | Cadastro rápido (+ grade, duplicar, rascunho, código, IA) | `v1-1-cadastro-rapido.md` | `#/l/produtos`, `#/l/novo`, `#/l/publicado` | R1 (código R2, IA R5) | **4** |
| 2 | Adicionar vários (colar e planilha) | `v1-1-importar-colar.md` | `#/l/colar` | R1 | **3** (4 com a etapa de fotos) |
| 3 | Preços e estoque (edição em massa) | `v1-1-edicao-em-massa.md` | `#/l/massa` | R1 | **4** |
| 4 | Admin: lojas, ficha, "Ver como", auditoria, permissões | `v1-1-admin-lojas.md` | `#/a/lojas`, `#/a/loja?id=l1&aba=...`, `#/a/ver-como` | R1 | **3** |
| 5 | Admin: campanhas e cupons (+ convite e cupom do lojista) | `v1-1-admin-cupons.md` | `#/a/cupons`, `#/a/cupom-novo`, `#/a/cupom-rel`, `#/l/convites` | R2 | **3** |
| 6 | Cliente: cupom na sacola e no checkout | `v1-1-cupom-cliente.md` | `#/c/sacola` | R2 | **4** |
| 7 | Admin: painéis e construtor | `v1-1-admin-paineis.md` | `#/a/paineis?p=...`, `#/a/construtor` | R2 prontos, R3 construtor | **3** |

Fluxos (Mermaid, com erros): `docs/design/fluxos/v1-1-cadastro-rapido.md`, `v1-1-admin-lojas.md`, `v1-1-cupons.md`, `v1-1-paineis.md`.
Notas são avaliação de especificação e protótipo, sem teste com usuário. Nota 3 = usável, com risco de densidade ou uso baixo.

## 2. Mapa de histórias para tela

| História | Tela | História | Tela |
|---|---|---|---|
| WB-340 a WB-342, WB-345, WB-349 | 5 (admin) | WB-355 | 4 (§5) |
| WB-341 (motor) | 5 (simulação), 6 (resultado) | WB-356 a WB-359 | 7 |
| WB-343, WB-346 | 5 (§4, lojista) | WB-370, 371, 372, 374, 375, 378, 379 | 1 |
| WB-344 | 5 (Suspeitos), 6 (recusas) | WB-373 | 1 (§5) |
| WB-347 | 6 | WB-376 | 2 |
| WB-348 | 6 (§5) | WB-377 | 3 |
| WB-350 a WB-354 | 4 | | |

## 3. O que o protótipo cobre e o que só a spec cobre

| Coberto no protótipo | Só na spec (sem tela no protótipo) |
|---|---|
| Fluxo completo do cadastro com câmera real, cronômetro, grade, duplicar, rascunho, leitor (ao vivo se o navegador tiver `BarcodeDetector`; demonstração por código), IA `fake` por flag, estados | Conflito de rascunho em 2 aparelhos; "Limite de 50 rascunhos"; duplicar variação (WB-372 C2); consentimento da IA real (só um diálogo) |
| Colar (leitura de verdade, regras do PRD), correção, juntar linhas, fotos, publicar os válidos; planilha com mapeamento (simulada) | Limite de 5 MB e erro de arquivo |
| Edição em massa com salvamento, erros por linha, reajuste com prévia, 30%, desfazer de 10 min | Histórico de alterações em massa (C7) |
| Admin: lista com filtros, ficha em 5 abas, alterar preço/estoque com motivo e desfazer, pausar, situação, comissão, histórico com restaurar e conflito, "Ver como", troca de perfil | Conflito "o lojista alterou agora" (WB-351 C6), edição em massa pelo admin, exportação real |
| Cupons: lista com alertas, formulário com simulação ao vivo, pendências, 2º fator, relatório, Suspeitos, convite e cupom do lojista | Convites a lojas dentro do formulário; "pior caso" do percentual (CU-2) |
| Cliente: 9 respostas de cupom, "Faltam" com sugestão, resumo discriminado | Vitrine de cupons em BottomSheet; checkout passo 2 |
| Painéis: 5 painéis, filtros globais, KPI, linha, barra, rosca, tabela, baixa amostra, perfis, construtor com compatibilidade e limites | Estados de consulta pesada, 429 e dado defasado; barra empilhada; exportar de verdade |

## 4. Decisões de UX que o CEO deve validar (consolidado)

1. Cadastro em **tela única**, rascunho criado **antes** da câmera, Publicar sempre ativo (spec 1 §0).
2. **Descrição opcional aceita**, com lembrete e medição de conversão.
3. Colar lista exige **etapa de fotos** (a regra "toda publicação tem foto" faz o WB-376 C4 não publicar nada).
4. Admin: **motivo por sessão** com confirmação a cada alteração (depende de Security/PO).
5. "Ver como o lojista" com **etiquetas "só o lojista" em vez de botões**.
6. Cupons: **simulação por faixa de entrega ao vivo** e **"Ativar" com pendências escritas**.
7. Cliente: **cupom recolhido**, bloco "Faltam R$ X" com ação (não é erro).
8. Painéis: **prontos antes do construtor**; **"Compartilhar" trocado por "Enviar cópia"** (PRD proíbe link).
9. `dataviz` não existe no ambiente: regras de gráfico definidas na spec 7 §1 (inclui 6 tokens de cor novos).

## 5. Riscos

| Risco | Gravidade | Tratamento |
|---|---|---|
| Meta de 60 s sem folga (25 a 38 s no caminho feliz, 45 a 60 s com 1 erro; iOS +1 toque) | Alta | Teste do PO com cronômetro do protótipo antes de codar; critério de morte do PRD |
| Aba descarrega ao voltar da câmera no Android de entrada | Alta | Rascunho prévio; validar no T1 |
| Admin edita dinheiro do lojista (preço) | Alta | Prévia "Você recebe", > 30%, desfazer, restaurar, aviso; J27 |
| Painéis têm RICE baixo e custo alto | Média | Prontos primeiro; medir salvos por semana |
| Protótipo não executado por mim | Média | CEO abre e devolve falhas |

## 6. Perguntas consolidadas (cada spec tem a lista completa)

| Para | O que preciso |
|---|---|
| **PO** | Foto por cor; juntar linhas coladas; descrição opcional em categorias de risco; texto "categoria proibida"; vitrine de cupons filtrada x completa; "Enviar cópia" no lugar de "Compartilhar"; limiares de baixa amostra; matriz métrica x dimensão e definições RN-15; painel "Vendas" |
| **Security** | Motivo por sessão; tempo e escopo do "Ver como"; rascunho local sem login; consentimento da IA; mensagens neutras de fraude; "Revelar dado" nos Suspeitos |
| **tech-lead / mobile-dev** | Visão espelho: modo somente leitura ou páginas espelho; leitor de código no Safari; biblioteca de gráficos sem texto em SVG; tokens `color.chart.*`; `enterkeyhint` com lista virtualizada |
| **backend-dev** | Custo previsto do motoboy por faixa (F4); `n`, `atualizado_em`, `em_cache` nas consultas; reajuste em massa transacional; aviso agregado ao lojista em edição em massa do admin |
| **Fundador** | Orçamento mensal de cupons (F2); testar o cadastro no próprio celular com o cronômetro |
