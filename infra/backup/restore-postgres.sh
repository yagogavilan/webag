#!/bin/sh
# RESTAURA um backup no banco de produção. DESTRUTIVO: apaga o banco atual e o recria a partir do arquivo.
# Uso: restore-postgres <arquivo.dump.enc> --yes
# Antes: pare a API e o web (sh infra/scripts/prod.sh stop api web) e confirme o arquivo com `test-restore`.
set -eu
. /usr/local/lib/webag-backup.sh
file=${1:?informe o arquivo (nome em /backups/postgres ou caminho completo)}
[ -f "$file" ] || file="$PG_BACKUP_DIR/$file"
[ -f "$file" ] || die "arquivo não encontrado: $1"
if [ "${2:-}" != "--yes" ]; then
  echo "ATENÇÃO: isto APAGA o banco '$POSTGRES_DB' e o recria a partir de $(basename "$file")." >&2
  echo "Pare a API e o web antes. Para continuar, rode de novo com --yes no fim do comando." >&2
  exit 2
fi
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE não definida}"
plain="/backups/.restore-$$.dump"
trap 'rm -f "$plain"' EXIT

decrypt_file "$file" "$plain" || die "não consegui decifrar: BACKUP_PASSPHRASE errada ou arquivo corrompido"
pg_restore --list "$plain" >/dev/null || die "o arquivo decifrado não é um dump válido"

# Rede de segurança: tenta guardar o estado atual antes de apagar (se o banco estiver quebrado, segue sem ele).
log "tentando um backup de segurança do estado atual antes de restaurar..."
backup-postgres || log "aviso: backup de segurança falhou; seguindo com a restauração"

log "recriando o banco $POSTGRES_DB"
pg_admin -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)"
pg_admin -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
log "restaurando (pode levar alguns minutos)"
pg pg_restore -h "${PGHOST:-postgres}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error "$plain"
log "restauração concluída. Suba a API (sh infra/scripts/prod.sh up -d) e confira os painéis."
