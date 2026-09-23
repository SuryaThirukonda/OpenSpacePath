"""Spaceship arithmetic: rocket equation, burn durations and propellant accounting.

Burns are impulsive in the trajectory; the duration is what the ship model says the burn would
take at full thrust, used for display and for the "impulsive assumption strained" warning.
Units km/s for delta-v, kg, N, s.
"""
from __future__ import annotations

import math

G0_KM = 9.80665e-3  # km/s^2


def exhaust_velocity(isp: float) -> float:
    """km/s"""
    return G0_KM * isp


def burn(m0: float, dv: float, isp: float, thrust: float):
    """Mass after the burn, propellant used (kg) and burn duration (s) at full thrust."""
    ve = exhaust_velocity(isp)
    m1 = m0 * math.exp(-dv / ve)
    propellant = m0 - m1
    duration = propellant * (ve * 1000.0) / thrust if thrust > 0 else math.inf
    return m1, propellant, duration


def capacity(dry_mass: float, propellant: float, isp: float) -> float:
    """Total delta-v still available, km/s."""
    if propellant <= 0:
        return 0.0
    return exhaust_velocity(isp) * math.log((dry_mass + propellant) / dry_mass)
