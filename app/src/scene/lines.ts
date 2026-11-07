/**
 * Thick lines. WebGL draws plain lines one pixel wide whatever `linewidth` says, so orbit and
 * tour paths use three's Line2 (screen-space quads). Its material needs the viewport size to
 * turn a pixel width into geometry; Line2 sets it from the renderer's viewport before each draw.
 */
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

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
  return m
}

let stencilRef = 0

/**
 * Let one line draw each pixel only once. Line2 draws every segment as a quad with round ends, so
 * the ends of neighbouring segments overlap at each sample; a translucent line then blends twice
 * there and shows a bright bead at every sample, which reads as a dotted line. With a stencil
 * value of its own, the line skips pixels it has already drawn this frame (the renderer clears the
 * stencil every frame and needs `stencil: true`). Values cycle through 1..255; two lines sharing
 * one would only lose the pixels where they cross.
 */
export function drawOnce(m: THREE.Material): void {
  stencilRef = (stencilRef % 255) + 1
  m.stencilWrite = true
  m.stencilRef = stencilRef
  m.stencilFunc = THREE.NotEqualStencilFunc
  m.stencilZPass = THREE.ReplaceStencilOp
  m.stencilFail = THREE.KeepStencilOp
  m.stencilZFail = THREE.KeepStencilOp
}

/** Segments to draw for the flown and remaining halves of a polyline of n samples, k of them flown. */
export function segmentCounts(n: number, k: number): { flown: number; remaining: number } {
  if (n < 2) return { flown: 0, remaining: 0 }
  return { flown: Math.max(Math.min(k, n) - 1, 0), remaining: n - Math.min(Math.max(k, 1), n) }
}
