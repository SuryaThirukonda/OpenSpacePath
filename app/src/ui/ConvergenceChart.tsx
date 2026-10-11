import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { EvaluationRow } from '../arp/types'

/** Series colours for a dark surface, checked for colour-vision separation and contrast against the panel. */
const BEST = '#3987e5'
const EACH = '#d95926'
const SURFACE = '#0d121d'
const H = 150
const M = { left: 44, right: 50, top: 10, bottom: 24 }

/** Three or four round tick values that cover [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
  const span = Math.max(hi - lo, 1e-9)
  const raw = span / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Number(v.toFixed(10)))
  return out
}

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1))

/**
 * How the search went: the cost of each complete route the algorithm evaluated, and the best
 * found so far, against the number of evaluations (the plot the papers use to compare methods).
 * Hover or use the arrow keys to read a route; click or press Enter to draw it.
 */
export function ConvergenceChart({ rows, onPick }: { rows: EvaluationRow[]; onPick: (row: EvaluationRow) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  const [focus, setFocus] = useState<number | null>(null)
  const data = useMemo(() => rows.filter((r) => r.complete), [rows])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(Math.max(220, Math.round(el.clientWidth))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (data.length === 0) return <div ref={box} className="chart empty">No complete route evaluated yet.</div>

  const n = Math.max(data[data.length - 1].index, 2)
  const costs = data.map((r) => r.cost)
  const lo0 = Math.min(...costs)
  const hi0 = Math.max(...costs)
  const pad = Math.max((hi0 - lo0) * 0.08, hi0 * 0.004, 0.5)
  const lo = lo0 - pad
  const hi = hi0 + pad
  const x = (i: number) => M.left + ((i - 1) / (n - 1)) * (width - M.left - M.right)
  const y = (c: number) => M.top + (1 - (c - lo) / (hi - lo)) * (H - M.top - M.bottom)
  const yTicks = ticks(lo, hi)
  const last = data[data.length - 1]
  // the best so far holds until the next improvement: a step line
  let step = ''
  data.forEach((r, k) => {
    const b = r.best ?? r.cost
    step += k === 0 ? `M${x(r.index).toFixed(1)},${y(b).toFixed(1)}` : `H${x(r.index).toFixed(1)}V${y(b).toFixed(1)}`
  })
  const active = focus !== null ? data[Math.min(focus, data.length - 1)] : null

  const nearest = (clientX: number, target: Element): number => {
    const px = clientX - target.getBoundingClientRect().left
    let best = 0
    for (let k = 1; k < data.length; k++) if (Math.abs(x(data[k].index) - px) < Math.abs(x(data[best].index) - px)) best = k
    return best
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => setFocus(nearest(e.clientX, e.currentTarget))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const k = focus ?? data.length - 1
    if (e.key === 'ArrowLeft') setFocus(Math.max(0, k - 1))
    else if (e.key === 'ArrowRight') setFocus(Math.min(data.length - 1, k + 1))
    else if (e.key === 'Home') setFocus(0)
    else if (e.key === 'End') setFocus(data.length - 1)
    else if (e.key === 'Enter' || e.key === ' ') onPick(data[k])
    else return
    e.preventDefault()
  }
  const r = data.length > 120 ? 3 : 4
  const tipLeft = active ? Math.min(Math.max(x(active.index), 70), width - 70) : 0

  return (
    <div ref={box} className="chart">
      <div className="legend" aria-hidden="true">
        <span><svg width="18" height="8"><path d="M1,4H17" stroke={BEST} strokeWidth="2" strokeLinecap="round" /></svg>Best so far</span>
        <span><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={EACH} /></svg>Each route</span>
      </div>
      <svg
        width={width} height={H} role="img" tabIndex={0}
        aria-label={`Cost of ${data.length} evaluated routes; the best is ${fmt(last.best ?? last.cost)}. Arrow keys read the routes, Enter draws one.`}
        onPointerMove={onMove} onPointerLeave={() => setFocus(null)} onBlur={() => setFocus(null)}
        onFocus={() => setFocus((f) => f ?? data.length - 1)} onKeyDown={onKey}
        onClick={(e) => onPick(data[nearest(e.clientX, e.currentTarget)])}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="tick">{fmt(t)}</text>
          </g>
        ))}
        <line x1={M.left} x2={width - M.right} y1={H - M.bottom} y2={H - M.bottom} className="axis" />
        <text x={M.left} y={H - 6} textAnchor="start" className="tick">1</text>
        <text x={width - M.right} y={H - 6} textAnchor="end" className="tick">{n} evaluations</text>
        {active && <line x1={x(active.index)} x2={x(active.index)} y1={M.top} y2={H - M.bottom} className="crosshair" />}
        {data.map((d) => (
          <circle key={d.index} cx={x(d.index)} cy={y(d.cost)} r={active === d ? r + 1.5 : r} fill={EACH} stroke={SURFACE} strokeWidth="2" />
        ))}
        <path d={step} fill="none" stroke={BEST} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.index)} cy={y(last.best ?? last.cost)} r="4" fill={BEST} stroke={SURFACE} strokeWidth="2" />
        <text x={x(last.index) + 8} y={y(last.best ?? last.cost)} dy="0.32em" className="end-label">{fmt(last.best ?? last.cost)}</text>
      </svg>
      {active && (
        <div className="chart-tip" style={{ left: tipLeft }} role="status">
          <div className="tip-head">Route {active.index}</div>
          <div><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={EACH} /></svg><b>{fmt(active.cost)}</b> this route</div>
          <div><svg width="14" height="8"><path d="M1,4H13" stroke={BEST} strokeWidth="2" strokeLinecap="round" /></svg><b>{fmt(active.best ?? active.cost)}</b> best so far</div>
        </div>
      )}
    </div>
  )
}
