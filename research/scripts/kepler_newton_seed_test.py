"""
Independent verification of the claim:
  "Kepler's equation M = E - e*sin(E) has no closed-form inverse, and
   Newton-Raphson seeded at E0=M can fail/wander badly for e>=0.99,
   while E0=pi is robust."

We implement Newton-Raphson from scratch (no reuse of any repo code / notebook
pipeline) and sweep e in [0.9, 0.9999] and M across (0, 2*pi) to count
divergence/non-convergence failures for two seed strategies: E0=M and E0=pi.

Failure definition: after MAX_ITERS=50 Newton steps, |E - e*sin(E) - M| > TOL,
OR the iterate becomes non-finite (NaN/Inf) at any point, OR the iterate
leaves a sane bounding box (|E| > 100) indicating divergence.
"""
import numpy as np

MU_DUMMY = None  # not needed; pure Kepler-equation test, no orbital mechanics reuse

TOL = 1e-12
MAX_ITERS = 50

def newton_kepler(M, e, E0, max_iters=MAX_ITERS, tol=TOL):
    """Return (converged: bool, iters_used: int, final_residual: float, diverged: bool)"""
    E = E0
    for k in range(1, max_iters + 1):
        f = E - e * np.sin(E) - M
        fp = 1 - e * np.cos(E)
        if not np.isfinite(E) or abs(E) > 1e3:
            return False, k, np.nan, True
        if fp == 0:
            return False, k, abs(f), True
        step = f / fp
        E = E - step
        if not np.isfinite(E):
            return False, k, np.nan, True
        if abs(step) < tol:
            # confirm residual at final E
            resid = abs(E - e * np.sin(E) - M)
            return (resid < 1e-9), k, resid, False
    resid = abs(E - e * np.sin(E) - M)
    return (resid < 1e-9), max_iters, resid, False


def sweep(seed_fn, seed_name, es, Ms):
    n_total = 0
    n_fail = 0
    n_diverge = 0
    max_iters_seen = 0
    worst_cases = []
    for e in es:
        for M in Ms:
            E0 = seed_fn(M, e)
            converged, iters, resid, diverged = newton_kepler(M, e, E0)
            n_total += 1
            max_iters_seen = max(max_iters_seen, iters)
            if not converged:
                n_fail += 1
                if diverged:
                    n_diverge += 1
                if len(worst_cases) < 8:
                    worst_cases.append((e, M, iters, resid, diverged))
    print(f"--- seed {seed_name} ---")
    print(f"  total cases: {n_total}")
    print(f"  failures (not converged within {MAX_ITERS} iters): {n_fail}  ({100*n_fail/n_total:.2f}%)")
    print(f"  of which hard-diverged (non-finite/blew up): {n_diverge}")
    print(f"  max iters used by any case: {max_iters_seen}")
    if worst_cases:
        print("  sample failing cases (e, M, iters, resid, diverged):")
        for c in worst_cases:
            print("   ", c)
    return n_fail, n_total


if __name__ == "__main__":
    # Eccentricity grid as specified in the claim/check
    es = np.linspace(0.9, 0.9999, 40)
    # Mean anomaly grid: dense near 0 (as suggested: "M near 0") but also
    # covering the full period since Kepler's eq is symmetric M -> -M, and
    # periodic with 2*pi, so we sweep (0, pi] which covers all distinct cases
    # by symmetry E(-M) = -E(M), E(M+2pi)=E(M)+2pi.
    Ms_near_zero = np.concatenate([
        np.linspace(1e-8, 1e-3, 30),
        np.linspace(1e-3, 0.1, 40),
    ])
    Ms_full = np.linspace(1e-6, np.pi, 300)

    seed_M = lambda M, e: M
    seed_pi = lambda M, e: np.pi

    print("=" * 70)
    print("TEST A: M near 0 only (as literally suggested in the claim)")
    print("=" * 70)
    fA_M, tA = sweep(seed_M, "E0=M", es, Ms_near_zero)
    fA_pi, _ = sweep(seed_pi, "E0=pi", es, Ms_near_zero)

    print()
    print("=" * 70)
    print("TEST B: full M range (0, pi], same e grid in [0.9, 0.9999]")
    print("=" * 70)
    fB_M, tB = sweep(seed_M, "E0=M", es, Ms_full)
    fB_pi, _ = sweep(seed_pi, "E0=pi", es, Ms_full)

    print()
    print("=" * 70)
    print("TEST C: even more extreme e, e in [0.999, 0.999999]")
    print("=" * 70)
    es_extreme = np.linspace(0.999, 0.999999, 30)
    fC_M, tC = sweep(seed_M, "E0=M", es_extreme, Ms_full)
    fC_pi, _ = sweep(seed_pi, "E0=pi", es_extreme, Ms_full)

    print()
    print("SUMMARY")
    print(f"  Test A (M near 0):   E0=M failures {fA_M}/{tA}   E0=pi failures {fA_pi}/{tA}")
    print(f"  Test B (M full 0..pi): E0=M failures {fB_M}/{tB}   E0=pi failures {fB_pi}/{tB}")
    print(f"  Test C (e up to .999999): E0=M failures {fC_M}/{tC}   E0=pi failures {fC_pi}/{tC}")
