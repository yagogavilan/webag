#!/bin/sh
# Cria o .env de produção a partir de infra/env.prod.example, sorteando todos os segredos (linhas com GERAR_*).
# Uso (na raiz do repositório, no servidor):  sh infra/scripts/gen-secrets.sh
# Nunca sobrescreve um .env existente. Precisa do openssl (já vem na maioria dos servidores Linux).
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
OUT=${WEBAG_ENV_FILE:-.env}
[ -f "$OUT" ] && { echo "O arquivo $OUT já existe e não será alterado. Apague-o ou renomeie-o se quiser gerar de novo." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl não encontrado. Instale (Ubuntu/Debian: sudo apt install -y openssl)." >&2; exit 1; }
umask 077
while IFS= read -r line; do
  case "$line" in
    *=GERAR_HEX)       printf '%s=%s\n' "${line%%=*}" "$(openssl rand -hex 24)" ;;
    *=GERAR_SEGREDO)   printf '%s=%s\n' "${line%%=*}" "$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')" ;;
    *=GERAR_CHAVE_AES) printf '%s=%s\n' "${line%%=*}" "$(openssl rand -base64 32)" ;;
    *)                 printf '%s\n' "$line" ;;
  esac
done < infra/env.prod.example > "$OUT"
chmod 600 "$OUT"
echo "$OUT criado com segredos novos (permissão 600)."
echo "Próximo passo: abra o .env (nano .env), troque os domínios 'exemplo.com.br' e preencha os campos [PREENCHER]."
echo "Depois COPIE o .env para um gerenciador de senhas: ele é a única cópia dos segredos."
