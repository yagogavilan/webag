CREATE TABLE "auth_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"email_verified_at" timestamp with time zone,
	"mfa_verified_at" timestamp with time zone,
	"mfa_kind" text,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD COLUMN "totp_setup_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD COLUMN "totp_setup_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_tickets" ADD CONSTRAINT "auth_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tickets_token_uq" ON "auth_tickets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tickets_user_idx" ON "auth_tickets" USING btree ("user_id","kind");