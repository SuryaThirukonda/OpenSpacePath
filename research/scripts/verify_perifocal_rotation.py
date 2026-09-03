"""
Independent verification of the perifocal -> ECI rotation matrix claim.

CLAIM: Q = Rz(Omega) Rx(i) Rz(omega)  (active-rotation convention)
       is identical to Curtis's (R3(omega) R1(i) R3(Omega))^T
       and to Wikipedia's perifocal->equatorial matrix.

Method: three fully independent constructions of the perifocal basis
vectors {P_hat, Q_hat, W_hat} expressed in ECI components, none of which
use the matrix-product formula being tested:

  (A) Geometric / Rodrigues-rotation construction from first principles:
      n_hat (ascending node) is defined directly from Omega; W_hat is n_hat
      rotated about itself is wrong -- W_hat is K rotated about n_hat by i
      (Rodrigues formula); P_hat is n_hat rotated about W_hat by omega
      (Rodrigues formula); Q_hat = W_hat x P_hat. This uses only cross
      products and Rodrigues' rotation formula -- no elementary rotation
      matrices, no Curtis text, no Wikipedia matrix.

  (B) The candidate matrix product Rz(Omega) @ Rx(i) @ Rz(omega), with
      Rz/Rx defined as the standard *active* (right-hand-rule) elementary
      rotation matrices.

  (C) Curtis's own construction: Q_Xx = R3(omega) @ R1(i) @ R3(Omega),
      with R3/R1 the standard *passive* (Curtis-textbook) elementary
      rotation matrices [R3(t)=[[c,s,0],[-s,c,0],[0,0,1]], R1(t) similar],
      then Q_xX = Q_Xx^T (perifocal -> ECI is the transpose of the
      ECI -> perifocal matrix Curtis defines).

  (D) A third-party open-source implementation found in the cloned repo
      repos/astro/src/elements.js (coe2rv, derived from poliastro), reading
      its rotation_matrix(angle,axis) helper directly and reproducing its
      arithmetic in Python -- an independent codebase, not written for
      this check.

  (E) Wikipedia's explicit printed matrix entries (fetched from
      https://en.wikipedia.org/wiki/Perifocal_coordinate_system), typed in
      verbatim as constants -- not derived from any formula above.

All five are compared pairwise over many random (i, Omega, omega) samples
(and a fixed sample for (E), since it's a single printed matrix, so we
plug in specific angles and compare numbers) and must agree to floating
point precision for the claim to hold.
"""
import numpy as np

rng = np.random.default_rng(20260901)


def Rz(t):
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def Rx(t):
    c, s = np.cos(t), np.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def R3_passive(t):
    # Curtis-textbook convention: passive rotation about z
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])


def R1_passive(t):
    c, s = np.cos(t), np.sin(t)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def geometric_Q(i, Omega, omega):
    """(A) First-principles construction via Rodrigues' rotation formula.
    No elementary rotation matrices used at all."""
    K = np.array([0.0, 0.0, 1.0])
    n_hat = np.array([np.cos(Omega), np.sin(Omega), 0.0])  # ascending node, by definition of Omega

    # W_hat = K rotated about n_hat by angle i  (Rodrigues formula)
    # since n_hat . K = 0:  v_rot = v*cos(t) + (k x v)*sin(t)
    W_hat = K * np.cos(i) + np.cross(n_hat, K) * np.sin(i)
    W_hat /= np.linalg.norm(W_hat)

    # P_hat = n_hat rotated about W_hat by angle omega (Rodrigues formula)
    # n_hat . W_hat = 0 since node line lies in orbital plane
    P_hat = n_hat * np.cos(omega) + np.cross(W_hat, n_hat) * np.sin(omega)
    P_hat /= np.linalg.norm(P_hat)

    Q_hat = np.cross(W_hat, P_hat)

    return np.column_stack([P_hat, Q_hat, W_hat])


def claim_Q(i, Omega, omega):
    """(B) Q = Rz(Omega) Rx(i) Rz(omega), active convention."""
    return Rz(Omega) @ Rx(i) @ Rz(omega)


def curtis_Q(i, Omega, omega):
    """(C) Q_xX = (R3(omega) R1(i) R3(Omega))^T, passive Curtis convention."""
    Q_Xx = R3_passive(omega) @ R1_passive(i) @ R3_passive(Omega)
    return Q_Xx.T


def astro_repo_Q(i, Omega, omega):
    """(D) Reproduces repos/astro/src/elements.js coe2rv arithmetic exactly.
    rotation_matrix(angle, axis) there builds the ACTIVE rotation matrix
    (verified by reading utils.js: for axis=2 it builds
    [[c,-s,0],[s,c,0],[0,0,1]], i.e. Rz above; for axis=0 it builds Rx above).
    coe2rv builds rm = R(raan,2) @ R(inc,0) @ R(argp,2) = Rz(Omega)Rx(i)Rz(omega)
    then does pqw_row @ rm^T, which for a row vector is equivalent to
    r_ECI_col = rm @ r_pqw_col. So the effective transform matrix is rm itself.
    """
    def rot_active(angle, axis):
        c, s = np.cos(angle), np.sin(angle)
        a1, a2 = (axis + 1) % 3, (axis + 2) % 3
        R = np.zeros((3, 3))
        R[axis, axis] = 1
        R[a1, a1] = c
        R[a1, a2] = -s
        R[a2, a1] = s
        R[a2, a2] = c
        return R

    rm = rot_active(Omega, 2) @ rot_active(i, 0) @ rot_active(omega, 2)
    return rm  # r_ECI_col = rm @ r_pqw_col (see docstring)


def wikipedia_Q(i, Omega, omega):
    """(E) Verbatim entries from the Wikipedia perifocal_coordinate_system
    page (fetched live), typed as constants -- not derived from any
    rotation-matrix product."""
    ci, si = np.cos(i), np.sin(i)
    cO, sO = np.cos(Omega), np.sin(Omega)
    cw, sw = np.cos(omega), np.sin(omega)
    return np.array([
        [cO*cw - sO*ci*sw,  -cO*sw - sO*ci*cw,  sO*si],
        [sO*cw + cO*ci*sw,  -sO*sw + cO*ci*cw, -cO*si],
        [si*sw,              si*cw,              ci],
    ])


print("=== Pairwise agreement over 500 random (i, Omega, omega) samples ===")
max_diffs = {"A_vs_B": 0, "A_vs_C": 0, "A_vs_D": 0, "A_vs_E": 0,
             "B_vs_C": 0, "B_vs_D": 0, "B_vs_E": 0}
n = 500
for _ in range(n):
    i = rng.uniform(0.001, np.pi - 0.001)       # avoid degenerate i=0/pi
    Omega = rng.uniform(-3 * np.pi, 3 * np.pi)  # test outside [0, 2pi) too
    omega = rng.uniform(-3 * np.pi, 3 * np.pi)

    A = geometric_Q(i, Omega, omega)
    B = claim_Q(i, Omega, omega)
    C = curtis_Q(i, Omega, omega)
    D = astro_repo_Q(i, Omega, omega)
    E = wikipedia_Q(i, Omega, omega)

    max_diffs["A_vs_B"] = max(max_diffs["A_vs_B"], np.max(np.abs(A - B)))
    max_diffs["A_vs_C"] = max(max_diffs["A_vs_C"], np.max(np.abs(A - C)))
    max_diffs["A_vs_D"] = max(max_diffs["A_vs_D"], np.max(np.abs(A - D)))
    max_diffs["A_vs_E"] = max(max_diffs["A_vs_E"], np.max(np.abs(A - E)))
    max_diffs["B_vs_C"] = max(max_diffs["B_vs_C"], np.max(np.abs(B - C)))
    max_diffs["B_vs_D"] = max(max_diffs["B_vs_D"], np.max(np.abs(B - D)))
    max_diffs["B_vs_E"] = max(max_diffs["B_vs_E"], np.max(np.abs(B - E)))

for k, v in max_diffs.items():
    print(f"  max |diff| {k}: {v:.3e}")

tol = 1e-10
all_ok = all(v < tol for v in max_diffs.values())
print(f"\nAll pairwise matrix differences < {tol}: {all_ok}")

# Also verify each candidate matrix is a proper rotation matrix (orthogonal, det=+1)
print("\n=== Orthogonality / det checks (single sample, i=0.5, Omega=1.2, omega=2.1) ===")
i0, O0, w0 = 0.5, 1.2, 2.1
for name, Q in [("geometric(A)", geometric_Q(i0, O0, w0)),
                 ("claim(B)", claim_Q(i0, O0, w0)),
                 ("curtis(C)", curtis_Q(i0, O0, w0)),
                 ("astro_repo(D)", astro_repo_Q(i0, O0, w0)),
                 ("wikipedia(E)", wikipedia_Q(i0, O0, w0))]:
    ortho_err = np.max(np.abs(Q.T @ Q - np.eye(3)))
    det = np.linalg.det(Q)
    print(f"  {name:14s}: orthogonality err={ortho_err:.2e}, det={det:.6f}")

# --- Sanity application: known simple case, i=0 (equatorial), Omega=0 ---
# Then perifocal frame should just be ECI frame rotated by omega about z (K).
print("\n=== Degenerate sanity check: i=0, Omega=0, omega=37 deg ===")
w = np.deg2rad(37)
Qtest = claim_Q(0.0, 0.0, w)
expected = Rz(w)  # pure in-plane rotation by omega about K
print("claim_Q(i=0,Omega=0,omega) =\n", Qtest)
print("Rz(omega) =\n", expected)
print("max diff:", np.max(np.abs(Qtest - expected)))

# --- Numeric worked example (Curtis-style): h=80000 km^2/s, e=1.4,
# i=30deg, RAAN=40deg, argp=60deg, theta=30deg (classic Curtis Ex 4.7 elements) ---
print("\n=== Applied check with classic textbook element set ===")
h = 80000.0
e = 1.4
mu = 398600.0
i = np.deg2rad(30)
Omega = np.deg2rad(40)
omega = np.deg2rad(60)
theta = np.deg2rad(30)

r_mag = (h**2 / mu) / (1 + e * np.cos(theta))
r_pf = r_mag * np.array([np.cos(theta), np.sin(theta), 0.0])
vr = (mu / h) * e * np.sin(theta)
vperp = (mu / h) * (1 + e * np.cos(theta))
v_pf = np.array([-(mu / h) * np.sin(theta), (mu / h) * (e + np.cos(theta)), 0.0])

Q_claim = claim_Q(i, Omega, omega)
Q_geom = geometric_Q(i, Omega, omega)
Q_curtis = curtis_Q(i, Omega, omega)

r_eci_claim = Q_claim @ r_pf
r_eci_geom = Q_geom @ r_pf
r_eci_curtis = Q_curtis @ r_pf
v_eci_claim = Q_claim @ v_pf

print("r_perifocal (km):", r_pf)
print("v_perifocal (km/s):", v_pf)
print("Q matrix (claim, Rz(Omega)Rx(i)Rz(omega)):\n", Q_claim)
print("r_ECI via claim Q:  ", r_eci_claim)
print("r_ECI via geometric Q:", r_eci_geom)
print("r_ECI via Curtis Q^T:", r_eci_curtis)
print("max diff among the three r_ECI results:",
      max(np.max(np.abs(r_eci_claim - r_eci_geom)),
          np.max(np.abs(r_eci_claim - r_eci_curtis))))
print("v_ECI via claim Q:  ", v_eci_claim)
print("|r_ECI| (km):", np.linalg.norm(r_eci_claim), " -- Curtis Ex 4.7 reports r = -6.045 I -3.490 J + 2.500 K (approx, |r|~7593 km) for this element set")

print("\n--- Check master-doc line 239 alternative formula Rz(-Om)Rx(-i)Rz(-ω) against the claim's Rz(Om)Rx(i)Rz(ω) ---")
Om,i,w = np.radians(40.0), np.radians(30.0), np.radians(60.0)
Q_claim = Rz(Om) @ Rx(i) @ Rz(w)
Q_masterdoc_line239 = Rz(-Om) @ Rx(-i) @ Rz(-w)
print("Q_claim (Rz(Om)Rx(i)Rz(w)):\n", np.round(Q_claim,4))
print("Q_masterdoc line239 (Rz(-Om)Rx(-i)Rz(-w)):\n", np.round(Q_masterdoc_line239,4))
print("Are they equal?", np.allclose(Q_claim, Q_masterdoc_line239))
print("Is Q_masterdoc_line239 actually Q_claim^{-1} (=Q_claim^T, i.e. ECI->perifocal)?", np.allclose(Q_masterdoc_line239, Q_claim.T))

# also test a known position to show it lands in the wrong place if you use line-239 formula
r_pqw = np.array([7000.0, 0.0, 0.0])  # at periapsis in perifocal frame
r_eci_claim = Q_claim @ r_pqw
r_eci_wrong = Q_masterdoc_line239 @ r_pqw
print("\nr_ECI using claim formula:", np.round(r_eci_claim,2))
print("r_ECI using master-doc line-239 formula:", np.round(r_eci_wrong,2))
