/**
 * Keyboard shortcuts. The single-character ones (letters, digits, punctuation) act anywhere but in
 * a field being typed in, and can be turned off in the help dialog, as WCAG 2.1.4 asks of
 * character-key shortcuts. Space plays and pauses only while focus is on the page or the 3D view,
 * since on a focused button it presses the button; Escape clears the selection unless a menu or
 * dialog is open (it closes that instead).
 *
 *   Space      play / pause                 , .   slower / faster
 *   [ ]        previous / next burn          1-4   Free, Follow, Chase, Bird's-eye
 *   H          home view (the body)          F     frame the selection (or the tour)
 *   A          frame everything              L     labels on / off
 *   P          hide / show the panels        Esc   clear the selection
 *   ?          the help dialog
 */
import { useEffect, useSyncExternalStore } from 'react'
import { PLAYBACK_RATES } from '../core/time'
import type { MissionPlan } from '../mission/types'
import { useStore, type CameraMode } from '../store/store'

const KEY = 'orbit-lab.shortcuts'
const listeners = new Set<() => void>()

export function shortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setShortcutsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch { /* private mode: the choice lasts for this page */ }
  listeners.forEach((f) => f())
}

export function useShortcutsEnabled(): boolean {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, shortcutsEnabled, () => true)
}

/** The next playback rate up (`dir` 1) or down (-1) the offered ladder, staying at its ends. */
export function stepRate(rate: number, dir: 1 | -1): number {
  const rates = PLAYBACK_RATES.map(([r]) => r)
  let i = rates.findIndex((r) => r >= rate - 1e-9)
  if (i < 0) i = rates.length - 1
  if (rates[i] !== rate && dir === -1) return rates[Math.max(0, i - 1)]
  return rates[Math.min(rates.length - 1, Math.max(0, i + dir))]
}

/** The times of a plan's burns and launch events, in order. */
export function eventTimes(plan: MissionPlan): number[] {
  const ts = plan.legs.flatMap((l) => l.burns.filter((b) => b.magnitude > 0).map((b) => b.t))
  if (plan.launch) ts.push(...plan.launch.events.map((e) => e.t))
  return ts.sort((a, b) => a - b)
}

/** The first event after `t` (`dir` 1) or the last one before it (-1), or null at the ends. */
export function adjacentEvent(times: number[], t: number, dir: 1 | -1): number | null {
  const eps = 1e-6 * Math.max(1, Math.abs(t))
  if (dir === 1) return times.find((x) => x > t + eps) ?? null
  for (let i = times.length - 1; i >= 0; i--) if (times[i] < t - eps) return times[i]
  return null
}

const CAMERA_KEYS: Record<string, CameraMode> = { '1': 'free', '2': 'follow', '3': 'chase', '4': 'birdseye' }

/** Whether focus is somewhere a key press means nothing else: the page itself or the 3D view. */
function focusIsFree(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !el || el === document.body || el.tagName === 'CANVAS' || el.classList?.contains('viewport')
}

/** Whether the key goes into a field: a text input, a select, a text area or editable content. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['checkbox', 'radio', 'button', 'range', 'reset', 'submit', 'color'].includes(type)
}

export function useKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const s = useStore.getState()
      if (s.helpOpen) return   // the dialog handles its own keys
      if (e.code === 'Space') {
        if (e.repeat || !focusIsFree(e.target)) return
        e.preventDefault()
        s.togglePlaying()
        return
      }
      if (typingIn(e.target)) return
      if (e.key === 'Escape') {
        if (s.selectedId !== null && !document.querySelector('.menu')) s.select(null)
        return
      }
      if (!shortcutsEnabled() || e.repeat) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      let handled = true
      if (k === '?') s.setHelpOpen(true)
      else if (k === ',' || k === '<') s.setRate(stepRate(s.scenario.rate, -1))
      else if (k === '.' || k === '>') s.setRate(stepRate(s.scenario.rate, 1))
      else if (k === '[' || k === ']') {
        const t = s.plan ? adjacentEvent(eventTimes(s.plan), s.t, k === ']' ? 1 : -1) : null
        if (t === null) handled = false
        else s.setT(t)
      } else if (k in CAMERA_KEYS) {
        const mode = CAMERA_KEYS[k]
        if (mode !== 'free' && !s.plan) handled = false
        else s.setCameraMode(mode)
      } else if (k === 'h') s.requestCamera('body')
      else if (k === 'a') s.requestCamera('all')
      else if (k === 'f') s.requestCamera(s.selectedId ? 'orbit' : s.plan ? 'ship' : 'all')
      else if (k === 'l') s.toggleLabels()
      else if (k === 'p') s.togglePanels()
      else handled = false
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
