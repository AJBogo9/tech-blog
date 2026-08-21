#!/bin/bash
set -e
taliesin build site
cd site/_site
# Deploy internals (publish.sh, requirements.txt, _infra/) live above site/, so
# taliesin build cannot see them: the layout is the guarantee, not this list.
# Kept as belt-and-suspenders in case a stray copy ever lands inside site/.
rm -rf infra _infra publish.sh requirements.txt .venv
git init
git remote add origin $(git -C ../.. remote get-url origin)
git checkout -b cf-pages
git add -A
git commit -m "deploy $(date)"
git push -f origin cf-pages
cd ../..
rm -rf site/_site/.git
