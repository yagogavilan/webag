CREATE TABLE "push_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(60) NOT NULL,
	"body" varchar(120) NOT NULL,
	"destination" jsonb NOT NULL,
	"segment" jsonb NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"estimated_count" integer NOT NULL,
	"recipients_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"excluded_by_cap_count" integer DEFAULT 0 NOT NULL,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_campaign_recipients" ADD CONSTRAINT "push_campaign_recipients_campaign_id_push_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."push_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_campaign_recipients" ADD CONSTRAINT "push_campaign_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_campaigns" ADD CONSTRAINT "push_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_campaign_recipients_uq" ON "push_campaign_recipients" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "push_campaign_recipients_user_idx" ON "push_campaign_recipients" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "push_campaigns_due_idx" ON "push_campaigns" USING btree ("send_at") WHERE "push_campaigns"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "push_campaigns_created_idx" ON "push_campaigns" USING btree ("created_at");