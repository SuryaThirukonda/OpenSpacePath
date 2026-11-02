/**
 * Talking to the planner: one place that turns a failed response into a sentence, and retries
 * once when the serverless function is still starting (a cold start answers 502, 503 or 504).
 */

const RETRY_STATUSES = new Set([502, 503, 504])
const RETRY_DELAY_MS = 1500

/** FastAPI's `detail`: a sentence from our own routes, or a list of field errors from request validation. */
export function detailText(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length) {
    const parts = detail.map((d) => {
      if (!d || typeof d !== 'object') return String(d)
      const o = d as { loc?: unknown; msg?: unknown }
      const where = Array.isArray(o.loc) ? o.loc.filter((x) => x !== 'body').join('.') : ''
      const msg = typeof o.msg === 'string' ? o.msg : 'is not valid'
      return where ? `${where}: ${msg}` : msg
    })
    return parts.slice(0, 3).join('; ') + (parts.length > 3 ? ` (and ${parts.length - 3} more)` : '')
  }
  return null
}

/** The sentence for a response that is not ok. Reads the body, so call it once per response. */
export async function apiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  let detail: unknown = null
  try {
    detail = (JSON.parse(text) as { detail?: unknown }).detail
  } catch {
    // not JSON: a gateway page or an empty body
  }
  const said = detailText(detail)
  if (said) return said
  if (RETRY_STATUSES.has(res.status)) return 'the planner is starting up or busy; try again in a few seconds'
  return `the planner answered HTTP ${res.status}`
}

/** fetch, with one retry after a short wait when the function is starting up. A network error is retried too. */
export async function plannerFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init)
    if (!RETRY_STATUSES.has(res.status)) return res
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return fetch(input, init)
}

/** POST JSON and read JSON back, throwing an Error with the planner's sentence when it refuses. */
export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await plannerFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!res.ok) throw new Error(await apiError(res))
  return (await res.json()) as T
}
