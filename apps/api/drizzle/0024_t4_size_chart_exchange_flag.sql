ALTER TABLE "products" ADD COLUMN "size_chart" varchar(2000);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "no_voluntary_exchange" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "fit" text;