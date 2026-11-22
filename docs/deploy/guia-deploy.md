# Guia de deploy do Webag

Para quem vai colocar o Webag no ar, mesmo sem ser da área técnica. Cada passo diz o que digitar e o que esperar ver. Escrito em 2026-11-18 e revisado em 2026-11-19 (Onda 7: site público, variáveis novas, pendências conferidas contra o código); tudo que é preço, tela de terceiros ou limite de serviço está marcado `[HIPÓTESE]` e precisa ser conferido no dia (fornecedores mudam).

Arquivos usados: `infra/docker-compose.prod.yml`, `infra/env.prod.example`, `infra/nginx/`, `infra/backup/`, `infra/scripts/`, `apps/api/Dockerfile`, `apps/web/Dockerfile`.

## 1. Visão geral e o que decidir

```
Internet ──> nginx (80/443, HTTPS) ──┬─ api.<domínio>      ──> API (porta interna 3000; app, webhook, tempo real)
                                     ├─ admin.<domínio>    ──> web (painel admin)
                                     ├─ lojista.<domínio>  ──> web (painel lojista)
                                     ├─ <domínio>          ──> web (site público: início, privacidade, termos, exclusão de conta, página do cartão)
                                     └─ arquivos.<domínio> ──> armazenamento S3 (fotos)
Rede interna (sem porta aberta): API, web, PostgreSQL+PostGIS, Redis, armazenamento, backup
```

| Decisão | Recomendação | Por quê |
|---|---|---|
| Onde hospedar | **Caminho A: VPS com Docker** (seção 3) para o lançamento | Custo fixo e baixo, tudo num lugar, backup sob seu controle. Exige ~2 h na 1ª vez e cuidado com atualizações do servidor |
| Alternativa | **Caminho B: gerenciado** (seção 4) | Menos manutenção de servidor; custo maior e variável; as peças (PostGIS, Redis sem perda de dados) precisam ser conferidas no provedor |
| Fotos | VPS: no próprio servidor (padrão do compose). Gerenciado: Cloudflare R2 ou AWS S3 | Em servidor próprio o disco é o ponto único de falha; o backup de arquivos (seção 8) cobre isso |
| Admin e lojista | Hosts **separados** (obrigatório, SEC-116) | Falha de segurança em um painel não vaza para o outro |
| Site público | Domínio principal (`PUBLIC_HOST`, ex.: `webag.com.br`), servido pelo mesmo `web` | As lojas exigem URLs públicas de privacidade e de exclusão de conta; a página segura do cartão (`/pagar/cartao`) também vive aqui e **só responde neste host** (SEC-106) |

### O que o fundador precisa fornecer (ninguém consegue fazer por ele)

| Item | Quando | Observação |
|---|---|---|
| Domínio (ex.: `webag.com.br`) | Antes de tudo | Registro.br para `.com.br` (exige CPF/CNPJ) |
| Servidor (VPS) ou conta no provedor gerenciado | Antes de tudo | Gasto recorrente: exige sua autorização (CLAUDE.md, regra 6) |
| Conta e aplicação no Mercado Pago, com credenciais de **produção** | Antes do 1º boot de produção (ver pendência abaixo) | Seção 7 |
| Conta de e-mail transacional (Brevo, Resend, SES...) com domínio verificado | Antes do 1º boot | Seção 6.3 |
| Conta Expo (EAS), Apple Developer, Google Play Console | Para publicar o app | `docs/deploy/checklist-publicacao-lojas.md` |
| Conta Cloudflare R2 (ou S3) para **backup fora do servidor** | Antes de aceitar pedidos reais | Seção 8 |
| Conta Sentry [opcional] | Antes de aceitar pedidos reais | A API já lê `SENTRY_DSN`; o painel web e o app ainda não (DT-039) |

### Pendências conhecidas do código (afetam o deploy)

Conferidas no código em 2026-11-19. Estão em `docs/arquitetura/divida-tecnica.md`.

1. **Ambiente de ensaio (`staging`) existe** (DT-038): `APP_ENV=staging` aceita pagamento simulado, credencial `TEST-` do Mercado Pago e geocodificador simulado, **sem** rotas de simulação (`/v1/dev/payments` nunca existe fora de desenvolvimento). Produção (`APP_ENV=production`, o padrão) **recusa** os três e os segredos de desenvolvimento. Nunca use `staging` com clientes reais.
2. **Mercado Pago real nunca foi exercitado contra o provedor.** O adaptador foi escrito contra o SDK oficial e testado com respostas simuladas; os pontos marcados `[confirmar no sandbox]` em `apps/api/README.md` exigem rodar o sandbox do Mercado Pago com chaves do fundador antes do primeiro pedido real. Com `PAYMENT_PROVIDER=mercadopago`, **cinco** chaves são obrigatórias no boot (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_OAUTH_REDIRECT_URI`; a última o compose preenche sozinho).
3. **Sentry**: a API já envia erros (sem dado pessoal) quando `SENTRY_DSN` está preenchido; o painel web e o app ainda não (DT-039). Erros desses dois ficam nos logs (seção 10).
4. **Tempo real (Socket.IO `/rt`)** está na API e o nginx já encaminha `/socket.io/`. O app e os painéis recuperam o estado por REST se a conexão cair.
5. **Exclusão de conta** (exigência da Apple e da Google) existe na API, no app e na web (`/excluir-conta`, no site público). A publicação nas lojas ainda depende do que está em `docs/deploy/checklist-publicacao-lojas.md`.
6. **Rotação do `BFF_SHARED_SECRET` sem janela de erro** depende de código (DT-031). Hoje há uma janela de segundos (seção 9).
7. **Push de verdade** exige `PUSH_PROVIDER=expo` e as credenciais FCM/APNs cadastradas no EAS (conta do fundador). O padrão `log` só registra e **ninguém recebe notificação**.

## 2. Custos estimados [HIPÓTESE]

Ordem de grandeza para o lançamento, valores de mercado de memória (nov/2026), **confirme nos sites antes de contratar**. Câmbio considerado: US$ 1 = R$ 5,50.

| Item | Caminho A (VPS) | Caminho B (gerenciado) | Observação |
|---|---|---|---|
| Domínio `.com.br` | ~R$ 40/ano | ~R$ 40/ano | Registro.br |
| Servidor | VPS 2 a 4 vCPU, 4 a 8 GB RAM, 40+ GB SSD, **região Brasil**: ~R$ 60 a R$ 200/mês | API + web (2 serviços ~US$ 7 a 25 cada): ~R$ 80 a R$ 280/mês | Região Brasil reduz a latência (SP/Grande SP). Provedores com datacenter no Brasil: Hostinger, Locaweb, Vultr (São Paulo), AWS (sa-east-1), Oracle Cloud (Vinhedo) |
| PostgreSQL + PostGIS | incluído | ~US$ 7 a 25/mês (conferir se o plano tem PostGIS) | Backup do provedor não substitui o seu (seção 8) |
| Redis | incluído | ~US$ 0 a 10/mês | Precisa guardar dados (filas de pagamento): política `noeviction` |
| Armazenamento de fotos | incluído (disco) | R2: 10 GB grátis, depois ~US$ 0,015/GB/mês, sem cobrança de saída [HIPÓTESE] | |
| Backup fora do servidor | R2: centavos no início | idem | Bucket separado |
| E-mail transacional | Grátis até alguns milhares/mês (Brevo, Resend) [HIPÓTESE] | idem | SES: ~US$ 0,10 por 1.000 |
| Sentry | Plano grátis (limite de eventos) | idem | Só a API envia hoje (DT-039) |
| Apple Developer | US$ 99/ano | idem | Obrigatório para iPhone |
| Google Play | US$ 25 uma vez | idem | Obrigatório para Android |
| Mercado Pago | tarifa por transação (PIX e cartão) | idem | Descontada da venda; ver tarifas vigentes no MP |
| **Total fixo mensal (sem as lojas)** | **~R$ 60 a R$ 220** | **~R$ 150 a R$ 500** | Lojas: ~R$ 700 no 1º ano |

## 3. Caminho A: VPS com Docker, do zero ao HTTPS

Tempo: 2 a 3 horas na primeira vez (o primeiro build das imagens leva 10 a 20 minutos). Os comandos assumem **Ubuntu 24.04 LTS** (ou mais novo) e que você tem o IP do servidor e a senha/chave de acesso.

### Passo 1. Contratar o servidor e o domínio

1. Domínio: registre em https://registro.br (ex.: `webag.com.br`).
2. Servidor: crie um VPS Ubuntu 24.04, **região Brasil**, com **no mínimo 2 vCPU, 4 GB de RAM e 40 GB de disco** (o build do painel web usa ~2 GB de RAM; com 2 GB ou menos, crie swap, passo 3). Anote o **endereço IP** (ex.: `203.0.113.10`).
3. No painel do provedor, libere **apenas** as portas 22 (acesso), 80 e 443 no firewall do provedor, se ele tiver um.

### Passo 2. Apontar o DNS (Registro.br ou onde o domínio estiver)

Crie **5 registros do tipo A**, todos com o IP do servidor (substitua `webag.com.br` pelo seu domínio):

| Nome (host) | Tipo | Valor |
|---|---|---|
| `@` (o domínio sem prefixo; no Registro.br, deixe o nome em branco) | A | IP do servidor |
| `api` | A | IP do servidor |
| `admin` | A | IP do servidor |
| `lojista` | A | IP do servidor |
| `arquivos` | A | IP do servidor |

Se usar Cloudflare para o DNS, deixe cada registro em **"somente DNS" (nuvem cinza)**. Com o proxy da Cloudflare ligado (nuvem laranja) o nginx deixa de ver o IP real do cliente e o limite de tentativas de login (SEC-114/129) passa a valer para todos de uma vez.

Teste (pode levar de minutos a horas): `nslookup api.webag.com.br` deve mostrar o IP do servidor. Só siga quando os 5 nomes responderem (`nslookup webag.com.br` também).

### Passo 3. Preparar o servidor (acesso, usuário, firewall, swap)

No seu computador, abra o terminal (Windows: PowerShell; macOS/Linux: Terminal) e entre no servidor:

```bash
ssh root@IP_DO_SERVIDOR
```

Dentro do servidor, rode (cada bloco de uma vez):

```bash
# 1) Atualizações e ferramentas
apt update && apt -y upgrade
apt -y install git ufw fail2ban unattended-upgrades openssl

# 2) Usuário comum (não use o root no dia a dia). Troque "webag" se quiser.
adduser --disabled-password --gecos "" webag
usermod -aG sudo webag
mkdir -p /home/webag/.ssh && cp ~/.ssh/authorized_keys /home/webag/.ssh/ 2>/dev/null; chown -R webag:webag /home/webag/.ssh

# 3) Firewall: só SSH, HTTP e HTTPS
ufw default deny incoming && ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# 4) Swap de 2 GB (evita falta de memória no build)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 5) Instalar o Docker (script oficial) e liberar o usuário webag
curl -fsSL https://get.docker.com | sh
usermod -aG docker webag
```

Se o provedor deu **senha** em vez de chave SSH, crie uma senha para o usuário (`passwd webag`) e, depois que a chave SSH estiver funcionando, desative o login por senha (seção 12). Saia (`exit`) e entre de novo como o novo usuário: `ssh webag@IP_DO_SERVIDOR`. Confirme: `docker compose version` deve mostrar uma versão 2.x.

### Passo 4. Baixar o código no servidor

O repositório é privado. Crie uma chave **somente leitura** para o servidor:

```bash
ssh-keygen -t ed25519 -C "webag-servidor" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copie a linha que apareceu. No GitHub: repositório `yagogavilan/webag` > Settings > Deploy keys > Add deploy key, cole, **deixe "Allow write access" desmarcado**, salve. Depois:

```bash
git clone git@github.com:yagogavilan/webag.git
cd webag
git checkout v1.0.0     # a versão publicada (ou "main" para a mais recente)
```

### Passo 5. Criar o arquivo de configuração (.env) com segredos novos

```bash
sh infra/scripts/gen-secrets.sh
nano .env
```

O primeiro comando cria o `.env` e **sorteia todos os segredos** (senha do banco, chaves de login etc.). No `nano`, ajuste (setas para andar, `Ctrl+O` Enter para salvar, `Ctrl+X` para sair):

1. Os 5 hosts: troque `exemplo.com.br` pelo seu domínio em `API_HOST`, `ADMIN_HOST`, `LOJISTA_HOST`, `FILES_HOST` e `PUBLIC_HOST` (o domínio principal, sem prefixo), e também em `S3_ENDPOINT`, `S3_PUBLIC_URL` e `SMTP_FROM`.
2. `LETSENCRYPT_EMAIL`: seu e-mail.
3. Mercado Pago: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET` e `MP_PUBLIC_KEY` (seção 7). Para um servidor de **ensaio** sem chaves reais, use `APP_ENV=staging` e `PAYMENT_PROVIDER=fake` (pendência 1 da seção 1).
4. E-mail: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` (seção 6.3).
5. Primeiro administrador: `SEED_ADMIN_EMAIL` e uma `SEED_ADMIN_PASSWORD` longa (será trocada no 1º login).
6. Backup fora do servidor: `BACKUP_S3_*` (seção 8). Pode deixar para depois, **mas faça antes de receber pedidos reais**.

**Guarde o `.env` fora do servidor agora** (gerenciador de senhas, como anexo/nota segura). É a única cópia das chaves: sem `MFA_ENC_KEY` e `PAYMENT_TOKEN_ENC_KEY` um servidor novo não consegue decifrar dados do banco. Nunca envie o `.env` por chat ou e-mail, e nunca o commite.

Confira se nada obrigatório ficou vazio: `sh infra/scripts/prod.sh config -q` não deve imprimir erro (se faltar variável, a mensagem diz qual).

### Passo 6. Construir as imagens

```bash
sh infra/scripts/prod.sh build
```

Demora 10 a 20 minutos na primeira vez. Se terminar com "FINISHED"/sem erro, está pronto. Se falhar por memória (`Killed`), confira o swap do passo 3.

### Passo 7. Subir tudo e emitir o HTTPS

Primeiro um **ensaio** (certificado de teste do Let's Encrypt, não gasta o limite de emissões):

```bash
sh infra/scripts/init-tls.sh --staging
```

O script sobe banco, Redis, armazenamento, migrações, API, web e nginx, e pede o certificado. Se terminar com "Pronto", repita para o **certificado real**:

```bash
sh infra/scripts/init-tls.sh --force
```

Se falhar: leia a mensagem. Causas comuns: DNS ainda não propagou, porta 80/443 bloqueada, ou a API não subiu (veja `sh infra/scripts/prod.sh logs api`; erro de "Configuração de ambiente inválida" lista exatamente a variável errada, sem mostrar valores). A renovação do certificado é automática (serviço `certbot`).

### Passo 8. Criar o primeiro administrador e os dados base

```bash
sh infra/scripts/prod.sh run --rm seed
```

Cria o administrador, categorias, cidades/bairros, parâmetros e textos legais (só dados base: **nunca** lojas ou clientes de demonstração em produção). Em seguida **apague do `.env` as linhas `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`** (`nano .env`).

### Passo 9. Primeiro acesso e conferência

1. Abra `https://admin.SEU-DOMINIO/admin/entrar` e entre com o e-mail/senha do seed. O sistema pede para configurar o segundo fator (app autenticador, TOTP) e **guarde os códigos de recuperação**. Troque a senha.
2. `https://api.SEU-DOMINIO/health` deve responder `{"status":"ok",...}`.
3. Site público (o que as lojas e o app usam): `https://SEU-DOMINIO/` (página inicial), `https://SEU-DOMINIO/privacidade`, `https://SEU-DOMINIO/termos`, `https://SEU-DOMINIO/excluir-conta` e `https://SEU-DOMINIO/licencas` devem abrir sem login. `https://SEU-DOMINIO/admin/entrar` deve dar "Não encontrado" (o painel não existe neste host).
4. `https://lojista.SEU-DOMINIO/lojista/entrar` deve abrir o painel do lojista; `https://lojista.SEU-DOMINIO/admin/entrar` deve dar "Não encontrado" (é o esperado: SEC-116).
5. Estado dos serviços: `sh infra/scripts/prod.sh ps` (todos "healthy"; `migrate` aparece como "Exited (0)", que é normal).
6. Teste de IP real (SEC-129): erre a senha do admin 5 vezes seguidas num navegador e confirme que a conta é travada **para esse IP** e que outra pessoa/rede ainda consegue entrar numa conta diferente. (Ao testar do próprio servidor, o IP aparece como `172.30.0.1`: é o gateway do Docker, não é um erro.)

### Passo 10. Backup, monitoramento e webhook (não pule)

- Configure o backup fora do servidor e **faça o teste de restauração** (seção 8).
- Cadastre o monitor externo (seção 10).
- Cadastre o webhook do Mercado Pago (seção 7).
- Anote a data do último teste de restauração.

## 4. Caminho B: gerenciado (Render, Railway ou Fly.io + Postgres gerenciado + R2/S3)

Funciona sem o nginx e o compose deste repositório: o provedor termina o HTTPS e roda as imagens. Os nomes de menus mudam; use este guia como lista do que configurar e confirme na documentação do provedor. `[HIPÓTESE]` em tudo que for específico de um fornecedor.

### 4.1 Peças e onde ficam

| Peça | Opções | Requisito do Webag |
|---|---|---|
| API (Docker) | Render Web Service, Railway Service, Fly App | Dockerfile `apps/api/Dockerfile`, **contexto = raiz do repositório**, porta 3000, health check `/health` |
| Painel web (Docker) | Idem | Dockerfile `apps/web/Dockerfile`, contexto raiz, porta 3001, health check `/` |
| PostgreSQL | Postgres do próprio provedor, Neon, Supabase, Crunchy | **Versão 16+ com a extensão PostGIS** disponível (`CREATE EXTENSION postgis`). Se o plano não tiver PostGIS, não serve |
| Redis | Render Key Value, Railway Redis, Upstash | Persistência ligada e política `noeviction` (as filas de pagamento não podem ser descartadas); URL `rediss://` se for com TLS |
| Arquivos | Cloudflare R2 (recomendado) ou AWS S3 | Dois buckets (público e privado), chaves com permissão só neles |
| Migrações | "Pre-deploy command" (Render), "release command" (Fly/Railway) | Comando: `node dist/platform/database/migrate.js` na imagem da API (roda antes de cada deploy) |

### 4.2 Passo a passo

1. **Banco**: crie o Postgres, ative PostGIS (`CREATE EXTENSION IF NOT EXISTS postgis;` num cliente SQL, ou pelo painel; PostGIS exige superusuário, então o `webag_migrator` não consegue ativá-lo). Crie também os papéis `webag_migrator` e `webag_app` e rode o `infra/postgres/40-roles-grants.sql` como administrador do provedor (seção 15). Copie a URL de conexão (`postgresql://...`). Se o provedor exige TLS, use `?sslmode=require` no fim.
2. **Redis**: crie e copie a URL.
3. **R2**: crie os buckets `webag-public` e `webag-private`; em `webag-public` habilite acesso público por um domínio (ex.: `fotos.webag.com.br`) ou pelo domínio `r2.dev` (só ensaio); crie um token de API S3 com acesso aos dois. Configure **CORS** no bucket privado e no público para permitir `POST` e `GET` vindos de `https://admin.<domínio>` e `https://lojista.<domínio>` (o navegador envia fotos direto ao bucket, ADR-005). Equivalente do `infra/storage-init.sh` do ambiente local (BUG-025): no R2 (painel, bucket, Configurações > Política CORS) cole, para cada bucket, `[{"AllowedOrigins":["https://admin.<domínio>","https://lojista.<domínio>"],"AllowedMethods":["GET","PUT","POST","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]`. O método **POST** é obrigatório: o envio é um POST de formulário assinado (presigned POST), e sem ele a preflight passa mas o upload falha. Variáveis: `S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`, `S3_PUBLIC_URL=https://fotos.<domínio>`, chaves do token.
4. **API**: crie o serviço apontando para o repositório e para `apps/api/Dockerfile`. Variáveis: as da tabela da seção 6 (use as secretas do provedor, não o `.env`). Lembre que `WEB_PUBLIC_URL` é `https://<PUBLIC_HOST>`, `LOJISTA_WEB_URL` é `https://<LOJISTA_HOST>` (links do lojista em e-mail; não use o host do admin) e `MP_OAUTH_REDIRECT_URI` é `https://<LOJISTA_HOST>/lojista/onboarding/4` (o compose do Caminho A preenche os dois sozinho). Em vez de `TRUST_PROXY=172.30.0.10`, use o **número de saltos** de proxy do provedor (comece com `1`; `[HIPÓTESE]` pode ser 2 se houver CDN na frente). Domínio personalizado: `api.<domínio>`.
5. **Painel web**: serviço com `apps/web/Dockerfile`. Variáveis: `ADMIN_HOST`, `LOJISTA_HOST`, `PUBLIC_HOST` (o domínio principal; sem ele as páginas públicas e a do cartão dão 404), `PUBLIC_URL`, `REALTIME_URL` (`https://api.<domínio>`), `PLAY_STORE_URL`/`APP_STORE_URL` (depois de publicar), `API_URL` (endereço **interno/privado** da API, se o provedor tiver rede privada; senão a URL pública `https://api.<domínio>`), `BFF_SHARED_SECRET` (igual ao da API), `STORAGE_ORIGIN`. **Sem nginx** não existe o cabeçalho `X-Real-IP`: use `WEB_TRUSTED_PROXY_HOPS=1` no lugar de `WEB_CLIENT_IP_HEADER` e confirme com o teste de IP (passo 9.5). Domínios personalizados: **os dois** (`admin.<domínio>` e `lojista.<domínio>`) no mesmo serviço.
6. **Primeiro deploy**: a migração roda sozinha (pre-deploy). Para o **seed** (primeiro admin), rode uma vez do seu computador, com o código baixado e Node 24 + pnpm instalados:

   ```bash
   pnpm install
   NODE_ENV=production DATABASE_URL='postgresql://...' SEED_ADMIN_EMAIL='voce@dominio' SEED_ADMIN_PASSWORD='senha-longa' pnpm --filter @webag/api db:seed
   ```
   (No Windows PowerShell, defina cada variável com `$env:NOME='valor'` antes do `pnpm`.) O banco precisa aceitar conexão do seu IP nesse momento.
7. **DNS**: aponte `api`, `admin`, `lojista`, o domínio principal (`PUBLIC_HOST`) e `fotos` para os alvos que o provedor indicar (CNAME), como no passo 2 do Caminho A.
8. **Backup**: o backup automático do provedor é bem-vindo, mas **não substitui** um backup cifrado fora do provedor: agende a partir de um servidor barato (ou do seu computador) o `pg_dump` conforme a seção 8, ou use o ponto de restauração do plano **e teste a restauração**.

Pontos de atenção do gerenciado: planos grátis "dormem" (a API não pode dormir: webhook do Mercado Pago e filas); conexão ao Postgres limitada pelo plano; `TRUST_PROXY` e IP do cliente validados com o teste de lockout (se falhar, todos os usuários do painel dividem o mesmo IP: SEC-129).

## 5. Domínio e DNS

| Nome | Para quê | Quem acessa |
|---|---|---|
| `api.<domínio>` | API (app, webhook do Mercado Pago, tempo real) | App, Mercado Pago |
| `admin.<domínio>` | Painel do administrador | Equipe Webag |
| `lojista.<domínio>` | Painel do lojista | Lojistas |
| `arquivos.<domínio>` | Fotos e documentos (só no Caminho A com armazenamento local) | Navegador, app |
| `<domínio>` (raiz, `PUBLIC_HOST`) | Site público: página inicial, `/privacidade`, `/termos`, `/suporte`, `/ajuda`, `/licencas`, `/excluir-conta` e a página segura do cartão `/pagar/cartao` | Público, app, lojas |

O site público é servido pelo mesmo contêiner `web` dos painéis (os textos legais vêm de `apps/web/src/features/legal`). **Essas URLs vão nos formulários da Apple e da Google** (privacidade e exclusão de conta) e `https://<domínio>` é o valor de `EXPO_PUBLIC_WEB_URL` do app (seção 6.4). O nginx deste repositório já tem o bloco do `PUBLIC_HOST` e o certificado cobre o nome.

E-mail: no provedor de e-mail, adicione ao DNS os registros que ele pedir (SPF, DKIM e, recomendado, DMARC) para o domínio do remetente; sem isso os e-mails (código de confirmação, convite de admin) caem no spam.

## 6. Variáveis de ambiente

O modelo comentado é `infra/env.prod.example`. A API valida tudo no boot e **não sobe** com configuração insegura (mensagem lista o nome da variável, nunca o valor). `[G]` = sorteada por `gen-secrets.sh`.

### 6.1 API (`apps/api`)

| Variável | Obrigatória | Para quê | Onde pegar / como gerar |
|---|---|---|---|
| `NODE_ENV` | Sim | `production` liga as travas de segurança | Fixo no compose |
| `TRUST_PROXY` | Sim em produção | Quem pode declarar o IP do cliente (SEC-114/129) | Compose: `172.30.0.10` (IP fixo do nginx). Gerenciado: nº de saltos |
| `BFF_SHARED_SECRET` | Sim (SEC-129) | Segredo entre painel web e API, >= 32 caracteres, igual nos dois | `[G]` |
| `DATABASE_URL` | Sim | Conexão da API com o Postgres, pelo papel `webag_app` (sem DDL, sem posse, sem superusuário; seção 15) | Montada pelo compose; gerenciado: URL do provedor para o papel `webag_app` |
| `MIGRATION_DATABASE_URL` | Só no job `migrate` | Conexão do job de migração, pelo papel dono `webag_migrator`. A API nunca recebe esta variável | Montada pelo compose; gerenciado: URL do papel dono, no pre-deploy command |
| `REDIS_URL` | Sim | Cache, limite de tentativas, filas | Montada pelo compose; gerenciado: URL do provedor |
| `JWT_ACCESS_SECRET`, `AUTH_HMAC_KEY`, `CODE_HMAC_KEY`, `RECOVERY_HMAC_KEY`, `MFA_ENC_KEY` | Sim | Uma chave por finalidade; **todas diferentes** | `[G]` (ou `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `PAYMENT_TOKEN_ENC_KEY` | Sim | Cifra tokens OAuth do Mercado Pago dos lojistas (32 bytes em base64) | `[G]` (ou `openssl rand -base64 32`) |
| `PAYMENT_PROVIDER` | Sim | `mercadopago` (o `fake` é recusado em produção) | Fixo |
| `MP_ACCESS_TOKEN` | Sim com MP | Chamar a API do Mercado Pago | Seção 7 |
| `MP_WEBHOOK_SECRET` | Sim com MP | Validar a assinatura dos webhooks | Seção 7 |
| `MP_CLIENT_ID`, `MP_CLIENT_SECRET` | Sim com MP | OAuth do split: cada lojista conecta a própria conta do Mercado Pago | Seção 7 |
| `MP_OAUTH_REDIRECT_URI` | Sim com MP | Página que recebe `code` e `state` na volta do Mercado Pago, cadastrada igual no app do MP | Compose: vazio = `https://<LOJISTA_HOST>/lojista/onboarding/4` |
| `MP_PUBLIC_KEY` | Sim com cartão | Chave **pública** do Mercado Pago (página segura de cartão, `/pagar/cartao`); não é segredo | Seção 7 |
| `MP_OAUTH_PKCE`, `MP_PAYER_DOCUMENT_REQUIRED` | Não | PKCE no OAuth (deixe `true`); CPF do pagador no PIX (`[confirmar no sandbox]`) | Padrões `true` e `false` |
| `APP_ENV` | Não | `production` (padrão) ou `staging` (ensaio; seção 1, pendência 1) | |
| `WEB_PUBLIC_URL` | Sim | Base das páginas públicas, em especial `/pagar/cartao`: `https://<PUBLIC_HOST>` (o app só abre esta origem) | Compose: montada |
| `PUSH_PROVIDER`, `EXPO_ACCESS_TOKEN` | Não | `log` (padrão, não envia nada) ou `expo` (envia; exige FCM/APNs no EAS). Token do Expo é opcional ("enhanced push security") | expo.dev > Access tokens |
| `API_PUBLIC_URL` | Sim | URL pública da API (base do redirect OAuth) | `https://api.<domínio>` (montada) |
| `ADMIN_WEB_URL` | Sim | Prefixo dos links nos e-mails do admin (convite de admin) | `https://admin.<domínio>` (montada) |
| `LOJISTA_WEB_URL` | Sim | Prefixo dos links do lojista nos e-mails (convite de funcionário e aviso de pedido novo, B2). Host DIFERENTE do admin: `/lojista` responde 404 no host do admin (A-01, SEC-116). O boot recusa http, localhost e variável ausente | `https://<LOJISTA_HOST>` (montada) |
| `CORS_ORIGINS` | Sim | Origens exatas permitidas (sem `*`) | Montada: admin e lojista |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Sim | E-mail transacional. **Porta 587** (STARTTLS); a 465 não funciona com o código atual | Seção 6.3 |
| `STORAGE_DRIVER` | Sim | `s3` (o `memory` é recusado em produção) | Fixo |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | Sim | Armazenamento de arquivos | VPS: `[G]` as chaves e `https://arquivos.<domínio>`. R2: painel Cloudflare > R2 > Manage API tokens |
| `GEOCODING_PROVIDER` | Sim | `http` = ViaCEP (o `fake` é recusado) | Fixo |
| `GEOCODER_URL` / `GEOCODER_API_KEY` | Não | Geocodificador (CEP -> coordenada) compatível com a busca do Nominatim, em https. **Vazio = desligado (o padrão, e funciona)**: a API valida só CEP, município e UF, grava `pinVerified=false` e o lojista ajusta o pino no mapa. **O Nominatim público é proibido** (o boot recusa; SEC-169). Ligar exige um provedor com contrato ou Nominatim próprio (custo e escolha: fundador; ADR-008 §Adendo) | Cache por CEP em Redis (30 dias): o volume é de CEPs distintos, não de pedidos |
| `LOG_LEVEL` | Não | `info` por padrão | |
| `API_DOCS_ENABLED` | Não | **Nunca** `true` em produção (o boot recusa) | |
| `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TTL_DAYS`, `REFRESH_ABSOLUTE_TTL_DAYS`, `REFRESH_REUSE_WINDOW_SECONDS` | Não | Duração de sessão (padrões: 900 s, 30 d, 90 d, 30 s) | Só se o produto mudar a regra; adicione em `environment` do serviço `api` |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | Não | Erros da API no Sentry, sem dado pessoal; vazio = desligado. Traces de 0 a 1 (0 = só erros) | Sentry > Projeto > Settings > Client Keys (DSN) |
| `DB_POOL_MAX` | Não | Conexões do pool por processo da API (padrão 10). Regra: `(réplicas da API + worker) x DB_POOL_MAX <= PG_MAX_CONNECTIONS - 20` (folga para migração, backup e manutenção). Seção 14.2. Pool esgotado (3 s sem conexão livre) ou consulta cancelada por tempo responde 503 `SERVICE_UNAVAILABLE` com `Retry-After: 2` e UM aviso agregado por 10 s no log (`http.db_saturated`), sem pilha (BUG-035) | Só se mudar o número de réplicas |
| `DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | Não | Teto de uma consulta (padrão 30 s; **0 = sem teto e o boot recusa em produção**) e de transação parada aberta (padrão 60 s; 0 = desligado; não baixe de 15 s). O servidor encerra a conexão que passa disso; a API trata o erro sem cair e nunca espera rede com transação aberta (conciliação e cobrança de troca usam trava em conexão dedicada). Consulta/relatório que passe do teto deve virar job | Padrões; o compose já repassa estas variáveis |
| `FEED_DIRECTORY_TTL_SECONDS`, `HOME_SECTIONS_TTL_SECONDS`, `BROWSE_CACHE_TTL_SECONDS` | Não | Cache em memória (por processo) do catálogo de lojas da descoberta (15 s), das seções "ofertas" e "mais vendidos" da home (60 s) e da vitrine/página de loja e produto (10 s). 0 = desligado. **Defasagem real (seção 14.6):** moderação, suspensão, pausa, conta de recebimento e cidade são APAGADAS na hora (DEC-113; no aparelho, até 5 s pelo `max-age`, DEC-116); loja nova 45 s, oferta nova 90 s, escrita direta no banco o TTL; sacola e pedido 0 s | Padrões |
| `HTTP_ACCESS_LOG`, `HTTP_SLOW_MS` | Não | `slow` (padrão): o log de acesso da API só registra erro (4xx/5xx) e requisição lenta (>= 500 ms); o nginx já guarda todos os acessos. `all` volta a logar toda requisição (custa ~10% de CPU em carga) | Padrões |
| `API_MAX_OLD_SPACE_MB` | Não | Teto do heap do Node (`--max-old-space-size`): 1024 (VPS 4 GB) ou 1536 (8 GB ou mais). Sem ele o V8 disputa memória com banco, Redis e web | Padrão |
| `LATENCY_LOG_INTERVAL_SECONDS` | Não | A cada N s (60) a API escreve UM log `http.latency` com p50/p95/p99 por rota (modelo da rota, sem id nem coordenada). Seção 14.4 | Padrão |

### 6.2 Painel web (`apps/web`) e demais serviços

| Variável | Serviço | Obrigatória | Para quê | Onde pegar |
|---|---|---|---|---|
| `ADMIN_HOST`, `LOJISTA_HOST` | web, nginx | Sim | Cada painel só responde no seu host (SEC-116); sem eles o painel recusa tudo | Seus subdomínios (sem `https://`) |
| `PUBLIC_HOST` | web, nginx, certbot | Sim | Site público e `/pagar/cartao` só respondem neste host (SEC-106); sem ele essas páginas dão 404 | O domínio principal (sem `https://`) |
| `PUBLIC_URL` | web | Não | Origem pública usada em sitemap, robots e URLs canônicas; padrão `https://<PUBLIC_HOST>` | Compose: montada |
| `PLAY_STORE_URL`, `APP_STORE_URL` | web | Não | Botões de download da página inicial (https). Vazios: a página mostra "em breve" | Links reais depois de publicar (G5) |
| `REALTIME_URL` | web | Não (recomendada) | Origem pública do Socket.IO que o navegador do painel alcança; sem ela os painéis usam só polling | Compose: `https://<API_HOST>` |
| `APP_SCHEME` | web | Não | Esquema do deep link do app para voltar da página do cartão; padrão `webag` | |
| `BFF_SHARED_SECRET` | web, api | Sim | Igual ao da API | `[G]` |
| `API_URL` | web | Sim | Endereço **interno** da API | Compose: `http://api:3000` |
| `WEB_CLIENT_IP_HEADER` | web | Uma das duas | `x-real-ip`, que o nginx sobrescreve | Compose: já definida |
| `WEB_TRUSTED_PROXY_HOPS` | web | Uma das duas | N-ésimo IP da direita do `X-Forwarded-For` (sem nginx; Caminho B) | Nº de proxies do provedor |
| `STORAGE_ORIGIN` | web | Sim | Liberar o armazenamento no CSP para envio de fotos | = `S3_ENDPOINT` |
| `COOKIE_SECURE` | web | Não | Padrão `true` em produção; não desligue | |
| `WEB_TRUST_FORWARDED_HOST` | web | Não | Só `true` se um proxy sobrescrever `X-Forwarded-Host`. O nginx deste repositório não precisa | |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | web (build) | Não | WhatsApp de suporte exibido nos painéis; entra no JavaScript do navegador, então **muda só com novo build** | Número com DDI |
| `API_HOST`, `FILES_HOST`, `LETSENCRYPT_EMAIL` | nginx, certbot | Sim (VPS) | Nomes e e-mail do certificado | |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | postgres | Sim (VPS) | Banco. `POSTGRES_USER` é o superusuário do cluster: só o backup e a manutenção usam. A senha só com letras e números (entra numa URL) | `[G]` |
| `WEBAG_MIGRATOR_PASSWORD`, `WEBAG_APP_PASSWORD` | postgres, migrate, api, seed | Sim (VPS) | Senhas dos papéis `webag_migrator` e `webag_app` (seção 15). Só letras e números | `[G]` |
| `REDIS_PASSWORD` | redis | Sim (VPS) | | `[G]` |
| `COMPOSE_PROFILES` | compose | Não | `storage-local` = fotos no servidor; apague para usar R2/S3 | |
| `WEBAG_VERSION`, `POSTGIS_IMAGE` | compose | Não | Etiqueta das imagens; imagem do banco (ARM: `imresamu/postgis:18-3.6-alpine`) | |
| `BACKUP_PASSPHRASE`, `BACKUP_CRON`, `BACKUP_KEEP_DAYS`, `BACKUP_REMOTE_KEEP_DAYS`, `BACKUP_S3_*`, `BACKUP_HEARTBEAT_URL` | backup | Passphrase sim; resto recomendado | Seção 8 | `[G]` a passphrase |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed | Só no 1º uso | Primeiro admin; **apague depois** | Você escolhe |

### 6.3 Contas de terceiros: onde pegar cada chave

As telas desses serviços mudam; os caminhos abaixo são os de nov/2026 `[HIPÓTESE]`.

| Serviço | Variável | Caminho |
|---|---|---|
| Mercado Pago | `MP_ACCESS_TOKEN` | https://www.mercadopago.com.br/developers > Suas integrações > (sua aplicação) > Credenciais de produção. A conta precisa estar ativada para produção (dados do negócio). Valor começa com `APP_USR-` |
| Mercado Pago | `MP_WEBHOOK_SECRET` | Mesma aplicação > Webhooks > configurar notificações > ao salvar a URL (seção 7), clique em "Revelar" na **assinatura secreta** |
| Expo / EAS | `EXPO_TOKEN` (só para CI) e `EAS_PROJECT_ID` | https://expo.dev > conta > Access tokens. O id do projeto aparece após `eas init` (não é segredo). Veja `docs/deploy/checklist-publicacao-lojas.md` |
| Sentry | `SENTRY_DSN` | https://sentry.io > Projects > (projeto) > Settings > Client Keys (DSN). Crie um projeto por componente (API, painel, app) |
| E-mail (Brevo) | `SMTP_*` | Brevo > SMTP & API > SMTP: host `smtp-relay.brevo.com`, porta `587`, login e "chave SMTP". Verifique o domínio do remetente `[HIPÓTESE]` |
| E-mail (Resend) | `SMTP_*` | Resend > Domains (verificar domínio) > API Keys: host `smtp.resend.com`, porta `587`, usuário `resend`, senha = chave `[HIPÓTESE]` |
| E-mail (Amazon SES) | `SMTP_*` | SES > SMTP settings (região `sa-east-1`: host `email-smtp.sa-east-1.amazonaws.com`, porta 587) > criar credenciais SMTP; sair do modo "sandbox" `[HIPÓTESE]` |
| Cloudflare R2 | `S3_*` / `BACKUP_S3_*` | Cloudflare > R2 > criar buckets > Manage API tokens (Object Read & Write, limitado aos buckets). `ENDPOINT` = `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| healthchecks.io [opcional] | `BACKUP_HEARTBEAT_URL` | Criar um "check" com período de 1 dia e tolerância de poucas horas; copiar a URL de ping |

### 6.4 App mobile (EAS) e parâmetros que NÃO são variáveis do servidor

O app é compilado no EAS (não no servidor). Tudo que começa com `EXPO_PUBLIC_` é **embutido no aplicativo e público**: nunca coloque segredo. Cadastre no EAS (Environment Variables, por ambiente `preview` e `production`) ou em `eas.json`:

| Variável | Valor em produção | Para quê |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://api.<domínio>` | Endereço da API |
| `EXPO_PUBLIC_WEB_URL` | `https://<domínio>` (= `WEB_PUBLIC_URL` da API) | O cartão abre `<url>/pagar/cartao` no navegador do sistema; o app confere a origem antes de abrir |
| `EXPO_PUBLIC_APP_ENV` | `production` (ou `staging`) | Em `production` o app exige o cartão real do Mercado Pago; fora dele aceita o provedor simulado |
| `EXPO_PUBLIC_MP_PUBLIC_KEY` | a mesma de `MP_PUBLIC_KEY` | Chave pública do Mercado Pago |
| `EXPO_PUBLIC_SUPPORT_WHATSAPP` | só dígitos com DDI | Suporte pelo WhatsApp (opcional) |
| `EAS_PROJECT_ID` | id do `eas init` | Vínculo com o projeto no Expo (não é segredo) |

Os **parâmetros de negócio** (comissão, prazos, ETA de entrega: `entrega_preparo_padrao_min`, `entrega_despacho_min`, `entrega_rota_fator_pct`, `entrega_min_por_km`, `entrega_faixa_min`, `entrega_max_min`, `entrega_atraso_tolerancia_min`, `entrega_compensacao_*`, horário da logística `logistica_horario` e outros) **não são variáveis de ambiente**: ficam no banco, com valores padrão criados pelo seed, e o administrador os altera no painel (Parâmetros), com histórico e motivo. Os valores de ETA e de atraso são hipóteses (DEC-053/054) a calibrar com a operação real.

## 7. Mercado Pago: chaves e URL do webhook

1. Crie (ou abra) sua aplicação em Suas integrações no painel de desenvolvedores do Mercado Pago. Para marketplace, o modelo de cobrança e o OAuth dos lojistas estão em `docs/arquitetura/adr/ADR-002-pagamentos-marketplace.md`.
2. Ative as credenciais de produção e copie para o `.env`: o **Access Token** em `MP_ACCESS_TOKEN`, a **Public Key** em `MP_PUBLIC_KEY` (e a mesma no EAS, `EXPO_PUBLIC_MP_PUBLIC_KEY`) e o **Client ID** e **Client Secret** do OAuth em `MP_CLIENT_ID` e `MP_CLIENT_SECRET`. Em "URLs de redirecionamento" da aplicação cadastre `https://lojista.SEU-DOMINIO/lojista/onboarding/4` (é a `MP_OAUTH_REDIRECT_URI` que o compose usa por padrão).
3. **URL do webhook**, em Suas integrações > sua aplicação > Webhooks > Configurar notificações > modo **Produção**:

   ```
   https://api.SEU-DOMINIO/v1/webhooks/mercadopago
   ```
   Marque pelo menos o evento **Pagamentos** (e os de estorno/contestação, se o painel oferecer). Salve.
4. O painel mostra a **assinatura secreta** ("Revelar"): copie para `MP_WEBHOOK_SECRET` no `.env`.
5. Aplique: `sh infra/scripts/prod.sh up -d api` (recria a API com a nova variável).
6. Teste: no próprio painel do Mercado Pago use "Simular notificação" para a URL acima. Esperado: resposta `200` (`{"received":true,...}`). Em seguida confira nos logs (`sh infra/scripts/prod.sh logs api`). Um webhook sem assinatura válida **não** é processado (SEC-032): isso é o comportamento certo.
7. O webhook só é confiável com HTTPS válido e a API acessível pela internet em `api.<domínio>`.

A API consulta o pagamento no Mercado Pago antes de confiar no conteúdo do webhook e é idempotente por ID (`docs/arquitetura/adr/ADR-002-pagamentos-marketplace.md`).

## 8. Backup e restauração

### 8.1 O que é salvo

| O quê | Como | Frequência | Retenção | Onde |
|---|---|---|---|---|
| Banco (todo o Postgres) | `pg_dump` cifrado (AES-256) e verificado, serviço `backup` | Diário, 00:15 de Brasília (03:15 UTC; `BACKUP_CRON`) | 14 dias no servidor, 30 dias na nuvem | Volume `backups` + bucket `BACKUP_S3_BUCKET` |
| Fotos e documentos (só VPS com armazenamento local) | Espelho dos 2 buckets, sincronizado para a nuvem | Junto do diário | Espelho (arquivo apagado sai do espelho, necessário para a LGPD) | Volume `backups` + bucket de backup |
| Segredos (`.env`) | **Manual**: cópia no gerenciador de senhas | A cada mudança | Para sempre | Fora do servidor |

Os dumps têm dados pessoais (LGPD): por isso são **cifrados** com `BACKUP_PASSPHRASE` e têm retenção. **Guarde a passphrase fora do servidor**; sem ela o backup não abre.

### 8.2 Configurar a cópia fora do servidor (obrigatório na prática)

1. Cloudflare R2 (ou S3): crie um bucket **separado** `webag-backups`, **privado**.
2. Crie um token S3 **só para esse bucket** (leitura e escrita; não use o mesmo do `S3_*`).
3. No `.env`: `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET=webag-backups`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` (para AWS S3: endpoint `https://s3.sa-east-1.amazonaws.com` e região `sa-east-1`).
4. Opcional: regra de ciclo de vida no bucket para apagar objetos com mais de 60 dias (segurança extra além da retenção do script) e `BACKUP_HEARTBEAT_URL` (healthchecks.io).
5. Aplique: `sh infra/scripts/prod.sh up -d backup` e rode um backup de teste:

```bash
sh infra/scripts/prod.sh exec backup backup-all
sh infra/scripts/prod.sh exec backup backup-list
```
Esperado: linhas "backup local criado", "enviado para s3://..." e a listagem mostrando o arquivo no servidor e na nuvem. Com R2 como armazenamento principal de fotos (Caminho B), use `STORAGE_BACKUP_ENABLED=false` e ligue o versionamento do bucket no próprio R2.

### 8.3 Teste de restauração (fazer no 1º dia e todo mês)

Não toca no banco real: restaura o último backup num banco temporário, compara tabelas e linhas e apaga.

```bash
sh infra/scripts/prod.sh exec backup test-restore
```
Esperado, no fim: `TESTE DE RESTAURAÇÃO OK`, com a lista de tabelas e contagens "atual x restaurada". Se aparecer "não consegui decifrar", a passphrase está errada. **Um backup que nunca foi restaurado é uma hipótese, não um backup**: registre a data de cada teste em `docs/deploy/` (ou onde o fundador preferir).

### 8.4 Restaurar de verdade (banco corrompido, erro humano, servidor novo)

Apaga o banco atual e recria a partir de um backup. **Decida o ponto de restauração antes** (o backup é diário: até 24 h de dados podem ficar de fora).

```bash
# 1) Parar quem escreve no banco
sh infra/scripts/prod.sh stop api web
# 2) Escolher o arquivo
sh infra/scripts/prod.sh exec backup backup-list
# 3) (Só se o arquivo estiver na nuvem e não no servidor) baixar
sh infra/scripts/prod.sh exec backup backup-fetch webag-pg-20261118T031500Z.dump.enc
# 4) Restaurar (sem --yes ele só avisa e não faz nada)
sh infra/scripts/prod.sh exec backup restore-postgres webag-pg-20261118T031500Z.dump.enc --yes
# 5) Subir de novo e conferir
sh infra/scripts/prod.sh up -d
```
O script tenta antes um backup de segurança do estado atual. Depois da restauração, a API aplica migrações pendentes sozinha ao subir (serviço `migrate`). **D-06:** a restauração usa `--no-owner --no-privileges`, então as tabelas voltam com o superusuário como dono e sem privilégio para o `webag_app`. Antes do passo 5, rode de novo o `40-roles-grants.sql` (seção 15, passo 2); o `migrate` reafirma os privilégios do `webag_app` ao subir. Sem isso a API sobe, mas toda consulta falha com `permission denied`.

### 8.5 Servidor novo (perda total do servidor)

1. Refaça os passos 1 a 4 do Caminho A num servidor novo e aponte o DNS para o IP novo.
2. Recoloque o `.env` **guardado no gerenciador de senhas** (não gere outro: `MFA_ENC_KEY`, `PAYMENT_TOKEN_ENC_KEY` e `BACKUP_PASSPHRASE` precisam ser os mesmos).
3. `sh infra/scripts/prod.sh build`, depois `sh infra/scripts/prod.sh up -d postgres backup` (só banco e backup).
4. `exec backup backup-list`, `backup-fetch <arquivo>` e `restore-postgres <arquivo> --yes`.
5. Arquivos: baixe o espelho `storage/` do bucket de backup para o volume do armazenamento (`aws s3 sync` do bucket de backup para o endpoint do RustFS, usando as chaves de cada lado) ou, no R2, nada a fazer.
6. `sh infra/scripts/init-tls.sh` (certificado novo) e `sh infra/scripts/prod.sh up -d`.

**Cuidado:** `docker compose down -v` (com `-v`) **apaga os volumes**, ou seja, banco, fotos, certificados e backups locais. Use sempre `down` sem `-v`, ou `stop`.

## 9. Rotação de segredos (DT-031)

Regra: ao **suspeitar de vazamento**, troque na hora; sem suspeita, faça rotação de rotina a cada 6 a 12 meses, no horário de menor movimento, **sempre depois de um backup** (`exec backup backup-all`). Edite o `.env` e aplique com `sh infra/scripts/prod.sh up -d <serviços>`. Estado em 2026-11-18: o código **não** aceita dois segredos ao mesmo tempo, então toda troca tem o impacto abaixo.

| Segredo | Impacto da troca | Procedimento |
|---|---|---|
| `BFF_SHARED_SECRET` | Durante a troca (segundos) o painel e a API discordam: os limites de tentativa usam o IP do painel e algumas chamadas podem dar 401 | Gere novo, edite o `.env`, rode `up -d api web` (recria os dois juntos, a API sobe primeiro). Pagar a dívida: DT-031 (aceitar 2 segredos) |
| `JWT_ACCESS_SECRET` | Tokens de acesso (15 min) deixam de valer; o app/painel renova pelo refresh sozinho | `up -d api` |
| `AUTH_HMAC_KEY` | **Todos os refresh tokens deixam de valer: todos precisam entrar de novo** | `up -d api`; avise antes |
| `CODE_HMAC_KEY` | Códigos de confirmação pendentes (10 min) deixam de valer | `up -d api` |
| `RECOVERY_HMAC_KEY` | **Códigos de recuperação do 2º fator dos admins deixam de valer**: cada admin gera novos | `up -d api`; cada admin gera novos códigos em seguida |
| `MFA_ENC_KEY` | **Não há recifragem**: os segredos TOTP dos admins ficam ilegíveis; todos os admins precisam reconfigurar o 2º fator (procedimento de emergência em `docs/arquitetura/runbook-break-glass.md`) | Só em vazamento comprovado |
| `PAYMENT_TOKEN_ENC_KEY` | Tokens OAuth dos lojistas ficam ilegíveis: **cada lojista reconecta o Mercado Pago** | Só em vazamento comprovado |
| `MP_ACCESS_TOKEN` | Pagamentos falham entre a revogação e o deploy | Gere o novo no painel do MP, edite o `.env`, `up -d api`, **depois** revogue o antigo |
| `MP_WEBHOOK_SECRET` | Webhooks são rejeitados até alinhar | Regenere no painel do MP, edite, `up -d api` imediatamente |
| `POSTGRES_PASSWORD` | Banco e todos os serviços | `exec postgres psql -U webag -c "ALTER USER webag PASSWORD 'NOVA'"`, edite o `.env`, `up -d` (recria todos). A senha só com letras e números |
| `REDIS_PASSWORD` | Filas e cache | Edite o `.env`, `up -d redis api backup` (o Redis relê a senha ao reiniciar) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Envio e leitura de fotos | R2: crie o token novo, edite, `up -d api`, revogue o antigo. VPS (RustFS): edite e `up -d storage api backup` |
| `SMTP_PASSWORD` | E-mails | Gere nova chave no provedor, edite, `up -d api`, revogue a antiga |
| `BACKUP_PASSPHRASE` | Backups novos usam a nova frase; **os antigos continuam exigindo a frase antiga** | Guarde as duas até os antigos expirarem (30 dias) |
| Senha do admin / TOTP | Por usuário | No painel (Conta) |

Depois de qualquer troca: `sh infra/scripts/prod.sh ps` (tudo "healthy"), teste um login e **atualize a cópia do `.env` no gerenciador de senhas**.

## 10. Monitoramento e logs

### 10.1 Logs

```bash
sh infra/scripts/prod.sh logs -f api            # API (JSON estruturado, com requestId; sem tokens, senha ou CPF completo)
sh infra/scripts/prod.sh logs --since 1h web    # painel web
sh infra/scripts/prod.sh logs nginx             # acessos (IP real, status, tempo; sem query string)
sh infra/scripts/prod.sh logs backup            # backups
```
Cada contêiner guarda no máximo 5 arquivos de 10 MB (não enche o disco). Erro 500: ache a linha pelo `requestId` (a API devolve em cada resposta). Para guardar logs por mais tempo (Marco Civil, art. 15: registros de acesso, ver SEC-075), envie para um serviço de logs ou copie periodicamente. Decisão de retenção: fundador/jurídico.

### 10.2 O que monitorar

| O quê | Como | Alerta quando |
|---|---|---|
| API no ar | Monitor externo (UptimeRobot, Better Stack, healthchecks.io; planos grátis) em `https://api.<domínio>/health` a cada 1 a 5 min | Fora do ar por 2 checagens |
| Painéis no ar | Mesmo monitor em `https://admin.<domínio>/admin/entrar` e `https://lojista.<domínio>/lojista/entrar` (esperado 200) | Idem |
| Dependências | `sh infra/scripts/prod.sh exec api wget -qO- http://127.0.0.1:3000/health/ready` (Postgres e Redis; só pela rede interna, o nginx esconde essa rota) | Resposta diferente de `status: ok` |
| Backup rodando | `BACKUP_HEARTBEAT_URL` (healthchecks.io): se o backup parar de avisar, chega e-mail | Sem aviso por mais de 1 dia |
| Certificado | O Let's Encrypt avisa por e-mail 20 dias antes de vencer (`LETSENCRYPT_EMAIL`); o monitor externo também pode checar | Menos de 14 dias |
| Disco e memória | `df -h /` e `docker system df`, `free -h` | Disco > 80% |
| Pagamentos | Painel admin > Pagamentos (alertas e webhooks com falha, reprocessar) | Alerta aberto |
| Erros da aplicação | Sentry (API; painel e app ainda não, DT-039) | |

Rotina semanal de 10 minutos: `ps`, `df -h`, listar backups, ver alertas de pagamento, `apt list --upgradable`.

## 11. Operação do dia a dia

```bash
cd ~/webag
git pull --ff-only && git checkout v1.0.1        # trazer uma versão nova
sh infra/scripts/prod.sh exec backup backup-all  # backup antes de atualizar
sh infra/scripts/prod.sh up -d --build           # reconstrói e troca só o que mudou (migrações rodam sozinhas)
sh infra/scripts/prod.sh ps                      # conferir "healthy"
```
- **Desfazer uma atualização (rollback):** `git checkout <versão anterior>` e `up -d --build`. Atenção: se a versão nova trouxe migração de banco, voltar o código **não** desfaz a migração; em caso de dúvida, restaure o backup feito antes (seção 8.4).
- **Reiniciar um serviço:** `sh infra/scripts/prod.sh restart api`.
- **Parar tudo sem perder dados:** `sh infra/scripts/prod.sh stop`.
- **Console do armazenamento (RustFS):** desligado em produção; para abrir temporariamente, use túnel SSH e habilite `RUSTFS_CONSOLE_ENABLE` e a porta 9001 num override local (peça ao tech-lead).
- Atualização do sistema operacional: `sudo apt update && sudo apt -y upgrade`; reinicie fora do horário de pico se pedir (`sudo reboot`; o Docker sobe tudo sozinho: `restart: unless-stopped`).

## 12. Segurança do servidor (checklist)

- [ ] Login SSH só por chave: em `/etc/ssh/sshd_config` defina `PasswordAuthentication no` e `PermitRootLogin no`, depois `sudo systemctl restart ssh` (teste uma 2ª sessão antes de fechar a atual).
- [ ] Firewall `ufw` ativo com só 22, 80, 443. Postgres, Redis e API **não publicam porta** (o compose não as expõe; SEC-114). Confira de fora: `nmap -p 5432,6379,3000,3001,9000 IP` deve mostrar tudo fechado.
- [ ] `unattended-upgrades` ativo (atualizações de segurança automáticas) e `fail2ban` ativo.
- [ ] `.env` com permissão 600, só seu, com cópia no gerenciador de senhas.
- [ ] Backup fora do servidor ligado e restauração testada neste mês.
- [ ] `API_DOCS_ENABLED` ausente/`false` (o boot recusa `true`).
- [ ] Painel admin: **2º fator ligado** para todos os admins (obrigatório) e, se a equipe tiver IP fixo, restrição por IP (abaixo).
- [ ] Rotação de segredos agendada (seção 9).

**Proteger o painel admin por IP (opcional, recomendado se houver IP fixo):** em `infra/nginx/templates/default.conf.template`, no `server` do `${ADMIN_HOST}`, dentro de `location /`, adicione antes do `proxy_pass`: `allow 203.0.113.10;` (seu IP) e `deny all;`. Reinicie: `sh infra/scripts/prod.sh up -d --force-recreate nginx`. Não faça isso se a equipe tem IP que muda (você se trancaria fora).

## 13. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `api` reinicia sem parar, log "Configuração de ambiente inválida" | Variável faltando ou insegura | A mensagem lista o nome. Corrija o `.env`, `up -d api` |
| `nginx` não sobe, "unhealthy" | API ou web não saudáveis, ou sem certificado | `prod.sh ps`; rode `init-tls.sh` se for o 1º uso |
| `init-tls.sh` falha na etapa 3 | DNS não propagou ou porta 80 fechada | Confira os 5 nomes (`nslookup`), firewall do provedor e `ufw` |
| Painel mostra "Não encontrado" | Acessando a área no host errado (admin no host do lojista) | Use `admin.` para `/admin` e `lojista.` para `/lojista` |
| Todo usuário do painel "tranca" junto no login | IP do cliente não chega (SEC-129) | Confira `WEB_CLIENT_IP_HEADER=x-real-ip`/saltos de proxy e `TRUST_PROXY`; DNS da Cloudflare em "somente DNS" |
| Foto não envia (erro de CORS no navegador) | `FILES_HOST`/`STORAGE_ORIGIN` errados ou bucket sem CORS (R2) | Confira `S3_ENDPOINT` = `https://arquivos.<domínio>` e o CORS do bucket |
| E-mails não chegam | Domínio do remetente não verificado, porta 465, spam | Verifique SPF/DKIM no provedor; use porta 587 |
| Webhook do MP não chega | URL errada, HTTPS inválido ou `MP_WEBHOOK_SECRET` errado | Seção 7, passos 3 a 6 |
| `docker build` morre com `Killed` | Pouca memória | Crie swap (passo 3) ou use um servidor com mais RAM |
| Disco enchendo | Imagens antigas e backups locais | `docker image prune -f`; reduza `BACKUP_KEEP_DAYS` |

## 14. Desempenho e capacidade

Medido em 2026-11-22 numa máquina de 4 vCPU/16 GB com tudo junto (gerador, API, PostgreSQL 16 + PostGIS 3.4, Redis): **só indicativo**, não aprova produção (relatório completo, com antes/depois e limites de validade: `docs/qa/performance/api-2026-11-22.md`). Alvo de capacidade: 10 mil usuários cadastrados, 1.000 simultâneos, ~100 a 300 req/s no pico, 1.000 conexões Socket.IO, VPS de 4 vCPU e 8 a 16 GB.

### 14.1 PostgreSQL (o padrão de fábrica usa `shared_buffers=128MB`)
O `infra/docker-compose.prod.yml` já aplica estes parâmetros; ajuste os valores no `.env` (`PG_*`) ao tamanho do servidor. A regra: o PostgreSQL usa ~25% da RAM em `shared_buffers`, `effective_cache_size` ~65% (só orienta o planejador, não reserva memória) e `work_mem` é **por operação de ordenação/junção por conexão** (não aumente sem conta: `work_mem x conexões ativas x operações` precisa caber na RAM que sobra).

| Parâmetro | 4 GB (padrão do compose) | 8 GB | 16 GB | Por quê |
|---|---|---|---|---|
| `shared_buffers` | 768MB | 2GB | 4GB | Cache de páginas do banco |
| `effective_cache_size` | 2GB | 5GB | 11GB | Ajuda o planejador a preferir índice |
| `work_mem` | 8MB | 16MB | 24MB | Ordenação/hash sem ir a disco |
| `maintenance_work_mem` | 128MB | 256MB | 512MB | Índices, `VACUUM`, `ANALYZE` |
| `max_connections` | 100 | 100 | 100 | Ver 14.2 (não aumente: use PgBouncer se faltar) |
| `random_page_cost` | 1.1 | 1.1 | 1.1 | SSD (padrão 4 é de disco giratório) |
| `effective_io_concurrency` | 200 | 200 | 200 | SSD/NVMe |
| `jit` | off | off | off | JIT só atrasa consultas curtas de OLTP |
| `wal_compression`, `checkpoint_timeout` | on, 15min | on, 15min | on, 15min | Menos escrita em disco |
| `max_wal_size` (`PG_MAX_WAL_SIZE`) | 2GB | 2GB | 4GB | Com `checkpoint_timeout=15min` o padrão (1GB) dispara checkpoint por tamanho |
| `log_parameter_max_length` | 0 | 0 | 0 | Consulta lenta no log SEM parâmetros (e-mail, busca, coordenadas; SEC-202) |
| `shm_size` do contêiner (compose) | 256mb | 256mb | 256mb | O padrão do Docker é 64 MB e junção paralela com `work_mem` maior falha com "could not resize shared memory segment" |
| `shared_preload_libraries` | `pg_stat_statements` | idem | idem | Medição (14.3) |

Depois de mudar os `PG_*`: `sh infra/scripts/prod.sh up -d postgres` (reinicia o banco; ~10 s de indisponibilidade, faça fora do pico). Confira: `sh infra/scripts/prod.sh exec postgres psql -U webag -c "show shared_buffers"`.

### 14.2 Conexões e réplicas da API
- Cada processo da API abre até `DB_POOL_MAX` (10) conexões. Hoje: 1 API (+ worker de jobs, quando houver) = 10 a 20 conexões. Com 3 réplicas da API: 30 + 10 (worker) = 40, longe das 100 do servidor.
- **Capacidade de 1 processo (medida):** ~160 a 230 req/s da jornada completa a 100% de 1 vCPU (a API é de thread única). Para o pico de 300 req/s planeje **2 a 3 réplicas** da API atrás do nginx (`deploy.replicas` no compose ou serviços `api1`, `api2` num `upstream`). **Pendência bloqueante antes de escalar:** com mais de 1 réplica, o Socket.IO precisa do adaptador Redis (`@socket.io/redis-adapter`; um evento de pedido emitido na réplica A tem de chegar ao socket conectado na B) e o nginx precisa de afinidade para o transporte de *polling* (`ip_hash`). Isso é dependência nova: exige ADR e aprovação do tech-lead (ver "Fica para depois" no relatório). Até lá, **1 réplica** (suficiente para o piloto e para ~100 req/s com folga). A invalidação dos caches da vitrine (DEC-113) já funciona com mais de 1 réplica, por pub/sub do Redis, com os limites da seção 14.6.
- PgBouncer só se `max_connections` apertar. Atenção (DT-085): a conciliação de pagamentos e a cobrança de troca usam *advisory lock* de **sessão** em conexão dedicada (`SessionLockService`), que **não funciona em modo *transaction***: essas conexões precisam ir direto ao PostgreSQL (ou o lock vira lease em linha antes). Além disso, os parâmetros de conexão `options` (`statement_timeout`, `idle_in_transaction_session_timeout` e `pg_trgm.word_similarity_threshold=0.5`) precisam ser aceitos pelo PgBouncer (`ignore_startup_parameters = options`) e reaplicados; a API loga `db.session_settings` no boot e avisa se o limite do `pg_trgm` não chegou (a busca por erro de digitação mudaria sem erro nenhum). Teste antes.
- Timeouts (SEC-204: em produção, e no `staging`, o boot RECUSA `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` entre 1 e 14999; use 0 ou >= 15000): o PostgreSQL **encerra** a conexão parada em transação por mais de `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`. A API registra `conexão em uso caiu` (warn) e segue; se esse aviso aparecer no log, é um código esperando rede com transação aberta e deve ser corrigido (abra issue, não suba o timeout).
- Memória: o compose não define `mem_limit` (depende do servidor); o heap do Node é limitado por `API_MAX_OLD_SPACE_MB`.

### 14.3 Medir o banco (uma vez por semana no começo)
```bash
sh infra/scripts/prod.sh exec postgres psql -U webag -d webag -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"   # uma vez
# Top 10 consultas por tempo total
sh infra/scripts/prod.sh exec postgres psql -U webag -d webag -c "select calls, round(total_exec_time) total_ms, round(mean_exec_time::numeric,2) mean_ms, left(query,120) from pg_stat_statements order by total_exec_time desc limit 10;"
# Índices nunca usados (candidatos a remover) e tabelas com leitura sequencial grande
sh infra/scripts/prod.sh exec postgres psql -U webag -d webag -c "select relname, indexrelname, idx_scan from pg_stat_user_indexes where idx_scan = 0 order by pg_relation_size(indexrelid) desc limit 10;"
sh infra/scripts/prod.sh exec postgres psql -U webag -d webag -c "select relname, seq_scan, seq_tup_read, n_live_tup from pg_stat_user_tables where seq_scan > 100 order by seq_tup_read desc limit 10;"
```
Meta `[HIPÓTESE]`: nenhuma consulta de leitura da jornada do cliente com média > 20 ms. Consulta lenta (> 1 s) já vai ao log do Postgres (`log_min_duration_statement`). Índice em tabela grande que já está em produção: crie com `CREATE INDEX CONCURRENTLY` (manual, fora de migração, pois o `drizzle` roda migração dentro de transação); em tabela pequena a migração normal basta.

### 14.4 Latência da API e logs
- A API escreve, a cada 60 s, uma linha JSON `"event":"http.latency"` com as 25 rotas mais lentas da janela (`p50`, `p95`, `p99`, `max`, `n`, `errors5xx`; rota por modelo, **sem id e sem coordenada**). Veja: `sh infra/scripts/prod.sh logs --since 10m api | grep http.latency | tail -1`. Alerta sugerido `[HIPÓTESE]`: `p95 > 1 s` por 3 janelas seguidas em qualquer rota, ou `errors5xx > 0,5%`.
- O log de acesso por requisição da API agora só registra erro e requisição lenta; o acesso completo (IP real, rota, status, tempo) está no log do nginx (`prod.sh logs nginx`, campo `rt=`).

### 14.5 nginx e rede `[HIPÓTESE: não testado aqui, sem nginx no ambiente de medição]`
- **Compressão:** `gzip` já está ligado para JSON > 1 KB (`infra/nginx/templates/00-global.conf.template`). Brotli só se o nginx tiver o módulo (a imagem padrão não tem) ou se a Cloudflare ficar na frente (ela comprime em Brotli sozinha); o ganho sobre o gzip em JSON é de ~10 a 15%.
- **Conexão reaproveitada com a API:** hoje cada requisição abre uma conexão nova até `api:3000`. Em carga, declare `upstream webag_api { server api:3000; keepalive 64; }`, use `proxy_pass http://webag_api;` e, no `location`, `proxy_set_header Connection "";` (o `proxy_http_version 1.1` já existe). A API já mantém a conexão ociosa por 65 s (`keepAliveTimeout`), mais que o nginx, para não dar 502 na conexão reaproveitada.
- **Limites por IP e CGNAT (DT-086, SEC-200; sem mudança de regra até o G4 do v1.1):** operadoras móveis colocam centenas de clientes atrás do MESMO IP, e hoje TODA regra abaixo usa só o IP:
  - **nginx:** `limit_req` (30 req/s, burst 60 na API) e `limit_conn 50` por IP. O `limit_conn` vale também para `/socket.io/`: cada app conectado prende 1 conexão por até 1 h, então ~50 aparelhos atrás do mesmo IP esgotam o limite e os demais tomam `429` na API e no socket (efeito pior que o do `limit_req`).
  - **API (`rate-limit.guard.ts`):** teto global de 600 req/min por IP, e regras próprias por IP mesmo em rota autenticada: `refresh` 30/min (cliente deslogado ao tomar 429), `order-create` 30/h e `coupon-apply` 30/h (venda perdida) e `register` 20/h. Não existe hoje limite por conta nessas rotas.
  - **Consequência:** em horário de pico, clientes legítimos da mesma operadora podem receber `429` em pedido, renovação de sessão e tempo real `[HIPÓTESE: proporção real desconhecida; medir no piloto contando 429 por rota]`.
  - **Não aumente os números do nginx nem remova o `limit_conn` por conta própria agora:** a correção planejada (zona `limit_conn` própria para `/socket.io/`, chave por usuário nas rotas autenticadas com o IP como teto maior, `429` por rota na métrica `http.latency`) fica para o G4 do v1.1. Até lá, no piloto, observe os `429` nos logs do nginx e da API e avise o time ao primeiro caso relevante.
- **Fotos:** o bucket público já responde `Cache-Control: public, max-age=31536000, immutable` (as variantes têm o id do arquivo na chave: imutáveis). Se as fotos passarem por nginx/Cloudflare (`FILES_HOST`), mantenha esse cabeçalho e ligue o cache de borda (Cloudflare: *Cache Everything* para o host de arquivos).

### 14.6 Defasagem real da vitrine (cache em memória + Redis + aparelho)
O que o cliente vê na descoberta pode estar atrasado pela SOMA das camadas; o que ele compra, nunca (sacola, pedido e pagamento leem o banco na hora). Medido por teste com TTL real em `apps/api/test/discovery-cache.e2e-spec.ts`.

**Invalidação ativa (DEC-113, SEC-201, DT-087).** Quando o serviço certo escreve, ele APAGA os caches em vez de esperar o TTL (`StorefrontCacheService`, `apps/api/src/platform/cache/`): caches em memória do processo (loja, produto, vitrine, diretório, ofertas, mais vendidos; o valor antigo do *stale-if-error* também é apagado) e os namespaces `home` e `feed` do Redis. Sacola e checkout continuam lendo o banco.

| Mudança (feita pela API/painel) | Onde aparece | Atraso máximo na API | Camadas |
|---|---|---|---|
| Moderação (pausar, remover, restaurar produto); loja aprovada, suspensa, reativada, reprovada; loja pausada ou retomada; conta de recebimento conectada, desconectada ou liberada; cidade ativada ou desativada; conta do dono excluída ou restaurada | Home, ofertas, mais vendidos, lojas perto, página da loja, do produto e vitrine | **imediato (< 1 s; limite da DEC-113: 5 s)** | cache apagado na hora; outras réplicas por pub/sub do Redis |
| Preço, promoção, foto, estoque ajustado pelo lojista, pausa/arquivo do produto, planilha e ação em massa | Página do produto e vitrine da loja (e ofertas, no caso de produto) | imediato | cache da página/vitrine apagado; a home segue o TTL abaixo |
| Mesmas mudanças comerciais na **home** (loja nova, oferta nova, nota) | Lojas perto, novidades, ofertas, mais vendidos | 45 s (loja) a 90 s (oferta) | `FEED_DIRECTORY_TTL_SECONDS` 15 s ou `HOME_SECTIONS_TTL_SECONDS` 60 s + Redis da posição 30 s |
| Estoque zerado **por venda** | Página e vitrine | até 10 s | não invalida (cada venda destruiria o cache; DEC-113) |
| Escrita direta no banco (SQL manual, script), que nenhum serviço viu | Tudo acima | o TTL (até 90 s na home) | sem invalidação |
| Qualquer coisa | Sacola, pedido, pagamento, acompanhamento | 0 s | sem cache |

Limites que continuam valendo (leia antes de prometer "5 s"):
- **Aparelho e proxy:** as respostas da página da loja e do produto saem com `Cache-Control: private, max-age=5` e a vitrine (home) e as avaliações com `private`/`public, max-age=5` (DEC-116); ETag/304 mantidos; erros e rotas privadas, `no-store`. O aparelho (e qualquer proxy ou CDN que respeite o `public`) pode mostrar a versão antiga por até 5 s depois de a API já ter apagado a dela: o "imediato" da tabela vale para a API, e para o cliente é "o próximo carregamento depois de até 5 s". A busca (`search/*`) continua com `private, max-age=30`. O desempenho vem do cache do servidor e da ETag, não do `max-age`.
- **Mais de 1 réplica da API:** a invalidação chega às outras réplicas por pub/sub do Redis (canal `webag:storefront:invalidate:<banco do Redis>`, uma conexão extra de assinatura por réplica). Se o Redis estiver fora ou a réplica estiver reconectando, a mensagem se perde: a réplica que reconecta apaga todos os seus caches locais, mas, até lá, aquela réplica segue o TTL (até 15/60/10 s) e, com o banco também com erro, o *stale-if-error* (até 4x o TTL). Sem Redis a API já degrada (cache e rate limit abertos), então trate Redis fora como incidente, não como rotina. `[HIPÓTESE: não testado com 2 réplicas reais nem com o Redis caindo; o teste e2e usa 2 instâncias do serviço no mesmo Redis]`
- **Operador (CLI `privacy:cancel-deletion`):** roda fora da API; se o Redis estiver acessível ele publica a invalidação, senão a loja restaurada volta no TTL.
- **Remoção urgente sem esperar (escrita direta no banco ou Redis fora):** reiniciar o contêiner `api` (`prod.sh restart api`) limpa os caches em memória e, passados 30 s, o Redis da posição também expirou; com 2+ réplicas, reinicie todas. O aceite da janela de preço, estoque e loja nova é decisão do PO (`docs/qa/performance/api-2026-11-22.md`, seção 12).
- Banco fora do ar: o valor antigo segue sendo servido por até 4x o TTL, **exceto o que foi invalidado**; erro de negócio (404 de loja suspensa) nunca é mascarado. Resposta de erro sai sempre `private, no-store`.

## 15. Papéis do banco (D-06, ADR-018 D9, tech-lead B4)

**Por quê.** Em produção a API e o job `migrate` usavam o mesmo usuário, o superusuário do cluster: ele ignora posse, desliga gatilho (`DISABLE TRIGGER`) e apaga o histórico append-only (`audit_log`, razão contábil, estornos, consentimentos). Agora são dois papéis e o superusuário não é usado pela aplicação.

| Papel | Quem usa | Pode | Não pode |
|---|---|---|---|
| `webag_migrator` | só o job `migrate` (`MIGRATION_DATABASE_URL`) | ser dono do banco e das tabelas, criar tabela, índice e gatilho; `lock_timeout` de 10 s | ser superusuário, criar papel ou banco |
| `webag_app` | API e seed (`DATABASE_URL`) | `SELECT/INSERT/UPDATE/DELETE` nas tabelas e `USAGE` nas sequências; `SELECT` em `drizzle.__drizzle_migrations` (o `/health/ready` conta as migrações) | DDL, `TRUNCATE`, `DISABLE TRIGGER`, `session_replication_role`; nas 9 tabelas append-only só `INSERT` e `SELECT` (exceção: `UPDATE` das colunas `ip` e `platform` de `consents` e `terms_acceptances`, para a anonimização da SEC-159) |

**Arquivos.** `infra/postgres/30-roles-create.sh` (cria os papéis; senhas do ambiente), `infra/postgres/40-roles-grants.sql` (extensões, posse, acesso; idempotente; como superusuário), `apps/api/src/platform/database/app-grants.ts` (privilégios do `webag_app` sobre as tabelas, reafirmados pelo `migrate` depois de cada migração; a lista das tabelas append-only é conferida por teste contra os gatilhos das migrações).

**Passo a passo, VPS novo (volume vazio).** Nada a fazer além de preencher `WEBAG_MIGRATOR_PASSWORD` e `WEBAG_APP_PASSWORD` no `.env` (o `gen-secrets.sh` as sorteia). A 1ª inicialização do contêiner `postgres` cria os papéis e a posse; o `migrate` roda como `webag_migrator` e dá os privilégios ao `webag_app`.

**Passo a passo, banco que JÁ EXISTE (produção atual, ou volume de desenvolvimento antigo).** Janela curta de manutenção; a API só troca de papel no passo 4.
1. Gerar as duas senhas (`openssl rand -hex 24`) e pôr no `.env` com `WEBAG_MIGRATOR_PASSWORD` e `WEBAG_APP_PASSWORD`. **Backup antes** (seção 8) e teste de restauração em dia.
2. Criar os papéis e a posse (como superusuário, dentro do contêiner):
   ```bash
   sh infra/scripts/prod.sh exec postgres sh /docker-entrypoint-initdb.d/30-roles-create.sh
   sh infra/scripts/prod.sh exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/40-roles-grants.sql'
   ```
   (`docker compose` de um volume antigo não remonta os arquivos: `up -d postgres` com o compose novo recria o contêiner com as montagens, sem apagar o volume.)
3. Rodar o job de migração com o dono: `sh infra/scripts/prod.sh run --rm migrate` (aplica as migrações pendentes e os privilégios do `webag_app`).
4. Trocar a API para o `webag_app`: `up -d` com o compose novo (a `DATABASE_URL` da API já aponta para ele). Conferir `/health/ready` e um pedido de teste.
5. Verificar (ver abaixo) e guardar a saída no registro da mudança.

**Recusa de boot (D-06, ADR-018 D19 item 1; R1.1).** Com `NODE_ENV=production` (e também com `NODE_ENV` ausente) a API RECUSA subir, com erro claro e saída diferente de zero, se o papel da `DATABASE_URL` for superusuário, dono do `audit_log` ou membro de `webag_migrator` (`apps/api/src/platform/database/db-role-guard.ts`; em `development` e `test` só avisa). **Ordem de implantação (R3 c do tech-lead):** esta verificação só pode ir para um ambiente DEPOIS de ele ter os papéis (passos 1 a 3) e a `DATABASE_URL` trocada para o `webag_app` (passo 4); implantar a versão nova da API antes disso deixa a API fora do ar, e é o comportamento desejado. No staging: passos 1 a 4, depois a versão nova da API. Em desenvolvimento local o compose define `NODE_ENV=development`.

**Verificação (como `webag_app`; cada comando deve FALHAR).** Abrir o `psql` como o papel da API: `sh infra/scripts/prod.sh exec postgres sh -c 'PGPASSWORD="$WEBAG_APP_PASSWORD" psql -h 127.0.0.1 -U webag_app -d "$POSTGRES_DB"'`.
```sql
UPDATE audit_log SET action = action;        -- permission denied
DELETE FROM audit_log;                       -- permission denied
TRUNCATE audit_log;                          -- permission denied
ALTER TABLE audit_log DISABLE TRIGGER ALL;   -- must be owner
SET session_replication_role = replica;      -- permission denied
CREATE TABLE x (id int);                     -- permission denied for schema public
```
E o que deve funcionar: `INSERT` e `SELECT` em `audit_log`; `SELECT count(*) FROM drizzle.__drizzle_migrations`.

**Banco gerenciado (Caminho B).** O provedor cria o papel administrador; crie `webag_migrator` e `webag_app` por ele e rode o `40-roles-grants.sql` com o administrador (`CREATE EXTENSION postgis` pode já estar ativa; o script é idempotente). O pre-deploy command usa `MIGRATION_DATABASE_URL`; o serviço da API usa só a URL do `webag_app`. Se o provedor não permitir `ALTER DATABASE ... OWNER` ou `ALTER ... OWNER TO`, registre a exceção no `docs/decisoes.md`: sem posse separada o D-06 não se cumpre.

**Rotação das senhas.** Repetir o passo 2 (a primeira linha só troca as senhas) e `up -d`.

**Índices em tabela grande.** O `migrate` do Drizzle aplica todas as migrações pendentes numa única transação: `CREATE INDEX CONCURRENTLY` não roda nele. Nas tabelas do piloto o `CREATE INDEX` simples dentro da migração basta. Se `audit_log` ou `products` passarem de ~1 milhão de linhas (conferir com `select count(*)`), o índice é criado à mão, FORA do Drizzle, como `webag_migrator`: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...` e a migração correspondente usa `CREATE INDEX IF NOT EXISTS` com o mesmo nome (vira no-op).
