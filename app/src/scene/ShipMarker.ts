/** The spaceship: a small rocket pointed along its velocity, a glow point and a label. */
import * as THREE from 'three'
import { disposeSprite, getGlowTexture, makeLabelSprite, worldPerPixel } from './textures'

const UP = new THREE.Vector3(0, 0, 1)

export class ShipMarker {
  readonly group = new THREE.Group()
  private readonly model = new THREE.Group()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly darkMat: THREE.MeshStandardMaterial
  private readonly points: THREE.Points
  private readonly pointMat: THREE.PointsMaterial
  private readonly label: THREE.Sprite
  private readonly labelAspect: number
  private readonly q = new THREE.Quaternion()

  constructor(name: string, color: string) {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.3, roughness: 0.45, metalness: 0.1 })
    this.darkMat = new THREE.MeshStandardMaterial({ color: 0x55616d, emissive: 0x1c232a, roughness: 0.6, side: THREE.DoubleSide })
    // Built along +z (nose forward), which setState turns toward the velocity. About 1.6 units long.
    const along = (g: THREE.BufferGeometry, z: number, mat: THREE.Material) => {
      g.rotateX(Math.PI / 2) // cylinder axis y -> z
      g.translate(0, 0, z)
      this.geometries.push(g)
      this.model.add(new THREE.Mesh(g, mat))
    }
    along(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 16), 0, this.bodyMat)
    along(new THREE.ConeGeometry(0.2, 0.45, 16), 0.675, this.bodyMat)
    along(new THREE.CylinderGeometry(0.11, 0.19, 0.24, 14, 1, true), -0.57, this.darkMat)
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.BoxGeometry(0.28, 0.02, 0.34)
      fin.translate(0.32, 0, -0.3)
      fin.rotateZ((k * Math.PI) / 2)
      this.geometries.push(fin)
      this.model.add(new THREE.Mesh(fin, this.darkMat))
    }
    this.group.add(this.model)

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
      this.model.quaternion.copy(this.q)
    }
  }

  /**
   * Keep the rocket about 24 px long times `factor` and the label a constant size. The close
   * views pass a larger factor so the ship reads as an object rather than a marker, and drop the
   * glow point that would hide it.
   */
  updateScale(cameraDistance: number, viewportHeight: number, fovRad: number, factor = 1): void {
    const wpp = worldPerPixel(cameraDistance, viewportHeight, fovRad)
    this.model.scale.setScalar(wpp * 15 * factor)
    this.points.visible = factor < 2
    const h = 18 * wpp
    this.label.scale.set(h * this.labelAspect, h, 1)
  }

  setLabelVisible(v: boolean): void {
    this.label.visible = v
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    this.bodyMat.dispose()
    this.darkMat.dispose()
    this.points.geometry.dispose()
    this.pointMat.dispose()
    disposeSprite(this.label)
  }
}
