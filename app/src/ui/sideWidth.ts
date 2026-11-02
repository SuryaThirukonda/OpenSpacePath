/**
 * The width of the left dashboard, which the user drags: a CSS variable the panel and the
 * toolbar both read, remembered in this browser.
 */
import { isNarrowScreen } from './layout'

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

function savedWidth(): number | null {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    return saved >= MIN_W ? saved : null
  } catch {
    return null   // storage may be unavailable; the default width is fine
  }
}

/** On a phone the panel is a full-width sheet, so a saved desktop width does not apply. */
function fit(): void {
  const saved = savedWidth()
  if (saved === null || isNarrowScreen()) applySideWidth(null)
  else applySideWidth(saved)
}

/** Apply the width saved last time, and keep it within the window as the window is resized or turned. Returns the cleanup. */
export function restoreSideWidth(): () => void {
  fit()
  window.addEventListener('resize', fit)
  return () => window.removeEventListener('resize', fit)
}
