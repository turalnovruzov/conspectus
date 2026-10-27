import { createRequire } from 'node:module'
import { countryKey } from '../country-key.ts'

interface Atlas {
  objects: { countries: { geometries: { id?: string; properties: { name: string } }[] } }
}

const atlas = createRequire(import.meta.url)('world-atlas/countries-110m.json') as Atlas

/** The map's countries, keyed as `world.ts` keys them. */
export const MAP_COUNTRIES: readonly { key: string; name: string }[] = atlas.objects.countries.geometries.map((g) => ({
  key: countryKey(g),
  name: g.properties.name,
}))

// Names the models use that the atlas spells differently. Hong Kong, the EU and other places without a shape stay unmatched.
const ALIASES: Record<string, string> = {
  'united states': '840', usa: '840', us: '840', 'u.s.': '840', america: '840',
  'democratic republic of the congo': '180', 'dr congo': '180', drc: '180', 'congo-kinshasa': '180',
  'republic of the congo': '178', 'congo-brazzaville': '178',
  'bosnia and herzegovina': '070', bosnia: '070',
  'north macedonia': '807',
  'czech republic': '203',
  'ivory coast': '384', "cote d'ivoire": '384',
  'south sudan': '728',
  'central african republic': '140', car: '140',
  gaza: '275', 'gaza strip': '275', 'west bank': '275', 'palestinian territories': '275', 'state of palestine': '275',
  uk: '826', britain: '826', 'great britain': '826', england: '826', scotland: '826', wales: '826', 'northern ireland': '826',
  eswatini: '748', swaziland: '748',
  turkiye: '792',
  'dominican republic': '214',
  'equatorial guinea': '226',
  'solomon islands': '090',
  'falkland islands': '238',
  'western sahara': '732',
  'east timor': '626',
  burma: '104',
  'north cyprus': 'N. Cyprus', 'northern cyprus': 'N. Cyprus',
  'south korea': '410', 'republic of korea': '410', 'north korea': '408', dprk: '408',
  russia: '643', 'russian federation': '643',
  iran: '364', syria: '760', laos: '418', vietnam: '704', 'viet nam': '704',
  'the gambia': '270', 'the bahamas': '044',
  'united arab emirates': '784', uae: '784',
}

export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/^the\s+/, (m) => (/^the (gambia|bahamas)/.test(name.toLowerCase()) ? m : ''))
    .replace(/\s+/g, ' ')
    .trim()
}

const byName = new Map<string, string>()
for (const c of MAP_COUNTRIES) byName.set(normaliseName(c.name), c.key)
for (const [alias, key] of Object.entries(ALIASES)) byName.set(normaliseName(alias), key)

export function matchCountry(name: string): { key: string } | null {
  const key = byName.get(normaliseName(name))
  return key ? { key } : null
}

/** The country names the prompts offer the model. */
export const MAP_COUNTRY_NAMES: string = MAP_COUNTRIES.filter((c) => c.name !== 'Antarctica' && c.name !== 'Fr. S. Antarctic Lands')
  .map((c) => c.name)
  .sort()
  .join(', ')
