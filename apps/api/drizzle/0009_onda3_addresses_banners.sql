CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"cep" varchar(8) NOT NULL,
	"street" varchar(120) NOT NULL,
	"number" varchar(20) NOT NULL,
	"complement" varchar(80),
	"neighborhood" varchar(80) NOT NULL,
	"city_name" varchar(80) NOT NULL,
	"state" varchar(2) DEFAULT 'SP' NOT NULL,
	"city_id" uuid,
	"neighborhood_id" uuid,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(80) NOT NULL,
	"image_asset_id" uuid NOT NULL,
	"city_id" uuid,
	"destination_type" text DEFAULT 'none' NOT NULL,
	"destination_id" uuid,
	"destination_code" varchar(20),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banners_period" CHECK ("banners"."ends_at" > "banners"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_addresses_user_idx" ON "user_addresses" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_default_uq" ON "user_addresses" USING btree ("user_id") WHERE "user_addresses"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_dedupe_uq" ON "user_addresses" USING btree ("user_id","cep",lower("number"),lower(coalesce("complement", '')));--> statement-breakpoint
CREATE INDEX "banners_active_idx" ON "banners" USING btree ("active","starts_at","ends_at");--> statement-breakpoint
-- Coluna geográfica GERADA a partir de lat/lng (fonte única) + índice GiST para ST_DWithin (ADR-008, Onda 3).
ALTER TABLE "user_addresses" ADD COLUMN "location" geography(Point,4326) GENERATED ALWAYS AS (
  ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography
) STORED;--> statement-breakpoint
CREATE INDEX "user_addresses_location_gist" ON "user_addresses" USING gist ("location");--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_coords_range" CHECK ("lat" between -90 and 90 and "lng" between -180 and 180);
