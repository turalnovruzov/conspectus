'use client'

import { useState } from 'react'
import SituationList from './SituationList'
import WorldMap from './WorldMap'
import { countryFills, situationsForCountry, type PageModel } from './situations'

export default function App({ model }: { model: PageModel }) {
  const [selectedSituationId, setSelectedSituationId] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  const situations = model.status === 'ok' ? model.situations : []
  const pickSituation = (id: string) => setSelectedSituationId((cur) => (cur === id ? null : id))
  const pickCountry = (key: string) => {
    setSelectedCountry((cur) => (cur === key ? null : key))
    setSelectedSituationId(null)
  }

  const visible = selectedCountry === null ? situations : situationsForCountry(situations, selectedCountry)

  return (
    <div className="page">
      <header>
        <h1>Conspectus</h1>
        <span className="label-mono header-tagline">THE WORLD, FROM ABOVE</span>
        <span className="tag header-badge" data-live>
          {model.status === 'ok' ? model.header : 'NEWS UNAVAILABLE'}
        </span>
      </header>
      <p className="disclaimer" data-disclaimer>
        Compiled automatically from the news by an AI. It may not be fully accurate: every situation links to its sources.
      </p>
      <div className="body">
        <main>
          <WorldMap
            fills={countryFills(situations, selectedSituationId)}
            selectedCountry={selectedCountry}
            onPickCountry={pickCountry}
          />
          <div className="legend" data-legend>
            <span className="legend-item">
              <span className="swatch-pulled-in" aria-hidden="true" /> Pulled in
            </span>
            <span className="legend-item">
              <span className="swatch-joined" aria-hidden="true" /> Joined
            </span>
            <span className="legend-item">
              <span className="swatch-stepped-out" aria-hidden="true" /> Stepped out
            </span>
          </div>
        </main>
        <aside>
          <h2 className="label-mono" data-situations-heading>
            {model.status === 'ok' ? `SITUATIONS · ${situations.length} FROM THE NEWS` : 'SITUATIONS'}
          </h2>
          {model.status === 'unavailable' && <p className="empty" data-empty>The news database cannot be reached right now.</p>}
          {model.status === 'ok' && situations.length === 0 && selectedCountry === null && <p className="empty" data-empty>No situations from the news yet.</p>}
          <SituationList
            situations={visible}
            selectedSituationId={selectedSituationId}
            selectedCountry={selectedCountry}
            onPickSituation={pickSituation}
            onShowAll={() => setSelectedCountry(null)}
          />
          <p className="hint">
            Pick a situation to see who is in it. Pick a country on the map to see its situations.
          </p>
        </aside>
      </div>
    </div>
  )
}
