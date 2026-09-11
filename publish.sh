#!/bin/bash
set -e
taliesin build site

# Taliesin has no site-wide script injection point (its raw-injection config
# keys were retired), so the reading-analytics beacon goes into the built
# artifact here, after the build and before the push. Local previews stay
# clean. The script verifies its own work and exits non-zero on a partial
# injection, which `set -e` turns into a stopped publish.
./_beacon/inject-beacon.sh site/_site \
  --site andreasbogossian.com \
  --endpoint https://t.andreasbogossian.com/e \
  --beacon _beacon/b.js

cd site/_site
# Deploy internals (publish.sh, requirements.txt, _infra/) live above site/, so
# taliesin build cannot see them: the layout is the guarantee, not this list.
# Kept as belt-and-suspenders in case a stray copy ever lands inside site/.
rm -rf infra _infra _beacon publish.sh requirements.txt .venv
git init
git remote add origin $(git -C ../.. remote get-url origin)
git checkout -b cf-pages
git add -A
git commit -m "deploy $(date)"
git push -f origin cf-pages
cd ../..
rm -rf site/_site/.git
