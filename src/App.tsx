'use client'

import { useState } from 'react'
import SituationList from './SituationList'
import WorldMap from './WorldMap'
import { countryFills, situationsForCountry, type Situation } from './situations'

export default function App({ situations }: { situations: Situation[] }) {
  const [selectedSituationId, setSelectedSituationId] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  const pickSituation = (id: string) => setSelectedSituationId((cur) => (cur === id ? null : id))
  const pickCountry = (key: string) => {
    setSelectedCountry((cur) => (cur === key ? null : key))
    setSelectedSituationId(null)
  }

  const visible =
    selectedCountry === null ? situations : situationsForCountry(situations, selectedCountry)

  return (
    <div className="page">
      <header>
        <h1>Conspectus</h1>
        <span className="label-mono header-tagline">THE WORLD, FROM ABOVE</span>
        <span className="header-badge">
          <span className="tag">SAMPLE DATA · MADE UP</span>
        </span>
      </header>
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
          </div>
        </main>
        <aside>
          <h2 className="label-mono">SITUATIONS</h2>
          <SituationList
            situations={visible}
            allSituations={situations}
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
