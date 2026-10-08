import { describe, expect, it } from 'vitest'
import { generateInstance } from '../../src/arp/instance'
import { emptyPath, nextEntry, parsePath, pathFile, pathFromEvaluation, pathInstance, pathProblems, pathRequest } from '../../src/arp/path'
import type { ArpEvaluation } from '../../src/arp/types'

const inst = generateInstance(4, 9)
const leg = (origin: number, target: number, tau: number, t: number) => ({ origin, target, eta: 0, tau, t, z: 1, dv: 1, dv1: 0.5, dv2: 0.5, dv3: 0, evals: 1, miss: 0, transfer: 'lambert2' as const, burns: 2 })

describe('a path written by hand', () => {
  it('names every problem that stops it from being flown', () => {
    expect(pathProblems(emptyPath())).toEqual(['add at least one asteroid'])
    const a = inst.asteroids
    const good = { departure: 10, entries: [{ asteroid: a[0], arrival: 300, delay: 20 }, { asteroid: a[1], arrival: 700, delay: 0 }] }
    expect(pathProblems(good)).toEqual([])
    const early = { ...good, entries: [good.entries[0], { asteroid: a[1], arrival: 310, delay: 0 }] }
    expect(pathProblems(early)[0]).toMatch(/arrives on day 310, but the spacecraft only leaves the previous body on day 320/)
    const twice = { ...good, entries: [good.entries[0], { asteroid: a[0], arrival: 900, delay: 0 }] }
    expect(pathProblems(twice)[0]).toMatch(/visited twice/)
    expect(pathProblems({ ...good, departure: 400 })[0]).toMatch(/only leaves the previous body on day 400/)
    expect(pathProblems({ ...good, entries: [{ asteroid: a[0], arrival: 300, delay: -1 }] })[0]).toMatch(/day numbers/)
  })

  it('suggests the next unused asteroid a year after the spacecraft is free', () => {
    const path = { departure: 5, entries: [{ asteroid: inst.asteroids[0], arrival: 200, delay: 30 }] }
    const next = nextEntry(inst, path)
    expect(next?.asteroid.id).toBe(inst.asteroids[1].id)
    expect(next?.arrival).toBe(595)
    const full = { departure: 0, entries: inst.asteroids.map((asteroid, k) => ({ asteroid, arrival: 100 * (k + 1), delay: 0 })) }
    expect(nextEntry(inst, full)).toBeNull()
  })

  it('comes from a route an algorithm found and keeps its times', () => {
    const ev: ArpEvaluation = { order: [3, 1], solver: 'izzo2015', transfer: 'lambert2', legs: [leg(0, 3, 12, 200), leg(3, 1, 40, 310)], cost: 2, dv: 2, time: 562 }
    const path = pathFromEvaluation(inst, ev)
    expect(path.departure).toBe(12)
    expect(path.entries.map((e) => [e.asteroid.id, e.arrival, e.delay])).toEqual([[inst.asteroids[2].id, 212, 40], [inst.asteroids[0].id, 562, 0]])
    expect(pathProblems(path)).toEqual([])
    // the instance view of the path lists its asteroids in visiting order, so leg k reads as k -> k+1
    const view = pathInstance(inst, path)
    expect(view.asteroids.map((a) => a.id)).toEqual([inst.asteroids[2].id, inst.asteroids[0].id])
    const req = pathRequest(inst, path, 'izzo2015', 'threeburn')
    expect(req.entries).toBe(path.entries)
    expect(req.transfer).toBe('threeburn')
    expect(req.earth).toBe(inst.earth)
  })

  it('round trips through its file and rejects broken files', () => {
    const path = { departure: 3, entries: [{ asteroid: inst.asteroids[1], arrival: 400, delay: 15 }] }
    const text = JSON.stringify(pathFile(inst, path))
    expect(parsePath(text)).toEqual(path)
    expect(parsePath('nope')).toBe('that is not JSON')
    expect(parsePath('{"format":"arp-run"}')).toMatch(/arp-path/)
    expect(parsePath(JSON.stringify({ format: 'arp-path', entries: [{ asteroid: { id: 'x', elements: { a: 1 } }, arrival: 1, delay: 0 }] }))).toMatch(/elements/)
    expect(parsePath(JSON.stringify({ format: 'arp-path', departure: 500, entries: path.entries }))).toMatch(/only leaves/)
  })
})
