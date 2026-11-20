-- I6: um documento vigente por (loja, tipo). Antes de criar o índice, aposenta duplicatas antigas (mantém a mais recente).
UPDATE "store_documents" d SET "superseded_at" = now()
WHERE d."superseded_at" IS NULL AND EXISTS (
	SELECT 1 FROM "store_documents" n
	WHERE n."store_id" = d."store_id" AND n."kind" = d."kind" AND n."superseded_at" IS NULL
	AND (n."created_at", n."id") > (d."created_at", d."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "store_documents_current_uq" ON "store_documents" USING btree ("store_id","kind") WHERE "store_documents"."superseded_at" is null;
