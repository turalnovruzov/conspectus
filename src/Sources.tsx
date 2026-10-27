import { useState } from 'react'
import type { PageSituation } from './situations'

const PORTAL = 'https://en.wikipedia.org/wiki/Portal:Current_events'
const LICENCE = 'https://creativecommons.org/licenses/by-sa/4.0/'
const SHOWN = 3

export default function Sources({ situation }: { situation: PageSituation }) {
  const [open, setOpen] = useState(false)
  const rows = open ? situation.rows : situation.rows.slice(0, SHOWN)
  return (
    <div className="sources" data-sources>
      <span className="label-mono">{situation.sourcesLabel}</span>
      {rows.map((row, i) =>
        row.href ? (
          <a key={i} className="source-row" href={row.href} target="_blank" rel="noopener noreferrer">
            {row.text}
          </a>
        ) : (
          <span key={i} className="source-row">
            {row.text}
          </span>
        ),
      )}
      {situation.moreLabel !== null && !open && (
        <button type="button" className="source-more" data-more onClick={() => setOpen(true)}>
          {situation.moreLabel}
        </button>
      )}
      {situation.hasWikipedia && (
        <p className="source-credit" data-credit>
          Lines from <a href={PORTAL} target="_blank" rel="noopener noreferrer">Wikipedia Current events</a>,{' '}
          <a href={LICENCE} target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
        </p>
      )}
    </div>
  )
}
