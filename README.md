# Webag

Marketplace regional de bens de consumo para Francisco Morato e região (Grande SP): o cliente compra de lojas locais pelo app, o lojista cuida de pedidos e catálogo pelo painel web, a Webag administra tudo pelo painel admin. Monorepo com API, painéis web, site público e app.

> Visão e escopo: `docs/00-visao/brief.md`. Decisões: `docs/decisoes.md` e `docs/arquitetura/adr/`. Andamento: `docs/status.md`. Validação de que sobe do zero: `docs/qa/relatorios/setup-do-zero.md`.

## Subir tudo (3 comandos)

Precisa de Git, Node.js (24; mínimo 22.12), pnpm 10 e Docker. Instalação por sistema na próxima seção.

```bash
git clone https://github.com/yagogavilan/webag.git
cd webag
pnpm install
pnpm run setup      # cria o .env, sobe banco, Redis, armazenamento e e-mail de teste, aplica migrações e dados de demonstração
pnpm dev            # API (3000), painéis e site (3001) e app (Metro, 8081)
```

Pronto: http://localhost:3001/admin/entrar (admin), http://localhost:3001/lojista/entrar (lojista), http://localhost:3000/docs (contrato da API), http://localhost:8025 (caixa de e-mail de teste). Credenciais abaixo. Para conferir que tudo funciona, com a API rodando: `pnpm smoke` (cadastra um cliente, faz um pedido de retirada e outro de entrega com PIX simulado, em ~10 s).

`pnpm run setup` é seguro de repetir: nunca sobrescreve um `.env` existente, espera os serviços ficarem prontos, cria os buckets de fotos antes do seed e, se a porta do Postgres (5432) ou do Redis (6379) já estiver ocupada na sua máquina, escolhe outra sozinho e grava no `.env`. Atenção: `pnpm setup` **sem** `run` é um comando embutido do pnpm e não faz isto.

## Instalar as ferramentas, por sistema

| | Windows 10/11 | macOS | Linux (Ubuntu/Debian) |
|---|---|---|---|
| Git | [git-scm.com](https://git-scm.com/download/win) | `brew install git` | `sudo apt install -y git curl` |
| Node 24 | [nodejs.org](https://nodejs.org) (LTS) | `brew install node@24` | `curl -fsSL https://deb.nodesource.com/setup_24.x \| sudo -E bash - && sudo apt install -y nodejs` |
| pnpm 10 | PowerShell como administrador: `corepack enable` (ou `npm i -g pnpm@10.28.0`) | `corepack enable` | `sudo corepack enable` |
| Docker | [Docker Desktop](https://www.docker.com/products/docker-desktop/) com o backend **WSL 2** (reinicie quando pedir e deixe o programa **aberto**) | Docker Desktop (aberto) | `curl -fsSL https://get.docker.com \| sudo sh && sudo usermod -aG docker "$USER"` e entre na sessão de novo |
| Onde rodar os comandos | PowerShell (ou um terminal WSL 2, ver nota) | Terminal | Terminal |

- **Windows**: os comandos são os mesmos, no PowerShell. Se algo do Docker ou do Node der problema, a saída mais robusta é instalar o **WSL 2 + Ubuntu** (`wsl --install` no PowerShell), seguir a coluna Linux **dentro** do Ubuntu e clonar em `~/webag` (não em `/mnt/c/...`, que é lento).
- **macOS com chip Apple (M1 ou mais novo)**: depois do `pnpm run setup` criar o `.env`, defina `POSTGIS_IMAGE=imresamu/postgis:18-3.6-alpine` nele (a imagem oficial do PostGIS é só Intel) e rode `pnpm run setup` de novo.
- Confirme: `git --version`, `node --version` (v24...), `pnpm --version` (10.28...), `docker compose version`.
- Sem Docker: `SKIP_DOCKER=1 pnpm run setup` (PowerShell: `$env:SKIP_DOCKER=1; pnpm run setup`), com Postgres 16+ com PostGIS e Redis seus, e o armazenamento S3 e o e-mail de teste por sua conta.

> Testado em Linux (Ubuntu, Node 22 e Docker 29). **Windows e macOS não foram testados** neste repositório; os passos acima seguem a documentação oficial das ferramentas. Se falhar, o erro mais provável é Docker fechado ou porta ocupada, e o `setup` diz qual.

## Credenciais de demonstração (só desenvolvimento)

Todas criadas pelo seed. **Nunca existem em produção** (o seed de produção só cria o primeiro admin, categorias, regiões, parâmetros e textos legais).

**Horário das lojas de demonstração (`SEED_HOURS`, no `.env`):** por padrão (`always_open`) as lojas do seed e a logística ficam **abertas 24 h, todos os dias**, para a demonstração e o `pnpm smoke` funcionarem a qualquer hora, inclusive de noite e no fim de semana. Para ver o horário real de cada loja (por exemplo, o Mercadinho Boa Compra das 7 h às 20 h, domingo das 8 h às 13 h, e a entrega das 9 h às 20 h de segunda a sábado), use `SEED_HOURS=realistic` e rode `pnpm db:seed`; para voltar, `always_open` e `pnpm db:seed` de novo. A troca só atinge lojas que ainda estão no horário padrão do outro modo (o que você editou no painel não é tocado). Detalhe de fim de dia: o horário de loja aceita no máximo 23:59, então há um minuto por dia (23:59) em que o servidor considera a loja fechada; o `pnpm smoke` espera esse minuto passar.

| Perfil | E-mail | Senha | Observação |
|---|---|---|---|
| Admin (super admin) | `admin@webag.local` | `Webag-Admin-Dev-2026` | No 1º login o painel exige o 2º fator (ver abaixo) |
| Lojista (dono) | `lojista.mercadinho-boa-compra@seed.webag.local` | `webag-seed-lojista-2026` | Há 12 lojas: troque o final pelo nome da loja (`lojista.farmacia-saude-ja@...`, `lojista.pet-shop-amigo-fiel@...`, `lojista.padaria-pao-quente@...` etc.; lista em `apps/api/seed/onda2.ts` e `onda3.ts`) |
| Lojista (funcionário) | `funcionario.mercadinho-boa-compra@seed.webag.local` | `webag-seed-lojista-2026` | Só pedidos e catálogo; não vê financeiro, equipe nem configurações. Uma por loja |
| Cliente | `cliente.ana@seed.webag.local` | `webag-seed-lojista-2026` | Também `bruno`, `carla`, `diego`, `elisa`, `fabio`. Endereço em Francisco Morato; cada um já tem pedidos de demonstração |
| Cupons | `BEMVINDO10`, `FRETEGRATIS`, `LOJA5` | | |
| Mailpit (e-mails de código e convite) | http://localhost:8025 | | Recebe tudo; não envia nada para fora |
| Console do armazenamento | http://localhost:9001 | `webag-dev` / `webag-dev-secret-only` | Fotos |
| Banco | `localhost:5432`, banco `webag` | `webag` / `webag_dev_only` | |

**Segundo fator do admin (TOTP) em desenvolvimento.** No primeiro login o painel mostra a tela "Configurar autenticador" com o **segredo em texto** (copie: botão "Copiar"). Duas opções:

1. App autenticador no celular (Google Authenticator, Authy, 1Password): digite o segredo manualmente.
2. Sem celular: `pnpm totp <SEGREDO>` imprime o código de 6 dígitos atual (vale ~30 s). Digite-o na tela. Guarde os 10 códigos de recuperação que aparecem uma única vez. Nos logins seguintes, repita `pnpm totp <SEGREDO>`.

Se perder o segredo em desenvolvimento, o jeito mais simples é recomeçar o banco (`docker compose down -v` e `pnpm run setup`). Em produção existe o procedimento de emergência `docs/arquitetura/runbook-break-glass.md`.

## Pagamento simulado ponta a ponta

Com `PAYMENT_PROVIDER=fake` (padrão em desenvolvimento) nada é cobrado. O fluxo completo, no app ou na web:

1. Entre como cliente, escolha uma loja, monte a sacola e finalize com **PIX**: o pedido fica "Aguardando pagamento" com o código copia e cola (fictício).
2. Em outro terminal: `pnpm pagar`. Ele faz o papel do banco e do Mercado Pago, aprovando o PIX do pedido mais recente pelo **mesmo caminho do webhook real** (`pnpm pagar recusar` e `pnpm pagar expirar` simulam os outros desfechos). O pedido vira "Recebido" na hora.
3. Entre como lojista (ou funcionário) da mesma loja: aceite, separe, marque pronto. Retirada: informe o código de 4 dígitos que o cliente vê. Entrega: a corrida cai na logística (painel admin > Logística).
4. **Cartão** no provedor simulado: use os cartões de teste do app (nenhum número real é digitado). Detalhes em `apps/api/README.md`.

`pnpm smoke` faz esse roteiro inteiro por script e confere cada etapa.

## Abrir o app

`pnpm dev` já sobe o Metro (porta 8081). No terminal aparece o QR code.

- **Celular (Expo Go)**: instale o Expo Go, escaneie o QR (celular e computador na **mesma rede Wi-Fi**). O celular não enxerga o `localhost` do computador: no `.env` defina `EXPO_PUBLIC_API_URL=http://<IP-do-computador>:3000` e `EXPO_PUBLIC_WEB_URL=http://<IP-do-computador>:3001` (IP: `ipconfig` no Windows, `ipconfig getifaddr en0` no macOS, `hostname -I` no Linux) e reinicie o `pnpm dev`. Se o firewall bloquear, libere as portas 3000, 3001 e 8081 para a rede privada.
- **Emulador Android / simulador iOS**: com o emulador aberto, `pnpm --filter @webag/mobile android` (ou `ios`, só macOS). O emulador Android alcança o computador em `10.0.2.2` (`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`).
- **Navegador** (DEC-058): com a API no ar (`pnpm dev` ou só a API), rode `pnpm web` e abra http://localhost:8081 (ou aperte `w` no terminal do Metro). É o mesmo app, via `react-native-web`; serve para ver e testar as telas sem celular. Limites: a sessão fica só na memória da aba (recarregar a página sai da conta; sem `expo-secure-store` na web), sem push e sem localização do aparelho (escolha a cidade ou digite o CEP). O app de verdade é o nativo. Roteiro automatizado: `node apps/mobile/scripts/web-smoke.cjs` (Playwright; cidade, login, loja, produto e sacola).

## Trocar do simulado para o Mercado Pago real

O mesmo código roda nos dois modos; trocar é só variável de ambiente (nenhum deploy de código). Com `PAYMENT_PROVIDER=mercadopago` e qualquer chave faltando a API **não sobe** e diz o nome da variável (nunca o valor). Todas as contas e chaves são do fundador; use primeiro as credenciais de **teste** (sandbox).

Passo a passo: https://www.mercadopago.com.br/developers > **Suas integrações** > criar (ou abrir) a aplicação da Webag, tipo marketplace, com OAuth habilitado.

| Variável (`.env`) | Onde pegar no painel do Mercado Pago |
|---|---|
| `MP_ACCESS_TOKEN` | Aplicação > **Credenciais** > Access Token (`TEST-...` no sandbox; `APP_USR-...` em produção; a API recusa `TEST-` em produção) |
| `MP_PUBLIC_KEY` | Aplicação > Credenciais > Public Key. Não é segredo. Também vai no app: `EXPO_PUBLIC_MP_PUBLIC_KEY` |
| `MP_CLIENT_ID`, `MP_CLIENT_SECRET` | Aplicação > Credenciais (dados da aplicação) |
| `MP_WEBHOOK_SECRET` | Aplicação > **Webhooks** > Configurar notificações > "Revelar" a assinatura secreta (um segredo por ambiente) |
| `MP_OAUTH_REDIRECT_URI` | `https://<painel do lojista>/lojista/onboarding/4`. Cadastre a **mesma** URL em "URLs de redirecionamento" da aplicação (o Mercado Pago só aceita HTTPS) |
| `PAYMENT_TOKEN_ENC_KEY` | Você gera: `openssl rand -base64 32` (cifra os tokens dos lojistas; guarde fora do servidor) |

1. No `.env`: `PAYMENT_PROVIDER=mercadopago` e as variáveis acima. No app: `EXPO_PUBLIC_PAYMENT_MODE=mercadopago` e `EXPO_PUBLIC_MP_PUBLIC_KEY`.
2. **URL do webhook** (cadastrar em Webhooks, evento "Pagamentos"): `https://<API_PUBLIC_URL>/v1/webhooks/mercadopago`. O Mercado Pago precisa alcançar essa URL pela internet: em desenvolvimento use um túnel HTTPS (ngrok, Cloudflare Tunnel) apontando para a porta 3000 e coloque a URL do túnel em `API_PUBLIC_URL`. Em produção é `https://api.<seu domínio>/v1/webhooks/mercadopago`.
3. Reinicie a API. Cada lojista conecta a própria conta do Mercado Pago no cadastro da loja (etapa 4); sem conta ativa a loja não cobra.
4. Em produção as rotas de simulação (`/v1/dev/payments`) não existem e o provedor `fake` é recusado.

**O que não foi validado:** o adaptador foi escrito contra o SDK oficial e testado com respostas simuladas; **nunca falou com o Mercado Pago de verdade**. Os pontos `[confirmar no sandbox]` (taxa do split, estorno parcial, CPF no PIX) estão listados em `apps/api/README.md`. Rode o sandbox completo antes do primeiro pedido real. Detalhes das chaves, do split e do estorno: `apps/api/README.md` e `docs/deploy/guia-deploy.md` seção 7.

## Mapa do repositório

| Pasta | O que é | Porta |
|---|---|---|
| `apps/api` | API NestJS (`/health`, `/health/ready`, contrato em `/docs`, Socket.IO `/rt`) | 3000 |
| `apps/web` | Next.js: painel do lojista (`/lojista`), admin (`/admin`) e site público (início, privacidade, termos, exclusão de conta, página do cartão) | 3001 |
| `apps/mobile` | App do cliente (Expo + Expo Router) | 8081 (Metro) |
| `packages/shared` | Tipos, schemas Zod e cliente gerados do OpenAPI | |
| `packages/tokens` | Design tokens (CSS para a web, TS para o app) | |
| `docs/arquitetura/` | Índice, ADRs, contrato (`api/openapi.yaml`), modelo de dados, revisões, dívida técnica | |
| `docs/deploy/` | Guia de deploy e checklist das lojas | |
| `infra/` | Compose e nginx de produção, backup, scripts, modelos de `.env` | |
| `scripts/` | Utilitários da raiz (tabela abaixo) | |
| `docker-compose.yml` | Dev: PostgreSQL+PostGIS (5432), Redis (6379), RustFS/S3 (9000, 9001), Mailpit (1025, 8025) | |

## Comandos (raiz)

| Comando | Faz |
|---|---|
| `pnpm run setup` | Prepara o ambiente do zero (`.env`, Docker, migrações, seed). Idempotente |
| `pnpm dev` | API, painéis e Metro em modo desenvolvimento (lê o `.env` da raiz) |
| `pnpm web` | Só o app no navegador (Metro com `--web`, http://localhost:8081; precisa da API no ar) |
| `pnpm smoke` | Teste de fumaça ponta a ponta contra a API rodando (login de todos os perfis, pedido de retirada e de entrega com PIX simulado) |
| `pnpm pagar [recusar\|expirar]` | Aprova (ou recusa, ou expira) o PIX simulado do pedido mais recente |
| `pnpm web:compra [entrega-pix\|retirada-pix\|cartao]` | Compra de ponta a ponta no app web (Playwright do próprio workspace, sem instalar nada global; precisa de API, `pnpm web` e site no ar). Na primeira vez: `pnpm --filter @webag/web exec playwright install chromium` (o comando avisa se faltar) |
| `pnpm web:smoke` | Fumaça do app no navegador (mesmo Playwright do workspace) |
| `pnpm web:e2e [fake\|real\|all]` | Playwright do site e dos painéis (`apps/web`): `fake` (API falsa, sem infraestrutura), `real` (API real do `setup`) ou `all` (padrão, um depois do outro; espera a porta do site ficar livre entre as suítes). Portas: `E2E_WEB_PORT` e `REAL_WEB_PORT` (padrão 3101), `E2E_API_PORT` (3999); uma porta nova precisa entrar em `CORS_ORIGINS`. `PW_CHANNEL=chrome` usa o Chrome instalado |
| `pnpm telas` | Gera os screenshots de todas as telas em `docs/telas/` (app 390x844; lojista, admin e site em 1440x900 e 390x844) com a API real e o seed; ver `docs/telas/README.md` |
| `pnpm totp <segredo>` | Código TOTP do admin sem celular (só desenvolvimento) |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | Qualidade, como no CI. Os testes de integração da API (`pnpm --filter @webag/api test:e2e`) leem `DATABASE_URL` e `REDIS_URL` do `.env` da raiz (a variável do ambiente tem prioridade; sem nenhuma das duas, 5432 e 6379), criam o banco `<nome>_<pid>_test` e imprimem no início contra qual PostgreSQL e Redis estão rodando. Nunca tocam no banco de desenvolvimento |
| `pnpm generate` / `pnpm generate:check` | Regera `packages/shared` a partir do `openapi.yaml` / falha se estiver desatualizado |
| `pnpm db:migrate`, `pnpm db:seed` | Migrações e seed (idempotentes) |
| `pnpm licencas` | Regera `docs/legal/dependencias-npm.md` (licenças das dependências) |
| `docker compose down` / `down -v` | Para a infra (dados ficam) / para **e apaga** os volumes |

Upload de foto e documento pelo navegador (painéis em `localhost:3001`/`3101`, app web em `8081`): o `storage-init` aplica CORS (GET, PUT, POST, HEAD) nos dois buckets com as origens do `CORS_ORIGINS` do `.env` (BUG-025). Se o seu `.env` é antigo e não lista a porta do painel que você usa, ajuste `CORS_ORIGINS` e rode `docker compose run --rm storage-init` de novo. Em produção o equivalente é o CORS do bucket (`docs/deploy/guia-deploy.md`). Playwright contra a API real (`apps/web`, `e2e-real`): os testes 04 e 05 leem o banco por `REAL_DB_URL`; sem ela usam `DATABASE_URL` (ambiente ou `.env` da raiz, o banco do seu `pnpm run setup`) e, sem nenhuma, `postgresql://webag:webag_dev_only@localhost:5432/webag`. Defina `REAL_DB_URL` só se o banco for outro (porta ou nome diferentes), junto de `REAL_API_URL` (API em `http://localhost:3300`) e `PW_CHANNEL=chrome`.

Passo a passo manual, se o `setup` falhar: `cp infra/env.example .env` (PowerShell: `Copy-Item infra\env.example .env`), `docker compose up -d --wait postgres redis mailpit storage`, `docker compose run --rm storage-init`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. O modelo de variáveis está em `infra/env.example` (não em `.env.example`; ver DT-008). API em container, ainda em desenvolvimento: `docker compose --profile app up -d --build api`.

Os testes E2E da API usam banco real: `E2E_DEPS=1` com Postgres e Redis no ar (o CI faz isso sempre).

## Limites conhecidos

- **Mercado Pago real, push real e Sentry do app/painel não foram exercitados** (dependem de contas do fundador). Estão prontos para ligar só com chaves.
- **App no navegador**: abre com `pnpm web` (DEC-058), com os limites descritos em "Abrir o app". Captura do roteiro: `docs/qa/relatorios/app-web-sacola.png`.
- O botão "Simular pagamento" do app depende de uma rota de dev por pedido que a API ainda não expõe (`docs/gestao/fila-mobile.md`): enquanto isso, use `pnpm pagar`.

## Como o time trabalha

Regras em `CLAUDE.md`. O contrato muda antes do código (`docs/arquitetura/api/openapi.yaml` > `pnpm generate`). Dívida técnica em `docs/arquitetura/divida-tecnica.md`. CI em `.github/workflows/ci.yml` (instalar, auditar, varrer segredos, contrato em dia, tokens, lint, typecheck, testes, build, imagem da API).

## Colocar no ar (produção)

Guia completo, para quem não é da área técnica: [`docs/deploy/guia-deploy.md`](docs/deploy/guia-deploy.md) (VPS com Docker, do zero ao HTTPS, e opção gerenciada). Resumo do caminho de VPS:

```bash
git clone git@github.com:yagogavilan/webag.git && cd webag
sh infra/scripts/gen-secrets.sh          # cria o .env de produção com segredos novos (edite domínios e chaves)
sh infra/scripts/prod.sh build           # constrói as imagens (API, painel, backup)
sh infra/scripts/init-tls.sh             # sobe tudo e emite o HTTPS (Let's Encrypt)
sh infra/scripts/prod.sh run --rm seed   # primeiro administrador e dados base
```

| Documento | O que tem |
|---|---|
| `docs/deploy/guia-deploy.md` | Passo a passo, variáveis de todos os serviços, webhook do Mercado Pago, backup e restauração, rotação de segredos, monitoramento |
| `docs/deploy/checklist-publicacao-lojas.md` | EAS Build/Submit, ícones, textos, privacidade, regras da Apple e do Google, o que depende do fundador |
| `docs/arquitetura/README.md` | Índice de ADRs, contrato, modelo de dados, revisões e dívida técnica |
| `docs/qa/plano-carga.md` | Plano de teste de carga |
| `THIRD_PARTY_NOTICES.md` | Licenças de terceiros (fontes, ícones, dependências) |
| `infra/docker-compose.prod.yml`, `infra/env.prod.example` | Composição de produção e modelo das variáveis (o `.env` real nunca é commitado) |
