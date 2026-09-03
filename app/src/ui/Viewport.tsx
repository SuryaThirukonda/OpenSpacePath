import { useEffect, useRef } from 'react'
import { SceneManager } from '../scene/SceneManager'

/** Hosts the WebGL canvas. The SceneManager is created once and never re-rendered by React. */
export function Viewport() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const mgr = new SceneManager(ref.current)
    return () => mgr.dispose()
  }, [])
  return <div className="viewport" ref={ref} />
}
