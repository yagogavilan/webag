# Checklist da Definição de pronto da missão (brief §8)

> Dono: project-manager. Data: 2026-11-20 (HEAD `f2f7e2d`). Fonte dos itens: `../00-visao/brief.md` §8 e §7. Status: FEITO (com evidência) | PARCIAL | DEPENDE DO FUNDADOR | NÃO FEITO. Nada aqui foi reexecutado pelo PM: a evidência é o documento citado. Quando o documento é de um commit anterior ao HEAD, isso está dito.

## Parecer em uma linha por gate

| Gate | Estado | Fonte |
|---|---|---|
| G4 Security | APROVADO (sem veto); adendo mantém | `../seguranca/revisoes/parecer-final-rc.md` |
| G4 Tech-lead | COM RESSALVAS; bloqueantes A-01 e A-02 corrigidos no RC | `../arquitetura/reviews/onda-8.md`, DEC-076, DEC-077 |
| G4 QA | APROVADO COM RESSALVAS só para `0d902ab`. **Reteste do RC `f622bc9` e dos commits pós-RC: PENDENTE** (`g4-rc.md` não existe) | `../qa/relatorios/g4-final.md` |
| G5 Security | APROVADO COM CONDIÇÕES C1 a C10 (todas de terceiros, do fundador ou de reverificação; nenhuma de código novo do app) | idem Security |
| G4 definitivo (CEO) | **Não decidido**: falta o QA no RC | DEC-075 |

## §8 Definição de pronto

| # | Item do brief | Status | Evidência e o que falta |
|---|---|---|---|
| 1a | Tudo em `yagogavilan/webag` (privado), na `main` | DEPENDE DO FUNDADOR | Tudo está só no branch `claude/admiring-lamport-62tq1a`; merge na `main` exige autorização (R-17, D-08). Visibilidade privada do repositório: não verificada pelo PM |
| 1b | Histórico limpo | PARCIAL | 533 commits no branch, vários `chore: checkpoint` (R-04). Decisão do CEO: squash no merge ou manter; registrar em `decisoes.md` |
| 1c | Tag `v1.0.0` | DEPENDE DO FUNDADOR | Só depois do G4 definitivo e da autorização escrita (T8-13) |
| 2a | `git clone` + `.env` + `pnpm setup` sobe banco, Redis, storage, e-mail de teste, API, painéis, com migrações e seed | FEITO (Linux) | `../qa/relatorios/g4-final.md` §2: clone novo, `pnpm run setup` em 28,8 s, 51 migrações, `pnpm smoke` 36/36 (commit `0d902ab`); `setup-do-zero.md`. Ressalva: o brief cita `.env.example`; o `setup` gera o `.env` a partir de `infra/env.example` (não há `.env.example` na raiz) |
| 2b | App abre no Expo Go/dev build e no navegador | PARCIAL | Navegador: 5/5 contra API real (`g4-final.md` §3). Expo Go e dev build em aparelho: NÃO TESTADO (roteiro em `g4-final.md` §11) |
| 2c | Instruções Windows, macOS, Linux | PARCIAL | Escritas no `../../README.md` (linhas 25 a 38), incluindo WSL e chip Apple. **Windows e macOS não testados** (o próprio README diz) |
| 3a | Dados de demonstração realistas da região (lojas em bairros reais, pedidos, trocas, avaliações) | FEITO | Seed: 12 lojas, 12 funcionários, 6 clientes, 60 pedidos (`g4-final.md` §2); trocas dos 3 tipos e avaliações na regressão (§6). Cobertura das 4 cidades e dos bairros: não conferida pelo PM |
| 3b | Fotos livres | PARCIAL | Seed usa imagens geradas e objetos SVG da v3; não são fotos reais (R-15). Fotos reais são do fundador/lojistas |
| 3c | Credenciais demo (cliente, lojista dono, funcionário, admin) no README | FEITO | `../../README.md` seção "Credenciais de demonstração" (linha 40); logins exercitados em `papeis.mjs` (`g4-final.md` §7) |
| 4a | Pagamento simulado ponta a ponta | FEITO | `g4-final.md` §6: PIX e cartão simulados, webhook, estorno total e parcial, ledger fecha; k6 S5 com 3.001 webhooks, ledger idêntico (§8) |
| 4b | Pronto para Mercado Pago real só com as chaves | PARCIAL / DEPENDE DO FUNDADOR | Adaptador atrás de `PaymentProvider` e alternância por `.env` (WB-160). **Mercado Pago real nunca rodou** (G4 R4; C3 do G5, R-16). Só se prova com as credenciais sandbox |
| 5a | Dockerfiles de produção, variáveis documentadas | FEITO (artefato) / PARCIAL (execução) | `../../apps/api/Dockerfile`, `../../apps/web/Dockerfile`, `../../infra/docker-compose.prod.yml`, `infra/env.prod.example`, `infra/nginx/`, `infra/scripts/gen-secrets.sh`. Nunca executados contra servidor, nginx e TLS reais (C7 do Security, R-14) |
| 5b | Guia de deploy (VPS com Docker + opção gerenciada) | FEITO | `../deploy/guia-deploy.md`. Ressalva: não validado em servidor real |
| 5c | Backup do banco | FEITO (artefato) | `../../infra/backup/` (backup, restore, `test-restore.sh`); RPO 24 h aceito como dívida (DEC-076). Restore em ambiente real: NÃO TESTADO; SEC-161 aberto (reaplicar exclusões após restore) |
| 5d | Checklist de publicação nas lojas | FEITO (documento) | `../deploy/checklist-publicacao-lojas.md`; condições C1 a C10 do Security; inventário `../seguranca/inventario-lojas.md`. A publicação em si é o G5 |
| 6a | README completo | FEITO | `../../README.md` (setup, credenciais, plataformas, celular). Reconferir após os commits pós-RC |
| 6b | `docs/` atualizado: arquitetura, ADRs, modelo de dados, contrato, design system, decisões, hipóteses | FEITO | ADR-001 a 016 em `../arquitetura/adr/`, `../arquitetura/modelo-dados.md`, OpenAPI e cliente em dia (`pnpm generate:check` OK, `g4-final.md` §3), `../design/`, `../decisoes.md` (até DEC-082), hipóteses HIP-* em `../produto/`. Revisão técnica final: `../arquitetura/reviews/onda-8.md` |
| 7 | Relatório final curto (construído, como rodar, depende do fundador, hipóteses, backlog fase 2) | NÃO FEITO | T8-11 não entregue. Insumos prontos: `../status.md` (depende do fundador), `../produto/` (hipóteses e fase 2, DEC-071). Dono: tech-lead + PM. Ação do time, sem dependência do fundador |

## §7 Qualidade (itens de revisão final)

| Item | Status | Evidência e o que falta |
|---|---|---|
| Testes API (pedido, estoque, pagamento, comissão, trocas) | FEITO | Backend: e2e 827/827 em 3 execuções seguidas e unitários 329 no RC `f622bc9` (`fila-backend-dev.md` §RC; auto-relato do dev). **O QA mediu 763/763 e 308 no `0d902ab`**, não repetiu no RC |
| E2E Playwright nos painéis | FEITO | 46 passam e 8 contra a API real (`g4-final.md` §3, commit `0d902ab`). Maestro no app: só em modo emulado (ADR-006); aparelho é do fundador |
| CI GitHub Actions (lint, typecheck, testes, build) | PARCIAL / DEPENDE DO FUNDADOR | `../../.github/workflows/ci.yml` existe; lint, typecheck e build passam localmente (`g4-final.md` §3). Execução real no GitHub: não verificada. BUG-019 (ordem do seed no e2e a frio): correção commitada (`f2f7e2d`), falta o QA rodar 1 execução a frio |
| Teste funcional de todos os fluxos | FEITO | `../qa/relatorios/revisao-funcional.md` (PO: 104 de 178 aceitas, 37 com pendência; B1 a B5 depois entregues, DEC-073) e `g4-final.md` §5 a §7. Contagem aceita/pendente **não foi refeita** depois dos bloqueadores |
| Heurística de Nielsen | FEITO | `../qa/relatorios/heuristica-nielsen.md` (nota 6,5/10; H-01 bloqueante corrigido: `cart.tsx` agora vai ao `/checkout`) e `revisao-visual-final.md` (70 telas; V8.1 a V8.7 corrigidos). Nielsen **não foi repetido** depois das correções |
| Usabilidade com tarefas reais (comprar, cadastrar loja, aprovar loja, pedir troca) | FEITO (simulada) | `../qa/relatorios/usabilidade-4-tarefas.md`: toques, telas e palavras por tarefa; `[HIPÓTESE]`, sem usuários reais (R-10). Compra: ~15 toques e ~2 min 15 s com o banco, desvio aceito pelo PO até testar com 5 pessoas |
| Teste de carga | PARCIAL / DEPENDE DO FUNDADOR | k6 local indicativo: S1, S4-B, S5, S9 (`g4-final.md` §8); RSS ~950 a 975 MB com imagens. Staging é do fundador (R5, T8-07) |
| Acessibilidade e 3G | PARCIAL | Revisão por código e heurística; fonte grande, leitor de tela e 3G em aparelho: NÃO TESTADO |
| Capturas de todas as telas em `docs/telas/` | FEITO | `../telas/README.md` (70 telas oficiais), revisadas em `revisao-visual-final.md`. Recaptura após V8.x: parcial (as 7 correções citam recaptura; não conferi cada uma) |
| Corrigir tudo antes de entregar | PARCIAL | Ver "Abertos" abaixo; nenhum Crítico/Alto |

## Abertos que o checklist carrega

| ID | Sev. | Situação |
|---|---|---|
| BUG-019 | Média (teste) | Corrigido no código; reteste a frio do QA pendente. Arquivo `../qa/bugs/BUG-019.md` ainda pode dizer ABERTO (I-04) |
| SEC-187 | Média | Corrigido (`f576ec5`); o Security reverifica; C10 do G5; falta a parte do app (Z5.m1, mobile-dev, em andamento no checkout, não commitada) |
| SEC-188 | Baixa | Corrigido (`7ea3613`); o Security reverifica |
| SEC-186, 146, 149, 150, 161, 162, 163 c/d, 174 | Baixa | Abertos; prazos em `../seguranca/revisoes/parecer-final-rc.md` "Abertos"; SEC-169 aceito (DEC-067) |
| BUG-010 | Média | Fechado de forma indicativa pelo QA; capacidade real só em staging |
| Divergências sem dono | PO | Tarifa do provedor em pedido cancelado e fechamento da logística x "até 2 h" (G4 R6, §9.1) |
