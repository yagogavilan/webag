# Imagem de backup: mesma versão do Postgres/PostGIS do banco (pg_dump e pg_restore compatíveis) + cron (busybox crond),
# openssl (cifra), aws-cli (envio para S3/R2) e curl (aviso de monitoramento). Contexto de build: infra/backup.
ARG POSTGIS_IMAGE=postgis/postgis:18-3.6-alpine
FROM ${POSTGIS_IMAGE}
RUN apk add --no-cache aws-cli openssl curl tzdata
COPY lib.sh /usr/local/lib/webag-backup.sh
COPY entrypoint.sh /usr/local/bin/backup-entrypoint
COPY backup-all.sh /usr/local/bin/backup-all
COPY backup-postgres.sh /usr/local/bin/backup-postgres
COPY backup-storage.sh /usr/local/bin/backup-storage
COPY restore-postgres.sh /usr/local/bin/restore-postgres
COPY test-restore.sh /usr/local/bin/test-restore
COPY backup-list.sh /usr/local/bin/backup-list
COPY backup-fetch.sh /usr/local/bin/backup-fetch
RUN chmod 0755 /usr/local/bin/backup-* /usr/local/bin/restore-postgres /usr/local/bin/test-restore \
 && mkdir -p /backups && chmod 0700 /backups
VOLUME /backups
ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
CMD ["crond"]
