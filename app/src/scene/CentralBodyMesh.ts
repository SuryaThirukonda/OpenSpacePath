/**
 * Central body: a sphere with the real map for Earth (see earthMap.ts) or a procedural surface
 * for the other bodies (surfaces.ts), a lat/lon wireframe with the equator and prime meridian
 * emphasised, coordinate labels, a faint equatorial ring, and a rim glow for bodies with an
 * atmosphere or a corona. Local z is the pole; everything on the surface spins with setSpin.
 */
import * as THREE from 'three'
import { DEG, TWO_PI } from '../core/constants'
import type { CentralBody } from '../types'
import { kmScalarToScene } from './frame'
import { makeGlow, makeSurfaceMaterial } from './surfaces'
import { getEarthAssets, GRATICULE_LABELS, lonLatToVector3 } from './earthMap'
import { disposeSprite, getGlowTexture, makeLabelSprite, worldPerPixel } from './textures'

export class CentralBodyMesh {
  readonly group = new THREE.Group()
  private body: CentralBody | null = null
  private sphere?: THREE.Mesh
  private grid?: THREE.LineSegments
  private ring?: THREE.Mesh
  private glows: THREE.Mesh[] = []
  private principal?: THREE.LineSegments
  private marker?: THREE.Group
  private markerKey = ''
  /** Sprites kept at a constant size on screen: the pad label and the coordinate labels. */
  private labels: Array<{ sprite: THREE.Sprite; aspect: number }> = []
  private mapObjects: THREE.Object3D[] = []
  private mapMaterial?: THREE.MeshStandardMaterial
  private loadToken = 0
  private readonly tmp = new THREE.Vector3()

  setBody(body: CentralBody): void {
    if (this.body?.id === body.id) return
    this.dispose()
    this.body = body
    const R = kmScalarToScene(body.radius)

    const geo = new THREE.SphereGeometry(R, 128, 96)
    geo.rotateX(Math.PI / 2) // sphere poles along local z
    this.sphere = new THREE.Mesh(geo, makeSurfaceMaterial(body.surface, body.color))
    this.group.add(this.sphere)

    this.grid = new THREE.LineSegments(
      latLonGrid(R * 1.003, 30, 30, 72),
      new THREE.LineBasicMaterial({ color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.16 }),
    )
    this.group.add(this.grid)
    this.principal = new THREE.LineSegments(
      principalLines(R * 1.004, 144),
      new THREE.LineBasicMaterial({ color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.45 }),
    )
    this.group.add(this.principal)
    if (body.surface === 'earth') void this.loadEarth(R)

    const ringGeo = new THREE.RingGeometry(R * 1.0, R * 1.6, 128)
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false,
    })
    this.ring = new THREE.Mesh(ringGeo, ringMat)
    this.group.add(this.ring)

    if (body.atmosphere) {
      const star = body.surface === 'star'
      this.glows = star
        ? [makeGlow(R * 1.02, body.atmosphere, 0.9), makeGlow(R * 1.45, body.atmosphere, 0.8, true)]
        : [makeGlow(R * 1.015, body.atmosphere, 0.6)]
      for (const g of this.glows) this.group.add(g)
    }
  }

  /** Swap in the real map once its data has loaded, unless the body changed meanwhile. */
  private async loadEarth(R: number): Promise<void> {
    const token = ++this.loadToken
    let assets
    try {
      assets = await getEarthAssets(R)
    } catch (e) {
      console.warn('Earth map unavailable, keeping the procedural surface', e)
      return
    }
    if (token !== this.loadToken || !this.sphere) return
    const old = this.sphere.material as THREE.Material
    this.mapMaterial = new THREE.MeshStandardMaterial({ map: assets.texture, roughness: 0.9, metalness: 0 })
    this.sphere.material = this.mapMaterial
    old.dispose()
    const coast = new THREE.LineSegments(assets.coast, new THREE.LineBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.55, depthWrite: false }))
    const borders = new THREE.LineSegments(assets.borders, new THREE.LineBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.25, depthWrite: false }))
    for (const [text, lon, lat] of GRATICULE_LABELS) {
      const { sprite, aspect } = makeLabelSprite(text, '#9fd0ff')
      lonLatToVector3(lon, lat, R * 1.012, sprite.position)
      this.sphere.add(sprite)
      this.mapObjects.push(sprite)
      this.labels.push({ sprite, aspect })
    }
    this.sphere.add(coast, borders)
    this.mapObjects.push(coast, borders)
  }

  /** Put a labelled dot on the surface at a geodetic latitude and longitude (deg); it spins with the body. */
  setSurfaceMarker(site: { latitude: number; longitude: number; name: string } | null, color = '#ffffff'): void {
    const key = site ? `${site.name}|${site.latitude}|${site.longitude}|${color}` : ''
    if (key === this.markerKey) return
    this.markerKey = key
    this.clearMarker()
    if (!site || !this.sphere || !this.body) return
    const R = kmScalarToScene(this.body.radius) * 1.004
    const g = new THREE.Group()
    lonLatToVector3(site.longitude, site.latitude, R, g.position)
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    const pm = new THREE.PointsMaterial({
      size: 10, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const pt = new THREE.Points(pg, pm)
    pt.frustumCulled = false
    g.add(pt)
    const { sprite, aspect } = makeLabelSprite(site.name, color)
    sprite.position.set(0, 0, 0)
    g.add(sprite)
    this.sphere.add(g)
    this.marker = g
    sprite.center.set(0.5, -0.4)
    this.labels.push({ sprite, aspect })
  }

  /** Keep the surface labels a constant size on screen, like the satellite and burn labels. */
  updateLabels(cameraPos: THREE.Vector3, viewportHeight: number, fovRad: number): void {
    for (const { sprite, aspect } of this.labels) {
      sprite.getWorldPosition(this.tmp)
      const h = 13 * worldPerPixel(cameraPos.distanceTo(this.tmp), viewportHeight, fovRad)
      sprite.scale.set(h * aspect, h, 1)
    }
  }

  private clearMarker(): void {
    if (!this.marker) return
    this.sphere?.remove(this.marker)
    for (const c of this.marker.children) {
      if (c instanceof THREE.Points) { c.geometry.dispose(); (c.material as THREE.Material).dispose() }
      if (c instanceof THREE.Sprite) { this.labels = this.labels.filter((l) => l.sprite !== c); disposeSprite(c) }
    }
    this.marker = undefined
  }

  /** Drop the map lines and labels; the shared texture and geometries stay cached for the next visit. */
  private clearMap(): void {
    for (const o of this.mapObjects) {
      this.sphere?.remove(o)
      if (o instanceof THREE.Sprite) disposeSprite(o)
      else if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose()
    }
    this.mapObjects = []
    this.labels = this.labels.filter((l) => l.sprite === this.marker?.children.find((c) => c === l.sprite))
    this.mapMaterial = undefined
  }

  /** Spin the sphere and grid about the pole by a given angle (rad); the equatorial ring stays fixed. */
  setSpin(angle: number): void {
    if (this.sphere) this.sphere.rotation.z = angle
    if (this.grid) this.grid.rotation.z = angle
    if (this.principal) this.principal.rotation.z = angle
  }

  dispose(): void {
    this.loadToken++
    this.clearMarker()
    this.clearMap()
    this.markerKey = ''
    for (const o of [this.sphere, this.grid, this.principal, this.ring, ...this.glows]) {
      if (!o) continue
      this.group.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    this.sphere = this.grid = this.principal = undefined
    this.ring = undefined
    this.glows = []
    this.body = null
  }
}

/** The equator and the prime meridian, drawn brighter than the rest of the grid. */
function principalLines(R: number, segs: number): THREE.BufferGeometry {
  const pts: number[] = []
  const p = (lat: number, lon: number) =>
    [R * Math.cos(lat) * Math.cos(lon), R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat)]
  for (let k = 0; k < segs; k++) pts.push(...p(0, (k / segs) * TWO_PI), ...p(0, ((k + 1) / segs) * TWO_PI))
  for (let k = 0; k < segs / 2; k++) {
    pts.push(...p(-Math.PI / 2 + (k / (segs / 2)) * Math.PI, 0), ...p(-Math.PI / 2 + ((k + 1) / (segs / 2)) * Math.PI, 0))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

/** Meridians and parallels as a LineSegments geometry, poles along z. */
function latLonGrid(R: number, latStepDeg: number, lonStepDeg: number, segs: number): THREE.BufferGeometry {
  const pts: number[] = []
  const push = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
  const p = (lat: number, lon: number) =>
    new THREE.Vector3(R * Math.cos(lat) * Math.cos(lon), R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat))
  for (let lat = -90 + latStepDeg; lat < 90; lat += latStepDeg) {
    for (let k = 0; k < segs; k++) {
      push(p(lat * DEG, (k / segs) * TWO_PI), p(lat * DEG, ((k + 1) / segs) * TWO_PI))
    }
  }
  for (let lon = 0; lon < 360; lon += lonStepDeg) {
    for (let k = 0; k < segs / 2; k++) {
      const a = -Math.PI / 2 + (k / (segs / 2)) * Math.PI
      const b = -Math.PI / 2 + ((k + 1) / (segs / 2)) * Math.PI
      push(p(a, lon * DEG), p(b, lon * DEG))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}
