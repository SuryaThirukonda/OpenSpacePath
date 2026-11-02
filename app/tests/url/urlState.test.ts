import { describe, expect, it } from 'vitest'
import { BODY_BY_ID } from '../../src/data/bodies'
import { ISS_TLE, PRESETS, satelliteFromPreset } from '../../src/data/presets'
import type { Scenario } from '../../src/types'
import { decodeScenario, encodeScenario, scenarioFromLocation, scenarioToSearch } from '../../src/url/urlState'

const sc: Scenario = {
  bodyId: 'earth',
  epoch: '2026-09-01T12:00:00Z',
  satellites: [
    satelliteFromPreset(PRESETS[0], BODY_BY_ID.earth),
    { id: 'tle-1', kind: 'tle', name: ISS_TLE.name, color: '#fff', line1: ISS_TLE.line1, line2: ISS_TLE.line2 },
  ],
  spanSeconds: 5580,
  rate: 60,
}

describe('url state', () => {
  it('round trips a scenario', () => {
    expect(decodeScenario(encodeScenario(sc))).toEqual(sc)
    expect(scenarioFromLocation(scenarioToSearch(sc))).toEqual(sc)
  })
  it('rejects garbage', () => {
    expect(decodeScenario('not-base64!!')).toBeNull()
    expect(decodeScenario(encodeScenario({ ...sc, epoch: 'yesterday' }))).toBeNull()
    expect(scenarioFromLocation('?x=1')).toBeNull()
  })
  it('rejects scenarios that would crash the app', () => {
    expect(decodeScenario(encodeScenario({ ...sc, bodyId: 'pluto' }))).toBeNull()
    expect(decodeScenario(encodeScenario({ ...sc, spanSeconds: 0 }))).toBeNull()
    expect(decodeScenario(raw({ v: 4, ...sc }))).toBeNull()
  })
  it('drops malformed satellites but keeps the scenario', () => {
    const bad = { ...sc.satellites[0], id: 'bad', elements: { ...(sc.satellites[0] as { elements: object }).elements, e: 1.5 } }
    const badTle = { ...sc.satellites[1], id: 'bad-tle', line2: sc.satellites[1].kind === 'tle' ? sc.satellites[1].line2.slice(0, 68) + '0' : '' }
    const out = decodeScenario(encodeScenario({ ...sc, satellites: [...sc.satellites, bad as Scenario['satellites'][number], badTle as Scenario['satellites'][number]] }))
    expect(out?.satellites.map((s) => s.id)).toEqual(sc.satellites.map((s) => s.id))
  })
  it('snaps the playback rate to an offered value and strips unknown keys', () => {
    expect(decodeScenario(encodeScenario({ ...sc, rate: -60 }))?.rate).toBe(1)
    expect(decodeScenario(encodeScenario({ ...sc, rate: 500 }))?.rate).toBe(600)
    const withJunk = { ...sc, satellites: [{ ...sc.satellites[0], junk: 'x' }] } as unknown as Scenario
    expect(decodeScenario(encodeScenario(withJunk))?.satellites[0]).not.toHaveProperty('junk')
  })
  it('carries a launch start and rejects an impossible latitude', () => {
    const launch = {
      site: { name: 'Cape Canaveral', latitude: 28.5, longitude: -80.6, altitude: 0 },
      vehicle: { name: 'F9', stages: [{ name: 's1', dryMass: 25600, propellantMass: 395700, ispVacuum: 311, ispSeaLevel: 282, thrustVacuum: 8227000 }], dragArea: 10.5, dragCoefficient: 0.3, maxAcceleration: 5 },
      parkingAltitude: 200,
    }
    const mission = {
      ship: { name: 'x', dryMass: 1000, propellantMass: 5000, isp: 350, maxThrust: 1e5, minBurnSpacing: 60 },
      startT: 0, start: { kind: 'launch' as const, launch }, stops: [{ satelliteId: sc.satellites[0].id, dwellSeconds: 0 }], departureWindow: 0,
    }
    const out = decodeScenario(encodeScenario({ ...sc, mission }))
    expect(out?.mission?.start).toEqual({ kind: 'launch', launch })
    const bad = { ...mission, start: { kind: 'launch' as const, launch: { ...launch, site: { ...launch.site, latitude: 95 } } } }
    expect(decodeScenario(encodeScenario({ ...sc, mission: bad }))?.mission).toBeUndefined()
  })

  it('carries mission inputs and drops stops that point at missing satellites', () => {
    const mission = {
      ship: { name: 'S', dryMass: 5000, propellantMass: 60000, isp: 350, maxThrust: 100000, minBurnSpacing: 60 },
      startT: 0, start: { kind: 'satellite' as const, id: sc.satellites[0].id },
      stops: [{ satelliteId: sc.satellites[1].id, dwellSeconds: 600 }, { satelliteId: 'ghost', dwellSeconds: 0 }],
      departureWindow: 0,
    }
    const out = decodeScenario(encodeScenario({ ...sc, mission }))
    expect(out?.mission?.stops.map((s) => s.satelliteId)).toEqual([sc.satellites[1].id])
    expect(out?.mission?.ship.isp).toBe(350)
    expect(decodeScenario(encodeScenario({ ...sc, mission: { ...mission, ship: { ...mission.ship, dryMass: -1 } } }))?.mission).toBeUndefined()
  })

  it('keeps the transfer mode when it is a known one and drops anything else', () => {
    expect(decodeScenario(encodeScenario({ ...sc, transfer: 'lambert2' }))?.transfer).toBe('lambert2')
    expect(decodeScenario(encodeScenario({ ...sc, transfer: 'threeburn' }))?.transfer).toBe('threeburn')
    expect(decodeScenario(encodeScenario({ ...sc, transfer: 'fourburn' as unknown as 'lambert2' }))?.transfer).toBeUndefined()
    // an old link's per-stop strategy is simply ignored
    const old = { ...sc, mission: { ship: { name: 'S', dryMass: 1, propellantMass: 1, isp: 300, maxThrust: 1, minBurnSpacing: 0 }, startT: 0, start: { kind: 'satellite' as const, id: sc.satellites[0].id }, stops: [{ satelliteId: sc.satellites[1].id, dwellSeconds: 0, strategy: 'best' }], departureWindow: 0 } }
    expect(decodeScenario(encodeScenario(old as never))?.mission?.stops).toEqual([{ satelliteId: sc.satellites[1].id, dwellSeconds: 0 }])
  })
  it('reads version 1 links that have no v field', () => {
    const { v: _v, ...rest } = JSON.parse(JSON.stringify({ v: 2, ...sc })) as { v: number } & Scenario
    expect(decodeScenario(raw(rest))).toEqual(sc)
  })
})

function raw(o: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(o))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
