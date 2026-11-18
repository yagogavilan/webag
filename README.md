# Webag

Marketplace regional de bens de consumo para Francisco Morato e região (SP). Monorepo com API, painéis web (lojista e admin) e app do cliente.

> Estado: v1.0 em construção (andamento em `docs/status.md`). Visão e escopo: `docs/00-visao/brief.md`. Decisões: `docs/decisoes.md` e `docs/arquitetura/adr/`.

## Estrutura

| Pasta | O que é | Porta local |
|---|---|---|
| `apps/api` | API NestJS: `/health`, `/health/ready`, contrato em `/docs` | 3000 |
| `apps/web` | Next.js: painel do lojista em `/lojista` e admin em `/admin` (DEC-005) | 3001 |
| `apps/mobile` | App do cliente (Expo + Expo Router) | 8081 (Metro) |
| `packages/shared` | Tipos, schemas Zod e cliente gerados do OpenAPI | — |
| `packages/tokens` | Design tokens (CSS para web, TS para o app) | — |
| `docs/arquitetura/api/openapi.yaml` | Contrato da API (fonte da verdade) | — |
| `docker-compose.yml` | PostgreSQL + PostGIS, Redis, S3 local (RustFS), Mailpit | 5432, 6379, 9000/9001, 8025 |

Stack e versões: `docs/arquitetura/adr/ADR-001-stack.md`.

## Pré-requisitos

| O quê | Versão | Para quê |
|---|---|---|
| Git | qualquer recente | Baixar o código |
| Node.js | 24 (`.nvmrc`; mínimo 22.12) | API, painéis e app |
| pnpm | 10.28 | Gerenciador de pacotes do monorepo |
| Docker com Compose v2 | Docker Desktop (Windows/macOS) ou Docker Engine (Linux) | Banco, Redis, armazenamento e e-mail de teste |
| Expo Go no celular ou emulador Android/iOS | | Abrir o app |

### Instalação das ferramentas, por sistema

**Windows 10/11** (PowerShell)

1. Instale o [Git para Windows](https://git-scm.com/download/win), o [Node.js 24 LTS](https://nodejs.org) e o [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ative o backend WSL 2 quando ele pedir e reinicie).
2. Abra um PowerShell **como administrador** uma vez e rode `corepack enable` (ou, sem administrador: `npm install -g pnpm@10.28.0`).
3. Confirme: `git --version`, `node --version` (v24...), `pnpm --version` (10.28...), `docker compose version`. O Docker Desktop precisa estar **aberto** (ícone da baleia ativo).

**macOS**

1. Instale o [Homebrew](https://brew.sh) e rode `brew install git node@24 && corepack enable` (ou `npm install -g pnpm@10.28.0`).
2. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) e abra-o.
3. **Mac com chip Apple (M1 ou mais novo):** a imagem oficial do PostGIS é só para Intel. Depois de criar o `.env` (abaixo), defina `POSTGIS_IMAGE=imresamu/postgis:18-3.6-alpine` nele.

**Linux (Ubuntu/Debian)**

```bash
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs   # ou use o nvm: nvm install 24
sudo corepack enable                                                                               # ou: sudo npm install -g pnpm@10.28.0
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"                       # saia e entre na sessão de novo
```

## Primeira execução (desenvolvimento)

Os comandos são os mesmos nos três sistemas (no Windows, use o PowerShell).

```bash
git clone https://github.com/yagogavilan/webag.git
cd webag
pnpm install
pnpm run setup      # cria o .env, sobe Postgres+PostGIS, Redis, Mailpit e storage, aplica migrações e seed
pnpm dev            # API (3000), painéis web (3001) e Metro do app (8081)
```

O `pnpm run setup` faz tudo sozinho: copia `infra/env.example` para `.env` (nunca sobrescreve um `.env` que já exista), sobe o `docker compose` e roda migrações e seed. Pode rodar de novo sem medo (é idempotente). Atenção: `pnpm setup` **sem** `run` é um comando embutido do pnpm e não faz isto; use `pnpm run setup` (ou `pnpm bootstrap`).

**Passo a passo manual** (se preferir, ou se o `setup` falhar):

| | macOS / Linux | Windows (PowerShell) |
|---|---|---|
| 1. Criar o `.env` | `cp infra/env.example .env` | `Copy-Item infra\env.example .env` |
| 2. Subir a infraestrutura | `docker compose up -d` | `docker compose up -d` |
| 3. Migrações e seed | `pnpm db:migrate && pnpm db:seed` | `pnpm db:migrate; pnpm db:seed` |
| 4. Rodar | `pnpm dev` | `pnpm dev` |

Sem Docker: `SKIP_DOCKER=1 pnpm run setup` (Linux/macOS) ou `$env:SKIP_DOCKER=1; pnpm run setup` (PowerShell), com Postgres 16+ (PostGIS) e Redis próprios. Para parar a infraestrutura: `docker compose down` (os dados ficam; `docker compose down -v` **apaga** os volumes).

- API: http://localhost:3000/health e contrato em http://localhost:3000/docs
- Painéis: http://localhost:3001/lojista e http://localhost:3001/admin
- App: escaneie o QR do Metro com o Expo Go. No celular físico, troque `EXPO_PUBLIC_API_URL` no `.env` pelo IP da máquina na rede local.
- Apple Silicon: defina `POSTGIS_IMAGE=imresamu/postgis:18-3.6-alpine` no `.env` (a imagem oficial do PostGIS é só amd64).

API em container, **ambiente local** (modo development, pagamento e e-mail simulados): `docker compose --profile app up -d --build api`.

O modelo de variáveis está em `infra/env.example` (e não em `.env.example` na raiz; ver `docs/arquitetura/divida-tecnica.md` DT-008). Valores ali são só para desenvolvimento. Itens marcados `[fundador]` dependem de contas do fundador; sem eles o sistema roda em modo simulado.

## Comandos (raiz)

| Comando | Faz |
|---|---|
| `pnpm lint` | ESLint em todos os pacotes |
| `pnpm typecheck` | TypeScript strict em todos os pacotes |
| `pnpm test` | Testes unitários + E2E da API |
| `pnpm build` | Build da API, shared, web e bundle do app (`expo export`) |
| `pnpm generate` | Regera `packages/shared` a partir do `openapi.yaml` |
| `pnpm generate:check` | Falha se o código gerado estiver desatualizado |

Os testes E2E de readiness com banco real só rodam com `E2E_DEPS=1` e Postgres/Redis no ar (`docker compose up -d postgres redis`); o CI faz isso sempre.

## Como o time trabalha

Regras em `CLAUDE.md`. Contrato muda antes do código (`docs/arquitetura/api/openapi.yaml` → `pnpm generate`). Dívida técnica em `docs/arquitetura/divida-tecnica.md`. CI em `.github/workflows/ci.yml`.

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
| `infra/docker-compose.prod.yml` | Composição de produção (nginx, certbot, web, API, migrações, Postgres, Redis, armazenamento, backup) |
| `infra/env.prod.example` | Modelo das variáveis de produção (o arquivo real é o `.env`, nunca commitado) |
| `apps/api/Dockerfile`, `apps/web/Dockerfile` | Imagens de produção (multi-stage, usuário não-root, healthcheck) |
