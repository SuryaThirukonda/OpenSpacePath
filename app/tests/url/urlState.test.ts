import { describe, expect, it } from 'vitest'
import { BODY_BY_ID } from '../../src/data/bodies'
import { ISS_TLE, PRESETS, satelliteFromPreset } from '../../src/data/presets'
import type { Scenario } from '../../src/types'
import { decodeScenario, encodeScenario, scenarioFromLocation, scenarioToSearch } from '../../src/url/urlState'

const sc: Scenario = {
  bodyId: 'earth',
  epoch: '2026-09-01T12:00:00Z',
  satellites: [
    satelliteFromPreset(PRESETS[0], BODY_BY_ID.earth),
    { id: 'tle-1', kind: 'tle', name: ISS_TLE.name, color: '#fff', line1: ISS_TLE.line1, line2: ISS_TLE.line2 },
  ],
  spanSeconds: 5580,
  rate: 60,
}

describe('url state', () => {
  it('round trips a scenario', () => {
    expect(decodeScenario(encodeScenario(sc))).toEqual(sc)
    expect(scenarioFromLocation(scenarioToSearch(sc))).toEqual(sc)
  })
  it('rejects garbage', () => {
    expect(decodeScenario('not-base64!!')).toBeNull()
    expect(decodeScenario(encodeScenario({ ...sc, epoch: 'yesterday' }))).toBeNull()
    expect(scenarioFromLocation('?x=1')).toBeNull()
  })
})
