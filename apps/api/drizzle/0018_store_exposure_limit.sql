ALTER TABLE "stores" ADD COLUMN "exposure_limit_mode" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "exposure_limit_max_cents" integer;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "exposure_limit_reason" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "exposure_limit_set_by" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "exposure_limit_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_exposure_limit_set_by_users_id_fk" FOREIGN KEY ("exposure_limit_set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;