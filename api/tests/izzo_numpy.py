"""Independent Izzo (2015) Lambert solver in plain numpy, copied from research/scripts/T7_design_math_check.py.
Used only to cross-check lamberthub; not part of the service."""
import math
import numpy as np
norm = np.linalg.norm

def hyp2f1b(z, tol=1e-11):
    Sj, Cj, j = 1.0, 1.0, 0
    while True:
        Cj1 = Cj*(3+j)*(1+j)/(2.5+j)*z/(j+1); Sj += Cj1; Cj = Cj1; j += 1
        if abs(Cj1) < tol: return Sj

def lambert_izzo(r1v, r2v, tof, mu, lagrange_branch=True):
    r1, r2 = norm(r1v), norm(r2v); c = norm(r2v-r1v); s = (r1+r2+c)/2
    ir1, ir2 = r1v/r1, r2v/r2
    ih = np.cross(ir1, ir2); ih /= norm(ih)
    lam2 = 1 - c/s; lam = math.sqrt(lam2)
    if ih[2] < 0:
        lam = -lam; it1 = np.cross(ir1, ih); it2 = np.cross(ir2, ih)
    else:
        it1 = np.cross(ih, ir1); it2 = np.cross(ih, ir2)
    lam3 = lam*lam2
    T = math.sqrt(2*mu/s**3)*tof
    def x2tof(x):
        dist = abs(x-1)
        if lagrange_branch and 0.01 < dist < 0.2:
            a = 1/(1-x*x)
            if a > 0:
                alfa = 2*math.acos(x); beta = 2*math.asin(math.sqrt(lam2/a))
                if lam < 0: beta = -beta
                return a*math.sqrt(a)*((alfa-math.sin(alfa)) - (beta-math.sin(beta)))/2
            alfa = 2*math.acosh(x); beta = 2*math.asinh(math.sqrt(-lam2/a))
            if lam < 0: beta = -beta
            return -a*math.sqrt(-a)*((beta-math.sinh(beta)) - (alfa-math.sinh(alfa)))/2
        E = x*x - 1; rho = abs(E); z = math.sqrt(1 + lam2*E)
        if dist < 0.01:
            eta = z - lam*x; S1 = 0.5*(1 - lam - x*eta)
            return (eta**3*(4/3)*hyp2f1b(S1) + 4*lam*eta)/2
        yv = math.sqrt(rho); g = x*z - lam*E
        dd = math.acos(g) if E < 0 else math.log(yv*(z-lam*x) + g)
        return (x - lam*z - dd/yv)/E
    T00 = math.acos(lam) + lam*math.sqrt(1-lam2); T1 = 2/3*(1-lam3)
    if T >= T00: x = -(T-T00)/(T-T00+4)
    elif T <= T1: x = 5/2*T1*(T1-T)/((1-lam2*lam3)*T) + 1
    else: x = (T/T00)**(math.log(2)/math.log(T1/T00)) - 1
    it = 0
    for it in range(1, 16):
        tx = x2tof(x); umx2 = 1 - x*x; yy = math.sqrt(1 - lam2*umx2)
        d1 = (3*tx*x - 2 + 2*lam3*x/yy)/umx2
        d2 = (3*tx + 5*x*d1 + 2*(1-lam2)*lam3/yy**3)/umx2
        d3 = (7*x*d2 + 8*d1 - 6*(1-lam2)*lam2*lam3*x/yy**5)/umx2
        delta = tx - T
        xn = x - delta*(d1*d1 - delta*d2/2)/(d1*(d1*d1 - delta*d2) + d3*delta*delta/6)
        if abs(xn - x) < 1e-13: x = xn; break
        x = xn
    gamma = math.sqrt(mu*s/2); rho = (r1-r2)/c; sigma = math.sqrt(1-rho*rho)
    y = math.sqrt(1 - lam2 + lam2*x*x)
    vr1 = gamma*((lam*y - x) - rho*(lam*y + x))/r1
    vr2 = -gamma*((lam*y - x) + rho*(lam*y + x))/r2
    vt = gamma*sigma*(y + lam*x)
    return vr1*ir1 + vt/r1*it1, vr2*ir2 + vt/r2*it2, it, x

