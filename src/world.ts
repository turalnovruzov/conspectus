import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import atlas from 'world-atlas/countries-110m.json'

export const WIDTH = 900
export const HEIGHT = 468

const topology = atlas as unknown as Topology
const collection = feature(topology, topology.objects.countries as GeometryCollection<{ name: string }>)

const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' })
const path = geoPath(projection)

// Three geometries in countries-110m (N. Cyprus, Somaliland, Kosovo) have no id.
export function countryKey(f: { id?: string | number; properties: { name: string } }): string {
  return f.id !== undefined ? String(f.id) : f.properties.name
}

export const countries = collection.features.map((f) => ({
  key: countryKey(f),
  name: f.properties.name,
  d: path(f) ?? '',
}))

const names = new Map(countries.map((c) => [c.key, c.name]))

export function countryName(key: string): string {
  return names.get(key) ?? key
}

export const spherePath = path({ type: 'Sphere' }) ?? ''
export const graticulePath = path(geoGraticule10()) ?? ''
