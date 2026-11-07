import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { LabelLayout, labelRect, occludedBySphere, overlaps, slotCenter, type LabelItem } from '../../src/scene/labels'

const O = new THREE.Vector3(0, 0, 0)

describe('label occlusion by the central body', () => {
  const eye = new THREE.Vector3(10, 0, 0)
  it('hides a point on the far side and keeps one beside or in front of the body', () => {
    expect(occludedBySphere(eye, new THREE.Vector3(-10, 0, 0), O, 1)).toBe(true)
    expect(occludedBySphere(eye, new THREE.Vector3(-1.5, 0.2, 0), O, 1)).toBe(true)
    expect(occludedBySphere(eye, new THREE.Vector3(0, 5, 0), O, 1)).toBe(false)
    expect(occludedBySphere(eye, new THREE.Vector3(2, 0, 0), O, 1)).toBe(false)
    expect(occludedBySphere(eye, new THREE.Vector3(1.01, 0, 0), O, 1)).toBe(false)
  })
  it('hides nothing from an eye inside the sphere', () => {
    expect(occludedBySphere(new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(-10, 0, 0), O, 1)).toBe(false)
  })
})

describe('label rectangles and sides', () => {
  it('puts a label right of its anchor by default and below, above or left when moved', () => {
    const base = new THREE.Vector2(-0.2, 0.5)
    const c = new THREE.Vector2()
    const right = labelRect(100, 100, 20, 5, slotCenter(base, 0, 20, c))
    expect(right.left).toBeCloseTo(120)
    expect(right.right).toBeCloseTo(220)
    expect(right.top).toBeCloseTo(90)
    const below = labelRect(100, 100, 20, 5, slotCenter(base, 1, 20, c))
    expect(below.top).toBeGreaterThan(right.top + 20)
    const above = labelRect(100, 100, 20, 5, slotCenter(base, 2, 20, c))
    expect(above.bottom).toBeLessThan(right.bottom - 20)
    const left = labelRect(100, 100, 20, 5, slotCenter(base, 3, 20, c))
    expect(left.right).toBeCloseTo(80)
    expect(overlaps(right, below)).toBe(false)
    expect(overlaps(right, left)).toBe(false)
  })
})

describe('label layout', () => {
  // a camera 10 units out on +z looking at the origin, over a 1000 x 1000 viewport
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const scene = new THREE.Scene()
  const item = (x: number, y: number, priority: number, movable = true): LabelItem => {
    const sprite = new THREE.Sprite()
    sprite.position.set(x, y, 0)
    scene.add(sprite)
    return { sprite, priority, wanted: true, height: 18, aspect: 5, base: new THREE.Vector2(-0.2, 0.5), movable }
  }
  const view = { camera, width: 1000, height: 1000, occluder: null }

  it('places the more important of two crowded labels on its side and moves the other', () => {
    const layout = new LabelLayout()
    const low = item(0.02, 0, 10)
    const high = item(0, 0, 90)
    layout.run([low, high], view)
    expect(high.sprite.visible).toBe(true)
    expect(high.sprite.center.y).toBeCloseTo(0.5)
    // the next side tried is below, with a clear gap
    expect(low.sprite.visible).toBe(true)
    expect(low.sprite.center.y).toBeCloseTo(0.5 + 1 + 6 / 18)
  })

  it('drops a label that cannot move, and one the owner does not want', () => {
    const layout = new LabelLayout()
    const fixed = item(0.02, 0, 10, false)
    const first = item(0, 0, 90)
    const unwanted = item(3, 3, 50)
    unwanted.wanted = false
    layout.run([fixed, first, unwanted], view)
    expect(first.sprite.visible).toBe(true)
    expect(fixed.sprite.visible).toBe(false)
    expect(unwanted.sprite.visible).toBe(false)
  })

  it('hides labels behind the body or behind the camera', () => {
    const layout = new LabelLayout()
    const hidden = item(0, 0, 50)
    hidden.sprite.position.set(0, 0, -5)
    const behind = item(0, 0, 50)
    behind.sprite.position.set(0, 0, 20)
    layout.run([hidden, behind], { ...view, occluder: { center: O, radius: 2 } })
    expect(hidden.sprite.visible).toBe(false)
    expect(behind.sprite.visible).toBe(false)
  })

  it('keeps the side a label had while it stays free, so it does not hop back and forth', () => {
    const layout = new LabelLayout()
    const a = item(0, 0, 90)
    const b = item(0.02, 0, 10)
    layout.run([a, b], view)
    const side = b.sprite.center.y
    a.wanted = false   // the crowding label goes away: b keeps its side rather than jumping back
    layout.run([a, b], view)
    expect(b.sprite.center.y).toBeCloseTo(side)
  })
})
