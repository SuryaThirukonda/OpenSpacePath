/**
 * The single place where the body-centred inertial frame (x toward the reference direction,
 * z along the pole) meets Three.js (y up). Everything orbital is added to `inertialGroup`, which
 * is rotated -90 degrees about x so inertial z becomes Three +y. Coordinates are converted from
 * kilometres to scene units here and nowhere else.
 */
import * as THREE from 'three'
import { SCENE_UNITS_PER_KM } from '../core/constants'
import type { Vec3 } from '../types'

export function makeInertialGroup(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'inertial'
  g.rotation.x = -Math.PI / 2
  return g
}

/** km (inertial) -> scene units, still expressed in the inertial group's local axes. */
export function kmToScene(v: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v.x * SCENE_UNITS_PER_KM, v.y * SCENE_UNITS_PER_KM, v.z * SCENE_UNITS_PER_KM)
}

export function kmScalarToScene(km: number): number {
  return km * SCENE_UNITS_PER_KM
}
