# Checklist da Definição de pronto da missão (brief §8)

> Dono: project-manager. Data: 2026-11-20 (código congelado `036e791`, DEC-083; tip `3d40959` só documentos). Fonte dos itens: `../00-visao/brief.md` §8 e §7. Status: FEITO (com evidência) | PARCIAL | DEPENDE DO FUNDADOR | FASE 2 | NÃO FEITO. Nada aqui foi reexecutado pelo PM: a evidência é o documento citado. Quando o documento é de um commit anterior ao HEAD, isso está dito.

## Parecer em uma linha por gate

| Gate | Estado | Fonte |
|---|---|---|
| G4 Security | APROVADO, sem veto (adendo final em `036e791`; SEC-187/188 corrigidos) | `../seguranca/revisoes/parecer-final-rc.md` |
| G4 Tech-lead | COM RESSALVAS; bloqueantes A-01 e A-02 corrigidos no RC | `../arquitetura/reviews/onda-8.md`, DEC-076, DEC-077 |
| G4 QA | APROVADO COM RESSALVAS em `036e791`, sem veto; não é aprovação de G5 | `../qa/relatorios/g4-final-tip.md` (antes: `g4-final.md`, `g4-rc.md`) |
| G5 Security | APROVADO COM CONDIÇÕES C1 a C9 (inalteradas) e C10 reescrita (passo operacional, inclui SEC-189) | idem Security |
| G4 definitivo (CEO) | Pareceres prontos; **falta o CEO registrar o fechamento** (DEC-075, DEC-083) | `../decisoes.md` |
| G5 | **Não decidido**: depende de 19 itens do fundador (`../status.md`) | |

## Resumo por categoria

| Categoria | FEITO | PARCIAL / artefato sem execução real | DEPENDE DO FUNDADOR | NÃO FEITO (time) |
|---|---|---|---|---|
| §8 (18 itens) | 2a, 3a, 3c, 4a, 5b, 5d, 6a, 6b (8) | 1b, 2b, 2c, 3b, 5a, 5c (6) | 1a, 1c, 4b (3) | 7 (1) |
| §7 (9 itens) | testes API, E2E, funcional, Nielsen, usabilidade (simulada), capturas (6) | acessibilidade/3G, "corrigir tudo" (2) | CI real e carga em staging (2, também PARCIAL) | nenhum |
| Fase 2 | Fora da 1.0 (WB-300 a 334, WB-161 Won't; DEC-071) | | | |

Nota: "FEITO" significa provado por documento do QA ou do Security sobre `036e791` (ou commit anterior, quando dito). Os itens FEITO do §7 em commit anterior ao tip estão marcados na linha.

## §8 Definição de pronto

| # | Item do brief | Status | Evidência e o que falta |
|---|---|---|---|
| 1a | Tudo em `yagogavilan/webag` (privado), na `main` | DEPENDE DO FUNDADOR | Tudo está só no branch `claude/admiring-lamport-62tq1a`; merge na `main` exige autorização (R-17, D-08). Visibilidade privada do repositório: não verificada pelo PM |
| 1b | Histórico limpo | PARCIAL | 552 commits no branch, vários `chore: checkpoint` (R-04). Decisão do CEO: squash no merge ou manter; registrar em `decisoes.md` |
| 1c | Tag `v1.0.0` | DEPENDE DO FUNDADOR | Só depois do G4 definitivo e da autorização escrita (T8-13) |
| 2a | `git clone` + `.env` + `pnpm setup` sobe banco, Redis, storage, e-mail de teste, API, painéis, com migrações e seed | FEITO (Linux), com ressalva | `0d902ab`: `pnpm run setup` 28,8 s, `pnpm smoke` 36/36 (`../qa/relatorios/g4-final.md` §2). `036e791`: `SKIP_DOCKER=1 pnpm run setup` 15,5 s, 57 migrações, `pnpm smoke` 35 ok (`g4-final-tip.md` §2/§3); o setup com Docker nas portas padrão não foi exercitado no tip (portas ocupadas). O `setup` gera o `.env` a partir de `infra/env.example` (não há `.env.example` na raiz) |
| 2b | App abre no Expo Go/dev build e no navegador | PARCIAL | Navegador: compra no app web contra API real, entrega, retirada e cartão OK (`g4-final-tip.md` §3). Expo Go e dev build em aparelho: NÃO TESTADO (fundador; roteiro em `g4-rc.md` §10) |
| 2c | Instruções Windows, macOS, Linux | PARCIAL | Escritas no `../../README.md` (linhas 25 a 38), incluindo WSL e chip Apple. **Windows e macOS não testados** (o próprio README diz) |
| 3a | Dados de demonstração realistas da região (lojas em bairros reais, pedidos, trocas, avaliações) | FEITO | Seed: 12 lojas, 12 funcionários, 6 clientes, 60 pedidos (`g4-final.md` §2); trocas dos 3 tipos e avaliações na regressão (§6). Cobertura das 4 cidades e dos bairros: não conferida pelo PM |
| 3b | Fotos livres | PARCIAL | Seed usa imagens geradas e objetos SVG da v3; não são fotos reais (R-15). Fotos reais são do fundador/lojistas |
| 3c | Credenciais demo (cliente, lojista dono, funcionário, admin) no README | FEITO | `../../README.md` seção "Credenciais de demonstração" (linha 40); logins exercitados em `papeis.mjs` (`g4-final.md` §7) |
| 4a | Pagamento simulado ponta a ponta | FEITO | `g4-final-tip.md`: compra PIX e cartão `fake`, regressão de negócio 55 PASS; webhook, estorno e ledger em `g4-final.md` §6; k6 S5 com 3.001 webhooks (`0d902ab`). Provedor `fake`, não o real |
| 4b | Pronto para Mercado Pago real só com as chaves | PARCIAL / DEPENDE DO FUNDADOR | Adaptador atrás de `PaymentProvider` e alternância por `.env` (WB-160). **Mercado Pago real nunca rodou** (G4 R4; C3 do G5, R-16). Só se prova com as credenciais sandbox |
| 5a | Dockerfiles de produção, variáveis documentadas | FEITO (artefato) / PARCIAL (execução) | `../../apps/api/Dockerfile`, `../../apps/web/Dockerfile`, `../../infra/docker-compose.prod.yml`, `infra/env.prod.example`, `infra/nginx/`, `infra/scripts/gen-secrets.sh`. Nunca executados contra servidor, nginx e TLS reais (C7 do Security, R-14) |
| 5b | Guia de deploy (VPS com Docker + opção gerenciada) | FEITO | `../deploy/guia-deploy.md`. Ressalva: não validado em servidor real |
| 5c | Backup do banco | FEITO (artefato) | `../../infra/backup/` (backup, restore, `test-restore.sh`); RPO 24 h aceito como dívida (DEC-076). Restore em ambiente real: NÃO TESTADO; SEC-161 aberto (reaplicar exclusões após restore) |
| 5d | Checklist de publicação nas lojas | FEITO (documento) | `../deploy/checklist-publicacao-lojas.md`; condições C1 a C10 do Security; inventário `../seguranca/inventario-lojas.md`. A publicação em si é o G5 |
| 6a | README completo | FEITO | `../../README.md`. Reconferência após os commits pós-RC: não registrada por documento |
| 6b | `docs/` atualizado: arquitetura, ADRs, modelo de dados, contrato, design system, decisões, hipóteses | FEITO | ADR-001 a 016, `../arquitetura/modelo-dados.md`, OpenAPI e cliente em dia (`generate:check` OK no tip), `../design/`, `../decisoes.md` (até DEC-083), HIP-* em `../produto/`. Revisão técnica: `../arquitetura/reviews/onda-8.md` |
| 7 | Relatório final curto (construído, como rodar, depende do fundador, hipóteses, backlog fase 2) | NÃO FEITO | T8-11 não entregue. Insumos prontos: `../status.md` ("Estado final do v1.0", depende do fundador), `../produto/` (hipóteses e fase 2, DEC-071). Dono: tech-lead + PM; sem dependência do fundador |

## §7 Qualidade (itens de revisão final)

| Item | Status | Evidência e o que falta |
|---|---|---|
| Testes API (pedido, estoque, pagamento, comissão, trocas) | FEITO | QA em `036e791`: unitários 335/335; e2e 873/874 em 1 execução (1 flake de fixture, BUG-029; arquivo sozinho 11/11) (`g4-final-tip.md` §3). 3 execuções seguidas só no RC `f622bc9` (auto-relato do backend) |
| E2E Playwright nos painéis | FEITO | `036e791`: 65 com API falsa (3 ignorados), 9 contra a API real (3 ignorados); a 2ª execução do real falha por BUG-030 (Baixa). Maestro no app: só emulado (ADR-006); aparelho é do fundador |
| CI GitHub Actions (lint, typecheck, testes, build) | PARCIAL / DEPENDE DO FUNDADOR | `../../.github/workflows/ci.yml` existe; `generate:check`, lint e typecheck passam localmente no tip. `pnpm build` completo: NÃO TESTADO no tip. Execução real no GitHub: nunca verificada. BUG-019 fechado |
| Teste funcional de todos os fluxos | FEITO | `../qa/relatorios/revisao-funcional.md` (PO: 104 de 178 aceitas antes de B1 a B5) e regressões do RC e do tip (`g4-final-tip.md` §3/§4: compra, troca, SEC-187/188, páginas legais). Contagem aceita/pendente **não foi refeita** |
| Heurística de Nielsen | FEITO | `../qa/relatorios/heuristica-nielsen.md` (nota 6,5/10; H-01 bloqueante corrigido: `cart.tsx` agora vai ao `/checkout`) e `revisao-visual-final.md` (70 telas; V8.1 a V8.7 corrigidos). Nielsen **não foi repetido** depois das correções |
| Usabilidade com tarefas reais (comprar, cadastrar loja, aprovar loja, pedir troca) | FEITO (simulada) | `../qa/relatorios/usabilidade-4-tarefas.md`: toques, telas e palavras por tarefa; `[HIPÓTESE]`, sem usuários reais (R-10). Compra: ~15 toques e ~2 min 15 s com o banco, desvio aceito pelo PO até testar com 5 pessoas |
| Teste de carga | PARCIAL / DEPENDE DO FUNDADOR | k6 local indicativo no RC (API ~950 MB); **não repetido no tip** (R3). Staging é do fundador (T8-07) |
| Acessibilidade e 3G | PARCIAL | Por código e heurística; fonte grande, leitor de tela e 3G em aparelho: NÃO TESTADO |
| Capturas de todas as telas em `docs/telas/` | FEITO | `../telas/README.md` (70 telas oficiais), revisadas em `revisao-visual-final.md`. Recaptura após V8.x: parcial (as 7 correções citam recaptura; não conferi cada uma) |
| Corrigir tudo antes de entregar | PARCIAL | Nenhum Crítico, Alto ou Médio aberto; 3 bugs Baixa novos (BUG-029 a 031) e 9 SEC Baixa abertos (abaixo) |

## Abertos que o checklist carrega (2026-11-20)

| ID | Sev. | Situação |
|---|---|---|
| BUG-019, 026, 027 | Média/Baixa | FECHADOS pelo QA no tip |
| BUG-028 | Baixa | a, c, d fechados; (b) parcial: Chromium da versão do workspace |
| BUG-029, 030 | Baixa | Abertos; são de teste (flake de fixture; dependência do pedido `WB-DM002`) |
| BUG-031 | Baixa | Aberto; app sem "Versão para revisão" nos textos legais |
| SEC-187, SEC-188 | Média/Baixa | FECHADOS (corrigidos, provados pelo QA e confirmados pelo Security) |
| SEC-189 | Baixa | Aberto; antes de `LEGAL_REVIEWED=true` (C10) |
| SEC-186, 146, 149, 150, 161, 162, 163 c/d, 174 | Baixa | Abertos; prazos em `../seguranca/revisoes/parecer-final-rc.md` "Abertos"; SEC-169 aceito (DEC-067) |
| BUG-010 | Média | Fechado de forma indicativa; capacidade real só em staging |
| Divergências sem dono | PO | Tarifa do provedor em pedido cancelado e fechamento da logística x "até 2 h" (G4 R6, §9.1) |

## Depende do fundador (19 itens; 0 feitos)

Lista numerada e por urgência em `../status.md`. Ligam-se a este checklist: 1a e 1c (item 1), 2b e acessibilidade/3G (item 2), 4b (itens 3 e 11), carga (item 4), CI real (item 16), 3b (item 19), 5a/5c em ambiente real (item 5), textos legais e G5 (itens 5 a 13).
