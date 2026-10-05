import { useEffect, useState } from 'react'
import type { SolverInfo } from '../arp/types'
import { FALLBACK_SOLVERS, lambertSolvers } from '../mission/api'

/** The solvers the planner offers, fetched once; the default alone until it answers. */
export function useSolvers(): SolverInfo[] {
  const [solvers, setSolvers] = useState<SolverInfo[]>(FALLBACK_SOLVERS)
  useEffect(() => {
    let live = true
    void lambertSolvers().then((list) => {
      if (live) setSolvers(list)
    })
    return () => {
      live = false
    }
  }, [])
  return solvers
}
