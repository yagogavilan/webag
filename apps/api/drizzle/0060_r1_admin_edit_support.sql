CREATE TABLE "admin_view_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"admin_session_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"reason_note" varchar(200),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_cause" text
);
--> statement-breakpoint
CREATE TABLE "store_admin_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"audit_id" bigint,
	"type" text NOT NULL,
	"target" text,
	"summary" text NOT NULL,
	"reason_label" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_change_digest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"change_id" bigint NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_view_sessions" ADD CONSTRAINT "admin_view_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_view_sessions" ADD CONSTRAINT "admin_view_sessions_admin_session_id_sessions_id_fk" FOREIGN KEY ("admin_session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_admin_changes" ADD CONSTRAINT "store_admin_changes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_change_digest" ADD CONSTRAINT "store_change_digest_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_change_digest" ADD CONSTRAINT "store_change_digest_change_id_store_admin_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."store_admin_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_view_sessions_token_hash_uq" ON "admin_view_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_view_sessions_one_open_per_admin_uq" ON "admin_view_sessions" USING btree ("admin_user_id") WHERE "admin_view_sessions"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "admin_view_sessions_open_expiry_idx" ON "admin_view_sessions" USING btree ("expires_at") WHERE "admin_view_sessions"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "admin_view_sessions_admin_idx" ON "admin_view_sessions" USING btree ("admin_user_id","opened_at");--> statement-breakpoint
CREATE INDEX "store_admin_changes_store_at_idx" ON "store_admin_changes" USING btree ("store_id","at");--> statement-breakpoint
CREATE INDEX "store_change_digest_pending_idx" ON "store_change_digest" USING btree ("store_id","created_at") WHERE "store_change_digest"."sent_at" is null;