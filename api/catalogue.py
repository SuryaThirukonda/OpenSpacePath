"""The asteroid catalogue the routing papers sample, and their instance generator.

`api/data/gtoc11.npz` holds the 83,453 GTOC11 asteroids as the first paper's reproducibility
package ships them (Lopez-Ibanez, Chicano, Gil-Merino 2022, Zenodo 10.5281/zenodo.6034335, CC BY
4.0), with their elements moved to the papers' mission start, 2121-01-01 00:00 UT1 (MJD 95739);
scripts/gtoc11_catalogue.py built it. Instances follow the package's space_util.py to
the letter: numpy's default_rng(seed).integers(1, 83454, size=n) picks the ids (with replacement,
as they do), Earth is their Table 1 orbit, and the constants are their Table 2 values.
"""
from __future__ import annotations

import math
import os
from functools import lru_cache

import numpy as np

from .models import ArpBody, ArpInstance, Elements

PATH = os.path.join(os.path.dirname(__file__), "data", "gtoc11.npz")
START_MJD = 95739.0
EARTH_MJD = 59396.0
EPOCH_ISO = "2121-01-01T00:00:00Z"
AU_KM = 1.49597870691e8
MU_SUN = 1.32712440018e11
# the papers' inner optimizer as their code runs it: SLSQP from (1, 30) days with tol 1e-4
INNER_START = (1.0, 30.0)
INNER_TOL = 1e-4


@lru_cache(maxsize=1)
def catalogue() -> dict:
    with np.load(PATH, allow_pickle=False) as z:
        return {k: z[k] for k in ("id", "a", "e", "i", "raan", "argp", "M0")}


def size() -> int:
    return int(catalogue()["id"].shape[0])


def _mean_at_start(a_km: float, e: float, M_epoch: float, mjd: float) -> float:
    n = math.sqrt(MU_SUN / a_km ** 3)
    return (M_epoch + n * (START_MJD - mjd) * 86400.0) % (2 * math.pi)


def earth() -> ArpBody:
    """Earth's orbit from the package: Table 1 of GTOC11, J2000 heliocentric ecliptic, at MJD 59396."""
    e = 1.693309475505424e-2
    a = 9.998012770769207e-1 * AU_KM
    return ArpBody(id="earth", name="Earth", elements=Elements(
        a=a, e=e, i=math.radians(3.049485258137714e-3), raan=math.radians(1.662869706216879e2), argp=math.radians(2.978214889887391e2),
        M0=_mean_at_start(a, e, math.radians(1.757352290983351e2), EARTH_MJD)))


def body(ast_id: int, k: int) -> ArpBody:
    c = catalogue()
    row = int(np.searchsorted(c["id"], ast_id))
    if row >= c["id"].shape[0] or int(c["id"][row]) != ast_id:
        raise ValueError(f"asteroid {ast_id} is not in the catalogue")
    el = Elements(a=float(c["a"][row]), e=float(c["e"][row]), i=float(c["i"][row]), raan=float(c["raan"][row]), argp=float(c["argp"][row]), M0=float(c["M0"][row]))
    return ArpBody(id=f"gtoc11-{ast_id}-{k}", name=f"GTOC11 {ast_id}", elements=el)


def paper_instance(n: int, seed: int) -> ArpInstance:
    """Instance n_seed exactly as the papers' generator draws it."""
    if not 1 <= n <= 40:
        raise ValueError("an instance has 1 to 40 asteroids")
    c = catalogue()
    rng = np.random.default_rng(seed)
    ids = rng.integers(int(c["id"].min()), int(c["id"].max()) + 1, size=n)
    return ArpInstance(name=f"{n}_{seed}", mu=MU_SUN, epoch=EPOCH_ISO, earth=earth(), asteroids=[body(int(a), k + 1) for k, a in enumerate(ids)],
                       tauMax=730.0, tMax=730.0, timeWeight=2.0 / 30.0, innerStart=list(INNER_START), innerTol=INNER_TOL,
                       note="Drawn from the 83,453 GTOC11 asteroids with the papers' own generator (seeded, with replacement); costs are comparable with the papers' tables.")
