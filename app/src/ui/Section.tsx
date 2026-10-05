import { useState, type ReactNode } from 'react'
import { IconChevron } from './icons'

interface Props {
  title: string
  /** shown as a pill after the title */
  count?: number
  /** one line shown in the header while the section is closed, so its state is still visible */
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}

/** A titled block of a panel that folds away, so a long panel does not have to be one long scroll. */
export function Section({ title, count, summary, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={open ? 'sec open' : 'sec'}>
      <button type="button" className="sec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <IconChevron className="sec-chevron" />
        <span className="sec-title">{title}</span>
        {count !== undefined && <span className="pill">{count}</span>}
        {!open && summary && <span className="sec-summary">{summary}</span>}
      </button>
      {open && <div className="sec-body">{children}</div>}
    </section>
  )
}
