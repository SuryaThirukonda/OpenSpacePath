import numpy as np

pts = {"A(1,4)": (1,4), "B(2,3.5)": (2,3.5), "C(4,1)": (4,1)}

print("Pareto check (no point dominates another):")
names = list(pts.keys())
for i in range(len(names)):
    for j in range(len(names)):
        if i==j: continue
        p, q = pts[names[i]], pts[names[j]]
        dominates = p[0] <= q[0] and p[1] <= q[1] and p != q
        if dominates:
            print(f"  {names[i]} dominates {names[j]}  <-- should not happen")
print("  (no output above means all 3 are mutually non-dominated: valid Pareto set)")

print("\nWeighted-sum sweep w in [0,1], cost = w*x + (1-w)*y:")
best_ever_wins_B = False
for w in np.linspace(0,1,101):
    costs = {name: w*p[0] + (1-w)*p[1] for name,p in pts.items()}
    winner = min(costs, key=costs.get)
    if winner == "B(2,3.5)":
        best_ever_wins_B = True

print("Does B ever win a weighted-sum sweep across w in [0,1]?", best_ever_wins_B)

# print costs at a few w values
for w in [0.0, 0.25, 0.5, 0.75, 1.0]:
    costs = {name: round(w*p[0] + (1-w)*p[1],3) for name,p in pts.items()}
    print(f"  w={w:.2f}: {costs}")
