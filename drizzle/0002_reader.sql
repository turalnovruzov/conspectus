CREATE TABLE "fetch_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid,
	"outlet_id" text NOT NULL,
	"url" text NOT NULL,
	"ok" boolean NOT NULL,
	"http_status" integer,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"ms" integer,
	"error" text,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"cost_source" text NOT NULL,
	"generation_id" text,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"sim_day" date,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"ceiling_usd" numeric(10, 4) NOT NULL,
	"spent_usd" numeric(12, 8) DEFAULT '0' NOT NULL,
	"key_before" jsonb,
	"key_after" jsonb,
	"chat_model" text,
	"embedding_model" text,
	"report" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "embedding" vector;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "involvements" ADD COLUMN "entry" text DEFAULT 'pulled_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "owner_detail" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "owner_source" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "hosts" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "oldest_item_seen" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "situations" ADD COLUMN "one_line" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "situations" ADD COLUMN "scope" text DEFAULT 'ongoing' NOT NULL;--> statement-breakpoint
ALTER TABLE "situations" ADD COLUMN "major" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "situations" ADD COLUMN "resolution_signal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "first_run_id" uuid;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "state" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "unsure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "extraction" jsonb;--> statement-breakpoint
ALTER TABLE "source_items" ADD COLUMN "cited_url" text;--> statement-breakpoint
ALTER TABLE "fetch_log" ADD CONSTRAINT "fetch_log_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_log" ADD CONSTRAINT "fetch_log_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_first_run_id_runs_id_fk" FOREIGN KEY ("first_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;