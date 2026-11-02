import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateInstance } from '../../src/arp/instance'
import { useArp } from '../../src/arp/store'
import { defaultScenario, useStore } from '../../src/store/store'

describe('the asteroid store and the satellites world', () => {
  let answer: (v: Response) => void = () => {}

  beforeEach(() => {
    useStore.setState({ scenario: defaultScenario(), world: 'satellites', leftTab: 'satellites', stashed: {}, t: 0, plan: null, planStatus: 'idle' })
    useArp.setState({ instance: null, instanceSource: 'catalogue', n: 4, instanceSeed: 7, generating: false, status: 'idle' })
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not put the Sun into the satellites world when a catalogue answer lands after the user left', async () => {
    useStore.getState().setLeftTab('asteroids')
    useArp.getState().generate()
    useStore.getState().setLeftTab('satellites')
    const satellites = useStore.getState().scenario
    answer(new Response(JSON.stringify(generateInstance(4, 7)), { status: 200 }))
    await vi.waitFor(() => expect(useArp.getState().generating).toBe(false))
    expect(useArp.getState().instance?.asteroids).toHaveLength(4)   // the instance is taken
    expect(useStore.getState().scenario).toBe(satellites)            // but the satellites scene is untouched
    expect(useStore.getState().scenario.bodyId).toBe('earth')
  })

  it('keeps an opened instance when an older catalogue request answers afterwards', async () => {
    useStore.getState().setLeftTab('asteroids')
    useArp.getState().generate()
    const opened = generateInstance(3, 1)
    expect(useArp.getState().importInstance(JSON.stringify(opened))).toBeNull()
    answer(new Response(JSON.stringify(generateInstance(4, 7)), { status: 200 }))
    await new Promise((r) => setTimeout(r, 0))
    expect(useArp.getState().instance?.asteroids.map((a) => a.id)).toEqual(opened.asteroids.map((a) => a.id))
  })

  it('keeps the transfer choice when the instance is shown again', () => {
    useStore.getState().setLeftTab('asteroids')
    useStore.getState().setTransfer('lambert2')
    expect(useArp.getState().importInstance(JSON.stringify(generateInstance(3, 2)))).toBeNull()
    expect(useStore.getState().scenario.bodyId).toBe('sun')
    expect(useStore.getState().scenario.transfer).toBe('lambert2')
  })
})
