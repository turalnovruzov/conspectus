import { useState } from 'react'
import sample from './data/sample-situations.json'
import SituationList from './SituationList'
import WorldMap from './WorldMap'
import { countryFills, parseSituations, situationsForCountry } from './situations'

const situations = parseSituations(sample)

export default function App() {
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
        <div className="brand">
          <h1>Conspectus</h1>
          <span className="tagline">The world, from above</span>
        </div>
        <span className="badge">Sample data — made up</span>
      </header>
      <div className="body">
        <main>
          <WorldMap
            fills={countryFills(situations, selectedSituationId)}
            selectedCountry={selectedCountry}
            onPickCountry={pickCountry}
          />
        </main>
        <aside>
          <h2>Situations</h2>
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
