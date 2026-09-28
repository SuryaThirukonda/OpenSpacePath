/**
 * Thick lines. WebGL draws plain lines one pixel wide whatever `linewidth` says, so orbit and
 * tour paths use three's Line2 (screen-space quads). Its material needs the viewport size to
 * turn a pixel width into geometry; every line material shares this one Vector2, which the
 * SceneManager updates on resize.
 */
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

export const LINE_RESOLUTION = new THREE.Vector2(1, 1)

export interface LineOptions {
  color?: string | number
  /** pixels */
  width: number
  opacity?: number
  vertexColors?: boolean
  dashed?: { dashSize: number; gapSize: number }
}

export function makeLineMaterial(o: LineOptions): LineMaterial {
  const m = new LineMaterial({
    color: o.vertexColors ? 0xffffff : new THREE.Color(o.color ?? '#ffffff').getHex(),
    linewidth: o.width,
    vertexColors: o.vertexColors ?? false,
    transparent: true,
    opacity: o.opacity ?? 1,
    dashed: o.dashed !== undefined,
    dashSize: o.dashed?.dashSize ?? 1,
    gapSize: o.dashed?.gapSize ?? 1,
    depthWrite: false,
  })
  m.resolution = LINE_RESOLUTION
  return m
}

/** Segments to draw for the flown and remaining halves of a polyline of n samples, k of them flown. */
export function segmentCounts(n: number, k: number): { flown: number; remaining: number } {
  if (n < 2) return { flown: 0, remaining: 0 }
  return { flown: Math.max(Math.min(k, n) - 1, 0), remaining: n - Math.min(Math.max(k, 1), n) }
}
