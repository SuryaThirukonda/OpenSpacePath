"""T3.7 worked numbers from GMAT tutorial scripts (values copied from application/samples/*.script, nasa/GMAT mirror).
Run: venv/Scripts/python.exe notes/T3_7_numbers.py"""
import math
MU_E=398600.4418; MU_M=42828.375214; R_E=6378.1363; R_M=3396.19; G0=9.81
print("== 1. MAVEN-like departure hyperbola (Tut_Mars_B_Plane_Targeting.script: SMA=-32593.216 km, ECC=1.2028725)")
a=-32593.21599272777; e=1.202872548116186
vinf=math.sqrt(MU_E/abs(a)); C3=vinf**2; rp=a*(1-e)
print(f"  v_inf = sqrt(mu/|a|) = {vinf:.4f} km/s ; C3 = v_inf^2 = {C3:.3f} km^2/s^2 ; r_p = a(1-e) = {rp:.1f} km -> perigee alt = {rp-R_E:.1f} km")
print(f"  hyperbolic excess check: v_p = sqrt(v_inf^2 + 2mu/r_p) = {math.sqrt(vinf**2+2*MU_E/rp):.4f} km/s")
print("== 2. B-plane geometry at Mars (target BdotT=0, BdotR=-7000 km in tutorial; BdotT=2700, BdotR=-7000 in API example)")
def rp_from_B(B,vinf,mu):  # hyperbola: b = a_h*sqrt(e^2-1), a_h = mu/vinf^2, rp = a_h(e-1)  => rp = sqrt(B^2 + a_h^2) - a_h
    ah=mu/vinf**2; return math.sqrt(B*B+ah*ah)-ah
for BT,BR in [(0,-7000),(2700,-7000)]:
    B=math.hypot(BT,BR); ang=math.degrees(math.atan2(BR,BT))
    print(f"  |B| = {B:.1f} km, B-vector angle atan2(BdotR,BdotT) = {ang:.1f} deg")
    for v in (2.5,3.0,3.5):
        rp=rp_from_B(B,v,MU_M); print(f"    if v_inf(Mars) = {v} km/s: r_p = sqrt(B^2+(mu/v^2)^2) - mu/v^2 = {rp:.0f} km (alt {rp-R_M:.0f} km)")
print("  MOI to 12000-km apoapsis (tutorial goal RMAG=12000 at apoapsis), assuming v_inf=3.0 km/s and |B|=7000 km:")
v=3.0; B=7000; rp=rp_from_B(B,v,MU_M); vp_h=math.sqrt(v*v+2*MU_M/rp); a_ell=(rp+12000)/2; vp_e=math.sqrt(MU_M*(2/rp-1/a_ell))
print(f"    r_p={rp:.0f} km, v_p(hyperbola)={vp_h:.3f} km/s, v_p(ellipse rp->12000)={vp_e:.3f} km/s, MOI dv = {vp_e-vp_h:.3f} km/s (tutorial initial guess -1.603, API guess -2.0)")
print("== 3. Finite-burn tutorial (Tut_Target_Finite_Burn_to_Raise_Apogee.script): r=(7100,0,1300) km, v=(0,7.35,1) km/s, F=1000 N, Isp=300 s, dry 850 kg + fuel 756 kg")
r=(7100,0,1300); vv=(0,7.35,1); rm=math.sqrt(sum(x*x for x in r)); vm=math.sqrt(sum(x*x for x in vv))
h=(r[1]*vv[2]-r[2]*vv[1], r[2]*vv[0]-r[0]*vv[2], r[0]*vv[1]-r[1]*vv[0]); hm=math.sqrt(sum(x*x for x in h))
energy=vm*vm/2-MU_E/rm; a0=-MU_E/(2*energy); e0=math.sqrt(1-hm*hm/(MU_E*a0)); rp0=a0*(1-e0); ra0=a0*(1+e0)
print(f"  |r|={rm:.1f} km |v|={vm:.4f} km/s a={a0:.1f} km e={e0:.4f} r_p={rp0:.1f} km (alt {rp0-R_E:.0f}) r_a={ra0:.1f} km, period={2*math.pi*math.sqrt(a0**3/MU_E)/60:.1f} min")
vp0=math.sqrt(MU_E*(2/rp0-1/a0)); a1=(rp0+12000)/2; vp1=math.sqrt(MU_E*(2/rp0-1/a1)); dv=vp1-vp0
m0=850+756; mdot=1000/(300*G0); dm=m0*(1-math.exp(-dv*1000/(300*G0))); t_imp=dm/mdot
print(f"  impulsive dv at perigee to raise apogee to 12000 km = {dv*1000:.1f} m/s ; mdot=F/(Isp g0)={mdot:.4f} kg/s ; fuel = m0(1-exp(-dv/(Isp g0))) = {dm:.1f} kg ; ideal burn time = {t_imp:.1f} s (a real finite burn needs slightly more: gravity/steering loss)")
print("== 4. Hohmann from GMAT DefaultSC perigee to 42165 km (Ex_HohmannTransfer.script targets RMAG=42165 then ECC=0)")
at=(rp0+42165)/2; v1=math.sqrt(MU_E*(2/rp0-1/at))-vp0; v2=math.sqrt(MU_E/42165)-math.sqrt(MU_E*(2/42165-1/at))
print(f"  dv1={v1:.4f} km/s dv2={v2:.4f} km/s total={v1+v2:.4f} km/s (anchor: 300-km circular LEO->GEO Hohmann ~3.9 km/s); transfer time={math.pi*math.sqrt(at**3/MU_E)/3600:.2f} h")
rl=R_E+300; atl=(rl+42165)/2; d1=math.sqrt(MU_E*(2/rl-1/atl))-math.sqrt(MU_E/rl); d2=math.sqrt(MU_E/42165)-math.sqrt(MU_E*(2/42165-1/atl))
print(f"  check 300-km LEO->GEO: dv1={d1:.4f} dv2={d2:.4f} total={d1+d2:.4f} km/s")
print("== 5. Installer / distribution sizes (sourceforge.net/projects/gmat/files/GMAT/GMAT-R2026a/)")
sizes={'gmat-win-R2026a.zip':403.5,'gmat-mac-x64-R2026a-signed.dmg':455.5,'gmat-ubuntu-x64-R2026a.tar.gz':401.7,'gmat-rhel7-x64-R2026a.tar.gz':438.0,'GMAT-src-R2026a.tar.gz':117.7,'GMAT-datafiles-R2026a.tar.gz':200.6}
for k,v in sizes.items(): print(f"  {k:36s} {v:7.1f} MB")
print(f"  data files are {200.6/403.5*100:.0f}% of the Windows bundle size; planetary ephemeris (DE405/421/424 SPK + .405/.421/.424) alone = 157.6 MB in repo tree")
print("== 6. Source-tree metrics (api.github.com nasa/GMAT tree, 15,713 entries)")
print("  src/*.cpp 965 files 25.25 MB; src/*.hpp 920; plugins/*.cpp 275; src/gui 558 files 9.0 MB (wxWidgets); samples 140 .script; help sources 73 Resource_*.xml + 43 Command_*.xml + 24 Tut_*.xml")
