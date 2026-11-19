ALTER TABLE "coupons" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "source_order_id" uuid;--> statement-breakpoint
ALTER TABLE "order_cancel_requests" ADD COLUMN "kind" text DEFAULT 'preparation' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "late_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_source_order_uq" ON "coupons" USING btree ("source_order_id") WHERE "coupons"."source_order_id" is not null;--> statement-breakpoint
CREATE INDEX "coupons_owner_idx" ON "coupons" USING btree ("owner_user_id") WHERE "coupons"."owner_user_id" is not null;