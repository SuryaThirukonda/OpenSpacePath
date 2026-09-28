/**
 * A real map for Earth. Natural Earth 1:110m country polygons (public domain) come from the
 * world-atlas package and are decoded with topojson-client on first use. Land is painted into an
 * equirectangular canvas texture; coastlines and borders are also built as line segments on the
 * sphere so they stay crisp when zoomed in.
 *
 * Coordinates: longitude east of Greenwich, geodetic latitude, in the body-fixed frame with +x
 * through the prime meridian, +y through 90 E and +z the north pole. three.js's SphereGeometry,
 * once its poles are turned onto z, maps texture u = (lon + 180) / 360 and v = (lat + 90) / 180,
 * which is exactly the layout of an equirectangular image with north at the top (see the test).
 * CentralBodyMesh spins the sphere by sidereal time, so the map sits where the real Earth is.
 */
import type { FeatureCollection, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson'
import * as THREE from 'three'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { DEG } from '../core/constants'

type CountryTopology = Topology<{ countries: GeometryCollection<{ name: string }>; land: GeometryCollection }>

export interface EarthMap {
  countries: FeatureCollection<Polygon | MultiPolygon, { name: string }>
  /** Coastlines: polygon edges that belong to one country only. */
  coast: MultiLineString
  /** Land borders: edges shared by two countries. */
  borders: MultiLineString
}

let mapPromise: Promise<EarthMap> | null = null

/** Fetches and decodes the map once; later calls share the same promise. */
export function loadEarthMap(): Promise<EarthMap> {
  mapPromise ??= (async () => {
    const url = (await import('world-atlas/countries-110m.json?url')).default
    const res = await fetch(url)
    if (!res.ok) throw new Error(`map data: HTTP ${res.status}`)
    const topo = (await res.json()) as CountryTopology
    return {
      countries: feature(topo, topo.objects.countries) as EarthMap['countries'],
      coast: mesh(topo, topo.objects.countries, (a, b) => a === b),
      borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    }
  })()
  return mapPromise
}

/** Pixel on an equirectangular canvas: x grows east from 180 W, y grows south from the north pole. */
export function lonLatToPixel(lon: number, lat: number, width: number, height: number): [number, number] {
  return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height]
}

/** Point on a sphere of radius r in the body-fixed frame (+x prime meridian, +z north pole). */
export function lonLatToVector3(lon: number, lat: number, r: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(lat * DEG)
  return out.set(r * c * Math.cos(lon * DEG), r * c * Math.sin(lon * DEG), r * Math.sin(lat * DEG))
}

const OCEAN = '#0f2f52'
const LAND = '#3b5c44'
const ICE = '#d6e1e8'
const ICE_NAMES = new Set(['Antarctica', 'Greenland'])

/** Paint the map into a texture: ocean, a faint 15-degree graticule, land, ice, coasts and borders. */
export function makeEarthTexture(map: EarthMap, width = 2048): THREE.CanvasTexture {
  const height = width / 2
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  ctx.fillStyle = OCEAN
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(160, 200, 255, 0.12)'
  ctx.lineWidth = 1
  for (let lon = -180; lon < 180; lon += 15) {
    const [x] = lonLatToPixel(lon, 0, width, height)
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const [, y] = lonLatToPixel(0, lat, width, height)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }

  const ring = (coords: Position[]) => {
    coords.forEach(([lon, lat], i) => {
      const [x, y] = lonLatToPixel(lon, lat, width, height)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
  for (const f of map.countries.features) {
    ctx.fillStyle = ICE_NAMES.has(f.properties.name) ? ICE : LAND
    ctx.beginPath()
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const polygon of polygons) for (const r of polygon) ring(r)
    ctx.fill('evenodd')
  }
  // The 110m Antarctica polygon stops at 85.6 S; the pole itself is ice.
  ctx.fillStyle = ICE
  ctx.fillRect(0, lonLatToPixel(0, -85.5, width, height)[1], width, height)

  const strokes = (lines: MultiLineString, style: string, w: number) => {
    ctx.strokeStyle = style
    ctx.lineWidth = w
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (const line of lines.coordinates) {
      line.forEach(([lon, lat], i) => {
        const [x, y] = lonLatToPixel(lon, lat, width, height)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
    }
    ctx.stroke()
  }
  strokes(map.coast, 'rgba(225, 240, 255, 0.5)', 1.4)
  strokes(map.borders, 'rgba(225, 240, 255, 0.22)', 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Line segments on a sphere of the given radius for a set of polylines. */
export function makeOutlineGeometry(lines: MultiLineString, radius: number): THREE.BufferGeometry {
  const pts: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  for (const line of lines.coordinates) {
    for (let i = 1; i < line.length; i++) {
      lonLatToVector3(line[i - 1][0], line[i - 1][1], radius, a)
      lonLatToVector3(line[i][0], line[i][1], radius, b)
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return geo
}

export interface EarthAssets {
  texture: THREE.CanvasTexture
  coast: THREE.BufferGeometry
  borders: THREE.BufferGeometry
}

const assets = new Map<number, Promise<EarthAssets>>()

/** Texture and outline geometries for a sphere of radius `radius` (scene units), built once and shared. */
export function getEarthAssets(radius: number): Promise<EarthAssets> {
  let p = assets.get(radius)
  if (!p) {
    p = loadEarthMap().then((map) => ({
      texture: makeEarthTexture(map),
      coast: makeOutlineGeometry(map.coast, radius * 1.002),
      borders: makeOutlineGeometry(map.borders, radius * 1.002),
    }))
    assets.set(radius, p)
  }
  return p
}

/** Coordinate labels on the equator and at the poles, as [text, lon, lat]. */
export const GRATICULE_LABELS: Array<[string, number, number]> = [
  ['0°', 0, 0], ['90°E', 90, 0], ['180°', 180, 0], ['90°W', -90, 0], ['N', 0, 90], ['S', 0, -90],
]
