import { HEIGHT, WIDTH, countries, graticulePath, spherePath } from './world'
import type { Fill } from './situations'

const LAND = '#2b3550'
const BORDER = '#0b1020'

interface Props {
  fills: Map<string, Fill>
  selectedCountry: string | null
  onPickCountry: (key: string) => void
}

export default function WorldMap({ fills, selectedCountry, onPickCountry }: Props) {
  // The selected country goes last so its outline is not covered by neighbours.
  const ordered = [...countries].sort(
    (a, b) => Number(a.key === selectedCountry) - Number(b.key === selectedCountry),
  )
  return (
    <svg
      className="map"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="World map"
    >
      <path d={spherePath} fill="#0e1730" />
      <path d={graticulePath} fill="none" stroke="#ffffff" strokeOpacity={0.05} />
      {ordered.map((c) => {
        const fill = fills.get(c.key)
        const selected = c.key === selectedCountry
        return (
          <path
            key={c.key}
            d={c.d}
            data-country={c.key}
            data-state={fill?.role ?? 'none'}
            data-selected={selected ? 'true' : undefined}
            fill={fill?.color ?? LAND}
            fillOpacity={fill && fill.role !== 'party' ? 0.5 : undefined}
            stroke={selected ? '#e6eaf2' : BORDER}
            strokeWidth={selected ? 1.5 : 0.6}
            style={{ cursor: 'pointer' }}
            onClick={() => onPickCountry(c.key)}
          >
            <title>{c.name}</title>
          </path>
        )
      })}
    </svg>
  )
}
