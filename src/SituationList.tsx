import { involvementLines, type Situation } from './situations'
import { countryName } from './world'

interface Props {
  situations: Situation[]
  selectedSituationId: string | null
  selectedCountry: string | null
  onPickSituation: (id: string) => void
  onShowAll: () => void
}

export default function SituationList({
  situations,
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
          <button type="button" className="show-all" onClick={onShowAll}>
            Show all
          </button>
        </div>
      )}
      {countryLabel !== null && situations.length === 0 && (
        <p className="empty">No situations for {countryLabel} in the sample data.</p>
      )}
      {situations.map((s) => {
        const selected = s.id === selectedSituationId
        return (
          <button
            key={s.id}
            type="button"
            className="card"
            data-situation={s.id}
            aria-pressed={selected}
            aria-label={s.kind}
            style={selected ? { background: '#141c33', borderColor: s.color } : undefined}
            onClick={() => onPickSituation(s.id)}
          >
            <span className="card-title">
              <span className="dot" style={{ background: s.color }} />
              {s.kind}
            </span>
            {involvementLines(s, countryName).map((line) => (
              <span key={line} className={line.includes(': ') ? 'card-role' : 'card-line'}>
                {line}
              </span>
            ))}
          </button>
        )
      })}
    </>
  )
}
