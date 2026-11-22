# Revisão de segurança: `pnpm iphone` (rodar local e abrir no iPhone pela rede) — 2026-11-22

Pós-G4 (DEC-078). Revisor: security-engineer. Branch `claude/admiring-lamport-62tq1a`, commits `0712302` e `dbd2bc4`.

**Veredito: APROVADO COM RESSALVAS para uso em desenvolvimento local, na rede Wi-Fi de casa.** Nenhum arquivo do caminho de produção mudou (Dockerfiles, `infra/docker-compose.prod.yml`, `apps/api/src/platform/config/env.ts`, CI); em `infra/env.example` só um comentário. Nada bloqueia o G4/G5. SEC-190 deve ser corrigido antes de alguém usar o modo iPhone fora de uma rede de confiança.

## Escopo
Lidos: `scripts/iphone.mjs`, `scripts/iphone.test.mjs` (rodado: 9/9 passam), `docker-compose.yml`, `apps/mobile/src/lib/web-insecure-context{,.web}.ts` e teste, `apps/mobile/app/_layout.tsx`, `apps/mobile/public/*`, `apps/mobile/scripts/build-pwa.mjs`, `apps/web/next.config.ts`, `iniciar-webag.bat/.command`, `.gitattributes`, `.gitignore`, `.dockerignore`, rotas `/v1/dev/*`, `/docs`, seeds, guias em `docs/guias/`.
Não analisados: `apps/mobile/scripts/web-compra.cjs` (emulação no Playwright, só teste) e capturas PNG do QA. Não executado em Windows nem macOS (os scripts dizem "NÃO TESTADO"); o teste Jest do shim não foi rodado nesta revisão.

## Achados

```
SEC-190 | Severidade: Média | Status: Aberto | Quem corrige: backend-dev
Onde: docker-compose.yml:18, 35, 53-54, 81-82 (anterior a este commit; o modo iPhone torna a exposição real)
Problema: Postgres (5432), Redis (6379), RustFS (9000 API S3 e 9001 console) e Mailpit (1025 SMTP, 8025 UI) são publicados em
  0.0.0.0 com credenciais públicas no repositório (POSTGRES_PASSWORD=webag_dev_only; S3 webag-dev/webag-dev-secret-only;
  Redis sem senha; Mailpit sem login). O iPhone só precisa de 3000, 3001, 8081 e 9000.
Cenário de ataque: qualquer aparelho no mesmo Wi-Fi faz `psql -h <IP> -U webag` (superusuário: lê e altera tudo e executa
  comandos no container com COPY ... TO PROGRAM), `redis-cli -h <IP> FLUSHALL` ou altera filas BullMQ, lê no Mailpit os
  e-mails de redefinição de senha (toma contas do ambiente local) e usa a chave S3 padrão para ler o bucket privado
  (documentos de lojista). Hoje são dados de seed; vira dado pessoal real se o fundador testar com telefone, endereço ou
  documento próprios. No macOS o firewall vem desligado por padrão; no Windows, depende das regras que o Docker Desktop
  cria [HIPÓTESE: confirmar com `netstat -ano | findstr LISTENING` e um teste de outro aparelho].
Correção recomendada (ajuste mínimo):
  - publicar só em loopback: '127.0.0.1:${POSTGRES_PORT:-5432}:5432', '127.0.0.1:${REDIS_PORT:-6379}:6379',
    '127.0.0.1:9001:9001', '127.0.0.1:1025:1025', '127.0.0.1:8025:8025';
  - 9000 em loopback por padrão e aberto na rede só no modo iPhone: '${STORAGE_BIND:-127.0.0.1}:9000:9000', com
    `pnpm iphone` passando STORAGE_BIND=0.0.0.0 ao `docker compose up` (ou um docker-compose.iphone.yml de override);
  - `pnpm run setup` (scripts/setup.mjs) gerar S3_SECRET_KEY e POSTGRES_PASSWORD aleatórios ao criar o .env, já que a 9000
    fica exposta com a chave que dá escrita e leitura no bucket privado. A API (3000) já precisa de 0.0.0.0 (main.ts:21).
Como verificar a correção: com `pnpm iphone` no ar, de outro aparelho da rede, `nc -vz <IP> 5432`, 6379, 9001, 8025 e 1025
  falham; 3000, 3001, 8081 e 9000 respondem; fotos das lojas carregam no iPhone; `docker compose ps` mostra 127.0.0.1 nas
  portas internas. Sem a variável, 9000 também fica em 127.0.0.1.
```

```
SEC-191 | Severidade: Baixa | Status: Aberto | Quem corrige: mobile-dev (script e guias)
Onde: scripts/iphone.mjs:476-483 (recado final); docs/guias/rodar-no-meu-computador.md:32, 40-41, 118-119; scripts/iphone.mjs:481
Problema: nem o script nem os guias dizem que, enquanto o Webag roda, qualquer aparelho do mesmo Wi-Fi alcança o ambiente.
  O guia manda marcar o Wi-Fi como "Privada" e permitir o Node.js no firewall sem dizer que isso só vale para a rede de
  casa, e sugere "desligue o firewall [do macOS] só durante o teste".
Cenário de ataque: o fundador roda em Wi-Fi de café, coworking ou faculdade, marca a rede como Privada (o que afrouxa o
  firewall do Windows para todos os programas) e expõe o ambiente (e, sem SEC-190, banco e Redis) a desconhecidos.
Correção recomendada: no início e no recado final do script, uma linha fixa: "Use só no Wi-Fi da sua casa. Enquanto estiver
  rodando, qualquer aparelho deste Wi-Fi consegue abrir o Webag de teste. Não use em Wi-Fi público, de café, faculdade ou
  trabalho. Ao terminar: Ctrl+C e pnpm infra:down." Nos guias: tirar "desligue o firewall"; deixar a regra restrita como
  única opção do Windows: `New-NetFirewallRule ... -LocalPort 3000,3001,8081,9000 -Profile Private -RemoteAddress LocalSubnet`;
  dizer que "Privada" é só para a rede de casa.
Como verificar: ler o recado do `pnpm iphone --check` e as seções de firewall dos dois guias.
```

```
SEC-192 | Severidade: Baixa | Status: Aberto | Quem corrige: backend-dev (opcional, só desenvolvimento)
Onde: README.md:48 e :57 (senha do admin de dev e cadastro do TOTP no 1º login); scripts/iphone.mjs:212-215 (painel no IP)
Problema: a senha do admin de desenvolvimento é pública no repositório e o 2º fator é cadastrado no primeiro login. Com o painel
  em http://<IP>:3001/admin/entrar, quem está no mesmo Wi-Fi e conhece o repositório pode entrar antes do fundador e
  cadastrar o próprio autenticador.
Cenário de ataque: conta admin do ambiente local tomada; vê e altera os dados locais. Não afeta produção (os seeds recusam
  NODE_ENV=production: apps/api/seed/onda2.ts:286, onda3.ts:112, orders-demo.ts:28; admin de produção vem do break-glass).
Correção recomendada: `pnpm run setup` gerar a senha do admin de dev e imprimir uma vez (ou o fundador cadastra o TOTP antes do
  primeiro `pnpm iphone`). Com SEC-191, o aviso de "só em casa" já reduz o risco a quase nada.
Como verificar: em banco novo, o login com a senha do README falha; a senha impressa pelo setup funciona.
```

## Itens conferidos sem achado
| Item | Resultado |
|---|---|
| `.env` / `.env.bak` | `.env.bak` coberto por `.env.*` no `.gitignore:29` e no `.dockerignore`; nenhum `.env*` versionado (`git ls-files`). O script grava só URLs (`envUpdates`, iphone.mjs:107-119); não lê nem escreve segredo |
| Injeção pelo script | `--ip` validado como IPv4 de rede local (iphone.mjs:174); IP detectado filtrado (`rankCandidates`); o IP vai por variável de ambiente, não pela linha de comando com `shell` do Windows. A sonda UDP para 1.1.1.1 não envia pacote |
| `pnpm dev --env-mode=loose` | Só repasse de variáveis do Turbo no `pnpm iphone`; CI e build de produção não usam (sem ocorrência em `.github/` e `infra/`) |
| Shim `web-insecure-context.web.ts` | Só age quando `crypto.randomUUID` ou `navigator.clipboard` faltam (contexto http); em HTTPS e localhost não muda nada. UUID v4 sobre `crypto.getRandomValues` (CSPRNG, disponível fora de contexto seguro): Idempotency-Key e X-Request-Id seguem imprevisíveis. Nativo resolve o `.ts` vazio (extensão de plataforma do Metro). Clipboard só escreve (`readText` rejeita). Não toca em sessão, token nem pagamento |
| `allowedDevOrigins` | Só quando `WEBAG_DEV_HOST` existe e só tem efeito no `next dev`; `next start` ignora; nenhuma referência em `infra/` ou CI |
| PWA (`apps/mobile/public`) | Manifest com URLs relativas, sem segredo nem host fixo; `index.html` sem script externo |
| `/v1/dev/*` | Registradas só com NODE_ENV development/test (payments.dev.ts:75-78, orders.dev.ts:45-46, app.module.ts:124-125); staging e produção não têm a rota. Na rede local exigem login e não checam dono da tentativa: aceitável em dev (pagamento simulado) |
| `/docs` (Swagger) | Ligado por padrão fora de produção (app.setup.ts:41-43); em produção o boot recusa `API_DOCS_ENABLED=true` (env.ts:191). Na rede local mostra o contrato, que já está no repositório |
| Metro 8081 | Serve o bundle e o código do app; só há `EXPO_PUBLIC_*` (público por definição). Expo CLI; `@react-native-community/cli-server-api` (CVE-2025-11953) não está no lockfile |
| `iniciar-webag.bat/.command` | Sem segredo, sem download fora do `pnpm install`; elevação só no `sudo corepack enable` do macOS, como alternativa. `.gitattributes` só muda fim de linha |

## Observação (sem SEC)
O `.env.bak` guarda só a versão anterior: rodar com outro IP sobrescreve o backup com um `.env` já alterado, e a dica "restaure o .env.bak para voltar ao normal" (iphone.mjs:156) deixa de valer. Sugestão ao mobile-dev: só criar o `.env.bak` se ele ainda não existir, ou `.env.bak-<data>`.

## Limites
Revisão de código, sem teste dinâmico na rede do fundador. Não confirmei o comportamento do firewall do Windows com o Docker Desktop (SEC-190 marca como hipótese). Modo de uso pensado para rede de casa; não substitui o ambiente de staging com HTTPS para testar o `.ipa`.
