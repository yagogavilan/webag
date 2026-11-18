# Funções comuns dos scripts de backup (importado com `. /usr/local/lib/webag-backup.sh`). POSIX sh (busybox ash).
log() { printf '[backup] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERRO: $*" >&2; exit 1; }

PG_BACKUP_DIR=/backups/postgres
STORAGE_MIRROR_DIR=/backups/storage

pg() { PGPASSWORD="$POSTGRES_PASSWORD" "$@"; }
pg_admin() { pg psql -h "${PGHOST:-postgres}" -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

# Cópia fora do servidor ligada?
remote_enabled() { [ -n "${BACKUP_S3_BUCKET:-}" ] && [ -n "${BACKUP_S3_ENDPOINT:-}" ] && [ -n "${BACKUP_S3_ACCESS_KEY:-}" ] && [ -n "${BACKUP_S3_SECRET_KEY:-}" ]; }

# aws-cli contra o bucket de backup (credencial própria). As variáveis "when_required" evitam erro de checksum no Cloudflare R2.
dest_aws() {
  AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
  AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}" AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  AWS_RESPONSE_CHECKSUM_VALIDATION=when_required aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"
}

# aws-cli contra o armazenamento de arquivos do próprio servidor (RustFS), com a credencial da aplicação.
src_aws() {
  AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
  aws --endpoint-url "$STORAGE_BACKUP_ENDPOINT" "$@"
}

# Decifra $1 para $2 com BACKUP_PASSPHRASE.
decrypt_file() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$1" -out "$2"; }

# Apaga na nuvem os backups mais antigos que $2 dias, no prefixo $1 (nome com carimbo AAAAMMDDTHHMMSSZ). Só chamado após sucesso.
prune_remote() {
  prefix=$1; days=$2
  cutoff=$(date -u -d "@$(( $(date +%s) - days * 86400 ))" +%Y%m%d%H%M%S)
  dest_aws s3 ls "s3://$BACKUP_S3_BUCKET/$prefix/" 2>/dev/null | awk '{print $4}' | grep -E '^webag-pg-[0-9]{8}T[0-9]{6}Z\.dump\.enc$' | while read -r name; do
    stamp=${name#webag-pg-}; stamp=${stamp%.dump.enc}
    n=$(printf '%s' "$stamp" | tr -d 'TZ')
    if [ "$n" -lt "$cutoff" ]; then
      dest_aws s3 rm "s3://$BACKUP_S3_BUCKET/$prefix/$name" --only-show-errors && log "removido da nuvem (retenção de $days dias): $name"
    fi
  done
}
