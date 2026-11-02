/**
 * Light or dark interface. The first visit follows the system; picking one in the toolbar keeps it
 * on this browser. The choice lives on <html data-theme>, which index.css reads. The 3D scene is
 * space, so it stays dark in both.
 */
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'orbit-lab.theme'
const listeners = new Set<() => void>()

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function saved(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** The theme in force: the viewer's pick if any, else the system's. */
export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme
  return set === 'light' || set === 'dark' ? set : systemTheme()
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* private mode: the pick lasts for this page */ }
  listeners.forEach((f) => f())
}

/** Apply a saved pick before the first paint, and follow the system while there is none. */
export function initTheme(): void {
  const pick = saved()
  if (pick) document.documentElement.dataset.theme = pick
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => listeners.forEach((f) => f()))
}

function subscribe(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'dark')
}
