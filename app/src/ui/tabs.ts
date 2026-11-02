import { useArp } from '../arp/store'
import { useStore, type LeftTab } from '../store/store'

/** Open a left tab: the Satellites and Mission tabs look at the satellites world, the Asteroids tab at the asteroids. */
export function openTab(next: LeftTab): void {
  useStore.getState().setLeftTab(next)
  if (next === 'asteroids') useArp.getState().enterWorld()
}
