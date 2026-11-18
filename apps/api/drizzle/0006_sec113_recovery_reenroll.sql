ALTER TABLE "admin_profiles" ADD COLUMN "totp_reenroll_required_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD COLUMN "totp_setup_deadline_at" timestamp with time zone DEFAULT now() + interval '48 hours' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mfa_factor" text;