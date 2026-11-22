# Status da missão v1.0 — Webag

> Mantido pelo PM a partir dos documentos e do `git log` (552 commits). Atualizado em 2026-11-20. **Código congelado em `036e791` (DEC-083); tip `3d40959` só tem documentos.** Detalhe: `gestao/board.md`. Plano: `gestao/plano-execucao.md` §3. Checklist do brief §8: `gestao/checklist-dod.md`.

## Estado final do v1.0

| Item | Estado |
|---|---|
| Gate atual | **G4 aprovado com ressalvas** (QA em `qa/relatorios/g4-final-tip.md`, sem veto; Security em `seguranca/revisoes/parecer-final-rc.md`, adendo final, sem veto; tech-lead com ressalvas, A-01/A-02 corrigidos). **G5 não decidido**: Security APROVADO COM CONDIÇÕES C1 a C9 (inalteradas) e C10 reescrita (passo operacional, inclui SEC-189). O fechamento formal do G4 é do CEO |
| DoD feita pelo time | **cerca de 97% (ESTIMATIVA do PM, não medição)**; em itens do checklist: §8 8 de 18 FEITO + 2 FEITO só como artefato; §7 6 de 9 FEITO. Ver `gestao/checklist-dod.md` |
| Dependências do fundador | 19 itens, **0 feitos** (lista abaixo) |
| Merge em `main` e tag `v1.0.0` | Não feitos: dependem de autorização do fundador (R-17, D-08). Tudo está só no branch `claude/admiring-lamport-62tq1a` |
| Mercado Pago real, aparelho real, k6 em staging | Nunca rodaram; só provedor `fake`, navegador e k6 local indicativo |
| Críticos / Altos / Médios abertos | 0 / 0 / 0 (QA e Security, 2026-11-20) |

### Backlog aberto (nenhum bloqueia G4)

| ID | Sev. | Situação | Prazo |
|---|---|---|---|
| BUG-029 | Baixa | Flake de teste: nome de categoria colide entre arquivos paralelos | Backlog |
| BUG-030 | Baixa | `e2e-real/04` consome o pedido `WB-DM002`; 2ª execução no mesmo banco falha | Backlog |
| BUG-031 | Baixa | App não mostra "Versão para revisão" nos termos/privacidade (o site mostra; DEC-082) | Antes de publicar os textos |
| BUG-028 (b) | Baixa | Falta Chromium na versão do workspace (`pnpm web:compra`); a, c, d fechados | Backlog |
| SEC-189 | Baixa | Seed com razão social "(exemplo)" e CNPJ zerado pode virar versão imutável | Antes de `LEGAL_REVIEWED=true` (C10) |
| SEC-186 | Baixa | Conta com exclusão pendente não pode ser bloqueada | Antes do piloto (recomendado) |
| SEC-146, 149, 150, 161, 162, 163 (c/d), 174 | Baixa | Abertos; prazos em `seguranca/revisoes/parecer-final-rc.md` "Abertos" | Conforme parecer |
| SEC-169 | Baixa | Aceito (DEC-067) | n/a |
| DT-063, DT-021, DT-031 | Dívida | Expurgo de 5 anos (só depois do jurídico, DEC-081); retenção; rotação do BFF. SEC-129: boot de produção exige proxy/BFF (confirmado) | Pós-jurídico / antes do deploy |
| BUG-010 | Média | Fechado de forma indicativa; capacidade real só em staging | Staging |
| Observações do QA | UX/PO | "Pedir troca" ainda aparece após arrependimento aprovado (servidor recusa 422); abertura de documento (SEC-188) conta ao emitir a URL | PO / Security avaliam |

### O que NÃO foi feito e por quê

| Item | Por quê |
|---|---|
| Relatório final curto (brief §8 item 7, T8-11) | Não entregue; é ação do time (tech-lead + PM), sem dependência do fundador |
| Aparelho real, 3G, Expo Go, push FCM/APNs | Só o fundador tem aparelho e contas (R-06) |
| Mercado Pago real, split e KYC | Falta credencial sandbox (R-16); split só no piloto (R-01) |
| k6 em staging; contêiner com 1 GB ou mais | Não há servidor (fundador) |
| Deploy, nginx/TLS, restore de backup em ambiente real | Sem servidor; artefatos existem e nunca foram executados (C7) |
| Windows e macOS no setup; `pnpm run setup` com Docker nas portas padrão | Não testados (QA usou outro projeto Docker por portas ocupadas) |
| CI no GitHub Actions rodando de verdade | Só verificado localmente (item 16) |
| Textos legais aprovados; ECA Digital (J17) | São proposta do PO; falta advogado (DEC-080/081/082) |
| Revisão funcional, Nielsen e usabilidade refeitos após as correções | Não repetidos; usabilidade é simulada, sem usuários reais |
| `SEED_HOURS=realistic`, domingo/feriado, build de produção completo, `/legal/*` do app com `LEGAL_REVIEWED=true` | Declarados NÃO TESTADO pelo QA |
| Fase 2 (WB-300 a 334) e WB-161 | Fora da 1.0 por decisão (DEC-071) |
| Merge em `main` e tag | Autorização do fundador |

## Resumo
- Back-end, painéis web e app cliente rodam de ponta a ponta no provedor simulado (pedido, PIX/cartão, logística, trocas, financeiro, LGPD). **Mercado Pago real nunca foi testado.**
- G0 a G3 aprovados. G4 aprovado com ressalvas sobre o commit final `036e791` pelo QA e pelo Security; nenhum veto.
- G5 depende do fundador (itens 5 a 13 e jurídico) e da reverificação C7 em deploy real.

## Feito

| Item | Evidência |
|---|---|
| Ondas 0 a 7 (fundação até seed, k6 local e docs técnicas) | `gestao/board.md` |
| Onda 8: contrato integrado, congelamento (DEC-069, 077, 083), retestes do QA em `0d902ab`, RC `f622bc9` e tip `036e791`, revisão funcional, Nielsen, usabilidade das 4 tarefas, 70 capturas | `qa/relatorios/` |
| Bloqueadores B1 a B5, modo manutenção, regras DEC-072, A-01 a A-13 do tech-lead | DEC-073 a DEC-077 |
| V8.1 a V8.7 e textos legais integrados como proposta | DEC-078, DEC-082 |
| SEC-180 a 185, SEC-187 e SEC-188 corrigidos e provados; BUG-026 e 027 fechados | `parecer-final-rc.md`, `g4-final-tip.md` |
| README, guia de deploy, checklist das lojas, inventário de dados das lojas | `deploy/`, `seguranca/inventario-lojas.md` |

## Falta (trabalho do time, sem depender de você)
1. tech-lead + PM: relatório final curto (T8-11).
2. backend-dev: SEC-186 (antes do piloto), SEC-189 (antes de `LEGAL_REVIEWED=true`), expurgo de 5 anos (DT-063) depois do jurídico.
3. mobile-dev: BUG-031. QA: atualizar `qa/bugs/` se restar divergência (I-04).
4. CEO: registrar o fechamento do G4 e a decisão de G5 quando houver itens do fundador.

## Números (fonte e data)

| Item | Valor | Fonte |
|---|---|---|
| API unitários | 335/335 | `qa/relatorios/g4-final-tip.md` §3 (`036e791`) |
| API e2e | 873/874 em 1 execução (1 flake de fixture, BUG-029; o arquivo sozinho passa 11/11) | idem |
| Web Vitest / app Jest / shared | 684 / 439 / 3, todos passam | idem |
| Playwright | 65 com API falsa (3 ignorados); 9 contra API real (3 ignorados) | idem |
| Smoke / regressão de negócio | 35 ok, 0 falha / 55 PASS, 1 NÃO TESTADO (FIN-5, split real) | idem |
| Subida do zero | `SKIP_DOCKER=1 pnpm run setup` 15,5 s, 57 migrações (setup completo com Docker nas portas padrão não exercitado) | idem §2 |
| Carga | k6 local do RC, indicativo: sem 5xx; memória da API ~950 MB; não repetido no tip | `qa/relatorios/g4-rc.md`, `g4-final-tip.md` R3 |

## Depende do fundador (lista única, por urgência; 0 de 19 feitos)

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

## Como chegamos aos ~97% (ESTIMATIVA do PM, não é medição)

Pesos por onda definidos por mim pelo esforço relativo (O0 5, O1 8, O2 10, O3 12, O4 15, O5 15, O6 12, O7 5, O8 18; soma 100). O0 a O5 100% (65). O6 100% (12: Security reverificou e o QA retestou em `0d902ab`, RC e tip). O7 90% (4,5; carga em staging é do fundador). O8 cerca de 16 de 18: feitos 8.0, 8.1, 8.2, 8.3, 8.4, 8.6, 8.9, 8.10; 8.8 feito salvo SEC-186; 8.5 meio; 8.11 sem o relatório final; 1 ponto da onda é decisão do G5 e da tag (fundador). Soma: 65 + 12 + 4,5 + 16 = 97,5.

- **Dependências do fundador: 0 de 19 itens feitos** (sem % honesto: pesos e prazos de terceiros diferentes). Para a **tag** trava o item 1; para o G4 sem ressalva, os itens 2 a 4; para **publicar nas lojas**, os itens 5 a 13 e o jurídico.
- Sem prazos em calendário: o gargalo é o seu tempo e terceiros (revisão das lojas pode levar dias e recusar [HIPÓTESE, sem fonte verificada]).

---

## v1.1 (R1 a R5): estado em 2026-11-22

Cor: **AMARELO**. Planejado, nada construído. Detalhe: `gestao/plano-v1-1.md`; tarefas: `gestao/board.md` (seção v1.1).

| | Itens |
|---|---|
| Pronto | Pesquisa, 6 PRDs e backlog WB-340 a 399 (DEC-088 a 102); telas R1 e R2 com protótipo (`design/telas/v1-1-indice.md`, notas 3 a 4, sem teste com usuário); threat model e decisões D-01 a D-06 (DEC-103); revisão de segurança do desempenho do app; plano e board da v1.1 |
| Em andamento | Telas R3 e R4 (designer); trabalho de desempenho da API na árvore **sem commit** (R-29) |
| Bloqueado | **Disco a 99%** (I-05): sem espaço, commit e `pnpm` falham |
| A fazer, em ordem | W0 (commit e revisão do desempenho, bugs BUG-029 a 032, SEC-186/189/195, DoR do PO) -> R1 -> R2 -> R3 -> R4 (após SEC-193 e SEC-198) -> R5 -> relatório visual |
| Esforço | 168 UT, faixa 122 a 234 `[HIPÓTESE]`; sem datas |
| Flags desligadas em produção até parecer | cupom (J22, J23, J27), coleta e Análises (J24), app do motoboy e rastreio (J8, J26), IA real (J25) |

Depende do fundador (por urgência):
1. **Liberar espaço em disco** do ambiente (I-05).
2. Decidir as D-A a D-E do `plano-v1-1.md` §9 (via CEO): 2ª instância do mobile-dev em pasta separada, ordem R4/R5, cortes extras, revisão antes do merge.
3. **Levar J22 a J27 ao advogado**, em lote (J22 já trava o piloto do v1.0).
4. **Aparelho Android** e forma de gerar o APK (R4): sem ele o app do motoboy só passa em emulador.
5. Em cada release: 1 sessão para rodar local (`pnpm iphone`, Docker Desktop) e testar; **5 pessoas do perfil** para a meta de cadastro em 60 s; 5 lojistas para a porta falsa.
6. Orçamento de cupom (hoje R$ 0), cotação de motoboys (custo previsto) e preço do módulo Análises, quando chegar a hora.
