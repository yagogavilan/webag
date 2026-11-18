# Log de Decisões — Webag

Toda decisão relevante entra aqui (produto, prioridade, risco aceito, veto derrubado). Decisões técnicas detalhadas viram ADR e são referenciadas aqui.

| ID | Data | Decisão | Por quê | Quem decidiu | Alternativas descartadas | Status |
|---|---|---|---|---|---|---|
| DEC-001 | 2026-11-18 | Stack de referência (ver ADR-001; detalhamento final pelo tech-lead) | TypeScript ponta a ponta; confirmada pelo briefing oficial | Fundador (brief §6) | Flutter; apps nativos separados | Aprovada |
| DEC-002 | 2026-11-18 | Briefing oficial salvo em `docs/00-visao/brief.md`; **gates G0, G1, G2 e G3 aprovados pelo fundador** com as decisões do brief. Execução autônoma até a v1.0 | Fundador quer o produto pronto, não plano | Fundador | Aprovação gate a gate | Aprovada |
| DEC-003 | 2026-11-18 | QA e Security mantêm veto em G4/G5. Proibido irreversível (apagar histórico, force push na main, repo público, gastar dinheiro) | Brief §1 | Fundador | — | Aprovada |
| DEC-004 | 2026-11-18 | Começar do zero: não reaproveitar código, telas, visual do MVP HTML nem o plano de back-end antigo | Brief §1 | Fundador | Reaproveitar MVP HTML | Aprovada |
| DEC-005 | 2026-11-18 | Painéis lojista + admin num único app `apps/web` (Next.js) com rotas e permissões separadas (substitui `apps/admin` do CLAUDE.md §3) | Brief §6; um deploy, um design system web | Fundador | Dois apps web | Aprovada |
| DEC-006 | 2026-11-18 | Carrinho com uma loja por pedido, aviso ao trocar de loja | Padrão de mercado (iFood, Rappi); simplifica split, frete e trocas | Fundador (brief §3.1) | Carrinho multi-loja | Aprovada |
| DEC-007 | 2026-11-18 | Entrega na 1.0: pelo lojista (própria) ou retirada na loja. App do entregador fica na fase 2 com modelo de dados preparado | Brief §3 "Fora da 1.0" | Fundador | Frota própria Webag na 1.0 | Aprovada |
| DEC-008 | 2026-11-18 | Receita: comissão por pedido (padrão, por categoria e por loja) + taxa de serviço opcional, ambas configuráveis no admin | Brief §3.3 Financeiro | Fundador | Mensalidade | Aprovada |
| DEC-009 | 2026-11-18 | Cidades do lançamento: Francisco Morato, Franco da Rocha, Caieiras, Campo Limpo Paulista (cadastráveis no admin) | Brief §2 | Fundador | — | Aprovada |
| DEC-010 | 2026-11-18 | Paralelismo máx. 3 agentes; Sonnet para execução, Opus para arquitetura/segurança/decisões difíceis | Brief §1 (economia) | Fundador | — | Aprovada |

## Decisões em aberto
- [x] Modelo de entrega → DEC-007
- [x] Modelo de receita → DEC-008
- [x] App do cliente nas lojas; lojista e admin via painel web responsivo (brief §3) → DEC-005
- [x] Cidades do lançamento → DEC-009

## Hipóteses assumidas na missão v1.0
> Decisões de negócio tomadas pelo time sem consulta ao fundador (brief §1). Revisar no relatório final.

| ID | Hipótese | Por quê | Configurável no admin? |
|---|---|---|---|
