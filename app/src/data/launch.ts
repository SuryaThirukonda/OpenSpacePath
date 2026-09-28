/**
 * Launch sites and vehicles for the launch-from-the-ground start. Site coordinates are the
 * public pad locations; vehicle numbers are illustrative, rounded from public figures, and stand
 * for a class of vehicle rather than any exact configuration.
 */
import type { LaunchSite, LaunchSpec, LaunchVehicle } from '../mission/types'

export const LAUNCH_SITES: LaunchSite[] = [
  { name: 'Cape Canaveral', latitude: 28.5, longitude: -80.6, altitude: 0 },
  { name: 'Kennedy LC-39A', latitude: 28.608, longitude: -80.604, altitude: 0 },
  { name: 'Vandenberg', latitude: 34.7, longitude: -120.6, altitude: 0.1 },
  { name: 'Baikonur', latitude: 45.92, longitude: 63.34, altitude: 0.1 },
  { name: 'Kourou', latitude: 5.24, longitude: -52.77, altitude: 0 },
  { name: 'Sriharikota', latitude: 13.72, longitude: 80.23, altitude: 0 },
  { name: 'Tanegashima', latitude: 30.4, longitude: 130.97, altitude: 0 },
  { name: 'Wenchang', latitude: 19.61, longitude: 110.95, altitude: 0 },
  { name: 'Mahia', latitude: -39.26, longitude: 177.86, altitude: 0 },
]

export const LAUNCH_VEHICLES: LaunchVehicle[] = [
  {
    name: 'Falcon 9-class', dragArea: 10.5, dragCoefficient: 0.3, maxAcceleration: 5,
    stages: [
      { name: 'first stage', dryMass: 25600, propellantMass: 395700, ispVacuum: 311, ispSeaLevel: 282, thrustVacuum: 8227000 },
      { name: 'second stage', dryMass: 3900, propellantMass: 92670, ispVacuum: 348, thrustVacuum: 981000 },
    ],
  },
  {
    name: 'Small launcher', dragArea: 1.2, dragCoefficient: 0.35, maxAcceleration: 7,
    stages: [
      { name: 'first stage', dryMass: 950, propellantMass: 9250, ispVacuum: 303, ispSeaLevel: 275, thrustVacuum: 225000 },
      { name: 'second stage', dryMass: 250, propellantMass: 2050, ispVacuum: 343, thrustVacuum: 25800 },
    ],
  },
  {
    name: 'Heavy three-stage', dragArea: 45, dragCoefficient: 0.32, maxAcceleration: 4.5,
    stages: [
      { name: 'first stage', dryMass: 130000, propellantMass: 2100000, ispVacuum: 304, ispSeaLevel: 263, thrustVacuum: 38000000 },
      { name: 'second stage', dryMass: 36000, propellantMass: 445000, ispVacuum: 421, thrustVacuum: 5100000 },
      { name: 'third stage', dryMass: 10000, propellantMass: 107000, ispVacuum: 421, thrustVacuum: 1000000 },
    ],
  },
]

export function defaultLaunch(): LaunchSpec {
  return { site: { ...LAUNCH_SITES[0] }, vehicle: cloneVehicle(LAUNCH_VEHICLES[0]), parkingAltitude: 200 }
}

export function cloneVehicle(v: LaunchVehicle): LaunchVehicle {
  return { ...v, stages: v.stages.map((s) => ({ ...s })) }
}

/** Ideal delta-v of a vehicle carrying `payload` kg, km/s, staging included (rocket equation per stage). */
export function vehicleCapacity(v: LaunchVehicle, payload: number): number {
  let total = 0
  let above = payload
  for (let k = v.stages.length - 1; k >= 0; k--) {
    const s = v.stages[k]
    const m0 = above + s.dryMass + s.propellantMass
    const m1 = above + s.dryMass
    total += 9.80665e-3 * s.ispVacuum * Math.log(m0 / m1)
    above = m0
  }
  return total
}

export function grossMass(v: LaunchVehicle, payload: number): number {
  return payload + v.stages.reduce((s, st) => s + st.dryMass + st.propellantMass, 0)
}
