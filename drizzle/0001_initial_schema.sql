CREATE TYPE "public"."situation_phase" AS ENUM('active', 'easing', 'quiet', 'ended');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"parent_id" uuid,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "event_items" (
	"event_id" uuid NOT NULL,
	"source_item_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_items_event_id_source_item_id_pk" PRIMARY KEY("event_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "event_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"cause_item_id" uuid,
	"cause_note" text,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_versions_event_id_version_unique" UNIQUE("event_id","version")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"occurred_on" date,
	"last_item_at" timestamp with time zone,
	"category_id" uuid,
	"merged_into_id" uuid,
	"embedding" vector,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "involvements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "involvements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"situation_id" uuid NOT NULL,
	"country_key" text NOT NULL,
	"role" text NOT NULL,
	"joined_on" date DEFAULT current_date NOT NULL,
	"left_on" date,
	"joined_cause_item_id" uuid,
	"left_cause_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"region" text NOT NULL,
	"owner_type" text NOT NULL,
	"language" text NOT NULL,
	"format" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_of_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"situation_id" uuid NOT NULL,
	"parent_situation_id" uuid,
	"theme_id" uuid,
	"cause_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_of_links_one_target" CHECK (("part_of_links"."parent_situation_id" is not null) <> ("part_of_links"."theme_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "situation_events" (
	"situation_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "situation_events_situation_id_event_id_pk" PRIMARY KEY("situation_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "situation_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "situation_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"situation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"cause_item_id" uuid,
	"cause_note" text,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "situation_versions_situation_id_version_unique" UNIQUE("situation_id","version")
);
--> statement-breakpoint
CREATE TABLE "situations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"phase" "situation_phase" DEFAULT 'active' NOT NULL,
	"phase_since" timestamp with time zone DEFAULT now() NOT NULL,
	"started_on" date,
	"ended_on" date,
	"last_event_at" timestamp with time zone,
	"merged_into_id" uuid,
	"embedding" vector,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" text NOT NULL,
	"url" text NOT NULL,
	"headline" text NOT NULL,
	"blurb" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"fetched_text" text,
	"article_text" text,
	"language" text,
	"embedding" vector,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_items_outlet_id_url_unique" UNIQUE("outlet_id","url")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "themes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_merged_into_id_categories_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_items" ADD CONSTRAINT "event_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_items" ADD CONSTRAINT "event_items_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_versions" ADD CONSTRAINT "event_versions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_versions" ADD CONSTRAINT "event_versions_cause_item_id_source_items_id_fk" FOREIGN KEY ("cause_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_merged_into_id_events_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "involvements" ADD CONSTRAINT "involvements_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "involvements" ADD CONSTRAINT "involvements_joined_cause_item_id_source_items_id_fk" FOREIGN KEY ("joined_cause_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "involvements" ADD CONSTRAINT "involvements_left_cause_item_id_source_items_id_fk" FOREIGN KEY ("left_cause_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_of_links" ADD CONSTRAINT "part_of_links_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_of_links" ADD CONSTRAINT "part_of_links_parent_situation_id_situations_id_fk" FOREIGN KEY ("parent_situation_id") REFERENCES "public"."situations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_of_links" ADD CONSTRAINT "part_of_links_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_of_links" ADD CONSTRAINT "part_of_links_cause_item_id_source_items_id_fk" FOREIGN KEY ("cause_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situation_events" ADD CONSTRAINT "situation_events_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situation_events" ADD CONSTRAINT "situation_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situation_versions" ADD CONSTRAINT "situation_versions_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situation_versions" ADD CONSTRAINT "situation_versions_cause_item_id_source_items_id_fk" FOREIGN KEY ("cause_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situations" ADD CONSTRAINT "situations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situations" ADD CONSTRAINT "situations_merged_into_id_situations_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."situations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "involvements_situation_id_idx" ON "involvements" USING btree ("situation_id");