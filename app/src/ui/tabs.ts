import type { KeyboardEvent } from 'react'
import { useArp } from '../arp/store'
import { useStore, type LeftTab } from '../store/store'

/** Open a left tab: the Satellites and Mission tabs look at the satellites world, the Asteroids tab at the asteroids. */
export function openTab(next: LeftTab): void {
  useStore.getState().setLeftTab(next)
  if (next === 'asteroids') useArp.getState().enterWorld()
}

/** Left and right arrows (and Home, End) move between the tabs of a tablist and focus the new one. */
export function arrowTabs<T extends string>(e: KeyboardEvent<HTMLElement>, order: T[], current: T, choose: (t: T) => void): void {
  const k = order.indexOf(current)
  const next = e.key === 'ArrowRight' ? order[(k + 1) % order.length]
    : e.key === 'ArrowLeft' ? order[(k - 1 + order.length) % order.length]
    : e.key === 'Home' ? order[0] : e.key === 'End' ? order[order.length - 1] : null
  if (!next) return
  e.preventDefault()
  choose(next)
  const list = e.currentTarget
  requestAnimationFrame(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}
