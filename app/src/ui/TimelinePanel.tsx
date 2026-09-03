import { useState } from 'react'
import { absoluteDate, formatDuration, formatUtc } from '../core/time'
import { epochMs, satellitePeriod, selectedSatellite, useStore } from '../store/store'

const RATES: Array<[number, string]> = [
  [1, '1x (real time)'], [10, '10x'], [60, '60x'], [600, '600x'], [3600, '3600x'], [86400, '1 day/s'],
]
const SPANS: Array<[string, number]> = [
  ['1 hour', 3600], ['6 hours', 21600], ['1 day', 86400], ['1 week', 604800], ['30 days', 2592000],
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

  const selectedPeriod = selected ? satellitePeriod(selected, bodyId) : null
  const spanChoice = SPANS.find(([, s]) => s === span)?.[1] ?? (selectedPeriod && Math.abs(span - selectedPeriod) < 1e-6 ? 'orbit' : 'custom')

  return (
    <div className="panel bottom">
      <div className="row timeline-row">
        <button className="primary play" onClick={togglePlaying} aria-label={playing ? 'pause' : 'play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={span}
          step={span / 4000}
          value={Math.min(t, span)}
          onChange={(e) => setT(Number(e.target.value))}
        />
        <div className="clock">
          <div>{formatUtc(absoluteDate(eMs, t))}</div>
          <div className="hint">t = {formatDuration(t)} of {formatDuration(span)}</div>
        </div>
      </div>
      <div className="row timeline-row controls-row">
        <label className="inline">
          <span>Rate</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {RATES.map(([r, l]) => (
              <option key={r} value={r}>{l}</option>
            ))}
          </select>
        </label>
        <label className="inline">
          <span>Span</span>
          <select
            value={String(spanChoice)}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'orbit' && selectedPeriod) setSpan(selectedPeriod)
              else if (v === 'custom') setSpan(Number(customSpan) * 3600 || span)
              else setSpan(Number(v))
            }}
          >
            <option value="orbit" disabled={!selectedPeriod}>1 orbit of selected{selectedPeriod ? ` (${formatDuration(selectedPeriod)})` : ''}</option>
            {SPANS.map(([l, s]) => (
              <option key={s} value={s}>{l}</option>
            ))}
            <option value="custom">custom</option>
          </select>
        </label>
        <label className="inline">
          <span>Custom, hours</span>
          <input
            type="number"
            min={0.01}
            step="any"
            value={customSpan}
            placeholder={(span / 3600).toFixed(2)}
            onChange={(e) => setCustomSpan(e.target.value)}
            onBlur={() => {
              const h = Number(customSpan)
              if (h > 0) setSpan(h * 3600)
            }}
          />
        </label>
        <label className="inline">
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
        <button onClick={() => setT(0)}>To epoch</button>
      </div>
    </div>
  )
}
