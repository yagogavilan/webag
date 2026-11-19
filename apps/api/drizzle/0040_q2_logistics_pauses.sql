CREATE TABLE "logistics_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid,
	"reason" text NOT NULL,
	"paused_by" uuid,
	"paused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_at" timestamp with time zone,
	"resumed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "logistics_pauses" ADD CONSTRAINT "logistics_pauses_paused_by_users_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_pauses" ADD CONSTRAINT "logistics_pauses_resumed_by_users_id_fk" FOREIGN KEY ("resumed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_pauses_open_uq" ON "logistics_pauses" USING btree (coalesce("city_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "logistics_pauses"."resumed_at" is null;