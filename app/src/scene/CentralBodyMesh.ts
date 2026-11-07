/**
 * Central body: a sphere with the real map for Earth (see earthMap.ts) or a procedural surface
 * for the other bodies (surfaces.ts), a lat/lon wireframe with the equator and prime meridian
 * emphasised, coordinate labels, and a rim glow for bodies with an atmosphere or a corona. Local z
 * is the pole; everything on the surface spins with setSpin.
 */
import * as THREE from 'three'
import { DEG, TWO_PI } from '../core/constants'
import type { CentralBody } from '../types'
import { kmScalarToScene } from './frame'
import { makeGlow, makeSurfaceMaterial } from './surfaces'
import { getEarthAssets, GRATICULE_LABELS, lonLatToVector3, reducedLatitude } from './earthMap'
import { drawOnTop, type LabelItem } from './labels'
import { disposeSprite, getGlowTexture, makeLabelSprite, worldPerPixel } from './textures'

export class CentralBodyMesh {
  readonly group = new THREE.Group()
  private body: CentralBody | null = null
  private sphere?: THREE.Mesh
  private grid?: THREE.LineSegments
  private glows: THREE.Mesh[] = []
  private principal?: THREE.LineSegments
  private marker?: THREE.Group
  private markerKey = ''
  /** A star seen from across its system is far below a pixel: a glow and its name mark it at any distance. */
  private beacon?: { group: THREE.Group; points: THREE.Points; sprite: THREE.Sprite }
  /** Labels kept at a constant size on screen: the coordinate labels, the pad and a star's name. */
  private labels: LabelItem[] = []
  private mapObjects: THREE.Object3D[] = []
  private mapMaterial?: THREE.MeshStandardMaterial
  private loadToken = 0
  private readonly tmp = new THREE.Vector3()

  setBody(body: CentralBody): void {
    if (this.body?.id === body.id) return
    this.dispose()
    this.body = body
    const R = kmScalarToScene(body.radius)

    // The body is an oblate spheroid: a sphere squashed along the pole by its real flattening.
    // Everything on the surface is squashed with it, and latitudes on it are geodetic.
    const f = body.flattening ?? 0
    const geo = new THREE.SphereGeometry(R, 160, 112)
    geo.rotateX(Math.PI / 2) // sphere poles along local z
    this.sphere = new THREE.Mesh(geo, makeSurfaceMaterial(body.surface, body.color))
    this.sphere.scale.z = 1 - f
    this.group.add(this.sphere)

    this.grid = new THREE.LineSegments(
      latLonGrid(R * 1.003, 30, 30, 72, f),
      new THREE.LineBasicMaterial({ color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.16 }),
    )
    this.grid.scale.z = 1 - f
    this.group.add(this.grid)
    this.principal = new THREE.LineSegments(
      principalLines(R * 1.004, 144),
      new THREE.LineBasicMaterial({ color: new THREE.Color(body.gridColor), transparent: true, opacity: 0.45 }),
    )
    this.principal.scale.z = 1 - f
    this.group.add(this.principal)
    if (body.surface === 'earth') void this.loadEarth(R, f)

    if (body.surface === 'star') {
      const g = new THREE.Group()
      const pg = new THREE.BufferGeometry()
      pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
      const points = new THREE.Points(pg, new THREE.PointsMaterial({
        size: 26, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(body.atmosphere ?? '#ffd27a'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
      }))
      points.frustumCulled = false
      const { sprite, aspect } = makeLabelSprite(body.name, '#ffe3a3')
      sprite.center.set(-0.35, 0.5)
      drawOnTop(sprite)
      g.add(points, sprite)
      this.group.add(g)
      this.labels.push({ sprite, aspect, priority: 60, wanted: true, height: 13, base: new THREE.Vector2(-0.35, 0.5), movable: true })
      this.beacon = { group: g, points, sprite }
    }

    if (body.atmosphere) {
      const star = body.surface === 'star'
      this.glows = star
        ? [makeGlow(R * 1.02, body.atmosphere, 0.9), makeGlow(R * 1.45, body.atmosphere, 0.8, true)]
        : [makeGlow(R * 1.015, body.atmosphere, 0.6)]
      for (const g of this.glows) {
        g.scale.z = 1 - f
        this.group.add(g)
      }
    }
  }

  /** Swap in the real map once its data has loaded, unless the body changed meanwhile. */
  private async loadEarth(R: number, flattening: number): Promise<void> {
    const token = ++this.loadToken
    let assets
    try {
      assets = await getEarthAssets(R, flattening)
    } catch (e) {
      console.warn('Earth map unavailable, keeping the procedural surface', e)
      return
    }
    if (token !== this.loadToken || !this.sphere) return
    const old = this.sphere.material as THREE.Material
    this.mapMaterial = new THREE.MeshStandardMaterial({ map: assets.texture, roughnessMap: assets.roughness, roughness: 1, metalness: 0 })
    this.sphere.material = this.mapMaterial
    old.dispose()
    const coast = new THREE.LineSegments(assets.coast, new THREE.LineBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.55, depthWrite: false }))
    const borders = new THREE.LineSegments(assets.borders, new THREE.LineBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.25, depthWrite: false }))
    for (const [text, lon, lat] of GRATICULE_LABELS) {
      const { sprite, aspect } = makeLabelSprite(text, '#9fd0ff')
      lonLatToVector3(lon, reducedLatitude(lat, flattening), R * 1.012, sprite.position)
      drawOnTop(sprite)
      this.sphere.add(sprite)
      this.mapObjects.push(sprite)
      this.labels.push({ sprite, aspect, priority: 10, wanted: true, height: 13, base: sprite.center.clone(), movable: false })
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
    lonLatToVector3(site.longitude, reducedLatitude(site.latitude, this.body.flattening ?? 0), R, g.position)
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
    drawOnTop(sprite)
    this.labels.push({ sprite, aspect, priority: 65, wanted: true, height: 13, base: new THREE.Vector2(0.5, -0.4), movable: true })
  }

  /** Keep the surface labels a constant size on screen, like the satellite and burn labels. */
  updateLabels(cameraPos: THREE.Vector3, viewportHeight: number, fovRad: number, show: boolean): void {
    for (const item of this.labels) {
      item.sprite.getWorldPosition(this.tmp)
      const h = item.height * worldPerPixel(cameraPos.distanceTo(this.tmp), viewportHeight, fovRad)
      item.sprite.scale.set(h * item.aspect, h, 1)
      item.wanted = show
    }
  }

  /** The body's labels, for the scene's label layout. */
  labelItems(out: LabelItem[]): void {
    for (const item of this.labels) out.push(item)
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

  /** Spin the sphere and grid about the pole by a given angle (rad). */
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
    for (const o of [this.sphere, this.grid, this.principal, ...this.glows]) {
      if (!o) continue
      this.group.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    if (this.beacon) {
      this.group.remove(this.beacon.group)
      this.beacon.points.geometry.dispose()
      ;(this.beacon.points.material as THREE.Material).dispose()
      disposeSprite(this.beacon.sprite)
      this.labels = this.labels.filter((l) => l.sprite !== this.beacon?.sprite)
      this.beacon = undefined
    }
    this.sphere = this.grid = this.principal = undefined
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

/**
 * Meridians and parallels as a LineSegments geometry, poles along z. The parallels are drawn at
 * geodetic latitudes of an ellipsoid with the given flattening (the geometry is then squashed
 * along z with the body), so "30 degrees" is where a map of the body puts it.
 */
function latLonGrid(R: number, latStepDeg: number, lonStepDeg: number, segs: number, flattening = 0): THREE.BufferGeometry {
  const pts: number[] = []
  const push = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
  const p = (lat: number, lon: number) =>
    new THREE.Vector3(R * Math.cos(lat) * Math.cos(lon), R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat))
  for (let latDeg = -90 + latStepDeg; latDeg < 90; latDeg += latStepDeg) {
    const lat = reducedLatitude(latDeg, flattening) * DEG
    for (let k = 0; k < segs; k++) {
      push(p(lat, (k / segs) * TWO_PI), p(lat, ((k + 1) / segs) * TWO_PI))
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
