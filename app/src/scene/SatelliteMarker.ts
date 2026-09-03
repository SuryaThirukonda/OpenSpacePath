/** Satellite marker: a soft point sprite with a glow halo, plus a text label sprite. */
import * as THREE from 'three'

let glowTexture: THREE.Texture | null = null

function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTexture = new THREE.CanvasTexture(c)
  return glowTexture
}

function makeLabelTexture(text: string, color: string): { tex: THREE.Texture; aspect: number } {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const font = '600 28px system-ui, "Segoe UI", sans-serif'
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 24
  c.width = w
  c.height = 44
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(8,12,20,0.55)'
  ctx.fillRect(0, 0, w, 44)
  ctx.fillStyle = color
  ctx.fillText(text, 12, 22)
  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  return { tex, aspect: w / 44 }
}

export class SatelliteMarker {
  readonly group = new THREE.Group()
  private readonly points: THREE.Points
  private readonly pointMat: THREE.PointsMaterial
  private readonly label: THREE.Sprite
  private labelAspect = 1

  constructor(name: string, color: string) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    this.pointMat = new THREE.PointsMaterial({
      size: 14, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(geo, this.pointMat)
    this.points.frustumCulled = false
    this.group.add(this.points)

    const { tex, aspect } = makeLabelTexture(name, color)
    this.labelAspect = aspect
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    this.label.center.set(-0.08, 0.5)
    this.group.add(this.label)
  }

  setPosition(v: THREE.Vector3): void {
    this.group.position.copy(v)
  }

  /** Keep the label a constant on-screen size: scale by distance to the camera. */
  updateLabelScale(cameraDistance: number, viewportHeight: number, fovRad: number): void {
    const worldPerPixel = (2 * cameraDistance * Math.tan(fovRad / 2)) / viewportHeight
    const h = 18 * worldPerPixel
    this.label.scale.set(h * this.labelAspect, h, 1)
  }

  setLabelVisible(v: boolean): void {
    this.label.visible = v
  }

  setEmphasis(selected: boolean, anySelected: boolean): void {
    this.pointMat.size = selected ? 18 : 12
    this.pointMat.opacity = selected || !anySelected ? 1 : 0.55
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.pointMat.dispose()
    ;(this.label.material as THREE.SpriteMaterial).map?.dispose()
    this.label.material.dispose()
  }
}
