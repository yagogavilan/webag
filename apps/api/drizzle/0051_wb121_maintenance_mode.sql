CREATE TABLE "maintenance_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"message" varchar(200),
	"expected_back_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "maintenance_state_singleton_chk" CHECK ("maintenance_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "maintenance_state" ADD CONSTRAINT "maintenance_state_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;