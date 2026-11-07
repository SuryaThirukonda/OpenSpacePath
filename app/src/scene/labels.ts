/**
 * Screen-space label layout. Every text label in the scene is a sprite drawn over everything else
 * (no depth test, so a globe, a line or a model never cuts a word in half); this pass decides, once
 * per frame after the camera is final, which labels show and on which side of their anchor:
 *
 * - a label whose anchor is behind the camera, or hidden from it by the central body, is dropped;
 * - the rest are placed in priority order (the ship, the selection and the leg in play first), each
 *   trying its usual side, then below, above and to the left, and dropped when all four would
 *   cover a label already placed;
 * - a label keeps the side it had last frame while that side is free, and one that was dropped
 *   needs a few pixels of extra room to come back, so labels do not flicker at a threshold.
 *
 * Plain geometry on screen rectangles plus one ray-sphere test: testable without a renderer.
 */
import * as THREE from 'three'

export interface LabelItem {
  sprite: THREE.Sprite
  /** placed first when larger */
  priority: number
  /** the owner wants it shown (the Labels toggle, the leg in focus, the body is drawn, ...) */
  wanted: boolean
  /** height on screen in CSS pixels; the width is height x aspect */
  height: number
  aspect: number
  /** the usual placement, as a sprite centre: (-0.2, 0.5) puts the text just right of the anchor */
  base: THREE.Vector2
  /** false keeps the label on its usual side or hides it (the coordinate labels on a globe) */
  movable: boolean
  /** what a click on the label selects, if anything */
  pick?: string
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface PlacedLabel {
  item: LabelItem
  rect: Rect
}

export interface LayoutView {
  camera: THREE.Camera
  /** viewport size in CSS pixels */
  width: number
  height: number
  /** the central body in world space; null when nothing can hide a label */
  occluder: { center: THREE.Vector3; radius: number } | null
}

interface Memory {
  shown: boolean
  slot: number
}

/** clear pixels kept between two labels */
const PAD = 2
/** extra room a dropped label needs before it comes back, less than the gap between stacked labels */
const RETURN_MARGIN = 3
/** pixels between a label and one stacked above or below it */
const STACK_GAP = 6

/** The sprite centres for the four sides tried, starting from the label's usual one. */
export function slotCenter(base: THREE.Vector2, slot: number, height: number, out: THREE.Vector2): THREE.Vector2 {
  const step = 1 + STACK_GAP / Math.max(height, 1)
  switch (slot) {
    case 1: return out.set(base.x, base.y + step)          // below
    case 2: return out.set(base.x, base.y - step)          // above
    case 3: return out.set(1 - base.x, base.y)             // mirrored to the left
    default: return out.copy(base)
  }
}

/** The screen rectangle (px, y down) of a label anchored at (x, y) with the given sprite centre. */
export function labelRect(x: number, y: number, height: number, aspect: number, center: THREE.Vector2): Rect {
  const w = height * aspect
  return { left: x - center.x * w, right: x + (1 - center.x) * w, top: y - (1 - center.y) * height, bottom: y + center.y * height }
}

export function overlaps(a: Rect, b: Rect, pad = PAD): boolean {
  return a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad
}

/** Whether the sphere hides `point` from `eye`: the segment between them enters the sphere before reaching the point. */
export function occludedBySphere(eye: THREE.Vector3, point: THREE.Vector3, center: THREE.Vector3, radius: number): boolean {
  const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z
  const fx = eye.x - center.x, fy = eye.y - center.y, fz = eye.z - center.z
  const a = dx * dx + dy * dy + dz * dz
  if (a === 0) return false
  const b = 2 * (fx * dx + fy * dy + fz * dz)
  const c = fx * fx + fy * fy + fz * fz - radius * radius
  if (c <= 0) return false   // the eye is inside the sphere: nothing sensible to hide
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 && t < 1
}

export class LabelLayout {
  private readonly memory = new WeakMap<THREE.Sprite, Memory>()
  private readonly anchor = new THREE.Vector3()
  private readonly eye = new THREE.Vector3()
  private readonly ndc = new THREE.Vector3()
  private readonly c = new THREE.Vector2()
  /** what was placed last frame, for picking labels with the mouse */
  placed: PlacedLabel[] = []

  run(items: LabelItem[], view: LayoutView): PlacedLabel[] {
    view.camera.getWorldPosition(this.eye)
    const candidates: Array<{ item: LabelItem; x: number; y: number; order: number }> = []
    items.forEach((item, order) => {
      item.sprite.visible = false
      if (!item.wanted || !item.sprite.parent) return
      item.sprite.getWorldPosition(this.anchor)
      if (view.occluder && occludedBySphere(this.eye, this.anchor, view.occluder.center, view.occluder.radius)) return
      this.ndc.copy(this.anchor).project(view.camera)
      if (this.ndc.z > 1 || this.ndc.z < -1) return   // behind the camera or past the far plane
      const x = ((this.ndc.x + 1) / 2) * view.width
      const y = ((1 - this.ndc.y) / 2) * view.height
      // well off screen: nothing to place (a label may still poke in from just outside the edge)
      if (x < -view.width * 0.5 || x > view.width * 1.5 || y < -view.height * 0.5 || y > view.height * 1.5) return
      candidates.push({ item, x, y, order })
    })
    candidates.sort((a, b) => b.item.priority - a.item.priority || a.order - b.order)
    const placed: PlacedLabel[] = []
    for (const { item, x, y } of candidates) {
      const mem = this.memory.get(item.sprite) ?? { shown: false, slot: 0 }
      const slots = item.movable ? [mem.shown ? mem.slot : 0, 0, 1, 2, 3].filter((s, i, all) => all.indexOf(s) === i) : [0]
      let chosen = -1
      let rect: Rect | null = null
      for (const slot of slots) {
        const r = labelRect(x, y, item.height, item.aspect, slotCenter(item.base, slot, item.height, this.c))
        const test = mem.shown ? r : { left: r.left - RETURN_MARGIN, right: r.right + RETURN_MARGIN, top: r.top - RETURN_MARGIN, bottom: r.bottom + RETURN_MARGIN }
        if (!placed.some((p) => overlaps(p.rect, test))) {
          chosen = slot
          rect = r
          break
        }
      }
      if (chosen < 0 || !rect) {
        this.memory.set(item.sprite, { shown: false, slot: mem.slot })
        continue
      }
      slotCenter(item.base, chosen, item.height, item.sprite.center)
      item.sprite.visible = true
      this.memory.set(item.sprite, { shown: true, slot: chosen })
      placed.push({ item, rect })
    }
    this.placed = placed
    return placed
  }
}

/** Make a label sprite draw over the scene: no depth test, after everything else. */
export function drawOnTop(sprite: THREE.Sprite): void {
  const m = sprite.material as THREE.SpriteMaterial
  m.depthTest = false
  m.depthWrite = false
  sprite.renderOrder = 10
}
