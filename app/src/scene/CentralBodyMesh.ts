/** Stylised central body: shaded sphere, lat/lon wireframe, faint equatorial ring. Local z is the pole. */
import * as THREE from 'three'
import { DEG, TWO_PI } from '../core/constants'
import type { CentralBody } from '../types'
import { kmScalarToScene } from './frame'

export class CentralBodyMesh {
  readonly group = new THREE.Group()
  private body: CentralBody | null = null
  private sphere?: THREE.Mesh
  private grid?: THREE.LineSegments
  private ring?: THREE.Mesh

  setBody(body: CentralBody): void {
    if (this.body?.id === body.id) return
    this.dispose()
    this.body = body
    const R = kmScalarToScene(body.radius)

    const geo = new THREE.SphereGeometry(R, 96, 64)
    geo.rotateX(Math.PI / 2) // sphere poles along local z
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(body.color), roughness: 0.9, metalness: 0.0, emissive: new THREE.Color(body.color),
      emissiveIntensity: 0.12,
    })
    this.sphere = new THREE.Mesh(geo, mat)
    this.group.add(this.sphere)

    this.grid = new THREE.LineSegments(
      latLonGrid(R * 1.002, 30, 30, 72),
      new THREE.LineBasicMaterial({ color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.28 }),
    )
    this.group.add(this.grid)

    const ringGeo = new THREE.RingGeometry(R * 1.0, R * 1.6, 128)
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false,
    })
    this.ring = new THREE.Mesh(ringGeo, ringMat)
    this.group.add(this.ring)
  }

  /** Spin the sphere and grid about the pole by a given angle (rad); the equatorial ring stays fixed. */
  setSpin(angle: number): void {
    if (this.sphere) this.sphere.rotation.z = angle
    if (this.grid) this.grid.rotation.z = angle
  }

  dispose(): void {
    for (const o of [this.sphere, this.grid, this.ring]) {
      if (!o) continue
      this.group.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    this.sphere = this.grid = undefined
    this.ring = undefined
  }
}

/** Meridians and parallels as a LineSegments geometry, poles along z. */
function latLonGrid(R: number, latStepDeg: number, lonStepDeg: number, segs: number): THREE.BufferGeometry {
  const pts: number[] = []
  const push = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
  const p = (lat: number, lon: number) =>
    new THREE.Vector3(R * Math.cos(lat) * Math.cos(lon), R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat))
  for (let lat = -90 + latStepDeg; lat < 90; lat += latStepDeg) {
    for (let k = 0; k < segs; k++) {
      push(p(lat * DEG, (k / segs) * TWO_PI), p(lat * DEG, ((k + 1) / segs) * TWO_PI))
    }
  }
  for (let lon = 0; lon < 360; lon += lonStepDeg) {
    for (let k = 0; k < segs / 2; k++) {
      const a = -Math.PI / 2 + (k / (segs / 2)) * Math.PI
      const b = -Math.PI / 2 + ((k + 1) / (segs / 2)) * Math.PI
      push(p(a, lon * DEG), p(b, lon * DEG))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}
