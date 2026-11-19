-- SEC-173: `terms_acceptances.platform` guardava o user agent inteiro (modelo do aparelho, versão do sistema). Depois da anonimização ele
-- ajudava a reidentificar a pessoa junto com o IP /24 e a data. Daqui para a frente grava só a família (`ios`, `android` ou `web`) e a versão
-- do app; para as linhas existentes, a anonimização reduz o valor à família. As tabelas seguem append-only: o trigger admite o truncamento
-- do `ip` e a redução do `platform` à família do PRÓPRIO valor, e nada mais.
CREATE OR REPLACE FUNCTION webag_platform_family(raw text) RETURNS text AS $$
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  IF raw ~ '^(ios|android|web)(;[0-9][0-9A-Za-z.+-]{0,19})?$' THEN
    RETURN raw;
  END IF;
  IF raw ~* '(iphone|ipad|ipod|ios|cfnetwork|darwin)' THEN
    RETURN 'ios';
  END IF;
  IF raw ~* 'android|okhttp|dalvik' THEN
    RETURN 'android';
  END IF;
  RETURN 'web';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION webag_allow_ip_truncation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'ip' - 'platform') = (to_jsonb(OLD) - 'ip' - 'platform')
     AND NEW.ip IS NOT DISTINCT FROM webag_truncate_ip(OLD.ip)
     AND (to_jsonb(NEW)->>'platform') IS NOT DISTINCT FROM webag_platform_family(to_jsonb(OLD)->>'platform') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % é append-only: % não é permitido (só o truncamento do ip e a redução do platform à família)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
