-- Tabelas append-only (SEC-041, SEC-074, WB-123 C3): UPDATE, DELETE e TRUNCATE são negados a qualquer role,
-- inclusive a da aplicação e donos. Correção de dado = novo registro, nunca edição.
CREATE OR REPLACE FUNCTION webag_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tabela % é append-only: % não é permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION webag_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER parameter_history_append_only BEFORE UPDATE OR DELETE ON parameter_history
  FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER terms_acceptances_append_only BEFORE UPDATE OR DELETE ON terms_acceptances
  FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER consents_append_only BEFORE UPDATE OR DELETE ON consents
  FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER payment_refunds_append_only BEFORE UPDATE OR DELETE ON payment_refunds
  FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER legal_documents_immutable BEFORE UPDATE OR DELETE ON legal_documents
  FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();
