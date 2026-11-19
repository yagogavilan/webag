# Status da missão v1.0 — Webag

> Mantido pelo PM a partir dos documentos e do `git log` (428 commits). Atualizado em 2026-11-19 (HEAD `0029e53`). Detalhe: `gestao/board.md`. Plano: `gestao/plano-execucao.md` (Onda 8 em §3).

## Resumo
- Back-end, painéis web e app cliente rodam de ponta a ponta (pedido, PIX/cartão, logística, trocas, financeiro, LGPD). Provedor de pagamento é simulado: **Mercado Pago real nunca foi testado**.
- **G0 a G3 aprovados. G4 ainda não decidido.** Security: G4 **aprovado com ressalvas** (`seguranca/revisoes/onda-7-pos-dec-059.md`). QA: parecer preliminar **reprovado por falta de evidência** (`qa/relatorios/onda-7-reverificacao.md`); depois disso o backend corrigiu BUG-019 a 025 e entregou 3 e2e completos seguidos, 763/763. O QA ainda não retestou: é a 1ª tarefa da Onda 8.
- **G5 (lojas) depende de você** (lista abaixo). Play e App Store: "com ressalvas" do Security.
- Em andamento: o mobile-dev integra o contrato novo (W.1 a W.8, Y.2) em app e web.
- Nada foi mesclado em `main`; tudo está em `claude/admiring-lamport-62tq1a` (precisa da sua autorização).

## Situação por onda

| Onda | Escopo | Estado |
|---|---|---|
| 0 a 5 | Fundação, identidade, loja/catálogo, descoberta, pagamento/ledger, logística/trocas/financeiro | Concluídas com ressalvas (QA e Security) |
| 6 | LGPD, marketing, relatórios, ajuda, denúncia, cartão seguro | Entregue e reverificada pelo Security (SEC-166 fechado). Falta reteste de QA |
| 7 | Seed, carga, docs técnicas | Seed e docs prontos; carga: k6 escrito e só execução curta indicativa local. Execução em staging é sua |
| 8 | Fechamento (retestes, revisões, capturas, G4/G5, tag) | Não iniciada. Plano em `gestao/plano-execucao.md` §3 |

## Bugs e SEC em aberto

| ID | Sev. | Situação |
|---|---|---|
| BUG-010 | Média | Teto de imagens em paralelo (sharp): não retestado; depende de carga |
| BUG-019 a 025 | Baixa a Média | Corrigidos pelo backend/mobile (commits `5792b34`, `70964ce`, `aa41a2a`, `c35695e`, `b57dcea`); **falta o reteste do QA** (arquivos `qa/bugs/` ainda dizem ABERTO) |
| SEC-180 | Média | Corrigido no backend (`c62bb3b`); falta Security reverificar |
| SEC-176 | Média | API e web fechados; app feito (M.2), falta reverificar |
| SEC-178, 169 | Baixa | Parciais (W.1 feito no backend; falta o web ler; SEC-169 residual aceito, DEC-067) |
| SEC-179 | Baixa | Corrigido no app (M.5), falta Security confirmar para o App Privacy |
| SEC-129, DT-021, DT-031 | Média/Dívida | Boot de produção exige proxy/BFF: parecer final do Security confirma |
| SEC-146, 149, 150, 161 a 163, 174 | Baixa | Abertos, não bloqueiam |

Nenhum Crítico ou Alto aberto segundo o Security (2026-11-19).

## Números (fonte e data)

| Item | Valor | Fonte |
|---|---|---|
| API e2e (banco e Redis reais) | **763/763, 0 pulados**, 3 execuções seguidas em `12b3f68` | `gestao/fila-backend-dev.md` (backend-dev, 2026-11-19). QA ainda não repetiu |
| API unitários | 308 (41 arquivos) | idem |
| Web Vitest / app Jest | 535 (QA, `98764b2`) / 350 (QA, HEAD `b550088`) | `qa/relatorios/onda-7-reverificacao.md` |
| Playwright | 38 com API falsa; 8 contra API real (só com ajustes de ambiente na época; BUG-025 corrigido depois) | idem |
| Subida do zero | `pnpm run setup` em 31 s | `qa/relatorios/setup-do-zero.md` |
| Carga | Local, indicativo: p95 abaixo das metas (home 63 ms, busca 96 ms), sem 5xx | `qa/carga/README.md`; não representa produção |

## Depende do fundador (lista única, por urgência)

Para o G4 (antes de decidir o release candidate)
1. **Aparelho real** (Android de entrada e iPhone): roteiro em `qa/relatorios/onda-7-reverificacao.md` §10 (push, câmera, GPS, teclado, PIX/cartão/3DS, 3G, fontes).
2. **Mercado Pago sandbox** (Access Token e Public Key): teste real de PIX, cartão, webhook assinado e estorno.
3. **Teste de carga em staging** (k6, script pronto em `qa/carga/`): só você pode executar; precisa de servidor de staging.

Para o G5 (lojas)
4. Contas **Apple Developer** e **Google Play Console** (pago).
5. **Domínio**, servidor e e-mail transacional (a página `/excluir-conta` precisa estar no ar para o Play).
6. **FCM/APNs e conta EAS**.
7. **Razão social, CNPJ e endereço** da Webag (Decreto 7.962/2013; tela "Sobre") e identificador `br.com.webag.app` (não muda depois).
8. **Jurídico J1 a J16** (`decisoes.md`): termos, privacidade, arrependimento e frete, exclusão (72 h, IP truncado, 5 anos, J15), promessa "até 2 h" e compensação (J14), textos de estorno (J16), motoboys (J8; nenhum contratado antes), NFS-e (J11), ressarcimento do lojista (J5, J12).
9. **Número de WhatsApp de suporte** (configurável no admin).
10. **Mercado Pago de produção** (Client ID/Secret OAuth, segredo do webhook); split e KYC dos lojistas só no piloto (R-01).

Decisões
11. **Horário real da logística** (HIP-E08: hoje seg a sáb 09h às 20h) e quem despacha motoboy para cumprir "até 2 h" (R-18).
12. **WAF/CAPTCHA** na frente de login e envio de código: decidir (custo; Security recomenda para o piloto).
13. Geocodificador (opcional, custo; DEC-067: sem ele o resíduo do SEC-169 fica aceito).
14. **Revisar as hipóteses** (HIP-*; destaque HIP-C01 comissão 15%, HIP-L01 frete, HIP-T05 troca, HIP-E08, HIP-P06 a P10) e se a Webag absorve a tarifa do provedor na recusa da loja.
15. Ilustrador/fotos reais e cotação de 3 a 5 motoboys (qualidade e custo do piloto, não bloqueiam o código).
16. **Autorização do merge em `main` e da tag `v1.0.0`**; publicar nas lojas só com G4 e G5 e sua autorização escrita.

## Caminho até a v1.0 (estimativa do PM, não é medição)

Premissas: peso por onda definido por mim pelo esforço relativo (O0 5, O1 8, O2 10, O3 12, O4 15, O5 15, O6 12, O7 5, O8 18; soma 100); onda concluída com ressalvas conta 100%; O6 90% (falta reteste); O7 80%; O8 5% (roteiros e k6 prontos, nada executado). Resultado: 65 + 10,8 + 4 + 0,9 = **cerca de 80% do trabalho dos agentes**. Os 20% restantes são a Onda 8 inteira. Esse número **não inclui** o fundador: dos 16 itens acima, nenhum está feito, e os itens 1 a 3 e 16 travam o G4 e a tag. Sem prazos em calendário (o gargalo é o seu tempo e terceiros).
