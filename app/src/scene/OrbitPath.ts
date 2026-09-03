/** A closed (or one-period) orbit path as a line, plus a short glowing trail behind the satellite. */
import * as THREE from 'three'
import type { Vec3 } from '../types'
import { kmToScene } from './frame'

export class OrbitPath {
  readonly line: THREE.Line
  private readonly material: THREE.LineBasicMaterial

  constructor(color: string) {
    this.material = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.85 })
    this.line = new THREE.Line(new THREE.BufferGeometry(), this.material)
    this.line.frustumCulled = false
  }

  setPoints(points: Vec3[]): void {
    const arr = new Float32Array(points.length * 3)
    const v = new THREE.Vector3()
    points.forEach((p, k) => {
      kmToScene(p, v)
      arr[k * 3] = v.x
      arr[k * 3 + 1] = v.y
      arr[k * 3 + 2] = v.z
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    this.line.geometry.dispose()
    this.line.geometry = geo
    geo.computeBoundingSphere()
  }

  setColor(color: string): void {
    this.material.color.set(color)
  }

  setEmphasis(selected: boolean, anySelected: boolean): void {
    this.material.opacity = selected ? 1.0 : anySelected ? 0.3 : 0.75
  }

  boundingSphere(): THREE.Sphere | null {
    return this.line.geometry.boundingSphere
  }

  dispose(): void {
    this.line.geometry.dispose()
    this.material.dispose()
  }
}
