"""Fetch metadata for a fixed list of repos via the GitHub *search* API using batched
`repo:` qualifiers (search has its own 10/min budget, independent of the 60/hr core budget).
Output: notes/t3_9_repo_meta.json + printed table."""
import sys, json, time, os, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
REPOS = """Flowm/satvis thkruz/keeptrack.space typpo/spacekit jeyoder/StuffInSpace ajmas/StuffInSpace csete/gpredict kd2bd/predict
shashwatak/satellite-js brandon-rhodes/python-sgp4 thkruz/ootk neuromorphicsystems/sgp4 gunvirranu/perturb aholinch/sgp4 dnwrnr/sgp4
skyfielders/python-skyfield astropy/astropy poliastro/poliastro pleiszenburg/hapsira duncaneddy/brahe ssmichael1/satkit nyx-space/nyx nyx-space/anise
CS-SI/Orekit tudat-team/tudat tudat-team/tudatpy AVSLab/basilisk open-space-collective/open-space-toolkit JuliaSpace/SatelliteToolbox.jl
esa/pykep esa/pagmo2 nasa/EMTG ChristopherRabotin/GMAT ravidavi/OpenFrames toxygen/STA orbitersim/orbiter jorgepiloto/lamberthub
CelestiaProject/Celestia OpenSpace/OpenSpace Stellarium/stellarium chipi/orrery abc000cool/porkchop-mission-planner TheHappyKoala/Harmony-of-the-Spheres
bilawalsidhu/gods-eye-view sgoudelis/ground-station BigBodyCobain/Shadowbroker aweeri/TLEscope rt-bishop/Look4Sat dsuarezv/satellite-tracker
juliensimon/starlink-viz Boex9/SatDeck satvisorcom/satvisor pvolpe0/orbica vasturiano/globe.gl CesiumGS/cesium mrdoob/three.js
satellogic/orbit-predictor galactics/beyond AndrewAnnex/SpiceyPy hannorein/rebound LunCoSim/lunco jeremyengels/interplanetary-porkchop
mosspheree/porkchop-plotter ptgrogan/spacenet Lunar-Lynx? sgp4? """.split()
REPOS = [r for r in REPOS if "?" not in r]
HDR = {"Accept": "application/vnd.github+json", "User-Agent": "t3-9-meta"}
def gh(url):
    req = urllib.request.Request(url, headers=HDR)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                reset = e.headers.get("X-RateLimit-Reset")
                wait = max(5, int(reset) - int(time.time()) + 2) if reset else 65
                print(f"  rate limited; sleeping {min(wait,120)}s", file=sys.stderr); time.sleep(min(wait, 120))
            else:
                print("  HTTP", e.code, url, file=sys.stderr); return None
    return None
# batch by query length (<250 chars)
batches, cur = [], []
for r in REPOS:
    if len(" ".join(cur + [f"repo:{r}"])) > 240:
        batches.append(cur); cur = []
    cur.append(f"repo:{r}")
if cur: batches.append(cur)
found = {}
for b in batches:
    q = " ".join(b) + " fork:true"
    url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode({"q": q, "per_page": 50})
    d = gh(url)
    if not d: continue
    for it in d.get("items", []):
        found[it["full_name"]] = {
            "html_url": it["html_url"], "description": (it.get("description") or "")[:200],
            "stars": it["stargazers_count"], "forks": it["forks_count"], "language": it.get("language"),
            "license": (it.get("license") or {}).get("spdx_id"), "pushed_at": it["pushed_at"],
            "created_at": it["created_at"], "archived": it.get("archived"), "topics": it.get("topics", []),
            "homepage": it.get("homepage"), "open_issues": it.get("open_issues_count"),
        }
    print(f"batch of {len(b)} -> {len(d.get('items', []))} items", file=sys.stderr)
    time.sleep(7)
missing = [r for r in REPOS if r not in found and r.lower() not in {k.lower() for k in found}]
print("MISSING (renamed/moved/not found):", missing)
json.dump({"fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "repos": found},
          open(os.path.join(HERE, "t3_9_repo_meta.json"), "w", encoding="utf-8"), indent=1)
print(f'{"repo":48s} {"stars":>6s} {"pushed":10s} {"license":12s} {"lang":11s} archived  description')
for name, r in sorted(found.items(), key=lambda kv: -kv[1]["stars"]):
    print(f'{name:48s} {r["stars"]:6d} {r["pushed_at"][:10]} {str(r["license"]):12s} {str(r["language"]):11s} {str(r["archived"]):8s} {r["description"][:90]}')
