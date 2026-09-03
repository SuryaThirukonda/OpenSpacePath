"""T3.3: GitHub metadata for minimal satellite viewers. Usage: python T3_3_gh_meta.py owner/repo ..."""
import json, sys, urllib.request, time
H={"Accept":"application/vnd.github+json","User-Agent":"Mozilla/5.0 rathinam-t33"}
def get(u):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=30))
    except Exception as e:
        return {"error":str(e)}
for r in sys.argv[1:]:
    d=get(f"https://api.github.com/repos/{r}")
    if "error" in d: print(r,"ERROR",d["error"]); continue
    lic=(d.get("license") or {}).get("spdx_id")
    print(f"{r} | stars={d.get('stargazers_count')} | forks={d.get('forks_count')} | pushed={d.get('pushed_at')} | created={d.get('created_at')} | license={lic} | archived={d.get('archived')} | lang={d.get('language')} | fork={d.get('fork')} parent={(d.get('parent') or {}).get('full_name')} | home={d.get('homepage')} | issues={d.get('open_issues_count')} | desc={d.get('description')}")
    time.sleep(0.3)
