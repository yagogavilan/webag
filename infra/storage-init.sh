#!/bin/sh
# Cria os buckets do Webag no S3 local (RustFS), libera leitura anônima no bucket público e aplica CORS nos dois (BUG-025).
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

# BUG-025: o upload de foto e documento pelo navegador é um POST de formulário assinado direto ao bucket (presigned POST); sem CORS o
# navegador bloqueia a preflight e o envio nunca conclui. Origens = CORS_ORIGINS (o mesmo valor da API) + as portas dos painéis em dev.
# O app nativo não passa por CORS. Em produção o equivalente é o CORS do bucket do provedor (guia de deploy, seção do armazenamento).
origins="${CORS_ORIGINS:-http://localhost:3001,http://localhost:3101,http://localhost:8081}"
json_origins=$(printf '%s' "$origins" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd, -)
cors=$(printf '{"CORSRules":[{"AllowedOrigins":[%s],"AllowedMethods":["GET","PUT","POST","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]}' "$json_origins")
for bucket in "$PUBLIC_BUCKET" "$PRIVATE_BUCKET"; do
  aws s3api put-bucket-cors --bucket "$bucket" --cors-configuration "$cors"
  echo "CORS aplicado em $bucket para: $origins"
done
