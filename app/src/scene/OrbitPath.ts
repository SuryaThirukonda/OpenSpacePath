/** A closed (or one-period) orbit path as a thick screen-space line. */
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { Vec3 } from '../types'
import { kmToScene } from './frame'
import { drawOnce, makeLineMaterial } from './lines'

const WIDTH = 2.4
const WIDTH_SELECTED = 3.4
const WIDTH_QUIET = 1.3

export class OrbitPath {
  readonly line: Line2
  private readonly material: LineMaterial
  private sphere: THREE.Sphere | null = null

  constructor(color: string) {
    this.material = makeLineMaterial({ color, width: WIDTH, opacity: 0.85 })
    drawOnce(this.material)   // no brighter beads where segments meet on a translucent orbit
    this.line = new Line2(new LineGeometry(), this.material)
    this.line.frustumCulled = false
  }

  setPoints(points: Vec3[]): void {
    const arr = new Float32Array(points.length * 3)
    const v = new THREE.Vector3()
    const pts: THREE.Vector3[] = []
    points.forEach((p, k) => {
      kmToScene(p, v)
      arr[k * 3] = v.x
      arr[k * 3 + 1] = v.y
      arr[k * 3 + 2] = v.z
      if (k % 4 === 0) pts.push(v.clone())
    })
    this.line.geometry.dispose()
    const geo = new LineGeometry()
    if (points.length >= 2) geo.setPositions(arr)
    this.line.geometry = geo
    this.line.visible = points.length >= 2
    this.sphere = pts.length ? new THREE.Sphere().setFromPoints(pts) : null
  }

  setColor(color: string): void {
    this.material.color.set(color)
  }

  /**
   * `quiet` draws the orbit thin and faint: a route is shown and this is not the body in play.
   * `hovered` brightens it while the pointer is over its body, without dimming the others.
   */
  setEmphasis(selected: boolean, anySelected: boolean, quiet = false, hovered = false): void {
    this.material.opacity = selected ? 1.0 : hovered ? 0.95 : anySelected ? 0.3 : quiet ? 0.28 : 0.8
    this.material.linewidth = selected || hovered ? WIDTH_SELECTED : quiet ? WIDTH_QUIET : WIDTH
  }

  boundingSphere(): THREE.Sphere | null {
    return this.sphere
  }

  dispose(): void {
    this.line.geometry.dispose()
    this.material.dispose()
  }
}
