import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { birdsEyePose, chaseDistanceKm, chasePose, chaseUp, pathNormal, perpendicular } from '../../src/scene/cameraViews'

const POLE = new THREE.Vector3(0, 1, 0)

describe('chase camera', () => {
  const ship = new THREE.Vector3(6.8, 0, 0)
  const forward = new THREE.Vector3(0, 0, -1)
  const up = chaseUp(ship, forward, POLE)
  const pose = chasePose(ship, forward, up, 0.24)

  it('sits behind and above the ship and looks ahead of it', () => {
    const offset = pose.position.clone().sub(ship)
    expect(offset.dot(forward)).toBeCloseTo(-0.24, 9)
    expect(offset.dot(ship.clone().normalize())).toBeGreaterThan(0)
    expect(pose.target.clone().sub(ship).dot(forward)).toBeGreaterThan(0)
    // the ship is within three degrees of the centre of the view, so panels along the edges never cover it
    const view = pose.target.clone().sub(pose.position).normalize()
    const toShip = ship.clone().sub(pose.position).normalize()
    expect(toShip.dot(view)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180))
    // and it is seen from its right-hand side as well as from behind
    const right = forward.clone().cross(up)
    expect(offset.dot(right)).toBeGreaterThan(0)
  })

  it('keeps up away from the body and perpendicular to the flight direction', () => {
    expect(up.length()).toBeCloseTo(1, 9)
    expect(up.dot(forward)).toBeCloseTo(0, 9)
    expect(up.dot(ship)).toBeGreaterThan(0)
  })

  it('still gives a unit up when flying straight away from the body', () => {
    const radial = chaseUp(ship, new THREE.Vector3(1, 0, 0), POLE)
    expect(radial.length()).toBeCloseTo(1, 9)
    expect(radial.dot(new THREE.Vector3(1, 0, 0))).toBeCloseTo(0, 9)
    expect(perpendicular(POLE, POLE, POLE).length()).toBeCloseTo(1, 9)
  })

  it('scales the distance with the orbital radius', () => {
    expect(chaseDistanceKm(6778)).toBeCloseTo(237.2, 1)
    expect(chaseDistanceKm(42164)).toBeGreaterThan(1400)
  })
})

describe("bird's-eye camera", () => {
  const center = new THREE.Vector3(1, 0.5, -2)
  const fov = (45 * Math.PI) / 180

  it('looks straight down the route normal from the northern side and fits the route', () => {
    const pose = birdsEyePose(center, new THREE.Vector3(0.2, -0.9, 0.1), 40, fov, 16 / 9, POLE)
    const dir = pose.position.clone().sub(center)
    expect(dir.clone().normalize().dot(new THREE.Vector3(-0.2, 0.9, -0.1).normalize())).toBeCloseTo(1, 9)
    expect((40 * 1.12) / dir.length()).toBeCloseTo(Math.sin(fov / 2), 9)
    expect(pose.target.equals(center)).toBe(true)
    expect(pose.up.dot(dir)).toBeCloseTo(0, 9)
    expect(pose.up.dot(POLE)).toBeGreaterThan(0)
  })

  it('backs off further on a portrait screen and when zoomed out', () => {
    const wide = birdsEyePose(center, POLE, 40, fov, 16 / 9, POLE).position.distanceTo(center)
    const tall = birdsEyePose(center, POLE, 40, fov, 9 / 16, POLE).position.distanceTo(center)
    const zoomed = birdsEyePose(center, POLE, 40, fov, 16 / 9, POLE, 2).position.distanceTo(center)
    expect(tall).toBeGreaterThan(wide)
    expect(zoomed).toBeCloseTo(2 * wide, 9)
  })

  it('backs off to fit the part of the screen the panels leave free, still looking along the normal', () => {
    const n = new THREE.Vector3(0.2, 0.9, 0.1).normalize()
    const open = birdsEyePose(center, n, 40, fov, 16 / 9, POLE)
    const covered = birdsEyePose(center, n, 40, fov, 16 / 9, POLE, 1, { w: 0.65, h: 0.7 })
    expect(covered.target.equals(center)).toBe(true)
    expect(covered.target.clone().sub(covered.position).normalize().dot(n)).toBeCloseTo(-1, 9)
    const dOpen = open.position.distanceTo(open.target)
    const dCovered = covered.position.distanceTo(covered.target)
    expect(dCovered).toBeGreaterThan(dOpen)
    // the route fits the free height: 70% of the half-angle's tangent
    expect((40 * 1.12) / dCovered).toBeCloseTo(Math.sin(Math.atan(Math.tan(fov / 2) * 0.7)), 9)
  })

  it('has a usable up vector when the route lies in the equator', () => {
    const pose = birdsEyePose(center, POLE, 40, fov, 1, POLE)
    expect(pose.up.length()).toBeCloseTo(1, 9)
    expect(pose.up.dot(POLE)).toBeCloseTo(0, 9)
  })
})

describe('route plane normal', () => {
  it('recovers the plane of a circular path and its sense of travel', () => {
    const n = new THREE.Vector3(0.3, 0.8, -0.5).normalize()
    const a = perpendicular(n, new THREE.Vector3(1, 0, 0), POLE)
    const b = n.clone().cross(a)
    const pos: number[] = []
    for (let k = 0; k <= 90; k++) {
      const th = (k / 90) * 1.7 * Math.PI
      const p = a.clone().multiplyScalar(7 * Math.cos(th)).addScaledVector(b, 7 * Math.sin(th))
      pos.push(p.x, p.y, p.z)
    }
    expect(pathNormal(pos, 0, 91).dot(n)).toBeCloseTo(1, 9)
    expect(pathNormal(pos.slice().reverse().reduce<number[]>((acc, _, i, arr) => (i % 3 === 0 ? acc.concat([arr[i + 2], arr[i + 1], arr[i]]) : acc), []), 0, 91).dot(n)).toBeCloseTo(-1, 9)
    expect(pathNormal(pos, 0, 1).length()).toBeCloseTo(1, 9)
  })
})

describe("bird's-eye side", () => {
  it('looks from the side the caller chose when asked to keep it, and from the pole side otherwise', () => {
    const center = new THREE.Vector3(0, 0, 0)
    const fov = (45 * Math.PI) / 180
    const below = new THREE.Vector3(1, -0.1, 0).normalize()   // a near-polar plane whose normal dips under the equator
    const turned = birdsEyePose(center, below, 10, fov, 1, POLE)
    expect(turned.position.y).toBeGreaterThan(0)
    const kept = birdsEyePose(center, below, 10, fov, 1, POLE, 1, { w: 1, h: 1 }, true)
    expect(kept.position.y).toBeLessThan(0)
    expect(kept.position.clone().normalize().dot(below)).toBeCloseTo(1, 6)
  })
})
