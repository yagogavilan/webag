# Relatório final do v1.0 — Webag

Para o Yago. Data: 2026-11-20. Base: código congelado em `036e791` (DEC-083); o tip do branch só acrescenta documentos (verificado: `git diff 036e791 HEAD -- apps packages infra scripts` vazio). Branch `claude/admiring-lamport-62tq1a`; `main` intocado, sem tag. Fontes entre parênteses; `[HIPÓTESE]` = não validado.

## (a) O que foi construído

Um marketplace regional completo, rodando de ponta a ponta com pagamento **simulado**: app do cliente (Expo), painel do lojista, painel admin e site público (Next.js), API NestJS com PostgreSQL/PostGIS, Redis, armazenamento de fotos e e-mail de teste. Cobre busca por região, sacola, PIX e cartão, pedido em tempo real, logística da Webag (admin atribui o motoboy), trocas dos 3 tipos, comissão por loja/categoria, financeiro, avaliações, cupons e LGPD (exportar e excluir dados).

| Número | Valor | Fonte |
|---|---|---|
| Módulos da API / migrações / ADRs / decisões | 21 / 57 (0000 a 0056) / 16 / 84 | contagem minha em `apps/api/src/modules`, `apps/api/drizzle`, `docs/arquitetura/adr`, `docs/decisoes.md` |
| Contrato da API | 332 operações em 280 caminhos `/v1` | contagem minha por `grep` em `docs/arquitetura/api/openapi.yaml` |
| Telas | 44 telas, 70 capturas | `docs/telas/README.md` (contagem dos arquivos; a pasta está sendo regenerada) |
| Testes (QA, em `036e791`) | API unitários 335/335; API e2e 873/874 (1 flake de teste, BUG-029); web 684/684; app 439/439; shared 3/3; Playwright 65 (API falsa) + 9 (API real); regressão de negócio 55 PASS e 1 NÃO TESTADO; smoke 35 ok | `qa/relatorios/g4-final-tip.md` §3 |
| Dados de demonstração | 12 lojas, 12 funcionários, 6 clientes, 60 pedidos | `qa/relatorios/g4-final.md` §2 |
| Bugs abertos | 0 Críticos, Altos e Médios; 4 Baixos de QA, 9 de Security | `status.md` |

## (b) Como rodar

Precisa de Git, Node 24 (mínimo 22.12), pnpm 10 e Docker aberto. Não existe `.env.example` na raiz: o modelo é `infra/env.example` e o `setup` o copia para `.env` sozinho.

```bash
git clone https://github.com/yagogavilan/webag.git
cd webag
pnpm install
pnpm run setup     # cria o .env, sobe Docker (banco, Redis, fotos, e-mail), migra e semeia. Seguro de repetir. NÃO use "pnpm setup" sem "run"
pnpm dev           # API 3000, painéis e site 3001, app (Metro) 8081
pnpm smoke         # em outro terminal, com a API no ar: confere o fluxo de compra inteiro
```

Sem Docker: `SKIP_DOCKER=1 pnpm run setup` (precisa de Postgres 16+ com PostGIS e Redis seus). Pedido pago no simulado: `pnpm pagar` aprova o PIX do último pedido. Se o Mailpit não estiver na 8025, o smoke precisa de `MAILPIT_URL`.

| O quê | Endereço | Login |
|---|---|---|
| Admin | http://localhost:3001/admin/entrar | `admin@webag.local` / `Webag-Admin-Dev-2026`; no 1º login o painel pede o 2º fator: copie o segredo da tela e rode `pnpm totp <segredo>` |
| Lojista (dono) | http://localhost:3001/lojista/entrar | `lojista.mercadinho-boa-compra@seed.webag.local` / `webag-seed-lojista-2026` |
| Lojista (funcionário) | idem | `funcionario.mercadinho-boa-compra@seed.webag.local` / mesma senha |
| Cliente (app) | `pnpm web` e http://localhost:8081, ou Expo Go (QR; no celular defina `EXPO_PUBLIC_API_URL` com o IP do computador) | `cliente.ana@seed.webag.local` / mesma senha |
| Contrato da API, e-mails de teste | http://localhost:3000/docs, http://localhost:8025 | |

Por padrão as lojas do seed ficam abertas 24 h (`SEED_HOURS=always_open`); para o horário real use `SEED_HOURS=realistic` e `pnpm db:seed`. Credenciais só de desenvolvimento (`README.md`). **Como validei:** conferi comandos, scripts e credenciais contra `package.json`, `scripts/` e o seed; **não reexecutei o `setup`** porque o Docker desta máquina está em uso por outra tarefa. O último `setup` rodado foi o do QA em `036e791` (`SKIP_DOCKER=1`, 15,5 s, 57 migrações; com Docker nas portas padrão não foi exercitado no tip).

## (c) O que depende do Yago (por urgência)

Os 19 itens de `status.md` agrupados em 14 linhas; **0 feitos**. "Cond." = condição do Security para o G5 (`seguranca/revisoes/parecer-final-rc.md`).

| # | Item | Por quê | Onde configurar / ler | Cond. |
|---|---|---|---|---|
| 1 | Autorizar merge em `main`, tag `v1.0.0` e decidir squash | Regra do time (DEC-003); só você libera | Responder ao CEO; fica em `decisoes.md` | |
| 2 | Conta Mercado Pago em sandbox (Access Token, Public Key) | O adaptador **nunca falou com o MP real**: maior risco técnico | `.env`: `PAYMENT_PROVIDER=mercadopago`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`; app: `EXPO_PUBLIC_PAYMENT_MODE`, `EXPO_PUBLIC_MP_PUBLIC_KEY` (`README.md`, "Trocar do simulado") | C3 |
| 3 | Aparelho real (Android de entrada e iPhone), 3G | Nada foi tocado em celular | Roteiro `qa/relatorios/g4-rc.md` §10; Apple: conferir localização aproximada | C9 |
| 4 | Domínio, servidor, TLS, e-mail transacional, cofre de segredos; k6 em staging | Sem servidor nada foi executado em ambiente real | `deploy/guia-deploy.md`, `infra/scripts/gen-secrets.sh`; Security reexecuta a bateria no deploy real | C1, C2, C7 |
| 5 | Contas Apple Developer, Google Play, EAS; FCM/APNs; confirmar `br.com.webag.app` | Custam dinheiro (regra 6); o identificador não muda depois | `deploy/checklist-publicacao-lojas.md` §1 e §2 (preços lá são `[HIPÓTESE]`) | |
| 6 | Razão social, CNPJ, endereço da Webag | Decreto 7.962/2013; textos legais gravam estes dados | `.env` de produção: `COMPANY_LEGAL_NAME`, `COMPANY_CNPJ`, `COMPANY_ADDRESS`; trocar os valores de exemplo de `infra/env.prod.example` (SEC-189) | C10 |
| 7 | Encarregado (DPO) ou dispensa avaliada, com canal publicado | LGPD art. 41; alguém responde em 15 dias | `.env`: `DPO_EMAIL`; `seguranca/runbook-dsr.md`; admin: `privacy_officer_email` | C5 |
| 8 | Advogado revisar os 4 textos (privacidade, termos do cliente, termos do lojista, trocas): J1 a J21 | Hoje são proposta do PO, com selo "Versão para revisão" | `produto/legal/LEIA-ME.md` §6. Maiores riscos: reembolso do arrependimento (J2, J3), "até 2 h" e compensação (J14), estorno (J16), responsabilidade da Webag (J7), contrato do lojista (J12, J21), prazos de guarda (J10, J15), motoboy (J8, trava a contratação), **ECA Digital e idade (J17: pode exigir mudança no app)**. Depois: publicar a versão aprovada no admin e ligar `LEGAL_REVIEWED=true` (web) e `EXPO_PUBLIC_LEGAL_REVIEWED=true` (app) **juntos** | C4, C10 |
| 9 | Mercado Pago de produção (OAuth, segredo do webhook); split e KYC no piloto | Sem conta ativa a loja não cobra | `.env` de produção: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_OAUTH_REDIRECT_URI` | |
| 10 | Preencher Data Safety e App Privacy; conta demo para o revisor em staging | Formulário diferente do app é motivo de remoção | `seguranca/inventario-lojas.md`; `checklist-publicacao-lojas.md` §5 e §6 | C6, C8 |
| 11 | WhatsApp de suporte | Aparece no app e nos textos; sem ele grava "a definir" | Admin (chave `support_whatsapp`, `apps/api/src/modules/feedback/help.service.ts`) ou `NEXT_PUBLIC_SUPPORT_WHATSAPP` | |
| 12 | Confirmar as hipóteses da seção (d); horário real da logística; quem despacha motoboy para cumprir "até 2 h" (R-18); se a Webag absorve a tarifa do provedor em pedido cancelado | Decisões de negócio abertas | Seção (d); `qa/relatorios/g4-final.md` §9.1 | |
| 13 | WAF/CAPTCHA no login e envio de código; Sentry; GitHub Actions rodando; geocodificador (opcional) | Segurança recomenda WAF para o piloto; CI nunca rodou no GitHub | `.env`: `SENTRY_DSN`, `GEOCODING_PROVIDER` | |
| 14 | Fotos reais, cotação de 3 a 5 motoboys, pentest externo antes de escalar | Não bloqueiam o código | | |

## (d) Hipóteses assumidas

Todas `[HIPÓTESE]`. Chaves conferidas em `apps/api/src/modules/admin/parameters.definitions.ts` (admin > Todos os parâmetros). Validação planejada no piloto de 5 lojas (`qa/relatorios/revisao-funcional.md` §6).

| # | Hipótese (valor) | Onde muda |
|---|---|---|
| 1 | Comissão padrão 15% | `comissao_padrao_pct`; admin > Comissões (por categoria e por loja) |
| 2 | Tarifa do provedor, só estimativa do "Você recebe": PIX 0,99%, cartão 4,98%, paga o lojista | `taxa_provedor_pix_pct`, `taxa_provedor_cartao_pct` |
| 3 | Taxa de entrega ao cliente do seed (4 faixas de distância: até 2, 5, 10 e 15 km): R$ 6, 9, 12 e 15. O PO estima que o motoboy exija R$ 8 a R$ 18 (`produto/backlog.md` §7, item 13) | Admin > Frete por região (cada gravação cria uma versão); `apps/api/seed/logistics.ts` |
| 4 | Custo previsto do motoboy do seed: R$ 8, 11, 15 e 19 por faixa; **acima da taxa cobrada** (margem de entrega negativa até cotar motoboys) | Mesma tabela (custo previsto); o custo real é lançado por corrida em Logística, sem parâmetro |
| 5 | Logística seg a sáb, 09:00 às 20:00 | `logistica_horario`, `logistica_dias`; pausa por cidade em Logística |
| 6 | ETA: preparo 20 min, despacho 15, 6 min/km, rota x1,30, folga 15, teto 120 min | `entrega_preparo_padrao_min`, `entrega_despacho_min`, `entrega_min_por_km`, `entrega_rota_fator_pct`, `entrega_faixa_min`, `entrega_max_min` |
| 7 | Atraso: tolerância 15 min; compensação = frete grátis no próximo pedido; operação responde em 10 min | `entrega_atraso_tolerancia_min`, `entrega_compensacao_tipo`, `entrega_compensacao_cents`, `entrega_cancel_resposta_min` |
| 8 | Texto "até 2 h" proibido na comunicação até medir 95% das entregas | Não é parâmetro; regra de comunicação (HIP-E09) |
| 9 | Troca por tamanho/cor: 7 dias (loja escolhe 3 a 30), 1 por pedido, loja responde em 24 h (sem resposta aprova), taxa de coleta paga em 24 h, teto R$ 30. Prazos legais de 7/30/90 dias não editáveis | `troca_voluntaria_dias_padrao`, `_min`, `_max`, `troca_voluntaria_max_por_pedido`, `troca_resposta_h`, `troca_taxa_pagamento_h`, `taxa_coleta_max_cents` |
| 10 | Loja tem 10 min para aceitar, lembrete aos 5 | `loja_aceite_timeout_min`, `loja_aceite_lembrete_min` |
| 11 | PIX vale 15 min; até 3x, parcela mínima R$ 30; pedido máximo R$ 2.000 | `pix_expiracao_min`, `parcelas_max`, `parcela_min_cents`, `pedido_max_cents` |
| 12 | Pedido mínimo R$ 20; frete grátis e taxa de serviço desligados | `pedido_minimo_cents`, `frete_gratis_acima_cents`, `taxa_servico_tipo` |
| 13 | Loja nova: máx. R$ 500 por pedido, por 30 dias ou 20 pedidos | `loja_nova_pedido_max_cents`, `loja_nova_dias`, `loja_nova_pedidos` |
| 14 | Conta excluída: 72 h de arrependimento, anonimização em 15 dias; histórico de bloqueio guardado 5 anos (a validar com o jurídico) | `exclusao_arrependimento_horas`, `exclusao_anonimizacao_dias`, `retencao_bloqueio_anos`. O prazo de 5 anos dos aceites não é parâmetro |
| 15 | Prazo de estorno: PIX "até 1 dia útil", cartão "até 2 faturas" | Texto fixo no servidor (`orders.service.ts`): mudar exige código |

## (e) Backlog da fase 2

Fonte: `revisao-funcional.md` §7 (atualizado: o modo manutenção, antes item 1, já foi feito, DEC-073) e os SEC/BUG Baixos de `status.md`.

| # | Item | Gatilho ou prazo |
|---|---|---|
| 1 | Analytics de produto (medir demanda por região, ETA exibido, atrasos) | Antes de campanha paga |
| 2 | Web Push do painel do lojista (hoje: e-mail e alerta no painel, WB-192 C2) | Cancelamento por timeout de aceite > 5% |
| 3 | Conciliação: resolver divergência e alerta por e-mail ao admin (WB-113 C2/C4, WB-198) | 1ª divergência no sandbox ou produção |
| 4 | App do motoboy, rastreio, despacho automático (WB-300 a 309) | Mais de 15 entregas por hora |
| 5 | Estorno parcial da taxa de troca e atraso em tempo real (DT-062) | 3 casos por mês |
| 6 | Cupons próprios do lojista (WB-073); alvo do cupom da plataforma (DT-059) | Loja pede campanha |
| 7 | Causa do atraso e preparo real (WB-255 C5, WB-257 C6); aviso automático de mudança de comissão (hoje manual, DEC-081) | Após os primeiros dados |
| 8 | Login Google/Apple (WB-010), central de notificações (WB-195), lista de espera por região, item indisponível com estorno parcial (WB-070) | Conforme uso |
| 9 | 2FA do lojista (WB-079), repasses do modo centralizado (WB-112), 2º provedor de pagamento (WB-161) | Se o KYC do MP barrar lojistas |
| 10 | Pontos, assinatura, chat (WB-310 a 334) | Fora do brief da 1.0 |
| 11 | SEC-186 (bloquear conta com exclusão pendente); SEC-189 (seed com razão social e CNPJ de exemplo); expurgo de 5 anos dos aceites (DT-063) | Antes do piloto; antes de `LEGAL_REVIEWED=true`; depois do jurídico |
| 12 | SEC-150 e 174 (várias réplicas), SEC-161 (restore de backup), SEC-162 (token OAuth do lojista excluído) | Antes de 2 réplicas / 1º restore / 1ª exclusão de lojista |
| 13 | SEC-146 (dados do cliente no WhatsApp do operador), SEC-149 (teto da loja nova), SEC-163 c/d | Política (C4); monitorar no piloto; sem prazo |
| 14 | BUG-031 (selo "Versão para revisão" no app); "Pedir troca" ainda aparece após arrependimento aprovado; SEC-188 conta a abertura ao emitir a URL | Antes de publicar os textos; PO e Security avaliam |
| 15 | Dívida aceita (DEC-076): eventos e e-mail em memória, backup com RPO de 24 h, 1 instância, busca sem trigram; DT-034 (token OAuth do lojista expira em 180 dias: job antes do dia 150); testes BUG-029, 030 e 028(b) | Conforme `arquitetura/divida-tecnica.md` |

## (f) O que NÃO foi testado

- **Mercado Pago real**: PIX, cartão, 3DS, split, webhook assinado, estorno, tarifa (tudo foi com o provedor `fake`).
- **Aparelho real**: Android, iPhone, 3G, Expo Go, push (FCM/APNs), leitor de tela. Só o navegador (react-native-web).
- **Carga em staging** (k6) e contêiner com 1 GB ou mais: o k6 local do RC teve a API a ~950 MB e não foi repetido no tip.
- **Windows e macOS**: instruções escritas, nunca executadas.
- **Deploy real**: servidor, nginx, TLS, restore de backup, GitHub Actions. Os arquivos existem; nunca rodaram.
- Também NÃO TESTADO: `SEED_HOURS=realistic`, domingo e feriado, `pnpm build` completo, `/legal/*` do app com `LEGAL_REVIEWED=true`. Usabilidade foi simulada (sem usuários reais); Nielsen e revisão funcional não foram refeitos após as correções (`status.md`).

## (g) Estado do G4/G5 e o que falta para a tag

| Gate | Estado |
|---|---|
| G0 a G3 | Aprovados |
| **G4** | **Aprovado pelo CEO em `036e791` (DEC-084)**: QA aprovado com ressalvas, sem veto; Security aprovado, sem veto; tech-lead com ressalvas, A-01 e A-02 corrigidos |
| **G5** | **Não decidido.** Security: aprovado com condições C1 a C10; depende dos itens 2 a 13 da seção (c) |

Para a tag **só falta o item 1**: sua autorização escrita para (1) merge do branch em `main`, (2) tag `v1.0.0` e (3) decidir se os 552 commits entram em squash ou com o histórico (há vários `chore: checkpoint`; `gestao/checklist-dod.md` 1b). A visibilidade privada do repositório não foi verificada. A tag não publica nada nas lojas (isso é o G5). Para o G4 sem ressalva, faltam os itens 2, 3 e 4. DoD pelo time: cerca de 97%, **estimativa do PM, não medição** (`status.md`).
