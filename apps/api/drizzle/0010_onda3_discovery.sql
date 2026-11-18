CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid,
	"product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_one_target" CHECK (("favorites"."store_id" is null) <> ("favorites"."product_id" is null))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"rating" smallint NOT NULL,
	"comment" varchar(500),
	"store_reply" varchar(500),
	"store_replied_at" timestamp with time zone,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "search_history" (
	"user_id" uuid NOT NULL,
	"term_key" varchar(80) NOT NULL,
	"term" varchar(80) NOT NULL,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_history_user_id_term_key_pk" PRIMARY KEY("user_id","term_key")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_store_uq" ON "favorites" USING btree ("user_id","store_id") WHERE "favorites"."store_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_product_uq" ON "favorites" USING btree ("user_id","product_id") WHERE "favorites"."product_id" is not null;--> statement-breakpoint
CREATE INDEX "favorites_user_idx" ON "favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_store_idx" ON "reviews" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "search_history_user_idx" ON "search_history" USING btree ("user_id","searched_at");--> statement-breakpoint
-- Busca sem acento e tolerante a 1 erro de digitação (WB-013 C1): extensões do contrib e wrapper IMUTÁVEL de unaccent
-- (o `unaccent` padrão é STABLE e não pode entrar em índice). Índices GIN trigram sobre o nome normalizado.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION f_norm(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent', $1)) $$;--> statement-breakpoint
CREATE INDEX "products_name_trgm" ON "products" USING gin (f_norm("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "stores_name_trgm" ON "stores" USING gin (f_norm("name") gin_trgm_ops);--> statement-breakpoint
-- Ofertas e vitrine: produtos ativos por loja.
CREATE INDEX "products_active_store_idx" ON "products" USING btree ("store_id") WHERE "status" = 'active';
