import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconMinus, IconPlus } from './icons'
import { ScrollArea } from './ScrollArea'

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

  return (
    <div ref={ref} className={`panel ${position}${open ? '' : ' collapsed'}`}>
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
