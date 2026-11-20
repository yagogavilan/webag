# Status da missão v1.0 — Webag

> Mantido pelo PM a partir dos documentos e do `git log` (533 commits). Atualizado em 2026-11-20 (HEAD `f2f7e2d`). Detalhe: `gestao/board.md`. Plano: `gestao/plano-execucao.md` §3. Checklist do brief §8: `gestao/checklist-dod.md`.

## Resumo
- Back-end, painéis web e app cliente rodam de ponta a ponta no provedor simulado (pedido, PIX/cartão, logística, trocas, financeiro, LGPD). **Mercado Pago real nunca foi testado.**
- **G0 a G3 aprovados. G4: Security APROVADO** (`seguranca/revisoes/parecer-final-rc.md`); **tech-lead COM RESSALVAS** (bloqueantes A-01 e A-02 corrigidos no RC, `arquitetura/reviews/onda-8.md`); **QA aprovou com ressalvas só o commit `0d902ab`** (`qa/relatorios/g4-final.md`). **Reteste do QA no RC `f622bc9` e nos commits pós-RC: PENDENTE** (`g4-rc.md` ainda não existe). Sem ele o CEO não fecha o G4 definitivo (DEC-075).
- **G5 (lojas):** Security APROVADO COM CONDIÇÕES C1 a C10; todas dependem do fundador ou de reverificação.
- Nada foi mesclado em `main`; tudo está em `claude/admiring-lamport-62tq1a`.

## Feito

| Item | Evidência |
|---|---|
| Ondas 0 a 7 (fundação até seed, k6 local e docs técnicas) | `gestao/board.md` |
| Onda 8: contrato integrado, congelamento (DEC-069, DEC-077), reteste do QA em `0d902ab`, revisão funcional, Nielsen, usabilidade das 4 tarefas, 70 capturas, revisão visual | `qa/relatorios/` |
| Bloqueadores B1 a B5, modo manutenção, regras DEC-072 em código, A-01 a A-13 do tech-lead | DEC-073 a DEC-077 |
| Correções visuais V8.1 a V8.7 e textos legais integrados como proposta | DEC-078, DEC-082 |
| SEC-180 a 185 corrigidos e provados por ataque; SEC-187 (`f576ec5`) e SEC-188 (`7ea3613`) corrigidos, falta reverificar | `parecer-final-rc.md` |
| README, guia de deploy, checklist das lojas, inventário de dados das lojas | `deploy/`, `seguranca/inventario-lojas.md` |

## Rodando agora
- mobile-dev: Z5.m1 (vigência e encarregado na tela legal do app, SEC-187 parte do app), ainda sem commit.
- QA: reteste do RC `f622bc9` (marcado PENDENTE até o relatório existir).

## Falta (trabalho do time, sem depender de você)
1. QA: reteste do RC e dos commits pós-RC (V8.x, DEC-052, textos legais, SEC-187/188) e 1 execução a frio do e2e (BUG-019); atualizar `qa/bugs/` (I-04).
2. Security: reverificar SEC-187 e SEC-188 e os commits pós-RC (C10).
3. backend-dev: SEC-186 (Z4.1, recomendado antes do piloto), expurgo de 5 anos (DT-063) depois do jurídico (DEC-081).
4. tech-lead + PM: relatório final curto (brief §8 item 7, T8-11).
5. CEO: G4 definitivo depois de 1 e 2.

## Bugs e SEC em aberto (2026-11-20)

| ID | Sev. | Situação |
|---|---|---|
| BUG-019 | Média (teste) | Corrigido (`f2f7e2d`); falta o QA rodar a frio |
| SEC-187 | Média | Corrigido no backend e web; app em andamento; C10 do G5 |
| SEC-188 | Baixa | Corrigido; falta reverificar |
| SEC-186, 146, 149, 150, 161, 162, 163 (c/d), 174 | Baixa | Abertos; não bloqueiam; prazos no parecer do Security |
| SEC-169 | Baixa | Aceito (DEC-067) |
| BUG-010 | Média | Fechado de forma indicativa; capacidade real só em staging |
| SEC-129, DT-021, DT-031 | Média/Dívida | Boot de produção exige proxy/BFF; Security confirmou |

Nenhum Crítico ou Alto aberto (Security e QA, 2026-11-20).

## Números (fonte e data)

| Item | Valor | Fonte |
|---|---|---|
| API e2e | QA: 763/763 em `0d902ab` (1ª execução a frio falhou 1: BUG-019). Backend: 827/827 em 3 execuções no RC `f622bc9` (auto-relato; QA não repetiu) | `qa/relatorios/g4-final.md`, `gestao/fila-backend-dev.md` |
| API unitários | QA 308 em `0d902ab`; backend 329 no RC | idem |
| Web Vitest / app Jest | 601 / 398 (QA, `0d902ab`) | `g4-final.md` §3 |
| Playwright | 46 com API falsa; 8 contra API real (QA, `0d902ab`) | idem |
| Subida do zero | `pnpm run setup` 28,8 s; `pnpm smoke` 36/36 | `g4-final.md` §2 |
| Carga | k6 local, indicativo: sem 5xx; memória da API ~950 a 975 MB com imagens | `g4-final.md` §8 |

## Depende do fundador (lista única, por urgência; nenhum item está feito)

Para o G4 definitivo e a tag
1. **Autorização do merge em `main` e da tag `v1.0.0`** (e se o histórico entra em squash).
2. **Aparelho real** (Android de entrada e iPhone): roteiro em `qa/relatorios/g4-final.md` §11.
3. **Mercado Pago sandbox** (Access Token e Public Key): fumaça real (C3 do Security).
4. **k6 em staging** (script em `qa/carga/`; precisa de servidor).

Para o G5 (lojas)
5. **Domínio, deploy e e-mail transacional** (C1; `/excluir-conta`, `/privacidade` e `/termos` no ar com TLS) e cofre dos segredos (C2).
6. Contas **Apple Developer** e **Google Play Console** (pago).
7. **FCM/APNs e conta EAS**; identificador `br.com.webag.app` (não muda depois).
8. **Razão social, CNPJ e endereço** da Webag (Decreto 7.962/2013; tela "Sobre").
9. **Encarregado (DPO)** indicado ou dispensa avaliada e canal publicado (C5).
10. **Jurídico J1 a J21** (`decisoes.md`; textos em `produto/legal/`): termos, privacidade, arrependimento, exclusão (72 h, 5 anos, J15), "até 2 h" e compensação (J14), estorno (J16), motoboys (J8), NFS-e (J11), ressarcimento (J5, J12), **ECA Digital e verificação de idade (J17)**. O rótulo "versão para revisão" só sai com a aprovação (DEC-078, `LEGAL_REVIEWED`).
11. **Mercado Pago de produção** (Client ID/Secret OAuth, segredo do webhook); split e KYC só no piloto (R-01).
12. Data Safety e App Privacy preenchidos pelo inventário (C6) e conta demo para o revisor em staging (C8).
13. **Número de WhatsApp de suporte** (configurável no admin).

Decisões e conteúdo
14. **Horário real da logística** (HIP-E08: hoje seg a sáb 09h às 20h) e quem despacha motoboy para cumprir "até 2 h" (R-18).
15. **WAF/CAPTCHA** no login e no envio de código (custo; Security recomenda para o piloto).
16. **Sentry** (DSN) e **GitHub Actions** rodando de verdade (CI hoje só verificado localmente).
17. Geocodificador (opcional, custo; sem ele o SEC-169 fica aceito).
18. Revisar as hipóteses (HIP-C01 comissão 15%, HIP-L01 frete, HIP-T05 troca, HIP-E08) e se a Webag absorve a tarifa do provedor em cancelamento (G4 §9.1).
19. Ilustrador/fotos reais e cotação de 3 a 5 motoboys (não bloqueiam o código). Pentest externo antes de escalar (recomendação do Security).

## Caminho até a v1.0 (ESTIMATIVA do PM, não é medição)

Premissas: pesos por onda definidos por mim pelo esforço relativo (O0 5, O1 8, O2 10, O3 12, O4 15, O5 15, O6 12, O7 5, O8 18; soma 100). O0 a O5 100% (65 pontos, concluídas com ressalvas). O6 95% (11,4; Security reverificou, QA reteste do RC pendente). O7 90% (4,5; carga em staging é do fundador). O8 76% (13,7 de 18): dentro dos 18, o trabalho do time vale 17 e a decisão do G5 e da tag vale 1 (do fundador); feitas 8.0, 8.2, 8.3, 8.4, 8.6 e 8.9; 8.1 (a 0d902ab) e 8.8 parciais; 8.5 meio; 8.10 e 8.11 parciais (falta QA no RC e relatório final).

- **Trabalho do time: cerca de 95%** (65 + 11,4 + 4,5 + 13,7 = 94,6). Faltam: reteste do QA no RC, reverificação do Security (SEC-187/188), relatório final, SEC-186 e o fechamento do G4 pelo CEO.
- **Dependências do fundador: 0 de 19 itens feitos** (não dá para converter em % honesto: itens têm pesos e prazos de terceiros diferentes). Para a **tag**, trava o item 1 e, para o G4 sem ressalva, os itens 2 a 4. Para **publicar nas lojas**, travam os itens 5 a 13 e a aprovação do jurídico.
- Sem prazos em calendário: o gargalo é o seu tempo e terceiros (revisão das lojas pode levar dias e recusar [HIPÓTESE, sem fonte verificada]).
