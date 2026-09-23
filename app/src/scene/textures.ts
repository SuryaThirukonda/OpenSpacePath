/** Canvas-made textures shared by markers, the ship and burn effects. */
import * as THREE from 'three'

let glowTexture: THREE.Texture | null = null

export function getGlowTexture(): THREE.Texture {
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

export function makeLabelTexture(text: string, color: string): { tex: THREE.Texture; aspect: number } {
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

/** A label sprite anchored just right of its position; scale it with updateLabelScale. */
export function makeLabelSprite(text: string, color: string): { sprite: THREE.Sprite; aspect: number } {
  const { tex, aspect } = makeLabelTexture(text, color)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sprite.center.set(-0.08, 0.5)
  return { sprite, aspect }
}

export function disposeSprite(sprite: THREE.Sprite): void {
  const m = sprite.material as THREE.SpriteMaterial
  m.map?.dispose()
  m.dispose()
}

/** World units per pixel at a distance, for constant on-screen sizes. */
export function worldPerPixel(cameraDistance: number, viewportHeight: number, fovRad: number): number {
  return (2 * cameraDistance * Math.tan(fovRad / 2)) / viewportHeight
}
