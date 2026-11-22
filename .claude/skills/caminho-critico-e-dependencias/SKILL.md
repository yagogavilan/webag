---
name: caminho-critico-e-dependencias
description: Mapeamento de dependências e cálculo do caminho crítico do PM, com atenção a esperas externas (lojas de apps, Mercado Pago, jurídico) e ao tempo do fundador. Use ao montar ou atualizar docs/gestao/plano-execucao.md §5, ao ver um bloqueio, ao antecipar pedidos de longo prazo ou ao calcular folga até o G5.
---
# Caminho crítico e dependências (PM)

Objetivo: saber qual sequência define a data final, quanto de folga existe e o que pedir **hoje** para não travar depois. Local: `docs/gestao/plano-execucao.md` §5 e §6 (externas) e linha "Caminho crítico" do status.

## 1. Tipos de dependência (marque cada uma)
| Tipo | Exemplo Webag | Quem destrava |
|---|---|---|
| Técnica | contrato OpenAPI antes do consumo no mobile | tech-lead / backend-dev |
| Arquivo/integração | `packages/shared`, lockfile (R-07) | tech-lead |
| Decisão | comissão promocional, quem despacha (R-18) | fundador / CEO |
| Externa | Apple/Google, credenciais Mercado Pago (D-01, D-02), parecer jurídico (D-06) | fundador / terceiro |
| Insumo do fundador | aparelho real, fotos, CNPJ (D-04, D-07, D-09) | fundador |
| Capacidade | limite de uso do agente (R-04) | PM (planejamento) |
Relações: término-início (padrão), início-início e término-término quando duas coisas andam juntas. Registre também defasagens (ex.: "revisão da loja: espera de N dias `[HIPÓTESE]`").

## 2. Montar a rede (tabela, sem diagrama decorativo)
`ID | tarefa | duração (3 pontos se incerta) | predecessoras | dono | externa? | ES | EF | LS | LF | folga`
1. Liste tarefas até o marco final (ex.: G5, piloto) com ID do board.
2. Passe para frente: ES = maior EF das predecessoras; EF = ES + duração.
3. Passe para trás a partir da data-alvo: LF = menor LS das sucessoras; LS = LF − duração.
4. **Folga = LS − ES.** Folga 0 = caminho crítico. Folga pequena = quase crítico: vigie também.
5. Duração em dias úteis com a premissa escrita; para externa, use faixa (mínimo-máximo) e planeje no máximo.

## 3. Itens de longo prazo (peça cedo)
Tudo com espera fora do seu controle sai na frente: contas de desenvolvedor, credenciais, domínio/servidor, parecer jurídico, revisão das lojas, cotação de motoboy. Eles entram no plano com **data de pedido** e **data-limite de resposta**; um pedido atrasado desloca o marco final inteiro. Agrupe os pedidos ao fundador em uma única janela (o tempo dele é o gargalo).

## 4. Encurtar o caminho (em ordem de custo)
1. Paralelizar o que não precisa esperar (máx. 3 agentes, DEC-010; sem tocar o mesmo arquivo).
2. Dividir a tarefa crítica para liberar a sucessora mais cedo (entrega parcial utilizável).
3. Antecipar a dependência externa ou inserir plano B (ex.: provedor simulado enquanto o MP real não chega, R-16).
4. Cortar escopo não essencial (decisão do PO/CEO). Mais agentes quase nunca ajudam: o gargalo é o fundador ou a espera externa.
Depois de qualquer mudança, recalcule: o caminho crítico pode trocar.

## 5. Gestão contínua (todo início e fim de sessão)
- Atualize durações restantes, não percentual; trabalho "quase pronto" não reduz a duração.
- Bloqueado precisa de: **o que trava, quem desbloqueia, até quando**, e o efeito na folga. Bloqueio no caminho crítico sem data de saída = status VERMELHO.
- Dependência circular ou sem dono: devolva ao CEO para arbitrar.
- Dados do plano devem apontar para o ID do board; só o PM edita o board.
- Reporte no status: "próximo marco: X em AAAA-MM-DD, folga N dias, depende de Y".

## 6. Anti-padrões
Plano sem dependências externas; datas de loja como certeza (marque `[HIPÓTESE]` até a evidência); folga calculada com premissa de que o fundador responde na hora; tratar todas as tarefas como críticas; não revisar a rede após atraso.

## Fontes e licença
- phuryn/pm-skills, skill `sprint-plan` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22: etapa de dependências e caminho crítico, adaptada.
- Método do caminho crítico (CPM), tipos de dependência e itens de longo prazo: conhecimento geral de gestão de projetos (inspirado em), texto próprio.
