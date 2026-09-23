# Rathinam group project: open-source orbit visualization with trajectory optimization

- `rathinam_project_master.md` is the scope, research plan and implementation guide (source of truth; see `research/01_master_doc_errata.md` for corrections found so far).
- `research/` holds the executed research plan: six track study documents, the gap analysis, the errata, a one-page landscape summary for the professor, and the validation scripts.
- `app/` is Orbit Lab, the visualizer: any central body, satellites from classical elements or a TLE, orbit paths, time scrubbing, free camera, and a mission tab that flies a spaceship between satellites. `cd app && npm install && npm run dev`.
- `api/` is the Python planner behind the mission tab (Lambert rendezvous via lamberthub, multi-burn strategies), deployed as a Vercel function; see `api/README.md`.
