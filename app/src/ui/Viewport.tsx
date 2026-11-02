import { useEffect, useRef, useState } from 'react'
import { SceneManager } from '../scene/SceneManager'

/**
 * Hosts the WebGL canvas. The SceneManager is created once and never re-rendered by React. Without
 * WebGL (disabled, or a sandboxed browser) the panels still work: lists, forms, planning and runs
 * do not need the scene, so a notice takes the canvas's place instead of the whole page failing.
 */
export function Viewport() {
  const ref = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => {
    if (!ref.current) return
    let mgr: SceneManager
    try {
      mgr = new SceneManager(ref.current)
    } catch (e) {
      ref.current.replaceChildren()
      const message = (e as Error).message || 'WebGL is not available'
      queueMicrotask(() => setFailure(message))   // after the effect, so the notice is an ordinary update
      return
    }
    // Development only: lets an automated check read the scene (the ship's heading, for one)
    if (import.meta.env.DEV) Object.assign(window as object, { __orbitLabScene: mgr })
    return () => mgr.dispose()
  }, [])
  return (
    <div className="viewport" ref={ref}>
      {failure && (
        <div className="viewport-fallback" role="status">
          <p><b>The 3D view could not start.</b> This browser did not provide WebGL ({failure}).</p>
          <p>Everything in the panels still works: satellites, missions, planning, asteroid paths and algorithms. Turn on hardware acceleration, or open the page in another browser, to see the scene.</p>
        </div>
      )}
    </div>
  )
}
