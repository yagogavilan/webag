#!/bin/sh
# Emite o certificado HTTPS (Let's Encrypt) para api, admin, lojista e arquivos, e liga o nginx.
# Rodar UMA vez no servidor, depois que o DNS dos 4 nomes já aponta para ele (guia de deploy, passo 8).
#   sh infra/scripts/init-tls.sh                 # emissão real
#   sh infra/scripts/init-tls.sh --staging       # ensaio no Let's Encrypt de teste (certificado não confiável; não gasta limite)
#   sh infra/scripts/init-tls.sh --self-signed   # só sobe o nginx com certificado autoassinado (teste sem domínio)
# Renovação é automática (serviço certbot, 2x ao dia). Re-executar só se mudar a lista de domínios (use --force).
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ENV="$ROOT/.env"
[ -f "$ENV" ] || { echo "Falta o .env na raiz (sh infra/scripts/gen-secrets.sh)." >&2; exit 1; }
get() { grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
P="sh $ROOT/infra/scripts/prod.sh"
API_HOST=$(get API_HOST); ADMIN_HOST=$(get ADMIN_HOST); LOJISTA_HOST=$(get LOJISTA_HOST); FILES_HOST=$(get FILES_HOST); EMAIL=$(get LETSENCRYPT_EMAIL)
for v in API_HOST ADMIN_HOST LOJISTA_HOST FILES_HOST; do
  eval "val=\$$v"
  case "$val" in ''|*exemplo.com.br*) echo "Ajuste $v no .env (ainda está o valor de exemplo)." >&2; exit 1 ;; esac
done

mode=real; staging=""; force=0
for a in "$@"; do
  case "$a" in
    --staging) staging="--staging" ;;
    --self-signed) mode=self ;;
    --force) force=1 ;;
    *) echo "Opção desconhecida: $a" >&2; exit 1 ;;
  esac
done
if [ "$mode" = real ]; then
  case "$EMAIL" in ''|*PREENCHER*) echo "Ajuste LETSENCRYPT_EMAIL no .env." >&2; exit 1 ;; esac
fi

make_dummy() {
  $P run --rm --no-deps --entrypoint sh certbot -c \
    "mkdir -p /etc/letsencrypt/live/webag && openssl req -x509 -nodes -newkey rsa:2048 -days 7 -subj /CN=webag-bootstrap \
     -keyout /etc/letsencrypt/live/webag/privkey.pem -out /etc/letsencrypt/live/webag/fullchain.pem 2>/dev/null"
}

if [ "$mode" = real ] && [ "$force" -eq 0 ] && $P run --rm --no-deps --entrypoint sh certbot -c "test -f /etc/letsencrypt/renewal/webag.conf"; then
  echo "Já existe um certificado emitido (a renovação é automática). Use --force para emitir de novo." >&2
  exit 0
fi

echo "[1/4] criando certificado provisório (autoassinado) para o nginx conseguir subir..."
$P run --rm --no-deps --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/webag /etc/letsencrypt/archive/webag /etc/letsencrypt/renewal/webag.conf"
make_dummy

echo "[2/4] subindo nginx (e, junto, banco, API e web)..."
$P up -d --wait nginx

if [ "$mode" = self ]; then
  echo "Pronto (modo autoassinado): o navegador vai avisar que o certificado não é confiável. Para o real, rode sem --self-signed."
  exit 0
fi

echo "[3/4] pedindo o certificado ao Let's Encrypt (os 4 nomes precisam apontar para este servidor, portas 80 e 443 abertas)..."
$P run --rm --no-deps --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/webag /etc/letsencrypt/archive/webag /etc/letsencrypt/renewal/webag.conf"
if ! $P run --rm --no-deps --entrypoint certbot certbot certonly --webroot -w /var/www/certbot --cert-name webag \
     -d "$API_HOST" -d "$ADMIN_HOST" -d "$LOJISTA_HOST" -d "$FILES_HOST" \
     --email "$EMAIL" --agree-tos --no-eff-email --non-interactive $staging; then
  echo "FALHOU. Recolocando o certificado provisório. Confira: DNS dos 4 nomes, portas 80/443 liberadas no firewall do provedor." >&2
  make_dummy
  exit 1
fi

echo "[4/4] recarregando o nginx com o certificado novo..."
$P exec nginx nginx -s reload
echo "Pronto. Teste: https://$ADMIN_HOST e https://$API_HOST/health"
[ -n "$staging" ] && echo "ATENÇÃO: foi certificado de ENSAIO (--staging). Rode de novo com --force e sem --staging para o real."
exit 0
