import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  bigint,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// No dimension yet: the embedding model is chosen in step 2 of #7, while the tables are empty.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector',
  toDriver: (value) => `[${value.join(',')}]`,
  fromDriver: (value) => value.slice(1, -1).split(',').map(Number),
})

const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const ts = (name: string) => timestamp(name, { withTimezone: true })

export const outlets = pgTable('outlets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  region: text('region').notNull(),
  ownerType: text('owner_type').notNull(),
  language: text('language').notNull(),
  format: text('format').notNull(),
  active: boolean('active').default(true),
  ownerDetail: text('owner_detail'),
  ownerSource: text('owner_source'),
  hosts: text('hosts').array().notNull().default(sql`'{}'::text[]`),
  oldestItemSeen: ts('oldest_item_seen'),
  createdAt: createdAt(),
})

export const runs = pgTable('runs', {
  id: id(),
  kind: text('kind').notNull(),
  simDay: date('sim_day'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: ts('finished_at'),
  status: text('status').notNull().default('running'),
  ceilingUsd: numeric('ceiling_usd', { precision: 10, scale: 4 }).notNull(),
  spentUsd: numeric('spent_usd', { precision: 12, scale: 8 }).notNull().default('0'),
  keyBefore: jsonb('key_before'),
  keyAfter: jsonb('key_after'),
  chatModel: text('chat_model'),
  embeddingModel: text('embedding_model'),
  report: jsonb('report'),
  error: text('error'),
})

export const sourceItems = pgTable(
  'source_items',
  {
    id: id(),
    outletId: text('outlet_id')
      .notNull()
      .references(() => outlets.id),
    url: text('url').notNull(),
    headline: text('headline').notNull(),
    blurb: text('blurb'),
    publishedAt: ts('published_at'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
    fetchedText: text('fetched_text'),
    articleText: text('article_text'),
    language: text('language'),
    embedding: vector('embedding'),
    embeddingModel: text('embedding_model'),
    firstRunId: uuid('first_run_id').references(() => runs.id),
    state: text('state').notNull().default('new'),
    unsureCount: integer('unsure_count').notNull().default(0),
    skipReason: text('skip_reason'),
    extraction: jsonb('extraction'),
    citedUrl: text('cited_url'),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.outletId, t.url)],
)

export const llmCalls = pgTable('llm_calls', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: uuid('run_id').references(() => runs.id),
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 8 }).notNull().default('0'),
  costSource: text('cost_source').notNull(),
  generationId: text('generation_id'),
  ok: boolean('ok').notNull(),
  error: text('error'),
  createdAt: createdAt(),
})

export const fetchLog = pgTable('fetch_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: uuid('run_id').references(() => runs.id),
  outletId: text('outlet_id')
    .notNull()
    .references(() => outlets.id),
  url: text('url').notNull(),
  ok: boolean('ok').notNull(),
  httpStatus: integer('http_status'),
  itemsSeen: integer('items_seen').notNull().default(0),
  itemsNew: integer('items_new').notNull().default(0),
  ms: integer('ms'),
  error: text('error'),
  startedAt: ts('started_at'),
  createdAt: createdAt(),
})

export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull().unique(),
  definition: text('definition').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
  mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => categories.id),
  embedding: vector('embedding'),
  embeddingModel: text('embedding_model'),
  createdAt: createdAt(),
})

export const themes = pgTable('themes', {
  id: id(),
  name: text('name').notNull().unique(),
  definition: text('definition').notNull(),
  embedding: vector('embedding'),
  embeddingModel: text('embedding_model'),
  createdAt: createdAt(),
})

export const events = pgTable('events', {
  id: id(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  occurredOn: date('occurred_on'),
  lastItemAt: ts('last_item_at'),
  categoryId: uuid('category_id').references(() => categories.id),
  mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => events.id),
  embedding: vector('embedding'),
  embeddingModel: text('embedding_model'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const situationPhase = pgEnum('situation_phase', ['active', 'easing', 'quiet', 'ended'])

export const situations = pgTable('situations', {
  id: id(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  categoryId: uuid('category_id').references(() => categories.id),
  phase: situationPhase('phase').notNull().default('active'),
  phaseSince: timestamp('phase_since', { withTimezone: true }).notNull().defaultNow(),
  startedOn: date('started_on'),
  endedOn: date('ended_on'),
  lastEventAt: ts('last_event_at'),
  mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => situations.id),
  embedding: vector('embedding'),
  embeddingModel: text('embedding_model'),
  oneLine: text('one_line').notNull().default(''),
  scope: text('scope').notNull().default('ongoing'),
  major: boolean('major').notNull().default(false),
  resolutionSignalAt: ts('resolution_signal_at'),
  /** The run clock of the last summary; items attached after it are what the next summary folds in. */
  summarizedAt: ts('summarized_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const eventItems = pgTable(
  'event_items',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sourceItemId: uuid('source_item_id')
      .notNull()
      .references(() => sourceItems.id, { onDelete: 'cascade' }),
    attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.sourceItemId] })],
)

export const situationEvents = pgTable(
  'situation_events',
  {
    situationId: uuid('situation_id')
      .notNull()
      .references(() => situations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.situationId, t.eventId] })],
)

export const involvements = pgTable(
  'involvements',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    situationId: uuid('situation_id')
      .notNull()
      .references(() => situations.id, { onDelete: 'cascade' }),
    countryKey: text('country_key').notNull(),
    role: text('role').notNull(),
    joinedOn: date('joined_on').notNull().default(sql`current_date`),
    leftOn: date('left_on'),
    joinedCauseItemId: uuid('joined_cause_item_id').references(() => sourceItems.id),
    leftCauseItemId: uuid('left_cause_item_id').references(() => sourceItems.id),
    entry: text('entry').notNull().default('pulled_in'),
    createdAt: createdAt(),
  },
  (t) => [index('involvements_situation_id_idx').on(t.situationId)],
)

export const situationVersions = pgTable(
  'situation_versions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    situationId: uuid('situation_id')
      .notNull()
      .references(() => situations.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    causeItemId: uuid('cause_item_id').references(() => sourceItems.id),
    causeNote: text('cause_note'),
    changedBy: text('changed_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.situationId, t.version)],
)

export const eventVersions = pgTable(
  'event_versions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    causeItemId: uuid('cause_item_id').references(() => sourceItems.id),
    causeNote: text('cause_note'),
    changedBy: text('changed_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.eventId, t.version)],
)

export const partOfLinks = pgTable(
  'part_of_links',
  {
    id: id(),
    situationId: uuid('situation_id')
      .notNull()
      .references(() => situations.id, { onDelete: 'cascade' }),
    parentSituationId: uuid('parent_situation_id').references(() => situations.id),
    themeId: uuid('theme_id').references(() => themes.id),
    causeItemId: uuid('cause_item_id').references(() => sourceItems.id),
    runId: uuid('run_id').references(() => runs.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('part_of_links_once').on(t.situationId, t.parentSituationId, t.themeId).nullsNotDistinct(),
    check(
      'part_of_links_one_target',
      sql`(${t.parentSituationId} is not null) <> (${t.themeId} is not null)`,
    ),
  ],
)
