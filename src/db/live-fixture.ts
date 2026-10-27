import type { Db } from './client.ts'
import { categories, eventItems, events, involvements, outlets, runs, situationEvents, situations, sourceItems } from './schema.ts'

interface OutletSeed {
  id: string
  name: string
  host: string
  region: string
  ownerType: string
  format?: string
  active?: boolean
}

const OUTLET_SEEDS: OutletSeed[] = [
  { id: 'fx-northwind', name: 'Northwind Herald', host: 'northwind.example', region: 'Europe', ownerType: 'public' },
  { id: 'fx-lantern', name: 'Lantern Daily', host: 'lantern.example', region: 'Asia', ownerType: 'private' },
  { id: 'fx-savanna', name: 'Savanna Post', host: 'savanna.example', region: 'Africa', ownerType: 'private' },
  { id: 'fx-crescent', name: 'Crescent State News', host: 'crescent.example', region: 'Middle East', ownerType: 'state-run' },
  { id: 'fx-harbor', name: 'Harbor State Radio', host: 'harbor.example', region: 'East Asia', ownerType: 'state-run' },
  { id: 'fx-wiki', name: 'Wikipedia Current events', host: 'en.wikipedia.org', region: 'Global', ownerType: 'non-profit', format: 'mediawiki' },
  { id: 'fx-retired', name: 'Retired Wire', host: 'retired.example', region: 'Europe', ownerType: 'private', active: false },
]

interface ItemSeed {
  outlet: string
  day: string
  url?: string
}

interface InvolvementSeed {
  country: string
  role: string
  entry?: string
  leftOn?: string
}

interface SituationSeed {
  key: string
  title: string
  oneLine: string
  phase?: 'active' | 'easing' | 'quiet' | 'ended'
  scope?: string
  major?: boolean
  startedOn: string
  lastEvent: string
  category?: string
  mergedInto?: string
  involved: InvolvementSeed[]
  items: ItemSeed[]
}

const HOSTS = new Map(OUTLET_SEEDS.map((o) => [o.id, o.host]))

const SITUATIONS: SituationSeed[] = [
  {
    key: 'alpha',
    title: 'Fixture border clash alpha',
    oneLine: 'Two made-up neighbours trade fire over a made-up river crossing.',
    startedOn: '2026-10-01',
    lastEvent: '2026-10-26',
    category: 'Border clash',
    involved: [
      { country: '398', role: 'party' },
      { country: '860', role: 'party' },
      { country: '792', role: 'supporting', entry: 'joined' },
      { country: '762', role: 'supporting', entry: 'joined', leftOn: '2026-10-20' },
    ],
    items: [
      { outlet: 'fx-wiki', day: '2026-10-26', url: 'https://northwind.example/alpha-cited' },
      { outlet: 'fx-crescent', day: '2026-10-25' },
      { outlet: 'fx-northwind', day: '2026-10-24' },
      { outlet: 'fx-lantern', day: '2026-10-22' },
      { outlet: 'fx-savanna', day: '2026-10-21' },
      { outlet: 'fx-northwind', day: '2026-10-20' },
    ],
  },
  {
    key: 'beta',
    title: 'Fixture protests beta',
    oneLine: 'Made-up crowds gather in a made-up capital for a second week.',
    phase: 'easing',
    startedOn: '2026-10-10',
    lastEvent: '2026-10-23',
    category: 'Civil unrest',
    involved: [{ country: '076', role: 'party' }],
    items: [
      { outlet: 'fx-northwind', day: '2026-10-23' },
      { outlet: 'fx-lantern', day: '2026-10-22' },
    ],
  },
  {
    key: 'gamma',
    title: 'Fixture standoff gamma',
    oneLine: 'A made-up standoff at sea has gone silent.',
    phase: 'quiet',
    startedOn: '2026-09-01',
    lastEvent: '2026-09-30',
    involved: [
      { country: '124', role: 'party' },
      { country: '036', role: 'party' },
    ],
    items: [
      { outlet: 'fx-lantern', day: '2026-09-30' },
      { outlet: 'fx-savanna', day: '2026-09-29' },
    ],
  },
  {
    key: 'delta',
    title: 'Fixture state-only delta',
    oneLine: 'Only state outlets report this made-up matter.',
    startedOn: '2026-10-15',
    lastEvent: '2026-10-25',
    involved: [{ country: '643', role: 'party' }],
    items: [
      { outlet: 'fx-crescent', day: '2026-10-25' },
      { outlet: 'fx-harbor', day: '2026-10-24' },
    ],
  },
  {
    key: 'epsilon',
    title: 'Fixture one-off epsilon',
    oneLine: 'A made-up one-off that is not major.',
    scope: 'one_off',
    startedOn: '2026-10-20',
    lastEvent: '2026-10-24',
    involved: [{ country: '250', role: 'party' }],
    items: [
      { outlet: 'fx-northwind', day: '2026-10-24' },
      { outlet: 'fx-lantern', day: '2026-10-23' },
    ],
  },
  {
    key: 'zeta',
    title: 'Fixture ended zeta',
    oneLine: 'A made-up matter that has ended.',
    phase: 'ended',
    startedOn: '2026-09-05',
    lastEvent: '2026-09-20',
    involved: [{ country: '276', role: 'party' }],
    items: [
      { outlet: 'fx-northwind', day: '2026-09-20' },
      { outlet: 'fx-lantern', day: '2026-09-19' },
    ],
  },
  {
    key: 'eta',
    title: 'Fixture merged eta',
    oneLine: 'A made-up duplicate of alpha.',
    mergedInto: 'alpha',
    startedOn: '2026-10-12',
    lastEvent: '2026-10-22',
    involved: [{ country: '250', role: 'party' }],
    items: [
      { outlet: 'fx-northwind', day: '2026-10-22' },
      { outlet: 'fx-lantern', day: '2026-10-21' },
    ],
  },
]

/** Made-up content only, inserted through the real schema; refuses a database that already has situations. */
export async function seedLiveFixture(db: Db): Promise<void> {
  const existing = await db.select({ id: situations.id }).from(situations).limit(1)
  if (existing.length > 0) throw new Error('seedLiveFixture: the database already has situations')

  await db.transaction(async (tx) => {
    await tx.insert(outlets).values(
      OUTLET_SEEDS.map(({ host, format, ...o }) => ({
        ...o,
        url: `https://${host}/feed`,
        hosts: [host],
        language: 'en',
        format: format ?? 'rss',
      })),
    )
    await tx.insert(runs).values([
      { kind: 'run', status: 'ok', ceilingUsd: '0.75', startedAt: new Date('2026-10-26T05:50:00Z'), finishedAt: new Date('2026-10-26T06:00:00Z') },
      { kind: 'run', status: 'ok', ceilingUsd: '0.75', startedAt: new Date('2026-10-27T05:55:00Z'), finishedAt: new Date('2026-10-27T06:05:00Z') },
      { kind: 'run', status: 'running', ceilingUsd: '0.75', startedAt: new Date('2026-10-27T07:00:00Z'), finishedAt: null },
    ])
    const [armed] = await tx.insert(categories).values({ name: 'Armed conflict', definition: 'Made-up category for fixtures.' }).returning()
    const [border] = await tx.insert(categories).values({ name: 'Border clash', definition: 'Made-up sub-category.', parentId: armed.id }).returning()
    const [unrest] = await tx.insert(categories).values({ name: 'Civil unrest', definition: 'Made-up category for fixtures.' }).returning()
    const categoryIds = new Map([[border.name, border.id], [unrest.name, unrest.id]])

    const situationIds = new Map<string, string>()
    for (const s of SITUATIONS) {
      const [row] = await tx
        .insert(situations)
        .values({
          title: s.title,
          oneLine: s.oneLine,
          phase: s.phase ?? 'active',
          scope: s.scope ?? 'ongoing',
          major: s.major ?? false,
          startedOn: s.startedOn,
          lastEventAt: new Date(`${s.lastEvent}T12:00:00Z`),
          categoryId: s.category ? categoryIds.get(s.category) : null,
          mergedIntoId: s.mergedInto ? situationIds.get(s.mergedInto) : null,
        })
        .returning({ id: situations.id })
      situationIds.set(s.key, row.id)
      await tx.insert(involvements).values(
        s.involved.map((i) => ({
          situationId: row.id,
          countryKey: i.country,
          role: i.role,
          entry: i.entry ?? 'pulled_in',
          joinedOn: s.startedOn,
          leftOn: i.leftOn ?? null,
        })),
      )
      for (const [n, item] of s.items.entries()) {
        const [event] = await tx
          .insert(events)
          .values({ title: `${s.title} event ${n + 1}`, occurredOn: item.day })
          .returning({ id: events.id })
        await tx.insert(situationEvents).values({ situationId: row.id, eventId: event.id })
        const [source] = await tx
          .insert(sourceItems)
          .values({
            outletId: item.outlet,
            url: item.url ?? `https://${HOSTS.get(item.outlet)}/${s.key}-${n + 1}`,
            headline: `${s.title}: report ${n + 1}`,
            publishedAt: new Date(`${item.day}T12:00:00Z`),
          })
          .returning({ id: sourceItems.id })
        await tx.insert(eventItems).values({ eventId: event.id, sourceItemId: source.id })
      }
    }
  })
}
