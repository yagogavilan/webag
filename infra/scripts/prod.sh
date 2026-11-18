#!/bin/sh
# Atalho do docker compose de produção (usa sempre o .env da raiz e o infra/docker-compose.prod.yml;
# os caminhos dentro do compose são relativos à pasta infra/).
# Exemplos (na raiz do repositório):
#   sh infra/scripts/prod.sh up -d --build     # sobe/atualiza tudo
#   sh infra/scripts/prod.sh ps                # estado dos serviços
#   sh infra/scripts/prod.sh logs -f api       # logs da API
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
[ -f "$ROOT/.env" ] || { echo "Falta o .env na raiz. Rode primeiro: sh infra/scripts/gen-secrets.sh" >&2; exit 1; }
exec docker compose --env-file "$ROOT/.env" -f "$ROOT/infra/docker-compose.prod.yml" "$@"
