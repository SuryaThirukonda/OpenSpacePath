import { useState, type ReactNode } from 'react'

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
  return (
    <div className={`panel ${position}${open ? '' : ' collapsed'}`}>
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
