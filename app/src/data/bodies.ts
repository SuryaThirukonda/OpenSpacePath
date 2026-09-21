/**
 * Central-body registry.
 * mu (km^3/s^2) and equatorial radii (km) from the NASA Planetary Fact Sheets
 * (nssdc.gsfc.nasa.gov/planetary/factsheet) and JPL SSD (ssd.jpl.nasa.gov/astro_par.html);
 * Earth mu is the WGS-84 value 398600.4418 used throughout the research notes.
 * Rotation periods are sidereal, seconds; Venus is retrograde (negative).
 */
import type { CentralBody } from '../types'

const DAY = 86400

export const BODIES: CentralBody[] = [
  {
    id: 'earth', name: 'Earth', mu: 398600.4418, radius: 6378.137,
    rotationPeriod: 86164.0905, color: '#2f6fb3', gridColor: '#5aa9ff', frameDistance: 60000,
  },
  {
    id: 'moon', name: 'Moon', mu: 4902.800066, radius: 1737.4,
    rotationPeriod: 27.321661 * DAY, color: '#8a8a8a', gridColor: '#c9c9c9', frameDistance: 12000,
  },
  {
    id: 'mars', name: 'Mars', mu: 42828.375214, radius: 3396.19,
    rotationPeriod: 88642.663, color: '#b5502c', gridColor: '#ff9c6e', frameDistance: 28000,
  },
  {
    id: 'venus', name: 'Venus', mu: 324858.592, radius: 6051.8,
    rotationPeriod: -243.0226 * DAY, color: '#c9a86a', gridColor: '#ffe0a3', frameDistance: 50000,
  },
  {
    id: 'jupiter', name: 'Jupiter', mu: 126686531.9, radius: 71492,
    rotationPeriod: 9.925 * 3600, color: '#c08a5a', gridColor: '#ffd1a3', frameDistance: 320000,
  },
  {
    id: 'sun', name: 'Sun', mu: 132712440041.9, radius: 695700,
    rotationPeriod: 25.05 * DAY, color: '#e8b04a', gridColor: '#ffe680', frameDistance: 6500000,
    altitudeScale: 695700 / 6378.137,
  },
]

export const BODY_BY_ID: Record<string, CentralBody> = Object.fromEntries(BODIES.map((b) => [b.id, b]))

export function getBody(id: string): CentralBody {
  const b = BODY_BY_ID[id]
  if (!b) throw new RangeError(`unknown body: ${id}`)
  return b
}
