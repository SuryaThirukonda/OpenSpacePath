/**
 * The ship on the tour: the launch vehicle while it climbs to orbit, shedding stages as they
 * separate, then the spacecraft. A glow point and a label mark it at any distance.
 */
import * as THREE from 'three'
import type { LaunchVehicle } from '../mission/types'
import { Attitude, orientationFrom } from './attitude'
import { buildSpacecraft, buildStack, SPACECRAFT_TAIL, type Model, type StackModel } from './models'
import { disposeSprite, getGlowTexture, makeLabelSprite, worldPerPixel } from './textures'

export class ShipMarker {
  readonly group = new THREE.Group()
  /** Carries the heading and the on-screen scale; the two vehicle models hang off it. */
  private readonly model = new THREE.Group()
  private readonly spacecraft: Model
  private stack: StackModel | null = null
  private stackKey = ''
  private dropped = 0
  private ascent = false
  private riding = false
  private labelBelow = false
  private readonly points: THREE.Points
  private readonly pointMat: THREE.PointsMaterial
  private readonly label: THREE.Sprite
  private readonly labelAspect: number
  private readonly attitude = new Attitude()
  private readonly target = new THREE.Quaternion()
  private readonly heading = new THREE.Vector3(0, 0, 1)
  private aimed = false

  constructor(name: string, color: string) {
    this.spacecraft = buildSpacecraft()
    this.model.add(this.spacecraft.group)
    this.group.add(this.model)

    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    this.pointMat = new THREE.PointsMaterial({
      size: 14, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7,
    })
    this.points = new THREE.Points(pg, this.pointMat)
    this.points.frustumCulled = false
    this.group.add(this.points)

    const { sprite, aspect } = makeLabelSprite(name, color)
    this.label = sprite
    this.label.center.set(-0.25, 0.5)
    this.labelAspect = aspect
    this.group.add(this.label)
  }

  /** The launch vehicle to show during an ascent, or null when the tour does not start on the ground. */
  setVehicle(vehicle: LaunchVehicle | null): void {
    const key = vehicle ? JSON.stringify(vehicle) : ''
    if (key === this.stackKey) return
    this.stackKey = key
    if (this.stack) {
      this.model.remove(this.stack.group)
      this.stack.dispose()
      this.stack = null
    }
    if (vehicle) {
      this.stack = buildStack(vehicle)
      this.model.add(this.stack.group)
    }
    this.applyPhase()
  }

  /** Which vehicle is flying: the stack with `dropped` lower stages gone during the ascent, the spacecraft afterwards. */
  setPhase(ascent: boolean, dropped: number): void {
    if (ascent === this.ascent && dropped === this.dropped) return
    this.ascent = ascent
    this.dropped = dropped
    this.applyPhase()
  }

  /** While the ship keeps station with a satellite it is drawn just behind it, not inside it. */
  setRiding(riding: boolean): void {
    if (riding === this.riding) return
    this.riding = riding
    this.placeLabel()
  }

  /** The label drops below the ship when another label (a body's) would sit on top of it. */
  setLabelBelow(below: boolean): void {
    if (below === this.labelBelow) return
    this.labelBelow = below
    this.placeLabel()
  }

  private placeLabel(): void {
    this.label.center.set(-0.25, this.riding || this.labelBelow ? 1.7 : 0.5)
  }

  private applyPhase(): void {
    const stacked = this.ascent && this.stack !== null
    this.spacecraft.group.visible = !stacked
    if (this.stack) {
      this.stack.group.visible = stacked
      // never drop the last stage: it carries the payload to orbit
      const gone = Math.min(this.dropped, this.stack.stageGroups.length - 1)
      this.stack.stageGroups.forEach((g, i) => { g.visible = i >= gone })
    }
  }

  /**
   * Position in the parent's (inertial) frame, and where the nose should point: along `aim` when
   * given (a burn is near), else along the velocity; `up` is the belly-down reference, away from
   * the body. The ship turns there at a bounded rate over `dtMs` of wall time, or at once when
   * `snap` (time jumped).
   */
  setState(position: THREE.Vector3, velocity: THREE.Vector3, aim: THREE.Vector3 | null, up: THREE.Vector3, dtMs: number, snap: boolean): void {
    this.group.position.copy(position)
    const dir = aim && aim.lengthSq() > 0 ? aim : velocity
    if (dir.lengthSq() > 0) {
      orientationFrom(dir, up, this.target)
      if (snap || !this.aimed) this.attitude.snap(this.target)
      else this.attitude.advance(this.target, Math.min(dtMs, 100) / 1000)
      this.aimed = true
    }
    this.model.quaternion.copy(this.attitude.q)
    this.attitude.forward(this.heading)
  }

  /** How far the nose still is from where it should point, radians; 0 once a slew is over. */
  slewRemaining(): number {
    return 2 * Math.acos(Math.min(1, Math.abs(this.attitude.q.dot(this.target))))
  }

  /**
   * Keep the vehicle a constant size on screen (15 px per model unit, times `factor`) and the
   * label constant. The close views pass a larger factor so the ship reads as an object, and
   * drop the glow point that would hide it.
   */
  updateScale(cameraDistance: number, viewportHeight: number, fovRad: number, factor = 1): void {
    const wpp = worldPerPixel(cameraDistance, viewportHeight, fovRad)
    const scale = wpp * 15 * factor
    this.model.scale.setScalar(scale)
    this.model.position.copy(this.heading).multiplyScalar(this.riding ? -3.2 * scale : 0)
    this.points.visible = factor < 2
    const h = 18 * wpp
    this.label.scale.set(h * this.labelAspect, h, 1)
  }

  /** Where the working engine's exhaust leaves the vehicle, in the parent's frame. */
  exhaustPosition(out: THREE.Vector3): THREE.Vector3 {
    let tail = SPACECRAFT_TAIL
    if (this.ascent && this.stack) {
      const lowest = Math.min(this.dropped, this.stack.tails.length - 1)
      tail = this.stack.tails[lowest]
    }
    return out.copy(this.group.position).add(this.model.position).addScaledVector(this.heading, -tail * this.model.scale.x)
  }

  setLabelVisible(v: boolean): void {
    this.label.visible = v
  }

  dispose(): void {
    this.spacecraft.dispose()
    this.stack?.dispose()
    this.points.geometry.dispose()
    this.pointMat.dispose()
    disposeSprite(this.label)
  }
}
