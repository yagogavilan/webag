#!/bin/sh
# Backup dos arquivos (fotos e documentos): espelha os dois buckets do armazenamento do servidor em /backups/storage e
# sincroniza esse espelho com o bucket de backup. Com R2/S3 como armazenamento principal, ligue o versionamento no
# provedor e defina STORAGE_BACKUP_ENABLED=false (veja o guia).
set -eu
. /usr/local/lib/webag-backup.sh
if [ "${STORAGE_BACKUP_ENABLED:-true}" != "true" ]; then log "backup de arquivos desligado (STORAGE_BACKUP_ENABLED)"; exit 0; fi
if ! getent hosts storage >/dev/null 2>&1; then log "serviço 'storage' não existe neste ambiente: pulando backup de arquivos"; exit 0; fi

for bucket in "$S3_BUCKET_PUBLIC" "$S3_BUCKET_PRIVATE"; do
  mirror="$STORAGE_MIRROR_DIR/$bucket"
  mkdir -p "$mirror"
  count=$(src_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l) || count=0
  local_files=$(find "$mirror" -type f | wc -l)
  # Trava: origem vazia com espelho cheio indica falha (credencial errada, serviço reiniciando), não "apagaram tudo".
  if [ "$count" -eq 0 ] && [ "$local_files" -gt 0 ]; then die "o bucket $bucket parece vazio mas o espelho tem $local_files arquivos; não vou apagar o espelho. Investigue."; fi
  # --delete: arquivo apagado na origem sai do espelho (necessário para a exclusão de dados pessoais, LGPD, valer também no backup).
  src_aws s3 sync "s3://$bucket" "$mirror" --delete --only-show-errors
  log "espelho de $bucket: $(find "$mirror" -type f | wc -l) arquivos"
done

if remote_enabled; then
  dest_aws s3 sync "$STORAGE_MIRROR_DIR" "s3://$BACKUP_S3_BUCKET/storage/" --delete --only-show-errors || die "falha ao enviar os arquivos para a nuvem"
  log "arquivos sincronizados em s3://$BACKUP_S3_BUCKET/storage/"
fi
log "backup dos arquivos concluído"
