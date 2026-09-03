/** Inertial axes: x toward the reference direction (vernal equinox for Earth), z along the pole. */
import * as THREE from 'three'

export class InertialAxes {
  readonly group = new THREE.Group()
  private lines: THREE.Line[] = []

  setLength(len: number): void {
    for (const l of this.lines) {
      this.group.remove(l)
      l.geometry.dispose()
      ;(l.material as THREE.Material).dispose()
    }
    this.lines = []
    const axes: Array<[THREE.Vector3, number]> = [
      [new THREE.Vector3(1, 0, 0), 0xff6b6b],
      [new THREE.Vector3(0, 1, 0), 0x6bff95],
      [new THREE.Vector3(0, 0, 1), 0x6bb5ff],
    ]
    for (const [dir, color] of axes) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(len)])
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }))
      this.group.add(line)
      this.lines.push(line)
    }
  }
}
