import { describe, expect, it } from 'vitest'
import { generateInstance } from '../../src/arp/instance'
import { emptyPath, nextEntry, parsePath, parsePathText, pathFile, pathFromEvaluation, pathInstance, pathProblems, pathRequest, pathText } from '../../src/arp/path'
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
    expect(parsePath('nope')).toMatch(/first line must be "ARP-PATH 1"/)
    expect(parsePath('{nope')).toBe('that is not JSON')
    expect(parsePath('{"format":"arp-run"}')).toMatch(/arp-path/)
    expect(parsePath(JSON.stringify({ format: 'arp-path', entries: [{ asteroid: { id: 'x', elements: { a: 1 } }, arrival: 1, delay: 0 }] }))).toMatch(/elements/)
    expect(parsePath(JSON.stringify({ format: 'arp-path', departure: 500, entries: path.entries }))).toMatch(/only leaves/)
  })

  it('round trips through the text format and resolves stops to the instance', () => {
    const path = { departure: 3, entries: [{ asteroid: inst.asteroids[1], arrival: 400, delay: 15 }, { asteroid: inst.asteroids[0], arrival: 900, delay: 0 }] }
    const text = pathText(inst, path)
    expect(text.split('\n')[0]).toBe('ARP-PATH 1')
    expect(text).toContain(`epoch: ${inst.epoch}`)
    const back = parsePathText(text, inst)
    expect(typeof back).not.toBe('string')
    if (typeof back === 'string') return
    expect(back.departure).toBe(3)
    expect(back.entries.map((e) => [e.asteroid.id, e.arrival, e.delay])).toEqual([[inst.asteroids[1].id, 400, 15], [inst.asteroids[0].id, 900, 0]])
    for (const [e, orig] of back.entries.map((e, k) => [e, path.entries[k]] as const)) {
      expect(e.asteroid.elements.a / orig.asteroid.elements.a).toBeCloseTo(1, 6)
      expect(e.asteroid.elements.i).toBeCloseTo(orig.asteroid.elements.i, 6)
    }
    // the file reader takes the text format as well as the JSON it used to export
    expect(parsePath(text, inst)).toEqual(back)
    expect(typeof parsePath(JSON.stringify(pathFile(inst, path)), inst)).not.toBe('string')
  })

  it('reads orbits typed by hand with units, and names the first thing that is wrong', () => {
    const good = `ARP-PATH 1
epoch: 2121-01-01T00:00:00Z
departure: 12 d
# a comment
Ceres: a=2.767 AU e=0.0785 i=10.59 deg raan=80.3 argp=73.6 M0=0.5 rad arrive=400 stay=10
Vesta: a=353000000km e=0.089 i=7.14 raan=103.8 argp=151.2 M0=20 arrive=900 id=vesta-4`
    const p = parsePathText(good, inst)
    expect(typeof p).not.toBe('string')
    if (typeof p === 'string') return
    expect(p.departure).toBe(12)
    expect(p.entries[0].asteroid.name).toBe('Ceres')
    expect(p.entries[0].asteroid.id).toBe('ceres')
    expect(p.entries[0].asteroid.elements.a).toBeCloseTo(2.767 * 149597870.7, 3)
    expect(p.entries[0].asteroid.elements.M0).toBeCloseTo(0.5, 12)
    expect(p.entries[0].asteroid.elements.i).toBeCloseTo((10.59 * Math.PI) / 180, 12)
    expect(p.entries[1].asteroid.id).toBe('vesta-4')
    expect(p.entries[1].asteroid.elements.a).toBe(353000000)
    expect(p.entries[1].delay).toBe(0)
    expect(parsePathText('hello', inst)).toMatch(/first line must be "ARP-PATH 1"/)
    expect(parsePathText('ARP-PATH 2\nX: a=1 e=0 i=0 raan=0 argp=0 M0=0 arrive=1', inst)).toMatch(/version 2/)
    expect(parsePathText('ARP-PATH 1\nX: a=1 e=0 i=0 raan=0 arrive=1', inst)).toMatch(/missing argp, M0/)
    expect(parsePathText('ARP-PATH 1\nX: a=1 e=0 i=0 raan=0 argp=0 M0=0 arrive=1 stay=2 parsecs', inst)).toMatch(/cannot read|unknown unit/)
    expect(parsePathText('ARP-PATH 1\nX: a=1 e=0 i=0 raan=0 argp=0 M0=0 stay=2', inst)).toMatch(/needs arrive/)
    expect(parsePathText('ARP-PATH 1\ndeparture: soon\nX: a=1 e=0 i=0 raan=0 argp=0 M0=0 arrive=1', inst)).toMatch(/departure must be a day number/)
    expect(parsePathText('ARP-PATH 1\nX a=1', inst)).toMatch(/needs a name followed by a colon/)
    expect(parsePathText('ARP-PATH 1\nX: a=1 e=0 i=0 raan=0 argp=0 M0=0 arrive=500\nY: a=1.5 e=0 i=0 raan=0 argp=0 M0=0 arrive=100', inst)).toMatch(/arrives on day 100/)
    // a stop with the instance asteroid's name but a different orbit is a body of its own
    const own = parsePathText(`ARP-PATH 1\n${inst.asteroids[0].name}: a=2.2 e=0.1 i=1 raan=2 argp=3 M0=4 arrive=300`, inst)
    expect(typeof own === 'string' ? own : own.entries[0].asteroid.id).not.toBe(inst.asteroids[0].id)
  })
})
