#!/bin/bash
set -e
taliesin build site

# Taliesin has no site-wide script injection point (its raw-injection config
# keys were retired), so the reading ask goes into the built artifact here,
# after the build and before the push. Local previews stay clean. The script
# verifies its own work and exits non-zero on a partial injection, which
# `set -e` turns into a stopped publish.
#
# The ask on post pages: one line whose button loads the reading script (r.js)
# for that page view, so r.js never runs unless a reader presses it. r.js posts
# to the collector's /r.
./_beacon/inject-beacon.sh site/_site \
  --site andreasbogossian.com \
  --endpoint https://t.andreasbogossian.com/r \
  --ask _beacon/a.js \
  --reader _beacon/r.js

# Pages advanced mode: _worker.js counts each page request at the edge, and
# _routes.json keeps static files away from it.
cp _edge/_worker.js _edge/_routes.json site/_site/

cd site/_site
# Deploy internals (publish.sh, requirements.txt, _infra/) live above site/, so
# taliesin build cannot see them: the layout is the guarantee, not this list.
# Kept as belt-and-suspenders in case a stray copy ever lands inside site/.
rm -rf infra _infra _beacon _edge publish.sh requirements.txt .venv

# Taliesin names every file in _assets/ after a hash of its content, so a changed file is
# a new URL and a cached copy can never go stale. Without this, Cloudflare Pages caches
# them for 4 hours and then makes a returning reader revalidate each one.
printf '/_assets/*\n  Cache-Control: public, max-age=31536000, immutable\n' > _headers

# Addresses Google still had indexed from the Quarto site (Search Console, May to
# September 2026) and that now 404. Taliesin skips files whose names start with an
# underscore, so the redirect list is written here like _headers.
printf '%s\n' \
  '/posts/2026-03-KL-divergence/ /posts/KL-divergence/ 301' \
  '/posts/2026-03-KL-divergence /posts/KL-divergence/ 301' \
  '/cv / 301' \
  '/cv.html / 301' \
  '/cv.pdf / 301' > _redirects

git init
git remote add origin $(git -C ../.. remote get-url origin)
git checkout -b cf-pages
git add -A
git commit -m "deploy $(date)"
git push -f origin cf-pages
cd ../..
rm -rf site/_site/.git
