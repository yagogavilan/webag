#!/bin/sh
# Backup do Postgres: pg_dump (formato custom, comprimido) -> valida -> cifra (AES-256) -> guarda em /backups/postgres
# -> envia para o bucket de backup (se configurado) -> aplica retenção (só depois de tudo dar certo).
set -eu
. /usr/local/lib/webag-backup.sh
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE não definida}"
keep=${BACKUP_KEEP_DAYS:-14}
remote_keep=${BACKUP_REMOTE_KEEP_DAYS:-30}

ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$PG_BACKUP_DIR"
plain="$PG_BACKUP_DIR/.webag-pg-$ts.dump"
out="$PG_BACKUP_DIR/webag-pg-$ts.dump.enc"
trap 'rm -f "$plain" "$out.tmp"' EXIT

log "iniciando pg_dump de $POSTGRES_DB"
pg pg_dump -h "${PGHOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 -f "$plain"
pg_restore --list "$plain" >/dev/null || die "o dump gerado não é legível (pg_restore --list falhou)"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$plain" -out "$out.tmp"
mv "$out.tmp" "$out"
log "backup local criado: $(basename "$out") ($(du -h "$out" | cut -f1))"

if remote_enabled; then
  dest_aws s3 cp "$out" "s3://$BACKUP_S3_BUCKET/postgres/$(basename "$out")" --only-show-errors || die "falha ao enviar o backup para a nuvem"
  log "enviado para s3://$BACKUP_S3_BUCKET/postgres/"
  prune_remote postgres "$remote_keep"
fi

# Retenção local: apaga o que passou de $keep dias. Roda só após sucesso, então um backup quebrado nunca apaga os bons.
find "$PG_BACKUP_DIR" -name 'webag-pg-*.dump.enc' -mtime +"$keep" -print -delete | while read -r f; do log "removido localmente (retenção de $keep dias): $(basename "$f")"; done
log "backup do Postgres concluído"
