# The three-burn rendezvous in Orbit Lab

Date: 2026-10-08, audited equation by equation 2026-10-11 (section 8). Status: implemented as the app's default transfer (`api/threeburn.py`), with the two-burn Lambert rendezvous as the toggle. This note records how the derivation sheet "A Three-Burn Impulsive Rendezvous Strategy Combining In-Plane Shaping, Plane Change, and Velocity Matching: Derivations and Notes" (13 pages, received 2026-10-08) was turned into code, where the code follows it exactly, and where it had to differ.

## 1. What the sheet describes

Three impulses take a chaser from its orbit to a moving target (sheet section 2.3):

- **Burn 1**, in the plane of the departure orbit, shapes the approach. The sheet's two cases are the path-tangential impulse, which scales the velocity vector by a factor η₁ (sections 3.4, 5.2), and the radial impulse, which changes only the radial speed (sections 3.3, 5.1); both are special cases of the generic polar-frame impulse of section 4, equations (16) to (19).
- **Burn 2**, at the node line θ₂, scales both polar velocity components by η₂ (section 8, the single-parameter case) and rotates the velocity by φ about the radial axis (section 6), as one impulse. The rotation axis is the node line, so φ is the new plane's inclination to the departure plane and θ₂ its RAAN (equations 28 to 30).
- **Burn 3** matches the chaser's velocity to the target's at the destination.

Position matching gives η₂ in closed form (equation 39); the coast times come from Kepler's equation (section 9); the rendezvous condition is a root in θ₂ of travel time minus the target's time at the destination (section 10.2); an outer sweep over (θ₁, ΔV₁, φ), comparing tangential and radial burn 1, picks the cheapest feasible strategy (section 10.4).

## 2. What the app needs from it

In the app a transfer always has a known destination time: in the Routing tab the arrival day of each leg is either written by the user (the Path section) or fixed by the papers' inner optimizer; in the Mission tab the planner scans arrival times itself. So the solver is written for a destination fixed in position and time: leave the state (r_s, v_s) at t_d, be at r_P at t_a with velocity v_P.

That changes one thing in the sheet's structure. The sheet finds where the target crosses the new plane and when (section 7). Here the destination point is known, so the new plane is the one through the focus, the burn-2 point and r_P, which fixes φ for every θ₂; the angle from the node to the destination (ψ, equation 36) follows; and the rendezvous condition becomes "the three coasts add up to t_a − t_d". The root-finding in θ₂, the closed-form η₂, the costs and the outer sweep are the sheet's. Both directions of travel from the node are tried, which is the sheet's pair of antipodal branches (section 7.2) in this setting.

## 3. Mapping to the code

| Sheet | Code (`api/threeburn.py`) |
|---|---|
| Frame: Z along the departure plane's normal, angles from a fixed direction (2.1) | `_Setup`: X along the departure orbit's periapsis (or the departure position when circular), Y = Z × X |
| Burn 1 tangential (3.4, 5.2) and radial (3.3, 5.1) | `_Setup.orbit1(family, ratio)`: the burn-1 size as a fraction of the local speed; the tangential case is η₁ − 1, the radial case Δv_r / V₁ |
| Orbit after a generic impulse, equations (17) to (19) | `orbit1` for burn 1; the same formulas at the node for orbit 2 inside `sweep` |
| Node geometry, φ and ψ (6.2, 6.3, 7.4) | `sweep`: φ from the components of r_P across the node line, ψ = atan2 of the same |
| η₂ from position matching, equation (39) | `sweep`, `eta2` |
| Cost of burn 2, equation (40) | `sweep`, `dv2`, but as the vector change (see section 4 below) |
| Time of flight, equations (41) to (45) | `_tof`, vectorised, elliptic and hyperbolic |
| Inner loop over θ₂ and roots of f(θ₂) (10.1, 10.2) | `_Search.grid`: a sweep of θ₂ over up to six revolutions (timing residual only), each sign change closed by the Illinois method (`_roots`, a bracketing regula falsi), the burns evaluated at the roots |
| Selection within ΔV_max (10.3) | `grid`: the cheapest feasible root; `dv_max` is the optional cap |
| Outer loop over (θ₁, ΔV₁), tangential versus radial (10.4) | `solve`: a grid over the burn-1 time fraction s and size for each family, the three best cells refined three times on finer grids |

Burn 1 is placed by the fraction s of the transfer time spent coasting on the departure orbit before it, from 0 to 0.9, with the grid dense near 0 where most solutions lie. Its size spans η₁ − 1 from −0.95 to 2 and Δv_r / V₁ from −2 to 2; fast transfers between distant orbits need first burns larger than the orbital speed, so the range is wide on purpose.

The sheet's degenerate case "ΔV₁ = 0 collapses to a two-impulse rendezvous" is in the grid (ΔV₁ = 0 is a grid point). The other degenerate case, burn 2 not needed because burn 1 alone puts the chaser on an orbit through the destination on time, cannot be found by the θ₂ root search: for it the rendezvous condition holds for every θ₂ rather than at a root. When the destination lies in the departure plane the solver looks for it directly (`_direct`): for each s a Lambert arc from the burn-1 point to the destination, and a root in s where that arc's departure burn is exactly tangential or exactly radial. A Hohmann transfer is this member, and the tests recover it to 1e-4.

## 4. Where the code departs from the sheet

Each is deliberate and small; they are listed so they can be checked or reversed.

1. **Cost of burn 2.** Equation (40) gives |η₂ − 1| |v₂⁻|, the scaling part alone. Section 6.1 says burn 2 is one impulse combining shaping and rotation, so the code charges the magnitude of the actual velocity change, |v₂⁺ − v₂⁻| = √((η₂ − 1)² v_r² + v_θ² (η₂² − 2 η₂ cos φ + 1)), which includes the rotation and reduces to (40) at φ = 0.
2. **Hyperbolic coasts.** Section 9 writes Kepler's equation for ellipses. Fast transfers put the chaser on hyperbolic arcs after burn 1 or 2, so `_tof` uses the hyperbolic form (H = 2 atanh(√((e−1)/(e+1)) tan(ν/2)), M = e sinh H − H) when e > 1 and rejects arcs that would cross the asymptote.
3. **Selection by the total.** Section 10.3 selects by ΔV₁ + ΔV₂, with ΔV₂ from equation (40). The code selects by ΔV₁ + ΔV₂ + ΔV₃ with the combined burn 2, since burn 3 and the rotation are real costs that differ between candidates. The sheet's own criterion is kept as an option: `threeburn.SELECTION = "sheet"` judges candidates by burn 1 plus equation (40) exactly, and the reported burns stay the actual impulses either way (`test_threeburn_sheet.py` exercises both).
4. **Fixed destination time** instead of the target-crossing search, as explained in section 2.

## 5. Where it is used

- **Routing tab, Path section.** Each entry of a path is an asteroid with all of its elements, an arrival day and a stay. Departure of leg k + 1 is arrival k + stay k, so every transfer's times are known and the solver is called once per leg (`POST /api/arp/path`).
- **Routing tab, algorithms.** The papers' black box B(a, a′, η) still chooses the wait and the flight time with SLSQP on the two-burn cost, so a route keeps one deterministic cost and an evaluation stays affordable; in three-burn mode those times are then flown with three burns and the three-burn delta-v is charged. The two-burn cost at the same times is reported beside it. If no three-burn transfer exists at those times the leg falls back to two burns and says so.
- **Mission tab.** With a free arrival time the planner scans 24 times of flight with a quick search, refines the best bracket by golden section and solves the final time fully (`legs.plan_three_burn`). The earlier phasing, bi-elliptic and four-burn waypoint strategies were removed; the two transfers in the app are the Lambert rendezvous and this one.

The toggle (Transfer section of the Mission and Routing tabs) is stored with the scene and in links; three burns is the default.

## 6. What to expect of the numbers

The three-burn family is a restriction: burn 1 lies in the departure plane and is purely tangential or purely radial, and burn 2 keeps the flight-path angle. A Lambert arc is unrestricted. So at a fixed pair of times the three-burn transfer can cost more than the two-burn one, and often does between near-coplanar asteroid orbits (on the synthetic 8_42 instance the greedy route costs 206 km/s with two burns and about 280 with three at the same times). Where a plane change is needed, or when the arrival time is free, it wins clearly: LEO at 28.5° to equatorial GEO in 1.3 Hohmann times costs 4.7 km/s with three burns against 15.0 for the single Lambert arc to the same point and time; the Mission tab's GEO-then-polar tour costs 15.0 km/s against 19.9.

The search is a grid with refinement, not an exact method. On eleven transfers of the 8_42 instance it matched a brute-force search with 20 times the points in nine cases and was within 15% in the other two. A full solve takes about 0.5 s on this laptop (3 s on the deployed function); the Mission tab's time-of-flight scan takes about 4 s per leg here.

## 7. Tests

`api/tests/test_threeburn.py`: Hohmann recovered as the direct member of the tangential family (1e-4); a 28.5° plane change uses all three burns and costs under half the forced Lambert arc; six random heliocentric transfers, each checked by propagating every coast to the next burn (5 m) and the last to the destination with the matched velocity (1 mm/s); the delta-v cap and impossible times give no answer; the vectorised times of flight agree with the universal-variable propagator on forty random ellipses and hyperbolas. `test_mission.py` flies a three-burn tour and checks the chain of coasts; `test_arp.py` checks that three-burn mode keeps the papers' times, reports the two-burn cost beside it, flies explicit times exactly, and that a written path is turned into legs and refused when its times do not follow.

## 8. Audit against the sheet (2026-10-11)

The derivation sheet was re-read and the implementation checked equation by equation. `api/tests/test_threeburn_sheet.py` recomputes every quantity below from the sheet's formula using only the solution's state vectors (independently of the solver's internals) on six solved transfers, three Earth plane changes and three heliocentric legs, and compares with what the solver reports and with the orbit elements read numerically from those states.

| Sheet | Checked | Result |
|---|---|---|
| (15) ΔV₁ = \|η₁ − 1\| V₁; (21) both polar components scaled | burn 1 of the tangential family is parallel to v₁⁻ and \|v₁⁺\|/\|v₁⁻\| = η₁ | holds to 1e-9 |
| §3.3, §5.1 radial impulse leaves v_θ unchanged | the transverse component of burn 1 in the radial family is zero | holds |
| (17), (19) h₁, p₁, e₁, ω₁ from the post-burn state | against p, e and the periapsis direction read numerically from (r₁, v₁⁺) | holds to 1e-9 (p), 1e-7 (e) |
| (28), (29) ŵ′ = cos φ ŵ + sin φ Ẑ, n̂_new = û × ŵ′ | against the angular-momentum direction of (r₂, v₂⁺) | holds to 1e-9 |
| (30) i_new = φ, Ω_new = θ₂ | the angle between Ẑ and n̂_new; the node line is r₂, which lies in plane 1 | holds to 1e-9 |
| (36) ψ_dest = atan2(d̂·ŵ′, d̂·û) with d̂ = r̂_P | against the solver's ψ | holds to 1e-9 |
| (37) v₂⁺ = η₂ (v_r2⁻ û + v_θ2⁻ ŵ′) | \|v₂⁺\|/\|v₂⁻\| = η₂ and the vector itself | holds to 1e-9 |
| (38), (39) η₂² in closed form; the post-burn-2 orbit passes r_dest at ν_node + ψ | η₂² from (39) with the pre-burn-2 state; p₂/(1 + e₂ cos(ν_node + ψ)) = r_dest | holds to 1e-9 |
| (40) ΔV₂ = \|η₂ − 1\| \|v₂⁻\| | equals the applied impulse when φ = 0; with φ ≠ 0 the applied impulse is the combined one of §6.1 (section 4, item 1) | holds |
| (41)–(45) times of flight by Kepler's equation | the solver's vectorised times for the burn 1 → burn 2 and burn 2 → destination coasts against the universal-variable propagator, and the three coasts summing to t_a − t_d | holds to 1e-9 |
| burn 3 velocity match | v_end + ΔV₃ = v_P after propagating the last coast | holds to 1e-6 km/s |

Nothing in the code had to change for the equations; the audit added the option to judge candidates by the sheet's own criterion (section 4, item 3).
