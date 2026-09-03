import json, os, collections
import sys; sys.stdout.reconfigure(encoding="utf-8")
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "t3_9_scan_results.json")
d = json.load(open(p, encoding="utf-8"))
repos = {}
for q, blk in d["results"].items():
    for it in blk["items"]:
        r = repos.setdefault(it["full_name"], dict(it, queries=set()))
        r["queries"].add(q.split(" | ")[0])
print("unique repos:", len(repos))
def row(r):
    return f'{r["stars"]:6d}  {r["pushed_at"][:10]}  {str(r["license"]):12s} {str(r["language"]):12s} {r["full_name"]:45s} {r["description"][:70]}'
print("\n=== TOP 70 BY STARS (all queries) ===")
for r in sorted(repos.values(), key=lambda r: -r["stars"])[:70]:
    print(row(r))
print("\n=== ACTIVE 2025-2026 with >=100 stars ===")
act = [r for r in repos.values() if r["pushed_at"] >= "2025-01-01" and r["stars"] >= 100]
for r in sorted(act, key=lambda r: -r["stars"]):
    print(row(r))
print("\n=== pushed in last 60 days (2026-07-01+), any stars, sorted by stars ===")
rec = [r for r in repos.values() if r["pushed_at"] >= "2026-07-01"]
for r in sorted(rec, key=lambda r: -r["stars"])[:60]:
    print(row(r))
print("\n=== per-query totals ===")
for q, blk in d["results"].items():
    print(f'{blk["total_count"]:6d}  {q}')
# keyword flags for optimization+3D coupling
print("\n=== repos whose description mentions both a viz word and an optimization word ===")
viz = ("3d","visual","cesium","three","webgl","render","viewer","globe","plot")
opt = ("optim","porkchop","lambert","trajectory","transfer","mission design","pareto")
for r in repos.values():
    dsc = (r["description"] + " " + " ".join(r["topics"])).lower()
    if any(v in dsc for v in viz) and any(o in dsc for o in opt):
        print(row(r), "| topics:", ",".join(r["topics"][:8]))
