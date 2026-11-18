#!/bin/sh
# Cria os buckets do Webag no S3 local (RustFS) e libera leitura anônima no bucket público.
# Executado pelo serviço `storage-init` do docker-compose.yml. Idempotente.
set -eu

echo "aguardando o storage..."
i=0
until aws s3api list-buckets >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "storage não respondeu em 60 s" >&2
    exit 1
  fi
  sleep 1
done

for bucket in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  if aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    echo "bucket $bucket já existe"
  else
    aws s3api create-bucket --bucket "$bucket" >/dev/null
    echo "bucket $bucket criado"
  fi
done

policy=$(printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}' "$PUBLIC_BUCKET")
aws s3api put-bucket-policy --bucket "$PUBLIC_BUCKET" --policy "$policy"
echo "leitura pública liberada em $PUBLIC_BUCKET; $PRIVATE_BUCKET continua privado"
