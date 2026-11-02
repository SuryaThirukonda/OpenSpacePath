import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultScenario, satellitesWorldCounts, useStore } from '../../src/store/store'

const sunScene = () => ({ bodyId: 'sun', epoch: '2121-01-01T00:00:00Z', satellites: [{ id: 'e', kind: 'kepler' as const, name: 'Earth', color: '#fff', elements: { a: 149597870.7, e: 0.0167, i: 0, raan: 0, argp: 1.8, M0: 6.2 } }], spanSeconds: 1e8, rate: 2592000 })

describe('two worlds in one scene', () => {
  beforeEach(() => {
    useStore.setState({ scenario: defaultScenario(), world: 'satellites', stashed: {}, t: 0, plan: null, planStatus: 'idle', selectedLeg: null, cameraMode: 'follow' })
  })

  it('stashes the satellites and starts the asteroids empty around the Sun', () => {
    const s = useStore.getState()
    s.setSolver('gooding1990')
    s.setT(1234)
    const satellites = useStore.getState().scenario
    s.switchWorld('asteroids')
    const now = useStore.getState()
    expect(now.world).toBe('asteroids')
    expect(now.scenario.bodyId).toBe('sun')
    expect(now.scenario.satellites).toEqual([])
    expect(now.scenario.solver).toBe('gooding1990')         // the user's choice travels across
    expect(now.t).toBe(0)
    expect(now.stashed.satellites?.scenario).toBe(satellites)
    expect(now.stashed.satellites?.t).toBe(1234)
    expect(now.cameraRequest?.kind).toBe('all')
    expect(satellitesWorldCounts(now).satellites).toBe(satellites.satellites.length)
  })

  it('brings each world back as it was left, with the plan it had', () => {
    const s = useStore.getState()
    s.switchWorld('asteroids')
    useStore.getState().loadScenario(sunScene())
    useStore.getState().setTransfer('lambert2')              // before the route: a transfer change drops any plan
    const plan = { legs: [], totalDv: 1, totalTime: 10, propellantLeft: -1, feasible: true }
    useStore.getState().loadRoute({ ship: { name: 'x', dryMass: 1, propellantMass: 0, isp: 1, maxThrust: 1, minBurnSpacing: 0 }, startT: 0, start: { kind: 'satellite', id: 'e' }, stops: [], departureWindow: 0 }, plan)
    useStore.getState().setT(500)
    useStore.getState().switchWorld('satellites')
    let now = useStore.getState()
    expect(now.world).toBe('satellites')
    expect(now.scenario.bodyId).toBe(defaultScenario().bodyId)
    expect(now.scenario.transfer).toBe('lambert2')           // carried over
    expect(now.plan).toBeNull()
    expect(now.cameraRequest?.kind).toBe('reset')
    useStore.getState().switchWorld('asteroids')
    now = useStore.getState()
    expect(now.scenario.bodyId).toBe('sun')
    expect(now.scenario.satellites.map((x) => x.id)).toEqual(['e'])
    expect(now.plan).toBe(plan)
    expect(now.t).toBe(500)
    // switching to the world already shown changes nothing
    const before = useStore.getState()
    useStore.getState().switchWorld('asteroids')
    expect(useStore.getState().scenario).toBe(before.scenario)
  })
})

describe('plan requests and world switches', () => {
  const mission = { ship: { name: 'x', dryMass: 1000, propellantMass: 500, isp: 300, maxThrust: 1000, minBurnSpacing: 0 }, startT: 0,
                    start: { kind: 'satellite' as const, id: defaultScenario().satellites[0].id },
                    stops: [{ satelliteId: defaultScenario().satellites[1].id, dwellSeconds: 0 }], departureWindow: 0 }
  const plan = { legs: [], totalDv: 1, totalTime: 10, propellantLeft: 1, feasible: true }
  let answer: (v: Response) => void = () => {}

  beforeEach(() => {
    useStore.setState({ scenario: { ...defaultScenario(), mission }, world: 'satellites', leftTab: 'satellites', stashed: {}, t: 0, plan: null, planStatus: 'idle', selectedLeg: null, cameraMode: 'follow' })
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('leaves a world whose plan was loading ready to plan again on return', async () => {
    const pending = useStore.getState().requestPlan()
    expect(useStore.getState().planStatus).toBe('loading')
    useStore.getState().setLeftTab('asteroids')
    expect(useStore.getState().world).toBe('asteroids')
    answer(new Response(JSON.stringify(plan), { status: 200 }))
    await pending
    expect(useStore.getState().plan).toBeNull()                 // the answer did not land in the asteroid world
    useStore.getState().setLeftTab('mission')
    expect(useStore.getState().world).toBe('satellites')
    expect(useStore.getState().planStatus).toBe('idle')         // not stuck on loading
  })

  it('drops a plan that comes back after its inputs changed', async () => {
    const pending = useStore.getState().requestPlan()
    useStore.getState().setTransfer('lambert2')
    answer(new Response(JSON.stringify(plan), { status: 200 }))
    await pending
    expect(useStore.getState().plan).toBeNull()
    expect(useStore.getState().planStatus).toBe('idle')
  })

  it("puts a world's plan out of date when the transfer changed while it was away", () => {
    useStore.getState().loadRoute(mission, plan)
    useStore.getState().setLeftTab('asteroids')
    useStore.getState().setTransfer('lambert2')
    useStore.getState().setLeftTab('satellites')
    expect(useStore.getState().plan).toBeNull()
    expect(useStore.getState().scenario.transfer).toBe('lambert2')
  })
})
