/**
 * The ship on the tour: the launch vehicle while it climbs to orbit, shedding stages as they
 * separate, then the spacecraft. A glow point and a label mark it at any distance.
 */
import * as THREE from 'three'
import type { LaunchVehicle } from '../mission/types'
import { Attitude, orientationFrom } from './attitude'
import { drawOnTop, type LabelItem } from './labels'
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
  private readonly points: THREE.Points
  private readonly pointMat: THREE.PointsMaterial
  private readonly label: THREE.Sprite
  /** the ship's label as the scene's label layout sees it: placed before every other label */
  readonly labelItem: LabelItem
  private readonly attitude = new Attitude()
  private readonly target = new THREE.Quaternion()
  private readonly lastTarget = new THREE.Quaternion()
  private readonly heading = new THREE.Vector3(0, 0, 1)
  private aimed = false
  /** true while the nose swings onto a new direction of flight after a burn */
  private turning = false
  /** where the ship is drawn while riding: behind the body along the ride's direction, in ship units */
  private readonly rideDir = new THREE.Vector3(0, 0, 1)
  private offsetTarget = 0
  private offsetNow = 0

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
    drawOnTop(this.label)
    this.group.add(this.label)
    this.labelItem = { sprite, priority: 100, wanted: true, height: 18, aspect, base: new THREE.Vector2(-0.25, 0.5), movable: true }
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

  /**
   * While the ship keeps station with a satellite it is drawn just behind it, not inside it:
   * `clearance` is how far, in ship units, the body it rides with reaches from its centre.
   */
  setRiding(riding: boolean, clearance = 2.4): void {
    this.offsetTarget = riding ? clearance + 0.8 + 0.6 : 0   // the body's reach, half the ship, a gap
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
   * Position in the parent's (inertial) frame and the direction of flight: the nose points along
   * `forward` (the velocity, or for a rocket its velocity over the ground) at all times, with
   * `up`, away from the body, as the belly-down reference. The direction of flight only jumps at a
   * burn or a change of segment (`kicked`): the ship then swings onto it at a bounded rate over
   * `dtMs` of wall time, turning with the orbit as it goes, and holds it exactly from then on.
   * `snap` (time jumped) takes the new direction at once.
   */
  setState(position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3, dtMs: number, snap: boolean, kicked: boolean): void {
    this.group.position.copy(position)
    // the ride offset moves in and out over a fraction of a second instead of jumping
    if (forward.lengthSq() > 0) this.rideDir.copy(forward).normalize()
    this.offsetNow = snap ? this.offsetTarget : this.offsetNow + (this.offsetTarget - this.offsetNow) * (1 - Math.exp(-Math.min(dtMs, 100) / 140))
    if (forward.lengthSq() > 0) {
      orientationFrom(forward, up, this.target)
      if (snap || !this.aimed) {
        this.attitude.snap(this.target)
        this.turning = false
      } else {
        if (kicked) this.turning = true
        if (this.turning) {
          // follow the orbit's own turn, but not the burn's jump: that is the turn to make
          if (!kicked) this.attitude.carry(this.lastTarget, this.target)
          this.attitude.advance(this.target, Math.min(dtMs, 100) / 1000)
          if (this.attitude.angleTo(this.target) < 0.01) this.turning = false
        }
        if (!this.turning) this.attitude.snap(this.target)
      }
      this.lastTarget.copy(this.target)
      this.aimed = true
    }
    this.model.quaternion.copy(this.attitude.q)
    this.attitude.forward(this.heading)
  }

  /** The direction the nose points, in the parent's frame. */
  nose(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.heading)
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
    this.model.position.copy(this.rideDir).multiplyScalar(-this.offsetNow * scale)
    // the label and the glow mark the ship where it is drawn, not the centre of the body it rides with
    this.points.position.copy(this.model.position)
    this.label.position.copy(this.model.position)
    this.points.visible = factor < 2
    const h = 18 * wpp
    this.label.scale.set(h * this.labelItem.aspect, h, 1)
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

  /** Whether the label is wanted; the scene's label layout decides whether it fits. */
  setLabelVisible(v: boolean): void {
    this.labelItem.wanted = v
  }

  dispose(): void {
    this.spacecraft.dispose()
    this.stack?.dispose()
    this.points.geometry.dispose()
    this.pointMat.dispose()
    disposeSprite(this.label)
  }
}
