/**
 * Engine flare shown when the ship burns: an additive glow sprite and a short cone of exhaust
 * pointing opposite to the delta-v. It runs on wall-clock time so a 20 s burn is visible even at
 * one simulated day per second.
 */
import * as THREE from 'three'
import { getGlowTexture, worldPerPixel } from './textures'

const UP = new THREE.Vector3(0, 0, 1)

export class BurnEffect {
  readonly group = new THREE.Group()
  private readonly sprite: THREE.Sprite
  private readonly spriteMat: THREE.SpriteMaterial
  private readonly cone: THREE.Mesh
  private readonly coneMat: THREE.MeshBasicMaterial
  private startMs = 0
  private endMs = 0

  constructor(color = '#ffb347') {
    this.spriteMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    this.sprite = new THREE.Sprite(this.spriteMat)
    const geo = new THREE.ConeGeometry(0.28, 1.6, 12, 1, true)
    geo.rotateX(-Math.PI / 2) // base at the ship, tip along -z (set below to the exhaust direction)
    geo.translate(0, 0, -0.8)
    this.coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    this.cone = new THREE.Mesh(geo, this.coneMat)
    this.group.add(this.sprite, this.cone)
    this.group.visible = false
  }

  /** Start a flare along `exhaustDir` (unit vector in the parent frame) lasting `durationMs` of wall time. */
  trigger(exhaustDir: THREE.Vector3, durationMs: number, nowMs: number): void {
    this.cone.quaternion.setFromUnitVectors(UP, exhaustDir.clone().normalize().negate())
    this.startMs = nowMs
    this.endMs = nowMs + durationMs
    this.group.visible = true
  }

  /** Keep the flare lit this frame (a powered ascent); it fades out shortly after the last call. */
  sustain(exhaustDir: THREE.Vector3, nowMs: number): void {
    this.cone.quaternion.setFromUnitVectors(UP, exhaustDir.clone().normalize().negate())
    if (!this.group.visible || nowMs >= this.endMs) this.startMs = nowMs - 300
    this.endMs = nowMs + 300
    this.group.visible = true
  }

  get active(): boolean {
    return this.group.visible
  }

  update(nowMs: number, cameraDistance: number, viewportHeight: number, fovRad: number): void {
    if (!this.group.visible) return
    if (nowMs >= this.endMs) {
      this.group.visible = false
      return
    }
    const life = (nowMs - this.startMs) / (this.endMs - this.startMs)
    const env = Math.sin(Math.PI * Math.min(1, life)) // fade in and out
    const jitter = 0.85 + 0.3 * Math.random()
    const wpp = worldPerPixel(cameraDistance, viewportHeight, fovRad)
    this.sprite.scale.setScalar(wpp * 44 * env * jitter)
    this.cone.scale.set(wpp * 16 * jitter, wpp * 16 * jitter, wpp * 22 * env * jitter)
    this.spriteMat.opacity = 0.95 * env
    this.coneMat.opacity = 0.6 * env
  }

  dispose(): void {
    this.spriteMat.dispose()
    this.cone.geometry.dispose()
    this.coneMat.dispose()
  }
}
