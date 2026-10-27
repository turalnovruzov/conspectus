import Sources from './Sources'
import { countryLines, type PageSituation } from './situations'
import { countryName } from './world'

interface Props {
  situations: PageSituation[]
  selectedSituationId: string | null
  selectedCountry: string | null
  onPickSituation: (id: string) => void
  onShowAll: () => void
}

function Countries({ situation }: { situation: PageSituation }) {
  return (
    <>
      {countryLines(situation, countryName).map((line) => (
        <span key={line.prefix ?? ''} className="card-line">
          {line.prefix !== null && `${line.prefix}: `}
          {line.names.map((n, i) => (
            <span key={n.name}>
              {i > 0 && ' · '}
              {n.steppedOut ? <span className="struck">{n.name}</span> : n.name}
            </span>
          ))}
        </span>
      ))}
    </>
  )
}

export default function SituationList({ situations, selectedSituationId, selectedCountry, onPickSituation, onShowAll }: Props) {
  const countryLabel = selectedCountry === null ? null : countryName(selectedCountry)
  return (
    <>
      {countryLabel !== null && (
        <div className="filter">
          <span>Situations involving {countryLabel}</span>
          <button type="button" className="btn btn-secondary" onClick={onShowAll}>
            Show all
          </button>
        </div>
      )}
      {countryLabel !== null && situations.length === 0 && (
        <p className="empty" data-empty>No situations for {countryLabel} from the news.</p>
      )}
      {situations.map((s) => {
        const selected = s.id === selectedSituationId
        const currentNames = s.involved.filter((i) => !i.steppedOut).map((i) => countryName(i.country))
        return (
          <article key={s.id} className={`situation ${selected ? 'panel' : 'panel-quiet'}`} data-situation-card={s.id}>
            <button
              type="button"
              className="card"
              data-situation={s.id}
              data-phase={s.phase}
              aria-pressed={selected}
              aria-label={s.title}
              onClick={() => onPickSituation(s.id)}
            >
              <span className="card-head">
                <span className={selected ? 'kicker' : 'label-mono'}>{s.kicker}</span>
                {(selected || s.phase !== 'active') && <span className="tag">{s.phaseTag}</span>}
                {selected && s.categoryTag !== null && <span className="tag">{s.categoryTag}</span>}
              </span>
              <span className={selected ? 'card-title' : 'card-name'}>{s.title}</span>
              {selected && <span className="card-one-line">{s.oneLine}</span>}
              {selected ? <Countries situation={s} /> : <span className="card-line">{currentNames.join(' · ')}</span>}
            </button>
            {selected && <Sources situation={s} />}
          </article>
        )
      })}
    </>
  )
}
