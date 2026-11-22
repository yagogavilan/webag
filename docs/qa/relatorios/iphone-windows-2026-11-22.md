# Revisão independente: "rodar no meu PC (Windows) e abrir no iPhone" (2026-11-22)

Branch `claude/admiring-lamport-62tq1a` (commits 0712302, dbd2bc4). Método: leitura crítica + o que roda em Linux. **Nada foi executado em Windows, macOS, Docker Desktop nem iPhone físico.** Fato = verificado aqui; `[HIPÓTESE]` = conhecimento geral, não verificado.

## Executado em Linux

| Verificação | Resultado |
|---|---|
| `node --test scripts/iphone.test.mjs` | 9 de 9 passam. Mas nenhum teste cobre spawn no Windows, nome de placa "Local Area Connection\* N" (hotspot, 192.168.137.1) nem o guard de execução |
| Jest `apps/mobile/__tests__/web-insecure-context.test.ts` | 3 de 3 passam |
| `tsc --noEmit` (mobile) e ESLint dos arquivos alterados | limpos |
| `node scripts/iphone.mjs --check` | chegou até "Docker fechado" (sem Docker aqui). **Efeito colateral: reescreveu o `.env` local** (ignorado pelo git) e criou `.env.bak`; não consegui restaurar (permissão negada ao `cp`). Restaurar com `cp .env.bak .env` |
| `git archive` (mesmo mecanismo do `main.zip`) | `.bat` sai com CRLF; `.sh`, `.mjs`, `.command` com LF. O `.gitattributes` funciona no zip (fato local; o zip do GitHub usa o mesmo mecanismo `[HIPÓTESE]`). `.bat` e LEIA-ME são ASCII puro |
| Repo público (API do GitHub) | `main.zip` baixa sem login. ZIP ~94 MB; maior caminho do repo 78 caracteres, sem nomes duplicados por caixa nem acentos |
| `package.json` (raiz e apps) | sem `VAR=valor cmd`, sem `sh`/`chmod`/`rm`/`cp`; `--env-file-if-exists` é do Node (portátil); sem `postinstall`; `cross-env` não existe e não é necessário. Os `.sh` só estão em produção/backup e no `storage-init.sh` (roda dentro do container; LF garantido pelo `.gitattributes`) |

## Falhas prováveis no Windows

### BLOQUEANTE

**B1. O `main.zip` ainda não contém nada disto.** `origin/main` não tem `iniciar-webag.bat`, `scripts/iphone.mjs`, `LEIA-ME-INICIO-RAPIDO.txt` nem `docs/guias/`; o guia aponta para `main.zip`. Até o PR ser mesclado, o caminho do fundador não existe. Ação: CEO faz o merge antes de entregar o guia ao fundador.

**B2. `pnpm iphone` falha SEMPRE no Windows, logo depois de um setup correto.** `scripts/iphone.mjs:395` (e `run()` na linha 244 usa `shell: isWindows`). Com `shell: true` o Node concatena os argumentos **sem aspas** (confirmei aqui: `'select count x from users'` chega como 5 argumentos). No `cmd.exe` o `psql` recebe só `-tAc select`, dá erro de sintaxe, status diferente de zero, e o script imprime "o banco está vazio (o setup ainda não foi feito)". Correção: `docker` é `.exe`, não precisa de shell. Na linha 244 usar `shell: isWindows && command !== 'docker'` (pnpm é `.cmd` e continua com shell). Teste de regressão: mockar `spawnSync` e afirmar que `docker compose exec ... -tAc "select count(*) from users"` recebe 1 argumento. O `setup.mjs` não tem o problema (argumentos sem espaço). O `.bat` chama `pnpm iphone`, então herda a falha.

**B3. `corepack enable` provavelmente não existe no Node que o fundador vai baixar.** Corepack deixou de ser distribuído com o Node a partir da v25; em 2026-11-22 o botão "LTS" do nodejs.org tende a ser o Node 26 `[HIPÓTESE: não vi o site]`. Aí `corepack enable` falha no guia, no LEIA-ME e na mensagem do `.bat`. **Corrigido nos textos** (guia e LEIA-ME): Node 24 explícito + `npm install -g pnpm@10.28.0` no `cmd`, sem administrador. **Falta (código):** `iniciar-webag.bat` linhas 14-16: trocar `call corepack enable` por `call npm install -g pnpm@10.28.0` e a mensagem da linha 16 por "Nao consegui instalar o pnpm. Abra o Prompt de Comando e rode: npm install -g pnpm@10.28.0  e depois rode este arquivo de novo." O README (linhas 28-29) também diz "LTS" e `corepack enable` primeiro; inverter a ordem.

### PROVÁVEL

**P1. PowerShell bloqueia o `pnpm`** ("a execução de scripts foi desabilitada neste sistema"): política padrão do Windows cliente, comum com shims `.ps1`. O guia mandava abrir `powershell` na pasta. **Corrigido nos textos:** usar `cmd` (barra de endereço do Explorador). O `README.md` linha 33 ainda diz "no PowerShell" (ajustar).

**P2. `.bat` nunca refaz o setup após falha parcial.** `iniciar-webag.bat:25`: `if not exist .env` dispara o setup, mas o `setup.mjs` cria o `.env` **primeiro**; se o Docker falhar no meio (download, porta), o próximo duplo clique pula o setup e cai em "o banco está vazio, rode pnpm run setup", sem terminal para rodar. Mesmo com `node_modules` (linha 21): um `pnpm install` interrompido deixa a pasta e o `.bat` não reinstala. Correção: testar marcadores de término, ex. `if not exist node_modules\.modules.yaml` (o pnpm grava no fim do install `[HIPÓTESE]`) e, para o setup, o `.bat` criar `.webag-setup-ok` depois do `pnpm run setup` e testar este arquivo (ou rodar sempre o setup, que é idempotente: custa segundos).

**P3. Cancelar o aviso do firewall pode criar regra de BLOQUEIO, que vence a regra de permissão do `New-NetFirewallRule`.** A sintaxe do comando está correta (`-DisplayName`, `-Direction Inbound`, `-Protocol TCP`, `-LocalPort 3000,3001,8081,9000`, `-Action Allow`, `-Profile Private`), mas pode não resolver justamente o caso "cliquei Cancelar". **Acrescentei ao guia** como apagar as regras "Node.js JavaScript Runtime" de bloqueio `[HIPÓTESE, não testado]`. O aviso do firewall aparece cedo: `isPortFree` (iphone.mjs:285) e `isPortBusy` (setup.mjs) abrem uma escuta em `0.0.0.0` só para testar; o usuário vê o diálogo antes de o Webag subir. Sugestão ao guia/banner: avisar "vai aparecer um aviso do Firewall: marque Redes privadas".

**P4. 1ª abertura no Safari pode estourar o tempo.** O recado "WEBAG PRONTO" sai quando o Metro responde `/status` (iphone.mjs ~linha 455), não quando o pacote web está montado. O primeiro pedido do iPhone dispara a montagem (minutos em PC mais lento com antivírus) e o Safari pode desistir/mostrar branco. Correção (código): depois de `ready.app`, o script fazer um GET ao HTML e ao bundle de entrada para "esquentar" antes de imprimir o banner. Mitigado no guia (nova linha em "Problemas comuns").

**P5. Zip baixado pelo Explorador carrega a marca "da internet".** Duplo clique no `.bat` abre "O Windows protegeu o computador" (SmartScreen). **Corrigido no guia/LEIA-ME:** Desbloquear antes de extrair, ou Mais informações > Executar. Também: a extração cria `webag-main` aninhada; texto esclarecido ("a pasta certa tem `package.json`").

**P6. Guia mandava `SEED_HOURS=always_open pnpm db:seed`** (sintaxe POSIX; não roda em cmd/PowerShell). **Corrigido** com as formas do cmd e do PowerShell. O README linha 36 já trazia a forma PowerShell para `SKIP_DOCKER`.

**P7. Atalho "WSL 2 + Ubuntu" não serve para o iPhone.** WSL 2 usa rede NAT; o iPhone não alcança, nem com `--ip` (só com `networkingMode=mirrored` `[HIPÓTESE]`). Guia **corrigido** (passo 7 do Windows). README linha 33 ainda o vende como "saída mais robusta": ajustar.

### MÉDIO / COSMÉTICO

- **M1. Guard de execução silencioso.** `iphone.mjs:486` compara `argv[1]` com `import.meta.url`. Se a pasta for junction/`subst`/link, o Node resolve o caminho real, a comparação falha e o script **sai com código 0 sem imprimir nada** (reproduzi em Linux com link simbólico). No Windows pode ocorrer com junction ou diferença de maiúscula na letra do drive `[HIPÓTESE]`. Correção: comparar `realpathSync(process.argv[1])` com `realpathSync(fileURLToPath(import.meta.url))`.
- **M2. Portas "em uso" que o `netstat` não mostra.** Hyper-V/WSL/Docker reservam faixas de portas no Windows; escutar nelas dá `EACCES`. `iphone.mjs:285` trata qualquer erro como "em uso" e sugere `netstat`, que não mostra nada. Acrescentar à ajuda: `netsh interface ipv4 show excludedportrange protocol=tcp`; correção usual: `net stop winnat` e `net start winnat` como administrador `[HIPÓTESE]`.
- **M3. Segurança (para o `security-engineer`).** Postgres 5432, Redis 6379 (sem senha), Mailpit e console do storage 9001 ficam publicados em `0.0.0.0` pelo compose; a API, o Next e o Metro também escutam na rede toda. Aceitável em Wi-Fi de casa; o guia deve dizer "nunca em Wi-Fi público/de empresa" (hoje só cita isolamento de clientes).
- **C1.** `--check` reescreve o `.env` (o texto dizia que só conferia). Guia ajustado; a descrição em `iphone.mjs` linha 9 ("só prepara o `.env`") está correta, o LEIA-ME e o guia não estavam.
- **C2.** Node 24 imprime `DEP0190` (shell com argumentos) a cada `pnpm iphone`/`run setup` no Windows: ruído amarelo que assusta. Não dá para evitar de vez (Node 22.12+ exige shell para `.cmd`); com B2 corrigido só o `pnpm` continua gerando o aviso. Apenas avisar no guia que é inofensivo.
- **C3.** Ctrl+C no `.bat` pergunta "Deseja finalizar o arquivo em lotes (S/N)?". Documentado no guia.
- **C4.** Nome de placa: VPN corporativa chamada "Ethernet 2" pode vencer o Wi-Fi (pontua 20+10+25 pela rota). O script já lista as outras redes e aceita `--ip`; "Local Area Connection\* N" (hotspot do Windows, 192.168.137.1) não é filtrada (pontua 30 contra 45 do Wi-Fi real: ok).
- **C5.** O guia manda permitir "Rede Local > Safari" no iPhone; o Safari normalmente não tem essa chave (quem pede é Expo Go/Chrome) `[HIPÓTESE]`. Inofensivo.
- **C6.** `.bat`: sintaxe conferida por leitura e está correta (`goto` dentro de `|| ( ... )`, parênteses dentro de aspas, `^(` escapado, `node -e` com `&&`/`>` dentro de aspas, `call pnpm`, `chcp 65001 >nul`, `pause` no fim; com Docker fechado a janela mostra a mensagem e fica aberta). Windows em ARM: a imagem do PostGIS só tem Intel (README já cita para Apple Silicon).
- **C7.** `prettier --check` acusa os arquivos novos (também `setup.mjs` e `smoke.mjs`, antigos); o CI não roda `format:check`. Ignorar.

## NÃO foi possível testar

Windows (qualquer item acima marcado `[HIPÓTESE]`), cmd/PowerShell, SmartScreen, firewall e perfil de rede, Docker Desktop/WSL2/BIOS, `corepack`/pnpm em Windows, nomes reais de placas de rede, antivírus, caminhos longos, Safari e "Adicionar à Tela de Início" no iPhone real, Rede Local do iOS, isolamento de AP do roteador, Expo Go x SDK 58, e `pnpm iphone` completo (sem Docker aqui).

## Roteiro mínimo para o fundador (Windows, depois que B1-B3 estiverem resolvidos)

1. `cmd` na pasta, `node -v` (deve ser 24.x) e `pnpm -v` (10.28.0), `docker info` (sem erro).
2. `pnpm install`, `pnpm run setup`, `pnpm iphone --check`: deve mostrar o IP do Wi-Fi e terminar sem "PROBLEMA". Mande a saída se falhar.
3. `pnpm iphone`, espere "WEBAG PRONTO", abra o endereço no Safari (com `http://`). Se não abrir: perfil de rede Privada e a regra do firewall do guia.

## Arquivos alterados por esta revisão (só texto)

`docs/guias/rodar-no-meu-computador.md`, `LEIA-ME-INICIO-RAPIDO.txt`, este relatório.
