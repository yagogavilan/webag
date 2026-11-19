# Status da missão v1.0 — Webag

> Mantido pelo PM a partir dos documentos e do `git log` (312 commits). Atualizado em 2026-11-19. Detalhe por tarefa: `gestao/board.md`. Plano: `gestao/plano-execucao.md`.

## Resumo em 5 linhas
- Back-end, painéis web e app cliente existem e rodam de ponta a ponta (pedido, pagamento PIX/cartão, logística da Webag, trocas, financeiro, LGPD).
- **G0 a G3 aprovados. G4 (release candidate) ainda NÃO**: faltam correções de bugs/segurança, nova rodada de QA e Security e validação em aparelho.
- **G5 (lojas) depende de você**: contas, credenciais, textos jurídicos e autorização. Lista única no fim deste arquivo.
- Em andamento agora: bugs de logística do QA (BUG-016, BUG-012) e a direção visual v3 nas telas restantes do app.
- Nada foi mesclado em `main`; tudo está no branch `claude/admiring-lamport-62tq1a` (depende da sua autorização, item 18).

## Situação por onda

| Onda | Escopo | Veredicto | Observação |
|---|---|---|---|
| 0 | Fundação (monorepo, CI, compose, auth base, shells) | Concluída | `arquitetura/reviews/review-onda0-api.md` |
| 1 | Identidade, configuração, base de pagamento | Concluída com ressalvas | Security e TL aprovaram com ressalvas (DEC-029). Pendentes: adendo do TL (A-08), SEC-129 (proxy/BFF obrigatórios em produção), DT-021 |
| 2 | Lojista, aprovação de lojas, catálogo | Concluída com ressalvas | QA aprovou com ressalvas (`qa/relatorios/onda-2.md`); BUG-001 a 008 corrigidos; BUG-009 (limite de loja nova) feito como SEC-132; BUG-010 (concorrência do sharp) aberto, Média |
| 3 | Descoberta do cliente (endereços, PostGIS, home, busca, loja, produto, sacola) | Concluída com ressalvas | QA aprovou com ressalvas; BUG-018 ("Mais vendidos") aberto; GPS, acessibilidade, desempenho e offline não testados (sem aparelho) |
| 4 | Pagamento, ledger, checkout, pedido, tempo real | Concluída com ressalvas | Dinheiro sólido (20.000 cenários contra oráculo, ledger soma zero, concorrência). Security reverificou: aprovado com ressalvas (DEC-043). Mercado Pago real nunca testado (sem credencial) |
| 5 | Logística da Webag (DEC-036), trocas (DEC-037), financeiro, painéis | Concluída com ressalvas | QA: jornada completa passou; reprovada para G4 até BUG-011 e BUG-016. BUG-011 corrigido no código (`2cf034b`), sem reteste do QA |
| 6 | LGPD, marketing, relatórios, ajuda, denúncia, cartão seguro | Em andamento (código entregue, falta verificação) | API e painéis web entregues; app com excluir conta (72 h de arrependimento), exportar dados, consentimentos (`a6eb5bb`). Security havia reprovado o G5 (DEC-049/050); correções SEC-152 a 160 e SEC-155 commitadas (`a7a4ce7`), **sem reverificação do Security nem do QA** |
| 7 | Seed completo, carga, docs técnicas | Em andamento | Seed por onda e de pedidos de demo existe (`apps/api/seed`); plano de carga escrito (`qa/plano-carga.md`), **teste de carga não executado**; seed/compose nunca rodados com Docker no sandbox |
| 8 | Revisão final, capturas, G4, tag | Não iniciada | README e guia de deploy existem (`docs/deploy/`); falta funcional final, Nielsen, usabilidade, capturas, parecer G4, tag `v1.0.0` |

## Gates

| Gate | Situação | Falta / quem bloqueia |
|---|---|---|
| G0 a G3 | Aprovados | — |
| G4 Release candidate | **Não aprovado** | (1) Corrigir e retestar BUG-012, 014, 015, 016, 017 (QA); (2) Security reverificar Onda 6 e liberar SEC-155 e SEC-156 (G4); (3) SEC-129 e DT-021 (retenção) antes do G4; (4) QA re-executar ondas 3 a 6 com BUG-011 e SEC-166 fechados; (5) onda 8 (funcional, Nielsen, usabilidade simulada); (6) aparelho real (fundador). Bloqueiam: backend-dev, mobile-dev, QA, Security; fundador no aparelho |
| G5 Publicação | **Não aprovado** | G4 + SEC-166 (telas excluir/exportar no app: feitas, falta QA/Security validar); decisão SEC-154/159 (72 h, IP truncado); contas Apple/Google; textos jurídicos; checklist `deploy/checklist-publicacao-lojas.md`; autorização escrita do fundador. Bloqueia: fundador |

## Rodando agora (2026-11-19)

| Frente | Dono | O quê |
|---|---|---|
| Back-end | backend-dev | Entrega em até 2 h (DEC-053): ETA por distância, teto 120 min, alerta de atraso e lote de corrida **commitados** (`a7a4ce7`); em curso (working tree): horário e pausa da logística (BUG-016) |
| Back-end, fila | backend-dev | Q.2/Q.3 (BUG-012, 014, 015, 017, 018, 019), R.6 (N+1 em listas), DT-059 a 064, SEC-161 a 167 (Baixas) |
| App | mobile-dev | Direção v3 (DEC-051/052): base, Home, Loja, Produto e Sacola entregues; faltam checkout, pedido, trocas, conta e restantes; telas de excluir conta e exportar dados entregues; PIX por relógio do servidor e socket único feitos (I11) |
| Painéis web | mobile-dev | Onda 6 entregue (ETA, lotes, contato, parâmetros, disputas, avaliações, ajuda, exportação e exclusão); página `/pagar/cartao` entregue |
| Revisões | QA, Security, TL | Aguardando as correções para reverificar |

Obs.: o ETA de 2 h só funciona na operação se alguém despachar motoboy manualmente (R-20).

## Bugs e SEC abertos que bloqueiam o G4

| ID | Sev. | Situação |
|---|---|---|
| BUG-016 | Média (bloqueia piloto) | Horário/pausa da logística: em curso |
| BUG-012 | Média | Cancelar corrida deixa pedido parado: aberto |
| BUG-014 | Média | Retirada não cancela em 48 h: aberto (bloqueia G4 se retirada entrar no piloto) |
| BUG-015 | Média | "Não recebi" e "pedir cancelamento": rotas feitas na Onda 6 (B.1); QA precisa retestar |
| BUG-017 | Média | Parâmetros do admin sem efeito: aberto |
| SEC-155 | Alta | Cupom primeira compra: corrigido em `a7a4ce7`, falta reverificar |
| SEC-166 | Alta | Excluir/exportar no app: entregue em `a6eb5bb` e nos painéis, falta reverificar |
| SEC-129 | Média | Proxy/BFF obrigatórios em produção: aberto |
| SEC-156, 152, 153, 157, 158, 160 | Média | Corrigidos em `a7a4ce7`, falta reverificar |
| BUG-011 | Alta | Corrigido (`2cf034b`), falta reteste |

Não bloqueiam (Média/Baixa): BUG-010, 013, 018, 019; SEC-154 (decisão sua), 159, 161 a 165, 167. Os arquivos `qa/bugs/BUG-0xx.md` ainda dizem "ABERTO" para os já corrigidos: o QA atualiza no reteste.

## Números reais

| Item | Valor | Fonte |
|---|---|---|
| API e2e (banco real) | 563 passaram, 8 esperados (`it.fails`), 3 falhas de teste frágil/Onda 6 em andamento | `qa/relatorios/onda-3-5.md` (03:31 UTC; antes das correções R e S) |
| API unitários | 257 (34 arquivos hoje) | DEC-046 |
| Web (Vitest) | 430 testes | DEC-045 |
| Playwright | 19 contra API falsa (8 arquivos) + 4 jornadas contra API real (cadastrar loja, aprovar, moderar, pedido-entrega-troca) | DEC-045, `apps/web/e2e-real` |
| Mobile | 30 arquivos de teste, 2 fluxos Maestro | repositório |
| Histórias | 164 no backlog (DEC-039) + extras; ondas 0 a 6 cobertas no código; contagem história a história **não verificada** | `produto/backlog.md` |
| Bugs QA | 19 registrados: 8 corrigidos e verificados, 11 abertos no arquivo (alguns já corrigidos) | `qa/bugs/` |
| Incidentes de uso | Limites de 5 h repetidos; o commitado sobreviveu | R-04 |

Números pós-correções não foram reexecutados nesta atualização [HIPÓTESE: o CI atual está verde].

## Depende do fundador (lista única, por urgência)

Contas e credenciais
1. Conta Mercado Pago: Access Token e Public Key de **sandbox** (teste real do PIX/cartão), depois produção, Client ID/Secret do OAuth e segredo do webhook.
2. Conta Apple Developer e Google Play Console (G5; pago, exige sua autorização).
3. Credenciais de push: FCM (Google) e APNs (Apple), e conta/token do EAS.
4. Domínio, servidor, e-mail transacional (deploy).
5. Identificador `br.com.webag.app`: confirmar (não muda depois de publicado).
6. Número de WhatsApp de suporte (configurável no admin).

Jurídico e fiscal (você ou advogado/contador)
7. Textos de termos, privacidade e minuta de exclusão/exportação (CC4/CC5) antes do G5.
8. Parecer sobre motoboys (vínculo, Lei 12.009): nenhum motoboy deve ser contratado antes.
9. Arrependimento: prazo de reembolso e frete (J1 a J6, J9, J13).
10. IP em aceites e consentimentos: truncar (adotado) ou apagar (SEC-159/DT-063).
11. Cláusula de ressarcimento do lojista e aprovação automática de troca nos Termos do Lojista (J5, J12).
12. NFS-e e tributos sobre comissão e taxas da Webag (J11).
13. Prazo de arrependimento da exclusão de conta: 72 h adotado, confirmar (SEC-154).

Conteúdo
14. Ilustrador e fotos reais de produto: sem eles a v3 não chega ao nível do iFood.
15. Cotar 3 a 5 motoboys locais (custo muda a tabela de frete, HIP-L02).

Operação e decisões
16. Validação em aparelho real (push, câmera, teclado, desempenho em 3G, fontes).
17. Operação de despacho: quem despacha motoboy manualmente para cumprir "até 2 h" (DEC-053).
18. Autorização do merge para `main` e da tag `v1.0.0`; publicar nas lojas só com G4 e G5.
19. Revisar as hipóteses em `decisoes.md` (HIP-*, destaque: HIP-C01 comissão 15%, HIP-L01 tabela de frete, HIP-T05 taxa de troca) e decidir se a Webag absorve a tarifa do provedor quando a loja recusa pedido (QA onda 3-5, §176).
