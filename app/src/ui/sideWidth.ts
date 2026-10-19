/**
 * The width of the left dashboard, which the user drags: a CSS variable the panel and the
 * toolbar both read, remembered in this browser.
 */
export const WIDTH_KEY = 'orbitlab.sideWidth'
const MIN_W = 260

/** The widest the left panel may be: it must leave the right panel and some scene between. */
function maxSideWidth(): number {
  const right = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--right-w')) || 304
  return Math.max(MIN_W, Math.min(window.innerWidth * 0.6, window.innerWidth - right - 220))
}

/** Set the left panel's width, or clear it back to the stylesheet's default. */
export function applySideWidth(px: number | null): void {
  const root = document.documentElement.style
  if (px === null) root.removeProperty('--side-w')
  else root.setProperty('--side-w', `${Math.round(Math.min(Math.max(px, MIN_W), maxSideWidth()))}px`)
}

/** The width saved last time, applied once when the app loads. */
export function restoreSideWidth(): void {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (saved >= MIN_W && window.innerWidth > 680) applySideWidth(saved)
  } catch {
    // storage may be unavailable; the default width is fine
  }
}
