"""Extra checks for formulas added to section 7 after the first T7 run: universal-variable Kepler propagation,
ECEF velocity transform, geodetic round trip, 2-D hypervolume, log-scale compression continuity, pixel scale."""
import math
import numpy as np
norm = np.linalg.norm
MU = 398600.0; W_E = 7.2921159e-5; A_E = 6378.137; F_E = 1/298.257223563; E2 = F_E*(2-F_E)

def stumpC(z):
    if z > 0: return (1-math.cos(math.sqrt(z)))/z
    if z < 0: return (math.cosh(math.sqrt(-z))-1)/(-z)
    return 0.5
def stumpS(z):
    if z > 0: s = math.sqrt(z); return (s-math.sin(s))/s**3
    if z < 0: s = math.sqrt(-z); return (math.sinh(s)-s)/s**3
    return 1/6

def propagate(r0v, v0v, dt, mu):
    r0 = norm(r0v); v0 = norm(v0v); vr0 = np.dot(r0v, v0v)/r0
    alpha = 2/r0 - v0*v0/mu
    chi = math.sqrt(mu)*abs(alpha)*dt
    for _ in range(100):
        z = alpha*chi*chi; C, S = stumpC(z), stumpS(z)
        F = r0*vr0/math.sqrt(mu)*chi*chi*C + (1-alpha*r0)*chi**3*S + r0*chi - math.sqrt(mu)*dt
        dF = r0*vr0/math.sqrt(mu)*chi*(1-alpha*chi*chi*S) + (1-alpha*r0)*chi*chi*C + r0
        d = F/dF; chi -= d
        if abs(d) < 1e-12: break
    z = alpha*chi*chi; C, S = stumpC(z), stumpS(z)
    return (1 - chi*chi/r0*C)*r0v + (dt - chi**3/math.sqrt(mu)*S)*v0v

print("=== universal-variable propagation of the Curtis 5.2 Lambert solution ===")
r1 = np.array([5000.0, 10000.0, 2100.0]); r2 = np.array([-14600.0, 2500.0, 7000.0])
v1 = np.array([-5.99249, 1.92536, 3.24564])
print(f"position after 3600 s: {np.round(propagate(r1, v1, 3600.0, MU), 1)}  target {r2}  miss {norm(propagate(r1, v1, 3600.0, MU)-r2):.3f} km (v1 rounded to 1e-5 km/s)")
# hyperbolic case against the energy integral
rh = np.array([7000.0, 0.0, 0.0]); vh = np.array([0.0, 12.0, 0.0])
rp = propagate(rh, vh, 5000.0, 398600.4418)
y = np.concatenate([rh, vh]); n = 100000; hstep = 5000.0/n
f = lambda u: np.concatenate([u[3:], -398600.4418*u[:3]/norm(u[:3])**3])
for _ in range(n):
    k1 = f(y); k2 = f(y+0.5*hstep*k1); k3 = f(y+0.5*hstep*k2); k4 = f(y+hstep*k3); y = y + hstep/6*(k1+2*k2+2*k3+k4)
print(f"hyperbolic departure (v = 12 km/s at 7000 km): universal-variable vs RK4 after 5000 s differ by {norm(rp - y[:3]):.2e} km")

print("\n=== ECEF velocity transform vs finite difference of rotated positions ===")
def Rz(t): c, s = math.cos(t), math.sin(t); return np.array([[c,-s,0],[s,c,0],[0,0,1.0]])
rt = np.array([6800.0, 1200.0, 900.0]); vt = np.array([-1.2, 7.4, 1.1]); th = 1.234; h = 1e-3
ecef = lambda t: Rz(-(th + W_E*t)) @ (rt + vt*t)
v_fd = (ecef(h) - ecef(-h))/(2*h)
v_formula = Rz(-th) @ vt - np.cross([0, 0, W_E], ecef(0))
print(f"difference {norm(v_fd - v_formula):.2e} km/s")

print("\n=== geodetic iteration round trip ===")
worst = 0.0
for lat in np.radians(np.linspace(-89, 89, 37)):
    for hgt in (0.0, 420.0, 35786.0):
        N = A_E/math.sqrt(1-E2*math.sin(lat)**2)
        x, z = (N+hgt)*math.cos(lat), (N*(1-E2)+hgt)*math.sin(lat)
        p = x; phi = math.atan2(z, p)
        for _ in range(20):
            N = A_E/math.sqrt(1-E2*math.sin(phi)**2); phi = math.atan2(z + N*E2*math.sin(phi), p)
        N = A_E/math.sqrt(1-E2*math.sin(phi)**2)
        h_use = p/math.cos(phi) - N if abs(phi) < math.radians(80) else z/math.sin(phi) - N*(1-E2)
        worst = max(worst, abs(math.degrees(phi-lat))*111.0, abs(h_use-hgt))
print(f"worst latitude or height error over 111 cases: {worst:.2e} km")

print("\n=== 2-D hypervolume formula vs grid count ===")
pts = sorted([(1, 3), (2, 1)]); ref = (4, 4)
hv = sum(((pts[k+1][0] if k+1 < len(pts) else ref[0]) - pts[k][0])*(ref[1]-pts[k][1]) for k in range(len(pts)))
g = 400; cnt = 0
for i in range(g):
    for j in range(g):
        x = (i+0.5)*ref[0]/g; y = (j+0.5)*ref[1]/g
        if any(x >= p[0] and y >= p[1] for p in pts): cnt += 1
print(f"formula {hv}, grid estimate {cnt*(ref[0]/g)*(ref[1]/g):.3f}")

print("\n=== log compression continuity at r0 ===")
r0 = 1.0; comp = lambda r: r if r <= r0 else r0*(1+math.log(r/r0))
print(f"value just below/above: {comp(r0-1e-9):.9f} {comp(r0+1e-9):.9f}; slope above r0: {(comp(r0+1e-6)-comp(r0))/1e-6:.6f}; 30 AU maps to {comp(30.0):.3f} AU")

print("\n=== pixel scale ===")
print(f"Earth diameter across 1000 px: {2*A_E/1000:.2f} km/px; 45 deg fov, 30000 km away, 1000 px tall: {2*30000*math.tan(math.radians(22.5))/1000:.2f} km/px")
