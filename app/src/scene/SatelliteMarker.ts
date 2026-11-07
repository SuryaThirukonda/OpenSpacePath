/**
 * A satellite: a small model held in its orbital attitude (solar wings along the orbit normal,
 * antennas toward the body), a soft glow point in the satellite's colour, and a text label.
 */
import * as THREE from 'three'
import { buildAsteroid, buildComsat, buildPlanet, buildStation, SATELLITE_COMPANION_UNITS, SATELLITE_UNITS, satelliteKind, type Model, type SatelliteKind } from './models'
import { drawOnTop, type LabelItem } from './labels'
import { getGlowTexture, makeLabelTexture } from './textures'

export class SatelliteMarker {
  readonly group = new THREE.Group()
  private readonly model: Model
  readonly kind: SatelliteKind
  /** the body's velocity at the last update, in the parent's frame (km/s) */
  readonly velocity = new THREE.Vector3()
  private readonly points: THREE.Points
  private readonly pointMat: THREE.PointsMaterial
  private readonly label: THREE.Sprite
  /** the label as the scene's label layout sees it; the scene sets its priority and what a click on it selects */
  readonly labelItem: LabelItem
  private readonly basis = new THREE.Matrix4()
  private readonly x = new THREE.Vector3()
  private readonly y = new THREE.Vector3()
  private readonly z = new THREE.Vector3()

  constructor(name: string, color: string, shape?: 'asteroid' | 'planet') {
    this.kind = satelliteKind(name, shape)
    this.model = this.kind === 'station' ? buildStation() : this.kind === 'asteroid' ? buildAsteroid(name) : this.kind === 'planet' ? buildPlanet(color) : buildComsat()
    this.group.add(this.model.group)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    this.pointMat = new THREE.PointsMaterial({
      size: 14, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75,
    })
    this.points = new THREE.Points(geo, this.pointMat)
    this.points.frustumCulled = false
    this.group.add(this.points)

    const { tex, aspect } = makeLabelTexture(name, color)
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    this.label.center.set(-0.2, 0.5)
    drawOnTop(this.label)
    this.group.add(this.label)
    this.labelItem = { sprite: this.label, priority: 50, wanted: true, height: 18, aspect, base: new THREE.Vector2(-0.2, 0.5), movable: true }
  }

  /**
   * Position and attitude from the orbital state (parent's inertial frame). The model's axes are
   * the local orbital frame: +z toward the body, +x along the direction of travel, +y opposite
   * the orbit normal.
   */
  setState(position: THREE.Vector3, velocity?: THREE.Vector3): void {
    this.group.position.copy(position)
    if (velocity) this.velocity.copy(velocity)
    if (!velocity || position.lengthSq() === 0 || this.kind === 'asteroid' || this.kind === 'planet') return // rocks have no attitude to hold
    this.z.copy(position).normalize().negate()
    this.y.copy(velocity).cross(position)
    if (this.y.lengthSq() < 1e-18) return
    this.y.normalize()
    this.x.copy(this.y).cross(this.z)
    this.basis.makeBasis(this.x, this.y, this.z)
    this.model.group.quaternion.setFromRotationMatrix(this.basis)
  }

  /**
   * Keep the model and the label a constant on-screen size: scale by distance to the camera.
   * `shipPixelsPerUnit` is set for the satellite the ship is visiting in a close view: it is then
   * drawn at its size next to the ship instead of as a small icon.
   */
  updateScale(cameraDistance: number, viewportHeight: number, fovRad: number, shipPixelsPerUnit = 0): void {
    const worldPerPixel = (2 * cameraDistance * Math.tan(fovRad / 2)) / viewportHeight
    const pixelsPerUnit = shipPixelsPerUnit > 0 ? (SATELLITE_COMPANION_UNITS[this.kind] * shipPixelsPerUnit) / SATELLITE_UNITS[this.kind] : 14
    this.model.group.scale.setScalar(worldPerPixel * pixelsPerUnit)
    this.points.visible = shipPixelsPerUnit === 0
    const h = this.labelItem.height * worldPerPixel
    this.label.scale.set(h * this.labelItem.aspect, h, 1)
  }

  /** Whether the label is wanted; the scene's label layout decides whether it fits. */
  setLabelVisible(v: boolean): void {
    this.labelItem.wanted = v
  }

  setEmphasis(selected: boolean, anySelected: boolean): void {
    this.pointMat.size = selected ? 18 : 12
    this.pointMat.opacity = selected ? 0.9 : anySelected ? 0.4 : 0.7
  }

  dispose(): void {
    this.model.dispose()
    this.points.geometry.dispose()
    this.pointMat.dispose()
    ;(this.label.material as THREE.SpriteMaterial).map?.dispose()
    this.label.material.dispose()
  }
}
