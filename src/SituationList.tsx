import { involvementLines, type Situation } from './situations'
import { countryName } from './world'

interface Props {
  situations: Situation[]
  allSituations: Situation[]
  selectedSituationId: string | null
  selectedCountry: string | null
  onPickSituation: (id: string) => void
  onShowAll: () => void
}

export default function SituationList({
  situations,
  allSituations,
  selectedSituationId,
  selectedCountry,
  onPickSituation,
  onShowAll,
}: Props) {
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
        <p className="empty">No situations for {countryLabel} in the sample data.</p>
      )}
      {situations.map((s) => {
        const selected = s.id === selectedSituationId
        // Numbered by place in the full list so filtering does not renumber.
        const position = String(allSituations.findIndex((o) => o.id === s.id) + 1).padStart(2, '0')
        return (
          <button
            key={s.id}
            type="button"
            className={selected ? 'card panel' : 'card panel-quiet'}
            data-situation={s.id}
            aria-pressed={selected}
            aria-label={s.kind}
            onClick={() => onPickSituation(s.id)}
          >
            <span className={selected ? 'kicker' : 'label-mono'}>SITUATION {position}</span>
            <span className="card-title">{s.kind}</span>
            {involvementLines(s, countryName).map((line) => (
              <span key={line} className="card-line">
                {line}
              </span>
            ))}
          </button>
        )
      })}
    </>
  )
}
