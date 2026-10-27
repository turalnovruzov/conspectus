ALTER TABLE "part_of_links" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "situations" ADD COLUMN "summarized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "embedding" vector;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "part_of_links" ADD CONSTRAINT "part_of_links_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_of_links" ADD CONSTRAINT "part_of_links_once" UNIQUE NULLS NOT DISTINCT("situation_id","parent_situation_id","theme_id");--> statement-breakpoint
-- Situations summarized before this column existed count as summarized at their last update, so the first run after it does not re-summarize them all.
UPDATE "situations" SET "summarized_at" = "updated_at" WHERE "summary" <> '';
