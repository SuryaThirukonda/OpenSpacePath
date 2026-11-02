import { describe, expect, it } from 'vitest'
import { FORMAT_REFERENCE, PAPER_PRESETS, parseAlgorithm, PRESETS } from '../../src/arp/format'
import { ARP_EPOCH, AU_KM, earthElements, generateInstance, instanceToScenario, parseInstance, seededRandom } from '../../src/arp/instance'
import { period } from '../../src/core/elements'
import { elementsToState, norm } from '../../src/core/kepler'
import { PLAYBACK_RATES, snapRate } from '../../src/core/time'
import { BODY_BY_ID } from '../../src/data/bodies'
import { flattenPlan, shipStateAt } from '../../src/mission/state'
import type { MissionPlan, Samples } from '../../src/mission/types'
import { decodeLink, decodeScenario, encodeScenario } from '../../src/url/urlState'

const DEG = Math.PI / 180

describe('routing instances', () => {
  it('gives the same instance for the same seed and a different one for another', () => {
    const a = generateInstance(8, 42)
    const b = generateInstance(8, 42)
    const c = generateInstance(8, 43)
    expect(a).toEqual(b)
    expect(a.asteroids[0].elements.a).not.toBe(c.asteroids[0].elements.a)
    expect(a.name).toBe('synthetic 8_42')
    expect(a.asteroids).toHaveLength(8)
    expect(new Set([a.earth.id, ...a.asteroids.map((x) => x.id)]).size).toBe(9)
    expect(seededRandom(5)()).toBe(seededRandom(5)())
    expect(seededRandom(5)()).not.toBe(seededRandom(6)())
  })

  it('keeps the asteroids in the main belt and uses the cost constants of the papers', () => {
    const inst = generateInstance(30, 7)
    for (const a of inst.asteroids) {
      expect(a.elements.a / AU_KM).toBeGreaterThanOrEqual(2.1)
      expect(a.elements.a / AU_KM).toBeLessThanOrEqual(3.3)
      expect(a.elements.e).toBeLessThan(0.25)
      expect(a.elements.i).toBeLessThanOrEqual(14 * DEG)
    }
    expect(inst.tauMax).toBe(730)
    expect(inst.tMax).toBe(730)
    expect(inst.timeWeight).toBeCloseTo(2 / 30, 12)
    expect(inst.epoch).toBe(ARP_EPOCH)
    expect(inst.mu).toBe(BODY_BY_ID.sun.mu)
  })

  it('puts Earth on a one-year orbit near perihelion at the start of January', () => {
    const el = earthElements(Date.parse('2121-01-01T00:00:00Z'))
    expect(period(el.a, BODY_BY_ID.sun.mu) / 86400).toBeCloseTo(365.256, 1)
    // perihelion falls in the first days of January, so the mean anomaly is a few degrees short of 360
    const M = el.M0 / DEG
    expect(M > 350 || M < 3).toBe(true)
    // J2000 check: 2.5 degrees before perihelion (3 January 2000), 0.9833 AU from the Sun
    const j2000 = earthElements(Date.parse('2000-01-01T12:00:00Z'))
    expect(j2000.M0 / DEG).toBeCloseTo(357.527, 2)
    expect(norm(elementsToState(j2000, BODY_BY_ID.sun.mu, 0).r) / AU_KM).toBeCloseTo(0.9833, 3)
  })

  it('turns an instance into a Sun-centred scene that survives a shared link', () => {
    const inst = generateInstance(5, 3)
    const sc = instanceToScenario(inst, 'gooding1990')
    expect(sc.bodyId).toBe('sun')
    expect(sc.satellites.map((s) => s.id)).toEqual([inst.earth.id, ...inst.asteroids.map((a) => a.id)])
    expect(sc.satellites[0]).toMatchObject({ kind: 'kepler', shape: 'planet' })
    expect(sc.satellites[1]).toMatchObject({ kind: 'kepler', shape: 'asteroid' })
    const back = decodeScenario(encodeScenario(sc))
    expect(back).toEqual(sc)
    expect(back?.solver).toBe('gooding1990')
    // a solver name that is not a plain identifier is dropped rather than passed on
    expect(decodeScenario(encodeScenario({ ...sc, solver: '../etc' }))?.solver).toBeUndefined()
    // the transfer choice survives a rebuild of the scene
    expect(instanceToScenario(inst, 'izzo2015', 'lambert2').transfer).toBe('lambert2')
  })

  it('remembers in a link that it was made on the Asteroids tab, without the drawn tour', () => {
    const inst = generateInstance(4, 9)
    const sc = { ...instanceToScenario(inst, 'izzo2015', 'threeburn'), mission: { ship: { name: 's', dryMass: 1, propellantMass: 0, isp: 1, maxThrust: 1, minBurnSpacing: 0 }, startT: 0,
      start: { kind: 'satellite' as const, id: inst.earth.id }, stops: [{ satelliteId: inst.asteroids[0].id, dwellSeconds: 0 }], departureWindow: 0 } }
    const meta = { name: inst.name, mu: inst.mu, tauMax: 730, tMax: 730, timeWeight: inst.timeWeight, innerStart: [1, 30] as [number, number], innerTol: 1e-4 }
    const link = decodeLink(encodeScenario(sc, 'asteroids', meta))
    expect(link?.world).toBe('asteroids')
    expect(link?.scenario.mission).toBeUndefined()
    expect(link?.instance).toEqual(meta)
    expect(link?.scenario.satellites.length).toBe(5)
    // a satellites link, or an asteroid link around another body, opens the satellites world
    expect(decodeLink(encodeScenario(sc))?.world).toBe('satellites')
    expect(decodeLink(encodeScenario({ ...sc, bodyId: 'earth', satellites: [] }, 'asteroids', meta))?.world).toBe('satellites')
  })

  it('offers playback fast enough for a tour of years', () => {
    expect(PLAYBACK_RATES.map(([r]) => r)).toContain(2592000)
    expect(snapRate(2592000)).toBe(2592000)
    expect(snapRate(3000000)).toBe(2592000)
  })

  it('imports an instance and says what is wrong with a bad one', () => {
    const inst = generateInstance(4, 9)
    expect(parseInstance(JSON.stringify(inst))).toEqual(inst)
    // an exported run carries its instance
    expect(parseInstance(JSON.stringify({ format: 'arp-run', version: 1, instance: inst }))).toEqual(inst)
    expect(parseInstance('nope')).toMatch(/not JSON/)
    expect(parseInstance(JSON.stringify({ ...inst, asteroids: [] }))).toMatch(/1 to 40/)
    expect(parseInstance(JSON.stringify({ ...inst, epoch: 'soon' }))).toMatch(/epoch/)
    const broken = { ...inst, asteroids: [{ ...inst.asteroids[0], elements: { ...inst.asteroids[0].elements, e: 1.5 } }] }
    expect(parseInstance(JSON.stringify(broken))).toMatch(/eccentricity/)
    const twins = { ...inst, asteroids: [inst.asteroids[0], inst.asteroids[0]] }
    expect(parseInstance(JSON.stringify(twins))).toMatch(/share an id/)
  })
})

describe('the algorithm format', () => {
  const ok = '"""ARP-ALGORITHM 1\nname: Mine\n"""\n\ndef solve(problem, tools):\n    return []\n'

  it('accepts every preset and reads its name', () => {
    expect(PRESETS.length).toBe(4)
    for (const p of PRESETS) {
      const h = parseAlgorithm(p.source)
      expect(h.errors).toEqual([])
      expect(h.ok).toBe(true)
      expect(h.name.length).toBeGreaterThan(3)
    }
    expect(parseAlgorithm(PRESETS[0].source).fields.source).toMatch(/Algorithm 1/)
    // two algorithms from each paper are what the tab offers without the editor
    expect(PAPER_PRESETS.map((p) => p.paper)).toEqual([1, 1, 2, 2])
    expect(PAPER_PRESETS.map((p) => p.id)).toEqual(['greedy-nn', 'random', 'restricted-dd', 'peel-and-bound'])
    for (const p of PAPER_PRESETS) expect(parseAlgorithm(p.source).fields.source).toMatch(/Lopez-Ibanez|Rudich/)
    expect(FORMAT_REFERENCE).toMatch(/tools\.transfer\(a, b, eta\)/)
  })

  it('says exactly what is missing', () => {
    expect(parseAlgorithm(ok)).toMatchObject({ ok: true, name: 'Mine' })
    const single = "# a comment first\n\n'''ARP-ALGORITHM 1\nname: Quoted\n'''\ndef solve(problem, tools):\n    pass\n"
    expect(parseAlgorithm(single)).toMatchObject({ ok: true, name: 'Quoted' })
    expect(parseAlgorithm('def solve(problem, tools):\n    return []\n').errors[0]).toMatch(/must start with a docstring/)
    expect(parseAlgorithm(ok.replace('ARP-ALGORITHM 1', 'ARP-ALGORITHM 2')).errors[0]).toMatch(/version 2/)
    expect(parseAlgorithm(ok.replace('ARP-ALGORITHM 1', 'My algorithm')).errors[0]).toMatch(/first line must be/)
    expect(parseAlgorithm(ok.replace('name: Mine\n', '')).errors).toContain('the header needs a "name:" line')
    expect(parseAlgorithm(ok.replace('def solve(problem, tools)', 'def solve(p, t)')).errors[0]).toMatch(/def solve\(problem, tools\)/)
    expect(parseAlgorithm(ok.replace('def solve', '    def solve')).ok).toBe(false)
  })
})

describe('a route that begins with a wait', () => {
  it('flattens the prelude before the first leg as a ride', () => {
    const mu = BODY_BY_ID.sun.mu
    const el = earthElements(Date.parse(ARP_EPOCH))
    const sample = (t0: number, t1: number): Samples => {
      const s: Samples = { t: [], r: [], v: [] }
      for (let k = 0; k <= 20; k++) {
        const t = t0 + ((t1 - t0) * k) / 20
        const st = elementsToState(el, mu, t)
        s.t.push(t); s.r.push([st.r.x, st.r.y, st.r.z]); s.v.push([st.v.x, st.v.y, st.v.z])
      }
      return s
    }
    const day = 86400
    const plan: MissionPlan = {
      legs: [{ toStop: 0, strategy: 'lambert2 (izzo2015)', tof: 300 * day, totalDv: 17, warnings: [], burns: [], arcs: [{ t0: 60 * day, t1: 360 * day, samples: sample(60 * day, 360 * day) }], ride: null }],
      totalDv: 17, totalTime: 390 * day, propellantLeft: -1, feasible: true,
      prelude: { t0: 0, t1: 60 * day, satelliteId: 'earth', samples: sample(0, 60 * day) },
    }
    const flat = flattenPlan(plan)
    expect(flat.tStart).toBe(0)
    expect(flat.kind[0]).toBe(1)
    expect(shipStateAt(flat, 30 * day)?.kind).toBe('ride')
    expect(shipStateAt(flat, 100 * day)?.kind).toBe('arc')
    for (let i = 1; i < flat.n; i++) expect(flat.t[i]).toBeGreaterThanOrEqual(flat.t[i - 1])
  })
})
