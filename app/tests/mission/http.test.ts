import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, detailText, plannerFetch } from '../../src/mission/http'

const response = (status: number, body: string) => new Response(body, { status })

describe('planner errors', () => {
  it('reads a sentence, a validation list, and nothing at all', () => {
    expect(detailText('no transfer at day 3')).toBe('no transfer at day 3')
    expect(detailText([{ loc: ['body', 'mission', 'stops'], msg: 'List should have at most 12 items' }]))
      .toBe('mission.stops: List should have at most 12 items')
    const many = Array.from({ length: 5 }, (_, k) => ({ loc: ['body', `f${k}`], msg: 'bad' }))
    expect(detailText(many)).toBe('f0: bad; f1: bad; f2: bad (and 2 more)')
    expect(detailText(null)).toBeNull()
    expect(detailText('  ')).toBeNull()
  })

  it('turns a gateway page into a sentence about the cold start', async () => {
    expect(await apiError(response(502, '<html>Bad Gateway</html>'))).toMatch(/starting up/)
    expect(await apiError(response(422, JSON.stringify({ detail: 'the order is empty' })))).toBe('the order is empty')
    expect(await apiError(response(500, ''))).toBe('the planner answered HTTP 500')
  })
})

describe('retry on a cold start', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('tries once more after a 502 and returns the second answer', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(response(502, 'down')).mockResolvedValueOnce(response(200, '{}'))
    vi.stubGlobal('fetch', fetchMock)
    const pending = plannerFetch('/api/health')
    await vi.advanceTimersByTimeAsync(1600)
    expect((await pending).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry an answer the planner meant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(422, '{"detail":"no"}'))
    vi.stubGlobal('fetch', fetchMock)
    expect((await plannerFetch('/api/plan')).status).toBe(422)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
