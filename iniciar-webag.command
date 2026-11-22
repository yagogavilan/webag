#!/bin/bash
# Webag no macOS: duplo clique. Confere o que falta, prepara na 1ª vez e sobe tudo para abrir no iPhone (Safari).
# NÃO TESTADO no macOS. Detalhes: docs/guias/rodar-no-meu-computador.md
cd "$(dirname "$0")" || exit 1

pausa() { echo; read -r -p "Aperte Enter para fechar..." _; }
erro() { echo; echo "PROBLEMA: $1"; shift; for linha in "$@"; do echo "  $linha"; done; pausa; exit 1; }

echo "=== Webag: conferindo os programas ==="
command -v git >/dev/null 2>&1 || echo "(aviso) Git não encontrado; só é necessário para atualizar o projeto com 'git pull'."
command -v node >/dev/null 2>&1 || erro "O Node.js não está instalado." "Baixe em https://nodejs.org (versão LTS ou 24), instale e rode este arquivo de novo."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)' || erro "O Node é antigo ($(node -v)); o Webag pede 22.12 ou mais novo." "Instale o Node 24 em https://nodejs.org e rode de novo."
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm não encontrado: ativando com 'corepack enable' (pode pedir a senha do Mac)..."
  corepack enable 2>/dev/null || sudo corepack enable || erro "Não consegui ativar o pnpm." "No Terminal rode: sudo corepack enable"
  command -v pnpm >/dev/null 2>&1 || erro "O pnpm continua indisponível." "Abra um Terminal novo e rode este arquivo de novo."
fi
command -v docker >/dev/null 2>&1 || erro "O Docker não está instalado." "Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/), abra-o e rode de novo."
docker info >/dev/null 2>&1 || erro "O Docker Desktop está fechado." "Abra o Docker Desktop, espere a baleia parar de se mexer (1 a 2 minutos) e rode de novo."

if [ ! -d node_modules ]; then
  echo "=== Primeira vez: instalando dependências (5 a 10 minutos) ==="
  pnpm install || erro "O 'pnpm install' falhou." "Veja a mensagem acima e o guia docs/guias/rodar-no-meu-computador.md."
fi
if [ ! -f .env ]; then
  echo "=== Primeira vez: criando o banco e os dados de demonstração ==="
  if [ "$(uname -m)" = "arm64" ]; then
    echo "Mac com chip Apple: se o Docker reclamar do PostGIS, veja a seção macOS do guia (POSTGIS_IMAGE)."
  fi
  pnpm run setup || erro "O 'pnpm run setup' falhou." "Veja a mensagem acima. Mac com chip Apple: acrescente POSTGIS_IMAGE=imresamu/postgis:18-3.6-alpine ao .env e rode de novo."
fi

echo "=== Subindo o Webag (Ctrl+C para parar) ==="
pnpm iphone
pausa
