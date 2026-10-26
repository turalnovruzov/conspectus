import { HEIGHT, WIDTH, countries } from './world'
import type { Fill } from './situations'

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
      {ordered.map((c) => {
        const fill = fills.get(c.key)
        const selected = c.key === selectedCountry
        const className = [
          'land',
          fill ? `inv-${fill.involvement}` : '',
          selected ? 'country-selected' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <path
            key={c.key}
            d={c.d}
            className={className}
            data-country={c.key}
            data-state={fill?.role ?? 'none'}
            data-involvement={fill?.involvement ?? 'none'}
            data-selected={selected ? 'true' : undefined}
            onClick={() => onPickCountry(c.key)}
          >
            <title>{c.name}</title>
          </path>
        )
      })}
    </svg>
  )
}
