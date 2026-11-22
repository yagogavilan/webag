---
name: priorizacao-de-backlog
description: Escolha do método de priorização (RICE, ICE, MoSCoW, Kano, valor x esforço, Pontuação de Oportunidade) e técnica de corte de escopo do MVP no Webag, com o tempo do fundador como custo. Use ao ordenar docs/produto/backlog.md, ao dizer "agora não" a um pedido ou ao cortar escopo para caber no prazo.
---
# Priorização de backlog (PO)

Backlog atual: `docs/produto/backlog.md` (§5 ordem de cortes; §6 fase 2). Priorize problemas e hipóteses, não "quem pediu". Dono do O QUÊ: você; o QUANDO é do PM e do CEO.

## 1. Qual método usar
| Situação | Método |
|---|---|
| Ordenar problemas do usuário | Pontuação de Oportunidade = Importância x (1 − Satisfação) |
| Triagem rápida de ideias (poucos dados) | ICE = Impacto x Confiança x Facilidade (1 a 10 cada) |
| Backlog grande, precisa de alcance | RICE = (Alcance x Impacto x Confiança) / Esforço |
| Fatiar escopo de release | MoSCoW (Must, Should, Could, Won't) |
| Entender expectativa (não ranquear) | Kano: obrigatório, desempenho, encantador, indiferente |
| Conversa de 5 minutos | 2x2 valor x esforço (só triagem) |

## 2. RICE com escalas do Webag
| Fator | Escala |
|---|---|
| Alcance | pessoas ou lojas afetadas por mês na cidade-piloto (número, `[HIPÓTESE]` se sem dado) |
| Impacto | 3 massivo, 2 alto, 1 médio, 0,5 baixo, 0,25 mínimo (efeito no resultado/North Star) |
| Confiança | 100% dado real; 80% pesquisa/entrevistas; 50% intuição (não passe de 50% sem fonte) |
| Esforço | pessoa-semana de construção **mais as horas do fundador** (revisão, teste em aparelho, conversa com lojista). O fundador é o gargalo (ver `project-manager.md`) |
Pontue cada item **separadamente** (inclua devs/CEO sem ver a nota dos outros) e só depois discuta as divergências. Anote a premissa de cada nota.

## 3. Piso: o que não entra no ranking
Itens de lei, segurança e dinheiro correto (LGPD, pagamento, direito de arrependimento, auditoria, denúncia, políticas das lojas) são **piso**: obrigatórios, não competem por pontos e não são cortados (backlog §5, R-02). Priorize em cima do piso.

## 4. Cortar o escopo do MVP/piloto
1. Escreva a **hipótese principal** (lojas vendem aqui e consumidores compram de novo). Mantenha só a jornada mínima ponta a ponta: loja cadastra e vende, cliente compra e paga PIX, entrega, repasse.
2. Para cada item pergunte: "sem isso, o teste da hipótese ainda roda?" Não, é Must. Sim, mas dói, é Should. Sim e ninguém sente falta, é Could ou Won't.
3. **Fatie antes de cortar:** entregue a versão mínima da história (ex.: cupom fixo, não motor de regras), com critério de aceite reduzido. Mantenha a fatia fina de ponta a ponta, não a camada completa.
4. Cada Won't tem **motivo e gatilho de volta** ("entra se 3 lojas pedirem" / "se a taxa de X passar de Y").
5. Mostre o **custo de oportunidade** ao CEO: "para entrar A, sai B (RICE x vs y)".
6. Evite o falso Must: se 80% do backlog é Must, o critério está frouxo (R-02: 109 Must em 134 histórias em 2026-11-18). Reaplique o passo 2.

## 5. Formato da linha do backlog
`WB-### | história | persona | método e nota | MoSCoW | onda | dependências | status | fonte/HIP`. Revisão a cada marco ou quando entra dado novo (piloto). Quem pediu (fundador, lojista) vira evidência, não pontuação.

## 6. Como dizer "agora não"
Reconheça o problema, mostre a nota e o que ficaria de fora, proponha a alternativa barata (processo manual, WhatsApp, teste de landing) e o gatilho para voltar. Registre em backlog §6.5 "Depois".

## Fontes e licença
- phuryn/pm-skills, skill `prioritization-frameworks` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22. Adaptado: seleção do método, fórmulas RICE/ICE/Pontuação de Oportunidade, regra de pontuar de forma independente.
- Escalas do Webag, piso legal, técnica de corte de MVP e gatilho de retorno: conteúdo próprio (inspirado em MoSCoW/Kano, práticas gerais de produto).
