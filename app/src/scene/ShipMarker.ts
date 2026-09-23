/** The spaceship: a small cone pointed along its velocity, a glow point and a label. */
import * as THREE from 'three'
import { disposeSprite, getGlowTexture, makeLabelSprite, worldPerPixel } from './textures'

const UP = new THREE.Vector3(0, 0, 1)

export class ShipMarker {
  readonly group = new THREE.Group()
  private readonly body: THREE.Mesh
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly points: THREE.Points
  private readonly pointMat: THREE.PointsMaterial
  private readonly label: THREE.Sprite
  private readonly labelAspect: number
  private readonly q = new THREE.Quaternion()

  constructor(name: string, color: string) {
    const geo = new THREE.ConeGeometry(0.35, 1.2, 14)
    geo.rotateX(Math.PI / 2) // tip along +z, which setState turns toward the velocity
    this.bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.35, roughness: 0.5 })
    this.body = new THREE.Mesh(geo, this.bodyMat)
    this.group.add(this.body)

    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    this.pointMat = new THREE.PointsMaterial({
      size: 16, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
    })
    this.points = new THREE.Points(pg, this.pointMat)
    this.points.frustumCulled = false
    this.group.add(this.points)

    const { sprite, aspect } = makeLabelSprite(name, color)
    this.label = sprite
    this.labelAspect = aspect
    this.group.add(this.label)
  }

  /** Position and heading in the parent's (inertial) local frame. */
  setState(position: THREE.Vector3, velocity: THREE.Vector3): void {
    this.group.position.copy(position)
    if (velocity.lengthSq() > 0) {
      this.q.setFromUnitVectors(UP, velocity.clone().normalize())
      this.body.quaternion.copy(this.q)
    }
  }

  /** Keep the cone about 18 px long and the label a constant size. */
  updateScale(cameraDistance: number, viewportHeight: number, fovRad: number): void {
    const wpp = worldPerPixel(cameraDistance, viewportHeight, fovRad)
    this.body.scale.setScalar(wpp * 15)
    const h = 18 * wpp
    this.label.scale.set(h * this.labelAspect, h, 1)
  }

  setLabelVisible(v: boolean): void {
    this.label.visible = v
  }

  dispose(): void {
    this.body.geometry.dispose()
    this.bodyMat.dispose()
    this.points.geometry.dispose()
    this.pointMat.dispose()
    disposeSprite(this.label)
  }
}
