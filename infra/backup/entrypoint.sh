#!/bin/sh
# Sem argumentos (ou "crond"): instala o cron e fica rodando. Com argumentos: executa o comando (ex.: restore-postgres ...).
set -eu
if [ "${1:-crond}" != "crond" ]; then
  exec "$@"
fi
cron_expr=${BACKUP_CRON:-15 3 * * *}
[ "$(printf '%s' "$cron_expr" | wc -w)" -eq 5 ] || { echo "BACKUP_CRON inválido (esperado 5 campos: minuto hora dia mês dia-da-semana): $cron_expr" >&2; exit 1; }
[ -n "${BACKUP_PASSPHRASE:-}" ] || { echo "BACKUP_PASSPHRASE vazia: não dá para cifrar o backup." >&2; exit 1; }

# O cron não herda o ambiente: guardamos o necessário num arquivo só do root.
umask 077
env | grep -E '^(PG|POSTGRES_|BACKUP_|STORAGE_BACKUP_|S3_|AWS_)' | while IFS= read -r kv; do
  k=${kv%%=*}; v=${kv#*=}
  esc=$(printf '%s' "$v" | sed "s/'/'\\\\''/g")
  printf "export %s='%s'\n" "$k" "$esc"
done > /etc/backup.env

mkdir -p /etc/crontabs
printf '%s . /etc/backup.env; /usr/local/bin/backup-all >> /proc/1/fd/1 2>&1\n' "$cron_expr" > /etc/crontabs/root
echo "[backup] cron instalado: '$cron_expr' (UTC). Backups em /backups. Remoto: $([ -n "${BACKUP_S3_BUCKET:-}" ] && echo ligado || echo 'DESLIGADO (só local)')"
[ -n "${BACKUP_S3_BUCKET:-}" ] || echo "[backup] AVISO: BACKUP_S3_* não configurado. Backup só no mesmo disco do banco não protege contra perda do servidor." >&2
exec crond -f -l 8
