CREATE TABLE "delivery_fee_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_fee_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"from_m" integer NOT NULL,
	"to_m" integer NOT NULL,
	"fee_cents" integer NOT NULL,
	"exchange_fee_cents" integer NOT NULL,
	"expected_cost_cents" integer DEFAULT 0 NOT NULL,
	"eta_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_fee_tables" ADD CONSTRAINT "delivery_fee_tables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_fee_tiers" ADD CONSTRAINT "delivery_fee_tiers_table_id_delivery_fee_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."delivery_fee_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_fee_tables_scope_version_uq" ON "delivery_fee_tables" USING btree ("scope_key","version");--> statement-breakpoint
CREATE INDEX "delivery_fee_tables_scope_idx" ON "delivery_fee_tables" USING btree ("scope_key","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_fee_tiers_position_uq" ON "delivery_fee_tiers" USING btree ("table_id","position");