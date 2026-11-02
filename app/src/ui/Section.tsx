import { useState, type ReactNode } from 'react'
import { IconChevron } from './icons'

interface Props {
  title: string
  /** what the open/closed choice is remembered under; the title when absent */
  id?: string
  /** shown as a pill after the title */
  count?: number
  /** one line shown in the header while the section is closed, so its state is still visible */
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}

/** Open or closed, per section, for this visit: switching tabs and back leaves each section as it was. */
const remembered = new Map<string, boolean>()

/** A titled block of a panel that folds away, so a long panel does not have to be one long scroll. */
export function Section({ title, id, count, summary, defaultOpen = true, children }: Props) {
  const key = id ?? title
  const [open, setOpenState] = useState(() => remembered.get(key) ?? defaultOpen)
  const setOpen = (next: boolean) => {
    remembered.set(key, next)
    setOpenState(next)
  }
  return (
    <section className={open ? 'sec open' : 'sec'}>
      <h3 className="sec-h">
        <button type="button" className="sec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <IconChevron className="sec-chevron" />
          <span className="sec-title">{title}</span>
          {count !== undefined && <span className="pill">{count}</span>}
          {!open && summary && <span className="sec-summary">{summary}</span>}
        </button>
      </h3>
      {open && <div className="sec-body">{children}</div>}
    </section>
  )
}
