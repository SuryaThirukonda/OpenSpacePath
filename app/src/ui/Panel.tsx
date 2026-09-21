import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Layout class: left, right, bottom. */
  position: 'left' | 'right' | 'bottom'
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

/** A dashboard panel with a header that collapses it to a slim tab. */
export function Panel({ position, title, defaultOpen = true, children }: Props) {
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
        <span className="panel-title">{title}</span>
        <button className="icon" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `collapse ${title}` : `expand ${title}`}>
          {open ? '−' : '+'}
        </button>
      </div>
      {open && <div className="panel-body">{children}</div>}
    </div>
  )
}
