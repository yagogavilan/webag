#!/bin/sh
# Baixa um backup da nuvem para /backups/postgres (recuperação num servidor novo). Uso: backup-fetch webag-pg-20261118T031500Z.dump.enc
set -eu
. /usr/local/lib/webag-backup.sh
name=${1:?informe o nome do arquivo (veja: backup-list)}
case "$name" in */*|*..*) die "informe só o nome do arquivo" ;; esac
remote_enabled || die "BACKUP_S3_* não configurado no .env"
mkdir -p "$PG_BACKUP_DIR"
dest_aws s3 cp "s3://$BACKUP_S3_BUCKET/postgres/$name" "$PG_BACKUP_DIR/$name" --only-show-errors
log "baixado: $PG_BACKUP_DIR/$name"
