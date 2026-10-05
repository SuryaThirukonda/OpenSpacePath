import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

interface Bar {
  /** thumb height, px; 0 when everything fits */
  size: number
  /** thumb offset from the top of the track, px */
  top: number
  /** content continues above / below the visible part */
  up: boolean
  down: boolean
}

const NONE: Bar = { size: 0, top: 0, up: false, down: false }

/**
 * A scroll container with its own scrollbar. The content still scrolls natively (wheel, touch,
 * keyboard, find-in-page all work); the browser's scrollbar is hidden and a slim thumb is drawn
 * over the edge instead, so it takes no width, looks the same everywhere, and can be dragged.
 * The content fades out at whichever edge it continues past.
 */
export function ScrollArea({ className = '', contentClassName = '', children }: { className?: string; contentClassName?: string; children: ReactNode }) {
  const view = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const [bar, setBar] = useState<Bar>(NONE)

  const measure = useCallback(() => {
    const el = view.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const over = scrollHeight - clientHeight
    let next = NONE
    if (over > 1 && clientHeight > 0) {
      const size = Math.max(32, (clientHeight * clientHeight) / scrollHeight)
      next = { size, top: (scrollTop / over) * (clientHeight - size), up: scrollTop > 2, down: scrollTop < over - 2 }
    }
    setBar((p) => (p.size === next.size && p.top === next.top && p.up === next.up && p.down === next.down ? p : next))
  }, [])

  // The view resizes with the window; the content resizes when a section opens or a list grows.
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    if (view.current) observer.observe(view.current)
    if (content.current) observer.observe(content.current)
    return () => observer.disconnect()
  }, [measure])

  const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, top: view.current?.scrollTop ?? 0 }
  }
  const onThumbMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = view.current
    const d = drag.current
    if (!el || !d) return
    const travel = el.clientHeight - bar.size
    if (travel > 0) el.scrollTop = d.top + ((e.clientY - d.y) / travel) * (el.scrollHeight - el.clientHeight)
  }
  const onThumbUp = () => {
    drag.current = null
  }
  /** A click on the track pages toward the pointer. */
  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = view.current
    if (!el) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    el.scrollBy({ top: (y < bar.top ? -1 : 1) * el.clientHeight * 0.9, behavior: 'smooth' })
  }

  return (
    <div className={`scroll ${className}`} data-up={bar.up || undefined} data-down={bar.down || undefined}>
      <div className="scroll-view" ref={view} onScroll={measure}>
        <div className={contentClassName} ref={content}>{children}</div>
      </div>
      {bar.size > 0 && (
        <div className="scroll-track" onPointerDown={onTrackDown}>
          <div
            className="scroll-thumb"
            style={{ height: bar.size, transform: `translateY(${bar.top}px)` }}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
          />
        </div>
      )}
    </div>
  )
}
