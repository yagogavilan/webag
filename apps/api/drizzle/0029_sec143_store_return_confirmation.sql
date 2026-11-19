ALTER TABLE "deliveries" ADD COLUMN "store_return_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "store_return_confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "store_return_confirmed_via" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_store_return_confirmed_by_users_id_fk" FOREIGN KEY ("store_return_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;