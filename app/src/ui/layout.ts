/** Layout breakpoints shared by the panels and index.css. */

/** Below this width the panels become full-width sheets and start collapsed. */
export const NARROW_QUERY = '(max-width: 900px)'

export function isNarrowScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
}
