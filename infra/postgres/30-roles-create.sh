#!/bin/sh
# D-06 (ADR-018 D9, tech-lead B4): cria os papéis do banco. Roda como superusuário na 1ª inicialização do volume (a imagem executa
# /docker-entrypoint-initdb.d em ordem) e pode ser repetido à mão num cluster que já existe (guia de deploy, "Papéis do banco").
#   webag_migrator  dono do banco e de todas as tabelas; usado SÓ pelo job `migrate` (MIGRATION_DATABASE_URL)
#   webag_app       usado pela API (DATABASE_URL): sem superusuário, sem DDL, sem posse; privilégios em app-grants.ts
# Idempotente: repetir só troca as senhas (rotação). As senhas vêm do ambiente do contêiner, nunca do repositório.
set -eu
: "${WEBAG_MIGRATOR_PASSWORD:?defina WEBAG_MIGRATOR_PASSWORD}"
: "${WEBAG_APP_PASSWORD:?defina WEBAG_APP_PASSWORD}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v migrator_pw="$WEBAG_MIGRATOR_PASSWORD" -v app_pw="$WEBAG_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE webag_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'migrator_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_migrator') \gexec
SELECT format('CREATE ROLE webag_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_app') \gexec
SELECT format('ALTER ROLE webag_migrator PASSWORD %L', :'migrator_pw') \gexec
SELECT format('ALTER ROLE webag_app PASSWORD %L', :'app_pw') \gexec
SQL
