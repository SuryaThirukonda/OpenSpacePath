"""The three-burn impulsive rendezvous of the derivation sheet, for a destination fixed in position and time.

Source: "A Three-Burn Impulsive Rendezvous Strategy Combining In-Plane Shaping, Plane Change, and
Velocity Matching: Derivations and Notes" (research/07_three_burn_transfer.md walks through it).

The chaser leaves the state (r_s, v_s) at t_d and must be at r_P at t_a, moving with v_P:
  burn 1  in the departure plane, on the departure orbit, at the time t_d + s T (0 <= s < 1):
          path-tangential (the velocity scaled by eta_1, sheet sections 3.4 and 5.2) or radial
          (sections 3.3 and 5.1), the two cases of the generic polar impulse of section 4
  burn 2  at the node line theta_2: the polar velocity components scaled by eta_2 (section 8)
          and rotated by phi about the radial axis (section 6), as one impulse
  burn 3  the velocity match at r_P
The sheet finds the rendezvous time by searching where the target crosses the new plane. Here the
arrival time is given, so the new plane is the one through the focus, the burn-2 point and r_P
(which fixes phi for each theta_2) and the rendezvous condition is that the three coasts add up
to T: the roots in theta_2 of f = t_A + t_B(theta_2) + t_C(theta_2) - T (section 10.2). Both
directions of travel from the node are tried, the sheet's two antipodal branches.

Departures from the sheet, so they can be checked:
  * the cost of burn 2 is |v2+ - v2-| with the rotation included; equation (40) is the scaling
    part |eta_2 - 1| |v2-| alone
  * Kepler's equation is used in its hyperbolic form when a coast is hyperbolic (fast transfers);
    section 9 writes the elliptic form
  * the selection is by the total of all three burns, not burns 1 and 2 alone

Vectorised over a grid of (s, burn-1 size, theta_2) so one transfer takes a fraction of a second.
Units km, km/s, s, rad.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import lambert
from .propagation import min_radius_on_conic_arc, propagate_universal

TWO_PI = 2.0 * math.pi
FAMILIES = ("tangential", "radial")

MAX_REVS = 6
# search sizes: s points, burn-1 sizes, theta_2 points per revolution, grid refinements, cells refined, s points for the direct member
QUALITY = {
    "fast": dict(n_s=7, s_max=0.8, n_k=10, n_t=120, levels=1, keep=1, direct=10, revs=3),
    "full": dict(n_s=20, s_max=0.9, n_k=28, n_t=360, levels=3, keep=3, direct=24, revs=MAX_REVS),
}
# burn-1 size as a fraction of the speed there (tangential: eta_1 - 1; radial: dv_r / V_1). Wide on
# purpose: fast transfers between distant orbits want first burns larger than the orbital speed.
RATIO = {"tangential": (-0.95, 2.0), "radial": (-2.0, 2.0)}
# What a candidate is judged by (section 10.3 of the sheet). "total" is the sum of the three impulses as
# actually applied; "sheet" is the sheet's own sum, burn 1 plus the scaling part of burn 2 from equation
# (40), |eta_2 - 1| |v_2^-|, which leaves out the rotation and burn 3. The reported burns are the
# actual impulses either way.
SELECTION = "total"


@dataclass
class ThreeBurn:
    t_d: float
    t_a: float
    family: str
    s: float                       # fraction of the transfer time spent on the departure orbit before burn 1
    theta1: float                  # polar angle of burn 1 in the departure plane
    theta2: float                  # polar angle of burn 2, the node line
    phi: float                     # plane change at burn 2
    psi: float                     # angle from the node to the destination in the new plane
    eta1: float                    # burn-1 scale (tangential family; nan for radial)
    eta2: float                    # burn-2 scale
    burns: list                    # (t, r, dv), inertial; two entries when burn 2 is not needed
    arcs: list                     # (t0, t1, r0, v0): the coasts before burn 1 (if any), 1 -> 2, 2 -> 3
    dv: tuple                      # magnitudes of burns 1, 2 and 3
    min_radius: float
    direct: bool = False           # burn 1 alone put the chaser on an orbit through the destination (coplanar case)
    warnings: list = field(default_factory=list)

    @property
    def cost(self) -> float:
        return float(sum(self.dv))

    @property
    def tof(self) -> float:
        return self.t_a - self.t_d


def _wrap(x):
    return (np.asarray(x, float) + math.pi) % TWO_PI - math.pi


def _tof(p, e, nu_a, dnu, mu):
    """Seconds along the conic (p, e) from true anomaly nu_a through the angle dnu >= 0 (sheet
    section 9, plus the hyperbolic form); nan where the arc does not exist."""
    p, e, nu_a, dnu = np.broadcast_arrays(np.asarray(p, float), np.asarray(e, float), np.asarray(nu_a, float), np.asarray(dnu, float))
    out = np.full(p.shape, np.nan)
    ell = e < 1 - 1e-12
    if ell.any():
        ee, pa, na, dn = e[ell], p[ell], nu_a[ell], dnu[ell]
        n = np.sqrt(mu * (1 - ee ** 2) ** 3 / pa ** 3)

        def mean(nu):
            E = 2 * np.arctan2(np.sqrt(1 - ee) * np.sin(nu / 2), np.sqrt(1 + ee) * np.cos(nu / 2))
            return E - ee * np.sin(E)

        revs = np.floor((dn + 1e-9) / TWO_PI)
        frac = dn - TWO_PI * revs
        dM = np.where(frac < 1e-9, 0.0, np.mod(mean(na + dn) - mean(na), TWO_PI))
        out[ell] = (dM + TWO_PI * revs) / n
    hyp = e > 1 + 1e-12
    if hyp.any():
        ee, pa, dn = e[hyp], p[hyp], dnu[hyp]
        na = _wrap(nu_a[hyp])
        nb = na + dn
        lim = np.arccos(-1 / ee)
        ok = (np.abs(na) < lim) & (nb < lim) & (dn < TWO_PI)
        n = np.sqrt(mu * (ee ** 2 - 1) ** 3 / pa ** 3)

        def mean_h(nu):
            x = np.clip(np.sqrt((ee - 1) / (ee + 1)) * np.tan(nu / 2), -1 + 1e-15, 1 - 1e-15)
            H = 2 * np.arctanh(x)
            return ee * np.sinh(H) - H

        val = (mean_h(np.where(ok, nb, 0.0)) - mean_h(np.where(ok, na, 0.0))) / n
        out[hyp] = np.where(ok, val, np.nan)
    return out


def _min_radius(p, e, nu_a, dnu, r_a, r_b):
    """Closest approach to the focus on the arc: periapsis if the arc passes it, else an end."""
    na = _wrap(nu_a)
    nb = na + dnu
    passes = ((na <= 0) & (nb >= 0)) | ((na > 0) & (nb >= TWO_PI))
    return np.where(passes, p / (1 + e), np.minimum(r_a, r_b))


class _Setup:
    """The problem in the sheet's frame: Z along the departure orbit's normal, X along its periapsis."""

    def __init__(self, mu, r_s, v_s, t_d, r_p, v_p, t_a):
        self.mu, self.t_d, self.t_a, self.T = float(mu), float(t_d), float(t_a), float(t_a - t_d)
        self.r_s, self.v_s = np.asarray(r_s, float), np.asarray(v_s, float)
        h0 = np.cross(self.r_s, self.v_s)
        hn = float(np.linalg.norm(h0))
        Z = h0 / hn
        evec = np.cross(self.v_s, h0) / mu - self.r_s / np.linalg.norm(self.r_s)
        self.e0 = float(np.linalg.norm(evec))
        X = evec / self.e0 if self.e0 > 1e-8 else self.r_s / np.linalg.norm(self.r_s)
        Y = np.cross(Z, X)
        self.R = np.array([X, Y, Z])
        self.p0 = hn * hn / mu
        self.P0 = TWO_PI * math.sqrt((self.p0 / (1 - self.e0 ** 2)) ** 3 / mu) if self.e0 < 1 else math.inf
        rs_f = self.R @ self.r_s
        self.theta10 = math.atan2(rs_f[1], rs_f[0]) % TWO_PI
        self.P = self.R @ np.asarray(r_p, float)
        self.vP = self.R @ np.asarray(v_p, float)
        self.r_dest = float(np.linalg.norm(self.P))
        self.Phat = self.P / self.r_dest

    # ---- burn 1: the state on the departure orbit at t_d + s T
    def burn1(self, s):
        s = np.atleast_1d(np.asarray(s, float))
        out = {k: np.empty(s.shape) for k in ("s", "theta1", "r1", "vr1", "vt1", "V1")}
        out["s"] = s
        for i, si in enumerate(s):
            dt = si * self.T
            r, v = (self.r_s, self.v_s) if dt <= 0 else propagate_universal(self.r_s, self.v_s, dt, self.mu)
            rf, vf = self.R @ r, self.R @ v
            ang = math.atan2(rf[1], rf[0]) % TWO_PI
            d = (ang - self.theta10) % TWO_PI
            revs = round((dt / self.P0 * TWO_PI - d) / TWO_PI) if math.isfinite(self.P0) else 0
            rn = float(np.linalg.norm(rf))
            rhat = rf / rn
            that = np.array([-rhat[1], rhat[0], 0.0])
            out["theta1"][i] = self.theta10 + d + TWO_PI * max(revs, 0)
            out["r1"][i] = rn
            out["vr1"][i] = float(vf @ rhat)
            out["vt1"][i] = float(vf @ that)
            out["V1"][i] = float(np.linalg.norm(vf))
        return out

    # ---- orbit 1: after burn 1 of a given family and size; arrays (n_s, n_k)
    def orbit1(self, b1, family, ratio):
        vr, vt, V1 = b1["vr1"][:, None], b1["vt1"][:, None], b1["V1"][:, None]
        r1, theta1 = b1["r1"][:, None], b1["theta1"][:, None]
        k = np.asarray(ratio, float)[None, :]
        if family == "tangential":
            eta1 = 1.0 + k
            vr_p, vt_p = eta1 * vr, eta1 * vt
        else:
            eta1 = np.full(np.broadcast(vr, k).shape, np.nan)
            vr_p, vt_p = vr + k * V1, vt + 0.0 * k
        dv1 = np.abs(k) * V1 + 0.0 * vr
        h1 = r1 * vt_p
        valid = vt_p > 1e-9
        h1 = np.where(valid, h1, 1.0)
        p1 = h1 * h1 / self.mu
        e1 = np.sqrt((p1 / r1 - 1) ** 2 + (h1 * vr_p / self.mu) ** 2)
        om1 = theta1 - np.arctan2(h1 * vr_p / self.mu, p1 / r1 - 1)
        cells = dict(s=b1["s"][:, None] + 0.0 * k, theta1=theta1 + 0.0 * k, r1=r1 + 0.0 * k, vr1=vr + 0.0 * k, vt1=vt + 0.0 * k,
                     vr1p=vr_p, vt1p=vt_p, h1=h1, p1=p1, e1=e1, om1=om1, dv1=dv1, eta1=eta1 + 0.0 * vr, ratio=k + 0.0 * vr,
                     valid=valid)
        return cells

    # ---- burn 2 and the coast to the destination, for cells broadcast against dtheta = theta2 - theta1
    def sweep(self, c, dtheta, sign):
        mu = self.mu
        theta2 = c["theta1"] + dtheta
        nu2 = theta2 - c["om1"]
        denom = 1 + c["e1"] * np.cos(nu2)
        valid = c["valid"] & (denom > 1e-9)
        denom = np.where(valid, denom, 1.0)
        r2 = c["p1"] / denom
        vr2 = np.sqrt(mu / c["p1"]) * c["e1"] * np.sin(nu2)
        vt2 = c["h1"] / r2
        c2, s2 = np.cos(theta2), np.sin(theta2)
        Px, Py, Pz = self.P
        Pu = Px * c2 + Py * s2
        Pw = -Px * s2 + Py * c2
        perp = np.hypot(Pw, Pz)
        valid &= perp > 1e-9 * self.r_dest
        perp = np.where(valid, perp, 1.0)
        cphi, sphi = sign * Pw / perp, sign * Pz / perp
        psi = np.arctan2(sign * perp, Pu)
        psi = np.where(psi < 0, psi + TWO_PI, psi)
        cpsi, spsi = np.cos(psi), np.sin(psi)
        den2 = c["p1"] / self.r_dest - (c["p1"] / r2) * cpsi + (c["h1"] * vr2 / mu) * spsi
        valid &= den2 > 1e-12
        den2 = np.where(valid, den2, 1.0)
        eta2 = np.sqrt(np.maximum((1 - cpsi) / den2, 0.0))
        dv2 = np.sqrt(np.maximum((eta2 - 1) ** 2 * vr2 ** 2 + vt2 ** 2 * (eta2 ** 2 - 2 * eta2 * cphi + 1), 0.0))
        h2 = eta2 * c["h1"]
        p2 = eta2 ** 2 * c["p1"]
        vr2p = eta2 * vr2
        e2 = np.sqrt((p2 / r2 - 1) ** 2 + (h2 * vr2p / mu) ** 2)
        nu_node = np.arctan2(h2 * vr2p / mu, p2 / r2 - 1)
        nu_dest = nu_node + psi
        # arrival velocity on orbit 2: radial along r_P, transverse along n2 x r_P
        nx, ny, nz = s2 * sphi, -c2 * sphi, cphi
        px, py, pz = self.Phat
        tx, ty, tz = ny * pz - nz * py, nz * px - nx * pz, nx * py - ny * px
        k2 = np.sqrt(mu / np.where(valid, p2, 1.0))
        vrad = k2 * e2 * np.sin(nu_dest)
        vtan = k2 * (1 + e2 * np.cos(nu_dest))
        v3x, v3y, v3z = vrad * px + vtan * tx, vrad * py + vtan * ty, vrad * pz + vtan * tz
        dv3 = np.sqrt((self.vP[0] - v3x) ** 2 + (self.vP[1] - v3y) ** 2 + (self.vP[2] - v3z) ** 2)
        tB = _tof(c["p1"], c["e1"], c["theta1"] - c["om1"], dtheta, mu)
        tC = _tof(p2, e2, nu_node, psi, mu)
        f = c["s"] * self.T + tB + tC - self.T
        rmin = np.minimum(_min_radius(c["p1"], c["e1"], c["theta1"] - c["om1"], dtheta, c["r1"], r2),
                          _min_radius(p2, e2, nu_node, psi, r2, self.r_dest))
        valid &= np.isfinite(tB) & np.isfinite(tC)
        dv_sheet = c["dv1"] + np.abs(eta2 - 1) * np.sqrt(vr2 ** 2 + vt2 ** 2)   # equation (40) plus burn 1
        return dict(valid=valid, f=np.where(valid, f, np.nan), dv=c["dv1"] + dv2 + dv3, dv2=dv2, dv3=dv3, rmin=rmin,
                    judge=(c["dv1"] + dv2 + dv3) if SELECTION == "total" else dv_sheet,
                    theta2=theta2, r2=r2, vr2=vr2, vt2=vt2, eta2=eta2, cphi=cphi, sphi=sphi, psi=psi,
                    v3=np.stack([v3x, v3y, v3z], axis=-1), tB=tB, tC=tC, p2=p2, e2=e2)


def _gather(c, idx):
    return {k: v[idx] for k, v in c.items()}


class _Search:
    def __init__(self, setup: _Setup, radius: float, dv_max: float, n_t: int, max_revs: int = MAX_REVS):
        self.S, self.radius, self.dv_max, self.n_t, self.max_revs = setup, radius, dv_max, n_t, max_revs

    def grid(self, s_vals, ratio, family, keep=None):
        """The cheapest feasible rendezvous over this grid of burn-1 times and sizes, or None;
        with `keep` a number, the list of that many cheapest from distinct cells, cheapest first."""
        S = self.S
        b1 = S.burn1(s_vals)
        c = S.orbit1(b1, family, ratio)
        # revolutions the chaser may make on orbit 1: as many as the transfer time allows
        ok = c["valid"] & (c["e1"] < 1 - 1e-9)
        K = 1
        if ok.any():
            a = c["p1"][ok] / (1 - c["e1"][ok] ** 2)
            P_min = float(np.min(TWO_PI * np.sqrt(a ** 3 / S.mu)))
            K = int(min(self.max_revs, 1 + math.floor(S.T / P_min)))
        n = self.n_t * K
        dtheta = np.linspace(TWO_PI * K / n, TWO_PI * K, n)
        cells = {k: v[:, :, None] for k, v in c.items()}
        found = []
        for sign in (1.0, -1.0):
            res = S.sweep(cells, dtheta[None, None, :], sign)
            f = res["f"]
            prod = f[..., :-1] * f[..., 1:]
            br = np.argwhere(prod < 0)
            if br.size == 0:
                continue
            i, j, k = br[:, 0], br[:, 1], br[:, 2]
            lo, hi = dtheta[k], dtheta[k + 1]
            flo = f[i, j, k]
            sub = _gather(c, (i, j))
            for _ in range(42):
                mid = 0.5 * (lo + hi)
                fm = S.sweep(sub, mid, sign)["f"]
                fm = np.where(np.isfinite(fm), fm, 0.0)
                left = (fm * flo) <= 0
                hi = np.where(left, mid, hi)
                lo = np.where(left, lo, mid)
                flo = np.where(left, flo, fm)
            root = 0.5 * (lo + hi)
            at = S.sweep(sub, root, sign)
            good = at["valid"] & (np.abs(at["f"]) < 1e-3 * max(S.T, 1.0)) & (at["judge"] <= self.dv_max)
            if self.radius > 0:
                good &= at["rmin"] > 1.01 * self.radius
            for m in np.flatnonzero(good):
                found.append(dict(kind="node", cost=float(at["judge"][m]), s=float(sub["s"][m]), ratio=float(sub["ratio"][m]), family=family,
                                  sign=sign, dtheta=float(root[m]), cell=(int(i[m]), int(j[m]))))
        found.sort(key=lambda d: d["cost"])
        out, seen = [], set()
        for cand in found:
            if cand["cell"] in seen:
                continue
            seen.add(cand["cell"])
            out.append(cand)
            if len(out) == keep:
                break
        if keep is None:
            return out[0] if out else None
        return out

def _direct(S: _Setup, family: str, n: int, radius: float, dv_max: float):
    """The member of the family with no burn 2: burn 1 alone puts the chaser on an orbit that
    reaches the destination on time. It exists only when the destination lies in the departure
    plane and is the sheet's degenerate case (a Hohmann transfer is one); the node search cannot
    land on it because its rendezvous condition holds for every theta_2 rather than at a root."""
    if abs(S.P[2]) > 1e-6 * S.r_dest:
        return None

    def at(s):
        b1 = S.burn1(np.array([s]))
        theta1, r1 = float(b1["theta1"][0]), float(b1["r1"][0])
        rhat = np.array([math.cos(theta1), math.sin(theta1), 0.0])
        that = np.array([-rhat[1], rhat[0], 0.0])
        v1m = float(b1["vr1"][0]) * rhat + float(b1["vt1"][0]) * that
        res = lambert.solve(S.mu, r1 * rhat, S.P, (1 - s) * S.T) if s < 1 else None
        if res is None:
            return None
        v1, v2 = res
        dv = v1 - v1m
        vhat = v1m / np.linalg.norm(v1m)
        along = float(dv @ vhat)
        across = float(dv[0] * vhat[1] - dv[1] * vhat[0])
        return dict(s=s, r1=r1 * rhat, v1m=v1m, v1=v1, v2=v2, dv1=dv, along=along, across=across,
                    cost=float(np.linalg.norm(dv) + np.linalg.norm(S.vP - v2)))

    key = "across" if family == "tangential" else "along"
    s_vals = np.linspace(0.0, 0.95, n)
    pts = [at(s) for s in s_vals]
    best = None
    for a, b in zip(pts[:-1], pts[1:]):
        if a is None or b is None or a[key] * b[key] > 0:
            continue
        lo, hi, flo = a, b, a[key]
        for _ in range(25):
            mid = at(0.5 * (lo["s"] + hi["s"]))
            if mid is None:
                break
            if mid[key] * flo <= 0:
                hi = mid
            else:
                lo, flo = mid, mid[key]
        root = hi if abs(hi[key]) < abs(lo[key]) else lo
        if root["cost"] > dv_max:
            continue
        rmin = min_radius_on_conic_arc(root["r1"], root["v1"], S.P, S.mu)
        if radius > 0 and rmin <= 1.01 * radius:
            continue
        if best is None or root["cost"] < best["cost"]:
            best = dict(kind="direct", family=family, cost=root["cost"], s=root["s"], state=root, rmin=rmin)
    return best


def solve(mu, r_s, v_s, t_d, r_p, v_p, t_a, radius: float = 0.0, dv_max: float = math.inf, quality: str = "full"):
    """The cheapest three-burn rendezvous leaving (r_s, v_s) at t_d and matching (r_p, v_p) at t_a, or None."""
    if t_a <= t_d:
        return None
    q = QUALITY[quality]
    S = _Setup(mu, r_s, v_s, t_d, r_p, v_p, t_a)
    search = _Search(S, radius, dv_max, q["n_t"], q["revs"])
    best = None
    for family in FAMILIES:
        lo, hi = RATIO[family]
        # burn 1 is most often wanted soon after departure: the grid in s is dense there
        s_vals = q["s_max"] * np.linspace(0.0, 1.0, q["n_s"]) ** 2
        ratio = np.linspace(lo, hi, q["n_k"])
        starts = search.grid(s_vals, ratio, family, keep=q["keep"])
        # the cost landscape has narrow basins: refine the few best cells, not just the best one
        for cand in starts:
            k = int(np.argmin(np.abs(s_vals - cand["s"])))
            ds = max(s_vals[min(k + 1, len(s_vals) - 1)] - s_vals[k], s_vals[k] - s_vals[max(k - 1, 0)], 1e-3)
            dk = ratio[1] - ratio[0]
            for _ in range(q["levels"]):
                s_fine = np.clip(np.linspace(cand["s"] - ds, cand["s"] + ds, 7), 0.0, 0.98)
                k_fine = np.linspace(cand["ratio"] - dk, cand["ratio"] + dk, 7)
                finer = search.grid(s_fine, k_fine, family)
                if finer is not None and finer["cost"] < cand["cost"]:
                    cand = finer
                ds, dk = ds / 3, dk / 3
            if best is None or cand["cost"] < best["cost"]:
                best = cand
        direct = _direct(S, family, q["direct"], radius, dv_max)
        if direct is not None and (best is None or direct["cost"] < best["cost"]):
            best = direct
    if best is None:
        return None
    return _assemble_direct(S, best) if best["kind"] == "direct" else _assemble(S, best)


def _assemble_direct(S: _Setup, cand) -> ThreeBurn:
    st = cand["state"]
    inv = S.R.T
    t1 = S.t_d + cand["s"] * S.T
    theta1 = math.atan2(st["r1"][1], st["r1"][0])
    r1v = inv @ st["r1"]
    dv1, dv3 = inv @ st["dv1"], inv @ (S.vP - st["v2"])
    burns = [(t1, r1v, dv1), (S.t_a, inv @ S.P, dv3)]
    arcs = ([(S.t_d, t1, S.r_s.copy(), S.v_s.copy())] if cand["s"] > 1e-12 else []) + [(t1, S.t_a, r1v, inv @ st["v1"])]
    eta1 = float(np.linalg.norm(st["v1"]) / np.linalg.norm(st["v1m"])) if cand["family"] == "tangential" else math.nan
    return ThreeBurn(t_d=S.t_d, t_a=S.t_a, family=cand["family"], s=cand["s"], theta1=theta1, theta2=theta1, phi=0.0,
                     psi=(math.atan2(S.P[1], S.P[0]) - theta1) % TWO_PI, eta1=eta1, eta2=1.0, burns=burns, arcs=arcs,
                     dv=(float(np.linalg.norm(dv1)), 0.0, float(np.linalg.norm(dv3))), min_radius=float(cand["rmin"]), direct=True)


def _assemble(S: _Setup, cand) -> ThreeBurn:
    """Burns and coasts of the chosen candidate as inertial vectors."""
    b1 = S.burn1(np.array([cand["s"]]))
    c = S.orbit1(b1, cand["family"], np.array([cand["ratio"]]))
    at = S.sweep(c, np.array([[cand["dtheta"]]]), cand["sign"])
    g = lambda d, k: float(np.asarray(d[k]).reshape(-1)[0])
    theta1, theta2 = g(c, "theta1"), g(at, "theta2")
    r1 = g(c, "r1")
    rhat1 = np.array([math.cos(theta1), math.sin(theta1), 0.0])
    that1 = np.array([-rhat1[1], rhat1[0], 0.0])
    v1m = g(c, "vr1") * rhat1 + g(c, "vt1") * that1
    v1p = g(c, "vr1p") * rhat1 + g(c, "vt1p") * that1
    u = np.array([math.cos(theta2), math.sin(theta2), 0.0])
    w = np.array([-u[1], u[0], 0.0])
    cphi, sphi = g(at, "cphi"), g(at, "sphi")
    wp = cphi * w + sphi * np.array([0.0, 0.0, 1.0])
    r2, vr2, vt2, eta2 = g(at, "r2"), g(at, "vr2"), g(at, "vt2"), g(at, "eta2")
    v2m = vr2 * u + vt2 * w
    v2p = eta2 * (vr2 * u + vt2 * wp)
    v3m = np.asarray(at["v3"]).reshape(-1)
    t1 = S.t_d + cand["s"] * S.T
    t2 = t1 + g(at, "tB")
    inv = S.R.T
    r1v, r2v = inv @ (r1 * rhat1), inv @ (r2 * u)
    dv1, dv2, dv3 = inv @ (v1p - v1m), inv @ (v2p - v2m), inv @ (S.vP - v3m)
    burns = [(t1, r1v, dv1), (t2, r2v, dv2), (S.t_a, inv @ S.P, dv3)]
    arcs = ([(S.t_d, t1, S.r_s.copy(), S.v_s.copy())] if cand["s"] > 1e-12 else []) + [(t1, t2, r1v, inv @ v1p), (t2, S.t_a, r2v, inv @ v2p)]
    return ThreeBurn(t_d=S.t_d, t_a=S.t_a, family=cand["family"], s=cand["s"], theta1=theta1, theta2=theta2,
                     phi=math.atan2(sphi, cphi), psi=g(at, "psi"), eta1=g(c, "eta1"), eta2=eta2, burns=burns, arcs=arcs,
                     dv=(float(np.linalg.norm(dv1)), float(np.linalg.norm(dv2)), float(np.linalg.norm(dv3))),
                     min_radius=g(at, "rmin"))
