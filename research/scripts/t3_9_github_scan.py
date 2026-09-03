"""T3.9 GitHub topic scan. Unauthenticated GitHub search API (10 req/min).
Writes JSON of results to notes/t3_9_scan_results.json and prints a compact table.
Usage: python t3_9_github_scan.py [--fast]
"""
import json, time, urllib.request, urllib.parse, sys, os, datetime

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "t3_9_scan_results.json")
TOKEN = os.environ.get("GITHUB_TOKEN")
HDR = {"Accept": "application/vnd.github+json", "User-Agent": "t3-9-scan"}
if TOKEN:
    HDR["Authorization"] = f"Bearer {TOKEN}"

QUERIES = [
    ("topic:astrodynamics", "topic:astrodynamics"),
    ("topic:orbital-mechanics", "topic:orbital-mechanics"),
    ("topic:satellite-tracking", "topic:satellite-tracking"),
    ("topic:porkchop", "topic:porkchop"),
    ("topic:cesium satellite", "topic:cesium satellite"),
    ("topic:threejs satellite", "topic:threejs satellite"),
    ("satellite tracker cesium", "satellite tracker cesium"),
    ("satellite tracker threejs", "satellite tracker threejs"),
    ("trajectory optimization spacecraft", "trajectory optimization spacecraft"),
    ("lambert porkchop", "lambert porkchop"),
    ("topic:mission-design", "topic:mission-design"),
    ("topic:sgp4", "topic:sgp4"),
    ("topic:tle", "topic:tle"),
    ("orbit visualization 3d", "orbit visualization 3d"),
]

def gh(url):
    req = urllib.request.Request(url, headers=HDR)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                remaining = r.headers.get("X-RateLimit-Remaining")
                return json.loads(r.read().decode()), remaining
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                reset = e.headers.get("X-RateLimit-Reset")
                wait = 65
                if reset:
                    wait = max(5, int(reset) - int(time.time()) + 2)
                print(f"  rate limited; sleeping {wait}s", file=sys.stderr)
                time.sleep(min(wait, 120))
            else:
                print(f"  HTTP {e.code} for {url}", file=sys.stderr)
                return None, None
    return None, None

results = {}
for label, q in QUERIES:
    for sort in ("stars", "updated"):
        url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode(
            {"q": q, "sort": sort, "order": "desc", "per_page": 30})
        data, rem = gh(url)
        if data is None:
            continue
        items = []
        for it in data.get("items", []):
            items.append({
                "full_name": it["full_name"], "html_url": it["html_url"],
                "description": (it.get("description") or "")[:160],
                "stars": it["stargazers_count"], "language": it.get("language"),
                "license": (it.get("license") or {}).get("spdx_id"),
                "pushed_at": it["pushed_at"], "updated_at": it["updated_at"],
                "archived": it.get("archived"), "topics": it.get("topics", []),
                "forks": it.get("forks_count"),
            })
        results[f"{label} | sort={sort}"] = {"total_count": data.get("total_count"), "items": items}
        print(f"[{label} | sort={sort}] total={data.get('total_count')} got={len(items)} remaining={rem}")
        time.sleep(7 if not TOKEN else 2.5)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"fetched_at": datetime.datetime.utcnow().isoformat() + "Z", "results": results}, f, indent=1)
print("wrote", OUT)
