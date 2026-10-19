/**
 * The vehicles: the spacecraft that flies the tour, the launch vehicle that carries it to orbit,
 * and the satellites it visits. Each is assembled from a few dozen primitives in real
 * proportions, in metres, then scaled to a marker a few tens of pixels across.
 *
 * - Spacecraft: a capsule on a service module with four solar array wings and a main engine,
 *   the layout of a crewed deep-space vehicle (about 9.6 m long, 19 m across the arrays).
 * - Launch vehicle: built from the vehicle's own numbers. The core diameter comes from the drag
 *   reference area, each stage's tank length from its propellant mass and a bulk density, so a
 *   Falcon 9-class vehicle comes out about 65 m tall and 3.7 m across, as the real one is.
 * - Satellites: a generic three-axis communications satellite (box bus, two solar wings along
 *   the orbit normal, reflectors toward the body), or a space station (long truss, eight array
 *   wings, pressurised modules) for satellites named as one.
 *
 * Every model is built along +z = "forward" for ships, and in the local orbital frame for
 * satellites (+x along the velocity, +z toward the body), and returned with the geometries and
 * materials to dispose.
 */
import * as THREE from 'three'
import type { LaunchVehicle } from '../mission/types'

export interface Model {
  group: THREE.Group
  dispose: () => void
}

interface Palette {
  white: THREE.MeshStandardMaterial
  grey: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  gold: THREE.MeshStandardMaterial
  solar: THREE.MeshStandardMaterial
}

/** Materials with a little self-illumination so a model stays readable in the body's shadow. */
function palette(): Palette {
  const m = (color: number, emissive: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0.1, ...extra })
  return {
    white: m(0xf2f4f6, 0x4a4d52),
    grey: m(0x8d96a0, 0x2a2e33),
    dark: m(0x3a424b, 0x15181c, { side: THREE.DoubleSide }),
    gold: m(0xc79a2b, 0x4a380c, { metalness: 0.45, roughness: 0.4 }),
    solar: m(0x1c2f6b, 0x0b1436, { metalness: 0.3, roughness: 0.35 }),
  }
}

/** Collects meshes into a group and remembers what to dispose. */
class Builder {
  readonly group = new THREE.Group()
  readonly mats = palette()
  private readonly geometries: THREE.BufferGeometry[] = []

  /** A solid of revolution along z between z0 and z1, with radius r0 at z0 and r1 at z1. */
  tube(z0: number, z1: number, r0: number, r1: number, mat: THREE.Material, parent: THREE.Object3D = this.group, open = false): THREE.Mesh {
    const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, 24, 1, open)
    g.rotateX(Math.PI / 2) // cylinder axis y -> z, top (r1) toward +z
    g.translate(0, 0, (z0 + z1) / 2)
    return this.add(g, mat, parent)
  }

  box(sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D = this.group, rotZ = 0): THREE.Mesh {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    g.translate(x, y, z)
    if (rotZ !== 0) g.rotateZ(rotZ)
    return this.add(g, mat, parent)
  }

  add(g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.group): THREE.Mesh {
    this.geometries.push(g)
    const mesh = new THREE.Mesh(g, mat)
    parent.add(mesh)
    return mesh
  }

  finish(): Model {
    return {
      group: this.group,
      dispose: () => {
        for (const g of this.geometries) g.dispose()
        for (const m of Object.values(this.mats)) m.dispose()
      },
    }
  }
}

// ---------------------------------------------------------------- spacecraft

/** Length of the spacecraft in metres, and where its engine exit sits behind the model's origin. */
export const SPACECRAFT_LENGTH_M = 9.6
export const SPACECRAFT_METRES_PER_UNIT = 6
/** Engine exit, model units behind the origin. */
export const SPACECRAFT_TAIL = 4.8 / SPACECRAFT_METRES_PER_UNIT

/** Capsule, service module, four array wings and main engine, nose along +z, centred on its length. */
export function buildSpacecraft(): Model {
  const b = new Builder()
  const { white, grey, dark, gold, solar } = b.mats
  const g = new THREE.Group()
  // all dimensions in metres; z runs from the engine exit at -4.8 to the docking port at +4.8
  b.tube(-4.8, -3.2, 1.0, 0.35, dark, g, true)                 // main engine bell
  b.tube(-3.2, 0.8, 2.05, 2.05, white, g)                      // service module
  b.tube(-2.9, -1.6, 2.08, 2.08, gold, g)                      // foil-wrapped propulsion bay
  b.tube(-0.2, 0.5, 2.08, 2.08, grey, g)                       // radiator band
  b.tube(0.8, 1.3, 2.05, 2.5, dark, g)                         // spacecraft adapter
  b.tube(1.3, 4.3, 2.5, 0.9, white, g)                         // capsule, a 32-degree cone
  b.tube(1.3, 1.5, 2.52, 2.4, dark, g)                         // heat shield shoulder
  b.tube(4.3, 4.8, 0.55, 0.55, grey, g)                        // docking adapter
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    // the structure that carries each wing is drawn stout: a thin yoke vanished at the ship's size
    // on screen and the panels seemed to float free of the body, and to drift as the ship turned
    b.box(1.1, 0.5, 0.5, 2.55, 0, -2.6, white, g, a)           // array yoke
    b.box(7.3, 0.3, 0.3, 6.45, 0, -2.78, grey, g, a)            // the boom the panels hang from
    for (let p = 0; p < 3; p++) b.box(2.2, 1.9, 0.06, 4.2 + 2.35 * p, 0, -2.6, solar, g, a) // three panels per wing
    b.box(0.42, 0.42, 0.42, 2.2, 0, -0.9, grey, g, (k * Math.PI) / 2) // reaction-control quad
  }
  g.scale.setScalar(1 / SPACECRAFT_METRES_PER_UNIT)
  b.group.add(g)
  return b.finish()
}

// ---------------------------------------------------------------- launch vehicle

export interface StackStage {
  /** length of the propellant tanks, m */
  tank: number
  /** length of the engine section below them, m; an upper stage's engine sits inside the interstage of the stage below */
  engine: number
}

export interface StackLayout {
  /** core diameter, m */
  diameter: number
  /** bottom to top */
  stages: StackStage[]
  fairingDiameter: number
  fairingBarrel: number
  fairingNose: number
  /** overall height, m */
  total: number
}

/**
 * Size a launch vehicle from its numbers. The drag reference area is the core's cross-section;
 * a stage's tanks hold its propellant at a bulk density of about 1000 kg/m^3 for kerosene or
 * methane with liquid oxygen and 360 kg/m^3 for hydrogen (told apart by a vacuum Isp above
 * 400 s); engine sections and the payload fairing scale with the diameter.
 */
export function stackLayout(vehicle: LaunchVehicle): StackLayout {
  const area = Math.max(vehicle.dragArea, 0.05)
  const diameter = Math.sqrt((4 * area) / Math.PI)
  const stages = vehicle.stages.map((s, i): StackStage => {
    const density = s.ispVacuum >= 400 ? 360 : 1000
    return { tank: Math.max(s.propellantMass / (density * area), 0.6 * diameter), engine: (i === 0 ? 0.9 : 0.6) * diameter }
  })
  const fairingBarrel = 1.6 * diameter
  const fairingNose = 1.8 * diameter
  const total = stages.reduce((sum, s) => sum + s.tank + s.engine, 0) + fairingBarrel + fairingNose
  return { diameter, stages, fairingDiameter: 1.2 * diameter, fairingBarrel, fairingNose, total }
}

/**
 * Height of the full stack in model units; later stages keep this scale after the lower ones
 * drop. A launch vehicle is slender (about seventeen diameters tall), so it is drawn longer than
 * the spacecraft rather than fatter than it is.
 */
export const STACK_UNITS = 4.5

export interface StackModel extends Model {
  /** one group per stage, bottom to top; hide one to drop the stage */
  stageGroups: THREE.Group[]
  /** engine exit of each stage, model units behind the origin (the base of the fairing) */
  tails: number[]
}

/** The launch vehicle, nose along +z, origin at the base of the payload fairing. */
export function buildStack(vehicle: LaunchVehicle): StackModel {
  const layout = stackLayout(vehicle)
  const b = new Builder()
  const { white, grey, dark } = b.mats
  const g = new THREE.Group()
  const r = layout.diameter / 2
  const rf = layout.fairingDiameter / 2
  // payload fairing: a hammerhead barrel and an ogive approximated by two cones
  b.tube(0, 0.25 * layout.diameter, r, rf, white, g)
  b.tube(0.25 * layout.diameter, layout.fairingBarrel, rf, rf, white, g)
  b.tube(layout.fairingBarrel, layout.fairingBarrel + 0.55 * layout.fairingNose, rf, 0.62 * rf, white, g)
  b.tube(layout.fairingBarrel + 0.55 * layout.fairingNose, layout.fairingBarrel + layout.fairingNose, 0.62 * rf, 0.04 * rf, white, g)
  const n = layout.stages.length
  const stageGroups: THREE.Group[] = new Array<THREE.Group>(n)
  const tails: number[] = new Array<number>(n)
  let top = 0
  for (let i = n - 1; i >= 0; i--) {
    const st = layout.stages[i]
    const sg = new THREE.Group()
    const tankBottom = top - st.tank
    const exit = tankBottom - st.engine
    b.tube(tankBottom, top, r, r, white, sg)                                  // propellant tanks
    b.tube(top - 0.42 * st.tank, top - 0.38 * st.tank, 1.012 * r, 1.012 * r, grey, sg) // intertank band
    if (i < n - 1) b.tube(top, top + layout.stages[i + 1].engine, r, r, dark, sg) // interstage, around the engine above
    if (i === 0) {
      b.tube(tankBottom - 0.45 * st.engine, tankBottom, r, r, grey, sg)       // thrust structure
      for (let k = 0; k < 5; k++) {                                           // a cluster of engines
        const a = (k * Math.PI) / 2
        const off = k === 4 ? 0 : 0.56 * r
        b.tube(exit, tankBottom - 0.4 * st.engine, 0.3 * r, 0.14 * r, dark, sg, true).position.set(off * Math.cos(a), off * Math.sin(a), 0)
      }
    } else {
      b.tube(tankBottom - 0.3 * st.engine, tankBottom, 0.5 * r, 0.9 * r, grey, sg) // thrust cone
      b.tube(exit, tankBottom - 0.3 * st.engine, 0.6 * r, 0.2 * r, dark, sg, true)  // one vacuum engine with a wide bell
    }
    stageGroups[i] = sg
    tails[i] = -exit
    g.add(sg)
    top = exit
  }
  const scale = STACK_UNITS / layout.total
  g.scale.setScalar(scale)
  b.group.add(g)
  const model = b.finish()
  return { ...model, stageGroups, tails: tails.map((t) => t * scale) }
}

// ---------------------------------------------------------------- satellites

export type SatelliteKind = 'comsat' | 'station' | 'asteroid' | 'planet'

/**
 * What to draw for an orbiting object. A stated shape wins (the bodies of a routing instance are
 * asteroids and a planet); otherwise a satellite named as a space station is drawn as one and
 * everything else as a communications satellite.
 */
export function satelliteKind(name: string, shape?: 'asteroid' | 'planet'): SatelliteKind {
  if (shape) return shape
  return /\biss\b|station|zarya|tiangong|\bmir\b|skylab/i.test(name) ? 'station' : 'comsat'
}

/** Span of each satellite model in model units. */
export const SATELLITE_UNITS: Record<SatelliteKind, number> = { comsat: 1.5, station: 2.4, asteroid: 1.0, planet: 1.0 }

/**
 * Span of each satellite next to the spacecraft, in the spacecraft's model units, for the close
 * views. The communications satellite is true to scale (20.8 m against the spacecraft's 19 m
 * across the arrays). A station would be 109 m, eighteen units and wider than the screen, so it
 * is held to seven: still plainly larger than the ship that visits it.
 */
export const SATELLITE_COMPANION_UNITS: Record<SatelliteKind, number> = { comsat: 20.8 / SPACECRAFT_METRES_PER_UNIT, station: 7, asteroid: 6, planet: 8 }

/** Box bus in gold foil, two solar wings along +-y (the orbit normal), reflectors and a horn toward +z (the body). */
export function buildComsat(): Model {
  const b = new Builder()
  const { white, grey, gold, solar } = b.mats
  const g = new THREE.Group()
  b.box(2.2, 2.2, 3.0, 0, 0, 0, gold, g)
  for (const side of [-1, 1]) {
    b.box(0.12, 0.9, 0.12, 0, side * 1.55, 0, grey, g)                      // yoke
    for (let p = 0; p < 4; p++) b.box(2.2, 2.05, 0.06, 0, side * (3.1 + 2.15 * p), 0, solar, g) // four panels per wing
    // an offset reflector on the east and west faces, opening toward the body
    const dish = new THREE.ConeGeometry(1.15, 0.4, 24, 1, true)
    dish.rotateX(-Math.PI / 2) // apex toward -z, opening toward +z
    dish.translate(side * 2.0, 0, 0.9)
    b.add(dish, white, g)
    b.box(0.9, 0.1, 0.1, side * 1.5, 0, 0.6, grey, g)
  }
  b.tube(1.5, 2.2, 0.35, 0.2, white, g)                                     // nadir horn
  g.scale.setScalar(SATELLITE_UNITS.comsat / 20.8)
  b.group.add(g)
  return b.finish()
}

/**
 * A space station in the layout of the ISS: a 109 m truss along y (the orbit normal) carrying
 * eight solar array wings and the radiators, with the pressurised modules along x (the velocity).
 */
export function buildStation(): Model {
  const b = new Builder()
  const { white, grey, solar } = b.mats
  const g = new THREE.Group()
  b.box(1.6, 109, 1.6, 0, 0, 0, grey, g)                                    // integrated truss
  for (const y of [-49, -34, 34, 49]) {
    for (const side of [-1, 1]) b.box(35, 11.6, 0.12, side * 18.6, y, 0, solar, g) // a pair of 35 m array wings
  }
  for (const y of [-13, 13]) b.box(13.5, 3.4, 0.1, -7.6, y, 1.0, white, g)   // thermal radiators
  const along = (len: number, x: number, y: number, z: number, rotated: boolean) => {
    const c = new THREE.CylinderGeometry(2.1, 2.1, len, 16)
    if (!rotated) c.rotateZ(Math.PI / 2) // axis y -> x
    c.translate(x, y, z)
    b.add(c, white, g)
  }
  along(51, -2, 0, 3.2, false)                                              // modules along the velocity
  along(22, 20, 0, 3.2, true)                                               // laboratories across the front
  b.box(3.2, 29, 0.1, -22, 0, 3.2, solar, g)                                // service-module arrays
  g.scale.setScalar(SATELLITE_UNITS.station / 109)
  b.group.add(g)
  return b.finish()
}

/** A small deterministic hash of a string to [0, 1), so each asteroid keeps its own shape. */
function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

/**
 * An asteroid: a lumpy, faceted rock about one model unit across, elongated like most small
 * bodies. The lumps come from the name, so the same asteroid always looks the same. Real
 * asteroids are far too small to see at the scale of their orbits; this is a marker.
 */
export function buildAsteroid(name: string): Model {
  const geo = new THREE.IcosahedronGeometry(0.5, 2)
  const pos = geo.getAttribute('position')
  const v = new THREE.Vector3()
  const lobes = [0, 1, 2, 3, 4].map((k) => ({
    dir: new THREE.Vector3(hash01(name, 11 * k + 1) - 0.5, hash01(name, 11 * k + 2) - 0.5, hash01(name, 11 * k + 3) - 0.5).normalize(),
    amp: 0.1 + 0.16 * hash01(name, 11 * k + 4),
  }))
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const d = v.clone().normalize()
    let r = 1
    for (const l of lobes) r += l.amp * (d.dot(l.dir) > 0.25 ? d.dot(l.dir) : -0.35 * Math.abs(d.dot(l.dir)))
    pos.setXYZ(i, v.x * r * 1.25, v.y * r * 0.9, v.z * r * 0.8)
  }
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8c8277, emissive: 0x2a2520, emissiveIntensity: 0.6, roughness: 0.95, metalness: 0, flatShading: true })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, mat))
  return { group, dispose: () => { geo.dispose(); mat.dispose() } }
}

/** A planet as a marker: a small sphere in the object's own colour. */
export function buildPlanet(color: string): Model {
  const geo = new THREE.SphereGeometry(0.5, 24, 16)
  const c = new THREE.Color(color)
  const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.7, metalness: 0 })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, mat))
  return { group, dispose: () => { geo.dispose(); mat.dispose() } }
}
