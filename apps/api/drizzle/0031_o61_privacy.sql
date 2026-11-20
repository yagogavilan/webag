CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"via" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"summary" jsonb,
	"store_id" uuid,
	"store_previous_status" text,
	"last_error" text,
	"failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_export_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"object_key" text,
	"size_bytes" integer,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"download_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"note" varchar(1000),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol" varchar(16) NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"user_id" uuid,
	"requester_email" text NOT NULL,
	"message" varchar(1000),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"alerted_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"answered_by" uuid,
	"answer" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_links" ADD CONSTRAINT "data_export_links_export_id_data_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."data_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request_events" ADD CONSTRAINT "privacy_request_events_request_id_privacy_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."privacy_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request_events" ADD CONSTRAINT "privacy_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_pending_uq" ON "account_deletions" USING btree ("user_id") WHERE "account_deletions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "account_deletions_due_idx" ON "account_deletions" USING btree ("effective_at") WHERE "account_deletions"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "data_export_links_token_uq" ON "data_export_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "data_export_links_export_idx" ON "data_export_links" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "data_exports_user_idx" ON "data_exports" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_exports_open_uq" ON "data_exports" USING btree ("user_id") WHERE "data_exports"."status" in ('queued','processing');--> statement-breakpoint
CREATE INDEX "data_exports_queue_idx" ON "data_exports" USING btree ("requested_at") WHERE "data_exports"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "privacy_request_events_request_idx" ON "privacy_request_events" USING btree ("request_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_protocol_uq" ON "privacy_requests" USING btree ("protocol");--> statement-breakpoint
CREATE INDEX "privacy_requests_due_idx" ON "privacy_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_user_idx" ON "privacy_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "retention_runs_started_idx" ON "retention_runs" USING btree ("started_at");