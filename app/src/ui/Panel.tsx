import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { IconMinus, IconPlus } from './icons'
import { ScrollArea } from './ScrollArea'
import { applySideWidth, WIDTH_KEY } from './sideWidth'

interface Props {
  /** Layout class: left, right, bottom. */
  position: 'left' | 'right' | 'bottom'
  title: string
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * A dashboard panel with a header that collapses it to a slim tab. Side panels scroll inside
 * their own scroll area. The bottom panel has no header row of its own while open: its collapse
 * button sits in the corner, so the timeline starts at the top edge.
 */
export function Panel({ position, title, icon, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement>(null)

  // The side panels stop above the timeline, so publish its real height instead of hard-coding it.
  useEffect(() => {
    const el = ref.current
    if (!el || position !== 'bottom') return
    const publish = () =>
      document.documentElement.style.setProperty('--timeline-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [position])

  // the left panel's right edge is a handle: drag to widen or narrow it, double-click to reset
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    e.preventDefault()
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-side')
    const move = (ev: PointerEvent) => applySideWidth(startW + ev.clientX - startX)
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      document.body.classList.remove('resizing-side')
      try {
        localStorage.setItem(WIDTH_KEY, String(Math.round(el.getBoundingClientRect().width)))
      } catch {
        // not persisted; the width still holds for this visit
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }
  const onResizeReset = () => {
    applySideWidth(null)
    try {
      localStorage.removeItem(WIDTH_KEY)
    } catch {
      // nothing to forget
    }
  }

  return (
    <div ref={ref} className={`panel ${position}${open ? '' : ' collapsed'}`}>
      {position === 'left' && open && (
        <div className="panel-resize" role="separator" aria-orientation="vertical" aria-label="resize the dashboard" title="Drag to resize, double-click to reset"
          onPointerDown={onResizeStart} onDoubleClick={onResizeReset} />
      )}
      <div className="panel-header">
        <span className="panel-title">{icon}{title}</span>
        <button className="icon collapse" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `collapse ${title}` : `expand ${title}`}>
          {open ? <IconMinus /> : <IconPlus />}
        </button>
      </div>
      {open && (position === 'bottom'
        ? <div className="panel-body">{children}</div>
        : <ScrollArea className="panel-scroll" contentClassName="panel-body">{children}</ScrollArea>)}
    </div>
  )
}
