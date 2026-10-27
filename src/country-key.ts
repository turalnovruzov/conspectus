// Three geometries in countries-110m (N. Cyprus, Somaliland, Kosovo) have no id.
export function countryKey(f: { id?: string | number; properties: { name: string } }): string {
  return f.id !== undefined ? String(f.id) : f.properties.name
}
