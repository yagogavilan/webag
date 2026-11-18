#!/bin/sh
# Teste de restauração: restaura o backup mais recente (ou o informado) num banco TEMPORÁRIO, confere e apaga.
# NÃO toca no banco de produção. Faça pelo menos 1x por mês e depois de qualquer mudança no backup.
# Uso: test-restore [arquivo.dump.enc]
set -eu
. /usr/local/lib/webag-backup.sh
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE não definida}"
file=${1:-}
if [ -z "$file" ]; then file=$(ls -1 "$PG_BACKUP_DIR"/webag-pg-*.dump.enc 2>/dev/null | sort | tail -1 || true); fi
[ -n "$file" ] || die "nenhum backup encontrado em $PG_BACKUP_DIR (rode: backup-postgres)"
[ -f "$file" ] || file="$PG_BACKUP_DIR/$file"
[ -f "$file" ] || die "arquivo não encontrado"

tmpdb=webag_restore_test
plain="/backups/.test-restore-$$.dump"
cleanup() { rm -f "$plain"; pg_admin -c "DROP DATABASE IF EXISTS $tmpdb WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "testando: $(basename "$file")"
decrypt_file "$file" "$plain" || die "não consegui decifrar (BACKUP_PASSPHRASE errada ou arquivo corrompido)"
pg_admin -c "DROP DATABASE IF EXISTS $tmpdb WITH (FORCE)"
pg_admin -c "CREATE DATABASE $tmpdb OWNER \"$POSTGRES_USER\""
pg pg_restore -h "${PGHOST:-postgres}" -U "$POSTGRES_USER" -d "$tmpdb" --no-owner --no-privileges --exit-on-error "$plain"

q() { db=$1; shift; pg psql -h "${PGHOST:-postgres}" -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1 -qAt -c "$@"; }
tables_live=$(q "$POSTGRES_DB" "select count(*) from pg_tables where schemaname='public'")
tables_back=$(q "$tmpdb" "select count(*) from pg_tables where schemaname='public'")
postgis=$(q "$tmpdb" "select postgis_version()") || die "PostGIS não veio na restauração"
[ "$tables_back" -gt 0 ] || die "o backup restaurou 0 tabelas"
[ "$tables_back" -eq "$tables_live" ] || die "tabelas no backup ($tables_back) diferem das do banco atual ($tables_live)"
log "tabelas: banco atual=$tables_live, restauradas=$tables_back; PostGIS $postgis"

log "contagem de linhas por tabela (atual x restaurada; o backup pode estar alguns registros atrás do banco vivo):"
q "$POSTGRES_DB" "select tablename from pg_tables where schemaname='public' order by 1" | while read -r t; do
  a=$(q "$POSTGRES_DB" "select count(*) from \"$t\"")
  b=$(q "$tmpdb" "select count(*) from \"$t\"")
  [ "$a" = "0" ] && [ "$b" = "0" ] && continue
  printf '  %-40s atual=%-8s restaurada=%s\n' "$t" "$a" "$b"
done
log "TESTE DE RESTAURAÇÃO OK (banco temporário será apagado)"
