import numpy as np

def Rz(t):
    c,s = np.cos(t), np.sin(t)
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])

def Rx(t):
    c,s = np.cos(t), np.sin(t)
    return np.array([[1,0,0],[0,c,-s],[0,s,c]])

def geometric_Q(i, Omega, omega):
    """First-principles construction of perifocal basis {P,Q,W} in ECI
    components via Rodrigues' rotation formula -- no elementary rotation
    matrices used at all, independent check of the matrix-product claim."""
    K = np.array([0.0, 0.0, 1.0])
    n_hat = np.array([np.cos(Omega), np.sin(Omega), 0.0])  # ascending node direction, by definition of Omega
    # W_hat = K rotated about n_hat by angle i (Rodrigues, n_hat.K=0)
    W_hat = K*np.cos(i) + np.cross(n_hat, K)*np.sin(i)
    W_hat /= np.linalg.norm(W_hat)
    # P_hat = n_hat rotated about W_hat by angle omega (Rodrigues, n_hat.W_hat=0)
    P_hat = n_hat*np.cos(omega) + np.cross(W_hat, n_hat)*np.sin(omega)
    P_hat /= np.linalg.norm(P_hat)
    Q_hat = np.cross(W_hat, P_hat)
    return np.column_stack([P_hat, Q_hat, W_hat])

rng = np.random.default_rng(20260901)
max_diff = 0.0
for _ in range(2000):
    i = rng.uniform(0.001, np.pi-0.001)
    Om = rng.uniform(-3*np.pi, 3*np.pi)
    w  = rng.uniform(-3*np.pi, 3*np.pi)
    A = geometric_Q(i, Om, w)
    B = Rz(Om) @ Rx(i) @ Rz(w)
    max_diff = max(max_diff, np.max(np.abs(A-B)))
print("max |geometric(Rodrigues, no matrices) - Rz(Om)Rx(i)Rz(w)| over 2000 random trials:", max_diff)
