CREATE TABLE "user_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid,
	"suspended_store_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_alerts" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_alerts" ADD COLUMN "resolution_note" varchar(300);--> statement-breakpoint
ALTER TABLE "user_status_history" ADD CONSTRAINT "user_status_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_status_history" ADD CONSTRAINT "user_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_status_history_user_idx" ON "user_status_history" USING btree ("user_id","created_at");