import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/store'
import { IconX } from './icons'
import { setShortcutsEnabled, useShortcutsEnabled } from './keys'

const MOUSE: Array<[string, string]> = [
  ['Drag', 'Turn the view around what it looks at'],
  ['Right-drag, or Shift + drag', 'Pan'],
  ['Wheel', 'Zoom in and out'],
  ['Click a satellite, an asteroid or its name', 'Select it: its orbit is highlighted and the Elements panel shows its numbers'],
  ['Double-click one', 'Select it and fly to its orbit'],
  ['Click empty space', 'Clear the selection'],
]

const TOUCH: Array<[string, string]> = [
  ['One finger', 'Turn the view'],
  ['Two fingers', 'Zoom and pan'],
  ['Tap', 'Select'],
]

const KEYS: Array<[string[], string]> = [
  [['Space'], 'Play or pause'],
  [[',', '.'], 'Slower or faster'],
  [['[', ']'], 'Previous or next burn of the tour'],
  [['1', '2', '3', '4'], 'Camera: Free, Follow, Chase, Bird\'s-eye'],
  [['H'], 'Home: frame the central body'],
  [['F'], 'Frame the selection, or the tour'],
  [['A'], 'Frame everything'],
  [['L'], 'Labels on or off'],
  [['P'], 'Hide or show the panels'],
  [['Esc'], 'Clear the selection'],
  [['?'], 'This help'],
]

/** The controls, in one place: mouse, touch and keyboard, with the switch for single-key shortcuts. */
export function HelpDialog() {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore((s) => s.setHelpOpen)
  const shortcuts = useShortcutsEnabled()
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [open, setOpen])

  if (!open) return null
  return createPortal(
    <div className="dialog-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="dialog-head">
          <h2 id="help-title">Controls</h2>
          <button ref={close} className="icon" aria-label="close the help" onClick={() => setOpen(false)}><IconX /></button>
        </div>
        <div className="dialog-body">
          <section>
            <h3>Mouse</h3>
            <table className="keys">
              <tbody>{MOUSE.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
            </table>
          </section>
          <section>
            <h3>Touch</h3>
            <table className="keys">
              <tbody>{TOUCH.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
            </table>
          </section>
          <section>
            <h3>Keyboard</h3>
            <p className="hint">The keys work anywhere except while you type in a field; Space plays and pauses when no button has focus.</p>
            <table className="keys">
              <tbody>{KEYS.map(([ks, v]) => (
                <tr key={v}><th scope="row">{ks.map((k, i) => <span key={k}>{i > 0 && ' '}<kbd>{k}</kbd></span>)}</th><td>{v}</td></tr>
              ))}</tbody>
            </table>
            <label className="check">
              <input type="checkbox" checked={shortcuts} onChange={(e) => setShortcutsEnabled(e.target.checked)} />
              <span>Single-key shortcuts (letters, digits and punctuation). Space and Esc always work.</span>
            </label>
          </section>
          <section>
            <h3>Where things are</h3>
            <ul className="where">
              <li><b>Left panel.</b> Satellites builds the scene, Mission plans a tour between satellites, Asteroids plans and runs routes through an asteroid instance.</li>
              <li><b>Toolbar.</b> Framing, the View menu (camera, labels, tour drawing, panels), the share link, the theme, this help and full screen.</li>
              <li><b>Elements.</b> The selected object's orbit and where it is now.</li>
              <li><b>Timeline.</b> Play, scrub, step between burns, the rate and the span.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
