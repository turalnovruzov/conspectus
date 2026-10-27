export type OwnerType = 'state-run' | 'public' | 'private' | 'non-profit'
export type OutletFormat = 'rss' | 'html' | 'mediawiki'

export interface Outlet {
  id: string
  name: string
  url: string
  /** The outlet's own domains: the allow-list for its feed, index and article fetches. */
  hosts: string[]
  region: string
  ownerType: OwnerType
  ownerDetail: string
  ownerSource: string
  language: string
  format: OutletFormat
}

// Owner labels checked 2026-10-27 against each outlet's English Wikipedia infobox and lead (ownerSource).
// Every state-* label (state-run, -funded, -owned, -controlled) is grouped as state-run.
export const OUTLETS: readonly Outlet[] = [
  {
    id: 'wikipedia', name: 'Wikipedia Current events', url: 'https://en.wikipedia.org/w/api.php?action=parse&page=Portal:Current_events',
    hosts: ['en.wikipedia.org'], region: 'Global',
    ownerType: 'non-profit', ownerDetail: 'non-profit (Wikimedia Foundation)',
    ownerSource: 'https://en.wikipedia.org/wiki/Wikimedia_Foundation',
    language: 'en', format: 'mediawiki',
  },
  {
    id: 'bbc', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    hosts: ['bbc.co.uk', 'bbc.com', 'bbci.co.uk'], region: 'Global',
    ownerType: 'public', ownerDetail: 'public',
    ownerSource: 'https://en.wikipedia.org/wiki/BBC_News',
    language: 'en', format: 'rss',
  },
  {
    id: 'dw', name: 'DW World', url: 'https://rss.dw.com/rdf/rss-en-world',
    hosts: ['dw.com'], region: 'Global',
    ownerType: 'public', ownerDetail: 'public',
    ownerSource: 'https://en.wikipedia.org/wiki/Deutsche_Welle',
    language: 'en', format: 'rss',
  },
  {
    id: 'france24', name: 'France 24', url: 'https://www.france24.com/en/rss',
    hosts: ['france24.com'], region: 'Global',
    ownerType: 'public', ownerDetail: 'public',
    ownerSource: 'https://en.wikipedia.org/wiki/France_24',
    language: 'en', format: 'rss',
  },
  {
    id: 'npr', name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml',
    hosts: ['npr.org'], region: 'Global',
    ownerType: 'public', ownerDetail: 'public',
    ownerSource: 'https://en.wikipedia.org/wiki/NPR',
    language: 'en', format: 'rss',
  },
  {
    id: 'un-news', name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
    hosts: ['news.un.org'], region: 'Global',
    ownerType: 'non-profit', ownerDetail: 'non-profit (UN)',
    ownerSource: 'https://en.wikipedia.org/wiki/United_Nations_Department_of_Global_Communications',
    language: 'en', format: 'rss',
  },
  {
    id: 'reliefweb', name: 'ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml',
    hosts: ['reliefweb.int'], region: 'Global',
    ownerType: 'non-profit', ownerDetail: 'non-profit (UN)',
    ownerSource: 'https://en.wikipedia.org/wiki/ReliefWeb',
    language: 'en', format: 'rss',
  },
  {
    id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml',
    hosts: ['aljazeera.com'], region: 'Middle East',
    ownerType: 'state-run', ownerDetail: 'state-funded (Qatar)',
    ownerSource: 'https://en.wikipedia.org/wiki/Al_Jazeera_English',
    language: 'en', format: 'rss',
  },
  {
    id: 'al-monitor', name: 'Al-Monitor', url: 'https://www.al-monitor.com/rss',
    hosts: ['al-monitor.com'], region: 'Middle East',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Al-Monitor',
    language: 'en', format: 'rss',
  },
  {
    id: 'middle-east-eye', name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss',
    hosts: ['middleeasteye.net'], region: 'Middle East',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Middle_East_Eye',
    language: 'en', format: 'rss',
  },
  {
    id: 'the-national', name: 'The National', url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml',
    hosts: ['thenationalnews.com'], region: 'Middle East',
    ownerType: 'state-run', ownerDetail: 'state-owned (UAE)',
    ownerSource: 'https://en.wikipedia.org/wiki/The_National_(Abu_Dhabi)',
    language: 'en', format: 'rss',
  },
  {
    id: 'haaretz', name: 'Haaretz', url: 'https://www.haaretz.com/srv/haaretz-latest-headlines',
    hosts: ['haaretz.com'], region: 'Israel',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Haaretz',
    language: 'en', format: 'rss',
  },
  {
    id: 'tehran-times', name: 'Tehran Times', url: 'https://www.tehrantimes.com/rss',
    hosts: ['tehrantimes.com'], region: 'Iran',
    ownerType: 'state-run', ownerDetail: 'state-controlled',
    ownerSource: 'https://en.wikipedia.org/wiki/Tehran_Times',
    language: 'en', format: 'rss',
  },
  {
    id: 'iran-international', name: 'Iran International', url: 'https://www.iranintl.com/en/feed',
    hosts: ['iranintl.com'], region: 'Iran',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Iran_International',
    language: 'en', format: 'rss',
  },
  {
    id: 'anadolu', name: 'Anadolu Agency', url: 'https://www.aa.com.tr/en/rss/default?cat=world',
    hosts: ['aa.com.tr'], region: 'Turkey',
    ownerType: 'state-run', ownerDetail: 'state-run',
    ownerSource: 'https://en.wikipedia.org/wiki/Anadolu_Agency',
    language: 'en', format: 'rss',
  },
  {
    id: 'rt', name: 'RT', url: 'https://www.rt.com/rss/news/',
    hosts: ['rt.com', 'rt-english.com'], region: 'Russia',
    ownerType: 'state-run', ownerDetail: 'state-run',
    ownerSource: 'https://en.wikipedia.org/wiki/RT_(TV_network)',
    language: 'en', format: 'rss',
  },
  {
    id: 'meduza', name: 'Meduza', url: 'https://meduza.io/rss/en/all',
    hosts: ['meduza.io'], region: 'Russia (exile)',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Meduza_(website)',
    language: 'en', format: 'rss',
  },
  {
    id: 'kyiv-independent', name: 'Kyiv Independent', url: 'https://kyivindependent.com/news-archive/rss/',
    hosts: ['kyivindependent.com'], region: 'Ukraine',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/The_Kyiv_Independent',
    language: 'en', format: 'rss',
  },
  {
    id: 'the-hindu', name: 'The Hindu', url: 'https://www.thehindu.com/news/international/feeder/default.rss',
    hosts: ['thehindu.com'], region: 'South Asia',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/The_Hindu',
    language: 'en', format: 'rss',
  },
  {
    id: 'dawn', name: 'Dawn', url: 'https://www.dawn.com/feeds/world',
    hosts: ['dawn.com'], region: 'South Asia',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Dawn_(newspaper)',
    language: 'en', format: 'rss',
  },
  {
    id: 'kyodo', name: 'Kyodo', url: 'https://english.kyodonews.net/news/world',
    hosts: ['kyodonews.net'], region: 'East Asia',
    ownerType: 'non-profit', ownerDetail: 'non-profit (co-op)',
    ownerSource: 'https://en.wikipedia.org/wiki/Kyodo_News',
    language: 'en', format: 'html',
  },
  {
    id: 'yonhap', name: 'Yonhap', url: 'https://en.yna.co.kr/RSS/news.xml',
    hosts: ['yna.co.kr'], region: 'East Asia',
    ownerType: 'state-run', ownerDetail: 'state-funded',
    ownerSource: 'https://en.wikipedia.org/wiki/Yonhap_News_Agency',
    language: 'en', format: 'rss',
  },
  {
    id: 'scmp', name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed',
    hosts: ['scmp.com'], region: 'East Asia',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/South_China_Morning_Post',
    language: 'en', format: 'rss',
  },
  {
    id: 'global-times', name: 'Global Times', url: 'https://www.globaltimes.cn/world/index.html',
    hosts: ['globaltimes.cn'], region: 'East Asia',
    ownerType: 'state-run', ownerDetail: 'state-run',
    ownerSource: 'https://en.wikipedia.org/wiki/Global_Times',
    language: 'en', format: 'html',
  },
  {
    id: 'cna', name: 'CNA', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311',
    hosts: ['channelnewsasia.com'], region: 'Southeast Asia',
    ownerType: 'state-run', ownerDetail: 'state-owned (Singapore)',
    ownerSource: 'https://en.wikipedia.org/wiki/CNA_(TV_network)',
    language: 'en', format: 'rss',
  },
  {
    id: 'rappler', name: 'Rappler', url: 'https://www.rappler.com/feed/',
    hosts: ['rappler.com'], region: 'Southeast Asia',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Rappler',
    language: 'en', format: 'rss',
  },
  {
    id: 'allafrica', name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
    hosts: ['allafrica.com'], region: 'Africa',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/AllAfrica',
    language: 'en', format: 'rss',
  },
  {
    id: 'premium-times', name: 'Premium Times', url: 'https://www.premiumtimesng.com/feed',
    hosts: ['premiumtimesng.com'], region: 'Africa',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Premium_Times',
    language: 'en', format: 'rss',
  },
  {
    id: 'rfi-afrique', name: 'RFI Afrique', url: 'https://www.rfi.fr/fr/afrique/rss',
    hosts: ['rfi.fr'], region: 'Africa',
    ownerType: 'public', ownerDetail: 'public',
    ownerSource: 'https://en.wikipedia.org/wiki/Radio_France_Internationale',
    language: 'fr', format: 'rss',
  },
  {
    id: 'mercopress', name: 'MercoPress', url: 'https://en.mercopress.com/rss',
    hosts: ['mercopress.com'], region: 'Latin America',
    ownerType: 'private', ownerDetail: 'private (unverified: no Wikipedia article)',
    ownerSource: 'https://en.mercopress.com/',
    language: 'en', format: 'rss',
  },
  {
    id: 'folha', name: 'Folha Mundo', url: 'https://feeds.folha.uol.com.br/mundo/rss091.xml',
    hosts: ['folha.uol.com.br', 'folha.com.br'], region: 'Latin America',
    ownerType: 'private', ownerDetail: 'private',
    ownerSource: 'https://en.wikipedia.org/wiki/Folha_de_S.Paulo',
    language: 'pt', format: 'rss',
  },
  {
    id: 'telesur', name: 'teleSUR', url: 'https://www.telesurtv.net/feed/',
    hosts: ['telesurtv.net'], region: 'Latin America',
    ownerType: 'state-run', ownerDetail: 'state-run',
    ownerSource: 'https://en.wikipedia.org/wiki/Telesur',
    language: 'es', format: 'rss',
  },
  {
    id: 'abc-au', name: 'ABC Australia', url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    hosts: ['abc.net.au'], region: 'Oceania',
    ownerType: 'public', ownerDetail: 'public',
    ownerSource: 'https://en.wikipedia.org/wiki/ABC_News_(Australia)',
    language: 'en', format: 'rss',
  },
]

export function isIndependent(outlet: { ownerType: string }): boolean {
  return outlet.ownerType !== 'state-run'
}

export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase()
  return allowed.some((a) => h === a || h.endsWith(`.${a}`))
}
