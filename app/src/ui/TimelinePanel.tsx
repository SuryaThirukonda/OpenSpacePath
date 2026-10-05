import { useState, type CSSProperties } from 'react'
import { absoluteDate, formatDuration, formatUtc, PLAYBACK_RATES } from '../core/time'
import { planStart } from '../mission/types'
import { epochMs, satellitePeriod, selectedSatellite, useStore } from '../store/store'
import { IconPause, IconPlay, IconReset } from './icons'
import { Panel } from './Panel'

/** Short labels for the rate buttons. */
const RATE_LABELS: Record<number, string> = { 1: '1×', 10: '10×', 60: '60×', 600: '600×', 3600: '1 h/s', 86400: '1 d/s', 864000: '10 d/s', 2592000: '30 d/s' }

const SPANS: Array<[string, number]> = [
  ['1 hour', 3600], ['6 hours', 21600], ['1 day', 86400], ['1 week', 604800], ['30 days', 2592000], ['1 year', 31557600], ['10 years', 315576000],
]

export function TimelinePanel() {
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.scenario.rate)
  const span = useStore((s) => s.scenario.spanSeconds)
  const epoch = useStore((s) => s.scenario.epoch)
  const eMs = useStore(epochMs)
  const bodyId = useStore((s) => s.scenario.bodyId)
  const selected = useStore(selectedSatellite)
  const { setT, togglePlaying, setRate, setSpan, setEpoch } = useStore.getState()
  const [customSpan, setCustomSpan] = useState('')
  const [epochDraft, setEpochDraft] = useState<string | null>(null)
  /** On phones the custom span and epoch fields stay folded until asked for. */
  const [more, setMore] = useState(false)

  const plan = useStore((s) => s.plan)
  const missionEnd = plan ? planStart(plan, useStore.getState().scenario.mission?.startT ?? 0) + plan.totalTime : null
  const selectedPeriod = selected ? satellitePeriod(selected, bodyId) : null
  const spanChoice =
    SPANS.find(([, s]) => s === span)?.[1] ??
    (selectedPeriod && Math.abs(span - selectedPeriod) < 1e-6 ? 'orbit' : missionEnd && Math.abs(span - missionEnd) < 1e-6 ? 'mission' : 'custom')
  const ticks = plan
    ? plan.legs.flatMap((l) => l.burns.map((b) => ({ t: b.t, label: b.label, leg: l.toStop })))
    : []

  const fill = span > 0 ? Math.min(100, Math.max(0, (100 * t) / span)) : 0

  return (
    <Panel position="bottom" title="Timeline">
      <div className="tl-main">
        <button className="play-btn" onClick={togglePlaying} aria-label={playing ? 'pause' : 'play'} title={playing ? 'Pause (space)' : 'Play (space)'}>
          {playing ? <IconPause width={18} height={18} /> : <IconPlay width={18} height={18} />}
        </button>
        <div className="scrub-wrap">
          <div className="ticks" aria-hidden="true">
            {ticks.filter((k) => k.t >= 0 && k.t <= span).map((k, i) => (
              <span key={i} className={`tick ${k.label}`} style={{ left: `${(100 * k.t) / span}%` }} title={`${k.label}, leg ${k.leg + 1}`} />
            ))}
          </div>
          <input
            className="scrub"
            type="range"
            min={0}
            max={span}
            step={span / 4000}
            value={Math.min(t, span)}
            aria-label="simulated time"
            style={{ '--fill': `${fill}%` } as CSSProperties}
            onChange={(e) => setT(Number(e.target.value))}
          />
          <div className="scrub-ends" aria-hidden="true"><span>epoch</span><span>+{formatDuration(span)}</span></div>
        </div>
        <div className="clock">
          <div className="clock-utc">{formatUtc(absoluteDate(eMs, t))}</div>
          <div className="clock-t">t = {formatDuration(t)}</div>
        </div>
      </div>
      <div className="tl-controls">
        <div className="ctl">
          <span>Rate</span>
          <div className="seg" role="group" aria-label="playback rate">
            {PLAYBACK_RATES.map(([r, l]) => (
              <button key={r} className={rate === r ? 'on' : ''} aria-pressed={rate === r} title={l} onClick={() => setRate(r)}>{RATE_LABELS[r] ?? `${r}×`}</button>
            ))}
          </div>
        </div>
        <label className="ctl">
          <span>Span</span>
          <select
            value={String(spanChoice)}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'orbit' && selectedPeriod) setSpan(selectedPeriod)
              else if (v === 'mission' && missionEnd) setSpan(missionEnd)
              else if (v === 'custom') setSpan(Number(customSpan) * 3600 || span)
              else setSpan(Number(v))
            }}
          >
            <option value="orbit" disabled={!selectedPeriod}>1 orbit of selected{selectedPeriod ? ` (${formatDuration(selectedPeriod)})` : ''}</option>
            <option value="mission" disabled={!missionEnd}>whole mission{missionEnd ? ` (${formatDuration(missionEnd)})` : ''}</option>
            {SPANS.map(([l, sp]) => (
              <option key={sp} value={sp}>{l}</option>
            ))}
            <option value="custom">custom</option>
          </select>
        </label>
        <button className="more-btn" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Less' : 'More'}</button>
        <div className={more ? 'tl-extra open' : 'tl-extra'}>
        <label className="ctl narrow">
          <span>Custom</span>
          <input
            type="number"
            min={0.01}
            step="any"
            value={customSpan}
            placeholder={(span / 3600).toFixed(2)}
            aria-label="custom span, hours"
            onChange={(e) => setCustomSpan(e.target.value)}
            onBlur={() => {
              const h = Number(customSpan)
              if (h > 0) setSpan(h * 3600)
            }}
          />
          <span>h</span>
        </label>
        <label className="ctl grow">
          <span>Epoch (UTC)</span>
          <input
            value={epochDraft ?? epoch}
            onChange={(e) => setEpochDraft(e.target.value)}
            onBlur={() => {
              if (epochDraft === null) return
              if (!Number.isNaN(Date.parse(epochDraft))) setEpoch(new Date(epochDraft).toISOString())
              setEpochDraft(null)
            }}
          />
        </label>
        <button onClick={() => setT(0)} title="Jump to the scenario epoch"><IconReset /> To epoch</button>
        </div>
      </div>
    </Panel>
  )
}
