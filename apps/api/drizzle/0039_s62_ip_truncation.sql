-- SEC-159 / DEC-050(b): na anonimização, o IP dos aceites e consentimentos é TRUNCADO (IPv4 /24, IPv6 /48), nunca apagado nem
-- trocado por outro valor. As duas tabelas seguem append-only: a ÚNICA mudança permitida é `ip` -> truncamento do próprio `ip`
-- (todas as outras colunas iguais). Qualquer outro UPDATE e todo DELETE continuam negados.
CREATE OR REPLACE FUNCTION webag_truncate_ip(raw text) RETURNS text AS $$
DECLARE
  addr inet;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  addr := raw::inet;
  RETURN host(network(set_masklen(addr, CASE family(addr) WHEN 4 THEN 24 ELSE 48 END)));
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION webag_allow_ip_truncation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'ip') = (to_jsonb(OLD) - 'ip')
     AND NEW.ip IS NOT DISTINCT FROM webag_truncate_ip(OLD.ip) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % é append-only: % não é permitido (só o truncamento do ip)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS terms_acceptances_append_only ON terms_acceptances;
--> statement-breakpoint
CREATE TRIGGER terms_acceptances_append_only BEFORE UPDATE OR DELETE ON terms_acceptances
  FOR EACH ROW EXECUTE FUNCTION webag_allow_ip_truncation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS consents_append_only ON consents;
--> statement-breakpoint
CREATE TRIGGER consents_append_only BEFORE UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION webag_allow_ip_truncation();
