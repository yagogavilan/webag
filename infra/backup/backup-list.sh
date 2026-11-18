#!/bin/sh
# Lista os backups do Postgres disponíveis (no servidor e, se configurado, na nuvem).
. /usr/local/lib/webag-backup.sh
echo "== No servidor ($PG_BACKUP_DIR) =="
ls -1 "$PG_BACKUP_DIR" 2>/dev/null | grep -E '^webag-pg-.*\.dump\.enc$' | sort || true
if remote_enabled; then
  echo "== Na nuvem (s3://$BACKUP_S3_BUCKET/postgres/) =="
  dest_aws s3 ls "s3://$BACKUP_S3_BUCKET/postgres/" | awk '{print $4}' | grep -E '^webag-pg-.*\.dump\.enc$' | sort || true
fi
