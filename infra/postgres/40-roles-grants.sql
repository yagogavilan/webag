-- D-06 (ADR-018 D9, tech-lead B4). Rodar COMO SUPERUSUÁRIO no banco da aplicação, depois de criar os papéis (30-roles-create.sh).
-- Idempotente. Na 1ª inicialização do volume roda sozinho (initdb); num cluster que já existe, rode à mão ANTES de trocar a
-- DATABASE_URL da API (guia de deploy, "Papéis do banco"). Os privilégios do `webag_app` sobre as tabelas NÃO estão aqui: o job
-- `migrate` os reafirma a cada execução (apps/api/src/platform/database/app-grants.ts), porque as tabelas nascem nas migrações.
--
-- 1) Extensões. Exigem superusuário (PostGIS não é "trusted"); as migrações 0005 e 0010 usam IF NOT EXISTS e viram no-op, então
--    o `webag_migrator` (sem superusuário) consegue migrar do zero.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Posse. O dono é quem pode `DISABLE TRIGGER`, `ALTER` e `DROP`; a API deixa de ser dona de qualquer coisa. Objetos de extensão
--    (spatial_ref_sys etc.) ficam como estão. Sequências ligadas a coluna mudam de dono junto com a tabela.
DO $do$
DECLARE
  r record;
  migrator oid := (SELECT oid FROM pg_roles WHERE rolname = 'webag_migrator');
BEGIN
  IF migrator IS NULL THEN RAISE EXCEPTION 'papel webag_migrator inexistente: rode 30-roles-create.sh antes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_app') THEN RAISE EXCEPTION 'papel webag_app inexistente: rode 30-roles-create.sh antes'; END IF;
  EXECUTE format('ALTER DATABASE %I OWNER TO webag_migrator', current_database());
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN ALTER SCHEMA drizzle OWNER TO webag_migrator; END IF;
  FOR r IN
    SELECT c.oid::regclass AS obj, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND c.relowner <> migrator
       AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
       AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
     ORDER BY (c.relkind = 'S')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO webag_migrator',
      CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.obj);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS fn, p.prokind
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') AND p.proowner <> migrator
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO webag_migrator', CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.fn);
  END LOOP;
END
$do$;

-- 3) Acesso. A API conecta e usa o esquema; não cria nada, não é dona de nada e não é superusuária (ALTER ROLE abaixo reafirma).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO webag_app;
DO $do$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO webag_app, webag_migrator', current_database());
END
$do$;
ALTER ROLE webag_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE webag_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Migração que espera bloqueio por mais de 10 s falha em vez de travar a loja (reexecute em horário calmo).
ALTER ROLE webag_migrator SET lock_timeout = '10s';
