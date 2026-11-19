# Board — Webag

> Mantido pelo `project-manager`. Fonte única do status. Plano: `plano-execucao.md`. Visão para o fundador: `../status.md`. Escopo: `docs/produto/backlog.md`. Fila técnica detalhada: `fila-backend-dev.md`. Retomada após reinício/limite de uso: primeira tarefa não `Aceito` da onda atual.

**Onda atual:** Onda 8 (fechamento); mobile-dev integra o contrato W/Y em app e web   **Meta:** G4 final e decisão do G5   **Atualizado:** 2026-11-19 (HEAD `0029e53`)

**Bugs/SEC abertos (2026-11-19):** BUG-010 (Média, sem reteste); BUG-019 a 025 corrigidos no código, **sem reteste do QA**; SEC-180 corrigido no backend, falta Security; SEC-176 (app feito), SEC-178/169 parciais, SEC-179 corrigido no app, falta Security; Baixas 146, 149, 150, 161 a 163, 174. Nenhum Crítico/Alto aberto (Security).

Status: `A fazer` · `Em andamento` · `Em revisão` · `Em QA` · `Aceito` · `Bloqueado`.

## Resumo das ondas

| Onda | Escopo | Status | Evidência |
|---|---|---|---|
| 0 | Fundação | Concluída | `review-onda0-api.md` |
| 1 | Identidade, config, base de pagamento | Concluída com ressalvas | `revisao-onda1.md`, DEC-029 |
| 2 | Lojista, aprovação, catálogo | Concluída com ressalvas | `qa/relatorios/onda-2.md`, `review-onda2-api.md` |
| 3 | Descoberta do cliente | Concluída com ressalvas | `qa/relatorios/onda-3-5.md` |
| 4 | Pagamento, ledger, checkout, pedido, tempo real | Concluída com ressalvas | DEC-043 (Security), DEC-047 (TL), DEC-048 (QA) |
| 5 | Logística da Webag, trocas, financeiro, painéis | Concluída com ressalvas | DEC-036/037/045; QA reprova G4 até BUG-016 |
| 6 | LGPD, marketing, relatórios, ajuda, denúncia, cartão seguro | Entregue; Security reverificou (SEC-166 fechado); falta reteste QA | `seguranca/revisoes/onda-7-pos-dec-059.md` |
| 7 | Seed, carga, docs técnicas | Quase concluída: seed ok, k6 escrito, execução local indicativa; staging é do fundador | `qa/carga/README.md`, `qa/relatorios/setup-do-zero.md` |
| 8 | Fechamento: retestes, revisões, capturas, G4/G5, tag | A fazer (plano em `plano-execucao.md` §3) | G4 Security: aprovado com ressalvas; G4 QA: preliminar reprovado (evidência) |

Direção visual v3 (DEC-051/052) e entrega em até 2 h (DEC-053) cruzam as ondas 6 a 8.

## Onda 6 — tarefas

| ID | Tarefa | Dono | Status | Pronto quando |
|---|---|---|---|---|
| T6-01 | API: exportar dados, excluir conta, DSR, retenção (O6.1) | backend-dev | Em revisão | Entregue; Security reverifica |
| T6-02 | API: realtime por ticket, relatórios, push segmentado, cupons, ajuda, denúncia, cartão seguro (O6.2 a O6.5, B.1, B.2) | backend-dev | Em revisão | Entregue |
| T6-03 | Correções do TL R.1 a R.5 | backend-dev | Em revisão | Commits `98a2b14`, `c1064dc`, `bdafb19`, `8cd5202` |
| T6-04 | R.6: N+1 nas listas de pedidos; DT-053 a 058 | backend-dev | Em revisão (confirmar no reteste do QA) | Teste de consultas por requisição |
| T6-05 | Q.1 BUG-011: admin cancela pedido, estorno total cancela | backend-dev | Aceito | Fechado pelo QA com evidência (`onda-7-reverificacao.md` §4) |
| T6-06 | S6.1/S6.2: SEC-155 (G4), 152, 153, 154 (72 h), 156 a 160 e ataques A1 a A6 como e2e | backend-dev | Em revisão | `a7a4ce7`; Security reverifica |
| T6-07 | Q.2: BUG-016 (horário e pausa da logística), BUG-012 (cancelar corrida) | backend-dev | Aceito | BUG-012, 016 fechados pelo QA; BUG-021/022 corrigidos (`c35695e`, `aa41a2a`), reteste na T8-01 |
| T6-08 | Q.3: BUG-014 (retirada 48 h), BUG-015 (retestar), BUG-017 (parâmetros sem efeito), BUG-018, BUG-019 | backend-dev | Aceito (014 a 018); BUG-019/020/023/024/025 corrigidos, reteste na T8-01 | QA reteste |
| T6-09 | S6.3: SEC-161 a 165 e 167; DT-059 a 064 | backend-dev | Em andamento | DT-059 a 064 e SEC-167/177/180 feitos; Baixas restantes não bloqueiam G4 |
| T6-10 | Web: painéis da Onda 6 (ETA, lotes, contato, parâmetros, disputas, avaliações, ajuda, exportação/exclusão, marketing) e `/pagar/cartao` | mobile-dev | Em revisão | `f8c8bc5`, `c235edb`, `26b0e22` |
| T6-11 | App: excluir conta, exportar dados, consentimentos, ajuda, denúncia, push aberto (SEC-166) | mobile-dev | Em revisão | `a6eb5bb`; Security e QA validam |
| T6-12 | App: cartão pela página segura; PIX por relógio do servidor, socket único (I11) | mobile-dev | Em revisão | `972ca19`, `5f2f1b8` |
| T6-13 | Entrega em até 2 h: ETA, teto 120 min, alerta de atraso, lotes (E.1, E.2) | backend-dev + mobile-dev | Em revisão | API `a7a4ce7`, painéis `f8c8bc5`, app na Home/Loja/Sacola |
| T6-14 | Reverificação do Security da Onda 6 | security-engineer | Aceito | `onda-7-pos-dec-059.md`: G4 aprovado com ressalvas; sem Crítico/Alto |
| T6-15 | Reteste do QA: BUG-011, 012, 014 a 017 e SEC-166 no app | qa-engineer | Aceito (parcial) | Preliminar em `onda-7-reverificacao.md`; BUG-011 a 018 fechados; resto vai para T8-01 |

## Direção v3 no app (DEC-051/052)

| ID | Tarefa | Dono | Status |
|---|---|---|---|
| V3-01 | Base (tokens, fontes, ícones, kit, 12 objetos SVG, botão, selos, estados, movimento) | mobile-dev | Em revisão (`90e67d1`) |
| V3-02 | Home, Loja, Produto, Sacola | mobile-dev | Em revisão (`0d0acbf`, `225ec94`, `4c7fd23`) |
| V3-03 | Checkout, pagamento sem destaque ao PIX, acompanhamento, pedidos, trocas, avaliação, conta | mobile-dev | A fazer |
| V3-04 | Barra inferior do produto desalinhada (pendência conhecida) | mobile-dev | A fazer |
| V3-05 | Painéis web na linguagem v3 | mobile-dev | A fazer (só se sobrar capacidade) |
| V3-06 | Apresentações e protótipo v3 (PDFs, zip de demo) | product-designer | Entregue (`908e098`, `6ddaf7d`, `docs/entrega-demo`) |

## Onda 7 — tarefas

| ID | Tarefa | Dono | Status | Pronto quando |
|---|---|---|---|---|
| T7-01 | Seed completo (backlog §4: 4 cidades, 12+ lojas, pedidos em todos os estados, divergência de conciliação, credenciais demo) | backend-dev | Em andamento | Seeds por onda e de pedidos existem; validar com `docker compose` |
| T7-02 | Teste de carga (k6) e relatório | qa-engineer | Em revisão (script pronto; execução local indicativa; staging: fundador) | Executa `qa/plano-carga.md`; relatório em `docs/qa/` |
| T7-03 | Docs técnicas sem divergência (ADRs 011/012, modelo de dados, OpenAPI, DS v3) | tech-lead | A fazer | |
| T7-04 | Adendo do TL da Onda 1 (A-08) e revisão do TL das Ondas 6 e correções | tech-lead | A fazer | |

## Onda 8 — tarefas (fechamento)

| ID | Tarefa | Dono | Status | Depende de |
|---|---|---|---|---|
| T8-00 | Integrar contrato W/Y em app e web (F3, F4, F6, W.1 no `/excluir-conta`, M.6) e congelar o HEAD de teste | mobile-dev | Em andamento | Backend entregue |
| T8-01 | Reteste completo do QA no HEAD congelado: suítes (3 e2e seguidos), BUG-010 e 019 a 025, SEC-166/176/180 no app; atualizar `qa/bugs/` | qa-engineer | A fazer | T8-00 |
| T8-02 | Revisão funcional final | qa-engineer | A fazer | T8-01 |
| T8-03 | Heurísticas de Nielsen (10, todas as telas v3) | product-designer | A fazer | T8-00, V3-03 |
| T8-04 | Usabilidade simulada, 4 tarefas (comprar, cadastrar loja, aprovar loja, pedir troca): toques, telas e palavras | qa-engineer + designer | A fazer | T8-00 |
| T8-05 | Acessibilidade (rótulos, contraste, leitor de tela, fonte grande) e 3G simulado | qa-engineer | A fazer | T8-00; aparelho real é do fundador |
| T8-06 | Capturas em `docs/telas/` (índice, uma por tela e estado: carregando, vazio, erro) | qa-engineer | A fazer | T8-00 |
| T8-07 | Teste de carga k6: script pronto, execução em staging | fundador (execução), qa (análise) | Bloqueado | Staging, servidor |
| T8-08 | Correção de achados Crítico/Alto/Média viável e reteste | backend-dev + mobile-dev + QA | A fazer | T8-01 a T8-06 |
| T8-09 | Parecer final do Security (SEC-180, 176, 178, 179, 129, dependências, segredos) | security-engineer | A fazer | T8-08 |
| T8-10 | **G4 final**: parecer do QA | qa-engineer | A fazer | T8-08, T8-09 |
| T8-11 | README e docs finais; guia de deploy e checklist das lojas com a v3 e a Onda 6; relatório final curto | tech-lead + PM | A fazer | T8-10 |
| T8-12 | Decisão do G5 (checklist, pareceres, itens do fundador) | CEO | Bloqueado | T8-10; itens 4 a 10 do `status.md` |
| T8-13 | Merge para `main` e tag `v1.0.0` | CEO | Bloqueado | Autorização do fundador (D-08); G4 |

Ordem: T8-00 → T8-01 → (T8-02 a T8-06; máx. 3 agentes) → T8-08 → T8-09 → T8-10 → T8-11 → T8-12/T8-13. Congelar o HEAD antes do T8-01: o QA não pode testar alvo que muda (causa do preliminar reprovado).

Critério de saída: ver `plano-execucao.md` §3.

## Ressalvas carregadas

| Ressalva | Sev. | Destino | Status |
|---|---|---|---|
| SEC-129 (proxy/BFF obrigatórios em produção) | Média | T8-09; boot de produção testado (`production-boot`); Security confirma | Aberta |
| DT-021 (retenção), DT-031 (rotação BFF), DT-023 (vetor oficial do MP) | Dívida | Antes do G4/G5 | Aberta |
| BUG-010 (teto do sharp) | Média | T8-01 / T8-07 (precisa de carga) | Aberta |
| SEC-180, 176 (app), 178, 179 | Média/Baixa | T8-09 | Corrigidos, falta reverificar |
| BUG-019 a 025 | Baixa/Média | T8-01 | Corrigidos, falta reteste |
| Playwright do login em 2 passos contra API real (SEC-115) | Teste | T8-01 | Aberta |
| O-1 (`correctEmail` grava e depois 429), O-2 (`resetTicket` no corpo) | Baixa | T6-09 | Aberta |
| Adendo do TL (A-08) | Média | T7-04 | Aberta |

Paralelismo: no máximo 3 agentes. Sequência: mobile-dev em T8-00 (e V3-03); o QA só inicia o T8-01 com o HEAD congelado.

Fora da 1.0: WB-161 (Won't) e Fase 2 (WB-300 a 334).

## RAID

Escala: Probabilidade/Impacto = Alta, Média, Baixa. Datas no formato AAAA-MM-DD.

| ID | Tipo | Descrição | Prob. | Impacto | Dono | Ação | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Risco | Split do Mercado Pago exige conta e KYC aprovado do lojista (OAuth); lojistas pequenos podem ser barrados ou desistir. Recebimento centralizado pode ser atividade regulada (backlog §7.2) | Alta | Alta | tech-lead (ADR) / CEO | WB-155: ADR antes de 1B fechar; implementar atrás de `PaymentProvider`; fluxo de lojista sem KYC aprovado fica "pendente de conta" e não vende; levar parecer jurídico como pendência ao fundador | Aberto (2026-11-18) |
| R-02 | Risco | 109 Must em 134 histórias; escopo grande para capacidade de agentes e limites de uso | Alta | Alta | PM / CEO | Ondas pequenas, Should/Could por último, corte só pela ordem do backlog §5, nunca LGPD, pagamento, arrependimento, auditoria, denúncia | Aberto (2026-11-18) |
| R-03 | Risco | Rede bloqueada para documentação externa (MP, Apple, Google, HIG, Material, WCAG): integrações e regras de loja baseadas em conhecimento prévio podem estar desatualizadas | Alta | Média | backend-dev / security-engineer | Marcar `[HIPÓTESE]`; isolar MP no adaptador; testes de contrato com mocks; listar itens a conferir contra a doc oficial em `docs/gestao/pendencias-v1.md` antes do G5 | Aberto (2026-11-18) |
| R-04 | Risco (materializado) | Limites de uso de 5 h dos agentes: 4 ocorrências em 2026-11-18 (06:50, 11:50, 16:50 e 18:10 UTC), novas em 2026-11-19 (checkpoints `d4145d9`, `6739d33`) e 1 reinício de container; o trabalho commitado sobreviveu, o não commitado virou `chore: checkpoint` | Alta | Alta | PM / CEO | Marcos pequenos (uma tarefa Tnn por vez, 1 a 3 histórias); commit e push por marco; `wip:` no branch; tarefa em curso termina antes de parar; board como ponto de retomada; no retorno, retomar a primeira tarefa não Aceita; checkpoints só como rede de segurança, nunca como entrega | Aberto, mitigado por processo (2026-11-18) |
| R-05 | Risco | Container reinicia a qualquer momento e perde trabalho não enviado | Alta | Média | Todos os agentes / PM | Protocolo anti-reinício do plano §1: push imediato, `wip:` no remoto, migrações e seed idempotentes, retomada pelo board | Mitigado por processo (2026-11-18) |
| R-06 | Risco | Sem aparelho real: não há como validar push (FCM/APNs), câmera/upload, teclado, haptics, desempenho em 3G e celular fraco; fontes do design marcadas [M]/[S] | Alta | Média | qa-engineer / product-designer | Validar em Expo Web, emulação e testes automatizados; classificar o que só roda em aparelho; lista de verificação manual no checklist das lojas; pendência explícita ao fundador antes do G4/G5 | Aberto (2026-11-18) |
| R-07 | Risco | Colisão de arquivos entre agentes paralelos (lockfile, `shared`, `apps/web` com dois perfis) | Média | Média | PM / tech-lead | Fronteiras do plano §2; mudança de contrato publicada antes do consumidor; commits de dependência isolados | Aberto (2026-11-18) |
| R-08 | Risco | Aprovação das lojas (Apple/Google) pode recusar o app ou demorar; exige conteúdo de usuário moderado e exclusão de conta | Média | Alta | CEO / fundador | WB-038/124 e 213/214 antes do G5; checklist das lojas na Onda 8; tempo de revisão não verificado [HIPÓTESE] | Aberto (2026-11-18) |
| R-09 | Risco | Textos legais (termos, privacidade, troca) e encarregado de dados sem revisão jurídica | Média | Alta | CEO / fundador | Minuta do PO; revisão do fundador/jurídico antes do G5; registrar como pendência no relatório final | Aberto (2026-11-18) |
| R-10 | Risco | Teste de usabilidade sem usuários reais (meta "comprar em menos de 2 min") | Alta | Média | qa-engineer / product-designer | Roteiro com contagem de toques, telas e palavras como proxy; marcar `[HIPÓTESE]`; validação real no piloto | Aberto (2026-11-18) |
| R-11 | Risco | Tempo real, estoque e pagamento têm condições de corrida (pedido duplicado, estoque negativo, PIX tardio) | Média | Alta | backend-dev / tech-lead | Idempotência, transações e testes de concorrência na Onda 4; WB-158 e 157 | Aberto (2026-11-18) |
| R-12 | Risco | Teste de carga em ambiente local não representa produção | Média | Baixa | qa-engineer | Relatório informa o ambiente e os limites; recomendação de dimensionamento como estimativa | Aberto (2026-11-18) |
| R-13 | Risco | SEC-129: sem `WEB_TRUSTED_PROXY_HOPS`/`WEB_CLIENT_IP_HEADER` e `BFF_SHARED_SECRET` em produção, todos os usuários do painel compartilham o IP do BFF; um atacante tranca o login de lojistas (espera por conta+IP) e derruba o cadastro de lojas | Média | Média | backend-dev / mobile-dev / tech-lead | Onda 8: tornar obrigatório (boot recusa) e documentar no guia de deploy; bloqueia G4 | Aberto (2026-11-18) |
| R-14 | Risco | Seed e `docker compose` nunca executados com Docker (sandbox sem Docker, DEC-026): falha só aparece no ambiente do fundador | Média | Média | qa-engineer / backend-dev | Validar em CI com serviços; registrar em `pendencias-v1.md` o que só roda fora do sandbox | Aberto (2026-11-18) |
| R-15 | Risco (materializado) | Sem fotos reais e sem ilustrador: a v3 usa 12 objetos SVG; não atinge o nível 3D do iFood (DEC-051); lojas com foto gerada parecem app vazio | Alta | Média | Fundador / product-designer | Fundador contrata ilustrador e lojistas enviam fotos reais; até lá, kit SVG; não prometer o nível iFood | Aberto (2026-11-19) |
| R-16 | Risco | Mercado Pago sandbox sem credencial: PIX, cartão, split e webhook nunca rodaram contra o MP real; só provedor simulado e testes de contrato (DT-023) | Alta | Alta | Fundador / backend-dev | Fundador entrega credenciais de sandbox; teste real antes do G4; split e KYC (R-01) só no piloto | Aberto (2026-11-19) |
| R-17 | Risco | Merge para `main` e tag `v1.0.0` exigem autorização do fundador; todo o trabalho está só no branch `claude/admiring-lamport-62tq1a` | Média | Alta | CEO / Fundador | Pedir autorização com o parecer G4; se houver perda do branch, perde-se a entrega | Aberto (2026-11-19) |
| R-18 | Risco | Entrega em até 2 h (DEC-053) obriga a operação manual de despacho: sem alguém na fila de Logística no horário, o alerta de atraso dispara em todos os pedidos e a promessa quebra | Alta | Alta | Fundador / PM | Definir quem despacha e o horário (`logistica_horario`); começar com poucas lojas e raio pequeno; teto 120 min é parâmetro | Aberto (2026-11-19) |
| R-19 | Risco | Verificação atrasada: correções da Onda 6 e do QA entram sem reteste; QA e Security precisam de nova rodada antes do G4, no mesmo limite de uso dos devs | Alta | Média | PM / QA / Security | Security já reverificou; QA preliminar reprovado por evidência; T8-01 no HEAD congelado | Aberto, reduzido (2026-11-19) |
| R-20 | Risco | Motoboys sem parecer jurídico (vínculo, Lei 12.009, seguro): operar a entrega da Webag antes é risco legal | Média | Alta | Fundador | Parecer (J8) antes de contratar ou pagar qualquer motoboy | Aberto (2026-11-19) |
| R-21 | Risco | Direção v3 só cobre Home, Loja, Produto e Sacola; checkout, pedidos e conta ficam em v2: app inconsistente se o G4 chegar antes | Média | Média | mobile-dev / PM | V3-03 antes de T8-02 e T8-06; se faltar tempo, cortar painéis v3 (V3-05) primeiro | Aberto (2026-11-19) |
| R-22 | Risco | G4 do QA depende de CI estável: e2e foi instável (BUG-019/024); o backend mostrou 763/763 em 3 execuções, o QA não repetiu | Média | Alta | QA / backend-dev | T8-01: 3 e2e completos seguidos no HEAD congelado; falha intermitente vira BUG Média | Aberto (2026-11-19) |
| R-23 | Risco | Alvo móvel: app e web seguem integrando contrato enquanto QA e Security testam | Alta | Média | PM / mobile-dev | T8-00 termina e congela o HEAD; mudança posterior só com bug Crítico/Alto | Aberto (2026-11-19) |
| R-24 | Risco | Login e envio de código sem WAF/CAPTCHA: SEC-180 mitigado no código, abuso distribuído segue possível | Média | Média | Fundador / Security | Decisão do fundador (status item 12); `privacy:cancel-deletion` e alerta já existem | Aberto (2026-11-19) |
| R-25 | Risco | Aparelho real, MP sandbox e carga em staging só o fundador faz; sem eles G4 fica "com ressalvas" e o G5 não é recomendável | Alta | Alta | Fundador | Pedir no parecer G4; agrupar os 3 numa única sessão do fundador | Aberto (2026-11-19) |
| I-04 | Problema | Arquivos `qa/bugs/BUG-0xx.md` mostram ABERTO para itens já corrigidos (BUG-019 a 025) | — | Baixa | qa-engineer | Atualizar no reteste | Aberto (2026-11-19) |
| I-02 | Problema | O-1: `correctEmail` responde 429 após gravar o e-mail novo | — | Baixa | backend-dev | Checar o limite antes de gravar (Onda 3A) | Aberto (2026-11-18) |
| I-03 | Problema | Parecer escrito do tech-lead que reverifica B1 e I1-I8 não está no repositório | — | Média | tech-lead | A-08: adendo em `review-onda1-api.md` | Aberto (2026-11-18) |
| I-01 | Problema | CLAUDE.md §1/§2 desatualizado: cita Cajamar (brief e DEC-009 trazem Campo Limpo Paulista) e app para lojista (é painel web, DEC-005) | — | Baixa | CEO | Atualizar CLAUDE.md; até lá vale o brief | Aberto (2026-11-18) |
| A-01 | Ação | Publicar threat models de auth e pagamento antes de T0-06 e da Onda 1B | — | Alta | security-engineer | Concluído; veto da Onda 1 retirado | Fechada (2026-11-18) |
| A-02 | Ação | Contrato de Pedido/Carrinho | — | Alta | backend-dev | Entregue na Onda 3/4 | Fechada (2026-11-19) |
| A-03 | Ação | Fechar SEC-121 (app), 122, 123, 126 | — | Baixa | mobile-dev | Conferir na reverificação do Security (T6-14); estado não verificado | A verificar |
| A-04 | Ação | Revisão do Security e do TL das sub-ondas 2A e 2B | — | Alta | security-engineer / tech-lead | Feita (DEC-030, `review-onda2-api.md`) | Fechada (2026-11-19) |
| A-05 | Ação | Specs de tela das Ondas 3A e 3B (T2-12) | — | Alta | product-designer | Uma onda à frente do mobile-dev | A fazer |
| A-06 | Ação | Endurecimento pré-4A (DT-004, DT-015, DT-022, DT-023) | — | Média | backend-dev / tech-lead | Checkout já existe; reavaliar na T8-03 | A verificar |
| A-07 | Ação | Atualizar CLAUDE.md/Resumo: status do `docs/status.md` ainda mostra a Onda 1 com veto | — | Baixa | CEO | Refletir DEC-029 fechada | A fazer |
| A-08 | Ação | Adendo do TL: reverificação do B1 e confirmação de I1-I8 (incl. I7 parte 2) | — | Média | tech-lead | Ver I-03 | A fazer |
| D-01 | Dependência | Credenciais Mercado Pago do fundador (sandbox e produção) | — | Alta | Fundador | Pendência para o relatório final; dev usa simulado | Aberto |
| D-02 | Dependência | Contas Apple Developer e Google Play Console | — | Alta | Fundador | Necessárias só no G5 | Aberto |
| D-03 | Dependência | Domínio, servidor e e-mail transacional reais | — | Média | Fundador | Guia de deploy na Onda 8 | Aberto |
| D-04 | Dependência | Validar em aparelho real (push, desempenho) antes de publicar | — | Alta | Fundador | Lista no checklist das lojas | Aberto |
| D-05 | Dependência | Credenciais FCM/APNs e EAS | — | Média | Fundador | Push real e builds | Aberto |
| D-06 | Dependência | Textos jurídicos (termos, privacidade, exclusão), parecer de motoboys, arrependimento, NFS-e | — | Alta | Fundador / jurídico | `decisoes.md` J1 a J16 | Aberto |
| D-07 | Dependência | Ilustrador, fotos reais, WhatsApp de suporte, cotação de motoboys | — | Média | Fundador | Ver R-15 | Aberto |
| D-08 | Dependência | Autorização do merge para `main` e da tag v1.0.0 | — | Alta | Fundador | Ver R-17 | Aberto |
| D-09 | Dependência | Razão social, CNPJ, endereço, WhatsApp de suporte, horário real da logística (HIP-E08), decisão de WAF/CAPTCHA, geocodificador (opcional) | — | Média | Fundador | `status.md` itens 7, 9, 11 a 13 | Aberto (2026-11-19) |
| D-10 | Dependência | Execução do k6 em staging e do roteiro em aparelho real | — | Alta | Fundador | T8-07, R-25 | Aberto (2026-11-19) |
