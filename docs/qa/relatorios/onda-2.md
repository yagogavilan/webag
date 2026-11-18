# Relatório de QA: Onda 2 (oferta: lojista, aprovação, catálogo) e smoke da Onda 1

Data: 2026-11-18 | Autor: qa-engineer | Planos: `docs/qa/planos/onda-1.md`, `onda-2.md` | Bugs: `docs/qa/bugs/BUG-001..010.md`

## 1. Parecer: APROVADO COM RESSALVAS (Onda 2, API e painel web)

Não é parecer de G4. Não há bug Crítico nem Alto aberto. Ressalvas (dono sugerido):

| # | Ressalva | Dono |
|---|---|---|
| R1 | BUG-009 (Média): WB-225 (limite da loja nova) só tem parâmetros, sem lógica nem tela; O2-NOV-01..03 não executáveis. Confirmar se a história é da Onda 4. Bloqueia G4 | PM/PO |
| R2 | BUG-010 (Média): processamento de imagem sem teto de concorrência (I8, DT-033); não retestado | backend-dev |
| R3 | Storage e e-mail reais não exercitados: sem Docker aqui, os E2E reais usaram substitutos (moto como S3, SMTP+API mínima no lugar do Mailpit). Ficam sem prova: política `content-length-range` do POST pré-assinado em S3 real (O2-DOC-05, só provada com armazenamento em memória), cabeçalhos do domínio do storage (O2-DOC-12) e URL de 5 min contra o storage real (O2-DOC-08, provada com relógio falso). Repetir no CI com `docker compose` | CI / fundador |
| R3b | Ambiente: Postgres 16 e Redis locais; o compose usa Postgres 18 + PostGIS 3.6. Diferença de versão não testada | CI |
| R4 | Nada de aparelho: os casos E2E-M/comp do app (cadastro, login, termos, sessão revogada) não foram executados por mim; ver §6 | fundador |
| R5 | A11Y, PERF 3G, UX por tela e charters exploratórios E2-1..E2-4 não executados nesta rodada | QA (próxima rodada) |
| R6 | Cobertura de `catalog/stock` (>= 90% linhas, 85% ramos, critério de saída 4) não medida; só a existência dos testes de concorrência foi confirmada | backend-dev |
| R7 | O web sobe com o aviso `WEB_TRUSTED_PROXY_HOPS/WEB_CLIENT_IP_HEADER não definidos`: em produção os limites por IP viram o IP do BFF (SEC-129). Confirmar com o Security que produção define as duas | Security/infra |

## 2. Execução (evidência)

Ambiente: Node 22.23, Postgres 16 e Redis locais iniciados por mim, banco `webag_qa2_test` / Redis DB 9 para a suíte e `webag_qa_e2e` / Redis DB 8 para a API dos E2E (nada compartilhado com o backend-dev). Acesso ao `.env` foi negado pelo sistema; usei só os padrões de desenvolvimento do `env.ts` e variáveis na linha de comando.

| Suíte | Resultado |
|---|---|
| API unit (`test:unit`) | 19 arquivos, 168 testes, todos OK |
| API e2e com Postgres/Redis reais (`test:e2e`, banco/Redis próprios) | 28 arquivos, 335 passaram, 1 ignorado, 0 falhas (121 s), antes do meu arquivo novo |
| Meu arquivo novo `qa-onda2-lacunas.e2e-spec.ts` | 3 testes OK (O2-SEG-03, O2-ENT-05, O2-APR-11) |
| `api typecheck` e `api lint` | OK |
| Web: vitest, typecheck | 43 arquivos, 399 testes OK; typecheck OK |
| Web: Playwright com API falsa (`apps/web/e2e`) | 16 de 16 OK (37 s) |
| **Web: Playwright contra a API REAL (`apps/web/e2e-real`, O2-E2E-01..03)** | **5 de 5 OK (1,6 min)**, Chrome, API compilada (`node dist/main.js`) em Postgres/Redis reais, SMTP e S3 substituídos (R3) |
| Migrações em banco com dados (O2-DAT-01) | `db:migrate` rodado de novo sobre banco migrado e semeado: "Migrações aplicadas", 16 registros, sem erro |
| Seed idempotente (O2-DAT-02) | 3 execuções: 14 lojas, 57 produtos, 80 variações em todas; teste `seed-onda2` também passa |

E2E reais: O2-E2E-01 (cadastrar loja, 4 etapas, 3 documentos por upload, conta `fake`, envio: 2 testes, incluindo retomada WB-051 C4), O2-E2E-02/aprovação (admin com TOTP abre a fila, vê documentos por URL assinada auditada, confere 6 itens, aprova; lojista vê "Aprovada" e "Cadastre 1 produto"), O2-E2E-03/A4 (remoção de produto com motivo, some da vitrine, avisa o lojista, lojista não reativa, auditoria). O2-E2E-02 como "reprovar e reenviar" na UI real: não há spec; o ciclo está coberto só na API (`stores-onboarding` O2-APR-05) e na API falsa do web (`admin-aprovacao`). O2-E2E-04 (suspender loja na UI) sem spec.

## 3. Regressão dos achados do tech-lead (I1 a I10)

| Achado | Resultado | Evidência |
|---|---|---|
| I1 revogar convite alheio | Passou (BUG-001 corrigido) | `qa-regressao-onda2` I1, 2 testes |
| I2 atividade da loja ordenada | Passou (BUG-002) | I2 |
| I3 cursor de produtos | Passou (BUG-003), lista do lojista e fila de moderação | I3, 3 testes |
| I4 idempotência de estoque e preço em massa | Passou (BUG-004) | I4, 3 testes |
| I5 horários/feriados paralelos | Passou (BUG-005) | I5 |
| I6 documento vigente único | Passou (BUG-006), migração 0013 | I6 |
| I7 categoria nula em ativo | Passou (BUG-007) | I7 |
| I8 sharp sem teto | ABERTO (BUG-010), não retestado | review do tech-lead |
| I9 importação em duplicidade | Passou (BUG-008) | I9 |
| I10 seed em produção | Passou: seed de demonstração recusa produção (DEC-030d) | `seed-onda2` 4o teste |

S1 a S12 não foram verificados um a um (sugestões, não bloqueiam).

## 4. Casos P0/P1 da Onda 2 por ID

Legenda: OK = passou, com evidência; PARC = coberto em parte (o que falta entre parênteses); SEM = sem teste automatizado identificado (não afirmo que passa); DIF = diferido por dependência de onda posterior, conforme o plano; BLQ = bloqueado por ambiente.
Arquivos: ONB = `stores-onboarding.e2e-spec.ts`, TEAM = `stores-team-payment`, SET = `stores-settings`, CAT = `catalog`, REG = `qa-regressao-onda2`, LAC = `qa-onda2-lacunas`, UNIT = `src/**/*.spec.ts`, REAL = `apps/web/e2e-real`.

| IDs | Status | Evidência |
|---|---|---|
| ONB-01, 03, 04, 09, 10, 13 | OK | ONB 1o a 5o testes; `document.spec` |
| ONB-02 (CNPJ alfanumérico), 05, 06 | OK | ONB 'perfil, CEP e cidade' (provedor de CEP fake); ONB-02 PARC (decisão R-18 não verificada) |
| ONB-07, 08 (retomar rascunho) | OK | REAL 01 (conta existente retoma) e e2e fake; sessão revogada (ONB-08): SEM |
| DOC-01, 02, 03, 04, 05, 06 | OK | ONB 'upload e validação' (SVG/HTML renomeados, PNG 20000x20000 sem travar, EXIF removido, chave do servidor); DOC-05 política do POST só em armazenamento em memória (R3) |
| DOC-07, 08, 09, 10, 11 | OK | ONB 'documentos privados' e 'falha fechada'; URL real do S3 em REAL 02 |
| DOC-12 (storage com nosniff, PDF com JS) | BLQ | precisa de RustFS/MinIO e navegador (R3). API tem `nosniff` global (`app.setup.ts`) |
| DOC-14, 16 | DOC-16 OK (ONB 'reenvio substitui'); DOC-14 SEM | |
| PGT-01, 02, 03, 05, 08, 09, 12, 14 | OK | TEAM 'conta de recebimento' (state, reauth 5 min, OAuth negado, titular divergente, AES-GCM com AAD, varredura de rotas) |
| PGT-06 (trocar conta, e-mail de aviso, alerta) | OK | TEAM 6o teste (SEC-048) |
| PGT-04 (PKCE) | BLQ | pendente do fundador (credencial MP) |
| PGT-10, 11 (renovação de token, token revogado) | SEM | não há job de renovação (S6/DT-034); PGT-11 P0 é risco: loja com token revogado não sai da vitrine nem avisa o lojista [HIPÓTESE, não verificado] |
| APR-01, 05, 06, 08, 12, 16 | OK | ONB 'envio, fila e decisões'; `state.spec` |
| APR-02 (SLA em dias úteis) | OK | `business-days.spec` |
| APR-03, 04 | OK | ONB 'caminho feliz'; REAL 02 |
| APR-10, 11, 13 | OK | LAC O2-APR-11 (suspensa, em análise, conta em análise, sem produto ativo: cada um tira a loja de `/v1/browse/stores/{id}`) |
| APR-09, 14 | OK | ONB 'O2-APR-12/13/14/16'; APR-09 SEM |
| EQP-01, 03, 04, 05, 07, 08, 09 | OK | TEAM 'equipe' (convite 7 d, hash, reauth, matriz funcionário x rotas, 401 em seguida à remoção, mensagem genérica); REG I1 |
| EQP-06, 10 | OK | TEAM 'EQP-01/08/10' (dono não se remove, reenvio invalida) |
| PRF-02, 03, 04, 07, 08 | OK | ONB 'O2-PRF' e XSS (API devolve texto cru; renderização no painel: REAL e testes do web) ; SET autorização |
| PRF-05 (R-23) | OK | ONB 'R-23' |
| HOR-01, 02, 03, 04 | OK | SET 'horários e pausa'; `hours.spec`, `opening.spec` |
| ENT-01, 02, 03, 04, 06, 09, 10 | OK | SET 'entrega'; `delivery.spec` |
| ENT-05 (PostGIS x haversine, 10 pares) | OK | LAC (erro < 0,5% nos 10 pares) |
| ENT-08 (prévia = checkout) | OK | SET 'prévia ... MESMA função' |
| RET-01, 03 | OK | SET 'retirada'; RET-03 (código com `crypto`, zero à esquerda) SEM |
| TRC-01, 02 | OK | SET 'O2-TRC' (campo de arrependimento/defeito = 400) |
| PRD-01, 02, 03, 05, 08, 09, 10 | OK | CAT 'produto' e 'autorização por loja'; LAC SEG-03; `price.spec` (conversão `19,90`: UNIT) |
| PRD-04 (8 fotos) | PARC | CAT 8 fotos; ordem por teclado e 300 KB/1600 px na UI: SEM |
| PRD-06 (excluir com pedido) | DIF | Onda 4 (pedido não existe) |
| PRD-07 | OK | CAT 'categoria PROIBIDA'; caminho "Revisar" em MOD-03 |
| VAR-01, 02, 03, 04, 05, 07, 08 | OK | CAT 'variações e estoque'; `variants.spec`, `stock.spec`; VAR-03 (esgotado some da oferta mas fica na loja): SEM no mesmo teste |
| VAR-06 (reserva concorrente) | DIF | `reserve()` nasce na Onda 4A; requisito atômico registrado pelo tech-lead |
| PRC-01, 02, 03, 04 | OK | CAT 'preço e promoção'; `price.spec` (borda BRT/UTC) |
| EST-01, 02, 03, 04 | OK | CAT; EST-03 20 "+1" simultâneos = +20; EST-04 (UI) SEM |
| MOD-01, 02, 03, 04, 05 | OK | CAT 'moderação'; REAL 03 (UI real) |
| NOV-01, 02, 03 | SEM | BUG-009; NOV-03 só pelo teste genérico de faixa de parâmetros em `admin-config` |
| NOV-04, 05 | DIF | Ondas 4 e 6 |
| SEG-01 (BOLA, rotas novas) | PARC | ONB-13, CAT PRD-08, TEAM EQP-09, REG I1; matriz gerada do OpenAPI para as rotas novas: SEM |
| SEG-02 (perfil x rota) | OK | `rbac.e2e-spec` (matriz da tabela única, rota nova sem decorator falha) |
| SEG-03 | OK | LAC (7 campos proibidos em criação e edição de produto) + ONB 'SEC-022' (loja) |
| SEG-04 (1 linha de auditoria por ação) | PARC | cada fluxo asserta auditoria (aprovar, suspender, URL de documento, conta, moderação); varredura de todas as ações: SEM |
| SEG-05 (PII) | OK | ONB 'SEC-023', CAT 'catálogo e donos', `browse` (documento mascarado) |
| DAT-01, 02 | OK | §2 (migração repetida, seed 3x) |
| E2E-01 | OK | REAL 01 + 02 (5 de 5) |
| E2E-02 (reprovar e reenviar) | PARC | API (ONB) e API falsa do web; sem spec real |
| E2E-03 (publicar produto com 3 variações e promoção) | PARC | e2e do web com API falsa (`lojista-catalogo`) e API real em CAT; REAL cria produto só por helper; pausa some da API pública: CAT |
| E2E-04 | PARC | moderação de produto OK (REAL 03); suspender loja na UI: SEM spec |

Critério de saída 1 (O2-E2E-01 a 03 verdes no Playwright): atendido para 01 e para a moderação (03 do código); 02 e 03 do plano só em API (ver linhas acima). Critério 2 (DOC-03 a 12): 03 a 11 verdes, 12 bloqueado (R3). Critério 3 (seed e migrações): atendido. Critério 5: nenhum Crítico/Alto aberto; regressão da Onda 1 verde.

## 5. Smoke da Onda 1 (P0/P1 por grupo; casos individuais sem ID nos testes)

Os testes da API não carregam o ID `O1-` no nome. O mapeamento abaixo é por título do teste; o que não identifiquei está como SEM.

| Grupo | OK (arquivo: teste) | PARC | SEM / BLQ |
|---|---|---|---|
| CAD | 01, 03, 04, 07, 13, 18, 19, 21 (API), 22: `auth`, `codes-reset`, `admin-config`, `password.service.spec` | 05 (128 caracteres aceito; sem teste de não truncar), 09 (só API), 10 (versão e data; IP/plataforma não conferidos), 12 (4a conta no aparelho; 20/h por IP) | 08 (normalização), 16 (concorrência): SEM. 02, 20: BLQ (app) |
| COD | 01, 03, 04, 05, 06: `codes-reset`, `auth` | 02 (vencido aos 10 min; borda 9:59 não), 07 e 11 (HMAC e logs: `mask.spec`, sem prova de coluna) | 08, 09, 12, 13, 14: SEM. 16: DIF |
| LOG | 01, 02, 03, 04, 05, 10, 13 (Redis ligado), 14, 15, 16, 21: `auth`, `codes-reset`, `rbac` | 12 (alg:none e typ; iss/aud/exp não), 17 (dia 91; 31 dias sem uso não), 24 e 25 (cookies e CSRF em `csrf.spec`, `session-routes.spec`, `proxy.ts`; não conferi cada atributo) | 06, 08, 22: SEM. 11, 18, 20, 23: BLQ (app) |
| RST | 01, 02, 03, 04, 05, 08: `codes-reset` | 09 (log): SEM | 06, 07: SEM |
| NCF | 01, 02, 03, 08 (parâmetro): `codes-reset`, `stores-onboarding` | | 04, 05, 06: DIF |
| SEG | 01, 03, 04, 05, 06, 07, 09: `rbac`, `contract`, `production-boot`, `env.spec`, `mask.spec`, `payments` | 10, 12 (nosniff global; HSTS/CSP do web só em `proxy.ts`) | 08, 13, 15: CI (existe `ci.yml` com `pnpm audit` e gitleaks; não executei o CI). 02 (BOLA por OpenAPI): PARC como em SEG-01 |
| ADM | 02, 03, 05, 07, 08, 09, 10, 11, 12, 15, 16, 17, 18, 24: `admin-mfa`, `admin-mfa-2step`, `admin-sec113`, `break-glass`, `rbac` | 01, 04, 06, 20, 21, 22, 23: web (e2e fake 9 casos de login/aprovação OK; hosts separados e CSP: SEM por ID) | |
| AUD | 01, 02, 03, 04, 05, 06: `admin-config`, `admin-contract-gaps` | | |
| PAR/CAT | PAR 01 a 03, 05, 06, 08 a 11, 14 e CAT 01, 03, 04, 06, 11: `admin-config` | PAR-12 (`isRegionActive`: nenhum unit com esse nome), CAT-10 (XSS no app) | CAT-07, 08: BLQ/SEM |
| LOJ | 02 (parcial), 04, 05: `codes-reset`, `stores-onboarding` | | 01, 03: SEM |
| PAY | 02, 03, 04, 05 a 15, 16, 17, 20: `payments`, `payments-hardening`, `webhook-signature.spec` | PAY-19 (logs): SEM | PAY-21, 22: BLQ (ADR e sandbox MP, fundador) |

Desvio plano x implementação (sem risco, ajustar o plano): O1-COD-05 pede 400 ao reusar código aceito; a API responde 204 (conta já confirmada) sem efeito novo, e recusa o código em outras finalidades (uso único provado). Aceito.

## 6. O que o fundador precisa testar no celular (roteiro curto, 10 min)

1. Instalar o build de teste, criar conta de cliente com e-mail real: o e-mail chega em menos de 1 min com o código de 6 dígitos? Digitar errado 2 vezes e depois certo.
2. Fechar o app no meio do cadastro, reabrir: continua logado? Ativar modo avião, tentar entrar: aparece mensagem de "sem conexão"?
3. Entrar, ir em Conta e "Sair de todos os dispositivos" com um segundo aparelho ou aba logada: o segundo é deslogado em segundos?
4. Pedir novo termo (admin publica versão relevante): o app barra até aceitar?
5. Painel do lojista no celular (360 px): cadastrar loja até a etapa 3 com foto da câmera, negar a permissão da câmera uma vez e confirmar que há alternativa da galeria.

## 7. Próximos passos

1. PM/PO: decidir onde entra WB-225 (BUG-009). 2. backend-dev: I8 (BUG-010). 3. CI: rodar os E2E reais com `docker compose` (RustFS e Mailpit de verdade) e fechar DOC-12/DOC-05. 4. QA: charters E2-1..E2-4, A11Y e PERF; specs reais de "reprovar e reenviar" e "suspender loja"; medir cobertura de `catalog/stock`.
