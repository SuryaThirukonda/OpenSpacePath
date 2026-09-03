# Back-of-envelope: time-expanded network size for Earth-Moon-Mars logistics graph
# EMOA* takes a graph: nodes + vector-cost edges (single-commodity Pareto shortest path).
# A time-expanded space-logistics network (Ho/de Weck/Taylor-style) instead has
# node = (location, time-step), and (for MILP multi-commodity flow) a separate flow variable
# per commodity per edge. We estimate both the "node count" EMOA* would see and the
# additional blow-up multi-commodity flow adds on top.

T_days = 2*365          # 2-year horizon
dt = 1                    # daily resolution -> T time steps
T = T_days // dt

locations = [
    "LEO", "EML1/EML2 (or NRHO)", "LLO", "Lunar surface",
    "Earth-Mars transfer injection point", "Mars orbit", "Mars surface"
]
L = len(locations)

nodes = L * T
print(f"Locations L = {L}")
print(f"Time steps T (daily, 2 yr) = {T}")
print(f"Time-expanded nodes = L*T = {nodes:,}")

wait_edges = L * (T - 1)
print(f"Waiting edges = L*(T-1) = {wait_edges:,}")

short_hop_pairs = 6
short_hop_width_days = 4
short_hop_edges = short_hop_pairs * T * short_hop_width_days

long_hop_pairs = 2
long_hop_width_days = 150
long_hop_launch_days = 60
long_hop_edges = long_hop_pairs * long_hop_launch_days * long_hop_width_days

transfer_edges = short_hop_edges + long_hop_edges
total_edges_single_commodity = wait_edges + transfer_edges

print(f"Short-hop transfer edges = {short_hop_edges:,}")
print(f"Long-hop (Earth-Mars) transfer edges = {long_hop_edges:,}")
print(f"Total single-commodity edges (EMOA*-style graph) = {total_edges_single_commodity:,}")

commodities = 5
mcf_vars = total_edges_single_commodity * commodities
print(f"\nMulti-commodity flow decision variables (edges x commodities) = {mcf_vars:,}")

dense_edges = (L*T) * (L*T)
print(f"\nFor comparison, fully dense (loc,t)x(loc,t) edge set = (L*T)^2 = {dense_edges:,.3e}")
