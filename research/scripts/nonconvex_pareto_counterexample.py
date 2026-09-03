import itertools

# Three candidate space-transfer "solutions" with (dv, tof) cost vectors,
# chosen so that B is Pareto-optimal but lies in a NON-CONVEX (concave) region
# of the front -- i.e. B is an "unsupported" point that NO linear weighted sum
# w1*dv + w2*tof (w1,w2 >= 0) can ever select as the minimizer, no matter the weights.
#
# A = (1, 10)   -- low dv, high tof   (e.g. slow ballistic/low-energy transfer)
# B = (5, 5)    -- balanced, "knee" solution
# C = (10, 1)   -- high dv, low tof   (e.g. fast direct burn)
#
# Front is concave (bulges toward the origin) if B lies ABOVE the line AC,
# i.e. worse (higher) total scalarized cost than the AC line at matching x.

A = (1.0, 10.0)
B = (5.0, 7.0)
C = (10.0, 1.0)

def on_segment_value(a, c, x):
    # linear interpolation of the AC segment's second coordinate at first-coord = x
    t = (x - a[0]) / (c[0] - a[0])
    return a[1] + t * (c[1] - a[1])

seg_y_at_B = on_segment_value(A, C, B[0])
print(f"Segment A-C value at x={B[0]}: {seg_y_at_B}")
print(f"B's actual y: {B[1]}  -> B lies {'ABOVE (concave/non-convex, GOOD example)' if B[1] > seg_y_at_B else 'ON/BELOW (convex, bad example)'} the chord")

# Now show NO nonnegative weights (w1, w2), w1+w2=1, make B the weighted-sum minimizer.
print("\nSweep of weights w1 in [0,1], w2 = 1-w1:")
best_counts = {"A": 0, "B": 0, "C": 0}
n = 2001
for i in range(n):
    w1 = i / (n - 1)
    w2 = 1 - w1
    scores = {
        "A": w1 * A[0] + w2 * A[1],
        "B": w1 * B[0] + w2 * B[1],
        "C": w1 * C[0] + w2 * C[1],
    }
    winner = min(scores, key=scores.get)
    best_counts[winner] += 1

print(f"Out of {n} weight settings swept over [0,1]:")
for k, v in best_counts.items():
    print(f"  weighted-sum picks {k}: {v} times ({100*v/n:.1f}%)")

print("\n=> B is NEVER selected by any linear weighted-sum A* for ANY nonnegative weights,")
print("   even though B Pareto-dominates every point on segment AC (it is strictly closer")
print("   to the origin than the chord). B is an 'unsupported' / non-convex Pareto point.")

# Verify B actually dominates the interior of the chord (is Pareto-optimal, not dominated by A or C)
def dominates(p, q):
    return all(pi <= qi for pi, qi in zip(p, q)) and any(pi < qi for pi, qi in zip(p, q))

print(f"\nA dominates B? {dominates(A,B)}   C dominates B? {dominates(C,B)}   B dominates A? {dominates(B,A)}   B dominates C? {dominates(B,C)}")
print("(All False -> A, B, C are mutually non-dominated: all three ARE on the true Pareto front.)")
