import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useStore, type CameraMode } from '../store/store'
import { IconAxes, IconBird, IconCamera, IconChase, IconFrame, IconGlobe, IconLink, IconMoon, IconOrbit, IconSun, IconTag } from './icons'
import { setTheme, useTheme } from './theme'

/** The camera modes, as the View menu offers them. Follow, Chase and Bird's-eye need a tour or a route. */
const CAMERAS: Array<[CameraMode, string, string]> = [
  ['free', 'Free', 'You steer: drag to orbit, wheel to zoom, right-drag to pan.'],
  ['follow', 'Follow', 'The camera travels with the ship while it coasts; drag to look around it, wheel to zoom.'],
  ['chase', 'Chase', 'Third person from behind the ship, looking along its flight. The wheel moves closer or further.'],
  ['birdseye', "Bird's-eye", 'A fixed view straight down on the current leg; it moves only when the ship starts a new leg. The wheel zooms.'],
]

/**
 * The view toolbar, the same in both worlds: framing, what is drawn, the camera, and the link.
 * The camera mode and the tour's drawing options sit in one View menu so they are reachable from
 * every tab, not only the Mission tab.
 */
export function CameraButtons() {
  const requestCamera = useStore((s) => s.requestCamera)
  const showAxes = useStore((s) => s.showAxes)
  const showLabels = useStore((s) => s.showLabels)
  const toggleAxes = useStore((s) => s.toggleAxes)
  const toggleLabels = useStore((s) => s.toggleLabels)
  const hasSelection = useStore((s) => s.selectedId !== null)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // On narrow screens this row sits above the timeline and the Elements sheet stacks on top of it,
  // so its height (one row or several, depending on wrapping) has to be measured.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--buttons-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div ref={ref} className="panel topright toolbar" role="toolbar" aria-label="view">
      <div className="tool-group">
        <button className="tool" onClick={() => requestCamera('body')} title="Frame the central body"><IconGlobe /><span>Frame body</span></button>
        <button className="tool" onClick={() => requestCamera('orbit')} disabled={!hasSelection} title="Frame the selected orbit"><IconOrbit /><span>Frame orbit</span></button>
        <button className="tool" onClick={() => requestCamera('all')} title="Frame every orbit and the tour"><IconFrame /><span>Frame all</span></button>
      </div>
      <div className="tool-group">
        <button className={showAxes ? 'tool toggle on' : 'tool toggle'} onClick={toggleAxes} aria-pressed={showAxes} title="Inertial axes"><IconAxes /><span>Axes</span></button>
        <button className={showLabels ? 'tool toggle on' : 'tool toggle'} onClick={toggleLabels} aria-pressed={showLabels} title="Satellite and ship labels"><IconTag /><span>Labels</span></button>
      </div>
      <div className="tool-group">
        <ViewMenu />
      </div>
      <div className="tool-group">
        <button
          className="tool"
          onClick={() => { navigator.clipboard?.writeText(location.href).then(() => setCopied(true)).catch(() => undefined) }}
          title="Copy a shareable link to this scenario"
        >
          <IconLink /><span>{copied ? 'Copied' : 'Copy link'}</span>
        </button>
        <span className="visually-hidden" role="status">{copied ? 'Link copied' : ''}</span>
        <ThemeButton />
      </div>
    </div>
  )
}

function ThemeButton() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button className="tool" onClick={() => setTheme(next)} title={`Switch to the ${next} theme`}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  )
}

const MODE_ICON: Record<CameraMode, typeof IconChase> = { free: IconCamera, follow: IconCamera, chase: IconChase, birdseye: IconBird }

/** Camera mode and the tour's drawing options, in a small menu under one toolbar button. */
function ViewMenu() {
  const cameraMode = useStore((s) => s.cameraMode)
  const hasPlan = useStore((s) => s.plan !== null)
  const showRemaining = useStore((s) => s.showRemaining)
  const showBurnLabels = useStore((s) => s.showBurnLabels)
  const { setCameraMode, toggleRemaining, toggleBurnLabels, requestCamera } = useStore.getState()
  const [open, setOpen] = useState(false)
  const [placement, setPlace] = useState<CSSProperties>({})
  const box = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  // The toolbar may scroll sideways on a narrow screen and clips what overflows it, so the menu is
  // rendered into <body> and placed against the window: under the button (or over it when the
  // toolbar sits at the bottom), its right edge on the button's, and always inside the window.
  const place = () => {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(340, window.innerWidth - 16)
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    setPlace(r.top > window.innerHeight / 2 ? { left, width, bottom: window.innerHeight - r.top + 6 } : { left, width, top: r.bottom + 6 })
  }
  const toggle = () => {
    if (!open) place()
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const inside = (n: Node) => !!(box.current?.contains(n) || menu.current?.contains(n))
    const onDown = (e: PointerEvent) => { if (!inside(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [open])

  const Icon = MODE_ICON[cameraMode]
  const label = CAMERAS.find(([m]) => m === cameraMode)?.[1] ?? 'Free'
  const hint = CAMERAS.find(([m]) => m === cameraMode)?.[2]
  return (
    <div className="menu-wrap" ref={box}>
      <button ref={button} className={open ? 'tool toggle on' : 'tool'} aria-haspopup="true" aria-expanded={open} onClick={toggle}
        title="Camera and tour drawing">
        <Icon /><span>View: {label}</span>
      </button>
      {open && createPortal(
        <div ref={menu} className="menu" role="group" aria-label="camera and tour drawing" style={placement}>
          <div className="menu-title">Camera</div>
          <div className="seg menu-seg" role="radiogroup" aria-label="camera">
            {CAMERAS.map(([mode, name]) => (
              <button key={mode} role="radio" aria-checked={cameraMode === mode} className={cameraMode === mode ? 'on' : ''}
                disabled={mode !== 'free' && !hasPlan} onClick={() => setCameraMode(mode)}>{name}</button>
            ))}
          </div>
          <p className="hint">{hasPlan ? hint : 'Plan a tour on the Mission tab, or fly a path or run an algorithm on the Asteroids tab, to follow the ship.'}</p>
          <div className="menu-title">Tour</div>
          <div className="row">
            <button className={showRemaining ? 'toggle on' : 'toggle'} aria-pressed={showRemaining} onClick={toggleRemaining} disabled={!hasPlan}>Remaining path</button>
            <button className={showBurnLabels ? 'toggle on' : 'toggle'} aria-pressed={showBurnLabels} onClick={toggleBurnLabels} disabled={!hasPlan}>Burn labels</button>
            <button onClick={() => requestCamera('ship')} disabled={!hasPlan}>Frame tour</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
