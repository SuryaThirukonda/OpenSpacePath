"""T3.3: GitHub repo search for minimal satellite viewers (unauthenticated search API, 10 req/min)."""
import json, urllib.request, urllib.parse, time
H={"Accept":"application/vnd.github+json","User-Agent":"Mozilla/5.0 rathinam-t33"}
QS=["satellite tracker three.js","satellite webgl orbit","orbit visualizer three.js","satellite.js three.js globe","tle viewer webgl","space debris visualization webgl"]
for q in QS:
    u="https://api.github.com/search/repositories?"+urllib.parse.urlencode({"q":q,"sort":"stars","order":"desc","per_page":15})
    try:
        d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=30))
    except Exception as e:
        print("Q:",q,"ERROR",e); continue
    print(f"\nQ: {q}  total={d.get('total_count')}")
    for it in d.get("items",[]):
        print(f"  {it['full_name']} | stars={it['stargazers_count']} | pushed={it['pushed_at'][:10]} | lic={(it.get('license') or {}).get('spdx_id')} | lang={it.get('language')} | {(it.get('description') or '')[:110]}")
    time.sleep(7)
