import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { lonLatToPixel, lonLatToVector3, reducedLatitude } from '../../src/scene/earthMap'

describe('earth map coordinates', () => {
  it('maps the prime meridian to +x, 90 E to +y and the north pole to +z', () => {
    const near = (v: THREE.Vector3, x: number, y: number, z: number) => {
      expect(v.x).toBeCloseTo(x, 9); expect(v.y).toBeCloseTo(y, 9); expect(v.z).toBeCloseTo(z, 9)
    }
    near(lonLatToVector3(0, 0, 1), 1, 0, 0)
    near(lonLatToVector3(90, 0, 1), 0, 1, 0)
    near(lonLatToVector3(0, 90, 1), 0, 0, 1)
    near(lonLatToVector3(-90, 0, 2), 0, -2, 0)
  })

  it('lays the texture out like an equirectangular image with north up and 180 W at the left', () => {
    expect(lonLatToPixel(-180, 90, 2048, 1024)).toEqual([0, 0])
    expect(lonLatToPixel(0, 0, 2048, 1024)).toEqual([1024, 512])
    expect(lonLatToPixel(180, -90, 2048, 1024)).toEqual([2048, 1024])
  })

  it('agrees with the uv layout three.js gives a sphere whose poles were turned onto z', () => {
    const geo = new THREE.SphereGeometry(1, 128, 64)
    geo.rotateX(Math.PI / 2)
    const pos = geo.getAttribute('position')
    const uv = geo.getAttribute('uv')
    for (const [lon, lat] of [[-80.6, 28.5], [63.3, 45.9], [-52.8, 5.2], [139.7, 35.7], [-43.2, -22.9], [0, 0]]) {
      const target = lonLatToVector3(lon, lat, 1)
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < pos.count; i++) {
        const d = target.distanceToSquared(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
        if (d < bestD) { bestD = d; best = i }
      }
      const [x, y] = lonLatToPixel(lon, lat, 1, 1)
      // texture v runs upward (flipY), so v = 1 - y; nearest vertex is within one segment
      expect(Math.abs(uv.getX(best) - x)).toBeLessThan(1 / 128 + 1e-9)
      expect(Math.abs(uv.getY(best) - (1 - y))).toBeLessThan(1 / 64 + 1e-9)
    }
  })

  it('puts a geodetic latitude on the right point of the squashed globe', () => {
    // WGS-84: geodetic 45 N is at radius 6367.49 km, z = 4487.35 km
    const f = 1 / 298.257223563
    const p = lonLatToVector3(0, reducedLatitude(45, f), 6378.137)
    p.z *= 1 - f
    expect(p.z).toBeCloseTo(4487.35, 1)
    expect(p.length()).toBeCloseTo(6367.49, 1)
    expect(reducedLatitude(0, f)).toBe(0)
    expect(reducedLatitude(90, f)).toBe(90)
    expect(reducedLatitude(-30, 0)).toBe(-30)
    // Jupiter: 6.5% flattening moves mid-latitudes by almost two degrees
    expect(45 - reducedLatitude(45, 0.06487)).toBeGreaterThan(1.8)
  })
})
