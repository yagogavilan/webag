CREATE TABLE "product_creation_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"via" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_photo_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"photos_count" smallint,
	"variations_count" smallint
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "template" jsonb;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description_min_chars" smallint DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "via" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "duplicated_from" uuid;--> statement-breakpoint
ALTER TABLE "product_creation_metrics" ADD CONSTRAINT "product_creation_metrics_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_creation_metrics" ADD CONSTRAINT "product_creation_metrics_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_creation_metrics_product_uq" ON "product_creation_metrics" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_creation_metrics_published_idx" ON "product_creation_metrics" USING btree ("published_at") WHERE "product_creation_metrics"."published_at" is not null;--> statement-breakpoint
CREATE INDEX "product_creation_metrics_store_idx" ON "product_creation_metrics" USING btree ("store_id","published_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_store_drafts_idx" ON "products" USING btree ("store_id","updated_at") WHERE "products"."status" = 'draft';--> statement-breakpoint
-- I9 (ADR-018 D1): CHECK como NOT VALID e depois VALIDATE (a ordem segura em tabela viva; aqui roda na mesma transação do migrate).
-- Reversão: DROP CONSTRAINT dos três CHECKs e das colunas novas; nenhuma linha existente é alterada (colunas novas nulas ou com default constante).
ALTER TABLE "products" ADD CONSTRAINT "products_name_len" CHECK ("products"."status" = 'draft' or char_length("products"."name") between 2 and 80) NOT VALID;--> statement-breakpoint
-- Checagem prévia (QA r1-1/r1-2): produto NÃO rascunho com nome fora de 2 a 80 caracteres (legado) faria o VALIDATE falhar e desfaria a migração inteira, derrubando o deploy.
-- Se houver, a migração NÃO falha: avisa com a contagem e deixa o CHECK como NOT VALID (vale para toda escrita nova, não varre o legado). Saneie o legado e valide depois: docs/deploy/guia-deploy.md §16.
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM "products" WHERE "status" <> 'draft' AND char_length("name") NOT BETWEEN 2 AND 80;
  IF bad = 0 THEN
    ALTER TABLE "products" VALIDATE CONSTRAINT "products_name_len";
  ELSE
    RAISE WARNING 'products_name_len ficou NOT VALID: % produto(s) nao rascunho com nome fora de 2 a 80 caracteres. Veja docs/deploy/guia-deploy.md secao 16.', bad;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_version_positive" CHECK ("products"."version" >= 1);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_via_valid" CHECK ("products"."via" is null or "products"."via" in ('camera', 'duplicate', 'paste', 'spreadsheet', 'form'));