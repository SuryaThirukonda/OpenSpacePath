"""T3.6 part 3: sampling/interpolation numbers implied by Eyes' Dynamo 'pos' (cubic Hermite) and TrailComponent (3 deg angle threshold).
Run: venv/Scripts/python.exe notes/T3_6_eyes_numbers3.py
"""
import math, numpy as np
AU=149_597_870.7; MU_SUN=1.32712440018e11; MU_E=398600.4418; DAY=86400.0; YEAR=365.25*DAY
print("=== A. Cubic Hermite (pos+vel samples, Eyes PosPoint.calculate) error bound on a circular orbit ===")
print("  f(t)=r cos(nt): |err| <= h^4/384 * max|f''''| = r (n h)^4 / 384   (classic cubic-Hermite bound)")
def h_for(r,n,tol): return (384*tol/r)**0.25/n
cases=[("Earth about Sun",AU,2*math.pi/YEAR),("Mars about Sun",1.524*AU,math.sqrt(MU_SUN/(1.524*AU)**3)),
       ("Moon about Earth",384400,2*math.pi/(27.32*DAY)),("ISS about Earth",6778,math.sqrt(MU_E/6778**3)),("GEO",42164,math.sqrt(MU_E/42164**3))]
for name,r,n in cases:
    print(f"  {name:16s} r={r:.4g} km  P={2*math.pi/n/DAY:8.3f} d : step for 1 km error = {h_for(r,n,1.0)/DAY*24:9.2f} h ; for 0.1 km = {h_for(r,n,0.1)/DAY*24:8.2f} h ; samples/rev @1km = {2*math.pi/n/h_for(r,n,1.0):6.1f}")
# numeric check for Earth with the derived step
r,n=AU,2*math.pi/YEAR; h=h_for(r,n,1.0)
t=np.linspace(0,h,201); 
p0,p1=np.array([r,0]),np.array([r*math.cos(n*h),r*math.sin(n*h)]); v0,v1=np.array([0,r*n]),np.array([-r*n*math.sin(n*h),r*n*math.cos(n*h)])
u=t/h; H=[(1+2*u)*(1-u)**2,u*(1-u)**2,u*u*(3-2*u),-u*u*(1-u)]  # exact basis used in Eyes' PosPoint.calculate
interp=np.outer(H[0],p0)+np.outer(H[1],v0)*h+np.outer(H[2],p1)+np.outer(H[3],v1)*h
true=np.stack([r*np.cos(n*t),r*np.sin(n*t)],1)
print(f"  numeric check Earth, h={h/DAY:.2f} d: max Hermite error = {np.max(np.linalg.norm(interp-true,axis=1)):.3f} km (bound 1 km)")
print("  -> 'sample, then interpolate' (Cesium SampledPositionProperty w/ HermitePolynomialApproximation, Eyes Dynamo pos) is exact enough at hourly LEO / multi-day planetary steps; the file size is what drives step choice.")
print("  Eyes lazily streams chunks (PointSet per interval) and unloads chunks idle >15 s -> a 100-year, 200-object catalog never sits in RAM at once.")

print("\n=== B. TrailComponent adaptive sampling: angle threshold 0.05235987755 rad ===")
th=0.05235987755; print(f"  threshold = {math.degrees(th):.2f} deg -> circular orbit needs {round(2*math.pi/th)} points per revolution; bisection up to 20 iters; 4 points added per frame (amortized), width in px (widthMin..widthMax), alphaFade, dash, glow uniforms")
for e in [0,0.2,0.6,0.9]:
    # velocity direction change rate = curvature*speed ; sample count ~ integral of |dtheta_v| over orbit = 2pi for any closed orbit -> same 120 points, but denser near periapsis
    print(f"  e={e}: total turning of velocity vector over one rev is still 2*pi -> ~120 points, but spacing in *time* near periapsis shrinks by ~((1+e)/(1-e))^2 = {((1+e)/(1-e))**2:.1f}x vs apoapsis")

print("\n=== C. Kepler solver in Pioneer (getEccentricAnomalyFromMeanAnomaly) ===")
print("  Newton on g(E)=E-e sinE-M, start E0=M (E0=+-pi if e>=0.8), max 20 iters, stop when |dE|<0.00174532925 rad (=0.1 deg). Hyperbolic branch uses sinh/cosh with start ln(2|M|/e+1.8).")
print("  0.1 deg tolerance at 1 AU is a position error of up to", f"{AU*math.radians(0.1):,.0f} km", "-> fine for pixels (1 px ~ 4.6e5 km at Mars-orbit zoom), NOT fine for mission design. Our optimize/ layer must use 1e-10-ish tolerances.")
