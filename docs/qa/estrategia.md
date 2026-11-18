# Estratégia de testes — Webag 1.0

Dono: qa-engineer | Data: 2026-11-18 | Status: v1 (antes do código das ondas 1 e 2)
Ferramentas, camadas e gates técnicos são do **ADR-006** (manda). Este documento define o que testar, com que profundidade, em que ambiente, com que dados e quando o QA veta. Fontes: `brief.md` §7, `plano-execucao.md`, `regras-de-negocio.md` (RN), `requisitos-seguranca.md` (SEC), `decisoes.md` (DEC/HIP).
Marcação `[HIPÓTESE]` = não validado; revisar quando houver dado real.

## 1. Princípios

1. **Risco primeiro.** Profundidade proporcional ao dano: dinheiro, estoque, estado do pedido, autorização e LGPD recebem teste de banco real e de propriedade; tela cosmética recebe teste de componente e inspeção.
2. **Comportamento, não implementação.** Teste afirma o resultado observável (estado final no banco, resposta HTTP, texto na tela), nunca "método X foi chamado". Teste sem `expect` útil ou que só confere que "não lançou erro" é reprovado em revisão.
3. **Banco real onde há SQL.** Estoque, concorrência, PostGIS, constraints, ledger e migrações rodam em Testcontainers com a imagem PostGIS do compose (ADR-006). Mock de repositório não vale como evidência nesses módulos.
4. **Tempo é entrada.** Toda regra de prazo (PIX 15 min, aceite 10 min, OTP 10 min, janela de refresh 30 s, prazos de troca, horário da loja em `America/Sao_Paulo`) usa relógio injetado. Proibido `sleep` real em teste de regra.
5. **Dinheiro em centavos inteiros** (RN-01). Todo teste de valor é calculado à mão no caso e na fonte (RN-10), não reimplementando a fórmula do código.
6. **Sem evidência não há aprovação.** "O dev testou" não conta. Evidência = saída de teste no CI (link ou log), roteiro executado com resultado, captura quando o fundador fornecer.
7. **Rastreabilidade.** Todo caso aponta WB-### ou SEC-### (e o critério Cn da história). Caso sem origem não entra no plano.

## 2. Pirâmide e ferramentas

Proporção-alvo de casos automatizados `[HIPÓTESE]`: unitário/domínio ~55%, integração com banco ~25%, E2E de API e contrato ~15%, E2E de UI (Playwright + Maestro) ~5%. UI E2E é cara e frágil: só fluxos críticos.

| Camada | Ferramenta (ADR-006) | Onde | O que prova | Quando roda | Dono do código |
|---|---|---|---|---|---|
| Unitário de domínio | Vitest 4 | `apps/api/src/**/*.spec.ts` | Máquina de estados, preço/frete/cupom/comissão, estoque, regras de troca, horário, OTP, política de senha | Todo push | backend-dev |
| Integração | Vitest + Testcontainers (PostGIS) | `apps/api/test/integration` | SQL real, `FOR UPDATE`, concorrência com 2+ transações, constraints, migrações do zero e idempotentes, filas BullMQ | Todo PR | backend-dev; QA revisa e complementa |
| E2E API + contrato | Vitest + supertest | `apps/api/test/e2e` | Cada endpoint: sucesso, validação 400/422, 401/403/404 alheio, idempotência, resposta validada contra `openapi.yaml` | Todo PR | backend-dev; QA mantém a **matriz BOLA/BFLA** (SEC-020/021) |
| Pagamento | Vitest, provedor `fake` + fixtures MP | API | Pipeline de webhook completo; adaptador MP com respostas gravadas; `x-signature` válida/inválida/repetida/fora de ordem | Todo PR | backend-dev |
| Componentes web | Vitest + Testing Library | `apps/web` | Regras na tela: máscara, estados (carregando, vazio, erro), permissões que escondem ação | Todo PR | mobile-dev |
| E2E web | Playwright | `apps/web/e2e` (a criar na T0-12) | Fluxos: cadastrar e aprovar loja, aceitar pedido, cadastrar produto, login admin + TOTP | PR para `main` | QA mantém a suíte |
| Componentes mobile | jest-expo + RNTL 14 | `apps/mobile/__tests__` | Comportamento e estados de tela | Todo PR | mobile-dev |
| E2E mobile | Maestro (YAML) | `apps/mobile/e2e/` | Comprar com PIX, pedir troca, cadastro | Local e **antes do G4** (fora do CI de PR, DT-006) | QA mantém |
| Carga | k6 | `tests/load` | Ver `plano-carga.md` | Antes do G4 | QA |
| Exploratório | Charter manual | `docs/qa/` (resultado no relatório da onda) | O que automação não vê: UX, microcopy, rede ruim | Fim de cada onda | QA |
| Acessibilidade | RNTL (`accessibilityLabel`, role), axe-core no Playwright, roteiro manual TalkBack/VoiceOver | web e mobile | WCAG 2.2 AA: contraste, rótulos, alvo >= 44-48 pt, fonte dinâmica | Fim de cada onda | QA |

**Regras de qualidade dos testes (ADR-006 + QA):** sem dependência de ordem; dado por *builders* (§4); flaky vai para quarentena com issue e prazo de 1 sprint, nunca `retry` cego; Sentry desligado; nenhum teste chama rede externa (MP real, Google, e-mail real).

### Críticas ao ADR-006 (registro, sem bloquear)
| # | Ponto | Risco | Recomendação |
|---|---|---|---|
| C1 | Cobertura de linhas >= 90% nos módulos críticos | Linha coberta sem asserção forte engana. Dinheiro precisa de **ramos** e de **invariantes** | Exigir também cobertura de ramos >= 85% nesses módulos e teste de propriedade (fast-check) para: soma das partes = total (RN-01), ledger soma zero (SEC-041), estoque nunca negativo (RN-06). Mutation testing (Stryker) no módulo `finance` e `orders` como meta opcional [HIPÓTESE]; se virar gate, decidir com o TL |
| C2 | Maestro fora do CI de PR (DT-006) | Regressão mobile só aparece no G4 | Rodar Maestro em emulação Expo Web/Android local ao fim de cada sub-onda de mobile (3A, 3B, 4B, 5B); registrar saída em `docs/qa/` |
| C3 | Sem aparelho real | Gestos, teclado, câmera, push e performance em Android de entrada não são cobertos | Lista de verificação no aparelho do fundador (§9), antes do G4 |
| C4 | Contrato validado contra `openapi.yaml` | Só vale se o `openapi.yaml` for gerado do código ou o CI falhar quando divergir | Gate de CI "OpenAPI gerado = OpenAPI versionado" (pedir ao backend-dev) |

## 3. Ambientes

| Ambiente | Composição | Uso | Limitações |
|---|---|---|---|
| Unit/CI | Node, Vitest; Testcontainers (Postgres+PostGIS, Redis) | PR | Precisa Docker no runner (GitHub tem) |
| Local/dev (`docker compose up`) | Postgres+PostGIS, Redis, MinIO, Mailpit, api, web, `PAYMENT_PROVIDER=fake`, seed por onda | Exploratório, Playwright, Maestro, e-mails (Mailpit) | Sem MP real, sem push real, sem aparelho |
| Staging | Mesmo compose em VPS (Guia de deploy, Onda 8) | Smoke pré-G4, carga | Depende do fundador (servidor, domínio) |
| MP sandbox | Credenciais de teste do fundador | **Pendente:** validar SEC-044 (PIX sem CPF), segredo do webhook de pagamento com token OAuth do lojista, PKCE (SEC-045), `application_fee` em estorno parcial | Sem conta, é pendência de G5, não bloqueio do código |
| Produção | Fora do alcance do QA | Nunca testar | O boot com `fake` em produção deve falhar (SEC-036) |

Regra: teste de QA só roda em dev, CI ou staging. Dado de produção não é usado.

## 4. Dados de teste

| Tipo | Como | Regra |
|---|---|---|
| Builders | `buildUser()`, `buildStore()`, `buildProduct({variants})`, `buildOrder({status})`, `buildCoupon()`, `buildExchange()` em `apps/api/test/builders` | Cada teste cria o que usa, com valores explícitos para o que importa; UUID aleatório; sem seed compartilhado |
| Relógio | `FakeClock` injetado (America/Sao_Paulo) | `clock.advance('15m')` em vez de espera |
| Provedor de pagamento | `fake` com ganchos para: aprovar, recusar, atrasar, duplicar, divergir valor, titular divergente, reenviar webhook, fora de ordem | Mesmo pipeline do real (ADR-002 §9) |
| Seed demo | `apps/api/seed/` um arquivo por onda; credenciais demo por perfil (cliente, dono, funcionário só pedidos, 4 admins) | Usado em E2E de UI e exploratório; nunca em teste de API (use builders) |
| Cartões de teste MP | Lista oficial do MP (aprovado, recusado por saldo, por segurança, 3DS) | Só com sandbox; marcar `[HIPÓTESE]` até o fundador fornecer credencial |
| PII em teste | Nomes e CPF inválidos-mas-bem-formados, e-mails `@example.test`; nunca dados reais | LGPD; CPF/CNPJ de teste gerados com dígito verificador válido |
| Arquivos | Fixtures pequenas: JPG/PNG/WebP válidos, SVG renomeado `.jpg`, PNG 20000x20000 (gerado), PDF válido, "zip bomb" de XLSX (gerado), JPEG com EXIF/GPS | Em `apps/api/test/fixtures`; sem binários grandes no git (gerar em runtime) |
| Concorrência | Helper `runConcurrently(n, fn)` com transações independentes | Obrigatório em estoque, cupom, estorno, refresh token |

## 5. Cobertura por módulo crítico

Meta numérica do ADR-006 (>= 90% de linhas em `orders`, `payments`, `finance`, `exchanges`, `catalog/stock`; >= 70% geral) **mais** os invariantes abaixo. Cada invariante precisa de ao menos um teste de integração (banco real) e, quando indicado, de propriedade.

| Módulo | Invariantes e regras que o teste deve provar | Fonte | Tipos obrigatórios |
|---|---|---|---|
| **Pedido** | Só as transições da tabela RN-07 existem; transição repetida/regressiva é ignorada; toda transição grava evento (estado, ator, hora, motivo) e emite notificação/socket; cada ator só aciona o que pode; timeouts (aceite 10 min, retirada 48 h, 24 h de auto-conclusão) com relógio injetado; snapshot de preço/nome/taxas imutável após criar; revalidação de preço/estoque/horário ao pagar; total dentro de [mínimo, máximo] | RN-05, RN-07, RN-08, SEC-030/031/035/064 | Unit (tabela de transições completa, positivo e negativo), integração, API (idempotência: 2 requisições iguais = 1 pedido), propriedade (nenhuma sequência aleatória de eventos chega a estado inválido) |
| **Estoque** | `disponível = estoque - reservado`; reserva na criação, baixa na aprovação, liberação em EXPIRADO/CANCELADO/RECUSADO; última unidade para quem reservar primeiro (N pedidos concorrentes, exatamente `estoque` vencem); nunca negativo; ajustar para menos que o reservado é bloqueado; reintegração só com "revenda"; alerta de estoque baixo | RN-06, HIP-007, HIP-033, WB-061/064 | Integração com 2+ transações (`FOR UPDATE`), propriedade, unit |
| **Pagamento** | Servidor calcula tudo (cliente nunca define valor); idempotência por `Idempotency-Key` + hash do corpo; webhook: assinatura (válida, inválida, `ts` fora de 300 s, `data.id` da query), antirreplay (`x-request-id`), fora de ordem, duplicado; aprovação só se status/valor/referência/recebedor/`application_fee` baterem; PIX tardio/duplicado vira estorno automático único; nenhum endpoint de cliente muda estado de pagamento; `fake` inexistente em produção; nenhum PAN/CVV em log ou banco | WB-150..153, 158, SEC-030..044 | Integração + API + contrato; fixtures MP; varredura de logs; teste de boot (`validateEnv`) |
| **Comissão e ledger** | Fórmulas RN-10 com os exemplos do documento (R$ 100, cupom loja R$ 10, frete R$ 8, PIX e cartão); precedência loja > categoria > padrão e vigência; comissão congelada no pagamento; pedido multi-categoria; estorno total/parcial devolve comissão proporcional e não a taxa do provedor; `application_fee >= 0` e cupom da plataforma <= comissão; soma das partes = total (centavo extra ao lojista); ledger append-only e soma = pago - estornos | RN-01, RN-09, RN-10, HIP-016, SEC-041/060, WB-111/105/156 | Unit com tabela de exemplos calculados à mão, propriedade (soma), integração (permissão de banco: `UPDATE ledger_entries` falha) |
| **Troca** | Elegibilidade (só ENTREGUE, 1 aberta por item, prazo contado da entrega); piso legal fixo (arrependimento 7 d e defeito 30 d não editáveis nem desligáveis pela loja); loja sem resposta em 48 h: arrependimento aprovado, demais vão à mediação; estados e prazos com relógio simulado; taxa de coleta <= teto; reembolso e comissão proporcional; reposição reserva estoque; troca de item trocado só por defeito; fotos 1-5 | RN-11, DEC-011, WB-170..178 | Unit (tabela de estados e prazos), integração, E2E Maestro "pedir troca" |
| **Autenticação e sessão** (suporte a todos) | SEC-001..017, 080: Argon2id, OTP, rate limit, step-up, revogação em <= 5 s, refresh com janela de 30 s, TOTP admin, reautenticação | `requisitos-seguranca.md` §1-2 | Unit, integração, API; Playwright no admin |
| **Autorização** | Matriz perfil x rota e BOLA gerada do OpenAPI: 404 em 100% das rotas com `{id}` para recurso alheio | SEC-020/021, RN-13 | API (matriz gerada, não escrita à mão) |

## 6. Plataformas e dispositivos

Sem aparelho real no QA; a matriz abaixo guia o que o fundador valida e o que emulamos. `[HIPÓTESE]` sobre as versões comuns na região (sem dado de mercado verificado).

| Prioridade | Alvo | Por quê |
|---|---|---|
| P1 | Android 10-12, 2-3 GB de RAM, tela 5,5-6,1", 3G/4G instável | Persona do cliente (brief §2) |
| P1 | Android 14+ de gama média | Base atual de aparelhos novos |
| P2 | iPhone 11-13 (iOS 16-17), tela 6,1" | Maior base iOS plausível |
| P2 | iPhone SE (tela 4,7"), iOS mais antigo suportado pelo Expo | Tela pequena, limite de layout |
| P2 | Painéis web: Chrome Android (celular do lojista), Chrome/Edge desktop 1366x768, Firefox, Safari iOS | Lojista no celular e no balcão |
| P3 | Tablet, orientação horizontal | Sem requisito explícito |

Condições de rede a simular em todo fluxo crítico: normal, 3G lento (latência 400 ms, 400 kbps), offline total, queda durante o pagamento, retorno de offline.

## 7. Tipos de caso e prioridades

| Tipo | Sigla | Descrição |
|---|---|---|
| Unitário | UNIT | Domínio puro, sem banco |
| Integração | INT | Banco/fila reais |
| API/contrato | API | supertest contra OpenAPI |
| E2E web | E2E-W | Playwright |
| E2E mobile | E2E-M | Maestro |
| Segurança | SEG | Derivado de SEC-###; pode ser API ou INT |
| Concorrência | CONC | Duas ou mais transações/requisições simultâneas |
| Acessibilidade | A11Y | WCAG 2.2 AA |
| Desempenho | PERF | k6 / orçamento de tela |
| Manual/exploratório | MAN | Roteiro ou charter |

| Prioridade | Significado | Executa em |
|---|---|---|
| P0 | Dinheiro, dados pessoais, autorização, estado do pedido, tomada de conta. Falha = bug Crítico | Todo PR + regressão total |
| P1 | Fluxo principal e regra de negócio explícita. Falha = bug Alto | Todo PR / PR para main |
| P2 | Fluxo secundário, validação de formulário, estados | Regressão por onda |
| P3 | Cosmético, microcopy, caso raro | Exploratório |

Todo caso nos planos tem: ID (`O1-###`, `O2-###`), origem (WB/SEC + Cn), prioridade, tipo, resultado esperado verificável.

## 8. Bugs e severidade

Formato e severidades conforme a definição de prontidão do projeto (skill `definicao-de-pronto`) e o formato do papel QA: `BUG-### | Severidade | Prioridade P1-P4`, ambiente, passos, esperado/obtido, evidência, história. Registro em `docs/qa/bugs.md` (criado ao primeiro bug). Crítica e Alta bloqueiam release. Não reduzo severidade para caber em prazo.

| Severidade | Exemplos no Webag |
|---|---|
| Crítica | Cobrança diferente do exibido; pedido pago sem estoque baixado; webhook duplicado cria dois estornos ou duas aprovações; recurso alheio acessível (BOLA); PII ou token em log; credencial de teste aceita em produção; ledger que não fecha; conta tomada sem código |
| Alta | Fluxo principal quebrado (cadastro, login, checkout, aceitar pedido, aprovar loja); permissão errada de perfil sem dado sensível; falha só no iOS ou só no Android; arrependimento recusável pela loja |
| Média | Funcionalidade secundária; estado de tela faltando (vazio/erro/offline); UX relevante; erro de arredondamento sem perda monetária |
| Baixa | Texto, espaçamento, ícone |

## 9. O que o fundador precisa testar no celular (antes do G4)

Roteiro curto (15 minutos), registrar resultado no `relatorio-funcional.md` da Onda 8:
1. Instalar o app em um Android antigo de entrada. Abrir em Wi-Fi e em 4G; ativar modo avião e abrir: deve haver tela "sem conexão" com ação.
2. Comprar um produto até o PIX (provedor `fake`), cronometrando: meta < 2 min do primeiro toque ao PIX gerado.
3. Fechar o app com o PIX na tela e reabrir: o pedido continua e o estado correto aparece.
4. Pedir troca com foto tirada na câmera; negar a permissão da câmera e conferir a mensagem.
5. Receber o push de "pedido aceito" com o app fechado; tocar e conferir que abre o pedido certo.
6. Aumentar o tamanho da fonte do sistema ao máximo: nenhum botão ou texto cortado.
7. No celular do lojista: abrir o painel, receber alerta sonoro de novo pedido, aceitar com uma mão.

## 10. Regressão por onda

| Ao fechar | Roda |
|---|---|
| Onda 1 | `plano onda-1` completo + smoke de auth em todas as ondas seguintes |
| Onda 2 | `plano onda-2` + regressão da onda 1 (auth, RBAC, auditoria, parâmetros) + E2E "cadastrar e aprovar loja" |
| Ondas 3-6 | Planos da onda + regressão acumulada; Maestro "explorar até carrinho" (3), "comprar com PIX" (4), "pedir troca" (5) |
| Onda 7 | Carga completa (`plano-carga.md`) |
| Onda 8 | Funcional total, usabilidade, G4 |

Suíte de regressão E2E mínima (automatizada): login cliente, login admin com TOTP, cadastro de lojista, aprovação de loja, publicar produto, comprar com PIX (fake), aceitar e avançar pedido, pedir troca, exportar/excluir conta.

## 11. Critérios de veto

### G4 (release candidate): o QA veta se qualquer item abaixo for verdadeiro
1. Existe bug **Crítico ou Alto** aberto (sem aceite formal do fundador em `decisoes.md`).
2. Qualquer requisito SEC com "G4 = Sim" sem teste automatizado verde ou evidência manual registrada.
3. Cobertura abaixo do gate do ADR-006 (>= 90% linhas nos módulos críticos; >= 70% geral) ou invariante da §5 sem teste.
4. Suíte de regressão E2E (§10) com falha ou em quarentena sem issue.
5. Contrato OpenAPI divergente do código, ou rota sem teste de 401/403/404.
6. Teste de carga (k6) fora das metas do `plano-carga.md`, ou não executado.
7. Estados de carregando/vazio/erro/offline ausentes em tela do fluxo principal (DoD).
8. Idempotência de webhook, estorno ou criação de pedido não provada por teste de concorrência.
9. Fluxo "comprar" acima de 2 min cronometrado, ou > 2x a meta de toques/telas de `docs/design/fluxos.md` §2.
10. Roteiro do fundador (§9) não executado, ou com falha de Alta.
11. Parecer de Security (veto próprio) não emitido.

### G5 (publicação): o QA veta além dos itens do G4
1. Build de produção não testado (Android e iOS) por roteiro §9 ou por Maestro no build assinado.
2. Checklist das lojas (`docs/gestao/checklist-lojas.md`) com item de QA aberto: exclusão de conta no app (WB-213), denúncia (WB-038/124), política de privacidade acessível, permissões mínimas (SEC-084).
3. Fluxo de pagamento real (MP sandbox) não validado: SEC-044, assinatura de webhook, estorno.
4. Pendências do fundador (contas, jurídico) sem decisão registrada.

Veto só cai por decisão do fundador, registrada em `docs/decisoes.md` com o risco aceito e a data.

## 12. Parecer de release

Arquivo `docs/qa/release-<versao>.md`. Estrutura fixa:

```
# Parecer de release <versao> | Data | Gate (G4 ou G5)
Parecer: APROVADO | APROVADO COM RESSALVAS | REPROVADO
Base: commit <sha>, build <id>, ambiente
1. Escopo testado (histórias WB e requisitos SEC cobertos; o que ficou fora e por quê)
2. Resultados (tabela: camada | executados | passaram | falharam | link/saída)
3. Cobertura por módulo crítico (linhas, ramos; invariantes da estratégia §5)
4. Fluxos críticos (regressão §10): resultado de cada um
5. Bugs abertos por severidade (IDs) e bugs fechados nesta rodada
6. Riscos aceitos (APROVADO COM RESSALVAS): risco | impacto | dono | prazo | decisão em decisoes.md
7. Não testado (honestidade): aparelho real, sandbox MP, rede real
8. Pendências do fundador (testes manuais)
9. Veredito e condições para mudar o parecer
```

- **APROVADO**: nenhum Crítico/Alto aberto, todos os gates da §11 cumpridos.
- **APROVADO COM RESSALVAS**: só Média/Baixa abertas e riscos listados com dono e prazo; nunca com Crítico/Alto.
- **REPROVADO**: lista numerada de bugs ou lacunas bloqueantes, com o critério (WB/SEC) violado.

## 13. Relatórios por onda

Ao fim de cada onda, o QA publica no retorno ao CEO (e, se houver bug, em `bugs.md`): casos executados por prioridade, passou/falhou/bloqueado, bugs por severidade, o que ficou sem teste e por quê. Planos atuais: `planos/onda-1.md`, `planos/onda-2.md`. Planos das ondas 3 a 6 são escritos uma onda à frente dos devs, a partir das specs e PRDs.

## 14. Documentos relacionados
`revisao-testabilidade.md` (histórias vagas para o PO), `roteiros-usabilidade.md` (Onda 8.4), `plano-carga.md` (Onda 7).
