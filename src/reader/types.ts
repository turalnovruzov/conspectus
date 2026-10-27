export interface RawItem {
  outletId: string
  url: string
  headline: string
  blurb: string
  publishedAt: Date | null
  language: string
  /** Wikipedia lines only: the outlet the line cites. Never fetched. */
  citedUrl?: string | null
}

export interface OutletRef {
  id: string
  url: string
  hosts: readonly string[]
  language: string
  format: string
}
