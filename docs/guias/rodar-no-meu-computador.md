# Rodar o Webag no meu computador e abrir no iPhone

Para quem tem pouco tempo. No fim você terá o Webag inteiro (API, banco, site, painéis e app) rodando no seu computador, e o app aberto no **Safari do seu iPhone** pelo Wi-Fi, com um ícone do Webag na tela de início. **Custa zero, não cria conta nenhuma e não usa nenhuma senha sua**; tudo é de demonstração, e nenhum pagamento é real.

> Estado dos testes (2026-11-22): o caminho completo foi executado **numa máquina Linux**, com o Chromium emulando um iPhone 17 Pro (402x874, fator 3) e abrindo o app pelo endereço de rede (não pelo `localhost`): cliente demo, loja, sacola, checkout, PIX com "Simular pagamento", acompanhamento do pedido, e também o pagamento por cartão de teste. **NÃO TESTADO**: macOS, Windows, o Docker Desktop, os scripts de duplo clique e o **iPhone de verdade** (Safari, "Adicionar à Tela de Início", Expo Go). Onde algo desta página for suposição, está marcado. Se falhar, veja "Problemas comuns" no fim.

## O caminho em 5 linhas

```
1. Instale Git, Node, pnpm e Docker Desktop (seção do seu sistema abaixo)
2. Baixe o projeto e abra um terminal dentro da pasta
3. pnpm install
4. pnpm run setup        (uma vez só: cria o banco e os dados de demonstração)
5. pnpm iphone           (sobe tudo e mostra o endereço para o Safari do iPhone)
```

Atalho: depois de instalar os 4 programas e baixar o projeto, dê **duplo clique** em `iniciar-webag.command` (macOS) ou `iniciar-webag.bat` (Windows). Ele confere o que falta, roda os passos 3 e 4 na primeira vez e depois o 5.

Precisa de: ~10 GB livres, internet na primeira instalação (o Docker baixa umas imagens), e computador e iPhone **no mesmo Wi-Fi**. Tempo: primeira vez 15 a 30 minutos (mais o que o Docker baixar); depois, 1 a 2 minutos para subir.

## 1. Instalar os programas

Versões que o projeto pede: **Node 24** (mínimo 22.12; arquivo `.nvmrc`), **pnpm 10** (o `package.json` fixa 10.28.0), Git e Docker Desktop.

### macOS (NÃO TESTADO)

1. **Git**: abra o app **Terminal** e rode `git --version`. Se pedir para instalar as "ferramentas de linha de comando", aceite (é o Git da Apple).
2. **Node 24**: baixe o instalador **LTS** em https://nodejs.org (se o LTS ainda for uma versão menor que 22.12, escolha a "Current"/24) e instale. Alternativa, se você usa Homebrew: `brew install node@24`.
3. **pnpm**: no Terminal, `corepack enable`. Se der "permission denied", use `sudo corepack enable` (pede a senha do Mac). Confirme com `pnpm --version` (deve mostrar 10.x; na primeira vez ele pode baixar o pnpm sozinho).
4. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ (escolha **Apple Silicon** se o seu Mac é M1 ou mais novo; **Intel** se for antigo). Abra o programa, aceite os termos e espere a baleia no topo da tela parar de se mexer. Deixe-o **aberto** sempre que usar o Webag.
5. **Mac com chip Apple (M1 ou mais novo)**: a imagem do PostGIS é só Intel. Depois do primeiro `pnpm run setup` criar o arquivo `.env`, abra-o e acrescente a linha `POSTGIS_IMAGE=imresamu/postgis:18-3.6-alpine`, e rode `pnpm run setup` de novo (explicação no `README.md`, seção "Instalar as ferramentas").
6. **Firewall do Mac**: se "Ajustes do Sistema > Rede > Firewall" estiver ligado, na primeira vez o macOS pergunta "Deseja permitir que o node aceite conexões de entrada?". Clique em **Permitir**.

### Windows 10/11 (NÃO TESTADO)

1. **Git**: https://git-scm.com/download/win (aceite tudo com "Next").
2. **Node 24**: https://nodejs.org, instalador `.msi`. Escolha **explicitamente a versão 24** (em "Baixar o Node.js" / outras versões), não o botão LTS "padrão" nem a "Current": versões novas (25 em diante) **não trazem mais o `corepack`**, e o passo 3 abaixo não funcionaria `[HIPÓTESE: não verificado qual versão o botão LTS oferece hoje]`. Marque a opção que adiciona ao PATH (já vem marcada). Abra um terminal **novo** depois de instalar.
3. **pnpm**: abra o **Prompt de Comando** (menu Iniciar, digite `cmd`, Enter; **não** precisa ser administrador) e rode `npm install -g pnpm@10.28.0`. Confirme com `pnpm --version` (deve mostrar 10.28.0). Alternativa que funciona só com o Node 24 e exige administrador: `corepack enable`. Use o **Prompt de Comando (cmd)** para todos os comandos deste guia: no PowerShell, o Windows costuma bloquear o `pnpm` com "a execução de scripts foi desabilitada neste sistema" (se acontecer, rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` no PowerShell, ou volte ao `cmd`). Na primeira vez que o `pnpm` rodar, ele pode perguntar se pode baixar algo (`[Y/n]`): responda `Y`.
4. **Docker Desktop**: https://www.docker.com/products/docker-desktop/ com o backend **WSL 2** (o instalador oferece). Reinicie o computador quando ele pedir, abra o Docker Desktop e espere o status ficar "Engine running". Deixe-o **aberto**. Se ele reclamar de virtualização desativada: ative "Intel Virtualization Technology" / "SVM Mode" na BIOS (Gerenciador de Tarefas > Desempenho > CPU deve mostrar "Virtualização: Habilitado") `[HIPÓTESE: nome da opção varia por fabricante]`.
5. **Firewall do Windows**: na primeira vez, aparece "O Firewall do Windows bloqueou alguns recursos do Node.js". Marque **Redes privadas** e clique em **Permitir acesso**. Se você já clicou em Cancelar, veja "Problemas comuns".
6. Rede do Wi-Fi como **Privada**: Configurações > Rede e Internet > Wi-Fi > (sua rede) > Tipo de perfil de rede > **Privada**.
7. Se o Docker ou o Node derem problema, o `README.md` cita como saída WSL 2 + Ubuntu (`wsl --install`). **Para o iPhone isso não é um atalho**: dentro do WSL 2 o computador fica atrás de uma rede virtual (NAT) e o iPhone não a enxerga, nem com `--ip` `[HIPÓTESE: só funciona com "networkingMode=mirrored" no `.wslconfig`, Windows 11 22H2 ou mais novo; não testado]`. Prefira o caminho nativo do Windows deste guia.

## 2. Baixar o projeto

- **Sem Git (mais fácil)**: https://github.com/yagogavilan/webag/archive/refs/heads/main.zip. Extraia numa pasta **sem espaços e sem acentos no caminho** (ex.: `C:\webag` no Windows, `~/webag` no Mac). No Windows, **não** extraia dentro de OneDrive nem de "Downloads" com sincronização (nem em "Desktop" sincronizado), e use um caminho **curto** (menos de ~40 caracteres): o `node_modules` cria pastas bem profundas e o Windows limita o caminho a 260 caracteres. O zip cria a pasta `webag-main` **dentro** do lugar onde você extrair: a pasta certa é a que contém `package.json` e `iniciar-webag.bat` (ex.: `C:\webag\webag-main`; se preferir `C:\webag`, mova o conteúdo de `webag-main` para cima). Antes de extrair, clique com o botão direito no `.zip` > Propriedades > marque **Desbloquear** > OK; senão o Windows marca os arquivos como "da internet" e o duplo clique no `.bat` mostra "O Windows protegeu o computador" (se aparecer: **Mais informações** > **Executar assim mesmo**). O zip tem uns 90 MB.
- **Com Git**: `git clone https://github.com/yagogavilan/webag.git` (e depois `git pull` para atualizar).

Abra o terminal **dentro** da pasta do projeto:

- macOS: Terminal, digite `cd ` (com espaço), arraste a pasta `webag-main` para a janela, Enter.
- Windows: abra a pasta no Explorador, clique na barra de endereço, digite `cmd`, Enter (abre o Prompt de Comando já dentro da pasta).

## 3. Os comandos

```
pnpm install
pnpm run setup
pnpm iphone
```

- `pnpm install`: baixa as dependências (5 a 10 min na primeira vez).
- `pnpm run setup` (com `run`!): cria o `.env`, sobe o banco/Redis/fotos/e-mail de teste no Docker, aplica as migrações e cria os dados de demonstração. É seguro repetir.
- `pnpm iphone`: descobre o endereço do seu computador no Wi-Fi, grava só **endereços** no `.env` (guarda cópia em `.env.bak`; não lê nem imprime segredos), confere Docker e portas, sobe tudo e imprime o recado "WEBAG PRONTO" com o endereço, o QR code, os logins e como simular o pagamento. A primeira subida demora alguns minutos (o app é montado na hora). Se houver mais de uma rede no computador e ele escolher a errada: `pnpm iphone --ip 192.168.0.10` (use o IP do seu Wi-Fi: Windows `ipconfig`; Mac `ipconfig getifaddr en0`).

`pnpm iphone --check` confere tudo e mostra o endereço, sem subir nada (mas **atualiza o `.env`**, guardando a cópia em `.env.bak`, igual ao `pnpm iphone` normal).

## 4. No iPhone

1. iPhone no **mesmo Wi-Fi** do computador (não use "dados móveis", nem Wi-Fi de convidados).
2. Abra o **Safari** e digite o endereço do recado (algo como `http://192.168.0.10:8081`), ou aponte a câmera para o QR code do terminal e toque em "Abrir no Safari".
3. A primeira abertura demora (dezenas de segundos). Na primeira vez o iOS pode perguntar se o Safari pode acessar a **rede local**: toque em **Permitir** (se negou: Ajustes > Privacidade e Segurança > Rede Local > Safari).
4. **Ícone na tela de início**: botão **Compartilhar** (quadrado com seta) > **Adicionar à Tela de Início** > **Adicionar**. Abra pelo ícone do Webag: o app abre em tela cheia, sem a barra do Safari. Isso é um atalho para o mesmo endereço (não é um app instalado): o computador precisa estar com o `pnpm iphone` rodando.
5. Escolha a cidade (ou digite o CEP), uma loja, um produto, a sacola e **Finalizar com PIX**.
6. Na tela do PIX toque em **Simular pagamento** (aparece só em desenvolvimento): o pedido vira "Recebido" e você acompanha a linha do tempo. Nada é cobrado. Alternativa pelo computador, em outro terminal: `pnpm pagar`.
7. Para ver o outro lado: no iPhone (ou no computador) abra `http://<seu IP>:3001/lojista/entrar` e entre como lojista para aceitar o pedido.

### Logins de demonstração (só desenvolvimento)

| Perfil | E-mail | Senha |
|---|---|---|
| Cliente | `cliente.ana@seed.webag.local` (também `bruno`, `carla`, `diego`, `elisa`, `fabio`) | `webag-seed-lojista-2026` |
| Lojista | `lojista.mercadinho-boa-compra@seed.webag.local` | `webag-seed-lojista-2026` |
| Admin | `admin@webag.local` | `Webag-Admin-Dev-2026` (pede o 2º fator; veja o `README.md`) |

Cupons: `BEMVINDO10`, `FRETEGRATIS`, `LOJA5`.

### O que é diferente no Safari em relação ao app de verdade

Verificado no navegador emulado; **no iPhone real, NÃO TESTADO**:

| Limite | Por quê | O que fazer |
|---|---|---|
| "Usar minha localização" não funciona | O navegador só libera localização em HTTPS; aqui é `http://` na rede local | Escolha a cidade ou digite o CEP |
| Ao recarregar a página (ou o iOS descartar a aba/atalho) você sai da conta | Na web a sessão fica só na memória (sem `expo-secure-store`, DEC-058) | Entre de novo; vale a pena para uma demonstração |
| Sem notificações push; o aviso "Ative os avisos" aparece | Push é só do app nativo | Ignore |
| Copiar o código PIX | `navigator.clipboard` também exige HTTPS; o app usa uma alternativa (`apps/mobile/src/lib/web-insecure-context.web.ts`) | Funciona; se não copiar, mantenha o dedo no código para copiar à mão |
| Fotos das lojas | Vêm do armazenamento na porta 9000 do computador | Libere também a **9000** no firewall (abaixo) |
| Carregamento lento na 1ª vez | O app é montado a cada abertura em modo desenvolvimento (pacote grande) | As seguintes são mais rápidas; é só para demonstração |

Já tratado por configuração (o `pnpm iphone` faz): CORS com o endereço do iPhone (`CORS_ORIGINS`), Socket.IO (acompanhamento em tempo real usa o mesmo CORS), URL das fotos, URL da página segura do cartão, e liberação do painel/site pelo IP. Cookies do painel do lojista funcionam em http na rede local (login do lojista verificado). O app em si usa token no cabeçalho, não cookie.

## 5. Parar, reiniciar, atualizar

- **Parar**: `Ctrl+C` na janela do `pnpm iphone` (ou feche a janela). O banco continua no Docker; para desligá-lo: `pnpm infra:down`. Para recomeçar do zero (apaga os dados): `docker compose down -v` e depois `pnpm run setup`.
- **Reiniciar** (outro dia, ou o Wi-Fi mudou de endereço): Docker Desktop aberto, depois `pnpm iphone` (ou duplo clique). Ele descobre o endereço de novo e corrige o `.env`. O endereço no Safari muda se o seu IP mudou; o atalho da tela de início fica com o endereço antigo (apague-o e adicione de novo).
- **Atualizar o projeto**: baixe o zip novo (ou `git pull`), `pnpm install`, `pnpm iphone` (ele aplica as migrações novas sozinho). O `.env` e o banco são mantidos se você extrair por cima/usar `git pull`; no zip novo copie o `.env` antigo.
- **Voltar o `.env` ao que era antes** do `pnpm iphone`: copie `.env.bak` por cima de `.env`.

## 6. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| "O Docker está instalado, mas fechado" | Docker Desktop não está aberto | Abra, espere a baleia parar, rode de novo |
| "as portas ... já estão em uso" | Uma janela antiga do Webag, ou outro programa | Feche a outra janela (`Ctrl+C`). Quem usa a porta: Mac `lsof -nP -iTCP:3000 -sTCP:LISTEN`; Windows `netstat -ano \| findstr :3000` |
| "o banco está vazio" ou "o arquivo .env não existe" | Falta o `pnpm run setup` | Rode `pnpm run setup` |
| O iPhone fica carregando e nunca abre | Firewall, Wi-Fi diferente, ou rede com "isolamento de clientes" | Veja as 3 linhas abaixo |
| ... firewall do Windows | Você clicou "Cancelar" no aviso | PowerShell como administrador: `New-NetFirewallRule -DisplayName "Webag" -Direction Inbound -Protocol TCP -LocalPort 3000,3001,8081,9000 -Action Allow -Profile Private`. Se mesmo assim não abrir: ao cancelar, o Windows pode ter criado regras de **bloqueio** para o Node, e bloqueio vence permissão. Em Segurança do Windows > Firewall > Configurações avançadas > Regras de Entrada, apague as regras "Node.js JavaScript Runtime" com ação Bloquear e rode o `pnpm iphone` de novo (o aviso volta; marque Redes privadas) `[HIPÓTESE: não testado no Windows]` |
| Safari mostra "Não foi possível abrir a página" ou fica em branco na 1ª vez | O app ainda estava sendo montado (a 1ª abertura pode levar 2 a 3 minutos num PC mais lento) e o Safari desistiu antes | Espere o terminal parar de imprimir linhas novas e recarregue a página; a segunda tentativa usa o que já ficou pronto `[HIPÓTESE]` |
| Ao apertar `Ctrl+C` no `iniciar-webag.bat` aparece "Deseja finalizar o arquivo em lotes (S/N)?" | Comportamento normal do Windows | Digite `S` e Enter |
| ... firewall do macOS | "node" bloqueado | Ajustes do Sistema > Rede > Firewall > Opções: permitir "node"; ou desligue o firewall só durante o teste |
| ... Wi-Fi | iPhone em outra rede, em "convidados" ou nos dados móveis | Mesmo Wi-Fi, rede normal. Roteadores com "isolamento de AP/cliente" ou Wi-Fi de empresa/faculdade bloqueiam; teste em casa ou use o roteador do celular dos dois lados |
| Abre, mas as lojas não carregam ("Não conseguimos carregar") | O endereço do `.env` não é o do seu Wi-Fi | `pnpm iphone --ip <IP do Wi-Fi>` |
| Escolheu a rede errada (VPN, WSL, Docker) | Mais de uma rede ativa | `pnpm iphone --ip <IP do Wi-Fi>`; o script avisa quando há outras |
| Lojas sem foto | Porta 9000 bloqueada, ou o storage do Docker parado | Libere a 9000; `docker compose up -d storage` |
| "Loja fechada" na sacola | Horário real da loja | O seed deixa 24 h por padrão; se mudou, Mac/Linux: `SEED_HOURS=always_open pnpm db:seed`; Windows (cmd): `set SEED_HOURS=always_open && pnpm db:seed` (PowerShell: `$env:SEED_HOURS="always_open"; pnpm db:seed`) |
| `pnpm: command not found` | Falta o `corepack enable` | Seção 1 do seu sistema |
| Node antigo | Versão < 22.12 | Instale o Node 24 e abra um terminal novo |

## 7. Expo Go (opcional; leia antes)

O `pnpm iphone` também mostra `exp://<IP>:8081` e um QR para o **Expo Go**. O projeto está no **Expo SDK 58**, e o Expo Go da App Store só abre **uma** versão de SDK (a documentação do Expo diz que ele "só suporta a versão mais recente do SDK"). **Não consegui confirmar** se o Expo Go da App Store já abre SDK 58 hoje (veja `docs/guias/instalar-no-iphone.md`, seção "Expo Go x SDK 58"). Teste sem custo: instale o Expo Go (App Store), escaneie o QR. Se aparecer algo como "projeto incompatível com esta versão do Expo Go", **use o Safari**; é o caminho principal deste guia. No Expo Go, o iOS também pede permissão de **Rede Local**: permita.
