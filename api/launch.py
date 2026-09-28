"""Launch from a site on the surface into a circular parking orbit, then hand over to the tour.

What is modelled, and how honestly:
- Site geometry on the WGS-84 ellipsoid, rotated into the inertial frame by Greenwich mean
  sidereal time (the same GMST the browser uses to spin the globe), so the pad is where the
  drawn Earth says it is. Earth's rotation contributes the initial eastward velocity.
- Launch azimuth from spherical trigonometry, cos i = cos(lat) sin(azimuth), and a launch window
  found by sliding the liftoff time until the pad lies in the target satellite's orbit plane.
- A planar ascent integrated step by step: staged thrust with sea-level to vacuum Isp blending,
  exponential-atmosphere drag, a vertical rise, a pitch kick, then a gravity turn (thrust along
  the air-relative velocity) with a pitch limit on upper stages; main-engine cutoff when the
  apoapsis reaches the parking radius; coast to apoapsis; an impulsive circularization burn.
  The kick angle is chosen by a scan for the least propellant.
- Reported: propellant per stage, gross mass, ideal delta-v, gravity, drag and steering losses,
  max dynamic pressure, max acceleration, and the parking orbit. Not modelled: winds, a real
  atmosphere table, throttling, range-safety corridors, fairing mass, boost-back.
Units km, km/s, s, kg, N, rad unless stated.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .propagation import propagate_universal

G0 = 9.80665                 # m/s^2
OMEGA_E = 7.2921159e-5       # rad/s
A_WGS84 = 6378.137           # km
F_WGS84 = 1 / 298.257223563
E2_WGS84 = F_WGS84 * (2 - F_WGS84)
RHO0 = 1.225                 # kg/m^3
H_RHO = 7.16                 # km, density scale height
H_P = 7.0                    # km, pressure scale height for Isp blending
ATMOSPHERE_TOP = 150.0       # km, no drag above
SIDEREAL_DAY = 86164.0905


# ---------------- time and site geometry ----------------

def julian_date(epoch_ms: float, t: float) -> float:
    return (epoch_ms / 1000.0 + t) / 86400.0 + 2440587.5


def gmst(epoch_ms: float, t: float) -> float:
    """Greenwich mean sidereal time (IAU 1982, UTC taken as UT1), radians; matches satellite.js gstime."""
    T = (julian_date(epoch_ms, t) - 2451545.0) / 36525.0
    sec = 67310.54841 + (876600.0 * 3600.0 + 8640184.812866) * T + 0.093104 * T * T - 6.2e-6 * T ** 3
    return (sec % 86400.0) * (2 * math.pi / 86400.0)


@dataclass
class Planet:
    """Shape and spin of the launch body. Earth uses WGS-84 and GMST, exactly like the browser's
    globe; other bodies are spheres spun at 2*pi*t / rotationPeriod, again like the browser."""
    radius: float = A_WGS84
    e2: float = E2_WGS84
    omega: float = OMEGA_E
    earth: bool = True

    def spin(self, epoch_ms: float, t: float) -> float:
        return gmst(epoch_ms, t) if self.earth else self.omega * t


EARTH = Planet()


def planet_for(body_id: str, radius: float, rotation_period: float | None) -> Planet:
    if body_id == "earth":
        return EARTH
    omega = 2 * math.pi / rotation_period if rotation_period else 0.0
    return Planet(radius=radius, e2=0.0, omega=omega, earth=False)


def site_ecef(lat_deg: float, lon_deg: float, alt_km: float, planet: Planet = EARTH) -> np.ndarray:
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    N = planet.radius / math.sqrt(1 - planet.e2 * math.sin(lat) ** 2)
    return np.array([(N + alt_km) * math.cos(lat) * math.cos(lon),
                     (N + alt_km) * math.cos(lat) * math.sin(lon),
                     (N * (1 - planet.e2) + alt_km) * math.sin(lat)])


def rot_z(theta: float) -> np.ndarray:
    c, s = math.cos(theta), math.sin(theta)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def site_inertial(lat_deg: float, lon_deg: float, alt_km: float, epoch_ms: float, t: float, planet: Planet = EARTH):
    """Pad position (km) and velocity from the body's rotation (km/s) in the inertial frame at time t."""
    r = rot_z(planet.spin(epoch_ms, t)) @ site_ecef(lat_deg, lon_deg, alt_km, planet)
    v = np.cross(np.array([0.0, 0.0, planet.omega]), r)
    return r, v


def enu_inertial(lat_deg: float, lon_deg: float, epoch_ms: float, t: float, planet: Planet = EARTH):
    """East, north and up unit vectors at the pad in the inertial frame at time t."""
    lat = math.radians(lat_deg)
    lam = math.radians(lon_deg) + planet.spin(epoch_ms, t)
    east = np.array([-math.sin(lam), math.cos(lam), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lam), -math.sin(lat) * math.sin(lam), math.cos(lat)])
    up = np.array([math.cos(lat) * math.cos(lam), math.cos(lat) * math.sin(lam), math.sin(lat)])
    return east, north, up


def launch_azimuth(inclination_deg: float, lat_deg: float, descending: bool = False):
    """Azimuth (rad, from north through east) that reaches the inclination; None when the
    inclination is below the latitude, which no direct launch can reach."""
    c = math.cos(math.radians(inclination_deg)) / math.cos(math.radians(lat_deg))
    if abs(c) > 1:
        return None
    b = math.asin(c)
    return math.pi - b if descending else b


def plane_normal(lat_deg: float, lon_deg: float, azimuth: float, epoch_ms: float, t: float, planet: Planet = EARTH) -> np.ndarray:
    east, north, up = enu_inertial(lat_deg, lon_deg, epoch_ms, t, planet)
    d = math.cos(azimuth) * north + math.sin(azimuth) * east
    n = np.cross(up, d)
    return n / np.linalg.norm(n)


def find_window(lat_deg, lon_deg, epoch_ms, t0, inclination_deg, target_normal, planet: Planet = EARTH):
    """Liftoff time in [t0, t0 + one rotation] and azimuth that put the pad in the target plane
    heading along it. Returns (t, azimuth, alignment) with alignment = cosine between the planes."""
    best = None
    day = 2 * math.pi / planet.omega if planet.omega > 0 else SIDEREAL_DAY
    for descending in (False, True):
        az = launch_azimuth(inclination_deg, lat_deg, descending)
        if az is None:
            continue
        def align(t):
            return float(np.dot(plane_normal(lat_deg, lon_deg, az, epoch_ms, t, planet), target_normal))
        ts = np.arange(t0, t0 + day, day / 720.0)
        vals = [align(float(t)) for t in ts]
        k = int(np.argmax(vals))
        a, b = float(ts[max(k - 1, 0)]), float(ts[min(k + 1, len(ts) - 1)])
        for _ in range(40):  # golden-section on the alignment
            c = b - 0.618034 * (b - a)
            d = a + 0.618034 * (b - a)
            if align(c) > align(d):
                b = d
            else:
                a = c
        t = 0.5 * (a + b)
        if best is None or align(t) > best[2]:
            best = (t, az, align(t))
    return best


# ---------------- vehicle and ascent ----------------

@dataclass
class Stage:
    name: str
    dry: float          # kg
    propellant: float   # kg
    isp_vac: float      # s
    isp_sl: float       # s
    thrust_vac: float   # N


@dataclass
class AscentResult:
    feasible: bool
    kick_deg: float
    t_meco: float
    t_coast: float
    samples: list            # (t, r, theta, vr, vt, m, thrusting)
    stage_use: list          # (name, propellant_used, burn_time, ignition, cutoff)
    events: list             # (t, label)
    ideal_dv: float
    gravity_loss: float
    drag_loss: float
    steering_loss: float
    circ_dv: float
    circ_propellant: float
    max_q: float             # kPa
    max_g: float
    meco_state: tuple        # (r, theta, vr, vt, m)
    max_apoapsis: float
    warnings: list = field(default_factory=list)
    yaw_dv: float = 0.0


def _rho(h_km: float) -> float:
    return RHO0 * math.exp(-h_km / H_RHO) if h_km < ATMOSPHERE_TOP else 0.0


def _apoapsis(r, vr, vt, mu):
    eps = (vr * vr + vt * vt) / 2 - mu / r
    if eps >= 0:
        return math.inf
    a = -mu / (2 * eps)
    e = math.sqrt(max(1 - (r * vt) ** 2 / (mu * a), 0.0))
    return a * (1 + e)


def simulate_ascent(stages: list[Stage], payload: float, r0: float, vt0: float, mu: float, r_park: float,
                    cd_area: float, kick_deg: float, dt: float = 0.5, t_vertical: float = 8.0,
                    t_kick: float = 8.0, max_g: float = 5.0, radius: float = A_WGS84,
                    atmosphere: bool = True, v_perp: float = 0.0) -> AscentResult:
    """Planar ascent in the launch plane; r km, velocities km/s, masses kg, forces N.
    r0 is the pad radius, radius the local sea-level radius (for altitude and the atmosphere).
    v_perp is the pad's velocity component out of the launch plane; the vehicle has to steer it
    out, which by vector addition costs about v_perp^2 / (2 dv) and is charged at cutoff.

    Steering: vertical rise, a pitch kick of kick_deg, then a gravity turn (thrust along the
    air-relative velocity) while the first stage burns inside the sensible atmosphere; after that a
    closed-loop law picks the pitch so the radial speed reaches zero exactly at the parking radius
    (constant radial deceleration), which is what a simple launch guidance does. Thrust is
    throttled to hold max_g. Main engine cutoff when the osculating apoapsis reaches the parking
    radius, then a coast and an impulsive circularization from the same stage's remaining propellant.
    """
    kick = math.radians(kick_deg)
    m = payload + sum(s.dry + s.propellant for s in stages)
    r, th, vr, vt = r0, 0.0, 0.0, vt0
    t = 0.0
    stage_i = 0
    prop_left = [s.propellant for s in stages]
    stage_use = []
    ignition = 0.0
    events = [(0.0, "liftoff")]
    ideal = grav = drag_l = steer = 0.0
    max_q = max_gee = 0.0
    max_apo = r0
    samples = []
    meco = None
    g_cap = max_g * G0 / 1000.0                          # km/s^2

    def derivs(state, t, stage: Stage, closed_loop: bool):
        r, th, vr, vt, m = state
        h_km = r - radius
        isp = stage.isp_vac - (stage.isp_vac - stage.isp_sl) * math.exp(-h_km / H_P)
        F = stage.thrust_vac * isp / stage.isp_vac       # N, sea-level to vacuum thrust
        a_thr = F / m / 1000.0                            # km/s^2
        if a_thr > g_cap:                                 # throttle down
            a_thr = g_cap
            F = a_thr * m * 1000.0
        mdot = F / (isp * G0)
        vt_air = vt - vt0 * (r / r0)                      # the atmosphere co-rotates
        vrel = math.hypot(vr, vt_air)
        rho = _rho(h_km) if atmosphere else 0.0
        q = 0.5 * rho * (vrel * 1000.0) ** 2              # Pa
        a_drag = q * cd_area / m / 1000.0
        g = mu / (r * r)
        if t < t_vertical:
            ur, ut = 1.0, 0.0
        elif t < t_vertical + t_kick:
            ur, ut = math.cos(kick), math.sin(kick)
        elif not closed_loop:
            gamma = math.atan2(vr, vt_air) if vrel > 1e-9 else math.pi / 2
            ur, ut = math.sin(gamma), math.cos(gamma)
        else:
            dh = r_park - r
            a_r_des = -vr * abs(vr) / (2 * dh) if dh > 0.05 else -vr / 5.0
            need = a_r_des + g - vt * vt / r
            s_pitch = max(min(need / a_thr, math.sin(math.radians(60.0))), math.sin(math.radians(-10.0)))
            ur, ut = s_pitch, math.sqrt(1 - s_pitch * s_pitch)
        if vrel > 1e-9:
            dr_r, dr_t = -a_drag * vr / vrel, -a_drag * vt_air / vrel
        else:
            dr_r = dr_t = 0.0
        ar = a_thr * ur + dr_r - g + vt * vt / r
        at = a_thr * ut + dr_t - vr * vt / r
        vmag = math.hypot(vr, vt)
        sin_gamma = vr / vmag if vmag > 1e-9 else 1.0
        cos_ang = (ur * vr + ut * vt) / vmag if vmag > 1e-9 else 1.0
        return (vr, vt / r, ar, at, -mdot), (a_thr, g * sin_gamma, a_drag, a_thr * (1 - cos_ang), q, a_thr / (G0 / 1000.0))

    while stage_i < len(stages):
        stage = stages[stage_i]
        while prop_left[stage_i] > 0:
            closed_loop = stage_i > 0 or (r - radius) > 60.0
            state = (r, th, vr, vt, m)
            k1, book = derivs(state, t, stage, closed_loop)
            s2 = tuple(x + 0.5 * dt * k for x, k in zip(state, k1)); k2, _ = derivs(s2, t + 0.5 * dt, stage, closed_loop)
            s3 = tuple(x + 0.5 * dt * k for x, k in zip(state, k2)); k3, _ = derivs(s3, t + 0.5 * dt, stage, closed_loop)
            s4 = tuple(x + dt * k for x, k in zip(state, k3)); k4, _ = derivs(s4, t + dt, stage, closed_loop)
            r, th, vr, vt, m_new = tuple(x + dt / 6 * (a + 2 * b + 2 * c + d) for x, a, b, c, d in zip(state, k1, k2, k3, k4))
            prop_left[stage_i] -= m - m_new
            m = m_new
            t += dt
            a_thr, gl, dl, sl, q, gee = book
            ideal += a_thr * dt; grav += gl * dt; drag_l += dl * dt; steer += sl * dt
            max_q = max(max_q, q / 1000.0); max_gee = max(max_gee, gee)
            samples.append((t, r, th, vr, vt, m, True))
            if r < r0 - 0.5:
                return AscentResult(False, kick_deg, t, 0.0, samples, stage_use, events + [(t, "impact")], ideal, grav, drag_l, steer,
                                    0.0, 0.0, max_q, max_gee, (r, th, vr, vt, m), max_apo, ["the trajectory came back down"])
            apo = _apoapsis(r, vr, vt, mu)
            max_apo = max(max_apo, apo if math.isfinite(apo) else r)
            if r - radius > 60.0 and vr >= -1e-6 and apo >= r_park:
                meco = (r, th, vr, vt, m)
                break
        used = stage.propellant - max(prop_left[stage_i], 0.0)
        stage_use.append((stage.name, used, t - ignition, ignition, t))
        if meco is not None:
            events.append((t, "main engine cutoff"))
            break
        m -= stage.dry + max(prop_left[stage_i], 0.0)     # drop the spent stage
        stage_i += 1
        ignition = t
        if stage_i < len(stages):
            events.append((t, f"{stages[stage_i - 1].name} separation, {stages[stage_i].name} ignition"))
    if meco is None:
        return AscentResult(False, kick_deg, t, 0.0, samples, stage_use, events, ideal, grav, drag_l, steer, 0.0, 0.0,
                            max_q, max_gee, (r, th, vr, vt, m), max_apo,
                            [f"propellant exhausted with apoapsis at {max_apo - radius:.0f} km, target {r_park - radius:.0f} km"])
    # coast to apoapsis and circularize with the current stage's remaining propellant
    r, th, vr, vt, m = meco
    stage = stages[stage_i]
    yaw_dv = v_perp * v_perp / (2 * max(ideal, 1e-6))
    m_yaw = m * math.exp(-yaw_dv / (stage.isp_vac * G0 / 1000.0))
    prop_left[stage_i] -= m - m_yaw
    m = m_yaw
    ideal += yaw_dv
    meco = (r, th, vr, vt, m)
    eps = (vr * vr + vt * vt) / 2 - mu / r
    a = -mu / (2 * eps)
    h = r * vt
    e = math.sqrt(max(1 - h * h / (mu * a), 0.0))
    n = math.sqrt(mu / a ** 3)
    if e > 1e-9:
        E = math.atan2(r * vr / math.sqrt(mu * a), 1 - r / a)
        t_coast = max((math.pi - E + e * math.sin(E)) / n, 0.0)
    else:
        t_coast = 0.0
    v_apo = h / r_park
    v_circ = math.sqrt(mu / r_park)
    circ_dv = max(v_circ - v_apo, 0.0)
    m_after = m * math.exp(-circ_dv / (stage.isp_vac * G0 / 1000.0))
    circ_prop = m - m_after
    warnings = []
    feasible = True
    if circ_prop > max(prop_left[stage_i], 0.0) + 1e-6:
        feasible = False
        warnings.append(f"circularization needs {circ_prop:.0f} kg but {max(prop_left[stage_i], 0):.0f} kg remain in {stage.name}")
    events.append((t + t_coast, "circularization burn"))
    res = AscentResult(feasible, kick_deg, t, t_coast, samples, stage_use, events, ideal, grav, drag_l, steer, circ_dv,
                       circ_prop, max_q, max_gee, meco, max_apo, warnings)
    res.yaw_dv = yaw_dv
    return res


def best_ascent(stages, payload, r0, vt0, mu, r_park, cd_area, max_g=5.0, radius=A_WGS84, atmosphere=True, v_perp=0.0):
    """Scan the pitch-kick angle and keep the feasible ascent that burns the least propellant."""
    best = None
    attempts = []
    for kick in (1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0):
        res = simulate_ascent(stages, payload, r0, vt0, mu, r_park, cd_area, kick, max_g=max_g, radius=radius,
                              atmosphere=atmosphere, v_perp=v_perp)
        attempts.append(res)
        if not res.feasible:
            continue
        cost = sum(u[1] for u in res.stage_use) + res.circ_propellant
        if best is None or cost < best[0]:
            best = (cost, res)
    if best:
        return best[1]
    return max(attempts, key=lambda a: a.max_apoapsis)   # the closest failure, for the report


def to_inertial(sample, r_hat, t_hat):
    """Planar (r, theta, vr, vt) to 3-D position and velocity in the launch plane."""
    _, r, th, vr, vt, _, _ = sample
    rh = math.cos(th) * r_hat + math.sin(th) * t_hat
    tt = -math.sin(th) * r_hat + math.cos(th) * t_hat
    return r * rh, vr * rh + vt * tt
