import numpy as np

def Rz(t):
    c,s = np.cos(t), np.sin(t)
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])

def Rx(t):
    c,s = np.cos(t), np.sin(t)
    return np.array([[1,0,0],[0,c,-s],[0,s,c]])

Om,i,w = np.radians(40.0), np.radians(30.0), np.radians(60.0)
Q_claim = Rz(Om) @ Rx(i) @ Rz(w)
Q_masterdoc_line239 = Rz(-Om) @ Rx(-i) @ Rz(-w)
print("Q_claim (Rz(Om)Rx(i)Rz(w), the claim under test):")
print(np.round(Q_claim,4))
print("\nQ from master doc line 239 (Rz(-Om)Rx(-i)Rz(-w)):")
print(np.round(Q_masterdoc_line239,4))
print("\nAre they equal?", np.allclose(Q_claim, Q_masterdoc_line239))
print("Is line-239 formula actually Q_claim^T (i.e. the ECI->perifocal / inverse transform)?",
      np.allclose(Q_masterdoc_line239, Q_claim.T))

r_pqw = np.array([7000.0, 0.0, 0.0])
r_eci_claim = Q_claim @ r_pqw
r_eci_line239 = Q_masterdoc_line239 @ r_pqw
print("\nApplying to r_perifocal = [7000,0,0] km:")
print("  r_ECI using claim formula        :", np.round(r_eci_claim,2))
print("  r_ECI using master-doc line-239   :", np.round(r_eci_line239,2))
print("  difference:", np.round(r_eci_claim - r_eci_line239, 2))
