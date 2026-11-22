# Tela: Lojista, módulo "Análises" (pago)   (WB-364, 365, 366 lado lojista, 367, 368 parcial)

> Autor: product-designer. Data: 2026-11-22. Release R5. Protótipo: `v1-1-logistica-e-analises.html#/l/analises` e `#/l/inicio`. Na barra, **"Análises da Moda Morato"** troca o estado: Inativo, Em teste, Ativo, Vencido, Suspenso. "Funcionário sem valores" oculta R$. O estado também muda se o admin ativar em `#/a/acessos?aba=modulo`.
> Reaproveita: KPI, barra horizontal e tabela responsiva de `v1-1-admin-paineis.md` §1; regras de gráfico (frase, tabela, sem 3D, rótulo direto).

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Nunca mostrar pessoa.** Nenhuma tela, arquivo ou aviso tem nome, lista ou "quem visitou". Há uma tag fixa "Medição anônima" e o link "Como medimos" | RN-A1; é o ponto que protege o cliente e o Webag (LGPD) |
| 2 | **Célula com menos de 5 vira texto "menos de 5"**, nunca zero, nunca barra cheia; loja com menos de 30 visitas vê **só os totais** com "Poucos dados ainda. Com menos de 30 visitas, mostramos só os totais." | RN-A2. Zero enganaria ("ninguém veio") |
| 3 | **Funil de 4 barras com a conversão da etapa anterior escrita** ("32% da etapa anterior"), não só o total | O lojista precisa saber **onde** perde; conversão final isolada não diz |
| 4 | **Comparação só quando há amostra**: abaixo de 20 nos dois períodos aparece "Poucos dados: sem comparação" e some o percentual | Percentual sobre 5 pedidos engana (mesma regra dos painéis do admin) |
| 5 | **Vendas em destaque e exatas** (do banco), separadas das medidas de navegação; nota "Pedidos sem medição de navegação: 1" | C5 da WB-364: o lojista não pode achar que o funil é o total de vendas |
| 6 | **Os números fecham de madrugada**; não há "Hoje": o período mínimo é "Ontem" e a tela diz "O dia de hoje aparece amanhã." | A agregação é diária (PRD WB-363). Prometer "ao vivo" seria falso (H1) |
| 7 | **Porta falsa sem promessa de data**: cartão "Análises da sua loja. Visitas, funil e origem das vendas." + **Quero testar**; depois "Avisamos você quando abrir. Quanto você pagaria por mês?" com 4 faixas e um campo opcional curto ("Não escreva dados de clientes.") | WB-367 C1 a C4. A porta falsa mede interesse sem enganar: **não** mostra gráficos de exemplo, que prometeriam funções |
| 8 | **Módulo vencido: leitura bloqueada, mas a venda continua** e o convite diz o que fazer ("Fale com o Webag para voltar") | RN-A7; não bloquear o painel de vendas |
| 9 | **Aviso de vencimento 7 dias antes**, com data e verbo ("Fale com o Webag para renovar") | WB-366 C4 |
| 10 | Seleção **só "Ontem", "7 dias" e "28 dias"** | Menos escolha; 90 dias fica para o admin |

## 1. Layout (de cima para baixo, ativo ou teste)

1. Faixa de situação: "Teste grátis até 04/12: faltam 12 dias. Depois o módulo para de mostrar os números. Suas vendas continuam no painel." ou tag "Ativo até 21/12".
2. Tag "Medição anônima" + "Como medimos".
3. Período (chips) + "Comparar com o período anterior".
4. **Vendas**: cartão noite "Vendas em 7 dias R$ 842,40, 6 pedidos" com tag "Valor exato". Sem permissão de valores: "Valores ocultos para o seu acesso" e só a contagem.
5. 4 KPI: Visitas, Abriram produto, Na sacola, Pedidos (cada um com "Subiu 23% sobre o período anterior" ou "Poucos dados: sem comparação").
6. **Do perfil ao pedido** (funil) + "Conversão da visita ao pedido: 3,9%. Pedidos sem medição de navegação: 1."
7. **De onde vêm as visitas** (barras: banner da home 60%, lista de lojas da home, busca, categoria, favoritos, link externo, notificação) com "menos de 5" nas pequenas.
8. **Mais vistos x mais vendidos**: tabela Produto, Aberturas, Na sacola, Vendidas; selo **"Muito visto, nada vendido"** (> 20 aberturas e 0 vendas).
9. **Horário de pico**: 24 colunas, horas com menos de 5 visitas vazias (traço), pico escrito ("Pico às 18h").
10. **Exportar resumo (CSV)** + "O arquivo e as telas têm só números da sua loja. Ninguém vê quem visitou."

## 2. Estados

| Estado | Texto e comportamento |
|---|---|
| Não contratado (Inativo) | Cartão com **Quero testar**; depois do envio: "Você pediu para testar. Avisamos quando abrir." Sem data, sem preço |
| Teste | Faixa de dias restantes (âmbar nos últimos 7) |
| Ativo | Tag "Ativo até 21/12"; faixa âmbar a 7 dias: "O módulo vence em 5 dias (21/12). Fale com o Webag para renovar." |
| Vencido | "O módulo Análises venceu em 15/11. Seus dados ficam guardados. Fale com o Webag para voltar." [Falar com o Webag] + link "Ver minhas vendas no painel inicial" |
| Suspenso | "O módulo Análises está suspenso. Fale com o Webag." |
| Poucos dados (< 30 visitas, ex.: Ontem) | Só totais + aviso (decisão 2) |
| Carregando | Skeleton |
| Vazio | "Sem dados neste período. Os números fecham de madrugada. O dia de hoje aparece amanhã." [Ver os últimos 7 dias] |
| Erro | "Não conseguimos carregar agora. Seus dados estão salvos. Tente de novo em instantes." |
| Sem rede | "Sem conexão. Mostrando o que já carregou." |
| Sem permissão `analises` | O item do menu não aparece; acesso direto: 404 (RBAC por loja) |
| Sem permissão `vendas_valores` | Valores em R$ ocultos; contagens seguem |
| Exportar | Toast "CSV baixado. Só números da sua loja." Erro: "Não conseguimos gerar o arquivo. Tente de novo." |

## 3. Acessibilidade

Cada gráfico tem **número escrito** (barra com valor, funil com contagem e %) e a frase de apoio; horário de pico tem rótulo de imagem "Visitas por hora. Pico às 18 horas." e as colunas vazias têm traço pontilhado (forma, não só cor). Variação com palavra e seta ("Subiu"). Texto >= 16 px, tabela vira cartões no celular. Alvos >= 44 px. Contraste dos tokens `chart.*` >= 3:1 (barra) e texto >= 4,5:1.

## 4. Privacidade e a pegadinha da "diferença"

Esconder "menos de 5" não basta: se o total e todas as outras origens aparecem, **o lojista subtrai e descobre a célula escondida** (ex.: total 128, soma das origens mostradas 125 = 3 em 3 origens ocultas). A tela mostra o **total sem a linha "Outras"** e uma única linha "menos de 5" por origem, mas isso ainda vaza quando há uma só célula oculta. **Pergunta a Security e backend:** supressão complementar (ocultar também a menor célula visível quando só 1 estiver escondida) ou agrupar tudo menor que 5 em "Outras origens".

## 5. Eventos

`analytics_screen_viewed` (store_id), `analytics_interest_clicked` (store_id, faixa), `analytics_export` , `analytics_period_changed`. Sem pessoa.

## 6. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-364 C1 a C7 | §1 e §2 (C3 poucos dados, C4 permissão de valores, C5 pedidos sem medição; C6 é de API; C7 vale em todo o desenho) |
| WB-365 C1 a C4 | §1.8 e §1.9 |
| WB-366 C1 a C4 (lado lojista) | §2 (aviso de teste, vencido, aviso de 7 dias) |
| WB-367 C1 a C4 | §0.7 e §2 (Inativo) |
| WB-368 (origem por canal) | Origem "Link externo" na quebra; a **geração de links por canal** (Could) não tem tela; spec em R5 posterior |

## 7. Revisão heurística

**Nota 4 de 5.** AL-1 (sev. 3, H1): com 5 a 30 lojas a maioria verá "Poucos dados ainda" por semanas; a tela precisa **valer a pena mesmo vazia** (dizer quanto falta: "Faltam 16 visitas para mostrar o funil"). Correção proposta e não implementada: contador de progresso para 30. AL-2 (sev. 2, H4): "Abriram produto" x "Aberturas" (por produto) são contagens diferentes (sessões x aberturas); manter o rótulo da coluna e uma linha de ajuda `[testar com 3 lojistas]`. AL-3 (sev. 2, H2): "funil" e "conversão" são jargão para lojista; usei "Do perfil ao pedido" e "Conversão da visita ao pedido". Bom: sem pessoa, "menos de 5" em texto, vendas exatas separadas, porta falsa sem promessa. **Teste:** 3 lojistas: "o que a camiseta preta faz bem e o vestido mal?" em 30 s.

## 8. Perguntas

PO: 1. Faixas de preço da porta falsa (usei exemplos) e teste de 30 dias 2. Mostrar contador "faltam N visitas"? 3. Períodos permitidos. Security/backend: 4. Supressão complementar (§4). Fundador: 5. Preço e cobrança (F5, F6).
