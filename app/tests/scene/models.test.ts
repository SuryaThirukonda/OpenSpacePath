import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { LAUNCH_VEHICLES } from '../../src/data/launch'
import {
  featureDirection, JUPITER_BANDS, JUPITER_GRS, MARS_DARK, MARS_VOLCANOES, MOON_MARIA, MOON_RAY_CRATERS, SUN_SPOTS,
} from '../../src/data/surfaceFeatures'
import {
  buildComsat, buildSpacecraft, buildStack, buildStation, satelliteKind, SATELLITE_UNITS, SPACECRAFT_LENGTH_M,
  SPACECRAFT_METRES_PER_UNIT, stackLayout, STACK_UNITS,
} from '../../src/scene/models'

const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
const byName = (name: string) => LAUNCH_VEHICLES.find((v) => v.name === name)!

describe('launch vehicle sized from its own numbers', () => {
  it('gives a Falcon 9-class vehicle the proportions of the real one', () => {
    const l = stackLayout(byName('Falcon 9-class'))
    expect(l.diameter).toBeCloseTo(3.66, 1) // the real core is 3.66 m
    expect(l.stages[0].tank).toBeCloseTo(37.7, 0)
    expect(l.total).toBeGreaterThan(60) // the real vehicle stands 70 m
    expect(l.total).toBeLessThan(75)
    expect(l.stages[0].tank).toBeGreaterThan(3 * l.stages[1].tank)
  })

  it('makes hydrogen stages long for their mass and the heavy vehicle the size of a moon rocket', () => {
    const l = stackLayout(byName('Heavy three-stage'))
    expect(l.diameter).toBeCloseTo(7.57, 1)
    // 445 t of hydrogen and oxygen needs more tank than the same mass of kerosene would
    expect(l.stages[1].tank).toBeCloseTo(445000 / (360 * 45), 6)
    expect(l.total).toBeGreaterThan(100)
    expect(l.total).toBeLessThan(130)
  })

  it('builds one group per stage, engines lower down the further down the stage', () => {
    for (const v of LAUNCH_VEHICLES) {
      const m = buildStack(v)
      expect(m.stageGroups).toHaveLength(v.stages.length)
      for (let i = 1; i < m.tails.length; i++) expect(m.tails[i - 1]).toBeGreaterThan(m.tails[i])
      expect(size(m.group).z).toBeCloseTo(STACK_UNITS, 1)
      // dropping the first stage shortens the vehicle by that stage
      const full = size(m.group).z
      m.stageGroups[0].visible = false
      m.stageGroups[0].removeFromParent()
      expect(size(m.group).z).toBeLessThan(full)
      m.dispose()
    }
  })
})

describe('spacecraft and satellites', () => {
  it('builds the spacecraft to its stated length with arrays wider than it is long', () => {
    const m = buildSpacecraft()
    const s = size(m.group)
    expect(s.z).toBeCloseTo(SPACECRAFT_LENGTH_M / SPACECRAFT_METRES_PER_UNIT, 2)
    expect(s.x).toBeGreaterThan(1.5 * s.z)
    expect(s.x).toBeCloseTo(s.y, 2) // four wings in an X
    m.dispose()
  })

  it('picks a station for station names and a communications satellite otherwise', () => {
    expect(satelliteKind('ISS (ZARYA)')).toBe('station')
    expect(satelliteKind('Low orbit (ISS-class)')).toBe('station')
    expect(satelliteKind('Highly elliptical (Molniya-class)')).toBe('comsat')
    expect(satelliteKind('Synchronous equatorial')).toBe('comsat')
    expect(satelliteKind('Mission relay')).toBe('comsat')
  })

  it('spans the satellite models along the orbit normal', () => {
    const c = buildComsat()
    const st = buildStation()
    expect(size(c.group).y).toBeCloseTo(SATELLITE_UNITS.comsat, 1)
    expect(size(st.group).y).toBeCloseTo(SATELLITE_UNITS.station, 1)
    expect(size(c.group).y).toBeGreaterThan(3 * size(c.group).x)
    c.dispose()
    st.dispose()
  })
})

describe('surface feature tables', () => {
  it('uses the same axes as the map: prime meridian on +x, 90 E on +y, north pole on +z', () => {
    expect(featureDirection(0, 0)).toEqual([1, 0, 0])
    expect(featureDirection(0, 90)[1]).toBeCloseTo(1, 12)
    expect(featureDirection(90, 0)[2]).toBeCloseTo(1, 12)
  })

  it('keeps every feature at a valid coordinate', () => {
    for (const f of [...MOON_MARIA, ...MOON_RAY_CRATERS, ...MARS_DARK, ...MARS_VOLCANOES, ...SUN_SPOTS]) {
      expect(Math.abs(f.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(f.lon)).toBeLessThanOrEqual(180)
      expect(f.diameter).toBeGreaterThan(0)
    }
  })

  it('has the landmarks where they are known to be', () => {
    const at = (list: { name: string; lat: number; lon: number }[], name: string) => list.find((f) => f.name === name)!
    // Tycho: southern highlands of the near side
    const tycho = featureDirection(at(MOON_RAY_CRATERS, 'Tycho').lat, at(MOON_RAY_CRATERS, 'Tycho').lon)
    expect(tycho[0]).toBeGreaterThan(0)
    expect(tycho[2]).toBeLessThan(0)
    // Mare Crisium: the isolated dark oval near the north-eastern limb
    expect(at(MOON_MARIA, 'Mare Crisium').lon).toBeGreaterThan(50)
    expect(at(MOON_MARIA, 'Mare Crisium').lat).toBeGreaterThan(0)
    // Olympus Mons: northern hemisphere, west of the Tharsis volcanoes
    const olympus = at(MARS_VOLCANOES, 'Olympus Mons')
    expect(olympus.lat).toBeCloseTo(18.65, 2)
    expect(olympus.lon).toBeLessThan(at(MARS_VOLCANOES, 'Arsia Mons').lon)
    // Syrtis Major: just north of the equator near 70 E
    expect(at(MARS_DARK, 'Syrtis Major').lon).toBeCloseTo(69.5, 1)
    // sunspots only in the active latitudes
    for (const s of SUN_SPOTS) {
      expect(Math.abs(s.lat)).toBeGreaterThanOrEqual(5)
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(35)
    }
  })

  it('lists Jupiter\'s bands from south to north with the Great Red Spot at the edge of the South Equatorial Belt', () => {
    for (let i = 1; i < JUPITER_BANDS.length; i++) expect(JUPITER_BANDS[i].north).toBeGreaterThan(JUPITER_BANDS[i - 1].north)
    expect(JUPITER_BANDS[JUPITER_BANDS.length - 1].north).toBe(90)
    const seb = JUPITER_BANDS.findIndex((b) => b.name === 'South Equatorial Belt')
    const south = JUPITER_BANDS[seb - 1].north
    expect(JUPITER_GRS.lat).toBeGreaterThan(south - 5)
    expect(JUPITER_GRS.lat).toBeLessThan(JUPITER_BANDS[seb].north)
  })
})
