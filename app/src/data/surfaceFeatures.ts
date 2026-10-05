/**
 * Named surface features used to draw the central bodies: where they are, how big, and what
 * they look like. Coordinates are latitude and east longitude in degrees, sizes are diameters
 * in km, as published by the IAU Gazetteer of Planetary Nomenclature (planetarynames.wr.usgs.gov).
 * The lunar maria, the lunar craters and the Martian volcanoes, basins and plains were checked
 * against those published values on 2026-10-05 and agree to a tenth of a degree. The classical
 * dark regions of Mars are telescopic albedo features without sharp edges; their centres and
 * extents are approximate by nature. Jupiter's belt edges are the conventional latitudes (the
 * Equatorial Zone spans 7 S to 7 N, the equatorial belts reach 18 degrees); the belts drift by
 * a few degrees over the years. Where one feature is drawn as several patches (Procellarum,
 * Frigoris) the patches are a drawing device, not separate named features.
 */

export interface SurfaceFeature {
  name: string
  lat: number
  lon: number
  /** km */
  diameter: number
  /** 0..1: how strongly the feature shows (a patchy mare is less than 1). */
  weight?: number
}

export const MOON_RADIUS_KM = 1737.4

/** Lunar maria: dark basalt plains. The large irregular ones are several overlapping patches. */
export const MOON_MARIA: SurfaceFeature[] = [
  { name: 'Oceanus Procellarum', lat: 20.7, lon: -56.7, diameter: 1500 },
  { name: 'Oceanus Procellarum (north)', lat: 40.0, lon: -55.0, diameter: 800, weight: 0.9 },
  { name: 'Oceanus Procellarum (south)', lat: 2.0, lon: -48.0, diameter: 900, weight: 0.9 },
  { name: 'Mare Imbrium', lat: 34.7, lon: -14.9, diameter: 1146 },
  { name: 'Mare Serenitatis', lat: 27.3, lon: 18.4, diameter: 674 },
  { name: 'Mare Tranquillitatis', lat: 8.4, lon: 30.8, diameter: 876 },
  { name: 'Mare Crisium', lat: 16.2, lon: 59.1, diameter: 556 },
  { name: 'Mare Fecunditatis', lat: -7.8, lon: 53.7, diameter: 840 },
  { name: 'Mare Nectaris', lat: -15.2, lon: 34.6, diameter: 339 },
  { name: 'Mare Nubium', lat: -20.6, lon: -17.3, diameter: 715 },
  { name: 'Mare Humorum', lat: -24.5, lon: -38.6, diameter: 420 },
  { name: 'Mare Cognitum', lat: -10.5, lon: -22.3, diameter: 350 },
  { name: 'Mare Insularum', lat: 7.8, lon: -30.6, diameter: 512, weight: 0.85 },
  { name: 'Mare Vaporum', lat: 13.2, lon: 4.1, diameter: 242 },
  { name: 'Sinus Medii', lat: 1.6, lon: 1.0, diameter: 287, weight: 0.8 },
  { name: 'Sinus Iridum', lat: 45.0, lon: -31.7, diameter: 249 },
  // Mare Frigoris is a long east-west band near 57 N
  { name: 'Mare Frigoris (west)', lat: 58.0, lon: -32.0, diameter: 330, weight: 0.85 },
  { name: 'Mare Frigoris', lat: 57.6, lon: -12.0, diameter: 330, weight: 0.85 },
  { name: 'Mare Frigoris', lat: 57.0, lon: 8.0, diameter: 330, weight: 0.85 },
  { name: 'Mare Frigoris (east)', lat: 55.5, lon: 28.0, diameter: 330, weight: 0.85 },
  // limb and far side
  { name: 'Mare Orientale', lat: -19.9, lon: -94.7, diameter: 294 },
  { name: 'Mare Smythii', lat: -1.7, lon: 87.1, diameter: 374, weight: 0.85 },
  { name: 'Mare Marginis', lat: 12.7, lon: 86.5, diameter: 358, weight: 0.8 },
  { name: 'Mare Humboldtianum', lat: 56.9, lon: 81.5, diameter: 231, weight: 0.85 },
  // Mare Australe is 997 km across but patchy: a field of flooded craters rather than one sheet
  { name: 'Mare Australe', lat: -47.8, lon: 92.0, diameter: 700, weight: 0.55 },
  { name: 'Mare Moscoviense', lat: 27.3, lon: 148.1, diameter: 276 },
  { name: 'Mare Ingenii', lat: -33.3, lon: 164.8, diameter: 282, weight: 0.8 },
]

/** The South Pole-Aitken basin: far-side highlands a little darker than the rest. */
export const MOON_SPA: SurfaceFeature = { name: 'South Pole-Aitken basin', lat: -53.0, lon: -169.0, diameter: 2500 }

/** Young craters with bright ejecta and rays. `weight` is the brightness of the ray system. */
export const MOON_RAY_CRATERS: SurfaceFeature[] = [
  { name: 'Tycho', lat: -43.3, lon: -11.4, diameter: 85, weight: 1.0 },
  { name: 'Copernicus', lat: 9.6, lon: -20.1, diameter: 96, weight: 0.75 },
  { name: 'Kepler', lat: 8.1, lon: -38.0, diameter: 29, weight: 0.6 },
  { name: 'Aristarchus', lat: 23.7, lon: -47.4, diameter: 40, weight: 0.7 },
  { name: 'Proclus', lat: 16.1, lon: 46.8, diameter: 27, weight: 0.45 },
  { name: 'Anaxagoras', lat: 73.5, lon: -10.2, diameter: 52, weight: 0.4 },
  { name: 'Giordano Bruno', lat: 36.0, lon: 102.9, diameter: 22, weight: 0.5 },
  { name: 'Jackson', lat: 22.4, lon: -163.1, diameter: 71, weight: 0.6 },
]

/** Large craters with dark, lava-flooded floors. */
export const MOON_DARK_CRATERS: SurfaceFeature[] = [
  { name: 'Plato', lat: 51.6, lon: -9.3, diameter: 101 },
  { name: 'Grimaldi', lat: -5.2, lon: -68.6, diameter: 173 },
  { name: 'Tsiolkovskiy', lat: -20.4, lon: 129.0, diameter: 185, weight: 0.6 },
]

export const MARS_RADIUS_KM = 3389.5

/** Classical dark albedo regions of Mars: wind-swept basalt showing through the dust. */
export const MARS_DARK: SurfaceFeature[] = [
  { name: 'Syrtis Major', lat: 8.4, lon: 69.5, diameter: 1350 },
  { name: 'Syrtis Major (north)', lat: 19.0, lon: 71.0, diameter: 700, weight: 0.9 },
  { name: 'Acidalia Planitia', lat: 49.8, lon: -20.7, diameter: 2300, weight: 0.9 },
  { name: 'Niliacus Lacus', lat: 30.0, lon: -30.0, diameter: 900, weight: 0.8 },
  { name: 'Utopia Planitia', lat: 46.7, lon: 117.5, diameter: 2200, weight: 0.45 },
  { name: 'Mare Erythraeum', lat: -25.0, lon: -40.0, diameter: 1800, weight: 0.85 },
  { name: 'Aurorae Sinus', lat: -15.0, lon: -50.0, diameter: 900, weight: 0.8 },
  { name: 'Margaritifer Sinus', lat: -10.0, lon: -25.0, diameter: 800, weight: 0.8 },
  { name: 'Sinus Meridiani', lat: -5.0, lon: 0.0, diameter: 700, weight: 0.9 },
  { name: 'Sinus Sabaeus', lat: -8.0, lon: 15.0, diameter: 600, weight: 0.9 },
  { name: 'Sinus Sabaeus (east)', lat: -9.0, lon: 30.0, diameter: 600, weight: 0.9 },
  { name: 'Mare Serpentis', lat: -30.0, lon: 40.0, diameter: 1100, weight: 0.75 },
  { name: 'Mare Tyrrhenum', lat: -20.0, lon: 105.0, diameter: 1500, weight: 0.85 },
  { name: 'Mare Cimmerium', lat: -20.0, lon: 140.0, diameter: 1700, weight: 0.85 },
  { name: 'Mare Sirenum', lat: -30.0, lon: -155.0, diameter: 1800, weight: 0.85 },
  { name: 'Solis Lacus', lat: -26.0, lon: -85.0, diameter: 700, weight: 0.8 },
  { name: 'Mare Chronium', lat: -58.0, lon: 150.0, diameter: 1500, weight: 0.5 },
  { name: 'Cerberus', lat: 15.0, lon: 162.0, diameter: 500, weight: 0.5 },
]

/** Bright regions: dust-covered plains and basins that often hold frost or haze. */
export const MARS_BRIGHT: SurfaceFeature[] = [
  { name: 'Hellas Planitia', lat: -42.4, lon: 70.5, diameter: 2300, weight: 1.0 },
  { name: 'Argyre Planitia', lat: -49.7, lon: -44.0, diameter: 1700, weight: 0.7 },
  { name: 'Arabia Terra', lat: 21.0, lon: 6.0, diameter: 2600, weight: 0.5 },
  { name: 'Tharsis', lat: 0.0, lon: -100.0, diameter: 3500, weight: 0.45 },
  { name: 'Amazonis Planitia', lat: 24.8, lon: -164.0, diameter: 2800, weight: 0.5 },
  { name: 'Elysium Planitia', lat: 3.0, lon: 155.0, diameter: 2000, weight: 0.4 },
  { name: 'Isidis Planitia', lat: 12.9, lon: 87.0, diameter: 1225, weight: 0.5 },
]

/** Shield volcanoes. */
export const MARS_VOLCANOES: SurfaceFeature[] = [
  { name: 'Olympus Mons', lat: 18.65, lon: -133.8, diameter: 610 },
  { name: 'Ascraeus Mons', lat: 11.9, lon: -104.1, diameter: 456 },
  { name: 'Pavonis Mons', lat: 1.5, lon: -113.0, diameter: 366 },
  { name: 'Arsia Mons', lat: -8.3, lon: -120.1, diameter: 470 },
  { name: 'Elysium Mons', lat: 25.0, lon: 147.2, diameter: 401 },
  { name: 'Alba Mons', lat: 40.5, lon: -109.6, diameter: 1100, weight: 0.4 },
]

/** Valles Marineris, from Noctis Labyrinthus east to Eos Chasma, as a polyline of [lat, lon]. */
export const MARS_VALLES_MARINERIS: Array<[number, number]> = [
  [-7.0, -98.0], [-8.5, -88.0], [-10.5, -78.0], [-12.5, -68.0], [-13.5, -58.0], [-13.0, -48.0], [-12.0, -40.0],
]

/**
 * Residual polar caps. The northern cap, on Planum Boreum, is centred within two degrees of the
 * pole. The southern residual cap is much smaller and sits about three degrees off the pole; its
 * direction of offset here is from memory and was not checked.
 */
export const MARS_NORTH_CAP: SurfaceFeature = { name: 'Planum Boreum', lat: 90.0, lon: 0.0, diameter: 1100 }
export const MARS_SOUTH_CAP: SurfaceFeature = { name: 'Planum Australe (residual cap)', lat: -87.0, lon: -45.0, diameter: 420 }

export const JUPITER_FLATTENING = 0.06487
export const JUPITER_RADIUS_KM = 71492

export interface CloudBand {
  name: string
  /** planetographic latitude of the band's northern edge, degrees; bands are listed south to north */
  north: number
  /** linear RGB, 0..1 */
  color: [number, number, number]
}

const ZONE: [number, number, number] = [0.90, 0.86, 0.76]
const BELT: [number, number, number] = [0.60, 0.41, 0.28]
const TEMPERATE_BELT: [number, number, number] = [0.68, 0.56, 0.44]
const POLAR: [number, number, number] = [0.55, 0.51, 0.47]

/** Jupiter's belts (dark) and zones (bright), south to north. */
export const JUPITER_BANDS: CloudBand[] = [
  { name: 'South Polar Region', north: -50, color: POLAR },
  { name: 'South South Temperate Zone', north: -44, color: [0.80, 0.76, 0.68] },
  { name: 'South South Temperate Belt', north: -38, color: TEMPERATE_BELT },
  { name: 'South Temperate Zone', north: -33, color: ZONE },
  { name: 'South Temperate Belt', north: -27, color: TEMPERATE_BELT },
  { name: 'South Tropical Zone', north: -18, color: ZONE },
  { name: 'South Equatorial Belt', north: -7, color: BELT },
  { name: 'Equatorial Zone', north: 7, color: [0.90, 0.83, 0.68] },
  { name: 'North Equatorial Belt', north: 18, color: [0.57, 0.38, 0.26] },
  { name: 'North Tropical Zone', north: 24, color: ZONE },
  { name: 'North Temperate Belt', north: 31, color: TEMPERATE_BELT },
  { name: 'North Temperate Zone', north: 36, color: ZONE },
  { name: 'North North Temperate Belt', north: 43, color: TEMPERATE_BELT },
  { name: 'North North Temperate Zone', north: 50, color: [0.80, 0.76, 0.68] },
  { name: 'North Polar Region', north: 90, color: POLAR },
]

/**
 * The Great Red Spot, 22 degrees south. It has been shrinking for a century: 16,350 km wide when
 * NASA measured it in April 2017, against 40,000 km in the 1800s, and 12,000 to 14,000 km north
 * to south. Its longitude drifts, so the value here is only where it is drawn.
 */
export const JUPITER_GRS = { lat: -22.4, lon: -60.0, lengthKm: 16350, heightKm: 12500 }
/** Oval BA, the smaller red oval in the South Temperate Belt. */
export const JUPITER_OVAL_BA = { lat: -33.0, lon: 20.0, lengthKm: 7000, heightKm: 5500 }

/** Sunspot groups for the drawing. Real spots come and go; these only sit where spots occur, 5 to 35 degrees from the equator. */
export const SUN_SPOTS: SurfaceFeature[] = [
  { name: 'group A leader', lat: 16.0, lon: 20.0, diameter: 42000 },
  { name: 'group A follower', lat: 14.0, lon: 28.0, diameter: 26000 },
  { name: 'group B', lat: -19.0, lon: -55.0, diameter: 36000 },
  { name: 'group B follower', lat: -21.0, lon: -47.0, diameter: 20000 },
  { name: 'group C', lat: 9.0, lon: -140.0, diameter: 30000 },
  { name: 'group D', lat: -27.0, lon: 135.0, diameter: 24000 },
]
export const SUN_RADIUS_KM = 695700

/** Unit vector for a latitude and east longitude (degrees), body-fixed: +x prime meridian, +z north pole. */
export function featureDirection(lat: number, lon: number): [number, number, number] {
  const d = Math.PI / 180
  const c = Math.cos(lat * d)
  return [c * Math.cos(lon * d), c * Math.sin(lon * d), Math.sin(lat * d)]
}
