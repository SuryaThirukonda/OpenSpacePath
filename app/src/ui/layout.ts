/**
 * The phone breakpoint, shared by the panels and index.css: at this width and below the panels
 * become full-width sheets and start collapsed. Keep it equal to the `max-width: 680px` rule there.
 */
export const NARROW_PX = 680
export const NARROW_QUERY = `(max-width: ${NARROW_PX}px)`

export function isNarrowScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
}
