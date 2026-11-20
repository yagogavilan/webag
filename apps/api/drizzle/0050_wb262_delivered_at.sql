ALTER TABLE "deliveries" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
-- Corridas já entregues: a hora real é a do clique (a do evento), para o relatório não perder o histórico.
UPDATE "deliveries" d SET "delivered_at" = (SELECT min(e."created_at") FROM "delivery_events" e WHERE e."delivery_id" = d."id" AND e."to_status" = 'delivered') WHERE d."status" = 'delivered' AND d."delivered_at" IS NULL;
