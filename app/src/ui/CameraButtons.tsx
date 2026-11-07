import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useStore, type CameraMode } from '../store/store'
import { IconBird, IconCamera, IconChase, IconExpand, IconFrame, IconGlobe, IconHelp, IconLink, IconMoon, IconOrbit, IconShrink, IconSun } from './icons'
import { setTheme, useTheme } from './theme'

/** The camera modes, as the View menu offers them. Follow, Chase and Bird's-eye need a tour or a route. */
const CAMERAS: Array<[CameraMode, string, string]> = [
  ['free', 'Free', 'You steer: drag to orbit, wheel to zoom, right-drag to pan.'],
  ['follow', 'Follow', 'The camera travels with the ship while it coasts; drag to look around it, wheel to zoom.'],
  ['chase', 'Chase', 'Third person from behind the ship, looking along its flight. The wheel moves closer or further.'],
  ['birdseye', "Bird's-eye", 'A fixed view straight down on the current leg; it moves only when the ship starts a new leg. The wheel zooms.'],
]

/**
 * The view toolbar, the same in both worlds, in three groups: where the camera looks (the framing
 * buttons), how the scene is drawn (the View menu: camera mode, labels, axes, the tour's drawing,
 * the panels), and the page itself (share link, theme, help, full screen).
 */
export function CameraButtons() {
  const requestCamera = useStore((s) => s.requestCamera)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
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
        <button className="tool" onClick={() => requestCamera('body')} title="Home: frame the central body (H)"><IconGlobe /><span>Frame body</span></button>
        <button className="tool" onClick={() => requestCamera('orbit')} disabled={!hasSelection} title="Frame the selected orbit (F)"><IconOrbit /><span>Frame orbit</span></button>
        <button className="tool" onClick={() => requestCamera('all')} title="Frame every orbit and the tour (A)"><IconFrame /><span>Frame all</span></button>
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
        <button className="tool" onClick={() => setHelpOpen(true)} title="Mouse, touch and keyboard controls (?)"><IconHelp /><span>Help</span></button>
        <FullscreenButton />
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

/** Full screen for the whole page, where the browser allows it. */
function FullscreenButton() {
  const [full, setFull] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  if (typeof document === 'undefined' || !document.fullscreenEnabled) return null
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }
  return (
    <button className="tool" onClick={toggle} aria-pressed={full} title={full ? 'Leave full screen' : 'Full screen'}>
      {full ? <IconShrink /> : <IconExpand />}<span>{full ? 'Exit full screen' : 'Full screen'}</span>
    </button>
  )
}

const MODE_ICON: Record<CameraMode, typeof IconChase> = { free: IconCamera, follow: IconCamera, chase: IconChase, birdseye: IconBird }

/** The camera mode and what the scene draws, in a small menu under one toolbar button. */
function ViewMenu() {
  const cameraMode = useStore((s) => s.cameraMode)
  const hasPlan = useStore((s) => s.plan !== null)
  const showRemaining = useStore((s) => s.showRemaining)
  const showBurnLabels = useStore((s) => s.showBurnLabels)
  const showAxes = useStore((s) => s.showAxes)
  const showLabels = useStore((s) => s.showLabels)
  const panelsHidden = useStore((s) => s.panelsHidden)
  const { setCameraMode, toggleRemaining, toggleBurnLabels, requestCamera, toggleAxes, toggleLabels, togglePanels } = useStore.getState()
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

  // Follow, Chase and Bird's-eye need a ship to follow: without a tour the camera is free, whatever was chosen
  const effective: CameraMode = hasPlan ? cameraMode : 'free'
  const Icon = MODE_ICON[effective]
  const label = CAMERAS.find(([m]) => m === effective)?.[1] ?? 'Free'
  const hint = CAMERAS.find(([m]) => m === effective)?.[2]
  return (
    <div className="menu-wrap" ref={box}>
      <button ref={button} className={open ? 'tool toggle on' : 'tool'} aria-haspopup="true" aria-expanded={open} onClick={toggle}
        title="Camera, labels and what the scene draws">
        <Icon /><span>View: {label}</span>
      </button>
      {open && createPortal(
        <div ref={menu} className="menu" role="group" aria-label="camera, labels and what the scene draws" style={placement}>
          <div className="menu-title">Camera</div>
          <div className="seg menu-seg" role="radiogroup" aria-label="camera">
            {CAMERAS.map(([mode, name], i) => (
              <button key={mode} role="radio" aria-checked={effective === mode} className={effective === mode ? 'on' : ''}
                disabled={mode !== 'free' && !hasPlan} onClick={() => setCameraMode(mode)} title={`${name} (${i + 1})`}>{name}</button>
            ))}
          </div>
          <p className="hint">{hasPlan ? hint : 'Plan a tour on the Mission tab, or fly a path or run an algorithm on the Asteroids tab, to follow the ship.'}</p>
          <div className="menu-title">Show</div>
          <div className="row">
            <button className={showLabels ? 'toggle on' : 'toggle'} aria-pressed={showLabels} onClick={toggleLabels} title="Names of the bodies and the ship (L)">Labels</button>
            <button className={showAxes ? 'toggle on' : 'toggle'} aria-pressed={showAxes} onClick={toggleAxes} title="The inertial axes">Axes</button>
            <button className={showRemaining ? 'toggle on' : 'toggle'} aria-pressed={showRemaining} onClick={toggleRemaining} disabled={!hasPlan} title="The dashed path still to fly">Remaining path</button>
            <button className={showBurnLabels ? 'toggle on' : 'toggle'} aria-pressed={showBurnLabels} onClick={toggleBurnLabels} disabled={!hasPlan} title="What each burn does and costs">Burn labels</button>
          </div>
          <div className="row">
            <button onClick={() => requestCamera('ship')} disabled={!hasPlan} title="Frame the whole tour">Frame tour</button>
            <button className={panelsHidden ? 'toggle on' : 'toggle'} aria-pressed={panelsHidden} onClick={togglePanels} title="Tuck the panels away and leave the scene (P)">Hide panels</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
