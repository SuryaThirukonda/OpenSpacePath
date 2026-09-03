#!/bin/sh
# Probe whether stuffin.space still serves the app (run 2026-09-01)
for u in http://stuffin.space/ https://stuffin.space/ https://www.stuffin.space/ https://stuffin.space/TLE.json https://stuffin.space/scripts/main.js https://ajmas.github.io/StuffInSpace/ https://ajmas.github.io/StuffInSpace/data/TLE.json; do
  curl -sS -o /dev/null -A "Mozilla/5.0" -w "$u -> code=%{http_code} redirect='%{redirect_url}' bytes=%{size_download}\n" --max-time 20 "$u"
done
