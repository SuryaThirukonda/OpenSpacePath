"""Build api/data/gtoc11.npz, the asteroid catalogue the routing papers sample, from the first
paper's reproducibility package (Lopez-Ibanez, Chicano, Gil-Merino 2022; Zenodo record 6034335,
CC BY 4.0; file ast_orbits.pkl.gz, a pandas Series of 83,453 poliastro Orbits indexed 1..83453).

The pickle is read without executing any of its code: every class becomes a stub that only
records its state, and only numpy's array reconstruction is allowed through. Run it with
`python -I` and the package's directory as the argument:

    api/.venv/bin/python -I scripts/gtoc11_catalogue.py /path/to/package

Output: id, and the elements a (km), e, i, raan, argp, M0 (rad) at the papers' mission start,
MJD 95739 = 2121-01-01 00:00 UT1, with the papers' own constants (space_util.py).
"""
import gzip, pickle, sys, os, codecs, math, warnings
import numpy as np
warnings.filterwarnings('ignore')
from numpy._core import multiarray as _ma, numeric as _nm

AU_KM = 1.49597870691e8          # the papers' Table 2 constants
MU_SUN = 1.32712440018e11
START_MJD = 95739.0              # 2121-01-01 00:00 UT1, the first launch


class Arr(np.ndarray):
    """An ndarray that keeps the __dict__ an ndarray subclass (astropy Quantity) pickled beside its data."""
    def __setstate__(self, state):
        if len(state) == 2 and isinstance(state[1], dict):
            nd, own = state
            np.ndarray.__setstate__(self, nd)
            self.own = own
        else:
            np.ndarray.__setstate__(self, state)


class Stub:
    args: tuple = ()
    state = None

    def __init__(self, *args, **kw):
        self.args, self.state = args, None

    def __setstate__(self, state):
        self.state = state


STUBS = {}


def make_stub(module, name):
    key = f"{module}.{name}"
    if key not in STUBS:
        STUBS[key] = type(name, (Stub,), {'cls': key})
    return STUBS[key]


def reconstruct(cls, shape, dtype):
    if not (isinstance(cls, type) and issubclass(cls, np.ndarray)):
        cls = Arr
    return _ma._reconstruct(cls, shape, dtype)


def reconstructor(cls, base, state):
    return cls() if isinstance(cls, type) and issubclass(cls, Stub) else base.__new__(cls)


ALLOW = {
    ('numpy.core.multiarray', '_reconstruct'): reconstruct, ('numpy._core.multiarray', '_reconstruct'): reconstruct,
    ('numpy', 'ndarray'): np.ndarray, ('numpy', 'dtype'): np.dtype,
    ('numpy.core.multiarray', 'scalar'): _ma.scalar, ('numpy._core.multiarray', 'scalar'): _ma.scalar,
    ('numpy.core.numeric', '_frombuffer'): _nm._frombuffer, ('numpy._core.numeric', '_frombuffer'): _nm._frombuffer,
    ('_codecs', 'encode'): codecs.encode, ('copyreg', '_reconstructor'): reconstructor,
}
SAFE_BUILTINS = {'set', 'frozenset', 'slice', 'range', 'bytearray', 'complex', 'tuple', 'list', 'dict', 'object', 'bool', 'int', 'float', 'str', 'bytes'}


class Safe(pickle.Unpickler):
    def find_class(self, module, name):
        if (module, name) in ALLOW:
            return ALLOW[(module, name)]
        if module == 'builtins' and name in SAFE_BUILTINS:
            return getattr(__builtins__, name) if hasattr(__builtins__, name) else __builtins__[name]
        if module == 'collections' and name in ('defaultdict', 'OrderedDict'):
            return lambda *a, **k: {}
        return make_stub(module, name)


def nu_to_mean(nu, e):
    E = 2 * math.atan2(math.sqrt(1 - e) * math.sin(nu / 2), math.sqrt(1 + e) * math.cos(nu / 2))
    return E - e * math.sin(E)


def main(package_dir, out_path):
    with gzip.open(os.path.join(package_dir, 'ast_orbits.pkl.gz'), 'rb') as f:
        series = Safe(f).load()
    axes, blocks = series.state['_mgr'].state[0], series.state['_mgr'].state[1]
    ids = np.asarray(axes[0].args[1]['data'], dtype=np.int64)
    orbits = blocks[0]
    assert ids.shape == orbits.shape == (83453,), (ids.shape, orbits.shape)
    n = len(ids)
    a = np.empty(n); e = np.empty(n); inc = np.empty(n); raan = np.empty(n); argp = np.empty(n); M0 = np.empty(n)
    epochs = set()
    for k, orb in enumerate(orbits):
        st = orb.state['_state'].state
        p_au, ecc = float(st['_p']), float(st['_ecc'])
        nu = float(st['_nu'])
        t = orb.state['_epoch'].state['_time'].state
        mjd = float(np.asarray(t['_jd1']).ravel()[0]) + float(np.asarray(t['_jd2']).ravel()[0]) - 2400000.5
        epochs.add(round(mjd, 6))
        a_km = p_au * AU_KM / (1 - ecc * ecc)
        mean_motion = math.sqrt(MU_SUN / a_km ** 3)
        m_start = (nu_to_mean(nu, ecc) + mean_motion * (START_MJD - mjd) * 86400.0) % (2 * math.pi)
        a[k], e[k], inc[k], raan[k], argp[k], M0[k] = a_km, ecc, float(st['_inc']), float(st['_raan']), float(st['_argp']), m_start
    print('asteroids', n, 'ids', ids.min(), '..', ids.max(), 'epochs (MJD) in the file:', sorted(epochs)[:3], '...' if len(epochs) > 3 else '')
    print('a [AU]', (a / AU_KM).min().round(3), '..', (a / AU_KM).max().round(3), ' e', e.min().round(3), '..', e.max().round(3), ' i [deg]', np.degrees(inc).min().round(2), '..', np.degrees(inc).max().round(2))
    np.savez_compressed(out_path, id=ids.astype(np.int32), a=a, e=e, i=inc, raan=raan, argp=argp, M0=M0,
                        epoch_mjd=np.array([START_MJD]), mu=np.array([MU_SUN]), au_km=np.array([AU_KM]),
                        source=np.array(['Lopez-Ibanez, Chicano, Gil-Merino (2022), reproducibility package, Zenodo 10.5281/zenodo.6034335, CC BY 4.0; GTOC11 asteroid set']))
    print('wrote', out_path, os.path.getsize(out_path) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'api', 'data', 'gtoc11.npz'))
