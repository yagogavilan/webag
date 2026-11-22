@echo off
rem Webag no Windows: duplo clique. Confere o que falta, prepara na 1a vez e sobe tudo para abrir no iPhone (Safari).
rem NAO TESTADO no Windows. Detalhes: docs\guias\rodar-no-meu-computador.md
chcp 65001 >nul
cd /d "%~dp0"
title Webag

echo === Webag: conferindo os programas ===
where git >nul 2>nul || echo (aviso) Git nao encontrado; so e necessario para atualizar o projeto com "git pull".
where node >nul 2>nul || ( set "MSG=O Node.js nao esta instalado. Baixe em https://nodejs.org (LTS ou 24), instale e rode este arquivo de novo." & goto :erro )
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)" || ( set "MSG=O Node e antigo; o Webag pede 22.12 ou mais novo. Instale o Node 24 em https://nodejs.org e rode de novo." & goto :erro )
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm nao encontrado: tentando ativar com "corepack enable"...
  call corepack enable
  where pnpm >nul 2>nul || ( set "MSG=Nao consegui ativar o pnpm. Abra o PowerShell COMO ADMINISTRADOR, rode: corepack enable  e depois rode este arquivo de novo." & goto :erro )
)
where docker >nul 2>nul || ( set "MSG=O Docker nao esta instalado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/), abra-o e rode de novo." & goto :erro )
docker info >nul 2>nul || ( set "MSG=O Docker Desktop esta fechado. Abra-o, espere o status ficar 'Engine running' (1 a 2 minutos) e rode de novo." & goto :erro )

if not exist node_modules (
  echo === Primeira vez: instalando dependencias ^(5 a 10 minutos^) ===
  call pnpm install || ( set "MSG=O pnpm install falhou. Veja a mensagem acima e docs\guias\rodar-no-meu-computador.md" & goto :erro )
)
if not exist .env (
  echo === Primeira vez: criando o banco e os dados de demonstracao ===
  call pnpm run setup || ( set "MSG=O pnpm run setup falhou. Veja a mensagem acima." & goto :erro )
)

echo === Subindo o Webag ^(Ctrl+C para parar^) ===
call pnpm iphone
goto :fim

:erro
echo.
echo PROBLEMA: %MSG%
:fim
echo.
pause
