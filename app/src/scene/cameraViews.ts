/**
 * Camera poses for the two mission views: a chase camera behind the ship and a fixed bird's-eye
 * camera above the current route. Pure vector maths in world space with the central body at the
 * origin, so the geometry is testable without a renderer.
 */
import * as THREE from 'three'

export interface Pose {
  position: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
}

/** How far behind the ship the chase camera sits, km: 3.5% of the orbital radius, about 240 km in low Earth orbit. */
export function chaseDistanceKm(radiusKm: number): number {
  return 0.035 * radiusKm
}

/** The unit vector perpendicular to `axis` that is closest to `prefer`, or to `fallback` when they are parallel. */
export function perpendicular(axis: THREE.Vector3, prefer: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  const out = prefer.clone().addScaledVector(axis, -prefer.dot(axis))
  if (out.lengthSq() < 1e-8) out.copy(fallback).addScaledVector(axis, -fallback.dot(axis))
  if (out.lengthSq() < 1e-8) out.set(axis.y, axis.z, axis.x).addScaledVector(axis, -(axis.x * axis.y + axis.y * axis.z + axis.z * axis.x))
  return out.normalize()
}

/** "Up" for the chase camera: away from the body, made perpendicular to the direction of flight. */
export function chaseUp(ship: THREE.Vector3, forward: THREE.Vector3, pole: THREE.Vector3): THREE.Vector3 {
  return perpendicular(forward, ship.clone().normalize(), pole)
}

/**
 * Third-person pose: `distance` behind the ship, a little above it and a little to its right, so
 * the ship is seen three-quarters from behind. The camera aims just ahead of the ship, which
 * keeps it at the centre of the screen (clear of the panels along the bottom) with the horizon
 * of a nearby body running across the frame behind it.
 */
export function chasePose(ship: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3, distance: number): Pose {
  const right = forward.clone().cross(up).normalize()
  return {
    position: ship.clone().addScaledVector(forward, -distance).addScaledVector(up, 0.3 * distance).addScaledVector(right, 0.18 * distance),
    target: ship.clone().addScaledVector(forward, 0.15 * distance),
    up: up.clone(),
  }
}

/**
 * Looking straight down the normal of a route's plane from the pole's side, far enough for a
 * sphere of the given radius to fit the part of the screen the panels leave free. North is up on
 * screen. `free` is the fraction of the viewport's width and height that is not covered; the
 * scene's view offset puts the point looked at in the middle of that area, so the camera only has
 * to back off, never slide sideways.
 */
export function birdsEyePose(center: THREE.Vector3, normal: THREE.Vector3, radius: number, fovV: number, aspect: number,
                             pole: THREE.Vector3, zoom = 1, free: { w: number; h: number } = { w: 1, h: 1 }, keepSide = false): Pose {
  const n = normal.clone()
  if (n.lengthSq() < 1e-12) n.copy(pole)
  n.normalize()
  if (!keepSide && n.dot(pole) < 0) n.negate()   // keepSide: the caller has chosen which side to look from
  const fw = Math.min(Math.max(free.w, 0.3), 1)
  const fh = Math.min(Math.max(free.h, 0.3), 1)
  const tanV = Math.tan(fovV / 2)
  const halfV = Math.atan(tanV * fh)
  const halfH = Math.atan(tanV * aspect * fw)
  const dist = ((Math.max(radius, 1e-6) * 1.12) / Math.sin(Math.min(halfV, halfH))) * zoom
  const up = perpendicular(n, pole, new THREE.Vector3(1, 0, 0))
  return {
    position: center.clone().addScaledVector(n, dist),
    target: center.clone(),
    up,
  }
}

/** Area-weighted normal of a path about the origin: the sum of r_i x r_(i+1) over samples [start, end). */
export function pathNormal(pos: ArrayLike<number>, start: number, end: number): THREE.Vector3 {
  const n = new THREE.Vector3()
  for (let i = start; i + 1 < end; i++) {
    const ax = pos[3 * i], ay = pos[3 * i + 1], az = pos[3 * i + 2]
    const bx = pos[3 * i + 3], by = pos[3 * i + 4], bz = pos[3 * i + 5]
    n.x += ay * bz - az * by
    n.y += az * bx - ax * bz
    n.z += ax * by - ay * bx
  }
  return n.lengthSq() > 0 ? n.normalize() : n.set(0, 0, 1)
}
